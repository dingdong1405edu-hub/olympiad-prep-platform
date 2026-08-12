/**
 * Lớp trừu tượng cổng thanh toán (specs §11, §20 Q5).
 *
 * Hai kiểu cổng cùng sống ở đây:
 *  - Cổng CHUYỂN HƯỚNG: trả `redirectUrl`, người dùng rời khỏi web mình.
 *  - Cổng QR TẠI CHỖ (`rendersQrInline`): trả chuỗi VietQR để mình tự vẽ mã QR
 *    ngay trên trang, người dùng KHÔNG bị đá sang tên miền của cổng.
 *
 * Thêm cổng mới = implement `PaymentGateway` + đăng ký vào `GATEWAYS`.
 * Service checkout/webhook không phải sửa dòng nào.
 */
import { createHmac, timingSafeEqual } from 'node:crypto';
import { ApiError } from '@/lib/http';
import { payosGateway } from './payos';

// ---------------------------------------------------------------------------
// Hợp đồng chung
// ---------------------------------------------------------------------------

export interface CreatePaymentInput {
  orderCode: string;
  /**
   * Mã đơn dạng số nguyên. PayOS bắt buộc `orderCode` là number; cổng nào không
   * cần thì cứ bỏ qua trường này.
   */
  numericOrderRef: number;
  /** Số tiền phải trả, đơn vị chính (VND), đã trừ giảm giá. */
  amount: number;
  currency: string;
  /** Mô tả ngắn — nhiều cổng giới hạn rất chặt, xem `buildGatewayDescription`. */
  description: string;
  /** ID nội bộ của người mua — KHÔNG truyền tên/email/sđt sang bên thứ ba khi không cần. */
  customerRef: string;
  /** Trang nội bộ người dùng quay lại sau khi thanh toán. */
  returnUrl: string;
  /** Trang nội bộ khi người dùng bấm hủy ở phía cổng. */
  cancelUrl: string;
  /** Hạn hiệu lực của link/QR. Quá hạn thì cổng tự từ chối tiền vào. */
  expiresAt?: Date | null;
}

/**
 * Dữ liệu đủ để VẼ mã QR trên trang của mình.
 * `raw` là chuỗi EMVCo/VietQR — client tự render thành ảnh, không nhúng ảnh từ
 * tên miền bên thứ ba (tránh lộ hành vi người dùng và tránh hỏng khi họ chặn CDN).
 */
export interface PaymentQrPayload {
  raw: string;
  bin: string | null;
  accountNumber: string | null;
  accountName: string | null;
  /** Nội dung chuyển khoản do cổng sinh — người dùng gõ tay thì phải đúng chuỗi này. */
  transferContent: string | null;
  amount: number;
  /** ISO string; null = không đặt hạn. */
  expiresAt: string | null;
  /** Trang thanh toán của cổng — CHỈ dùng làm phương án dự phòng. */
  checkoutUrl: string | null;
  /** ID link thanh toán phía cổng, dùng khi tra cứu/hủy. */
  paymentLinkId: string | null;
}

export interface CreatePaymentResult {
  redirectUrl: string | null;
  gatewayTxnId: string | null;
  qr: PaymentQrPayload | null;
}

export type WebhookStatus = 'PAID' | 'FAILED' | 'CANCELLED';

export interface ParsedWebhook {
  /** Mã đơn nội bộ, khi cổng gửi trả lại được. */
  orderCode: string | null;
  /** Mã số nguyên, với cổng chỉ làm việc bằng số (PayOS). */
  numericOrderRef: number | null;
  status: WebhookStatus;
  gatewayTxnId: string;
  /** Đã quy về đơn vị chính (VND). Cổng nào gửi đơn vị nhỏ phải tự chia ở parseWebhook. */
  amount: number;
}

export type GatewayPaymentState = 'PENDING' | 'PAID' | 'CANCELLED' | 'EXPIRED' | 'FAILED' | 'UNKNOWN';

export interface GatewayPaymentSnapshot {
  state: GatewayPaymentState;
  /** Tổng tiền cổng đã nhận được cho đơn này (VND). */
  amountPaid: number;
  gatewayTxnId: string | null;
  raw: unknown;
}

export interface PaymentGateway {
  code: string;
  /** Tên hiển thị cho người dùng cuối. */
  label: string;
  /** true = trả QR để hiện tại chỗ; UI không được điều hướng sang cổng. */
  rendersQrInline: boolean;
  createPayment(input: CreatePaymentInput): Promise<CreatePaymentResult>;
  verifyWebhook(rawBody: string, signature: string | null): boolean;
  parseWebhook(payload: unknown): ParsedWebhook;
  /**
   * Chủ động hỏi cổng trạng thái đơn.
   *
   * Đây KHÔNG phải tính năng phụ: webhook không tới được localhost và có thể trễ
   * hoặc rớt trên production. Trang chờ thanh toán hỏi định kỳ qua đây nên tiền
   * vào là quyền truy cập mở, không phụ thuộc webhook.
   */
  queryPayment?(input: QueryPaymentInput): Promise<GatewayPaymentSnapshot>;
  /** Hủy link thanh toán khi người dùng bỏ giữa chừng — trả tài nguyên về cho cổng. */
  cancelPayment?(input: QueryPaymentInput & { reason: string }): Promise<void>;
}

export interface QueryPaymentInput {
  orderCode: string;
  numericOrderRef: number | null;
  paymentLinkId: string | null;
}

// ---------------------------------------------------------------------------
// Tiện ích dùng chung
// ---------------------------------------------------------------------------

/** URL gốc của ứng dụng — dùng cho redirect/return URL và đăng ký webhook. */
export function appBaseUrl(): string {
  const raw =
    process.env.APP_URL ??
    process.env.NEXT_PUBLIC_APP_URL ??
    // Railway cấp sẵn biến này cho service có domain công khai.
    (process.env.RAILWAY_PUBLIC_DOMAIN ? `https://${process.env.RAILWAY_PUBLIC_DOMAIN}` : null) ??
    'http://localhost:3000';
  return raw.replace(/\/+$/, '');
}

/** Đường dẫn webhook của một cổng — dùng cả khi đăng ký lẫn khi in ra cho vận hành. */
export function webhookUrlFor(gatewayCode: string): string {
  return `${appBaseUrl()}/api/v1/webhooks/payment/${gatewayCode.toLowerCase()}`;
}

/**
 * Mô tả gửi sang cổng. PayOS giới hạn 25 ký tự, và chỉ 9 ký tự với tài khoản
 * ngân hàng chưa liên kết payOS — nên mặc định gói vào 9 ký tự cho an toàn tuyệt
 * đối: "OLP" + 6 ký tự đuôi mã đơn, vẫn tra ngược ra đơn được bằng mắt thường.
 */
export function buildGatewayDescription(orderCode: string, maxLength = 9): string {
  const alnum = orderCode.replace(/[^0-9A-Za-z]/g, '').toUpperCase();
  const tail = alnum.slice(-(maxLength - 3));
  return `OLP${tail}`.slice(0, maxLength);
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
  label: 'Xác nhận thủ công',
  rendersQrInline: false,

  async createPayment(input: CreatePaymentInput): Promise<CreatePaymentResult> {
    return {
      redirectUrl: input.returnUrl,
      gatewayTxnId: null,
      qr: null,
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
      numericOrderRef: null,
      status,
      gatewayTxnId: readString(source, 'gatewayTxnId', 'transactionId', 'transId') ?? `MOCK-${orderCode}`,
      amount: Math.round(amount),
    };
  },
};

// ---------------------------------------------------------------------------
// Registry
// ---------------------------------------------------------------------------

const GATEWAYS = new Map<string, PaymentGateway>([
  [mockGateway.code, mockGateway],
  [payosGateway.code, payosGateway],
]);

/**
 * Cổng còn nằm trong kế hoạch (specs §20 Q5). KHÔNG viết code giả trước khi có
 * tài khoản merchant thật:
 *
 *  - VNPAY  : vnp_TmnCode + vnp_HashSecret; ký `HMAC-SHA512` trên chuỗi query đã
 *             sort key theo alphabet; số tiền nhân 100; IPN phải trả JSON
 *             { RspCode, Message } và phải idempotent theo vnp_TransactionNo.
 *  - MOMO   : partnerCode/accessKey/secretKey; ký HMAC-SHA256 trên chuỗi
 *             rawSignature có THỨ TỰ TRƯỜNG CỐ ĐỊNH (không sort); đối soát theo
 *             orderId + requestId; số tiền đơn vị VND.
 *  - ZALOPAY: app_id + key1 (tạo đơn) / key2 (verify callback); callback bọc trong
 *             { data, mac }, mac = HMAC-SHA256(key2, data) rồi mới JSON.parse(data).
 */
const PLANNED_GATEWAYS = ['VNPAY', 'MOMO', 'ZALOPAY'];

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

/** Mô tả các cổng đang bật, cho màn hình cấu hình hiển thị trạng thái sẵn sàng. */
export function describeGateways(): { code: string; label: string; rendersQrInline: boolean }[] {
  return [...GATEWAYS.values()].map((gateway) => ({
    code: gateway.code,
    label: gateway.label,
    rendersQrInline: gateway.rendersQrInline,
  }));
}
