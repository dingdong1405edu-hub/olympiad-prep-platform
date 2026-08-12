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
import { Crest, Wordmark } from '@/components/brand';

// Khiên và chữ ký thương hiệu nay dùng chung với khung ứng dụng — xem
// `src/components/brand.tsx`. Giữ lại lối export cũ để các trang đang import từ
// đây không phải sửa.
export { Crest, Wordmark };

/**
 * Điều hướng của khu vực bán hàng.
 *
 * Hai mục đầu là TRANG THẬT chứ không phải neo trong trang: khách vào từ Google
 * hay từ link chia sẻ có thể đang đứng ở /ky-thi, khi đó "#ky-thi" sẽ không nhảy
 * đi đâu cả. Các mục còn lại vẫn là neo nhưng viết dạng "/#..." để bấm từ bất kỳ
 * trang nào cũng quay về đúng khối trên trang chủ.
 *
 * Nhãn KHÔNG viết cứng ở đây mà nhận từ `ShellCopy` — admin sửa được trong
 * `/quan-tri/giao-dien` mà không cần deploy lại.
 */
const SECTION_HREFS = [
  { href: '/ky-thi', copyKey: 'programs' as const },
  { href: '/khoa-hoc', copyKey: 'courses' as const },
  { href: '/#cach-hoat-dong', copyKey: 'how' as const },
  { href: '/#phu-huynh', copyKey: 'parents' as const },
  { href: '/#cau-hoi', copyKey: 'faq' as const },
];

/**
 * Chữ của khung bán hàng. Là dữ liệu THUẦN chứ không phải hàm tra cứu, vì các
 * thành phần dưới đây chạy ở trình duyệt còn kho chữ nằm dưới database — dữ
 * liệu thuần đi qua ranh giới server/client được, hàm thì không.
 */
export interface ShellCopy {
  brandName: string;
  brandTagline: string;
  links: { programs: string; courses: string; how: string; parents: string; faq: string };
  ctaSignedIn: string;
  ctaLogin: string;
  ctaRegister: string;
  footerTagline: string;
  footerExplore: string;
  footerRegister: string;
  footerPromiseTitle: string;
  footerPromises: string[];
  footerCopyright: string;
  footerSeason: string;
}

function sections(copy: ShellCopy) {
  return SECTION_HREFS.map((item) => ({ href: item.href, label: copy.links[item.copyKey] }));
}

// ---------------------------------------------------------------------------

export function MarketingHeader({ signedIn, copy }: { signedIn: boolean; copy: ShellCopy }) {
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
        <Wordmark name={copy.brandName} tagline={copy.brandTagline} />

        <nav className="hidden flex-1 items-center gap-1 lg:flex">
          {sections(copy).map((section) => (
            <Link
              key={section.href}
              href={section.href}
              className="rounded-lg px-3 py-2 text-sm font-medium text-navy-600 transition-colors hover:bg-navy-50 hover:text-navy-900"
            >
              {section.label}
            </Link>
          ))}
        </nav>

        <div className="ml-auto flex items-center gap-2 lg:ml-0">
          {signedIn ? (
            <Link
              href={routes.myCourses()}
              className="press rounded-lg bg-navy-900 px-5 py-2.5 text-sm font-semibold text-white transition-all hover:bg-navy-800"
            >
              {copy.ctaSignedIn}
            </Link>
          ) : (
            <>
              <Link
                href={routes.login()}
                className="hidden rounded-lg px-3.5 py-2.5 text-sm font-medium text-navy-700 transition-colors hover:bg-navy-50 sm:block"
              >
                {copy.ctaLogin}
              </Link>
              <Link
                href={routes.register()}
                className="press rounded-lg bg-navy-900 px-4 py-2.5 text-sm font-semibold text-white transition-all hover:bg-navy-800 hover:shadow-[0_8px_20px_rgb(13_27_49/0.24)] sm:px-5"
              >
                {copy.ctaRegister}
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
            {sections(copy).map((section) => (
              <Link
                key={section.href}
                href={section.href}
                onClick={() => setMenuOpen(false)}
                className="border-b border-navy-50 py-3.5 text-[15px] font-medium text-navy-800 last:border-0"
              >
                {section.label}
              </Link>
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

export function MarketingFooter({ copy }: { copy: ShellCopy }) {
  const year = new Date().getFullYear();

  return (
    <footer className="bg-navy-950 text-navy-300">
      <div className="mx-auto max-w-7xl px-5 py-14 lg:px-8">
        <div className="grid gap-10 md:grid-cols-[1.4fr_1fr_1fr]">
          <div className="max-w-sm">
            <Wordmark tone="dark" name={copy.brandName} tagline={copy.brandTagline} />
            <p className="mt-4 text-sm leading-relaxed whitespace-pre-line text-navy-300">
              {copy.footerTagline}
            </p>
          </div>

          <div>
            <p className="text-xs font-semibold tracking-[0.14em] text-navy-400 uppercase">
              {copy.footerExplore}
            </p>
            <ul className="mt-4 space-y-2.5 text-sm">
              {sections(copy).map((section) => (
                <li key={section.href}>
                  <Link href={section.href} className="transition-colors hover:text-white">
                    {section.label}
                  </Link>
                </li>
              ))}
              <li>
                <Link href={routes.register()} className="transition-colors hover:text-white">
                  {copy.footerRegister}
                </Link>
              </li>
            </ul>
          </div>

          <div>
            <p className="text-xs font-semibold tracking-[0.14em] text-navy-400 uppercase">
              {copy.footerPromiseTitle}
            </p>
            <ul className="mt-4 space-y-2.5 text-sm leading-relaxed">
              {copy.footerPromises.map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
          </div>
        </div>

        <div className="mt-12 flex flex-wrap items-center justify-between gap-3 border-t border-white/10 pt-6 text-xs text-navy-400">
          <p>
            © {year} {copy.footerCopyright}
          </p>
          <p className="flex items-center gap-2">
            <span className="h-1.5 w-1.5 rounded-full bg-accent-500" aria-hidden />
            {copy.footerSeason} {year + 1}
          </p>
        </div>
      </div>
    </footer>
  );
}

// ---------------------------------------------------------------------------

export function MarketingShell({
  signedIn,
  copy,
  children,
}: {
  signedIn: boolean;
  copy: ShellCopy;
  children: ReactNode;
}) {
  return (
    <div className="flex min-h-screen flex-col overflow-x-clip">
      <MarketingHeader signedIn={signedIn} copy={copy} />
      <main className="flex-1">{children}</main>
      <MarketingFooter copy={copy} />
    </div>
  );
}
