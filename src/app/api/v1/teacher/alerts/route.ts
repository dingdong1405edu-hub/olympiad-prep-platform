import { handle, ok } from '@/lib/http';
import { requireTeacherActor } from '@/server/teacher/actor';
import { listAlerts } from '@/server/teacher/service';

/**
 * Chỉ những học sinh đang có cảnh báo, xếp theo mức nghiêm trọng.
 * Đây là màn hình giáo viên mở đầu ngày làm việc nên không nhận filter —
 * mọi cảnh báo đều phải hiện, không được lọc mất.
 */
export const GET = handle(async () => {
  const actor = await requireTeacherActor();
  const rows = await listAlerts(actor);
  return ok({ rows, total: rows.length });
});
