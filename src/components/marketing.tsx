'use client';

/**
 * Khung riêng cho trang bán hàng.
 *
 * Vì sao không dùng lại AppShell: header của AppShell là thanh công cụ của một
 * ứng dụng — logo nhỏ, nền trắng đục, dính cứng ngay từ pixel đầu. Đặt nó lên
 * đầu trang bán hàng thì khách vào đã thấy "phần mềm nội bộ" trước khi kịp đọc
 * lời chào. Ở đây header nổi trên ảnh hero, chỉ đặc lại khi người đọc bắt đầu
 * cuộn — lúc đó nó mới cần làm nhiệm vụ điều hướng.
 */
import { useEffect, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { routes } from '@/lib/routes';
import { cx } from '@/components/ui';

const SECTIONS = [
  { href: '#ky-thi', label: 'Kỳ thi' },
  { href: '#cach-hoat-dong', label: 'Cách hoạt động' },
  { href: '#phu-huynh', label: 'Cho phụ huynh' },
  { href: '#cau-hoi', label: 'Câu hỏi' },
];

// ---------------------------------------------------------------------------

/** Dấu hiệu thương hiệu: khiên huy chương với chữ lồng, vẽ bằng SVG cho sắc nét. */
export function Crest({ className, tone = 'light' }: { className?: string; tone?: 'light' | 'dark' }) {
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
      {/* Đường gấp khúc đi lên — hình ảnh của tiến bộ, không phải chữ cái */}
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

export function Wordmark({ tone = 'light' }: { tone?: 'light' | 'dark' }) {
  return (
    <Link href={routes.home()} className="group flex items-center gap-2.5">
      <Crest className="h-9 w-9 transition-transform duration-300 group-hover:scale-105" tone={tone} />
      <span className="leading-none">
        <span
          className={cx(
            'font-display block text-[17px] font-bold tracking-tight',
            tone === 'light' ? 'text-navy-900' : 'text-white',
          )}
        >
          Olympiad Prep
        </span>
        <span
          className={cx(
            'mt-0.5 block text-[10px] font-semibold tracking-[0.16em] uppercase',
            tone === 'light' ? 'text-navy-400' : 'text-navy-300',
          )}
        >
          Ôn luyện cá nhân hóa
        </span>
      </span>
    </Link>
  );
}

// ---------------------------------------------------------------------------

export function MarketingHeader({ signedIn }: { signedIn: boolean }) {
  const [scrolled, setScrolled] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  // Khóa cuộn nền khi menu điện thoại đang mở, tránh cuộn hai lớp chồng nhau.
  useEffect(() => {
    document.body.style.overflow = menuOpen ? 'hidden' : '';
    return () => {
      document.body.style.overflow = '';
    };
  }, [menuOpen]);

  return (
    <header
      className={cx(
        'fixed inset-x-0 top-0 z-40 transition-all duration-300',
        scrolled
          ? 'border-b border-navy-100 bg-white/88 backdrop-blur-lg shadow-[0_1px_16px_rgb(13_27_49/0.06)]'
          : 'border-b border-transparent',
      )}
    >
      <div className="mx-auto flex max-w-7xl items-center gap-8 px-5 py-3.5 lg:px-8">
        <Wordmark />

        <nav className="hidden flex-1 items-center gap-1 lg:flex">
          {SECTIONS.map((section) => (
            <a
              key={section.href}
              href={section.href}
              className="rounded-lg px-3 py-2 text-sm font-medium text-navy-600 transition-colors hover:bg-navy-50 hover:text-navy-900"
            >
              {section.label}
            </a>
          ))}
        </nav>

        <div className="ml-auto flex items-center gap-2 lg:ml-0">
          {signedIn ? (
            <Link
              href={routes.myCourses()}
              className="press rounded-lg bg-navy-900 px-5 py-2.5 text-sm font-semibold text-white transition-all hover:bg-navy-800"
            >
              Vào khu học tập
            </Link>
          ) : (
            <>
              <Link
                href={routes.login()}
                className="hidden rounded-lg px-3.5 py-2.5 text-sm font-medium text-navy-700 transition-colors hover:bg-navy-50 sm:block"
              >
                Đăng nhập
              </Link>
              <Link
                href={routes.register()}
                className="press rounded-lg bg-navy-900 px-4 py-2.5 text-sm font-semibold text-white transition-all hover:bg-navy-800 hover:shadow-[0_8px_20px_rgb(13_27_49/0.24)] sm:px-5"
              >
                Kiểm tra miễn phí
              </Link>
            </>
          )}

          <button
            type="button"
            onClick={() => setMenuOpen((open) => !open)}
            className="press -mr-1 rounded-lg p-2 text-navy-700 transition-colors hover:bg-navy-50 lg:hidden"
            aria-label={menuOpen ? 'Đóng menu' : 'Mở menu'}
            aria-expanded={menuOpen}
          >
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden>
              {menuOpen ? (
                <path
                  d="M6 6l12 12M18 6L6 18"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                />
              ) : (
                <path
                  d="M4 7h16M4 12h16M4 17h16"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                />
              )}
            </svg>
          </button>
        </div>
      </div>

      {menuOpen ? (
        <div className="animate-fade-down border-t border-navy-100 bg-white px-5 pb-5 lg:hidden">
          <nav className="flex flex-col py-2">
            {SECTIONS.map((section) => (
              <a
                key={section.href}
                href={section.href}
                onClick={() => setMenuOpen(false)}
                className="border-b border-navy-50 py-3.5 text-[15px] font-medium text-navy-800 last:border-0"
              >
                {section.label}
              </a>
            ))}
          </nav>
          {signedIn ? null : (
            <Link
              href={routes.login()}
              onClick={() => setMenuOpen(false)}
              className="mt-2 block rounded-lg py-3 text-center text-sm font-semibold text-navy-700 ring-1 ring-navy-200"
            >
              Đăng nhập
            </Link>
          )}
        </div>
      ) : null}
    </header>
  );
}

// ---------------------------------------------------------------------------

export function MarketingFooter() {
  const year = new Date().getFullYear();

  return (
    <footer className="bg-navy-950 text-navy-300">
      <div className="mx-auto max-w-7xl px-5 py-14 lg:px-8">
        <div className="grid gap-10 md:grid-cols-[1.4fr_1fr_1fr]">
          <div className="max-w-sm">
            <Wordmark tone="dark" />
            <p className="mt-4 text-sm leading-relaxed text-navy-300">
              Ôn luyện cá nhân hóa cho ASMOPSS, NEO, STEM và FMC. Mỗi học sinh một lộ trình, tính
              lại sau mỗi bài làm.
            </p>
          </div>

          <div>
            <p className="text-xs font-semibold tracking-[0.14em] text-navy-400 uppercase">
              Khám phá
            </p>
            <ul className="mt-4 space-y-2.5 text-sm">
              {SECTIONS.map((section) => (
                <li key={section.href}>
                  <a href={section.href} className="transition-colors hover:text-white">
                    {section.label}
                  </a>
                </li>
              ))}
              <li>
                <Link href={routes.register()} className="transition-colors hover:text-white">
                  Tạo tài khoản
                </Link>
              </li>
            </ul>
          </div>

          <div>
            <p className="text-xs font-semibold tracking-[0.14em] text-navy-400 uppercase">
              Cam kết với phụ huynh
            </p>
            <ul className="mt-4 space-y-2.5 text-sm leading-relaxed">
              <li>Chỉ thu thập dữ liệu cần cho việc học.</li>
              <li>Không dùng dữ liệu học sinh cho mục đích khác.</li>
              <li>Câu hỏi do đội chuyên môn biên soạn và kiểm duyệt.</li>
              <li>AI không tự ra đề, chỉ chọn bài và giải thích.</li>
            </ul>
          </div>
        </div>

        <div className="mt-12 flex flex-wrap items-center justify-between gap-3 border-t border-white/10 pt-6 text-xs text-navy-400">
          <p>© {year} Olympiad Prep. Nền tảng ôn luyện Olympic cá nhân hóa.</p>
          <p className="flex items-center gap-2">
            <span className="h-1.5 w-1.5 rounded-full bg-accent-500" aria-hidden />
            Đang nhận học sinh cho mùa thi {year + 1}
          </p>
        </div>
      </div>
    </footer>
  );
}

// ---------------------------------------------------------------------------

export function MarketingShell({
  signedIn,
  children,
}: {
  signedIn: boolean;
  children: ReactNode;
}) {
  return (
    <div className="flex min-h-screen flex-col overflow-x-clip">
      <MarketingHeader signedIn={signedIn} />
      <main className="flex-1">{children}</main>
      <MarketingFooter />
    </div>
  );
}
