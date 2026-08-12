import { handle, ok, readJson } from '@/lib/http';
import { previewCheckoutSchema } from '@/server/commerce/schemas';
import { previewCheckout } from '@/server/commerce/service';

export const POST = handle(async (request: Request) => {
  const input = await readJson(request, previewCheckoutSchema);
  return ok(await previewCheckout(input));
});
