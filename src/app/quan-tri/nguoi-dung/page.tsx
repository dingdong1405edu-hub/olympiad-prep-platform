import { requireSession, hasRole } from '@/lib/auth';
import { listUsers } from '@/server/identity/service';
import { GRADE_BAND_LABEL } from '@/lib/domain';
import { formatDateVN } from '@/lib/dates';
import { routes } from '@/lib/routes';
import { Alert, EmptyState, FilterBar, Input, LinkButton, PageHeader, Select } from '@/components/ui';
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
  // Khớp ĐÚNG với quyền của API bên dưới (PATCH/POST chỉ nhận hai vai trò này).
  // Trước đây trang dùng requireAdmin() nên Quản lý chương trình mở được trang,
  // thấy đủ nút, bấm cái nào cũng 403 — tệ hơn hẳn việc không cho vào từ đầu.
  //
  // Kiểm tra bằng hasRole chứ không requireRole: trong Server Component, ném lỗi
  // sẽ thành trang lỗi 500 chung chung, trong khi đây chỉ là chuyện thiếu quyền
  // và người dùng xứng đáng được nghe đúng một câu giải thích.
  const session = await requireSession();
  if (!hasRole(session, 'SUPER_ADMIN', 'OPS_ADMIN')) {
    return (
      <div>
        <PageHeader eyebrow="Quản trị" title="Người dùng & phân quyền" />
        <Alert tone="warn" title="Bạn không có quyền quản lý tài khoản">
          Chỉ Super Admin và Admin vận hành mới cấp quyền, khóa hoặc tạo tài khoản được. Nếu bạn cần
          quyền này, hãy nhờ một Super Admin cấp trong chính màn hình này.
        </Alert>
      </div>
    );
  }

  const { search, role, status, page } = await searchParams;

  const pageSize = 40;
  const currentPage = Math.max(1, Number(page) || 1);
  const result = await listUsers({
    search: search || undefined,
    role: (role || undefined) as never,
    status: (status || undefined) as never,
    page: currentPage,
    pageSize,
  });

  const totalPages = Math.max(1, Math.ceil(result.total / pageSize));

  /** Giữ nguyên bộ lọc khi sang trang khác. */
  function pageHref(target: number): string {
    const query = new URLSearchParams();
    if (search) query.set('search', search);
    if (role) query.set('role', role);
    if (status) query.set('status', status);
    if (target > 1) query.set('page', String(target));
    const qs = query.toString();
    return qs ? `${routes.adminUsers()}?${qs}` : routes.adminUsers();
  }

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

      {/* Luôn dựng UsersManager, kể cả khi bộ lọc không ra kết quả: nút "+ Thêm
          tài khoản nhân sự" nằm trong đó. Bản trước thay cả khối bằng EmptyState,
          nên lọc hụt một cái là mất luôn đường tạo tài khoản mới. */}
      <UsersManager
        rows={rows}
        total={result.total}
        currentUserId={session.id}
        canManageSuperAdmin={hasRole(session, 'SUPER_ADMIN')}
      />

      {rows.length === 0 ? (
        <div className="mt-4">
          <EmptyState
            icon="🔍"
            title="Không tìm thấy tài khoản nào"
            description="Thử bỏ bớt bộ lọc, hoặc dùng nút thêm tài khoản ở trên để tạo mới."
          />
        </div>
      ) : null}

      {totalPages > 1 ? (
        <nav
          aria-label="Phân trang"
          className="mt-5 flex flex-wrap items-center justify-between gap-3 text-sm"
        >
          <p className="text-ink-500">
            Trang {currentPage}/{totalPages} · {result.total} tài khoản
          </p>
          <span className="flex gap-2">
            {currentPage > 1 ? (
              <LinkButton href={pageHref(currentPage - 1)} variant="secondary" size="sm">
                ← Trang trước
              </LinkButton>
            ) : null}
            {currentPage < totalPages ? (
              <LinkButton href={pageHref(currentPage + 1)} variant="secondary" size="sm">
                Trang sau →
              </LinkButton>
            ) : null}
          </span>
        </nav>
      ) : null}
    </div>
  );
}
