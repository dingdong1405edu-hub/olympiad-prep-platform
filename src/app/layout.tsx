import type { Metadata, Viewport } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: {
    default: 'Ôn luyện Olympic cá nhân hóa bằng AI',
    template: '%s · Olympiad Prep',
  },
  description:
    'Nền tảng ôn luyện ASMOPSS, NEO, STEM, FMC: AI phát hiện lỗ hổng kiến thức của từng học sinh và giao đúng bài cần học mỗi ngày.',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#2f42e0',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="vi">
      <body className="min-h-screen antialiased">{children}</body>
    </html>
  );
}
