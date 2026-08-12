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
 *
 * ĐỊA CHỈ CHUYỂN HƯỚNG PHẢI LÀ ĐƯỜNG DẪN TƯƠNG ĐỐI.
 * `NextResponse.redirect()` bắt buộc nhận URL tuyệt đối, và cách duy nhất để
 * dựng nó ở đây là `new URL(path, request.url)`. Nhưng sau proxy của Railway,
 * `request.url` là địa chỉ NỘI BỘ của container — bản chạy thật trả về đúng
 * `https://localhost:3000/dang-xuat`, tức là bấm Thoát xong trình duyệt đi vào
 * một địa chỉ chết. Header `Location` cho phép dùng đường dẫn tương đối
 * (RFC 7231 §7.1.2) nên trả thẳng như vậy: trình duyệt tự ghép với tên miền
 * đang đứng, không phụ thuộc vào việc máy chủ có đoán đúng tên miền hay không.
 */
export const POST = handle(async (request: Request) => {
  await clearSessionCookie();

  const accept = request.headers.get('accept') ?? '';
  if (!accept.includes('application/json')) {
    return new NextResponse(null, {
      status: 303,
      headers: { Location: routes.loggedOut() },
    });
  }
  return ok({ loggedOut: true });
});
