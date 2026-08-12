import { z } from 'zod';
import { handle, ok, readJson, readQuery } from '@/lib/http';
import { requireContentStaff } from '@/lib/auth';
import { setPrerequisitesSchema, skillFilterSchema, upsertSkillSchema } from '@/server/content/schemas';
import { listSkills, setSkillPrerequisites, upsertSkill } from '@/server/content/service';

export const GET = handle(async (request: Request) => {
  await requireContentStaff();
  const filter = readQuery(request, skillFilterSchema);
  return ok(await listSkills(filter));
});

export const POST = handle(async (request: Request) => {
  const session = await requireContentStaff();
  const input = await readJson(request, upsertSkillSchema);
  const skill = await upsertSkill(input, session.id);
  return ok({ id: skill.id, code: skill.code, name: skill.name });
});

/**
 * Khai báo kỹ năng tiên quyết. Service từ chối khi tạo ra vòng lặp — đồ thị
 * tiên quyết có chu trình sẽ làm engine không tìm được đường học.
 */
export const PATCH = handle(async (request: Request) => {
  const session = await requireContentStaff();
  const input = await readJson(request, setPrerequisitesSchema);

  await setSkillPrerequisites(input.skillId, input.prerequisiteSkillIds, session.id);
  return ok({ skillId: input.skillId, prerequisiteSkillIds: input.prerequisiteSkillIds });
});
