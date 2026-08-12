import { handle, ok, readJson } from '@/lib/http';
import { requireSession } from '@/lib/auth';
import { confirmMockPaymentSchema } from '@/server/commerce/schemas';
import { confirmMockPayment } from '@/server/commerce/service';

/**
 * Xác nhận thanh toán cho cổng giả lập của môi trường phát triển.
 * Đi qua đúng đường xử lý idempotent của webhook thật, nên gọi nhiều lần
 * cũng chỉ kích hoạt quyền truy cập một lần.
 */
export const POST = handle(async (request: Request) => {
  const session = await requireSession();
  const input = await readJson(request, confirmMockPaymentSchema);

  const result = await confirmMockPayment(input.orderCode, session.id);
  return ok(result);
});
