/**
 * Mẫu thông báo — 9 trigger theo specs §12.
 *
 * Giọng văn: đối tượng là học sinh 8–17 tuổi và phụ huynh. Ngắn, thân thiện,
 * luôn có một hành động rõ ràng. TUYỆT ĐỐI không dọa nạt, không so sánh với bạn
 * khác, không tạo cảm giác tội lỗi khi bỏ buổi học.
 */
import type { NotificationChannel } from '@prisma/client';

export type NotificationTemplateData = Record<string, unknown>;

export interface NotificationTemplate {
  code: string;
  channel: NotificationChannel;
  title: (data: NotificationTemplateData) => string;
  body: (data: NotificationTemplateData) => string;
}

/** Mã template — dùng làm khóa tra cứu ở service, không đổi tùy tiện. */
export const TEMPLATE_CODES = {
  AFTER_PURCHASE: 'AFTER_PURCHASE',
  DIAGNOSTIC_REMINDER: 'DIAGNOSTIC_REMINDER',
  DAILY_PLAN: 'DAILY_PLAN',
  INACTIVE_REMINDER: 'INACTIVE_REMINDER',
  ASSESSMENT_DUE: 'ASSESSMENT_DUE',
  NEW_REPORT: 'NEW_REPORT',
  SESSION_REMINDER: 'SESSION_REMINDER',
  TEACHER_NOTES_READY: 'TEACHER_NOTES_READY',
  ACCESS_EXPIRING: 'ACCESS_EXPIRING',
} as const;

export type TemplateCode = (typeof TEMPLATE_CODES)[keyof typeof TEMPLATE_CODES];

// ---------------------------------------------------------------------------
// Tiện ích đọc dữ liệu động — thiếu trường thì dùng chữ thay thế, không vỡ câu
// ---------------------------------------------------------------------------

function text(value: unknown, fallback: string): string {
  if (typeof value === 'string' && value.trim() !== '') return value.trim();
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  return fallback;
}

function num(value: unknown, fallback: number): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim() !== '' && Number.isFinite(Number(value))) {
    return Number(value);
  }
  return fallback;
}

function list(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((entry): entry is string => typeof entry === 'string' && entry.trim() !== '')
    .map((entry) => entry.trim());
}

/** "khóa Toán 6–7 – ASMOPSS" nếu đủ dữ liệu, ngược lại nói chung chung. */
function courseLabel(data: NotificationTemplateData): string {
  const course = text(data.courseName, '');
  const program = text(data.programName, '');
  if (course && program) return `${course} (${program})`;
  if (course) return course;
  if (program) return program;
  return 'khóa học của bạn';
}

function dayWord(days: number): string {
  return days <= 0 ? 'hôm nay' : `${days} ngày nữa`;
}

// ---------------------------------------------------------------------------
// 9 mẫu thông báo
// ---------------------------------------------------------------------------

export const NOTIFICATION_TEMPLATES: Record<string, NotificationTemplate> = {
  [TEMPLATE_CODES.AFTER_PURCHASE]: {
    code: TEMPLATE_CODES.AFTER_PURCHASE,
    channel: 'EMAIL',
    title: (data) => `Đã kích hoạt ${courseLabel(data)}`,
    body: (data) =>
      [
        `Chào ${text(data.studentName, 'bạn')}, ${courseLabel(data)} đã sẵn sàng.`,
        `Việc đầu tiên là bài kiểm tra đầu vào ${num(data.itemCount, 15)} câu — làm xong bạn sẽ nhận lộ trình riêng đúng với sức mình.`,
        'Bấm "Làm bài kiểm tra đầu vào" trên trang học của bạn để bắt đầu.',
      ].join(' '),
  },

  [TEMPLATE_CODES.DIAGNOSTIC_REMINDER]: {
    code: TEMPLATE_CODES.DIAGNOSTIC_REMINDER,
    channel: 'EMAIL',
    title: () => 'Làm bài kiểm tra đầu vào để nhận lộ trình riêng',
    body: (data) =>
      [
        `${courseLabel(data)} của bạn đang chờ bước đầu tiên.`,
        `Bài kiểm tra đầu vào chỉ ${num(data.itemCount, 15)} câu, làm được đến đâu hay đến đó — mục tiêu là để hệ thống hiểu bạn đang mạnh yếu ở đâu, không phải để chấm điểm.`,
        'Bấm "Bắt đầu kiểm tra" khi bạn sẵn sàng.',
      ].join(' '),
  },

  [TEMPLATE_CODES.DAILY_PLAN]: {
    code: TEMPLATE_CODES.DAILY_PLAN,
    channel: 'IN_APP',
    title: (data) => `Bài học ${text(data.dayLabel, 'hôm nay')} đã sẵn sàng`,
    body: (data) =>
      [
        `Hôm nay có ${num(data.itemCount, 0)} câu, khoảng ${num(data.minutes, 0)} phút.`,
        list(data.focusNames).length > 0
          ? `Trọng tâm: ${list(data.focusNames).slice(0, 3).join(', ')}.`
          : 'Bài được chọn đúng theo phần bạn đang cần củng cố.',
        'Vào mục "Học hôm nay" để bắt đầu.',
      ].join(' '),
  },

  [TEMPLATE_CODES.INACTIVE_REMINDER]: {
    code: TEMPLATE_CODES.INACTIVE_REMINDER,
    channel: 'IN_APP',
    title: () => 'Quay lại học tiếp nhé',
    body: (data) =>
      [
        `Đã ${num(data.days, 2)} ngày bạn chưa luyện — không sao cả.`,
        `Chỉ cần ${num(data.minutes, 15)} phút hôm nay là bắt nhịp lại được.`,
        'Nếu lịch cũ quá dày, bấm "Tái sắp lịch" để hệ thống dàn lại các ngày còn thiếu cho vừa sức.',
      ].join(' '),
  },

  [TEMPLATE_CODES.ASSESSMENT_DUE]: {
    code: TEMPLATE_CODES.ASSESSMENT_DUE,
    channel: 'EMAIL',
    title: (data) => `Bài kiểm tra tiến bộ đến hạn ${dayWord(num(data.days, 1))}`,
    body: (data) =>
      [
        `Sau ${num(data.cycleDays, 14)} ngày luyện tập, đây là lúc đo lại xem bạn tiến bộ tới đâu.`,
        `Bài gồm ${num(data.itemCount, 15)} câu, làm trong khoảng ${num(data.minutes, 30)} phút.`,
        'Kết quả sẽ được so với bài trước để thấy rõ phần nào đã khá lên.',
      ].join(' '),
  },

  [TEMPLATE_CODES.NEW_REPORT]: {
    code: TEMPLATE_CODES.NEW_REPORT,
    channel: 'EMAIL',
    title: () => 'Báo cáo tiến bộ mới của bạn đã có',
    body: (data) => {
      const delta = num(data.masteryDelta, 0);
      const trend =
        delta > 0
          ? `Mức thành thạo trung bình tăng ${Math.round(delta * 10) / 10} điểm so với lần trước.`
          : delta < 0
            ? 'Một vài kỹ năng cần củng cố thêm — báo cáo đã chỉ rõ nên bắt đầu từ đâu.'
            : 'Báo cáo đã chỉ rõ phần nào nên ưu tiên trong hai tuần tới.';
      return [
        `Kết quả bài kiểm tra ${text(data.assessmentName, 'tiến bộ')} đã được chấm xong.`,
        trend,
        'Bấm "Xem báo cáo" để đọc chi tiết theo từng kỹ năng.',
      ].join(' ');
    },
  },

  [TEMPLATE_CODES.SESSION_REMINDER]: {
    code: TEMPLATE_CODES.SESSION_REMINDER,
    channel: 'EMAIL',
    title: (data) => `Buổi tư vấn ${num(data.durationMinutes, 20)} phút lúc ${text(data.timeLabel, 'sắp tới')}`,
    body: (data) => {
      const link = text(data.meetingLink, '');
      return [
        `Thầy/cô sẽ cùng bạn xem lại kết quả hai tuần qua và chốt 1–3 việc cần làm tiếp.`,
        `Thời gian: ${text(data.timeLabel, 'xem trong mục Lịch tư vấn')}.`,
        link ? `Link vào phòng học: ${link}` : 'Link phòng học nằm trong mục "Lịch tư vấn".',
        'Bạn chỉ cần chuẩn bị câu hỏi mình đang thắc mắc.',
      ].join(' ');
    },
  },

  [TEMPLATE_CODES.TEACHER_NOTES_READY]: {
    code: TEMPLATE_CODES.TEACHER_NOTES_READY,
    channel: 'EMAIL',
    title: () => 'Thầy/cô đã gửi nhận xét sau buổi tư vấn',
    body: (data) => {
      const items = list(data.actionItems).slice(0, 3);
      const actions =
        items.length > 0
          ? `Việc cần làm hai tuần tới: ${items.map((item, index) => `${index + 1}) ${item}`).join('; ')}.`
          : 'Nhận xét chi tiết đã có trong mục "Lịch tư vấn".';
      return [
        `${text(data.actionLabel, 'Lộ trình')} đã được cập nhật theo trao đổi trong buổi vừa rồi.`,
        actions,
        'Lộ trình của chu kỳ tới đã tự điều chỉnh theo hướng dẫn này.',
      ].join(' ');
    },
  },

  [TEMPLATE_CODES.ACCESS_EXPIRING]: {
    code: TEMPLATE_CODES.ACCESS_EXPIRING,
    channel: 'EMAIL',
    title: (data) => `${courseLabel(data)} còn ${num(data.days, 7)} ngày truy cập`,
    body: (data) =>
      [
        `Quyền truy cập ${courseLabel(data)} sẽ kết thúc ngày ${text(data.expiresAtLabel, 'sắp tới')}.`,
        'Dữ liệu học tập và báo cáo của bạn vẫn được giữ nguyên.',
        'Nếu muốn học tiếp, bấm "Gia hạn" hoặc chọn khóa kế tiếp trong mục Khóa học của tôi.',
      ].join(' '),
  },
};

/** Render nhanh một mẫu; trả về null khi mã template không tồn tại. */
export function renderTemplate(
  templateCode: string,
  data: NotificationTemplateData,
): { title: string; body: string; channel: NotificationChannel } | null {
  const template = NOTIFICATION_TEMPLATES[templateCode];
  if (!template) return null;
  return {
    title: template.title(data),
    body: template.body(data),
    channel: template.channel,
  };
}
