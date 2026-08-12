/**
 * CATALOG SEED — Program → Cohort → Course → Pricing → Coupon (specs §3.1).
 *
 * RÀNG BUỘC NGHIỆP VỤ:
 *  - Thêm một kỳ thi mới = thêm một bản ghi Program, KHÔNG sửa code (specs §3.1).
 *  - Course = Program × Khối lớp × Môn học; môn khả dụng phụ thuộc khối (specs §3.2).
 *  - Giá 700.000đ / 180 ngày chỉ là CẤU HÌNH KHỞI TẠO, admin đổi được (specs §11).
 *
 * Các hằng số hiển thị bên dưới được KHAI BÁO LẠI (không import từ `src/lib/domain.ts`)
 * vì `tsx` không đọc `paths` của tsconfig khi chạy `npx tsx prisma/seed.ts`.
 * Giá trị phải khớp với `src/lib/domain.ts`.
 */
import type { GradeBand, Subject } from '@prisma/client';

// ---------------------------------------------------------------------------
// Hằng số hiển thị (bản sao của src/lib/domain.ts — giữ đồng bộ thủ công)
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

/** Suy ra khối từ lớp thực tế — HS luôn lưu lớp thực tế (specs §3.2). */
export function gradeBandOf(grade: number): GradeBand {
  if (grade <= 5) return 'A';
  if (grade <= 7) return 'B';
  if (grade <= 9) return 'C';
  return 'D';
}

// ---------------------------------------------------------------------------
// Program
// ---------------------------------------------------------------------------

export interface ProgramSeed {
  code: string;
  name: string;
  shortName: string;
  logoEmoji: string;
  colorHex: string;
  description: string;
  highlights: string[];
  season: string;
  active: boolean;
  order: number;
}

export const PROGRAMS: ProgramSeed[] = [
  {
    code: 'ASMOPSS',
    name: 'ASMOPSS — Kỳ thi Olympic Toán và Khoa học châu Á',
    shortName: 'ASMOPSS',
    logoEmoji: '🌏',
    colorHex: '#0ea5e9',
    description:
      'Kỳ thi Olympic Toán và Khoa học dành cho học sinh tiểu học và trung học cơ sở khu vực châu Á. Đề thi nhấn mạnh tư duy suy luận và khả năng vận dụng kiến thức vào tình huống thực tế. Vòng loại quốc gia tổ chức trực tuyến, vòng chung kết thi tập trung.',
    highlights: [
      'Đề thi song ngữ Anh – Việt, sát chuẩn khu vực châu Á',
      'Trọng tâm suy luận logic và toán thực tế, ít câu học thuộc',
      'Có vòng loại quốc gia và vòng chung kết quốc tế',
      'Phù hợp học sinh muốn thử sức đấu trường quốc tế lần đầu',
    ],
    season: '2026',
    active: true,
    order: 1,
  },
  {
    code: 'NEO',
    name: 'NEO — Kỳ thi Olympic Toán và Khoa học Quốc tế NEO',
    shortName: 'NEO',
    logoEmoji: '🚀',
    colorHex: '#2563eb',
    description:
      'Kỳ thi Olympic quốc tế NEO tập trung vào năng lực giải quyết vấn đề nhiều bước và tốc độ xử lý. Cấu trúc đề chia rõ ba mức Trung bình – Khá – Giỏi nên rất hợp với lộ trình ôn cá nhân hóa. Đây là chương trình pilot của nền tảng ở khối 6–7 môn Toán.',
    highlights: [
      'Cấu trúc đề phân tầng độ khó rõ ràng, dễ đo tiến bộ',
      'Kho câu hỏi khối 6–7 môn Toán đầy đủ nhất trên nền tảng',
      'Có bài kiểm tra tiến bộ mỗi 14 ngày kèm buổi tư vấn giáo viên',
      'Thi trực tuyến, kết quả có phân tích theo từng kỹ năng',
    ],
    season: '2026',
    active: true,
    order: 2,
  },
  {
    code: 'STEM',
    name: 'STEM — Kỳ thi Olympic Khoa học Công nghệ STEM',
    shortName: 'STEM',
    logoEmoji: '🔬',
    colorHex: '#16a34a',
    description:
      'Sân chơi dành cho học sinh yêu thích khoa học – công nghệ, kết hợp toán ứng dụng, khoa học tự nhiên và tư duy lập trình. Đề thi thiên về mô hình hóa tình huống thực tế và đọc hiểu dữ liệu. Có phần thi thực hành dành cho khối lớp lớn.',
    highlights: [
      'Kết hợp Toán – Khoa học – Công nghệ thông tin trong cùng một đề',
      'Nhiều câu hỏi dựa trên bảng số liệu và biểu đồ thực tế',
      'Khuyến khích tư duy thuật toán từ bậc tiểu học',
      'Có phần thi thực hành cho khối 10–12',
    ],
    season: '2026',
    active: true,
    order: 3,
  },
  {
    code: 'FMC',
    name: 'FMC — Kỳ thi Toán Tư duy FMC',
    shortName: 'FMC',
    logoEmoji: '🧠',
    colorHex: '#f59e0b',
    description:
      'Kỳ thi toán tư duy đề cao khả năng suy luận, tìm quy luật và giải toán bằng nhiều cách. Đề ít phụ thuộc chương trình sách giáo khoa nên phù hợp cả học sinh học trước và học sinh học đúng tiến độ. Thời gian làm bài ngắn, đòi hỏi chiến thuật phân bổ thời gian tốt.',
    highlights: [
      'Trọng tâm toán tư duy, quy luật và suy luận logic',
      'Ít phụ thuộc sách giáo khoa, phù hợp nhiều trình độ',
      'Rèn chiến thuật làm bài và quản lý thời gian',
      'Phù hợp học sinh muốn nâng nền tảng tư duy trước các kỳ thi lớn',
    ],
    season: '2026',
    active: true,
    order: 4,
  },
  {
    // active = false để minh họa việc bật/tắt kỳ thi theo mùa mà KHÔNG xóa dữ liệu.
    // Program tắt sẽ không sinh Course và không hiển thị ở trang chọn kỳ thi.
    code: 'PAS',
    name: 'PAS — Kỳ thi Olympic Khoa học Ứng dụng Thái Bình Dương',
    shortName: 'PAS',
    logoEmoji: '🏅',
    colorHex: '#a855f7',
    description:
      'Kỳ thi khoa học ứng dụng khu vực Thái Bình Dương, tổ chức luân phiên theo mùa. Mùa 2026 chưa mở đăng ký nên chương trình đang ở trạng thái tắt. Dữ liệu vẫn được giữ nguyên để bật lại khi mùa thi mới bắt đầu.',
    highlights: [
      'Đang tạm dừng — minh họa việc bật/tắt kỳ thi theo mùa',
      'Giữ nguyên dữ liệu lịch sử khi tắt, không xóa',
      'Sẽ mở lại khi có lịch thi mùa mới',
    ],
    season: '2026',
    active: false,
    order: 5,
  },
];

// ---------------------------------------------------------------------------
// Cohort — mùa thi 2026
// ---------------------------------------------------------------------------

export const COHORT_YEAR = 2026;
export const COHORT_START = new Date('2026-09-01T00:00:00.000Z');
export const COHORT_END = new Date('2027-06-30T00:00:00.000Z');
export const COHORT_EXAM = new Date('2027-03-15T00:00:00.000Z');

// ---------------------------------------------------------------------------
// Pricing & Coupon
// ---------------------------------------------------------------------------

/** Cấu hình khởi tạo — admin đổi được trong màn hình Bán hàng (specs §11). */
export const DEFAULT_PRICE = 700_000;
export const DEFAULT_ACCESS_DAYS = 180;
export const PRICING_LABEL = 'Giá tiêu chuẩn mùa 2026';

export interface CouponSeed {
  code: string;
  type: 'PERCENT' | 'AMOUNT';
  value: number;
  maxUses: number | null;
  description: string;
}

export const COUPONS: CouponSeed[] = [
  {
    code: 'OLYMPIC10',
    type: 'PERCENT',
    value: 10,
    maxUses: null,
    description: 'Giảm 10% cho mọi khóa — không giới hạn lượt dùng',
  },
  {
    code: 'HOCBONG100',
    type: 'PERCENT',
    value: 100,
    maxUses: 20,
    // Voucher 100% ⇒ Enrollment vẫn được tạo qua entitlement, KHÔNG phụ thuộc Payment (specs §11)
    description: 'Học bổng miễn phí 100% — giới hạn 20 lượt',
  },
];

// ---------------------------------------------------------------------------
// Course
// ---------------------------------------------------------------------------

export interface CourseSeed {
  programCode: string;
  gradeBand: GradeBand;
  subject: Subject;
  name: string;
  description: string;
}

/** Tên khóa dạng "NEO – Khối 6–7 – Toán". */
export function courseName(programCode: string, gradeBand: GradeBand, subject: Subject): string {
  return `${programCode} – ${GRADE_BAND_LABEL[gradeBand]} – ${SUBJECT_LABEL[subject]}`;
}

/** Sinh danh sách course cho MỌI program đang active × khối × môn khả dụng theo khối. */
export function buildCourses(programs: ProgramSeed[] = PROGRAMS): CourseSeed[] {
  const out: CourseSeed[] = [];
  for (const program of programs) {
    if (!program.active) continue; // program tắt thì không mở khóa học
    for (const band of GRADE_BANDS) {
      for (const subject of SUBJECTS_BY_BAND[band]) {
        out.push({
          programCode: program.code,
          gradeBand: band,
          subject,
          name: courseName(program.code, band, subject),
          description: `Lộ trình ôn luyện ${SUBJECT_LABEL[subject]} cho ${GRADE_BAND_LABEL[band].toLowerCase()} theo cấu trúc đề ${program.code} mùa ${program.season}.`,
        });
      }
    }
  }
  return out;
}
