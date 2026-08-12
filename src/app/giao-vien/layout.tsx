import type { ReactNode } from 'react';
import { redirect } from 'next/navigation';
import { getSession, hasRole } from '@/lib/auth';
import { routes } from '@/lib/routes';
import { AppShell, TEACHER_NAV } from '@/components/shell';

export const dynamic = 'force-dynamic';

export const metadata = { title: 'Khu vực giáo viên' };

/**
 * Cổng vào khu vực giáo viên.
 *
 * Middleware đã chặn ở tầng edge, nhưng vẫn kiểm tra lại ở đây theo specs §10.5:
 * giáo viên chỉ được xem học sinh của mình, nên không màn hình nào trong khu vực
 * này được render khi chưa xác thực đúng vai trò.
 */
export default async function TeacherAreaLayout({ children }: { children: ReactNode }) {
  const session = await getSession();
  if (!session) redirect(routes.login(routes.teacherHome()));
  if (!hasRole(session, 'TEACHER', 'SUPER_ADMIN', 'PROGRAM_MANAGER')) redirect(routes.home());

  return (
    <AppShell
      wide
      area="teacher"
      areaLabel="Giáo viên"
      nav={TEACHER_NAV}
      user={{ id: session.id, fullName: session.fullName, roles: session.roles }}
    >
      {children}
    </AppShell>
  );
}
