import { describe, expect, it } from 'vitest';
import type { Difficulty } from '@prisma/client';
import { DEFAULT_CONFIG } from '@/lib/config/defaults';
import { selectDiagnosticItems, selectProgressItems } from './selection';
import type {
  BlueprintSpec,
  CandidateItem,
  MasteryState,
  SelectedItem,
  SkillNode,
} from './types';

const DIFFICULTY_LIST: Difficulty[] = ['AVERAGE', 'GOOD', 'EXCELLENT'];

function makeSkills(chapterCount: number, skillsPerChapter: number): SkillNode[] {
  const skills: SkillNode[] = [];
  for (let c = 1; c <= chapterCount; c++) {
    for (let s = 1; s <= skillsPerChapter; s++) {
      skills.push({
        id: `C${c}-S${s}`,
        code: `C${c}.S${s}`,
        name: `Kỹ năng ${c}.${s}`,
        chapterId: `C${c}`,
        chapterName: `Chương ${c}`,
        blueprintWeight: 1,
        order: s,
        prerequisiteIds: [],
      });
    }
  }
  return skills;
}

function makeCandidates(skills: SkillNode[], perDifficulty: number): CandidateItem[] {
  const items: CandidateItem[] = [];
  for (const skill of skills) {
    for (const difficulty of DIFFICULTY_LIST) {
      for (let i = 1; i <= perDifficulty; i++) {
        items.push({
          id: `${skill.id}-${difficulty}-${i}`,
          skillId: skill.id,
          chapterId: skill.chapterId,
          difficulty,
          difficultyNumeric: DIFFICULTY_LIST.indexOf(difficulty) * 3 + 2,
          estimatedTime: 90,
          tags: [],
          lastServedAt: null,
          timesServedToStudent: 0,
        });
      }
    }
  }
  return items;
}

function makeBlueprint(chapterIds: string[], minAnchorItems: number): BlueprintSpec {
  const chapterWeights: Record<string, number> = {};
  for (const id of chapterIds) chapterWeights[id] = 1;
  const mix = (a: number, g: number, e: number): Record<Difficulty, number> => ({
    AVERAGE: a,
    GOOD: g,
    EXCELLENT: e,
  });
  return {
    chapterWeights,
    difficultyMixByLevel: {
      WEAK: mix(0.7, 0.3, 0),
      AVERAGE: mix(0.5, 0.35, 0.15),
      GOOD: mix(0.3, 0.45, 0.25),
      EXCELLENT: mix(0.15, 0.4, 0.45),
    },
    minAnchorItems,
  };
}

function makeMastery(skillId: string, masteryScore: number, ceiling = 0): MasteryState {
  return {
    skillId,
    masteryScore,
    confidence: 0.6,
    attemptCount: 12,
    correctCount: 7,
    recentAccuracy: 0.58,
    recentResults: [1, 0, 1, 1, 0],
    avgTimeRatio: 1.1,
    consecutiveCorrect: 1,
    consecutiveWrong: 0,
    difficultyCeiling: ceiling,
    lastPracticedAt: null,
    errorCounts: {},
  };
}

function idsOf(items: SelectedItem[]): string[] {
  return items.map((item) => item.itemId);
}

function countBySkill(items: SelectedItem[]): Map<string, number> {
  const counter = new Map<string, number>();
  for (const item of items) counter.set(item.skillId, (counter.get(item.skillId) ?? 0) + 1);
  return counter;
}

const ITEM_COUNT = DEFAULT_CONFIG.assessment.diagnosticItemCount;

describe('selectDiagnosticItems', () => {
  const skills = makeSkills(4, 4);
  const candidates = makeCandidates(skills, 3);
  const blueprint = makeBlueprint(['C1', 'C2', 'C3', 'C4'], 4);

  it('chọn đúng số câu yêu cầu, không trùng câu và không cần cảnh báo khi kho đủ', () => {
    const result = selectDiagnosticItems({
      candidates,
      skills,
      blueprint,
      selfLevel: 'GOOD',
      itemCount: ITEM_COUNT,
      seedKey: 'enrollment-1',
    });

    expect(result.items).toHaveLength(ITEM_COUNT);
    expect(new Set(idsOf(result.items)).size).toBe(ITEM_COUNT);
    expect(result.warnings).toEqual([]);
    expect(result.items.every((item) => item.reasonCode.length > 0)).toBe(true);
  });

  it('phủ nhiều kỹ năng: không quá 2 câu cùng một skill khi kho còn lựa chọn', () => {
    const result = selectDiagnosticItems({
      candidates,
      skills,
      blueprint,
      selfLevel: 'AVERAGE',
      itemCount: ITEM_COUNT,
      seedKey: 'enrollment-2',
    });

    const counts = [...countBySkill(result.items).values()];
    expect(Math.max(...counts)).toBeLessThanOrEqual(2);
  });

  it('giữ đủ câu neo cơ bản kể cả khi học sinh tự khai Giỏi', () => {
    const anchorBlueprint = makeBlueprint(['C1', 'C2', 'C3', 'C4'], 5);
    const result = selectDiagnosticItems({
      candidates,
      skills,
      blueprint: anchorBlueprint,
      selfLevel: 'EXCELLENT',
      itemCount: ITEM_COUNT,
      seedKey: 'enrollment-3',
    });

    const anchors = result.items.filter((item) => item.role === 'ANCHOR');
    expect(anchors).toHaveLength(5);
    expect(anchors.every((item) => item.difficulty === 'AVERAGE')).toBe(true);
    expect(result.items.filter((item) => item.role === 'BLUEPRINT')).toHaveLength(ITEM_COUNT - 5);
  });

  it('tất định theo seedKey', () => {
    const args = {
      candidates,
      skills,
      blueprint,
      selfLevel: 'GOOD' as const,
      itemCount: ITEM_COUNT,
      seedKey: 'enrollment-4',
    };
    const first = selectDiagnosticItems(args);
    const second = selectDiagnosticItems(args);
    const other = selectDiagnosticItems({ ...args, seedKey: 'enrollment-999' });

    expect(idsOf(second.items)).toEqual(idsOf(first.items));
    expect(idsOf(other.items)).not.toEqual(idsOf(first.items));
  });

  it('kho thiếu câu thì trả cảnh báo chứ không ném lỗi', () => {
    const poorSkills = makeSkills(1, 1);
    const poorCandidates = makeCandidates(poorSkills, 2).slice(0, 4);
    const result = selectDiagnosticItems({
      candidates: poorCandidates,
      skills: poorSkills,
      blueprint: makeBlueprint(['C1', 'C2'], 3),
      selfLevel: 'WEAK',
      itemCount: ITEM_COUNT,
      seedKey: 'enrollment-5',
    });

    expect(result.items.length).toBe(4);
    expect(new Set(idsOf(result.items)).size).toBe(4);
    expect(result.warnings.length).toBeGreaterThan(0);
    expect(result.warnings.some((w) => w.includes('4/15'))).toBe(true);
  });

  it('kho rỗng thì trả về mảng rỗng kèm cảnh báo', () => {
    const result = selectDiagnosticItems({
      candidates: [],
      skills,
      blueprint,
      selfLevel: 'WEAK',
      itemCount: ITEM_COUNT,
      seedKey: 'enrollment-6',
    });
    expect(result.items).toEqual([]);
    expect(result.warnings.length).toBeGreaterThan(0);
  });
});

describe('selectProgressItems', () => {
  const skills = makeSkills(3, 3);
  const candidates = makeCandidates(skills, 4);
  const blueprint = makeBlueprint(['C1', 'C2', 'C3'], 3);
  const baselineItems = [
    { itemId: 'C1-S1-AVERAGE-1', skillId: 'C1-S1', difficulty: 'AVERAGE' as Difficulty },
    { itemId: 'C1-S2-GOOD-1', skillId: 'C1-S2', difficulty: 'GOOD' as Difficulty },
    { itemId: 'C2-S1-AVERAGE-1', skillId: 'C2-S1', difficulty: 'AVERAGE' as Difficulty },
    { itemId: 'C2-S2-GOOD-1', skillId: 'C2-S2', difficulty: 'GOOD' as Difficulty },
    { itemId: 'C3-S1-EXCELLENT-1', skillId: 'C3-S1', difficulty: 'EXCELLENT' as Difficulty },
  ];
  const trainedSkillIds = ['C1-S1', 'C2-S2', 'C3-S2'];
  const masteries = [
    makeMastery('C1-S1', 30),
    makeMastery('C2-S2', 60, 2),
    makeMastery('C3-S2', 80, 3),
  ];
  const excludeItemIds = candidates
    .filter((c) => c.id.endsWith('-GOOD-2'))
    .map((c) => c.id);
  const composition = DEFAULT_CONFIG.assessment.progressComposition;
  const itemCount = DEFAULT_CONFIG.assessment.progressItemCount;

  const baseRequest = {
    candidates,
    skills,
    blueprint,
    masteries,
    baselineItems,
    trainedSkillIds,
    excludeItemIds,
    composition,
    itemCount,
    seedKey: 'cycle-1',
  };

  it('loại sạch câu vừa gặp và không dùng lại chính câu của bài baseline', () => {
    const result = selectProgressItems(baseRequest);
    const ids = idsOf(result.items);

    expect(result.items).toHaveLength(itemCount);
    expect(new Set(ids).size).toBe(itemCount);
    for (const id of ids) {
      expect(excludeItemIds).not.toContain(id);
      expect(baselineItems.map((b) => b.itemId)).not.toContain(id);
    }
  });

  it('đủ ba phần theo cấu trúc đề và câu neo bám đúng kỹ năng của baseline', () => {
    const result = selectProgressItems(baseRequest);
    const anchors = result.items.filter((item) => item.role === 'ANCHOR');
    const trained = result.items.filter((item) => item.role === 'TRAINED');
    const fresh = result.items.filter((item) => item.role === 'FRESH');

    expect(anchors).toHaveLength(5);
    expect(trained).toHaveLength(6);
    expect(fresh).toHaveLength(4);

    const baselineSkills = new Set(baselineItems.map((b) => b.skillId));
    expect(anchors.every((item) => baselineSkills.has(item.skillId))).toBe(true);
    expect(trained.every((item) => trainedSkillIds.includes(item.skillId))).toBe(true);
  });

  it('tất định theo seedKey', () => {
    const first = selectProgressItems(baseRequest);
    const second = selectProgressItems(baseRequest);
    const other = selectProgressItems({ ...baseRequest, seedKey: 'cycle-99' });

    expect(idsOf(second.items)).toEqual(idsOf(first.items));
    expect(idsOf(other.items)).not.toEqual(idsOf(first.items));
  });

  it('kho thiếu câu thì cảnh báo và trả về ít câu hơn, không ném lỗi', () => {
    // 4 câu nhưng câu đầu tiên chính là câu baseline nên bị loại ⇒ chỉ còn 3 câu dùng được
    const poor = candidates.filter((c) => c.chapterId === 'C1' && c.difficulty === 'AVERAGE').slice(0, 4);
    const result = selectProgressItems({ ...baseRequest, candidates: poor });

    expect(result.items.length).toBe(3);
    expect(result.warnings.length).toBeGreaterThan(0);
    expect(result.warnings.some((w) => w.includes('3/15'))).toBe(true);
  });

  it('không có kỹ năng đã luyện thì vẫn ra đề và ghi cảnh báo', () => {
    const result = selectProgressItems({ ...baseRequest, trainedSkillIds: [] });
    expect(result.items).toHaveLength(itemCount);
    expect(result.warnings.some((w) => w.includes('kỹ năng đã luyện'))).toBe(true);
  });
});
