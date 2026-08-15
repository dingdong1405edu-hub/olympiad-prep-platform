import { handle, ok } from '@/lib/http';
import { ApiError } from '@/lib/http';
import { clientIp, enforceRateLimit, RATE_LIMITS } from '@/lib/rate-limit';
import { storeUpload } from '@/server/mock-exam/uploads';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Nhận một ảnh bài làm (FormData, trường `file`) và trả về đường dẫn đọc lại.
 *
 * Không cần đăng nhập vì MVP cho khách thi thử. Chặn lạm dụng bằng rate limit
 * theo IP — kho ảnh nằm trong database nên đây là đường duy nhất bơm dữ liệu
 * nặng vào hệ thống.
 */
export const POST = handle(async (request: Request) => {
  enforceRateLimit(`upload:${clientIp(request)}`, RATE_LIMITS.UPLOAD);

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    throw ApiError.badRequest('Yêu cầu phải là multipart/form-data.');
  }

  const stored = await storeUpload(form.get('file'));
  return ok(stored, 201);
});
