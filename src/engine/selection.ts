/**
 * CHỌN CÂU CHO BÀI KIỂM TRA (specs §7.9 diagnostic, §7.10 progress).
 *
 * Hai nguyên tắc xuyên suốt:
 *  1. KHÔNG random đơn thuần — mọi suất câu đi qua blueprint (chương × độ khó)
 *     và đều mang `reasonCode` để ghi vào bảng Recommendation (specs §7.8).
 *  2. Tái lập được — mọi lựa chọn đi qua `createRng(seedKey)`, cùng seed + cùng
 *     kho câu ⇒ cùng bộ đề, phục vụ đối chiếu khi vận hành thắc mắc.
 *
 * Caller có trách nhiệm chỉ nạp candidate có status = PUBLISHED (specs §5.3).
 */
import type { Difficulty } from '@prisma/client';
import {
  DIFFICULTIES,
  DIFFICULTY_LABEL,
  DIFFICULTY_ORDER,
  difficultyFromOrder,
  masteryTier,
} from '@/lib/domain';
import { allocateByWeights, clamp, createRng, type Rng } from './rng';
import type {
  CandidateItem,
  DiagnosticSelectionRequest,
  MasteryState,
  ProgressSelectionRequest,
  SelectedItem,
  SelectionResult,
  SkillNode,
} from './types';

/** Mã lý do chọn câu — lưu vào `recommendations.reason_code` (tiêu chí nghiệm thu §17). */
export const SELECTION_REASON_CODES = {
  DIAGNOSTIC_ANCHOR: 'DIAGNOSTIC_ANCHOR',
  DIAGNOSTIC_BLUEPRINT: 'DIAGNOSTIC_BLUEPRINT',
  PROGRESS_ANCHOR: 'PROGRESS_ANCHOR_MATCHED',
  PROGRESS_ANCHOR_RELAXED: 'PROGRESS_ANCHOR_RELAXED',
  PROGRESS_TRAINED: 'PROGRESS_TRAINED_SKILL',
  PROGRESS_TRAINED_BORROWED: 'PROGRESS_TRAINED_BORROWED',
  PROGRESS_FRESH: 'PROGRESS_FRESH_BLUEPRINT',
  PROGRESS_BACKFILL: 'PROGRESS_BACKFILL',
} as const;

/**
 * Trần số câu cùng một skill trong một đề: bài chẩn đoán phải PHỦ nhiều kỹ năng
 * mới vẽ được hồ sơ năng lực (specs §7.9). Đây là ràng buộc MỀM — hết lựa chọn
 * thì được phép vượt, không im lặng bỏ trống suất.
 */
const MAX_ITEMS_PER_SKILL = 2;

// ---------------------------------------------------------------------------
// Kho câu ứng viên
// ---------------------------------------------------------------------------

interface ItemPool {
  used: Set<string>;
  skillUse: Map<string, number>;
  /** chapterId + độ khó */
  byCell: Map<string, CandidateItem[]>;
  bySkill: Map<string, CandidateItem[]>;
  /** skillId + độ khó */
  bySkillDifficulty: Map<string, CandidateItem[]>;
  byChapter: Map<string, CandidateItem[]>;
  all: CandidateItem[];
}

function cellKey(chapterId: string, difficulty: Difficulty): string {
  return `${chapterId}::${difficulty}`;
}

function skillDifficultyKey(skillId: string, difficulty: Difficulty): string {
  return `${skillId}::${difficulty}`;
}

function pushTo(map: Map<string, CandidateItem[]>, key: string, item: CandidateItem): void {
  const list = map.get(key);
  if (list) list.push(item);
  else map.set(key, [item]);
}

function buildPool(candidates: CandidateItem[], rng: Rng): ItemPool {
  // Sắp theo id rồi xáo bằng rng ⇒ thứ tự trả về của DB không ảnh hưởng kết quả.
  const shuffled = rng.shuffle(
    [...candidates].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)),
  );
  // Ưu tiên câu học sinh ít gặp (sort ổn định nên vẫn giữ tính ngẫu nhiên đã seed).
  const ordered = shuffled.sort((a, b) => a.timesServedToStudent - b.timesServedToStudent);

  const pool: ItemPool = {
    used: new Set<string>(),
    skillUse: new Map<string, number>(),
    byCell: new Map<string, CandidateItem[]>(),
    bySkill: new Map<string, CandidateItem[]>(),
    bySkillDifficulty: new Map<string, CandidateItem[]>(),
    byChapter: new Map<string, CandidateItem[]>(),
    all: ordered,
  };

  for (const item of ordered) {
    pushTo(pool.byCell, cellKey(item.chapterId, item.difficulty), item);
    pushTo(pool.bySkill, item.skillId, item);
    pushTo(pool.bySkillDifficulty, skillDifficultyKey(item.skillId, item.difficulty), item);
    pushTo(pool.byChapter, item.chapterId, item);
  }
  return pool;
}

/** Lấy câu chưa dùng, ưu tiên skill đang xuất hiện ít nhất trong đề. */
function pickFrom(
  pool: ItemPool,
  list: CandidateItem[] | undefined,
  maxPerSkill: number,
): CandidateItem | null {
  if (!list || list.length === 0) return null;
  let best: CandidateItem | null = null;
  let bestUse = Number.POSITIVE_INFINITY;
  for (const item of list) {
    if (pool.used.has(item.id)) continue;
    const use = pool.skillUse.get(item.skillId) ?? 0;
    if (use >= maxPerSkill) continue;
    if (use < bestUse) {
      best = item;
      bestUse = use;
      if (use === 0) break;
    }
  }
  return best;
}

/**
 * Duyệt danh sách nguồn theo thứ tự ưu tiên; lượt đầu tôn trọng trần skill,
 * lượt sau mới cho phép vượt trần (thà lệch phủ skill còn hơn thiếu câu).
 */
function pickWithFallback(
  pool: ItemPool,
  lists: (CandidateItem[] | undefined)[],
): { item: CandidateItem; listIndex: number } | null {
  for (const cap of [MAX_ITEMS_PER_SKILL, Number.POSITIVE_INFINITY]) {
    for (let i = 0; i < lists.length; i++) {
      const item = pickFrom(pool, lists[i], cap);
      if (item) return { item, listIndex: i };
    }
  }
  return null;
}

function commit(pool: ItemPool, item: CandidateItem): void {
  pool.used.add(item.id);
  pool.skillUse.set(item.skillId, (pool.skillUse.get(item.skillId) ?? 0) + 1);
}

/** Các bậc độ khó khác, sắp theo khoảng cách tăng dần (gần trước, dễ trước khó). */
function nearestDifficulties(difficulty: Difficulty): Difficulty[] {
  const base = DIFFICULTY_ORDER[difficulty];
  return DIFFICULTIES.filter((d) => d !== difficulty).sort((a, b) => {
    const da = Math.abs(DIFFICULTY_ORDER[a] - base);
    const db = Math.abs(DIFFICULTY_ORDER[b] - base);
    return da - db || DIFFICULTY_ORDER[a] - DIFFICULTY_ORDER[b];
  });
}

// ---------------------------------------------------------------------------
// §7.9 — Bài kiểm tra đầu vào
// ---------------------------------------------------------------------------

export function selectDiagnosticItems(req: DiagnosticSelectionRequest): SelectionResult {
  const warnings: string[] = [];
  const items: SelectedItem[] = [];
  const itemCount = Math.max(0, Math.floor(req.itemCount));

  if (itemCount === 0) {
    warnings.push('Số câu yêu cầu bằng 0 nên không tạo được đề chẩn đoán.');
    return { items, warnings };
  }

  const usable = req.candidates.filter((c) => c.skillId && c.chapterId);
  if (usable.length === 0) {
    warnings.push('Không có câu hỏi nào đủ điều kiện (đã xuất bản) để tạo đề chẩn đoán.');
    return { items, warnings };
  }

  const rng = createRng(req.seedKey);
  const pool = buildPool(usable, rng);
  const chapterLabel = buildChapterLabels(req.skills);

  // --- Trọng số chương: chỉ giữ chương thực sự còn câu trong kho ---------
  const chaptersWithItems = new Set(usable.map((c) => c.chapterId));
  const chapterWeights: Record<string, number> = {};
  const emptyChapters: string[] = [];
  for (const [chapterId, weight] of Object.entries(req.blueprint.chapterWeights ?? {})) {
    if (!(weight > 0)) continue;
    if (chaptersWithItems.has(chapterId)) chapterWeights[chapterId] = weight;
    else emptyChapters.push(chapterLabel(chapterId));
  }
  if (emptyChapters.length > 0) {
    warnings.push(
      `Các chương sau không còn câu hỏi khả dụng nên bị bỏ khỏi blueprint: ${emptyChapters.join(', ')}.`,
    );
  }
  if (Object.keys(chapterWeights).length === 0) {
    warnings.push('Blueprint không khớp chương nào trong kho — tạm chia đều theo các chương có sẵn.');
    for (const chapterId of [...chaptersWithItems].sort()) chapterWeights[chapterId] = 1;
  }

  // Chương nặng trước để phần dư làm tròn rơi vào chương quan trọng.
  const chapterOrder = Object.keys(chapterWeights).sort(
    (a, b) => (chapterWeights[b] ?? 0) - (chapterWeights[a] ?? 0) || (a < b ? -1 : 1),
  );

  // --- Tỷ lệ độ khó theo mức TỰ KHAI (chỉ chọn vùng xuất phát, §7.9) -----
  const rawMix = req.blueprint.difficultyMixByLevel?.[req.selfLevel];
  const mix: Record<string, number> = {};
  let mixTotal = 0;
  for (const difficulty of DIFFICULTIES) {
    const value = Math.max(0, rawMix?.[difficulty] ?? 0);
    mix[difficulty] = value;
    mixTotal += value;
  }
  if (mixTotal <= 0) {
    warnings.push(
      `Blueprint chưa khai báo tỷ lệ độ khó cho mức tự khai "${req.selfLevel}" — tạm chia đều 3 bậc.`,
    );
    for (const difficulty of DIFFICULTIES) mix[difficulty] = 1;
  }

  // --- Chia suất: chương → độ khó ---------------------------------------
  const perChapter = allocateByWeights(itemCount, chapterWeights);
  const quota = new Map<string, number>();
  for (const chapterId of chapterOrder) {
    const perDifficulty = allocateByWeights(perChapter[chapterId] ?? 0, mix);
    for (const difficulty of DIFFICULTIES) {
      quota.set(cellKey(chapterId, difficulty), perDifficulty[difficulty] ?? 0);
    }
  }

  // --- Câu neo: luôn giữ tối thiểu minAnchorItems câu độ khó Trung bình --
  // Kể cả học sinh tự khai Giỏi, vẫn cần mốc cơ bản để so sánh (specs §7.9).
  const anchorTarget = clamp(Math.floor(req.blueprint.minAnchorItems ?? 0), 0, itemCount);
  let averageQuota = chapterOrder.reduce(
    (sum, chapterId) => sum + (quota.get(cellKey(chapterId, 'AVERAGE')) ?? 0),
    0,
  );
  while (averageQuota < anchorTarget) {
    const donor = findDonorCell(quota, chapterOrder);
    if (!donor) break;
    const donorCell = cellKey(donor.chapterId, donor.difficulty);
    const anchorCell = cellKey(donor.chapterId, 'AVERAGE');
    quota.set(donorCell, (quota.get(donorCell) ?? 0) - 1);
    quota.set(anchorCell, (quota.get(anchorCell) ?? 0) + 1);
    averageQuota += 1;
  }

  // --- Rút câu theo từng ô, độ khó tăng dần -----------------------------
  let anchorAssigned = 0;
  for (const difficulty of DIFFICULTIES) {
    for (const chapterId of chapterOrder) {
      const need = quota.get(cellKey(chapterId, difficulty)) ?? 0;
      for (let i = 0; i < need; i++) {
        const cells = fallbackCells(chapterId, difficulty, chapterOrder);
        const lists = cells.map((cell) => pool.byCell.get(cellKey(cell.chapterId, cell.difficulty)));
        const picked = pickWithFallback(pool, lists);
        if (!picked) continue;

        commit(pool, picked.item);
        const source = cells[picked.listIndex];
        if (source && (source.chapterId !== chapterId || source.difficulty !== difficulty)) {
          warnings.push(
            `Thiếu câu ở chương ${chapterLabel(chapterId)} bậc ${DIFFICULTY_LABEL[difficulty]} — đã mượn từ chương ${chapterLabel(source.chapterId)} bậc ${DIFFICULTY_LABEL[source.difficulty]}.`,
          );
        }

        const isAnchor = picked.item.difficulty === 'AVERAGE' && anchorAssigned < anchorTarget;
        if (isAnchor) anchorAssigned += 1;
        items.push({
          itemId: picked.item.id,
          skillId: picked.item.skillId,
          chapterId: picked.item.chapterId,
          difficulty: picked.item.difficulty,
          role: isAnchor ? 'ANCHOR' : 'BLUEPRINT',
          reasonCode: isAnchor
            ? SELECTION_REASON_CODES.DIAGNOSTIC_ANCHOR
            : SELECTION_REASON_CODES.DIAGNOSTIC_BLUEPRINT,
        });
      }
    }
  }

  if (anchorAssigned < anchorTarget) {
    warnings.push(
      `Chỉ bố trí được ${anchorAssigned}/${anchorTarget} câu neo cơ bản — kho câu bậc Trung bình đang thiếu.`,
    );
  }
  if (items.length < itemCount) {
    warnings.push(
      `Kho câu hỏi chỉ đủ ${items.length}/${itemCount} câu cho đề chẩn đoán — cần bổ sung ngân hàng câu hỏi.`,
    );
  }

  return { items, warnings };
}

/** Ô có độ khó cao nhất còn suất để nhường chỗ cho câu neo. */
function findDonorCell(
  quota: Map<string, number>,
  chapterOrder: string[],
): { chapterId: string; difficulty: Difficulty } | null {
  for (const difficulty of [...DIFFICULTIES].reverse()) {
    if (difficulty === 'AVERAGE') break;
    let donorChapter: string | null = null;
    let donorCount = 0;
    for (const chapterId of chapterOrder) {
      const count = quota.get(cellKey(chapterId, difficulty)) ?? 0;
      if (count > donorCount) {
        donorChapter = chapterId;
        donorCount = count;
      }
    }
    if (donorChapter) return { chapterId: donorChapter, difficulty };
  }
  return null;
}

/** Thứ tự mượn câu: cùng chương khác độ khó → chương khác (specs §7.9). */
function fallbackCells(
  chapterId: string,
  difficulty: Difficulty,
  chapterOrder: string[],
): { chapterId: string; difficulty: Difficulty }[] {
  const neighbours = nearestDifficulties(difficulty);
  const cells: { chapterId: string; difficulty: Difficulty }[] = [{ chapterId, difficulty }];
  for (const d of neighbours) cells.push({ chapterId, difficulty: d });
  for (const other of chapterOrder) {
    if (other === chapterId) continue;
    cells.push({ chapterId: other, difficulty });
    for (const d of neighbours) cells.push({ chapterId: other, difficulty: d });
  }
  return cells;
}

function buildChapterLabels(skills: SkillNode[]): (chapterId: string) => string {
  const labels = new Map<string, string>();
  for (const skill of skills) {
    if (!labels.has(skill.chapterId)) labels.set(skill.chapterId, skill.chapterName || skill.chapterId);
  }
  return (chapterId: string) => labels.get(chapterId) ?? chapterId;
}

// ---------------------------------------------------------------------------
// §7.10 — Bài kiểm tra tiến bộ 14 ngày
// ---------------------------------------------------------------------------

/**
 * Độ khó phù hợp với năng lực hiện tại của một skill.
 * Lấy mức cao hơn giữa "trần độ khó đã ổn định" và mức suy từ mastery — không
 * dùng ngưỡng rời rạc tự chế, mọi ngưỡng đều nằm ở `masteryTier` (domain).
 */
function difficultyForMastery(mastery: MasteryState | undefined): Difficulty {
  if (!mastery) return 'AVERAGE';
  const fromCeiling = mastery.difficultyCeiling >= 3 ? 2 : mastery.difficultyCeiling >= 2 ? 1 : 0;
  const tier = masteryTier(mastery.masteryScore);
  const fromTier = tier === 'STRONG' ? 2 : tier === 'OK' ? 1 : 0;
  return difficultyFromOrder(Math.max(fromCeiling, fromTier));
}

export function selectProgressItems(req: ProgressSelectionRequest): SelectionResult {
  const warnings: string[] = [];
  const items: SelectedItem[] = [];
  const itemCount = Math.max(0, Math.floor(req.itemCount));

  if (itemCount === 0) {
    warnings.push('Số câu yêu cầu bằng 0 nên không tạo được đề kiểm tra tiến bộ.');
    return { items, warnings };
  }

  // Loại câu vừa gặp VÀ chính các câu của bài baseline: câu neo phải là itemId
  // khác thì mới đo được tiến bộ thật, không phải trí nhớ (specs §7.5, §7.10).
  const blocked = new Set<string>([
    ...req.excludeItemIds,
    ...req.baselineItems.map((b) => b.itemId),
  ]);
  const usable = req.candidates.filter((c) => c.skillId && c.chapterId && !blocked.has(c.id));
  if (usable.length === 0) {
    warnings.push(
      'Sau khi loại các câu học sinh vừa gặp, kho không còn câu nào để ra đề kiểm tra tiến bộ.',
    );
    return { items, warnings };
  }

  const rng = createRng(req.seedKey);
  const pool = buildPool(usable, rng);
  const chapterLabel = buildChapterLabels(req.skills);
  const skillById = new Map<string, SkillNode>(req.skills.map((s) => [s.id, s]));
  const masteryById = new Map<string, MasteryState>(req.masteries.map((m) => [m.skillId, m]));
  const trainedSet = new Set(req.trainedSkillIds);

  const counts = allocateByWeights(itemCount, {
    anchor: Math.max(0, req.composition.anchor),
    trained: Math.max(0, req.composition.trained),
    fresh: Math.max(0, req.composition.fresh),
  });
  const anchorQuota = counts.anchor ?? 0;
  const trainedQuota = counts.trained ?? 0;
  const freshQuota = counts.fresh ?? 0;

  // --- Phần 1: câu neo — cùng skill & cùng độ khó với baseline ----------
  const baselineOrder = rng.shuffle(
    [...req.baselineItems].sort((a, b) => (a.itemId < b.itemId ? -1 : a.itemId > b.itemId ? 1 : 0)),
  );
  let anchorTaken = 0;
  for (const base of baselineOrder) {
    if (anchorTaken >= anchorQuota) break;
    const chapterId = skillById.get(base.skillId)?.chapterId;
    const lists: (CandidateItem[] | undefined)[] = [
      pool.bySkillDifficulty.get(skillDifficultyKey(base.skillId, base.difficulty)),
      ...nearestDifficulties(base.difficulty).map((d) =>
        pool.bySkillDifficulty.get(skillDifficultyKey(base.skillId, d)),
      ),
      chapterId ? pool.byCell.get(cellKey(chapterId, base.difficulty)) : undefined,
      chapterId ? pool.byChapter.get(chapterId) : undefined,
    ];
    const picked = pickWithFallback(pool, lists);
    if (!picked) continue;

    commit(pool, picked.item);
    const exactMatch = picked.listIndex === 0;
    if (!exactMatch) {
      warnings.push(
        `Không còn câu song sinh (cùng kỹ năng, bậc ${DIFFICULTY_LABEL[base.difficulty]}) cho câu neo ${base.itemId} — đã thay bằng câu gần nhất.`,
      );
    }
    items.push({
      itemId: picked.item.id,
      skillId: picked.item.skillId,
      chapterId: picked.item.chapterId,
      difficulty: picked.item.difficulty,
      role: 'ANCHOR',
      reasonCode: exactMatch
        ? SELECTION_REASON_CODES.PROGRESS_ANCHOR
        : SELECTION_REASON_CODES.PROGRESS_ANCHOR_RELAXED,
    });
    anchorTaken += 1;
  }
  if (anchorTaken < anchorQuota) {
    warnings.push(
      `Phần câu neo thiếu ${anchorQuota - anchorTaken}/${anchorQuota} câu — sẽ bù từ phần khác, độ chính xác của chỉ số tiến bộ giảm.`,
    );
  }

  // --- Phần 2: skill đã luyện trong chu kỳ ------------------------------
  const trainedSkills = [...new Set(req.trainedSkillIds)].filter(
    (id) => (pool.bySkill.get(id)?.length ?? 0) > 0,
  );
  let trainedTaken = 0;
  if (trainedQuota > 0 && trainedSkills.length === 0) {
    warnings.push(
      'Không có kỹ năng đã luyện nào còn câu hỏi khả dụng — phần "kỹ năng đã luyện" phải bù bằng câu mới.',
    );
  } else if (trainedQuota > 0) {
    const trainedWeights: Record<string, number> = {};
    for (const skillId of trainedSkills) {
      trainedWeights[skillId] = Math.max(skillById.get(skillId)?.blueprintWeight ?? 1, 0);
    }
    const trainedAlloc = allocateByWeights(trainedQuota, trainedWeights);
    for (const skillId of trainedSkills) {
      const need = trainedAlloc[skillId] ?? 0;
      const target = difficultyForMastery(masteryById.get(skillId));
      for (let i = 0; i < need; i++) {
        const lists: (CandidateItem[] | undefined)[] = [
          pool.bySkillDifficulty.get(skillDifficultyKey(skillId, target)),
          ...nearestDifficulties(target).map((d) =>
            pool.bySkillDifficulty.get(skillDifficultyKey(skillId, d)),
          ),
          ...trainedSkills.filter((s) => s !== skillId).map((s) => pool.bySkill.get(s)),
        ];
        const picked = pickWithFallback(pool, lists);
        if (!picked) continue;

        commit(pool, picked.item);
        const borrowed = picked.item.skillId !== skillId;
        if (borrowed) {
          warnings.push(
            `Kỹ năng ${skillById.get(skillId)?.name ?? skillId} hết câu khả dụng ở bậc ${DIFFICULTY_LABEL[target]} — đã lấy câu của kỹ năng đã luyện khác.`,
          );
        }
        items.push({
          itemId: picked.item.id,
          skillId: picked.item.skillId,
          chapterId: picked.item.chapterId,
          difficulty: picked.item.difficulty,
          role: 'TRAINED',
          reasonCode: borrowed
            ? SELECTION_REASON_CODES.PROGRESS_TRAINED_BORROWED
            : SELECTION_REASON_CODES.PROGRESS_TRAINED,
        });
        trainedTaken += 1;
      }
    }
    if (trainedTaken < trainedQuota) {
      warnings.push(
        `Phần kỹ năng đã luyện thiếu ${trainedQuota - trainedTaken}/${trainedQuota} câu — sẽ bù từ phần khác.`,
      );
    }
  }

  // --- Phần 3: câu mới theo blueprint (chống học tủ) --------------------
  const chaptersWithItems = new Set(usable.map((c) => c.chapterId));
  const freshWeights: Record<string, number> = {};
  for (const [chapterId, weight] of Object.entries(req.blueprint.chapterWeights ?? {})) {
    if (weight > 0 && chaptersWithItems.has(chapterId)) freshWeights[chapterId] = weight;
  }
  if (Object.keys(freshWeights).length === 0) {
    for (const chapterId of [...chaptersWithItems].sort()) freshWeights[chapterId] = 1;
  }
  const freshChapters = Object.keys(freshWeights).sort(
    (a, b) => (freshWeights[b] ?? 0) - (freshWeights[a] ?? 0) || (a < b ? -1 : 1),
  );
  const freshAlloc = allocateByWeights(freshQuota, freshWeights);
  let freshTaken = 0;
  for (const chapterId of freshChapters) {
    const need = freshAlloc[chapterId] ?? 0;
    for (let i = 0; i < need; i++) {
      const item =
        pickFresh(pool, pool.byChapter.get(chapterId), trainedSet, masteryById, MAX_ITEMS_PER_SKILL) ??
        pickFresh(pool, pool.byChapter.get(chapterId), trainedSet, masteryById, Number.POSITIVE_INFINITY);
      if (!item) {
        warnings.push(
          `Chương ${chapterLabel(chapterId)} không còn câu mới cho phần chống học tủ — sẽ bù từ chương khác.`,
        );
        continue;
      }
      commit(pool, item);
      items.push({
        itemId: item.id,
        skillId: item.skillId,
        chapterId: item.chapterId,
        difficulty: item.difficulty,
        role: 'FRESH',
        reasonCode: SELECTION_REASON_CODES.PROGRESS_FRESH,
      });
      freshTaken += 1;
    }
  }

  // --- Bù thiếu theo thứ tự ưu tiên ANCHOR > TRAINED > FRESH ------------
  let backfilled = 0;
  while (items.length < itemCount) {
    const extra =
      backfillAnchor(pool, baselineOrder, skillById) ??
      backfillTrained(pool, trainedSkills, masteryById) ??
      backfillFresh(pool, trainedSet, masteryById);
    if (!extra) break;
    items.push(extra);
    backfilled += 1;
  }
  if (backfilled > 0) {
    warnings.push(
      `Đã bù ${backfilled} câu ngoài cấu trúc chuẩn (neo ${anchorQuota} / đã luyện ${trainedQuota} / câu mới ${freshQuota}) do kho thiếu câu.`,
    );
  }
  if (items.length < itemCount) {
    warnings.push(
      `Kho câu hỏi chỉ đủ ${items.length}/${itemCount} câu cho bài kiểm tra tiến bộ — cần bổ sung ngân hàng câu hỏi.`,
    );
  }

  // Trộn thứ tự để học sinh không đoán được đâu là câu neo, đâu là câu mới.
  return { items: rng.shuffle(items), warnings };
}

/** Câu "mới": ưu tiên kỹ năng chưa luyện trong chu kỳ, độ khó bám mastery. */
function pickFresh(
  pool: ItemPool,
  list: CandidateItem[] | undefined,
  trainedSet: Set<string>,
  masteryById: Map<string, MasteryState>,
  maxPerSkill: number,
): CandidateItem | null {
  if (!list || list.length === 0) return null;
  let best: CandidateItem | null = null;
  let bestScore = Number.POSITIVE_INFINITY;
  for (const item of list) {
    if (pool.used.has(item.id)) continue;
    const use = pool.skillUse.get(item.skillId) ?? 0;
    if (use >= maxPerSkill) continue;
    const target = difficultyForMastery(masteryById.get(item.skillId));
    const distance = Math.abs(DIFFICULTY_ORDER[item.difficulty] - DIFFICULTY_ORDER[target]);
    const score = (trainedSet.has(item.skillId) ? 2 : 0) + use + distance * 0.1;
    if (score < bestScore) {
      best = item;
      bestScore = score;
    }
  }
  return best;
}

function backfillAnchor(
  pool: ItemPool,
  baselineOrder: { itemId: string; skillId: string; difficulty: Difficulty }[],
  skillById: Map<string, SkillNode>,
): SelectedItem | null {
  for (const base of baselineOrder) {
    const chapterId = skillById.get(base.skillId)?.chapterId;
    const picked = pickWithFallback(pool, [
      pool.bySkillDifficulty.get(skillDifficultyKey(base.skillId, base.difficulty)),
      pool.bySkill.get(base.skillId),
      chapterId ? pool.byChapter.get(chapterId) : undefined,
    ]);
    if (!picked) continue;
    commit(pool, picked.item);
    return toSelected(picked.item, 'ANCHOR', SELECTION_REASON_CODES.PROGRESS_BACKFILL);
  }
  return null;
}

function backfillTrained(
  pool: ItemPool,
  trainedSkills: string[],
  masteryById: Map<string, MasteryState>,
): SelectedItem | null {
  for (const skillId of trainedSkills) {
    const target = difficultyForMastery(masteryById.get(skillId));
    const picked = pickWithFallback(pool, [
      pool.bySkillDifficulty.get(skillDifficultyKey(skillId, target)),
      pool.bySkill.get(skillId),
    ]);
    if (!picked) continue;
    commit(pool, picked.item);
    return toSelected(picked.item, 'TRAINED', SELECTION_REASON_CODES.PROGRESS_BACKFILL);
  }
  return null;
}

function backfillFresh(
  pool: ItemPool,
  trainedSet: Set<string>,
  masteryById: Map<string, MasteryState>,
): SelectedItem | null {
  const item =
    pickFresh(pool, pool.all, trainedSet, masteryById, MAX_ITEMS_PER_SKILL) ??
    pickFresh(pool, pool.all, trainedSet, masteryById, Number.POSITIVE_INFINITY);
  if (!item) return null;
  commit(pool, item);
  return toSelected(item, 'FRESH', SELECTION_REASON_CODES.PROGRESS_BACKFILL);
}

function toSelected(
  item: CandidateItem,
  role: SelectedItem['role'],
  reasonCode: string,
): SelectedItem {
  return {
    itemId: item.id,
    skillId: item.skillId,
    chapterId: item.chapterId,
    difficulty: item.difficulty,
    role,
    reasonCode,
  };
}
