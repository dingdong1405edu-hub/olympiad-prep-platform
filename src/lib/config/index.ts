/**
 * Đọc cấu hình nền tảng: mặc định trong code + ghi đè từ bảng `AppConfig`.
 * Có cache ngắn trong tiến trình để không truy vấn DB mỗi lần engine chạy.
 */
import { prisma } from '@/lib/prisma';
import { DEFAULT_CONFIG, type ConfigGroup, type PlatformConfig } from './defaults';

export * from './defaults';

const CACHE_TTL_MS = 30_000;

let cache: { value: PlatformConfig; expiresAt: number } | null = null;

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/** Ghi đè sâu: giá trị từ DB thắng, khóa thiếu vẫn lấy mặc định. */
function deepMerge<T>(base: T, override: unknown): T {
  if (!isPlainObject(override)) return base;
  if (!isPlainObject(base)) return override as T;

  const out: Record<string, unknown> = { ...base };
  for (const [key, value] of Object.entries(override)) {
    if (!(key in out)) continue; // bỏ qua khóa lạ để tránh cấu hình rác
    out[key] = isPlainObject(value) ? deepMerge(out[key], value) : value;
  }
  return out as T;
}

/** Cấu hình toàn cục đã áp dụng override của admin. */
export async function getConfig(): Promise<PlatformConfig> {
  if (cache && cache.expiresAt > Date.now()) return cache.value;

  let merged: PlatformConfig = DEFAULT_CONFIG;
  try {
    const rows = await prisma.appConfig.findMany({ where: { scope: 'GLOBAL' } });
    merged = rows.reduce<PlatformConfig>((acc, row) => {
      if (!(row.key in acc)) return acc;
      const group = row.key as ConfigGroup;
      return { ...acc, [group]: deepMerge(acc[group], row.value) };
    }, DEFAULT_CONFIG);
  } catch {
    // DB chưa sẵn sàng (build time / migration) → dùng mặc định, không làm sập app.
    merged = DEFAULT_CONFIG;
  }

  cache = { value: merged, expiresAt: Date.now() + CACHE_TTL_MS };
  return merged;
}

/** Lấy một nhóm cấu hình. */
export async function getConfigGroup<K extends ConfigGroup>(group: K): Promise<PlatformConfig[K]> {
  const config = await getConfig();
  return config[group];
}

/** Admin cập nhật một nhóm. Trả về cấu hình sau khi ghi đè. */
export async function setConfigGroup<K extends ConfigGroup>(
  group: K,
  value: Partial<PlatformConfig[K]>,
  updatedById?: string,
): Promise<PlatformConfig[K]> {
  const current = await getConfigGroup(group);
  const next = deepMerge(current, value);

  await prisma.appConfig.upsert({
    where: { key: group },
    create: {
      key: group,
      value: next as object,
      scope: 'GLOBAL',
      updatedById: updatedById ?? null,
    },
    update: { value: next as object, updatedById: updatedById ?? null },
  });

  invalidateConfigCache();
  return next;
}

export function invalidateConfigCache(): void {
  cache = null;
}
