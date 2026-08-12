import type { Metadata, Viewport } from 'next';
import { Be_Vietnam_Pro, Lora } from 'next/font/google';
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

export const metadata: Metadata = {
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
  },
};

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
