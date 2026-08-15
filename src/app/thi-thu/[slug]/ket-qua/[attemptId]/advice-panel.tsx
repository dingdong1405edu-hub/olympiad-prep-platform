/**
 * KHỐI "HỌC LỰC + HỌC TIẾP GÌ" trên trang kết quả thi thử.
 *
 * Thứ tự trên màn hình là có chủ ý: mức năng lực → thang bốn mức để biết mình
 * đứng đâu → mạnh yếu từng phần → khóa học nên đi tiếp. Người đọc trả lời được
 * ba câu hỏi liên tiếp: "tôi đang ở đâu", "vì sao", "giờ làm gì".
 *
 * Không có state, không gọi mạng — chỉ vẽ lại đúng dữ liệu `getResultAdvice`
 * đã tính ở máy chủ. Mọi ngưỡng và nhãn mức đều theo cấu hình của admin, giao
 * diện không tự chế thêm mức nào.
 */
import Link from 'next/link';
import type { StudentLevel } from '@prisma/client';
import type { CourseSuggestion, LevelVerdict, ResultAdvice } from '@/server/mock-exam/advice';
import { Badge, Card, ProgressBar, cx } from '@/components/ui';

type Tone = 'accent' | 'brand' | 'amber' | 'rose';

const LEVEL_TONE: Record<StudentLevel, Tone> = {
  EXCELLENT: 'accent',
  GOOD: 'brand',
  AVERAGE: 'amber',
  WEAK: 'rose',
};

const TONE_TEXT: Record<Tone, string> = {
  accent: 'text-accent-700',
  brand: 'text-brand-700',
  amber: 'text-amber-700',
  rose: 'text-rose-700',
};

const TONE_CHIP: Record<Tone, string> = {
  accent: 'bg-accent-600 text-white ring-accent-600',
  brand: 'bg-brand-600 text-white ring-brand-600',
  amber: 'bg-amber-500 text-white ring-amber-500',
  rose: 'bg-rose-500 text-white ring-rose-500',
};

const TONE_BAR: Record<Tone, string> = {
  accent: 'bg-accent-600',
  brand: 'bg-brand-600',
  amber: 'bg-amber-500',
  rose: 'bg-rose-500',
};

function partTone(percent: number): Tone {
  if (percent >= 82) return 'accent';
  if (percent >= 62) return 'brand';
  if (percent >= 40) return 'amber';
  return 'rose';
}

export function AdvicePanel({ advice }: { advice: ResultAdvice }) {
  return (
    <>
      <LevelCard verdict={advice.verdict} />
      <CourseSuggestions intro={advice.coursesIntro} courses={advice.courses} />
    </>
  );
}

// ---------------------------------------------------------------------------

function LevelCard({ verdict }: { verdict: LevelVerdict }) {
  const tone: Tone = verdict.level ? LEVEL_TONE[verdict.level] : 'amber';
  const pending = verdict.level === null;

  return (
    <Card className="mt-4">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="text-xs font-semibold tracking-wide text-ink-500 uppercase">
            {pending ? 'Chưa đủ căn cứ' : 'Học lực ước lượng'}
          </p>
          <p className={cx('mt-1 text-3xl font-bold', pending ? 'text-ink-700' : TONE_TEXT[tone])}>
            {verdict.levelLabel ?? verdict.headline}
          </p>
        </div>
        {!pending ? (
          <p className="shrink-0 text-right">
            <span className="block text-2xl font-bold tabular-nums text-ink-800">
              {verdict.percent}%
            </span>
            <span className="block text-xs text-ink-500">
              {verdict.score}/{verdict.totalPoints} điểm
            </span>
          </p>
        ) : null}
      </div>

      {/* --- Thang bốn mức --- */}
      <ol className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
        {verdict.scale.map((step) => {
          const stepTone = LEVEL_TONE[step.level];
          return (
            <li
              key={step.level}
              aria-current={step.current || undefined}
              className={cx(
                'rounded-lg px-3 py-2 text-center ring-1 ring-inset transition-colors',
                step.current
                  ? TONE_CHIP[stepTone]
                  : 'bg-ink-50 text-ink-500 ring-ink-100',
              )}
            >
              <span className="block text-sm font-semibold">{step.label}</span>
              <span
                className={cx(
                  'block text-[11px] tabular-nums',
                  step.current ? 'text-white/80' : 'text-ink-400',
                )}
              >
                từ {step.threshold}%
              </span>
            </li>
          );
        })}
      </ol>

      <p className="mt-4 text-sm leading-relaxed text-ink-700">{verdict.detail}</p>

      {verdict.nextLevel ? (
        <p className="mt-2 text-sm text-ink-600">
          Còn <strong className="tabular-nums">{verdict.nextLevel.pointsNeeded} điểm</strong> nữa là
          lên mức <strong>{verdict.nextLevel.label}</strong>.
        </p>
      ) : null}

      {/* --- Mạnh yếu từng phần: chỉ hiện khi đã chấm xong, vì chưa chấm thì
             phần tự luận đang là 0 điểm do chưa ai chấm, không phải do làm sai. --- */}
      {!pending && verdict.parts.length > 0 ? (
        <div className="mt-5 border-t border-ink-100 pt-4">
          <h3 className="text-xs font-semibold tracking-wide text-ink-500 uppercase">
            Từng phần của đề
          </h3>
          <ul className="mt-3 space-y-3">
            {verdict.parts.map((part) => (
              <li key={part.part}>
                <div className="flex items-baseline justify-between gap-3 text-sm">
                  <span className="font-medium text-ink-800">
                    {part.label}
                    {verdict.weakest?.part === part.part ? (
                      <Badge tone="danger" className="ml-2">
                        yếu nhất
                      </Badge>
                    ) : null}
                    {verdict.strongest?.part === part.part ? (
                      <Badge tone="success" className="ml-2">
                        mạnh nhất
                      </Badge>
                    ) : null}
                  </span>
                  <span className="shrink-0 tabular-nums text-ink-600">
                    {part.awarded}/{part.total} · {part.percent}%
                  </span>
                </div>
                <ProgressBar
                  className="mt-1.5"
                  value={part.awarded}
                  max={part.total}
                  color={TONE_BAR[partTone(part.percent)]}
                />
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </Card>
  );
}

// ---------------------------------------------------------------------------

function CourseSuggestions({
  intro,
  courses,
}: {
  intro: string;
  courses: CourseSuggestion[];
}) {
  if (courses.length === 0) {
    return (
      <Card className="mt-4">
        <h2 className="text-lg font-semibold text-ink-900">Học tiếp gì bây giờ?</h2>
        <p className="mt-1 text-sm text-ink-600">
          Hiện chưa có khóa học nào đang mở khớp với đề này.{' '}
          <Link href="/khoa-hoc" className="font-medium text-brand-700 hover:underline">
            Xem toàn bộ khóa học
          </Link>
          .
        </p>
      </Card>
    );
  }

  return (
    <section className="mt-4">
      <Card>
        <h2 className="text-lg font-semibold text-ink-900">Học tiếp gì bây giờ?</h2>
        <p className="mt-1 text-sm leading-relaxed text-ink-600">{intro}</p>

        <ul className="mt-4 space-y-3">
          {courses.map((course) => (
            <li key={course.courseId}>
              <CourseRow course={course} />
            </li>
          ))}
        </ul>
      </Card>
    </section>
  );
}

function CourseRow({ course }: { course: CourseSuggestion }) {
  return (
    <div className="rounded-xl bg-ink-50/70 p-4 ring-1 ring-ink-100">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="flex flex-wrap items-center gap-2">
            <span aria-hidden className="text-lg">
              {course.logoEmoji}
            </span>
            <span className="font-semibold text-ink-900">{course.name}</span>
            {course.enrolled ? <Badge tone="success">em đã có khóa này</Badge> : null}
          </p>
          <p className="mt-1 flex flex-wrap gap-2 text-xs text-ink-500">
            <span>{course.programName}</span>
            <span aria-hidden>·</span>
            <span>{course.subjectLabel}</span>
            <span aria-hidden>·</span>
            <span>{course.gradeBandLabel}</span>
          </p>
        </div>

        <div className="shrink-0 text-right">
          {course.priceLabel ? (
            <p className="text-sm font-semibold tabular-nums text-ink-800">{course.priceLabel}</p>
          ) : null}
          <Link
            href={course.href}
            className="press mt-1 inline-block rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white transition-all hover:bg-brand-700"
          >
            {course.ctaLabel}
          </Link>
        </div>
      </div>

      <p className="mt-2 text-sm text-ink-700">{course.reason}</p>
      {course.tagline ? <p className="mt-1 text-sm text-ink-600">{course.tagline}</p> : null}

      {course.outcomes.length > 0 ? (
        <ul className="mt-2 space-y-1">
          {course.outcomes.map((outcome) => (
            <li key={outcome} className="flex gap-2 text-sm text-ink-600">
              <span aria-hidden className="text-accent-600">
                ✓
              </span>
              <span className="min-w-0">{outcome}</span>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
