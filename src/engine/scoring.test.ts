import { describe, expect, it } from 'vitest';
import type { Difficulty } from '@prisma/client';
import { DEFAULT_CONFIG } from '@/lib/config/defaults';
import { DIFFICULTY_WEIGHT } from '@/lib/domain';
import { estimateLevel, scoreAttempt } from './scoring';
import type { ScoredAttemptItem } from './types';

const LEVELS = DEFAULT_CONFIG.levels;

function item(
  id: string,
  skillId: string,
  difficulty: Difficulty,
  isCorrect: boolean,
  timeRatio = 1,
): ScoredAttemptItem {
  const estimatedTimeSeconds = 60;
  return {
    itemId: id,
    skillId,
    chapterId: skillId.split('-')[0] ?? 'C1',
    difficulty,
    isCorrect,
    timeMs: Math.round(estimatedTimeSeconds * timeRatio * 1000),
    estimatedTimeSeconds,
  };
}

describe('scoreAttempt', () => {
  it('chấm theo trọng số độ khó chứ không phải số câu đúng', () => {
    const items = [
      item('i1', 'C1-S1', 'AVERAGE', true),
      item('i2', 'C1-S1', 'GOOD', false),
      item('i3', 'C2-S1', 'EXCELLENT', true),
    ];
    const result = scoreAttempt(items, LEVELS);

    const weightedMax =
      DIFFICULTY_WEIGHT.AVERAGE + DIFFICULTY_WEIGHT.GOOD + DIFFICULTY_WEIGHT.EXCELLENT;
    expect(result.rawScore).toBe(2);
    expect(result.maxScore).toBe(3);
    expect(result.weightedMax).toBeCloseTo(weightedMax, 3);
    expect(result.weightedScore).toBeCloseTo(
      DIFFICULTY_WEIGHT.AVERAGE + DIFFICULTY_WEIGHT.EXCELLENT,
      3,
    );
    expect(result.percent).toBeCloseTo(
      ((DIFFICULTY_WEIGHT.AVERAGE + DIFFICULTY_WEIGHT.EXCELLENT) / weightedMax) * 100,
      1,
    );
    expect(result.percent).toBeGreaterThanOrEqual(0);
    expect(result.percent).toBeLessThanOrEqual(100);
  });

  it('đúng câu khó cho mastery cao hơn đúng câu dễ', () => {
    const hard = scoreAttempt(
      [item('i1', 'C1-S1', 'AVERAGE', false), item('i2', 'C1-S1', 'EXCELLENT', true)],
      LEVELS,
    );
    const easy = scoreAttempt(
      [item('i1', 'C1-S1', 'AVERAGE', true), item('i2', 'C1-S1', 'EXCELLENT', false)],
      LEVELS,
    );

    expect(hard.rawScore).toBe(easy.rawScore);
    expect(hard.percent).toBeGreaterThan(easy.percent);
    expect(hard.bySkill[0].estimatedMastery).toBeGreaterThan(easy.bySkill[0].estimatedMastery);
  });

  it('cùng số câu đúng nhưng sai ở kỹ năng khác nhau thì hồ sơ khác nhau', () => {
    const base: [string, string, Difficulty][] = [
      ['i1', 'C1-S1', 'AVERAGE'],
      ['i2', 'C1-S1', 'GOOD'],
      ['i3', 'C2-S2', 'AVERAGE'],
      ['i4', 'C2-S2', 'GOOD'],
    ];
    const studentA = scoreAttempt(
      base.map(([id, skill, diff], index) => item(id, skill, diff, index >= 2)),
      LEVELS,
    );
    const studentB = scoreAttempt(
      base.map(([id, skill, diff], index) => item(id, skill, diff, index < 2)),
      LEVELS,
    );

    expect(studentA.rawScore).toBe(studentB.rawScore);
    expect(studentA.percent).toBeCloseTo(studentB.percent, 5);
    expect(studentA.bySkill).not.toEqual(studentB.bySkill);
    expect(studentA.weakestSkillIds[0]).toBe('C1-S1');
    expect(studentB.weakestSkillIds[0]).toBe('C2-S2');
    expect(studentA.strongestSkillIds[0]).toBe('C2-S2');
  });

  it('làm quá chậm bị phạt mastery dù vẫn đúng', () => {
    const fast = scoreAttempt([item('i1', 'C1-S1', 'GOOD', true, 1)], LEVELS);
    const slow = scoreAttempt([item('i1', 'C1-S1', 'GOOD', true, 4)], LEVELS);

    expect(slow.percent).toBeCloseTo(fast.percent, 5);
    expect(slow.avgTimeRatio).toBeGreaterThan(fast.avgTimeRatio);
    expect(slow.bySkill[0].estimatedMastery).toBeLessThan(fast.bySkill[0].estimatedMastery);
  });

  it('gộp đúng theo chương và giữ percent trong [0,100]', () => {
    const allWrong = scoreAttempt(
      [item('i1', 'C1-S1', 'AVERAGE', false), item('i2', 'C2-S1', 'GOOD', false)],
      LEVELS,
    );
    const allRight = scoreAttempt(
      [item('i1', 'C1-S1', 'AVERAGE', true), item('i2', 'C2-S1', 'GOOD', true)],
      LEVELS,
    );

    expect(allWrong.percent).toBe(0);
    expect(allRight.percent).toBe(100);
    expect(allRight.byChapter).toHaveLength(2);
    expect(allRight.byChapter[0]).toMatchObject({ chapterId: 'C1', correct: 1, total: 1 });
    expect(allWrong.byChapter[0].accuracy).toBe(0);
  });

  it('bài rỗng không làm sập engine', () => {
    const result = scoreAttempt([], LEVELS);
    expect(result.rawScore).toBe(0);
    expect(result.percent).toBe(0);
    expect(result.estimatedLevel).toBe('WEAK');
    expect(result.bySkill).toEqual([]);
    expect(result.weakestSkillIds).toEqual([]);
  });
});

describe('estimateLevel', () => {
  it('quy đổi theo ngưỡng cấu hình, không dùng số cứng', () => {
    expect(estimateLevel(0, LEVELS)).toBe('WEAK');
    expect(estimateLevel(LEVELS.scoreThresholds.AVERAGE - 0.1, LEVELS)).toBe('WEAK');
    expect(estimateLevel(LEVELS.scoreThresholds.AVERAGE, LEVELS)).toBe('AVERAGE');
    expect(estimateLevel(LEVELS.scoreThresholds.GOOD, LEVELS)).toBe('GOOD');
    expect(estimateLevel(LEVELS.scoreThresholds.EXCELLENT, LEVELS)).toBe('EXCELLENT');
    expect(estimateLevel(100, LEVELS)).toBe('EXCELLENT');
  });

  it('đổi ngưỡng trong cấu hình thì kết quả đổi theo', () => {
    const strict = {
      ...LEVELS,
      scoreThresholds: { WEAK: 0, AVERAGE: 60, GOOD: 80, EXCELLENT: 95 },
    };
    expect(estimateLevel(70, LEVELS)).toBe('GOOD');
    expect(estimateLevel(70, strict)).toBe('AVERAGE');
  });
});
