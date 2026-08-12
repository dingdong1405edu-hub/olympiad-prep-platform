/**
 * Khung điều hướng dùng chung cho 3 khu vực: học sinh, giáo viên, quản trị.
 * Mọi trang bọc nội dung trong AppShell để header, nav và chiều rộng đồng nhất.
 */
import type { ReactNode } from 'react';
import Link from 'next/link';
import type { Role } from '@prisma/client';
import { routes } from '@/lib/routes';
import { cx } from '@/components/ui';

export interface ShellUser {
  id: string;
  fullName: string;
  roles: Role[];
}

export interface NavItem {
  href: string;
  label: string;
}

export const STUDENT_NAV = (enrollmentId: string): NavItem[] => [
  { href: routes.studyDashboard(enrollmentId), label: 'Hôm nay' },
  { href: routes.skillMap(enrollmentId), label: 'Bản đồ kỹ năng' },
  { href: routes.assessments(enrollmentId), label: 'Bài kiểm tra' },
  { href: routes.teacherSessions(enrollmentId), label: 'Buổi tư vấn' },
];

export const TEACHER_NAV: NavItem[] = [{ href: routes.teacherHome(), label: 'Học sinh của tôi' }];

export const ADMIN_NAV: NavItem[] = [
  { href: routes.adminHome(), label: 'Tổng quan' },
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
    <Link href={routes.home()} className="flex items-center gap-2 font-bold text-ink-900">
      <span
        aria-hidden
        className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-600 text-sm text-white"
      >
        OP
      </span>
      {compact ? null : <span className="text-base">Olympiad Prep</span>}
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
  return (
    <div className="flex min-h-screen flex-col">
      <header className="sticky top-0 z-20 border-b border-ink-100 bg-white/90 backdrop-blur">
        <div className={cx('mx-auto flex items-center gap-4 px-4 py-3', wide ? 'max-w-screen-2xl' : 'max-w-5xl')}>
          <Logo />
          {areaLabel ? (
            <span className="hidden rounded-md bg-ink-100 px-2 py-0.5 text-xs font-medium text-ink-600 sm:inline">
              {areaLabel}
            </span>
          ) : null}

          <div className="flex-1" />

          {user ? (
            <div className="flex items-center gap-3">
              <span className="hidden text-sm text-ink-600 sm:inline">{user.fullName}</span>
              <Link
                href={routes.account()}
                className="text-sm font-medium text-ink-600 hover:text-brand-700"
              >
                Tài khoản
              </Link>
              <form action="/api/v1/auth/logout" method="post">
                <button type="submit" className="text-sm font-medium text-ink-500 hover:text-rose-600">
                  Đăng xuất
                </button>
              </form>
            </div>
          ) : (
            <div className="flex items-center gap-3">
              <Link href={routes.login()} className="text-sm font-medium text-ink-600 hover:text-brand-700">
                Đăng nhập
              </Link>
              <Link
                href={routes.register()}
                className="rounded-lg bg-brand-600 px-3.5 py-2 text-sm font-medium text-white hover:bg-brand-700"
              >
                Bắt đầu
              </Link>
            </div>
          )}
        </div>

        {nav && nav.length > 0 ? (
          <nav
            className={cx(
              'scroll-x mx-auto flex gap-1 px-4 pb-2',
              wide ? 'max-w-screen-2xl' : 'max-w-5xl',
            )}
          >
            {nav.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="rounded-lg px-3 py-1.5 text-sm font-medium whitespace-nowrap text-ink-600 hover:bg-ink-100 hover:text-ink-900"
              >
                {item.label}
              </Link>
            ))}
          </nav>
        ) : null}
      </header>

      <main className={cx('mx-auto w-full flex-1 px-4 py-6', wide ? 'max-w-screen-2xl' : 'max-w-5xl')}>
        {children}
      </main>

      <SiteFooter />
    </div>
  );
}

export function SiteFooter() {
  return (
    <footer className="mt-10 border-t border-ink-100 bg-white">
      <div className="mx-auto max-w-5xl px-4 py-6 text-sm text-ink-500">
        <p>Nền tảng ôn luyện Olympic cá nhân hóa — ASMOPSS · NEO · STEM · FMC.</p>
        <p className="mt-1 text-xs">
          Dữ liệu học tập của học sinh được bảo vệ theo chính sách bảo mật của đơn vị tổ chức.
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
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <div className="flex min-h-screen flex-col items-center bg-canvas px-4 py-8">
      <div className="w-full max-w-md">
        <div className="mb-6 flex justify-center">
          <Logo />
        </div>
        <div className="rounded-xl bg-white p-6 shadow-sm ring-1 ring-ink-100">
          <h1 className="text-xl font-bold text-ink-900">{title}</h1>
          {subtitle ? <p className="mt-1 text-sm text-ink-500">{subtitle}</p> : null}
          <div className="mt-5">{children}</div>
        </div>
        {footer ? <div className="mt-4 text-center text-sm text-ink-500">{footer}</div> : null}
      </div>
    </div>
  );
}
