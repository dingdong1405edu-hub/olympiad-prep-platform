import { notFound } from 'next/navigation';
import Link from 'next/link';
import { getProgramByCode } from '@/server/catalog/service';
import { getSession } from '@/lib/auth';
import { routes } from '@/lib/routes';
import { formatVnd, GRADE_BAND_LABEL, SUBJECT_LABEL } from '@/lib/domain';
import { getCopy } from '@/lib/copy';
import { SiteShell } from '@/components/site-shell';
import { IntroVideo } from '@/components/video';
import { Reveal } from '@/components/motion';

export const dynamic = 'force-dynamic';

/**
 * Trang kỳ thi — nơi khách chốt đơn.
 *
 * Dùng chung khung bán hàng với trang chủ chứ không phải AppShell: khách vừa
 * xem một trang được chăm chút rồi bấm vào đây, nếu rơi vào giao diện phần mềm
 * nội bộ thì niềm tin vừa dựng lên sẽ rơi đúng ở bước sắp trả tiền.
 */
const SHELL = 'mx-auto w-full max-w-6xl px-5 lg:px-8';

export default async function ProgramPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const [session, t] = await Promise.all([getSession(), getCopy()]);

  let program;
  try {
    program = await getProgramByCode(code);
  } catch {
    notFound();
  }

  const lowestPrice = program.courses.length
    ? Math.min(...program.courses.map((course) => course.pricing.price))
    : 0;

  const deliverables = [1, 2, 3, 4, 5].map((n) => ({
    t: t(`program.deliverables.${n}.title`),
    d: t(`program.deliverables.${n}.detail`),
  }));

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
          style={{ backgroundColor: program.colorHex }}
        />

        <div className={`${SHELL} relative`}>
          <Link
            href={routes.home()}
            className="text-[13px] font-medium text-warm-500 transition-colors hover:text-warm-900"
          >
            ← {t('program.back')}
          </Link>

          <div className="mt-6 grid gap-10 lg:grid-cols-[1.35fr_1fr] lg:items-end">
            <div>
              <p
                className="text-[11px] font-bold tracking-[0.18em] uppercase"
                style={{ color: program.colorHex }}
              >
                {program.shortName ?? program.code}
                {program.season ? ` · Mùa ${program.season}` : ''}
              </p>

              <h1 className="font-display mt-3 max-w-2xl text-[34px] leading-[1.1] font-bold tracking-tight text-warm-900 text-balance sm:text-5xl lg:text-[56px]">
                {program.name}
              </h1>

              {program.tagline ? (
                <p className="mt-4 max-w-xl text-[17px] leading-snug font-medium text-brand-700 text-pretty">
                  {program.tagline}
                </p>
              ) : null}

              <p className="mt-5 max-w-xl text-[16.5px] leading-relaxed text-warm-500 text-pretty">
                {program.description}
              </p>

              {!program.active ? (
                <p className="mt-6 inline-flex items-start gap-2.5 rounded-xl bg-amber-400/12 px-4 py-3 text-[14px] text-amber-200 ring-1 ring-amber-300/25">
                  <span aria-hidden className="font-bold">
                    !
                  </span>
                  <span>
                    <strong className="font-semibold">Kỳ thi này đang tạm đóng.</strong> Chương trình
                    chưa mở bán cho mùa hiện tại — bạn có thể chọn kỳ thi khác ở trang chủ.
                  </span>
                </p>
              ) : null}
            </div>

            <div className="flex flex-col gap-4 sm:flex-row lg:flex-col lg:items-end">
              {lowestPrice > 0 ? (
                <div className="rounded-2xl bg-white/8 px-6 py-5 ring-1 ring-white/12 backdrop-blur-sm">
                  <p className="text-[11px] font-semibold tracking-[0.14em] text-warm-500 uppercase">
                    {t('program.price.label')}
                  </p>
                  <p className="font-display mt-1 text-3xl font-bold text-brand-700">
                    {formatVnd(lowestPrice)}
                  </p>
                  <p className="mt-1 text-[12.5px] text-warm-500">
                    {program.courses.length} khóa đang mở · {program.availability.length} khối lớp
                  </p>
                </div>
              ) : null}

              {program.activeCohort ? (
                <div className="rounded-2xl bg-white/8 px-6 py-5 ring-1 ring-white/12 backdrop-blur-sm">
                  <p className="text-[11px] font-semibold tracking-[0.14em] text-warm-500 uppercase">
                    Ngày thi dự kiến
                  </p>
                  <p className="font-display mt-1 text-2xl font-bold text-warm-900 tabular-nums">
                    {program.activeCohort.examDate.toLocaleDateString('vi-VN')}
                  </p>
                  <p className="mt-1 text-[12.5px] text-warm-500">
                    Hệ thống dồn trọng tâm ôn luyện khi mốc này tới gần
                  </p>
                </div>
              ) : null}
            </div>
          </div>

          {program.highlights.length > 0 ? (
            <ul className="mt-12 grid gap-x-8 gap-y-3 border-t border-warm-200 pt-8 sm:grid-cols-2 lg:grid-cols-3">
              {program.highlights.map((highlight) => (
                <li key={highlight} className="flex gap-2.5 text-[14px] leading-snug text-warm-600">
                  <span aria-hidden className="mt-px shrink-0 text-brand-700">
                    ◆
                  </span>
                  {highlight}
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      </section>

      {/* ================= Giới thiệu + video ================= */}
      {program.introVideoUrl || program.longDescription || program.sections.length > 0 ? (
        <section className="bg-white py-18 lg:py-24">
          <div className={SHELL}>
            <div className="grid gap-12 lg:grid-cols-[1.05fr_1fr] lg:items-start lg:gap-16">
              <Reveal>
                <span className="gold-rule block" aria-hidden />
                <h2 className="font-display mt-5 text-[28px] leading-[1.15] font-bold tracking-tight text-warm-900 text-balance sm:text-[36px]">
                  {program.introVideoUrl ? t('program.video.title') : t('program.courses.title')}
                </h2>

                {program.longDescription ? (
                  <div className="mt-5 space-y-4">
                    {program.longDescription
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
                ) : null}

                {program.sections.length > 0 ? (
                  <div className="mt-8 space-y-6 border-t border-warm-100 pt-8">
                    {program.sections.map((section) => (
                      <div key={section.title}>
                        <h3 className="font-display text-[19px] font-bold text-warm-900">
                          {section.title}
                        </h3>
                        <p className="mt-2 text-[15.5px] leading-relaxed whitespace-pre-line text-warm-600">
                          {section.body}
                        </p>
                      </div>
                    ))}
                  </div>
                ) : null}
              </Reveal>

              {program.introVideoUrl ? (
                <Reveal delay={110}>
                  <IntroVideo
                    url={program.introVideoUrl}
                    poster={program.introVideoPoster}
                    title={`${program.name} — video giới thiệu`}
                    className="shadow-[0_24px_60px_-30px_rgb(120_70_45/0.6)]"
                  />
                  <p className="mt-3 text-[13.5px] leading-relaxed text-warm-500">
                    {t('program.video.subtitle')}
                  </p>
                </Reveal>
              ) : null}
            </div>
          </div>
        </section>
      ) : null}

      {/* ================= Khối lớp và môn ================= */}
      <section className="paper py-18 lg:py-24">
        <div className={SHELL}>
          <Reveal>
            <span className="gold-rule block" aria-hidden />
            <h2 className="font-display mt-5 text-[28px] leading-tight font-bold tracking-tight text-warm-900 sm:text-[38px]">
              {t('program.courses.title')}
            </h2>
            <p className="mt-3 max-w-2xl text-[16px] leading-relaxed whitespace-pre-line text-warm-600">
              {t('program.courses.subtitle')}
            </p>
          </Reveal>

          {program.courses.length > 0 ? (
            <div className="mt-12 space-y-12">
              {program.availability.map((band, bandIndex) => {
                const courses = program.courses.filter(
                  (course) => course.gradeBand === band.gradeBand,
                );

                return (
                  <Reveal key={band.gradeBand} delay={bandIndex * 70}>
                    <div className="flex items-center gap-4">
                      <h3 className="text-[12px] font-bold tracking-[0.16em] text-warm-500 uppercase">
                        {GRADE_BAND_LABEL[band.gradeBand]}
                      </h3>
                      <span className="h-px flex-1 bg-warm-200" aria-hidden />
                      <span className="text-[12.5px] text-warm-400">{courses.length} khóa</span>
                    </div>

                    <div className="mt-5 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
                      {courses.map((course) => (
                        <div
                          key={course.id}
                          className="hover-lift flex flex-col rounded-2xl bg-white p-6 ring-1 ring-warm-100 shadow-[0_2px_10px_-4px_rgb(120_70_45/0.1)]"
                        >
                          <h4 className="font-display text-[20px] font-bold text-warm-900">
                            {SUBJECT_LABEL[course.subject]}
                          </h4>
                          {course.description ? (
                            <p className="mt-2 text-[14px] leading-relaxed text-warm-600">
                              {course.description}
                            </p>
                          ) : null}

                          <div className="mt-6 border-t border-warm-100 pt-4">
                            <p className="font-display text-[26px] leading-none font-bold text-warm-900">
                              {formatVnd(course.pricing.price)}
                            </p>
                            <p className="mt-1.5 text-[12.5px] text-warm-500">
                              Truy cập {course.pricing.accessDurationDays} ngày
                            </p>

                            <Link
                              href={routes.course(course.id)}
                              className="press mt-4 flex w-full items-center justify-center gap-2 rounded-xl btn-fire px-5 py-3 text-[14.5px] font-bold"
                            >
                              {t('courses.card.cta')}
                              <span aria-hidden>→</span>
                            </Link>
                          </div>
                        </div>
                      ))}
                    </div>
                  </Reveal>
                );
              })}
            </div>
          ) : (
            <div className="mt-10 rounded-2xl border border-dashed border-warm-200 bg-white/60 px-6 py-14 text-center">
              <p className="font-medium text-warm-700">Chưa có khóa nào được mở cho kỳ thi này</p>
              <p className="mx-auto mt-1 max-w-md text-sm text-warm-500">
                Bạn có thể xem các kỳ thi khác ở trang chủ.
              </p>
            </div>
          )}
        </div>
      </section>

      {/* ================= Nhận được gì ================= */}
      <section className="bg-white py-18 lg:py-24">
        <div className={SHELL}>
          <div className="grid gap-12 lg:grid-cols-[0.85fr_1.15fr] lg:gap-20">
            <Reveal>
              <span className="gold-rule block" aria-hidden />
              <h2 className="font-display mt-5 text-[28px] leading-[1.15] font-bold tracking-tight text-warm-900 text-balance sm:text-[38px]">
                {t('program.deliverables.title')}
              </h2>
              <p className="mt-4 text-[15.5px] leading-relaxed text-warm-600">
                Học phí trả một lần cho trọn thời gian truy cập. Không có gói nâng cấp ẩn, không tính
                thêm theo số bài con làm.
              </p>

              <Link
                href={session ? routes.myCourses() : routes.register(routes.program(code))}
                className="press mt-8 inline-flex items-center gap-2.5 rounded-xl btn-fire px-7 py-4 text-[15px] font-bold"
              >
                {session ? t('program.cta.member') : t('program.cta.guest')}
                <span aria-hidden>→</span>
              </Link>
            </Reveal>

            <Reveal delay={100}>
              <ol className="divide-y divide-warm-100 border-y border-warm-100">
                {deliverables.map((row, index) => (
                  <li key={row.t} className="flex gap-5 py-5">
                    <span
                      aria-hidden
                      className="step-numeral shrink-0 text-[26px] font-bold"
                    >
                      {String(index + 1).padStart(2, '0')}
                    </span>
                    <div>
                      <p className="text-[15.5px] font-semibold text-warm-900">{row.t}</p>
                      <p className="mt-1 text-[14px] leading-relaxed text-warm-600">{row.d}</p>
                    </div>
                  </li>
                ))}
              </ol>
            </Reveal>
          </div>
        </div>
      </section>
      {/* ================= Hỏi đáp riêng của kỳ thi ================= */}
      {program.faqs.length > 0 ? (
        <section className="paper py-18 lg:py-24">
          <div className={SHELL}>
            <div className="grid gap-10 lg:grid-cols-[0.8fr_1.2fr] lg:gap-20">
              <Reveal>
                <span className="gold-rule block" aria-hidden />
                <h2 className="font-display mt-5 text-[28px] leading-tight font-bold tracking-tight text-warm-900 sm:text-[36px]">
                  {t('program.faq.title')}
                </h2>
              </Reveal>

              <Reveal delay={100}>
                <div className="divide-y divide-warm-100 border-y border-warm-100">
                  {program.faqs.map((faq) => (
                    <details key={faq.question} className="group py-5">
                      <summary className="flex cursor-pointer list-none items-start justify-between gap-5 text-[16px] font-semibold text-warm-900 marker:content-['']">
                        {faq.question}
                        <span
                          aria-hidden
                          className="mt-0.5 shrink-0 text-xl leading-none font-light text-warm-400 transition-transform duration-300 group-open:rotate-45"
                        >
                          +
                        </span>
                      </summary>
                      <p className="mt-3 max-w-2xl text-[15px] leading-relaxed whitespace-pre-line text-warm-600 text-pretty">
                        {faq.answer}
                      </p>
                    </details>
                  ))}
                </div>
              </Reveal>
            </div>
          </div>
        </section>
      ) : null}
    </SiteShell>
  );
}
