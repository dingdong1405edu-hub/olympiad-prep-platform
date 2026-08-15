/**
 * Test phần XẾP HỌC LỰC và CHỌN KHÓA của trang kết quả thi thử.
 *
 * Ưu tiên số một của bộ test này không phải "xếp đúng mức" mà là "không xếp
 * bừa": một em làm đúng hết nhưng AI chưa chấm xong tuyệt đối không được hiện
 * chữ "Kém". Cái sai đó tốn của một đứa trẻ nhiều hơn mọi lỗi khác trong file.
 */
import { describe, expect, it } from 'vitest';
import type { MockPart } from '@prisma/client';
import { DEFAULT_CONFIG } from '@/lib/config/defaults';
import {
  gradeBandFromExamMeta,
  introFor,
  judgeLevel,
  rankCourses,
  reasonFor,
  subjectFromExamMeta,
  type CourseCandidate,
  type JudgeInput,
  type MatchTarget,
} from './advice';

const levels = DEFAULT_CONFIG.levels;

function answer(
  part: MockPart,
  maxPoints: number,
  awarded: number | null,
  graded = true,
): JudgeInput['answers'][number] {
  return { part, maxPoints, awarded, graded };
}

/** Đề mẫu: 5 câu trắc nghiệm (10đ) + 5 câu đáp số (20đ) + 10 câu tự luận (70đ). */
function fullExam(mcq: number, short: number, essay: number, essayGraded = true): JudgeInput {
  return {
    score: mcq + short + essay,
    totalPoints: 100,
    answers: [
      answer('MCQ', 10, mcq),
      answer('SHORT', 20, short),
      answer('ESSAY', 70, essay, essayGraded),
    ],
  };
}

describe('judgeLevel — xếp mức', () => {
  it('ngưỡng lấy đúng từ cấu hình, không chế riêng', () => {
    expect(judgeLevel(fullExam(10, 20, 60), levels).level).toBe('EXCELLENT'); // 90%
    expect(judgeLevel(fullExam(10, 20, 40), levels).level).toBe('GOOD'); // 70%
    expect(judgeLevel(fullExam(10, 15, 25), levels).level).toBe('AVERAGE'); // 50%
    expect(judgeLevel(fullExam(5, 5, 10), levels).level).toBe('WEAK'); // 20%
  });

  it('đúng ngay tại mốc thì đã thuộc mức trên', () => {
    // scoreThresholds.GOOD = 62
    expect(judgeLevel(fullExam(10, 20, 32), levels).level).toBe('GOOD');
    expect(judgeLevel(fullExam(10, 20, 31), levels).level).toBe('AVERAGE');
  });

  it('nhãn mức lấy từ cấu hình để admin đổi tên là trang đổi theo', () => {
    const renamed = { ...levels, labels: { ...levels.labels, GOOD: 'Cứng tay' } };
    expect(judgeLevel(fullExam(10, 20, 40), renamed).levelLabel).toBe('Cứng tay');
  });

  it('thang bốn mức luôn đủ và chỉ đánh dấu đúng một mức hiện tại', () => {
    const verdict = judgeLevel(fullExam(10, 20, 40), levels);
    expect(verdict.scale.map((s) => s.level)).toEqual(['WEAK', 'AVERAGE', 'GOOD', 'EXCELLENT']);
    expect(verdict.scale.filter((s) => s.current)).toHaveLength(1);
    expect(verdict.scale.find((s) => s.current)?.level).toBe('GOOD');
  });
});

describe('judgeLevel — chưa chấm xong thì KHÔNG xếp', () => {
  it('câu tự luận chưa chấm: không có mức, không có mạnh yếu', () => {
    const verdict = judgeLevel(fullExam(10, 20, 0, false), levels);

    expect(verdict.level).toBeNull();
    expect(verdict.levelLabel).toBeNull();
    expect(verdict.nextLevel).toBeNull();
    // Đây mới là chỗ chết người: 70 điểm tự luận chưa chấm mà đem so với 10 và
    // 20 điểm đã chấm thì phần tự luận luôn "yếu nhất", trong khi chưa ai chấm.
    expect(verdict.weakest).toBeNull();
    expect(verdict.strongest).toBeNull();
  });

  it('nói rõ còn bao nhiêu câu và bao nhiêu điểm chưa chấm', () => {
    const verdict = judgeLevel(
      {
        score: 30,
        totalPoints: 100,
        answers: [answer('MCQ', 10, 10), answer('ESSAY', 7, null, false), answer('ESSAY', 7, null, false)],
      },
      levels,
    );

    expect(verdict.ungradedCount).toBe(2);
    expect(verdict.ungradedPoints).toBe(14);
    expect(verdict.detail).toContain('2 câu');
    expect(verdict.detail).toContain('14 điểm');
  });

  it('chấm xong hết thì mới có mức, dù có câu bị 0 điểm', () => {
    const verdict = judgeLevel(fullExam(10, 20, 0), levels);
    expect(verdict.level).toBe('WEAK');
    expect(verdict.ungradedCount).toBe(0);
  });
});

describe('judgeLevel — mạnh yếu từng phần', () => {
  it('chỉ ra phần yếu nhất khi các phần lệch nhau rõ', () => {
    const verdict = judgeLevel(fullExam(10, 18, 21), levels); // 100% / 90% / 30%
    expect(verdict.weakest?.part).toBe('ESSAY');
    expect(verdict.strongest?.part).toBe('MCQ');
    expect(verdict.detail).toContain('tự luận');
  });

  it('đều tay thì không gán nhãn mạnh/yếu cho ai', () => {
    const verdict = judgeLevel(fullExam(7, 14, 49), levels); // 70% cả ba phần
    expect(verdict.weakest).toBeNull();
    expect(verdict.strongest).toBeNull();
  });

  it('mỗi phần hiện đúng số điểm và tỷ lệ của phần đó', () => {
    const verdict = judgeLevel(fullExam(5, 10, 35), levels);
    expect(verdict.parts).toEqual([
      { part: 'MCQ', label: 'Trắc nghiệm', awarded: 5, total: 10, percent: 50 },
      { part: 'SHORT', label: 'Trả lời ngắn', awarded: 10, total: 20, percent: 50 },
      { part: 'ESSAY', label: 'Tự luận', awarded: 35, total: 70, percent: 50 },
    ]);
  });
});

describe('judgeLevel — mức kế tiếp', () => {
  it('nói còn thiếu bao nhiêu điểm để lên mức trên', () => {
    const verdict = judgeLevel(fullExam(10, 20, 25), levels); // 55% → Trung bình
    expect(verdict.nextLevel?.level).toBe('GOOD');
    expect(verdict.nextLevel?.pointsNeeded).toBe(7); // 62 - 55
  });

  it('đã ở mức cao nhất thì không hứa hẹn gì thêm', () => {
    expect(judgeLevel(fullExam(10, 20, 70), levels).nextLevel).toBeNull();
  });
});

describe('judgeLevel — biên', () => {
  it('đề 0 điểm không làm vỡ phép chia', () => {
    const verdict = judgeLevel({ score: 0, totalPoints: 0, answers: [] }, levels);
    expect(verdict.percent).toBe(0);
    expect(verdict.parts).toEqual([]);
    expect(verdict.level).toBe('WEAK');
  });

  it('điểm âm hoặc vượt trần đều bị kéo về khoảng hợp lệ', () => {
    expect(judgeLevel({ score: -5, totalPoints: 100, answers: [] }, levels).percent).toBe(0);
    expect(judgeLevel({ score: 250, totalPoints: 100, answers: [] }, levels).percent).toBe(100);
  });
});

describe('đọc metadata của đề', () => {
  it('nhận ra môn dù viết kiểu gì', () => {
    expect(subjectFromExamMeta('math')).toBe('MATH');
    expect(subjectFromExamMeta('Mathematics')).toBe('MATH');
    expect(subjectFromExamMeta('Toán')).toBe('MATH');
    expect(subjectFromExamMeta('physics')).toBe('PHYSICS');
    expect(subjectFromExamMeta('Tin học')).toBe('IT');
  });

  it('không đoán bừa khi không nhận ra', () => {
    expect(subjectFromExamMeta('')).toBeNull();
    expect(subjectFromExamMeta(null)).toBeNull();
    expect(subjectFromExamMeta('môn gì đó')).toBeNull();
  });

  it('quy số lớp về đúng khối', () => {
    expect(gradeBandFromExamMeta('lớp 4')).toBe('A');
    expect(gradeBandFromExamMeta('grade 6')).toBe('B');
    expect(gradeBandFromExamMeta('9')).toBe('C');
    expect(gradeBandFromExamMeta('lớp 12')).toBe('D');
  });

  it('primary là khối A, còn "secondary" trải hai khối nên không đoán', () => {
    expect(gradeBandFromExamMeta('primary')).toBe('A');
    expect(gradeBandFromExamMeta('Tiểu học')).toBe('A');
    expect(gradeBandFromExamMeta('secondary')).toBeNull();
    expect(gradeBandFromExamMeta('THCS')).toBeNull();
  });
});

describe('chọn khóa học', () => {
  function course(over: Partial<CourseCandidate> & { id: string }): CourseCandidate {
    return {
      name: `Khóa ${over.id}`,
      tagline: null,
      outcomes: [],
      subject: 'MATH',
      gradeBand: 'A',
      programId: 'p1',
      programCode: 'ASMOPSS',
      programName: 'ASMOPSS',
      programOrder: 0,
      logoEmoji: '🏆',
      enrolled: false,
      ...over,
    };
  }

  const target: MatchTarget = { programId: 'p1', subject: 'MATH', gradeBand: 'A' };

  it('khớp cả ba điều kiện thì đứng đầu', () => {
    const ranked = rankCourses(
      [
        course({ id: 'khac-het', programId: 'p2', subject: 'IT', gradeBand: 'D' }),
        course({ id: 'khop-mon', programId: 'p2' }),
        course({ id: 'khop-het' }),
      ],
      target,
    );
    expect(ranked[0]?.id).toBe('khop-het');
  });

  it('không khóa nào khớp hẳn thì vẫn đề xuất, không trả về danh sách rỗng', () => {
    const ranked = rankCourses(
      [course({ id: 'a', programId: 'p9', subject: 'IT', gradeBand: 'D' })],
      target,
    );
    expect(ranked).toHaveLength(1);
    expect(reasonFor(ranked[0]!, target)).toContain('đang mở');
  });

  it('nhiều nhất ba khóa để trang kết quả không thành chỗ rao hàng', () => {
    const many = Array.from({ length: 8 }, (_, index) => course({ id: `c${index}` }));
    expect(rankCourses(many, target)).toHaveLength(3);
  });

  it('khóa đang học được ưu tiên hơn khóa cùng độ khớp', () => {
    const ranked = rankCourses(
      [course({ id: 'chua-hoc' }), course({ id: 'dang-hoc', enrolled: true })],
      target,
    );
    expect(ranked[0]?.id).toBe('dang-hoc');
  });

  it('lý do nói đúng mức độ khớp, không tô hồng', () => {
    expect(reasonFor(course({ id: 'x' }), target)).toContain('Đúng kỳ thi');
    expect(reasonFor(course({ id: 'x', gradeBand: 'D' }), target)).toContain('Cùng kỳ thi và cùng môn');
    expect(reasonFor(course({ id: 'x', subject: 'IT' }), target)).toContain('cùng khối');
    expect(reasonFor(course({ id: 'x', subject: 'IT', programId: 'p2' }), target)).toContain(
      'đang mở',
    );
  });

  /**
   * Khối là ràng buộc cứng theo tuổi. Một em tiểu học không học được khóa khối
   * 10–12 dù cùng môn Toán, nhưng học được Khoa học cùng khối của mình.
   */
  it('cùng khối khác môn được xếp trên cùng môn khác khối', () => {
    const ranked = rankCourses(
      [
        course({ id: 'toan-khoi-D', gradeBand: 'D' }),
        course({ id: 'khoa-hoc-khoi-A', subject: 'SCIENCE' }),
      ],
      target,
    );
    expect(ranked[0]?.id).toBe('khoa-hoc-khoi-A');
  });

  it('lệch khối thì lệch ít được xếp trước', () => {
    const ranked = rankCourses(
      [course({ id: 'khoi-D', gradeBand: 'D' }), course({ id: 'khoi-B', gradeBand: 'B' })],
      target,
    );
    expect(ranked.map((c) => c.id)).toEqual(['khoi-B', 'khoi-D']);
  });

  it('đề không rõ kỳ thi/môn/khối thì mọi khóa đều là "đang mở", không bịa độ khớp', () => {
    const blind: MatchTarget = { programId: null, subject: null, gradeBand: null };
    expect(reasonFor(course({ id: 'x' }), blind)).toContain('đang mở');
  });
});

describe('lời dẫn cho khối đề xuất', () => {
  it('mỗi mức một lời khuyên khác nhau', () => {
    const texts = new Set([
      introFor('WEAK'),
      introFor('AVERAGE'),
      introFor('GOOD'),
      introFor('EXCELLENT'),
    ]);
    expect(texts.size).toBe(4);
  });

  it('chưa xếp được mức thì nói thẳng là đang chờ chấm', () => {
    expect(introFor(null)).toContain('Chấm xong');
  });
});
