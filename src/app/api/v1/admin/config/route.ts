import { z } from 'zod';
import { handle, ok, readJson } from '@/lib/http';
import { requireRole } from '@/lib/auth';
import { AUDIT_ACTIONS, writeAudit } from '@/lib/audit';
import { clientIp } from '@/lib/rate-limit';
import {
  CONFIG_GROUP_META,
  DEFAULT_CONFIG,
  getConfig,
  setConfigGroup,
  type ConfigGroup,
} from '@/lib/config';

const GROUPS = Object.keys(DEFAULT_CONFIG) as ConfigGroup[];

const patchSchema = z.object({
  group: z.enum(GROUPS as [ConfigGroup, ...ConfigGroup[]]),
  /** Chỉ gửi các khóa muốn đổi; hàm setConfigGroup tự ghi đè sâu. */
  value: z.record(z.unknown()),
});

/**
 * Toàn bộ Phụ lục B của đặc tả. Trả kèm giá trị MẶC ĐỊNH để màn hình quản trị
 * chỉ rõ người vận hành đã thay đổi những gì so với xuất xưởng.
 */
export const GET = handle(async () => {
  await requireRole('SUPER_ADMIN', 'PROGRAM_MANAGER');
  const current = await getConfig();

  return ok({
    groups: GROUPS.map((group) => ({
      key: group,
      label: CONFIG_GROUP_META[group].label,
      description: CONFIG_GROUP_META[group].description,
      value: current[group],
      defaults: DEFAULT_CONFIG[group],
    })),
  });
});

export const PATCH = handle(async (request: Request) => {
  const session = await requireRole('SUPER_ADMIN', 'PROGRAM_MANAGER');
  const { group, value } = await readJson(request, patchSchema);

  const before = (await getConfig())[group];
  const after = await setConfigGroup(group, value as never, session.id);

  await writeAudit({
    actorId: session.id,
    actorRole: session.roles.join(','),
    action: AUDIT_ACTIONS.CONFIG_UPDATE,
    entityType: 'AppConfig',
    entityId: group,
    before,
    after,
    ip: clientIp(request),
  });

  return ok({ group, value: after });
});
