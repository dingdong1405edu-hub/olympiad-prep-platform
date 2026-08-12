/**
 * Rate limit chống brute-force cho login/OTP/checkout (specs §14 #2).
 *
 * Bản MVP dùng bộ đếm trong tiến trình — đủ cho 1 instance. Khi scale nhiều
 * instance, thay `buckets` bằng Redis INCR + EXPIRE, giữ nguyên chữ ký hàm.
 */
import { ApiError } from '@/lib/http';

interface Bucket {
  count: number;
  resetAt: number;
}

const buckets = new Map<string, Bucket>();

/** Dọn định kỳ để map không phình vô hạn. */
function sweep(now: number): void {
  if (buckets.size < 5_000) return;
  for (const [key, bucket] of buckets) {
    if (bucket.resetAt <= now) buckets.delete(key);
  }
}

export interface RateLimitOptions {
  /** Số lần tối đa trong cửa sổ. */
  limit: number;
  /** Độ dài cửa sổ (giây). */
  windowSeconds: number;
}

export const RATE_LIMITS = {
  LOGIN: { limit: 8, windowSeconds: 300 },
  REGISTER: { limit: 5, windowSeconds: 600 },
  OTP: { limit: 5, windowSeconds: 600 },
  CHECKOUT: { limit: 20, windowSeconds: 300 },
  ANSWER: { limit: 240, windowSeconds: 60 },
  AI: { limit: 30, windowSeconds: 300 },
} as const satisfies Record<string, RateLimitOptions>;

/** Tăng bộ đếm; ném 429 khi vượt ngưỡng. */
export function enforceRateLimit(key: string, options: RateLimitOptions): void {
  const now = Date.now();
  sweep(now);

  const bucket = buckets.get(key);
  if (!bucket || bucket.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + options.windowSeconds * 1000 });
    return;
  }

  bucket.count += 1;
  if (bucket.count > options.limit) {
    const seconds = Math.ceil((bucket.resetAt - now) / 1000);
    throw ApiError.tooMany(`Bạn thao tác quá nhiều lần. Vui lòng thử lại sau ${seconds} giây.`);
  }
}

/** Lấy IP client từ header proxy (fallback 'unknown'). */
export function clientIp(request: Request): string {
  const forwarded = request.headers.get('x-forwarded-for');
  if (forwarded) return forwarded.split(',')[0]!.trim();
  return request.headers.get('x-real-ip') ?? 'unknown';
}

export function resetRateLimits(): void {
  buckets.clear();
}
