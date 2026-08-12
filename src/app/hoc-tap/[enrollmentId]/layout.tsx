import type { ReactNode } from 'react';
import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth';
import { routes } from '@/lib/routes';
import { AppShell, STUDENT_NAV } from '@/components/shell';
import { getEnrollmentForUser, type EnrollmentSummary } from '@/server/commerce/service';

export const dynamic = 'force-dynamic';

export const metadata = { title: 'Khu vực học tập' };

/**
 * Cổng vào khu vực học của MỘT khóa đã ghi danh.
 *
 * Kiểm tra quyền ở đây một lần cho mọi màn hình con (specs §10.5): học sinh chỉ
 * chạm được dữ liệu của chính mình. Khóa hết hạn vẫn vào được để xem lại lịch sử
 * và gia hạn — từng trang bên trong tự hiển thị cảnh báo và chặn thao tác ghi.
 */
export default async function StudyAreaLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ enrollmentId: string }>;
}) {
  const { enrollmentId } = await params;

  const session = await getSession();
  if (!session) redirect(routes.login(routes.studyDashboard(enrollmentId)));

  let enrollment: EnrollmentSummary | null = null;
  try {
    enrollment = await getEnrollmentForUser(session.id, enrollmentId);
  } catch {
    // Không phải khóa của bạn hoặc mã không tồn tại → đưa về danh sách khóa,
    // không để lộ khóa đó có tồn tại hay không.
    enrollment = null;
  }
  if (!enrollment) redirect(routes.myCourses());

  return (
    <AppShell
      user={{ id: session.id, fullName: session.fullName, roles: session.roles }}
      nav={STUDENT_NAV(enrollmentId)}
      areaLabel={`${enrollment.course.programCode} · ${enrollment.course.subjectLabel}`}
    >
      {children}
    </AppShell>
  );
}
