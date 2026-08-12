/**
 * SINH KẾ HOẠCH MỘT NGÀY HỌC (specs §7.5, §7.6, §10.2).
 *
 * Hàm thuần & tất định: cùng `req` (kể cả `req.now`) → cùng `DayPlanResult`.
 * Mọi câu được giao đều kèm `reasonCode` + `reasonData` để trả lời "Vì sao hệ
 * thống giao bài này" (specs §7.8).
 */
import type { BlockType } from '@prisma/client';
import {
  BLOCK_LABEL,
  BLOCK_ORDER,
  DIFFICULTY_LABEL,
  DIFFICULTY_ORDER,
  difficultyFromOrder,
} from '@/lib/domain';
import { allocateByWeights, clamp, createRng } from './rng';
import type {
  CandidateItem,
  DayPlanRequest,
  DayPlanResult,
  GapScore,
  MasteryState,
  PlannedItem,
  SkillNode,
} from './types';
import type { RecommendationConfig } from '@/lib/config/defaults';

const MS_PER_DAY = 86_400_000;

/** Thứ tự học trong ngày — cũng là thứ tự `order` của PlannedItem. */
const BLOCK_SEQUENCE: BlockType[] = BLOCK_ORDER;

/**
 * Thứ tự giành suất skill (specs §7.3 — không "đuổi theo điểm yếu" vô hạn).
 * Vòng chia theo lượt: REPAIR lấy skill đầu tiên, nhưng CORE/REVIEW cũng được
 * một suất trước khi REPAIR quay lại lấy skill thứ hai.
 */
const ROSTER_PRIORITY: BlockType[] = ['REPAIR', 'CORE', 'REVIEW', 'WARMUP', 'CHALLENGE'];

/** Cách khớp độ khó của câu với độ khó mong muốn của block. */
type DifficultyMode = 'AT_OR_BELOW' | 'AT_OR_ABOVE' | 'NEAREST';

/** Phạt lớn hơn mốc này = vi phạm ràng buộc độ khó của block. */
const MISMATCH_PENALTY = 10;

interface SkillSource {
  skillId: string;
  reasonCode: string;
  desired: number;
  mode: DifficultyMode;
  /** CHALLENGE bắt buộc đúng ràng buộc, các block khác chấp nhận xấp xỉ. */
  strict: boolean;
  gapPriority: number | null;
  extra: Record<string, unknown>;
}

interface BlockPlan {
  block: BlockType;
  quota: number;
  sources: SkillSource[];
  /** Skill thực sự được cấp suất trong ngày. */
  skills: SkillSource[];
  cursor: number;
}

interface PickedItem {
  item: CandidateItem;
  /** true khi buộc phải lấy câu còn trong thời gian nghỉ. */
  cooldownViolated: boolean;
  /** true khi kho không có câu đúng bậc độ khó cần thiết. */
  difficultyMismatch: boolean;
}

// ---------------------------------------------------------------------------

export function buildDayPlan(req: DayPlanRequest): DayPlanResult {
  const { config } = req;
  const warnings: string[] = [];
  const blockCounts = emptyBlockCounts();

  if (req.candidates.length === 0) {
    warnings.push('Kho câu hỏi khả dụng đang rỗng — không sinh được kế hoạch cho ngày này.');
    return { items: [], estimatedMinutes: 0, blockCounts, warnings };
  }

  const skillById = new Map<string, SkillNode>(req.skills.map((s) => [s.id, s]));
  const masteryBySkill = new Map<string, MasteryState>(req.masteries.map((m) => [m.skillId, m]));
  const gapBySkill = new Map<string, GapScore>(req.gaps.map((g) => [g.skillId, g]));

  // -- Ngân sách -----------------------------------------------------------
  const loadFactor = req.loadFactor && req.loadFactor > 0 ? req.loadFactor : 1;
  const budgetMinutes = clamp(
    req.minutesBudget * loadFactor,
    config.minMinutesPerDay,
    config.maxMinutesPerDay,
  );
  const capSeconds = Math.round(budgetMinutes * 60);
  const hardCapSeconds = Math.round(config.maxMinutesPerDay * 60);

  const avgSeconds = averageEstimatedTime(req.candidates);
  const minItems = Math.max(1, Math.round(config.minItemsPerDay));
  const maxItems = Math.max(minItems, Math.round(config.maxItemsPerDay));
  const targetCount = clamp(Math.round(capSeconds / avgSeconds), minItems, maxItems);

  // -- Tách kho theo luật chống lặp (specs §7.5) ---------------------------
  const cooldownMs = Math.max(0, config.itemCooldownDays) * MS_PER_DAY;
  const nowMs = req.now.getTime();
  const freshBySkill = new Map<string, CandidateItem[]>();
  const cooledBySkill = new Map<string, CandidateItem[]>();
  for (const item of req.candidates) {
    const inCooldown =
      item.lastServedAt !== null && nowMs - item.lastServedAt.getTime() < cooldownMs;
    const bucket = inCooldown ? cooledBySkill : freshBySkill;
    const list = bucket.get(item.skillId);
    if (list) list.push(item);
    else bucket.set(item.skillId, [item]);
  }

  const hasAnyItem = (skillId: string): boolean =>
    (freshBySkill.get(skillId)?.length ?? 0) > 0 || (cooledBySkill.get(skillId)?.length ?? 0) > 0;

  // -- Quota từng block ----------------------------------------------------
  const rawQuota = allocateByWeights(targetCount, config.blockRatio);
  const plans = new Map<BlockType, BlockPlan>();
  for (const block of BLOCK_SEQUENCE) {
    plans.set(block, {
      block,
      quota: Math.max(0, Math.round(rawQuota[block] ?? 0)),
      sources: [],
      skills: [],
      cursor: 0,
    });
  }

  // Hạt giống suy từ dữ liệu đầu vào → "trộn" block ôn tập vẫn tái lập được.
  const rng = createRng(buildSeed(req));

  // -- Nguồn skill từng block ---------------------------------------------
  plans.get('WARMUP')!.sources = buildWarmupSources(req, masteryBySkill, gapBySkill, skillById, hasAnyItem, config);
  plans.get('REPAIR')!.sources = buildRepairSources(req, masteryBySkill, hasAnyItem, config);
  plans.get('CORE')!.sources = buildCoreSources(req, masteryBySkill, gapBySkill, hasAnyItem, config);
  plans.get('CHALLENGE')!.sources = buildChallengeSources(
    req,
    masteryBySkill,
    gapBySkill,
    freshBySkill,
    cooledBySkill,
    config,
  );
  plans.get('REVIEW')!.sources = buildReviewSources(req, gapBySkill, hasAnyItem, rng, config, warnings);

  // CHALLENGE chưa mở → chuyển suất sang REPAIR (specs §7.6).
  const challengePlan = plans.get('CHALLENGE')!;
  if (challengePlan.sources.length === 0 && challengePlan.quota > 0) {
    const moved = challengePlan.quota;
    challengePlan.quota = 0;
    plans.get('REPAIR')!.quota += moved;
    warnings.push(
      `Chưa có kỹ năng nào đạt mastery ${config.challengeUnlockMastery} để mở block ${BLOCK_LABEL.CHALLENGE}; đã chuyển ${moved} câu sang block ${BLOCK_LABEL.REPAIR}.`,
    );
  }

  // -- Cấp suất skill, tôn trọng maxSkillsPerDay ---------------------------
  const roster = new Map<string, BlockType>();
  const skillCap = Math.max(1, Math.round(config.maxSkillsPerDay));
  let progressed = true;
  while (roster.size < skillCap && progressed) {
    progressed = false;
    for (const block of ROSTER_PRIORITY) {
      if (roster.size >= skillCap) break;
      const plan = plans.get(block)!;
      if (plan.quota <= 0 || plan.skills.length >= plan.quota) continue;
      while (plan.cursor < plan.sources.length) {
        const source = plan.sources[plan.cursor++]!;
        if (roster.has(source.skillId)) continue;
        roster.set(source.skillId, block);
        plan.skills.push(source);
        progressed = true;
        break;
      }
    }
  }

  // Skill đã nằm trong roster thì block khác dùng lại được mà không tăng số
  // skill khác nhau trong ngày → giúp CORE/REVIEW không bị đói suất.
  for (const block of BLOCK_SEQUENCE) {
    const plan = plans.get(block)!;
    if (plan.quota <= 0) continue;
    const taken = new Set(plan.skills.map((s) => s.skillId));
    for (const source of plan.sources) {
      if (taken.has(source.skillId)) continue;
      if (!roster.has(source.skillId)) continue;
      plan.skills.push(source);
      taken.add(source.skillId);
    }
  }

  // Block không có skill nào → dồn suất cho block còn nguồn.
  for (const block of BLOCK_SEQUENCE) {
    const plan = plans.get(block)!;
    if (plan.quota <= 0 || plan.skills.length > 0) continue;
    const receiver =
      [plans.get('REPAIR')!, plans.get('CORE')!, ...BLOCK_SEQUENCE.map((b) => plans.get(b)!)].find(
        (p) => p.block !== block && p.skills.length > 0,
      ) ?? null;
    warnings.push(
      `Không tìm được kỹ năng phù hợp cho block ${BLOCK_LABEL[block]} (${plan.quota} câu).` +
        (receiver ? ` Đã chuyển suất sang block ${BLOCK_LABEL[receiver.block]}.` : ''),
    );
    if (receiver) receiver.quota += plan.quota;
    plan.quota = 0;
  }

  // -- Chọn câu ------------------------------------------------------------
  const usedItemIds = new Set<string>();
  const items: PlannedItem[] = [];
  let totalSeconds = 0;
  let cooldownReuseCount = 0;
  const mismatchReported = new Set<string>();

  const canAdd = (item: CandidateItem): boolean => {
    if (items.length >= maxItems) return false;
    const next = totalSeconds + Math.max(0, item.estimatedTime);
    // Dưới sàn số câu tối thiểu thì chỉ chặn bởi trần cứng phút/ngày.
    const limit = items.length < minItems ? Math.max(capSeconds, hardCapSeconds) : capSeconds;
    return next <= limit;
  };

  const takeItem = (source: SkillSource, allowCooldown: boolean): PickedItem | null => {
    const fresh = rankPool(freshBySkill.get(source.skillId) ?? [], source, usedItemIds);
    const best = fresh[0];
    if (best && (!source.strict || penaltyOf(best, source) < MISMATCH_PENALTY)) {
      return {
        item: best,
        cooldownViolated: false,
        difficultyMismatch: penaltyOf(best, source) >= MISMATCH_PENALTY,
      };
    }
    if (!allowCooldown) return null;
    const cooled = rankPool(cooledBySkill.get(source.skillId) ?? [], source, usedItemIds);
    const fallback = cooled[0];
    if (!fallback) return null;
    if (source.strict && penaltyOf(fallback, source) >= MISMATCH_PENALTY) return null;
    return {
      item: fallback,
      cooldownViolated: true,
      difficultyMismatch: penaltyOf(fallback, source) >= MISMATCH_PENALTY,
    };
  };

  const commit = (source: SkillSource, block: BlockType, picked: PickedItem, reasonCode: string): void => {
    const item = picked.item;
    usedItemIds.add(item.id);
    totalSeconds += Math.max(0, item.estimatedTime);
    if (picked.cooldownViolated) cooldownReuseCount += 1;

    const mastery = masteryBySkill.get(source.skillId);
    const gap = gapBySkill.get(source.skillId);
    // Câu tiên quyết mang điểm ưu tiên của lỗ hổng đang bị chặn, không phải của
    // chính skill tiên quyết — nếu không, lý do lưu vào Recommendation sẽ vô nghĩa.
    const effectiveGapPriority = source.gapPriority ?? (gap ? gap.priority : null);
    if (picked.difficultyMismatch) {
      const key = `${source.skillId}|${block}`;
      if (!mismatchReported.has(key)) {
        mismatchReported.add(key);
        const skillName = skillById.get(source.skillId)?.name ?? source.skillId;
        warnings.push(
          `Kỹ năng "${skillName}" không có câu ở độ khó ${DIFFICULTY_LABEL[difficultyFromOrder(source.desired)]} cho block ${BLOCK_LABEL[block]}; đã dùng câu ở độ khó gần nhất.`,
        );
      }
    }

    items.push({
      itemId: item.id,
      skillId: source.skillId,
      block,
      order: items.length + 1,
      estimatedTime: Math.max(0, item.estimatedTime),
      difficulty: item.difficulty,
      reasonCode,
      reasonData: {
        block,
        blockLabel: BLOCK_LABEL[block],
        skillId: source.skillId,
        skillName: skillById.get(source.skillId)?.name ?? null,
        chapterId: item.chapterId,
        difficulty: item.difficulty,
        desiredDifficulty: difficultyFromOrder(source.desired),
        difficultyMode: source.mode,
        masteryScore: mastery ? round1(mastery.masteryScore) : null,
        confidence: mastery ? round2(mastery.confidence) : null,
        recentAccuracy: mastery ? round2(mastery.recentAccuracy) : null,
        difficultyCeiling: mastery ? mastery.difficultyCeiling : 0,
        gapPriority: effectiveGapPriority === null ? null : round2(effectiveGapPriority),
        targetMastery: gap ? round1(gap.targetMastery) : null,
        estimatedTimeSeconds: Math.max(0, item.estimatedTime),
        timesServedToStudent: item.timesServedToStudent,
        cooldownViolated: picked.cooldownViolated,
        difficultyMismatch: picked.difficultyMismatch,
        ...source.extra,
      },
      gapPriority: effectiveGapPriority,
    });
    blockCounts[block] += 1;
  };

  /** Round-robin qua các skill của block để không dồn hết vào một kỹ năng. */
  const fillBlock = (plan: BlockPlan, need: number, allowCooldown: boolean): number => {
    let remaining = need;
    let advanced = true;
    while (remaining > 0 && advanced) {
      advanced = false;
      for (const source of plan.skills) {
        if (remaining <= 0) break;
        const picked = takeItem(source, allowCooldown);
        if (!picked) continue;
        if (!canAdd(picked.item)) return remaining;
        commit(source, plan.block, picked, source.reasonCode);
        remaining -= 1;
        advanced = true;
      }
    }
    return remaining;
  };

  for (const block of BLOCK_SEQUENCE) {
    const plan = plans.get(block)!;
    if (plan.quota <= 0 || plan.skills.length === 0) continue;
    let remaining = fillBlock(plan, plan.quota, false);
    if (remaining > 0) remaining = fillBlock(plan, remaining, true);
    if (remaining > 0) {
      warnings.push(
        `Block ${BLOCK_LABEL[block]} thiếu ${remaining}/${plan.quota} câu do kho câu hỏi không đủ.`,
      );
    }
  }

  // -- Bù cho đủ sàn số câu / tận dụng quỹ thời gian còn lại ---------------
  const topUpSources: SkillSource[] = [];
  for (const block of BLOCK_SEQUENCE) {
    for (const source of plans.get(block)!.skills) {
      if (!topUpSources.some((s) => s.skillId === source.skillId)) topUpSources.push(source);
    }
  }
  if (topUpSources.length === 0) {
    // Chưa có skill nào được cấp suất (vd gaps/skills rỗng) → dùng chính kho câu.
    for (const item of [...req.candidates].sort((a, b) => a.id.localeCompare(b.id))) {
      if (roster.size >= skillCap && !roster.has(item.skillId)) continue;
      if (topUpSources.some((s) => s.skillId === item.skillId)) continue;
      roster.set(item.skillId, 'CORE');
      topUpSources.push({
        skillId: item.skillId,
        reasonCode: 'FILL_DAILY_MINIMUM',
        desired: targetDifficultyOrder(masteryBySkill.get(item.skillId), config),
        mode: 'NEAREST',
        strict: false,
        gapPriority: gapBySkill.get(item.skillId)?.priority ?? null,
        extra: { fallbackSource: true },
      });
    }
  }

  for (const allowCooldown of [false, true]) {
    let advanced = true;
    while (items.length < targetCount && advanced) {
      advanced = false;
      for (const source of topUpSources) {
        if (items.length >= targetCount) break;
        const picked = takeItem(source, allowCooldown);
        if (!picked) continue;
        if (!canAdd(picked.item)) {
          advanced = false;
          break;
        }
        const reasonCode = items.length < minItems ? 'FILL_DAILY_MINIMUM' : 'FILL_REMAINING_BUDGET';
        commit(source, roster.get(source.skillId) ?? 'CORE', picked, reasonCode);
        advanced = true;
      }
    }
  }

  // -- Cảnh báo tổng hợp ---------------------------------------------------
  if (cooldownReuseCount > 0) {
    warnings.push(
      `Phải giao lại ${cooldownReuseCount} câu còn trong thời gian nghỉ ${config.itemCooldownDays} ngày vì kho câu hỏi không đủ; đã ưu tiên câu học sinh gặp ít lần nhất.`,
    );
  }
  if (items.length < minItems) {
    warnings.push(
      `Kế hoạch chỉ đạt ${items.length}/${minItems} câu tối thiểu mỗi ngày do kho câu hỏi không đủ.`,
    );
  }
  if (items.length > 0 && totalSeconds > capSeconds) {
    warnings.push(
      `Để đủ ${minItems} câu tối thiểu, thời lượng ${Math.round(totalSeconds / 60)} phút đã vượt quỹ ${Math.round(budgetMinutes)} phút của học sinh.`,
    );
  }
  if (items.length === 0) {
    warnings.push('Không chọn được câu nào phù hợp — cần bổ sung câu hỏi đã xuất bản cho các kỹ năng này.');
  }

  return {
    items,
    estimatedMinutes: Math.round(totalSeconds / 60),
    blockCounts,
    warnings,
  };
}

// ---------------------------------------------------------------------------
// Nguồn skill cho từng block
// ---------------------------------------------------------------------------

function buildWarmupSources(
  req: DayPlanRequest,
  masteryBySkill: Map<string, MasteryState>,
  gapBySkill: Map<string, GapScore>,
  skillById: Map<string, SkillNode>,
  hasAnyItem: (skillId: string) => boolean,
  config: RecommendationConfig,
): SkillSource[] {
  const sources: SkillSource[] = [];
  const seen = new Set<string>();
  for (const skillId of req.recentSkillIds) {
    if (seen.has(skillId)) continue;
    seen.add(skillId);
    if (!hasAnyItem(skillId)) continue;
    if (!skillById.has(skillId) && !masteryBySkill.has(skillId)) continue;
    const mastery = masteryBySkill.get(skillId);
    // Khởi động: bằng hoặc thấp hơn bậc đã vững, không dùng để thử sức.
    const desired = Math.min(
      ceilingOrder(mastery, config),
      targetDifficultyOrder(mastery, config),
    );
    sources.push({
      skillId,
      reasonCode: 'WARMUP_RECENT_SKILL',
      desired,
      mode: 'AT_OR_BELOW',
      strict: false,
      gapPriority: gapBySkill.get(skillId)?.priority ?? null,
      extra: { recentSkill: true },
    });
  }
  return sources;
}

function buildRepairSources(
  req: DayPlanRequest,
  masteryBySkill: Map<string, MasteryState>,
  hasAnyItem: (skillId: string) => boolean,
  config: RecommendationConfig,
): SkillSource[] {
  const ordered = [...req.gaps].sort(compareGapDesc);
  const primary: SkillSource[] = [];
  const deferred: SkillSource[] = [];
  const claimed = new Set<string>();

  for (const gap of ordered) {
    const blocking = gap.blockedBySkillIds.find((id) => hasAnyItem(id));
    if (gap.blockedBySkillIds.length > 0 && blocking) {
      // Bị chặn bởi tiên quyết → học skill tiên quyết trước (specs §7.4).
      if (!claimed.has(blocking)) {
        claimed.add(blocking);
        const mastery = masteryBySkill.get(blocking);
        primary.push({
          skillId: blocking,
          reasonCode: 'REPAIR_PREREQUISITE_FIRST',
          desired: targetDifficultyOrder(mastery, config),
          mode: 'AT_OR_BELOW',
          strict: false,
          gapPriority: gap.priority,
          extra: {
            blockedSkillId: gap.skillId,
            prerequisiteOfSkillId: gap.skillId,
            blockedBySkillIds: gap.blockedBySkillIds,
          },
        });
      }
      // Skill bị chặn chỉ được xét sau khi mọi nguồn chính đã có suất.
      if (!claimed.has(gap.skillId) && hasAnyItem(gap.skillId)) {
        claimed.add(gap.skillId);
        deferred.push(makeRepairSource(gap, masteryBySkill.get(gap.skillId), config));
      }
      continue;
    }
    if (claimed.has(gap.skillId) || !hasAnyItem(gap.skillId)) continue;
    claimed.add(gap.skillId);
    primary.push(makeRepairSource(gap, masteryBySkill.get(gap.skillId), config));
  }

  return [...primary, ...deferred];
}

function makeRepairSource(
  gap: GapScore,
  mastery: MasteryState | undefined,
  config: RecommendationConfig,
): SkillSource {
  return {
    skillId: gap.skillId,
    reasonCode: 'REPAIR_HIGH_GAP_PRIORITY',
    desired: targetDifficultyOrder(mastery, config),
    mode: 'AT_OR_BELOW',
    strict: false,
    gapPriority: gap.priority,
    extra: {
      gapFactors: gap.factors,
      gapReason: gap.reason,
      blockedBySkillIds: gap.blockedBySkillIds,
    },
  };
}

function buildCoreSources(
  req: DayPlanRequest,
  masteryBySkill: Map<string, MasteryState>,
  gapBySkill: Map<string, GapScore>,
  hasAnyItem: (skillId: string) => boolean,
  config: RecommendationConfig,
): SkillSource[] {
  const chapters = new Set(req.coreChapterIds);
  if (chapters.size === 0) return [];
  const eligible = req.skills.filter((s) => chapters.has(s.chapterId) && hasAnyItem(s.id));
  eligible.sort((a, b) => {
    const pa = gapBySkill.get(a.id)?.priority ?? 0;
    const pb = gapBySkill.get(b.id)?.priority ?? 0;
    if (pb !== pa) return pb - pa;
    if (a.order !== b.order) return a.order - b.order;
    return a.id.localeCompare(b.id);
  });
  return eligible.map((skill) => ({
    skillId: skill.id,
    reasonCode: 'CORE_WEEKLY_FOCUS_CHAPTER',
    desired: targetDifficultyOrder(masteryBySkill.get(skill.id), config),
    mode: 'NEAREST',
    strict: false,
    gapPriority: gapBySkill.get(skill.id)?.priority ?? null,
    extra: { chapterId: skill.chapterId, chapterName: skill.chapterName },
  }));
}

function buildChallengeSources(
  req: DayPlanRequest,
  masteryBySkill: Map<string, MasteryState>,
  gapBySkill: Map<string, GapScore>,
  freshBySkill: Map<string, CandidateItem[]>,
  cooledBySkill: Map<string, CandidateItem[]>,
  config: RecommendationConfig,
): SkillSource[] {
  const unlocked = req.masteries.filter((m) => m.masteryScore >= config.challengeUnlockMastery);
  unlocked.sort((a, b) => {
    if (b.masteryScore !== a.masteryScore) return b.masteryScore - a.masteryScore;
    return a.skillId.localeCompare(b.skillId);
  });

  const sources: SkillSource[] = [];
  for (const mastery of unlocked) {
    // Thử thách = cao hơn một bậc so với mức đang luyện.
    const desired = clamp(targetDifficultyOrder(mastery, config) + 1, 0, 2);
    const pool = [
      ...(freshBySkill.get(mastery.skillId) ?? []),
      ...(cooledBySkill.get(mastery.skillId) ?? []),
    ];
    // Không có câu đủ khó thì không mở thử thách giả.
    if (!pool.some((item) => DIFFICULTY_ORDER[item.difficulty] >= desired)) continue;
    sources.push({
      skillId: mastery.skillId,
      reasonCode: 'CHALLENGE_MASTERY_UNLOCKED',
      desired,
      mode: 'AT_OR_ABOVE',
      strict: true,
      gapPriority: gapBySkill.get(mastery.skillId)?.priority ?? null,
      extra: {
        unlockThreshold: config.challengeUnlockMastery,
        masteryAtUnlock: round1(mastery.masteryScore),
      },
    });
  }
  return sources;
}

function buildReviewSources(
  req: DayPlanRequest,
  gapBySkill: Map<string, GapScore>,
  hasAnyItem: (skillId: string) => boolean,
  rng: ReturnType<typeof createRng>,
  config: RecommendationConfig,
  warnings: string[],
): SkillSource[] {
  const nowMs = req.now.getTime();
  const mastered = req.masteries.filter(
    (m) => m.masteryScore >= config.masteredThreshold && hasAnyItem(m.skillId),
  );

  const due: { mastery: MasteryState; daysSince: number }[] = [];
  const notDue: MasteryState[] = [];
  for (const mastery of mastered) {
    if (!mastery.lastPracticedAt) {
      notDue.push(mastery);
      continue;
    }
    const daysSince = (nowMs - mastery.lastPracticedAt.getTime()) / MS_PER_DAY;
    if (daysSince >= config.spacedRepetitionDays) due.push({ mastery, daysSince });
    else notDue.push(mastery);
  }

  // "Trộn" theo specs §7.6: xáo bằng RNG có hạt giống rồi ưu tiên skill bỏ lâu
  // nhất — vẫn tất định, nhưng các skill cùng độ trễ không luôn theo một thứ tự.
  const shuffled = rng.shuffle(due);
  shuffled.sort((a, b) => b.daysSince - a.daysSince);

  const sources: SkillSource[] = shuffled.map(({ mastery, daysSince }) => ({
    skillId: mastery.skillId,
    reasonCode: 'REVIEW_SPACED_REPETITION',
    desired: ceilingOrder(mastery, config),
    mode: 'AT_OR_BELOW',
    strict: false,
    gapPriority: gapBySkill.get(mastery.skillId)?.priority ?? null,
    extra: {
      daysSinceLastPractice: Math.floor(daysSince),
      spacedRepetitionDays: config.spacedRepetitionDays,
    },
  }));

  if (sources.length === 0 && mastered.length > 0) {
    warnings.push(
      `Chưa có kỹ năng nào tới hạn ôn lại sau ${config.spacedRepetitionDays} ngày; block ${BLOCK_LABEL.REVIEW} dùng kỹ năng đã vững để kiểm tra độ nhớ.`,
    );
  }

  notDue.sort((a, b) => {
    const ta = a.lastPracticedAt ? a.lastPracticedAt.getTime() : 0;
    const tb = b.lastPracticedAt ? b.lastPracticedAt.getTime() : 0;
    if (ta !== tb) return ta - tb;
    return a.skillId.localeCompare(b.skillId);
  });
  for (const mastery of notDue) {
    sources.push({
      skillId: mastery.skillId,
      reasonCode: 'REVIEW_RETENTION_CHECK',
      desired: ceilingOrder(mastery, config),
      mode: 'AT_OR_BELOW',
      strict: false,
      gapPriority: gapBySkill.get(mastery.skillId)?.priority ?? null,
      extra: { masteredThreshold: config.masteredThreshold },
    });
  }

  // Chưa vững skill nào → vẫn giữ block ôn nhanh bằng skill có dữ liệu gần nhất.
  if (sources.length === 0) {
    const withData = req.masteries
      .filter((m) => m.attemptCount > 0 && hasAnyItem(m.skillId))
      .sort((a, b) => {
        if (b.masteryScore !== a.masteryScore) return b.masteryScore - a.masteryScore;
        return a.skillId.localeCompare(b.skillId);
      });
    for (const mastery of withData) {
      sources.push({
        skillId: mastery.skillId,
        reasonCode: 'REVIEW_MIXED_PRACTICE',
        desired: targetDifficultyOrder(mastery, config),
        mode: 'AT_OR_BELOW',
        strict: false,
        gapPriority: gapBySkill.get(mastery.skillId)?.priority ?? null,
        extra: { mixedPractice: true },
      });
    }
  }

  return sources;
}

// ---------------------------------------------------------------------------
// Độ khó
// ---------------------------------------------------------------------------

/** Bậc cao nhất học sinh đã ổn định (difficultyCeiling: 0 = chưa có, 1 = TB…). */
function ceilingOrder(mastery: MasteryState | undefined, config: RecommendationConfig): number {
  if (!mastery) return 0;
  if (mastery.difficultyCeiling > 0) return clamp(mastery.difficultyCeiling - 1, 0, 2);
  return baseOrderFromScore(mastery.masteryScore, config);
}

function baseOrderFromScore(score: number, config: RecommendationConfig): number {
  if (score >= config.masteredThreshold) return 2;
  if (score >= config.gapThreshold) return 1;
  return 0;
}

/**
 * Suy độ khó nên giao theo luật specs §7.4. Giữ tương đương `decideDifficulty`
 * nhưng không phụ thuộc module khác để day-plan test được độc lập.
 */
function targetDifficultyOrder(
  mastery: MasteryState | undefined,
  config: RecommendationConfig,
): number {
  if (!mastery || mastery.attemptCount === 0) return 0;
  let order = ceilingOrder(mastery, config);
  const tooSlow = mastery.avgTimeRatio >= config.difficultyDown.minTimeRatio;
  const tooManyWrong = mastery.consecutiveWrong >= config.difficultyDown.consecutiveWrong;
  const steadyCorrect = mastery.consecutiveCorrect >= config.difficultyUp.consecutiveCorrect;
  const fastEnough =
    mastery.avgTimeRatio > 0 && mastery.avgTimeRatio <= config.difficultyUp.maxTimeRatio;
  if (tooManyWrong || tooSlow) order -= 1;
  else if (steadyCorrect && fastEnough) order += 1;
  return clamp(order, 0, 2);
}

function penaltyOf(item: CandidateItem, source: SkillSource): number {
  const order = DIFFICULTY_ORDER[item.difficulty];
  const delta = order - source.desired;
  switch (source.mode) {
    case 'AT_OR_BELOW':
      return delta <= 0 ? -delta : MISMATCH_PENALTY + delta;
    case 'AT_OR_ABOVE':
      return delta >= 0 ? delta : MISMATCH_PENALTY - delta;
    default:
      return Math.abs(delta);
  }
}

/** Xếp hạng kho câu của một skill: hợp độ khó → ít gặp → lâu chưa gặp → id. */
function rankPool(
  pool: CandidateItem[],
  source: SkillSource,
  used: Set<string>,
): CandidateItem[] {
  return pool
    .filter((item) => !used.has(item.id))
    .sort((a, b) => {
      const pa = penaltyOf(a, source);
      const pb = penaltyOf(b, source);
      if (pa !== pb) return pa - pb;
      if (a.timesServedToStudent !== b.timesServedToStudent) {
        return a.timesServedToStudent - b.timesServedToStudent;
      }
      const ta = a.lastServedAt ? a.lastServedAt.getTime() : 0;
      const tb = b.lastServedAt ? b.lastServedAt.getTime() : 0;
      if (ta !== tb) return ta - tb;
      return a.id.localeCompare(b.id);
    });
}

// ---------------------------------------------------------------------------
// Tiện ích
// ---------------------------------------------------------------------------

function compareGapDesc(a: GapScore, b: GapScore): number {
  if (b.priority !== a.priority) return b.priority - a.priority;
  return a.skillId.localeCompare(b.skillId);
}

function averageEstimatedTime(candidates: CandidateItem[]): number {
  let sum = 0;
  let count = 0;
  for (const item of candidates) {
    if (item.estimatedTime > 0) {
      sum += item.estimatedTime;
      count += 1;
    }
  }
  // Kho toàn câu thiếu estimatedTime → coi như 60 giây/câu để không chia cho 0.
  return count === 0 ? 60 : sum / count;
}

function emptyBlockCounts(): Record<BlockType, number> {
  return { WARMUP: 0, REPAIR: 0, CORE: 0, CHALLENGE: 0, REVIEW: 0 };
}

/** Hạt giống chỉ phụ thuộc dữ liệu đầu vào → chạy lại cho kết quả y hệt. */
function buildSeed(req: DayPlanRequest): string {
  const skillPart = req.skills
    .map((s) => s.id)
    .sort()
    .join(',');
  const masteryPart = req.masteries
    .map((m) => m.skillId)
    .sort()
    .join(',');
  return `day-plan|${req.now.toISOString().slice(0, 10)}|${skillPart}|${masteryPart}`;
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}
