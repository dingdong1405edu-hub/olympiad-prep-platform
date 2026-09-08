/**
 * ẢNH MẪU CỦA TRANG BÁN HÀNG.
 *
 * Bytes nằm trong `prisma/seed-data/site-assets/` dưới dạng FILE THẬT, không
 * phải chuỗi base64 nhúng trong mã. 1.5MB ảnh chuyển sang base64 phình lên 2MB
 * chữ trong một file TypeScript — mọi lần mở file là trình soạn thảo treo, mọi
 * lần đổi một tấm ảnh là một dòng diff dài hai triệu ký tự. Để nguyên dạng nhị
 * phân thì git nén tốt hơn và `git diff` chỉ nói "binary file changed".
 *
 * QUY TẮC QUAN TRỌNG NHẤT Ở ĐÂY: chỉ ghi vào ô CÒN TRỐNG.
 *
 * Seed chạy lại ở mọi lần deploy có đổi `SEED_VERSION`. Nếu nó ghi đè thì tấm
 * ảnh admin vừa thay trên bản chạy thật sẽ lặng lẽ quay về ảnh mẫu sau lần
 * deploy kế tiếp, và không ai hiểu vì sao. Ảnh mẫu là thứ để môi trường mới có
 * cái mà hiện — không phải nguồn sự thật đè lên người vận hành.
 *
 * Hệ quả cần biết: đổi một ảnh mẫu trong thư mục này KHÔNG cập nhật được các
 * môi trường đã seed. Muốn đổi ảnh ở đó thì gỡ ảnh trong `/quan-tri/giao-dien`
 * rồi seed lại, hoặc tải ảnh mới lên thẳng qua giao diện — đó mới là đường dành
 * cho việc này.
 */
import { readFileSync } from 'node:fs';
import type { PrismaClient } from '@prisma/client';
import { IMAGE_SLOT_BY_KEY } from '../src/lib/copy/images';

interface SeedAsset {
  /** Khóa ô ảnh; phải khớp `SITE_IMAGE_GROUPS` trong `src/lib/copy/images.ts`. */
  slot: string;
  file: string;
  mimeType: string;
  width: number;
  height: number;
}

/**
 * Chụp lại đúng những ô đã được dựng trên máy phát triển.
 *
 * Không có ô nào của `home.gallery.4` hay `nav.brand.logo`: hai ô đó cố ý để
 * trống, và trang đã có sẵn đường lui cho chúng (dồn lưới lại, dùng khiên vẽ
 * sẵn). Ô trống trong danh sách này là một lựa chọn, không phải thiếu sót.
 */
const SEED_ASSETS: SeedAsset[] = [
  { slot: 'home.hero.background', file: 'home.hero.background.webp', mimeType: 'image/webp', width: 600, height: 315 },
  { slot: 'home.hero.portrait', file: 'home.hero.portrait.webp', mimeType: 'image/webp', width: 1000, height: 666 },
  { slot: 'home.hero.skillmap', file: 'home.hero.skillmap.webp', mimeType: 'image/webp', width: 1024, height: 768 },
  { slot: 'home.features.1.image', file: 'home.features.1.image.webp', mimeType: 'image/webp', width: 1600, height: 1072 },
  { slot: 'home.features.2.image', file: 'home.features.2.image.webp', mimeType: 'image/webp', width: 1319, height: 879 },
  { slot: 'home.features.3.image', file: 'home.features.3.image.webp', mimeType: 'image/webp', width: 1600, height: 1000 },
  { slot: 'home.gallery.1', file: 'home.gallery.1.webp', mimeType: 'image/webp', width: 1600, height: 1066 },
  { slot: 'home.gallery.2', file: 'home.gallery.2.webp', mimeType: 'image/webp', width: 1200, height: 800 },
  { slot: 'home.gallery.3', file: 'home.gallery.3.webp', mimeType: 'image/webp', width: 2000, height: 1334 },
  { slot: 'home.parents.photo', file: 'home.parents.photo.webp', mimeType: 'image/webp', width: 600, height: 315 },
  { slot: 'home.parents.report', file: 'home.parents.report.webp', mimeType: 'image/webp', width: 1341, height: 894 },
  { slot: 'home.cta.image', file: 'home.cta.image.webp', mimeType: 'image/webp', width: 1341, height: 894 },
  { slot: 'site.og.image', file: 'site.og.image.webp', mimeType: 'image/webp', width: 870, height: 580 },
];

export interface SeedSiteAssetsResult {
  inserted: number;
  kept: number;
  bytes: number;
}

export async function seedSiteAssets(prisma: PrismaClient): Promise<SeedSiteAssetsResult> {
  /*
   * Ô lạ là DỪNG HẲN, không phải bỏ qua.
   *
   * `getImageMap()` lọc im lặng những khóa không còn trong mã nguồn, nên một ô
   * bị đổi tên ở `images.ts` mà quên sửa ở đây sẽ nạp ảnh vào database rồi
   * không bao giờ hiện lên trang — mọi bước đều báo thành công. Ném lỗi ngay
   * lúc seed là chỗ duy nhất phát hiện được điều đó.
   */
  const unknown = SEED_ASSETS.filter((asset) => !(asset.slot in IMAGE_SLOT_BY_KEY));
  if (unknown.length > 0) {
    throw new Error(
      `Ảnh mẫu trỏ tới ô không còn tồn tại trong src/lib/copy/images.ts: ` +
        `${unknown.map((asset) => asset.slot).join(', ')}`,
    );
  }

  // Đọc một lượt xem ô nào đã có người ghi, thay vì hỏi database từng ô một.
  const existing = new Set(
    (await prisma.siteAsset.findMany({ select: { slot: true } })).map((row) => row.slot),
  );

  let inserted = 0;
  let bytes = 0;

  for (const asset of SEED_ASSETS) {
    if (existing.has(asset.slot)) continue;

    const data = readFileSync(new URL(`./seed-data/site-assets/${asset.file}`, import.meta.url));

    await prisma.siteAsset.create({
      data: {
        slot: asset.slot,
        mimeType: asset.mimeType,
        sizeBytes: data.byteLength,
        width: asset.width,
        height: asset.height,
        data,
        // Cùng một `version` cho mọi lần seed là CỐ Ý: chạy lại seed không được
        // làm đổi URL ảnh, nếu không mọi trình duyệt và mọi bộ nhớ đệm của
        // Facebook, Zalo sẽ phải tải lại toàn bộ ảnh chỉ vì một lần deploy.
        version: 'seed',
        updatedById: null,
      },
    });

    inserted += 1;
    bytes += data.byteLength;
  }

  return { inserted, kept: SEED_ASSETS.length - inserted, bytes };
}
