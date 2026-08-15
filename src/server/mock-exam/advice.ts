/**
 * XẾP HỌC LỰC SAU BÀI THI THỬ + ĐỀ XUẤT KHÓA HỌC.
 *
 * Bài thi thử là cửa đầu tiên người lạ bước vào hệ thống: làm xong một đề, biết
 * mình đang ở đâu, và biết học tiếp cái gì. File này lo hai việc đó.
 *
 * BA NGUYÊN TẮC KHÔNG ĐƯỢC PHÁ:
 *
 * 1. KHÔNG XẾP HẠNG KHI CHƯA CHẤM XONG. Đề mẫu có 70/100 điểm nằm ở phần tự
 *    luận do AI chấm. Nếu AI chưa chấm (chưa gắn khóa, hoặc lỗi mạng) mà vẫn
 *    lấy điểm hiện có chia cho tổng điểm, một em làm đúng hết vẫn bị ghi "Kém".
 *    Nói với một đứa trẻ rằng nó kém trong khi bài của nó chưa ai chấm là thứ
 *    hỏng nặng nhất tính năng này có thể gây ra — nên chưa chấm xong thì nói
 *    thẳng là chưa xếp được, kèm số câu còn thiếu.
 *
 * 2. NGƯỠNG LẤY TỪ CẤU HÌNH, KHÔNG CHẾ RIÊNG. Dùng đúng `estimateLevel` và
 *    `config.levels` mà phần học tập đang dùng, để "Khá" ở trang thi thử và
 *    "Khá" trong khóa học là cùng một thước đo, và admin sửa ngưỡng ở
 *    /quan-tri/cau-hinh là cả hai chỗ đổi theo.
 *
 * 3. KHÔNG GHI ĐÈ HỒ SƠ NĂNG LỰC. Kết quả ở đây KHÔNG cập nhật
 *    `Enrollment.estimatedLevel` hay mastery. Hồ sơ đó được dựng từ bài kiểm
 *    tra đầu vào và cả quá trình luyện trong đúng khóa; một đề thi thử của kỳ
 *    thi khác, khối khác, thậm chí do khách vãng lai làm hộ, mà ghi đè vào thì
 *    engine lập kế hoạch sẽ chệch. Đây là ước lượng để tư vấn, không phải hồ sơ.
 */
import type { GradeBand, MockPart, StudentLevel, Subject } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import type { SessionUser } from '@/lib/auth';
import { getConfig } from '@/lib/config';
import type { LevelConfig } from '@/lib/config/defaults';
import { GRADE_BAND_LABEL, LEVEL_ORDER, STUDENT_LEVELS, SUBJECT_LABEL } from '@/lib/domain';
import { estimateLevel } from '@/engine/scoring';
import { routes } from '@/lib/routes';
import { getEffectivePricing } from '@/server/catalog/service';
import { PART_LABEL, type AttemptResult } from './service';

// ---------------------------------------------------------------------------
// Kiểu dữ liệu
// ---------------------------------------------------------------------------

export interface PartInsight {
  part: MockPart;
  label: string;
  awarded: number;
  total: number;
  /** 0–100 */
  percent: number;
}

export interface LevelVerdict {
  /** null = còn câu chưa chấm xong, chưa đủ căn cứ để xếp (nguyên tắc 1). */
  level: StudentLevel | null;
  levelLabel: string | null;
  /** % điểm trên tổng điểm của đề, làm tròn 1 chữ số. */
  percent: number;
  score: number;
  totalPoints: number;
  /** Tổng điểm tối đa của các câu CHƯA chấm xong. */
  ungradedPoints: number;
  ungradedCount: number;
  headline: string;
  detail: string;
  /** Mức kế tiếp và còn thiếu bao nhiêu điểm để chạm ngưỡng. */
  nextLevel: { level: StudentLevel; label: string; pointsNeeded: number } | null;
  /**
   * Cả bốn mức kèm ngưỡng, để giao diện vẽ được thang và học sinh thấy mình
   * đứng đâu trên thang đó. Nhãn lấy từ cấu hình chứ không viết cứng trong
   * giao diện — admin đổi tên mức là trang này đổi theo.
   */
  scale: { level: StudentLevel; label: string; threshold: number; current: boolean }[];
  parts: PartInsight[];
  strongest: PartInsight | null;
  weakest: PartInsight | null;
}

export interface CourseSuggestion {
  courseId: string;
  name: string;
  tagline: string | null;
  programCode: string;
  programName: string;
  logoEmoji: string;
  subjectLabel: string;
  gradeBandLabel: string;
  outcomes: string[];
  reason: string;
  /** Đã ghi danh rồi thì dẫn thẳng vào chỗ học, không mời mua lại. */
  enrolled: boolean;
  href: string;
  ctaLabel: string;
  priceLabel: string | null;
}

export interface ResultAdvice {
  verdict: LevelVerdict;
  courses: CourseSuggestion[];
  /** Lời dẫn cho khối đề xuất, đổi theo mức năng lực. */
  coursesIntro: string;
}

// ---------------------------------------------------------------------------
// Xếp học lực — thuần, không chạm database
// ---------------------------------------------------------------------------

const PART_ORDER: MockPart[] = ['MCQ', 'SHORT', 'ESSAY'];

/** Chênh lệch tối thiểu giữa phần cao nhất và thấp nhất mới đáng gọi là lệch. */
const PART_SPREAD_THRESHOLD = 10;

function round(value: number, digits = 1): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

export interface JudgeInput {
  score: number;
  totalPoints: number;
  answers: { part: MockPart; maxPoints: number; awarded: number | null; graded: boolean }[];
}

/**
 * Quy kết quả một bài thi thử thành mức năng lực + chỗ mạnh chỗ yếu.
 *
 * Tách hẳn khỏi database để test được mọi tình huống biên: chưa chấm xong, đề
 * 0 điểm, chỉ có một phần, điểm vượt trần.
 */
export function judgeLevel(input: JudgeInput, levelConfig: LevelConfig): LevelVerdict {
  const totalPoints = Math.max(0, input.totalPoints);
  const score = Math.max(0, Math.min(input.score, totalPoints || input.score));
  const percent = totalPoints > 0 ? round((score / totalPoints) * 100) : 0;

  const ungraded = input.answers.filter((answer) => !answer.graded);
  const ungradedPoints = round(
    ungraded.reduce((sum, answer) => sum + answer.maxPoints, 0),
    2,
  );

  const parts = buildParts(input.answers);
  const ranked = [...parts].sort((a, b) => b.percent - a.percent);
  const best = ranked[0] ?? null;
  const worst = ranked.length > 1 ? (ranked[ranked.length - 1] ?? null) : null;
  const spread = best && worst ? best.percent - worst.percent : 0;
  const strongest = spread >= PART_SPREAD_THRESHOLD ? best : null;
  const weakest = spread >= PART_SPREAD_THRESHOLD ? worst : null;

  // Nguyên tắc 1: còn câu chưa chấm thì không xếp, và nói rõ còn thiếu gì.
  if (ungraded.length > 0) {
    return {
      level: null,
      levelLabel: null,
      percent,
      score,
      totalPoints,
      ungradedPoints,
      ungradedCount: ungraded.length,
      headline: 'Chưa xếp được học lực',
      detail:
        `Còn ${ungraded.length} câu (${ungradedPoints} điểm) chưa chấm xong, nên ${score}/${totalPoints} ` +
        'chưa phải điểm cuối cùng. Chấm nốt những câu đó rồi mở lại trang này để xem học lực.',
      nextLevel: null,
      scale: buildScale(null, levelConfig),
      parts,
      // Chưa chấm hết thì các phần KHÔNG so được với nhau: phần tự luận đang là
      // 0 điểm vì AI chưa chấm, không phải vì em làm sai.
      strongest: null,
      weakest: null,
    };
  }

  const level = estimateLevel(percent, levelConfig);
  const levelLabel = levelConfig.labels?.[level] ?? level;

  return {
    level,
    levelLabel,
    percent,
    score,
    totalPoints,
    ungradedPoints: 0,
    ungradedCount: 0,
    headline: `Học lực ước lượng: ${levelLabel}`,
    detail: detailFor(level, percent, weakest),
    nextLevel: nextLevelOf(level, percent, score, totalPoints, levelConfig),
    scale: buildScale(level, levelConfig),
    parts,
    strongest,
    weakest,
  };
}

function buildScale(
  current: StudentLevel | null,
  levelConfig: LevelConfig,
): LevelVerdict['scale'] {
  return [...STUDENT_LEVELS]
    .sort((a, b) => LEVEL_ORDER[a] - LEVEL_ORDER[b])
    .map((level) => ({
      level,
      label: levelConfig.labels?.[level] ?? level,
      threshold: levelConfig.scoreThresholds?.[level] ?? 0,
      current: level === current,
    }));
}

function buildParts(input: JudgeInput['answers']): PartInsight[] {
  const buckets = new Map<MockPart, { awarded: number; total: number }>();
  for (const answer of input) {
    const bucket = buckets.get(answer.part) ?? { awarded: 0, total: 0 };
    bucket.awarded += answer.awarded ?? 0;
    bucket.total += answer.maxPoints;
    buckets.set(answer.part, bucket);
  }

  return [...buckets.entries()]
    .filter(([, bucket]) => bucket.total > 0)
    .map(([part, bucket]) => ({
      part,
      label: PART_LABEL[part],
      awarded: round(bucket.awarded, 2),
      total: round(bucket.total, 2),
      percent: round((bucket.awarded / bucket.total) * 100),
    }))
    .sort((a, b) => PART_ORDER.indexOf(a.part) - PART_ORDER.indexOf(b.part));
}

/**
 * Lời nhận xét theo mức.
 *
 * Nói với học sinh, không nói với người quản trị: mỗi mức là một việc cần làm
 * tiếp theo chứ không phải một cái nhãn dán lên người.
 */
function detailFor(level: StudentLevel, percent: number, weakest: PartInsight | null): string {
  const base: Record<StudentLevel, string> = {
    WEAK:
      `Em lấy được ${percent}% số điểm của đề. Phần lớn dạng bài trong đề còn chưa quen — ` +
      'cần chắc lại nền tảng trước, luyện đề sau, nếu không sẽ mất thời gian mà điểm không lên.',
    AVERAGE:
      `Em lấy được ${percent}% số điểm của đề. Nền đã có nhưng còn hổng từng mảng; ` +
      'học theo lộ trình vá đúng chỗ hổng sẽ lên nhanh hơn là làm thêm thật nhiều đề.',
    GOOD:
      `Em lấy được ${percent}% số điểm của đề. Nền khá vững, điểm rơi chủ yếu ở câu khó ` +
      'và ở cách trình bày lời giải — hai thứ luyện được.',
    EXCELLENT:
      `Em lấy được ${percent}% số điểm của đề — mức đã thi đấu được. ` +
      'Việc còn lại là giữ nhịp và bịt nốt vài lỗ nhỏ để không mất điểm đáng tiếc.',
  };

  const suffix = weakest
    ? ` Mất điểm nhiều nhất ở phần ${weakest.label.toLowerCase()} (${weakest.awarded}/${weakest.total}).`
    : '';
  return base[level] + suffix;
}

/** Mức ngay trên mức hiện tại, kèm số điểm còn thiếu để chạm ngưỡng. */
function nextLevelOf(
  current: StudentLevel,
  percent: number,
  score: number,
  totalPoints: number,
  levelConfig: LevelConfig,
): LevelVerdict['nextLevel'] {
  const above = [...STUDENT_LEVELS]
    .filter((level) => LEVEL_ORDER[level] > LEVEL_ORDER[current])
    .sort((a, b) => LEVEL_ORDER[a] - LEVEL_ORDER[b]);

  for (const level of above) {
    const threshold = levelConfig.scoreThresholds?.[level];
    if (typeof threshold !== 'number' || threshold <= percent) continue;
    const pointsNeeded = totalPoints > 0 ? Math.ceil((threshold / 100) * totalPoints - score) : 0;
    return {
      level,
      label: levelConfig.labels?.[level] ?? level,
      pointsNeeded: Math.max(1, pointsNeeded),
    };
  }
  return null;
}

// ---------------------------------------------------------------------------
// Đọc metadata của đề — thuần
// ---------------------------------------------------------------------------

/**
 * `MockExam.subject` là chữ tự do trong file đề ("math", "Toán", "MATH"…) chứ
 * không phải enum, nên phải dịch một cách chịu đựng được. Không đoán bừa: không
 * khớp thì trả null và phần đề xuất tự nới điều kiện ra.
 */
export function subjectFromExamMeta(raw: string | null | undefined): Subject | null {
  const text = (raw ?? '').trim().toLowerCase();
  if (text === '') return null;

  const table: [Subject, string[]][] = [
    ['MATH', ['math', 'maths', 'mathematics', 'toan']],
    ['PHYSICS', ['physic', 'physics', 'vat ly', 'vatly', 'ly']],
    ['CHEMISTRY', ['chem', 'chemistry', 'hoa']],
    ['BIOLOGY', ['bio', 'biology', 'sinh']],
    ['IT', ['it', 'informatic', 'informatics', 'computer', 'tin']],
    ['SCIENCE', ['science', 'khoa hoc', 'khtn']],
  ];

  const plain = removeDiacritics(text);
  for (const [subject, keys] of table) {
    if (keys.some((key) => plain === key || plain.includes(key))) return subject;
  }
  return null;
}

/**
 * `MockExam.gradeLevel` cũng là chữ tự do: "primary", "lớp 12", "grade 6"…
 * Có số lớp thì quy theo bảng khối chuẩn; chỉ có chữ thì nhận vài từ khóa rõ
 * nghĩa. "secondary"/"thcs" trải trên hai khối (6–7 và 8–9) nên KHÔNG đoán —
 * trả null để đề xuất không tự bó vào một khối sai.
 */
export function gradeBandFromExamMeta(raw: string | null | undefined): GradeBand | null {
  const text = removeDiacritics((raw ?? '').trim().toLowerCase());
  if (text === '') return null;

  const number = text.match(/\d{1,2}/);
  if (number) {
    const grade = Number(number[0]);
    if (grade >= 1 && grade <= 12) {
      if (grade <= 5) return 'A';
      if (grade <= 7) return 'B';
      if (grade <= 9) return 'C';
      return 'D';
    }
  }

  if (/(primary|elementary|tieu hoc)/.test(text)) return 'A';
  if (/(high school|thpt|upper secondary)/.test(text)) return 'D';
  return null;
}

function removeDiacritics(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/đ/g, 'd');
}

// ---------------------------------------------------------------------------
// Chọn khóa học — thuần
// ---------------------------------------------------------------------------

export interface CourseCandidate {
  id: string;
  name: string;
  tagline: string | null;
  outcomes: string[];
  subject: Subject;
  gradeBand: GradeBand;
  programId: string;
  programCode: string;
  programName: string;
  programOrder: number;
  logoEmoji: string;
  enrolled: boolean;
}

export interface MatchTarget {
  programId: string | null;
  subject: Subject | null;
  gradeBand: GradeBand | null;
}

const MAX_SUGGESTIONS = 3;

const BAND_ORDER: Record<GradeBand, number> = { A: 0, B: 1, C: 2, D: 3 };

/**
 * Xếp hạng khóa theo độ khớp với đề vừa làm: cùng kỳ thi > cùng khối > cùng môn.
 *
 * KHỐI ĐỨNG TRÊN MÔN là có lý do. Khối là ràng buộc cứng theo tuổi — một em
 * tiểu học không học nổi khóa khối 10–12 dù có cùng môn Toán. Môn thì chỉ là
 * sở thích: em vừa thi Toán tiểu học hoàn toàn có thể học tiếp Khoa học cùng
 * khối. Xếp môn lên trên khối sẽ đẩy "Toán khối 10–12" lên trước "Khoa học
 * khối 3–4–5", tức là đề xuất một khóa em không thể học.
 *
 * Cộng điểm thay vì lọc cứng cũng là có chủ ý — lọc cứng theo cả ba điều kiện
 * mà catalog chưa có khóa đúng khối thì trang kết quả trống trơn, đúng lúc
 * người học đang muốn học tiếp. Nới dần bằng điểm số thì luôn còn thứ để đề
 * xuất, và lý do hiện ngay bên cạnh nên không ai bị đánh lừa là "khóa dành
 * riêng cho em".
 */
export function rankCourses(candidates: CourseCandidate[], target: MatchTarget): CourseCandidate[] {
  const scored = candidates.map((course) => {
    let score = 0;
    if (target.programId && course.programId === target.programId) score += 100;
    if (target.gradeBand && course.gradeBand === target.gradeBand) score += 50;
    if (target.subject && course.subject === target.subject) score += 25;
    // Lệch khối thì lệch càng ít càng tốt: khối 6–7 gần với tiểu học hơn khối 10–12.
    if (target.gradeBand) {
      score -= Math.abs(BAND_ORDER[course.gradeBand] - BAND_ORDER[target.gradeBand]);
    }
    // Khóa đang học được ưu tiên: đó là chỗ học tiếp, không phải chỗ mời mua.
    if (course.enrolled) score += 10;
    return { course, score };
  });

  return scored
    .sort(
      (a, b) =>
        b.score - a.score ||
        a.course.programOrder - b.course.programOrder ||
        a.course.name.localeCompare(b.course.name, 'vi'),
    )
    .slice(0, MAX_SUGGESTIONS)
    .map((entry) => entry.course);
}

/** Vì sao khóa này lọt vào danh sách — nói đúng mức độ khớp, không tô hồng. */
export function reasonFor(course: CourseCandidate, target: MatchTarget): string {
  const sameProgram = target.programId !== null && course.programId === target.programId;
  const sameSubject = target.subject !== null && course.subject === target.subject;
  const sameBand = target.gradeBand !== null && course.gradeBand === target.gradeBand;

  if (sameProgram && sameSubject && sameBand) {
    return 'Đúng kỳ thi, đúng môn và đúng khối của đề em vừa làm.';
  }
  if (sameProgram && sameBand) {
    return `Cùng kỳ thi và cùng khối, môn ${SUBJECT_LABEL[course.subject].toLowerCase()}.`;
  }
  if (sameProgram && sameSubject) {
    return `Cùng kỳ thi và cùng môn với đề vừa làm, nhưng dành cho ${GRADE_BAND_LABEL[course.gradeBand].toLowerCase()}.`;
  }
  if (sameProgram) {
    return `Cùng kỳ thi ${course.programCode}, môn ${SUBJECT_LABEL[course.subject].toLowerCase()}.`;
  }
  if (sameSubject && sameBand) {
    return `Cùng môn và cùng khối, thuộc kỳ thi ${course.programCode}.`;
  }
  if (sameSubject) {
    return `Cùng môn ${SUBJECT_LABEL[course.subject].toLowerCase()}, thuộc kỳ thi ${course.programCode}.`;
  }
  return `Khóa đang mở của ${course.programName}.`;
}

/** Lời dẫn cho khối đề xuất — đổi theo mức, và trung thực khi chưa xếp được. */
export function introFor(level: StudentLevel | null): string {
  if (level === null) {
    return 'Chấm xong cả bài rồi hệ thống mới xếp học lực được. Trong lúc chờ, đây là các khóa bám sát đề em vừa làm.';
  }
  const table: Record<StudentLevel, string> = {
    WEAK: 'Nên bắt đầu bằng một khóa có lộ trình từ nền tảng. Vào học, làm bài kiểm tra đầu vào, hệ thống sẽ xếp lộ trình theo đúng chỗ em đang hổng.',
    AVERAGE:
      'Học theo lộ trình sẽ hiệu quả hơn tự luyện đề. Bài kiểm tra đầu vào của khóa sẽ chỉ ra chính xác chỗ cần vá.',
    GOOD: 'Em đủ nền để đi thẳng vào phần nâng cao. Khóa dưới đây có bài kiểm tra đầu vào để bỏ qua phần đã vững.',
    EXCELLENT:
      'Ở mức này, cái cần là đề khó và người chữa bài. Khóa dưới đây kèm buổi tư vấn với giáo viên theo tiến độ.',
  };
  return table[level];
}

// ---------------------------------------------------------------------------
// Ghép lại — có chạm database
// ---------------------------------------------------------------------------

/**
 * Tìm kỳ thi của đề qua chính chữ trong slug/tiêu đề.
 *
 * `MockExam` không có khóa ngoại sang `Program` (đề nạp từ file JSON, không
 * buộc phải thuộc kỳ thi nào). Nhưng slug đề luôn mở đầu bằng mã kỳ thi
 * ("asmopss-12-math-primary"), nên so mã kỳ thi trong bảng với chữ trong slug
 * là đủ, mà vẫn giữ được luật "thêm kỳ thi mới = thêm bản ghi, không sửa code".
 */
function matchProgramId(
  programs: { id: string; code: string; shortName: string | null }[],
  slug: string,
  title: string,
): string | null {
  const haystack = removeDiacritics(`${slug} ${title}`.toLowerCase());
  let best: { id: string; length: number } | null = null;

  for (const program of programs) {
    for (const raw of [program.code, program.shortName]) {
      const needle = removeDiacritics((raw ?? '').trim().toLowerCase());
      if (needle.length < 2 || !haystack.includes(needle)) continue;
      // Mã dài hơn thắng: tránh mã ngắn ăn theo (ví dụ "pas" nằm trong "pascal").
      if (!best || needle.length > best.length) best = { id: program.id, length: needle.length };
    }
  }
  return best?.id ?? null;
}

export async function getResultAdvice(
  result: AttemptResult,
  viewer: SessionUser | null,
): Promise<ResultAdvice> {
  const config = await getConfig();

  const verdict = judgeLevel(
    {
      score: result.score,
      totalPoints: result.totalPoints,
      answers: result.answers.map((answer) => ({
        part: answer.part,
        maxPoints: answer.maxPoints,
        awarded: answer.awarded,
        graded: answer.status === 'GRADED',
      })),
    },
    config.levels,
  );

  const [exam, programs, courses, enrolledCourseIds] = await Promise.all([
    prisma.mockExam.findUnique({
      where: { slug: result.examSlug },
      select: { subject: true, gradeLevel: true },
    }),
    prisma.program.findMany({
      where: { active: true },
      select: { id: true, code: true, shortName: true, name: true, order: true, logoEmoji: true },
    }),
    prisma.course.findMany({
      where: { active: true, program: { active: true } },
      select: {
        id: true,
        name: true,
        tagline: true,
        outcomes: true,
        subject: true,
        gradeBand: true,
        programId: true,
      },
    }),
    listEnrolledCourseIds(viewer),
  ]);

  const programById = new Map(programs.map((program) => [program.id, program]));

  const target: MatchTarget = {
    programId: matchProgramId(programs, result.examSlug, result.examTitle),
    subject: subjectFromExamMeta(exam?.subject),
    gradeBand: gradeBandFromExamMeta(exam?.gradeLevel),
  };

  const candidates: CourseCandidate[] = courses.flatMap((course) => {
    const program = programById.get(course.programId);
    if (!program) return [];
    return [
      {
        id: course.id,
        name: course.name,
        tagline: course.tagline,
        outcomes: Array.isArray(course.outcomes) ? course.outcomes.map(String).slice(0, 3) : [],
        subject: course.subject,
        gradeBand: course.gradeBand,
        programId: course.programId,
        programCode: program.code,
        programName: program.name,
        programOrder: program.order,
        logoEmoji: program.logoEmoji,
        enrolled: enrolledCourseIds.has(course.id),
      },
    ];
  });

  const picked = rankCourses(candidates, target);

  const suggestions = await Promise.all(
    picked.map(async (course): Promise<CourseSuggestion> => {
      const pricing = course.enrolled ? null : await safePricingLabel(course.id);
      return {
        courseId: course.id,
        name: course.name,
        tagline: course.tagline,
        programCode: course.programCode,
        programName: course.programName,
        logoEmoji: course.logoEmoji,
        subjectLabel: SUBJECT_LABEL[course.subject],
        gradeBandLabel: GRADE_BAND_LABEL[course.gradeBand],
        outcomes: course.outcomes,
        reason: reasonFor(course, target),
        enrolled: course.enrolled,
        href: course.enrolled ? routes.myCourses() : routes.course(course.id),
        ctaLabel: course.enrolled ? 'Vào học tiếp' : 'Xem khóa học',
        priceLabel: pricing,
      };
    }),
  );

  return { verdict, courses: suggestions, coursesIntro: introFor(verdict.level) };
}

/** Khách vãng lai thì không có gì để tra; lỗi hồ sơ cũng không được làm hỏng trang kết quả. */
async function listEnrolledCourseIds(viewer: SessionUser | null): Promise<Set<string>> {
  if (!viewer) return new Set();
  const profile = await prisma.studentProfile.findUnique({
    where: { userId: viewer.id },
    select: { id: true },
  });
  if (!profile) return new Set();

  const enrollments = await prisma.enrollment.findMany({
    where: { studentId: profile.id, status: 'ACTIVE' },
    select: { courseId: true },
  });
  return new Set(enrollments.map((enrollment) => enrollment.courseId));
}

/**
 * Giá chỉ là thông tin phụ trên trang kết quả — thiếu bảng giá thì bỏ trống chứ
 * không được làm đổ cả trang điểm của học sinh.
 */
async function safePricingLabel(courseId: string): Promise<string | null> {
  try {
    const pricing = await getEffectivePricing(courseId);
    return pricing.priceLabel;
  } catch {
    return null;
  }
}
