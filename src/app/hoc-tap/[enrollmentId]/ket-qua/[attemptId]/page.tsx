import { requireSession } from '@/lib/auth';
import { getAttemptReport } from '@/server/assessment/service';
import { prisma } from '@/lib/prisma';
import { routes } from '@/lib/routes';
import { formatMinutes, masteryTier, MASTERY_TIER_LABEL } from '@/lib/domain';
import { Alert, Card, CardHeader, LinkButton, PageHeader } from '@/components/ui';
import { DeltaBars, MasteryBars, TierSummary, type TierCount } from '@/components/charts';
import { Question } from '@/components/question';
import { AiComment } from './ai-comment';
import { ResultHero } from './result-hero';

export const dynamic = 'force-dynamic';

export const metadata = { title: 'Kết quả bài kiểm tra' };

export default async function AttemptResultPage({
  params,
}: {
  params: Promise<{ enrollmentId: string; attemptId: string }>;
}) {
  const { enrollmentId, attemptId } = await params;
  const session = await requireSession();
  const report = await getAttemptReport(attemptId, session.id);

  // Đã đặt mục tiêu chưa — quyết định nút hành động chính ở cuối trang.
  const goal = await prisma.goal.findFirst({
    where: { enrollmentId, active: true },
    select: { id: true },
  });

  const tierCounts: TierCount[] = (['STRONG', 'OK', 'NEEDS_WORK', 'GAP'] as const).map((tier) => ({
    tier,
    count: report.masteryMap.chapters
      .flatMap((chapter) => chapter.skills)
      .filter((skill) => skill.tier === tier).length,
  }));

  const chapterBars = report.masteryMap.chapters.map((chapter) => ({
    id: chapter.chapterId,
    label: chapter.chapterName,
    value: chapter.averageMastery,
    sublabel: MASTERY_TIER_LABEL[masteryTier(chapter.averageMastery)],
  }));

  const isProgress = report.type === 'PROGRESS';

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        eyebrow={report.typeLabel}
        title={isProgress ? 'Em đã tiến bộ thế nào?' : 'Đây là bức tranh năng lực của em'}
        subtitle={report.levelMessage}
      />

      <ResultHero
        rawScore={report.rawScore}
        maxScore={report.maxScore}
        percent={report.percent}
        minutes={report.totalMinutes}
        levelLabel={report.estimatedLevelLabel}
      />

      {/* Bốn mức thành thạo */}
      <section className="mt-8">
        <h2 className="mb-3 text-lg font-bold text-ink-900">Các kỹ năng của em đang ở đâu</h2>
        <TierSummary counts={tierCounts} />
      </section>

      {/* Nhận xét AI — tải riêng để trang hiện ngay */}
      <section className="mt-8">
        <AiComment attemptId={attemptId} type={report.type} />
      </section>

      {/* Ưu tiên học trước */}
      {report.priorities.length > 0 ? (
        <section className="mt-8">
          <Card>
            <CardHeader
              title="Nên sửa theo thứ tự này"
              subtitle="Hệ thống sẽ tự đưa các phần này vào lộ trình hằng ngày của em."
              icon={<span aria-hidden>🎯</span>}
            />
            <ol className="stagger space-y-3">
              {report.priorities.map((priority, index) => (
                <li
                  key={priority.skillId}
                  className="flex gap-3 rounded-lg bg-ink-50/60 p-3.5"
                >
                  <span
                    aria-hidden
                    className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-brand-600 text-sm font-bold text-white"
                  >
                    {index + 1}
                  </span>
                  <div className="min-w-0">
                    <p className="font-semibold text-ink-900">{priority.skillName}</p>
                    <p className="text-xs text-ink-500">{priority.chapterName}</p>
                    <p className="mt-1 text-sm text-ink-600">{priority.reason}</p>
                    {priority.blockedBySkillNames.length > 0 ? (
                      <p className="mt-1 text-sm text-amber-700">
                        Cần vững trước: {priority.blockedBySkillNames.join(', ')}
                      </p>
                    ) : null}
                  </div>
                </li>
              ))}
            </ol>
          </Card>
        </section>
      ) : null}

      {/* Bản đồ theo chương */}
      <section className="mt-8">
        <Card>
          <CardHeader
            title="Mức thành thạo theo từng chương"
            subtitle="Thanh càng ngắn nghĩa là phần đó càng cần luyện thêm."
          />
          <MasteryBars data={chapterBars} target={report.masteryMap.overall > 0 ? 60 : undefined} />
        </Card>
      </section>

      {/* So sánh với lần trước */}
      {report.delta ? (
        <section className="mt-8">
          <Card>
            <CardHeader title="So với lần kiểm tra trước" subtitle={report.delta.message} />
            <DeltaBars
              data={[...report.delta.topGains, ...report.delta.topDrops].map((row) => ({
                id: row.skillId,
                label: row.skillName,
                delta: row.delta,
              }))}
            />
          </Card>
        </section>
      ) : null}

      {/* Lỗi hay gặp */}
      {report.errorPatterns.length > 0 ? (
        <section className="mt-8">
          <Card>
            <CardHeader title="Kiểu lỗi em hay mắc" />
            <ul className="space-y-2">
              {report.errorPatterns.map((pattern) => (
                <li key={pattern.pattern} className="flex items-center justify-between gap-3 text-sm">
                  <span className="text-ink-700">{pattern.label}</span>
                  <span className="font-semibold text-ink-800 tabular-nums">
                    {pattern.count} lần
                  </span>
                </li>
              ))}
            </ul>
          </Card>
        </section>
      ) : null}

      {/* Hành động chính */}
      <section className="mt-8">
        <Alert tone="info">
          Thời gian làm bài: <strong>{formatMinutes(report.totalMinutes)}</strong>. Tốc độ của em
          bằng <strong>{report.avgTimeRatio.toFixed(2)} lần</strong> mức chuẩn.
        </Alert>
        <div className="mt-5 flex flex-wrap gap-3">
          {goal ? (
            <LinkButton href={routes.studyDashboard(enrollmentId)} size="lg">
              Về lộ trình học
            </LinkButton>
          ) : (
            <LinkButton href={routes.goalBuilder(enrollmentId)} size="lg">
              Đặt mục tiêu học tập →
            </LinkButton>
          )}
          <LinkButton href={routes.skillMap(enrollmentId)} variant="secondary" size="lg">
            Xem bản đồ kỹ năng
          </LinkButton>
        </div>
      </section>

      {/* Xem lại từng câu */}
      <section className="mt-10">
        <h2 className="mb-3 text-lg font-bold text-ink-900">Xem lại bài làm</h2>
        <div className="space-y-3">
          {report.items.map((item, index) => (
            <details
              key={item.itemAttemptId}
              className="group rounded-xl bg-white p-4 ring-1 ring-ink-100"
            >
              <summary className="flex cursor-pointer items-center gap-3 marker:content-['']">
                <span
                  aria-hidden
                  className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white ${
                    item.isCorrect ? 'bg-accent-600' : 'bg-rose-500'
                  }`}
                >
                  {index + 1}
                </span>
                <span className="min-w-0 flex-1 truncate text-sm text-ink-700">
                  {item.skillName}
                </span>
                <span
                  className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold ${
                    item.isCorrect ? 'bg-accent-50 text-accent-700' : 'bg-rose-50 text-rose-700'
                  }`}
                >
                  {item.isCorrect ? 'Đúng' : 'Sai'}
                </span>
                <span
                  aria-hidden
                  className="shrink-0 text-ink-400 transition-transform duration-300 group-open:rotate-45"
                >
                  +
                </span>
              </summary>

              <div className="mt-4 border-t border-ink-100 pt-4">
                <Question
                  item={{
                    itemId: item.itemId,
                    questionType: item.questionType,
                    stem: item.stem,
                    stemImageUrl: item.stemImageUrl,
                    options: item.options,
                  }}
                  mode="GRADED"
                  value={item.answer}
                  showSolution
                  result={{
                    isCorrect: item.isCorrect,
                    correctAnswer: item.correctAnswer,
                    solution: item.solution,
                    solutionSteps: item.solutionSteps,
                  }}
                />
              </div>
            </details>
          ))}
        </div>
      </section>
    </div>
  );
}
