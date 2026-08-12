import { handle, ok } from '@/lib/http';
import { requireSession } from '@/lib/auth';
import { RATE_LIMITS, enforceRateLimit } from '@/lib/rate-limit';
import { getPaymentSession } from '@/server/commerce/service';

/**
 * Trạng thái một đơn hàng cho màn hình chờ thanh toán.
 *
 * Mỗi lần gọi, server hỏi luôn cổng xem tiền đã vào chưa (trừ khi `?doi_soat=0`).
 * Nhờ vậy luồng QR chạy đúng cả khi webhook chưa tới — bắt buộc ở môi trường
 * phát triển, nơi cổng không thể gọi ngược vào localhost.
 */
export const GET = handle(
  async (request: Request, context: { params: Promise<{ orderCode: string }> }) => {
    const session = await requireSession();
    const { orderCode } = await context.params;

    // Chặn gọi dồn: mỗi lượt hỏi kéo theo một lời gọi sang cổng thanh toán.
    enforceRateLimit(`payment-status:${session.id}`, RATE_LIMITS.PAYMENT_STATUS);

    const reconcile = new URL(request.url).searchParams.get('doi_soat') !== '0';
    const result = await getPaymentSession(session.id, orderCode, { reconcile });

    return ok(result);
  },
);
