import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getCourse } from '@/server/catalog/service';
import { getSession } from '@/lib/auth';
import { getCopy } from '@/lib/copy';
import { routes } from '@/lib/routes';
import { formatVnd } from '@/lib/domain';
import { SiteShell } from '@/components/site-shell';
import { IntroVideo } from '@/components/video';
import { Reveal } from '@/components/motion';

export const dynamic = 'force-dynamic';

const SHELL = 'mx-auto w-full max-w-6xl px-5 lg:px-8';

export async function generateMetadata({ params }: { params: Promise<{ courseId: string }> }) {
  const { courseId } = await params;
  try {
    const course = await getCourse(courseId);
    return {
      title: `${course.name} — ${course.program.name}`,
      description: course.tagline ?? course.description ?? undefined,
    };
  } catch {
    return { title: 'Khóa học' };
  }
}

/**
 * TRANG GIỚI THIỆU MỘT KHÓA HỌC.
 *
 * Đây là bước còn thiếu trong phễu bán hàng: trước đây bấm vào một khóa là nhảy
 * thẳng sang trang thanh toán, khách chưa kịp biết mình mua gì. Trang này đứng
 * giữa — video, mô tả, kết quả đạt được và nội dung theo chặng — rồi mới tới nút
 * đăng ký.
 *
 * Toàn bộ nội dung do admin nhập trong `/quan-tri/chuong-trinh`. Khóa chưa nhập
 * gì vẫn hiển thị được: các khối rỗng tự ẩn đi thay vì để lại tiêu đề trống.
 */
export default async function CourseDetailPage({
  params,
}: {
  params: Promise<{ courseId: string }>;
}) {
  const { courseId } = await params;
  const [session, t] = await Promise.all([getSession(), getCopy()]);

  let course;
  try {
    course = await getCourse(courseId);
  } catch {
    notFound();
  }

  const hasIntro = Boolean(course.longDescription || course.introVideoUrl);
  const buyHref = routes.checkout(course.id);

  return (
    <SiteShell signedIn={Boolean(session)}>
      {/* ================= Đầu trang ================= */}
      <section className="paper relative overflow-hidden pt-14 pb-16 sm:pt-16 lg:pt-20 lg:pb-20">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 bg-[radial-gradient(90%_70%_at_80%_4%,#ffe6d5_0%,rgba(255,242,233,0)_62%),radial-gradient(70%_60%_at_8%_32%,#fff0e2_0%,rgba(255,251,248,0)_60%),linear-gradient(180deg,#fff7f1_0%,#fffbf8_82%)]"
        />
        <div className="grid-faint pointer-events-none absolute inset-0" aria-hidden />
        <span
          aria-hidden
          className="absolute inset-x-0 top-0 h-1"
          style={{ backgroundColor: course.program.colorHex }}
        />

        <div className={`${SHELL} relative`}>
          <Link
            href={routes.courses()}
            className="text-[13px] font-medium text-warm-500 transition-colors hover:text-warm-900"
          >
            ← {t('course.back')}
          </Link>

          <div className="mt-6 grid gap-10 lg:grid-cols-[1.3fr_1fr] lg:items-end">
            <div>
              <Link
                href={routes.program(course.program.code)}
                className="text-[11px] font-bold tracking-[0.18em] uppercase transition-opacity hover:opacity-80"
                style={{ color: course.program.colorHex }}
              >
                {course.program.shortName ?? course.program.code}
              </Link>

              <h1 className="font-display mt-3 max-w-2xl text-[32px] leading-[1.1] font-bold tracking-tight text-warm-900 text-balance sm:text-[46px]">
                {course.name}
              </h1>

              {course.tagline ? (
                <p className="mt-4 max-w-xl text-[17px] leading-snug font-medium text-brand-700 text-pretty">
                  {course.tagline}
                </p>
              ) : null}

              <p className="mt-4 text-[15px] text-warm-500">
                {course.gradeBandLabel} · {course.subjectLabel}
              </p>

              {course.description ? (
                <p className="mt-5 max-w-xl text-[16.5px] leading-relaxed text-warm-500 text-pretty">
                  {course.description}
                </p>
              ) : null}
            </div>

            <div className="rounded-2xl bg-white/8 p-6 ring-1 ring-white/12 backdrop-blur-sm">
              <p className="text-[11px] font-semibold tracking-[0.14em] text-warm-500 uppercase">
                {t('course.price.label')}
              </p>
              <p className="font-display mt-1 text-4xl font-bold text-brand-700">
                {formatVnd(course.pricing.price)}
              </p>
              <p className="mt-2 text-[12.5px] text-warm-500">
                {t('course.access.label')}: {course.pricing.accessDurationDays} ngày
              </p>

              <Link
                href={buyHref}
                className="press mt-5 flex w-full items-center justify-center gap-2 rounded-xl bg-gold-300 px-6 py-3.5 text-[15px] font-bold text-warm-900 transition-all hover:bg-gold-200"
              >
                {t('course.cta.button')}
                <span aria-hidden>→</span>
              </Link>

              <p className="mt-3 text-center text-[12px] text-warm-400">
                {course.publishedItemCount} câu hỏi · {course.skillCount} kỹ năng
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ================= Video + giới thiệu ================= */}
      {hasIntro ? (
        <section className="bg-white py-16 lg:py-22">
          <div className={SHELL}>
            <div className="grid gap-12 lg:grid-cols-[1fr_1.05fr] lg:items-start lg:gap-16">
              {course.introVideoUrl ? (
                <Reveal>
                  <IntroVideo
                    url={course.introVideoUrl}
                    title={`${course.name} — video giới thiệu`}
                    className="shadow-[0_24px_60px_-30px_rgb(120_70_45/0.6)]"
                  />
                </Reveal>
              ) : null}

              <Reveal delay={course.introVideoUrl ? 110 : 0}>
                <span className="gold-rule block" aria-hidden />
                <h2 className="font-display mt-5 text-[26px] leading-[1.15] font-bold tracking-tight text-warm-900 sm:text-[34px]">
                  {course.introVideoUrl ? t('course.video.title') : course.name}
                </h2>

                {course.longDescription ? (
                  <div className="mt-5 space-y-4">
                    {course.longDescription
                      .split(/\n{2,}/)
                      .map((paragraph) => paragraph.trim())
                      .filter(Boolean)
                      .map((paragraph) => (
                        <p
                          key={paragraph.slice(0, 40)}
                          className="text-[16px] leading-relaxed whitespace-pre-line text-warm-600 text-pretty"
                        >
                          {paragraph}
                        </p>
                      ))}
                  </div>
                ) : (
                  <p className="mt-5 text-[15.5px] leading-relaxed text-warm-500">
                    {t('course.empty.intro')}
                  </p>
                )}
              </Reveal>
            </div>
          </div>
        </section>
      ) : null}

      {/* ================= Kết quả đạt được ================= */}
      {course.outcomes.length > 0 ? (
        <section className="paper py-16 lg:py-22">
          <div className={SHELL}>
            <Reveal>
              <span className="gold-rule block" aria-hidden />
              <h2 className="font-display mt-5 text-[26px] leading-tight font-bold tracking-tight text-warm-900 sm:text-[34px]">
                {t('course.outcomes.title')}
              </h2>
            </Reveal>

            <ul className="mt-10 grid gap-5 sm:grid-cols-2">
              {course.outcomes.map((outcome, index) => (
                <Reveal as="li" key={outcome} delay={index * 50}>
                  <div className="flex gap-3.5 rounded-2xl bg-white p-5 ring-1 ring-warm-100">
                    <span
                      aria-hidden
                      className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-gold-100 text-[12px] font-bold text-gold-700"
                    >
                      ✓
                    </span>
                    <p className="text-[15.5px] leading-relaxed text-warm-700">{outcome}</p>
                  </div>
                </Reveal>
              ))}
            </ul>
          </div>
        </section>
      ) : null}

      {/* ================= Nội dung theo chặng ================= */}
      {course.syllabus.length > 0 ? (
        <section className="bg-white py-16 lg:py-22">
          <div className={SHELL}>
            <Reveal>
              <span className="gold-rule block" aria-hidden />
              <h2 className="font-display mt-5 text-[26px] leading-tight font-bold tracking-tight text-warm-900 sm:text-[34px]">
                {t('course.syllabus.title')}
              </h2>
            </Reveal>

            <ol className="mt-10 divide-y divide-warm-100 border-y border-warm-100">
              {course.syllabus.map((step, index) => (
                <Reveal as="li" key={step.title} delay={Math.min(index, 8) * 45}>
                  <div className="flex gap-5 py-5">
                    <span
                      aria-hidden
                      className="step-numeral shrink-0 text-[26px] font-bold"
                    >
                      {String(index + 1).padStart(2, '0')}
                    </span>
                    <div>
                      <p className="text-[16px] font-semibold text-warm-900">{step.title}</p>
                      <p className="mt-1 text-[14.5px] leading-relaxed whitespace-pre-line text-warm-600">
                        {step.detail}
                      </p>
                    </div>
                  </div>
                </Reveal>
              ))}
            </ol>
          </div>
        </section>
      ) : null}

      {/* ================= Chốt đơn ================= */}
      <section className="bg-white pb-20 lg:pb-28">
        <div className={SHELL}>
          <Reveal>
            <div className="relative overflow-hidden rounded-[36px] bg-gradient-to-br from-[#fff0e3] via-[#ffe0cb] to-[#ffc3a0] px-6 py-16 text-center shadow-[0_40px_80px_-50px_rgb(200_110_60/0.6),inset_0_0_0_1px_rgb(228_87_46/0.14)] sm:px-12">
              <div className="grid-faint-soft pointer-events-none absolute inset-0" aria-hidden />
              <div className="relative mx-auto max-w-2xl">
                <span className="gold-rule mx-auto block" aria-hidden />
                <h2 className="font-display mt-6 text-[27px] leading-[1.15] font-bold tracking-tight text-warm-900 text-balance sm:text-[38px]">
                  {t('course.cta.title')}
                </h2>
                <p className="mx-auto mt-5 max-w-xl text-[16px] leading-relaxed whitespace-pre-line text-warm-700 text-pretty">
                  {t('course.cta.body')}
                </p>

                <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
                  <Link
                    href={buyHref}
                    className="press btn-fire inline-flex items-center gap-2.5 rounded-2xl px-8 py-4 text-[15px] font-bold"
                  >
                    {t('course.cta.button')} · {formatVnd(course.pricing.price)}
                    <span aria-hidden>→</span>
                  </Link>
                  <Link
                    href={routes.program(course.program.code)}
                    className="press btn-cream inline-flex items-center rounded-2xl px-6 py-4 text-[15px] font-bold"
                  >
                    {t('programs.card.cta')}
                  </Link>
                </div>
              </div>
            </div>
          </Reveal>
        </div>
      </section>
    </SiteShell>
  );
}
