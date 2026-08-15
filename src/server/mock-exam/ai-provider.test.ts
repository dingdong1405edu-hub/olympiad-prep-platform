/**
 * Test bộ nối AI bằng một máy chủ HTTP giả.
 *
 * VÌ SAO CẦN: đây là đoạn mã sẽ chạy lần đầu tiên vào đúng lúc chủ hệ thống cắm
 * khóa Groq/OpenAI thật vào — không ai muốn phát hiện gửi sai định dạng ảnh ở
 * thời điểm đó. Máy chủ giả dựng lại đúng hình dạng phản hồi của hai nhà cung
 * cấp, và test soi lại NỘI DUNG REQUEST mà bộ nối gửi đi.
 */
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { AiProviderError, callAiJson, callAiText, extractJson, resolveProvider } from './ai-provider';
import { gradeEssayAnswer, NO_WORK_MARKER } from './essay-grade';

interface Recorded {
  path: string;
  headers: Record<string, string | string[] | undefined>;
  body: Record<string, unknown>;
}

let server: Server;
let baseUrl = '';
const received: Recorded[] = [];
/** Hàng đợi phản hồi: mỗi lời gọi lấy một mục; hết thì dùng mục cuối. */
let replies: { status: number; body: unknown }[] = [];

function readBody(request: IncomingMessage): Promise<string> {
  return new Promise((resolve) => {
    let data = '';
    request.on('data', (chunk) => {
      data += String(chunk);
    });
    request.on('end', () => resolve(data));
  });
}

beforeAll(async () => {
  server = createServer((request: IncomingMessage, response: ServerResponse) => {
    void readBody(request).then((raw) => {
      received.push({
        path: request.url ?? '',
        headers: request.headers,
        body: raw === '' ? {} : (JSON.parse(raw) as Record<string, unknown>),
      });
      const reply = replies.length > 1 ? replies.shift()! : (replies[0] ?? { status: 200, body: {} });
      response.writeHead(reply.status, { 'Content-Type': 'application/json' });
      response.end(JSON.stringify(reply.body));
    });
  });

  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  const port = typeof address === 'object' && address ? address.port : 0;
  baseUrl = `http://127.0.0.1:${port}/v1`;
});

afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

afterEach(() => {
  received.length = 0;
  replies = [];
  delete process.env.MOCK_AI_PROVIDER;
  delete process.env.OPENAI_API_KEY;
  delete process.env.OPENAI_BASE_URL;
  delete process.env.GROQ_API_KEY;
  delete process.env.ANTHROPIC_API_KEY;
  delete process.env.ANTHROPIC_BASE_URL;
  delete process.env.OPENAI_MODEL_VISION;
});

function useOpenAi(): void {
  process.env.MOCK_AI_PROVIDER = 'openai';
  process.env.OPENAI_API_KEY = 'test-key';
  process.env.OPENAI_BASE_URL = baseUrl;
}

function useAnthropic(): void {
  process.env.MOCK_AI_PROVIDER = 'anthropic';
  process.env.ANTHROPIC_API_KEY = 'test-key';
  process.env.ANTHROPIC_BASE_URL = baseUrl;
}

function openAiReply(content: string, model = 'gpt-4o') {
  return {
    status: 200,
    body: {
      model,
      choices: [{ message: { content } }],
      usage: { prompt_tokens: 11, completion_tokens: 7 },
    },
  };
}

// ---------------------------------------------------------------------------

describe('resolveProvider', () => {
  it('không có khóa nào → không gọi thật, cũng không phải chế độ thử', () => {
    const provider = resolveProvider();
    expect(provider.live).toBe(false);
    expect(provider.demo).toBe(false);
  });

  it('tự dò: có khóa Groq thì dùng Groq', () => {
    process.env.GROQ_API_KEY = 'gsk_test';
    const provider = resolveProvider();
    expect(provider.provider).toBe('groq');
    expect(provider.live).toBe(true);
  });

  it('chỉ đích danh mà thiếu khóa thì KHÔNG lặng lẽ rơi sang nhà khác', () => {
    process.env.MOCK_AI_PROVIDER = 'openai';
    process.env.GROQ_API_KEY = 'gsk_test';
    const provider = resolveProvider();
    expect(provider.provider).toBe('openai');
    expect(provider.live).toBe(false);
  });

  it('MOCK_AI_PROVIDER=mock là chế độ thử có chủ đích', () => {
    process.env.MOCK_AI_PROVIDER = 'mock';
    expect(resolveProvider().demo).toBe(true);
  });

  it('tên model đổi được bằng biến môi trường', () => {
    process.env.MOCK_AI_PROVIDER = 'openai';
    process.env.OPENAI_API_KEY = 'test';
    process.env.OPENAI_MODEL_VISION = 'model-moi-nam-sau';
    expect(resolveProvider().visionModel).toBe('model-moi-nam-sau');
  });
});

describe('phương ngữ OpenAI (dùng chung cho Groq)', () => {
  it('gửi ảnh dưới dạng data URL kèm khóa Bearer', async () => {
    useOpenAi();
    replies = [openAiReply('2^6 = 64')];

    const reply = await callAiText({
      system: 'chép lại',
      user: 'câu 11',
      images: [{ mediaType: 'image/jpeg', base64: 'QUJD' }],
    });

    expect(reply.text).toBe('2^6 = 64');
    expect(reply.tokensIn).toBe(11);

    const call = received[0]!;
    expect(call.path).toBe('/v1/chat/completions');
    expect(call.headers.authorization).toBe('Bearer test-key');
    expect(call.body.temperature).toBe(0);

    const messages = call.body.messages as { role: string; content: unknown }[];
    expect(messages[0]).toMatchObject({ role: 'system', content: 'chép lại' });
    const parts = messages[1]!.content as Record<string, unknown>[];
    expect(parts[0]).toMatchObject({ type: 'text', text: 'câu 11' });
    expect(parts[1]).toMatchObject({
      type: 'image_url',
      image_url: { url: 'data:image/jpeg;base64,QUJD' },
    });
  });

  it('bật chế độ JSON khi cần cấu trúc', async () => {
    useOpenAi();
    replies = [openAiReply('{"criteria":[],"confidence":1,"needs_human_review":false,"feedback_vi":"ok"}')];

    await callAiJson({ system: 's', user: 'u' }, { name: 'g', description: 'd', schema: {} });
    expect(received[0]!.body.response_format).toEqual({ type: 'json_object' });
  });

  it('model chê max_tokens thì đổi sang max_completion_tokens rồi gọi lại', async () => {
    useOpenAi();
    replies = [
      { status: 400, body: { error: { message: "Unsupported parameter: 'max_tokens'. Use 'max_completion_tokens' instead." } } },
      openAiReply('xong'),
    ];

    const reply = await callAiText({ system: 's', user: 'u' });
    expect(reply.text).toBe('xong');
    expect(received).toHaveLength(2);
    expect(received[0]!.body).toHaveProperty('max_tokens');
    expect(received[1]!.body).not.toHaveProperty('max_tokens');
    expect(received[1]!.body).toHaveProperty('max_completion_tokens');
  });

  it('model chỉ nhận temperature mặc định thì bỏ tham số đó rồi gọi lại', async () => {
    useOpenAi();
    replies = [
      { status: 400, body: { error: { message: "Unsupported value: 'temperature' does not support 0" } } },
      openAiReply('xong'),
    ];

    await callAiText({ system: 's', user: 'u' });
    expect(received).toHaveLength(2);
    expect(received[1]!.body).not.toHaveProperty('temperature');
  });

  it('lỗi 401 không thử lại và nói rõ mã lỗi', async () => {
    useOpenAi();
    replies = [{ status: 401, body: { error: { message: 'Invalid API key' } } }];

    await expect(callAiText({ system: 's', user: 'u' }, 2)).rejects.toThrow(/401/);
    expect(received).toHaveLength(1);
  });

  it('chưa gắn khóa thì không bắn request nào ra ngoài', async () => {
    await expect(callAiText({ system: 's', user: 'u' })).rejects.toBeInstanceOf(AiProviderError);
    expect(received).toHaveLength(0);
  });
});

describe('phương ngữ Anthropic', () => {
  it('gửi ảnh dạng base64 và ép trả JSON bằng tool use', async () => {
    useAnthropic();
    replies = [
      {
        status: 200,
        body: {
          model: 'claude-sonnet-5',
          content: [{ type: 'tool_use', name: 'submit_grade', input: { confidence: 0.9 } }],
          usage: { input_tokens: 5, output_tokens: 3 },
        },
      },
    ];

    const reply = await callAiJson(
      { system: 's', user: 'u', images: [{ mediaType: 'image/png', base64: 'WFla' }] },
      { name: 'submit_grade', description: 'd', schema: { type: 'object' } },
    );

    expect(JSON.parse(reply.text)).toEqual({ confidence: 0.9 });

    const call = received[0]!;
    expect(call.path).toBe('/v1/messages');
    expect(call.headers['x-api-key']).toBe('test-key');
    expect(call.headers['anthropic-version']).toBe('2023-06-01');
    expect(call.body.tool_choice).toEqual({ type: 'tool', name: 'submit_grade' });

    const content = (call.body.messages as { content: Record<string, unknown>[] }[])[0]!.content;
    expect(content[0]).toMatchObject({
      type: 'image',
      source: { type: 'base64', media_type: 'image/png', data: 'WFla' },
    });
  });
});

describe('extractJson', () => {
  it('bóc được JSON kể cả khi model bọc trong ```json hoặc thêm lời dẫn', () => {
    expect(extractJson('{"a":1}')).toEqual({ a: 1 });
    expect(extractJson('```json\n{"a":1}\n```')).toEqual({ a: 1 });
    expect(extractJson('Kết quả chấm:\n{"a":1}\nHết.')).toEqual({ a: 1 });
    expect(extractJson('không phải json')).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Toàn bộ pipeline chấm tự luận
// ---------------------------------------------------------------------------

const QUESTION = {
  number: 11,
  maxPoints: 7,
  promptMd: 'Tập {1..6} có bao nhiêu tập con chứa ít nhất một số lẻ?',
  solutionMd: '2^6 - 2^3 = 56',
  rubric: [
    { code: 'c1', points: 2, description: 'Tính đúng 2^6 = 64' },
    { code: 'c2', points: 3, description: 'Dùng phần bù: 2^3 = 8' },
    { code: 'c3', points: 2, description: 'Kết luận 64 - 8 = 56' },
  ],
};

describe('gradeEssayAnswer — hai lượt gọi và hậu kiểm', () => {
  it('đọc ảnh rồi chấm theo barem, tổng điểm do code cộng lại', async () => {
    useOpenAi();
    replies = [
      openAiReply('2^6 = 64\nsố tập con không có số lẻ là 8\n64 - 8 = 56'),
      openAiReply(
        JSON.stringify({
          criteria: [
            { code: 'c1', awarded: 2, evidence: '2^6 = 64', reason: 'đúng' },
            { code: 'c2', awarded: 3, evidence: '8', reason: 'đúng' },
            { code: 'c3', awarded: 2, evidence: '56', reason: 'đúng' },
          ],
          confidence: 0.95,
          needs_human_review: false,
          feedback_vi: 'Em làm rất tốt.',
        }),
      ),
    ];

    const outcome = await gradeEssayAnswer({
      question: QUESTION,
      images: [{ mediaType: 'image/jpeg', base64: 'QUJD' }],
    });

    expect(received).toHaveLength(2);
    expect(outcome.awarded).toBe(7);
    expect(outcome.needsReview).toBe(false);
    expect(outcome.transcriptMd).toContain('64 - 8 = 56');
    // Lượt chấm phải nhận được barem và transcript, không nhận ảnh.
    const gradePrompt = String(
      ((received[1]!.body.messages as { content: unknown }[])[1]!.content as { text: string }[])[0]!
        .text,
    );
    expect(gradePrompt).toContain('[c1] 2 điểm');
    expect(gradePrompt).toContain('64 - 8 = 56');
  });

  it('cắt điểm vượt trần, bỏ mã tiêu chí lạ, bù tiêu chí bị bỏ quên', async () => {
    useOpenAi();
    replies = [
      openAiReply('bài làm có ghi 2^6 = 64'),
      openAiReply(
        JSON.stringify({
          criteria: [
            { code: 'c1', awarded: 99, evidence: '64', reason: 'model cho vượt trần' },
            { code: 'cX', awarded: 5, evidence: '', reason: 'mã không có trong barem' },
          ],
          confidence: 0.9,
          needs_human_review: false,
          feedback_vi: '',
        }),
      ),
    ];

    const outcome = await gradeEssayAnswer({
      question: QUESTION,
      images: [{ mediaType: 'image/jpeg', base64: 'QUJD' }],
    });

    expect(outcome.criteria).toHaveLength(3);
    expect(outcome.criteria.find((c) => c.code === 'c1')!.awarded).toBe(2);
    expect(outcome.criteria.some((c) => c.code === 'cX')).toBe(false);
    expect(outcome.awarded).toBe(2);
    // Thiếu tiêu chí là dấu hiệu model chấm hụt → nhờ người xem lại.
    expect(outcome.needsReview).toBe(true);
    expect(outcome.feedbackVi).not.toBe('');
  });

  it('ảnh trống: cho 0 và KHÔNG gọi lượt chấm thứ hai', async () => {
    useOpenAi();
    replies = [openAiReply(NO_WORK_MARKER)];

    const outcome = await gradeEssayAnswer({
      question: QUESTION,
      images: [{ mediaType: 'image/jpeg', base64: 'QUJD' }],
    });

    expect(received).toHaveLength(1);
    expect(outcome.awarded).toBe(0);
    expect(outcome.confidence).toBe(1);
  });

  it('có transcript cũ thì chấm lại KHÔNG gọi lượt đọc ảnh', async () => {
    useOpenAi();
    replies = [
      openAiReply(
        JSON.stringify({
          criteria: [{ code: 'c1', awarded: 2, evidence: '64', reason: 'ok' }],
          confidence: 0.8,
          needs_human_review: false,
          feedback_vi: 'Tốt',
        }),
      ),
    ];

    await gradeEssayAnswer({
      question: QUESTION,
      images: [{ mediaType: 'image/jpeg', base64: 'QUJD' }],
      existingTranscript: '2^6 = 64',
    });

    expect(received).toHaveLength(1);
    expect(received[0]!.body.response_format).toEqual({ type: 'json_object' });
  });

  it('transcript có chỗ không đọc được → tự gắn cờ nhờ người xem lại', async () => {
    useOpenAi();
    replies = [
      openAiReply(
        JSON.stringify({
          criteria: QUESTION.rubric.map((c) => ({
            code: c.code,
            awarded: c.points,
            evidence: 'x',
            reason: 'ok',
          })),
          confidence: 0.99,
          needs_human_review: false,
          feedback_vi: 'Tốt',
        }),
      ),
    ];

    const outcome = await gradeEssayAnswer({
      question: QUESTION,
      images: [],
      existingTranscript: '2^6 = 64 rồi [không đọc được] nên ra 56',
    });

    expect(outcome.awarded).toBe(7);
    expect(outcome.needsReview).toBe(true);
  });

  it('model trả sai cấu trúc hai lần thì báo hỏng, không bịa điểm', async () => {
    useOpenAi();
    replies = [openAiReply('bài làm'), openAiReply('xin lỗi tôi không chấm được')];

    await expect(
      gradeEssayAnswer({
        question: QUESTION,
        images: [{ mediaType: 'image/jpeg', base64: 'QUJD' }],
      }),
    ).rejects.toThrow(/sai cấu trúc/);
  });

  it('chế độ thử: có điểm mẫu nhưng mọi chữ đều nói rõ là điểm mẫu', async () => {
    process.env.MOCK_AI_PROVIDER = 'mock';

    const outcome = await gradeEssayAnswer({
      question: QUESTION,
      images: [{ mediaType: 'image/jpeg', base64: 'QUJD' }],
    });

    expect(received).toHaveLength(0);
    expect(outcome.demo).toBe(true);
    expect(outcome.needsReview).toBe(true);
    expect(outcome.feedbackVi).toContain('ĐIỂM MẪU');
  });

  it('chưa gắn khóa: ném lỗi có hướng dẫn, tuyệt đối không cho điểm', async () => {
    await expect(
      gradeEssayAnswer({ question: QUESTION, images: [{ mediaType: 'image/jpeg', base64: 'QUJD' }] }),
    ).rejects.toThrow(/GROQ_API_KEY|OPENAI_API_KEY/);
  });
});
