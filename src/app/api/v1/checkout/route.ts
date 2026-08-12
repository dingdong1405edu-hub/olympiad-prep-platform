import { handle, ok, readJson } from '@/lib/http';
import { requireSession } from '@/lib/auth';
import { clientIp } from '@/lib/rate-limit';
import { track, EVENTS } from '@/lib/analytics';
import { createCheckoutSchema } from '@/server/commerce/schemas';
import { createCheckout } from '@/server/commerce/service';

export const POST = handle(async (request: Request) => {
  const session = await requireSession();
  const input = await readJson(request, createCheckoutSchema);

  const result = await createCheckout({
    ...input,
    userId: session.id,
    ip: clientIp(request),
  });

  await track({
    eventName: EVENTS.START_CHECKOUT,
    userId: session.id,
    properties: { courseId: input.courseId, price: result.total },
  });

  return ok(result, 201);
});
