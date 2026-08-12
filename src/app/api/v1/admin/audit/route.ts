import { z } from 'zod';
import { handle, ok, readQuery } from '@/lib/http';
import { requireRole } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

const querySchema = z.object({
  entityType: z.string().max(64).optional(),
  entityId: z.string().max(64).optional(),
  actorId: z.string().max(64).optional(),
  action: z.string().max(64).optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(30),
});

/** Nhật ký thay đổi. Chỉ quản trị cấp cao được xem — đây là dấu vết kiểm toán. */
export const GET = handle(async (request: Request) => {
  await requireRole('SUPER_ADMIN', 'PROGRAM_MANAGER');
  const query = readQuery(request, querySchema);

  const where = {
    ...(query.entityType ? { entityType: query.entityType } : {}),
    ...(query.entityId ? { entityId: query.entityId } : {}),
    ...(query.actorId ? { actorId: query.actorId } : {}),
    ...(query.action ? { action: { contains: query.action } } : {}),
    ...(query.from || query.to
      ? {
          createdAt: {
            ...(query.from ? { gte: query.from } : {}),
            ...(query.to ? { lte: query.to } : {}),
          },
        }
      : {}),
  };

  const [rows, total] = await Promise.all([
    prisma.auditLog.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
    }),
    prisma.auditLog.count({ where }),
  ]);

  // Ghép tên người thực hiện bằng một truy vấn gộp thay vì N+1.
  const actorIds = [...new Set(rows.map((row) => row.actorId).filter((id): id is string => Boolean(id)))];
  const actors = actorIds.length
    ? await prisma.user.findMany({
        where: { id: { in: actorIds } },
        select: { id: true, fullName: true, email: true },
      })
    : [];
  const actorById = new Map(actors.map((actor) => [actor.id, actor]));

  return ok({
    rows: rows.map((row) => ({
      ...row,
      actorName: row.actorId ? (actorById.get(row.actorId)?.fullName ?? 'Đã xóa') : 'Hệ thống',
      actorEmail: row.actorId ? (actorById.get(row.actorId)?.email ?? null) : null,
    })),
    total,
    page: query.page,
    pageSize: query.pageSize,
  });
});
