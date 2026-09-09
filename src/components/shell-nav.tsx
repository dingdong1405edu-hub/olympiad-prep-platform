'use client';

/**
 * ĐIỀU HƯỚNG KHU VỰC (học sinh / giáo viên / quản trị).
 *
 * Vì sao cần thành phần riêng thay vì một hàng thẻ liên kết: khu quản trị có 10
 * mục. Trên điện thoại chỉ ba mục đầu lọt vào màn hình, bảy mục còn lại nằm sau
 * một thao tác cuộn ngang KHÔNG có dấu hiệu gì báo là cuộn được. Hệ quả thật:
 * quản trị viên mở máy lên không hề biết có trang "Giao diện" hay "Người dùng",
 * và kết luận là hệ thống không cho sửa chữ, không quản lý được tài khoản.
 *
 * Dưới `sm` đổi hẳn sang một nút mở danh sách dọc — thấy hết mọi mục cùng lúc.
 * Từ `sm` trở lên giữ hàng thẻ ngang như cũ vì lúc đó chúng vừa màn hình.
 */
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cx } from '@/components/ui';
import { NavLink } from '@/components/nav-link';

export interface ShellNavItem {
  href: string;
  label: string;
  exact?: boolean;
}

function isActive(pathname: string, item: ShellNavItem): boolean {
  return item.exact
    ? pathname === item.href
    : pathname === item.href || pathname.startsWith(item.href + '/');
}

export function ShellNav({ items, className }: { items: ShellNavItem[]; className?: string }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);

  const current = items.find((item) => isActive(pathname, item));

  // Đổi trang thì đóng menu — nếu không, trang mới hiện ra sau tấm menu còn mở.
  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  // Bấm ra ngoài hoặc bấm Esc đều đóng. Thiếu hai lối thoát này thì trên điện
  // thoại menu mở ra sẽ che mất nội dung mà không có cách nào bỏ đi.
  useEffect(() => {
    if (!open) return;

    function onPointerDown(event: MouseEvent | TouchEvent) {
      if (!boxRef.current?.contains(event.target as Node)) setOpen(false);
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') setOpen(false);
    }

    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('touchstart', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('touchstart', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  if (items.length === 0) return null;

  return (
    <div className={className}>
      {/* --- Điện thoại: một nút, mở ra thấy hết --- */}
      <div ref={boxRef} className="relative sm:hidden">
        <button
          type="button"
          onClick={() => setOpen((value) => !value)}
          aria-expanded={open}
          aria-haspopup="menu"
          className="press flex min-h-11 w-full items-center justify-between gap-2 rounded-lg bg-warm-50 px-3 py-2 text-sm font-semibold text-warm-900 ring-1 ring-warm-100"
        >
          <span className="truncate">{current?.label ?? 'Chọn mục'}</span>
          <span className="flex shrink-0 items-center gap-1.5 text-xs font-medium text-warm-500">
            {items.length} mục
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              aria-hidden
              className={cx('transition-transform duration-200', open && 'rotate-180')}
            >
              <path
                d="m6 9 6 6 6-6"
                stroke="currentColor"
                strokeWidth="2.2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </span>
        </button>

        {open ? (
          <div
            role="menu"
            className="animate-fade-down absolute inset-x-0 top-full z-40 mt-1.5 max-h-[70vh] overflow-y-auto rounded-xl bg-white p-1.5 ring-1 ring-warm-100 shadow-[0_16px_40px_-12px_rgb(120_70_45/0.35)]"
          >
            {items.map((item) => {
              const active = isActive(pathname, item);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  role="menuitem"
                  aria-current={active ? 'page' : undefined}
                  className={cx(
                    'flex min-h-11 items-center rounded-lg px-3 py-2.5 text-sm transition-colors',
                    active
                      ? 'bg-warm-50 font-semibold text-warm-900'
                      : 'font-medium text-warm-600 hover:bg-warm-50 hover:text-warm-900',
                  )}
                >
                  {item.label}
                </Link>
              );
            })}
          </div>
        ) : null}
      </div>

      {/* --- Màn hình rộng: giữ nguyên hàng thẻ ngang --- */}
      <nav className="scroll-x hidden gap-1 sm:flex">
        {items.map((item) => (
          <NavLink key={item.href} href={item.href} exact={item.exact}>
            {item.label}
          </NavLink>
        ))}
      </nav>
    </div>
  );
}
