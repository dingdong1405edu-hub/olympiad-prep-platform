/**
 * BA KHU VỰC CỦA SẢN PHẨM và ai vào được khu nào.
 *
 * Để riêng một file vì cả máy chủ (khung `AppShell`) lẫn trình duyệt (biểu mẫu
 * đăng nhập) đều cần cùng một câu trả lời. Trước đây chỉ khung máy chủ biết,
 * nên đăng nhập xong ai cũng bị đưa về `/hoc-tap` — kể cả tài khoản quản trị
 * không hề ghi danh khóa nào, và họ đứng trước màn hình "Bạn chưa ghi danh khóa
 * nào" mà không có lối đi tiếp.
 *
 * File này KHÔNG import gì từ máy chủ (không prisma, không next/headers) để
 * client component dùng được.
 */
import type { Role } from '@prisma/client';
import { routes } from '@/lib/routes';

export type ShellArea = 'student' | 'teacher' | 'admin';

/**
 * Giữ khớp với các hàm canh cửa trong `src/lib/auth.ts` và
 * `src/app/quan-tri/layout.tsx`. Lệch nhau thì giao diện sẽ mời người dùng đi
 * vào một trang mà họ bị chặn ngay khi tới nơi.
 */
export const AREA_ROLES: Record<ShellArea, Role[]> = {
  student: ['STUDENT'],
  teacher: ['TEACHER', 'SUPER_ADMIN', 'PROGRAM_MANAGER'],
  admin: ['SUPER_ADMIN', 'OPS_ADMIN', 'PROGRAM_MANAGER', 'CONTENT_EDITOR', 'REVIEWER'],
};

export const AREA_META: Record<ShellArea, { label: string; href: string }> = {
  student: { label: 'Học tập', href: routes.myCourses() },
  teacher: { label: 'Dạy học', href: routes.teacherHome() },
  admin: { label: 'Quản trị', href: routes.adminHome() },
};

/** Thứ tự hiển thị trên dải chuyển khu vực. */
export const AREA_ORDER: ShellArea[] = ['student', 'teacher', 'admin'];

export function areasFor(roles: Role[]): ShellArea[] {
  return AREA_ORDER.filter((area) => roles.some((role) => AREA_ROLES[area].includes(role)));
}

/**
 * Đăng nhập xong thì đưa người ta về đâu.
 *
 * Ưu tiên ngược với `AREA_ORDER`: người vừa là học sinh vừa là nhân sự thì phần
 * lớn thời gian họ vào để làm việc, không phải để học. Ai không thuộc khu nào
 * (tài khoản phụ huynh chẳng hạn) vẫn về khu học tập như cũ.
 */
export function landingRoute(roles: Role[]): string {
  const areas = areasFor(roles);
  if (areas.includes('admin')) return AREA_META.admin.href;
  if (areas.includes('teacher')) return AREA_META.teacher.href;
  return AREA_META.student.href;
}
