import { describe, expect, it } from 'vitest';
import { DEFAULT_CONFIG } from '@/lib/config/defaults';
import {
  averageMastery,
  createInitialMastery,
  seedMasteryFromScore,
  updateMastery,
} from './mastery';
import type { AttemptEvent, MasteryState, SkillBreakdown, SkillNode } from './types';

const config = DEFAULT_CONFIG.recommendation;
const ANSWERED_AT = new Date('2026-03-10T08:00:00.000Z');

/** Câu chuẩn 60 giây → timeMs quy đổi trực tiếp ra hệ số thời gian. */
const STANDARD_SECONDS = 60;

function attempt(overrides: Partial<AttemptEvent> = {}): AttemptEvent {
  return {
    isCorrect: true,
    timeMs: 45_000,
    estimatedTimeSeconds: STANDARD_SECONDS,
    difficulty: 'AVERAGE',
    hintUsed: false,
    solutionViewedBeforeAnswer: false,
    answeredAt: ANSWERED_AT,
    ...overrides,
  };
}

function state(overrides: Partial<MasteryState> = {}): MasteryState {
  return { ...createInitialMastery('skill-1'), ...overrides };
}

function skill(id: string, blueprintWeight: number): SkillNode {
  return {
    id,
    code: id.toUpperCase(),
    name: `Kỹ năng ${id}`,
    chapterId: 'chuong-1',
    chapterName: 'Chương 1',
    blueprintWeight,
    order: 1,
    prerequisiteIds: [],
  };
}

describe('createInitialMastery', () => {
  it('tạo hồ sơ rỗng cho skill chưa có dữ liệu', () => {
    const initial = createInitialMastery('skill-x');
    expect(initial).toEqual({
      skillId: 'skill-x',
      masteryScore: 0,
      confidence: 0,
      attemptCount: 0,
      correctCount: 0,
      recentAccuracy: 0,
      recentResults: [],
      avgTimeRatio: 0,
      consecutiveCorrect: 0,
      consecutiveWrong: 0,
      difficultyCeiling: 0,
      lastPracticedAt: null,
      errorCounts: {},
    });
  });
});

describe('updateMastery', () => {
  it('đúng nhanh tăng nhiều hơn đúng chậm', () => {
    const prev = state({ masteryScore: 40, attemptCount: 4 });

    const nhanh = updateMastery(prev, attempt({ timeMs: 30_000 }), config);
    const cham = updateMastery(prev, attempt({ timeMs: 150_000 }), config);

    expect(nhanh.delta).toBeGreaterThan(0);
    expect(cham.delta).toBeGreaterThan(0);
    expect(nhanh.delta).toBeGreaterThan(cham.delta);
    expect(nhanh.partialCredit).toBe(false);
    expect(cham.partialCredit).toBe(true);
  });

  it('đúng nhờ gợi ý hoặc lời giải chỉ được tăng rất ít', () => {
    const prev = state({ masteryScore: 40, attemptCount: 3, consecutiveCorrect: 5 });

    const tuLam = updateMastery(prev, attempt({ difficulty: 'EXCELLENT' }), config);
    const xemLoiGiai = updateMastery(
      prev,
      attempt({ difficulty: 'EXCELLENT', solutionViewedBeforeAnswer: true }),
      config,
    );
    const dungGoiY = updateMastery(prev, attempt({ difficulty: 'EXCELLENT', hintUsed: true }), config);

    expect(xemLoiGiai.partialCredit).toBe(true);
    expect(dungGoiY.partialCredit).toBe(true);
    expect(tuLam.partialCredit).toBe(false);
    expect(xemLoiGiai.delta).toBeGreaterThan(0);
    expect(xemLoiGiai.delta).toBeLessThan(dungGoiY.delta);
    expect(dungGoiY.delta).toBeLessThan(tuLam.delta);

    // Trần độ khó không được mở nhờ trợ giúp
    expect(xemLoiGiai.next.difficultyCeiling).toBe(0);
    expect(dungGoiY.next.difficultyCeiling).toBe(0);
    expect(tuLam.next.difficultyCeiling).toBe(3);
  });

  it('xem lời giải trước khi trả lời không được đẩy skill lên mức đã vững', () => {
    // Sát ngưỡng masteredThreshold: nếu không chặn thì một câu là vượt
    const prev = state({ masteryScore: config.masteredThreshold - 0.1, attemptCount: 3 });

    const xemLoiGiai = updateMastery(
      prev,
      attempt({ difficulty: 'EXCELLENT', solutionViewedBeforeAnswer: true }),
      config,
    );
    const dungGoiY = updateMastery(prev, attempt({ difficulty: 'EXCELLENT', hintUsed: true }), config);
    const tuLam = updateMastery(prev, attempt({ difficulty: 'EXCELLENT' }), config);

    expect(xemLoiGiai.next.masteryScore).toBeLessThan(config.masteredThreshold);
    expect(dungGoiY.next.masteryScore).toBeLessThan(config.masteredThreshold);
    // Tự làm được thì vẫn phải công nhận
    expect(tuLam.next.masteryScore).toBeGreaterThanOrEqual(config.masteredThreshold);
  });

  it('sai liên tiếp kéo mastery xuống và tăng consecutiveWrong', () => {
    let current = state({ masteryScore: 60, attemptCount: 6 });
    const start = current.masteryScore;

    for (let i = 0; i < 3; i++) {
      const update = updateMastery(current, attempt({ isCorrect: false }), config);
      expect(update.delta).toBeLessThan(0);
      current = update.next;
    }

    expect(current.masteryScore).toBeLessThan(start);
    expect(current.consecutiveWrong).toBe(3);
    expect(current.consecutiveCorrect).toBe(0);
  });

  it('sai câu dễ bị trừ nhiều hơn sai câu khó', () => {
    const prev = state({ masteryScore: 55, attemptCount: 6 });
    const saiDe = updateMastery(prev, attempt({ isCorrect: false, difficulty: 'AVERAGE' }), config);
    const saiKho = updateMastery(
      prev,
      attempt({ isCorrect: false, difficulty: 'EXCELLENT' }),
      config,
    );
    expect(saiDe.delta).toBeLessThan(saiKho.delta);
  });

  it('mastery luôn nằm trong [0, 100]', () => {
    let cao = state({ masteryScore: 98, attemptCount: 2 });
    for (let i = 0; i < 60; i++) {
      cao = updateMastery(cao, attempt({ difficulty: 'EXCELLENT', timeMs: 20_000 }), config).next;
      expect(cao.masteryScore).toBeLessThanOrEqual(100);
      expect(cao.masteryScore).toBeGreaterThanOrEqual(0);
    }

    let thap = state({ masteryScore: 3, attemptCount: 2 });
    for (let i = 0; i < 60; i++) {
      thap = updateMastery(thap, attempt({ isCorrect: false }), config).next;
      expect(thap.masteryScore).toBeGreaterThanOrEqual(0);
      expect(thap.masteryScore).toBeLessThanOrEqual(100);
    }
  });

  it('biên độ thay đổi nhỏ dần khi attemptCount lớn', () => {
    const itDuLieu = state({ masteryScore: 50, attemptCount: 1 });
    const nhieuDuLieu = state({ masteryScore: 50, attemptCount: 40 });

    const dungIt = updateMastery(itDuLieu, attempt(), config);
    const dungNhieu = updateMastery(nhieuDuLieu, attempt(), config);
    expect(Math.abs(dungNhieu.delta)).toBeLessThan(Math.abs(dungIt.delta));

    const saiIt = updateMastery(itDuLieu, attempt({ isCorrect: false }), config);
    const saiNhieu = updateMastery(nhieuDuLieu, attempt({ isCorrect: false }), config);
    expect(Math.abs(saiNhieu.delta)).toBeLessThan(Math.abs(saiIt.delta));
  });

  it('giữ cửa sổ trượt tối đa 10 kết quả và cập nhật recentAccuracy', () => {
    let current = state();
    for (let i = 0; i < 14; i++) {
      current = updateMastery(current, attempt({ isCorrect: i % 2 === 0 }), config).next;
    }
    expect(current.attemptCount).toBe(14);
    expect(current.recentResults).toHaveLength(10);
    expect(current.recentAccuracy).toBeCloseTo(0.5, 5);
  });

  it('confidence tăng dần theo số lượt và bị trừ khi kết quả dao động', () => {
    let onDinh = state();
    let daoDong = state();
    for (let i = 0; i < 12; i++) {
      onDinh = updateMastery(onDinh, attempt(), config).next;
      daoDong = updateMastery(daoDong, attempt({ isCorrect: i % 2 === 0 }), config).next;
    }
    const motLuot = updateMastery(state(), attempt(), config).next;

    expect(onDinh.confidence).toBeGreaterThan(motLuot.confidence);
    expect(onDinh.confidence).toBeLessThanOrEqual(1);
    expect(daoDong.confidence).toBeLessThan(onDinh.confidence);
  });

  it('cập nhật avgTimeRatio theo trung bình trượt', () => {
    const buoc1 = updateMastery(state(), attempt({ timeMs: 60_000 }), config).next;
    expect(buoc1.avgTimeRatio).toBeCloseTo(1, 5);

    const buoc2 = updateMastery(buoc1, attempt({ timeMs: 120_000 }), config).next;
    expect(buoc2.avgTimeRatio).toBeCloseTo(1.5, 5);
  });

  it('suy ra đúng loại lỗi theo hành vi làm bài', () => {
    const prev = state({ masteryScore: 40, attemptCount: 5 });

    expect(updateMastery(prev, attempt({ isCorrect: false, timeMs: 200_000 }), config).errorPattern).toBe(
      'TIMEOUT',
    );
    expect(updateMastery(prev, attempt({ isCorrect: false, timeMs: 6_000 }), config).errorPattern).toBe(
      'CARELESS',
    );
    expect(
      updateMastery(
        prev,
        attempt({ isCorrect: false, timeMs: 60_000, difficulty: 'EXCELLENT' }),
        config,
      ).errorPattern,
    ).toBe('REASONING');
    expect(
      updateMastery(prev, attempt({ isCorrect: false, timeMs: 60_000 }), config).errorPattern,
    ).toBe('KNOWLEDGE');
    expect(updateMastery(prev, attempt(), config).errorPattern).toBeNull();
  });

  it('chỉ cộng dồn errorCounts cho câu trả lời sai', () => {
    let current = state({ masteryScore: 40, attemptCount: 5 });
    current = updateMastery(current, attempt({ isCorrect: false, timeMs: 60_000 }), config).next;
    current = updateMastery(current, attempt({ isCorrect: false, timeMs: 60_000 }), config).next;
    current = updateMastery(current, attempt({ timeMs: 200_000 }), config).next;

    expect(current.errorCounts).toEqual({ KNOWLEDGE: 2 });
  });

  it('mở trần độ khó khi đúng đủ số lần liên tiếp với tốc độ tốt', () => {
    let current = state({ masteryScore: 50, attemptCount: 5 });
    for (let i = 0; i < config.difficultyUp.consecutiveCorrect - 1; i++) {
      current = updateMastery(current, attempt({ difficulty: 'GOOD', timeMs: 30_000 }), config).next;
      expect(current.difficultyCeiling).toBe(0);
    }
    current = updateMastery(current, attempt({ difficulty: 'GOOD', timeMs: 30_000 }), config).next;
    expect(current.difficultyCeiling).toBe(2);

    // Sai một câu không được hạ trần đã chứng minh
    current = updateMastery(current, attempt({ isCorrect: false }), config).next;
    expect(current.difficultyCeiling).toBe(2);
  });

  it('không vỡ khi câu hỏi thiếu thời gian chuẩn', () => {
    const update = updateMastery(state(), attempt({ estimatedTimeSeconds: 0 }), config);
    expect(Number.isFinite(update.next.masteryScore)).toBe(true);
    expect(update.next.avgTimeRatio).toBe(1);
  });
});

describe('seedMasteryFromScore', () => {
  const breakdowns: SkillBreakdown[] = [
    {
      skillId: 'skill-a',
      correct: 3,
      total: 4,
      accuracy: 0.75,
      estimatedMastery: 68,
      avgTimeRatio: 0.9,
    },
    {
      skillId: 'skill-b',
      correct: 0,
      total: 3,
      accuracy: 0,
      estimatedMastery: 12,
      avgTimeRatio: 1.7,
    },
  ];

  it('tạo bản ghi cho MỌI skill, kể cả skill không xuất hiện trong bài', () => {
    const seeded = seedMasteryFromScore(breakdowns, ['skill-a', 'skill-b', 'skill-c'], config);
    expect(seeded.map((item) => item.skillId)).toEqual(['skill-a', 'skill-b', 'skill-c']);

    const skillC = seeded.find((item) => item.skillId === 'skill-c')!;
    expect(skillC.confidence).toBe(0);
    expect(skillC.attemptCount).toBe(0);
    expect(skillC.masteryScore).toBe(0);
  });

  it('giữ confidence thấp vì bài 15 câu chỉ là baseline nhanh', () => {
    const seeded = seedMasteryFromScore(breakdowns, ['skill-a', 'skill-b'], config);
    const skillA = seeded.find((item) => item.skillId === 'skill-a')!;

    expect(skillA.masteryScore).toBe(68);
    expect(skillA.attemptCount).toBe(4);
    expect(skillA.correctCount).toBe(3);
    expect(skillA.recentAccuracy).toBeCloseTo(0.75, 5);
    expect(skillA.confidence).toBeGreaterThan(0);
    expect(skillA.confidence).toBeLessThan(DEFAULT_CONFIG.levels.minConfidenceForLevelChange);
  });

  it('bổ sung skill chỉ có trong breakdowns và không nhân đôi bản ghi', () => {
    const seeded = seedMasteryFromScore(breakdowns, ['skill-a'], config);
    expect(seeded.map((item) => item.skillId)).toEqual(['skill-a', 'skill-b']);
  });
});

describe('averageMastery', () => {
  it('tính trung bình có trọng số theo blueprintWeight', () => {
    const skills = [skill('a', 3), skill('b', 1)];
    const masteries = [
      { ...createInitialMastery('a'), masteryScore: 40 },
      { ...createInitialMastery('b'), masteryScore: 80 },
    ];

    // (3*40 + 1*80) / 4 = 50
    expect(averageMastery(masteries, skills)).toBeCloseTo(50, 5);
  });

  it('tính skill chưa có hồ sơ là 0 điểm', () => {
    const skills = [skill('a', 1), skill('b', 1)];
    const masteries = [{ ...createInitialMastery('a'), masteryScore: 60 }];
    expect(averageMastery(masteries, skills)).toBeCloseTo(30, 5);
  });

  it('không chia cho 0 khi thiếu dữ liệu', () => {
    expect(averageMastery([], [])).toBe(0);
    expect(averageMastery([{ ...createInitialMastery('a'), masteryScore: 50 }], [])).toBe(50);
    expect(averageMastery([{ ...createInitialMastery('a'), masteryScore: 50 }], [skill('a', 0)])).toBe(
      50,
    );
  });
});
