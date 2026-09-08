/**
 * ĐỌC/GHI ẢNH CỦA TRANG BÁN HÀNG.
 *
 * Bản song song của `index.ts` (kho chữ), cùng ba nguyên tắc:
 *
 * 1. Bảng `SiteAsset` chỉ chứa ô admin ĐÃ tải ảnh. Ô chưa có ảnh thì không có
 *    dòng nào, và trang tự rơi về hình mặc định khai báo trong `images.ts`.
 *
 * 2. Khóa lạ (ô đã gỡ khỏi mã nguồn nhưng dòng cũ còn trong DB) bị bỏ qua, để
 *    ảnh của một khối đã xóa không sống lại ở chỗ khác.
 *
 * 3. DB hỏng hoặc chưa migrate thì coi như CHƯA CÓ ẢNH NÀO, không ném lỗi.
 *    Trang bán hàng phải hiển thị được kể cả khi bảng `SiteAsset` chưa tồn tại
 *    — đúng tình huống lúc dựng môi trường mới, và cũng là lý do mọi ô ảnh đều
 *    phải có đường lui.
 *
 * MỘT ĐIỀU PHẢI GIỮ: hàm nào chạy trong lúc render trang thì TUYỆT ĐỐI không
 * select cột `data`. Kéo vài megabyte ảnh vào bộ nhớ chỉ để dựng thẻ <img> là
 * cách chắc chắn nhất để giết trang chủ. Bytes chỉ được đọc ở đúng một chỗ:
 * route phục vụ ảnh, mỗi lần một ô.
 */
import { prisma } from '@/lib/prisma';
import { IMAGE_SLOT_BY_KEY } from './images';

const CACHE_TTL_MS = 20_000;

/** Một ô ảnh đã có ảnh, ở dạng trang cần để dựng thẻ <img>. */
export interface SiteImage {
  slot: string;
  /** Đã kèm `?v=` nên trình duyệt cache được vĩnh viễn mà vẫn thấy ảnh mới. */
  url: string;
  width: number | null;
  height: number | null;
}

/** Tra ảnh cho một lần render trang. Trả `null` khi ô còn trống. */
export type Images = (slot: string) => SiteImage | null;

let cache: { value: Record<string, SiteImage>; expiresAt: number } | null = null;

function urlFor(slot: string, version: string): string {
  return `/api/v1/site-assets/${encodeURIComponent(slot)}?v=${encodeURIComponent(version)}`;
}

/** Bản đồ ô → ảnh, chỉ gồm những ô đã có ảnh. Không đọc bytes. */
export async function getImageMap(): Promise<Record<string, SiteImage>> {
  if (cache && cache.expiresAt > Date.now()) return cache.value;

  const map: Record<string, SiteImage> = {};
  try {
    const rows = await prisma.siteAsset.findMany({
      select: { slot: true, version: true, width: true, height: true },
    });
    for (const row of rows) {
      if (!(row.slot in IMAGE_SLOT_BY_KEY)) continue;
      map[row.slot] = {
        slot: row.slot,
        url: urlFor(row.slot, row.version),
        width: row.width,
        height: row.height,
      };
    }
  } catch {
    // Chưa migrate hoặc DB đang trục trặc: coi như chưa có ảnh nào.
  }

  cache = { value: map, expiresAt: Date.now() + CACHE_TTL_MS };
  return map;
}

/** Hàm tra ảnh cho một lần render trang. Gọi `img('home.hero.background')`. */
export async function getImages(): Promise<Images> {
  const map = await getImageMap();
  return (slot: string) => map[slot] ?? null;
}

export interface AssetRow {
  slot: string;
  mimeType: string;
  sizeBytes: number;
  width: number | null;
  height: number | null;
  url: string;
  updatedAt: Date;
}

/** Danh sách ô đã có ảnh, cho trang quản trị. Không đọc bytes. */
export async function listAssets(): Promise<AssetRow[]> {
  const rows = await prisma.siteAsset.findMany({
    orderBy: { slot: 'asc' },
    select: {
      slot: true,
      mimeType: true,
      sizeBytes: true,
      width: true,
      height: true,
      version: true,
      updatedAt: true,
    },
  });
  return rows
    .filter((row) => row.slot in IMAGE_SLOT_BY_KEY)
    .map((row) => ({
      slot: row.slot,
      mimeType: row.mimeType,
      sizeBytes: row.sizeBytes,
      width: row.width,
      height: row.height,
      url: urlFor(row.slot, row.version),
      updatedAt: row.updatedAt,
    }));
}

export interface SaveAssetInput {
  slot: string;
  mimeType: string;
  /**
   * `Uint8Array<ArrayBuffer>` chứ không phải `Buffer`: cột Bytes của Prisma 6
   * đòi đúng kiểu này, còn `Buffer` mặc định mang `ArrayBufferLike` (có thể là
   * bộ nhớ dùng chung giữa các luồng) nên không gán thẳng vào được.
   * `Buffer.from(await file.arrayBuffer())` thỏa kiểu này.
   */
  data: Uint8Array<ArrayBuffer>;
  width: number | null;
  height: number | null;
  updatedById?: string;
}

/**
 * Ghi ảnh vào một ô, đè lên ảnh cũ nếu có.
 *
 * `version` sinh mới mỗi lần ghi. Đây là thứ cho phép route phục vụ ảnh đặt
 * `immutable` với thời hạn một năm: URL của ảnh mới khác URL của ảnh cũ, nên
 * không có bản cũ nào kẹt lại trong trình duyệt khách.
 */
export async function saveAsset(input: SaveAssetInput): Promise<AssetRow> {
  const version = Date.now().toString(36);
  const row = await prisma.siteAsset.upsert({
    where: { slot: input.slot },
    create: {
      slot: input.slot,
      mimeType: input.mimeType,
      sizeBytes: input.data.byteLength,
      width: input.width,
      height: input.height,
      data: input.data,
      version,
      updatedById: input.updatedById ?? null,
    },
    update: {
      mimeType: input.mimeType,
      sizeBytes: input.data.byteLength,
      width: input.width,
      height: input.height,
      data: input.data,
      version,
      updatedById: input.updatedById ?? null,
    },
    select: {
      slot: true,
      mimeType: true,
      sizeBytes: true,
      width: true,
      height: true,
      version: true,
      updatedAt: true,
    },
  });

  invalidateImageCache();
  return { ...row, url: urlFor(row.slot, row.version) };
}

/** Gỡ ảnh khỏi một ô. Trả về false khi ô vốn đã trống. */
export async function deleteAsset(slot: string): Promise<boolean> {
  const result = await prisma.siteAsset.deleteMany({ where: { slot } });
  invalidateImageCache();
  return result.count > 0;
}

/** Đọc bytes của một ô. Chỉ route phục vụ ảnh được gọi hàm này. */
export async function readAssetBytes(
  slot: string,
): Promise<{ mimeType: string; data: Buffer } | null> {
  if (!(slot in IMAGE_SLOT_BY_KEY)) return null;
  const row = await prisma.siteAsset.findUnique({
    where: { slot },
    select: { mimeType: true, data: true },
  });
  if (!row) return null;
  return { mimeType: row.mimeType, data: Buffer.from(row.data) };
}

export function invalidateImageCache(): void {
  cache = null;
}
