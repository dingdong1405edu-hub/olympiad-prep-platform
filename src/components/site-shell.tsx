import type { ReactNode } from 'react';
import { getCopy } from '@/lib/copy';
import { getImages } from '@/lib/copy/assets';
import { MarketingShell, type ShellCopy } from '@/components/marketing';

/**
 * Khung của khu bán hàng, phía máy chủ.
 *
 * `MarketingShell` phải chạy ở trình duyệt (menu điện thoại, hiệu ứng khi cuộn)
 * nên không tự đọc database được. Lớp này đứng giữa: đọc kho chữ ở máy chủ rồi
 * truyền xuống dưới dạng dữ liệu thuần.
 *
 * Nhờ vậy mọi trang bán hàng chỉ cần bọc `<SiteShell>` là có header và footer
 * đúng nội dung admin đã cấu hình, không trang nào phải tự lo phần đó.
 */
export async function SiteShell({
  signedIn,
  children,
}: {
  signedIn: boolean;
  children: ReactNode;
}) {
  const [t, img] = await Promise.all([getCopy(), getImages()]);

  const copy: ShellCopy = {
    topbar: t('nav.topbar'),
    brandName: t('nav.brand.name'),
    brandTagline: t('nav.brand.tagline'),
    brandLogoUrl: img('nav.brand.logo')?.url,
    links: {
      programs: t('nav.link.programs'),
      courses: t('nav.link.courses'),
      mock: t('nav.link.mock'),
      how: t('nav.link.how'),
      parents: t('nav.link.parents'),
      faq: t('nav.link.faq'),
    },
    ctaSignedIn: t('nav.cta.signedIn'),
    ctaLogin: t('nav.cta.login'),
    ctaRegister: t('nav.cta.register'),
    footerTagline: t('footer.tagline'),
    footerExplore: t('footer.column.explore'),
    footerRegister: t('footer.link.register'),
    footerPromiseTitle: t('footer.column.promise'),
    footerPromises: [
      t('footer.promise.1'),
      t('footer.promise.2'),
      t('footer.promise.3'),
      t('footer.promise.4'),
    ],
    footerCopyright: t('footer.copyright'),
    footerSeason: t('footer.season'),
  };

  return (
    <MarketingShell signedIn={signedIn} copy={copy}>
      {children}
    </MarketingShell>
  );
}
