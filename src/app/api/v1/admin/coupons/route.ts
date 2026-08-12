import { handle, ok, readJson, readQuery } from '@/lib/http';
import { requireAdmin } from '@/lib/auth';
import { listCouponsSchema, upsertCouponSchema } from '@/server/commerce/schemas';
import { listCoupons, upsertCoupon } from '@/server/commerce/service';

export const GET = handle(async (request: Request) => {
  await requireAdmin();
  const filter = readQuery(request, listCouponsSchema);
  return ok(await listCoupons(filter));
});

export const POST = handle(async (request: Request) => {
  const session = await requireAdmin();
  const input = await readJson(request, upsertCouponSchema);
  const coupon = await upsertCoupon(input, session.id);

  return ok({ id: coupon.id, code: coupon.code, type: coupon.type, value: coupon.value });
});
