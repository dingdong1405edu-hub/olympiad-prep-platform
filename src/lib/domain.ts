/**
 * Từ điển hiển thị tiếng Việt + tiện ích cho các enum nghiệp vụ.
 * Mọi nhãn hiển thị cho người dùng lấy từ đây, không hard-code rải rác trong UI.
 */
import type {
  AssessmentType,
  BlockType,
  Difficulty,
  ErrorPattern,
  GradeBand,
  ItemStatus,
  PlanDayStatus,
  QuestionType,
  Role,
  StudentLevel,
  Subject,
  TeacherAction,
} from '@prisma/client';

// ---------------------------------------------------------------------------
// Mức năng lực học sinh
// ---------------------------------------------------------------------------

export const STUDENT_LEVELS: StudentLevel[] = ['WEAK', 'AVERAGE', 'GOOD', 'EXCELLENT'];

export const LEVEL_LABEL: Record<StudentLevel, string> = {
  WEAK: 'Kém',
  AVERAGE: 'Trung bình',
  GOOD: 'Khá',
  EXCELLENT: 'Giỏi',
};

/** Thứ tự tăng dần — dùng để so sánh mục tiêu với mức hiện tại. */
export const LEVEL_ORDER: Record<StudentLevel, number> = {
  WEAK: 0,
  AVERAGE: 1,
  GOOD: 2,
  EXCELLENT: 3,
};

export function levelFromOrder(order: number): StudentLevel {
  const clamped = Math.max(0, Math.min(3, Math.round(order)));
  return STUDENT_LEVELS[clamped]!;
}

// ---------------------------------------------------------------------------
// Độ khó câu hỏi
// ---------------------------------------------------------------------------

export const DIFFICULTIES: Difficulty[] = ['AVERAGE', 'GOOD', 'EXCELLENT'];

export const DIFFICULTY_LABEL: Record<Difficulty, string> = {
  AVERAGE: 'Trung bình',
  GOOD: 'Khá',
  EXCELLENT: 'Giỏi',
};

export const DIFFICULTY_ORDER: Record<Difficulty, number> = {
  AVERAGE: 0,
  GOOD: 1,
  EXCELLENT: 2,
};

export function difficultyFromOrder(order: number): Difficulty {
  const clamped = Math.max(0, Math.min(2, Math.round(order)));
  return DIFFICULTIES[clamped]!;
}

/** Trọng số điểm theo độ khó — chấm KHÔNG dùng "đúng 10/15 = Khá" (specs §7.9). */
export const DIFFICULTY_WEIGHT: Record<Difficulty, number> = {
  AVERAGE: 1,
  GOOD: 1.5,
  EXCELLENT: 2.2,
};

// ---------------------------------------------------------------------------
// Khối lớp & môn học
// ---------------------------------------------------------------------------

export const GRADE_BANDS: GradeBand[] = ['A', 'B', 'C', 'D'];

export const GRADE_BAND_LABEL: Record<GradeBand, string> = {
  A: 'Khối 3–4–5',
  B: 'Khối 6–7',
  C: 'Khối 8–9',
  D: 'Khối 10–11–12',
};

export const GRADE_BAND_GRADES: Record<GradeBand, number[]> = {
  A: [3, 4, 5],
  B: [6, 7],
  C: [8, 9],
  D: [10, 11, 12],
};

export function gradeBandOf(grade: number): GradeBand {
  if (grade <= 5) return 'A';
  if (grade <= 7) return 'B';
  if (grade <= 9) return 'C';
  return 'D';
}

export const SUBJECT_LABEL: Record<Subject, string> = {
  MATH: 'Toán',
  SCIENCE: 'Khoa học tự nhiên',
  PHYSICS: 'Vật lý',
  CHEMISTRY: 'Hóa học',
  BIOLOGY: 'Sinh học',
  IT: 'Công nghệ thông tin',
};

/** Môn khả dụng theo khối (specs §3.2). */
export const SUBJECTS_BY_BAND: Record<GradeBand, Subject[]> = {
  A: ['MATH', 'SCIENCE', 'IT'],
  B: ['MATH', 'SCIENCE', 'IT'],
  C: ['MATH', 'SCIENCE', 'IT'],
  D: ['MATH', 'PHYSICS', 'CHEMISTRY', 'BIOLOGY', 'IT'],
};

// ---------------------------------------------------------------------------
// Học liệu
// ---------------------------------------------------------------------------

export const ITEM_STATUS_LABEL: Record<ItemStatus, string> = {
  DRAFT: 'Bản nháp',
  REVIEWED: 'Đã thẩm định',
  PUBLISHED: 'Đã xuất bản',
  FLAGGED: 'Bị báo lỗi',
  RETIRED: 'Ngừng sử dụng',
};

/**
 * Chuyển trạng thái hợp lệ của câu hỏi (specs §5.3).
 * CHỈ item PUBLISHED mới được engine/AI sử dụng.
 */
export const ITEM_STATUS_TRANSITIONS: Record<ItemStatus, ItemStatus[]> = {
  DRAFT: ['REVIEWED', 'RETIRED'],
  REVIEWED: ['PUBLISHED', 'DRAFT', 'RETIRED'],
  PUBLISHED: ['FLAGGED', 'RETIRED', 'REVIEWED'],
  FLAGGED: ['PUBLISHED', 'DRAFT', 'RETIRED'],
  RETIRED: ['DRAFT'],
};

export const QUESTION_TYPE_LABEL: Record<QuestionType, string> = {
  SINGLE_CHOICE: 'Trắc nghiệm 1 đáp án',
  MULTIPLE_CHOICE: 'Trắc nghiệm nhiều đáp án',
  NUMERIC: 'Điền số',
  SHORT_ANSWER: 'Trả lời ngắn',
};

// ---------------------------------------------------------------------------
// Học tập
// ---------------------------------------------------------------------------

export const BLOCK_LABEL: Record<BlockType, string> = {
  WARMUP: 'Khởi động',
  REPAIR: 'Vá lỗ hổng',
  CORE: 'Trọng tâm tuần',
  CHALLENGE: 'Thử thách',
  REVIEW: 'Ôn nhanh',
};

export const BLOCK_DESCRIPTION: Record<BlockType, string> = {
  WARMUP: 'Ôn lại kỹ năng đã học 2–3 ngày trước',
  REPAIR: 'Đúng vào kỹ năng đang hổng nhất',
  CORE: 'Chương trọng tâm của tuần này',
  CHALLENGE: 'Cao hơn một bậc, chỉ mở khi bạn đã vững',
  REVIEW: 'Trộn nhiều kỹ năng để kiểm tra độ nhớ',
};

export const BLOCK_ORDER: BlockType[] = ['WARMUP', 'REPAIR', 'CORE', 'CHALLENGE', 'REVIEW'];

export const PLAN_DAY_STATUS_LABEL: Record<PlanDayStatus, string> = {
  PLANNED: 'Chưa học',
  IN_PROGRESS: 'Đang học',
  COMPLETED: 'Hoàn thành',
  MISSED: 'Bỏ lỡ',
  RESCHEDULED: 'Đã dời lịch',
};

export const ASSESSMENT_TYPE_LABEL: Record<AssessmentType, string> = {
  DIAGNOSTIC: 'Kiểm tra đầu vào',
  PROGRESS: 'Kiểm tra tiến bộ',
  MOCK: 'Thi thử',
};

export const ERROR_PATTERN_LABEL: Record<ErrorPattern, string> = {
  KNOWLEDGE: 'Hổng kiến thức',
  READING: 'Đọc đề sai',
  CALCULATION: 'Sai tính toán',
  REASONING: 'Suy luận chưa chặt',
  CARELESS: 'Cẩu thả',
  TIMEOUT: 'Quá chậm / hết giờ',
};

export const TEACHER_ACTION_LABEL: Record<TeacherAction, string> = {
  KEEP_PLAN: 'Giữ nguyên lộ trình',
  REDUCE_LOAD: 'Giảm tải',
  INCREASE_LOAD: 'Tăng tải',
  CHANGE_PRIORITY: 'Đổi ưu tiên kỹ năng',
};

export const ROLE_LABEL: Record<Role, string> = {
  STUDENT: 'Học sinh',
  PARENT: 'Phụ huynh',
  TEACHER: 'Giáo viên',
  CONTENT_EDITOR: 'Biên soạn viên',
  REVIEWER: 'Reviewer chuyên môn',
  PROGRAM_MANAGER: 'Quản lý chương trình',
  OPS_ADMIN: 'Admin vận hành',
  SUPER_ADMIN: 'Super Admin',
};

// ---------------------------------------------------------------------------
// Phân loại mastery để hiển thị (radar 4 mức — specs §9.2 màn hình 7)
// ---------------------------------------------------------------------------

export type MasteryTier = 'STRONG' | 'OK' | 'NEEDS_WORK' | 'GAP';

export const MASTERY_TIER_LABEL: Record<MasteryTier, string> = {
  STRONG: 'Mạnh',
  OK: 'Ổn',
  NEEDS_WORK: 'Cần củng cố',
  GAP: 'Hổng',
};

export function masteryTier(score: number): MasteryTier {
  if (score >= 75) return 'STRONG';
  if (score >= 55) return 'OK';
  if (score >= 35) return 'NEEDS_WORK';
  return 'GAP';
}

// ---------------------------------------------------------------------------
// Tiện ích hiển thị
// ---------------------------------------------------------------------------

export function formatVnd(amount: number): string {
  return new Intl.NumberFormat('vi-VN').format(amount) + 'đ';
}

export function formatMinutes(minutes: number): string {
  if (minutes < 60) return `${Math.round(minutes)} phút`;
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  return m === 0 ? `${h} giờ` : `${h} giờ ${m} phút`;
}
