/**
 * Cầu nối giữa phiên đăng nhập và `TeacherActor` của service.
 *
 * Tách riêng khỏi `service.ts` vì service phải chạy được cả trong script cron
 * (không có request, không có cookie), còn hàm dưới đây bắt buộc cần phiên.
 */
import { hasRole, requireTeacher } from '@/lib/auth';
import type { TeacherActor } from './service';

/**
 * Người đang đăng nhập, kèm cờ "giám sát toàn hệ thống".
 * Giáo viên thường chỉ thấy học sinh mình phụ trách; quản lý chương trình và
 * super admin thấy tất cả để hỗ trợ vận hành (specs §10.5).
 */
export async function requireTeacherActor(): Promise<TeacherActor & { fullName: string }> {
  const session = await requireTeacher();
  return {
    userId: session.id,
    isOverseer: hasRole(session, 'SUPER_ADMIN', 'PROGRAM_MANAGER'),
    fullName: session.fullName,
  };
}
