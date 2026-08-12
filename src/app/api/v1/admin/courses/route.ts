import { handle, ok, readJson, readQuery } from '@/lib/http';
import { requireRole } from '@/lib/auth';
import { listCoursesSchema, upsertCourseSchema } from '@/server/catalog/schemas';
import { listCourses, upsertCourse } from '@/server/catalog/service';

export const GET = handle(async (request: Request) => {
  await requireRole('SUPER_ADMIN', 'PROGRAM_MANAGER', 'OPS_ADMIN');
  const filter = readQuery(request, listCoursesSchema);
  return ok(await listCourses(filter));
});

export const POST = handle(async (request: Request) => {
  const session = await requireRole('SUPER_ADMIN', 'PROGRAM_MANAGER');
  const input = await readJson(request, upsertCourseSchema);
  const course = await upsertCourse(input, session.id);
  return ok({ id: course.id, name: course.name, active: course.active });
});
