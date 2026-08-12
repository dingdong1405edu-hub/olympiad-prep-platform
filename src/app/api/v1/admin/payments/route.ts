import { z } from 'zod';
import { handle, ok, readJson, readQuery } from '@/lib/http';
import { requireAdmin } from '@/lib/auth';
import { listPaymentsSchema, refundPaymentSchema } from '@/server/commerce/schemas';
import { listPayments, refundPayment } from '@/server/commerce/service';

// refundPaymentSchema chỉ mô tả ghi chú hoàn tiền; id đơn đi kèm ở tầng HTTP.
const refundBodySchema = refundPaymentSchema.extend({ paymentId: z.string().min(1) });

export const GET = handle(async (request: Request) => {
  await requireAdmin();
  const filter = readQuery(request, listPaymentsSchema);
  return ok(await listPayments(filter));
});

/** Hoàn tiền: bắt buộc có ghi chú lý do và được ghi vào nhật ký kiểm toán. */
export const POST = handle(async (request: Request) => {
  const session = await requireAdmin();
  const input = await readJson(request, refundBodySchema);

  await refundPayment(input.paymentId, input.note, session.id);
  return ok({ paymentId: input.paymentId, refunded: true });
});
