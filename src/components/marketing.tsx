'use client';

/**
 * Khung riêng cho trang bán hàng.
 *
 * Vì sao không dùng lại AppShell: header của AppShell là thanh công cụ của một
 * ứng dụng — logo nhỏ, nền trắng đục, dính cứng ngay từ pixel đầu. Đặt nó lên
 * đầu trang bán hàng thì khách vào đã thấy "phần mềm nội bộ" trước khi kịp đọc
 * lời chào. Ở đây header trong suốt nằm trên hero, chỉ đặc lại khi người đọc
 * bắt đầu cuộn — lúc đó nó mới cần làm nhiệm vụ điều hướng.
 *
 * Cả khung nằm trên nền kem sáng. Bản trước header đặc lại thành trắng đục và
 * chân trang là một mảng navy gần đen; nay cả hai đều là kem, khác nhau ở sắc
 * độ chứ không ở độ tối.
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
  { href: '/thi-thu', copyKey: 'mock' as const },
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
  topbar: string;
  brandName: string;
  brandTagline: string;
  /** Logo admin tải lên; không có thì khiên vẽ sẵn được dùng. */
  brandLogoUrl?: string;
  links: {
    programs: string;
    courses: string;
    mock: string;
    how: string;
    parents: string;
    faq: string;
  };
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

/**
 * Dải thông báo trên cùng.
 *
 * Cuộn theo trang chứ không dính: nó là tin của lúc vừa vào, không phải công cụ
 * cần theo suốt. Header dính bên dưới nó nên khi dải này trôi khỏi màn hình,
 * menu tự lên chiếm chỗ mà không giật.
 */
function AnnouncementBar({ text }: { text: string }) {
  if (!text.trim()) return null;

  return (
    <div className="relative z-50 bg-gradient-to-r from-warm-100 via-warm-150 to-[#ffe7d3] py-2.5 text-center shadow-[inset_0_-1px_0_var(--color-warm-200)]">
      <p className="mx-auto max-w-7xl px-5 text-[12.5px] font-semibold text-brand-700">
        <span
          aria-hidden
          className="mr-2 inline-block h-1.5 w-1.5 animate-[pulse-dot_1.8s_ease-in-out_infinite] rounded-full bg-brand-600 align-middle"
        />
        {text}
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------

export function MarketingHeader({ signedIn, copy }: { signedIn: boolean; copy: ShellCopy }) {
  const [scrolled, setScrolled] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 40);
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
        'sticky top-0 z-40 transition-all duration-300',
        scrolled
          ? 'bg-warm-50/85 shadow-[0_1px_0_var(--color-warm-200),0_20px_40px_-34px_rgb(120_70_45/0.5)] backdrop-blur-lg backdrop-saturate-150'
          : '',
      )}
    >
      <div className="mx-auto flex max-w-7xl items-center gap-8 px-5 py-3.5 lg:px-8">
        <Wordmark
          name={copy.brandName}
          tagline={copy.brandTagline}
          logoUrl={copy.brandLogoUrl}
        />

        <nav className="hidden flex-1 items-center gap-1 lg:flex">
          {sections(copy).map((section) => (
            <Link
              key={section.href}
              href={section.href}
              className="rounded-lg px-3.5 py-2 text-sm font-semibold text-warm-600 transition-colors hover:bg-warm-100 hover:text-brand-700"
            >
              {section.label}
            </Link>
          ))}
        </nav>

        <div className="ml-auto flex items-center gap-2.5 lg:ml-0">
          {signedIn ? (
            <Link
              href={routes.myCourses()}
              className="press btn-fire rounded-xl px-5 py-2.5 text-sm font-bold"
            >
              {copy.ctaSignedIn}
            </Link>
          ) : (
            <>
              <Link
                href={routes.login()}
                className="press btn-soft hidden rounded-xl px-4 py-2.5 text-sm font-semibold sm:block"
              >
                {copy.ctaLogin}
              </Link>
              <Link
                href={routes.register()}
                className="press btn-fire rounded-xl px-4 py-2.5 text-sm font-bold sm:px-5"
              >
                {copy.ctaRegister}
              </Link>
            </>
          )}

          <button
            type="button"
            onClick={() => setMenuOpen((open) => !open)}
            className="press -mr-1 rounded-xl bg-white p-2.5 text-warm-700 shadow-[inset_0_0_0_1.5px_var(--color-warm-250)] transition-colors hover:text-brand-700 lg:hidden"
            aria-label={menuOpen ? 'Đóng menu' : 'Mở menu'}
            aria-expanded={menuOpen}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden>
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
        <div className="animate-fade-down border-t border-warm-200 bg-warm-50/97 px-5 pb-5 backdrop-blur-lg lg:hidden">
          <nav className="flex flex-col py-2">
            {sections(copy).map((section) => (
              <Link
                key={section.href}
                href={section.href}
                onClick={() => setMenuOpen(false)}
                className="border-b border-warm-200 py-3.5 text-[15px] font-semibold text-warm-800 last:border-0"
              >
                {section.label}
              </Link>
            ))}
          </nav>
          {signedIn ? null : (
            <Link
              href={routes.login()}
              onClick={() => setMenuOpen(false)}
              className="press btn-soft mt-2 block rounded-xl py-3 text-center text-sm font-semibold"
            >
              {copy.ctaLogin}
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
    <footer className="bg-warm-100 text-warm-500 shadow-[inset_0_1px_0_var(--color-warm-200)]">
      <div className="mx-auto max-w-7xl px-5 py-16 lg:px-8">
        <div className="grid gap-12 md:grid-cols-[1.4fr_1fr_1.2fr]">
          <div className="max-w-sm">
            <Wordmark
              name={copy.brandName}
              tagline={copy.brandTagline}
              logoUrl={copy.brandLogoUrl}
            />
            <p className="mt-4 text-sm leading-relaxed whitespace-pre-line text-warm-500">
              {copy.footerTagline}
            </p>
          </div>

          <div>
            <p className="text-[11px] font-extrabold tracking-[0.14em] text-brand-700 uppercase">
              {copy.footerExplore}
            </p>
            <ul className="mt-4 space-y-2.5 text-sm">
              {sections(copy).map((section) => (
                <li key={section.href}>
                  <Link href={section.href} className="transition-colors hover:text-brand-700">
                    {section.label}
                  </Link>
                </li>
              ))}
              <li>
                <Link href={routes.register()} className="transition-colors hover:text-brand-700">
                  {copy.footerRegister}
                </Link>
              </li>
            </ul>
          </div>

          <div>
            <p className="text-[11px] font-extrabold tracking-[0.14em] text-brand-700 uppercase">
              {copy.footerPromiseTitle}
            </p>
            <ul className="mt-4 space-y-2.5 text-sm leading-relaxed">
              {copy.footerPromises.map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
          </div>
        </div>

        <div className="mt-14 flex flex-wrap items-center justify-between gap-3 border-t border-warm-250 pt-6 text-xs text-warm-400">
          <p>
            © {year} {copy.footerCopyright}
          </p>
          <p className="flex items-center gap-2">
            <span className="h-1.5 w-1.5 rounded-full bg-brand-500" aria-hidden />
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
    <div className="flex min-h-screen flex-col overflow-x-clip bg-warm-50">
      <AnnouncementBar text={copy.topbar} />
      <MarketingHeader signedIn={signedIn} copy={copy} />
      <main className="flex-1">{children}</main>
      <MarketingFooter copy={copy} />
    </div>
  );
}
