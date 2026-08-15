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
  /**
   * Trang chờ thanh toán hỏi 3 giây một lần (20 lượt/phút) và mỗi lượt kéo theo
   * một lời gọi sang cổng. Để 40 là gấp đôi nhịp thật — đủ chỗ cho việc mở vài
   * tab, nhưng chặn được kiểu gọi dồn dập.
   */
  PAYMENT_STATUS: { limit: 40, windowSeconds: 60 },
  ANSWER: { limit: 240, windowSeconds: 60 },
  AI: { limit: 30, windowSeconds: 300 },
  /** Một bài thi thử có tối đa 30 ảnh; để 60 là đủ chỗ chụp lại vài lần. */
  UPLOAD: { limit: 60, windowSeconds: 300 },
  /**
   * Chấm tự luận: trình duyệt bắn 10 câu SONG SONG ngay khi nộp bài, cộng nút
   * "Chấm lại câu này". Ngưỡng 30/phút của spec §6 vừa đủ cho một người nhưng
   * chặn được kiểu gọi dồn — mỗi lời gọi tốn một lượt vision.
   */
  MOCK_GRADE: { limit: 30, windowSeconds: 60 },
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

/**
 * Lấy IP client từ header proxy (fallback 'unknown').
 *
 * Lấy phần tử CUỐI của `X-Forwarded-For`, không phải phần tử đầu.
 *
 * Mỗi proxy nối thêm IP nó nhìn thấy vào cuối chuỗi, nên phần tử cuối do proxy
 * gần ta nhất ghi và là phần tử duy nhất không giả được. Phần tử đầu thì client
 * tự đặt: chỉ cần gửi kèm `X-Forwarded-For: 1.2.3.4` là mỗi request mang một
 * "IP" khác nhau, và toàn bộ giới hạn tần suất — kể cả chốt chặn đăng nhập sai
 * mật khẩu — trở thành vô hiệu.
 *
 * Đúng với kiến trúc hiện tại: một lớp proxy của Railway đứng trước ứng dụng.
 * Thêm tầng proxy nữa (CDN chẳng hạn) thì phải đếm lùi thêm bấy nhiêu bậc.
 */
export function clientIp(request: Request): string {
  const forwarded = request.headers.get('x-forwarded-for');
  if (forwarded) {
    const hops = forwarded
      .split(',')
      .map((part) => part.trim())
      .filter((part) => part !== '');
    if (hops.length > 0) return hops[hops.length - 1]!;
  }
  return request.headers.get('x-real-ip') ?? 'unknown';
}

export function resetRateLimits(): void {
  buckets.clear();
}
