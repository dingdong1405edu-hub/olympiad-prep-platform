/**
 * Gom toàn bộ registry sinh câu hỏi.
 *
 * Bộ sinh được tách theo nhóm chương để mỗi file ở kích thước đọc được:
 *   generators.ts             — số học nền tảng (41 bộ sinh) + bộ khung dựng câu
 *   generators-algebra.ts     — biểu thức, phương trình, bất đẳng thức, dãy số
 *   generators-geometry.ts    — điểm/đường/góc và tam giác
 *   generators-area.ts        — chu vi, diện tích, thể tích
 *   generators-word.ts        — chuyển động, năng suất công việc
 *   generators-stat-logic.ts  — thống kê, xác suất, suy luận logic
 *   generators-natural.ts     — tốc độ, khối lượng riêng, nhiệt, công suất
 *   generators-science.ts     — số học, đổi đơn vị, hằng đẳng thức, căn, Pythagore
 *   generators-advanced-math.ts — hệ phương trình, cấp số, logarit, lượng giác, đạo hàm
 *   generators-physics.ts     — xử lý số liệu đo, động học, Newton, Ohm
 *   generators-chemistry.ts   — mol, phần trăm khối lượng, phương trình, nồng độ
 *   generators-biology.ts     — Mendel, ADN, Hardy – Weinberg, protein
 *   generators-it.ts          — hệ đếm, logic, vòng lặp, độ phức tạp thuật toán
 *
 * Thêm chương mới = thêm bộ sinh vào một file rồi khai báo ở đây; bộ khung
 * trong generators.ts không phải sửa.
 */
import { BASE_GENERATORS, generateForTaxonomy, type Gen, type SkillItems } from './generators';
import { ALGEBRA_GENERATORS } from './generators-algebra';
import { GEOMETRY_GENERATORS } from './generators-geometry';
import { AREA_GENERATORS } from './generators-area';
import { WORD_GENERATORS } from './generators-word';
import { STAT_LOGIC_GENERATORS } from './generators-stat-logic';
import { NATURAL_GENERATORS } from './generators-natural';
import { SCIENCE_GENERATORS } from './generators-science';
import { ADVANCED_MATH_GENERATORS } from './generators-advanced-math';
import { PHYSICS_GENERATORS } from './generators-physics';
import { CHEMISTRY_GENERATORS } from './generators-chemistry';
import { BIOLOGY_GENERATORS } from './generators-biology';
import { IT_GENERATORS } from './generators-it';
import type { TaxonomySeed } from './taxonomy';
import { flatSkills } from './taxonomy';

export const ALL_GENERATORS: Record<string, Gen> = {
  ...BASE_GENERATORS,
  ...ALGEBRA_GENERATORS,
  ...GEOMETRY_GENERATORS,
  ...AREA_GENERATORS,
  ...WORD_GENERATORS,
  ...STAT_LOGIC_GENERATORS,
  ...NATURAL_GENERATORS,
  ...SCIENCE_GENERATORS,
  ...ADVANCED_MATH_GENERATORS,
  ...PHYSICS_GENERATORS,
  ...CHEMISTRY_GENERATORS,
  ...BIOLOGY_GENERATORS,
  ...IT_GENERATORS,
};

/** Sinh toàn bộ câu hỏi của một taxonomy. */
export function generateItems(tax: TaxonomySeed, publishedAt: Date): SkillItems[] {
  return generateForTaxonomy(tax, publishedAt, ALL_GENERATORS);
}

/**
 * Kiểm tra mọi kỹ năng đều có bộ sinh TRƯỚC khi chạy seed — thiếu một bộ sinh
 * sẽ làm hỏng giữa chừng, tốn thời gian hơn nhiều so với báo lỗi ngay từ đầu.
 */
export function findMissingGenerators(taxonomies: TaxonomySeed[]): string[] {
  const missing = new Set<string>();
  for (const tax of taxonomies) {
    for (const { skill } of flatSkills(tax)) {
      const key = skill.gen ?? skill.code;
      if (!ALL_GENERATORS[key]) missing.add(`${tax.prefix}:${skill.code} → "${key}"`);
    }
  }
  return [...missing].sort();
}

/**
 * Các taxonomy đã đủ bộ sinh để seed được ngay.
 * Đặc tả §16.0 yêu cầu chạy trọn vòng MỘT môn/khối trước rồi mới mở rộng, nên
 * seed chỉ nạp những taxonomy sẵn sàng và báo rõ phần còn lại thay vì chặn hết.
 */
export function splitReadyTaxonomies(taxonomies: TaxonomySeed[]): {
  ready: TaxonomySeed[];
  pending: { tax: TaxonomySeed; missing: string[] }[];
} {
  const ready: TaxonomySeed[] = [];
  const pending: { tax: TaxonomySeed; missing: string[] }[] = [];

  for (const tax of taxonomies) {
    const missing = [
      ...new Set(
        flatSkills(tax)
          .map(({ skill }) => skill.gen ?? skill.code)
          .filter((key) => !ALL_GENERATORS[key]),
      ),
    ].sort();
    if (missing.length === 0) ready.push(tax);
    else pending.push({ tax, missing });
  }

  return { ready, pending };
}

export type { SkillItems };
