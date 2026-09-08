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

  /**
   * Nội dung giới thiệu hiển thị TRƯỚC khi thanh toán. Để trống được — khối
   * tương ứng tự ẩn trên trang, và admin nhập sau trong khu quản trị.
   */
  tagline?: string;
  longDescription?: string;
  introVideoUrl?: string;
  sections?: { title: string; body: string }[];
  faqs?: { question: string; answer: string }[];

  /**
   * Giới hạn phạm vi khóa học của kỳ thi này. Bỏ trống = mở đủ mọi khối và mọi
   * môn hợp lệ với khối, đúng như bốn kỳ thi lớn.
   *
   * Có kỳ thi chỉ thi một môn (Toán Olympic), có kỳ thi chỉ dành cho một vài
   * khối. Trước đây `buildCourses` luôn sinh đủ 14 khóa nên kiểu kỳ thi đó
   * không khai báo được bằng dữ liệu — phải sửa mã, đúng thứ specs §3.1 cấm.
   */
  bands?: GradeBand[];
  subjects?: Subject[];

  /**
   * Tên khóa đặt theo kỳ thi này thay vì khuôn "MÃ – Khối – Môn".
   * Kỳ thi một môn thì nhắc lại tên môn trong tên khóa là dư.
   */
  courseNamePrefix?: string;
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
    tagline: 'Đấu trường quốc tế đầu tiên, luyện bằng đề song ngữ sát chuẩn châu Á',
    longDescription: [
      'ASMOPSS đo hai thứ cùng lúc: nền kiến thức Toán – Khoa học và khả năng đọc hiểu đề bằng tiếng Anh. Nhiều học sinh giỏi ở lớp vẫn mất điểm oan chỉ vì chưa quen cách diễn đạt của đề quốc tế.',
      'Nền tảng ra bài bám đúng đặc trưng đó: tỷ trọng chương, kiểu câu hỏi và thang độ khó đều lấy từ đề các mùa trước, kèm phần luyện đọc hiểu đề riêng.',
    ].join('\n\n'),
    sections: [
      { title: 'Cấu trúc kỳ thi', body: 'Vòng loại quốc gia thi trực tuyến, vòng chung kết thi tập trung. Đề song ngữ Anh – Việt, nhấn mạnh suy luận và vận dụng thực tế hơn là học thuộc công thức.' },
      { title: 'Ai nên thi', body: 'Học sinh tiểu học và trung học cơ sở muốn thử sức đấu trường quốc tế lần đầu. Không cần đã có giải trước đó — bài kiểm tra đầu vào sẽ tìm đúng tầng kiến thức hiện tại của con.' },
    ],
    faqs: [
      { question: 'Con chưa giỏi tiếng Anh có thi được không?', answer: 'Được. Đề song ngữ nên con vẫn đọc được phần tiếng Việt. Phần luyện tập có riêng nhóm câu giúp làm quen cách diễn đạt của đề quốc tế.' },
      { question: 'Nên bắt đầu ôn trước kỳ thi bao lâu?', answer: 'Tối thiểu 8 tuần để đủ bốn chu kỳ đo. Đặt mục tiêu xong, hệ thống sẽ tính ngược và nói thẳng nếu quỹ thời gian không đủ.' },
    ],
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
    tagline: 'Cấu trúc đề phân tầng rõ ba mức, hợp nhất với lộ trình cá nhân hóa',
    longDescription: [
      'NEO chia đề theo ba mức Trung bình – Khá – Giỏi rất rõ ràng. Đây là lý do NEO khối 6–7 môn Toán được chọn làm chương trình chạy thử của nền tảng: mức độ phân tầng của đề khớp đúng với cách hệ thống đo mastery và nâng hạ độ khó.',
      'Kho câu hỏi của khóa này đầy đủ nhất trên nền tảng, phủ toàn bộ 82 kỹ năng của Toán khối 6–7.',
    ].join('\n\n'),
    sections: [
      { title: 'Cấu trúc kỳ thi', body: 'Thi trực tuyến. Đề chia ba mức độ khó rõ rệt, kết quả trả về kèm phân tích theo từng kỹ năng chứ không chỉ một điểm tổng.' },
      { title: 'Vì sao đo tiến bộ được', body: 'Bài kiểm tra tiến bộ mỗi 14 ngày dùng câu neo — những câu cùng độ khó với lần đo trước — nên con số tăng lên là tăng thật, không phải do đề lần này dễ hơn.' },
    ],
    faqs: [
      { question: 'Khác gì so với luyện đề thông thường?', answer: 'Luyện đề cho con làm cùng một bộ đề như mọi người. Ở đây mỗi học sinh có hồ sơ năng lực riêng theo từng kỹ năng nhỏ, và hệ thống quyết định hôm nay con làm bài nào, mức khó nào.' },
      { question: 'Con mất gốc có theo được không?', answer: 'Đây là trường hợp hệ thống làm tốt nhất. Bài đầu vào tìm đúng tầng kiến thức bị hổng, kể cả khi nó nằm ở lớp dưới, rồi dựng lại từ đó lên.' },
    ],
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
    tagline: 'Thi liên môn Khoa học – Công nghệ, mạnh về vận dụng thực tế',
    longDescription: [
      'STEM không kiểm tra từng môn tách rời mà đặt học sinh vào tình huống cần phối hợp Toán, Khoa học tự nhiên và tư duy công nghệ để giải quyết. Học tủ theo môn gần như không có tác dụng.',
      'Vì vậy lộ trình ở đây luôn xen kẽ nhiều nhóm kỹ năng trong cùng một ngày, thay vì học dứt điểm từng chương rồi mới sang chương khác.',
    ].join('\n\n'),
    sections: [
      { title: 'Cấu trúc kỳ thi', body: 'Đề gồm cả câu trắc nghiệm và câu vận dụng nhiều bước, thường gắn với bối cảnh đời sống hoặc thí nghiệm.' },
      { title: 'Ai nên thi', body: 'Học sinh thích tìm hiểu cách mọi thứ vận hành và không ngại bài dài nhiều bước.' },
    ],
    faqs: [
      { question: 'Cần chuẩn bị dụng cụ thí nghiệm không?', answer: 'Không. Phần thực hành trong đề là các câu suy luận về thí nghiệm, làm hoàn toàn trên giấy hoặc trên máy.' },
    ],
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
    tagline: 'Toán tư duy thuần túy — đo cách nghĩ, không đo trí nhớ công thức',
    longDescription: [
      'FMC tập trung vào tư duy toán học: quy luật, suy luận, đếm và tối ưu. Rất ít câu áp dụng công thức trực tiếp, nên học sinh quen học thuộc thường lúng túng ngay ở những câu tưởng dễ.',
      'Lộ trình ở đây dành nhiều thời gian cho khối thử thách hơn các kỳ thi khác, và luôn kèm lời giải trình bày rõ hướng nghĩ chứ không chỉ đáp số.',
    ].join('\n\n'),
    sections: [
      { title: 'Cấu trúc kỳ thi', body: 'Toàn bộ là bài toán tư duy, chia theo độ khó tăng dần. Điểm số có trọng số theo độ khó.' },
      { title: 'Ai nên thi', body: 'Học sinh có nền Toán vững và muốn rèn cách nghĩ, không chỉ luyện tốc độ tính.' },
    ],
    faqs: [
      { question: 'Con học Toán ở trường tốt là thi được chứ?', answer: 'Chưa chắc. FMC hỏi kiểu khác hẳn đề trên lớp. Bài kiểm tra đầu vào sẽ cho biết con đang ở đâu so với yêu cầu của kỳ thi này.' },
    ],
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
  {
    /*
     * KỲ THI MỘT MÔN — bộ dữ liệu dùng để demo.
     *
     * Khai `subjects: ['MATH']` nên chỉ sinh 4 khóa Toán cho 4 khối, thay vì 14
     * khóa đủ môn như bốn kỳ thi lớn. Bốn khóa này KHÔNG cần kho câu hỏi riêng:
     * Chapter và Skill gắn theo cặp (môn, khối) chứ không theo kỳ thi, nên khóa
     * Toán khối 3–4–5 ở đây dùng đúng cây kiến thức và đúng kho câu Toán khối
     * 3–4–5 mà các kỳ thi khác đang dùng. Thêm kỳ thi không nhân bản học liệu.
     */
    code: 'OLP',
    name: 'Toán Olympic — Vòng luyện chuyên sâu',
    shortName: 'Toán Olympic',
    logoEmoji: '➗',
    colorHex: '#0f766e',
    description:
      'Vòng luyện Toán Olympic dành cho học sinh đã qua vòng trường và cần một lộ trình riêng theo đúng chỗ mình còn hổng. Chỉ một môn Toán, bốn khối lớp, mỗi khối một khóa.',
    highlights: [
      'Chỉ Toán — không dàn mỏng sang môn khác',
      'Dùng chung cây kiến thức Toán đã kiểm duyệt của hệ thống',
      'Bốn khối lớp, mỗi khối một lộ trình riêng',
    ],
    season: '2026',
    active: true,
    order: 6,
    subjects: ['MATH'],
    courseNamePrefix: 'Toán Olympic',
    tagline: 'Một môn, làm cho tới: đo từng kỹ năng Toán rồi vá đúng chỗ hổng.',
    longDescription: [
      'Toán Olympic không hỏi lại những gì con đã làm đúng ở trường. Nó hỏi những bước suy luận mà đề trên lớp ít khi yêu cầu: đặt lại bài toán theo cách khác, tìm quy luật trước khi tính, và kiểm tra lại kết quả bằng một con đường thứ hai.',
      'Vì vậy vòng luyện này bắt đầu bằng một bài đo 15 câu rải đúng tỷ trọng các chương trong đề thật. Xong bài là có bản đồ kỹ năng: kỹ năng nào đã vững, kỹ năng nào mới chỉ làm được khi có gợi ý, kỹ năng nào chưa chạm tới.',
      'Từ bản đồ đó, lộ trình theo ngày được dựng vừa với quỹ thời gian gia đình khai báo, và tự dàn lại khi con học không kịp. Mỗi 14 ngày có một bài đo tiến bộ dùng câu neo, kèm 20 phút tư vấn với giáo viên đã đọc trước hồ sơ.',
    ].join('\n\n'),
    sections: [
      {
        title: 'Ai nên vào vòng này',
        body: 'Học sinh đã đi thi ít nhất một vòng và muốn biết mình còn thiếu gì, thay vì luyện thêm đề một cách chung chung. Con chưa từng thi cũng vào được — bài đo đầu vào sẽ nói rõ nên bắt đầu từ đâu.',
      },
      {
        title: 'Khác gì với việc mua thêm một bộ đề',
        body: 'Bộ đề cho con nhiều câu để làm. Vòng này cho con biết nên làm câu nào trước, vì sao, và dừng khi nào — dựa trên chính những gì con vừa làm sai.',
      },
    ],
    faqs: [
      {
        question: 'Con đang học khối 6 nhưng làm được đề khối 8, nên chọn khóa nào?',
        answer: 'Chọn đúng khối con đang học. Độ khó trong lộ trình tự nâng lên khi con làm đúng ba câu liên tiếp, nên con sẽ nhanh chóng gặp câu ở mức thật của mình mà không bỏ sót phần nền.',
      },
      {
        question: 'Vòng này có đề thi thử không?',
        answer: 'Có. Khu Thi thử dùng chung cho mọi kỳ thi, hiện đã có 15 đề Toán và Khoa học các mùa trước, chấm tự động kèm nhận xét từng câu.',
      },
    ],
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
  tagline: string;
  longDescription: string;
  outcomes: string[];
  syllabus: { title: string; detail: string }[];
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
    const bands = program.bands ?? GRADE_BANDS;
    for (const band of bands) {
      // Giao của "môn hợp lệ với khối" và "môn kỳ thi này thi". Thứ tự lấy theo
      // SUBJECTS_BY_BAND để danh sách khóa không đổi chỗ giữa hai lần seed.
      const subjects = SUBJECTS_BY_BAND[band].filter(
        (subject) => !program.subjects || program.subjects.includes(subject),
      );
      for (const subject of subjects) {
        const subjectName = SUBJECT_LABEL[subject];
        const bandName = GRADE_BAND_LABEL[band].toLowerCase();
        // Tên gọi kỳ thi trong phần chữ bán hàng. Bốn kỳ thi lớn có shortName
        // trùng code nên chữ của chúng không đổi; kỳ thi một môn thì đọc thành
        // "cấu trúc đề Toán Olympic" chứ không phải "cấu trúc đề OLP".
        const programLabel = program.shortName || program.code;
        const single = subjects.length === 1 && (program.subjects?.length ?? 0) === 1;
        out.push({
          programCode: program.code,
          gradeBand: band,
          subject,
          name: program.courseNamePrefix
            ? single
              ? `${program.courseNamePrefix} — ${GRADE_BAND_LABEL[band]}`
              : `${program.courseNamePrefix} — ${GRADE_BAND_LABEL[band]} — ${subjectName}`
            : courseName(program.code, band, subject),
          description: `Lộ trình ôn luyện ${subjectName} cho ${bandName} theo cấu trúc đề ${programLabel} mùa ${program.season}.`,
          tagline: `Đo năng lực theo từng kỹ năng ${subjectName.toLowerCase()}, rồi giao đúng bài con cần hôm nay.`,
          longDescription: [
            `Khóa ${subjectName} ${bandName} bám theo cấu trúc đề ${programLabel}: tỷ trọng từng chương, thang độ khó và kiểu câu hỏi đều lấy từ đề các mùa trước chứ không dùng chung một kho cho mọi kỳ thi.`,
            'Con bắt đầu bằng bài kiểm tra đầu vào 15 câu. Xong bài là có ngay bản đồ kỹ năng: mạnh ở đâu, hổng ở đâu, nên sửa theo thứ tự nào. Từ đó hệ thống dựng lộ trình theo ngày vừa với quỹ thời gian gia đình khai báo.',
            'Mỗi 14 ngày có một bài kiểm tra tiến bộ dùng câu neo để đo mức tiến bộ thật, kèm buổi tư vấn 20 phút với giáo viên đã đọc trước toàn bộ hồ sơ của con.',
          ].join('\n\n'),
          outcomes: [
            `Biết chính xác con đang hổng kỹ năng ${subjectName.toLowerCase()} nào và ở mức nào`,
            'Có lộ trình theo ngày vừa sức, tự dàn lại lịch khi học không kịp',
            'Đo được mức tiến bộ thật sau mỗi 14 ngày bằng câu neo',
            'Được giáo viên tư vấn 20 phút sau mỗi lần đo',
          ],
          syllabus: [
            {
              title: 'Chặng 1 — Đo năng lực đầu vào',
              detail:
                'Bài kiểm tra 15 câu theo đúng cấu trúc đề. Kết quả dựng thành bản đồ kỹ năng chi tiết, không phải một điểm số chung chung.',
            },
            {
              title: 'Chặng 2 — Vá lỗ hổng nặng nhất',
              detail:
                'Ưu tiên những kỹ năng dưới ngưỡng, có tính tới thứ tự tiên quyết: chưa vững phần nền thì chưa học phần trên.',
            },
            {
              title: 'Chặng 3 — Củng cố và nâng độ khó',
              detail:
                'Ba câu đúng liên tiếp là nâng một bậc, hai câu sai liên tiếp là hạ xuống. Con luôn ở vùng vừa đủ khó để phải nghĩ.',
            },
            {
              title: 'Chặng 4 — Luyện theo cấu trúc đề thật',
              detail:
                'Khi mốc thi tới gần, hệ thống dồn trọng tâm vào các chương có tỷ trọng cao trong đề và luyện tốc độ làm bài.',
            },
          ],
        });
      }
    }
  }
  return out;
}
