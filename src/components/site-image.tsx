/**
 * HIỂN THỊ MỘT Ô ẢNH CỦA TRANG BÁN HÀNG.
 *
 * VÌ SAO LÀ `<img>` CHỨ KHÔNG PHẢI `next/image`:
 * ảnh ở đây được phục vụ từ một route động của chính ứng dụng
 * (`/api/v1/site-assets/...`). Bộ tối ưu ảnh của Next không xử lý được nguồn đó
 * nếu không khai báo thêm cấu hình, và nếu có khai báo thì nó lại nhân bản ảnh
 * ra một tầng cache thứ hai — trong khi route đã tự đặt `immutable` kèm `?v=`
 * rồi. Đổi lại, trách nhiệm chống giật layout thuộc về file này: kích thước
 * thật đo lúc tải lên đi thẳng vào `width`/`height`, còn ô nào chưa có số đo
 * thì `aspect-ratio` của khai báo trong `images.ts` giữ chỗ.
 *
 * KHÔNG có 'use client': đây chỉ là một thẻ ảnh, không cần JavaScript.
 */
import type { ReactNode } from 'react';
import type { SiteImage as SiteImageData } from '@/lib/copy/assets';
import { cx } from '@/components/ui';

export function SiteImage({
  image,
  alt,
  className,
  aspect,
  /** true ⇒ ảnh nằm trong màn hình đầu tiên, tải ngay thay vì chờ cuộn tới. */
  priority = false,
  sizes,
}: {
  image: SiteImageData | null;
  alt: string;
  className?: string;
  /** Tỉ lệ giữ chỗ khi ảnh chưa có số đo, ví dụ '16 / 9'. */
  aspect?: string;
  priority?: boolean;
  sizes?: string;
}) {
  if (!image) return null;

  const known = image.width !== null && image.height !== null;

  return (
    <img
      src={image.url}
      // Alt rỗng là chủ ý với ảnh trang trí: trình đọc màn hình bỏ qua hẳn thay
      // vì đọc to một câu vô nghĩa. Chỉ đúng khi thẻ không mang thông tin nào
      // mà phần chữ xung quanh chưa nói.
      alt={alt}
      width={known ? (image.width as number) : undefined}
      height={known ? (image.height as number) : undefined}
      loading={priority ? 'eager' : 'lazy'}
      decoding={priority ? 'sync' : 'async'}
      fetchPriority={priority ? 'high' : undefined}
      sizes={sizes}
      className={cx('block h-auto w-full object-cover', className)}
      style={known ? undefined : { aspectRatio: aspect }}
    />
  );
}

/**
 * MỘT KHỐI MINH HỌA: ảnh chụp nếu admin đã tải, không thì giữ hình vẽ.
 *
 * Vì sao là component riêng chứ không phải một câu điều kiện tại chỗ: có năm
 * khối như vậy trên trang chủ, và cả năm phải rơi về hình vẽ theo ĐÚNG một cách.
 * Viết tay năm lần thì chỉ cần một lần quên `overflow-hidden` là ảnh tràn ra
 * ngoài bốn góc bo của khung, và lỗi đó chỉ lộ ra ở đúng một khối.
 *
 * Ảnh lấp đầy khung, không có viền trắng: đây là ảnh chụp màn hình sản phẩm,
 * chính nó đã là một tấm thẻ có nền trắng rồi. Thêm một khung trắng nữa quanh nó
 * là hai lớp thẻ lồng nhau.
 */
export function VisualSlot({
  image,
  alt,
  aspect,
  className,
  priority = false,
  sizes,
  children,
}: {
  image: SiteImageData | null;
  alt: string;
  aspect?: string;
  /** Lớp của khung — truyền đúng lớp mà hình vẽ đang nhận, để hai bên thay nhau được. */
  className?: string;
  priority?: boolean;
  sizes?: string;
  /** Hình vẽ dùng khi ô còn trống. */
  children: ReactNode;
}) {
  if (!image) return <>{children}</>;

  return (
    <div className={cx('overflow-hidden', className)}>
      <SiteImage image={image} alt={alt} aspect={aspect} priority={priority} sizes={sizes} />
    </div>
  );
}
