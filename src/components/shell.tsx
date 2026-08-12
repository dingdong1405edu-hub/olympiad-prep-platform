/**
 * Khung điều hướng dùng chung cho 3 khu vực: học sinh, giáo viên, quản trị.
 * Mọi trang bọc nội dung trong AppShell để header, nav và chiều rộng đồng nhất.
 *
 * NHẬN DIỆN: phần khung (header, footer, màn hình đăng nhập) dùng CHUNG khiên và
 * bảng màu navy/vàng với trang bán hàng — khách vừa đọc trang giới thiệu xong,
 * đăng nhập vào phải thấy đúng thương hiệu đó chứ không phải một phần mềm khác.
 * Bên trong vùng nội dung vẫn giữ hệ brand/ink dịu mắt: khu học tập cần yên
 * tĩnh, khung bao quanh cần nhận ra ngay là ai.
 */
import type { ReactNode } from 'react';
import Link from 'next/link';
import type { Role } from '@prisma/client';
import { API, routes } from '@/lib/routes';
import { cx } from '@/components/ui';
import { Crest, Wordmark } from '@/components/brand';
import { NavLink } from '@/components/nav-link';

export interface ShellUser {
  id: string;
  fullName: string;
  roles: Role[];
}

export interface NavItem {
  href: string;
  label: string;
  exact?: boolean;
}

export const STUDENT_NAV = (enrollmentId: string): NavItem[] => [
  { href: routes.studyDashboard(enrollmentId), label: 'Hôm nay', exact: true },
  { href: routes.skillMap(enrollmentId), label: 'Bản đồ kỹ năng' },
  { href: routes.assessments(enrollmentId), label: 'Bài kiểm tra' },
  { href: routes.teacherSessions(enrollmentId), label: 'Buổi tư vấn' },
];

export const TEACHER_NAV: NavItem[] = [
  { href: routes.teacherHome(), label: 'Học sinh của tôi', exact: true },
];

export const ADMIN_NAV: NavItem[] = [
  { href: routes.adminHome(), label: 'Tổng quan', exact: true },
  { href: routes.adminPrograms(), label: 'Chương trình' },
  { href: routes.adminContent(), label: 'Học liệu' },
  { href: routes.adminSiteCopy(), label: 'Giao diện' },
  { href: routes.adminUsers(), label: 'Người dùng' },
  { href: routes.adminPayments(), label: 'Thanh toán' },
  { href: routes.adminTeachers(), label: 'Giáo viên' },
  { href: routes.adminReports(), label: 'Báo cáo' },
  { href: routes.adminConfig(), label: 'Cấu hình' },
  { href: routes.adminAudit(), label: 'Nhật ký' },
];

// ---------------------------------------------------------------------------

export function AppShell({
  user,
  nav,
  areaLabel,
  children,
  wide = false,
}: {
  user?: ShellUser | null;
  nav?: NavItem[];
  areaLabel?: string;
  children: ReactNode;
  wide?: boolean;
}) {
  const container = wide ? 'max-w-screen-2xl' : 'max-w-5xl';

  return (
    <div className="flex min-h-screen flex-col">
      <header className="sticky top-0 z-30 border-b border-navy-100 bg-white/88 backdrop-blur-md">
        <div className={cx('mx-auto flex items-center gap-3 px-4 py-2.5 sm:gap-4', container)}>
          <Wordmark href={user ? routes.myCourses() : routes.home()} compact />

          {areaLabel ? (
            <span className="hidden rounded-md bg-navy-50 px-2 py-1 text-[11px] font-semibold tracking-[0.12em] text-navy-600 uppercase ring-1 ring-navy-100 sm:inline">
              {areaLabel}
            </span>
          ) : null}

          <div className="flex-1" />

          {user ? (
            <div className="flex items-center gap-1.5 sm:gap-2">
              <Link
                href={routes.account()}
                className="flex items-center gap-2 rounded-lg px-2 py-1.5 transition-colors hover:bg-navy-50"
              >
                <span
                  aria-hidden
                  className="flex h-8 w-8 items-center justify-center rounded-full bg-navy-900 text-[11px] font-bold text-gold-200"
                >
                  {initials(user.fullName)}
                </span>
                <span className="hidden text-sm font-medium text-navy-800 sm:inline">
                  {user.fullName}
                </span>
              </Link>

              {/* Đăng xuất là hành động ĐỔI TRẠNG THÁI nên phải là POST — link GET
                  sẽ bị trình duyệt hay tiện ích tải trước và đá người dùng ra
                  ngoài giữa chừng. */}
              <form action={API.logout} method="post">
                <button
                  type="submit"
                  className="press flex items-center gap-1.5 rounded-lg px-2.5 py-2 text-sm font-medium text-navy-500 transition-colors hover:bg-rose-50 hover:text-rose-600"
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
                    <path
                      d="M15 17l5-5-5-5M20 12H9M12 3H6a1 1 0 0 0-1 1v16a1 1 0 0 0 1 1h6"
                      stroke="currentColor"
                      strokeWidth="1.8"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                  <span className="hidden sm:inline">Thoát</span>
                </button>
              </form>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <Link
                href={routes.login()}
                className="rounded-lg px-3 py-2 text-sm font-medium text-navy-700 transition-colors hover:bg-navy-50"
              >
                Đăng nhập
              </Link>
              <Link
                href={routes.register()}
                className="press rounded-lg bg-navy-900 px-4 py-2 text-sm font-semibold text-white transition-all hover:bg-navy-800 hover:shadow-[0_8px_20px_rgb(13_27_49/0.24)]"
              >
                Bắt đầu
              </Link>
            </div>
          )}
        </div>

        {nav && nav.length > 0 ? (
          <nav className={cx('scroll-x mx-auto flex gap-1 px-4 pb-2', container)}>
            {nav.map((item) => (
              <NavLink key={item.href} href={item.href} exact={item.exact}>
                {item.label}
              </NavLink>
            ))}
          </nav>
        ) : null}
      </header>

      <main className={cx('mx-auto w-full flex-1 px-4 py-6', container)}>{children}</main>

      <SiteFooter wide={wide} />
    </div>
  );
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 0) return '?';
  const last = parts[parts.length - 1]![0] ?? '';
  const first = parts.length > 1 ? parts[0]![0] : '';
  return (first + last).toUpperCase() || '?';
}

/**
 * Chân trang của khu ứng dụng. Cùng nền navy với chân trang bán hàng để hai khu
 * vực đóng lại giống nhau, nhưng gọn hơn nhiều: người đang học không cuộn xuống
 * đây để tìm liên kết, họ xuống đây vì đã hết nội dung.
 */
export function SiteFooter({ wide = false }: { wide?: boolean }) {
  const container = wide ? 'max-w-screen-2xl' : 'max-w-5xl';

  return (
    <footer className="mt-12 bg-navy-950 text-navy-300">
      <div className={cx('mx-auto px-4 py-8', container)}>
        <div className="flex flex-wrap items-start justify-between gap-6">
          <div className="max-w-sm">
            <Wordmark tone="dark" />
            <p className="mt-3 text-sm leading-relaxed text-navy-300">
              Ôn luyện cá nhân hóa cho ASMOPSS, NEO, STEM và FMC. Mỗi học sinh một lộ trình, tính
              lại sau mỗi bài làm.
            </p>
          </div>

          <div className="text-sm">
            <p className="mb-2.5 text-xs font-semibold tracking-[0.14em] text-navy-400 uppercase">
              Cam kết với phụ huynh
            </p>
            <ul className="space-y-1.5">
              <li>Chỉ thu thập dữ liệu cần cho việc học.</li>
              <li>Không dùng dữ liệu học sinh cho mục đích khác.</li>
              <li>Câu hỏi do đội chuyên môn biên soạn và kiểm duyệt.</li>
            </ul>
          </div>
        </div>

        <div className="mt-8 flex flex-wrap items-center justify-between gap-3 border-t border-white/10 pt-5 text-xs text-navy-400">
          <p>© {new Date().getFullYear()} Olympiad Prep. Nền tảng ôn luyện Olympic cá nhân hóa.</p>
          <Link href={routes.home()} className="transition-colors hover:text-white">
            Trang giới thiệu
          </Link>
        </div>
      </div>
    </footer>
  );
}

/**
 * Khung tập trung cho các luồng một-việc-một-màn-hình: đăng nhập, đăng ký, đăng
 * xuất, đặt lại mật khẩu. Bỏ hết điều hướng để người dùng không bị phân tán.
 *
 * Cột phụ `aside` chỉ hiện từ màn hình lớn: trên điện thoại nó sẽ đẩy biểu mẫu
 * xuống dưới màn hình đầu tiên, mà biểu mẫu mới là việc người ta vào đây để làm.
 */
export function FocusShell({
  title,
  subtitle,
  children,
  footer,
  aside,
  wide = false,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
  footer?: ReactNode;
  aside?: ReactNode;
  wide?: boolean;
}) {
  const hasAside = Boolean(aside);

  return (
    <div className="paper relative flex min-h-screen flex-col">
      <div className="grid-faint pointer-events-none absolute inset-x-0 top-0 h-[32rem]" aria-hidden />

      <header className="relative z-10 mx-auto flex w-full max-w-6xl items-center justify-between px-5 py-5">
        <Wordmark />
        <Link
          href={routes.home()}
          className="rounded-lg px-3 py-2 text-sm font-medium text-navy-600 transition-colors hover:bg-navy-50 hover:text-navy-900"
        >
          ← Về trang chủ
        </Link>
      </header>

      <main className="relative z-10 flex flex-1 items-center justify-center px-5 pt-2 pb-12">
        <div
          className={cx(
            'grid w-full items-center gap-10',
            hasAside ? 'max-w-5xl lg:grid-cols-[1fr_minmax(0,26rem)]' : wide ? 'max-w-2xl' : 'max-w-md',
          )}
        >
          {hasAside ? <div className="hidden lg:block">{aside}</div> : null}

          <div className="w-full">
            <div className="animate-fade-up rounded-2xl bg-white p-6 ring-1 ring-navy-100 shadow-[0_24px_56px_-24px_rgb(13_27_49/0.35)] sm:p-8">
              <div className="gold-rule mb-4" aria-hidden />
              <h1 className="font-display text-2xl font-bold tracking-tight text-navy-900">
                {title}
              </h1>
              {subtitle ? (
                <p className="mt-1.5 text-sm leading-relaxed text-navy-500">{subtitle}</p>
              ) : null}
              <div className="mt-6">{children}</div>
            </div>

            {footer ? (
              <div className="animate-fade-in delay-2 mt-5 text-center text-sm text-navy-500">
                {footer}
              </div>
            ) : null}
          </div>
        </div>
      </main>
    </div>
  );
}

/**
 * Cột phụ của FocusShell: vài lý do ngắn để người đang điền biểu mẫu biết mình
 * sắp bước vào cái gì. Dùng khiên làm dấu đầu dòng để nhắc lại thương hiệu.
 */
export function FocusAside({
  eyebrow,
  title,
  points,
}: {
  eyebrow: string;
  title: string;
  points: { title: string; description: string }[];
}) {
  return (
    <div className="animate-fade-up">
      <p className="text-xs font-semibold tracking-[0.16em] text-gold-600 uppercase">{eyebrow}</p>
      <h2 className="font-display mt-3 text-3xl leading-tight font-bold tracking-tight text-navy-900">
        {title}
      </h2>

      <ul className="mt-8 space-y-5">
        {points.map((point) => (
          <li key={point.title} className="flex gap-3.5">
            <Crest className="mt-0.5 h-6 w-6 shrink-0" />
            <div>
              <p className="font-semibold text-navy-900">{point.title}</p>
              <p className="mt-0.5 text-sm leading-relaxed text-navy-600">{point.description}</p>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
