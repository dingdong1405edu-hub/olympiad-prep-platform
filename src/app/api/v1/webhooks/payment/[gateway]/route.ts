import { NextResponse } from 'next/server';
import { ApiError, fail, ok } from '@/lib/http';
import { handlePaymentWebhook } from '@/server/commerce/service';

/**
 * Điểm nhận callback của cổng thanh toán.
 *
 * URL cho PayOS: {APP_URL}/api/v1/webhooks/payment/payos
 *
 * Ba điều bắt buộc phải đúng ở đây:
 *
 *  1. ĐỌC RAW BODY, không dùng `request.json()`. Phần lớn cổng ký HMAC trên đúng
 *     chuỗi byte gốc; parse rồi stringify lại là sai chữ ký (PayOS ký trên object
 *     `data` nên bớt nhạy, nhưng cổng khác thì không).
 *
 *  2. MÃ TRẠNG THÁI QUYẾT ĐỊNH VIỆC CỔNG CÓ BẮN LẠI HAY KHÔNG:
 *       - Chữ ký sai      → 403, không bao giờ nên bắn lại.
 *       - Không thấy đơn  → 200. PayOS gửi gói THỬ (orderCode 123) khi đăng ký URL
 *                           và chỉ chấp nhận URL trả 200; trả lỗi là đăng ký hỏng.
 *                           Webhook lạc từ môi trường khác cũng rơi vào đây.
 *       - Lỗi hệ thống    → 5xx để cổng bắn lại, tránh mất giao dịch đã có tiền.
 *
 *  3. Idempotent: bắn trùng chỉ kích hoạt quyền truy cập một lần (lo ở service).
 */
export const POST = async (
  request: Request,
  context: { params: Promise<{ gateway: string }> },
): Promise<NextResponse> => {
  const { gateway } = await context.params;
  const rawBody = await request.text();

  // Cổng ký trong header (MANUAL, VNPAY…) hoặc trong body (PayOS) — đưa cả hai
  // sang cho gateway tự chọn cách xác thực của mình.
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

  try {
    const result = await handlePaymentWebhook({
      gatewayCode: gateway.toUpperCase(),
      rawBody,
      signature,
      payload,
    });

    if (!result.handled) {
      console.warn('[webhook] không kích hoạt được đơn', { gateway, reason: result.reason });
    }
    return ok(result);
  } catch (error) {
    // ApiError mang sẵn mã trạng thái đúng ý: 403 chữ ký sai, 400 payload hỏng.
    if (error instanceof ApiError) {
      console.warn('[webhook] từ chối', { gateway, code: error.code, message: error.message });
      return fail(error);
    }
    // Lỗi ngoài dự kiến: trả 500 để cổng thử lại, đơn đã có tiền không được rơi mất.
    console.error('[webhook] lỗi không lường trước', { gateway, error });
    return NextResponse.json(
      { ok: false, error: { code: 'INTERNAL_ERROR', message: 'Không xử lý được webhook.' } },
      { status: 500 },
    );
  }
};

/**
 * Cho người vận hành kiểm tra URL còn sống mà không phải mở log.
 * Không tiết lộ gì ngoài mã cổng đã có sẵn trên chính đường dẫn.
 */
export const GET = async (
  _request: Request,
  context: { params: Promise<{ gateway: string }> },
): Promise<NextResponse> => {
  const { gateway } = await context.params;
  return NextResponse.json({
    ok: true,
    data: { gateway: gateway.toUpperCase(), message: 'Webhook endpoint đang hoạt động.' },
  });
};
