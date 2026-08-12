import { handle, ok, readJson, readQuery } from '@/lib/http';
import { requireRole } from '@/lib/auth';
import { listProgramsSchema, upsertProgramSchema } from '@/server/catalog/schemas';
import { listPrograms, upsertProgram } from '@/server/catalog/service';

export const GET = handle(async (request: Request) => {
  await requireRole('SUPER_ADMIN', 'PROGRAM_MANAGER', 'OPS_ADMIN');
  const options = readQuery(request, listProgramsSchema);
  return ok(await listPrograms(options));
});

/** Thêm kỳ thi mới chỉ là thêm bản ghi — không cần sửa mã nguồn (specs §3.1). */
export const POST = handle(async (request: Request) => {
  const session = await requireRole('SUPER_ADMIN', 'PROGRAM_MANAGER');
  const input = await readJson(request, upsertProgramSchema);
  const program = await upsertProgram(input, session.id);
  return ok({ id: program.id, code: program.code, name: program.name, active: program.active });
});
