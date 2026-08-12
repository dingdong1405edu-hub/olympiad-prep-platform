/**
 * KHỞI TẠO / CẬP NHẬT DỮ LIỆU MẪU CHO MÔI TRƯỜNG TRIỂN KHAI.
 *
 * Chạy ngay trước khi web server lên, sau `prisma migrate deploy`.
 *
 * VẤN ĐỀ NÓ GIẢI QUYẾT: `migrate deploy` chỉ dựng BẢNG, không nạp DỮ LIỆU. Một
 * database đúng schema nhưng rỗng làm cả trang chủ lẫn khu quản trị hiện "chưa
 * có kỳ thi nào" — không ai đăng nhập được, không ai tạo được gì, hệ thống nhìn
 * như đang hỏng dù mọi thứ đều chạy.
 *
 * CÁCH QUYẾT ĐỊNH CÓ NẠP HAY KHÔNG — dựa vào CỘT MỐC PHIÊN BẢN:
 * `prisma/seed.ts` ghi `seed.version` vào bảng AppConfig ở bước cuối cùng, sau
 * khi mọi thứ đã xong. Bootstrap so cột mốc đó với `SEED_VERSION` trong mã nguồn:
 *
 *   - trùng nhau      ⇒ dữ liệu đã đúng phiên bản hiện tại, bỏ qua.
 *   - khác / chưa có  ⇒ chạy seed.
 *
 * Cách này xử lý đúng cả ba tình huống mà nếu chỉ "đếm bảng có rỗng không" thì
 * sẽ bỏ sót:
 *   1. Database trống hoàn toàn → chưa có cột mốc → nạp.
 *   2. Nạp dở dang (chết giữa chừng) → cột mốc chưa kịp ghi → nạp lại để bù.
 *      Nếu chỉ nhìn bảng Program (seed ghi ở bước 2/6) thì một lần chết sau bước
 *      đó sẽ để lại database có kỳ thi nhưng KHÔNG có tài khoản nào, và mọi lần
 *      deploy sau đều tưởng đã xong.
 *   3. Dữ liệu mẫu trong mã nguồn đã đổi (thêm bộ sinh câu hỏi, sửa taxonomy)
 *      → phiên bản lệch → nạp lại để bù phần mới. Đây là trường hợp mà cách đếm
 *      bảng rỗng KHÔNG BAO GIỜ phát hiện được: bảng nào cũng có dữ liệu, chỉ là
 *      dữ liệu cũ.
 *
 * Seed viết hoàn toàn bằng `upsert` / `createMany({ skipDuplicates })` nên chạy
 * lại trên dữ liệu sẵn có là an toàn: phần trùng được cập nhật, phần thiếu được
 * thêm, không bản ghi nào bị nhân đôi hay xóa mất.
 *
 * HAI LỐI THOÁT:
 *  - `SKIP_BOOTSTRAP_SEED=1` ⇒ bỏ qua vô điều kiện, cho môi trường mà dữ liệu
 *    được nạp bằng đường khác.
 *  - Nạp hỏng KHÔNG được chặn web server khởi động: thà có trang thiếu dữ liệu
 *    còn hơn service không lên và không ai xem được log.
 *
 * MẬT KHẨU: các tài khoản mẫu dùng `SEED_DEFAULT_PASSWORD`. Trên môi trường
 * chạy thật PHẢI đặt biến này thành mật khẩu riêng — nếu không, tài khoản quản
 * trị sẽ mang đúng mật khẩu ghi trong tài liệu công khai.
 */
import { PrismaClient } from '@prisma/client';
import { SEED_MARKER_KEY, SEED_VERSION } from '../prisma/seed-version';

const prisma = new PrismaClient();

/** Phiên bản dữ liệu đang nằm trong database; null nếu chưa từng nạp xong. */
async function readInstalledVersion(): Promise<string | null> {
  const row = await prisma.appConfig.findUnique({ where: { key: SEED_MARKER_KEY } });
  if (!row) return null;
  const value = row.value;
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    const version = (value as Record<string, unknown>).version;
    if (typeof version === 'string') return version;
  }
  return null;
}

async function main(): Promise<void> {
  if (process.env.SKIP_BOOTSTRAP_SEED === '1') {
    console.log('[bootstrap] SKIP_BOOTSTRAP_SEED=1 — bỏ qua bước nạp dữ liệu.');
    return;
  }

  const installed = await readInstalledVersion();
  if (installed === SEED_VERSION) {
    console.log(`[bootstrap] Dữ liệu mẫu đã ở phiên bản ${SEED_VERSION} — không nạp lại.`);
    return;
  }

  const [programs, questions, users] = await Promise.all([
    prisma.program.count(),
    prisma.questionItem.count(),
    prisma.user.count(),
  ]);
  const before = `chương trình=${programs}, câu hỏi=${questions}, người dùng=${users}`;

  console.log(
    installed === null
      ? `[bootstrap] Chưa có cột mốc phiên bản (hiện có ${before}). Nạp dữ liệu mẫu ${SEED_VERSION}…`
      : `[bootstrap] Dữ liệu đang ở phiên bản ${installed}, mã nguồn ở ${SEED_VERSION} ` +
          `(hiện có ${before}). Nạp bù phần mới…`,
  );

  if (!process.env.SEED_DEFAULT_PASSWORD) {
    console.warn(
      '[bootstrap] ⚠ Chưa đặt SEED_DEFAULT_PASSWORD — tài khoản mẫu sẽ dùng mật khẩu mặc định ' +
        'ghi trong README. Hãy đặt biến này rồi đổi mật khẩu quản trị ngay sau khi đăng nhập.',
    );
  }

  // Import động chứ không import ở đầu file: module seed kéo theo toàn bộ bộ
  // sinh câu hỏi (hơn 100 generator), không cần nạp khi phiên bản đã khớp.
  const { seedDatabase } = await import('../prisma/seed');
  await seedDatabase();

  const [p2, q2, u2] = await Promise.all([
    prisma.program.count(),
    prisma.questionItem.count(),
    prisma.user.count(),
  ]);
  console.log(
    `[bootstrap] Xong. Chương trình ${programs}→${p2}, câu hỏi ${questions}→${q2}, ` +
      `người dùng ${users}→${u2}.`,
  );
}

main()
  .catch((error: unknown) => {
    // Không set exit code khác 0: bước này hỏng thì web vẫn phải lên để còn đọc
    // được log và vào khu quản trị xử lý tay.
    console.error('[bootstrap] Nạp dữ liệu thất bại, bỏ qua và khởi động tiếp:');
    console.error(error instanceof Error ? (error.stack ?? error.message) : error);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
