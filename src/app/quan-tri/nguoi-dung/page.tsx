import { requireAdmin, hasRole } from '@/lib/auth';
import { listUsers } from '@/server/identity/service';
import { GRADE_BAND_LABEL } from '@/lib/domain';
import { formatDateVN } from '@/lib/dates';
import { EmptyState, FilterBar, Input, PageHeader, Select } from '@/components/ui';
import { UsersManager, type UserRow } from './users-manager';

export const dynamic = 'force-dynamic';

export const metadata = { title: 'Người dùng' };

/**
 * Danh sách tài khoản, cấp quyền và khóa/mở tài khoản.
 *
 * Lọc chạy bằng form GET chứ không phải JavaScript: mỗi bộ lọc là một URL riêng
 * nên gửi được cho đồng nghiệp ("xem giúp danh sách giáo viên đang bị khóa"),
 * và trang danh sách vẫn dùng được khi phần tương tác chưa tải xong.
 */
export default async function AdminUsersPage({
  searchParams,
}: {
  searchParams: Promise<{ search?: string; role?: string; status?: string; page?: string }>;
}) {
  const session = await requireAdmin();
  const { search, role, status, page } = await searchParams;

  const result = await listUsers({
    search: search || undefined,
    role: (role || undefined) as never,
    status: (status || undefined) as never,
    page: page ? Number(page) : 1,
    pageSize: 40,
  });

  const rows: UserRow[] = result.rows.map((user) => ({
    id: user.id,
    fullName: user.fullName,
    email: user.email,
    phone: user.phone,
    status: user.status,
    roles: user.roles.map((entry) => entry.role),
    profile: user.studentProfile
      ? `Lớp ${user.studentProfile.actualGrade} · ${GRADE_BAND_LABEL[user.studentProfile.gradeBand]}`
      : user.teacherProfile
        ? `Giáo viên · sức chứa ${user.teacherProfile.capacityPerCycle}`
        : '—',
    createdAt: formatDateVN(user.createdAt),
  }));

  return (
    <div>
      <PageHeader
        eyebrow="Quản trị"
        title="Người dùng & phân quyền"
        subtitle="Cấp quyền, thêm tài khoản nhân sự, khóa hoặc mở lại tài khoản."
      />

      <FilterBar>
        <form className="flex flex-1 flex-wrap items-end gap-2" method="get">
          <div className="min-w-52 flex-1">
            <label htmlFor="search" className="mb-1.5 block text-sm font-medium text-ink-700">
              Tìm theo tên, email hoặc số điện thoại
            </label>
            <Input id="search" name="search" defaultValue={search ?? ''} placeholder="Nhập từ khóa…" />
          </div>

          <div>
            <label htmlFor="role" className="mb-1.5 block text-sm font-medium text-ink-700">
              Vai trò
            </label>
            <Select id="role" name="role" defaultValue={role ?? ''}>
              <option value="">Tất cả</option>
              <option value="STUDENT">Học sinh</option>
              <option value="TEACHER">Giáo viên</option>
              <option value="CONTENT_EDITOR">Biên soạn viên</option>
              <option value="REVIEWER">Reviewer chuyên môn</option>
              <option value="PROGRAM_MANAGER">Quản lý chương trình</option>
              <option value="OPS_ADMIN">Admin vận hành</option>
              <option value="SUPER_ADMIN">Super Admin</option>
            </Select>
          </div>

          <div>
            <label htmlFor="status" className="mb-1.5 block text-sm font-medium text-ink-700">
              Trạng thái
            </label>
            <Select id="status" name="status" defaultValue={status ?? ''}>
              <option value="">Tất cả</option>
              <option value="ACTIVE">Hoạt động</option>
              <option value="SUSPENDED">Bị khóa</option>
              <option value="PENDING">Chờ xác nhận</option>
            </Select>
          </div>

          <button
            type="submit"
            className="press rounded-lg bg-brand-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-brand-700"
          >
            Lọc
          </button>
        </form>
      </FilterBar>

      {rows.length === 0 ? (
        <EmptyState icon="🔍" title="Không tìm thấy tài khoản nào" />
      ) : (
        <UsersManager
          rows={rows}
          total={result.total}
          currentUserId={session.id}
          canManageSuperAdmin={hasRole(session, 'SUPER_ADMIN')}
        />
      )}
    </div>
  );
}
