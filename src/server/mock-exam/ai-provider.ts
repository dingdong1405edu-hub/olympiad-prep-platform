/**
 * BỘ NỐI AI CHO CHẤM TỰ LUẬN — một cửa duy nhất, ba nhà cung cấp + chế độ thử.
 *
 * VÌ SAO KHÔNG DÙNG LẠI `src/server/ai/client.ts`: adapter đó chỉ gửi được CHỮ
 * và khóa cứng vào Anthropic. Chấm bài chụp tay cần gửi ẢNH, và chủ hệ thống
 * muốn cắm khóa Groq hoặc OpenAI tùy lúc. Nên file này nói được cả hai phương
 * ngữ HTTP:
 *   - "openai-compatible": OpenAI, Groq, và mọi cổng trung gian tương thích.
 *   - "anthropic":         Claude (tool use để ép ra JSON đúng cấu trúc).
 *
 * KHÔNG cài thêm SDK nào: cả hai đều chỉ là một lời gọi `fetch` có kèm ảnh
 * base64. Thêm nhà cung cấp mới = thêm một dòng vào `PROVIDERS`.
 *
 * CHƯA CÓ KHÓA NÀO thì rơi về `mock`: hệ thống vẫn chạy trọn vẹn từ đầu đến
 * cuối để demo và để kiểm thử giao diện, nhưng điểm tự luận được ghi rõ là
 * ĐIỂM MẪU ở mọi chỗ nó xuất hiện — không bao giờ để ai nhầm là AI đã chấm thật.
 */

export type MockAiProvider = 'groq' | 'openai' | 'anthropic' | 'mock';

type Dialect = 'openai' | 'anthropic';

interface ProviderSpec {
  dialect: Dialect;
  label: string;
  baseUrlEnv: string;
  defaultBaseUrl: string;
  apiKeyEnv: string;
  visionModelEnv: string;
  gradeModelEnv: string;
  defaultVisionModel: string;
  defaultGradeModel: string;
}

/**
 * Tên model để ở đây chỉ là MẶC ĐỊNH KHỞI ĐỘNG, luôn ghi đè được bằng biến môi
 * trường. Groq và OpenAI đổi tên model liên tục — khi tên mặc định hết hiệu
 * lực, sửa `.env` là xong, không phải deploy lại mã nguồn.
 */
const PROVIDERS: Record<Exclude<MockAiProvider, 'mock'>, ProviderSpec> = {
  groq: {
    dialect: 'openai',
    label: 'Groq',
    baseUrlEnv: 'GROQ_BASE_URL',
    defaultBaseUrl: 'https://api.groq.com/openai/v1',
    apiKeyEnv: 'GROQ_API_KEY',
    visionModelEnv: 'GROQ_MODEL_VISION',
    gradeModelEnv: 'GROQ_MODEL_GRADE',
    defaultVisionModel: 'meta-llama/llama-4-scout-17b-16e-instruct',
    defaultGradeModel: 'moonshotai/kimi-k2-instruct',
  },
  openai: {
    dialect: 'openai',
    label: 'OpenAI',
    baseUrlEnv: 'OPENAI_BASE_URL',
    defaultBaseUrl: 'https://api.openai.com/v1',
    apiKeyEnv: 'OPENAI_API_KEY',
    visionModelEnv: 'OPENAI_MODEL_VISION',
    gradeModelEnv: 'OPENAI_MODEL_GRADE',
    defaultVisionModel: 'gpt-4o',
    defaultGradeModel: 'gpt-4o',
  },
  anthropic: {
    dialect: 'anthropic',
    label: 'Anthropic',
    baseUrlEnv: 'ANTHROPIC_BASE_URL',
    defaultBaseUrl: 'https://api.anthropic.com/v1',
    apiKeyEnv: 'ANTHROPIC_API_KEY',
    visionModelEnv: 'ANTHROPIC_MODEL_VISION',
    gradeModelEnv: 'ANTHROPIC_MODEL_GRADE',
    defaultVisionModel: 'claude-sonnet-5',
    defaultGradeModel: 'claude-sonnet-5',
  },
};

/** Thứ tự dò khi `MOCK_AI_PROVIDER` để trống: khóa nào có thì dùng khóa đó. */
const AUTO_ORDER: Exclude<MockAiProvider, 'mock'>[] = ['groq', 'openai', 'anthropic'];

export interface ResolvedProvider {
  provider: MockAiProvider;
  label: string;
  visionModel: string;
  gradeModel: string;
  /** true = gọi được model thật. */
  live: boolean;
  /**
   * true = CỐ Ý bật chế độ thử bằng `MOCK_AI_PROVIDER=mock`, chấp nhận điểm giả
   * để xem trọn luồng. Chỉ thiếu khóa thì KHÔNG bật cờ này: bài sẽ báo "chưa
   * chấm được" chứ không bịa ra điểm.
   */
  demo: boolean;
}

function env(name: string): string {
  return (process.env[name] ?? '').trim();
}

function describe(name: Exclude<MockAiProvider, 'mock'>): ResolvedProvider {
  const spec = PROVIDERS[name];
  return {
    provider: name,
    label: spec.label,
    visionModel: env(spec.visionModelEnv) || spec.defaultVisionModel,
    gradeModel: env(spec.gradeModelEnv) || spec.defaultGradeModel,
    live: true,
    demo: false,
  };
}

/** Cố ý bật chế độ thử. */
const DEMO_PROVIDER: ResolvedProvider = {
  provider: 'mock',
  label: 'Chế độ thử — điểm tự luận là điểm mẫu',
  visionModel: 'mock',
  gradeModel: 'mock',
  live: false,
  demo: true,
};

/** Không có khóa nào. Câu tự luận sẽ báo "chưa chấm được", KHÔNG bịa điểm. */
const NO_KEY_PROVIDER: ResolvedProvider = {
  provider: 'mock',
  label: 'Chưa gắn khóa AI',
  visionModel: '—',
  gradeModel: '—',
  live: false,
  demo: false,
};

/**
 * Nhà cung cấp đang có hiệu lực.
 *
 * `MOCK_AI_PROVIDER` chỉ đích danh thì theo đúng chỉ định — kể cả khi thiếu
 * khóa, vì im lặng rơi sang nhà khác là kiểu lỗi khiến người ta tưởng đã chấm
 * bằng model này mà thật ra là model khác (đúng bài học từ cổng thanh toán).
 */
export function resolveProvider(): ResolvedProvider {
  const requested = env('MOCK_AI_PROVIDER').toLowerCase();

  if (requested === 'mock' || requested === 'demo') return DEMO_PROVIDER;
  if (requested === 'groq' || requested === 'openai' || requested === 'anthropic') {
    return env(PROVIDERS[requested].apiKeyEnv) === ''
      ? { ...describe(requested), live: false }
      : describe(requested);
  }

  for (const name of AUTO_ORDER) {
    if (env(PROVIDERS[name].apiKeyEnv) !== '') return describe(name);
  }
  return NO_KEY_PROVIDER;
}

/** Nhà cung cấp đã sẵn sàng gọi thật chưa. */
export function isMockAiLive(): boolean {
  return resolveProvider().live;
}

// ---------------------------------------------------------------------------
// Kiểu dữ liệu chung
// ---------------------------------------------------------------------------

export interface VisionImage {
  /** 'image/jpeg' | 'image/png' | 'image/webp' */
  mediaType: string;
  base64: string;
}

export interface LlmCall {
  system: string;
  user: string;
  images?: VisionImage[];
  maxTokens?: number;
  timeoutMs?: number;
}

export interface LlmReply {
  text: string;
  model: string;
  tokensIn: number;
  tokensOut: number;
  latencyMs: number;
}

/** Mô tả JSON mà model bắt buộc phải trả về (spec §8.2 — structured output). */
export interface JsonShape {
  name: string;
  description: string;
  schema: Record<string, unknown>;
}

export class AiProviderError extends Error {
  constructor(
    message: string,
    public readonly status: number | null,
    public readonly retryable: boolean,
  ) {
    super(message);
    this.name = 'AiProviderError';
  }
}

const DEFAULT_TIMEOUT_MS = 90_000;
const DEFAULT_MAX_TOKENS = 2048;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

async function postJson(
  url: string,
  headers: Record<string, string>,
  body: unknown,
  timeoutMs: number,
): Promise<Record<string, unknown>> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...headers },
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    const text = await response.text();
    if (!response.ok) {
      throw new AiProviderError(
        `AI trả lỗi ${response.status}: ${text.slice(0, 500)}`,
        response.status,
        response.status === 408 || response.status === 429 || response.status >= 500,
      );
    }
    try {
      return JSON.parse(text) as Record<string, unknown>;
    } catch {
      throw new AiProviderError('AI trả về nội dung không phải JSON.', null, true);
    }
  } catch (error) {
    if (error instanceof AiProviderError) throw error;
    if (error instanceof Error && error.name === 'AbortError') {
      throw new AiProviderError(`AI không phản hồi trong ${timeoutMs}ms.`, null, false);
    }
    throw new AiProviderError(
      error instanceof Error ? error.message : 'Lỗi mạng khi gọi AI.',
      null,
      true,
    );
  } finally {
    clearTimeout(timer);
  }
}

// ---------------------------------------------------------------------------
// Phương ngữ OpenAI (dùng chung cho OpenAI, Groq và cổng tương thích)
// ---------------------------------------------------------------------------

/**
 * Các model đời mới đổi tên/bỏ bớt tham số (`max_tokens` → `max_completion_tokens`,
 * `temperature` chỉ nhận giá trị mặc định, không nhận `response_format`). Thay
 * vì bắt người dùng đoán model nào chịu tham số nào, cứ gửi bản đầy đủ rồi
 * nghe lỗi 400 mà bỏ đúng tham số bị chê — thử lại tối đa ba lần.
 */
function adjustOpenAiBody(
  body: Record<string, unknown>,
  message: string,
): Record<string, unknown> | null {
  const next = { ...body };

  if (/max_completion_tokens/i.test(message) && 'max_tokens' in next) {
    next.max_completion_tokens = next.max_tokens;
    delete next.max_tokens;
    return next;
  }
  if (/temperature/i.test(message) && 'temperature' in next) {
    delete next.temperature;
    return next;
  }
  if (/response_format|json_object|json_schema/i.test(message) && 'response_format' in next) {
    delete next.response_format;
    return next;
  }
  return null;
}

async function callOpenAiCompatible(
  spec: ProviderSpec,
  model: string,
  call: LlmCall,
  json: JsonShape | null,
): Promise<LlmReply> {
  const apiKey = env(spec.apiKeyEnv);
  if (apiKey === '') {
    throw new AiProviderError(`Chưa cấu hình ${spec.apiKeyEnv}.`, null, false);
  }

  const baseUrl = (env(spec.baseUrlEnv) || spec.defaultBaseUrl).replace(/\/+$/, '');
  const timeoutMs = call.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  const content: Record<string, unknown>[] = [{ type: 'text', text: call.user }];
  for (const image of call.images ?? []) {
    content.push({
      type: 'image_url',
      image_url: { url: `data:${image.mediaType};base64,${image.base64}` },
    });
  }

  let body: Record<string, unknown> = {
    model,
    temperature: 0,
    max_tokens: call.maxTokens ?? DEFAULT_MAX_TOKENS,
    messages: [
      { role: 'system', content: call.system },
      { role: 'user', content },
    ],
    ...(json ? { response_format: { type: 'json_object' } } : {}),
  };

  const startedAt = Date.now();
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const payload = await postJson(
        `${baseUrl}/chat/completions`,
        { Authorization: `Bearer ${apiKey}` },
        body,
        timeoutMs,
      );

      const choices = payload.choices as { message?: { content?: unknown } }[] | undefined;
      const raw = choices?.[0]?.message?.content;
      const text =
        typeof raw === 'string'
          ? raw
          : Array.isArray(raw)
            ? raw
                .map((part) =>
                  typeof part === 'object' && part !== null && 'text' in part
                    ? String((part as { text: unknown }).text)
                    : '',
                )
                .join('')
            : '';

      if (text.trim() === '') throw new AiProviderError('AI trả về nội dung rỗng.', null, true);

      const usage = (payload.usage ?? {}) as Record<string, unknown>;
      return {
        text: text.trim(),
        model: typeof payload.model === 'string' ? payload.model : model,
        tokensIn: Number(usage.prompt_tokens ?? 0),
        tokensOut: Number(usage.completion_tokens ?? 0),
        latencyMs: Date.now() - startedAt,
      };
    } catch (error) {
      if (!(error instanceof AiProviderError) || error.status !== 400) throw error;
      const adjusted = adjustOpenAiBody(body, error.message);
      if (!adjusted) throw error;
      body = adjusted;
    }
  }

  throw new AiProviderError('Không thỏa được tham số mà model chấp nhận.', 400, false);
}

// ---------------------------------------------------------------------------
// Phương ngữ Anthropic
// ---------------------------------------------------------------------------

async function callAnthropic(
  spec: ProviderSpec,
  model: string,
  call: LlmCall,
  json: JsonShape | null,
): Promise<LlmReply> {
  const apiKey = env(spec.apiKeyEnv);
  if (apiKey === '') {
    throw new AiProviderError(`Chưa cấu hình ${spec.apiKeyEnv}.`, null, false);
  }

  const baseUrl = (env(spec.baseUrlEnv) || spec.defaultBaseUrl).replace(/\/+$/, '');
  const timeoutMs = call.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  const content: Record<string, unknown>[] = [];
  for (const image of call.images ?? []) {
    content.push({
      type: 'image',
      source: { type: 'base64', media_type: image.mediaType, data: image.base64 },
    });
  }
  content.push({ type: 'text', text: call.user });

  const body: Record<string, unknown> = {
    model,
    max_tokens: call.maxTokens ?? DEFAULT_MAX_TOKENS,
    temperature: 0,
    system: call.system,
    messages: [{ role: 'user', content }],
    ...(json
      ? {
          tools: [{ name: json.name, description: json.description, input_schema: json.schema }],
          tool_choice: { type: 'tool', name: json.name },
        }
      : {}),
  };

  const startedAt = Date.now();
  const payload = await postJson(
    `${baseUrl}/messages`,
    { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
    body,
    timeoutMs,
  );

  const blocks = (payload.content ?? []) as Record<string, unknown>[];
  let text = '';
  for (const block of blocks) {
    if (json && block.type === 'tool_use') {
      text = JSON.stringify(block.input ?? {});
      break;
    }
    if (block.type === 'text') text += String(block.text ?? '');
  }

  if (text.trim() === '') throw new AiProviderError('AI trả về nội dung rỗng.', null, true);

  const usage = (payload.usage ?? {}) as Record<string, unknown>;
  return {
    text: text.trim(),
    model: typeof payload.model === 'string' ? payload.model : model,
    tokensIn: Number(usage.input_tokens ?? 0),
    tokensOut: Number(usage.output_tokens ?? 0),
    latencyMs: Date.now() - startedAt,
  };
}

// ---------------------------------------------------------------------------
// Điểm vào
// ---------------------------------------------------------------------------

async function callWithRetry(
  useCase: 'vision' | 'grade',
  call: LlmCall,
  json: JsonShape | null,
  maxRetries: number,
): Promise<LlmReply> {
  const resolved = resolveProvider();
  if (!resolved.live) {
    throw new AiProviderError(
      'Chưa gắn khóa AI (GROQ_API_KEY / OPENAI_API_KEY / ANTHROPIC_API_KEY).',
      null,
      false,
    );
  }

  const spec = PROVIDERS[resolved.provider as Exclude<MockAiProvider, 'mock'>];
  const model = useCase === 'vision' ? resolved.visionModel : resolved.gradeModel;

  // Backoff 2s → 5s theo spec §11 (429 / 529 / rớt mạng).
  const delays = [2_000, 5_000];
  let lastError: unknown;

  for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
    try {
      return spec.dialect === 'anthropic'
        ? await callAnthropic(spec, model, call, json)
        : await callOpenAiCompatible(spec, model, call, json);
    } catch (error) {
      lastError = error;
      const retryable = error instanceof AiProviderError ? error.retryable : false;
      if (!retryable || attempt >= maxRetries) break;
      await sleep(delays[Math.min(attempt, delays.length - 1)]!);
    }
  }

  throw lastError instanceof Error ? lastError : new Error('Gọi AI thất bại.');
}

/** Gọi model có ảnh, nhận về văn bản thuần. */
export function callAiText(call: LlmCall, maxRetries = 2): Promise<LlmReply> {
  return callWithRetry('vision', call, null, maxRetries);
}

/** Gọi model, ép trả về JSON đúng cấu trúc `shape`. */
export function callAiJson(call: LlmCall, shape: JsonShape, maxRetries = 2): Promise<LlmReply> {
  return callWithRetry('grade', call, shape, maxRetries);
}

/**
 * Bóc JSON ra khỏi câu trả lời.
 *
 * Model nào cũng có lúc bọc JSON trong ```json … ``` hoặc thêm một câu dẫn
 * trước khi vào việc, kể cả khi đã bật chế độ JSON. Cắt theo cặp ngoặc ngoài
 * cùng là cách bền nhất mà không cần thư viện.
 */
export function extractJson(text: string): unknown {
  const withoutFence = text
    .replace(/^\s*```(?:json)?/i, '')
    .replace(/```\s*$/, '')
    .trim();

  try {
    return JSON.parse(withoutFence);
  } catch {
    const start = withoutFence.indexOf('{');
    const end = withoutFence.lastIndexOf('}');
    if (start >= 0 && end > start) {
      try {
        return JSON.parse(withoutFence.slice(start, end + 1));
      } catch {
        return null;
      }
    }
    return null;
  }
}
