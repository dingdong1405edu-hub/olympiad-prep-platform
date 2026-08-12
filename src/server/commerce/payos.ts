/**
 * Cổng thanh toán PayOS — https://payos.vn/docs
 *
 * Vì sao tách riêng file: PayOS có ba thứ rất dễ làm sai, gom một chỗ để soi.
 *
 *  1. CHỮ KÝ. Mỗi hướng ký một kiểu:
 *     - Tạo đơn: ký ĐÚNG 5 trường theo thứ tự CỐ ĐỊNH
 *       `amount&cancelUrl&description&orderCode&returnUrl` (tình cờ trùng thứ tự
 *       alphabet, nhưng đây là chuỗi cố định trong tài liệu, không phải sort).
 *     - Webhook & phản hồi API: sort TOÀN BỘ khóa của `data` theo alphabet rồi nối
 *       `key=value&…`, null/undefined thành chuỗi rỗng, mảng thì JSON.stringify sau
 *       khi sort khóa từng phần tử.
 *
 *  2. `orderCode` PHẢI LÀ SỐ NGUYÊN và duy nhất vĩnh viễn theo merchant. Mã đơn
 *     nội bộ của hệ thống là chuỗi nên Payment mang thêm cột `gatewayOrderRef`.
 *
 *  3. `description` là NỘI DUNG CHUYỂN KHOẢN, giới hạn 25 ký tự — và chỉ 9 ký tự
 *     với tài khoản ngân hàng chưa liên kết payOS. Xem `buildGatewayDescription`.
 *
 * Điểm quan trọng nhất với sản phẩm này: `createPaymentLink` trả về `qrCode` —
 * chuỗi EMVCo/VietQR thô. Nhờ nó mình TỰ VẼ mã QR trên trang của mình, người dùng
 * không bao giờ bị đá sang tên miền payos.vn.
 */
import { createHmac, timingSafeEqual } from 'node:crypto';
import { ApiError } from '@/lib/http';
import type {
  CreatePaymentInput,
  CreatePaymentResult,
  GatewayPaymentSnapshot,
  GatewayPaymentState,
  ParsedWebhook,
  PaymentGateway,
  QueryPaymentInput,
} from './gateway';

const PAYOS_BASE_URL = (process.env.PAYOS_BASE_URL ?? 'https://api-merchant.payos.vn').replace(/\/+$/, '');
const REQUEST_TIMEOUT_MS = 15_000;

/** Mã `code` PayOS trả khi mọi việc suôn sẻ. Mọi mã khác đều là lỗi. */
const PAYOS_OK = '00';
/** Đơn trùng mã — service bắt riêng mã này để sinh lại `gatewayOrderRef` và thử lại. */
export const PAYOS_DUPLICATE_ORDER_CODE = '231';

export class PayosApiError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'PayosApiError';
  }
}

// ---------------------------------------------------------------------------
// Cấu hình
// ---------------------------------------------------------------------------

export interface PayosCredentials {
  clientId: string;
  apiKey: string;
  checksumKey: string;
}

/** Đọc khóa từ môi trường; null khi chưa cấu hình để chỗ gọi tự quyết định cách báo. */
export function readPayosCredentials(): PayosCredentials | null {
  const clientId = process.env.PAYOS_CLIENT_ID?.trim();
  const apiKey = process.env.PAYOS_API_KEY?.trim();
  const checksumKey = process.env.PAYOS_CHECKSUM_KEY?.trim();
  if (!clientId || !apiKey || !checksumKey) return null;
  return { clientId, apiKey, checksumKey };
}

function requireCredentials(): PayosCredentials {
  const credentials = readPayosCredentials();
  if (!credentials) {
    throw new ApiError(
      503,
      'PAYMENT_GATEWAY_UNCONFIGURED',
      'Cổng thanh toán PayOS chưa được cấu hình (thiếu PAYOS_CLIENT_ID / PAYOS_API_KEY / PAYOS_CHECKSUM_KEY).',
    );
  }
  return credentials;
}

export function isPayosConfigured(): boolean {
  return readPayosCredentials() !== null;
}

// ---------------------------------------------------------------------------
// Chữ ký
// ---------------------------------------------------------------------------

function hmac(value: string, key: string): string {
  return createHmac('sha256', key).update(value, 'utf8').digest('hex');
}

/** So sánh hex chống timing-attack. Độ dài lệch là sai luôn, khỏi so tiếp. */
function safeCompareHex(expected: string, given: string): boolean {
  if (expected.length !== given.length) return false;
  return timingSafeEqual(Buffer.from(expected, 'utf8'), Buffer.from(given, 'utf8'));
}

function sortObjectByKey(value: Record<string, unknown>): Record<string, unknown> {
  return Object.keys(value)
    .sort()
    .reduce<Record<string, unknown>>((acc, key) => {
      acc[key] = value[key];
      return acc;
    }, {});
}

/**
 * Chuẩn hóa object thành chuỗi `key=value&…` theo đúng thuật toán của PayOS.
 * Giữ nguyên cả những chi tiết trông vô lý (chuỗi "null" cũng thành rỗng) vì
 * phải khớp bit-đối-bit với phía họ mới ra cùng chữ ký.
 */
export function payosObjectToQueryString(data: Record<string, unknown>): string {
  const sorted = sortObjectByKey(data);
  return Object.keys(sorted)
    .filter((key) => sorted[key] !== undefined)
    .map((key) => {
      let value = sorted[key];
      if (Array.isArray(value)) {
        value = JSON.stringify(
          value.map((entry) =>
            entry !== null && typeof entry === 'object' && !Array.isArray(entry)
              ? sortObjectByKey(entry as Record<string, unknown>)
              : entry,
          ),
        );
      }
      if (value === null || value === undefined || value === 'null' || value === 'undefined') {
        value = '';
      }
      return `${key}=${String(value)}`;
    })
    .join('&');
}

/** Chữ ký của một object `data` — dùng cho webhook và phản hồi API. */
export function signPayosData(data: Record<string, unknown>, checksumKey: string): string {
  return hmac(payosObjectToQueryString(data), checksumKey);
}

/**
 * Chữ ký khi TẠO đơn: chuỗi 5 trường cố định theo tài liệu, không phải sort động.
 * Sai một dấu `&` là PayOS trả "signature không hợp lệ" mà không nói trường nào.
 */
export function signPayosCreateRequest(
  input: { amount: number; cancelUrl: string; description: string; orderCode: number; returnUrl: string },
  checksumKey: string,
): string {
  const raw =
    `amount=${input.amount}` +
    `&cancelUrl=${input.cancelUrl}` +
    `&description=${input.description}` +
    `&orderCode=${input.orderCode}` +
    `&returnUrl=${input.returnUrl}`;
  return hmac(raw, checksumKey);
}

/**
 * Xác thực webhook PayOS. Chữ ký nằm TRONG body (`signature`), không phải header —
 * đây là lý do `verifyWebhook` bỏ qua tham số `signature` của giao diện chung.
 */
export function verifyPayosWebhookBody(rawBody: string, checksumKey: string): boolean {
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawBody);
  } catch {
    return false;
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return false;

  const body = parsed as Record<string, unknown>;
  const signature = body.signature;
  const data = body.data;

  if (typeof signature !== 'string' || signature.length === 0) return false;
  if (typeof data !== 'object' || data === null || Array.isArray(data)) return false;

  const expected = signPayosData(data as Record<string, unknown>, checksumKey);
  return safeCompareHex(expected, signature.trim().toLowerCase());
}

// ---------------------------------------------------------------------------
// Gọi HTTP
// ---------------------------------------------------------------------------

interface PayosEnvelope<T> {
  code: string;
  desc: string;
  data: T | null;
  signature?: string | null;
}

async function callPayos<T>(
  path: string,
  init: { method: 'GET' | 'POST'; body?: unknown },
): Promise<PayosEnvelope<T>> {
  const credentials = requireCredentials();

  let response: Response;
  try {
    response = await fetch(`${PAYOS_BASE_URL}${path}`, {
      method: init.method,
      headers: {
        'x-client-id': credentials.clientId,
        'x-api-key': credentials.apiKey,
        'Content-Type': 'application/json',
      },
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      cache: 'no-store',
    });
  } catch (error) {
    const timedOut = error instanceof Error && error.name === 'TimeoutError';
    throw new ApiError(
      502,
      'PAYMENT_GATEWAY_ERROR',
      timedOut
        ? 'Cổng thanh toán PayOS phản hồi quá chậm, vui lòng thử lại.'
        : 'Không kết nối được cổng thanh toán PayOS, vui lòng thử lại sau.',
    );
  }

  const text = await response.text();
  let envelope: PayosEnvelope<T>;
  try {
    envelope = JSON.parse(text) as PayosEnvelope<T>;
  } catch {
    throw new ApiError(502, 'PAYMENT_GATEWAY_ERROR', 'Cổng thanh toán PayOS trả về dữ liệu không đọc được.');
  }

  // 401/403 là sai khóa merchant — lỗi cấu hình của mình, không phải lỗi người dùng.
  if (response.status === 401 || response.status === 403) {
    throw new ApiError(
      503,
      'PAYMENT_GATEWAY_UNCONFIGURED',
      'Khóa PayOS bị từ chối. Kiểm tra lại PAYOS_CLIENT_ID / PAYOS_API_KEY.',
    );
  }
  if (envelope.code !== PAYOS_OK) {
    throw new PayosApiError(envelope.code, envelope.desc || 'Cổng thanh toán từ chối yêu cầu.');
  }
  if (envelope.data === null || envelope.data === undefined) {
    throw new ApiError(502, 'PAYMENT_GATEWAY_ERROR', 'Cổng thanh toán PayOS không trả dữ liệu đơn hàng.');
  }

  return envelope;
}

// ---------------------------------------------------------------------------
// Kiểu dữ liệu PayOS
// ---------------------------------------------------------------------------

interface PayosCreatedLink {
  bin: string;
  accountNumber: string;
  accountName: string;
  amount: number;
  description: string;
  orderCode: number;
  currency: string;
  paymentLinkId: string;
  status: string;
  checkoutUrl: string;
  qrCode: string;
  expiredAt?: number | null;
}

interface PayosLinkInfo {
  id: string;
  orderCode: number;
  amount: number;
  amountPaid: number;
  amountRemaining: number;
  status: string;
  createdAt: string;
  transactions: { reference?: string; amount?: number; transactionDateTime?: string }[];
  cancellationReason?: string | null;
  canceledAt?: string | null;
}

interface PayosWebhookData {
  orderCode: number;
  amount: number;
  description: string;
  accountNumber: string;
  reference: string;
  transactionDateTime: string;
  currency: string;
  paymentLinkId: string;
  code: string;
  desc: string;
  [key: string]: unknown;
}

/** PayOS: PENDING | PROCESSING | PAID | CANCELLED | EXPIRED. */
const LINK_STATE: Record<string, GatewayPaymentState> = {
  PENDING: 'PENDING',
  PROCESSING: 'PENDING',
  PAID: 'PAID',
  CANCELLED: 'CANCELLED',
  CANCELED: 'CANCELLED',
  EXPIRED: 'EXPIRED',
  FAILED: 'FAILED',
};

// ---------------------------------------------------------------------------
// Cổng
// ---------------------------------------------------------------------------

/** PayOS chỉ nhận số, nên tra cứu/hủy đều đi bằng `gatewayOrderRef`. */
function requireNumericRef(input: QueryPaymentInput): string {
  if (input.paymentLinkId) return input.paymentLinkId;
  if (input.numericOrderRef === null) {
    throw ApiError.badRequest('Đơn hàng này chưa có mã tham chiếu PayOS để tra cứu.');
  }
  return String(input.numericOrderRef);
}

export const payosGateway: PaymentGateway = {
  code: 'PAYOS',
  label: 'Chuyển khoản / quét mã QR (PayOS)',
  rendersQrInline: true,

  async createPayment(input: CreatePaymentInput): Promise<CreatePaymentResult> {
    const { checksumKey } = requireCredentials();

    const body = {
      orderCode: input.numericOrderRef,
      amount: input.amount,
      description: input.description,
      cancelUrl: input.cancelUrl,
      returnUrl: input.returnUrl,
      // Giây, không phải mili-giây — gửi nhầm là đơn hết hạn ngay khi vừa tạo.
      ...(input.expiresAt ? { expiredAt: Math.floor(input.expiresAt.getTime() / 1000) } : {}),
      signature: signPayosCreateRequest(
        {
          amount: input.amount,
          cancelUrl: input.cancelUrl,
          description: input.description,
          orderCode: input.numericOrderRef,
          returnUrl: input.returnUrl,
        },
        checksumKey,
      ),
    };

    const envelope = await callPayos<PayosCreatedLink>('/v2/payment-requests', { method: 'POST', body });
    const data = envelope.data as PayosCreatedLink;

    // Phản hồi tạo đơn không chứa mảng nên chuẩn hóa là xác định — kiểm chặt được.
    if (envelope.signature) {
      const expected = signPayosData(data as unknown as Record<string, unknown>, checksumKey);
      if (!safeCompareHex(expected, envelope.signature.trim().toLowerCase())) {
        throw new ApiError(
          502,
          'PAYMENT_GATEWAY_ERROR',
          'Chữ ký phản hồi từ PayOS không hợp lệ — đã dừng để tránh hiển thị mã QR sai.',
        );
      }
    }

    if (!data.qrCode) {
      throw new ApiError(502, 'PAYMENT_GATEWAY_ERROR', 'PayOS không trả về mã QR cho đơn hàng này.');
    }

    return {
      // Cổng này vẽ QR tại chỗ nên KHÔNG trả redirectUrl — giao diện phải ở lại trang mình.
      redirectUrl: null,
      gatewayTxnId: null,
      qr: {
        raw: data.qrCode,
        bin: data.bin ?? null,
        accountNumber: data.accountNumber ?? null,
        accountName: data.accountName ?? null,
        transferContent: data.description ?? null,
        amount: data.amount,
        expiresAt: data.expiredAt ? new Date(data.expiredAt * 1000).toISOString() : null,
        checkoutUrl: data.checkoutUrl ?? null,
        paymentLinkId: data.paymentLinkId ?? null,
      },
    };
  },

  verifyWebhook(rawBody: string): boolean {
    const credentials = readPayosCredentials();
    if (!credentials) return false;
    return verifyPayosWebhookBody(rawBody, credentials.checksumKey);
  },

  parseWebhook(payload: unknown): ParsedWebhook {
    if (typeof payload !== 'object' || payload === null || Array.isArray(payload)) {
      throw ApiError.badRequest('Payload webhook PayOS không hợp lệ.');
    }
    const body = payload as Record<string, unknown>;
    const data = body.data;
    if (typeof data !== 'object' || data === null || Array.isArray(data)) {
      throw ApiError.badRequest('Payload webhook PayOS thiếu khối "data".');
    }
    const tx = data as unknown as PayosWebhookData;

    const numericOrderRef = typeof tx.orderCode === 'number' ? tx.orderCode : Number(tx.orderCode);
    if (!Number.isInteger(numericOrderRef)) {
      throw ApiError.badRequest('Webhook PayOS thiếu orderCode dạng số.');
    }

    const amount = typeof tx.amount === 'number' ? tx.amount : Number(tx.amount);
    if (!Number.isFinite(amount) || amount < 0) {
      throw ApiError.badRequest('Webhook PayOS thiếu số tiền hợp lệ.');
    }

    // PayOS chỉ bắn webhook cho giao dịch có tiền vào; `data.code` mới là kết quả
    // của chính giao dịch đó, `code` ngoài cùng chỉ nói "gửi webhook thành công".
    const succeeded = (tx.code ?? PAYOS_OK) === PAYOS_OK;

    return {
      orderCode: null,
      numericOrderRef,
      status: succeeded ? 'PAID' : 'FAILED',
      // `reference` là mã giao dịch ngân hàng — khóa idempotency tốt nhất ở đây.
      gatewayTxnId: tx.reference || tx.paymentLinkId || `PAYOS-${numericOrderRef}`,
      amount: Math.round(amount),
    };
  },

  async queryPayment(input: QueryPaymentInput): Promise<GatewayPaymentSnapshot> {
    const id = requireNumericRef(input);
    const envelope = await callPayos<PayosLinkInfo>(`/v2/payment-requests/${encodeURIComponent(id)}`, {
      method: 'GET',
    });
    const data = envelope.data as PayosLinkInfo;

    // Phản hồi này có mảng `transactions`; cách chuẩn hóa mảng của PayOS đủ mong
    // manh để thỉnh thoảng lệch chữ ký. Đây là kênh mình chủ động gọi qua TLS tới
    // đúng tên miền PayOS, không phải đầu vào từ Internet, nên chỉ ghi log cảnh
    // báo — chặn ở đây sẽ khóa oan tiền của khách đã trả.
    const credentials = readPayosCredentials();
    if (envelope.signature && credentials) {
      const expected = signPayosData(data as unknown as Record<string, unknown>, credentials.checksumKey);
      if (!safeCompareHex(expected, envelope.signature.trim().toLowerCase())) {
        console.warn('[payos] chữ ký phản hồi tra cứu không khớp', { orderCode: data.orderCode });
      }
    }

    const latest = data.transactions?.[data.transactions.length - 1];

    return {
      state: LINK_STATE[String(data.status).toUpperCase()] ?? 'UNKNOWN',
      amountPaid: typeof data.amountPaid === 'number' ? data.amountPaid : 0,
      gatewayTxnId: latest?.reference ?? data.id ?? null,
      raw: data,
    };
  },

  async cancelPayment(input: QueryPaymentInput & { reason: string }): Promise<void> {
    const id = requireNumericRef(input);
    await callPayos<PayosLinkInfo>(`/v2/payment-requests/${encodeURIComponent(id)}/cancel`, {
      method: 'POST',
      body: { cancellationReason: input.reason.slice(0, 255) },
    });
  },
};

/**
 * Đăng ký URL nhận webhook với PayOS.
 *
 * PayOS gọi thử URL ngay lúc đăng ký và chỉ chấp nhận khi nhận HTTP 200 — nên
 * hàm này phải chạy khi ứng dụng ĐÃ deploy và URL công khai truy cập được.
 * Dùng qua `npm run payos:webhook`.
 */
export async function registerPayosWebhook(webhookUrl: string): Promise<{ webhookUrl: string }> {
  const envelope = await callPayos<{ webhookUrl?: string } | null>('/confirm-webhook', {
    method: 'POST',
    body: { webhookUrl },
  });
  return { webhookUrl: envelope.data?.webhookUrl ?? webhookUrl };
}
