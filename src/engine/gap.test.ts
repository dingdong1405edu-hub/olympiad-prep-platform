import { describe, expect, it } from 'vitest';
import { DEFAULT_CONFIG } from '@/lib/config/defaults';
import { computeGapPriorities } from './gap';
import { createInitialMastery } from './mastery';
import type { GapPriorityRequest, MasteryState, SkillNode } from './types';

const config = DEFAULT_CONFIG.recommendation;
const TARGET = DEFAULT_CONFIG.levels.masteryTargets.GOOD;

function skill(id: string, overrides: Partial<SkillNode> = {}): SkillNode {
  return {
    id,
    code: id.toUpperCase(),
    name: `Kỹ năng ${id}`,
    chapterId: 'chuong-1',
    chapterName: 'Chương 1',
    blueprintWeight: 1,
    order: 1,
    prerequisiteIds: [],
    ...overrides,
  };
}

function mastery(skillId: string, overrides: Partial<MasteryState> = {}): MasteryState {
  return { ...createInitialMastery(skillId), attemptCount: 10, confidence: 0.6, ...overrides };
}

function request(overrides: Partial<GapPriorityRequest>): GapPriorityRequest {
  return {
    skills: [],
    masteries: [],
    targetMastery: TARGET,
    daysToExam: null,
    config,
    ...overrides,
  };
}

function priorityOf(scores: ReturnType<typeof computeGapPriorities>, skillId: string): number {
  const found = scores.find((score) => score.skillId === skillId);
  if (!found) throw new Error(`Không tìm thấy skill ${skillId}`);
  return found.priority;
}

describe('computeGapPriorities', () => {
  it('xếp skill hổng nặng lên trên skill gần đạt mục tiêu', () => {
    const scores = computeGapPriorities(
      request({
        skills: [skill('gan-dat', { order: 1 }), skill('hong-nang', { order: 2 })],
        masteries: [
          mastery('gan-dat', { masteryScore: 62 }),
          mastery('hong-nang', { masteryScore: 12 }),
        ],
      }),
    );

    expect(scores[0]!.skillId).toBe('hong-nang');
    expect(scores[1]!.skillId).toBe('gan-dat');
    expect(scores[0]!.priority).toBeGreaterThan(scores[1]!.priority);
    expect(scores[0]!.targetMastery).toBe(TARGET);
  });

  it('không để skill chưa có dữ liệu nhảy lên trên skill đã đo là hổng nặng', () => {
    const scores = computeGapPriorities(
      request({
        skills: [skill('chua-do'), skill('da-do')],
        masteries: [
          createInitialMastery('chua-do'),
          mastery('da-do', { masteryScore: 8, attemptCount: 12 }),
        ],
      }),
    );

    expect(scores[0]!.skillId).toBe('da-do');
    // Vẫn phải có deficit dương để còn cơ hội được đo
    expect(priorityOf(scores, 'chua-do')).toBeGreaterThan(0);
  });

  it('đẩy skill là tiên quyết của nhiều skill đang hổng lên trên', () => {
    const skills = [
      skill('nen', { order: 1 }),
      skill('doc-lap', { order: 2 }),
      skill('phu-thuoc-1', { order: 3, prerequisiteIds: ['nen'] }),
      skill('phu-thuoc-2', { order: 4, prerequisiteIds: ['nen'] }),
      skill('phu-thuoc-3', { order: 5, prerequisiteIds: ['phu-thuoc-1'] }),
    ];
    const masteries = [
      mastery('nen', { masteryScore: 30 }),
      mastery('doc-lap', { masteryScore: 30 }),
      mastery('phu-thuoc-1', { masteryScore: 10 }),
      mastery('phu-thuoc-2', { masteryScore: 10 }),
      mastery('phu-thuoc-3', { masteryScore: 10 }),
    ];

    const scores = computeGapPriorities(request({ skills, masteries }));

    // 'nen' và 'doc-lap' giống hệt nhau, chỉ khác ở vai trò tiên quyết
    expect(priorityOf(scores, 'nen')).toBeGreaterThan(priorityOf(scores, 'doc-lap'));

    const nen = scores.find((score) => score.skillId === 'nen')!;
    // Tính gián tiếp: phu-thuoc-3 đứng sau phu-thuoc-1 cũng được đếm
    expect(nen.factors.prerequisite).toBeGreaterThan(1);
    expect(nen.reason).toContain('kiến thức nền của 3 kỹ năng khác đang hổng');

    const phuThuoc1 = scores.find((score) => score.skillId === 'phu-thuoc-1')!;
    expect(phuThuoc1.blockedBySkillIds).toEqual(['nen']);
  });

  it('trọng số = 0 vô hiệu hóa đúng thừa số đó', () => {
    const skills = [
      skill('nen', { order: 1 }),
      skill('doc-lap', { order: 2 }),
      skill('phu-thuoc-1', { order: 3, prerequisiteIds: ['nen'] }),
      skill('phu-thuoc-2', { order: 4, prerequisiteIds: ['nen'] }),
    ];
    const masteries = [
      mastery('nen', { masteryScore: 30 }),
      mastery('doc-lap', { masteryScore: 30 }),
      mastery('phu-thuoc-1', { masteryScore: 10 }),
      mastery('phu-thuoc-2', { masteryScore: 10 }),
    ];

    const withoutPrerequisite = computeGapPriorities(
      request({
        skills,
        masteries,
        config: { ...config, weights: { ...config.weights, prerequisite: 0 } },
      }),
    );

    expect(priorityOf(withoutPrerequisite, 'nen')).toBeCloseTo(
      priorityOf(withoutPrerequisite, 'doc-lap'),
      10,
    );
    // Giá trị thô vẫn được báo cáo để vận hành đọc hiểu, chỉ ảnh hưởng bị tắt
    const nen = withoutPrerequisite.find((score) => score.skillId === 'nen')!;
    expect(nen.factors.prerequisite).toBeGreaterThan(1);
  });

  it('trọng số deficit = 0 làm hai skill khác mastery có cùng ưu tiên', () => {
    const skills = [skill('a', { order: 1 }), skill('b', { order: 2 })];
    const masteries = [mastery('a', { masteryScore: 5 }), mastery('b', { masteryScore: 60 })];

    const scores = computeGapPriorities(
      request({
        skills,
        masteries,
        config: { ...config, weights: { ...config.weights, deficit: 0 } },
      }),
    );

    expect(priorityOf(scores, 'a')).toBeCloseTo(priorityOf(scores, 'b'), 10);
  });

  it('kỳ thi càng gần càng đẩy skill trọng số blueprint cao lên', () => {
    const skills = [
      skill('trong-tam', { order: 1, blueprintWeight: 3 }),
      skill('phu', { order: 2, blueprintWeight: 0.5 }),
    ];
    const masteries = [
      mastery('trong-tam', { masteryScore: 30 }),
      mastery('phu', { masteryScore: 20 }),
    ];

    const xa = computeGapPriorities(request({ skills, masteries, daysToExam: null }));
    const gan = computeGapPriorities(request({ skills, masteries, daysToExam: 5 }));

    const tiLeXa = priorityOf(xa, 'trong-tam') / priorityOf(xa, 'phu');
    const tiLeGan = priorityOf(gan, 'trong-tam') / priorityOf(gan, 'phu');
    expect(tiLeGan).toBeGreaterThan(tiLeXa);

    const xaScore = xa.find((score) => score.skillId === 'trong-tam')!;
    expect(xaScore.factors.examProximity).toBe(1);
  });

  it('lỗi lặp lại và sai liên tiếp làm tăng ưu tiên', () => {
    const skills = [skill('sach', { order: 1 }), skill('hay-sai', { order: 2 })];
    const scores = computeGapPriorities(
      request({
        skills,
        masteries: [
          mastery('sach', { masteryScore: 30 }),
          mastery('hay-sai', {
            masteryScore: 30,
            errorCounts: { KNOWLEDGE: 4, CARELESS: 2 },
            consecutiveWrong: 3,
          }),
        ],
      }),
    );

    expect(priorityOf(scores, 'hay-sai')).toBeGreaterThan(priorityOf(scores, 'sach'));
    expect(scores[0]!.skillId).toBe('hay-sai');
    expect(scores[0]!.reason).toContain('đang sai 3 câu liên tiếp');
  });

  it('skill giáo viên chỉ định thắng kết quả tính toán của engine', () => {
    const skills = [skill('hong-hon', { order: 1 }), skill('giao-vien-chon', { order: 2 })];
    const masteries = [
      mastery('hong-hon', { masteryScore: 20 }),
      mastery('giao-vien-chon', { masteryScore: 45 }),
    ];

    const khongOverride = computeGapPriorities(request({ skills, masteries }));
    expect(khongOverride[0]!.skillId).toBe('hong-hon');

    const coOverride = computeGapPriorities(
      request({ skills, masteries, teacherFocusSkillIds: ['giao-vien-chon'] }),
    );
    expect(coOverride[0]!.skillId).toBe('giao-vien-chon');
    expect(coOverride[0]!.reason.toLowerCase()).toContain('giáo viên chỉ định tập trung');
  });

  it('không vỡ khi danh sách skill rỗng hoặc thiếu bản ghi mastery', () => {
    expect(computeGapPriorities(request({ skills: [] }))).toEqual([]);

    const scores = computeGapPriorities(request({ skills: [skill('mo-coi')], masteries: [] }));
    expect(scores).toHaveLength(1);
    expect(scores[0]!.masteryScore).toBe(0);
    expect(scores[0]!.priority).toBeGreaterThan(0);
    expect(scores[0]!.reason.toLowerCase()).toContain('chưa có dữ liệu luyện tập');
  });

  it('chịu được đồ thị tiên quyết có chu trình do nhập liệu sai', () => {
    const skills = [
      skill('a', { order: 1, prerequisiteIds: ['b'] }),
      skill('b', { order: 2, prerequisiteIds: ['a'] }),
    ];
    const scores = computeGapPriorities(
      request({
        skills,
        masteries: [mastery('a', { masteryScore: 10 }), mastery('b', { masteryScore: 10 })],
      }),
    );
    expect(scores).toHaveLength(2);
    expect(Number.isFinite(scores[0]!.priority)).toBe(true);
  });
});
