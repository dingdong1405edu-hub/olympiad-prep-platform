import type { Metadata, Viewport } from 'next';
import { Be_Vietnam_Pro, Lora } from 'next/font/google';
import { getImageMap } from '@/lib/copy/assets';
import { appBaseUrl } from '@/server/commerce/gateway';
import './globals.css';

/**
 * Cặp chữ của thương hiệu.
 *
 * Be Vietnam Pro cho phần đọc: đây là bộ chữ được vẽ riêng cho tiếng Việt nên
 * dấu thanh không bị chạm vào dấu mũ — thứ mà Inter và font hệ thống hay hỏng
 * ở các chữ như "ể", "ỗ", "ữ".
 * Lora cho tiêu đề lớn: chân chữ có nét thanh đậm, tạo cảm giác học thuật và
 * lâu đời, tách hẳn khỏi kiểu SaaS chữ tròn ai cũng dùng.
 */
const sans = Be_Vietnam_Pro({
  subsets: ['vietnamese', 'latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-be-vietnam',
  display: 'swap',
});

const serif = Lora({
  subsets: ['vietnamese', 'latin'],
  weight: ['500', '600', '700'],
  style: ['normal', 'italic'],
  variable: '--font-lora',
  display: 'swap',
});

/**
 * Thẻ mô tả trang, có kèm ảnh chia sẻ nếu admin đã tải lên.
 *
 * Là hàm chứ không phải hằng vì phải đọc ô ảnh `site.og.image` từ database.
 * `getImageMap()` có cache 20 giây trong tiến trình nên đây KHÔNG phải một lượt
 * truy vấn cho mỗi lần mở trang, và nó cũng đã tự lui về "chưa có ảnh" khi DB
 * chưa migrate — trang vẫn dựng được như trước.
 *
 * Ảnh khai báo ở layout gốc nên áp cho mọi trang. Đó là chủ ý: link được chia
 * sẻ nhiều nhất không chỉ là trang chủ mà còn là trang từng kỳ thi.
 */
export async function generateMetadata(): Promise<Metadata> {
  const og = (await getImageMap())['site.og.image'];

  return {
    /**
     * BẮT BUỘC phải có khi trang mang ảnh chia sẻ.
     *
     * Facebook và Zalo lấy ảnh bằng máy chủ của họ nên `og:image` phải là URL
     * TUYỆT ĐỐI. Không đặt `metadataBase` thì Next ghép đường dẫn tương đối với
     * `http://localhost:3000` — trên bản chạy thật, mọi link chia sẻ sẽ trỏ ảnh
     * về máy của chính người xem và hiện ra trống trơn.
     *
     * Dùng lại `appBaseUrl()` của khu thanh toán chứ không đọc thẳng `APP_URL`:
     * hàm đó đã xử lý đúng ca `.env` production bị chép nguyên `APP_URL=
     * "http://localhost:3000"` từ máy phát triển — chính là lỗi đã xảy ra một
     * lần với `returnUrl` gửi sang PayOS.
     */
    metadataBase: new URL(appBaseUrl()),
    title: {
      default: 'Ôn luyện Olympic cá nhân hóa bằng AI',
      template: '%s · Olympiad Prep',
    },
    description:
      'Nền tảng ôn luyện ASMOPSS, NEO, STEM, FMC: đo năng lực theo từng kỹ năng nhỏ, phát hiện lỗ hổng của riêng con bạn và giao đúng bài cần học mỗi ngày.',
    openGraph: {
      title: 'Olympiad Prep — Ôn luyện Olympic cá nhân hóa',
      description:
        'Đo theo từng kỹ năng nhỏ. Giao đúng bài con bạn cần hôm nay. Đo lại tiến bộ sau mỗi 14 ngày.',
      locale: 'vi_VN',
      type: 'website',
      images: og
        ? [{ url: og.url, width: og.width ?? undefined, height: og.height ?? undefined }]
        : undefined,
    },
  };
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#0d1b31',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="vi" className={`${sans.variable} ${serif.variable}`}>
      <body className="min-h-screen antialiased">{children}</body>
    </html>
  );
}
