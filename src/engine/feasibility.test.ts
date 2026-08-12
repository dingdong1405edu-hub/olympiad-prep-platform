import { describe, expect, it } from 'vitest';
import { DEFAULT_CONFIG } from '@/lib/config/defaults';
import { buildGoalOptions, checkGoalFeasibility } from './feasibility';
import type { MasteryState, SkillNode } from './types';

const CONFIG = DEFAULT_CONFIG.recommendation;
const LEVELS = DEFAULT_CONFIG.levels;

function makeSkills(count: number): SkillNode[] {
  return Array.from({ length: count }, (_, index) => ({
    id: `S${index + 1}`,
    code: `SK.${index + 1}`,
    name: `Kỹ năng ${index + 1}`,
    chapterId: `C${Math.floor(index / 5) + 1}`,
    chapterName: `Chương ${Math.floor(index / 5) + 1}`,
    blueprintWeight: 1 + (index % 3),
    order: index,
    prerequisiteIds: [],
  }));
}

function makeMasteries(skills: SkillNode[], score: number): MasteryState[] {
  return skills.map((skill) => ({
    skillId: skill.id,
    masteryScore: score,
    confidence: 0.5,
    attemptCount: 10,
    correctCount: 5,
    recentAccuracy: 0.5,
    recentResults: [1, 0, 1],
    avgTimeRatio: 1.2,
    consecutiveCorrect: 0,
    consecutiveWrong: 0,
    difficultyCeiling: 1,
    lastPracticedAt: null,
    errorCounts: {},
  }));
}

const skills = makeSkills(20);
const weakMasteries = makeMasteries(skills, 15);

describe('checkGoalFeasibility', () => {
  it('mục tiêu quá gấp thì INFEASIBLE kèm đề xuất cụ thể', () => {
    const result = checkGoalFeasibility({
      masteries: weakMasteries,
      skills,
      currentLevel: 'WEAK',
      targetLevel: 'GOOD',
      daysUntilDeadline: 14,
      daysPerWeek: 3,
      minutesPerDay: 30,
      levelConfig: LEVELS,
      config: CONFIG,
    });

    expect(result.status).toBe('INFEASIBLE');
    expect(result.ratio).toBeGreaterThan(CONFIG.infeasibleRatio);
    expect(result.requiredMinutes).toBeGreaterThan(result.availableMinutes);
    expect(result.skillsBelowTarget).toBe(skills.length);
    expect(result.suggestedExtraDays).toBeGreaterThan(0);
    expect(result.suggestedMinutesPerDay).toBeLessThanOrEqual(CONFIG.maxMinutesPerDay);
    expect(result.suggestedDaysPerWeek).toBeGreaterThanOrEqual(3);
    expect(result.suggestedDaysPerWeek).toBeLessThanOrEqual(7);
    expect(result.message).toContain('tuần');
    expect(result.message).toContain('phút/ngày');
  });

  it('nới thời gian thì mục tiêu trở nên khả thi', () => {
    const result = checkGoalFeasibility({
      masteries: weakMasteries,
      skills,
      currentLevel: 'WEAK',
      targetLevel: 'GOOD',
      daysUntilDeadline: 365,
      daysPerWeek: 6,
      minutesPerDay: 90,
      levelConfig: LEVELS,
      config: CONFIG,
    });

    expect(result.status).toBe('FEASIBLE');
    expect(result.ratio).toBeLessThanOrEqual(1);
    expect(result.suggestedExtraDays).toBe(0);
    expect(result.message).toContain('khả thi');
  });

  it('không còn ngày học nào thì ratio là vô cực và INFEASIBLE', () => {
    const result = checkGoalFeasibility({
      masteries: weakMasteries,
      skills,
      currentLevel: 'WEAK',
      targetLevel: 'EXCELLENT',
      daysUntilDeadline: 3,
      daysPerWeek: 5,
      minutesPerDay: 50,
      levelConfig: LEVELS,
      config: CONFIG,
    });

    expect(result.availableMinutes).toBe(0);
    expect(result.ratio).toBe(Number.POSITIVE_INFINITY);
    expect(result.status).toBe('INFEASIBLE');
    expect(result.suggestedExtraDays).toBeGreaterThan(0);
  });

  it('đã đạt ngưỡng mọi kỹ năng thì không cần thêm phút nào', () => {
    const strongMasteries = makeMasteries(skills, 95);
    const result = checkGoalFeasibility({
      masteries: strongMasteries,
      skills,
      currentLevel: 'GOOD',
      targetLevel: 'EXCELLENT',
      daysUntilDeadline: 28,
      daysPerWeek: 4,
      minutesPerDay: 40,
      levelConfig: LEVELS,
      config: CONFIG,
    });

    expect(result.requiredMinutes).toBe(0);
    expect(result.masteryGapPoints).toBe(0);
    expect(result.skillsBelowTarget).toBe(0);
    expect(result.status).toBe('FEASIBLE');
    expect(result.ratio).toBe(0);
  });

  it('cường độ khai báo vượt trần cấu hình vẫn bị kẹp về trần', () => {
    const result = checkGoalFeasibility({
      masteries: weakMasteries,
      skills,
      currentLevel: 'WEAK',
      targetLevel: 'AVERAGE',
      daysUntilDeadline: 70,
      daysPerWeek: 9,
      minutesPerDay: CONFIG.maxMinutesPerDay + 500,
      levelConfig: LEVELS,
      config: CONFIG,
    });

    expect(result.availableMinutes).toBe(10 * 7 * CONFIG.maxMinutesPerDay);
    expect(result.suggestedMinutesPerDay).toBeLessThanOrEqual(CONFIG.maxMinutesPerDay);
  });
});

describe('buildGoalOptions', () => {
  it('luôn có phương án khả thi và đúng một phương án được khuyến nghị', () => {
    const options = buildGoalOptions({
      masteries: weakMasteries,
      skills,
      currentLevel: 'WEAK',
      daysPerWeek: 5,
      minutesPerDay: 50,
      levelConfig: LEVELS,
      config: CONFIG,
    });

    expect(options.length).toBeGreaterThanOrEqual(2);
    expect(options.length).toBeLessThanOrEqual(3);
    expect(options.filter((o) => o.recommended)).toHaveLength(1);
    expect(options.some((o) => o.feasibility.status === 'FEASIBLE')).toBe(true);

    const recommended = options.find((o) => o.recommended);
    expect(recommended?.feasibility.status).toBe('FEASIBLE');
    const feasibleWeeks = options
      .filter((o) => o.feasibility.status === 'FEASIBLE')
      .map((o) => o.weeks);
    expect(recommended?.weeks).toBe(Math.min(...feasibleWeeks));

    for (const option of options) {
      expect(option.weeks).toBeGreaterThan(0);
      expect(option.label).toContain('tuần');
      expect(option.description.length).toBeGreaterThan(10);
      expect(option.minutesPerDay).toBeLessThanOrEqual(CONFIG.maxMinutesPerDay);
      expect(option.minutesPerDay).toBeGreaterThanOrEqual(CONFIG.minMinutesPerDay);
    }
  });

  it('có phương án lên mức kế tiếp và phương án dài hơi hơn', () => {
    const options = buildGoalOptions({
      masteries: weakMasteries,
      skills,
      currentLevel: 'AVERAGE',
      daysPerWeek: 5,
      minutesPerDay: 45,
      levelConfig: LEVELS,
      config: CONFIG,
    });

    expect(options.some((o) => o.targetLevel === 'GOOD')).toBe(true);
    const weeks = options.map((o) => o.weeks);
    expect(Math.max(...weeks)).toBeGreaterThan(Math.min(...weeks));
    expect(options.map((o) => o.label)).toEqual([...new Set(options.map((o) => o.label))]);
  });

  it('trần số tuần không làm mất phương án khả thi', () => {
    const options = buildGoalOptions({
      masteries: weakMasteries,
      skills,
      currentLevel: 'WEAK',
      daysPerWeek: 3,
      minutesPerDay: CONFIG.minMinutesPerDay,
      levelConfig: LEVELS,
      config: CONFIG,
      maxWeeks: 2,
    });

    expect(options.length).toBeGreaterThanOrEqual(1);
    expect(options.filter((o) => o.recommended)).toHaveLength(1);
    expect(options.some((o) => o.feasibility.status === 'FEASIBLE')).toBe(true);
  });

  it('học sinh đã ở mức cao nhất vẫn nhận được phương án giữ vững', () => {
    const options = buildGoalOptions({
      masteries: makeMasteries(skills, 90),
      skills,
      currentLevel: 'EXCELLENT',
      daysPerWeek: 4,
      minutesPerDay: 40,
      levelConfig: LEVELS,
      config: CONFIG,
    });

    expect(options.length).toBeGreaterThanOrEqual(1);
    expect(options.filter((o) => o.recommended)).toHaveLength(1);
    expect(options.every((o) => o.targetLevel === 'EXCELLENT')).toBe(true);
  });
});
