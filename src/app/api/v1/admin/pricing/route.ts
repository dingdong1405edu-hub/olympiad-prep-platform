import { handle, ok, readJson } from '@/lib/http';
import { requireRole } from '@/lib/auth';
import { upsertPricingSchema } from '@/server/catalog/schemas';
import { upsertPricing } from '@/server/catalog/service';

/** Giá và thời hạn truy cập là dữ liệu, không phải hằng số trong code (specs §11). */
export const POST = handle(async (request: Request) => {
  const session = await requireRole('SUPER_ADMIN', 'PROGRAM_MANAGER');
  const input = await readJson(request, upsertPricingSchema);
  const pricing = await upsertPricing(input, session.id);

  return ok({
    id: pricing.id,
    price: pricing.price,
    accessDurationDays: pricing.accessDurationDays,
    active: pricing.active,
  });
});
