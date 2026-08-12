/**
 * HỢP ĐỒNG CÔNG KHAI CỦA RECOMMENDATION ENGINE (specs.md §7).
 *
 * Engine là logic THUẦN: không truy cập DB, không gọi mạng, không dùng LLM.
 * Mọi dữ liệu vào ra là plain object → kiểm thử độc lập bằng vitest.
 *
 * LLM KHÔNG tham gia quyết định chọn câu. Quyết định dựa trên dữ liệu có cấu
 * trúc + luật có thể kiểm toán, và mọi lựa chọn đều kèm `reasonCode` để trả lời
 * câu hỏi "vì sao hệ thống giao bài này" (tiêu chí nghiệm thu MVP §17).
 */
import type {
  BlockType,
  Difficulty,
  ErrorPattern,
  GoalFeasibility,
  StudentLevel,
} from '@prisma/client';
import type { LevelConfig, RecommendationConfig } from '@/lib/config/defaults';

export const ENGINE_VERSION = 'v1';

// ---------------------------------------------------------------------------
// Dữ liệu đầu vào
// ---------------------------------------------------------------------------

export interface SkillNode {
  id: string;
  code: string;
  name: string;
  chapterId: string;
  chapterName: string;
  /** Tầm quan trọng trong blueprint kỳ thi (>0). */
  blueprintWeight: number;
  order: number;
  /** Các skill phải vững trước khi học skill này. */
  prerequisiteIds: string[];
}

export interface MasteryState {
  skillId: string;
  /** 0–100 */
  masteryScore: number;
  /** 0–1, thấp khi ít dữ liệu */
  confidence: number;
  attemptCount: number;
  correctCount: number;
  recentAccuracy: number;
  /** Cửa sổ trượt kết quả gần nhất: 1 = đúng, 0 = sai */
  recentResults: number[];
  /** thời gian thực tế / thời gian chuẩn */
  avgTimeRatio: number;
  consecutiveCorrect: number;
  consecutiveWrong: number;
  /** Bậc độ khó cao nhất đã ổn định: 0 = chưa có, 1 = TB, 2 = Khá, 3 = Giỏi */
  difficultyCeiling: number;
  lastPracticedAt: Date | null;
  /** { KNOWLEDGE: 3, READING: 1, ... } */
  errorCounts: Record<string, number>;
}

export interface CandidateItem {
  id: string;
  skillId: string;
  chapterId: string;
  difficulty: Difficulty;
  difficultyNumeric: number;
  /** giây */
  estimatedTime: number;
  tags: string[];
  /** Lần cuối chính học sinh này được giao câu đó (null = chưa từng). */
  lastServedAt: Date | null;
  timesServedToStudent: number;
}

// ---------------------------------------------------------------------------
// Gap Priority (§7.3)
// ---------------------------------------------------------------------------

export interface GapFactors {
  /** Mức thiếu hụt so với mastery mục tiêu, chuẩn hóa 0–1. */
  deficit: number;
  /** Tầm quan trọng trong blueprint. */
  blueprint: number;
  /** Độ gần kỳ thi — càng gần càng ưu tiên phần trọng số cao. */
  examProximity: number;
  /** Lỗi lặp lại ở skill này. */
  repeatError: number;
  /** Skill này là tiên quyết của bao nhiêu skill khác đang hổng. */
  prerequisite: number;
}

export interface GapScore {
  skillId: string;
  /** Tích các thừa số đã nhân trọng số cấu hình. */
  priority: number;
  factors: GapFactors;
  masteryScore: number;
  targetMastery: number;
  /** Skill tiên quyết chưa vững — nên học trước skill này. */
  blockedBySkillIds: string[];
  reason: string;
}

export interface GapPriorityRequest {
  skills: SkillNode[];
  masteries: MasteryState[];
  /** Mastery cần đạt ứng với mức mục tiêu. */
  targetMastery: number;
  /** Số ngày còn lại tới kỳ thi; null = chưa có mốc thi. */
  daysToExam: number | null;
  config: RecommendationConfig;
  /** Skill giáo viên yêu cầu ưu tiên (override sau buổi tư vấn). */
  teacherFocusSkillIds?: string[];
}

// ---------------------------------------------------------------------------
// Cập nhật mastery sau mỗi câu (§7.2, §9.2)
// ---------------------------------------------------------------------------

export interface AttemptEvent {
  isCorrect: boolean;
  timeMs: number;
  /** Thời gian chuẩn của câu (giây). */
  estimatedTimeSeconds: number;
  difficulty: Difficulty;
  hintUsed: boolean;
  /** Xem lời giải TRƯỚC khi trả lời → không tính là mastered. */
  solutionViewedBeforeAnswer: boolean;
  answeredAt: Date;
}

export interface MasteryUpdate {
  next: MasteryState;
  /** Chênh lệch mastery (có thể âm). */
  delta: number;
  /** Loại lỗi suy ra từ hành vi làm bài; null khi trả lời đúng gọn. */
  errorPattern: ErrorPattern | null;
  /** true khi đúng nhưng quá chậm/dùng gợi ý → chưa coi là thành thạo. */
  partialCredit: boolean;
}

// ---------------------------------------------------------------------------
// Chọn độ khó (§7.4)
// ---------------------------------------------------------------------------

export type DifficultyDirection = 'UP' | 'DOWN' | 'HOLD';

export interface DifficultyDecision {
  difficulty: Difficulty;
  direction: DifficultyDirection;
  reasonCode: string;
  reason: string;
  /** true khi cần đưa bài của skill tiên quyết thay vì skill hiện tại. */
  needsPrerequisite: boolean;
}

// ---------------------------------------------------------------------------
// Kế hoạch một ngày (§7.6)
// ---------------------------------------------------------------------------

export interface PlannedItem {
  itemId: string;
  skillId: string;
  block: BlockType;
  order: number;
  /** giây */
  estimatedTime: number;
  difficulty: Difficulty;
  reasonCode: string;
  reasonData: Record<string, unknown>;
  gapPriority: number | null;
}

export interface DayPlanRequest {
  gaps: GapScore[];
  masteries: MasteryState[];
  skills: SkillNode[];
  candidates: CandidateItem[];
  /** Quỹ thời gian của học sinh cho ngày này (phút). */
  minutesBudget: number;
  /** Chương trọng tâm của tuần — cấp nguồn cho block CORE. */
  coreChapterIds: string[];
  /** Skill đã học 2–3 ngày trước — cấp nguồn cho block WARMUP. */
  recentSkillIds: string[];
  now: Date;
  config: RecommendationConfig;
  /** Hệ số tải theo override của giáo viên (1 = giữ nguyên). */
  loadFactor?: number;
}

export interface DayPlanResult {
  items: PlannedItem[];
  estimatedMinutes: number;
  blockCounts: Record<BlockType, number>;
  /** Cảnh báo vận hành: skill thiếu câu, không đủ item… (specs §18 fallback) */
  warnings: string[];
}

// ---------------------------------------------------------------------------
// Tính khả thi của mục tiêu (§7.7)
// ---------------------------------------------------------------------------

export interface FeasibilityRequest {
  masteries: MasteryState[];
  skills: SkillNode[];
  currentLevel: StudentLevel;
  targetLevel: StudentLevel;
  daysUntilDeadline: number;
  daysPerWeek: number;
  minutesPerDay: number;
  levelConfig: LevelConfig;
  config: RecommendationConfig;
}

export interface FeasibilityResult {
  status: GoalFeasibility;
  /** Tổng số phút luyện ước tính để đạt mục tiêu. */
  requiredMinutes: number;
  /** Tổng số phút học sinh thực có tới deadline. */
  availableMinutes: number;
  /** requiredMinutes / availableMinutes */
  ratio: number;
  /** Tổng số điểm mastery còn thiếu. */
  masteryGapPoints: number;
  /** Số skill đang dưới ngưỡng mục tiêu. */
  skillsBelowTarget: number;
  suggestedMinutesPerDay: number;
  suggestedDaysPerWeek: number;
  /** Số ngày cần thêm nếu giữ nguyên cường độ. */
  suggestedExtraDays: number;
  message: string;
}

/** Một phương án mục tiêu để học sinh chọn (specs §6.1 — 2–3 lựa chọn). */
export interface GoalOption {
  targetLevel: StudentLevel;
  weeks: number;
  daysPerWeek: number;
  minutesPerDay: number;
  feasibility: FeasibilityResult;
  label: string;
  description: string;
  recommended: boolean;
}

// ---------------------------------------------------------------------------
// Chọn câu cho bài kiểm tra (§7.9, §7.10)
// ---------------------------------------------------------------------------

/** Tỷ trọng độ khó theo mức tự khai — cấu hình trong Assessment.blueprint. */
export interface BlueprintSpec {
  /** chapterId → trọng số (không cần chuẩn hóa, engine tự chia). */
  chapterWeights: Record<string, number>;
  /** Mức tự khai → tỷ lệ từng bậc độ khó (tổng = 1). */
  difficultyMixByLevel: Record<StudentLevel, Record<Difficulty, number>>;
  /** Luôn giữ tối thiểu bao nhiêu câu "neo" cơ bản. */
  minAnchorItems: number;
}

export interface SelectedItem {
  itemId: string;
  skillId: string;
  chapterId: string;
  difficulty: Difficulty;
  role: 'ANCHOR' | 'TRAINED' | 'FRESH' | 'BLUEPRINT';
  reasonCode: string;
}

export interface DiagnosticSelectionRequest {
  candidates: CandidateItem[];
  skills: SkillNode[];
  blueprint: BlueprintSpec;
  selfLevel: StudentLevel;
  itemCount: number;
  /** Chuỗi cố định (vd enrollmentId) → chọn câu tái lập được khi debug. */
  seedKey: string;
}

export interface ProgressSelectionRequest {
  candidates: CandidateItem[];
  skills: SkillNode[];
  blueprint: BlueprintSpec;
  masteries: MasteryState[];
  /** Câu đã dùng ở bài baseline — nguồn để lấy "câu neo" cùng skill/độ khó. */
  baselineItems: { itemId: string; skillId: string; difficulty: Difficulty }[];
  /** Skill đã luyện trong chu kỳ vừa qua. */
  trainedSkillIds: string[];
  /** Câu học sinh đã gặp gần đây → loại khỏi pool (chống điểm giả). */
  excludeItemIds: string[];
  composition: { anchor: number; trained: number; fresh: number };
  itemCount: number;
  seedKey: string;
}

export interface SelectionResult {
  items: SelectedItem[];
  warnings: string[];
}

// ---------------------------------------------------------------------------
// Chấm điểm (§7.9 — KHÔNG dùng "đúng 10/15 = Khá")
// ---------------------------------------------------------------------------

export interface ScoredAttemptItem {
  itemId: string;
  skillId: string;
  chapterId: string;
  difficulty: Difficulty;
  isCorrect: boolean;
  timeMs: number;
  estimatedTimeSeconds: number;
}

export interface SkillBreakdown {
  skillId: string;
  correct: number;
  total: number;
  accuracy: number;
  /** Mastery ước tính từ riêng bài kiểm tra này. */
  estimatedMastery: number;
  avgTimeRatio: number;
}

export interface ChapterBreakdown {
  chapterId: string;
  correct: number;
  total: number;
  accuracy: number;
}

export interface ScoreResult {
  rawScore: number;
  maxScore: number;
  /** Điểm đã nhân trọng số độ khó. */
  weightedScore: number;
  weightedMax: number;
  /** 0–100 */
  percent: number;
  estimatedLevel: StudentLevel;
  totalTimeMs: number;
  avgTimeRatio: number;
  bySkill: SkillBreakdown[];
  byChapter: ChapterBreakdown[];
  /** Skill yếu nhất, đã xếp theo mức cần ưu tiên. */
  weakestSkillIds: string[];
  strongestSkillIds: string[];
}
