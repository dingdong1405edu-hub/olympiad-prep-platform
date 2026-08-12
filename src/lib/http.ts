/**
 * Chuẩn phản hồi API + wrapper bắt lỗi cho route handler.
 * Mọi endpoint dưới /api/v1 dùng chung định dạng này.
 */
import { NextResponse } from 'next/server';
import { ZodError } from 'zod';

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = 'ApiError';
  }

  static badRequest(message: string, details?: unknown) {
    return new ApiError(400, 'BAD_REQUEST', message, details);
  }
  static unauthorized(message = 'Bạn cần đăng nhập để tiếp tục.') {
    return new ApiError(401, 'UNAUTHORIZED', message);
  }
  static forbidden(message = 'Bạn không có quyền thực hiện thao tác này.') {
    return new ApiError(403, 'FORBIDDEN', message);
  }
  static notFound(message = 'Không tìm thấy dữ liệu.') {
    return new ApiError(404, 'NOT_FOUND', message);
  }
  static conflict(message: string, details?: unknown) {
    return new ApiError(409, 'CONFLICT', message, details);
  }
  static tooMany(message = 'Bạn thao tác quá nhanh, vui lòng thử lại sau.') {
    return new ApiError(429, 'TOO_MANY_REQUESTS', message);
  }
}

export function ok<T>(data: T, status = 200): NextResponse {
  return NextResponse.json({ ok: true, data }, { status });
}

export function fail(error: ApiError): NextResponse {
  return NextResponse.json(
    { ok: false, error: { code: error.code, message: error.message, details: error.details } },
    { status: error.status },
  );
}

/** Bọc handler: tự chuyển ApiError/ZodError thành phản hồi chuẩn. */
export function handle<TArgs extends unknown[]>(
  fn: (...args: TArgs) => Promise<NextResponse>,
): (...args: TArgs) => Promise<NextResponse> {
  return async (...args: TArgs) => {
    try {
      return await fn(...args);
    } catch (error) {
      if (error instanceof ApiError) return fail(error);

      if (error instanceof ZodError) {
        return fail(
          ApiError.badRequest(
            'Dữ liệu gửi lên không hợp lệ.',
            error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
          ),
        );
      }

      console.error('[api] unhandled error', error);
      return fail(new ApiError(500, 'INTERNAL_ERROR', 'Hệ thống gặp sự cố, vui lòng thử lại.'));
    }
  };
}

/** Đọc và validate JSON body. */
export async function readJson<T>(request: Request, schema: { parse: (v: unknown) => T }): Promise<T> {
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    throw ApiError.badRequest('Body phải là JSON hợp lệ.');
  }
  return schema.parse(raw);
}

/** Đọc và validate query string. */
export function readQuery<T>(request: Request, schema: { parse: (v: unknown) => T }): T {
  const url = new URL(request.url);
  const entries: Record<string, string> = {};
  url.searchParams.forEach((value, key) => {
    entries[key] = value;
  });
  return schema.parse(entries);
}
