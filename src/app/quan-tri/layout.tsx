import type { ReactNode } from 'react';
import { redirect } from 'next/navigation';
import type { Role } from '@prisma/client';
import { ADMIN_ROLES, CONTENT_ROLES, getSession, hasRole } from '@/lib/auth';
import { routes } from '@/lib/routes';
import { ADMIN_NAV, AppShell } from '@/components/shell';
import { Alert } from '@/components/ui';

export const dynamic = 'force-dynamic';

/**
 * Ai được bước vào khu quản trị: nhóm quản trị + nhóm học liệu.
 * Biên soạn viên và reviewer cần vào để làm kho câu hỏi, nhưng từng trang bên
 * trong vẫn tự kiểm tra quyền chi tiết của mình (specs §10.5).
 */
const ADMIN_AREA_ROLES: Role[] = Array.from(new Set([...ADMIN_ROLES, ...CONTENT_ROLES]));

/** Người chỉ làm học liệu không cần thấy menu người dùng / thanh toán. */
const CONTENT_ONLY_NAV = ADMIN_NAV.filter((item) => item.href === routes.adminContent());

export default async function AdminLayout({ children }: { children: ReactNode }) {
  const session = await getSession();
  if (!session) redirect(routes.login(routes.adminHome()));

  const isAdmin = hasRole(session, ...ADMIN_ROLES);
  const canEnter = hasRole(session, ...ADMIN_AREA_ROLES);

  if (!canEnter) {
    return (
      <AppShell
        user={{ id: session.id, fullName: session.fullName, roles: session.roles }}
        areaLabel="Quản trị"
      >
        <Alert tone="warn" title="Bạn chưa có quyền vào khu quản trị">
          Tài khoản của bạn không thuộc nhóm quản trị hoặc nhóm học liệu. Nếu bạn cần quyền biên soạn
          hoặc thẩm định câu hỏi, hãy liên hệ Quản lý chương trình để được cấp vai trò.
        </Alert>
      </AppShell>
    );
  }

  return (
    <AppShell
      user={{ id: session.id, fullName: session.fullName, roles: session.roles }}
      nav={isAdmin ? ADMIN_NAV : CONTENT_ONLY_NAV}
      areaLabel="Quản trị"
      wide
    >
      {children}
    </AppShell>
  );
}
