/**
 * Import câu hỏi hàng loạt từ CSV (specs §9.4, Sprint 2).
 *
 * Nguyên tắc vận hành (specs §18 — "bắt buộc taxonomy trước khi import lớn"):
 *  - Taxonomy phải có TRƯỚC. Import không bao giờ tự tạo chương/kỹ năng mới:
 *    tạo ngầm = tagging sai hàng loạt và phải làm lại toàn bộ kho.
 *  - Validate toàn bộ file rồi mới ghi. `dryRun` là chế độ mặc định UI phải gọi.
 *  - Câu import vào luôn ở trạng thái DRAFT — không có đường tắt lên PUBLISHED.
 */
import type {
  Difficulty,
  GradeBand,
  ItemStatus,
  Prisma,
  QuestionItem,
  QuestionType,
  Subject,
} from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { ApiError } from '@/lib/http';
import { AUDIT_ACTIONS, writeAudit } from '@/lib/audit';
import { getConfig } from '@/lib/config';
import {
  DIFFICULTIES,
  DIFFICULTY_LABEL,
  GRADE_BAND_GRADES,
  GRADE_BANDS,
  ITEM_STATUS_LABEL,
  QUESTION_TYPE_LABEL,
} from '@/lib/domain';
import { toCsv } from './csv';
import {
  DIFFICULTY_NUMERIC_MAX,
  DIFFICULTY_NUMERIC_MIN,
  QUESTION_TYPE_VALUES,
  SUBJECT_VALUES,
  autoOptionKey,
  checkAnswerConsistency,
  defaultDifficultyNumeric,
  defaultEstimatedTimeSeconds,
  type ItemOption,
} from './schemas';

// ---------------------------------------------------------------------------
// Kiểu dữ liệu công khai
// ---------------------------------------------------------------------------

export interface ImportRowResult {
  rowNumber: number;
  itemCode: string | null;
  action: 'CREATE' | 'UPDATE' | 'SKIP' | 'ERROR';
  errors: string[];
  warnings: string[];
  /** Dữ liệu đã chuẩn hóa — chỉ dùng nội bộ khi ghi, bị lược khỏi báo cáo trả về. */
  data?: ParsedImportRow;
}

export interface ImportReport {
  total: number;
  created: number;
  updated: number;
  skipped: number;
  failed: number;
  rows: ImportRowResult[];
  /** true = chỉ kiểm tra, không ghi gì vào DB. */
  dryRun: boolean;
}

export interface ParsedImportRow {
  itemCode: string;
  skillId: string;
  chapterId: string;
  subject: Subject;
  gradeBand: GradeBand;
  programScope: string[];
  actualGradeScope: number[];
  difficulty: Difficulty;
  difficultyNumeric: number;
  questionType: QuestionType;
  stem: string;
  stemImageUrl: string | null;
  options: ItemOption[];
  correctAnswer: string | string[] | number;
  answerTolerance: number | null;
  solution: string;
  solutionSteps: string[];
  hint: string | null;
  estimatedTime: number;
  tags: string[];
  sourceNote: string | null;
  /** Import luôn ghi DRAFT (specs §5.3). */
  targetStatus: ItemStatus;
  existingItemId: string | null;
}

export interface ImportSkillRef {
  id: string;
  code: string;
  name: string;
  chapterId: string;
  chapterCode: string;
  chapterName: string;
  subject: Subject;
  gradeBand: GradeBand;
}

export interface ImportExistingItem {
  id: string;
  itemCode: string;
  status: ItemStatus;
  version: number;
}

export interface ImportContext {
  /** Khóa: mã kỹ năng viết hoa. Nguồn sự thật taxonomy đã có trong DB. */
  skillsByCode: Map<string, ImportSkillRef>;
  /** Khóa: itemCode viết hoa. Có mặt ở đây nghĩa là UPDATE chứ không tạo mới. */
  existingByCode?: Map<string, ImportExistingItem>;
  /** Mã program hợp lệ để cảnh báo khi program_scope ghi sai. */
  programCodes?: Set<string>;
  defaultEstimatedTime?: number;
  /** Bộ nhớ trong một lần import để bắt itemCode trùng giữa các dòng. */
  seenItemCodes?: Set<string>;
}

/** Khớp default của Prisma schema; importItems truyền giá trị suy từ cấu hình. */
export const FALLBACK_ESTIMATED_TIME_SECONDS = 60;

/** Trần kỹ thuật mỗi lần import — file lớn hơn phải chia lô để không nghẽn DB. */
export const IMPORT_MAX_ROWS = 5000;

export const IMPORT_TEMPLATE_HEADERS: string[] = [
  'item_code',
  'program_scope',
  'grade_band',
  'actual_grade_scope',
  'subject',
  'chapter_code',
  'skill_code',
  'difficulty',
  'difficulty_numeric',
  'question_type',
  'stem',
  'stem_image_url',
  'options',
  'correct_answer',
  'answer_tolerance',
  'solution',
  'solution_steps',
  'hint',
  'estimated_time',
  'tags',
  'source_note',
  'action',
];

// ---------------------------------------------------------------------------
// Tiện ích chuẩn hóa
// ---------------------------------------------------------------------------

/** Bỏ dấu tiếng Việt để so khớp nhãn/nhan đề cột do người nhập gõ tự do. */
function deaccent(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D');
}

function normalizeKey(key: string): string {
  return deaccent(key).trim().toLowerCase().replace(/[\s.-]+/g, '_').replace(/_+/g, '_');
}

/** Tên cột tiếng Việt thường gặp trong file của đội biên soạn. */
const HEADER_ALIASES: Record<string, string> = {
  ma_cau: 'item_code',
  ma_cau_hoi: 'item_code',
  ma_item: 'item_code',
  item_id: 'item_code',
  code: 'item_code',
  chuong_trinh: 'program_scope',
  program: 'program_scope',
  khoi: 'grade_band',
  khoi_lop: 'grade_band',
  band: 'grade_band',
  lop: 'actual_grade_scope',
  lop_thuc_te: 'actual_grade_scope',
  mon: 'subject',
  mon_hoc: 'subject',
  chuong: 'chapter_code',
  ma_chuong: 'chapter_code',
  chapter: 'chapter_code',
  ky_nang: 'skill_code',
  ma_ky_nang: 'skill_code',
  skill: 'skill_code',
  do_kho: 'difficulty',
  muc_do: 'difficulty',
  do_kho_so: 'difficulty_numeric',
  loai_cau: 'question_type',
  dang_cau: 'question_type',
  de_bai: 'stem',
  noi_dung: 'stem',
  cau_hoi: 'stem',
  anh_de_bai: 'stem_image_url',
  phuong_an: 'options',
  cac_phuong_an: 'options',
  dap_an: 'correct_answer',
  dap_an_dung: 'correct_answer',
  sai_so: 'answer_tolerance',
  loi_giai: 'solution',
  huong_dan_giai: 'solution',
  cac_buoc_giai: 'solution_steps',
  goi_y: 'hint',
  thoi_gian: 'estimated_time',
  thoi_gian_chuan: 'estimated_time',
  nhan: 'tags',
  the: 'tags',
  nguon: 'source_note',
  ghi_chu_nguon: 'source_note',
  hanh_dong: 'action',
};

/** Đọc ô theo tên cột chuẩn, chấp nhận cả tên cột tiếng Việt/khác hoa thường. */
function fieldReader(row: Record<string, string>): (field: string) => string {
  const map = new Map<string, string>();
  for (const [rawKey, rawValue] of Object.entries(row ?? {})) {
    const key = normalizeKey(rawKey);
    const canonical = HEADER_ALIASES[key] ?? key;
    const value = (rawValue ?? '').trim();
    if (value === '' && map.has(canonical)) continue;
    map.set(canonical, value);
  }
  return (field: string) => map.get(field) ?? '';
}

/** Tách danh sách phân cách bằng | ; hoặc , */
function splitList(value: string): string[] {
  if (!value.trim()) return [];
  return value
    .split(/[|;,]/)
    .map((v) => v.trim())
    .filter((v) => v.length > 0);
}

/** Số nguyên dương; trả null nếu không đọc được. */
function parseIntStrict(value: string): number | null {
  const v = value.trim();
  if (!/^[+-]?\d+$/.test(v)) return null;
  return Number(v);
}

/** Số thực, chấp nhận dấu phẩy thập phân kiểu Việt Nam ("0,5"). */
function parseNumberStrict(value: string): number | null {
  const raw = value.trim().replace(/\s/g, '');
  if (!raw) return null;
  const normalized = raw.includes('.') ? raw.replace(/,/g, '') : raw.replace(',', '.');
  if (!/^[+-]?\d+(\.\d+)?$/.test(normalized)) return null;
  const num = Number(normalized);
  return Number.isFinite(num) ? num : null;
}

/** Chấp nhận mã enum, nhãn tiếng Việt (có/không dấu) và vài bí danh quen dùng. */
function parseDifficulty(value: string): Difficulty | null {
  const token = deaccent(value).trim().toUpperCase().replace(/\s+/g, '_');
  if (!token) return null;
  const byCode = DIFFICULTIES.find((d) => d === token);
  if (byCode) return byCode;
  const byLabel = DIFFICULTIES.find(
    (d) => deaccent(DIFFICULTY_LABEL[d]).toUpperCase().replace(/\s+/g, '_') === token,
  );
  if (byLabel) return byLabel;
  const aliases: Record<string, Difficulty> = {
    TB: 'AVERAGE',
    MEDIUM: 'AVERAGE',
    CO_BAN: 'AVERAGE',
    KHA: 'GOOD',
    GIOI: 'EXCELLENT',
    NANG_CAO: 'EXCELLENT',
    HARD: 'EXCELLENT',
  };
  return aliases[token] ?? null;
}

function parseQuestionType(value: string): QuestionType | null {
  const token = deaccent(value).trim().toUpperCase().replace(/\s+/g, '_');
  if (!token) return null;
  const byCode = QUESTION_TYPE_VALUES.find((t) => t === token);
  if (byCode) return byCode;
  const byLabel = QUESTION_TYPE_VALUES.find(
    (t) => deaccent(QUESTION_TYPE_LABEL[t]).toUpperCase().replace(/\s+/g, '_') === token,
  );
  if (byLabel) return byLabel;
  const aliases: Record<string, QuestionType> = {
    SINGLE: 'SINGLE_CHOICE',
    ONE_CHOICE: 'SINGLE_CHOICE',
    MULTI: 'MULTIPLE_CHOICE',
    MULTIPLE: 'MULTIPLE_CHOICE',
    NUMBER: 'NUMERIC',
    DIEN_SO: 'NUMERIC',
    SHORT: 'SHORT_ANSWER',
    TU_LUAN_NGAN: 'SHORT_ANSWER',
  };
  return aliases[token] ?? null;
}

/**
 * Đọc phương án trả lời từ ô CSV. Hai định dạng được chấp nhận:
 *  - JSON: [{"key":"A","text":"..."}]
 *  - Phân cách bằng "|": `A: 3/4 | B) 5/8 | C. 1` (thiếu ký hiệu thì tự đánh A, B, C…)
 */
function parseOptionsCell(raw: string): ItemOption[] {
  const value = raw.trim();
  if (!value) return [];

  if (value.startsWith('[')) {
    try {
      const parsed: unknown = JSON.parse(value);
      if (Array.isArray(parsed)) {
        const out: ItemOption[] = [];
        parsed.forEach((entry, index) => {
          if (typeof entry === 'string') {
            const text = entry.trim();
            if (text) out.push({ key: autoOptionKey(index), text });
            return;
          }
          if (entry && typeof entry === 'object') {
            const record = entry as Record<string, unknown>;
            const text = typeof record.text === 'string' ? record.text.trim() : '';
            if (!text) return;
            const key =
              typeof record.key === 'string' && record.key.trim()
                ? record.key.trim().toUpperCase()
                : autoOptionKey(index);
            const imageUrl =
              typeof record.imageUrl === 'string' && record.imageUrl.trim() ? record.imageUrl.trim() : undefined;
            out.push(imageUrl ? { key, text, imageUrl } : { key, text });
          }
        });
        return out;
      }
    } catch {
      // Không phải JSON hợp lệ → rơi xuống cách tách bằng "|"
    }
  }

  return value
    .split('|')
    .map((part) => part.trim())
    .filter((part) => part.length > 0)
    .map((part, index) => {
      const matched = /^([A-Za-z]|\d{1,2})[.):]\s*(.+)$/.exec(part);
      if (matched) return { key: matched[1].toUpperCase(), text: matched[2].trim() };
      return { key: autoOptionKey(index), text: part };
    });
}

/** Tách danh sách ký hiệu đáp án; hỗ trợ cả kiểu viết dính "AC". */
function parseAnswerKeys(raw: string, optionKeys: string[]): string[] {
  const tokens = raw
    .split(/[|;,\s]+/)
    .map((t) => t.trim().toUpperCase())
    .filter((t) => t.length > 0);

  const expanded: string[] = [];
  for (const token of tokens) {
    if (optionKeys.includes(token)) {
      expanded.push(token);
      continue;
    }
    const chars = token.split('');
    if (chars.length > 1 && chars.every((c) => optionKeys.includes(c))) {
      expanded.push(...chars);
      continue;
    }
    expanded.push(token);
  }
  return expanded;
}

// ---------------------------------------------------------------------------
// Validate một dòng — hàm thuần, không chạm DB
// ---------------------------------------------------------------------------

const SKIP_TOKENS = ['SKIP', 'BO_QUA', 'BOQUA', 'X', 'IGNORE'];

export function validateImportRow(
  row: Record<string, string>,
  context: ImportContext,
  rowNumber = 0,
): ImportRowResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const get = fieldReader(row);

  const isBlank = Object.values(row ?? {}).every((v) => (v ?? '').trim() === '');
  if (isBlank) {
    return { rowNumber, itemCode: null, action: 'SKIP', errors, warnings: ['Dòng trống — đã bỏ qua.'] };
  }

  const actionCell = deaccent(get('action')).trim().toUpperCase().replace(/\s+/g, '_');
  if (SKIP_TOKENS.includes(actionCell)) {
    return {
      rowNumber,
      itemCode: get('item_code').trim().toUpperCase() || null,
      action: 'SKIP',
      errors,
      warnings: ['Dòng được đánh dấu bỏ qua ở cột "action".'],
    };
  }

  // --- Mã câu hỏi ---------------------------------------------------------
  const itemCode = get('item_code').trim().toUpperCase().replace(/\s+/g, '');
  if (!itemCode) {
    errors.push('Thiếu item_code — mỗi câu phải có mã duy nhất và không đổi (ví dụ: M67-RATIO-00127).');
  } else if (!/^[A-Z0-9._-]{3,64}$/.test(itemCode)) {
    errors.push('item_code chỉ được gồm chữ, số và ký tự . _ - (độ dài 3–64).');
  } else {
    const seen = context.seenItemCodes;
    if (seen) {
      if (seen.has(itemCode)) {
        errors.push(`item_code "${itemCode}" xuất hiện nhiều lần trong cùng file — hãy giữ lại một dòng duy nhất.`);
      }
      seen.add(itemCode);
    }
  }

  // --- Taxonomy (bắt buộc có trước khi import — specs §18) -----------------
  const chapterCode = get('chapter_code').trim().toUpperCase();
  const skillCode = get('skill_code').trim().toUpperCase();

  if (!chapterCode) {
    errors.push('Thiếu chapter_code — phải khai báo taxonomy (chương) trước khi import.');
  }
  if (!skillCode) {
    errors.push('Thiếu skill_code — không có kỹ năng thì hệ thống không cá nhân hóa được (specs §3.3).');
  }

  const skill = skillCode ? context.skillsByCode.get(skillCode) ?? null : null;
  if (skillCode && !skill) {
    errors.push(
      `Kỹ năng "${skillCode}" chưa tồn tại. Hãy khai báo taxonomy (chương → kỹ năng) trong Admin trước khi import; import KHÔNG tự tạo kỹ năng mới.`,
    );
  }
  if (skill && chapterCode && skill.chapterCode !== chapterCode) {
    errors.push(
      `chapter_code "${chapterCode}" không khớp: kỹ năng "${skillCode}" đang thuộc chương "${skill.chapterCode}".`,
    );
  }

  // Môn/khối lấy theo chương của kỹ năng; cột trong file chỉ để đối chiếu.
  const subjectCell = deaccent(get('subject')).trim().toUpperCase().replace(/\s+/g, '_');
  if (skill && subjectCell && !(SUBJECT_VALUES as readonly string[]).includes(subjectCell)) {
    warnings.push(`Cột subject "${get('subject')}" không nhận diện được — dùng môn của chương: ${skill.subject}.`);
  } else if (skill && subjectCell && subjectCell !== skill.subject) {
    errors.push(`Cột subject "${subjectCell}" khác môn của kỹ năng ("${skill.subject}").`);
  }

  const gradeBandCell = get('grade_band').trim().toUpperCase();
  if (skill && gradeBandCell && !(GRADE_BANDS as string[]).includes(gradeBandCell)) {
    warnings.push(`Cột grade_band "${gradeBandCell}" không hợp lệ — dùng khối của chương: ${skill.gradeBand}.`);
  } else if (skill && gradeBandCell && gradeBandCell !== skill.gradeBand) {
    errors.push(`Cột grade_band "${gradeBandCell}" khác khối của kỹ năng ("${skill.gradeBand}").`);
  }

  // --- Độ khó -------------------------------------------------------------
  const difficultyCell = get('difficulty');
  const difficulty = parseDifficulty(difficultyCell);
  if (!difficulty) {
    const allowed = DIFFICULTIES.map((d) => `${d} / ${DIFFICULTY_LABEL[d]}`).join(', ');
    errors.push(
      difficultyCell
        ? `Độ khó "${difficultyCell}" không hợp lệ. Chỉ nhận: ${allowed}.`
        : `Thiếu difficulty. Chỉ nhận: ${allowed}.`,
    );
  }

  let difficultyNumeric = difficulty ? defaultDifficultyNumeric(difficulty) : DIFFICULTY_NUMERIC_MIN;
  const difficultyNumericCell = get('difficulty_numeric');
  if (difficultyNumericCell) {
    const parsed = parseIntStrict(difficultyNumericCell);
    if (parsed === null || parsed < DIFFICULTY_NUMERIC_MIN || parsed > DIFFICULTY_NUMERIC_MAX) {
      warnings.push(
        `difficulty_numeric "${difficultyNumericCell}" không nằm trong ${DIFFICULTY_NUMERIC_MIN}–${DIFFICULTY_NUMERIC_MAX} — dùng mặc định ${difficultyNumeric}.`,
      );
    } else {
      difficultyNumeric = parsed;
    }
  }

  // --- Loại câu, đề bài, phương án, đáp án --------------------------------
  const questionTypeCell = get('question_type');
  const questionType = questionTypeCell ? parseQuestionType(questionTypeCell) : 'SINGLE_CHOICE';
  if (!questionType) {
    errors.push(
      `question_type "${questionTypeCell}" không hợp lệ. Chỉ nhận: ${QUESTION_TYPE_VALUES.join(', ')}.`,
    );
  }

  const stem = get('stem');
  if (!stem) errors.push('Thiếu stem — nội dung câu hỏi không được để trống.');

  const options = parseOptionsCell(get('options'));
  const optionKeys = options.map((o) => o.key.toUpperCase());
  const correctAnswerCell = get('correct_answer');

  let correctAnswer: string | string[] | number | null = null;
  if (!correctAnswerCell) {
    errors.push('Thiếu correct_answer — không có đáp án chuẩn thì không chấm được.');
  } else if (questionType === 'SINGLE_CHOICE' || questionType === 'MULTIPLE_CHOICE') {
    if (options.length === 0) {
      errors.push('Câu trắc nghiệm nhưng cột options đang trống.');
    } else {
      const keys = parseAnswerKeys(correctAnswerCell, optionKeys);
      const invalid = keys.filter((k) => !optionKeys.includes(k));
      if (invalid.length > 0) {
        errors.push(
          `Đáp án "${invalid.join(', ')}" không nằm trong danh sách phương án (${optionKeys.join(', ')}).`,
        );
      } else if (questionType === 'SINGLE_CHOICE') {
        if (keys.length !== 1) {
          errors.push('Câu SINGLE_CHOICE chỉ được có đúng một đáp án đúng.');
        } else {
          correctAnswer = keys[0];
        }
      } else {
        const unique = Array.from(new Set(keys));
        if (unique.length < 2) {
          warnings.push('Câu MULTIPLE_CHOICE chỉ có 1 đáp án đúng — kiểm tra lại xem có bỏ sót phương án không.');
        }
        correctAnswer = unique;
      }
    }
  } else if (questionType === 'NUMERIC') {
    const parsed = parseNumberStrict(correctAnswerCell);
    if (parsed === null) {
      errors.push(`Câu NUMERIC nhưng đáp án "${correctAnswerCell}" không phải là số.`);
    } else {
      correctAnswer = parsed;
    }
    if (options.length > 0) {
      warnings.push('Câu NUMERIC không cần cột options — phần này sẽ bị bỏ qua.');
    }
  } else if (questionType === 'SHORT_ANSWER') {
    correctAnswer = correctAnswerCell;
  }

  // Chốt lại bằng đúng luật dùng chung với CRUD.
  if (questionType && correctAnswer !== null) {
    const message = checkAnswerConsistency({
      questionType,
      options: questionType === 'NUMERIC' ? [] : options,
      correctAnswer,
    });
    if (message) errors.push(message);
  }

  const answerToleranceCell = get('answer_tolerance');
  let answerTolerance: number | null = null;
  if (answerToleranceCell) {
    const parsed = parseNumberStrict(answerToleranceCell);
    if (parsed === null || parsed < 0) {
      warnings.push(`answer_tolerance "${answerToleranceCell}" không hợp lệ — bỏ qua.`);
    } else if (questionType !== 'NUMERIC') {
      warnings.push('answer_tolerance chỉ có tác dụng với câu NUMERIC — bỏ qua.');
    } else {
      answerTolerance = parsed;
    }
  }

  // --- Lời giải: nguồn grounding duy nhất cho AI (specs §8.2) -------------
  const solution = get('solution');
  if (!solution) {
    errors.push('Thiếu solution — lời giải chuẩn là bắt buộc, đây là nguồn grounding duy nhất cho AI.');
  }

  // --- Thời gian chuẩn ----------------------------------------------------
  const fallbackTime = context.defaultEstimatedTime ?? FALLBACK_ESTIMATED_TIME_SECONDS;
  let estimatedTime = fallbackTime;
  const estimatedTimeCell = get('estimated_time');
  if (estimatedTimeCell) {
    const parsed = parseIntStrict(estimatedTimeCell);
    if (parsed === null || parsed <= 0 || parsed > 7200) {
      warnings.push(`estimated_time "${estimatedTimeCell}" không hợp lệ — dùng mặc định ${fallbackTime} giây.`);
    } else {
      estimatedTime = parsed;
    }
  } else {
    warnings.push(`Không khai estimated_time — dùng mặc định ${fallbackTime} giây.`);
  }

  // --- Phạm vi program / lớp thực tế / tag --------------------------------
  const programScope = splitList(get('program_scope')).map((p) => p.toUpperCase());
  if (context.programCodes && context.programCodes.size > 0) {
    const unknown = programScope.filter((p) => !context.programCodes!.has(p));
    if (unknown.length > 0) {
      warnings.push(`program_scope có mã lạ: ${unknown.join(', ')} — kiểm tra lại danh mục chương trình.`);
    }
  }

  const actualGradeScope: number[] = [];
  for (const token of splitList(get('actual_grade_scope'))) {
    const grade = parseIntStrict(token);
    if (grade === null) {
      warnings.push(`actual_grade_scope "${token}" không phải số lớp — bỏ qua.`);
      continue;
    }
    if (skill && !GRADE_BAND_GRADES[skill.gradeBand].includes(grade)) {
      warnings.push(`Lớp ${grade} không thuộc khối ${skill.gradeBand} của kỹ năng — bỏ qua.`);
      continue;
    }
    if (!actualGradeScope.includes(grade)) actualGradeScope.push(grade);
  }

  const tags = splitList(get('tags'));
  const solutionSteps = get('solution_steps')
    .split(/\||\n/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);

  // --- Kết luận -----------------------------------------------------------
  if (errors.length > 0 || !skill || !difficulty || !questionType || correctAnswer === null) {
    if (errors.length === 0) {
      errors.push('Dòng không đủ dữ liệu hợp lệ để ghi.');
    }
    return { rowNumber, itemCode: itemCode || null, action: 'ERROR', errors, warnings };
  }

  const existing = context.existingByCode?.get(itemCode) ?? null;
  if (existing && existing.status === 'PUBLISHED') {
    warnings.push(
      `Câu đang ở trạng thái "${ITEM_STATUS_LABEL.PUBLISHED}". Nội dung mới sẽ chuyển về "${ITEM_STATUS_LABEL.DRAFT}" và phải thẩm định lại trước khi engine dùng.`,
    );
  } else if (existing) {
    warnings.push(`Câu đã tồn tại (phiên bản ${existing.version}) — nội dung sẽ được cập nhật và tăng phiên bản.`);
  }

  const data: ParsedImportRow = {
    itemCode,
    skillId: skill.id,
    chapterId: skill.chapterId,
    subject: skill.subject,
    gradeBand: skill.gradeBand,
    programScope,
    actualGradeScope,
    difficulty,
    difficultyNumeric,
    questionType,
    stem,
    stemImageUrl: get('stem_image_url') || null,
    options: questionType === 'NUMERIC' || questionType === 'SHORT_ANSWER' ? [] : options,
    correctAnswer,
    answerTolerance,
    solution,
    solutionSteps,
    hint: get('hint') || null,
    estimatedTime,
    tags,
    sourceNote: get('source_note') || null,
    // Import không bao giờ đưa câu thẳng lên PUBLISHED (specs §5.3).
    targetStatus: 'DRAFT',
    existingItemId: existing?.id ?? null,
  };

  return {
    rowNumber,
    itemCode,
    action: existing ? 'UPDATE' : 'CREATE',
    errors,
    warnings,
    data,
  };
}

// ---------------------------------------------------------------------------
// Ghi vào DB
// ---------------------------------------------------------------------------

/** Snapshot phiên bản cũ — chỉ chứa giá trị JSON được (BigInt/Date đã quy đổi). */
export function itemSnapshot(item: QuestionItem): Record<string, unknown> {
  return {
    itemCode: item.itemCode,
    programScope: item.programScope,
    gradeBand: item.gradeBand,
    actualGradeScope: item.actualGradeScope,
    subject: item.subject,
    chapterId: item.chapterId,
    skillId: item.skillId,
    difficulty: item.difficulty,
    difficultyNumeric: item.difficultyNumeric,
    questionType: item.questionType,
    stem: item.stem,
    stemImageUrl: item.stemImageUrl,
    options: item.options,
    correctAnswer: item.correctAnswer,
    answerTolerance: item.answerTolerance,
    solution: item.solution,
    solutionSteps: item.solutionSteps,
    hint: item.hint,
    estimatedTime: item.estimatedTime,
    tags: item.tags,
    status: item.status,
    version: item.version,
    sourceNote: item.sourceNote,
    updatedAt: item.updatedAt.toISOString(),
  };
}

function itemWriteData(data: ParsedImportRow) {
  return {
    programScope: data.programScope,
    gradeBand: data.gradeBand,
    actualGradeScope: data.actualGradeScope,
    subject: data.subject,
    chapterId: data.chapterId,
    skillId: data.skillId,
    difficulty: data.difficulty,
    difficultyNumeric: data.difficultyNumeric,
    questionType: data.questionType,
    stem: data.stem,
    stemImageUrl: data.stemImageUrl,
    options: data.options as unknown as Prisma.InputJsonValue,
    correctAnswer: data.correctAnswer as unknown as Prisma.InputJsonValue,
    answerTolerance: data.answerTolerance,
    solution: data.solution,
    solutionSteps: data.solutionSteps as unknown as Prisma.InputJsonValue,
    hint: data.hint,
    estimatedTime: data.estimatedTime,
    tags: data.tags,
    sourceNote: data.sourceNote,
  };
}

/** Cập nhật câu đã có: lưu snapshot bản cũ rồi tăng version, đưa về DRAFT. */
async function applyUpdate(itemId: string, data: ParsedImportRow, actorId: string): Promise<void> {
  const current = await prisma.questionItem.findUnique({ where: { id: itemId } });
  if (!current) throw ApiError.notFound(`Không tìm thấy câu ${data.itemCode} để cập nhật.`);

  await prisma.$transaction([
    prisma.questionItemVersion.upsert({
      where: { itemId_version: { itemId: current.id, version: current.version } },
      create: {
        itemId: current.id,
        version: current.version,
        snapshot: itemSnapshot(current) as Prisma.InputJsonValue,
        changedById: actorId,
        reason: `Import ghi đè nội dung (${data.itemCode})`,
      },
      update: {},
    }),
    prisma.questionItem.update({
      where: { id: current.id },
      data: {
        ...itemWriteData(data),
        version: current.version + 1,
        // Nội dung đổi thì phải thẩm định lại từ đầu, không giữ trạng thái xuất bản.
        status: 'DRAFT',
        publishedAt: null,
      },
    }),
  ]);
}

async function applyCreate(data: ParsedImportRow, actorId: string): Promise<void> {
  try {
    await prisma.questionItem.create({
      data: {
        itemCode: data.itemCode,
        ...itemWriteData(data),
        status: data.targetStatus,
        version: 1,
        createdById: actorId,
      },
    });
  } catch (error) {
    // Câu vừa được người khác tạo giữa lúc kiểm tra và lúc ghi → chuyển sang cập nhật.
    const code = (error as { code?: string }).code;
    if (code !== 'P2002') throw error;
    const existing = await prisma.questionItem.findUnique({
      where: { itemCode: data.itemCode },
      select: { id: true },
    });
    if (!existing) throw error;
    await applyUpdate(existing.id, data, actorId);
  }
}

export async function importItems(input: {
  rows: Record<string, string>[];
  actorId: string;
  dryRun: boolean;
}): Promise<ImportReport> {
  const rows = Array.isArray(input.rows) ? input.rows : [];
  if (rows.length === 0) {
    throw ApiError.badRequest('File không có dòng dữ liệu nào để import.');
  }
  if (rows.length > IMPORT_MAX_ROWS) {
    throw ApiError.badRequest(
      `Mỗi lần import tối đa ${IMPORT_MAX_ROWS} dòng (file đang có ${rows.length}). Hãy chia nhỏ file.`,
    );
  }

  const config = await getConfig();
  const defaultEstimatedTime = defaultEstimatedTimeSeconds(config.recommendation);

  const skillCodes = new Set<string>();
  const itemCodes = new Set<string>();
  for (const row of rows) {
    const get = fieldReader(row);
    const skillCode = get('skill_code').trim().toUpperCase();
    if (skillCode) skillCodes.add(skillCode);
    const itemCode = get('item_code').trim().toUpperCase().replace(/\s+/g, '');
    if (itemCode) itemCodes.add(itemCode);
  }

  const [skills, existingItems, programs] = await Promise.all([
    skillCodes.size > 0
      ? prisma.skill.findMany({
          where: { code: { in: Array.from(skillCodes) } },
          select: {
            id: true,
            code: true,
            name: true,
            chapterId: true,
            chapter: { select: { code: true, name: true, subject: true, gradeBand: true } },
          },
        })
      : Promise.resolve([]),
    itemCodes.size > 0
      ? prisma.questionItem.findMany({
          where: { itemCode: { in: Array.from(itemCodes) } },
          select: { id: true, itemCode: true, status: true, version: true },
        })
      : Promise.resolve([]),
    prisma.program.findMany({ select: { code: true } }),
  ]);

  const context: ImportContext = {
    skillsByCode: new Map(
      skills.map((skill) => [
        skill.code.toUpperCase(),
        {
          id: skill.id,
          code: skill.code,
          name: skill.name,
          chapterId: skill.chapterId,
          chapterCode: skill.chapter.code,
          chapterName: skill.chapter.name,
          subject: skill.chapter.subject,
          gradeBand: skill.chapter.gradeBand,
        } satisfies ImportSkillRef,
      ]),
    ),
    existingByCode: new Map(existingItems.map((item) => [item.itemCode.toUpperCase(), item])),
    programCodes: new Set(programs.map((p) => p.code.toUpperCase())),
    defaultEstimatedTime,
    seenItemCodes: new Set<string>(),
  };

  // Dòng 1 của file là header nên dòng dữ liệu đầu tiên hiển thị là dòng 2.
  const results = rows.map((row, index) => validateImportRow(row, context, index + 2));

  if (!input.dryRun) {
    for (const result of results) {
      if (result.action === 'ERROR' || result.action === 'SKIP' || !result.data) continue;
      try {
        if (result.data.existingItemId) {
          await applyUpdate(result.data.existingItemId, result.data, input.actorId);
        } else {
          await applyCreate(result.data, input.actorId);
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        result.action = 'ERROR';
        result.errors.push(`Ghi vào cơ sở dữ liệu thất bại: ${message}`);
      }
    }
  }

  const report: ImportReport = {
    total: results.length,
    created: results.filter((r) => r.action === 'CREATE').length,
    updated: results.filter((r) => r.action === 'UPDATE').length,
    skipped: results.filter((r) => r.action === 'SKIP').length,
    failed: results.filter((r) => r.action === 'ERROR').length,
    // Payload `data` chỉ phục vụ bước ghi — không trả ra ngoài cho nhẹ báo cáo.
    rows: results.map(({ data: _data, ...rest }) => rest),
    dryRun: input.dryRun,
  };

  if (!input.dryRun) {
    await writeAudit({
      actorId: input.actorId,
      action: AUDIT_ACTIONS.ITEM_IMPORT,
      entityType: 'QuestionItem',
      entityId: `import:${new Date().toISOString()}`,
      after: {
        total: report.total,
        created: report.created,
        updated: report.updated,
        skipped: report.skipped,
        failed: report.failed,
        failedRows: report.rows.filter((r) => r.action === 'ERROR').map((r) => r.rowNumber),
      },
    });
  }

  return report;
}

// ---------------------------------------------------------------------------
// File mẫu cho đội biên soạn
// ---------------------------------------------------------------------------

/** File mẫu kèm 2 dòng ví dụ tiếng Việt để đội nội dung điền theo. */
export function buildImportTemplateCsv(): string {
  const examples: Record<string, string>[] = [
    {
      item_code: 'M67-PS-00001',
      program_scope: '',
      grade_band: 'B',
      actual_grade_scope: '',
      subject: 'MATH',
      chapter_code: 'PS',
      skill_code: 'PS-SO-SANH',
      difficulty: 'Trung bình',
      difficulty_numeric: '3',
      question_type: 'SINGLE_CHOICE',
      stem: 'So sánh hai phân số $\\frac{3}{4}$ và $\\frac{5}{8}$, rồi chọn khẳng định đúng.',
      stem_image_url: '',
      options: 'A: 3/4 > 5/8 | B: 3/4 < 5/8 | C: 3/4 = 5/8 | D: Không so sánh được',
      correct_answer: 'A',
      answer_tolerance: '',
      solution:
        'Quy đồng mẫu số: 3/4 = 6/8. Vì 6/8 > 5/8 nên 3/4 > 5/8. Vậy khẳng định đúng là "3/4 > 5/8".',
      solution_steps: 'Quy đồng mẫu số hai phân số|So sánh hai tử số|Kết luận',
      hint: 'Hãy quy đồng mẫu số trước khi so sánh.',
      estimated_time: '90',
      tags: 'phân số|so sánh',
      source_note: 'Biên soạn nội bộ 2026',
      action: '',
    },
    {
      item_code: 'M67-HH-00002',
      program_scope: 'NEO',
      grade_band: 'B',
      actual_grade_scope: '7',
      subject: 'MATH',
      chapter_code: 'HH',
      skill_code: 'HH-CHU-VI',
      difficulty: 'Khá',
      difficulty_numeric: '7',
      question_type: 'NUMERIC',
      stem: 'Một mảnh vườn hình chữ nhật có chiều dài 12m, chiều rộng 7m. Tính chu vi mảnh vườn (đơn vị: mét).',
      stem_image_url: '',
      options: '',
      correct_answer: '38',
      answer_tolerance: '0',
      solution: 'Chu vi hình chữ nhật = (dài + rộng) × 2 = (12 + 7) × 2 = 38 (m).',
      solution_steps: 'Cộng chiều dài và chiều rộng|Nhân tổng với 2|Ghi kèm đơn vị mét',
      hint: 'Nhớ nhân đôi tổng hai cạnh kề nhau.',
      estimated_time: '120',
      tags: 'hình học|chu vi',
      source_note: 'Biên soạn nội bộ 2026',
      action: '',
    },
  ];

  return toCsv(IMPORT_TEMPLATE_HEADERS, examples);
}
