import { NextResponse } from 'next/server';
import { handle, ok } from '@/lib/http';
import { clearSessionCookie } from '@/lib/auth';
import { routes } from '@/lib/routes';

/**
 * Đăng xuất chấp nhận cả hai kiểu gọi:
 *  - form HTML thường (nút Thoát ở header) → chuyển hướng tới trang xác nhận
 *  - fetch từ client → trả JSON
 *
 * Vì sao không đá thẳng về trang chủ: người vừa bấm Thoát sẽ thấy đúng cái trang
 * bán hàng mà khách vãng lai thấy, không có lấy một câu xác nhận việc đăng xuất
 * đã xong. Trên máy dùng chung, đó là khác biệt giữa "đã thoát" và "tưởng là đã
 * thoát". `/dang-xuat` nói rõ điều đó và mời đăng nhập lại.
 */
export const POST = handle(async (request: Request) => {
  await clearSessionCookie();

  const accept = request.headers.get('accept') ?? '';
  if (!accept.includes('application/json')) {
    return NextResponse.redirect(new URL(routes.loggedOut(), request.url), { status: 303 });
  }
  return ok({ loggedOut: true });
});
