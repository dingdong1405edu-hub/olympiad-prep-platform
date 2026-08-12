import { describe, expect, it } from 'vitest';
import { gradeAnswer } from './grading';

describe('gradeAnswer — SINGLE_CHOICE', () => {
  const item = { questionType: 'SINGLE_CHOICE' as const, correctAnswer: 'B' };

  it('chấm đúng khi khớp khóa phương án', () => {
    expect(gradeAnswer(item, 'B').isCorrect).toBe(true);
  });

  it('bỏ qua hoa thường và khoảng trắng thừa', () => {
    expect(gradeAnswer(item, '  b ').isCorrect).toBe(true);
    expect(gradeAnswer(item, 'b').normalizedAnswer).toBe('b');
  });

  it('chấm sai khi chọn khác đáp án', () => {
    expect(gradeAnswer(item, 'C').isCorrect).toBe(false);
  });

  it('chấp nhận nhiều khóa tương đương ở correctAnswer', () => {
    const multiKey = { questionType: 'SINGLE_CHOICE' as const, correctAnswer: ['B', 'D'] };
    expect(gradeAnswer(multiKey, 'D').isCorrect).toBe(true);
    expect(gradeAnswer(multiKey, 'A').isCorrect).toBe(false);
  });

  it('không cho chọn nhiều phương án ở câu một đáp án', () => {
    const result = gradeAnswer(item, ['B', 'C']);
    expect(result.isCorrect).toBe(false);
    expect(result.message).toContain('một phương án');
  });

  it('báo rõ khi câu hỏi thiếu đáp án chuẩn thay vì chấm bừa', () => {
    const broken = { questionType: 'SINGLE_CHOICE' as const, correctAnswer: '' };
    const result = gradeAnswer(broken, 'A');
    expect(result.isCorrect).toBe(false);
    expect(result.message).toContain('Báo lỗi câu hỏi');
  });
});

describe('gradeAnswer — MULTIPLE_CHOICE', () => {
  const item = { questionType: 'MULTIPLE_CHOICE' as const, correctAnswer: ['A', 'C'] };

  it('đúng khi tập hợp trùng khớp dù thứ tự khác nhau', () => {
    expect(gradeAnswer(item, ['C', 'A']).isCorrect).toBe(true);
    expect(gradeAnswer(item, ['A', 'C']).isCorrect).toBe(true);
  });

  it('bỏ qua hoa thường, khoảng trắng và lựa chọn trùng lặp', () => {
    expect(gradeAnswer(item, [' c ', 'a', 'A']).isCorrect).toBe(true);
  });

  it('chấp nhận chuỗi ngăn cách bằng dấu phẩy', () => {
    expect(gradeAnswer(item, 'C, A').isCorrect).toBe(true);
  });

  it('sai khi chọn thiếu', () => {
    const result = gradeAnswer(item, ['A']);
    expect(result.isCorrect).toBe(false);
    expect(result.message).toContain('thiếu hoặc thừa');
  });

  it('sai khi chọn thừa', () => {
    expect(gradeAnswer(item, ['A', 'B', 'C']).isCorrect).toBe(false);
  });

  it('chuẩn hóa lựa chọn theo thứ tự ổn định để lưu lại', () => {
    expect(gradeAnswer(item, ['C', 'A']).normalizedAnswer).toEqual(['A', 'C']);
  });
});

describe('gradeAnswer — NUMERIC', () => {
  it('so khớp tuyệt đối khi không có sai số cho phép', () => {
    const item = { questionType: 'NUMERIC' as const, correctAnswer: 12 };
    expect(gradeAnswer(item, 12).isCorrect).toBe(true);
    expect(gradeAnswer(item, 12.01).isCorrect).toBe(false);
  });

  it('chấp nhận dấu phẩy thập phân kiểu Việt Nam', () => {
    const item = { questionType: 'NUMERIC' as const, correctAnswer: 1.5 };
    expect(gradeAnswer(item, '1,5').isCorrect).toBe(true);
    expect(gradeAnswer(item, ' 1.5 ').isCorrect).toBe(true);
    expect(gradeAnswer(item, '1,5').normalizedAnswer).toBe(1.5);
  });

  it('hiểu dấu chấm là phân cách nghìn khi đi kèm dấu phẩy thập phân', () => {
    const item = { questionType: 'NUMERIC' as const, correctAnswer: 1234.5 };
    expect(gradeAnswer(item, '1.234,5').isCorrect).toBe(true);
  });

  it('áp dụng answerTolerance', () => {
    const item = { questionType: 'NUMERIC' as const, correctAnswer: 3.14159, answerTolerance: 0.01 };
    expect(gradeAnswer(item, '3,14').isCorrect).toBe(true);
    expect(gradeAnswer(item, '3,1').isCorrect).toBe(false);
  });

  it('không bị lỗi làm tròn dấu phẩy động', () => {
    const item = { questionType: 'NUMERIC' as const, correctAnswer: 0.3 };
    expect(gradeAnswer(item, 0.1 + 0.2).isCorrect).toBe(true);
  });

  it('chấp nhận mảng nhiều đáp án số', () => {
    const item = { questionType: 'NUMERIC' as const, correctAnswer: [2, -2] };
    expect(gradeAnswer(item, '-2').isCorrect).toBe(true);
  });

  it('báo rõ khi học sinh nhập chữ vào câu điền số', () => {
    const item = { questionType: 'NUMERIC' as const, correctAnswer: 5 };
    const result = gradeAnswer(item, 'năm');
    expect(result.isCorrect).toBe(false);
    expect(result.message).toContain('phải là một số');
  });
});

describe('gradeAnswer — SHORT_ANSWER', () => {
  const item = { questionType: 'SHORT_ANSWER' as const, correctAnswer: 'Hình thoi' };

  it('bỏ qua hoa thường và khoảng trắng thừa', () => {
    expect(gradeAnswer(item, '  hình   thoi ').isCorrect).toBe(true);
  });

  it('bỏ dấu câu ở cuối', () => {
    expect(gradeAnswer(item, 'Hình thoi.').isCorrect).toBe(true);
    expect(gradeAnswer(item, 'hình thoi!!').isCorrect).toBe(true);
  });

  it('hỗ trợ mảng nhiều đáp án chấp nhận được', () => {
    const multi = {
      questionType: 'SHORT_ANSWER' as const,
      correctAnswer: ['hình thoi', 'hinh thoi', 'tứ giác đều cạnh'],
    };
    expect(gradeAnswer(multi, 'Tứ giác đều cạnh').isCorrect).toBe(true);
    expect(gradeAnswer(multi, 'hình vuông').isCorrect).toBe(false);
  });

  it('vẫn so được theo số khi đáp án chuẩn là số', () => {
    const numericText = { questionType: 'SHORT_ANSWER' as const, correctAnswer: '2.5' };
    expect(gradeAnswer(numericText, '2,5').isCorrect).toBe(true);
  });

  it('giữ nguyên chữ hoa thường học sinh nhập khi lưu lại', () => {
    expect(gradeAnswer(item, '  Hình   Thoi  ').normalizedAnswer).toBe('Hình Thoi');
  });
});

describe('gradeAnswer — đáp án rỗng', () => {
  const cases = [
    { questionType: 'SINGLE_CHOICE' as const, correctAnswer: 'A' },
    { questionType: 'MULTIPLE_CHOICE' as const, correctAnswer: ['A', 'B'] },
    { questionType: 'NUMERIC' as const, correctAnswer: 10 },
    { questionType: 'SHORT_ANSWER' as const, correctAnswer: 'abc' },
  ];

  it('không ném lỗi với null, undefined, chuỗi rỗng, mảng rỗng', () => {
    for (const item of cases) {
      for (const answer of [null, undefined, '', '   ', []]) {
        const result = gradeAnswer(item, answer);
        expect(result.isCorrect).toBe(false);
        expect(result.normalizedAnswer).toBeNull();
        expect(result.message).toBeTruthy();
      }
    }
  });

  it('coi NaN như chưa trả lời', () => {
    const result = gradeAnswer({ questionType: 'NUMERIC', correctAnswer: 1 }, Number.NaN);
    expect(result.isCorrect).toBe(false);
    expect(result.normalizedAnswer).toBeNull();
  });
});
