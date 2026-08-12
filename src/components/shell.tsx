/**
 * Khung điều hướng dùng chung cho 3 khu vực: học sinh, giáo viên, quản trị.
 * Mọi trang bọc nội dung trong AppShell để header, nav và chiều rộng đồng nhất.
 */
import type { ReactNode } from 'react';
import Link from 'next/link';
import type { Role } from '@prisma/client';
import { routes } from '@/lib/routes';
import { cx } from '@/components/ui';
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
  { href: routes.adminUsers(), label: 'Người dùng' },
  { href: routes.adminPayments(), label: 'Thanh toán' },
  { href: routes.adminTeachers(), label: 'Giáo viên' },
  { href: routes.adminReports(), label: 'Báo cáo' },
  { href: routes.adminConfig(), label: 'Cấu hình' },
  { href: routes.adminAudit(), label: 'Nhật ký' },
];

// ---------------------------------------------------------------------------

export function Logo({ compact = false }: { compact?: boolean }) {
  return (
    <Link
      href={routes.home()}
      className="group flex items-center gap-2.5 font-bold text-ink-900 transition-opacity hover:opacity-90"
    >
      <span
        aria-hidden
        className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-brand-500 to-brand-700 text-sm font-black text-white shadow-[0_4px_12px_rgb(47_66_224/0.3)] transition-transform duration-300 group-hover:scale-105"
      >
        OP
      </span>
      {compact ? null : <span className="text-base tracking-tight">Olympiad Prep</span>}
    </Link>
  );
}

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
      <header className="sticky top-0 z-30 border-b border-ink-100 bg-white/85 backdrop-blur-md">
        <div className={cx('mx-auto flex items-center gap-4 px-4 py-3', container)}>
          <Logo />
          {areaLabel ? (
            <span className="hidden rounded-md bg-ink-100 px-2 py-0.5 text-xs font-semibold tracking-wide text-ink-600 uppercase sm:inline">
              {areaLabel}
            </span>
          ) : null}

          <div className="flex-1" />

          {user ? (
            <div className="flex items-center gap-2 sm:gap-3">
              <Link
                href={routes.account()}
                className="flex items-center gap-2 rounded-lg px-2 py-1.5 transition-colors hover:bg-ink-100"
              >
                <span
                  aria-hidden
                  className="flex h-7 w-7 items-center justify-center rounded-full bg-brand-100 text-xs font-bold text-brand-700"
                >
                  {initials(user.fullName)}
                </span>
                <span className="hidden text-sm font-medium text-ink-700 sm:inline">
                  {user.fullName}
                </span>
              </Link>
              <form action="/api/v1/auth/logout" method="post">
                <button
                  type="submit"
                  className="press rounded-lg px-2.5 py-1.5 text-sm font-medium text-ink-500 transition-colors hover:bg-rose-50 hover:text-rose-600"
                >
                  Thoát
                </button>
              </form>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <Link
                href={routes.login()}
                className="rounded-lg px-3 py-2 text-sm font-medium text-ink-600 transition-colors hover:bg-ink-100 hover:text-ink-900"
              >
                Đăng nhập
              </Link>
              <Link
                href={routes.register()}
                className="press rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white shadow-[0_1px_2px_rgb(23_27_38/0.08)] transition-all hover:bg-brand-700 hover:shadow-[0_6px_18px_rgb(47_66_224/0.28)]"
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

      <SiteFooter />
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

export function SiteFooter() {
  return (
    <footer className="mt-12 border-t border-ink-100 bg-white">
      <div className="mx-auto max-w-5xl px-4 py-8">
        <div className="flex flex-wrap items-start justify-between gap-6">
          <div className="max-w-md">
            <Logo />
            <p className="mt-3 text-sm text-ink-500">
              Ôn luyện cá nhân hóa cho ASMOPSS, NEO, STEM và FMC. Mỗi học sinh một lộ trình, tính lại
              sau mỗi bài làm.
            </p>
          </div>
          <div className="text-sm text-ink-500">
            <p className="mb-2 font-semibold text-ink-700">Cam kết với phụ huynh</p>
            <ul className="space-y-1">
              <li>Chỉ thu thập dữ liệu cần cho việc học.</li>
              <li>Không dùng dữ liệu học sinh cho mục đích khác.</li>
              <li>Câu hỏi do đội chuyên môn biên soạn và kiểm duyệt.</li>
            </ul>
          </div>
        </div>
        <div className="rule-fade my-6" aria-hidden />
        <p className="text-xs text-ink-400">
          © {new Date().getFullYear()} Olympiad Prep. Nền tảng ôn luyện Olympic cá nhân hóa.
        </p>
      </div>
    </footer>
  );
}

/**
 * Khung tập trung cho các luồng một-việc-một-màn-hình: đăng nhập, đăng ký,
 * đặt mục tiêu, làm bài. Bỏ hết điều hướng để học sinh không bị phân tán.
 */
export function FocusShell({
  title,
  subtitle,
  children,
  footer,
  wide = false,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
  footer?: ReactNode;
  wide?: boolean;
}) {
  return (
    <div className="hero-glow flex min-h-screen flex-col items-center px-4 py-8">
      <div className={cx('w-full', wide ? 'max-w-2xl' : 'max-w-md')}>
        <div className="mb-6 flex justify-center">
          <Logo />
        </div>
        <div className="animate-fade-up rounded-2xl bg-white p-6 ring-1 ring-ink-100 shadow-[0_12px_28px_rgb(23_27_38/0.09)]">
          <h1 className="text-xl font-bold tracking-tight text-ink-900">{title}</h1>
          {subtitle ? <p className="mt-1 text-sm text-ink-500">{subtitle}</p> : null}
          <div className="mt-5">{children}</div>
        </div>
        {footer ? (
          <div className="animate-fade-in delay-2 mt-4 text-center text-sm text-ink-500">{footer}</div>
        ) : null}
      </div>
    </div>
  );
}
