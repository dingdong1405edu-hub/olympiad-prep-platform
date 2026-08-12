import { NextResponse } from 'next/server';
import { handle, ok } from '@/lib/http';
import { clearSessionCookie } from '@/lib/auth';

/**
 * Đăng xuất chấp nhận cả hai kiểu gọi:
 *  - form HTML thường (nút Đăng xuất ở header) → chuyển hướng về trang chủ
 *  - fetch từ client → trả JSON
 */
export const POST = handle(async (request: Request) => {
  await clearSessionCookie();

  const accept = request.headers.get('accept') ?? '';
  if (!accept.includes('application/json')) {
    return NextResponse.redirect(new URL('/', request.url), { status: 303 });
  }
  return ok({ loggedOut: true });
});
