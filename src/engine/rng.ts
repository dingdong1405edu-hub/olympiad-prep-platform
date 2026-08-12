/**
 * Sinh số giả ngẫu nhiên CÓ HẠT GIỐNG.
 *
 * Engine phải tái lập được: cùng một học sinh + cùng dữ liệu → cùng bộ câu.
 * Nhờ vậy khi vận hành thắc mắc "vì sao em này nhận đúng 15 câu đó", ta chạy
 * lại được y hệt để kiểm chứng, và unit test không bị flaky.
 */

/** Băm chuỗi thành số nguyên 32-bit (FNV-1a). */
export function hashSeed(seed: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < seed.length; i++) {
    hash ^= seed.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

export interface Rng {
  /** Số thực trong [0, 1). */
  next(): number;
  /** Số nguyên trong [min, max]. */
  int(min: number, max: number): number;
  /** Chọn 1 phần tử; trả undefined nếu mảng rỗng. */
  pick<T>(items: T[]): T | undefined;
  /** Trả về bản sao đã xáo trộn (không sửa mảng gốc). */
  shuffle<T>(items: T[]): T[];
}

/** Bộ sinh mulberry32 — nhanh, phân phối đều, đủ tốt cho việc chọn câu hỏi. */
export function createRng(seed: string | number): Rng {
  let state = (typeof seed === 'string' ? hashSeed(seed) : seed >>> 0) || 1;

  const next = (): number => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };

  return {
    next,
    int(min, max) {
      if (max <= min) return min;
      return min + Math.floor(next() * (max - min + 1));
    },
    pick(items) {
      if (items.length === 0) return undefined;
      return items[Math.floor(next() * items.length)];
    },
    shuffle(items) {
      const copy = [...items];
      for (let i = copy.length - 1; i > 0; i--) {
        const j = Math.floor(next() * (i + 1));
        [copy[i], copy[j]] = [copy[j]!, copy[i]!];
      }
      return copy;
    },
  };
}

/**
 * Chia `total` suất theo tỷ lệ, đảm bảo tổng khớp chính xác.
 * Dùng cho: chia số câu theo chương/độ khó/block mà không bị lệch do làm tròn.
 */
export function allocateByWeights(
  total: number,
  weights: Record<string, number>,
): Record<string, number> {
  const keys = Object.keys(weights);
  const result: Record<string, number> = {};
  if (total <= 0 || keys.length === 0) {
    for (const key of keys) result[key] = 0;
    return result;
  }

  const sum = keys.reduce((acc, key) => acc + Math.max(0, weights[key] ?? 0), 0);
  if (sum <= 0) {
    // Không có trọng số hợp lệ → chia đều
    const base = Math.floor(total / keys.length);
    let remainder = total - base * keys.length;
    for (const key of keys) {
      result[key] = base + (remainder-- > 0 ? 1 : 0);
    }
    return result;
  }

  const exact: { key: string; floor: number; frac: number }[] = keys.map((key) => {
    const share = (Math.max(0, weights[key] ?? 0) / sum) * total;
    return { key, floor: Math.floor(share), frac: share - Math.floor(share) };
  });

  let assigned = 0;
  for (const entry of exact) {
    result[entry.key] = entry.floor;
    assigned += entry.floor;
  }

  // Phân phần dư cho các khóa có phần thập phân lớn nhất
  const leftovers = exact.slice().sort((a, b) => b.frac - a.frac);
  let remaining = total - assigned;
  let index = 0;
  while (remaining > 0 && leftovers.length > 0) {
    const entry = leftovers[index % leftovers.length]!;
    result[entry.key] = (result[entry.key] ?? 0) + 1;
    remaining -= 1;
    index += 1;
  }

  return result;
}

/** Giới hạn giá trị vào khoảng [min, max]. */
export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}
