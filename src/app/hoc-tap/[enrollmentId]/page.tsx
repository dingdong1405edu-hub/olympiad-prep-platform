import { redirect } from 'next/navigation';
import { requireSession } from '@/lib/auth';
import { routes } from '@/lib/routes';
import { formatMinutes } from '@/lib/domain';
import { formatDateVN } from '@/lib/dates';
import { getEnrollmentForUser } from '@/server/commerce/service';
import { getTodayPlan } from '@/server/plan/service';
import { getAssessmentStatus } from '@/server/assessment/service';
import {
  Alert,
  Badge,
  Card,
  CardHeader,
  Divider,
  LinkButton,
  ProgressBar,
  Section,
  StatTile,
} from '@/components/ui';
import { Counter, ProgressRing, Reveal } from '@/components/motion';
import {
  GeneratePlanButton,
  RescheduleButton,
  StartProgressAssessmentButton,
} from './student-actions';

export const dynamic = 'force-dynamic';

export const metadata = { title: 'Hôm nay học gì' };

/**
 * MÀN HÌNH "HÔM NAY HỌC GÌ" (specs §9.2 màn 9, §10.1).
 *
 * Bốn câu hỏi phải trả lời được ngay khi mở trang:
 *   1. Hôm nay cần học gì?      → thẻ "Buổi học hôm nay" + danh sách block
 *   2. Mất bao lâu?             → headline + thời lượng từng block
 *   3. Vì sao bài này được giao? → whyMessage + câu giải thích của từng block
 *   4. Xong thì tiến độ đổi ra sao? → impactMessage + vòng tiến độ chu kỳ
 *
 * Toàn bộ số liệu và thông điệp do `getTodayPlan()` tính — trang này chỉ trình bày.
 */
export default async function StudyDashboardPage({
  params,
}: {
  params: Promise<{ enrollmentId: string }>;
}) {
  const { enrollmentId } = await params;
  const session = await requireSession();

  // Layout đã chặn một lần, nhưng mỗi trang tự kiểm tra lại: getTodayPlan không
  // biết người dùng nào đang gọi nên quyền phải được xác nhận ở đây.
  const enrollment = await getEnrollmentForUser(session.id, enrollmentId).catch(() => null);
  if (!enrollment) redirect(routes.myCourses());

  // --- Cổng 1: chưa khai hồ sơ đầu vào ------------------------------------
  if (enrollment.onboardedAt === null) {
    return (
      <WelcomeGate
        eyebrow={enrollment.course.programName}
        title={`Chào ${session.fullName.split(' ').slice(-1)[0] ?? 'bạn'}, mình bắt đầu nhé!`}
        description="Trước tiên hãy cho hệ thống biết bạn đang học lớp mấy và tự thấy mình ở mức nào. Thông tin này chỉ dùng để chọn câu hỏi phù hợp cho bài kiểm tra đầu vào, không phải kết luận về bạn."
        href={routes.onboarding(enrollmentId)}
        cta="Khai báo thông tin học tập"
      />
    );
  }

  const status = await getAssessmentStatus(enrollmentId);

  // --- Cổng 2: chưa có bài kiểm tra đầu vào -------------------------------
  if (!status.hasDiagnostic) {
    return (
      <WelcomeGate
        eyebrow={enrollment.course.programName}
        title="Bước đầu tiên: bài kiểm tra đầu vào"
        description={status.message}
        href={
          status.inProgressAttemptId
            ? routes.assessmentPlayer(enrollmentId, status.inProgressAttemptId)
            : routes.diagnostic(enrollmentId)
        }
        cta={status.inProgressAttemptId ? 'Làm tiếp bài đang dở' : 'Làm bài kiểm tra đầu vào'}
        note="Bài gồm một số câu trải đều các chương. Làm hết sức mình, sai cũng không sao — hệ thống cần biết đúng điểm mạnh và lỗ hổng của bạn để xếp lộ trình."
      />
    );
  }

  const today = await getTodayPlan(enrollmentId);

  // --- Cổng 3: chưa đặt mục tiêu -------------------------------------------
  if (!today.goal) {
    return (
      <WelcomeGate
        eyebrow={enrollment.course.programName}
        title="Đặt mục tiêu để hệ thống dựng lộ trình"
        description={today.headline}
        href={routes.goalBuilder(enrollmentId)}
        cta="Đặt mục tiêu học tập"
        note="Bạn chỉ cần cho biết mỗi tuần học được mấy buổi và mỗi buổi bao nhiêu phút. Hệ thống sẽ tính ngược ra vài phương án đích đến khả thi để bạn chọn."
      />
    );
  }

  const goal = today.goal;
  const day = today.day;
  const inProgress = day !== null && (day.startedAt !== null || day.doneCount > 0);
  const hasItems = day !== null && day.itemCount > 0;
  const remaining = day ? Math.max(0, day.itemCount - day.doneCount) : 0;

  const assessment = today.nextAssessment;
  const showAssessmentBanner =
    assessment !== null && (assessment.state === 'DUE' || assessment.state === 'IN_PROGRESS');

  return (
    <div>
      {/* Ưu tiên cao nhất: bài kiểm tra tới hạn (specs §10.3) — vào bằng fade-down
          để mắt bắt được ngay khối vừa xuất hiện trên cùng. */}
      {showAssessmentBanner ? (
        <div className="animate-fade-down mb-5 rounded-xl bg-brand-50 p-4 ring-1 ring-brand-100 sm:p-5">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="min-w-0">
              <Badge tone="brand" dot>
                {assessment.state === 'IN_PROGRESS' ? 'Đang làm dở' : 'Đã tới hạn'}
              </Badge>
              <h2 className="mt-2 text-lg font-bold tracking-tight text-ink-900">
                {assessment.name}
              </h2>
              <p className="mt-1 max-w-2xl text-sm text-ink-600">{assessment.message}</p>
            </div>
            <div className="shrink-0">
              {assessment.state === 'IN_PROGRESS' && assessment.attemptId ? (
                <LinkButton href={routes.assessmentPlayer(enrollmentId, assessment.attemptId)}>
                  Làm tiếp bài
                </LinkButton>
              ) : (
                <StartProgressAssessmentButton enrollmentId={enrollmentId} />
              )}
            </div>
          </div>
        </div>
      ) : null}

      {/* --- Khối mở đầu: mục tiêu, thời gian còn lại, tiến độ chu kỳ --- */}
      <section className="hero-glow animate-fade-up mb-6 rounded-2xl bg-white p-5 ring-1 ring-ink-100 shadow-[0_1px_3px_rgb(120_70_45/0.05)] sm:p-7">
        <div className="flex flex-wrap items-start justify-between gap-6">
          <div className="min-w-0 flex-1">
            <p className="text-xs font-semibold tracking-wider text-brand-700 uppercase">
              {enrollment.course.programCode} · {enrollment.course.subjectLabel} · Chu kỳ{' '}
              {today.cycleProgress.cycleNo}
            </p>
            <h1 className="mt-1.5 text-2xl font-bold tracking-tight text-ink-900 sm:text-3xl">
              {today.headline}
            </h1>

            <div className="mt-4 flex flex-wrap items-center gap-x-6 gap-y-3">
              <div>
                <p className="text-xs font-medium tracking-wide text-ink-500 uppercase">Mục tiêu</p>
                <p className="mt-0.5 font-semibold text-ink-800">
                  {goal.currentLevelLabel} → {goal.targetLevelLabel}
                </p>
              </div>
              <div>
                <p className="text-xs font-medium tracking-wide text-ink-500 uppercase">
                  Còn lại tới mốc {goal.deadlineLabel}
                </p>
                <p className="mt-0.5 font-semibold text-ink-800 tabular-nums">
                  <Counter value={Math.max(0, goal.daysLeft)} /> ngày
                </p>
              </div>
              <div>
                <p className="text-xs font-medium tracking-wide text-ink-500 uppercase">Nhịp học</p>
                <p className="mt-0.5 font-semibold text-ink-800">
                  {goal.daysPerWeek} buổi/tuần · {formatMinutes(goal.minutesPerDay)}/buổi
                </p>
              </div>
            </div>

            <p className="mt-4 max-w-2xl text-sm text-ink-600">{goal.feasibilityMessage}</p>
          </div>

          <div className="flex shrink-0 flex-col items-center gap-2">
            <ProgressRing
              value={today.cycleProgress.percent}
              size={116}
              stroke={10}
              label={
                <>
                  <span className="text-2xl font-bold text-ink-900 tabular-nums">
                    {today.cycleProgress.percent}%
                  </span>
                  <span className="text-xs text-ink-500">
                    {today.cycleProgress.completedDays}/{today.cycleProgress.totalDays} buổi
                  </span>
                </>
              }
            />
            <p className="text-xs text-ink-500">Tiến độ chu kỳ {today.cycleProgress.cycleNo}</p>
          </div>
        </div>

        {today.plan && today.plan.focusChapters.length > 0 ? (
          <div className="mt-5 flex flex-wrap items-center gap-2">
            <span className="text-xs font-medium tracking-wide text-ink-500 uppercase">
              Chương trọng tâm
            </span>
            {today.plan.focusChapters.map((chapter) => (
              <Badge key={chapter.id} tone="brand">
                {chapter.name}
              </Badge>
            ))}
          </div>
        ) : null}
      </section>

      {/* Bỏ lỡ vài buổi: nói nhẹ nhàng, KHÔNG dùng màu báo động và không trách móc. */}
      {today.cycleProgress.missedDays > 0 ? (
        <Alert tone="info" title="Vài buổi học đang chờ bạn quay lại" className="mb-5">
          <p>
            Có {today.cycleProgress.missedDays} buổi đã qua mà chưa học xong. Không sao cả — bài
            không mất đi đâu, hệ thống có thể dồn phần còn lại sang những buổi tới cho vừa sức.
          </p>
          <div className="mt-3">
            <RescheduleButton enrollmentId={enrollmentId} />
          </div>
        </Alert>
      ) : null}

      {today.warnings.length > 0 ? (
        <Alert tone="warn" title="Vài điều bạn nên biết" className="mb-5">
          <ul className="list-disc space-y-1 pl-5">
            {today.warnings.map((warning) => (
              <li key={warning}>{warning}</li>
            ))}
          </ul>
        </Alert>
      ) : null}

      {/* --- Buổi học hôm nay --- */}
      {!today.plan ? (
        <Card className="mb-6">
          <CardHeader
            title="Bạn đã có mục tiêu, chỉ còn thiếu lộ trình"
            subtitle="Hệ thống sẽ chia mục tiêu thành từng buổi học vừa sức, dựa trên hồ sơ năng lực hiện tại của bạn."
          />
          <GeneratePlanButton enrollmentId={enrollmentId} />
        </Card>
      ) : (
        <Section
          title={today.isStudyDayToday ? 'Buổi học hôm nay' : 'Buổi học kế tiếp'}
          description={
            day
              ? `${day.dateLabel} · ${day.itemCount} câu · khoảng ${formatMinutes(day.estimatedMinutes)}`
              : undefined
          }
        >
          <Card padded={false}>
            <div className="p-5">
              {!day || !hasItems ? (
                <div className="py-6 text-center">
                  <p className="font-medium text-ink-700">
                    {day
                      ? 'Buổi học này chưa có câu hỏi nào.'
                      : 'Chu kỳ này đã hết ngày học theo lịch.'}
                  </p>
                  <p className="mx-auto mt-1 max-w-md text-sm text-ink-500">
                    {day
                      ? 'Kho câu của các kỹ năng đang ưu tiên còn thiếu. Đội chuyên môn đang bổ sung, bạn quay lại sau nhé.'
                      : 'Hãy làm bài kiểm tra tiến bộ để hệ thống đo lại năng lực và mở chu kỳ học mới.'}
                  </p>
                  {!day ? (
                    <div className="mt-4 flex justify-center">
                      <StartProgressAssessmentButton enrollmentId={enrollmentId} />
                    </div>
                  ) : null}
                </div>
              ) : (
                <>
                  <div className="mb-4">
                    <div className="mb-1.5 flex items-baseline justify-between gap-3 text-sm">
                      <span className="text-ink-500">
                        Đã làm {day.doneCount}/{day.itemCount} câu
                      </span>
                      <span className="font-semibold text-ink-700 tabular-nums">
                        {Math.round((day.doneCount / day.itemCount) * 100)}%
                      </span>
                    </div>
                    <ProgressBar value={day.doneCount} max={day.itemCount} />
                  </div>

                  {/* Danh sách block: cha mang class "stagger" để các con tự hiện lần lượt. */}
                  <ul className="stagger m-0 list-none space-y-3 p-0">
                    {today.blocks.map((block) => (
                      <li
                        key={block.block}
                        className="rounded-xl bg-ink-50/70 p-4 ring-1 ring-ink-100"
                      >
                        <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                          <h3 className="font-semibold text-ink-900">{block.label}</h3>
                          <span className="text-sm text-ink-500 tabular-nums">
                            {block.itemCount} câu · {formatMinutes(block.estimatedMinutes)}
                            {block.doneCount > 0 ? ` · đã xong ${block.doneCount}` : ''}
                          </span>
                        </div>
                        {/* MỘT câu giải thích vì sao block này có mặt — lấy nguyên văn
                            từ engine, không viết lại. */}
                        <p className="mt-1.5 text-sm text-ink-600">{block.reason}</p>
                        {block.skillNames.length > 0 ? (
                          <div className="mt-2.5 flex flex-wrap gap-1.5">
                            {block.skillNames.slice(0, 4).map((name) => (
                              <Badge key={name} tone="neutral">
                                {name}
                              </Badge>
                            ))}
                            {block.skillNames.length > 4 ? (
                              <Badge tone="neutral">+{block.skillNames.length - 4} kỹ năng</Badge>
                            ) : null}
                          </div>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </div>

            {/* Hành động chính DUY NHẤT của màn hình. */}
            {day && hasItems ? (
              <div className="flex flex-wrap items-center justify-between gap-3 border-t border-ink-100 bg-white p-5">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-ink-700">
                    {inProgress
                      ? `Còn ${remaining} câu là xong buổi này.`
                      : today.isStudyDayToday
                        ? 'Sẵn sàng chưa? Cứ làm từ tốn, hệ thống chấm ngay sau mỗi câu.'
                        : `Hôm nay là ngày nghỉ. Bạn vẫn có thể học sớm buổi ${day.dateLabel}.`}
                  </p>
                  <p className="mt-0.5 text-sm text-ink-500">{today.impactMessage}</p>
                </div>
                <LinkButton
                  href={routes.practice(enrollmentId, day.id)}
                  size="lg"
                  className="animate-pulse-ring"
                >
                  {inProgress ? 'Tiếp tục học' : today.isStudyDayToday ? 'Bắt đầu học' : 'Học sớm'}
                </LinkButton>
              </div>
            ) : null}
          </Card>
        </Section>
      )}

      {/* --- Vì sao hôm nay lại là những bài này --- */}
      <Reveal>
        <Card className="mb-6">
          <CardHeader
            title="Vì sao hệ thống giao những bài này?"
            subtitle="Mỗi câu trong buổi học đều có lý do được lưu lại. Bạn xem chi tiết từng câu ngay khi làm bài."
            icon={<span aria-hidden>?</span>}
          />
          <p className="text-sm leading-relaxed text-ink-700">{today.whyMessage}</p>
          <Divider className="my-4" />
          <p className="text-sm text-ink-600">{today.impactMessage}</p>
        </Card>
      </Reveal>

      {/* --- Khối phụ: thành quả tích lũy --- */}
      <Reveal delay={80}>
        <Section title="Bạn đã đi được tới đâu">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <StatTile
              label="Chuỗi buổi liên tiếp"
              value={<Counter value={today.progress.streakDays} suffix=" buổi" />}
              hint={today.progress.streakDays > 0 ? 'Giữ nhịp nhé!' : 'Bắt đầu chuỗi hôm nay'}
            />
            <StatTile
              label="Tổng thời gian đã học"
              value={<Counter value={today.progress.minutesStudied} suffix=" phút" />}
              hint={formatMinutes(today.progress.minutesStudied)}
            />
            <StatTile
              label="Số câu đã làm"
              value={<Counter value={today.progress.itemsAnswered} />}
              hint="trong các buổi luyện tập"
            />
            <StatTile
              label="Tỷ lệ đúng"
              value={<Counter value={Math.round(today.progress.accuracy * 100)} suffix="%" />}
              hint={`${today.progress.completedDays}/${today.progress.totalDays} buổi hoàn thành`}
            />
          </div>
        </Section>
      </Reveal>

      {/* --- Khối phụ: buổi tư vấn & lịch kiểm tra --- */}
      <Reveal delay={140}>
        <div className="grid gap-4 sm:grid-cols-2">
          <Card>
            <CardHeader title="Buổi tư vấn với giáo viên" />
            {today.nextTeacherSession ? (
              <div>
                <p className="text-sm text-ink-700">{today.nextTeacherSession.message}</p>
                {today.nextTeacherSession.scheduledLabel ? (
                  <p className="mt-2 font-semibold text-ink-900">
                    {today.nextTeacherSession.scheduledLabel} ·{' '}
                    {formatMinutes(today.nextTeacherSession.durationMinutes)}
                  </p>
                ) : null}
                <div className="mt-4">
                  <LinkButton
                    href={routes.teacherSessions(enrollmentId)}
                    variant="secondary"
                    size="sm"
                  >
                    Xem chi tiết buổi tư vấn
                  </LinkButton>
                </div>
              </div>
            ) : (
              <div>
                <p className="text-sm text-ink-600">
                  Chưa có buổi tư vấn nào được xếp lịch. Sau mỗi bài kiểm tra tiến bộ, giáo viên sẽ
                  hẹn bạn một buổi ngắn để cùng nhìn lại chu kỳ vừa qua.
                </p>
                <div className="mt-4">
                  <LinkButton
                    href={routes.teacherSessions(enrollmentId)}
                    variant="ghost"
                    size="sm"
                  >
                    Xem lịch sử buổi tư vấn
                  </LinkButton>
                </div>
              </div>
            )}
          </Card>

          <Card>
            <CardHeader title="Bài kiểm tra tiến bộ" />
            {assessment ? (
              <div>
                <p className="text-sm text-ink-700">{assessment.message}</p>
                <p className="mt-2 text-sm text-ink-500">
                  Hạn: {formatDateVN(assessment.dueAt)}
                  {assessment.daysLeft > 0 ? ` · còn ${assessment.daysLeft} ngày` : ''}
                </p>
              </div>
            ) : (
              <p className="text-sm text-ink-600">{status.message}</p>
            )}
            <div className="mt-4">
              <LinkButton href={routes.assessments(enrollmentId)} variant="secondary" size="sm">
                Xem lịch sử bài kiểm tra
              </LinkButton>
            </div>
          </Card>
        </div>
      </Reveal>

      {enrollment.expiringSoon ? (
        <Alert tone="warn" className="mt-6">
          Quyền truy cập khóa học còn {enrollment.daysLeft} ngày (đến {enrollment.expiresAtLabel}).
          Gia hạn sớm để lộ trình không bị đứt quãng.
        </Alert>
      ) : null}
    </div>
  );
}

/**
 * Màn hình mời làm một việc duy nhất. Dùng cho các trạng thái "chưa đủ điều kiện
 * để có lộ trình" — lúc đó mọi thứ khác đều là nhiễu, phải ẩn đi.
 */
function WelcomeGate({
  eyebrow,
  title,
  description,
  href,
  cta,
  note,
}: {
  eyebrow: string;
  title: string;
  description: string;
  href: string;
  cta: string;
  note?: string;
}) {
  return (
    <div className="hero-glow animate-fade-up rounded-2xl bg-white p-6 ring-1 ring-ink-100 shadow-[0_1px_3px_rgb(120_70_45/0.05)] sm:p-10">
      <p className="text-xs font-semibold tracking-wider text-brand-700 uppercase">{eyebrow}</p>
      <h1 className="mt-2 max-w-2xl text-2xl font-bold tracking-tight text-ink-900 sm:text-3xl">
        {title}
      </h1>
      <p className="mt-3 max-w-2xl text-base leading-relaxed text-ink-600">{description}</p>
      <div className="mt-6">
        <LinkButton href={href} size="lg" className="animate-pulse-ring">
          {cta}
        </LinkButton>
      </div>
      {note ? <p className="mt-5 max-w-2xl text-sm text-ink-500">{note}</p> : null}
    </div>
  );
}
