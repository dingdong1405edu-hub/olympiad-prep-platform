/**
 * TAXONOMY SEED — cấu trúc kiến thức 4 tầng theo specs §3.3.
 *
 *   Môn + Khối  →  Chương (Chapter)  →  Kỹ năng (Skill)  →  Câu hỏi (Item)
 *
 * RÀNG BUỘC NGHIỆP VỤ:
 *  - Taxonomy dùng CHUNG cho mọi program: khóa là (subject, gradeBand), KHÔNG gắn programId.
 *    Item khoanh vùng program bằng `programScope` (rỗng = dùng chung).
 *  - `Skill.code` là UNIQUE TOÀN CỤC trong DB → mã đầy đủ = `${prefix}-${shortCode}`
 *    (vd `M67-RATIO02`). `Chapter.code` chỉ cần unique theo (subject, gradeBand).
 *  - Đồ thị tiên quyết KHÔNG ĐƯỢC CÓ CHU TRÌNH. Quy ước an toàn: một skill chỉ được
 *    khai báo prerequisite trỏ tới skill ĐÃ KHAI BÁO TRƯỚC ĐÓ trong cùng taxonomy
 *    → theo thứ tự tuyến tính nên không thể tạo chu trình. `validateTaxonomy()` kiểm
 *    tra lại bằng thuật toán tô màu DFS để chắc chắn.
 *
 * File này KHÔNG import gì từ `src/` (tsx không đọc `paths` của tsconfig).
 */
import type { GradeBand, Subject } from '@prisma/client';

// ---------------------------------------------------------------------------
// Kiểu dữ liệu
// ---------------------------------------------------------------------------

export interface SkillSeed {
  /** Mã ngắn, tiền tố là mã chương. VD: `RATIO02`. Mã đầy đủ = `${prefix}-${code}`. */
  code: string;
  name: string;
  description?: string;
  /** Tỷ trọng riêng của kỹ năng trong blueprint (mặc định 1). */
  weight?: number;
  /** Mã ngắn của các skill tiên quyết — CHỈ trỏ về skill khai báo trước đó. */
  prereq?: string[];
  /** Khóa generator trong `generators.ts`. Mặc định = `code`. */
  gen?: string;
  /** Tham số truyền cho generator (đổi dạng bài, đổi thang số). */
  genParams?: Record<string, string | number>;
}

export interface ChapterSeed {
  code: string;
  name: string;
  description?: string;
  /** 1.0 – 1.8: engine dùng để cân đối blueprint giữa các chương. */
  weight: number;
  skills: SkillSeed[];
}

export interface TaxonomySeed {
  subject: Subject;
  gradeBand: GradeBand;
  /** Tiền tố mã skill/item. VD `M67` = Toán khối 6–7. */
  prefix: string;
  /** true = taxonomy chi tiết (nhiều câu/skill); false = taxonomy tối giản. */
  detailed: boolean;
  chapters: ChapterSeed[];
}

// ---------------------------------------------------------------------------
// TOÁN — KHỐI B (lớp 6–7): taxonomy CHI TIẾT
// 22 chương × 3–4 kỹ năng = 82 kỹ năng
// ---------------------------------------------------------------------------

const MATH_B: TaxonomySeed = {
  subject: 'MATH',
  gradeBand: 'B',
  prefix: 'M67',
  detailed: true,
  chapters: [
    {
      code: 'SET',
      name: 'Tập hợp và số tự nhiên',
      description: 'Cách viết tập hợp, đếm phần tử, thứ tự và bốn phép tính với số tự nhiên.',
      weight: 1.0,
      skills: [
        { code: 'SET01', name: 'Viết tập hợp và kí hiệu thuộc / không thuộc', weight: 0.9 },
        { code: 'SET02', name: 'Đếm số phần tử của một tập hợp số tự nhiên', weight: 1.0 },
        { code: 'SET03', name: 'So sánh và làm tròn số tự nhiên', weight: 0.9 },
        {
          code: 'SET04',
          name: 'Thứ tự thực hiện phép tính với số tự nhiên',
          weight: 1.3,
          prereq: ['SET03'],
        },
      ],
    },
    {
      code: 'POW',
      name: 'Lũy thừa với số mũ tự nhiên',
      description: 'Định nghĩa lũy thừa, nhân chia lũy thừa cùng cơ số, so sánh lũy thừa.',
      weight: 1.1,
      skills: [
        { code: 'POW01', name: 'Viết gọn tích thành lũy thừa và tính giá trị lũy thừa', weight: 1.0 },
        { code: 'POW02', name: 'Nhân, chia hai lũy thừa cùng cơ số', weight: 1.1, prereq: ['POW01'] },
        {
          code: 'POW03',
          name: 'Tính giá trị biểu thức có lũy thừa',
          weight: 1.2,
          prereq: ['POW01', 'SET04'],
        },
        { code: 'POW04', name: 'So sánh hai lũy thừa', weight: 1.0, prereq: ['POW02'] },
      ],
    },
    {
      code: 'DIV',
      name: 'Quan hệ chia hết, ước và bội',
      description: 'Dấu hiệu chia hết, tìm ước – bội, tính chất chia hết của một tổng.',
      weight: 1.2,
      skills: [
        { code: 'DIV01', name: 'Dấu hiệu chia hết cho 2, 3, 5, 9', weight: 1.1 },
        { code: 'DIV02', name: 'Tìm tập hợp ước của một số', weight: 1.0, prereq: ['DIV01'] },
        { code: 'DIV03', name: 'Tìm bội của một số trong khoảng cho trước', weight: 0.9 },
        { code: 'DIV04', name: 'Tính chất chia hết của một tổng, một hiệu', weight: 1.2, prereq: ['DIV01'] },
      ],
    },
    {
      code: 'PRIME',
      name: 'Số nguyên tố và phân tích ra thừa số nguyên tố',
      description: 'Nhận biết số nguyên tố – hợp số, phân tích ra thừa số nguyên tố, đếm ước.',
      weight: 1.1,
      skills: [
        { code: 'PRIME01', name: 'Nhận biết số nguyên tố và hợp số', weight: 1.0, prereq: ['DIV02'] },
        {
          code: 'PRIME02',
          name: 'Phân tích một số ra thừa số nguyên tố',
          weight: 1.2,
          prereq: ['PRIME01', 'POW01'],
        },
        { code: 'PRIME03', name: 'Đếm số ước của một số từ dạng phân tích', weight: 1.1, prereq: ['PRIME02'] },
      ],
    },
    {
      code: 'GCDLCM',
      name: 'ƯCLN và BCNN',
      description: 'Tìm ƯCLN, BCNN bằng phân tích thừa số nguyên tố và vận dụng vào toán lời văn.',
      weight: 1.5,
      skills: [
        { code: 'GCDLCM01', name: 'Tìm ƯCLN của hai số', weight: 1.2, prereq: ['PRIME02'] },
        { code: 'GCDLCM02', name: 'Tìm BCNN của hai số', weight: 1.3, prereq: ['PRIME02'] },
        {
          code: 'GCDLCM03',
          name: 'Bài toán chia đều — vận dụng ƯCLN',
          weight: 1.3,
          prereq: ['GCDLCM01'],
        },
        {
          code: 'GCDLCM04',
          name: 'Bài toán gặp lại — vận dụng BCNN',
          weight: 1.4,
          prereq: ['GCDLCM02'],
        },
      ],
    },
    {
      code: 'INT',
      name: 'Số nguyên',
      description: 'Cộng trừ nhân chia số nguyên, quy tắc dấu và quy tắc dấu ngoặc.',
      weight: 1.3,
      skills: [
        { code: 'INT01', name: 'Cộng, trừ hai số nguyên', weight: 1.2 },
        { code: 'INT02', name: 'Nhân, chia số nguyên và quy tắc dấu', weight: 1.2, prereq: ['INT01'] },
        { code: 'INT03', name: 'Quy tắc dấu ngoặc, bỏ ngoặc', weight: 1.1, prereq: ['INT01'] },
        {
          code: 'INT04',
          name: 'Tính giá trị biểu thức số nguyên nhiều bước',
          weight: 1.3,
          prereq: ['INT02', 'INT03', 'SET04'],
        },
      ],
    },
    {
      code: 'FRA',
      name: 'Phân số',
      description: 'Rút gọn, quy đồng, so sánh và bốn phép tính với phân số.',
      weight: 1.6,
      skills: [
        {
          code: 'FRA01',
          name: 'Rút gọn phân số và nhận biết phân số bằng nhau',
          weight: 1.2,
          prereq: ['GCDLCM01'],
        },
        {
          code: 'FRA02',
          name: 'Quy đồng mẫu và so sánh phân số',
          weight: 1.3,
          prereq: ['FRA01', 'GCDLCM02'],
        },
        {
          code: 'FRA03',
          name: 'Cộng, trừ phân số',
          description: 'Bắt buộc quy đồng mẫu trước khi cộng — lỗi kinh điển là cộng thẳng tử với tử.',
          weight: 1.4,
          prereq: ['FRA02'],
        },
        { code: 'FRA04', name: 'Nhân, chia phân số', weight: 1.3, prereq: ['FRA01'] },
      ],
    },
    {
      code: 'DEC',
      name: 'Số thập phân',
      description: 'Bốn phép tính với số thập phân, làm tròn và đổi qua lại với phân số.',
      weight: 1.2,
      skills: [
        { code: 'DEC01', name: 'Cộng, trừ, nhân, chia số thập phân', weight: 1.2 },
        { code: 'DEC02', name: 'Làm tròn số thập phân', weight: 0.9, prereq: ['DEC01'] },
        { code: 'DEC03', name: 'Đổi phân số sang số thập phân và ngược lại', weight: 1.1, prereq: ['FRA01'] },
      ],
    },
    {
      code: 'RATIO',
      name: 'Tỉ số và tỉ lệ thức',
      description: 'Tỉ số của hai đại lượng, tính chất tỉ lệ thức, dãy tỉ số bằng nhau.',
      weight: 1.7,
      skills: [
        { code: 'RATIO01', name: 'Tỉ số của hai đại lượng', weight: 1.2, prereq: ['FRA01'] },
        {
          code: 'RATIO02',
          name: 'Tính chất tỉ lệ thức — tìm số hạng chưa biết',
          description: 'Muốn dùng tính chất tỉ lệ thức thì trước hết phải lập đúng tỉ số.',
          weight: 1.4,
          prereq: ['RATIO01'],
        },
        { code: 'RATIO03', name: 'Dãy tỉ số bằng nhau', weight: 1.4, prereq: ['RATIO02'] },
        { code: 'RATIO04', name: 'Chia một số theo tỉ lệ cho trước', weight: 1.3, prereq: ['RATIO03'] },
      ],
    },
    {
      code: 'PROP',
      name: 'Đại lượng tỉ lệ thuận và tỉ lệ nghịch',
      description: 'Hệ số tỉ lệ, nhận dạng và giải bài toán tỉ lệ thuận – tỉ lệ nghịch.',
      weight: 1.5,
      skills: [
        { code: 'PROP01', name: 'Hệ số tỉ lệ của hai đại lượng tỉ lệ thuận', weight: 1.1, prereq: ['RATIO01'] },
        { code: 'PROP02', name: 'Giải bài toán tỉ lệ thuận', weight: 1.3, prereq: ['PROP01'] },
        { code: 'PROP03', name: 'Giải bài toán tỉ lệ nghịch', weight: 1.3, prereq: ['RATIO02'] },
        {
          code: 'PROP04',
          name: 'Phân biệt tỉ lệ thuận và tỉ lệ nghịch trong tình huống thực tế',
          weight: 1.2,
          prereq: ['PROP02', 'PROP03'],
        },
      ],
    },
    {
      code: 'PERCENT',
      name: 'Tỉ số phần trăm',
      description: 'Ba dạng toán phần trăm cơ bản và bài toán tăng – giảm giá.',
      weight: 1.4,
      skills: [
        { code: 'PERCENT01', name: 'Tìm giá trị phần trăm của một số', weight: 1.2, prereq: ['FRA04'] },
        {
          code: 'PERCENT02',
          name: 'Tìm một số khi biết giá trị phần trăm của nó',
          weight: 1.3,
          prereq: ['PERCENT01'],
        },
        { code: 'PERCENT03', name: 'Tính tỉ số phần trăm của hai số', weight: 1.2, prereq: ['RATIO01'] },
        {
          code: 'PERCENT04',
          name: 'Bài toán tăng giá, giảm giá, lãi suất',
          weight: 1.4,
          prereq: ['PERCENT01', 'PERCENT03'],
        },
      ],
    },
    {
      code: 'EXPR',
      name: 'Biểu thức đại số',
      description: 'Tính giá trị biểu thức, thu gọn, nhân phá ngoặc và lập biểu thức từ lời văn.',
      weight: 1.4,
      skills: [
        { code: 'EXPR01', name: 'Tính giá trị biểu thức tại giá trị cho trước của biến', weight: 1.2, prereq: ['INT04'] },
        { code: 'EXPR02', name: 'Thu gọn biểu thức — cộng trừ các hạng tử đồng dạng', weight: 1.3, prereq: ['EXPR01'] },
        { code: 'EXPR03', name: 'Nhân một số với một tổng, phá ngoặc', weight: 1.3, prereq: ['EXPR02', 'POW02'] },
        { code: 'EXPR04', name: 'Lập biểu thức đại số từ tình huống lời văn', weight: 1.3, prereq: ['EXPR01'] },
      ],
    },
    {
      code: 'EQ',
      name: 'Phương trình bậc nhất một ẩn',
      description: 'Giải phương trình bậc nhất các dạng và giải bài toán bằng cách lập phương trình.',
      weight: 1.8,
      skills: [
        {
          code: 'EQ01',
          name: 'Giải phương trình dạng ax + b = c',
          description: 'Muốn giải được phương trình thì phải biến đổi biểu thức thành thạo trước.',
          weight: 1.3,
          prereq: ['EXPR02'],
        },
        { code: 'EQ02', name: 'Giải phương trình có ngoặc, ẩn ở hai vế', weight: 1.4, prereq: ['EQ01', 'EXPR03'] },
        { code: 'EQ03', name: 'Giải phương trình chứa mẫu số — khử mẫu', weight: 1.5, prereq: ['EQ02', 'FRA03'] },
        { code: 'EQ04', name: 'Giải bài toán bằng cách lập phương trình', weight: 1.5, prereq: ['EQ02', 'EXPR04'] },
      ],
    },
    {
      code: 'INEQ',
      name: 'Bất đẳng thức và so sánh',
      description: 'So sánh biểu thức số, tìm số nguyên thỏa mãn bất đẳng thức.',
      weight: 1.1,
      skills: [
        { code: 'INEQ01', name: 'So sánh hai biểu thức số', weight: 1.0, prereq: ['INT01', 'FRA02'] },
        { code: 'INEQ02', name: 'Tìm số nguyên thỏa mãn bất đẳng thức kép', weight: 1.1, prereq: ['INEQ01'] },
        { code: 'INEQ03', name: 'Giá trị lớn nhất, nhỏ nhất của biểu thức đơn giản', weight: 1.2, prereq: ['INEQ01'] },
      ],
    },
    {
      code: 'MOTION',
      name: 'Toán chuyển động',
      description: 'Quan hệ quãng đường – vận tốc – thời gian, chuyển động ngược chiều, cùng chiều, trên dòng nước.',
      weight: 1.5,
      skills: [
        { code: 'MOTION01', name: 'Quan hệ s = v × t', weight: 1.2, prereq: ['DEC01'] },
        { code: 'MOTION02', name: 'Chuyển động ngược chiều — bài toán gặp nhau', weight: 1.4, prereq: ['MOTION01', 'EQ04'] },
        { code: 'MOTION03', name: 'Chuyển động cùng chiều — bài toán đuổi kịp', weight: 1.4, prereq: ['MOTION01', 'EQ04'] },
        { code: 'MOTION04', name: 'Chuyển động trên dòng nước — xuôi dòng, ngược dòng', weight: 1.3, prereq: ['MOTION02'] },
      ],
    },
    {
      code: 'WORK',
      name: 'Toán năng suất và công việc',
      description: 'Năng suất, thời gian hoàn thành, làm chung – làm riêng.',
      weight: 1.3,
      skills: [
        { code: 'WORK01', name: 'Năng suất và thời gian hoàn thành công việc', weight: 1.2, prereq: ['FRA04'] },
        { code: 'WORK02', name: 'Hai người cùng làm chung một công việc', weight: 1.4, prereq: ['WORK01', 'FRA03'] },
        { code: 'WORK03', name: 'Bài toán vòi nước chảy vào bể', weight: 1.3, prereq: ['WORK02'] },
      ],
    },
    {
      code: 'GEO',
      name: 'Điểm, đường thẳng, góc',
      description: 'Hình học phẳng cơ bản: đường thẳng, tia, đoạn thẳng, trung điểm, góc.',
      weight: 1.2,
      skills: [
        { code: 'GEO01', name: 'Điểm, đường thẳng, tia, đoạn thẳng — đếm hình', weight: 1.0 },
        { code: 'GEO02', name: 'Trung điểm và độ dài đoạn thẳng', weight: 1.1, prereq: ['GEO01'] },
        { code: 'GEO03', name: 'Số đo góc, hai góc kề bù, hai góc đối đỉnh', weight: 1.2, prereq: ['GEO01'] },
        { code: 'GEO04', name: 'Tia phân giác của một góc', weight: 1.1, prereq: ['GEO03'] },
      ],
    },
    {
      code: 'TRI',
      name: 'Tam giác',
      description: 'Tổng ba góc, góc ngoài, bất đẳng thức tam giác, quan hệ góc – cạnh.',
      weight: 1.4,
      skills: [
        { code: 'TRI01', name: 'Tổng ba góc trong một tam giác', weight: 1.3, prereq: ['GEO03'] },
        { code: 'TRI02', name: 'Góc ngoài của tam giác', weight: 1.2, prereq: ['TRI01'] },
        { code: 'TRI03', name: 'Bất đẳng thức tam giác', weight: 1.2, prereq: ['GEO01'] },
        { code: 'TRI04', name: 'Quan hệ giữa góc và cạnh đối diện trong tam giác', weight: 1.2, prereq: ['TRI01', 'TRI03'] },
      ],
    },
    {
      code: 'AREA',
      name: 'Chu vi, diện tích, thể tích',
      description: 'Công thức chu vi – diện tích các hình phẳng và thể tích hình hộp chữ nhật.',
      weight: 1.5,
      skills: [
        { code: 'AREA01', name: 'Chu vi và diện tích hình chữ nhật, hình vuông', weight: 1.2, prereq: ['DEC01'] },
        { code: 'AREA02', name: 'Diện tích tam giác, hình thang, hình bình hành', weight: 1.3, prereq: ['AREA01'] },
        { code: 'AREA03', name: 'Thể tích và diện tích hình hộp chữ nhật', weight: 1.3, prereq: ['AREA01', 'POW01'] },
        { code: 'AREA04', name: 'Bài toán ghép hình — diện tích phần còn lại', weight: 1.4, prereq: ['AREA02'] },
      ],
    },
    {
      code: 'STAT',
      name: 'Thống kê và xác suất đơn giản',
      description: 'Đọc bảng số liệu, tần số, số trung bình cộng và xác suất của biến cố đơn giản.',
      weight: 1.0,
      skills: [
        { code: 'STAT01', name: 'Đọc bảng số liệu và tần số', weight: 0.9 },
        { code: 'STAT02', name: 'Số trung bình cộng', weight: 1.1, prereq: ['DEC01', 'FRA04'] },
        { code: 'STAT03', name: 'Xác suất của biến cố đơn giản', weight: 1.1, prereq: ['FRA01', 'STAT01'] },
      ],
    },
    {
      code: 'LOGIC',
      name: 'Suy luận logic',
      description: 'Suy luận từ dữ kiện, nguyên lý Dirichlet, bài toán chia phần.',
      weight: 1.3,
      skills: [
        { code: 'LOGIC01', name: 'Suy luận từ dữ kiện cho trước', weight: 1.2 },
        { code: 'LOGIC02', name: 'Nguyên lý Dirichlet (nguyên lý chuồng bồ câu)', weight: 1.3, prereq: ['LOGIC01'] },
        { code: 'LOGIC03', name: 'Bài toán cân đo và chia phần', weight: 1.2, prereq: ['LOGIC01'] },
      ],
    },
    {
      code: 'SEQ',
      name: 'Dãy số và quy luật',
      description: 'Tìm quy luật, số hạng tổng quát, đếm số hạng và tính tổng dãy cách đều.',
      weight: 1.6,
      skills: [
        { code: 'SEQ01', name: 'Tìm quy luật và số hạng tiếp theo của dãy', weight: 1.2 },
        { code: 'SEQ02', name: 'Số hạng thứ n của dãy số cách đều', weight: 1.4, prereq: ['SEQ01'] },
        { code: 'SEQ03', name: 'Tính tổng dãy số cách đều', weight: 1.5, prereq: ['SEQ02'] },
        { code: 'SEQ04', name: 'Đếm số số hạng của một dãy cách đều', weight: 1.3, prereq: ['SEQ02'] },
      ],
    },
  ],
};

// ---------------------------------------------------------------------------
// TAXONOMY TỐI GIẢN cho các cặp (môn, khối) còn lại
//
// Mục đích: hệ thống không bị trống dữ liệu ở bất kỳ course nào. Mỗi cặp có
// 4 chương × 2 kỹ năng. Mọi kỹ năng đều trỏ tới generator TÍNH ĐƯỢC (đáp án suy
// ra từ tham số) để không bao giờ có câu sai kiến thức.
// ---------------------------------------------------------------------------

/** Rút gọn khai báo skill tối giản. */
function s(
  code: string,
  name: string,
  gen: string,
  genParams?: Record<string, string | number>,
  weight = 1,
): SkillSeed {
  return { code, name, gen, genParams, weight };
}

const MATH_A: TaxonomySeed = {
  subject: 'MATH',
  gradeBand: 'A',
  prefix: 'M345',
  detailed: false,
  chapters: [
    {
      code: 'NUM',
      name: 'Số tự nhiên và bốn phép tính',
      weight: 1.4,
      skills: [
        s('NUM01', 'Cộng, trừ, nhân, chia số tự nhiên', 'gArith', { max: 500 }, 1.2),
        s('NUM02', 'Thứ tự thực hiện phép tính', 'SET04', { scale: 0.6 }, 1.1),
      ],
    },
    {
      code: 'FRAA',
      name: 'Phân số',
      weight: 1.3,
      skills: [
        s('FRAA01', 'So sánh phân số', 'FRA02', { scale: 0.6 }),
        s('FRAA02', 'Cộng, trừ phân số', 'FRA03', { scale: 0.6 }, 1.2),
      ],
    },
    {
      code: 'MEAS',
      name: 'Đại lượng và đo lường',
      weight: 1.1,
      skills: [
        s('MEAS01', 'Đổi đơn vị đo độ dài', 'gUnitConv', { family: 'len' }),
        s('MEAS02', 'Đổi đơn vị đo thời gian', 'gUnitConv', { family: 'time' }),
      ],
    },
    {
      code: 'GEOA',
      name: 'Hình học và đo hình',
      weight: 1.2,
      skills: [
        s('GEOA01', 'Chu vi và diện tích hình chữ nhật', 'AREA01', { scale: 0.6 }),
        s('GEOA02', 'Diện tích tam giác', 'AREA02', { scale: 0.6 }),
      ],
    },
  ],
};

const MATH_C: TaxonomySeed = {
  subject: 'MATH',
  gradeBand: 'C',
  prefix: 'M89',
  detailed: false,
  chapters: [
    {
      code: 'ALG',
      name: 'Đa thức và hằng đẳng thức',
      weight: 1.5,
      skills: [
        s('ALG01', 'Bình phương của một tổng, một hiệu', 'gPolyExpand', { mode: 'sq' }, 1.3),
        s('ALG02', 'Hiệu hai bình phương', 'gPolyExpand', { mode: 'diff' }, 1.2),
      ],
    },
    {
      code: 'SQRTC',
      name: 'Căn bậc hai',
      weight: 1.3,
      skills: [
        s('SQRTC01', 'Tính căn bậc hai của số chính phương', 'gSqrt', { mode: 'val' }),
        s('SQRTC02', 'Rút gọn căn thức bậc hai', 'gSqrt', { mode: 'simplify' }, 1.2),
      ],
    },
    {
      code: 'SYS',
      name: 'Phương trình và hệ phương trình',
      weight: 1.6,
      skills: [
        s('SYS01', 'Giải phương trình bậc nhất một ẩn', 'EQ02', { scale: 1.2 }, 1.3),
        s('SYS02', 'Giải hệ hai phương trình bậc nhất hai ẩn', 'gSystemEq', undefined, 1.4),
      ],
    },
    {
      code: 'GEOC',
      name: 'Định lý Pythagore',
      weight: 1.4,
      skills: [
        s('GEOC01', 'Tính cạnh huyền tam giác vuông', 'gPythagoras', { mode: 'hyp' }, 1.2),
        s('GEOC02', 'Tính cạnh góc vuông còn lại', 'gPythagoras', { mode: 'leg' }, 1.2),
      ],
    },
  ],
};

const MATH_D: TaxonomySeed = {
  subject: 'MATH',
  gradeBand: 'D',
  prefix: 'M1012',
  detailed: false,
  chapters: [
    {
      code: 'LOGD',
      name: 'Lũy thừa và logarit',
      weight: 1.5,
      skills: [
        s('LOGD01', 'Tính giá trị biểu thức logarit', 'gLog', { mode: 'val' }, 1.3),
        s('LOGD02', 'Giải phương trình logarit cơ bản', 'gLog', { mode: 'eq' }, 1.3),
      ],
    },
    {
      code: 'TRIGD',
      name: 'Lượng giác',
      weight: 1.4,
      skills: [
        s('TRIGD01', 'Giá trị lượng giác của góc đặc biệt', 'gTrig', { mode: 'special' }, 1.2),
        s('TRIGD02', 'Vận dụng hệ thức lượng giác cơ bản', 'gTrig', { mode: 'identity' }, 1.3),
      ],
    },
    {
      code: 'SEQD',
      name: 'Cấp số cộng và cấp số nhân',
      weight: 1.5,
      skills: [
        s('SEQD01', 'Số hạng và tổng của cấp số cộng', 'gArithSeq', undefined, 1.3),
        s('SEQD02', 'Số hạng và tổng của cấp số nhân', 'gGeoSeq', undefined, 1.3),
      ],
    },
    {
      code: 'DERD',
      name: 'Đạo hàm',
      weight: 1.6,
      skills: [
        s('DERD01', 'Đạo hàm của hàm đa thức', 'gDeriv', { mode: 'poly' }, 1.4),
        s('DERD02', 'Hệ số góc tiếp tuyến', 'gDeriv', { mode: 'tangent' }, 1.4),
      ],
    },
  ],
};

/** Khung 4 chương dùng chung cho môn Khoa học tự nhiên ở khối A, B, C. */
function scienceTaxonomy(
  gradeBand: GradeBand,
  prefix: string,
  variants: [SkillSeed, SkillSeed][],
): TaxonomySeed {
  const names = [
    ['MEA', 'Đo lường trong khoa học', 1.2],
    ['MOT', 'Chuyển động và tốc độ', 1.3],
    ['MAT', 'Chất và khối lượng riêng', 1.4],
    ['ENE', 'Năng lượng và nhiệt', 1.1],
  ] as const;
  return {
    subject: 'SCIENCE',
    gradeBand,
    prefix,
    detailed: false,
    chapters: names.map(([code, name, weight], i) => ({
      code,
      name,
      weight,
      skills: variants[i],
    })),
  };
}

const SCIENCE_A = scienceTaxonomy('A', 'K345', [
  [
    s('MEA01', 'Đổi đơn vị đo khối lượng', 'gUnitConv', { family: 'mass' }),
    s('MEA02', 'Đổi đơn vị đo thể tích', 'gUnitConv', { family: 'vol' }),
  ],
  [
    s('MOT01', 'Tính tốc độ khi biết quãng đường và thời gian', 'gSpeed', { mode: 'v' }, 1.2),
    s('MOT02', 'Tính thời gian chuyển động', 'gSpeed', { mode: 't' }),
  ],
  [
    s('MAT01', 'Tính khối lượng riêng của vật', 'gDensity', { mode: 'D' }, 1.2),
    s('MAT02', 'Tính giá trị trung bình của kết quả đo', 'gAverage', undefined, 1.1),
  ],
  [
    s('ENE01', 'Đổi nhiệt độ giữa thang Celsius và Fahrenheit', 'gTempConv'),
    s('ENE02', 'Đổi đơn vị đo thời gian trong thí nghiệm', 'gUnitConv', { family: 'time' }),
  ],
]);

const SCIENCE_B = scienceTaxonomy('B', 'K67', [
  [
    s('MEA01', 'Đổi đơn vị đo độ dài', 'gUnitConv', { family: 'len', lvl: 2 }),
    s('MEA02', 'Đổi đơn vị đo thể tích', 'gUnitConv', { family: 'vol', lvl: 2 }),
  ],
  [
    s('MOT01', 'Tính quãng đường từ tốc độ và thời gian', 'gSpeed', { mode: 's' }, 1.2),
    s('MOT02', 'Tính thời gian chuyển động', 'gSpeed', { mode: 't', lvl: 2 }, 1.1),
  ],
  [
    s('MAT01', 'Tính khối lượng vật từ khối lượng riêng', 'gDensity', { mode: 'm' }, 1.2),
    s('MAT02', 'Tính thể tích vật từ khối lượng riêng', 'gDensity', { mode: 'V' }, 1.2),
  ],
  [
    s('ENE01', 'Đổi nhiệt độ giữa các thang đo', 'gTempConv', { lvl: 2 }),
    s('ENE02', 'Tính công cơ học', 'gWorkPower', { mode: 'A' }, 1.2),
  ],
]);

const SCIENCE_C = scienceTaxonomy('C', 'K89', [
  [
    s('MEA01', 'Đổi đơn vị đo độ dài và diện tích', 'gUnitConv', { family: 'area' }),
    s('MEA02', 'Xử lý số liệu thí nghiệm bằng trung bình cộng', 'gAverage', { lvl: 2 }, 1.1),
  ],
  [
    s('MOT01', 'Tính tốc độ trung bình', 'gSpeed', { mode: 'v', lvl: 2 }, 1.2),
    s('MOT02', 'Chuyển động biến đổi đều', 'gKinematics', { mode: 'v' }, 1.3),
  ],
  [
    s('MAT01', 'Tính khối lượng riêng và nhận biết chất', 'gDensity', { mode: 'D', lvl: 2 }, 1.2),
    s('MAT02', 'Nồng độ phần trăm của dung dịch', 'gConcentration', { mode: 'C' }, 1.2),
  ],
  [
    s('ENE01', 'Tính công suất', 'gWorkPower', { mode: 'P' }, 1.2),
    s('ENE02', 'Định luật Ohm cho đoạn mạch', 'gOhm', { mode: 'U' }, 1.3),
  ],
]);

/** Khung 4 chương dùng chung cho môn Công nghệ thông tin ở cả 4 khối. */
function itTaxonomy(gradeBand: GradeBand, prefix: string, lvl: number): TaxonomySeed {
  return {
    subject: 'IT',
    gradeBand,
    prefix,
    detailed: false,
    chapters: [
      {
        code: 'NUMSYS',
        name: 'Hệ đếm và biểu diễn số',
        weight: 1.3,
        skills: [
          s('NUMSYS01', 'Đổi số nhị phân sang thập phân', 'gBinConv', { dir: 'b2d', lvl }, 1.2),
          s(
            'NUMSYS02',
            lvl >= 4 ? 'Đổi số thập phân sang thập lục phân' : 'Đổi số thập phân sang nhị phân',
            'gBinConv',
            { dir: lvl >= 4 ? 'd2h' : 'd2b', lvl },
            1.2,
          ),
        ],
      },
      {
        code: 'DATAU',
        name: 'Đơn vị lưu trữ dữ liệu',
        weight: 1.1,
        skills: [
          s('DATAU01', 'Đổi đơn vị byte – KB – MB', 'gUnitConv', { family: 'data', lvl: 1 }),
          s('DATAU02', 'Đổi đơn vị MB – GB – TB', 'gUnitConv', { family: 'data', lvl: 2 }),
        ],
      },
      {
        code: 'ALGO',
        name: 'Thuật toán và cấu trúc lặp',
        weight: 1.5,
        skills: [
          s('ALGO01', 'Đếm số lần lặp của vòng lặp', 'gLoopCount', { lvl }, 1.3),
          s('ALGO02', 'Đếm số phép so sánh của thuật toán', 'gAlgoSteps', { lvl }, 1.3),
        ],
      },
      {
        code: 'LOGICT',
        name: 'Phép toán logic',
        weight: 1.2,
        skills: [
          s('LOGICT01', 'Tính giá trị biểu thức logic AND, OR, NOT', 'gLogicEval', { lvl: 1 }),
          s('LOGICT02', 'Bảng chân trị và biểu thức logic phức hợp', 'gLogicEval', { lvl: 2 }, 1.2),
        ],
      },
    ],
  };
}

const PHYSICS_D: TaxonomySeed = {
  subject: 'PHYSICS',
  gradeBand: 'D',
  prefix: 'L1012',
  detailed: false,
  chapters: [
    {
      code: 'KIN',
      name: 'Động học chất điểm',
      weight: 1.5,
      skills: [
        s('KIN01', 'Tính vận tốc trong chuyển động biến đổi đều', 'gKinematics', { mode: 'v' }, 1.3),
        s('KIN02', 'Tính quãng đường trong chuyển động biến đổi đều', 'gKinematics', { mode: 's' }, 1.3),
      ],
    },
    {
      code: 'DYN',
      name: 'Động lực học',
      weight: 1.5,
      skills: [
        s('DYN01', 'Định luật II Newton — tính lực', 'gNewton', { mode: 'F' }, 1.3),
        s('DYN02', 'Định luật II Newton — tính gia tốc', 'gNewton', { mode: 'a' }, 1.3),
      ],
    },
    {
      code: 'ENED',
      name: 'Công và năng lượng',
      weight: 1.4,
      skills: [
        s('ENED01', 'Tính công của lực', 'gWorkPower', { mode: 'A' }, 1.2),
        s('ENED02', 'Tính công suất', 'gWorkPower', { mode: 'P' }, 1.2),
      ],
    },
    {
      code: 'ELEC',
      name: 'Điện học',
      weight: 1.4,
      skills: [
        s('ELEC01', 'Định luật Ohm', 'gOhm', { mode: 'U' }, 1.2),
        s('ELEC02', 'Công suất tiêu thụ điện', 'gOhm', { mode: 'P' }, 1.3),
      ],
    },
  ],
};

const CHEMISTRY_D: TaxonomySeed = {
  subject: 'CHEMISTRY',
  gradeBand: 'D',
  prefix: 'H1012',
  detailed: false,
  chapters: [
    {
      code: 'MOLE',
      name: 'Mol và khối lượng mol',
      weight: 1.5,
      skills: [
        s('MOLE01', 'Tính số mol từ khối lượng', 'gMole', { mode: 'n' }, 1.3),
        s('MOLE02', 'Tính khối lượng từ số mol', 'gMole', { mode: 'm' }, 1.3),
      ],
    },
    {
      code: 'COMP',
      name: 'Thành phần phần trăm hợp chất',
      weight: 1.3,
      skills: [
        s('COMP01', 'Tính phần trăm khối lượng nguyên tố', 'gMassPercent', undefined, 1.2),
        s('COMP02', 'Tính số phân tử từ số mol', 'gMole', { mode: 'N' }, 1.2),
      ],
    },
    {
      code: 'SOL',
      name: 'Dung dịch và nồng độ',
      weight: 1.4,
      skills: [
        s('SOL01', 'Tính nồng độ phần trăm dung dịch', 'gConcentration', { mode: 'C' }, 1.2),
        s('SOL02', 'Tính khối lượng chất tan', 'gConcentration', { mode: 'mct' }, 1.2),
      ],
    },
    {
      code: 'REAC',
      name: 'Tính theo phương trình hóa học',
      weight: 1.6,
      skills: [
        s('REAC01', 'Tính khối lượng sản phẩm theo phương trình', 'gStoich', { mode: 'mass' }, 1.4),
        s('REAC02', 'Tính thể tích khí ở điều kiện chuẩn', 'gStoich', { mode: 'vol' }, 1.4),
      ],
    },
  ],
};

const BIOLOGY_D: TaxonomySeed = {
  subject: 'BIOLOGY',
  gradeBand: 'D',
  prefix: 'S1012',
  detailed: false,
  chapters: [
    {
      code: 'DNA',
      name: 'Cấu trúc ADN',
      weight: 1.5,
      skills: [
        s('DNA01', 'Tính tổng số nuclêôtit của gen', 'gDnaCount', { mode: 'total' }, 1.3),
        s('DNA02', 'Tính số nuclêôtit từng loại', 'gDnaCount', { mode: 'base' }, 1.3),
      ],
    },
    {
      code: 'PROT',
      name: 'Mã di truyền và protein',
      weight: 1.4,
      skills: [
        s('PROT01', 'Tính số bộ ba mã hóa', 'gProtein', { mode: 'codon' }, 1.2),
        s('PROT02', 'Tính số axit amin của chuỗi polipeptit', 'gProtein', { mode: 'aa' }, 1.3),
      ],
    },
    {
      code: 'GEN',
      name: 'Quy luật phân li',
      weight: 1.5,
      skills: [
        s('GEN01', 'Tỉ lệ kiểu hình đời F2', 'gMendel', { mode: 'f2' }, 1.3),
        s('GEN02', 'Tính số cá thể theo tỉ lệ phân li', 'gMendel', { mode: 'count' }, 1.3),
      ],
    },
    {
      code: 'POP',
      name: 'Di truyền quần thể',
      weight: 1.3,
      skills: [
        s('POP01', 'Tính tần số alen', 'gHardyWeinberg', { mode: 'freq' }, 1.2),
        s('POP02', 'Tính tần số kiểu gen theo Hardy – Weinberg', 'gHardyWeinberg', { mode: 'geno' }, 1.3),
      ],
    },
  ],
};

// ---------------------------------------------------------------------------
// Danh sách taxonomy đầy đủ
// ---------------------------------------------------------------------------

export const TAXONOMIES: TaxonomySeed[] = [
  MATH_B, // chi tiết
  MATH_A,
  MATH_C,
  MATH_D,
  SCIENCE_A,
  SCIENCE_B,
  SCIENCE_C,
  itTaxonomy('A', 'T345', 1),
  itTaxonomy('B', 'T67', 2),
  itTaxonomy('C', 'T89', 3),
  itTaxonomy('D', 'T1012', 4),
  PHYSICS_D,
  CHEMISTRY_D,
  BIOLOGY_D,
];

/** Khóa tra cứu taxonomy theo (môn, khối). */
export function taxonomyKey(subject: Subject, gradeBand: GradeBand): string {
  return `${subject}:${gradeBand}`;
}

export function findTaxonomy(subject: Subject, gradeBand: GradeBand): TaxonomySeed | undefined {
  return TAXONOMIES.find((t) => t.subject === subject && t.gradeBand === gradeBand);
}

/** Mã skill đầy đủ (unique toàn cục trong bảng Skill). */
export function fullSkillCode(tax: TaxonomySeed, shortCode: string): string {
  return `${tax.prefix}-${shortCode}`;
}

/** Duyệt phẳng mọi skill của một taxonomy kèm chương cha. */
export function flatSkills(tax: TaxonomySeed): { chapter: ChapterSeed; skill: SkillSeed }[] {
  const out: { chapter: ChapterSeed; skill: SkillSeed }[] = [];
  for (const chapter of tax.chapters) {
    for (const skill of chapter.skills) out.push({ chapter, skill });
  }
  return out;
}

/**
 * Kiểm tra tính toàn vẹn taxonomy TRƯỚC KHI ghi DB:
 *  1. mã chương / mã skill không trùng,
 *  2. prerequisite trỏ tới skill có thật,
 *  3. đồ thị tiên quyết không có chu trình (DFS 3 màu).
 * Trả về danh sách lỗi — rỗng nghĩa là hợp lệ.
 */
export function validateTaxonomy(tax: TaxonomySeed): string[] {
  const errors: string[] = [];
  const chapterCodes = new Set<string>();
  const skillCodes = new Set<string>();
  const deps = new Map<string, string[]>();

  for (const chapter of tax.chapters) {
    if (chapterCodes.has(chapter.code)) errors.push(`Trùng mã chương: ${chapter.code}`);
    chapterCodes.add(chapter.code);
    for (const skill of chapter.skills) {
      if (skillCodes.has(skill.code)) errors.push(`Trùng mã kỹ năng: ${skill.code}`);
      skillCodes.add(skill.code);
      deps.set(skill.code, skill.prereq ?? []);
    }
  }

  for (const [code, list] of deps) {
    for (const p of list) {
      if (!skillCodes.has(p)) errors.push(`${code}: prerequisite không tồn tại → ${p}`);
    }
  }

  // DFS 3 màu: 0 = chưa xét, 1 = đang trong ngăn xếp, 2 = đã xong
  const color = new Map<string, number>();
  const stack: string[] = [];
  const visit = (code: string): boolean => {
    const c = color.get(code) ?? 0;
    if (c === 1) {
      errors.push(`Chu trình tiên quyết: ${[...stack, code].join(' → ')}`);
      return false;
    }
    if (c === 2) return true;
    color.set(code, 1);
    stack.push(code);
    for (const p of deps.get(code) ?? []) {
      if (!deps.has(p)) continue;
      if (!visit(p)) break;
    }
    stack.pop();
    color.set(code, 2);
    return true;
  };
  for (const code of deps.keys()) visit(code);

  return errors;
}
