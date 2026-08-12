/**
 * Gom toàn bộ registry sinh câu hỏi.
 *
 * Bộ sinh được tách theo nhóm chương để mỗi file ở kích thước đọc được:
 *   generators.ts            — số học nền tảng (41 bộ sinh) + bộ khung dựng câu
 *   generators-science.ts    — bộ sinh dùng chung cho Lý/Hóa/Sinh/Tin và các khối khác
 *
 * CHƯA VIẾT (taxonomy đã khai báo nhưng file bộ sinh chưa tồn tại):
 *   generators-algebra.ts    — biểu thức, phương trình, bất đẳng thức, dãy số
 *   generators-geometry.ts   — hình học phẳng, tam giác, chu vi–diện tích–thể tích
 *   generators-word.ts       — chuyển động, năng suất, thống kê, suy luận logic
 * Bỏ import ba file này để dự án build được; `findMissingGenerators` bên dưới sẽ
 * liệt kê chính xác các khoá còn thiếu và chặn seed trước khi ghi database.
 * Viết xong file nào thì thêm lại import + spread tương ứng vào ALL_GENERATORS.
 *
 * Thêm chương mới = thêm bộ sinh vào một file rồi khai báo ở đây; bộ khung
 * trong generators.ts không phải sửa.
 */
import { BASE_GENERATORS, generateForTaxonomy, type Gen, type SkillItems } from './generators';
import { SCIENCE_GENERATORS } from './generators-science';
import type { TaxonomySeed } from './taxonomy';
import { flatSkills } from './taxonomy';

export const ALL_GENERATORS: Record<string, Gen> = {
  ...BASE_GENERATORS,
  ...SCIENCE_GENERATORS,
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

export type { SkillItems };
