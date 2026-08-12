/**
 * KHỞI TẠO LẦN ĐẦU CHO MÔI TRƯỜNG TRIỂN KHAI.
 *
 * Chạy ngay trước khi web server lên, sau `prisma migrate deploy`.
 *
 * VẤN ĐỀ NÓ GIẢI QUYẾT: `migrate deploy` chỉ dựng BẢNG, không nạp DỮ LIỆU. Một
 * database đúng schema nhưng rỗng làm cả trang chủ lẫn khu quản trị hiện "chưa
 * có kỳ thi nào" — không ai đăng nhập được, không ai tạo được gì, hệ thống nhìn
 * như đang hỏng dù mọi thứ đều chạy.
 *
 * QUY TẮC AN TOÀN — chỉ nạp khi database THỰC SỰ TRỐNG:
 *  - Có từ một chương trình trở lên ⇒ bỏ qua, không đụng gì. Nhờ vậy script này
 *    chạy được ở mọi lần deploy sau mà không bao giờ ghi đè dữ liệu thật.
 *  - `SKIP_BOOTSTRAP_SEED=1` ⇒ bỏ qua vô điều kiện, dành cho môi trường mà dữ
 *    liệu được nạp bằng đường khác.
 *  - Nạp hỏng KHÔNG được chặn web server khởi động: thà có trang trống còn hơn
 *    service không lên và không ai xem được log.
 *
 * MẬT KHẨU: các tài khoản mẫu dùng `SEED_DEFAULT_PASSWORD`. Trên môi trường
 * chạy thật PHẢI đặt biến này thành mật khẩu riêng — nếu không, tài khoản quản
 * trị sẽ mang đúng mật khẩu ghi trong tài liệu công khai.
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main(): Promise<void> {
  if (process.env.SKIP_BOOTSTRAP_SEED === '1') {
    console.log('[bootstrap] SKIP_BOOTSTRAP_SEED=1 — bỏ qua bước nạp dữ liệu.');
    return;
  }

  const programCount = await prisma.program.count();
  if (programCount > 0) {
    console.log(`[bootstrap] Database đã có ${programCount} chương trình — không nạp lại.`);
    return;
  }

  console.log('[bootstrap] Database trống. Đang nạp dữ liệu khởi tạo…');
  if (!process.env.SEED_DEFAULT_PASSWORD) {
    console.warn(
      '[bootstrap] ⚠ Chưa đặt SEED_DEFAULT_PASSWORD — tài khoản mẫu sẽ dùng mật khẩu mặc định ' +
        'ghi trong README. Hãy đặt biến này rồi đổi mật khẩu quản trị ngay sau khi đăng nhập.',
    );
  }

  // Import động chứ không import ở đầu file: module seed kéo theo toàn bộ bộ
  // sinh câu hỏi (hơn 100 generator), không cần nạp khi database đã có dữ liệu.
  const { seedDatabase } = await import('../prisma/seed');
  await seedDatabase();
  console.log('[bootstrap] Nạp dữ liệu khởi tạo xong.');
}

main()
  .catch((error: unknown) => {
    // Không set exit code khác 0: bước này hỏng thì web vẫn phải lên để còn đọc
    // được log và vào khu quản trị xử lý tay.
    console.error('[bootstrap] Nạp dữ liệu khởi tạo thất bại, bỏ qua và khởi động tiếp:');
    console.error(error instanceof Error ? (error.stack ?? error.message) : error);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
