import { describe, expect, it } from 'vitest';
import { DEFAULT_CONFIG } from '@/lib/config/defaults';
import { buildDayPlan } from './day-plan';
import type {
  CandidateItem,
  DayPlanRequest,
  GapScore,
  MasteryState,
  SkillNode,
} from './types';
import type { Difficulty } from '@prisma/client';

const CONFIG = DEFAULT_CONFIG.recommendation;
const NOW = new Date('2026-03-10T08:00:00.000Z');

// ---------------------------------------------------------------------------
// Trợ giúp dựng dữ liệu
// ---------------------------------------------------------------------------

function skill(id: string, overrides: Partial<SkillNode> = {}): SkillNode {
  return {
    id,
    code: id.toUpperCase(),
    name: `Kỹ năng ${id}`,
    chapterId: 'ch1',
    chapterName: 'Chương 1',
    blueprintWeight: 1,
    order: 1,
    prerequisiteIds: [],
    ...overrides,
  };
}

function mastery(skillId: string, overrides: Partial<MasteryState> = {}): MasteryState {
  return {
    skillId,
    masteryScore: 50,
    confidence: 0.6,
    attemptCount: 10,
    correctCount: 5,
    recentAccuracy: 0.5,
    recentResults: [1, 0, 1, 0],
    avgTimeRatio: 1,
    consecutiveCorrect: 0,
    consecutiveWrong: 0,
    difficultyCeiling: 1,
    lastPracticedAt: new Date('2026-03-09T08:00:00.000Z'),
    errorCounts: {},
    ...overrides,
  };
}

function gap(skillId: string, priority: number, overrides: Partial<GapScore> = {}): GapScore {
  return {
    skillId,
    priority,
    factors: { deficit: 0.5, blueprint: 1, examProximity: 1, repeatError: 1, prerequisite: 1 },
    masteryScore: 40,
    targetMastery: 65,
    blockedBySkillIds: [],
    reason: 'Thiếu hụt so với mục tiêu',
    ...overrides,
  };
}

function item(
  id: string,
  skillId: string,
  difficulty: Difficulty,
  overrides: Partial<CandidateItem> = {},
): CandidateItem {
  return {
    id,
    skillId,
    chapterId: 'ch1',
    difficulty,
    difficultyNumeric: difficulty === 'AVERAGE' ? 1 : difficulty === 'GOOD' ? 2 : 3,
    estimatedTime: 120,
    tags: [],
    lastServedAt: null,
    timesServedToStudent: 0,
    ...overrides,
  };
}

/** Sinh N câu cho một skill, đủ mọi bậc độ khó để không vướng ràng buộc. */
function poolFor(skillId: string, count: number, prefix = ''): CandidateItem[] {
  const difficulties: Difficulty[] = ['AVERAGE', 'GOOD', 'EXCELLENT'];
  return Array.from({ length: count }, (_, i) =>
    item(`${prefix}${skillId}-i${i}`, skillId, difficulties[i % 3]!),
  );
}

function baseRequest(overrides: Partial<DayPlanRequest> = {}): DayPlanRequest {
  const skills = ['s1', 's2', 's3', 's4', 's5'].map((id, idx) =>
    skill(id, { order: idx + 1, chapterId: idx < 3 ? 'ch1' : 'ch2' }),
  );
  return {
    skills,
    masteries: skills.map((s) => mastery(s.id)),
    gaps: [gap('s1', 9), gap('s2', 7), gap('s3', 5), gap('s4', 3), gap('s5', 1)],
    candidates: skills.flatMap((s) => poolFor(s.id, 12)),
    minutesBudget: 45,
    coreChapterIds: ['ch1'],
    recentSkillIds: ['s2', 's3'],
    now: NOW,
    config: CONFIG,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------

describe('buildDayPlan — ngân sách và trần tải', () => {
  it('không vượt quỹ phút/ngày và nằm trong khoảng số câu cấu hình', () => {
    const result = buildDayPlan(baseRequest({ minutesBudget: 45 }));

    expect(result.items.length).toBeGreaterThanOrEqual(CONFIG.minItemsPerDay);
    expect(result.items.length).toBeLessThanOrEqual(CONFIG.maxItemsPerDay);
    expect(result.estimatedMinutes).toBeLessThanOrEqual(45);
    expect(result.estimatedMinutes).toBeLessThanOrEqual(CONFIG.maxMinutesPerDay);

    const seconds = result.items.reduce((sum, i) => sum + i.estimatedTime, 0);
    expect(result.estimatedMinutes).toBe(Math.round(seconds / 60));
  });

  it('loadFactor giảm tải thì số phút kế hoạch giảm theo', () => {
    const full = buildDayPlan(baseRequest({ minutesBudget: 60 }));
    const reduced = buildDayPlan(
      baseRequest({ minutesBudget: 60, loadFactor: CONFIG.teacherLoadFactor.REDUCE_LOAD }),
    );

    expect(reduced.estimatedMinutes).toBeLessThan(full.estimatedMinutes);
    expect(reduced.estimatedMinutes).toBeLessThanOrEqual(60 * CONFIG.teacherLoadFactor.REDUCE_LOAD);
  });

  it('không vượt trần maxMinutesPerDay dù quỹ thời gian khai quá lớn', () => {
    const result = buildDayPlan(
      baseRequest({ minutesBudget: 600, candidates: ['s1', 's2', 's3', 's4', 's5'].flatMap((s) => poolFor(s, 40)) }),
    );
    expect(result.estimatedMinutes).toBeLessThanOrEqual(CONFIG.maxMinutesPerDay);
    expect(result.items.length).toBeLessThanOrEqual(CONFIG.maxItemsPerDay);
  });

  it('tổng blockCounts khớp số câu đã giao và luôn đủ 5 khóa', () => {
    const result = buildDayPlan(baseRequest());
    const total = Object.values(result.blockCounts).reduce((a, b) => a + b, 0);
    expect(total).toBe(result.items.length);
    expect(Object.keys(result.blockCounts).sort()).toEqual(
      ['CHALLENGE', 'CORE', 'REPAIR', 'REVIEW', 'WARMUP'].sort(),
    );
  });
});

describe('buildDayPlan — chống lặp (specs §7.5)', () => {
  it('không giao trùng itemId trong cùng một ngày', () => {
    const result = buildDayPlan(baseRequest({ minutesBudget: 90 }));
    const ids = result.items.map((i) => i.itemId);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('loại câu còn trong thời gian cooldown khi vẫn còn câu mới', () => {
    const recent = new Date(NOW.getTime() - 2 * 86_400_000);
    const cooled = poolFor('s1', 6).map((i) => ({ ...i, lastServedAt: recent, timesServedToStudent: 1 }));
    const freshOther = ['s2', 's3', 's4', 's5'].flatMap((s) => poolFor(s, 12));

    const result = buildDayPlan(
      baseRequest({ candidates: [...cooled, ...freshOther], minutesBudget: 30 }),
    );

    const cooledIds = new Set(cooled.map((i) => i.id));
    expect(result.items.some((i) => cooledIds.has(i.itemId))).toBe(false);
  });

  it('vẫn tôn trọng cooldown khi ranh giới đúng bằng itemCooldownDays', () => {
    const justInside = new Date(NOW.getTime() - (CONFIG.itemCooldownDays - 1) * 86_400_000);
    const justOutside = new Date(NOW.getTime() - (CONFIG.itemCooldownDays + 1) * 86_400_000);
    const candidates = [
      item('blocked', 's1', 'AVERAGE', { lastServedAt: justInside }),
      ...poolFor('s1', 8).map((i) => ({ ...i, lastServedAt: justOutside })),
      ...['s2', 's3'].flatMap((s) => poolFor(s, 8)),
    ];

    const result = buildDayPlan(baseRequest({ candidates, minutesBudget: 30 }));
    expect(result.items.some((i) => i.itemId === 'blocked')).toBe(false);
  });

  it('kho cạn thì dùng lại câu trong cooldown, ưu tiên câu ít gặp nhất và cảnh báo', () => {
    const recent = new Date(NOW.getTime() - 1 * 86_400_000);
    const candidates: CandidateItem[] = [
      item('c-hot', 's1', 'AVERAGE', { lastServedAt: recent, timesServedToStudent: 9 }),
      item('c-cold', 's1', 'AVERAGE', { lastServedAt: recent, timesServedToStudent: 1 }),
      item('c-mid', 's1', 'AVERAGE', { lastServedAt: recent, timesServedToStudent: 4 }),
    ];

    const result = buildDayPlan(
      baseRequest({
        skills: [skill('s1')],
        masteries: [mastery('s1')],
        gaps: [gap('s1', 9)],
        candidates,
        recentSkillIds: [],
        minutesBudget: 30,
      }),
    );

    expect(result.items.length).toBeGreaterThan(0);
    expect(result.items[0]!.itemId).toBe('c-cold');
    expect(result.warnings.some((w) => w.includes('thời gian nghỉ'))).toBe(true);
  });
});

describe('buildDayPlan — luật chọn nguồn từng block', () => {
  it('skill bị chặn bởi tiên quyết thì giao câu của skill tiên quyết trước', () => {
    const skills = [
      skill('advanced', { order: 2, prerequisiteIds: ['basic'] }),
      skill('basic', { order: 1 }),
    ];
    const req = baseRequest({
      skills,
      masteries: [
        mastery('advanced', { masteryScore: 20, difficultyCeiling: 1 }),
        mastery('basic', { masteryScore: 25, difficultyCeiling: 1 }),
      ],
      gaps: [gap('advanced', 20, { blockedBySkillIds: ['basic'] }), gap('basic', 4)],
      candidates: [...poolFor('advanced', 10), ...poolFor('basic', 10)],
      coreChapterIds: [],
      recentSkillIds: [],
      minutesBudget: 30,
    });

    const result = buildDayPlan(req);
    const repair = result.items.filter((i) => i.block === 'REPAIR');

    expect(repair.length).toBeGreaterThan(0);
    expect(repair[0]!.skillId).toBe('basic');
    expect(repair[0]!.reasonCode).toBe('REPAIR_PREREQUISITE_FIRST');
    expect(repair[0]!.reasonData.blockedSkillId).toBe('advanced');

    // Câu tiên quyết vẫn mang điểm ưu tiên của lỗ hổng bị chặn để lưu Recommendation.
    expect(repair[0]!.gapPriority).toBe(20);
    expect(repair[0]!.reasonData.gapPriority).toBe(20);

    const firstBasic = result.items.findIndex((i) => i.skillId === 'basic');
    const firstAdvanced = result.items.findIndex((i) => i.skillId === 'advanced');
    if (firstAdvanced >= 0) expect(firstBasic).toBeLessThan(firstAdvanced);
  });

  it('block CHALLENGE không xuất hiện khi mastery còn thấp', () => {
    const req = baseRequest({
      masteries: ['s1', 's2', 's3', 's4', 's5'].map((id) =>
        mastery(id, { masteryScore: 30, difficultyCeiling: 1 }),
      ),
      minutesBudget: 90,
    });

    const result = buildDayPlan(req);
    expect(result.blockCounts.CHALLENGE).toBe(0);
    expect(result.items.some((i) => i.block === 'CHALLENGE')).toBe(false);
    expect(result.warnings.some((w) => w.includes('Thử thách'))).toBe(true);
  });

  it('block CHALLENGE mở khi mastery vượt ngưỡng và dùng câu khó hơn một bậc', () => {
    const strong = mastery('s1', {
      masteryScore: CONFIG.challengeUnlockMastery + 5,
      difficultyCeiling: 2,
      attemptCount: 30,
    });
    const req = baseRequest({
      masteries: [strong, ...['s2', 's3', 's4', 's5'].map((id) => mastery(id))],
      minutesBudget: 90,
    });

    const result = buildDayPlan(req);
    const challenge = result.items.filter((i) => i.block === 'CHALLENGE');

    expect(challenge.length).toBeGreaterThan(0);
    expect(challenge.every((i) => i.skillId === 's1')).toBe(true);
    expect(challenge.every((i) => i.difficulty === 'EXCELLENT')).toBe(true);
    expect(challenge[0]!.reasonCode).toBe('CHALLENGE_MASTERY_UNLOCKED');
  });

  it('block CORE chỉ lấy skill thuộc chương trọng tâm tuần', () => {
    const result = buildDayPlan(baseRequest({ coreChapterIds: ['ch2'], minutesBudget: 90 }));
    const core = result.items.filter((i) => i.block === 'CORE');
    expect(core.length).toBeGreaterThan(0);
    expect(core.every((i) => ['s4', 's5'].includes(i.skillId))).toBe(true);
    expect(core.every((i) => i.reasonCode === 'CORE_WEEKLY_FOCUS_CHAPTER')).toBe(true);
  });

  it('block WARMUP chỉ lấy skill vừa học và không dùng câu khó hơn mức đã vững', () => {
    const result = buildDayPlan(baseRequest({ recentSkillIds: ['s3'], minutesBudget: 30 }));
    const warmup = result.items.filter((i) => i.block === 'WARMUP');
    expect(warmup.length).toBeGreaterThan(0);
    expect(warmup.every((i) => i.skillId === 's3')).toBe(true);
    expect(warmup.every((i) => i.difficulty === 'AVERAGE')).toBe(true);
    expect(warmup.every((i) => i.reasonCode === 'WARMUP_RECENT_SKILL')).toBe(true);
  });

  it('skill không có câu đúng bậc độ khó thì vẫn giao câu gần nhất kèm cảnh báo', () => {
    const req = baseRequest({
      skills: [skill('s1')],
      masteries: [mastery('s1', { masteryScore: 20, difficultyCeiling: 1 })],
      gaps: [gap('s1', 9)],
      // Kho chỉ có câu Giỏi trong khi học sinh cần câu Trung bình.
      candidates: Array.from({ length: 10 }, (_, i) => item(`hard-${i}`, 's1', 'EXCELLENT')),
      recentSkillIds: [],
      coreChapterIds: [],
      minutesBudget: 30,
    });

    const result = buildDayPlan(req);
    expect(result.items.length).toBeGreaterThan(0);
    expect(result.items.every((i) => i.difficulty === 'EXCELLENT')).toBe(true);
    expect(result.items.every((i) => i.reasonData.difficultyMismatch === true)).toBe(true);
    expect(result.warnings.some((w) => w.includes('độ khó'))).toBe(true);
  });

  it('block REVIEW ưu tiên skill đã vững nhưng lâu chưa luyện (spaced repetition)', () => {
    const stale = new Date(NOW.getTime() - (CONFIG.spacedRepetitionDays + 5) * 86_400_000);
    const req = baseRequest({
      masteries: [
        mastery('s1', { masteryScore: 30 }),
        mastery('s2', { masteryScore: 30 }),
        mastery('s3', { masteryScore: 30 }),
        mastery('s4', { masteryScore: 30 }),
        mastery('s5', {
          masteryScore: CONFIG.masteredThreshold + 5,
          difficultyCeiling: 2,
          lastPracticedAt: stale,
        }),
      ],
      minutesBudget: 90,
    });

    const result = buildDayPlan(req);
    const review = result.items.filter((i) => i.block === 'REVIEW');
    expect(review.length).toBeGreaterThan(0);
    expect(review.every((i) => i.skillId === 's5')).toBe(true);
    expect(review[0]!.reasonCode).toBe('REVIEW_SPACED_REPETITION');
    expect(review[0]!.reasonData.daysSinceLastPractice).toBe(CONFIG.spacedRepetitionDays + 5);
  });
});

describe('buildDayPlan — cân bằng nội dung (specs §7.3)', () => {
  it('không vượt số skill tối đa mỗi ngày dù có rất nhiều lỗ hổng', () => {
    const ids = Array.from({ length: 20 }, (_, i) => `k${i}`);
    const skills = ids.map((id, idx) => skill(id, { order: idx + 1 }));
    const req = baseRequest({
      skills,
      masteries: ids.map((id) => mastery(id, { masteryScore: 20 })),
      gaps: ids.map((id, idx) => gap(id, 20 - idx)),
      candidates: ids.flatMap((id) => poolFor(id, 6)),
      coreChapterIds: ['ch1'],
      recentSkillIds: [],
      minutesBudget: 90,
    });

    const result = buildDayPlan(req);
    const distinct = new Set(result.items.map((i) => i.skillId));
    expect(distinct.size).toBeLessThanOrEqual(CONFIG.maxSkillsPerDay);
  });

  it('vẫn còn suất cho CORE và REVIEW khi có nhiều lỗ hổng nặng', () => {
    const stale = new Date(NOW.getTime() - (CONFIG.spacedRepetitionDays + 3) * 86_400_000);
    const ids = ['g1', 'g2', 'g3', 'g4', 'g5', 'g6'];
    const skills = [
      ...ids.map((id, idx) => skill(id, { order: idx + 1, chapterId: 'chGap' })),
      skill('core1', { order: 10, chapterId: 'chCore' }),
      skill('rev1', { order: 11, chapterId: 'chOld' }),
    ];
    const req = baseRequest({
      skills,
      masteries: [
        ...ids.map((id) => mastery(id, { masteryScore: 15 })),
        mastery('core1', { masteryScore: 40 }),
        mastery('rev1', {
          masteryScore: CONFIG.masteredThreshold + 8,
          difficultyCeiling: 2,
          lastPracticedAt: stale,
        }),
      ],
      gaps: ids.map((id, idx) => gap(id, 50 - idx)),
      candidates: [...ids, 'core1', 'rev1'].flatMap((id) => poolFor(id, 8)),
      coreChapterIds: ['chCore'],
      recentSkillIds: [],
      minutesBudget: 90,
    });

    const result = buildDayPlan(req);
    expect(result.blockCounts.REPAIR).toBeGreaterThan(0);
    expect(result.blockCounts.CORE).toBeGreaterThan(0);
    expect(result.blockCounts.REVIEW).toBeGreaterThan(0);
    expect(result.items.some((i) => i.skillId === 'core1')).toBe(true);
    expect(result.items.some((i) => i.skillId === 'rev1')).toBe(true);
  });
});

describe('buildDayPlan — auditability (specs §7.8)', () => {
  it('mọi câu đều có reasonCode SNAKE_CASE và reasonData định lượng', () => {
    const result = buildDayPlan(baseRequest({ minutesBudget: 60 }));
    expect(result.items.length).toBeGreaterThan(0);

    for (const planned of result.items) {
      expect(planned.reasonCode).toMatch(/^[A-Z][A-Z0-9_]*$/);
      expect(planned.reasonData.block).toBe(planned.block);
      expect(planned.reasonData.skillId).toBe(planned.skillId);
      expect(planned.reasonData.difficulty).toBe(planned.difficulty);
      expect(typeof planned.reasonData.masteryScore).toBe('number');
      expect(planned.reasonData).toHaveProperty('gapPriority');
      expect(planned.reasonData).toHaveProperty('desiredDifficulty');
    }
  });

  it('order chạy liên tục từ 1 theo thứ tự học trong ngày', () => {
    const result = buildDayPlan(baseRequest({ minutesBudget: 60 }));
    expect(result.items.map((i) => i.order)).toEqual(
      result.items.map((_, idx) => idx + 1),
    );
  });
});

describe('buildDayPlan — trường hợp biên', () => {
  it('candidates rỗng thì trả kết quả rỗng kèm cảnh báo, không ném lỗi', () => {
    const result = buildDayPlan(baseRequest({ candidates: [] }));
    expect(result.items).toEqual([]);
    expect(result.estimatedMinutes).toBe(0);
    expect(result.warnings.length).toBeGreaterThan(0);
    expect(Object.values(result.blockCounts).every((c) => c === 0)).toBe(true);
  });

  it('kho quá ít câu thì cảnh báo thiếu thay vì im lặng cắt bớt', () => {
    const result = buildDayPlan(
      baseRequest({
        skills: [skill('s1')],
        masteries: [mastery('s1')],
        gaps: [gap('s1', 9)],
        candidates: [item('only-1', 's1', 'AVERAGE'), item('only-2', 's1', 'AVERAGE')],
        recentSkillIds: [],
        minutesBudget: 45,
      }),
    );

    expect(result.items.length).toBe(2);
    expect(result.warnings.length).toBeGreaterThan(0);
    expect(result.warnings.some((w) => w.includes('tối thiểu'))).toBe(true);
  });

  it('học sinh chưa có dữ liệu mastery vẫn sinh được kế hoạch bằng câu dễ nhất', () => {
    const result = buildDayPlan(
      baseRequest({
        masteries: [],
        gaps: [],
        recentSkillIds: [],
        coreChapterIds: ['ch1'],
        minutesBudget: 30,
      }),
    );

    const easy = result.items.filter((i) => i.difficulty === 'AVERAGE').length;
    expect(result.items.length).toBeGreaterThan(0);
    expect(result.items[0]!.difficulty).toBe('AVERAGE');
    // Chưa có dữ liệu → ưu tiên bậc dễ nhất, tuyệt đối không đẩy lên bậc Giỏi.
    expect(easy).toBeGreaterThan(result.items.length - easy);
    expect(result.items.every((i) => i.difficulty !== 'EXCELLENT')).toBe(true);
    expect(result.items.every((i) => i.reasonData.masteryScore === null)).toBe(true);
  });

  it('estimatedTime bằng 0 không gây chia cho 0', () => {
    const candidates = poolFor('s1', 10).map((i) => ({ ...i, estimatedTime: 0 }));
    const result = buildDayPlan(
      baseRequest({
        skills: [skill('s1')],
        masteries: [mastery('s1')],
        gaps: [gap('s1', 9)],
        candidates,
        recentSkillIds: [],
        minutesBudget: 45,
      }),
    );

    expect(Number.isFinite(result.estimatedMinutes)).toBe(true);
    expect(result.estimatedMinutes).toBe(0);
    expect(result.items.length).toBeGreaterThanOrEqual(CONFIG.minItemsPerDay);
  });
});

describe('buildDayPlan — tính tất định', () => {
  it('gọi hai lần với cùng input cho kết quả giống hệt', () => {
    const first = buildDayPlan(baseRequest({ minutesBudget: 60 }));
    const second = buildDayPlan(baseRequest({ minutesBudget: 60 }));
    expect(second).toEqual(first);
    expect(second.items.map((i) => i.itemId)).toEqual(first.items.map((i) => i.itemId));
  });

  it('vẫn tất định khi block REVIEW phải trộn nhiều skill cùng độ trễ', () => {
    const stale = new Date(NOW.getTime() - (CONFIG.spacedRepetitionDays + 2) * 86_400_000);
    const ids = ['r1', 'r2', 'r3', 'r4', 'r5'];
    const build = (): DayPlanRequest =>
      baseRequest({
        skills: ids.map((id, idx) => skill(id, { order: idx + 1 })),
        masteries: ids.map((id) =>
          mastery(id, {
            masteryScore: CONFIG.masteredThreshold + 5,
            difficultyCeiling: 2,
            lastPracticedAt: stale,
          }),
        ),
        gaps: [],
        candidates: ids.flatMap((id) => poolFor(id, 8)),
        recentSkillIds: [],
        coreChapterIds: [],
        minutesBudget: 60,
      });

    const a = buildDayPlan(build());
    const b = buildDayPlan(build());
    expect(b.items.map((i) => `${i.block}:${i.itemId}`)).toEqual(
      a.items.map((i) => `${i.block}:${i.itemId}`),
    );
  });
});
