/**
 * TÁC VỤ ĐỊNH KỲ — chạy mỗi ngày một lần (cron / Task Scheduler / job của nền tảng hosting).
 *
 *   npx tsx scripts/maintenance.ts
 *
 * Bốn việc, đều idempotent nên chạy lại nhiều lần trong ngày không gây hại:
 *   1. Hết hạn quyền truy cập đã quá ngày.
 *   2. Đánh dấu các ngày học bị bỏ lỡ (KHÔNG xóa khỏi lịch sử — specs §10.2).
 *   3. Cập nhật lại thống kê chất lượng câu hỏi đang có nhiều lượt làm.
 *   4. Quét và xếp hàng thông báo nhắc học (specs §12).
 */
import { prisma } from '../src/lib/prisma';
import { expireOverdueEnrollments } from '../src/server/commerce/service';
import { markMissedDays } from '../src/server/plan/service';
import { runNotificationSweep } from '../src/server/notification/service';
import { recomputeItemStats } from '../src/server/content/service';

/** Số câu hỏi được tính lại thống kê mỗi lần chạy, để tác vụ không kéo dài vô hạn. */
const ITEM_STATS_BATCH = 200;

async function main(): Promise<void> {
  const startedAt = Date.now();
  console.log('Bắt đầu tác vụ bảo trì —', new Date().toLocaleString('vi-VN'));

  // 1. Hết hạn quyền truy cập
  const expired = await expireOverdueEnrollments();
  console.log(`  • Chuyển ${expired} ghi danh sang trạng thái hết hạn.`);

  // 2. Đánh dấu ngày học bị bỏ lỡ
  const active = await prisma.enrollment.findMany({
    where: { status: 'ACTIVE' },
    select: { id: true },
  });
  let missedTotal = 0;
  for (const enrollment of active) {
    try {
      missedTotal += await markMissedDays(enrollment.id);
    } catch (error) {
      console.error(`    ! Lỗi khi xử lý ghi danh ${enrollment.id}:`, error);
    }
  }
  console.log(`  • Đánh dấu ${missedTotal} ngày học bị bỏ lỡ trên ${active.length} ghi danh.`);

  // 3. Thống kê chất lượng câu hỏi — ưu tiên câu vừa được làm nhiều
  const items = await prisma.questionItem.findMany({
    where: { status: 'PUBLISHED', attempts: { some: {} } },
    orderBy: { updatedAt: 'asc' },
    take: ITEM_STATS_BATCH,
    select: { id: true },
  });
  let recomputed = 0;
  for (const item of items) {
    try {
      await recomputeItemStats(item.id);
      recomputed += 1;
    } catch {
      // Một câu lỗi không được làm dừng cả tác vụ.
    }
  }
  console.log(`  • Tính lại thống kê cho ${recomputed} câu hỏi.`);

  // 4. Thông báo nhắc học
  const sweep = await runNotificationSweep();
  console.log(`  • Xếp hàng ${sweep.queued} thông báo.`);
  for (const [code, count] of Object.entries(sweep.details ?? {})) {
    if (count > 0) console.log(`      - ${code}: ${count}`);
  }

  console.log(`Hoàn tất sau ${Math.round((Date.now() - startedAt) / 1000)} giây.`);
}

main()
  .catch((error) => {
    console.error('Tác vụ bảo trì thất bại:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
