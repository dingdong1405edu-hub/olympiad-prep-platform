/**
 * Lớp trừu tượng cổng thanh toán (specs §11, §20 Q5).
 *
 * MVP chạy `MockGateway` (code MANUAL): tạo đơn nội bộ + admin/dev xác nhận tay.
 * Khi chốt cổng thật, chỉ cần thêm một implement của `PaymentGateway` và đăng ký
 * vào `GATEWAYS` — service checkout/webhook KHÔNG phải sửa dòng nào.
 */
import { createHmac, timingSafeEqual } from 'node:crypto';
import { ApiError } from '@/lib/http';

// ---------------------------------------------------------------------------
// Hợp đồng chung
// ---------------------------------------------------------------------------

export interface CreatePaymentInput {
  orderCode: string;
  /** Số tiền phải trả, đơn vị chính (VND), đã trừ giảm giá. */
  amount: number;
  currency: string;
  description: string;
  /** ID nội bộ của người mua — KHÔNG truyền tên/email/sđt sang bên thứ ba khi không cần. */
  customerRef: string;
  /** Trang nội bộ người dùng quay lại sau khi thanh toán. */
  returnUrl: string;
}

export interface CreatePaymentResult {
  redirectUrl: string | null;
  gatewayTxnId: string | null;
}

export type WebhookStatus = 'PAID' | 'FAILED' | 'CANCELLED';

export interface ParsedWebhook {
  orderCode: string;
  status: WebhookStatus;
  gatewayTxnId: string;
  /** Đã quy về đơn vị chính (VND). Cổng nào gửi đơn vị nhỏ phải tự chia ở parseWebhook. */
  amount: number;
}

export interface PaymentGateway {
  code: string;
  createPayment(input: CreatePaymentInput): Promise<CreatePaymentResult>;
  verifyWebhook(rawBody: string, signature: string | null): boolean;
  parseWebhook(payload: unknown): ParsedWebhook;
}

// ---------------------------------------------------------------------------
// Tiện ích dùng chung
// ---------------------------------------------------------------------------

/** URL gốc của ứng dụng — dùng cho redirect/return URL. */
export function appBaseUrl(): string {
  const raw = process.env.APP_URL ?? process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000';
  return raw.replace(/\/+$/, '');
}

function webhookSecret(): string | null {
  const secret = process.env.PAYMENT_WEBHOOK_SECRET;
  return secret && secret.length >= 8 ? secret : null;
}

/** Chữ ký HMAC-SHA256 của raw body — dùng cho MockGateway và công cụ dev/test. */
export function signWebhookBody(rawBody: string): string {
  const secret = webhookSecret();
  if (!secret) throw new Error('PAYMENT_WEBHOOK_SECRET chưa được cấu hình.');
  return createHmac('sha256', secret).update(rawBody, 'utf8').digest('hex');
}

/** So sánh chống timing-attack; luôn trả false khi thiếu secret (fail-closed). */
function safeCompareHex(expected: string, given: string): boolean {
  if (expected.length !== given.length) return false;
  return timingSafeEqual(Buffer.from(expected, 'utf8'), Buffer.from(given, 'utf8'));
}

function readString(source: Record<string, unknown>, ...keys: string[]): string | null {
  for (const key of keys) {
    const value = source[key];
    if (typeof value === 'string' && value.trim().length > 0) return value.trim();
    if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  }
  return null;
}

/**
 * Chỉ chấp nhận số hoặc chuỗi số thuần. KHÔNG tự bóc dấu phân cách: "350.000"
 * có thể là 350 hoặc 350.000 tùy cổng — đoán sai thì lệch tiền, thà báo lỗi.
 */
function readAmount(source: Record<string, unknown>, ...keys: string[]): number | null {
  for (const key of keys) {
    const value = source[key];
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    if (typeof value === 'string' && /^-?\d+(\.\d{1,2})?$/.test(value.trim())) {
      return Number(value.trim());
    }
  }
  return null;
}

const STATUS_ALIASES: Record<string, WebhookStatus> = {
  PAID: 'PAID',
  SUCCESS: 'PAID',
  SUCCEEDED: 'PAID',
  COMPLETED: 'PAID',
  FAILED: 'FAILED',
  FAIL: 'FAILED',
  ERROR: 'FAILED',
  CANCELLED: 'CANCELLED',
  CANCELED: 'CANCELLED',
  EXPIRED: 'CANCELLED',
};

// ---------------------------------------------------------------------------
// MockGateway — MANUAL
// ---------------------------------------------------------------------------

/**
 * Cổng giả lập cho dev + luồng "admin kích hoạt thủ công" của MVP.
 * Không gọi mạng: redirect thẳng về trang xác nhận nội bộ, sau đó
 * `confirmMockPayment` (hoặc webhook ký HMAC) mới kích hoạt quyền truy cập.
 */
const mockGateway: PaymentGateway = {
  code: 'MANUAL',

  async createPayment(input: CreatePaymentInput): Promise<CreatePaymentResult> {
    return {
      redirectUrl: input.returnUrl,
      gatewayTxnId: null,
    };
  },

  verifyWebhook(rawBody: string, signature: string | null): boolean {
    const secret = webhookSecret();
    if (!secret || !signature) return false;

    const given = signature.startsWith('sha256=') ? signature.slice('sha256='.length) : signature;
    const expected = createHmac('sha256', secret).update(rawBody, 'utf8').digest('hex');
    return safeCompareHex(expected, given.trim().toLowerCase());
  },

  parseWebhook(payload: unknown): ParsedWebhook {
    if (typeof payload !== 'object' || payload === null || Array.isArray(payload)) {
      throw ApiError.badRequest('Payload webhook không hợp lệ.');
    }
    const source = payload as Record<string, unknown>;

    const orderCode = readString(source, 'orderCode', 'order_code', 'orderId', 'vnp_TxnRef');
    if (!orderCode) throw ApiError.badRequest('Payload webhook thiếu mã đơn hàng.');

    const rawStatus = readString(source, 'status', 'state', 'resultCode');
    if (!rawStatus) throw ApiError.badRequest('Payload webhook thiếu trạng thái giao dịch.');
    const status = STATUS_ALIASES[rawStatus.toUpperCase()];
    if (!status) throw ApiError.badRequest(`Trạng thái giao dịch không hỗ trợ: ${rawStatus}.`);

    const amount = readAmount(source, 'amount', 'total', 'money');
    if (amount === null || amount < 0) throw ApiError.badRequest('Payload webhook thiếu số tiền hợp lệ.');

    return {
      orderCode,
      status,
      gatewayTxnId: readString(source, 'gatewayTxnId', 'transactionId', 'transId') ?? `MOCK-${orderCode}`,
      amount: Math.round(amount),
    };
  },
};

// ---------------------------------------------------------------------------
// Registry
// ---------------------------------------------------------------------------

const GATEWAYS = new Map<string, PaymentGateway>([[mockGateway.code, mockGateway]]);

/**
 * Cổng thật dự kiến tích hợp sau khi chốt kickoff (specs §20 Q5).
 * Mỗi cổng cần bổ sung, KHÔNG viết code giả trước khi có tài khoản merchant thật:
 *
 *  - VNPAY  : vnp_TmnCode + vnp_HashSecret; ký `HMAC-SHA512` trên chuỗi query đã
 *             sort key theo alphabet; số tiền nhân 100; IPN phải trả JSON
 *             { RspCode, Message } và phải idempotent theo vnp_TransactionNo.
 *  - MOMO   : partnerCode/accessKey/secretKey; ký HMAC-SHA256 trên chuỗi
 *             rawSignature có THỨ TỰ TRƯỜNG CỐ ĐỊNH (không sort); đối soát theo
 *             orderId + requestId; số tiền đơn vị VND.
 *  - ZALOPAY: app_id + key1 (tạo đơn) / key2 (verify callback); callback bọc trong
 *             { data, mac }, mac = HMAC-SHA256(key2, data) rồi mới JSON.parse(data).
 *  - PAYOS  : x-signature theo checksum key trên payload đã sort key.
 *
 * Khi thêm: implement PaymentGateway, quy đổi số tiền về VND ngay trong
 * parseWebhook, rồi GATEWAYS.set('VNPAY', vnpayGateway).
 */
const PLANNED_GATEWAYS = ['VNPAY', 'MOMO', 'ZALOPAY', 'PAYOS'];

/** Lấy cổng theo mã; mặc định lấy từ cấu hình môi trường. Không im lặng fallback. */
export function getGateway(code?: string): PaymentGateway {
  const wanted = (code ?? process.env.PAYMENT_GATEWAY ?? 'MANUAL').trim().toUpperCase();

  const gateway = GATEWAYS.get(wanted);
  if (gateway) return gateway;

  if (PLANNED_GATEWAYS.includes(wanted)) {
    throw ApiError.badRequest(
      `Cổng thanh toán ${wanted} chưa được tích hợp. Vui lòng dùng MANUAL hoặc liên hệ quản trị viên.`,
    );
  }
  throw ApiError.badRequest(`Không hỗ trợ cổng thanh toán "${wanted}".`);
}

/** Danh sách mã cổng đang dùng được — cho màn hình cấu hình của admin. */
export function availableGatewayCodes(): string[] {
  return [...GATEWAYS.keys()];
}
