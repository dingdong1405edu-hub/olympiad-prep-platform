import { requireSession } from '@/lib/auth';
import { getUserDetail } from '@/server/identity/service';
import { listEnrollmentsForUser } from '@/server/commerce/service';
import { formatVnd, GRADE_BAND_LABEL, ROLE_LABEL } from '@/lib/domain';
import { routes } from '@/lib/routes';
import { AppShell } from '@/components/shell';
import { Badge, Card, CardHeader, LinkButton, PageHeader, Table, Td, Tr } from '@/components/ui';
import { ChangePasswordForm } from './account-form';

export const dynamic = 'force-dynamic';

export const metadata = { title: 'Tài khoản' };

export default async function AccountPage() {
  const session = await requireSession();
  const [detail, enrollments] = await Promise.all([
    getUserDetail(session.id),
    listEnrollmentsForUser(session.id),
  ]);

  return (
    <AppShell user={{ id: session.id, fullName: session.fullName, roles: session.roles }}>
      <div className="mx-auto max-w-3xl">
        <PageHeader title="Tài khoản của tôi" subtitle="Thông tin cá nhân, khóa học và bảo mật." />

        <Card className="mb-6">
          <CardHeader title="Thông tin cá nhân" />
          <dl className="grid gap-3 sm:grid-cols-2">
            <div>
              <dt className="text-sm text-ink-500">Họ và tên</dt>
              <dd className="font-medium text-ink-900">{detail.fullName}</dd>
            </div>
            <div>
              <dt className="text-sm text-ink-500">Email</dt>
              <dd className="font-medium text-ink-900">{detail.email ?? '—'}</dd>
            </div>
            <div>
              <dt className="text-sm text-ink-500">Số điện thoại</dt>
              <dd className="font-medium text-ink-900">{detail.phone ?? '—'}</dd>
            </div>
            <div>
              <dt className="text-sm text-ink-500">Vai trò</dt>
              <dd className="mt-0.5 flex flex-wrap gap-1.5">
                {detail.roles.map((entry) => {
                  // getUserDetail trả bản ghi UserRole, không phải chuỗi vai trò.
                  const role = typeof entry === 'string' ? entry : entry.role;
                  return (
                    <Badge key={role} tone="brand">
                      {ROLE_LABEL[role]}
                    </Badge>
                  );
                })}
              </dd>
            </div>
            {detail.studentProfile ? (
              <>
                <div>
                  <dt className="text-sm text-ink-500">Lớp</dt>
                  <dd className="font-medium text-ink-900">
                    Lớp {detail.studentProfile.actualGrade} ·{' '}
                    {GRADE_BAND_LABEL[detail.studentProfile.gradeBand]}
                  </dd>
                </div>
                <div>
                  <dt className="text-sm text-ink-500">Trường</dt>
                  <dd className="font-medium text-ink-900">
                    {detail.studentProfile.school ?? '—'}
                  </dd>
                </div>
              </>
            ) : null}
          </dl>
        </Card>

        <Card className="mb-6">
          <CardHeader
            title="Khóa học đã đăng ký"
            action={
              <LinkButton href={routes.myCourses()} variant="secondary" size="sm">
                Vào học
              </LinkButton>
            }
          />
          {enrollments.length === 0 ? (
            <p className="text-sm text-ink-500">Bạn chưa đăng ký khóa nào.</p>
          ) : (
            <Table head={['Khóa học', 'Nguồn', 'Hết hạn', 'Trạng thái']}>
              {enrollments.map((enrollment) => (
                <Tr key={enrollment.id}>
                  <Td>
                    <span className="font-medium text-ink-800">
                      {enrollment.course.programName}
                    </span>
                    <br />
                    <span className="text-xs text-ink-500">
                      {enrollment.course.subjectLabel} · {enrollment.course.gradeBandLabel}
                    </span>
                  </Td>
                  <Td className="text-ink-600">{enrollment.sourceLabel}</Td>
                  <Td className="whitespace-nowrap">
                    {enrollment.expiresAtLabel}
                    <br />
                    <span className="text-xs text-ink-400">còn {enrollment.daysLeft} ngày</span>
                  </Td>
                  <Td>
                    <Badge tone={enrollment.status === 'ACTIVE' ? 'success' : 'neutral'}>
                      {enrollment.statusLabel}
                    </Badge>
                  </Td>
                </Tr>
              ))}
            </Table>
          )}
        </Card>

        <Card>
          <CardHeader
            title="Đổi mật khẩu"
            subtitle="Dùng mật khẩu riêng cho tài khoản học tập, ít nhất 8 ký tự."
          />
          <ChangePasswordForm />
        </Card>

        <p className="mt-6 text-xs text-ink-400">
          Hệ thống chỉ thu thập thông tin cần cho việc học. Dữ liệu học tập của học sinh không được
          dùng cho mục đích nào khác. Phụ huynh có thể yêu cầu cập nhật hoặc xóa dữ liệu bất cứ lúc
          nào qua bộ phận hỗ trợ.
        </p>
      </div>
    </AppShell>
  );
}
