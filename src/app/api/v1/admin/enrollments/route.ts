import { z } from 'zod';
import { handle, ok, readJson, readQuery } from '@/lib/http';
import { requireAdmin } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { manualActivationSchema } from '@/server/commerce/schemas';
import { activateEnrollmentManually } from '@/server/commerce/service';

const querySchema = z.object({
  search: z.string().trim().max(120).optional(),
  courseId: z.string().max(64).optional(),
  status: z.enum(['ACTIVE', 'EXPIRED', 'SUSPENDED']).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(30),
});

export const GET = handle(async (request: Request) => {
  await requireAdmin();
  const query = readQuery(request, querySchema);

  const where = {
    ...(query.status ? { status: query.status } : {}),
    ...(query.courseId ? { courseId: query.courseId } : {}),
    ...(query.search
      ? {
          student: {
            user: {
              OR: [
                { fullName: { contains: query.search, mode: 'insensitive' as const } },
                { email: { contains: query.search, mode: 'insensitive' as const } },
                { phone: { contains: query.search } },
              ],
            },
          },
        }
      : {}),
  };

  const [rows, total] = await Promise.all([
    prisma.enrollment.findMany({
      where,
      include: {
        student: { include: { user: { select: { fullName: true, email: true, phone: true } } } },
        course: { include: { program: { select: { code: true, name: true } } } },
      },
      orderBy: { createdAt: 'desc' },
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
    }),
    prisma.enrollment.count({ where }),
  ]);

  return ok({ rows, total, page: query.page, pageSize: query.pageSize });
});

/**
 * Kích hoạt thủ công (học bổng, tài khoản nội bộ). Không sinh đơn hàng —
 * quyền truy cập gắn với ghi danh chứ không gắn cứng vào thanh toán (specs §11).
 */
export const POST = handle(async (request: Request) => {
  const session = await requireAdmin();
  const input = await readJson(request, manualActivationSchema);

  const result = await activateEnrollmentManually({ ...input, actorId: session.id });
  return ok(result, 201);
});
