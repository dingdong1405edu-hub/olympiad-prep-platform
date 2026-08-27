import Link from 'next/link';
import { getCatalogTree } from '@/server/catalog/service';
import { getSession } from '@/lib/auth';
import { routes } from '@/lib/routes';
import { formatVnd, SUBJECT_LABEL } from '@/lib/domain';
import { getCopy } from '@/lib/copy';
import { SiteShell } from '@/components/site-shell';
import { Reveal } from '@/components/motion';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Các kỳ thi đang mở',
  description:
    'Danh sách đầy đủ các kỳ thi Olympic đang mở luyện: ASMOPSS, NEO, STEM, FMC — kèm khối lớp, môn học và học phí từng khóa.',
};

const SHELL = 'mx-auto w-full max-w-6xl px-5 lg:px-8';

/**
 * Danh sách TẤT CẢ kỳ thi.
 *
 * Trang chủ chỉ nêu vài kỳ thi trong mạch kể chuyện bán hàng; trang này là nơi
 * phụ huynh đã biết mình muốn gì và cần so sánh cạnh nhau: mỗi kỳ thi mở những
 * khối nào, môn nào, giá bao nhiêu, ngày thi khi nào.
 */
export default async function ProgramListPage() {
  const [programs, session, t] = await Promise.all([getCatalogTree(), getSession(), getCopy()]);

  const openPrograms = programs.filter((program) => program.active);
  const totalCourses = openPrograms.reduce((sum, program) => sum + program.courseCount, 0);
  const allSubjects = [...new Set(openPrograms.flatMap((program) => program.subjects))];

  return (
    <SiteShell signedIn={Boolean(session)}>
      {/* ================= Đầu trang ================= */}
      <section className="paper relative overflow-hidden pt-14 pb-16 sm:pt-16 lg:pt-20 lg:pb-20">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 bg-[radial-gradient(90%_70%_at_80%_4%,#ffe6d5_0%,rgba(255,242,233,0)_62%),radial-gradient(70%_60%_at_8%_32%,#fff0e2_0%,rgba(255,251,248,0)_60%),linear-gradient(180deg,#fff7f1_0%,#fffbf8_82%)]"
        />
        <div className="grid-faint pointer-events-none absolute inset-0" aria-hidden />
        <div className={`${SHELL} relative`}>
          <p className="text-[11px] font-bold tracking-[0.18em] text-brand-700 uppercase">
            {t('programs.eyebrow')}
          </p>
          <h1 className="font-display mt-3 max-w-3xl text-[34px] leading-[1.1] font-bold tracking-tight text-warm-900 text-balance sm:text-5xl lg:text-[56px]">
            {t('programs.title')}
          </h1>
          <p className="mt-5 max-w-2xl text-[16.5px] leading-relaxed text-warm-500 text-pretty">
            {t('programs.subtitle')}
          </p>

          {openPrograms.length > 0 ? (
            <dl className="mt-10 flex flex-wrap gap-x-10 gap-y-5">
              {[
                { k: t('programs.stat.programs'), v: String(openPrograms.length) },
                { k: t('programs.stat.courses'), v: String(totalCourses) },
                { k: t('programs.stat.subjects'), v: String(allSubjects.length) },
              ].map((stat) => (
                <div key={stat.k}>
                  <dt className="text-[11px] font-semibold tracking-[0.14em] text-warm-400 uppercase">
                    {stat.k}
                  </dt>
                  <dd className="font-display mt-1 text-3xl font-bold text-warm-900 tabular-nums">
                    {stat.v}
                  </dd>
                </div>
              ))}
            </dl>
          ) : null}
        </div>
      </section>

      {/* ================= Danh sách ================= */}
      <section className="bg-white py-16 lg:py-24">
        <div className={SHELL}>
          {openPrograms.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-warm-200 bg-warm-50/50 px-6 py-16 text-center">
              <p className="font-display text-xl font-bold text-warm-800">
                {t('programs.empty.title')}
              </p>
              <p className="mx-auto mt-2 max-w-md text-[15px] leading-relaxed whitespace-pre-line text-warm-500">
                {t('programs.empty.body')}
              </p>
              <Link
                href={routes.home()}
                className="mt-6 inline-block text-[14px] font-semibold text-warm-700 underline underline-offset-4 hover:text-warm-900"
              >
                ← Về trang chủ
              </Link>
            </div>
          ) : (
            <div className="space-y-8">
              {openPrograms.map((program, index) => (
                <Reveal key={program.id} delay={index * 70}>
                  <article className="overflow-hidden rounded-2xl bg-white ring-1 ring-warm-100 shadow-[0_2px_12px_-6px_rgb(120_70_45/0.12)]">
                    <span
                      aria-hidden
                      className="block h-1.5 w-full"
                      style={{ backgroundColor: program.colorHex }}
                    />

                    <div className="grid gap-8 p-6 lg:grid-cols-[1.4fr_1fr] lg:p-8">
                      {/* --- Giới thiệu --- */}
                      <div>
                        <div className="flex flex-wrap items-center gap-3">
                          <span
                            className="text-[11px] font-bold tracking-[0.16em] uppercase"
                            style={{ color: program.colorHex }}
                          >
                            {program.shortName ?? program.code}
                          </span>
                          {program.season ? (
                            <span className="rounded-md bg-warm-50 px-2 py-0.5 text-[11.5px] font-medium text-warm-600">
                              Mùa {program.season}
                            </span>
                          ) : null}
                          {program.examDate ? (
                            <span className="rounded-md bg-gold-50 px-2 py-0.5 text-[11.5px] font-semibold text-gold-700">
                              Thi{' '}
                              {program.examDate.toLocaleDateString('vi-VN', {
                                day: '2-digit',
                                month: '2-digit',
                                year: 'numeric',
                              })}
                            </span>
                          ) : null}
                        </div>

                        <h2 className="font-display mt-2 text-[26px] leading-snug font-bold text-warm-900">
                          <Link
                            href={routes.program(program.code)}
                            className="transition-colors hover:text-warm-700"
                          >
                            {program.name}
                          </Link>
                        </h2>

                        <p className="mt-3 text-[15px] leading-relaxed text-warm-600">
                          {program.description}
                        </p>

                        {program.highlights.length > 0 ? (
                          <ul className="mt-4 space-y-1.5">
                            {program.highlights.slice(0, 4).map((highlight) => (
                              <li
                                key={highlight}
                                className="flex gap-2 text-[14px] leading-snug text-warm-700"
                              >
                                <span aria-hidden className="mt-px shrink-0 text-gold-500">
                                  ◆
                                </span>
                                {highlight}
                              </li>
                            ))}
                          </ul>
                        ) : null}

                        <div className="mt-6 flex flex-wrap items-center gap-4">
                          <Link
                            href={routes.program(program.code)}
                            className="press rounded-xl btn-fire px-5 py-2.5 text-[14.5px] font-bold"
                          >
                            {t('programs.card.cta')}
                          </Link>
                          {program.fromPrice > 0 ? (
                            <span className="text-[13.5px] text-warm-500">
                              Học phí từ{' '}
                              <strong className="font-display text-[17px] font-bold text-warm-900">
                                {formatVnd(program.fromPrice)}
                              </strong>
                            </span>
                          ) : null}
                        </div>
                      </div>

                      {/* --- Khối lớp & môn --- */}
                      <div className="rounded-xl bg-warm-50/60 p-5 ring-1 ring-warm-100">
                        <p className="text-[11px] font-semibold tracking-[0.14em] text-warm-500 uppercase">
                          {t('programs.card.courses')}
                        </p>

                        {program.bands.length === 0 ? (
                          <p className="mt-3 text-[14px] text-warm-500">
                            Kỳ thi này chưa mở khóa nào cho mùa hiện tại.
                          </p>
                        ) : (
                          <ul className="mt-3 space-y-3">
                            {program.bands.map((band) => (
                              <li key={band.gradeBand}>
                                <p className="text-[13.5px] font-semibold text-warm-800">
                                  {band.gradeBandLabel}
                                </p>
                                <ul className="mt-1 flex flex-wrap gap-1.5">
                                  {band.courses.map((course) => (
                                    <li key={course.id}>
                                      <Link
                                        href={routes.course(course.id)}
                                        className="inline-flex items-baseline gap-1.5 rounded-lg bg-white px-2.5 py-1 text-[12.5px] ring-1 ring-warm-200 transition-shadow hover:ring-warm-300"
                                      >
                                        <span className="font-medium text-warm-700">
                                          {SUBJECT_LABEL[course.subject]}
                                        </span>
                                        <span className="text-[11.5px] text-warm-400 tabular-nums">
                                          {formatVnd(course.price)}
                                        </span>
                                      </Link>
                                    </li>
                                  ))}
                                </ul>
                              </li>
                            ))}
                          </ul>
                        )}
                      </div>
                    </div>
                  </article>
                </Reveal>
              ))}
            </div>
          )}
        </div>
      </section>
    </SiteShell>
  );
}
