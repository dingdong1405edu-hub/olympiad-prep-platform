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

/** Hai lượt gọi của pipeline chấm: đọc ảnh, rồi chấm theo barem. */
export type AiUseCase = 'vision' | 'grade';

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
    /**
     * Groq đổi danh mục model liên tục và mỗi tài khoản thấy một danh sách khác
     * nhau — hai tên mặc định cũ (`llama-4-scout`, `kimi-k2`) đã bị gỡ và trả
     * 404 trên tài khoản thật. Đây chỉ là điểm khởi đầu; xem tài khoản của mình
     * có gì bằng `GET https://api.groq.com/openai/v1/models` rồi đặt lại bằng
     * `GROQ_MODEL_VISION` / `GROQ_MODEL_GRADE`.
     *
     * Nhiều tài khoản Groq KHÔNG có model đọc ảnh nào. Khi đó để lượt đọc ảnh
     * cho nhà khác: `MOCK_AI_PROVIDER_VISION=openai`.
     */
    defaultVisionModel: 'meta-llama/llama-4-maverick-17b-128e-instruct',
    defaultGradeModel: 'llama-3.3-70b-versatile',
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
export function resolveProvider(useCase?: AiUseCase): ResolvedProvider {
  /**
   * Chọn được nhà cung cấp RIÊNG cho từng lượt gọi.
   *
   * Hai lượt đòi hai năng lực khác nhau: lượt 1 phải ĐỌC ĐƯỢC ẢNH, lượt 2 chỉ
   * cần suy luận trên văn bản. Nhiều tài khoản Groq không có model nhìn ảnh nào
   * — bắt cả hai lượt dùng chung một nhà là hoặc mất khả năng chấm ảnh, hoặc
   * phải trả giá model đắt cho cả lượt chỉ cộng điểm.
   *
   *   MOCK_AI_PROVIDER_VISION=openai   # đọc bài viết tay
   *   MOCK_AI_PROVIDER_GRADE=groq      # chấm theo barem, rẻ và nhanh
   *
   * Không đặt thì rơi về `MOCK_AI_PROVIDER` chung, rồi mới tới tự dò.
   */
  const perUseCase = useCase ? env(`MOCK_AI_PROVIDER_${useCase.toUpperCase()}`) : '';
  const requested = (perUseCase || env('MOCK_AI_PROVIDER')).toLowerCase();

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
      /**
       * Tên model sai là lỗi cấu hình phổ biến nhất của tính năng này — nhà
       * cung cấp gỡ model cũ mà không báo — nên nói thẳng phải sửa biến nào,
       * thay vì để lại một dòng 404 thô cho người đọc tự đoán.
       */
      const wrongModel =
        response.status === 404 || /model .*(does not exist|not found|decommission)/i.test(text);
      const hint = wrongModel
        ? ' — tên model không còn hiệu lực. Đặt lại bằng biến *_MODEL_VISION / *_MODEL_GRADE, ' +
          'hoặc chuyển lượt đọc ảnh sang nhà khác bằng MOCK_AI_PROVIDER_VISION.'
        : '';

      throw new AiProviderError(
        `AI trả lỗi ${response.status}: ${text.slice(0, 500)}${hint}`,
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
  // Hạ dần: json_schema → json_object → bỏ hẳn. Groq và các cổng trung gian hỗ
  // trợ tới đâu thì dừng ở đó, thay vì hỏng ngay từ lượt đầu.
  if (/response_format|json_object|json_schema/i.test(message) && 'response_format' in next) {
    const current = next.response_format as { type?: string } | undefined;
    if (current?.type === 'json_schema') {
      next.response_format = { type: 'json_object' };
      return next;
    }
    delete next.response_format;
    return next;
  }
  return null;
}

/**
 * Bỏ bớt tham số mà model Claude từ chối.
 *
 * Mỗi đời model lại rút đi một thứ: `temperature`/`top_p`/`top_k` biến mất từ
 * Opus 4.7, `thinking: {type:'disabled'}` không còn hợp lệ trên Fable 5. Vì tên
 * model nằm trong biến môi trường nên không thể khóa cứng danh sách tham số theo
 * model — cứ nghe máy chủ nói thiếu gì thì bỏ đúng thứ đó rồi thử lại.
 */
function adjustAnthropicBody(
  body: Record<string, unknown>,
  message: string,
): Record<string, unknown> | null {
  const next = { ...body };

  for (const key of ['temperature', 'top_p', 'top_k', 'thinking'] as const) {
    if (key in next && new RegExp(key, 'i').test(message)) {
      delete next[key];
      return next;
    }
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

  /**
   * Gửi HẲN lược đồ chứ không chỉ xin "một object JSON nào đó".
   *
   * `{type:'json_object'}` chỉ bắt model trả JSON hợp lệ — nó vẫn được tự đặt tên
   * khóa. Model trả `{"tieu_chi": […]}` thay vì `{"criteria": […]}` là JSON hợp lệ
   * nhưng sai hợp đồng, và hậu quả rơi đúng vào chỗ tệ nhất: bài của học sinh bị
   * ghi 0 điểm dưới danh nghĩa "AI đã chấm". Model nào chưa hỗ trợ `json_schema`
   * thì `adjustOpenAiBody` sẽ hạ dần xuống `json_object` rồi bỏ hẳn — nên phần
   * nhắc tên khóa trong prompt vẫn là chốt chặn cuối.
   */
  let body: Record<string, unknown> = {
    model,
    temperature: 0,
    max_tokens: call.maxTokens ?? DEFAULT_MAX_TOKENS,
    messages: [
      { role: 'system', content: call.system },
      { role: 'user', content },
    ],
    ...(json
      ? {
          response_format: {
            type: 'json_schema',
            json_schema: { name: json.name, schema: json.schema, strict: false },
          },
        }
      : {}),
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

  /**
   * KHÔNG gửi `temperature`.
   *
   * Các model Claude đời hiện tại (Sonnet 5, Opus 5, Fable 5, Opus 4.7/4.8) đã BỎ
   * hẳn `temperature`/`top_p`/`top_k`: gửi giá trị khác mặc định là 400, tức là
   * cắm khóa Anthropic vào thì MỌI lượt chấm đều hỏng. Trước đây file này gửi
   * `temperature: 0` để chấm cho tất định — thứ vốn dĩ chưa bao giờ được bảo đảm,
   * kể cả trên model cũ. Tính tất định bây giờ đến từ barem và bước hậu kiểm bằng
   * mã nguồn, không đến từ tham số lấy mẫu.
   */
  let body: Record<string, unknown> = {
    model,
    max_tokens: call.maxTokens ?? DEFAULT_MAX_TOKENS,
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
  let payload: Record<string, unknown> | null = null;

  // Dò tham số như phía OpenAI: tên model do người dùng đặt trong biến môi
  // trường, mà mỗi đời model lại bỏ bớt một tham số khác nhau. Thà thử lại vài
  // lượt còn hơn bắt chủ hệ thống đọc log để đoán tham số nào không được nhận.
  for (let attempt = 0; attempt < 3 && payload === null; attempt += 1) {
    try {
      payload = await postJson(
        `${baseUrl}/messages`,
        { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
        body,
        timeoutMs,
      );
    } catch (error) {
      if (!(error instanceof AiProviderError) || error.status !== 400) throw error;
      const adjusted = adjustAnthropicBody(body, error.message);
      if (!adjusted) throw error;
      body = adjusted;
    }
  }

  if (payload === null) {
    throw new AiProviderError('Không thỏa được tham số mà model Claude chấp nhận.', 400, false);
  }

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
  useCase: AiUseCase,
  call: LlmCall,
  json: JsonShape | null,
  maxRetries: number,
): Promise<LlmReply> {
  const resolved = resolveProvider(useCase);
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
