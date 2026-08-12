import { requireRole } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { formatDateTimeVN } from '@/lib/dates';
import { EmptyState, PageHeader, Table, Td, Tr, Badge } from '@/components/ui';

export const dynamic = 'force-dynamic';

export const metadata = { title: 'Nhật ký hệ thống' };

const PAGE_SIZE = 40;

/**
 * Nhật ký kiểm toán. Đặc tả §14 yêu cầu ghi lại mọi thay đổi câu hỏi, điểm số
 * override, quyền truy cập và ghi chú quan trọng — đây là nơi tra cứu chúng.
 */
export default async function AdminAuditPage({
  searchParams,
}: {
  searchParams: Promise<{ entityType?: string; page?: string }>;
}) {
  await requireRole('SUPER_ADMIN', 'PROGRAM_MANAGER');
  const { entityType, page } = await searchParams;
  const currentPage = Math.max(1, Number(page) || 1);

  const where = entityType ? { entityType } : {};

  const [rows, total, types] = await Promise.all([
    prisma.auditLog.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (currentPage - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    }),
    prisma.auditLog.count({ where }),
    prisma.auditLog.groupBy({ by: ['entityType'], _count: true }),
  ]);

  const actorIds = [...new Set(rows.map((r) => r.actorId).filter((id): id is string => Boolean(id)))];
  const actors = actorIds.length
    ? await prisma.user.findMany({
        where: { id: { in: actorIds } },
        select: { id: true, fullName: true },
      })
    : [];
  const actorName = new Map(actors.map((a) => [a.id, a.fullName]));

  return (
    <div>
      <PageHeader
        eyebrow="Quản trị"
        title="Nhật ký hệ thống"
        subtitle={`${total.toLocaleString('vi-VN')} bản ghi. Ai đã đổi gì, lúc nào, giá trị trước và sau.`}
      />

      <div className="mb-4 flex flex-wrap gap-2">
        <a
          href="/quan-tri/nhat-ky"
          className={
            !entityType
              ? 'press rounded-lg bg-brand-600 px-3 py-1.5 text-sm font-medium text-white'
              : 'press rounded-lg bg-white px-3 py-1.5 text-sm font-medium text-ink-600 ring-1 ring-ink-200'
          }
        >
          Tất cả
        </a>
        {types.map((t) => (
          <a
            key={t.entityType}
            href={`/quan-tri/nhat-ky?entityType=${encodeURIComponent(t.entityType)}`}
            className={
              entityType === t.entityType
                ? 'press rounded-lg bg-brand-600 px-3 py-1.5 text-sm font-medium text-white'
                : 'press rounded-lg bg-white px-3 py-1.5 text-sm font-medium text-ink-600 ring-1 ring-ink-200'
            }
          >
            {t.entityType} ({t._count})
          </a>
        ))}
      </div>

      {rows.length === 0 ? (
        <EmptyState
          icon="📋"
          title="Chưa có bản ghi nào"
          description="Nhật ký sẽ ghi lại ngay khi có thao tác thay đổi dữ liệu quan trọng."
        />
      ) : (
        <>
          <Table head={['Thời điểm', 'Người thực hiện', 'Hành động', 'Đối tượng', 'Chi tiết']}>
            {rows.map((row) => (
              <Tr key={row.id}>
                <Td className="whitespace-nowrap text-ink-500">{formatDateTimeVN(row.createdAt)}</Td>
                <Td className="text-ink-700">
                  {row.actorId ? (actorName.get(row.actorId) ?? 'Đã xóa') : 'Hệ thống'}
                  {row.actorRole ? (
                    <>
                      <br />
                      <span className="text-xs text-ink-400">{row.actorRole}</span>
                    </>
                  ) : null}
                </Td>
                <Td>
                  <Badge tone="brand">{row.action}</Badge>
                </Td>
                <Td className="font-mono text-xs text-ink-600">
                  {row.entityType}
                  <br />
                  <span className="text-ink-400">{row.entityId.slice(0, 12)}…</span>
                </Td>
                <Td>
                  {row.before || row.after ? (
                    <details>
                      <summary className="cursor-pointer text-xs text-brand-700">
                        Xem trước / sau
                      </summary>
                      <pre className="mt-2 max-w-md overflow-x-auto rounded bg-ink-50 p-2 font-mono text-xs text-ink-600">
                        {JSON.stringify({ before: row.before, after: row.after }, null, 2)}
                      </pre>
                    </details>
                  ) : (
                    <span className="text-ink-400">—</span>
                  )}
                </Td>
              </Tr>
            ))}
          </Table>

          {total > PAGE_SIZE ? (
            <div className="mt-4 flex items-center justify-between text-sm">
              <span className="text-ink-500">
                Trang {currentPage} / {Math.ceil(total / PAGE_SIZE)}
              </span>
              <div className="flex gap-2">
                {currentPage > 1 ? (
                  <a
                    href={`/quan-tri/nhat-ky?page=${currentPage - 1}${entityType ? `&entityType=${entityType}` : ''}`}
                    className="press rounded-lg bg-white px-3 py-1.5 font-medium text-ink-600 ring-1 ring-ink-200"
                  >
                    ← Trước
                  </a>
                ) : null}
                {currentPage * PAGE_SIZE < total ? (
                  <a
                    href={`/quan-tri/nhat-ky?page=${currentPage + 1}${entityType ? `&entityType=${entityType}` : ''}`}
                    className="press rounded-lg bg-white px-3 py-1.5 font-medium text-ink-600 ring-1 ring-ink-200"
                  >
                    Sau →
                  </a>
                ) : null}
              </div>
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}
