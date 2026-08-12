import { handle, ok, readJson } from '@/lib/http';
import { clientIp, enforceRateLimit, RATE_LIMITS } from '@/lib/rate-limit';
import { requestPasswordResetSchema } from '@/server/identity/schemas';
import { requestPasswordReset } from '@/server/identity/service';

export const POST = handle(async (request: Request) => {
  enforceRateLimit(`forgot:${clientIp(request)}`, RATE_LIMITS.OTP);

  const input = await readJson(request, requestPasswordResetSchema);
  const result = await requestPasswordReset(input.identifier);

  // Luôn trả cùng một phản hồi dù tài khoản có tồn tại hay không, để không
  // biến endpoint này thành công cụ dò xem email nào đã đăng ký.
  return ok({
    sent: true,
    devOtp: process.env.NODE_ENV === 'production' ? undefined : result.otp,
  });
});
