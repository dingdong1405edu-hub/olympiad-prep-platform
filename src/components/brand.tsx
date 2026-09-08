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
  // Khiên nay là gradient lửa thay cho mảng navy đặc: nó phải đứng được trên nền
  // kem của cả trang bán hàng lẫn khu học tập mà vẫn là vật đậm màu nhất góc đó.
  const solid = tone === 'light' ? undefined : '#ffffff';
  const mark = tone === 'light' ? '#ffffff' : 'var(--color-brand-600)';
  const gradientId = 'crest-flame';

  return (
    <svg viewBox="0 0 40 40" className={className} aria-hidden fill="none">
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="var(--color-brand-600)" />
          <stop offset="60%" stopColor="var(--color-brand-400)" />
          <stop offset="100%" stopColor="var(--color-gold-400)" />
        </linearGradient>
      </defs>
      <path
        d="M20 2.5 34.5 7.2v13.4c0 8.1-5.7 15-14.5 17.9C11.2 35.6 5.5 28.7 5.5 20.6V7.2L20 2.5Z"
        fill={solid ?? `url(#${gradientId})`}
      />
      <path
        d="M20 2.5 34.5 7.2v13.4c0 8.1-5.7 15-14.5 17.9C11.2 35.6 5.5 28.7 5.5 20.6V7.2L20 2.5Z"
        stroke={mark}
        strokeOpacity="0.35"
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
  logoUrl,
}: {
  tone?: 'light' | 'dark';
  name?: string;
  tagline?: string;
  /** Đích khi bấm; mặc định về trang chủ. */
  href?: string;
  /** Chỉ hiện khiên, giấu chữ — dùng khi header chật. */
  compact?: boolean;
  /**
   * Logo admin đã tải lên trong `/quan-tri/giao-dien`. Không có thì dùng khiên
   * vẽ sẵn — khu ứng dụng và các trang phụ không truyền gì nên vẫn như cũ.
   */
  logoUrl?: string;
}) {
  return (
    <Link href={href ?? routes.home()} className="group flex shrink-0 items-center gap-2.5">
      {logoUrl ? (
        // Kích thước ép cứng bằng class chứ không dựa vào tỉ lệ ảnh: logo lệch
        // vuông vẫn phải nằm gọn trong ô 36px, không được đẩy cao thanh menu.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={logoUrl}
          alt=""
          width={36}
          height={36}
          className="h-9 w-9 shrink-0 object-contain transition-transform duration-300 group-hover:scale-105"
        />
      ) : (
        <Crest
          className="h-9 w-9 shrink-0 transition-transform duration-300 group-hover:scale-105"
          tone={tone}
        />
      )}
      <span className={cx('leading-none', compact && 'hidden sm:block')}>
        <span
          className={cx(
            'font-display block text-[17px] font-bold tracking-tight',
            tone === 'light' ? 'text-warm-900' : 'text-white',
          )}
        >
          {name}
        </span>
        <span
          className={cx(
            'mt-0.5 block text-[10px] font-semibold tracking-[0.16em] uppercase',
            tone === 'light' ? 'text-warm-400' : 'text-warm-200',
          )}
        >
          {tagline}
        </span>
      </span>
    </Link>
  );
}
