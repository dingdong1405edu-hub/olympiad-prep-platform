/**
 * Đọc chữ hiển thị trên trang công khai: mặc định trong code + ghi đè từ bảng
 * `SiteCopy`. Có cache ngắn trong tiến trình vì mọi trang bán hàng đều gọi.
 *
 * BA QUYẾT ĐỊNH ĐÁNG GIẢI THÍCH:
 *
 * 1. Bảng DB chỉ lưu phần ĐÃ SỬA. Khóa nào admin chưa đụng thì không có dòng
 *    nào cả. Nhờ vậy "khôi phục bản gốc" chỉ là xóa dòng, và bản gốc trong mã
 *    nguồn vẫn là nguồn sự thật duy nhất khi triển khai môi trường mới.
 *
 * 2. Khóa lạ trả về CHÍNH NÓ (`'home.hero.tile'` → hiện ra chuỗi đó trên trang)
 *    chứ không trả chuỗi rỗng. Gõ sai khóa thì lỗi đập vào mắt ngay ở lần xem
 *    đầu tiên, thay vì để lại một khoảng trắng mà không ai để ý.
 *
 * 3. DB hỏng hoặc chưa migrate thì rơi về mặc định, KHÔNG ném lỗi. Trang bán
 *    hàng phải hiển thị được kể cả khi bảng `SiteCopy` chưa tồn tại — đó chính
 *    là tình huống lúc dựng môi trường mới.
 */
import { prisma } from '@/lib/prisma';
import { COPY_FIELD_BY_KEY, SITE_COPY_DEFAULTS } from './defaults';

export * from './defaults';

const CACHE_TTL_MS = 20_000;

let cache: { value: Record<string, string>; expiresAt: number } | null = null;

/** Hàm tra chữ. Gọi `t('home.hero.title')`. */
export type Copy = (key: string) => string;

/** Bản đồ khóa → chữ đang hiển thị (đã áp ghi đè của admin). */
export async function getCopyMap(): Promise<Record<string, string>> {
  if (cache && cache.expiresAt > Date.now()) return cache.value;

  let merged: Record<string, string> = SITE_COPY_DEFAULTS;
  try {
    const rows = await prisma.siteCopy.findMany();
    if (rows.length > 0) {
      const overrides: Record<string, string> = {};
      for (const row of rows) {
        // Bỏ qua khóa không còn tồn tại trong mã nguồn: chữ cũ của một khối đã
        // gỡ bỏ không được phép sống lại ở chỗ khác.
        if (!(row.key in SITE_COPY_DEFAULTS)) continue;
        overrides[row.key] = row.value;
      }
      merged = { ...SITE_COPY_DEFAULTS, ...overrides };
    }
  } catch {
    merged = SITE_COPY_DEFAULTS;
  }

  cache = { value: merged, expiresAt: Date.now() + CACHE_TTL_MS };
  return merged;
}

/** Hàm tra chữ cho một lần render trang. */
export async function getCopy(): Promise<Copy> {
  const map = await getCopyMap();
  return (key: string) => map[key] ?? key;
}

export interface CopyOverrideRow {
  key: string;
  value: string;
  /** Nội dung gốc trong mã nguồn, để trang quản trị so sánh. */
  defaultValue: string;
  updatedAt: Date;
}

/** Những khóa admin đã ghi đè, dùng cho trang quản trị. */
export async function listCopyOverrides(): Promise<CopyOverrideRow[]> {
  const rows = await prisma.siteCopy.findMany({ orderBy: { key: 'asc' } });
  return rows
    .filter((row) => row.key in SITE_COPY_DEFAULTS)
    .map((row) => ({
      key: row.key,
      value: row.value,
      defaultValue: SITE_COPY_DEFAULTS[row.key],
      updatedAt: row.updatedAt,
    }));
}

export interface SaveCopyResult {
  updated: number;
  restored: number;
  ignored: string[];
}

/**
 * Ghi nội dung admin vừa sửa.
 *
 * Giá trị TRÙNG bản gốc hoặc để TRỐNG được hiểu là "khôi phục mặc định" và xóa
 * hẳn dòng ghi đè. Nếu lưu nguyên si bản gốc vào DB thì sau này sửa lại chữ gốc
 * trong mã nguồn sẽ không có tác dụng — bản sao cũ trong DB vẫn thắng.
 */
export async function saveCopy(
  entries: Record<string, string>,
  updatedById?: string,
): Promise<SaveCopyResult> {
  const ignored: string[] = [];
  const toWrite: { key: string; value: string }[] = [];
  const toDelete: string[] = [];

  for (const [key, raw] of Object.entries(entries)) {
    if (!(key in COPY_FIELD_BY_KEY)) {
      ignored.push(key);
      continue;
    }
    const value = raw.trim();
    if (value === '' || value === SITE_COPY_DEFAULTS[key].trim()) toDelete.push(key);
    else toWrite.push({ key, value });
  }

  await prisma.$transaction([
    ...(toDelete.length > 0
      ? [prisma.siteCopy.deleteMany({ where: { key: { in: toDelete } } })]
      : []),
    ...toWrite.map((row) =>
      prisma.siteCopy.upsert({
        where: { key: row.key },
        create: { key: row.key, value: row.value, updatedById: updatedById ?? null },
        update: { value: row.value, updatedById: updatedById ?? null },
      }),
    ),
  ]);

  invalidateCopyCache();
  return { updated: toWrite.length, restored: toDelete.length, ignored };
}

/** Khôi phục toàn bộ chữ về bản gốc trong mã nguồn. */
export async function resetAllCopy(): Promise<number> {
  const result = await prisma.siteCopy.deleteMany({});
  invalidateCopyCache();
  return result.count;
}

export function invalidateCopyCache(): void {
  cache = null;
}
