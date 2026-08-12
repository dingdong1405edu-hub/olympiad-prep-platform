import { z } from 'zod';
import { handle, ok, readJson } from '@/lib/http';
import { requireSession } from '@/lib/auth';
import { requireActiveEnrollment } from '@/server/commerce/service';
import { generatePlan, getCurrentPlan } from '@/server/plan/service';

type Ctx = { params: Promise<{ enrollmentId: string }> };

const regenerateSchema = z.object({
  reason: z.string().trim().min(1).max(200).default('Học sinh yêu cầu tạo lại lộ trình'),
  cycleNo: z.coerce.number().int().min(1).optional(),
});

export const GET = handle(async (_request: Request, context: Ctx) => {
  const session = await requireSession();
  const { enrollmentId } = await context.params;
  const enrollment = await requireActiveEnrollment(session.id, enrollmentId);

  return ok(await getCurrentPlan(enrollment.id));
});

/** Sinh lại lộ trình. Học sinh chỉ được tự sinh lại cho chính mình. */
export const POST = handle(async (request: Request, context: Ctx) => {
  const session = await requireSession();
  const { enrollmentId } = await context.params;
  const enrollment = await requireActiveEnrollment(session.id, enrollmentId);

  const input = await readJson(request, regenerateSchema);
  return ok(await generatePlan({ enrollmentId: enrollment.id, ...input }));
});
