/**
 * PHIÊN BẢN DỮ LIỆU MẪU.
 *
 * Để riêng một file nhỏ chứ không đặt trong `seed.ts` vì `scripts/bootstrap.ts`
 * cần đọc con số này ở MỌI lần khởi động container, trong khi `seed.ts` kéo theo
 * toàn bộ hơn 100 bộ sinh câu hỏi — nạp chúng chỉ để so một chuỗi là lãng phí.
 *
 * **Tăng `SEED_VERSION` mỗi khi dữ liệu trong `prisma/seed-data/` đổi**: thêm bộ
 * sinh câu hỏi, sửa taxonomy, đổi danh mục khóa học hay bảng giá. Lần deploy kế
 * tiếp sẽ thấy phiên bản lệch và tự nạp bù phần mới.
 *
 * Không tăng thì môi trường đã seed từ trước sẽ đứng mãi ở dữ liệu cũ — mọi bảng
 * đều có dữ liệu nên không dấu hiệu nào cho thấy nó đang thiếu.
 */
export const SEED_VERSION = '2026.08.12-generators-113';

/** Khóa trong bảng AppConfig lưu cột mốc phiên bản đã nạp xong. */
export const SEED_MARKER_KEY = 'seed.version';
