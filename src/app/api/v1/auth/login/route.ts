import { handle, ok, readJson } from '@/lib/http';
import { setSessionCookie } from '@/lib/auth';
import { clientIp, enforceRateLimit, RATE_LIMITS } from '@/lib/rate-limit';
import { loginSchema } from '@/server/identity/schemas';
import { loginUser } from '@/server/identity/service';

export const POST = handle(async (request: Request) => {
  const ip = clientIp(request);
  const input = await readJson(request, loginSchema);

  // Giới hạn theo cả IP lẫn danh tính để chặn dò mật khẩu trên một tài khoản
  // từ nhiều IP, và dò nhiều tài khoản từ một IP.
  enforceRateLimit(`login:ip:${ip}`, RATE_LIMITS.LOGIN);
  enforceRateLimit(`login:id:${input.identifier.toLowerCase()}`, RATE_LIMITS.LOGIN);

  const result = await loginUser(input);
  await setSessionCookie(result.token);

  return ok({ user: result.user });
});
