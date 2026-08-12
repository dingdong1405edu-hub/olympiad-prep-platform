import Link from 'next/link';
import { getCatalogTree } from '@/server/catalog/service';
import { getSession } from '@/lib/auth';
import { routes } from '@/lib/routes';
import { formatVnd } from '@/lib/domain';
import { getCopy } from '@/lib/copy';
import { SiteShell } from '@/components/site-shell';
import { Reveal } from '@/components/motion';
import {
  DifficultyDialVisual,
  ProgressChartVisual,
  SkillMapVisual,
  TodayPlanVisual,
  WhyThisItemCard,
} from '@/components/product-visuals';

// Trang đọc catalog từ DB nên không dựng tĩnh lúc build.
export const dynamic = 'force-dynamic';

/**
 * Bề rộng chuẩn của trang bán hàng.
 *
 * Rộng hơn hẳn khu ứng dụng (max-w-5xl): trong app, dòng chữ dài gây mỏi mắt
 * khi làm việc lâu, còn ở đây khách chỉ lướt vài phút và cần cảm giác thoáng.
 * Chữ vẫn được giới hạn riêng bằng max-w-* ở từng khối để không quá dài.
 */
const SHELL = 'mx-auto w-full max-w-7xl px-5 lg:px-8';

export default async function HomePage() {
  const [programs, session, t] = await Promise.all([getCatalogTree(), getSession(), getCopy()]);
  const openPrograms = programs.filter((program) => program.active);
  const primaryCta = session ? routes.myCourses() : routes.register();

  // Các khối lặp lại được dựng từ kho chữ theo chỉ số, nên admin thêm/bớt nội
  // dung bằng cách sửa chữ chứ không phải sửa mã.
  const stats = [1, 2, 3, 4].map((n) => ({
    v: t(`home.stats.${n}.value`),
    l: t(`home.stats.${n}.label`),
    h: t(`home.stats.${n}.hint`),
  }));
  const steps = [1, 2, 3, 4, 5, 6].map((n) => ({
    n: String(n).padStart(2, '0'),
    title: t(`home.steps.${n}.title`),
    body: t(`home.steps.${n}.body`),
  }));
  const faqs = [1, 2, 3, 4, 5, 6].map((n) => ({
    q: t(`home.faq.${n}.question`),
    a: t(`home.faq.${n}.answer`),
  }));
  const parentItems = [1, 2, 3, 4].map((n) => ({
    t: t(`home.parents.item.${n}.title`),
    d: t(`home.parents.item.${n}.detail`),
  }));

  return (
    <SiteShell signedIn={Boolean(session)}>
      {/* ================= Hero ================= */}
      <section className="paper relative overflow-hidden pt-28 pb-16 sm:pt-36 lg:pt-40 lg:pb-24">
        <div className="grid-faint pointer-events-none absolute inset-0" aria-hidden />

        <div className={`${SHELL} relative`}>
          <div className="grid items-center gap-14 lg:grid-cols-[1.05fr_1fr] lg:gap-16">
            {/* --- Lời chào --- */}
            <div>
              <p className="animate-fade-down inline-flex items-center gap-2 rounded-full bg-white px-3.5 py-1.5 text-[11px] font-bold tracking-[0.14em] text-navy-700 uppercase ring-1 ring-navy-100">
                <span className="h-1.5 w-1.5 rounded-full bg-gold-400" aria-hidden />
                {t('home.hero.badge')}
              </p>

              <h1 className="animate-fade-up delay-1 font-display mt-6 max-w-2xl text-[38px] leading-[1.08] font-bold tracking-tight text-navy-900 text-balance sm:text-[54px] lg:text-[66px]">
                {t('home.hero.title.before')}{' '}
                <span className="gold-underline">{t('home.hero.title.highlight')}</span>{' '}
                {t('home.hero.title.after')}
              </h1>

              <p className="animate-fade-up delay-2 mt-6 max-w-xl text-[17px] leading-relaxed text-navy-600 text-pretty sm:text-lg">
                {t('home.hero.subtitle')}
              </p>

              <div className="animate-fade-up delay-3 mt-9 flex flex-wrap items-center gap-3">
                <Link
                  href={primaryCta}
                  className="press inline-flex items-center gap-2.5 rounded-xl bg-navy-900 px-7 py-4 text-[15px] font-semibold text-white shadow-[0_12px_30px_-10px_rgb(13_27_49/0.55)] transition-all hover:bg-navy-800 hover:shadow-[0_18px_40px_-12px_rgb(13_27_49/0.6)]"
                >
                  {session ? t('home.hero.cta.member') : t('home.hero.cta.guest')}
                  <span aria-hidden>→</span>
                </Link>
                <a
                  href="#cach-hoat-dong"
                  className="press inline-flex items-center gap-2 rounded-xl bg-white px-6 py-4 text-[15px] font-semibold text-navy-800 ring-1 ring-navy-200 transition-all hover:ring-navy-300"
                >
                  {t('home.hero.cta.secondary')}
                </a>
              </div>

              <p className="animate-fade-up delay-4 mt-5 text-[13px] text-navy-500">
                {t('home.hero.note')}
              </p>
            </div>

            {/* --- Ảnh sản phẩm --- */}
            <div className="animate-fade-up delay-3 relative lg:pl-6">
              <SkillMapVisual className="artifact-frame relative z-10" />

              <WhyThisItemCard className="animate-float absolute -bottom-10 -left-4 z-20 hidden sm:block lg:-left-14" />

              <div
                aria-hidden
                className="absolute -top-8 -right-4 z-0 hidden h-32 w-32 rounded-full bg-gold-200/50 blur-2xl lg:block"
              />
            </div>
          </div>
        </div>
      </section>

      {/* ================= Dải số liệu ================= */}
      <section className="relative overflow-hidden bg-navy-900">
        <div className="grid-faint-dark pointer-events-none absolute inset-0" aria-hidden />
        <div className={`${SHELL} relative`}>
          <dl className="grid grid-cols-2 divide-navy-700/60 py-10 sm:divide-x lg:grid-cols-4">
            {stats.map((stat, index) => (
              <div key={stat.l} className={index % 2 === 0 ? 'pr-4 sm:px-6' : 'pl-4 sm:px-6'}>
                <dd className="font-display text-4xl font-bold text-gold-300 tabular-nums lg:text-5xl">
                  {stat.v}
                </dd>
                <dt className="mt-2 text-[13.5px] font-semibold text-white">{stat.l}</dt>
                <p className="mt-0.5 text-[12px] text-navy-300">{stat.h}</p>
              </div>
            ))}
          </dl>
        </div>
      </section>

      {/* ================= Vấn đề ================= */}
      <Reveal as="section" className="paper py-20 lg:py-28">
        <div className={SHELL}>
          <div className="grid gap-12 lg:grid-cols-[1fr_1.05fr] lg:items-center lg:gap-20">
            <div>
              <span className="gold-rule block" aria-hidden />
              <h2 className="font-display mt-5 max-w-lg text-[30px] leading-[1.14] font-bold tracking-tight text-navy-900 text-balance sm:text-4xl lg:text-[44px]">
                {t('home.problem.title')}
              </h2>
              <p className="mt-5 max-w-lg text-[16.5px] leading-relaxed text-navy-600 text-pretty">
                {t('home.problem.body1')}
              </p>
              <p className="mt-4 max-w-lg text-[16.5px] leading-relaxed text-navy-600 text-pretty">
                {t('home.problem.body2')}
              </p>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="rounded-2xl bg-white p-6 ring-1 ring-navy-100">
                <p className="text-[11px] font-bold tracking-[0.14em] text-ink-400 uppercase">
                  {t('home.problem.old.title')}
                </p>
                <ul className="mt-4 space-y-3">
                  {[1, 2, 3, 4].map((n) => t(`home.problem.old.${n}`)).map((line) => (
                    <li key={line} className="flex gap-2.5 text-[13.5px] leading-snug text-ink-500">
                      <span aria-hidden className="mt-px shrink-0 text-ink-300">
                        ✕
                      </span>
                      {line}
                    </li>
                  ))}
                </ul>
              </div>

              <div className="rounded-2xl bg-navy-900 p-6 shadow-[0_20px_44px_-20px_rgb(13_27_49/0.6)]">
                <p className="text-[11px] font-bold tracking-[0.14em] text-gold-300 uppercase">
                  {t('home.problem.new.title')}
                </p>
                <ul className="mt-4 space-y-3">
                  {[1, 2, 3, 4].map((n) => t(`home.problem.new.${n}`)).map((line) => (
                    <li key={line} className="flex gap-2.5 text-[13.5px] leading-snug text-navy-100">
                      <span aria-hidden className="mt-px shrink-0 font-bold text-gold-300">
                        ✓
                      </span>
                      {line}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        </div>
      </Reveal>

      {/* ================= Kỳ thi ================= */}
      <section id="ky-thi" className="scroll-mt-24 bg-white py-20 lg:py-28">
        <div className={SHELL}>
          <Reveal>
            <span className="gold-rule block" aria-hidden />
            <h2 className="font-display mt-5 text-[30px] leading-tight font-bold tracking-tight text-navy-900 sm:text-4xl lg:text-[44px]">
              {t('home.programs.title')}
            </h2>
            <p className="mt-4 max-w-2xl text-[16.5px] leading-relaxed text-navy-600">
              {t('home.programs.subtitle')}
            </p>
          </Reveal>

          {openPrograms.length > 0 ? (
            <div className="mt-12 grid gap-6 md:grid-cols-2">
              {openPrograms.map((program, index) => (
                <Reveal key={program.id} delay={index * 80}>
                  <Link
                    href={routes.program(program.code)}
                    className="hover-lift group flex h-full flex-col overflow-hidden rounded-2xl bg-white ring-1 ring-navy-100 shadow-[0_2px_10px_-4px_rgb(13_27_49/0.1)]"
                  >
                    <span
                      aria-hidden
                      className="block h-1.5 w-full"
                      style={{ backgroundColor: program.colorHex }}
                    />

                    <div className="flex flex-1 flex-col p-6 lg:p-7">
                      <div className="flex items-start justify-between gap-4">
                        <div className="min-w-0">
                          <p
                            className="text-[11px] font-bold tracking-[0.16em] uppercase"
                            style={{ color: program.colorHex }}
                          >
                            {program.shortName ?? program.code}
                          </p>
                          <h3 className="font-display mt-1.5 text-[22px] leading-snug font-bold text-navy-900 transition-colors group-hover:text-navy-700">
                            {program.name}
                          </h3>
                        </div>
                        {program.examDate ? (
                          <span className="shrink-0 rounded-lg bg-navy-50 px-3 py-1.5 text-center">
                            <span className="block text-[10px] font-semibold tracking-wide text-navy-400 uppercase">
                              Thi
                            </span>
                            <span className="block text-[12.5px] font-bold text-navy-800 tabular-nums">
                              {program.examDate.toLocaleDateString('vi-VN', {
                                day: '2-digit',
                                month: '2-digit',
                                year: 'numeric',
                              })}
                            </span>
                          </span>
                        ) : null}
                      </div>

                      <p className="mt-3 text-[14.5px] leading-relaxed text-navy-600">
                        {program.description}
                      </p>

                      {program.highlights.length > 0 ? (
                        <ul className="mt-4 space-y-1.5">
                          {program.highlights.slice(0, 3).map((highlight) => (
                            <li
                              key={highlight}
                              className="flex gap-2 text-[13.5px] leading-snug text-navy-700"
                            >
                              <span aria-hidden className="mt-px shrink-0 text-gold-500">
                                ◆
                              </span>
                              {highlight}
                            </li>
                          ))}
                        </ul>
                      ) : null}

                      <div className="mt-auto flex flex-wrap items-end justify-between gap-3 border-t border-navy-100 pt-4 text-[13px] text-navy-500">
                        <span>
                          {program.bands.length} khối lớp · {program.courseCount} khóa
                        </span>
                        {program.fromPrice > 0 ? (
                          <span className="text-right">
                            <span className="block text-[10.5px] tracking-wide uppercase">từ</span>
                            <span className="font-display block text-[19px] font-bold text-navy-900">
                              {formatVnd(program.fromPrice)}
                            </span>
                          </span>
                        ) : null}
                      </div>
                    </div>
                  </Link>
                </Reveal>
              ))}
            </div>
          ) : (
            <div className="mt-12 rounded-2xl border border-dashed border-navy-200 bg-navy-50/50 px-6 py-14 text-center">
              <p className="font-medium text-navy-700">{t('home.programs.empty.title')}</p>
              <p className="mx-auto mt-1 max-w-md text-sm whitespace-pre-line text-navy-500">
                {t('home.programs.empty.body')}
              </p>
            </div>
          )}
        </div>
      </section>

      {/* ================= Cách hoạt động ================= */}
      <section
        id="cach-hoat-dong"
        className="relative scroll-mt-24 overflow-hidden bg-navy-900 py-20 lg:py-28"
      >
        <div className="grid-faint-dark pointer-events-none absolute inset-0" aria-hidden />

        <div className={`${SHELL} relative`}>
          <Reveal>
            <span className="gold-rule block" aria-hidden />
            <h2 className="font-display mt-5 text-[30px] leading-tight font-bold tracking-tight text-white sm:text-4xl lg:text-[44px]">
              {t('home.steps.title')}
            </h2>
            <p className="mt-4 max-w-2xl text-[16.5px] leading-relaxed text-navy-200">
              {t('home.steps.subtitle')}
            </p>
          </Reveal>

          <ol className="mt-14 grid gap-x-10 gap-y-11 sm:grid-cols-2 lg:grid-cols-3">
            {steps.map((step, index) => (
              <Reveal as="li" key={step.n} delay={index * 60}>
                <div className="flex gap-5">
                  <span
                    aria-hidden
                    className="step-numeral shrink-0 text-[34px] font-bold text-navy-600"
                  >
                    {step.n}
                  </span>
                  <div className="min-w-0 border-l border-navy-700 pl-5">
                    <h3 className="text-[16.5px] font-semibold text-white">{step.title}</h3>
                    <p className="mt-2 text-[14px] leading-relaxed text-navy-300">{step.body}</p>
                  </div>
                </div>
              </Reveal>
            ))}
          </ol>
        </div>
      </section>

      {/* ================= Tính năng có ảnh thật ================= */}
      <section className="paper py-20 lg:py-28">
        <div className={SHELL}>
          <Reveal>
            <span className="gold-rule block" aria-hidden />
            <h2 className="font-display mt-5 max-w-2xl text-[30px] leading-[1.14] font-bold tracking-tight text-navy-900 text-balance sm:text-4xl lg:text-[44px]">
              {t('home.features.title')}
            </h2>
          </Reveal>

          <div className="mt-16 space-y-20 lg:space-y-28">
            {/* --- Việc hôm nay --- */}
            <Reveal>
              <div className="grid items-center gap-10 lg:grid-cols-2 lg:gap-16">
                <div className="lg:order-2">
                  <p className="text-[11px] font-bold tracking-[0.16em] text-gold-600 uppercase">
                    {t('home.features.1.eyebrow')}
                  </p>
                  <h3 className="font-display mt-3 text-[26px] leading-snug font-bold text-navy-900 sm:text-[32px]">
                    {t('home.features.1.title')}
                  </h3>
                  <p className="mt-4 text-[16px] leading-relaxed text-navy-600 text-pretty">
                    {t('home.features.1.body1')}
                  </p>
                  <p className="mt-4 text-[16px] leading-relaxed text-navy-600 text-pretty">
                    {t('home.features.1.body2')}
                  </p>
                </div>
                <div className="lg:order-1">
                  <TodayPlanVisual className="artifact-frame" />
                </div>
              </div>
            </Reveal>

            {/* --- Độ khó --- */}
            <Reveal>
              <div className="grid items-center gap-10 lg:grid-cols-2 lg:gap-16">
                <div>
                  <p className="text-[11px] font-bold tracking-[0.16em] text-gold-600 uppercase">
                    {t('home.features.2.eyebrow')}
                  </p>
                  <h3 className="font-display mt-3 text-[26px] leading-snug font-bold text-navy-900 sm:text-[32px]">
                    {t('home.features.2.title')}
                  </h3>
                  <p className="mt-4 text-[16px] leading-relaxed text-navy-600 text-pretty">
                    {t('home.features.2.body1')}
                  </p>
                  <p className="mt-4 text-[16px] leading-relaxed text-navy-600 text-pretty">
                    {t('home.features.2.body2')}
                  </p>
                </div>
                <DifficultyDialVisual className="artifact-frame" />
              </div>
            </Reveal>

            {/* --- Tiến bộ --- */}
            <Reveal>
              <div className="grid items-center gap-10 lg:grid-cols-2 lg:gap-16">
                <div className="lg:order-2">
                  <p className="text-[11px] font-bold tracking-[0.16em] text-gold-600 uppercase">
                    {t('home.features.3.eyebrow')}
                  </p>
                  <h3 className="font-display mt-3 text-[26px] leading-snug font-bold text-navy-900 sm:text-[32px]">
                    {t('home.features.3.title')}
                  </h3>
                  <p className="mt-4 text-[16px] leading-relaxed text-navy-600 text-pretty">
                    {t('home.features.3.body1')}
                  </p>
                  <p className="mt-4 text-[16px] leading-relaxed text-navy-600 text-pretty">
                    {t('home.features.3.body2')}
                  </p>
                </div>
                <div className="lg:order-1">
                  <ProgressChartVisual className="artifact-frame" />
                </div>
              </div>
            </Reveal>
          </div>
        </div>
      </section>

      {/* ================= Cho phụ huynh ================= */}
      <section id="phu-huynh" className="scroll-mt-24 bg-white py-20 lg:py-28">
        <div className={SHELL}>
          <div className="grid gap-12 lg:grid-cols-[1fr_1fr] lg:items-start lg:gap-20">
            <Reveal>
              <span className="gold-rule block" aria-hidden />
              <h2 className="font-display mt-5 text-[30px] leading-[1.14] font-bold tracking-tight text-navy-900 text-balance sm:text-4xl lg:text-[44px]">
                {t('home.parents.title')}
              </h2>
              <p className="mt-5 text-[16.5px] leading-relaxed text-navy-600 text-pretty">
                {t('home.parents.body')}
              </p>

              <ul className="mt-8 space-y-4">
                {parentItems.map((row) => (
                  <li key={row.t} className="flex gap-3.5">
                    <span
                      aria-hidden
                      className="mt-1 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-gold-100 text-[11px] font-bold text-gold-700"
                    >
                      ✓
                    </span>
                    <div>
                      <p className="text-[15px] font-semibold text-navy-900">{row.t}</p>
                      <p className="mt-0.5 text-[14px] leading-relaxed text-navy-600">{row.d}</p>
                    </div>
                  </li>
                ))}
              </ul>
            </Reveal>

            <Reveal delay={120}>
              <div className="space-y-5">
                <ProgressChartVisual className="artifact-frame" />
                <div className="rounded-2xl bg-navy-900 p-6 shadow-[0_20px_44px_-20px_rgb(13_27_49/0.6)]">
                  <p className="text-[11px] font-bold tracking-[0.14em] text-gold-300 uppercase">
                    {t('home.parents.session.title')}
                  </p>
                  <p className="mt-3 text-[15px] leading-relaxed text-navy-100 text-pretty">
                    {t('home.parents.session.body')}
                  </p>
                </div>
              </div>
            </Reveal>
          </div>
        </div>
      </section>

      {/* ================= FAQ ================= */}
      <section id="cau-hoi" className="paper scroll-mt-24 py-20 lg:py-28">
        <div className={SHELL}>
          <div className="grid gap-10 lg:grid-cols-[0.8fr_1.2fr] lg:gap-20">
            <Reveal>
              <span className="gold-rule block" aria-hidden />
              <h2 className="font-display mt-5 text-[30px] leading-tight font-bold tracking-tight text-navy-900 sm:text-4xl lg:text-[44px]">
                {t('home.faq.title')}
              </h2>
              <p className="mt-4 text-[15.5px] leading-relaxed text-navy-600">
                {t('home.faq.subtitle')}
              </p>
            </Reveal>

            <Reveal delay={100}>
              <div className="divide-y divide-navy-100 border-y border-navy-100">
                {faqs.map((faq) => (
                  <details key={faq.q} className="group py-5">
                    <summary className="flex cursor-pointer list-none items-start justify-between gap-5 text-[16px] font-semibold text-navy-900 marker:content-['']">
                      {faq.q}
                      <span
                        aria-hidden
                        className="mt-0.5 shrink-0 text-xl leading-none font-light text-navy-400 transition-transform duration-300 group-open:rotate-45"
                      >
                        +
                      </span>
                    </summary>
                    <p className="mt-3 max-w-2xl text-[15px] leading-relaxed text-navy-600 text-pretty">
                      {faq.a}
                    </p>
                  </details>
                ))}
              </div>
            </Reveal>
          </div>
        </div>
      </section>

      {/* ================= CTA cuối ================= */}
      <section className="bg-white pb-20 lg:pb-28">
        <div className={SHELL}>
          <Reveal>
            <div className="relative overflow-hidden rounded-3xl bg-navy-900 px-6 py-16 text-center sm:px-12 lg:py-20">
              <div className="grid-faint-dark pointer-events-none absolute inset-0" aria-hidden />
              <div
                aria-hidden
                className="animate-float absolute -top-24 left-1/2 h-64 w-64 -translate-x-1/2 rounded-full bg-gold-400/12 blur-3xl"
              />

              <div className="relative mx-auto max-w-2xl">
                <span className="gold-rule mx-auto block" aria-hidden />
                <h2 className="font-display mt-6 text-[30px] leading-[1.14] font-bold tracking-tight text-white text-balance sm:text-[42px]">
                  {t('home.cta.title')}
                </h2>
                <p className="mx-auto mt-5 max-w-xl text-[16.5px] leading-relaxed text-navy-200 text-pretty">
                  {t('home.cta.body')}
                </p>

                <div className="mt-9 flex flex-wrap justify-center gap-3">
                  <Link
                    href={primaryCta}
                    className="press inline-flex items-center gap-2.5 rounded-xl bg-gold-300 px-8 py-4 text-[15px] font-bold text-navy-900 shadow-[0_14px_34px_-12px_rgb(221_169_44/0.7)] transition-all hover:bg-gold-200"
                  >
                    {session ? t('home.cta.primary.member') : t('home.cta.primary.guest')}
                    <span aria-hidden>→</span>
                  </Link>
                  {session ? null : (
                    <Link
                      href={routes.login()}
                      className="press inline-flex items-center rounded-xl px-6 py-4 text-[15px] font-semibold text-navy-100 ring-1 ring-navy-600 transition-colors hover:bg-navy-800"
                    >
                      {t('home.cta.secondary')}
                    </Link>
                  )}
                </div>

                <p className="mt-6 text-[13px] text-navy-400">
                  {t('home.cta.note')}
                </p>
              </div>
            </div>
          </Reveal>
        </div>
      </section>
    </SiteShell>
  );
}
