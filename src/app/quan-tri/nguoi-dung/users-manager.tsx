'use client';

/**
 * QUẢN LÝ NGƯỜI DÙNG VÀ PHÂN QUYỀN.
 *
 * Vai trò được sửa theo lối "chọn xong rồi lưu" chứ không phải bật/tắt là gửi
 * ngay từng cái: cấp quyền thường đi theo cụm (thêm Biên soạn viên và Reviewer
 * cùng lúc), và một thao tác lỡ tay giữa chừng có thể tạo ra trạng thái không ai
 * mong muốn — ví dụ tài khoản mất hết vai trò trong khoảnh khắc giữa hai lời gọi.
 *
 * Máy chủ mới là nơi chốt các quy tắc an toàn (không tự đổi quyền của mình,
 * không gỡ super admin cuối cùng). Ở đây chỉ làm mờ nút và nói trước lý do, để
 * người dùng biết ngay thay vì bấm rồi nhận thông báo lỗi.
 */
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { Role, UserStatus } from '@prisma/client';
import { apiPatch, apiPost } from '@/lib/client';
import { API } from '@/lib/routes';
import { ROLE_LABEL } from '@/lib/domain';
import {
  Alert,
  Badge,
  Button,
  Card,
  CardHeader,
  Input,
  Label,
  Select,
  Table,
  Td,
  Textarea,
  Tr,
  cx,
} from '@/components/ui';
import { Toast, useToast } from '@/components/motion';

/** Vai trò nhân sự — không gồm STUDENT/PARENT vì hai vai trò đó do người dùng tự đăng ký. */
const STAFF_ROLES: Role[] = [
  'TEACHER',
  'CONTENT_EDITOR',
  'REVIEWER',
  'PROGRAM_MANAGER',
  'OPS_ADMIN',
  'SUPER_ADMIN',
];

const ALL_ROLES: Role[] = ['STUDENT', 'PARENT', ...STAFF_ROLES];

const STATUS_LABEL: Record<UserStatus, string> = {
  ACTIVE: 'Hoạt động',
  SUSPENDED: 'Bị khóa',
  PENDING: 'Chờ xác nhận',
};

export interface UserRow {
  id: string;
  fullName: string;
  email: string | null;
  phone: string | null;
  status: UserStatus;
  roles: Role[];
  profile: string;
  createdAt: string;
}

export function UsersManager({
  rows,
  total,
  currentUserId,
  canManageSuperAdmin,
}: {
  rows: UserRow[];
  total: number;
  currentUserId: string;
  canManageSuperAdmin: boolean;
}) {
  const router = useRouter();
  const { toast, show, hide } = useToast();

  const [editing, setEditing] = useState<string | null>(null);
  const [draftRoles, setDraftRoles] = useState<Role[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  function startEdit(row: UserRow) {
    setEditing(row.id);
    setDraftRoles(row.roles);
  }

  function toggleRole(role: Role) {
    setDraftRoles((prev) =>
      prev.includes(role) ? prev.filter((value) => value !== role) : [...prev, role],
    );
  }

  async function saveRoles(row: UserRow) {
    if (draftRoles.length === 0) {
      show('Tài khoản phải có ít nhất một vai trò.', 'error');
      return;
    }
    setBusy(row.id);
    try {
      await apiPatch(`${API.adminUsers}/${row.id}`, { roles: draftRoles });
      show(`Đã cập nhật vai trò của ${row.fullName}.`, 'success');
      setEditing(null);
      router.refresh();
    } catch (error) {
      show(error instanceof Error ? error.message : 'Chưa lưu được vai trò.', 'error');
    } finally {
      setBusy(null);
    }
  }

  async function toggleStatus(row: UserRow) {
    const next: UserStatus = row.status === 'SUSPENDED' ? 'ACTIVE' : 'SUSPENDED';
    const verb = next === 'SUSPENDED' ? 'khóa' : 'mở khóa';
    if (!window.confirm(`Xác nhận ${verb} tài khoản ${row.fullName}?`)) return;

    setBusy(row.id);
    try {
      await apiPatch(`${API.adminUsers}/${row.id}`, { status: next });
      show(`Đã ${verb} tài khoản ${row.fullName}.`, 'success');
      router.refresh();
    } catch (error) {
      show(error instanceof Error ? error.message : 'Chưa đổi được trạng thái.', 'error');
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-5">
      <Toast message={toast.message} tone={toast.tone} onClose={hide} />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-ink-500">{total} tài khoản trong hệ thống.</p>
        <Button type="button" onClick={() => setCreating((open) => !open)}>
          {creating ? 'Đóng biểu mẫu' : '+ Thêm tài khoản nhân sự'}
        </Button>
      </div>

      {creating ? (
        <StaffForm
          canManageSuperAdmin={canManageSuperAdmin}
          onDone={(message) => {
            show(message, 'success');
            setCreating(false);
            router.refresh();
          }}
          onError={(message) => show(message, 'error')}
        />
      ) : null}

      <Table head={['Họ tên', 'Liên hệ', 'Vai trò', 'Hồ sơ', 'Trạng thái', 'Tạo lúc', 'Thao tác']}>
        {rows.map((row) => {
          const isSelf = row.id === currentUserId;
          const open = editing === row.id;
          const locked = busy === row.id;

          return (
            <Tr key={row.id}>
              <Td className="font-medium text-ink-800">
                {row.fullName}
                {isSelf ? <span className="ml-2 text-xs text-ink-400">(bạn)</span> : null}
              </Td>
              <Td className="text-ink-600">
                {row.email ?? '—'}
                {row.phone ? (
                  <>
                    <br />
                    <span className="text-xs text-ink-400">{row.phone}</span>
                  </>
                ) : null}
              </Td>

              <Td>
                {open ? (
                  <div className="min-w-56 space-y-2">
                    <div className="flex flex-wrap gap-1.5">
                      {ALL_ROLES.map((role) => {
                        const checked = draftRoles.includes(role);
                        const blocked = role === 'SUPER_ADMIN' && !canManageSuperAdmin;
                        return (
                          <button
                            key={role}
                            type="button"
                            disabled={blocked}
                            onClick={() => toggleRole(role)}
                            className={cx(
                              'rounded-lg px-2.5 py-1 text-xs font-medium transition-colors',
                              checked
                                ? 'bg-brand-600 text-white'
                                : 'bg-ink-100 text-ink-600 hover:bg-ink-200',
                              blocked && 'cursor-not-allowed opacity-40',
                            )}
                            title={blocked ? 'Chỉ Super Admin mới đổi được quyền này' : undefined}
                          >
                            {ROLE_LABEL[role]}
                          </button>
                        );
                      })}
                    </div>
                    <div className="flex gap-2">
                      <Button
                        type="button"
                        onClick={() => saveRoles(row)}
                        loading={locked}
                        className="px-3 py-1.5 text-xs"
                      >
                        Lưu
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        onClick={() => setEditing(null)}
                        className="px-3 py-1.5 text-xs"
                      >
                        Hủy
                      </Button>
                    </div>
                  </div>
                ) : (
                  <span className="flex flex-wrap gap-1">
                    {row.roles.map((role) => (
                      <Badge key={role} tone={role === 'SUPER_ADMIN' ? 'danger' : 'brand'}>
                        {ROLE_LABEL[role]}
                      </Badge>
                    ))}
                  </span>
                )}
              </Td>

              <Td className="text-ink-600">{row.profile}</Td>
              <Td>
                <Badge
                  tone={
                    row.status === 'ACTIVE' ? 'success' : row.status === 'SUSPENDED' ? 'danger' : 'warn'
                  }
                >
                  {STATUS_LABEL[row.status]}
                </Badge>
              </Td>
              <Td className="whitespace-nowrap text-ink-500">{row.createdAt}</Td>

              <Td>
                {isSelf ? (
                  <span className="text-xs text-ink-400">Không tự đổi</span>
                ) : (
                  <span className="flex flex-wrap gap-1.5">
                    {open ? null : (
                      <button
                        type="button"
                        onClick={() => startEdit(row)}
                        className="text-xs font-medium text-brand-700 underline underline-offset-2 hover:text-brand-800"
                      >
                        Đổi vai trò
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => toggleStatus(row)}
                      disabled={locked}
                      className={cx(
                        'text-xs font-medium underline underline-offset-2 disabled:opacity-40',
                        row.status === 'SUSPENDED'
                          ? 'text-emerald-700 hover:text-emerald-800'
                          : 'text-rose-600 hover:text-rose-700',
                      )}
                    >
                      {row.status === 'SUSPENDED' ? 'Mở khóa' : 'Khóa'}
                    </button>
                  </span>
                )}
              </Td>
            </Tr>
          );
        })}
      </Table>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tạo tài khoản nhân sự
// ---------------------------------------------------------------------------

function StaffForm({
  canManageSuperAdmin,
  onDone,
  onError,
}: {
  canManageSuperAdmin: boolean;
  onDone: (message: string) => void;
  onError: (message: string) => void;
}) {
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [roles, setRoles] = useState<Role[]>(['CONTENT_EDITOR']);
  const [bio, setBio] = useState('');
  const [capacity, setCapacity] = useState('30');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isTeacher = roles.includes('TEACHER');

  async function submit() {
    if (roles.length === 0) {
      setError('Chọn ít nhất một vai trò.');
      return;
    }
    if (!email.trim() && !phone.trim()) {
      setError('Cần ít nhất email hoặc số điện thoại.');
      return;
    }

    setSaving(true);
    setError(null);
    try {
      await apiPost(API.adminUsers, {
        fullName: fullName.trim(),
        email: email.trim() || undefined,
        phone: phone.trim() || undefined,
        password,
        roles,
        bio: isTeacher ? bio.trim() || undefined : undefined,
        capacityPerCycle: isTeacher ? Number(capacity) || undefined : undefined,
      });
      onDone(`Đã tạo tài khoản cho ${fullName.trim()}.`);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Chưa tạo được tài khoản.';
      setError(message);
      onError(message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card className="animate-fade-up ring-brand-200">
      <CardHeader
        title="Thêm tài khoản nhân sự"
        subtitle="Giáo viên, biên soạn viên, reviewer, quản lý chương trình hoặc quản trị viên."
      />

      <form
        onSubmit={(event) => {
          event.preventDefault();
          void submit();
        }}
      >
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <div>
            <Label>Họ tên</Label>
            <Input value={fullName} onChange={(event) => setFullName(event.target.value)} required />
          </div>
          <div>
            <Label hint="dùng để đăng nhập">Email</Label>
            <Input
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="ten@olympiad.vn"
            />
          </div>
          <div>
            <Label hint="thay cho email nếu không có">Số điện thoại</Label>
            <Input value={phone} onChange={(event) => setPhone(event.target.value)} />
          </div>

          <div>
            <Label hint="ít nhất 8 ký tự">Mật khẩu ban đầu</Label>
            <Input
              type="text"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="Nhắc người nhận đổi ngay sau lần đăng nhập đầu"
              required
            />
          </div>

          <div className="sm:col-span-2 lg:col-span-3">
            <Label>Vai trò</Label>
            <div className="flex flex-wrap gap-1.5">
              {STAFF_ROLES.map((role) => {
                const checked = roles.includes(role);
                const blocked = role === 'SUPER_ADMIN' && !canManageSuperAdmin;
                return (
                  <button
                    key={role}
                    type="button"
                    disabled={blocked}
                    onClick={() =>
                      setRoles((prev) =>
                        prev.includes(role) ? prev.filter((value) => value !== role) : [...prev, role],
                      )
                    }
                    className={cx(
                      'rounded-lg px-3 py-1.5 text-sm font-medium transition-colors',
                      checked ? 'bg-brand-600 text-white' : 'bg-ink-100 text-ink-600 hover:bg-ink-200',
                      blocked && 'cursor-not-allowed opacity-40',
                    )}
                  >
                    {ROLE_LABEL[role]}
                  </button>
                );
              })}
            </div>
          </div>

          {isTeacher ? (
            <>
              <div className="sm:col-span-2">
                <Label hint="hiện ở hồ sơ giáo viên">Giới thiệu</Label>
                <Textarea rows={2} value={bio} onChange={(event) => setBio(event.target.value)} />
              </div>
              <div>
                <Label hint="học sinh mỗi chu kỳ 2 tuần">Sức chứa</Label>
                <Select value={capacity} onChange={(event) => setCapacity(event.target.value)}>
                  {['10', '20', '30', '40', '50'].map((value) => (
                    <option key={value} value={value}>
                      {value} học sinh
                    </option>
                  ))}
                </Select>
              </div>
            </>
          ) : null}
        </div>

        {error ? (
          <Alert tone="danger" className="mt-4">
            {error}
          </Alert>
        ) : null}

        <div className="mt-5">
          <Button type="submit" loading={saving}>
            Tạo tài khoản
          </Button>
        </div>
      </form>
    </Card>
  );
}
