import { requireSession } from '@/lib/auth';
import { getEnrollmentForUser } from '@/server/commerce/service';
import { getMasteryMap } from '@/server/student-model/service';
import { MASTERY_TIER_LABEL } from '@/lib/domain';
import { formatDateVN } from '@/lib/dates';
import { Card, EmptyState, PageHeader, Badge, TIER_TONE, LinkButton } from '@/components/ui';
import { MasteryBars, TierSummary, type TierCount } from '@/components/charts';
import { routes } from '@/lib/routes';

export const dynamic = 'force-dynamic';

export const metadata = { title: 'Bản đồ kỹ năng' };

export default async function SkillMapPage({
  params,
}: {
  params: Promise<{ enrollmentId: string }>;
}) {
  const { enrollmentId } = await params;
  const session = await requireSession();
  await getEnrollmentForUser(session.id, enrollmentId);

  const map = await getMasteryMap(enrollmentId);
  const allSkills = map.chapters.flatMap((chapter) => chapter.skills);

  if (allSkills.length === 0) {
    return (
      <EmptyState
        icon="🗺️"
        title="Chưa có dữ liệu năng lực"
        description="Làm bài kiểm tra đầu vào để hệ thống dựng bản đồ kỹ năng của em."
        action={<LinkButton href={routes.diagnostic(enrollmentId)}>Làm bài đầu vào</LinkButton>}
      />
    );
  }

  const tierCounts: TierCount[] = (['STRONG', 'OK', 'NEEDS_WORK', 'GAP'] as const).map((tier) => ({
    tier,
    count: allSkills.filter((skill) => skill.tier === tier).length,
  }));

  return (
    <div>
      <PageHeader
        title="Bản đồ kỹ năng của em"
        subtitle={`Mức thành thạo trung bình: ${Math.round(map.overall)}/100. Hệ thống dùng bản đồ này để quyết định giao bài gì mỗi ngày.`}
      />

      <TierSummary counts={tierCounts} />

      {map.weakest || map.strongest ? (
        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          {map.strongest ? (
            <Card>
              <p className="text-sm text-ink-500">Em mạnh nhất ở</p>
              <p className="mt-1 font-semibold text-ink-900">{map.strongest.skillName}</p>
              <p className="text-xs text-ink-500">{map.strongest.chapterName}</p>
              <Badge tone={TIER_TONE[map.strongest.tier]} className="mt-2">
                {Math.round(map.strongest.masteryScore)}/100 · {map.strongest.tierLabel}
              </Badge>
            </Card>
          ) : null}
          {map.weakest ? (
            <Card>
              <p className="text-sm text-ink-500">Cần chú ý nhất</p>
              <p className="mt-1 font-semibold text-ink-900">{map.weakest.skillName}</p>
              <p className="text-xs text-ink-500">{map.weakest.chapterName}</p>
              <Badge tone={TIER_TONE[map.weakest.tier]} className="mt-2">
                {Math.round(map.weakest.masteryScore)}/100 · {map.weakest.tierLabel}
              </Badge>
            </Card>
          ) : null}
        </div>
      ) : null}

      <section className="mt-8">
        <h2 className="mb-3 text-lg font-bold text-ink-900">Theo từng chương</h2>
        <Card>
          <MasteryBars
            data={map.chapters.map((chapter) => ({
              id: chapter.chapterId,
              label: chapter.chapterName,
              value: chapter.averageMastery,
              sublabel: MASTERY_TIER_LABEL[chapter.tier],
            }))}
            target={60}
            caption="Vạch dọc là ngưỡng coi như đã vững."
          />
        </Card>
      </section>

      <section className="mt-8">
        <h2 className="mb-3 text-lg font-bold text-ink-900">Chi tiết từng kỹ năng</h2>
        <div className="space-y-3">
          {map.chapters.map((chapter) => (
            <details key={chapter.chapterId} className="group rounded-xl bg-white p-4 ring-1 ring-ink-100">
              <summary className="flex cursor-pointer items-center gap-3 marker:content-['']">
                <span className="min-w-0 flex-1 font-medium text-ink-800">{chapter.chapterName}</span>
                <Badge tone={TIER_TONE[chapter.tier]}>
                  {Math.round(chapter.averageMastery)}/100
                </Badge>
                <span
                  aria-hidden
                  className="text-ink-400 transition-transform duration-300 group-open:rotate-45"
                >
                  +
                </span>
              </summary>
              <ul className="mt-3 space-y-2 border-t border-ink-100 pt-3">
                {chapter.skills.map((skill) => (
                  <li key={skill.skillId} className="flex items-center justify-between gap-3 text-sm">
                    <div className="min-w-0">
                      <p className="truncate text-ink-700">{skill.skillName}</p>
                      <p className="text-xs text-ink-400">
                        {skill.attemptCount > 0
                          ? `${skill.attemptCount} câu đã làm${skill.lastPracticedAt ? ` · gần nhất ${formatDateVN(skill.lastPracticedAt)}` : ''}`
                          : 'Chưa luyện câu nào'}
                      </p>
                    </div>
                    <Badge tone={TIER_TONE[skill.tier]}>
                      {Math.round(skill.masteryScore)} · {skill.tierLabel}
                    </Badge>
                  </li>
                ))}
              </ul>
            </details>
          ))}
        </div>
      </section>
    </div>
  );
}
