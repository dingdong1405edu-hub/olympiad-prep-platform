import { NextResponse, type NextRequest } from 'next/server';
import { jwtVerify } from 'jose';

/**
 * Chặn cửa cho các khu vực cần đăng nhập.
 *
 * Middleware chạy ở Edge runtime nên KHÔNG dùng lại src/lib/auth.ts (file đó
 * import bcryptjs và next/headers). Ở đây chỉ xác minh chữ ký token và role —
 * kiểm tra quyền chi tiết vẫn do từng route handler/service thực hiện.
 */

const SESSION_COOKIE = 'olympiad_session';

const TEACHER_AREA_ROLES = ['TEACHER', 'SUPER_ADMIN', 'PROGRAM_MANAGER'];

/**
 * Ai được BƯỚC VÀO khu /quan-tri. Rộng hơn ADMIN_ROLES trong src/lib/auth.ts một
 * cách có chủ đích: biên soạn viên và reviewer cần vào để làm học liệu, nhưng
 * từng route bên trong vẫn tự kiểm tra quyền chi tiết của mình.
 */
const ADMIN_AREA_ROLES = [
  'SUPER_ADMIN',
  'OPS_ADMIN',
  'PROGRAM_MANAGER',
  'REVIEWER',
  'CONTENT_EDITOR',
];

function secretKey(): Uint8Array {
  return new TextEncoder().encode(process.env.AUTH_SECRET ?? '');
}

async function readRoles(request: NextRequest): Promise<string[] | null> {
  const token = request.cookies.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secretKey());
    return Array.isArray(payload.roles) ? (payload.roles as string[]) : [];
  } catch {
    return null;
  }
}

function redirectToLogin(request: NextRequest): NextResponse {
  const url = new URL('/dang-nhap', request.url);
  url.searchParams.set('next', request.nextUrl.pathname + request.nextUrl.search);
  return NextResponse.redirect(url);
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  const needsTeacher = pathname.startsWith('/giao-vien');
  const needsAdmin = pathname.startsWith('/quan-tri');
  const needsStudent =
    pathname.startsWith('/hoc-tap') ||
    pathname.startsWith('/tai-khoan') ||
    pathname.startsWith('/thanh-toan');

  if (!needsTeacher && !needsAdmin && !needsStudent) return NextResponse.next();

  const roles = await readRoles(request);
  if (!roles) return redirectToLogin(request);

  if (needsTeacher && !roles.some((role) => TEACHER_AREA_ROLES.includes(role))) {
    return NextResponse.redirect(new URL('/', request.url));
  }
  if (needsAdmin && !roles.some((role) => ADMIN_AREA_ROLES.includes(role))) {
    return NextResponse.redirect(new URL('/', request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/hoc-tap/:path*', '/tai-khoan/:path*', '/thanh-toan/:path*', '/giao-vien/:path*', '/quan-tri/:path*'],
};
