/**
 * CHẤM TỰ LUẬN — PIPELINE HAI LƯỢT GỌI (AI_GRADING_SPEC.md §7, §8).
 *
 *   ảnh[] ──► LƯỢT 1: CHÉP LẠI ──► transcript (lưu DB)
 *                                      │
 *        barem + lời giải mẫu ─────────┼──► LƯỢT 2: CHẤM ──► JSON điểm
 *
 * VÌ SAO TÁCH LÀM HAI, KHÔNG GỘP MỘT:
 *  - Lượt 1 bị CẤM phán xét đúng sai, nên transcript trung thực — model không
 *    "sửa hộ" bài học sinh rồi chấm bản đã sửa.
 *  - Transcript nằm trong DB: chấm lại không phải gọi vision lần nữa (rẻ hơn,
 *    nhanh hơn), và học sinh đọc được để khiếu nại "AI đọc sai chữ em".
 *  - Đổi model chấm không đụng tới bước đọc ảnh.
 *
 * KHÔNG TIN MODEL TUYỆT ĐỐI (§8 "hậu kiểm bắt buộc"): điểm trả về bị cắt về
 * khoảng hợp lệ của từng tiêu chí, mã tiêu chí lạ bị loại, và TỔNG ĐIỂM DO CODE
 * CỘNG LẠI chứ không lấy con số model tự khai.
 */
import { z } from 'zod';
import {
  AiProviderError,
  callAiJson,
  callAiText,
  extractJson,
  resolveProvider,
  type VisionImage,
} from './ai-provider';

export const MOCK_PROMPT_VERSION = 'mock-exam-v1';

/** Dấu hiệu ảnh trống — quy ước cứng giữa hai lượt gọi. */
export const NO_WORK_MARKER = '[không có bài làm]';
export const UNREADABLE_MARKER = '[không đọc được]';

export interface RubricCriterion {
  code: string;
  points: number;
  description: string;
}

export interface EssayQuestionInput {
  number: number;
  maxPoints: number;
  promptMd: string;
  solutionMd: string | null;
  rubric: RubricCriterion[];
}

export interface EssayCriterionResult {
  code: string;
  points: number;
  awarded: number;
  evidence: string;
  reason: string;
}

export interface EssayGradeOutcome {
  transcriptMd: string;
  awarded: number;
  confidence: number;
  needsReview: boolean;
  feedbackVi: string;
  criteria: EssayCriterionResult[];
  /** Nhãn model đã dùng — ghi vào AiGeneration và hiện ở màn hình giáo viên. */
  modelLabel: string;
  tokensIn: number;
  tokensOut: number;
  latencyMs: number;
  demo: boolean;
}

// ---------------------------------------------------------------------------
// Prompt — chép nguyên văn từ spec §8, đây là phần quyết định chất lượng chấm
// ---------------------------------------------------------------------------

const TRANSCRIBE_SYSTEM = `Bạn là công cụ chép lại bài làm viết tay của học sinh. Nhiệm vụ DUY NHẤT của bạn là chép lại chính xác những gì có trên ảnh.

QUY TẮC TUYỆT ĐỐI:
1. KHÔNG sửa lỗi sai của học sinh. Nếu học sinh viết "2^6 = 62", bạn chép đúng "2^6 = 62".
2. KHÔNG bổ sung bước giải mà học sinh không viết.
3. KHÔNG đánh giá, KHÔNG nhận xét, KHÔNG cho điểm.
4. Đoạn nào không đọc được, ghi chính xác: ${UNREADABLE_MARKER}
5. Nếu ảnh trống hoặc không có bài làm, trả về đúng: ${NO_WORK_MARKER}
6. Giữ nguyên thứ tự dòng. Mỗi dòng bài làm là một dòng output.
7. Công thức toán viết bằng LaTeX inline: $...$
8. Nếu học sinh vẽ hình, mô tả ngắn gọn trong ngoặc vuông, ví dụ: [hình vẽ: tam giác ABC, có đánh dấu góc vuông tại A]

Chỉ xuất phần nội dung chép lại. Không thêm lời mở đầu hay kết luận.`;

const GRADE_SYSTEM = `Bạn là giám khảo chấm thi Olympic Toán tiểu học. Bạn chấm theo BAREM CÓ SẴN, không tự nghĩ ra tiêu chí mới.

QUY TẮC CHẤM:
1. Chỉ được cho điểm theo các tiêu chí trong BAREM. Tổng điểm = tổng điểm các tiêu chí.
2. Mỗi tiêu chí chỉ cho điểm khi tìm được BẰNG CHỨNG cụ thể trong bài làm. Phải trích dẫn nguyên văn đoạn đó vào trường "evidence".
3. Nếu không tìm được bằng chứng cho một tiêu chí, cho 0 điểm cho tiêu chí đó và ghi rõ lý do.
4. Cho điểm từng phần: học sinh làm đúng hướng nhưng sai số học vẫn được điểm ở tiêu chí về phương pháp.
5. Cách trình bày khác lời giải mẫu nhưng đúng về mặt toán học thì VẪN CHO ĐIỂM ĐỦ. Lời giải mẫu chỉ là tham khảo, không phải chuẩn duy nhất.
6. Nếu transcript ghi ${NO_WORK_MARKER} → tất cả tiêu chí = 0, confidence = 1.0.
7. Nếu transcript có nhiều ${UNREADABLE_MARKER} ở chỗ quan trọng → đặt needs_human_review = true và confidence < 0.6.
8. confidence là mức độ chắc chắn của bạn về điểm số (0.0–1.0).
9. feedback_vi: viết cho học sinh tiểu học đọc. Tiếng Việt, thân thiện, tối đa 3 câu. Nêu cụ thể em làm được gì và thiếu gì. KHÔNG chê bai.

Không được cho điểm vượt quá max_points của tiêu chí. Không được cho điểm âm.

Trả lời DUY NHẤT bằng một object JSON, không kèm lời dẫn, dùng ĐÚNG bốn khóa
tiếng Anh sau — không dịch, không đổi tên, không thêm khóa bao ngoài:

{
  "criteria": [
    { "code": "c1", "awarded": 2, "evidence": "trích nguyên văn bài làm", "reason": "vì sao" }
  ],
  "confidence": 0.8,
  "needs_human_review": false,
  "feedback_vi": "nhận xét cho học sinh"
}

"code" phải trùng đúng mã tiêu chí in trong BAREM. Thiếu bất kỳ khóa nào trong bốn
khóa trên thì kết quả bị loại và phải chấm lại.`;

function buildGradeUser(question: EssayQuestionInput, transcript: string): string {
  const rubricText = question.rubric
    .map((c) => `[${c.code}] ${c.points} điểm — ${c.description}`)
    .join('\n');

  return `## ĐỀ BÀI (câu ${question.number}, tối đa ${question.maxPoints} điểm)
${question.promptMd}

## LỜI GIẢI MẪU (tham khảo, không phải chuẩn duy nhất)
${question.solutionMd ?? '(không có)'}

## BAREM
${rubricText}

## BÀI LÀM CỦA HỌC SINH (đã chép lại từ ảnh)
${transcript}`;
}

const GRADE_JSON_SHAPE = {
  name: 'submit_grade',
  description: 'Nộp kết quả chấm điểm theo barem',
  schema: {
    type: 'object',
    properties: {
      criteria: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            code: { type: 'string' },
            awarded: { type: 'number' },
            evidence: {
              type: 'string',
              description: "Trích nguyên văn từ bài làm. Ghi 'không tìm thấy' nếu không có.",
            },
            reason: { type: 'string' },
          },
          required: ['code', 'awarded', 'evidence', 'reason'],
        },
      },
      confidence: { type: 'number' },
      needs_human_review: { type: 'boolean' },
      feedback_vi: { type: 'string' },
    },
    required: ['criteria', 'confidence', 'needs_human_review', 'feedback_vi'],
  },
} as const;

/**
 * Cấu trúc BẮT BUỘC của lượt chấm.
 *
 * Bốn khóa này phải khớp đúng `required` của `GRADE_JSON_SHAPE` ở trên — và phải
 * là BẮT BUỘC thật.
 *
 * Trước đây mọi trường đều có `.default()`, nghĩa là không còn trường nào bắt
 * buộc: `safeParse({})` cũng thành công. Model trả về `{"tieu_chi": [...]}` hay
 * `{"scores": [...]}` — chuyện thường gặp với model không hỗ trợ structured
 * output — vẫn được coi là "chấm xong", `criteria` rỗng, và học sinh nhận 0 điểm
 * mang nhãn GRADED. Sai cấu trúc thì phải TRƯỢT để vòng lặp ở dưới nhắc lại một
 * lần, rồi mới chuyển FAILED (đúng spec §11). Chấm hỏng còn sửa được; chấm sai
 * mà không ai biết thì không.
 *
 * `evidence` và `reason` vẫn được phép thiếu: chúng chỉ là lời giải thích, thiếu
 * thì bài vẫn chấm được, không đáng để đánh hỏng cả lượt.
 */
const gradeReplySchema = z.object({
  criteria: z
    .array(
      z.object({
        code: z.string(),
        awarded: z.coerce.number(),
        evidence: z.string().optional().default(''),
        reason: z.string().optional().default(''),
      }),
    )
    .min(1, 'Lượt chấm phải nêu ít nhất một tiêu chí.'),
  confidence: z.coerce.number(),
  needs_human_review: z.coerce.boolean(),
  feedback_vi: z.string(),
});

// ---------------------------------------------------------------------------
// Hậu kiểm
// ---------------------------------------------------------------------------

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, value));
}

/** Làm tròn 2 chữ số để 3 tiêu chí 2.33 không cộng thành 6.999999. */
function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function reconcile(
  question: EssayQuestionInput,
  transcript: string,
  reply: z.infer<typeof gradeReplySchema>,
  confidenceThreshold: number,
): Omit<EssayGradeOutcome, 'transcriptMd' | 'modelLabel' | 'tokensIn' | 'tokensOut' | 'latencyMs' | 'demo'> {
  const byCode = new Map(question.rubric.map((c) => [c.code, c]));
  const seen = new Set<string>();

  const criteria: EssayCriterionResult[] = [];
  for (const item of reply.criteria) {
    const rubric = byCode.get(item.code);
    if (!rubric || seen.has(item.code)) continue; // mã lạ hoặc lặp → bỏ
    seen.add(item.code);
    criteria.push({
      code: rubric.code,
      points: rubric.points,
      awarded: round2(clamp(item.awarded, 0, rubric.points)),
      evidence: item.evidence.trim() || 'không tìm thấy',
      reason: item.reason.trim(),
    });
  }

  // Tiêu chí model quên nhắc tới vẫn phải xuất hiện, với 0 điểm — trang kết quả
  // phải cho học sinh thấy ĐỦ barem thì mới biết mình mất điểm ở đâu.
  for (const rubric of question.rubric) {
    if (seen.has(rubric.code)) continue;
    criteria.push({
      code: rubric.code,
      points: rubric.points,
      awarded: 0,
      evidence: 'không tìm thấy',
      reason: 'AI không chấm tiêu chí này.',
    });
  }
  criteria.sort(
    (a, b) =>
      question.rubric.findIndex((c) => c.code === a.code) -
      question.rubric.findIndex((c) => c.code === b.code),
  );

  const awarded = round2(
    Math.min(
      criteria.reduce((sum, c) => sum + c.awarded, 0),
      question.maxPoints,
    ),
  );
  const confidence = round2(clamp(reply.confidence, 0, 1));
  const missedCriteria = criteria.some((c) => c.reason === 'AI không chấm tiêu chí này.');

  return {
    awarded,
    confidence,
    needsReview:
      reply.needs_human_review ||
      confidence < confidenceThreshold ||
      transcript.includes(UNREADABLE_MARKER) ||
      missedCriteria,
    feedbackVi: reply.feedback_vi.trim() || 'Chưa có nhận xét cho câu này.',
    criteria,
  };
}

// ---------------------------------------------------------------------------
// Chế độ thử
// ---------------------------------------------------------------------------

/**
 * Điểm giả để xem trọn luồng khi chưa có khóa. Cho điểm tiêu chí ĐẦU TIÊN và
 * ghi rõ "chế độ thử" ở mọi trường chữ, để không ai nhìn màn hình kết quả mà
 * tưởng AI đã đọc bài thật.
 */
function demoOutcome(
  question: EssayQuestionInput,
  hasImages: boolean,
  typedWork: string,
): EssayGradeOutcome {
  const hasWork = hasImages || typedWork !== '';

  const criteria: EssayCriterionResult[] = question.rubric.map((c, index) => ({
    code: c.code,
    points: c.points,
    // Cho điểm tiêu chí đầu để thanh tiến độ và bảng barem có gì mà hiện — đủ
    // để xem giao diện, và mọi dòng chữ quanh nó đều nói rõ đây là điểm mẫu.
    awarded: index === 0 && hasWork ? c.points : 0,
    evidence: 'không tìm thấy — chế độ thử',
    reason: 'Chế độ thử: chưa gọi AI thật nên không có bằng chứng từ bài làm.',
  }));

  return {
    transcriptMd: !hasWork
      ? NO_WORK_MARKER
      : typedWork !== ''
        ? `${typedWork}\n\n[chế độ thử — chữ này do học sinh gõ, chưa gọi AI]`
        : '[chế độ thử] Chưa gọi AI nên chưa đọc ảnh bài làm.',
    awarded: round2(criteria.reduce((sum, c) => sum + c.awarded, 0)),
    confidence: 0,
    needsReview: true,
    feedbackVi:
      'Đây là ĐIỂM MẪU của chế độ thử, không phải điểm do AI chấm. ' +
      'Gắn khóa GROQ_API_KEY hoặc OPENAI_API_KEY rồi bấm "Chấm lại câu này" để chấm thật.',
    criteria,
    modelLabel: 'mock (chế độ thử)',
    tokensIn: 0,
    tokensOut: 0,
    latencyMs: 0,
    demo: true,
  };
}

// ---------------------------------------------------------------------------
// Điểm vào
// ---------------------------------------------------------------------------

export interface EssayGradeInput {
  question: EssayQuestionInput;
  images: VisionImage[];
  /** Transcript đã lưu từ lần chấm trước — có thì KHÔNG gọi lại vision. */
  existingTranscript?: string | null;
  confidenceThreshold?: number;
  timeoutMs?: number;
  maxRetries?: number;
}

/**
 * Chấm một câu tự luận. Ném `AiProviderError` khi không gọi được model — chỗ
 * gọi bắt lỗi và ghi câu đó là `FAILED` để học sinh bấm chấm lại, chứ không để
 * hỏng cả bài thi vì một câu (spec §2).
 */
export async function gradeEssayAnswer(input: EssayGradeInput): Promise<EssayGradeOutcome> {
  const { question, images } = input;
  const provider = resolveProvider();
  const confidenceThreshold = input.confidenceThreshold ?? 0.7;
  const maxRetries = input.maxRetries ?? 2;

  if (provider.demo) {
    return demoOutcome(question, images.length > 0, (input.existingTranscript ?? '').trim());
  }
  if (!provider.live) {
    throw new AiProviderError(
      'Chưa gắn khóa AI nên chưa chấm được câu tự luận. Thêm GROQ_API_KEY hoặc ' +
        'OPENAI_API_KEY vào biến môi trường rồi bấm "Chấm lại câu này".',
      null,
      false,
    );
  }

  let tokensIn = 0;
  let tokensOut = 0;
  let latencyMs = 0;
  let visionModel = provider.visionModel;

  // --- LƯỢT 1: chép lại bài làm ---
  let transcript = (input.existingTranscript ?? '').trim();

  if (transcript === '') {
    if (images.length === 0) {
      transcript = NO_WORK_MARKER;
    } else {
      const reply = await callAiText(
        {
          system: TRANSCRIBE_SYSTEM,
          user: `Chép lại bài làm cho câu ${question.number}. Đề bài câu này:\n${question.promptMd}`,
          images,
          maxTokens: 2000,
          timeoutMs: input.timeoutMs,
        },
        maxRetries,
      );
      transcript = reply.text;
      visionModel = reply.model;
      tokensIn += reply.tokensIn;
      tokensOut += reply.tokensOut;
      latencyMs += reply.latencyMs;
    }
  }

  // Ảnh trống thì KHÔNG gọi lượt 2: vừa tốn tiền vừa dễ khiến model bịa ra bài
  // làm không tồn tại (spec §11).
  if (transcript.includes(NO_WORK_MARKER)) {
    return {
      transcriptMd: transcript,
      awarded: 0,
      confidence: 1,
      needsReview: false,
      feedbackVi: 'Câu này chưa có bài làm nên chưa có điểm. Lần sau em nhớ chụp ảnh bài làm nhé.',
      criteria: question.rubric.map((c) => ({
        code: c.code,
        points: c.points,
        awarded: 0,
        evidence: 'không tìm thấy',
        reason: 'Không có bài làm.',
      })),
      modelLabel: `${provider.label} · ${visionModel}`,
      tokensIn,
      tokensOut,
      latencyMs,
      demo: false,
    };
  }

  // --- LƯỢT 2: chấm theo barem ---
  const userPrompt = buildGradeUser(question, transcript);
  let parsed: z.infer<typeof gradeReplySchema> | null = null;
  let gradeModel = provider.gradeModel;

  for (let attempt = 0; attempt < 2 && parsed === null; attempt += 1) {
    const reply = await callAiJson(
      {
        system: GRADE_SYSTEM,
        user:
          attempt === 0
            ? userPrompt
            : `${userPrompt}\n\nLƯU Ý: lần trước bạn trả về sai cấu trúc. Chỉ trả về JSON với đúng các khóa: criteria[{code, awarded, evidence, reason}], confidence, needs_human_review, feedback_vi.`,
        maxTokens: 2000,
        timeoutMs: input.timeoutMs,
      },
      GRADE_JSON_SHAPE,
      maxRetries,
    );

    gradeModel = reply.model;
    tokensIn += reply.tokensIn;
    tokensOut += reply.tokensOut;
    latencyMs += reply.latencyMs;

    const candidate = gradeReplySchema.safeParse(extractJson(reply.text));
    if (candidate.success) parsed = candidate.data;
  }

  if (parsed === null) {
    throw new AiProviderError('AI trả về kết quả chấm sai cấu trúc sau 2 lần thử.', null, false);
  }

  const reconciled = reconcile(question, transcript, parsed, confidenceThreshold);

  return {
    transcriptMd: transcript,
    ...reconciled,
    modelLabel:
      visionModel === gradeModel
        ? `${provider.label} · ${gradeModel}`
        : `${provider.label} · ${visionModel} + ${gradeModel}`,
    tokensIn,
    tokensOut,
    latencyMs,
    demo: false,
  };
}
