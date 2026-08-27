'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cx } from '@/components/ui';

/**
 * Liên kết điều hướng biết mình có đang được mở hay không.
 * Trạng thái đang mở phải nhận ra được KHÔNG CHỈ bằng màu — nên vừa đổi nền,
 * vừa đậm chữ, vừa có gạch dưới, và gắn aria-current cho trình đọc màn hình.
 */
export function NavLink({
  href,
  children,
  exact = false,
}: {
  href: string;
  children: React.ReactNode;
  /** true = chỉ sáng khi khớp chính xác; dùng cho mục "Tổng quan". */
  exact?: boolean;
}) {
  const pathname = usePathname();
  const active = exact ? pathname === href : pathname === href || pathname.startsWith(href + '/');

  return (
    <Link
      href={href}
      aria-current={active ? 'page' : undefined}
      className={cx(
        'relative rounded-lg px-3 py-1.5 text-sm whitespace-nowrap transition-all duration-200',
        active
          ? 'bg-warm-50 font-semibold text-warm-900'
          : 'font-medium text-warm-500 hover:bg-warm-50 hover:text-warm-800',
      )}
    >
      {children}
      <span
        aria-hidden
        className={cx(
          'absolute inset-x-3 -bottom-[7px] h-0.5 rounded-full bg-gold-400 transition-all duration-300',
          active ? 'opacity-100' : 'scale-x-0 opacity-0',
        )}
        style={{ transformOrigin: 'center' }}
      />
    </Link>
  );
}
