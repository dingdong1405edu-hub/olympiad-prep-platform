import { requireAdmin } from '@/lib/auth';
import { listUsers } from '@/server/identity/service';
import { ROLE_LABEL, GRADE_BAND_LABEL } from '@/lib/domain';
import { formatDateVN } from '@/lib/dates';
import { Badge, EmptyState, FilterBar, Input, PageHeader, Table, Td, Tr } from '@/components/ui';

export const dynamic = 'force-dynamic';

export const metadata = { title: 'Người dùng' };

export default async function AdminUsersPage({
  searchParams,
}: {
  searchParams: Promise<{ search?: string; page?: string }>;
}) {
  await requireAdmin();
  const { search, page } = await searchParams;

  const result = await listUsers({
    search: search || undefined,
    page: page ? Number(page) : 1,
    pageSize: 30,
  });

  return (
    <div>
      <PageHeader
        eyebrow="Quản trị"
        title="Người dùng"
        subtitle={`${result.total} tài khoản trong hệ thống.`}
      />

      <FilterBar>
        <form className="flex flex-1 items-end gap-2" method="get">
          <div className="flex-1">
            <label htmlFor="search" className="mb-1.5 block text-sm font-medium text-ink-700">
              Tìm theo tên, email hoặc số điện thoại
            </label>
            <Input id="search" name="search" defaultValue={search ?? ''} placeholder="Nhập từ khóa…" />
          </div>
          <button
            type="submit"
            className="press rounded-lg bg-brand-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-brand-700"
          >
            Tìm
          </button>
        </form>
      </FilterBar>

      {result.rows.length === 0 ? (
        <EmptyState icon="🔍" title="Không tìm thấy tài khoản nào" />
      ) : (
        <Table head={['Họ tên', 'Liên hệ', 'Vai trò', 'Hồ sơ', 'Trạng thái', 'Tạo lúc']}>
          {result.rows.map((user) => (
            <Tr key={user.id}>
              <Td className="font-medium text-ink-800">{user.fullName}</Td>
              <Td className="text-ink-600">
                {user.email ?? '—'}
                {user.phone ? <><br /><span className="text-xs text-ink-400">{user.phone}</span></> : null}
              </Td>
              <Td>
                <span className="flex flex-wrap gap-1">
                  {user.roles.map((r) => (
                    <Badge key={r.role} tone="brand">
                      {ROLE_LABEL[r.role]}
                    </Badge>
                  ))}
                </span>
              </Td>
              <Td className="text-ink-600">
                {user.studentProfile
                  ? `Lớp ${user.studentProfile.actualGrade} · ${GRADE_BAND_LABEL[user.studentProfile.gradeBand]}`
                  : user.teacherProfile
                    ? `Giáo viên · sức chứa ${user.teacherProfile.capacityPerCycle}`
                    : '—'}
              </Td>
              <Td>
                <Badge tone={user.status === 'ACTIVE' ? 'success' : 'warn'}>
                  {user.status === 'ACTIVE' ? 'Hoạt động' : user.status === 'SUSPENDED' ? 'Bị khóa' : 'Chờ xác nhận'}
                </Badge>
              </Td>
              <Td className="whitespace-nowrap text-ink-500">{formatDateVN(user.createdAt)}</Td>
            </Tr>
          ))}
        </Table>
      )}
    </div>
  );
}
