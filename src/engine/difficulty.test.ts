import { describe, expect, it } from 'vitest';
import { DEFAULT_CONFIG } from '@/lib/config/defaults';
import { decideDifficulty } from './difficulty';
import { createInitialMastery } from './mastery';
import type { MasteryState } from './types';

const config = DEFAULT_CONFIG.recommendation;

function state(overrides: Partial<MasteryState> = {}): MasteryState {
  return { ...createInitialMastery('skill-1'), ...overrides };
}

describe('decideDifficulty', () => {
  it('hạ độ khó và đưa bài tiên quyết khi sai liên tiếp', () => {
    const decision = decideDifficulty(
      state({
        masteryScore: 60,
        attemptCount: 12,
        avgTimeRatio: 1.0,
        consecutiveWrong: config.difficultyDown.consecutiveWrong,
        difficultyCeiling: 2,
      }),
      config,
    );

    expect(decision.direction).toBe('DOWN');
    expect(decision.needsPrerequisite).toBe(true);
    expect(decision.reasonCode).toBe('DIFFICULTY_DOWN_REPEATED_WRONG');
    expect(decision.difficulty).toBe('AVERAGE');
    expect(decision.reason).toContain('sai');
  });

  it('hạ độ khó khi thời gian làm bài vượt ngưỡng dù chưa sai liên tiếp', () => {
    const decision = decideDifficulty(
      state({
        masteryScore: 60,
        attemptCount: 12,
        avgTimeRatio: config.difficultyDown.minTimeRatio,
        consecutiveCorrect: 1,
        difficultyCeiling: 2,
      }),
      config,
    );

    expect(decision.direction).toBe('DOWN');
    expect(decision.needsPrerequisite).toBe(true);
    expect(decision.reasonCode).toBe('DIFFICULTY_DOWN_TOO_SLOW');
  });

  it('tăng độ khó khi đúng ổn định với tốc độ tốt', () => {
    const decision = decideDifficulty(
      state({
        masteryScore: 60,
        attemptCount: 12,
        avgTimeRatio: config.difficultyUp.maxTimeRatio,
        consecutiveCorrect: config.difficultyUp.consecutiveCorrect,
        difficultyCeiling: 2,
      }),
      config,
    );

    expect(decision.direction).toBe('UP');
    expect(decision.needsPrerequisite).toBe(false);
    expect(decision.reasonCode).toBe('DIFFICULTY_UP_STABLE_CORRECT');
    expect(decision.difficulty).toBe('EXCELLENT');
  });

  it('giữ nguyên độ khó khi chưa đủ tín hiệu tăng hay giảm', () => {
    const decision = decideDifficulty(
      state({
        masteryScore: 60,
        attemptCount: 12,
        avgTimeRatio: 1.3,
        consecutiveCorrect: 1,
        consecutiveWrong: 0,
        difficultyCeiling: 2,
      }),
      config,
    );

    expect(decision.direction).toBe('HOLD');
    expect(decision.needsPrerequisite).toBe(false);
    expect(decision.reasonCode).toBe('DIFFICULTY_HOLD_STABLE');
    expect(decision.difficulty).toBe('GOOD');
  });

  it('bắt đầu ở bậc Trung bình khi skill chưa có dữ liệu', () => {
    const decision = decideDifficulty(state(), config);

    expect(decision.direction).toBe('HOLD');
    expect(decision.reasonCode).toBe('DIFFICULTY_HOLD_NO_DATA');
    expect(decision.difficulty).toBe('AVERAGE');
    expect(decision.needsPrerequisite).toBe(false);
    // avgTimeRatio = 0 khi chưa luyện, không được hiểu là "làm rất nhanh"
    expect(decision.reason).toContain('chưa có dữ liệu');
  });

  it('suy bậc nền từ mastery: dưới ngưỡng hổng thì luôn ở Trung bình', () => {
    const decision = decideDifficulty(
      state({
        masteryScore: config.gapThreshold - 1,
        attemptCount: 12,
        avgTimeRatio: 1,
        consecutiveCorrect: 1,
      }),
      config,
    );
    expect(decision.difficulty).toBe('AVERAGE');
    expect(decision.direction).toBe('HOLD');
  });

  it('không cho vượt quá một bậc so với trần độ khó đã chứng minh', () => {
    // Mastery rất cao nhưng mới chỉ ổn định ở bậc Trung bình (ceiling = 1)
    const decision = decideDifficulty(
      state({
        masteryScore: 95,
        attemptCount: 20,
        avgTimeRatio: 1,
        consecutiveCorrect: 1,
        difficultyCeiling: 1,
      }),
      config,
    );
    expect(decision.difficulty).toBe('GOOD');
  });

  it('sai liên tiếp thắng tín hiệu tăng khi cả hai cùng xuất hiện', () => {
    const decision = decideDifficulty(
      state({
        masteryScore: 80,
        attemptCount: 20,
        avgTimeRatio: 0.8,
        consecutiveCorrect: 5,
        consecutiveWrong: config.difficultyDown.consecutiveWrong + 1,
        difficultyCeiling: 3,
      }),
      config,
    );
    expect(decision.direction).toBe('DOWN');
    expect(decision.needsPrerequisite).toBe(true);
  });

  it('không sập khi cấu hình đặt ngưỡng liên tiếp về 0', () => {
    const lech = {
      ...config,
      difficultyUp: { ...config.difficultyUp, consecutiveCorrect: 0 },
      difficultyDown: { ...config.difficultyDown, consecutiveWrong: 0 },
    };
    const decision = decideDifficulty(
      state({ masteryScore: 50, attemptCount: 5, avgTimeRatio: 1.3 }),
      lech,
    );
    // consecutiveWrong = 0 vẫn không được coi là "đang sai liên tiếp"
    expect(decision.direction).toBe('HOLD');
  });
});
