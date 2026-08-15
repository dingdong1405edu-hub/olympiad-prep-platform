/**
 * Test tầng chấm không cần AI. Case lấy thẳng từ AI_GRADING_SPEC.md §3, §13 và
 * từ đáp án đề ASMOPSS 12 trong `prisma/seed-data/exam-asmopss-12.json`.
 *
 * Đây là phần điểm phải ĐÚNG 100% (spec §13 mục 6) nên test bám sát dữ liệu
 * thật của đề chứ không dùng ví dụ tự nghĩ.
 */
import { describe, expect, it } from 'vitest';
import { evaluateExpression } from './expr';
import { checkNumeric, normalizeNumeric } from './numeric';
import { checkExpression } from './expression';
import { autoGrade } from './auto-grade';

describe('evaluateExpression', () => {
  it('tính đúng bốn phép cơ bản và lũy thừa', () => {
    expect(evaluateExpression('8-4-2')).toEqual({ ok: true, value: 2 });
    expect(evaluateExpression('(8-4)/2')).toEqual({ ok: true, value: 2 });
    expect(evaluateExpression('2^4/8')).toEqual({ ok: true, value: 2 });
    expect(evaluateExpression('2+3*4')).toEqual({ ok: true, value: 14 });
  });

  it('hiểu ký hiệu người Việt hay gõ', () => {
    expect(evaluateExpression('8 × 4 ÷ 16')).toEqual({ ok: true, value: 2 });
    expect(evaluateExpression('27,5')).toEqual({ ok: true, value: 27.5 });
    expect(evaluateExpression('√9')).toEqual({ ok: true, value: 3 });
    expect(evaluateExpression('√(16)')).toEqual({ ok: true, value: 4 });
  });

  it('lũy thừa kết hợp phải sang trái và nhận số mũ âm', () => {
    expect(evaluateExpression('2^3^2')).toEqual({ ok: true, value: 512 });
    expect(evaluateExpression('(0.5)^-2')).toEqual({ ok: true, value: 4 });
  });

  it('chặn chia 0, căn số âm và ký tự lạ', () => {
    expect(evaluateExpression('1/0').ok).toBe(false);
    expect(evaluateExpression('√(-4)').ok).toBe(false);
    expect(evaluateExpression('alert(1)').ok).toBe(false);
    expect(evaluateExpression('process.exit()').ok).toBe(false);
    expect(evaluateExpression('2+').ok).toBe(false);
    expect(evaluateExpression('(2+3').ok).toBe(false);
  });

  it('từ chối chuỗi dài bất thường', () => {
    expect(evaluateExpression('1+'.repeat(200) + '1').ok).toBe(false);
  });
});

describe('normalizeNumeric', () => {
  it('quy mọi cách viết của 493/18 về cùng một số', () => {
    const expected = 493 / 18;
    for (const written of ['493/18', '27 7/18', '27.388889', '27,388889']) {
      const value = normalizeNumeric(written);
      expect(value).not.toBeNull();
      expect(Math.abs(value! - expected)).toBeLessThan(1e-5);
    }
  });

  it('cắt đơn vị viết kèm', () => {
    expect(normalizeNumeric('45°')).toBe(45);
    expect(normalizeNumeric('45 độ')).toBe(45);
    expect(normalizeNumeric('45 do')).toBe(45);
    expect(normalizeNumeric('9 cm')).toBe(9);
    expect(normalizeNumeric('13.5 cm²')).toBe(13.5);
  });

  it('hiểu hỗn số âm và bỏ qua chuỗi vô nghĩa', () => {
    expect(normalizeNumeric('-2 1/2')).toBe(-2.5);
    expect(normalizeNumeric('không biết')).toBeNull();
    expect(normalizeNumeric('')).toBeNull();
  });
});

describe('checkNumeric', () => {
  it('chấp nhận mọi cách viết tương đương (câu 6 của đề)', () => {
    for (const written of ['493/18', '27 7/18', '27.388889', '27,388889']) {
      expect(checkNumeric(written, '493/18', 1e-6)).toBe(true);
    }
  });

  it('bác đáp án làm tròn quá thô và đáp án sai', () => {
    expect(checkNumeric('27.39', '493/18', 1e-6)).toBe(false);
    expect(checkNumeric('28', '493/18', 1e-6)).toBe(false);
  });

  it('so được đáp số nguyên (câu 7, 8)', () => {
    expect(checkNumeric('45', '45')).toBe(true);
    expect(checkNumeric('9', '9')).toBe(true);
    expect(checkNumeric('10', '9')).toBe(false);
  });
});

describe('checkExpression — câu 10', () => {
  const config = { digits: [2, 4, 8], target: 2, tolerance: 1e-9 };

  it('nhận mọi đáp án mẫu in trong đề', () => {
    const samples = ['8-4-2', '(8-4)/2', '2^4/8', '4^2/8', '(2-0.4)/0.8', '0.2*8+0.4', '(4*8)^0.2'];
    for (const sample of samples) {
      expect(checkExpression(sample, config), sample).toMatchObject({ ok: true });
    }
  });

  it('bác biểu thức dùng sai chữ số, kèm lý do đọc được (spec §13 mục 3)', () => {
    const result = checkExpression('8-4-1', config);
    expect(result.ok).toBe(false);
    expect(result.reason).toContain('2, 4, 8');
  });

  it('bác biểu thức dùng thừa hoặc thiếu chữ số', () => {
    expect(checkExpression('8-4-2-2', config).ok).toBe(false);
    expect(checkExpression('8-4', config).ok).toBe(false);
    expect(checkExpression('82-4', config).ok).toBe(false);
  });

  it('bác biểu thức đúng chữ số nhưng sai kết quả, và nói ra nó bằng bao nhiêu', () => {
    const result = checkExpression('8+4+2', config);
    expect(result.ok).toBe(false);
    expect(result.reason).toContain('14');
  });

  it('không cho gọi hàm hay ký tự lạ', () => {
    expect(checkExpression('eval("2")', config).ok).toBe(false);
  });
});

describe('autoGrade', () => {
  const base = { answerJson: null, config: {} };

  it('EXACT — chấm trắc nghiệm, bỏ qua hoa thường và dấu chấm', () => {
    const question = { ...base, gradingMode: 'EXACT' as const, maxPoints: 2, answerKey: { value: 'B' } };
    expect(autoGrade({ ...question, answerText: 'B' })).toMatchObject({ correct: true, awarded: 2 });
    expect(autoGrade({ ...question, answerText: ' b. ' })).toMatchObject({ correct: true });
    expect(autoGrade({ ...question, answerText: 'C' })).toMatchObject({ correct: false, awarded: 0 });
    expect(autoGrade({ ...question, answerText: '' })).toMatchObject({ correct: false, awarded: 0 });
  });

  it('NUMERIC — cho điểm khi tương đương toán học', () => {
    const question = {
      ...base,
      gradingMode: 'NUMERIC' as const,
      maxPoints: 4,
      answerKey: { value: '493/18', display: '27 7/18', tolerance: 1e-6 },
    };
    expect(autoGrade({ ...question, answerText: '27 7/18' })).toMatchObject({ awarded: 4 });
    expect(autoGrade({ ...question, answerText: '493/18' })).toMatchObject({ awarded: 4 });
    expect(autoGrade({ ...question, answerText: '28' })).toMatchObject({ awarded: 0 });
  });

  it('NUMERIC — không đọc được thì cho 0 nhưng gắn cờ nhờ người xem lại', () => {
    const result = autoGrade({
      ...base,
      gradingMode: 'NUMERIC',
      maxPoints: 4,
      answerKey: { value: '9' },
      answerText: 'chín',
    });
    expect(result).toMatchObject({ awarded: 0, needsReview: true });
  });

  it('EXPRESSION — dùng cấu hình digits/target của câu', () => {
    const question = {
      gradingMode: 'EXPRESSION' as const,
      maxPoints: 4,
      answerKey: { examples: ['8-4-2'] },
      config: { digits: [2, 4, 8], target: 2, tolerance: 1e-9 },
      answerJson: null,
    };
    expect(autoGrade({ ...question, answerText: '(8-4)/2' })).toMatchObject({ awarded: 4 });
    expect(autoGrade({ ...question, answerText: '8-4-1' })).toMatchObject({ awarded: 0 });
  });

  it('GRID — chỉ cho điểm khi khớp toàn bộ lưới', () => {
    const grid = [
      ['/', '\\'],
      ['\\', '/'],
    ];
    const question = {
      gradingMode: 'GRID' as const,
      maxPoints: 7,
      answerKey: { grid },
      config: {},
      answerText: null,
    };
    expect(autoGrade({ ...question, answerJson: grid })).toMatchObject({ correct: true, awarded: 7 });

    const oneOff = autoGrade({
      ...question,
      answerJson: [
        ['/', '\\'],
        ['\\', '\\'],
      ],
    });
    expect(oneOff).toMatchObject({ correct: false, awarded: 0, needsReview: true });
    expect(oneOff?.detail.matchedCells).toBe(3);
  });

  it('ESSAY — trả null để chỗ gọi đẩy sang pipeline AI', () => {
    expect(
      autoGrade({
        ...base,
        gradingMode: 'ESSAY',
        maxPoints: 7,
        answerKey: { final: '56' },
        answerText: null,
      }),
    ).toBeNull();
  });
});
