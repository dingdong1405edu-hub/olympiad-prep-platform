import { handle, ok, readJson } from '@/lib/http';
import { setSessionCookie } from '@/lib/auth';
import { clientIp, enforceRateLimit, RATE_LIMITS } from '@/lib/rate-limit';
import { registerStudentSchema } from '@/server/identity/schemas';
import { registerStudent } from '@/server/identity/service';

export const POST = handle(async (request: Request) => {
  enforceRateLimit(`register:${clientIp(request)}`, RATE_LIMITS.REGISTER);

  const input = await readJson(request, registerStudentSchema);
  const result = await registerStudent(input);

  await setSessionCookie(result.token);
  return ok({ userId: result.userId, studentProfileId: result.studentProfileId }, 201);
});
