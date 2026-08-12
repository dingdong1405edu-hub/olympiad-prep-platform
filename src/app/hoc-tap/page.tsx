import Link from 'next/link';
import { requireSession } from '@/lib/auth';
import { getStudyOverview, type StudyCard } from '@/server/study/service';
import { formatMinutes } from '@/lib/domain';
import { routes } from '@/lib/routes';
import { AppShell } from '@/components/shell';
import { Alert, Badge, Card, LinkButton, ProgressBar, Section } from '@/components/ui';
import { Counter, ProgressRing, Reveal } from '@/components/motion';

export const dynamic = 'force-dynamic';

export const metadata = { title: 'Khóa học của tôi' };

/**
 * MÀN HÌNH "KHÓA HỌC CỦA TÔI".
 *
 * Trang này là cửa vào hằng ngày, nên nó phải trả lời được **một** câu trước mọi
 * thứ khác: bây giờ tôi bấm vào đâu? Khối đầu trang trả lời đúng câu đó và chỉ
 * có một nút. Danh sách khóa nằm dưới, dành cho lúc học sinh muốn chọn khác đi.
 *
 * Toàn bộ thứ tự ưu tiên do `getStudyOverview()` quyết định — trang chỉ trình bày.
 */
export default async function MyCoursesPage() {
  const session = await requireSession();
  const overview = await getStudyOverview(session.id);
  const firstName = session.fullName.trim().split(/\s+/).slice(-1)[0] ?? 'bạn';
  const hasStats = overview.totals.itemsAnswered > 0 || overview.totals.minutesStudied > 0;

  return (
    <AppShell user={{ id: session.id, fullName: session.fullName, roles: session.roles }}>
      {overview.cards.length === 0 ? (
        <NoCourses firstName={firstName} />
      ) : (
        <>
          {overview.focus ? <FocusPanel firstName={firstName} card={overview.focus} /> : null}

          {hasStats ? (
            <Reveal>
              <Section title="Bạn đã đi được tới đâu">
                <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                  <Stat
                    label="Chuỗi buổi liên tiếp"
                    value={<Counter value={overview.totals.streakDays} suffix=" buổi" />}
                    hint={
                      overview.totals.streakDays > 0
                        ? 'Chuỗi dài nhất đang giữ'
                        : 'Học hôm nay để mở chuỗi'
                    }
                  />
                  <Stat
                    label="Tổng thời gian đã học"
                    value={formatMinutes(overview.totals.minutesStudied)}
                    hint="cộng dồn mọi khóa"
                  />
                  <Stat
                    label="Số câu đã làm"
                    value={<Counter value={overview.totals.itemsAnswered} />}
                    hint="trong các buổi luyện tập"
                  />
                  <Stat
                    label="Tỷ lệ đúng"
                    value={
                      <Counter value={Math.round(overview.totals.accuracy * 100)} suffix="%" />
                    }
                    hint={`${overview.totals.activeCourses} khóa đang mở`}
                  />
                </div>
              </Section>
            </Reveal>
          ) : null}

          <Section
            title={overview.cards.length > 1 ? 'Tất cả khóa học của bạn' : 'Khóa học của bạn'}
            description="Mỗi khóa có lộ trình riêng, tính lại sau mỗi bài làm."
            action={
              <LinkButton href={routes.programs()} variant="secondary" size="sm">
                Xem thêm kỳ thi
              </LinkButton>
            }
          >
            <div className="grid gap-4 lg:grid-cols-2">
              {overview.cards.map((card) => (
                <CourseCard key={card.enrollment.id} card={card} />
              ))}
            </div>
          </Section>

          <Reveal>
            <ExploreMore />
          </Reveal>
        </>
      )}

      <p className="mt-8 text-sm text-ink-500">
        <Link href={routes.account()} className="link-underline hover:text-navy-900">
          Quản lý tài khoản, mật khẩu và hóa đơn →
        </Link>
      </p>
    </AppShell>
  );
}

// ---------------------------------------------------------------------------

/**
 * Khối mở đầu: một việc, một nút.
 *
 * Nền navy đậm để nó tách hẳn khỏi các thẻ trắng bên dưới — mắt phải bắt được
 * nó trước, kể cả khi học sinh mở trang trong lúc vội.
 */
function FocusPanel({ firstName, card }: { firstName: string; card: StudyCard }) {
  const { enrollment, step, cycle, day } = card;

  return (
    <section className="animate-fade-up relative mb-8 overflow-hidden rounded-2xl bg-navy-900 text-white shadow-[0_24px_56px_-28px_rgb(13_27_49/0.6)]">
      <div className="grid-faint-dark pointer-events-none absolute inset-0" aria-hidden />

      <div className="relative flex flex-wrap items-start justify-between gap-8 p-6 sm:p-8">
        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold tracking-[0.16em] text-gold-300 uppercase">
            Chào {firstName} · {enrollment.course.programCode} · {enrollment.course.subjectLabel}
          </p>

          <h1 className="font-display mt-2.5 text-2xl leading-tight font-bold tracking-tight text-balance sm:text-3xl">
            {step.title}
          </h1>

          <p className="mt-3 max-w-2xl text-[15px] leading-relaxed text-navy-200 text-pretty">
            {step.description}
          </p>

          <div className="mt-6 flex flex-wrap items-center gap-3">
            <LinkButton
              href={step.href}
              size="lg"
              className={
                step.urgent
                  ? 'animate-pulse-ring bg-gold-400 text-navy-950 hover:bg-gold-300'
                  : 'bg-white text-navy-900 hover:bg-navy-100'
              }
            >
              {step.cta}
            </LinkButton>
            <LinkButton
              href={routes.studyDashboard(enrollment.id)}
              variant="ghost"
              size="lg"
              className="text-navy-200 hover:bg-white/10 hover:text-white"
            >
              Xem toàn bộ lộ trình
            </LinkButton>
          </div>
        </div>

        {cycle && cycle.totalDays > 0 ? (
          <div className="flex shrink-0 flex-col items-center gap-2">
            <ProgressRing
              value={cycle.percent}
              size={116}
              stroke={10}
              color="var(--color-gold-300)"
              trackColor="rgb(255 255 255 / 0.16)"
              label={
                <>
                  <span className="text-2xl font-bold tabular-nums">{cycle.percent}%</span>
                  <span className="text-xs text-navy-300">
                    {cycle.completedDays}/{cycle.totalDays} buổi
                  </span>
                </>
              }
            />
            <p className="text-xs text-navy-300">Chu kỳ {cycle.cycleNo}</p>
          </div>
        ) : day ? (
          <div className="shrink-0 rounded-xl bg-white/10 px-5 py-4 text-center">
            <p className="text-3xl font-bold tabular-nums">{day.itemCount}</p>
            <p className="mt-0.5 text-xs text-navy-300">câu trong buổi này</p>
          </div>
        ) : null}
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------

function CourseCard({ card }: { card: StudyCard }) {
  const { enrollment, step, progress, day, cycle, goal } = card;
  const blocked = step.kind === 'BLOCKED';

  return (
    <Card
      padded={false}
      className={blocked ? 'flex flex-col opacity-90' : 'hover-lift flex flex-col'}
    >
      <div className="flex-1 p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-md bg-navy-900 px-2 py-0.5 text-[11px] font-bold tracking-wider text-gold-200 uppercase">
                {enrollment.course.programCode}
              </span>
              <span className="text-xs font-medium text-ink-500">
                {enrollment.course.programName}
              </span>
            </div>
            <h3 className="mt-2 font-semibold text-ink-900">
              {enrollment.course.subjectLabel} · {enrollment.course.gradeBandLabel}
            </h3>
          </div>

          <Badge tone={enrollment.status === 'ACTIVE' ? 'success' : 'neutral'} dot>
            {enrollment.statusLabel}
          </Badge>
        </div>

        {/* Việc cần làm tiếp của riêng khóa này. */}
        <div
          className={
            step.urgent
              ? 'mt-4 rounded-xl bg-brand-50 p-3.5 ring-1 ring-brand-100'
              : 'mt-4 rounded-xl bg-ink-50 p-3.5 ring-1 ring-ink-100'
          }
        >
          <p className={step.urgent ? 'font-semibold text-brand-800' : 'font-semibold text-ink-800'}>
            {step.title}
          </p>
          <p className="mt-1 text-sm leading-relaxed text-ink-600">{step.description}</p>
        </div>

        {cycle && cycle.totalDays > 0 ? (
          <div className="mt-4">
            <div className="mb-1.5 flex items-baseline justify-between text-sm">
              <span className="text-ink-500">Tiến độ chu kỳ {cycle.cycleNo}</span>
              <span className="font-semibold text-ink-700 tabular-nums">{cycle.percent}%</span>
            </div>
            <ProgressBar value={cycle.percent} />
            <p className="mt-1.5 text-xs text-ink-500">
              {cycle.completedDays}/{cycle.totalDays} buổi đã hoàn thành
              {progress.itemsAnswered > 0
                ? ` · ${progress.itemsAnswered} câu đã làm · đúng ${Math.round(progress.accuracy * 100)}%`
                : ''}
            </p>
          </div>
        ) : null}

        {goal ? (
          <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3 border-t border-ink-100 pt-4 text-sm">
            <div>
              <dt className="text-xs tracking-wide text-ink-500 uppercase">Đích nhắm tới</dt>
              <dd className="mt-0.5 font-semibold text-ink-800">{goal.targetLevelLabel}</dd>
            </div>
            <div>
              <dt className="text-xs tracking-wide text-ink-500 uppercase">Mốc {goal.deadlineLabel}</dt>
              <dd className="mt-0.5 font-semibold text-ink-800 tabular-nums">
                còn {Math.max(0, goal.daysLeft)} ngày
              </dd>
            </div>
            <div className="col-span-2">
              <dt className="text-xs tracking-wide text-ink-500 uppercase">Nhịp học đã chọn</dt>
              <dd className="mt-0.5 font-medium text-ink-700">
                {goal.daysPerWeek} buổi/tuần · {formatMinutes(goal.minutesPerDay)}/buổi
                {day ? ` · buổi tới ${day.dateLabel}` : ''}
              </dd>
            </div>
          </dl>
        ) : enrollment.estimatedLevelLabel ? (
          <p className="mt-4 border-t border-ink-100 pt-4 text-sm text-ink-600">
            Mức hiện tại: <strong className="text-ink-800">{enrollment.estimatedLevelLabel}</strong>
          </p>
        ) : null}

        {enrollment.status === 'ACTIVE' && enrollment.expiringSoon ? (
          <Alert tone="warn" className="mt-4">
            Quyền truy cập còn {enrollment.daysLeft} ngày (đến {enrollment.expiresAtLabel}). Gia hạn
            sớm để lộ trình không bị đứt quãng.
          </Alert>
        ) : null}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-ink-100 bg-ink-50/60 px-5 py-3.5">
        <span className="text-xs text-ink-500">
          {enrollment.status === 'ACTIVE'
            ? `Hết hạn ${enrollment.expiresAtLabel}`
            : enrollment.statusLabel}
        </span>
        <div className="flex items-center gap-2">
          {!blocked ? (
            <LinkButton
              href={routes.studyDashboard(enrollment.id)}
              variant="ghost"
              size="sm"
            >
              Lộ trình
            </LinkButton>
          ) : null}
          <LinkButton href={step.href} size="sm" variant={step.urgent ? 'primary' : 'secondary'}>
            {step.cta}
          </LinkButton>
        </div>
      </div>
    </Card>
  );
}

// ---------------------------------------------------------------------------

function Stat({ label, value, hint }: { label: string; value: React.ReactNode; hint: string }) {
  return (
    <div className="hover-lift rounded-xl bg-white p-4 ring-1 ring-ink-100 shadow-[0_1px_3px_rgb(23_27_38/0.05)]">
      <p className="text-xs font-medium tracking-wide text-ink-500 uppercase">{label}</p>
      <p className="mt-1.5 text-2xl font-bold text-ink-900 tabular-nums">{value}</p>
      <p className="mt-1 text-sm text-ink-500">{hint}</p>
    </div>
  );
}

/** Mời xem thêm — đặt CUỐI trang, sau khi việc cần làm đã ở trên cùng. */
function ExploreMore() {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <Link
        href={routes.programs()}
        className="hover-lift group rounded-xl bg-white p-5 ring-1 ring-ink-100 shadow-[0_1px_3px_rgb(23_27_38/0.05)]"
      >
        <p className="text-xs font-semibold tracking-[0.14em] text-gold-600 uppercase">Kỳ thi</p>
        <p className="mt-2 font-semibold text-ink-900">Bốn đấu trường đang mở</p>
        <p className="mt-1 text-sm leading-relaxed text-ink-600">
          ASMOPSS, NEO, STEM và FMC — cấu trúc đề, mốc thời gian và cách hệ thống ôn cho từng kỳ.
        </p>
        <span className="mt-3 inline-block text-sm font-medium text-navy-800 group-hover:underline">
          Xem các kỳ thi →
        </span>
      </Link>

      <Link
        href={routes.courses()}
        className="hover-lift group rounded-xl bg-white p-5 ring-1 ring-ink-100 shadow-[0_1px_3px_rgb(23_27_38/0.05)]"
      >
        <p className="text-xs font-semibold tracking-[0.14em] text-gold-600 uppercase">Khóa học</p>
        <p className="mt-2 font-semibold text-ink-900">Thêm môn, thêm khối lớp</p>
        <p className="mt-1 text-sm leading-relaxed text-ink-600">
          Mỗi khóa có video giới thiệu và nội dung từng chặng để xem trước khi đăng ký.
        </p>
        <span className="mt-3 inline-block text-sm font-medium text-navy-800 group-hover:underline">
          Xem danh mục khóa →
        </span>
      </Link>
    </div>
  );
}

/** Chưa ghi danh khóa nào: nói rõ bước tiếp theo thay vì chỉ báo "trống". */
function NoCourses({ firstName }: { firstName: string }) {
  return (
    <>
      <section className="animate-fade-up relative mb-8 overflow-hidden rounded-2xl bg-navy-900 p-6 text-white shadow-[0_24px_56px_-28px_rgb(13_27_49/0.6)] sm:p-10">
        <div className="grid-faint-dark pointer-events-none absolute inset-0" aria-hidden />
        <div className="relative">
          <p className="text-xs font-semibold tracking-[0.16em] text-gold-300 uppercase">
            Chào {firstName}
          </p>
          <h1 className="font-display mt-2.5 max-w-2xl text-2xl leading-tight font-bold tracking-tight text-balance sm:text-3xl">
            Bạn chưa ghi danh khóa nào
          </h1>
          <p className="mt-3 max-w-2xl text-[15px] leading-relaxed text-navy-200 text-pretty">
            Chọn kỳ thi con dự định thi, xem video giới thiệu và nội dung khóa, rồi làm bài kiểm tra
            đầu vào — hệ thống dựng lộ trình riêng ngay sau đó.
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <LinkButton
              href={routes.programs()}
              size="lg"
              className="bg-gold-400 text-navy-950 hover:bg-gold-300"
            >
              Chọn kỳ thi
            </LinkButton>
            <LinkButton
              href={routes.courses()}
              variant="ghost"
              size="lg"
              className="text-navy-200 hover:bg-white/10 hover:text-white"
            >
              Xem tất cả khóa học
            </LinkButton>
          </div>
        </div>
      </section>

      <Section title="Ba bước để có lộ trình riêng">
        <ol className="stagger grid gap-4 sm:grid-cols-3">
          {[
            {
              n: '1',
              title: 'Chọn khóa',
              body: 'Mỗi khóa có trang giới thiệu kèm video, nội dung từng chặng và kết quả đạt được — xem kỹ trước khi trả tiền.',
            },
            {
              n: '2',
              title: 'Làm bài đầu vào',
              body: 'Bài trải đều các chương để hệ thống nhìn ra điểm mạnh và lỗ hổng thật sự, không đoán theo lớp.',
            },
            {
              n: '3',
              title: 'Nhận lộ trình',
              body: 'Bạn cho biết quỹ thời gian, hệ thống chia mục tiêu thành từng buổi vừa sức và tính lại sau mỗi bài.',
            },
          ].map((item) => (
            <li key={item.n} className="rounded-xl bg-white p-5 ring-1 ring-ink-100">
              <span className="step-numeral block text-3xl text-navy-200">{item.n}</span>
              <p className="mt-2 font-semibold text-ink-900">{item.title}</p>
              <p className="mt-1 text-sm leading-relaxed text-ink-600">{item.body}</p>
            </li>
          ))}
        </ol>
      </Section>
    </>
  );
}
