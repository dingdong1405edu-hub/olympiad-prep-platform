/**
 * ADAPTER GỌI LLM (specs §8.3 — bước 3 "Gọi LLM qua adapter, model = config").
 *
 * Lớp này KHÔNG biết gì về nghiệp vụ: nhận system + prompt đã dựng sẵn và trả
 * về văn bản thô kèm số liệu để service ghi vào `AiGeneration`.
 *
 * Mọi lỗi (thiếu API key, quá hạn, 5xx…) được NÉM RA NGOÀI để `service.ts` bắt
 * và chuyển sang fallback template — hệ thống phải chạy đủ khi ANTHROPIC_API_KEY
 * rỗng (specs §8.3 "Có fallback không-AI").
 */
import Anthropic, { APIError, APIUserAbortError } from '@anthropic-ai/sdk';
import { getConfigGroup } from '@/lib/config';

export interface LlmResult {
  text: string;
  tokensIn: number;
  tokensOut: number;
  latencyMs: number;
  model: string;
}

export interface LlmCallInput {
  system: string;
  prompt: string;
  /** Bỏ trống = lấy `config.ai.model`. */
  model?: string;
  maxTokens?: number;
  timeoutMs?: number;
}

/** Số lần thử LẠI khi gặp lỗi tạm thời (429 / 5xx / rớt mạng). Tham số kỹ thuật. */
const TRANSIENT_RETRIES = 1;
/** Khoảng chờ trước khi thử lại — tránh dồn request vào lúc nhà cung cấp quá tải. */
const RETRY_DELAY_MS = 800;

let cachedClient: { apiKey: string; client: Anthropic } | null = null;

function readApiKey(): string {
  return (process.env.ANTHROPIC_API_KEY ?? '').trim();
}

/** Có đủ điều kiện gọi LLM hay không. Service dùng để quyết định fallback sớm. */
export function isAiConfigured(): boolean {
  return readApiKey().length > 0;
}

function getClient(): Anthropic {
  const apiKey = readApiKey();
  if (apiKey === '') {
    throw new Error('Chưa cấu hình ANTHROPIC_API_KEY nên không gọi được LLM.');
  }
  if (cachedClient && cachedClient.apiKey === apiKey) return cachedClient.client;

  // maxRetries = 0: adapter tự quản lý retry để đo đúng latency và không nhân
  // đôi thời gian chờ khi đã có timeout riêng.
  const client = new Anthropic({ apiKey, maxRetries: 0 });
  cachedClient = { apiKey, client };
  return client;
}

/** Lỗi tạm thời mới đáng thử lại; hết giờ hoặc sai tham số thì thử lại vô ích. */
function isTransient(error: unknown): boolean {
  if (error instanceof APIUserAbortError) return false;
  if (error instanceof APIError) {
    const status = error.status ?? 0;
    return status === 408 || status === 409 || status === 429 || status >= 500;
  }
  // Lỗi mạng/DNS không có status → coi là tạm thời.
  return true;
}

function extractText(message: Anthropic.Message): string {
  const parts: string[] = [];
  for (const block of message.content) {
    if (block.type === 'text' && block.text.trim() !== '') parts.push(block.text);
  }
  return parts.join('\n').trim();
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function toReadableError(error: unknown, timeoutMs: number): Error {
  if (error instanceof APIUserAbortError) {
    return new Error(`LLM không phản hồi trong ${timeoutMs}ms.`);
  }
  if (error instanceof APIError) {
    return new Error(`LLM trả lỗi ${error.status ?? 'không rõ'}: ${error.message}`);
  }
  if (error instanceof Error) return error;
  return new Error('Lỗi không xác định khi gọi LLM.');
}

export async function callLlm(input: LlmCallInput): Promise<LlmResult> {
  const ai = await getConfigGroup('ai');
  const model = input.model?.trim() ? input.model.trim() : ai.model;
  const maxTokens =
    input.maxTokens && input.maxTokens > 0 ? Math.floor(input.maxTokens) : ai.maxOutputTokens;
  const timeoutMs = input.timeoutMs && input.timeoutMs > 0 ? Math.floor(input.timeoutMs) : ai.timeoutMs;

  const client = getClient();
  const startedAt = Date.now();
  let lastError: unknown = new Error('Chưa thực hiện được lời gọi LLM.');

  for (let attempt = 0; attempt <= TRANSIENT_RETRIES; attempt += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const message = await client.messages.create(
        {
          model,
          max_tokens: maxTokens,
          system: input.system,
          messages: [{ role: 'user', content: input.prompt }],
        },
        { signal: controller.signal, timeout: timeoutMs },
      );

      if (message.stop_reason === 'refusal') {
        throw new Error('LLM từ chối trả lời nội dung này.');
      }
      const text = extractText(message);
      if (text === '') throw new Error('LLM trả về nội dung rỗng.');

      return {
        text,
        tokensIn: message.usage.input_tokens,
        tokensOut: message.usage.output_tokens,
        latencyMs: Date.now() - startedAt,
        model: message.model,
      };
    } catch (error) {
      lastError = error;
      if (attempt >= TRANSIENT_RETRIES || !isTransient(error)) break;
      await delay(RETRY_DELAY_MS);
    } finally {
      clearTimeout(timer);
    }
  }

  throw toReadableError(lastError, timeoutMs);
}
