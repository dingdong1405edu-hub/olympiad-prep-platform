/**
 * FALLBACK KHÔNG-AI (specs §8.3 bước 6, §18 dòng "AI hallucination").
 *
 * ============================ ĐỌC TRƯỚC KHI SỬA ============================
 * Đây KHÔNG phải đường dự phòng hạng hai: khi `ANTHROPIC_API_KEY` rỗng — trạng
 * thái mặc định của dev/staging — toàn bộ nhận xét, báo cáo và giải thích của
 * nền tảng đi qua file này. Chất lượng câu chữ ở đây chính là chất lượng sản
 * phẩm mà học sinh đọc được.
 * ===========================================================================
 *
 * Ràng buộc:
 *  - KHÔNG gọi mạng, KHÔNG đọc DB: mọi câu chữ suy ra từ dữ liệu có cấu trúc đã
 *    được service dựng sẵn (cùng bộ input với prompt LLM, xem `prompts.ts`).
 *  - KHÔNG bịa số liệu mới: chỉ diễn đạt lại con số được truyền vào.
 *  - KHÔNG chẩn đoán tâm lý, không kết luận về tính cách học sinh (specs §8.2).
 *  - Dữ liệu vào đã ẩn danh — file này không bao giờ thấy tên/email/trường.
 */
import type { Difficulty } from '@prisma/client';
// Lấy thẳng từ file mặc định (không qua `@/lib/config/index`) để module này giữ
// nguyên tính thuần túy: không kéo theo Prisma, chạy được trong test/script.
import { DEFAULT_CONFIG } from '@/lib/config/defaults';
import { DIFFICULTY_ORDER } from '@/lib/domain';
import type {
  DiagnosticCommentContent,
  DiagnosticCommentInput,
  ItemMetadataContent,
  ItemMetadataInput,
  PriorityInput,
  ProgressReportContent,
  ProgressReportInput,
  SkillDeltaInput,
  SkillOutcome,
  SolutionExplanationContent,
  SolutionExplanationInput,
  TeacherBriefContent,
  TeacherBriefInput,
} from './prompts';

// ---------------------------------------------------------------------------
// Ngưỡng diễn đạt — LẤY TỪ CẤU HÌNH, không tự đặt số nghiệp vụ mới
// ---------------------------------------------------------------------------

export interface FallbackTuning {
  /** Tỷ lệ thời gian còn coi là "làm gọn" — `recommendation.difficultyUp.maxTimeRatio`. */
  fastTimeRatio: number;
  /** Từ tỷ lệ này trở lên là "mò cách làm" — `recommendation.difficultyDown.minTimeRatio`. */
  slowTimeRatio: number;
  /** Mastery >= ngưỡng này coi là đã vững — `recommendation.masteredThreshold`. */
  masteredThreshold: number;
  /** Mastery/độ chính xác < ngưỡng này coi là hổng — `recommendation.gapThreshold`. */
  gapThreshold: number;
}

/** Mặc định xuất xưởng; service luôn truyền bản đã áp override của admin. */
export const DEFAULT_FALLBACK_TUNING: FallbackTuning = {
  fastTimeRatio: DEFAULT_CONFIG.recommendation.difficultyUp.maxTimeRatio,
  slowTimeRatio: DEFAULT_CONFIG.recommendation.difficultyDown.minTimeRatio,
  masteredThreshold: DEFAULT_CONFIG.recommendation.masteredThreshold,
  gapThreshold: DEFAULT_CONFIG.recommendation.gapThreshold,
};

// ---------------------------------------------------------------------------
// Hằng số TRÌNH BÀY (kỹ thuật, không phải tham số nghiệp vụ)
// ---------------------------------------------------------------------------

/** Số ý tối đa mỗi khối — khớp giới hạn đã ghi trong prompt để hai đường ra giống nhau. */
const MAX_STRENGTHS = 3;
const MAX_WEAKNESSES = 4;
/** specs §8.1: danh sách ưu tiên 3–5 mục. */
const MAX_PRIORITIES = 5;
const MAX_LIST = 4;
const MAX_ACTIONS = 3;
/** Số dòng tối đa của phần giảng chi tiết (prompt cũng giới hạn 12 dòng). */
const MAX_DETAIL_LINES = 12;
/** Số câu tối đa của phần giảng ngắn (prompt giới hạn 4 câu, gồm cả câu chốt đáp án). */
const MAX_SHORT_SENTENCES = 2;

/** Độ dài token tối thiểu khi dò từ khóa — dưới mức này thường là hư từ. */
const MIN_TOKEN_LENGTH = 3;
/** Số mã kỹ năng gợi ý tối đa cho một câu hỏi mới. */
const MAX_SUGGESTED_SKILLS = 2;
const MAX_SUGGESTED_TAGS = 5;
/**
 * Trần độ tin cậy khi KHÔNG có LLM: gợi ý chỉ dựa trên trùng từ khóa nên không
 * bao giờ được tỏ ra chắc chắn — biên soạn viên vẫn phải đọc lại (specs §8.1).
 */
const MAX_FALLBACK_CONFIDENCE = 0.6;
/** Điểm "độ phức tạp" để đoán độ khó: <4 dễ, <8 khá, còn lại giỏi. Heuristic thuần kỹ thuật. */
const COMPLEXITY_MEDIUM = 4;
const COMPLEXITY_HIGH = 8;

/** Hư từ tiếng Việt (đã bỏ dấu) — loại khỏi phép dò từ khóa. */
const STOP_WORDS = new Set([
  'cua', 'cac', 'cho', 'khi', 'mot', 'nao', 'trong', 'duoc', 'theo', 'voi', 'tren', 'duoi',
  'hay', 'sau', 'truoc', 'nhung', 'hoac', 'nen', 'den', 'vao', 'nay', 'day', 'bao', 'nhieu',
  'moi', 'con', 'lai', 'ban', 'dau', 'cung', 'rang', 'thi', 'la',
]);

// ---------------------------------------------------------------------------
// Tiện ích câu chữ
// ---------------------------------------------------------------------------

/** Số theo cách viết Việt Nam: dấu phẩy thập phân, bỏ phần ",0" thừa. */
function num(value: number, digits = 1): string {
  if (!Number.isFinite(value)) return '0';
  const factor = 10 ** digits;
  const rounded = Math.round(value * factor) / factor;
  // String() đã bỏ số 0 thừa ở cuối: 1.80 → "1.8", 0.86 → "0.86".
  return String(rounded).replace('.', ',');
}

function signedNum(value: number, digits = 1): string {
  return `${value >= 0 ? '+' : '-'}${num(Math.abs(value), digits)}`;
}

function joinVN(parts: string[]): string {
  const cleaned = parts.filter((part) => part.trim() !== '');
  if (cleaned.length === 0) return '';
  if (cleaned.length === 1) return cleaned[0];
  return `${cleaned.slice(0, -1).join(', ')} và ${cleaned[cleaned.length - 1]}`;
}

function sentences(parts: string[]): string {
  return parts.map((part) => part.trim()).filter((part) => part !== '').join(' ');
}

/** "Tỉ lệ (chương Đại số cơ bản)" — bỏ phần chương khi trùng tên kỹ năng. */
function skillLabel(skillName: string, chapterName: string): string {
  const chapter = chapterName.trim();
  if (chapter === '' || chapter === skillName.trim()) return skillName;
  return `${skillName} (chương ${chapter})`;
}

/** Mô tả tốc độ làm bài theo tỷ lệ thời gian thực tế / chuẩn. */
function speedPhrase(timeRatio: number | null, tuning: FallbackTuning): string {
  if (timeRatio === null || !Number.isFinite(timeRatio) || timeRatio <= 0) return '';
  if (timeRatio < 1) return `làm nhanh hơn mức chuẩn (${num(timeRatio, 2)} lần)`;
  if (timeRatio <= tuning.fastTimeRatio) return 'thời gian làm sát mức chuẩn';
  return `thời gian làm gấp ${num(timeRatio, 2)} lần mức chuẩn`;
}

/**
 * Nhận định về CÁCH LÀM BÀI (không phải về con người): chậm + sai nhiều là dấu
 * hiệu chưa có cách làm; nhanh + sai nhiều là dấu hiệu làm vội.
 */
function workStylePhrase(outcome: SkillOutcome, tuning: FallbackTuning): string {
  const weakAccuracy = outcome.accuracyPercent < tuning.gapThreshold;
  if (!weakAccuracy || outcome.timeRatio === null) return '';
  if (outcome.timeRatio >= tuning.slowTimeRatio) return 'cho thấy em còn phải mò cách làm';
  if (outcome.timeRatio <= tuning.fastTimeRatio) return 'cho thấy em làm khá vội, chưa đọc kỹ đề';
  return '';
}

function errorPhrase(labels: string[]): string {
  const cleaned = [...new Set(labels.map((label) => label.trim()).filter((label) => label !== ''))];
  if (cleaned.length === 0) return '';
  return `lỗi hay gặp: ${cleaned.join(', ')}`;
}

/** Ghép các mệnh đề thành một câu hoàn chỉnh, tự thêm dấu chấm. */
function clause(head: string, tails: string[]): string {
  const body = tails.map((tail) => tail.trim()).filter((tail) => tail !== '');
  const text = body.length > 0 ? `${head} — ${body.join(', ')}` : head;
  return text.endsWith('.') ? text : `${text}.`;
}

function skillOutcomeLine(prefix: string, outcome: SkillOutcome, tuning: FallbackTuning): string {
  return clause(`${prefix}${skillLabel(outcome.skillName, outcome.chapterName)}`, [
    `đúng ${outcome.correct}/${outcome.total}`,
    speedPhrase(outcome.timeRatio, tuning),
    errorPhrase(outcome.errorLabels),
    workStylePhrase(outcome, tuning),
  ]);
}

function priorityWhy(priority: PriorityInput): string {
  const reason = priority.engineReason.trim();
  // Kỹ năng chưa từng luyện thì điểm 0 KHÔNG có nghĩa là làm sai — để nguyên câu
  // giải thích của engine, không tự gắn nhãn "Hổng" cho học sinh.
  const unmeasured = /chưa có dữ liệu/i.test(reason);
  const parts: string[] = [];
  if (!unmeasured) {
    // Lý do của engine thường đã có sẵn con số mastery — không nhắc lại hai lần.
    parts.push(
      /mastery/i.test(reason)
        ? `Kỹ năng đang ở mức ${priority.tierLabel}.`
        : `Kỹ năng đang ở mức ${priority.tierLabel} (${num(priority.masteryScore)}/100).`,
    );
  }
  if (reason !== '') parts.push(ensureDot(reason));
  if (priority.blockedBySkillNames.length > 0) {
    parts.push(`Cần vững ${joinVN(priority.blockedBySkillNames)} trước thì học phần này mới nhẹ.`);
  }
  return sentences(parts);
}

// ---------------------------------------------------------------------------
// 1. Nhận xét sau bài kiểm tra đầu vào
// ---------------------------------------------------------------------------

export function buildDiagnosticCommentFallback(
  input: DiagnosticCommentInput,
  tuning: FallbackTuning = DEFAULT_FALLBACK_TUNING,
): DiagnosticCommentContent {
  const overallSpeed = speedPhrase(input.avgTimeRatio, tuning);

  const summary = sentences([
    `Em làm đúng ${input.correctCount}/${input.itemCount} câu, quy ra ${num(input.percent)}% điểm đã tính trọng số độ khó.`,
    input.totalMinutes > 0
      ? `Cả bài mất ${input.totalMinutes} phút${overallSpeed !== '' ? `, ${overallSpeed}` : ''}.`
      : '',
    `Mức năng lực ước lượng hiện tại của em là ${input.estimatedLevelLabel}.`,
    `Đây mới là ước lượng ban đầu từ bài ${input.assessmentTypeLabel.toLowerCase()}; hệ thống sẽ chỉnh lại khi em luyện thêm.`,
  ]);

  const strengths = input.strongSkills.slice(0, MAX_STRENGTHS).map((outcome) =>
    clause(`Em làm tốt phần ${skillLabel(outcome.skillName, outcome.chapterName)}`, [
      `đúng ${outcome.correct}/${outcome.total}`,
      speedPhrase(outcome.timeRatio, tuning),
      // Đúng nhưng chậm vẫn là điểm mạnh, chỉ cần nói thêm việc cần luyện.
      outcome.timeRatio !== null && outcome.timeRatio > tuning.fastTimeRatio
        ? 'kiến thức chắc rồi, chỉ cần luyện cho nhanh tay hơn'
        : '',
    ]),
  );

  const weaknesses = input.weakSkills
    .slice(0, MAX_WEAKNESSES)
    .map((outcome) => skillOutcomeLine('Chỗ cần sửa: ', outcome, tuning));

  if (weaknesses.length === 0 && input.errorPatterns.length > 0) {
    // Không skill nào rơi xuống ngưỡng hổng nhưng vẫn có lỗi lặp → nói theo loại lỗi.
    weaknesses.push(
      clause('Bài này chưa khoanh được kỹ năng cụ thể nào bị hổng, nhưng em vẫn mắc lỗi lặp', [
        input.errorPatterns.map((pattern) => `${pattern.label} ${pattern.count} lần`).join(', '),
      ]),
    );
  }

  const priorities = input.priorities.slice(0, MAX_PRIORITIES).map((priority) => ({
    skillName: priority.skillName,
    why: priorityWhy(priority),
  }));

  const strongNames = input.strongSkills.slice(0, MAX_STRENGTHS).map((outcome) => outcome.skillName);
  const nextStep =
    priorities.length > 0
      ? 'Hai tuần tới em sửa lần lượt theo thứ tự ưu tiên ở trên, mỗi ngày một chút là đủ.'
      : 'Em cứ học theo kế hoạch hằng ngày hệ thống giao, mỗi ngày một chút là đủ.';
  const encouragement =
    strongNames.length > 0
      ? `Em đã có nền ở ${joinVN(strongNames)}, đó là chỗ dựa để đi tiếp. ${nextStep}`
      : `Kết quả này chỉ để hệ thống biết nên bắt đầu từ đâu, không phải kết luận về em. ${nextStep}`;

  return { summary, strengths, weaknesses, priorities, encouragement };
}

// ---------------------------------------------------------------------------
// 2. Báo cáo tiến bộ sau một chu kỳ
// ---------------------------------------------------------------------------

function deltaLine(delta: SkillDeltaInput, verb: string): string {
  return `${delta.skillName}: mastery ${verb} ${num(Math.abs(delta.delta))} điểm (${num(delta.before)} → ${num(delta.after)}).`;
}

export function buildProgressReportFallback(
  input: ProgressReportInput,
  tuning: FallbackTuning = DEFAULT_FALLBACK_TUNING,
): ProgressReportContent {
  const percentClause =
    input.previousPercent === null
      ? ''
      : (() => {
          const diff = Math.round((input.percent - input.previousPercent) * 10) / 10;
          if (diff === 0) return ', bằng đúng lần trước';
          return `, ${diff > 0 ? 'tăng' : 'giảm'} ${num(Math.abs(diff))} điểm phần trăm so với lần trước`;
        })();

  const speedSentence =
    input.speedBefore === null
      ? `Tốc độ làm bài đang ở mức ${num(input.speedAfter, 2)} lần thời gian chuẩn.`
      : `Tốc độ làm bài ${input.speedAfter <= input.speedBefore ? 'nhanh hơn' : 'chậm hơn'} chu kỳ trước (${num(input.speedBefore, 2)} → ${num(input.speedAfter, 2)} lần thời gian chuẩn).`;

  const trendSentence =
    input.masteryDelta > 0
      ? 'Nhìn chung em đang đi lên.'
      : input.masteryDelta < 0
        ? 'Nhìn chung chu kỳ này đi xuống, cần chỉnh lại cách học chứ không phải học nhiều hơn.'
        : 'Nhìn chung em đang chững lại, cần đổi cách luyện ở phần còn hổng.';

  const summary = sentences([
    `Chu kỳ ${input.cycleNo}: em làm đúng ${input.correctCount}/${input.itemCount} câu (${num(input.percent)}%)${percentClause}.`,
    input.masteryDelta === 0
      ? `Mastery trung bình gần như không đổi (${num(input.masteryBefore)} → ${num(input.masteryAfter)}).`
      : `Mastery trung bình ${num(input.masteryBefore)} → ${num(input.masteryAfter)} (${signedNum(input.masteryDelta)} điểm).`,
    speedSentence,
    trendSentence,
    input.daysToExam !== null ? `Còn ${input.daysToExam} ngày nữa tới kỳ thi.` : '',
  ]);

  const improved: string[] = input.improvedSkills.slice(0, MAX_LIST).map((delta) => deltaLine(delta, 'tăng'));
  for (const fixed of input.errorsFixed) {
    if (improved.length >= MAX_LIST) break;
    improved.push(`Không còn lỗi ${fixed.label} ở ${fixed.skillName}.`);
  }
  if (improved.length === 0) {
    improved.push('Chu kỳ này chưa có kỹ năng nào tăng rõ rệt — số liệu chưa đủ để khẳng định tiến bộ.');
  }

  const stillWeak: string[] = [];
  for (const outcome of input.stillWeakSkills) {
    if (stillWeak.length >= MAX_LIST) break;
    stillWeak.push(
      clause(`${skillLabel(outcome.skillName, outcome.chapterName)} vẫn còn hổng`, [
        `đúng ${outcome.correct}/${outcome.total}`,
        `mastery ${num(outcome.masteryScore)}/100`,
        speedPhrase(outcome.timeRatio, tuning),
        errorPhrase(outcome.errorLabels),
      ]),
    );
  }
  for (const dropped of input.droppedSkills) {
    if (stillWeak.length >= MAX_LIST) break;
    stillWeak.push(deltaLine(dropped, 'giảm'));
  }
  for (const repeated of input.errorsRepeated) {
    if (stillWeak.length >= MAX_LIST) break;
    stillWeak.push(`Lỗi ${repeated.label} ở ${repeated.skillName} vẫn lặp lại, cần xem lại cách làm dạng này.`);
  }
  if (stillWeak.length === 0) {
    stillWeak.push('Không còn kỹ năng nào dưới ngưỡng hổng trong chu kỳ này.');
  }

  const nextFocus = input.nextFocus.slice(0, MAX_ACTIONS).map((priority, index) =>
    sentences([
      `Việc ${index + 1}: luyện ${skillLabel(priority.skillName, priority.chapterName)}.`,
      priorityWhy(priority),
    ]),
  );
  if (nextFocus.length === 0) {
    nextFocus.push('Việc 1: giữ nhịp luyện hiện tại và làm đủ số ngày học trong kế hoạch.');
  }

  return { summary, improved, stillWeak, nextFocus };
}

// ---------------------------------------------------------------------------
// 3. Pre-session brief cho giáo viên (specs §9.3 — 7 khối)
// ---------------------------------------------------------------------------

export function buildTeacherBriefFallback(
  input: TeacherBriefInput,
  tuning: FallbackTuning = DEFAULT_FALLBACK_TUNING,
): TeacherBriefContent {
  const examSentence =
    input.examDateLabel !== null
      ? `Kỳ thi ${input.programName} ngày ${input.examDateLabel}${input.daysToExam !== null ? ` (còn ${input.daysToExam} ngày)` : ''}.`
      : `Chương trình ${input.programName}, chưa chốt ngày thi.`;

  const goalSentence =
    input.targetLevelLabel !== null
      ? `Mục tiêu ${input.targetLevelLabel}${input.goalDeadlineLabel !== null ? ` trước ${input.goalDeadlineLabel}` : ''}${input.feasibilityLabel !== null ? ` — ${input.feasibilityLabel}` : ''}.`
      : 'Học sinh chưa chốt mục tiêu trong hệ thống.';

  const performanceSentence =
    input.latestPercent !== null
      ? `Bài gần nhất ${num(input.latestPercent)}%${input.baselinePercent !== null ? `, đầu vào ${num(input.baselinePercent)}%` : ''}${input.percentDelta !== null ? ` (${signedNum(input.percentDelta)} điểm phần trăm)` : ''}; mastery ${signedNum(input.masteryDelta)} điểm${input.speedRatio !== null ? `, tốc độ ${num(input.speedRatio, 2)} lần thời gian chuẩn` : ''}.`
      : 'Chưa có bài kiểm tra nào được nộp nên chưa có số liệu điểm.';

  const engagementSentence = `Chuyên cần: hoàn thành ${input.engagement.completedDays}/${input.engagement.totalDays} ngày học (${num(input.engagement.completionRatePercent)}%), ${input.engagement.minutesStudied} phút, chuỗi ${input.engagement.streakDays} ngày, làm ${input.engagement.itemsAnswered} câu với ${num(input.engagement.accuracyPercent)}% đúng.`;

  const overview = sentences([
    `${input.student.nickname} — ${input.student.gradeBandLabel}, môn ${input.student.subjectLabel}, chu kỳ ${input.cycleNo}, mức hiện tại ${input.student.currentLevelLabel}.`,
    examSentence,
    goalSentence,
    performanceSentence,
    engagementSentence,
    'Bản tóm tắt này do hệ thống dựng từ dữ liệu học tập, thầy cô duyệt lại trước khi dùng trong buổi tư vấn.',
  ]);

  const keyIssues: string[] = [];
  for (const warning of input.warnings) {
    if (keyIssues.length >= MAX_LIST) break;
    keyIssues.push(warning.endsWith('.') ? warning : `${warning}.`);
  }
  for (const gap of input.gaps) {
    if (keyIssues.length >= MAX_LIST) break;
    // Dưới ngưỡng hổng mới gọi là lỗ hổng; trên ngưỡng chỉ là chỗ yếu nhất hiện có.
    const label = gap.masteryScore < tuning.gapThreshold ? 'Lỗ hổng' : 'Cần củng cố';
    keyIssues.push(
      clause(`${label}: ${skillLabel(gap.skillName, gap.chapterName)}`, [
        `mastery ${num(gap.masteryScore)}/100`,
        `độ tin cậy ${num(gap.confidence, 2)}`,
      ]),
    );
  }
  for (const pattern of input.errorPatterns) {
    if (keyIssues.length >= MAX_LIST) break;
    keyIssues.push(
      clause(`Lỗi ${pattern.label} lặp ${pattern.count} lần`, [
        pattern.exampleItemCodes.length > 0 ? `ví dụ ${pattern.exampleItemCodes.join(', ')}` : '',
      ]),
    );
  }
  if (keyIssues.length === 0) {
    keyIssues.push('Chưa phát hiện vấn đề nổi bật trong chu kỳ này; buổi tư vấn có thể dùng để nâng độ khó.');
  }

  const talkingPoints: string[] = [];
  const topGap = input.gaps[0];
  if (topGap) {
    talkingPoints.push(
      `Cho em nói lại cách làm một câu dạng ${topGap.skillName} để tách bạch: hổng kiến thức hay hổng cách trình bày.`,
    );
  }
  if (input.speedRatio !== null && input.speedRatio > tuning.fastTimeRatio) {
    talkingPoints.push(
      `Tốc độ đang ${num(input.speedRatio, 2)} lần thời gian chuẩn — hỏi em thường tắc ở bước nào khi làm bài.`,
    );
  }
  const topError = input.errorPatterns[0];
  if (topError && talkingPoints.length < MAX_LIST) {
    talkingPoints.push(
      `Mở lại câu ${topError.exampleItemCodes[0] ?? 'gần nhất'} và hỏi em nghĩ gì lúc làm, để xác định nguyên nhân lỗi ${topError.label}.`,
    );
  }
  if (input.engagement.completionRatePercent < 100 && talkingPoints.length < MAX_LIST) {
    const missed = Math.max(0, input.engagement.totalDays - input.engagement.completedDays);
    talkingPoints.push(
      missed > 0
        ? `Hỏi lý do bỏ ${missed} ngày học trong chu kỳ (bận, quá tải hay không hiểu bài) để chỉnh quỹ thời gian cho sát.`
        : 'Hỏi em thấy khối lượng bài mỗi ngày vừa sức hay quá tải.',
    );
  }
  if (talkingPoints.length === 0) {
    talkingPoints.push('Hỏi em phần nào đang thấy khó nhất để chọn trọng tâm cho chu kỳ tới.');
  }

  const suggestedActions: string[] = [];
  if (input.feasibilityLabel !== null && input.warnings.some((w) => w.toLowerCase().includes('khả thi'))) {
    suggestedActions.push('Chốt lại mục tiêu hoặc hạn hoàn thành với học sinh cho khớp quỹ thời gian thực tế.');
  }
  // Bỏ ngày học là dấu hiệu quá tải trước khi là dấu hiệu lười — đề xuất giảm tải.
  if (input.engagement.totalDays > 0 && input.engagement.completedDays < input.engagement.totalDays) {
    suggestedActions.push('Giảm tải mỗi ngày để học sinh hoàn thành trọn ngày học, rồi tăng lại khi nhịp học ổn.');
  }
  for (const priority of input.priorities) {
    if (suggestedActions.length >= MAX_ACTIONS) break;
    suggestedActions.push(
      clause(`Đổi ưu tiên chu kỳ tới sang ${priority.skillName}`, [
        priority.chapterName !== '' ? `chương ${priority.chapterName}` : '',
        `mastery ${num(priority.masteryScore)}/100`,
      ]),
    );
  }
  if (suggestedActions.length === 0) {
    suggestedActions.push('Giữ nguyên kế hoạch hiện tại và theo dõi thêm một chu kỳ.');
  }

  return {
    overview,
    keyIssues: keyIssues.slice(0, MAX_LIST),
    talkingPoints: talkingPoints.slice(0, MAX_LIST),
    suggestedActions: suggestedActions.slice(0, MAX_ACTIONS),
  };
}

// ---------------------------------------------------------------------------
// 4. Giải thích lời giải — CHỈ diễn đạt lại lời giải đã kiểm duyệt
// ---------------------------------------------------------------------------

function splitSentences(text: string): string[] {
  return text
    .split(/\n+|(?<=[.!?…;])\s+/)
    .map((part) => part.trim())
    .filter((part) => part !== '');
}

function ensureDot(text: string): string {
  return /[.!?…:]$/.test(text) ? text : `${text}.`;
}

export function buildSolutionExplanationFallback(
  input: SolutionExplanationInput,
): SolutionExplanationContent {
  const header = `Câu này thuộc kỹ năng ${skillLabel(input.skillName, input.chapterName)}, mức ${input.difficultyLabel}.`;
  const answerText = input.correctAnswerText.trim();

  // Nguồn duy nhất được phép dùng: các bước đã duyệt, nếu không có thì lời giải.
  const steps =
    input.solutionSteps.map((step) => step.trim()).filter((step) => step !== '').length > 0
      ? input.solutionSteps.map((step) => step.trim()).filter((step) => step !== '')
      : splitSentences(input.solution);

  if (steps.length === 0) {
    // Lời giải trống là lỗi dữ liệu — nói thật, tuyệt đối không tự giải thay.
    const lines = [
      header,
      'Lời giải chuẩn của câu này chưa được biên soạn đầy đủ nên hệ thống chưa giảng lại được.',
      answerText !== '' ? `Đáp án đúng: ${answerText}.` : '',
      'Em báo lỗi câu hỏi để đội nội dung bổ sung lời giải nhé.',
    ];
    return { explanation: lines.filter((line) => line !== '').join('\n') };
  }

  if (input.level === 'SHORT') {
    const core = steps.slice(0, MAX_SHORT_SENTENCES).map(ensureDot);
    const lines = [header, ...core, answerText !== '' ? `Đáp án đúng: ${answerText}.` : ''];
    return { explanation: lines.filter((line) => line !== '').join('\n') };
  }

  const lines: string[] = [header];
  // Chừa chỗ cho dòng kết luận và dòng nhắc cuối.
  const stepBudget = MAX_DETAIL_LINES - 3;
  steps.slice(0, stepBudget).forEach((step, index) => {
    // Bước đã tự đánh số trong dữ liệu thì giữ nguyên, tránh "Bước 1: Bước 1: ...".
    lines.push(/^(bước|buoc|b\d|\d+[.)])/i.test(step) ? ensureDot(step) : `Bước ${index + 1}: ${ensureDot(step)}`);
  });
  if (steps.length > stepBudget) {
    lines.push(`(Còn ${steps.length - stepBudget} bước nữa trong lời giải đầy đủ phía dưới.)`);
  }
  if (answerText !== '') lines.push(`Kết luận: đáp án đúng là ${answerText}.`);
  if (input.hint && input.hint.trim() !== '') lines.push(`Mẹo cho lần sau: ${ensureDot(input.hint.trim())}`);
  lines.push('Chỗ nào chưa thông, em ghi lại để hỏi trong buổi tư vấn với giáo viên.');

  return { explanation: lines.slice(0, MAX_DETAIL_LINES).join('\n') };
}

// ---------------------------------------------------------------------------
// 5. Gợi ý metadata cho câu hỏi mới — dò từ khóa, KHÔNG dùng LLM
// ---------------------------------------------------------------------------

/** Khối dấu thanh/dấu mũ Unicode (Combining Diacritical Marks). */
const COMBINING_MARK_FIRST = 0x300;
const COMBINING_MARK_LAST = 0x36f;

/** Bỏ dấu tiếng Việt để so khớp từ khóa không phụ thuộc cách gõ. */
function normalizeVi(text: string): string {
  let out = '';
  for (const char of text.normalize('NFD')) {
    const code = char.codePointAt(0) ?? 0;
    if (code >= COMBINING_MARK_FIRST && code <= COMBINING_MARK_LAST) continue;
    out += char === 'đ' || char === 'Đ' ? 'd' : char;
  }
  return out.toLowerCase();
}

function tokenize(text: string): string[] {
  return normalizeVi(text)
    .split(/[^a-z0-9]+/)
    .filter((token) => token.length >= MIN_TOKEN_LENGTH && !STOP_WORDS.has(token));
}

function slugify(text: string): string {
  return normalizeVi(text)
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/** Thứ tự độ khó tăng dần — dùng để chọn mức từ điểm phức tạp. */
function sortDifficulties(
  options: { value: Difficulty; label: string }[],
): { value: Difficulty; label: string }[] {
  return [...options].sort((a, b) => DIFFICULTY_ORDER[a.value] - DIFFICULTY_ORDER[b.value]);
}

export function buildItemMetadataFallback(input: ItemMetadataInput): ItemMetadataContent {
  const fullText = [input.stem, ...input.options.map((option) => option.text), input.solution].join(' ');
  const textTokens = new Set(tokenize(fullText));

  // 1) Dò kỹ năng: tỷ lệ từ khóa trong tên kỹ năng xuất hiện trong đề/lời giải.
  const scored = input.skillCatalog
    .map((skill) => {
      const skillTokens = tokenize(skill.name);
      const chapterTokens = tokenize(skill.chapterName);
      const matched = skillTokens.filter((token) => textTokens.has(token)).length;
      const chapterMatched = chapterTokens.filter((token) => textTokens.has(token)).length;
      const base = skillTokens.length > 0 ? matched / skillTokens.length : 0;
      const bonus = chapterTokens.length > 0 ? (chapterMatched / chapterTokens.length) * 0.5 : 0;
      return { skill, score: Math.min(1, base + bonus) };
    })
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score);

  const picked = scored.slice(0, MAX_SUGGESTED_SKILLS);
  const suggestedSkillCodes = picked.map((entry) => entry.skill.code);

  // 2) Đoán độ khó theo độ phức tạp của lời giải và đề bài.
  const stepCount = input.solution.split(/\n+/).filter((line) => line.trim() !== '').length;
  const hardKeywords = ['chung minh', 'tong quat', 'bat dang thuc', 'quy nap', 'to hop', 'xac suat', 'nghich ly'];
  const normalizedText = normalizeVi(fullText);
  const keywordHits = hardKeywords.filter((keyword) => normalizedText.includes(keyword)).length;
  const complexity = stepCount + input.stem.length / 200 + keywordHits * 2;

  const ladder = sortDifficulties(input.difficultyOptions);
  const easiest = ladder[0]?.value ?? 'AVERAGE';
  const middle = ladder[1]?.value ?? easiest;
  const hardest = ladder[ladder.length - 1]?.value ?? middle;
  const suggestedDifficulty: Difficulty =
    complexity < COMPLEXITY_MEDIUM ? easiest : complexity < COMPLEXITY_HIGH ? middle : hardest;

  // 3) Tag: ưu tiên dùng lại tag đã có trong kho, không đẻ quy ước mới.
  const suggestedTags = input.knownTags
    .filter((tag) => {
      const normalizedTag = normalizeVi(tag).replace(/[-_]+/g, ' ').trim();
      return normalizedTag !== '' && normalizedText.includes(normalizedTag);
    })
    .slice(0, MAX_SUGGESTED_TAGS);
  if (suggestedTags.length === 0 && picked.length > 0) {
    const slug = slugify(picked[0].skill.name);
    if (slug !== '') suggestedTags.push(slug);
  }

  const bestScore = picked.length > 0 ? picked[0].score : 0;
  const confidence = Math.round(Math.min(MAX_FALLBACK_CONFIDENCE, 0.15 + bestScore * 0.5) * 100) / 100;

  const note =
    picked.length > 0
      ? `Gợi ý dựa trên từ khóa trùng nhau giữa đề, lời giải và tên kỹ năng "${picked[0].skill.name}" (chương ${picked[0].skill.chapterName}); độ khó suy từ số bước lời giải. Bản gợi ý này do hệ thống suy luận theo quy tắc, KHÔNG phải quyết định cuối cùng — biên soạn viên phải kiểm tra và phê duyệt trước khi lưu.`
      : `Không tìm được kỹ năng nào trùng từ khóa với đề bài (môn ${input.subjectLabel}, ${input.gradeBandLabel}), nên chưa gợi ý được mã kỹ năng. Biên soạn viên chọn tay và phê duyệt — đây chỉ là gợi ý của hệ thống.`;

  return { suggestedSkillCodes, suggestedDifficulty, suggestedTags, confidence, note };
}
