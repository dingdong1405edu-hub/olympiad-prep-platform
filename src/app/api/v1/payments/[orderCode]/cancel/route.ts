import { handle, ok } from '@/lib/http';
import { requireSession } from '@/lib/auth';
import { cancelPendingPayment } from '@/server/commerce/service';

/**
 * Người dùng bấm "Hủy đơn" trên màn hình chờ.
 * Đóng luôn link phía cổng để mã QR cũ không còn nhận được tiền — nếu chỉ đổi
 * trạng thái phía mình, khách quét lại QR cũ là tiền vào một đơn đã chết.
 */
export const POST = handle(
  async (request: Request, context: { params: Promise<{ orderCode: string }> }) => {
    const session = await requireSession();
    const { orderCode } = await context.params;

    let reason: string | undefined;
    try {
      const body = (await request.json()) as { reason?: unknown };
      if (typeof body?.reason === 'string') reason = body.reason;
    } catch {
      // Không có body cũng được — lý do là tùy chọn.
    }

    const result = await cancelPendingPayment(session.id, { orderCode, reason });
    return ok(result);
  },
);
