import { handle, ok } from '@/lib/http';
import { handlePaymentWebhook } from '@/server/commerce/service';

/**
 * Điểm nhận callback của cổng thanh toán.
 *
 * Đọc raw body (không dùng request.json()) vì phần lớn cổng ký HMAC trên đúng
 * chuỗi byte gốc — parse trước rồi stringify lại sẽ làm sai chữ ký.
 * Xử lý idempotent: bắn trùng chỉ kích hoạt quyền truy cập một lần.
 */
export const POST = handle(
  async (request: Request, context: { params: Promise<{ gateway: string }> }) => {
    const { gateway } = await context.params;
    const rawBody = await request.text();

    const signature =
      request.headers.get('x-signature') ??
      request.headers.get('x-webhook-signature') ??
      request.headers.get('signature');

    let payload: unknown = null;
    try {
      payload = JSON.parse(rawBody);
    } catch {
      payload = null;
    }

    const result = await handlePaymentWebhook({
      gatewayCode: gateway.toUpperCase(),
      rawBody,
      signature,
      payload,
    });

    return ok(result);
  },
);
