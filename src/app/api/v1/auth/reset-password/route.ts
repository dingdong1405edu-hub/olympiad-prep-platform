import { handle, ok, readJson } from '@/lib/http';
import { clientIp, enforceRateLimit, RATE_LIMITS } from '@/lib/rate-limit';
import { resetPasswordSchema } from '@/server/identity/schemas';
import { resetPassword } from '@/server/identity/service';

export const POST = handle(async (request: Request) => {
  enforceRateLimit(`reset:${clientIp(request)}`, RATE_LIMITS.OTP);

  const input = await readJson(request, resetPasswordSchema);
  await resetPassword(input);

  return ok({ reset: true });
});
