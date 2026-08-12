/**
 * Kiểm thử phần THUẦN của luồng import: parser CSV và validate từng dòng.
 * Không chạm DB — taxonomy được nạp qua `context`.
 */
import { describe, expect, it } from 'vitest';
import { parseCsv, toCsv } from './csv';
import {
  IMPORT_TEMPLATE_HEADERS,
  buildImportTemplateCsv,
  validateImportRow,
  type ImportContext,
  type ImportSkillRef,
} from './import';

// ---------------------------------------------------------------------------
// Dữ liệu dùng chung
// ---------------------------------------------------------------------------

function skillRef(overrides: Partial<ImportSkillRef> = {}): ImportSkillRef {
  return {
    id: 'skill_1',
    code: 'PS-SO-SANH',
    name: 'So sánh phân số',
    chapterId: 'chapter_1',
    chapterCode: 'PS',
    chapterName: 'Phân số',
    subject: 'MATH',
    gradeBand: 'B',
    ...overrides,
  };
}

function makeContext(overrides: Partial<ImportContext> = {}): ImportContext {
  const skills = new Map<string, ImportSkillRef>();
  skills.set('PS-SO-SANH', skillRef());
  skills.set('HH-CHU-VI', skillRef({ id: 'skill_2', code: 'HH-CHU-VI', chapterCode: 'HH', chapterId: 'chapter_2' }));
  return {
    skillsByCode: skills,
    existingByCode: new Map(),
    programCodes: new Set(['ASMOPSS', 'NEO', 'STEM', 'FMC']),
    defaultEstimatedTime: 180,
    seenItemCodes: new Set<string>(),
    ...overrides,
  };
}

function validRow(overrides: Record<string, string> = {}): Record<string, string> {
  return {
    item_code: 'M67-PS-00001',
    chapter_code: 'PS',
    skill_code: 'PS-SO-SANH',
    difficulty: 'AVERAGE',
    question_type: 'SINGLE_CHOICE',
    stem: 'So sánh 3/4 và 5/8.',
    options: 'A: 3/4 > 5/8 | B: 3/4 < 5/8 | C: 3/4 = 5/8',
    correct_answer: 'A',
    solution: 'Quy đồng mẫu số: 3/4 = 6/8 > 5/8.',
    estimated_time: '90',
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// parseCsv / toCsv
// ---------------------------------------------------------------------------

describe('parseCsv', () => {
  it('giữ nguyên dấu phẩy nằm trong ô có ngoặc kép', () => {
    const csv = 'item_code,stem\nM1,"Một, hai, ba"\n';
    const { headers, rows } = parseCsv(csv);
    expect(headers).toEqual(['item_code', 'stem']);
    expect(rows).toHaveLength(1);
    expect(rows[0].stem).toBe('Một, hai, ba');
  });

  it('hiểu ngoặc kép lồng nhau dạng ""', () => {
    const csv = 'item_code,stem\nM1,"Chọn đáp án ""đúng"" nhất"\n';
    const { rows } = parseCsv(csv);
    expect(rows[0].stem).toBe('Chọn đáp án "đúng" nhất');
  });

  it('giữ xuống dòng bên trong ô và chuẩn hóa CRLF', () => {
    const csv = 'item_code,solution\r\nM1,"Bước 1: quy đồng\r\nBước 2: so sánh"\r\n';
    const { rows } = parseCsv(csv);
    expect(rows[0].solution).toBe('Bước 1: quy đồng\nBước 2: so sánh');
  });

  it('bỏ BOM UTF-8 ở đầu file và giữ nguyên tiếng Việt có dấu', () => {
    const csv = '\uFEFFitem_code,stem\nM1,"Tính chu vi hình chữ nhật, đơn vị mét"\n';
    const { headers, rows } = parseCsv(csv);
    expect(headers[0]).toBe('item_code');
    expect(rows[0].stem).toBe('Tính chu vi hình chữ nhật, đơn vị mét');
  });

  it('bỏ qua dòng trống và ô thiếu thì trả chuỗi rỗng', () => {
    const csv = 'a,b,c\r\n1,2,3\r\n\r\n4,5\r\n';
    const { rows } = parseCsv(csv);
    expect(rows).toHaveLength(2);
    expect(rows[1]).toEqual({ a: '4', b: '5', c: '' });
  });

  it('không nuốt ký tự khi ngoặc kép nằm giữa ô không có ngoặc kép', () => {
    const { rows } = parseCsv('item_code,stem\nM1,3" x 5"\n');
    expect(rows[0].stem).toBe('3" x 5"');
  });

  it('đi vòng tròn được với toCsv (kể cả LaTeX và dấu tiếng Việt)', () => {
    const headers = ['item_code', 'stem', 'tags'];
    const rows = [
      { item_code: 'M1', stem: 'Tính $\\frac{3}{4}$, làm tròn 2 chữ số', tags: 'phân số|làm tròn' },
      { item_code: 'M2', stem: 'Dòng 1\nDòng 2 có "ngoặc kép"', tags: '' },
    ];
    const parsed = parseCsv(toCsv(headers, rows));
    expect(parsed.headers).toEqual(headers);
    expect(parsed.rows).toEqual(rows);
  });
});

// ---------------------------------------------------------------------------
// validateImportRow — taxonomy
// ---------------------------------------------------------------------------

describe('validateImportRow — taxonomy bắt buộc trước khi import', () => {
  it('chấp nhận dòng hợp lệ và luôn đặt trạng thái DRAFT', () => {
    const result = validateImportRow(validRow(), makeContext(), 2);
    expect(result.errors).toEqual([]);
    expect(result.action).toBe('CREATE');
    expect(result.itemCode).toBe('M67-PS-00001');
    expect(result.data?.targetStatus).toBe('DRAFT');
    expect(result.data?.skillId).toBe('skill_1');
    expect(result.data?.subject).toBe('MATH');
    expect(result.data?.gradeBand).toBe('B');
  });

  it('báo lỗi khi thiếu skill_code', () => {
    const result = validateImportRow(validRow({ skill_code: '' }), makeContext());
    expect(result.action).toBe('ERROR');
    expect(result.errors.some((e) => e.includes('Thiếu skill_code'))).toBe(true);
  });

  it('báo lỗi khi thiếu chapter_code', () => {
    const result = validateImportRow(validRow({ chapter_code: '' }), makeContext());
    expect(result.action).toBe('ERROR');
    expect(result.errors.some((e) => e.includes('Thiếu chapter_code'))).toBe(true);
  });

  it('không tự tạo kỹ năng mới: skill_code lạ phải báo lỗi kèm hướng dẫn', () => {
    const result = validateImportRow(validRow({ skill_code: 'KHONG-CO' }), makeContext());
    expect(result.action).toBe('ERROR');
    const message = result.errors.join(' ');
    expect(message).toContain('KHONG-CO');
    expect(message).toContain('taxonomy');
  });

  it('báo lỗi khi chapter_code không khớp chương của kỹ năng', () => {
    const result = validateImportRow(validRow({ chapter_code: 'HH' }), makeContext());
    expect(result.action).toBe('ERROR');
    expect(result.errors.some((e) => e.includes('không khớp'))).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// validateImportRow — nội dung câu hỏi
// ---------------------------------------------------------------------------

describe('validateImportRow — nội dung và đáp án', () => {
  it('báo lỗi khi đáp án không nằm trong danh sách phương án', () => {
    const result = validateImportRow(validRow({ correct_answer: 'D' }), makeContext());
    expect(result.action).toBe('ERROR');
    expect(result.errors.some((e) => e.includes('không nằm trong danh sách phương án'))).toBe(true);
  });

  it('báo lỗi khi câu trắc nghiệm không có phương án', () => {
    const result = validateImportRow(validRow({ options: '' }), makeContext());
    expect(result.action).toBe('ERROR');
    expect(result.errors.some((e) => e.includes('options'))).toBe(true);
  });

  it('báo lỗi khi thiếu solution — lời giải là nguồn grounding duy nhất cho AI', () => {
    const result = validateImportRow(validRow({ solution: '' }), makeContext());
    expect(result.action).toBe('ERROR');
    expect(result.errors.some((e) => e.includes('Thiếu solution'))).toBe(true);
  });

  it('báo lỗi khi câu NUMERIC có đáp án không phải số', () => {
    const result = validateImportRow(
      validRow({ question_type: 'NUMERIC', options: '', correct_answer: 'ba mươi tám' }),
      makeContext(),
    );
    expect(result.action).toBe('ERROR');
    expect(result.errors.some((e) => e.includes('không phải là số'))).toBe(true);
  });

  it('chấp nhận số thập phân viết theo kiểu Việt Nam cho câu NUMERIC', () => {
    const result = validateImportRow(
      validRow({ question_type: 'NUMERIC', options: '', correct_answer: '0,5', answer_tolerance: '0,01' }),
      makeContext(),
    );
    expect(result.errors).toEqual([]);
    expect(result.data?.correctAnswer).toBe(0.5);
    expect(result.data?.answerTolerance).toBe(0.01);
    expect(result.data?.options).toEqual([]);
  });

  it('nhận nhiều đáp án đúng cho câu MULTIPLE_CHOICE', () => {
    const result = validateImportRow(
      validRow({ question_type: 'MULTIPLE_CHOICE', correct_answer: 'A|C' }),
      makeContext(),
    );
    expect(result.errors).toEqual([]);
    expect(result.data?.correctAnswer).toEqual(['A', 'C']);
  });

  it('báo lỗi khi câu SINGLE_CHOICE khai nhiều hơn một đáp án', () => {
    const result = validateImportRow(validRow({ correct_answer: 'A|B' }), makeContext());
    expect(result.action).toBe('ERROR');
    expect(result.errors.some((e) => e.includes('đúng một đáp án'))).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// validateImportRow — chuẩn hóa dữ liệu
// ---------------------------------------------------------------------------

describe('validateImportRow — chuẩn hóa và cảnh báo', () => {
  it('hiểu độ khó ghi bằng nhãn tiếng Việt', () => {
    const context = makeContext();
    const average = validateImportRow(validRow({ difficulty: 'Trung bình' }), context, 2);
    const good = validateImportRow(validRow({ item_code: 'M67-PS-2', difficulty: 'Khá' }), context, 3);
    const excellent = validateImportRow(validRow({ item_code: 'M67-PS-3', difficulty: 'Giỏi' }), context, 4);

    expect(average.data?.difficulty).toBe('AVERAGE');
    expect(good.data?.difficulty).toBe('GOOD');
    expect(excellent.data?.difficulty).toBe('EXCELLENT');
    expect(average.errors).toEqual([]);
  });

  it('hiểu độ khó viết không dấu', () => {
    const result = validateImportRow(validRow({ difficulty: 'trung binh' }), makeContext());
    expect(result.data?.difficulty).toBe('AVERAGE');
  });

  it('báo lỗi khi độ khó không hợp lệ', () => {
    const result = validateImportRow(validRow({ difficulty: 'Siêu khó' }), makeContext());
    expect(result.action).toBe('ERROR');
    expect(result.errors.some((e) => e.includes('Độ khó'))).toBe(true);
  });

  it('cảnh báo và dùng mặc định khi estimated_time không hợp lệ', () => {
    const result = validateImportRow(validRow({ estimated_time: 'nhanh' }), makeContext());
    expect(result.action).toBe('CREATE');
    expect(result.errors).toEqual([]);
    expect(result.data?.estimatedTime).toBe(180);
    expect(result.warnings.some((w) => w.includes('estimated_time'))).toBe(true);
  });

  it('đọc được tên cột tiếng Việt của đội biên soạn', () => {
    const row = {
      'Mã câu': 'M67-PS-00009',
      'Chương': 'PS',
      'Kỹ năng': 'PS-SO-SANH',
      'Độ khó': 'Khá',
      'Đề bài': 'So sánh hai phân số.',
      'Phương án': 'A: Lớn hơn | B: Nhỏ hơn',
      'Đáp án': 'B',
      'Lời giải': 'Quy đồng rồi so sánh tử số.',
      'Thời gian': '75',
    };
    const result = validateImportRow(row, makeContext());
    expect(result.errors).toEqual([]);
    expect(result.data?.difficulty).toBe('GOOD');
    expect(result.data?.estimatedTime).toBe(75);
  });

  it('bỏ lớp nằm ngoài khối và cảnh báo mã program lạ', () => {
    const result = validateImportRow(
      validRow({ actual_grade_scope: '7|11', program_scope: 'NEO|XYZ' }),
      makeContext(),
    );
    expect(result.data?.actualGradeScope).toEqual([7]);
    expect(result.warnings.some((w) => w.includes('Lớp 11'))).toBe(true);
    expect(result.warnings.some((w) => w.includes('XYZ'))).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// validateImportRow — hành động CREATE / UPDATE / SKIP
// ---------------------------------------------------------------------------

describe('validateImportRow — quyết định hành động', () => {
  it('itemCode đã có trong kho thì là UPDATE', () => {
    const context = makeContext({
      existingByCode: new Map([
        ['M67-PS-00001', { id: 'item_1', itemCode: 'M67-PS-00001', status: 'DRAFT' as const, version: 3 }],
      ]),
    });
    const result = validateImportRow(validRow(), context);
    expect(result.action).toBe('UPDATE');
    expect(result.data?.existingItemId).toBe('item_1');
    expect(result.warnings.some((w) => w.includes('phiên bản 3'))).toBe(true);
  });

  it('cảnh báo rõ khi ghi đè câu đang xuất bản', () => {
    const context = makeContext({
      existingByCode: new Map([
        ['M67-PS-00001', { id: 'item_1', itemCode: 'M67-PS-00001', status: 'PUBLISHED' as const, version: 2 }],
      ]),
    });
    const result = validateImportRow(validRow(), context);
    expect(result.action).toBe('UPDATE');
    expect(result.data?.targetStatus).toBe('DRAFT');
    expect(result.warnings.some((w) => w.includes('thẩm định lại'))).toBe(true);
  });

  it('báo lỗi khi item_code lặp lại trong cùng file', () => {
    const context = makeContext();
    const first = validateImportRow(validRow(), context, 2);
    const second = validateImportRow(validRow(), context, 3);
    expect(first.action).toBe('CREATE');
    expect(second.action).toBe('ERROR');
    expect(second.errors.some((e) => e.includes('nhiều lần trong cùng file'))).toBe(true);
  });

  it('báo lỗi khi thiếu item_code', () => {
    const result = validateImportRow(validRow({ item_code: '' }), makeContext());
    expect(result.action).toBe('ERROR');
    expect(result.errors.some((e) => e.includes('item_code'))).toBe(true);
  });

  it('bỏ qua dòng trống và dòng đánh dấu bỏ qua', () => {
    const blank = validateImportRow({ item_code: '', stem: '   ' }, makeContext(), 5);
    expect(blank.action).toBe('SKIP');

    const marked = validateImportRow(validRow({ action: 'bỏ qua' }), makeContext(), 6);
    expect(marked.action).toBe('SKIP');
  });
});

// ---------------------------------------------------------------------------
// File mẫu
// ---------------------------------------------------------------------------

describe('buildImportTemplateCsv', () => {
  it('sinh file mẫu 2 dòng ví dụ, đọc lại được và hợp lệ khi taxonomy đã có', () => {
    const csv = buildImportTemplateCsv();
    const { headers, rows } = parseCsv(csv);

    expect(headers).toEqual(IMPORT_TEMPLATE_HEADERS);
    expect(rows).toHaveLength(2);

    const skills = new Map<string, ImportSkillRef>();
    rows.forEach((row, index) => {
      skills.set(row.skill_code, skillRef({
        id: `skill_${index}`,
        code: row.skill_code,
        chapterCode: row.chapter_code,
        chapterId: `chapter_${index}`,
      }));
    });

    const context = makeContext({ skillsByCode: skills });
    const results = rows.map((row, index) => validateImportRow(row, context, index + 2));

    for (const result of results) {
      expect(result.errors).toEqual([]);
      expect(result.action).toBe('CREATE');
    }
    expect(results[1].data?.correctAnswer).toBe(38);
    expect(results[0].data?.options).toHaveLength(4);
  });
});
