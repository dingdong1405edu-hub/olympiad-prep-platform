import type { CSSProperties } from 'react';
import Link from 'next/link';
import { getCatalogTree } from '@/server/catalog/service';
import { getSession } from '@/lib/auth';
import { routes } from '@/lib/routes';
import { formatVnd } from '@/lib/domain';
import { getCopy } from '@/lib/copy';
import { getImages } from '@/lib/copy/assets';
import { SiteShell } from '@/components/site-shell';
import { SiteImage, VisualSlot } from '@/components/site-image';
import { cx } from '@/components/ui';
import { Reveal } from '@/components/motion';
import {
  DifficultyDialVisual,
  ParentReportVisual,
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

/**
 * Bốn cặp màu nhấn cho thẻ kỳ thi.
 *
 * KHÔNG lấy `program.colorHex` từ database nữa: các mã đó là xanh dương, xanh
 * lá, vàng — bốn màu lạc hẳn khỏi tông đỏ cam của trang. Ở đây mỗi kỳ thi nhận
 * một nấc khác nhau trên thang lửa, vẫn phân biệt được nhưng cùng một họ màu.
 * Màu gốc trong DB vẫn giữ nguyên cho khu quản trị và các biểu đồ trong app.
 *
 * `ink` là bản đậm hơn dùng cho chữ: nấc cam sáng đọc không nổi trên nền trắng.
 */
const ACCENTS = [
  { from: '#e4572e', to: '#ff9e5e', ink: '#c13f1d' },
  { from: '#f2703a', to: '#ffb067', ink: '#c2501f' },
  { from: '#f0913f', to: '#ffd09b', ink: '#b4651c' },
  { from: '#d9482a', to: '#ff854a', ink: '#b33a1c' },
] as const;

export default async function HomePage() {
  const [programs, session, t, img] = await Promise.all([
    getCatalogTree(),
    getSession(),
    getCopy(),
    getImages(),
  ]);
  const openPrograms = programs.filter((program) => program.active);
  const primaryCta = session ? routes.myCourses() : routes.register();

  // Ảnh của dải giữa trang. Ô nào admin chưa tải thì biến mất khỏi danh sách,
  // và danh sách rỗng thì cả khối bị ẩn — trang không bao giờ hở một ô xám.
  const gallery = [1, 2, 3, 4]
    .map((n) => ({ image: img(`home.gallery.${n}`), alt: t(`home.gallery.${n}.alt`) }))
    .filter((entry) => entry.image !== null);

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
      <section className="relative isolate overflow-hidden pt-16 pb-40 sm:pt-20 lg:pt-24 lg:pb-48">
        {/*
          Ảnh nền tùy chọn, nằm dưới cùng (-z-20) để mọi lớp màu bên dưới vẫn
          phủ lên trên nó. Độ mờ thấp và lớp làm mềm là bắt buộc: khách phải đọc
          được tiêu đề màu nâu đậm trên bất kỳ ảnh nào admin tải lên, kể cả ảnh
          tối và nhiều chi tiết.
        */}
        {img('home.hero.background') ? (
          <div aria-hidden className="pointer-events-none absolute inset-0 -z-20 overflow-hidden">
            <SiteImage
              image={img('home.hero.background')}
              alt=""
              aspect="16 / 9"
              priority
              sizes="100vw"
              className="h-full w-full opacity-[0.16] [mask-image:linear-gradient(180deg,#000_0%,#000_55%,transparent_92%)]"
            />
          </div>
        ) : null}

        {/* Nền: hai quầng kem đào chồng lên nhau, sáng dần về phía dưới */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(90%_70%_at_80%_4%,#ffe6d5_0%,rgba(255,242,233,0)_62%),radial-gradient(70%_60%_at_8%_32%,#fff0e2_0%,rgba(255,251,248,0)_60%),linear-gradient(180deg,#fff7f1_0%,#fffbf8_78%)]"
        />
        <div className="grid-faint pointer-events-none absolute inset-0 -z-10" aria-hidden />
        <span
          aria-hidden
          className="warm-blob -top-36 -right-20 h-[520px] w-[520px] -z-10 bg-[radial-gradient(circle,rgba(255,133,74,0.3),transparent_68%)]"
        />
        <span
          aria-hidden
          className="warm-blob top-48 right-72 h-[400px] w-[400px] -z-10 bg-[radial-gradient(circle,rgba(255,176,103,0.28),transparent_68%)] [animation-delay:1.5s] [animation-direction:reverse]"
        />
        <span
          aria-hidden
          className="warm-blob -bottom-10 -left-28 h-[340px] w-[340px] -z-10 bg-[radial-gradient(circle,rgba(255,208,155,0.38),transparent_70%)] [animation-duration:22s]"
        />

        <div className={`${SHELL} relative`}>
          <div className="grid items-center gap-14 lg:grid-cols-[1.02fr_0.98fr] lg:gap-16">
            {/* --- Lời chào --- */}
            <div>
              <p className="animate-fade-down inline-flex items-center gap-2.5 rounded-full bg-white px-4 py-2 text-[11.5px] font-extrabold tracking-[0.14em] text-brand-700 uppercase shadow-[inset_0_0_0_1px_var(--color-warm-250),0_6px_16px_-12px_rgb(150_80_50/0.5)]">
                <span
                  className="h-1.5 w-1.5 animate-[pulse-dot_2.2s_ease-in-out_infinite] rounded-full bg-brand-400 shadow-[0_0_10px_2px_rgb(255_133_74/0.7)]"
                  aria-hidden
                />
                {t('home.hero.badge')}
              </p>

              <h1 className="animate-fade-up delay-1 font-display mt-6 max-w-[15ch] text-[40px] leading-[1.04] font-bold tracking-tight text-warm-900 text-balance sm:text-[54px] lg:text-[68px]">
                {t('home.hero.title.before')}{' '}
                <span className="flame-underline flame-text">
                  {t('home.hero.title.highlight')}
                  <svg viewBox="0 0 300 12" preserveAspectRatio="none" aria-hidden>
                    <defs>
                      <linearGradient id="swoosh" x1="0" y1="0" x2="1" y2="0">
                        <stop offset="0%" stopColor="var(--color-gold-400)" />
                        <stop offset="50%" stopColor="var(--color-brand-400)" />
                        <stop offset="100%" stopColor="var(--color-brand-600)" />
                      </linearGradient>
                    </defs>
                    <path d="M4 8 C 70 2, 150 12, 296 4" stroke="url(#swoosh)" />
                  </svg>
                </span>{' '}
                {t('home.hero.title.after')}
              </h1>

              <p className="animate-fade-up delay-2 mt-6 max-w-[52ch] text-[17px] leading-relaxed text-warm-500 text-pretty sm:text-[17.5px]">
                {t('home.hero.subtitle')}
              </p>

              <div className="animate-fade-up delay-3 mt-9 flex flex-wrap items-center gap-3">
                <Link
                  href={primaryCta}
                  className="press btn-fire inline-flex items-center gap-2.5 rounded-2xl px-7 py-4 text-[15px] font-bold"
                >
                  {session ? t('home.hero.cta.member') : t('home.hero.cta.guest')}
                  <span aria-hidden>→</span>
                </Link>
                <a
                  href="#cach-hoat-dong"
                  className="press inline-flex items-center gap-2 rounded-2xl bg-white px-6 py-4 text-[15px] font-bold text-warm-800 shadow-[inset_0_0_0_1.5px_var(--color-warm-250),0_6px_18px_-14px_rgb(120_70_45/0.5)] transition-all hover:shadow-[inset_0_0_0_1.5px_#e8bca3,0_12px_26px_-16px_rgb(120_70_45/0.5)]"
                >
                  {t('home.hero.cta.secondary')}
                </a>
              </div>

              <p className="animate-fade-up delay-4 mt-6 text-[13px] text-warm-400">
                {t('home.hero.note')}
              </p>
            </div>

            {/* --- Ảnh sản phẩm --- */}
            <div className="animate-fade-up delay-3 relative lg:pl-6">
              <VisualSlot
                image={img('home.hero.skillmap')}
                alt={t('home.hero.skillmap.alt')}
                aspect="16 / 10"
                className="artifact-frame relative z-10"
                priority
                sizes="(min-width: 1024px) 48vw, 92vw"
              >
                <SkillMapVisual className="artifact-frame relative z-10" />
              </VisualSlot>
              <WhyThisItemCard className="animate-float absolute -bottom-11 -left-9 z-20 hidden sm:block" />

              {/*
                Ảnh thật nép ở góc trên phải, cân với thẻ "vì sao câu này" đang
                nằm ở góc dưới trái. Chỉ hiện từ lg trở lên: dưới ngưỡng đó cột
                này đã xếp xuống dưới phần chữ, thêm một tấm ảnh đè lên nữa là
                bản đồ kỹ năng không còn đọc được trên điện thoại.
              */}
              {img('home.hero.portrait') ? (
                <div className="animate-float absolute -top-10 -right-4 z-20 hidden w-32 overflow-hidden rounded-2xl bg-white p-1.5 shadow-[0_24px_50px_-30px_rgb(150_80_50/0.75)] [animation-delay:1.1s] lg:block xl:w-40">
                  <SiteImage
                    image={img('home.hero.portrait')}
                    alt={t('home.hero.portrait.alt')}
                    aspect="3 / 4"
                    priority
                    sizes="160px"
                    className="rounded-xl"
                  />
                </div>
              ) : null}
            </div>
          </div>
        </div>
      </section>

      {/* ================= Dải số liệu ================= */}
      <section className="paper pb-24 lg:pb-28">
        <div className={SHELL}>
          {/*
            Thẻ số liệu đè lên đáy hero. Trước đây khối này là một dải navy chạy
            hết bề ngang — thứ duy nhất tối trên trang. Nay là bốn ô trắng nổi
            trên nền kem, vẫn tách bạch nhưng bằng bóng đổ chứ không bằng nền tối.
          */}
          <Reveal className="relative z-10 -mt-32">
            <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-3xl bg-warm-200 shadow-[0_34px_70px_-44px_rgb(150_80_50/0.45),0_0_0_1px_var(--color-warm-200)] lg:grid-cols-4">
              {stats.map((stat) => (
                <div key={stat.l} className="bg-white px-6 py-8 transition-colors hover:bg-warm-100">
                  <dd className="font-display bg-gradient-to-br from-brand-600 via-brand-400 to-gold-400 bg-clip-text text-[38px] leading-none font-bold text-transparent tabular-nums lg:text-[46px]">
                    {stat.v}
                  </dd>
                  <dt className="mt-2.5 text-[13.5px] font-bold text-warm-900">{stat.l}</dt>
                  <p className="mt-1 text-[12px] text-warm-400">{stat.h}</p>
                </div>
              ))}
            </dl>
          </Reveal>

          {/* Băng tên các kỳ thi đang mở — lấy thẳng từ catalog, không viết cứng */}
          {openPrograms.length > 0 ? (
            <Reveal className="mt-14">
              <div className="marquee-mask overflow-hidden" aria-hidden>
                <div className="marquee-track">
                  {[0, 1].map((copyIndex) => (
                    <div key={copyIndex} className="flex shrink-0 gap-11 pr-11">
                    {openPrograms.map((program) => (
                      <span
                        key={program.id}
                        className="font-display flex items-center gap-3 text-[19px] font-semibold whitespace-nowrap text-warm-400"
                      >
                        <b className="font-sans text-[13px] font-extrabold tracking-[0.1em] text-brand-700 uppercase">
                          {program.shortName ?? program.code}
                        </b>
                        <span className="text-gold-400">◆</span>
                        {program.description.split('.')[0]}
                      </span>
                    ))}
                  </div>
                ))}
                </div>
              </div>
            </Reveal>
          ) : null}
        </div>
      </section>

      {/* ================= Vấn đề ================= */}
      <section className="bg-white py-24 lg:py-28">
        <div className={SHELL}>
          <div className="grid gap-14 lg:grid-cols-[1fr_1.05fr] lg:items-center lg:gap-[72px]">
            <Reveal>
              <span className="gold-rule block" aria-hidden />
              <h2 className="font-display mt-5 max-w-lg text-[30px] leading-[1.12] font-bold tracking-tight text-warm-900 text-balance sm:text-4xl lg:text-[44px]">
                {t('home.problem.title')}
              </h2>
              <p className="mt-5 max-w-lg text-[17px] leading-relaxed text-warm-500 text-pretty">
                {t('home.problem.body1')}
              </p>
              <p className="mt-4 max-w-lg text-[17px] leading-relaxed text-warm-500 text-pretty">
                {t('home.problem.body2')}
              </p>
            </Reveal>

            <Reveal delay={120}>
              <div className="grid gap-4.5 sm:grid-cols-2">
                <div className="rounded-3xl bg-warm-50 p-7 shadow-[inset_0_0_0_1px_var(--color-warm-200)]">
                  <p className="text-[11px] font-extrabold tracking-[0.16em] text-warm-400 uppercase">
                    {t('home.problem.old.title')}
                  </p>
                  <ul className="mt-4.5 space-y-3.5">
                    {[1, 2, 3, 4].map((n) => t(`home.problem.old.${n}`)).map((line) => (
                      <li key={line} className="flex gap-3 text-[13.5px] leading-snug text-warm-500">
                        <span aria-hidden className="mt-px shrink-0 font-bold text-warm-300">
                          ✕
                        </span>
                        {line}
                      </li>
                    ))}
                  </ul>
                </div>

                {/*
                  Cột "nền tảng này" từng là một khối navy đặc chữ trắng. Nay là
                  kem đào: vẫn tách hẳn khỏi cột bên trái nhờ có màu, nhưng không
                  đục một lỗ tối giữa mục.
                */}
                <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-[#ffe8d8] via-[#ffd9c2] to-[#ffcdb0] p-7 shadow-[0_24px_50px_-30px_rgb(228_87_46/0.5),inset_0_0_0_1px_rgb(228_87_46/0.16)]">
                  <span
                    aria-hidden
                    className="absolute -top-24 -right-16 h-56 w-56 rounded-full bg-[radial-gradient(circle,rgba(255,255,255,0.75),transparent_70%)]"
                  />
                  <p className="relative text-[11px] font-extrabold tracking-[0.16em] text-brand-700 uppercase">
                    {t('home.problem.new.title')}
                  </p>
                  <ul className="relative mt-4.5 space-y-3.5">
                    {[1, 2, 3, 4].map((n) => t(`home.problem.new.${n}`)).map((line) => (
                      <li key={line} className="flex gap-3 text-[13.5px] leading-snug text-warm-800">
                        <span aria-hidden className="mt-px shrink-0 font-extrabold text-brand-600">
                          ✓
                        </span>
                        {line}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </Reveal>
          </div>
        </div>
      </section>

      {/* ================= Kỳ thi ================= */}
      <section id="ky-thi" className="paper scroll-mt-24 py-24 lg:py-28">
        <div className={SHELL}>
          <Reveal>
            <span className="gold-rule block" aria-hidden />
            <h2 className="font-display mt-5 text-[30px] leading-tight font-bold tracking-tight text-warm-900 sm:text-4xl lg:text-[44px]">
              {t('home.programs.title')}
            </h2>
            <p className="mt-4 max-w-2xl text-[17px] leading-relaxed text-warm-500">
              {t('home.programs.subtitle')}
            </p>
          </Reveal>

          {openPrograms.length > 0 ? (
            <div className="mt-13 grid gap-5.5 md:grid-cols-2">
              {openPrograms.map((program, index) => {
                const accent = ACCENTS[index % ACCENTS.length]!;

                return (
                  <Reveal key={program.id} delay={index * 80}>
                    <Link
                      href={routes.program(program.code)}
                      className="group flex h-full flex-col overflow-hidden rounded-3xl bg-white shadow-[inset_0_0_0_1px_var(--color-warm-200),0_4px_16px_-12px_rgb(150_80_50/0.35)] transition-all duration-300 hover:-translate-y-1.5 hover:shadow-[0_30px_55px_-32px_rgb(180_90_50/0.45),0_0_0_1.5px_var(--pcard-accent)]"
                      style={{ '--pcard-accent': accent.from } as CSSProperties}
                    >
                      <span
                        aria-hidden
                        className="block h-1.5 w-full"
                        style={{
                          backgroundImage: `linear-gradient(90deg, ${accent.from}, ${accent.to})`,
                        }}
                      />

                      <div className="flex flex-1 flex-col p-7">
                        <div className="flex items-start justify-between gap-4">
                          <div className="min-w-0">
                            <p
                              className="text-[11px] font-extrabold tracking-[0.16em] uppercase"
                              style={{ color: accent.ink }}
                            >
                              {program.shortName ?? program.code}
                            </p>
                            <h3 className="font-display mt-1.5 text-[21px] leading-snug font-bold text-warm-900">
                              {program.name}
                            </h3>
                          </div>
                          {program.logoEmoji ? (
                            <span
                              aria-hidden
                              className="grid h-[50px] w-[50px] shrink-0 place-items-center rounded-2xl text-2xl"
                              style={{
                                backgroundImage: `linear-gradient(150deg, ${accent.from}, ${accent.to})`,
                                boxShadow: `0 12px 24px -14px ${accent.from}`,
                              }}
                            >
                              {program.logoEmoji}
                            </span>
                          ) : null}
                        </div>

                        <p className="mt-3 text-[14px] leading-relaxed text-warm-500">
                          {program.description}
                        </p>

                        {program.highlights.length > 0 ? (
                          <ul className="mt-4.5 space-y-2.5">
                            {program.highlights.slice(0, 3).map((highlight) => (
                              <li
                                key={highlight}
                                className="flex gap-2.5 text-[13.5px] leading-snug text-warm-700"
                              >
                                <span
                                  aria-hidden
                                  className="mt-1.5 shrink-0 text-[9px]"
                                  style={{ color: accent.from }}
                                >
                                  ◆
                                </span>
                                {highlight}
                              </li>
                            ))}
                          </ul>
                        ) : null}

                        <div className="mt-auto flex flex-wrap items-end justify-between gap-3 border-t border-warm-200 pt-5 text-[13px] text-warm-400">
                          <span>
                            {program.bands.length} khối lớp · {program.courseCount} khóa
                          </span>
                          {program.fromPrice > 0 ? (
                            <span className="text-right">
                              <span className="block text-[10.5px] tracking-[0.1em] uppercase">
                                từ
                              </span>
                              <span className="font-display block text-[20px] font-bold text-warm-900">
                                {formatVnd(program.fromPrice)}
                              </span>
                            </span>
                          ) : (
                            <span
                              className="inline-flex items-center gap-1.5 font-bold transition-all group-hover:gap-2.5"
                              style={{ color: accent.ink }}
                            >
                              Xem lộ trình <span aria-hidden>→</span>
                            </span>
                          )}
                        </div>
                      </div>
                    </Link>
                  </Reveal>
                );
              })}
            </div>
          ) : (
            <div className="mt-12 rounded-3xl border border-dashed border-warm-250 bg-warm-100/60 px-6 py-14 text-center">
              <p className="font-semibold text-warm-700">{t('home.programs.empty.title')}</p>
              <p className="mx-auto mt-1 max-w-md text-sm whitespace-pre-line text-warm-400">
                {t('home.programs.empty.body')}
              </p>
            </div>
          )}
        </div>
      </section>

      {/* ================= Cách hoạt động ================= */}
      <section
        id="cach-hoat-dong"
        className="tint-panel relative scroll-mt-24 overflow-hidden py-24 lg:py-28"
      >
        <div className="grid-faint-soft pointer-events-none absolute inset-0" aria-hidden />

        <div className={`${SHELL} relative`}>
          <Reveal>
            <span className="gold-rule block" aria-hidden />
            <h2 className="font-display mt-5 text-[30px] leading-tight font-bold tracking-tight text-warm-900 sm:text-4xl lg:text-[44px]">
              {t('home.steps.title')}
            </h2>
            <p className="mt-4 max-w-2xl text-[17px] leading-relaxed text-warm-500">
              {t('home.steps.subtitle')}
            </p>
          </Reveal>

          <ol className="mt-15 grid gap-x-10 gap-y-11 sm:grid-cols-2 lg:grid-cols-3">
            {steps.map((step, index) => (
              <Reveal as="li" key={step.n} delay={index * 60}>
                <div className="flex gap-5">
                  <span aria-hidden className="step-numeral shrink-0 text-[44px] font-bold">
                    {step.n}
                  </span>
                  <div className="min-w-0 border-l border-warm-250 pl-5">
                    <h3 className="text-[16.5px] font-bold text-warm-900">{step.title}</h3>
                    <p className="mt-2 text-[14px] leading-relaxed text-warm-500">{step.body}</p>
                  </div>
                </div>
              </Reveal>
            ))}
          </ol>
        </div>
      </section>

      {/* ================= Tính năng có ảnh thật ================= */}
      <section id="tinh-nang" className="paper scroll-mt-24 py-24 lg:py-28">
        <div className={SHELL}>
          <Reveal>
            <span className="gold-rule block" aria-hidden />
            <h2 className="font-display mt-5 max-w-[22ch] text-[30px] leading-[1.12] font-bold tracking-tight text-warm-900 text-balance sm:text-4xl lg:text-[44px]">
              {t('home.features.title')}
            </h2>
          </Reveal>

          <div className="mt-16 space-y-24 lg:space-y-26">
            {/* --- Việc hôm nay --- */}
            <Reveal>
              <div className="grid items-center gap-10 lg:grid-cols-2 lg:gap-16">
                <div className="lg:order-2">
                  <p className="text-[11px] font-extrabold tracking-[0.16em] text-brand-700 uppercase">
                    {t('home.features.1.eyebrow')}
                  </p>
                  <h3 className="font-display mt-3 text-[26px] leading-snug font-bold text-warm-900 sm:text-[32px]">
                    {t('home.features.1.title')}
                  </h3>
                  <p className="mt-4 text-[16px] leading-relaxed text-warm-500 text-pretty">
                    {t('home.features.1.body1')}
                  </p>
                  <p className="mt-4 text-[16px] leading-relaxed text-warm-500 text-pretty">
                    {t('home.features.1.body2')}
                  </p>
                </div>
                <div className="lg:order-1">
                  <VisualSlot
                    image={img('home.features.1.image')}
                    alt={t('home.features.1.image.alt')}
                    aspect="16 / 10"
                    className="artifact-frame"
                    sizes="(min-width: 1024px) 46vw, 92vw"
                  >
                    <TodayPlanVisual className="artifact-frame" />
                  </VisualSlot>
                </div>
              </div>
            </Reveal>

            {/* --- Độ khó --- */}
            <Reveal>
              <div className="grid items-center gap-10 lg:grid-cols-2 lg:gap-16">
                <div>
                  <p className="text-[11px] font-extrabold tracking-[0.16em] text-brand-700 uppercase">
                    {t('home.features.2.eyebrow')}
                  </p>
                  <h3 className="font-display mt-3 text-[26px] leading-snug font-bold text-warm-900 sm:text-[32px]">
                    {t('home.features.2.title')}
                  </h3>
                  <p className="mt-4 text-[16px] leading-relaxed text-warm-500 text-pretty">
                    {t('home.features.2.body1')}
                  </p>
                  <p className="mt-4 text-[16px] leading-relaxed text-warm-500 text-pretty">
                    {t('home.features.2.body2')}
                  </p>
                </div>
                <VisualSlot
                  image={img('home.features.2.image')}
                  alt={t('home.features.2.image.alt')}
                  aspect="16 / 10"
                  className="artifact-frame"
                  sizes="(min-width: 1024px) 46vw, 92vw"
                >
                  <DifficultyDialVisual className="artifact-frame" />
                </VisualSlot>
              </div>
            </Reveal>

            {/* --- Tiến bộ --- */}
            <Reveal>
              <div className="grid items-center gap-10 lg:grid-cols-2 lg:gap-16">
                <div className="lg:order-2">
                  <p className="text-[11px] font-extrabold tracking-[0.16em] text-brand-700 uppercase">
                    {t('home.features.3.eyebrow')}
                  </p>
                  <h3 className="font-display mt-3 text-[26px] leading-snug font-bold text-warm-900 sm:text-[32px]">
                    {t('home.features.3.title')}
                  </h3>
                  <p className="mt-4 text-[16px] leading-relaxed text-warm-500 text-pretty">
                    {t('home.features.3.body1')}
                  </p>
                  <p className="mt-4 text-[16px] leading-relaxed text-warm-500 text-pretty">
                    {t('home.features.3.body2')}
                  </p>
                </div>
                <div className="lg:order-1">
                  <VisualSlot
                    image={img('home.features.3.image')}
                    alt={t('home.features.3.image.alt')}
                    aspect="16 / 10"
                    className="artifact-frame"
                    sizes="(min-width: 1024px) 46vw, 92vw"
                  >
                    <ProgressChartVisual className="artifact-frame" />
                  </VisualSlot>
                </div>
              </div>
            </Reveal>
          </div>
        </div>
      </section>

      {/* ================= Cho phụ huynh ================= */}
      <section id="phu-huynh" className="scroll-mt-24 bg-white py-24 lg:py-28">
        <div className={SHELL}>
          <div className="grid gap-14 lg:grid-cols-[1fr_1fr] lg:items-start lg:gap-[72px]">
            <Reveal>
              <span className="gold-rule block" aria-hidden />
              <h2 className="font-display mt-5 text-[30px] leading-[1.12] font-bold tracking-tight text-warm-900 text-balance sm:text-4xl lg:text-[44px]">
                {t('home.parents.title')}
              </h2>
              <p className="mt-5 text-[17px] leading-relaxed text-warm-500 text-pretty">
                {t('home.parents.body')}
              </p>

              <ul className="mt-8 space-y-4.5">
                {parentItems.map((row) => (
                  <li key={row.t} className="flex gap-3.5">
                    <span
                      aria-hidden
                      className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-brand-600 to-brand-400 text-[12px] font-extrabold text-white shadow-[0_8px_16px_-10px_rgb(228_87_46/0.8)]"
                    >
                      ✓
                    </span>
                    <div>
                      <p className="text-[15px] font-bold text-warm-900">{row.t}</p>
                      <p className="mt-0.5 text-[14px] leading-relaxed text-warm-500">{row.d}</p>
                    </div>
                  </li>
                ))}
              </ul>
            </Reveal>

            <Reveal delay={120}>
              <VisualSlot
                image={img('home.parents.report')}
                alt={t('home.parents.report.alt')}
                aspect="16 / 10"
                className="artifact-frame"
                sizes="(min-width: 1024px) 46vw, 92vw"
              >
                <ParentReportVisual className="artifact-frame" />
              </VisualSlot>

              {img('home.parents.photo') ? (
                <div className="mt-5.5 overflow-hidden rounded-3xl bg-white p-2 shadow-[0_24px_50px_-34px_rgb(180_100_60/0.5),inset_0_0_0_1px_rgb(228_87_46/0.14)]">
                  <SiteImage
                    image={img('home.parents.photo')}
                    alt={t('home.parents.photo.alt')}
                    aspect="4 / 3"
                    sizes="(min-width: 1024px) 44vw, 92vw"
                    className="rounded-[20px]"
                  />
                </div>
              ) : null}

              <div className="relative mt-5.5 overflow-hidden rounded-3xl bg-gradient-to-br from-warm-100 via-[#ffe2d0] to-[#ffd6be] p-7 shadow-[0_24px_50px_-34px_rgb(180_100_60/0.5),inset_0_0_0_1px_rgb(228_87_46/0.14)]">
                <span
                  aria-hidden
                  className="absolute -bottom-24 -left-16 h-52 w-52 rounded-full bg-[radial-gradient(circle,rgba(255,255,255,0.8),transparent_70%)]"
                />
                <p className="relative text-[11px] font-extrabold tracking-[0.16em] text-brand-700 uppercase">
                  {t('home.parents.session.title')}
                </p>
                <p className="relative mt-3 text-[15px] leading-relaxed text-warm-700 text-pretty">
                  {t('home.parents.session.body')}
                </p>
              </div>
            </Reveal>
          </div>
        </div>
      </section>

      {/* ================= Dải ảnh ================= */}
      {/*
        Khối duy nhất trên trang có thể KHÔNG tồn tại. Chưa ai tải ảnh thì nó
        biến mất hẳn cùng tiêu đề, và trang chạy đúng như trước khi có tính năng
        này — chứ không để lại một hàng ô xám chờ ảnh.

        Bố cục: một ảnh lớn bên trái, các ảnh còn lại xếp đôi bên phải. Cách này
        đứng vững với bất kỳ số ảnh nào từ 1 đến 4, nên admin xóa bớt một tấm
        cũng không làm thủng lưới.

        Nền dùng `tint-panel` chứ không phải `paper`: khối này nằm giữa mục phụ
        huynh (nền trắng) và mục câu hỏi (nền kem `paper`). Dùng `paper` ở đây là
        hai mảng kem dính liền thành một, mất nhịp sáng-tối mà cả trang đang giữ.
      */}
      {gallery.length > 0 ? (
        <section className="tint-panel py-24 lg:py-28">
          <div className={SHELL}>
            <Reveal>
              <span className="gold-rule block" aria-hidden />
              <p className="mt-5 text-[11px] font-extrabold tracking-[0.16em] text-brand-700 uppercase">
                {t('home.gallery.eyebrow')}
              </p>
              <h2 className="font-display mt-3 max-w-[20ch] text-[30px] leading-[1.12] font-bold tracking-tight text-warm-900 text-balance sm:text-4xl lg:text-[44px]">
                {t('home.gallery.title')}
              </h2>
              <p className="mt-5 max-w-[62ch] text-[17px] leading-relaxed text-warm-500 text-pretty">
                {t('home.gallery.body')}
              </p>
            </Reveal>

            <Reveal delay={120}>
              <div
                className={cx(
                  'mt-12 grid gap-5',
                  gallery.length > 1 && 'lg:grid-cols-[1.5fr_1fr]',
                )}
              >
                <figure className="overflow-hidden rounded-[28px] bg-white p-2 shadow-[0_28px_60px_-40px_rgb(180_100_60/0.6),inset_0_0_0_1px_rgb(228_87_46/0.12)]">
                  <SiteImage
                    image={gallery[0].image}
                    alt={gallery[0].alt}
                    aspect="4 / 3"
                    sizes="(min-width: 1024px) 58vw, 92vw"
                    className="rounded-[22px]"
                  />
                </figure>

                {gallery.length > 1 ? (
                  <div className="grid grid-cols-2 gap-5 lg:content-start">
                    {gallery.slice(1).map((entry) => (
                      <figure
                        key={entry.image!.slot}
                        className="overflow-hidden rounded-3xl bg-white p-1.5 shadow-[0_20px_44px_-34px_rgb(180_100_60/0.6),inset_0_0_0_1px_rgb(228_87_46/0.12)]"
                      >
                        <SiteImage
                          image={entry.image}
                          alt={entry.alt}
                          aspect="1 / 1"
                          sizes="(min-width: 1024px) 20vw, 44vw"
                          className="rounded-[18px]"
                        />
                      </figure>
                    ))}
                  </div>
                ) : null}
              </div>
            </Reveal>
          </div>
        </section>
      ) : null}

      {/* ================= FAQ ================= */}
      <section id="cau-hoi" className="paper scroll-mt-24 py-24 lg:py-28">
        <div className={SHELL}>
          <div className="grid gap-10 lg:grid-cols-[0.75fr_1.25fr] lg:gap-16">
            <Reveal>
              <span className="gold-rule block" aria-hidden />
              <h2 className="font-display mt-5 text-[30px] leading-tight font-bold tracking-tight text-warm-900 sm:text-4xl lg:text-[44px]">
                {t('home.faq.title')}
              </h2>
              <p className="mt-4 text-[16px] leading-relaxed text-warm-500">
                {t('home.faq.subtitle')}
              </p>
              <Link
                href={primaryCta}
                className="press btn-fire mt-7 inline-flex items-center gap-2.5 rounded-2xl px-7 py-4 text-[15px] font-bold"
              >
                {session ? t('home.cta.primary.member') : t('home.cta.primary.guest')}
                <span aria-hidden>→</span>
              </Link>
            </Reveal>

            <Reveal delay={100}>
              <div className="border-t border-warm-200">
                {faqs.map((faq, index) => (
                  <details
                    key={faq.q}
                    className="group border-b border-warm-200"
                    open={index === 0}
                  >
                    <summary className="flex cursor-pointer list-none items-start justify-between gap-5 py-5.5 text-[16.5px] font-bold text-warm-900 transition-colors marker:content-[''] hover:text-brand-700 group-open:text-brand-700">
                      {faq.q}
                      <span
                        aria-hidden
                        className="mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-full bg-warm-100 text-[19px] leading-none font-light text-brand-700 transition-all duration-300 group-open:rotate-[135deg] group-open:bg-brand-600 group-open:text-white"
                      >
                        +
                      </span>
                    </summary>
                    <p className="max-w-[70ch] pb-6 text-[15px] leading-relaxed text-warm-500 text-pretty">
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
      <section className="bg-white pb-24 lg:pb-28">
        <div className={SHELL}>
          <Reveal>
            {/*
              Khối chốt. Vẫn là mảng có màu đậm nhất trang để đóng lại hành trình
              đọc, nhưng là kem đào chứ không phải navy — chữ vì thế vẫn là nâu
              đậm, không phải chữ trắng trên nền tối.
            */}
            <div className="relative overflow-hidden rounded-[36px] bg-gradient-to-br from-[#fff0e3] via-[#ffe0cb] to-[#ffc3a0] px-6 py-20 text-center shadow-[0_40px_80px_-50px_rgb(200_110_60/0.6),inset_0_0_0_1px_rgb(228_87_46/0.14)] sm:px-12 lg:py-24">
              <div className="grid-faint-soft pointer-events-none absolute inset-0" aria-hidden />
              <span
                aria-hidden
                className="animate-float absolute -top-64 left-1/2 h-[520px] w-[520px] -translate-x-1/2 rounded-full bg-[radial-gradient(circle,rgba(255,255,255,0.9),transparent_65%)]"
              />

              <div className="relative mx-auto max-w-[660px]">
                {img('home.cta.image') ? (
                  <div className="mx-auto mb-10 max-w-[560px] overflow-hidden rounded-[28px] bg-white/70 p-1.5 shadow-[0_30px_60px_-40px_rgb(150_80_50/0.7)]">
                    <SiteImage
                      image={img('home.cta.image')}
                      alt={t('home.cta.image.alt')}
                      aspect="21 / 9"
                      sizes="(min-width: 640px) 560px, 92vw"
                      className="rounded-[22px]"
                    />
                  </div>
                ) : null}

                <span className="gold-rule mx-auto block" aria-hidden />
                <h2 className="font-display mt-6 text-[30px] leading-[1.12] font-bold tracking-tight text-warm-900 text-balance sm:text-[42px]">
                  {t('home.cta.title')}
                </h2>
                <p className="mx-auto mt-5 max-w-xl text-[17px] leading-relaxed text-warm-700 text-pretty">
                  {t('home.cta.body')}
                </p>

                <div className="mt-9 flex flex-wrap justify-center gap-3">
                  <Link
                    href={primaryCta}
                    className="press btn-fire inline-flex items-center gap-2.5 rounded-2xl px-8 py-4 text-[15px] font-bold"
                  >
                    {session ? t('home.cta.primary.member') : t('home.cta.primary.guest')}
                    <span aria-hidden>→</span>
                  </Link>
                  {session ? null : (
                    <Link
                      href={routes.login()}
                      className="press btn-cream inline-flex items-center rounded-2xl px-7 py-4 text-[15px] font-bold"
                    >
                      {t('home.cta.secondary')}
                    </Link>
                  )}
                </div>

                <p className="mt-6 text-[13px] text-warm-500">{t('home.cta.note')}</p>
              </div>
            </div>
          </Reveal>
        </div>
      </section>
    </SiteShell>
  );
}
