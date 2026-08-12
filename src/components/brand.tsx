/**
 * DẤU HIỆU NHẬN DIỆN DÙNG CHUNG.
 *
 * Trước đây khu bán hàng có khiên huy chương còn khu ứng dụng có ô vuông chữ
 * "OP" — hai logo, hai bảng màu, cùng một sản phẩm. Đăng nhập xong là như bước
 * sang website khác. File này giữ một bản duy nhất cho cả hai bên.
 *
 * KHÔNG có 'use client': để Server Component (khung ứng dụng) lẫn Client
 * Component (khung bán hàng có menu điện thoại) đều import được, và trang không
 * phải tải thêm JavaScript chỉ để vẽ một cái logo.
 */
import Link from 'next/link';
import { routes } from '@/lib/routes';
import { cx } from '@/components/ui';

/** Khiên huy chương với đường gấp khúc đi lên — hình ảnh của tiến bộ. */
export function Crest({
  className,
  tone = 'light',
}: {
  className?: string;
  /** light = đặt trên nền sáng; dark = đặt trên nền navy. */
  tone?: 'light' | 'dark';
}) {
  const plate = tone === 'light' ? 'var(--color-navy-900)' : '#ffffff';
  const mark = tone === 'light' ? 'var(--color-gold-300)' : 'var(--color-navy-900)';

  return (
    <svg viewBox="0 0 40 40" className={className} aria-hidden fill="none">
      <path
        d="M20 2.5 34.5 7.2v13.4c0 8.1-5.7 15-14.5 17.9C11.2 35.6 5.5 28.7 5.5 20.6V7.2L20 2.5Z"
        fill={plate}
      />
      <path
        d="M20 2.5 34.5 7.2v13.4c0 8.1-5.7 15-14.5 17.9C11.2 35.6 5.5 28.7 5.5 20.6V7.2L20 2.5Z"
        stroke={mark}
        strokeOpacity="0.45"
        strokeWidth="1.1"
      />
      <path
        d="M12.5 25.5 17 20.5l3.6 3.4 6.4-8.4"
        stroke={mark}
        strokeWidth="2.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="27" cy="15.5" r="2.1" fill={mark} />
    </svg>
  );
}

export function Wordmark({
  tone = 'light',
  name = 'Olympiad Prep',
  tagline = 'Ôn luyện cá nhân hóa',
  href,
  compact = false,
}: {
  tone?: 'light' | 'dark';
  name?: string;
  tagline?: string;
  /** Đích khi bấm; mặc định về trang chủ. */
  href?: string;
  /** Chỉ hiện khiên, giấu chữ — dùng khi header chật. */
  compact?: boolean;
}) {
  return (
    <Link href={href ?? routes.home()} className="group flex shrink-0 items-center gap-2.5">
      <Crest
        className="h-9 w-9 shrink-0 transition-transform duration-300 group-hover:scale-105"
        tone={tone}
      />
      <span className={cx('leading-none', compact && 'hidden sm:block')}>
        <span
          className={cx(
            'font-display block text-[17px] font-bold tracking-tight',
            tone === 'light' ? 'text-navy-900' : 'text-white',
          )}
        >
          {name}
        </span>
        <span
          className={cx(
            'mt-0.5 block text-[10px] font-semibold tracking-[0.16em] uppercase',
            tone === 'light' ? 'text-navy-400' : 'text-navy-300',
          )}
        >
          {tagline}
        </span>
      </span>
    </Link>
  );
}
