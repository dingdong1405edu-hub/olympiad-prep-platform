/**
 * ĐỊNH NGHĨA TOÀN BỘ THAM SỐ CẤU HÌNH — Phụ lục B của specs.md.
 *
 * Quy tắc bất di bất dịch (specs §19.2 #4):
 *   Nếu bạn sắp hard-code một con số nghiệp vụ (giá, số câu, chu kỳ, trọng số,
 *   ngưỡng độ khó, tỷ lệ block…) — DỪNG LẠI và thêm nó vào đây.
 *
 * Giá trị trong file này là MẶC ĐỊNH XUẤT XƯỞNG. Admin ghi đè bằng bảng
 * `AppConfig` (mỗi nhóm là 1 dòng JSON) mà không cần deploy lại.
 */
import type { BlockType, StudentLevel } from '@prisma/client';

// ---------------------------------------------------------------------------

export interface AssessmentConfig {
  /** Số câu bài kiểm tra đầu vào — mặc định 15 (specs §5) */
  diagnosticItemCount: number;
  diagnosticTimeLimitMinutes: number | null;
  /** Chu kỳ kiểm tra tiến bộ — mặc định 14 ngày */
  cycleDays: number;
  /** Ân hạn khi quá hạn assessment */
  gracePeriodDays: number;
  progressItemCount: number;
  progressTimeLimitMinutes: number | null;
  /** Tỷ lệ 3 phần của bài tiến bộ (specs §7.10) — tổng phải = 1 */
  progressComposition: {
    /** Câu neo cùng skill/độ khó với baseline → đo tiến bộ tương đối */
    anchor: number;
    /** Skill đã luyện trong 2 tuần */
    trained: number;
    /** Câu mới theo blueprint → tránh học tủ */
    fresh: number;
  };
  /** Loại khỏi pool những câu HS đã gặp trong N ngày (chống tăng điểm giả) */
  recentExclusionDays: number;
}

export interface LevelConfig {
  /** 4 nhãn hiển thị — admin đổi tên được (specs §10.1) */
  labels: Record<StudentLevel, string>;
  /** Ngưỡng % điểm có trọng số để quy ra mức ước tính */
  scoreThresholds: Record<StudentLevel, number>;
  /** Mastery trung bình mục tiêu tương ứng mỗi mức */
  masteryTargets: Record<StudentLevel, number>;
  /** Không "nhảy level" khi độ tin cậy/dữ liệu chưa đủ (specs §10.1) */
  minConfidenceForLevelChange: number;
  minAttemptsForLevelChange: number;
}

export interface RecommendationConfig {
  /** Trọng số công thức Gap Priority (specs §7.3) */
  weights: {
    deficit: number;
    blueprint: number;
    examProximity: number;
    repeatError: number;
    prerequisite: number;
  };
  /** Tỷ lệ số câu mỗi block trong 1 ngày (specs §7.6) — tổng phải = 1 */
  blockRatio: Record<BlockType, number>;
  minMinutesPerDay: number;
  maxMinutesPerDay: number;
  minItemsPerDay: number;
  maxItemsPerDay: number;
  /** Số ngày không giao lại đúng một câu (chống học thuộc — specs §7.5) */
  itemCooldownDays: number;
  /** Mastery >= ngưỡng này coi như đã vững */
  masteredThreshold: number;
  /** Mastery < ngưỡng này coi là "hổng" và được ưu tiên vá */
  gapThreshold: number;
  /** Luật tăng độ khó (specs §7.4) */
  difficultyUp: { consecutiveCorrect: number; maxTimeRatio: number };
  /** Luật hạ độ khó + đưa bài tiên quyết */
  difficultyDown: { consecutiveWrong: number; minTimeRatio: number };
  /** Đã vững nhưng lâu không luyện → giao câu kiểm tra retention */
  spacedRepetitionDays: number;
  /** Mastery tối thiểu để mở block Thử thách */
  challengeUnlockMastery: number;
  /** Số skill tối đa chạm tới trong một ngày (tránh dàn trải) */
  maxSkillsPerDay: number;
  /** Ước lượng số phút luyện để tăng 1 điểm mastery — dùng cho feasibility */
  minutesPerMasteryPoint: number;
  /** Hệ số an toàn khi kiểm tra tính khả thi của mục tiêu (specs §7.7) */
  feasibilitySafetyFactor: number;
  /** Vượt quá tỷ lệ này so với quỹ thời gian → INFEASIBLE */
  infeasibleRatio: number;
  /** Hệ số tải khi giáo viên chọn giảm/tăng tải */
  teacherLoadFactor: { REDUCE_LOAD: number; INCREASE_LOAD: number };
}

export interface TeacherConfig {
  /** Thời lượng buổi tư vấn — mặc định 20 phút */
  sessionMinutes: number;
  defaultCapacityPerCycle: number;
  /** Tự tạo yêu cầu đặt lịch ngay sau khi HS nộp bài tiến bộ */
  autoCreateSessionAfterAssessment: boolean;
  /** Cảnh báo trên dashboard giáo viên (specs §9.3) */
  alerts: {
    inactiveDays: number;
    masteryDropPoints: number;
    repeatedWrongSameSkill: number;
    assessmentOverdueDays: number;
  };
}

export interface CommerceConfig {
  /** 700.000đ chỉ là cấu hình khởi tạo (specs §11) */
  defaultPrice: number;
  currency: string;
  accessDurationDays: number;
  allowManualActivation: boolean;
  gateway: string;
}

export interface NotificationConfig {
  enabled: boolean;
  /** Bật/tắt và thời điểm từng trigger (specs §12) */
  triggers: {
    afterPurchase: boolean;
    diagnosticReminderHours: number;
    dailyPlanReminder: boolean;
    inactiveReminderDays: number;
    assessmentDueBeforeDays: number;
    newReport: boolean;
    sessionReminderHours: number;
    teacherNotesReady: boolean;
    accessExpiringBeforeDays: number;
  };
  /** Trần số thông báo mỗi ngày để tránh spam */
  maxPerDay: number;
}

export interface AiConfig {
  enabled: boolean;
  model: string;
  cheapModel: string;
  promptVersion: string;
  maxOutputTokens: number;
  timeoutMs: number;
  /** Không đưa PII vào prompt — luôn dùng biệt danh (specs §8.2) */
  anonymizeStudent: boolean;
}

/**
 * Thi thử chấm bằng AI. KHÔNG chứa khóa API hay tên model — hai thứ đó là hạ
 * tầng, đặt ở biến môi trường (xem `src/server/mock-exam/ai-provider.ts`).
 * Ở đây chỉ có ngưỡng nghiệp vụ mà admin cần chỉnh được khi vận hành.
 */
export interface MockExamConfig {
  /** Dưới ngưỡng tin cậy này thì bài được gắn cờ nhờ giáo viên xem lại. */
  confidenceReviewThreshold: number;
  /** Hết giờ chờ một lượt gọi AI → đánh dấu câu đó chấm hỏng, cho chấm lại. */
  gradingTimeoutMs: number;
  gradingMaxRetries: number;
  /** Số ảnh tối đa cho một câu tự luận. */
  maxImagesPerQuestion: number;
  /** Ảnh nặng hơn ngần này bị từ chối — client đã nén trước khi gửi. */
  maxImageBytes: number;
  /** Số câu tự luận chấm song song từ trình duyệt. */
  parallelGradeLimit: number;
}

export interface PlatformConfig {
  assessment: AssessmentConfig;
  levels: LevelConfig;
  recommendation: RecommendationConfig;
  teacher: TeacherConfig;
  commerce: CommerceConfig;
  notification: NotificationConfig;
  ai: AiConfig;
  mockExam: MockExamConfig;
}

// ---------------------------------------------------------------------------

/**
 * Đọc biến môi trường dạng chuỗi — biến ĐỂ TRỐNG coi như chưa đặt.
 *
 * `process.env.X ?? 'mặc định'` chỉ chặn được trường hợp KHÔNG có biến. Dán một
 * khối biến vào bảng điều khiển Railway thì các dòng bỏ trống vẫn tồn tại với
 * giá trị `''`, và `''` lọt qua `??` để trở thành tên model rỗng.
 */
function textEnv(name: string, fallback: string): string {
  const raw = (process.env[name] ?? '').trim();
  return raw === '' ? fallback : raw;
}

/**
 * Đọc biến môi trường dạng số — trống, sai kiểu hoặc ngoài khoảng thì bỏ qua.
 *
 * `Number('')` bằng 0 chứ không phải NaN. Một dòng `GRADING_TIMEOUT_MS=` bỏ
 * trống vì thế hóa thành thời hạn 0ms: mọi lượt chấm bị hủy trước cả khi kịp
 * gửi đi, mà thông báo lại là "AI không phản hồi" — người vận hành đi tìm lỗi ở
 * nhà cung cấp trong khi lỗi nằm ở một ô nhập liệu để trống.
 */
function numberEnv(name: string, fallback: number, min: number): number {
  const raw = (process.env[name] ?? '').trim();
  if (raw === '') return fallback;
  const value = Number(raw);
  return Number.isFinite(value) && value >= min ? value : fallback;
}

export const DEFAULT_CONFIG: PlatformConfig = {
  assessment: {
    diagnosticItemCount: 15,
    diagnosticTimeLimitMinutes: null,
    cycleDays: 14,
    gracePeriodDays: 3,
    progressItemCount: 15,
    progressTimeLimitMinutes: null,
    progressComposition: { anchor: 0.34, trained: 0.4, fresh: 0.26 },
    recentExclusionDays: 10,
  },

  levels: {
    labels: {
      WEAK: 'Kém',
      AVERAGE: 'Trung bình',
      GOOD: 'Khá',
      EXCELLENT: 'Giỏi',
    },
    scoreThresholds: { WEAK: 0, AVERAGE: 40, GOOD: 62, EXCELLENT: 82 },
    masteryTargets: { WEAK: 25, AVERAGE: 45, GOOD: 65, EXCELLENT: 82 },
    minConfidenceForLevelChange: 0.5,
    minAttemptsForLevelChange: 20,
  },

  recommendation: {
    weights: {
      deficit: 1,
      blueprint: 1,
      examProximity: 1,
      repeatError: 1,
      prerequisite: 1,
    },
    blockRatio: {
      WARMUP: 0.15,
      REPAIR: 0.35,
      CORE: 0.28,
      CHALLENGE: 0.1,
      REVIEW: 0.12,
    },
    minMinutesPerDay: 15,
    maxMinutesPerDay: 120,
    minItemsPerDay: 5,
    maxItemsPerDay: 40,
    itemCooldownDays: 21,
    masteredThreshold: 75,
    gapThreshold: 45,
    difficultyUp: { consecutiveCorrect: 3, maxTimeRatio: 1.15 },
    difficultyDown: { consecutiveWrong: 2, minTimeRatio: 1.8 },
    spacedRepetitionDays: 7,
    challengeUnlockMastery: 70,
    maxSkillsPerDay: 5,
    minutesPerMasteryPoint: 1.6,
    feasibilitySafetyFactor: 1.15,
    infeasibleRatio: 1.35,
    teacherLoadFactor: { REDUCE_LOAD: 0.75, INCREASE_LOAD: 1.2 },
  },

  teacher: {
    sessionMinutes: 20,
    defaultCapacityPerCycle: 30,
    autoCreateSessionAfterAssessment: true,
    alerts: {
      inactiveDays: 3,
      masteryDropPoints: 5,
      repeatedWrongSameSkill: 3,
      assessmentOverdueDays: 2,
    },
  },

  commerce: {
    defaultPrice: 700_000,
    currency: 'VND',
    accessDurationDays: 180,
    allowManualActivation: true,
    gateway: textEnv('PAYMENT_GATEWAY', 'MANUAL'),
  },

  notification: {
    enabled: true,
    triggers: {
      afterPurchase: true,
      diagnosticReminderHours: 24,
      dailyPlanReminder: true,
      inactiveReminderDays: 3,
      assessmentDueBeforeDays: 2,
      newReport: true,
      sessionReminderHours: 12,
      teacherNotesReady: true,
      accessExpiringBeforeDays: 7,
    },
    maxPerDay: 3,
  },

  ai: {
    enabled: process.env.AI_ENABLED !== 'false',
    model: textEnv('AI_MODEL', 'claude-sonnet-5'),
    cheapModel: textEnv('AI_MODEL_CHEAP', 'claude-haiku-4-5-20251001'),
    promptVersion: 'v1',
    maxOutputTokens: 1600,
    timeoutMs: 30_000,
    anonymizeStudent: true,
  },

  mockExam: {
    confidenceReviewThreshold: numberEnv('CONFIDENCE_REVIEW_THRESHOLD', 0.7, 0),
    gradingTimeoutMs: numberEnv('GRADING_TIMEOUT_MS', 90_000, 1_000),
    gradingMaxRetries: numberEnv('GRADING_MAX_RETRIES', 2, 0),
    maxImagesPerQuestion: 3,
    maxImageBytes: 6 * 1024 * 1024,
    parallelGradeLimit: 4,
  },
};

export type ConfigGroup = keyof PlatformConfig;

/** Metadata cho màn hình Admin → Cấu hình hệ thống. */
export const CONFIG_GROUP_META: Record<ConfigGroup, { label: string; description: string }> = {
  assessment: {
    label: 'Bài kiểm tra',
    description: 'Số câu diagnostic, chu kỳ đánh giá, cấu trúc bài tiến bộ, ân hạn.',
  },
  levels: {
    label: 'Mức năng lực',
    description: 'Tên 4 mức hiển thị, ngưỡng quy đổi điểm và điều kiện đổi mức.',
  },
  recommendation: {
    label: 'Engine cá nhân hóa',
    description: 'Trọng số Gap Priority, tỷ lệ block, tải/ngày, luật tăng–giảm độ khó.',
  },
  teacher: {
    label: 'Giáo viên',
    description: 'Thời lượng buổi tư vấn, capacity, ngưỡng cảnh báo học sinh.',
  },
  commerce: {
    label: 'Bán hàng',
    description: 'Giá mặc định, thời hạn truy cập, cổng thanh toán, kích hoạt thủ công.',
  },
  notification: {
    label: 'Thông báo',
    description: 'Bật/tắt và nhịp gửi từng loại nhắc học.',
  },
  ai: {
    label: 'AI',
    description: 'Model, phiên bản prompt, giới hạn token, ẩn danh học sinh.',
  },
  mockExam: {
    label: 'Thi thử chấm AI',
    description:
      'Ngưỡng tin cậy để nhờ giáo viên xem lại, thời gian chờ chấm, số ảnh và dung lượng ảnh tối đa.',
  },
};
