/**
 * PROMPT TEMPLATE CÓ VERSION (specs §8.3 bước 2, §15 "Auditability").
 *
 * ============================ ĐỌC TRƯỚC KHI SỬA ============================
 * Sửa BẤT KỲ chuỗi prompt nào trong file này thì PHẢI tăng `PROMPT_VERSION`.
 * Bảng `AiGeneration` lưu `promptVersion` của từng bản sinh — giữ nguyên version
 * mà đổi prompt sẽ mất khả năng truy vết "báo cáo cũ sinh từ prompt nào", đồng
 * thời làm hỏng cơ chế tự làm mới cache (service coi bản ghi khác
 * `PROMPT_VERSION` là hết hạn và sinh lại).
 * ===========================================================================
 *
 * Dữ liệu truyền vào đây ĐÃ ẨN DANH (specs §8.2, §14 #6): không tên, email, số
 * điện thoại, trường lớp của học sinh — chỉ biệt danh dạng "Học sinh #<mã>".
 * Tên kỹ năng và tên chương thì được phép vì đó là kiến thức, không phải PII.
 *
 * AI ở đây chỉ DIỄN GIẢI kết quả engine đã tính. AI không chọn câu hỏi, không
 * sinh đề, không sửa đáp án.
 */
import type { Difficulty } from '@prisma/client';

/** Tăng khi đổi bất kỳ prompt nào trong file (xem khối cảnh báo phía trên). */
export const PROMPT_VERSION = 'v1';

/** Cặp system/user gửi thẳng cho adapter LLM. */
export interface AiPrompt {
  system: string;
  prompt: string;
}

export type ExplanationLevel = 'SHORT' | 'DETAILED';

// ---------------------------------------------------------------------------
// DỮ LIỆU VÀO — đã ẩn danh, do service dựng từ DB
// ---------------------------------------------------------------------------

export interface AnonymousStudent {
  /** Biệt danh dẫn xuất, ví dụ "Học sinh #7F3A" — không bao giờ là tên thật. */
  nickname: string;
  gradeBandLabel: string;
  subjectLabel: string;
  currentLevelLabel: string;
}

export interface SkillOutcome {
  skillName: string;
  chapterName: string;
  correct: number;
  total: number;
  /** 0–100 */
  accuracyPercent: number;
  /** 0–100, lấy từ hồ sơ năng lực sau khi chấm. */
  masteryScore: number;
  /** Thời gian thực tế / thời gian chuẩn; null = chưa đo được. */
  timeRatio: number | null;
  /** Nhãn lỗi tiếng Việt đã quy đổi, ví dụ "Sai tính toán". */
  errorLabels: string[];
}

export interface PriorityInput {
  skillName: string;
  chapterName: string;
  /** 0–100 */
  masteryScore: number;
  tierLabel: string;
  /** Câu giải thích do engine sinh — nguồn duy nhất cho phần "vì sao". */
  engineReason: string;
  blockedBySkillNames: string[];
}

export interface DiagnosticCommentInput {
  student: AnonymousStudent;
  assessmentTypeLabel: string;
  correctCount: number;
  itemCount: number;
  /** Điểm có trọng số độ khó, 0–100. */
  percent: number;
  /** Thời gian thực tế / chuẩn của cả bài. */
  avgTimeRatio: number;
  totalMinutes: number;
  estimatedLevelLabel: string;
  strongSkills: SkillOutcome[];
  weakSkills: SkillOutcome[];
  priorities: PriorityInput[];
  errorPatterns: { label: string; count: number }[];
}

export interface SkillDeltaInput {
  skillName: string;
  before: number;
  after: number;
  delta: number;
}

export interface ProgressReportInput {
  student: AnonymousStudent;
  cycleNo: number;
  correctCount: number;
  itemCount: number;
  percent: number;
  previousPercent: number | null;
  /** Mastery trung bình trước / sau chu kỳ (0–100). */
  masteryBefore: number;
  masteryAfter: number;
  masteryDelta: number;
  speedBefore: number | null;
  speedAfter: number;
  improvedSkills: SkillDeltaInput[];
  droppedSkills: SkillDeltaInput[];
  stillWeakSkills: SkillOutcome[];
  nextFocus: PriorityInput[];
  errorsFixed: { skillName: string; label: string }[];
  errorsRepeated: { skillName: string; label: string }[];
  daysToExam: number | null;
}

export interface TeacherBriefInput {
  student: AnonymousStudent;
  cycleNo: number;
  programName: string;
  examDateLabel: string | null;
  daysToExam: number | null;
  targetLevelLabel: string | null;
  goalDeadlineLabel: string | null;
  feasibilityLabel: string | null;
  /** Khối Performance (specs §9.3). */
  baselinePercent: number | null;
  latestPercent: number | null;
  percentDelta: number | null;
  masteryDelta: number;
  speedRatio: number | null;
  /** Khối Mastery Map. */
  strengths: { skillName: string; chapterName: string; masteryScore: number; confidence: number }[];
  gaps: { skillName: string; chapterName: string; masteryScore: number; confidence: number }[];
  /** Khối Error Patterns — kèm mã câu ví dụ để giáo viên mở lại. */
  errorPatterns: { label: string; count: number; exampleItemCodes: string[] }[];
  /** Khối Engagement. */
  engagement: {
    completedDays: number;
    totalDays: number;
    completionRatePercent: number;
    minutesStudied: number;
    streakDays: number;
    itemsAnswered: number;
    accuracyPercent: number;
  };
  /** Khối AI Recommendation — engine đã xếp hạng, AI chỉ diễn giải. */
  priorities: PriorityInput[];
  /** Thẻ cảnh báo đã tính sẵn (giảm điểm, bỏ học, sai lặp, quá hạn…). */
  warnings: string[];
}

export interface SolutionExplanationInput {
  level: ExplanationLevel;
  gradeBandLabel: string;
  subjectLabel: string;
  chapterName: string;
  skillName: string;
  difficultyLabel: string;
  questionTypeLabel: string;
  stem: string;
  options: { key: string; text: string }[];
  correctAnswerText: string;
  /** LỜI GIẢI ĐÃ KIỂM DUYỆT — nguồn grounding duy nhất (specs §8.2). */
  solution: string;
  solutionSteps: string[];
  hint: string | null;
}

export interface ItemMetadataInput {
  stem: string;
  options: { key: string; text: string }[];
  solution: string;
  subjectLabel: string;
  gradeBandLabel: string;
  /** Danh mục skill hợp lệ — model PHẢI chọn trong đây, không được bịa mã mới. */
  skillCatalog: { code: string; name: string; chapterName: string }[];
  difficultyOptions: { value: Difficulty; label: string }[];
  /** Tag đang dùng trong kho, để gợi ý bám theo quy ước sẵn có. */
  knownTags: string[];
}

// ---------------------------------------------------------------------------
// DỮ LIỆU RA — đúng bằng JSON mà prompt yêu cầu model trả về
// ---------------------------------------------------------------------------

export interface DiagnosticCommentContent {
  summary: string;
  strengths: string[];
  weaknesses: string[];
  priorities: { skillName: string; why: string }[];
  encouragement: string;
}

export interface ProgressReportContent {
  summary: string;
  improved: string[];
  stillWeak: string[];
  nextFocus: string[];
}

export interface TeacherBriefContent {
  overview: string;
  keyIssues: string[];
  talkingPoints: string[];
  suggestedActions: string[];
}

export interface SolutionExplanationContent {
  explanation: string;
}

export interface ItemMetadataContent {
  suggestedSkillCodes: string[];
  suggestedDifficulty: Difficulty;
  suggestedTags: string[];
  /** 0–1 */
  confidence: number;
  note: string;
}

// ---------------------------------------------------------------------------
// Khung system chung
// ---------------------------------------------------------------------------

const BASE_SYSTEM = [
  'Bạn là trợ giảng của một nền tảng ôn luyện Olympic dành cho học sinh phổ thông Việt Nam.',
  '',
  'Quy tắc bắt buộc, vi phạm là câu trả lời bị loại:',
  '1. Viết hoàn toàn bằng tiếng Việt có dấu, câu ngắn, từ ngữ đúng với lứa tuổi học sinh phổ thông.',
  '2. CHỈ dùng số liệu và sự kiện có trong dữ liệu được cung cấp. Không thêm con số mới, không ước lượng, không suy đoán phần dữ liệu không có.',
  '3. Không chẩn đoán tâm lý, không kết luận về tính cách, trí thông minh hay hoàn cảnh của học sinh. Chỉ nói về việc học: kiến thức, kỹ năng, cách làm bài, thời gian làm bài.',
  '4. Không so sánh học sinh này với học sinh khác, không dọa nạt, không tạo cảm giác tội lỗi.',
  '5. Không tư vấn ngoài phạm vi học tập (sức khỏe, tâm lý, gia đình, tài chính).',
  '6. Không bịa đề bài, không sửa đáp án, không đưa ra kết quả khác với dữ liệu đã cho.',
  '7. Trả lời DUY NHẤT bằng một đối tượng JSON hợp lệ, đúng các khóa được yêu cầu: không lời dẫn, không bọc trong khối mã, không thêm khóa lạ.',
].join('\n');

/** Gói dữ liệu thành khối JSON có nhãn để model đọc đúng chỗ. */
function dataBlock(label: string, value: unknown): string {
  return `${label}\n\`\`\`json\n${JSON.stringify(value, null, 2)}\n\`\`\``;
}

// ---------------------------------------------------------------------------
// 1. Nhận xét sau bài kiểm tra đầu vào (specs §8.1 dòng 1)
// ---------------------------------------------------------------------------

export function buildDiagnosticCommentPrompt(input: DiagnosticCommentInput): AiPrompt {
  const system = [
    BASE_SYSTEM,
    '',
    'Nhiệm vụ: viết nhận xét sau bài kiểm tra cho chính học sinh đọc. Xưng hô "em" với học sinh.',
    'Engine đã chấm điểm, đã xếp mức năng lực và đã xếp hạng thứ tự ưu tiên — bạn KHÔNG được đổi thứ tự đó, chỉ diễn giải cho dễ hiểu.',
    'Nói rõ ba điều: em làm tốt phần nào, thường sai ở đâu và vì sao, nên sửa theo thứ tự nào.',
  ].join('\n');

  const prompt = [
    dataBlock('DỮ LIỆU BÀI LÀM (đã ẩn danh):', input),
    '',
    'Trả về JSON đúng cấu trúc sau:',
    '{',
    '  "summary": "3–4 câu tóm tắt kết quả: số câu đúng, điểm phần trăm, tốc độ làm bài, mức năng lực ước lượng. Nói rõ đây là ước lượng ban đầu, sẽ được điều chỉnh khi có thêm dữ liệu.",',
    '  "strengths": ["Mỗi phần tử là 1 câu về một kỹ năng em làm tốt, có kèm số liệu đúng/tổng. Tối đa 3 phần tử. Không có kỹ năng nào đủ tốt thì trả về mảng rỗng."],',
    '  "weaknesses": ["Mỗi phần tử là 1 câu về một kỹ năng em còn yếu: số câu đúng/tổng, tốc độ so với mức chuẩn, loại lỗi hay gặp. Tối đa 4 phần tử."],',
    '  "priorities": [{ "skillName": "chép đúng tên kỹ năng trong dữ liệu, giữ nguyên thứ tự đã cho", "why": "1–2 câu vì sao nên học kỹ năng này trước, dựa trên engineReason và mastery đã cho" }],',
    '  "encouragement": "1–2 câu động viên trung thực, không hứa hẹn điểm số, không khen quá lời."',
    '}',
  ].join('\n');

  return { system, prompt };
}

// ---------------------------------------------------------------------------
// 2. Báo cáo tiến bộ mỗi 14 ngày (specs §7.10, §8.1)
// ---------------------------------------------------------------------------

export function buildProgressReportPrompt(input: ProgressReportInput): AiPrompt {
  const system = [
    BASE_SYSTEM,
    '',
    'Nhiệm vụ: viết báo cáo tiến bộ sau một chu kỳ học cho chính học sinh đọc. Xưng hô "em".',
    'Trọng tâm là SO SÁNH với chu kỳ trước: cái gì tiến bộ, cái gì vẫn hổng, hai tuần tới tập trung vào đâu.',
    'Mọi con số delta đã được tính sẵn — chép lại đúng, không tự tính lại và không làm tròn khác.',
    'Nếu dữ liệu cho thấy có phần đi xuống thì nói thẳng nhưng nhẹ nhàng, kèm hướng xử lý.',
  ].join('\n');

  const prompt = [
    dataBlock('DỮ LIỆU CHU KỲ (đã ẩn danh):', input),
    '',
    'Trả về JSON đúng cấu trúc sau:',
    '{',
    '  "summary": "3–4 câu: kết quả bài lần này, thay đổi so với lần trước (mastery và tốc độ), và nhận định chung về xu hướng.",',
    '  "improved": ["Mỗi phần tử là 1 câu về một kỹ năng đã tiến bộ, kèm mức tăng. Tối đa 4 phần tử."],',
    '  "stillWeak": ["Mỗi phần tử là 1 câu về một kỹ năng vẫn còn hổng hoặc bị tụt, kèm số liệu. Tối đa 4 phần tử."],',
    '  "nextFocus": ["Mỗi phần tử là 1 việc cần làm trong 2 tuần tới, bám đúng danh sách nextFocus đã cho và giữ nguyên thứ tự. Tối đa 3 phần tử."]',
    '}',
  ].join('\n');

  return { system, prompt };
}

// ---------------------------------------------------------------------------
// 3. Pre-session brief cho giáo viên (specs §9.3 — 7 khối)
// ---------------------------------------------------------------------------

export function buildTeacherBriefPrompt(input: TeacherBriefInput): AiPrompt {
  const system = [
    BASE_SYSTEM,
    '',
    'Nhiệm vụ: viết bản tóm tắt trước buổi tư vấn 20 phút, người đọc là GIÁO VIÊN (không phải học sinh).',
    'Văn phong chuyên môn, gọn, mỗi ý một dòng, giáo viên đọc hết trong 2 phút.',
    'Gọi học sinh bằng biệt danh đã cho, tuyệt đối không đặt tên khác.',
    'Buổi 20 phút chỉ đủ cho 3 việc — hãy chọn đúng 3 việc đáng giá nhất theo dữ liệu.',
    'Đây là bản nháp để giáo viên duyệt: không kết luận thay giáo viên, không chẩn đoán nguyên nhân tâm lý.',
  ].join('\n');

  const prompt = [
    dataBlock('HỒ SƠ HỌC SINH TRONG CHU KỲ (đã ẩn danh):', input),
    '',
    'Trả về JSON đúng cấu trúc sau:',
    '{',
    '  "overview": "3–4 câu: kỳ thi và thời gian còn lại, mục tiêu và tính khả thi, kết quả gần nhất kèm delta, mức độ chuyên cần.",',
    '  "keyIssues": ["Mỗi phần tử là 1 vấn đề nổi bật cần xử lý, có số liệu kèm theo. Tối đa 4 phần tử. Ưu tiên các cảnh báo trong warnings."],',
    '  "talkingPoints": ["Mỗi phần tử là 1 câu hỏi hoặc điểm cần trao đổi trực tiếp với học sinh để tìm nguyên nhân lỗi. Tối đa 4 phần tử."],',
    '  "suggestedActions": ["Mỗi phần tử là 1 hành động cụ thể đề xuất cho 2 tuần tới (giữ plan / giảm tải / tăng tải / đổi ưu tiên kỹ năng, kèm kỹ năng cụ thể). Tối đa 3 phần tử."]',
    '}',
  ].join('\n');

  return { system, prompt };
}

// ---------------------------------------------------------------------------
// 4. Giải thích lời giải (specs §8.1, §8.2 — bám lời giải đã duyệt)
// ---------------------------------------------------------------------------

export function buildSolutionExplanationPrompt(input: SolutionExplanationInput): AiPrompt {
  const lengthRule =
    input.level === 'SHORT'
      ? 'Mức NGẮN: tối đa 4 câu, chỉ nêu ý chính và bước quyết định. Không liệt kê lại toàn bộ phép tính.'
      : 'Mức CHI TIẾT: giải thích theo từng bước, mỗi bước một dòng bắt đầu bằng "Bước n:", nói rõ vì sao làm bước đó. Tối đa 12 dòng.';

  const system = [
    BASE_SYSTEM,
    '',
    'Nhiệm vụ: giảng lại lời giải ĐÃ ĐƯỢC KIỂM DUYỆT cho học sinh hiểu. Xưng hô "em".',
    'RÀNG BUỘC TUYỆT ĐỐI: bám sát trường "solution" và "solutionSteps" được cung cấp.',
    'Không đưa ra đáp án khác, không thêm cách giải mới, không thêm dữ kiện không có trong đề.',
    'Nếu lời giải đã cho thiếu một bước, hãy diễn đạt lại phần đang có thay vì tự bịa phần thiếu.',
    lengthRule,
  ].join('\n');

  const prompt = [
    dataBlock('CÂU HỎI VÀ LỜI GIẢI ĐÃ KIỂM DUYỆT:', input),
    '',
    'Trả về JSON đúng cấu trúc sau:',
    '{',
    '  "explanation": "Phần giảng lại bằng tiếng Việt, xuống dòng bằng ký tự \\n. Không nhắc lại nguyên văn đề bài."',
    '}',
  ].join('\n');

  return { system, prompt };
}

// ---------------------------------------------------------------------------
// 5. Gợi ý metadata cho câu hỏi mới (specs §8.1 — CHỈ GỢI Ý, người duyệt)
// ---------------------------------------------------------------------------

export function buildItemMetadataPrompt(input: ItemMetadataInput): AiPrompt {
  const system = [
    BASE_SYSTEM,
    '',
    'Nhiệm vụ: gợi ý metadata (kỹ năng, độ khó, tag) cho một câu hỏi mới, phục vụ biên soạn viên.',
    'Đây CHỈ LÀ GỢI Ý — con người sẽ phê duyệt. Không tự nhận là quyết định cuối cùng.',
    'Mã kỹ năng PHẢI lấy nguyên văn từ danh mục skillCatalog. Không có mã nào phù hợp thì trả mảng rỗng.',
    'Độ khó PHẢI là một trong các giá trị difficultyOptions.',
    'Tag ưu tiên dùng lại knownTags; tag mới chỉ thêm khi thật sự cần và phải viết thường, không dấu cách.',
    'confidence là số thực 0–1, phản ánh mức chắc chắn thật sự; dữ liệu mơ hồ thì để thấp.',
  ].join('\n');

  const prompt = [
    dataBlock('NỘI DUNG CÂU HỎI VÀ DANH MỤC HỢP LỆ:', input),
    '',
    'Trả về JSON đúng cấu trúc sau:',
    '{',
    '  "suggestedSkillCodes": ["1–2 mã kỹ năng chép nguyên văn từ skillCatalog, xếp theo mức phù hợp giảm dần"],',
    '  "suggestedDifficulty": "một giá trị trong difficultyOptions",',
    '  "suggestedTags": ["tối đa 5 tag ngắn gọn"],',
    '  "confidence": 0.0,',
    '  "note": "1–2 câu tiếng Việt nêu căn cứ của gợi ý và nhắc rõ đây chỉ là gợi ý cần người duyệt."',
    '}',
  ].join('\n');

  return { system, prompt };
}
