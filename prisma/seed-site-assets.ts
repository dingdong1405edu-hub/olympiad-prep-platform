/**
 * ẢNH MẪU CỦA TRANG BÁN HÀNG.
 *
 * Bytes nằm trong `prisma/seed-data/site-assets/` dưới dạng FILE THẬT, không
 * phải chuỗi base64 nhúng trong mã. 1.5MB ảnh chuyển sang base64 phình lên 2MB
 * chữ trong một file TypeScript — mọi lần mở file là trình soạn thảo treo, mọi
 * lần đổi một tấm ảnh là một dòng diff dài hai triệu ký tự. Để nguyên dạng nhị
 * phân thì git nén tốt hơn và `git diff` chỉ nói "binary file changed".
 *
 * QUY TẮC QUAN TRỌNG NHẤT Ở ĐÂY: không đè ảnh do admin tự tải.
 *
 * Seed chạy lại ở mọi lần deploy có đổi `SEED_VERSION`. Các ảnh do seed trước
 * đó tạo ra được cập nhật để bản product nhận bộ ảnh mới; ảnh được admin tải
 * qua giao diện thì giữ nguyên. Khi chủ động cần ghi đè toàn bộ, chạy seed với
 * `SEED_SITE_ASSETS_FORCE=1`.
 *
 * Hệ quả cần biết: đổi một ảnh mẫu trong thư mục này KHÔNG cập nhật được các
 * môi trường đã seed. Muốn đổi ảnh ở đó thì gỡ ảnh trong `/quan-tri/giao-dien`
 * rồi seed lại, hoặc tải ảnh mới lên thẳng qua giao diện — đó mới là đường dành
 * cho việc này.
 */
import { readFileSync } from 'node:fs';
import type { GradeBand, PrismaClient } from '@prisma/client';
import { courseCoverSlot, resolveImageSlot } from '../src/lib/copy/images';
import { buildCourses } from './seed-data/catalog';

interface SeedAsset {
  /** Khóa ô ảnh; phải khớp `SITE_IMAGE_GROUPS` trong `src/lib/copy/images.ts`. */
  slot: string;
  file: string;
  mimeType: string;
  width: number;
  height: number;
}

/**
 * Chụp lại đúng những ô cố định đã được dựng trên máy phát triển. Ảnh cover
 * của khóa được bổ sung bên dưới từ danh sách course seed để mọi khóa đều có
 * ảnh khi chạy lại database mới.
 */
const STATIC_SEED_ASSETS: SeedAsset[] = [
  { slot: 'home.hero.background', file: 'home.hero.background.webp', mimeType: 'image/webp', width: 2000, height: 1125 },
  { slot: 'home.hero.portrait', file: 'home.hero.portrait.webp', mimeType: 'image/webp', width: 750, height: 1000 },
  { slot: 'home.hero.skillmap', file: 'home.hero.skillmap.webp', mimeType: 'image/webp', width: 1400, height: 875 },
  { slot: 'home.features.1.image', file: 'home.features.1.image.webp', mimeType: 'image/webp', width: 1400, height: 875 },
  { slot: 'home.features.2.image', file: 'home.features.2.image.webp', mimeType: 'image/webp', width: 1400, height: 875 },
  { slot: 'home.features.3.image', file: 'home.features.3.image.webp', mimeType: 'image/webp', width: 1400, height: 875 },
  { slot: 'home.gallery.1', file: 'home.gallery.1.webp', mimeType: 'image/webp', width: 1200, height: 900 },
  { slot: 'home.gallery.2', file: 'home.gallery.2.webp', mimeType: 'image/webp', width: 900, height: 900 },
  { slot: 'home.gallery.3', file: 'home.gallery.3.webp', mimeType: 'image/webp', width: 900, height: 900 },
  { slot: 'home.parents.photo', file: 'home.parents.photo.webp', mimeType: 'image/webp', width: 1000, height: 750 },
  { slot: 'home.parents.report', file: 'home.parents.report.webp', mimeType: 'image/webp', width: 1400, height: 875 },
  { slot: 'home.cta.image', file: 'home.cta.image.webp', mimeType: 'image/webp', width: 1600, height: 686 },
  { slot: 'site.og.image', file: 'site.og.image.webp', mimeType: 'image/webp', width: 1200, height: 630 },

];

/*
 * Dùng lại bộ cover gốc theo khối, tất cả đều là PNG 1200×675. Các slot database
 * vẫn riêng từng khóa nên quản trị viên thay ảnh một khóa không ảnh hưởng các
 * khóa khác. Nhờ cùng tỉ lệ/kích thước, lưới danh mục không bị lệch khi load.
 */
const COURSE_COVER_BY_BAND: Record<GradeBand, Omit<SeedAsset, 'slot'>> = {
  A: { file: 'course.olp-a-math.cover.png', mimeType: 'image/png', width: 1200, height: 675 },
  B: { file: 'course.olp-b-math.cover.png', mimeType: 'image/png', width: 1200, height: 675 },
  C: { file: 'course.olp-c-math.cover.png', mimeType: 'image/png', width: 1200, height: 675 },
  D: { file: 'course.olp-d-math.cover.png', mimeType: 'image/png', width: 1200, height: 675 },
};

const COURSE_COVER_ASSETS: SeedAsset[] = buildCourses().map((course) => ({
  slot: courseCoverSlot(course.programCode, course.gradeBand, course.subject),
  ...COURSE_COVER_BY_BAND[course.gradeBand],
}));

const SEED_ASSETS: SeedAsset[] = [...STATIC_SEED_ASSETS, ...COURSE_COVER_ASSETS];

export interface SeedSiteAssetsResult {
  inserted: number;
  updated: number;
  kept: number;
  removed: number;
  bytes: number;
}

const SEED_ASSET_VERSION = 'seed:2026.09.09-uniform-course-covers';

function isSeedAssetVersion(version: string): boolean {
  return version === 'seed' || version.startsWith('seed:');
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
  const unknown = SEED_ASSETS.filter((asset) => !resolveImageSlot(asset.slot));
  if (unknown.length > 0) {
    throw new Error(
      `Ảnh mẫu trỏ tới ô không còn tồn tại trong src/lib/copy/images.ts: ` +
        `${unknown.map((asset) => asset.slot).join(', ')}`,
    );
  }

  // `home.gallery.4` từng là ảnh tạo từ thư mục tham khảo cục bộ. Chỉ xóa bản
  // do seed tạo, tuyệt đối không đụng tới ảnh quản trị viên đã tự tải lên ô này.
  const removed = await prisma.siteAsset.deleteMany({
    where: {
      slot: 'home.gallery.4',
      OR: [{ version: 'seed' }, { version: { startsWith: 'seed:' } }],
    },
  });

  // Đọc một lượt để chỉ cập nhật ảnh được seed ở lần trước. Bản admin tải lên
  // mang version dạng timestamp, nên được giữ nguyên trừ khi có lệnh ép rõ ràng.
  const existing = new Map(
    (await prisma.siteAsset.findMany({ select: { slot: true, version: true } })).map((row) => [
      row.slot,
      row.version,
    ]),
  );
  const force = process.env.SEED_SITE_ASSETS_FORCE === '1';

  let inserted = 0;
  let updated = 0;
  let kept = 0;
  let bytes = 0;

  for (const asset of SEED_ASSETS) {
    const currentVersion = existing.get(asset.slot);
    if (currentVersion && !force && !isSeedAssetVersion(currentVersion)) {
      kept += 1;
      continue;
    }

    const data = readFileSync(new URL(`./seed-data/site-assets/${asset.file}`, import.meta.url));

    const record = {
      mimeType: asset.mimeType,
      sizeBytes: data.byteLength,
      width: asset.width,
      height: asset.height,
      data,
      version: SEED_ASSET_VERSION,
      updatedById: null,
    };

    if (currentVersion) {
      await prisma.siteAsset.update({ where: { slot: asset.slot }, data: record });
      updated += 1;
    } else {
      await prisma.siteAsset.create({
        data: {
          slot: asset.slot,
          ...record,
        },
      });
      inserted += 1;
    }

    bytes += data.byteLength;
  }

  return { inserted, updated, kept, removed: removed.count, bytes };
}
