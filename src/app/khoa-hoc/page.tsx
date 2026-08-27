import Link from 'next/link';
import type { GradeBand, Subject } from '@prisma/client';
import { getCatalogTree } from '@/server/catalog/service';
import { getSession } from '@/lib/auth';
import { routes } from '@/lib/routes';
import { formatVnd, GRADE_BAND_LABEL, SUBJECT_LABEL } from '@/lib/domain';
import { getCopy } from '@/lib/copy';
import { SiteShell } from '@/components/site-shell';
import { Reveal } from '@/components/motion';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Tất cả khóa học',
  description:
    'Toàn bộ khóa ôn luyện Olympic theo kỳ thi, khối lớp và môn học. Lọc nhanh để tìm đúng khóa cho con.',
};

const SHELL = 'mx-auto w-full max-w-6xl px-5 lg:px-8';

interface CourseRow {
  id: string;
  name: string;
  description: string | null;
  gradeBand: GradeBand;
  subject: Subject;
  price: number;
  programCode: string;
  programName: string;
  programShort: string;
  colorHex: string;
}

/**
 * Danh mục khóa học có bộ lọc.
 *
 * Bộ lọc dùng LIÊN KẾT chứ không phải form JavaScript: mỗi tổ hợp lọc là một
 * URL riêng nên phụ huynh lưu lại hoặc gửi cho người khác được, và trang vẫn
 * chạy đúng khi trình duyệt chưa tải xong script.
 */
export default async function CourseCatalogPage({
  searchParams,
}: {
  searchParams: Promise<{ ky_thi?: string; khoi?: string; mon?: string }>;
}) {
  const [params, programs, session, t] = await Promise.all([
    searchParams,
    getCatalogTree(),
    getSession(),
    getCopy(),
  ]);

  // Làm phẳng cây danh mục thành danh sách khóa — cây tiện cho trang kỳ thi,
  // còn ở đây người dùng muốn nhìn ngang qua mọi kỳ thi cùng lúc.
  const all: CourseRow[] = programs
    .filter((program) => program.active)
    .flatMap((program) =>
      program.bands.flatMap((band) =>
        band.courses.map((course) => ({
          id: course.id,
          name: course.name,
          description: course.description,
          gradeBand: band.gradeBand,
          subject: course.subject,
          price: course.price,
          programCode: program.code,
          programName: program.name,
          programShort: program.shortName ?? program.code,
          colorHex: program.colorHex,
        })),
      ),
    );

  const activeProgram = params.ky_thi?.toUpperCase();
  const activeBand = params.khoi?.toUpperCase();
  const activeSubject = params.mon?.toUpperCase();

  const rows = all.filter(
    (row) =>
      (!activeProgram || row.programCode === activeProgram) &&
      (!activeBand || row.gradeBand === activeBand) &&
      (!activeSubject || row.subject === activeSubject),
  );

  const programOptions = [...new Map(all.map((row) => [row.programCode, row])).values()];
  const bandOptions = [...new Set(all.map((row) => row.gradeBand))].sort();
  const subjectOptions = [...new Set(all.map((row) => row.subject))];

  /** Dựng URL cho một ô lọc: bấm lại vào ô đang chọn thì bỏ chọn. */
  function filterHref(key: 'ky_thi' | 'khoi' | 'mon', value: string): string {
    const next = new URLSearchParams();
    const current = { ky_thi: activeProgram, khoi: activeBand, mon: activeSubject };
    for (const [k, v] of Object.entries(current)) {
      if (v && k !== key) next.set(k, v);
    }
    const isActive = current[key] === value;
    if (!isActive) next.set(key, value);
    const query = next.toString();
    return query ? `${routes.courses()}?${query}` : routes.courses();
  }

  const chip =
    'inline-flex items-center rounded-lg px-3 py-1.5 text-[13px] font-medium transition-colors';
  const chipOff = `${chip} bg-white text-warm-600 ring-1 ring-warm-200 hover:ring-warm-300`;
  const chipOn = `${chip} btn-fire`;

  return (
    <SiteShell signedIn={Boolean(session)}>
      <section className="paper relative overflow-hidden pt-14 pb-14 sm:pt-16 lg:pt-20 lg:pb-16">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 bg-[radial-gradient(90%_70%_at_80%_4%,#ffe6d5_0%,rgba(255,242,233,0)_62%),radial-gradient(70%_60%_at_8%_32%,#fff0e2_0%,rgba(255,251,248,0)_60%),linear-gradient(180deg,#fff7f1_0%,#fffbf8_82%)]"
        />
        <div className="grid-faint pointer-events-none absolute inset-0" aria-hidden />
        <div className={`${SHELL} relative`}>
          <p className="text-[11px] font-bold tracking-[0.18em] text-brand-700 uppercase">
            {t('courses.eyebrow')}
          </p>
          <h1 className="font-display mt-3 max-w-3xl text-[34px] leading-[1.1] font-bold tracking-tight text-warm-900 text-balance sm:text-5xl lg:text-[52px]">
            {t('courses.title')}
          </h1>
          <p className="mt-5 max-w-2xl text-[16.5px] leading-relaxed text-warm-500 text-pretty">
            {t('courses.subtitle')}
          </p>
        </div>
      </section>

      {/* ================= Bộ lọc ================= */}
      <section className="border-b border-warm-100 bg-warm-50/60 py-6">
        <div className={`${SHELL} space-y-4`}>
          {[
            {
              label: t('courses.filter.program'),
              key: 'ky_thi' as const,
              items: programOptions.map((row) => ({
                value: row.programCode,
                label: row.programShort,
                active: activeProgram === row.programCode,
              })),
            },
            {
              label: t('courses.filter.band'),
              key: 'khoi' as const,
              items: bandOptions.map((band) => ({
                value: band,
                label: GRADE_BAND_LABEL[band],
                active: activeBand === band,
              })),
            },
            {
              label: t('courses.filter.subject'),
              key: 'mon' as const,
              items: subjectOptions.map((subject) => ({
                value: subject,
                label: SUBJECT_LABEL[subject],
                active: activeSubject === subject,
              })),
            },
          ]
            .filter((group) => group.items.length > 0)
            .map((group) => (
              <div key={group.key} className="flex flex-wrap items-center gap-2">
                <span className="w-20 shrink-0 text-[11px] font-semibold tracking-[0.12em] text-warm-500 uppercase">
                  {group.label}
                </span>
                {group.items.map((item) => (
                  <Link
                    key={item.value}
                    href={filterHref(group.key, item.value)}
                    className={item.active ? chipOn : chipOff}
                    aria-pressed={item.active}
                  >
                    {item.label}
                  </Link>
                ))}
              </div>
            ))}
        </div>
      </section>

      {/* ================= Kết quả ================= */}
      <section className="bg-white py-14 lg:py-20">
        <div className={SHELL}>
          <p className="text-[13.5px] text-warm-500">
            {rows.length === all.length
              ? `${all.length} khóa đang mở`
              : `${rows.length} / ${all.length} khóa khớp bộ lọc`}
            {rows.length !== all.length ? (
              <>
                {' · '}
                <Link href={routes.courses()} className="font-medium text-warm-700 underline underline-offset-4">
                  {t('courses.filter.clear')}
                </Link>
              </>
            ) : null}
          </p>

          {rows.length === 0 ? (
            <div className="mt-8 rounded-2xl border border-dashed border-warm-200 bg-warm-50/50 px-6 py-16 text-center">
              <p className="font-display text-xl font-bold text-warm-800">
                {all.length === 0 ? t('courses.empty.title') : t('courses.empty.filtered')}
              </p>
              <p className="mx-auto mt-2 max-w-md text-[15px] leading-relaxed whitespace-pre-line text-warm-500">
                {all.length === 0 ? t('courses.empty.body') : t('courses.empty.filteredBody')}
              </p>
            </div>
          ) : (
            <div className="mt-8 grid gap-5 md:grid-cols-2 lg:grid-cols-3">
              {rows.map((row, index) => (
                <Reveal key={row.id} delay={Math.min(index, 8) * 50}>
                  <article className="hover-lift flex h-full flex-col overflow-hidden rounded-2xl bg-white ring-1 ring-warm-100 shadow-[0_2px_10px_-5px_rgb(120_70_45/0.1)]">
                    <span
                      aria-hidden
                      className="block h-1 w-full"
                      style={{ backgroundColor: row.colorHex }}
                    />
                    <div className="flex flex-1 flex-col p-5">
                      <Link
                        href={routes.program(row.programCode)}
                        className="text-[11px] font-bold tracking-[0.14em] uppercase"
                        style={{ color: row.colorHex }}
                      >
                        {row.programShort}
                      </Link>

                      <h2 className="font-display mt-1.5 text-[18px] leading-snug font-bold text-warm-900">
                        <Link href={routes.course(row.id)} className="transition-colors hover:text-warm-700">
                          {row.name}
                        </Link>
                      </h2>

                      <p className="mt-2 text-[13px] text-warm-500">
                        {GRADE_BAND_LABEL[row.gradeBand]} · {SUBJECT_LABEL[row.subject]}
                      </p>

                      {row.description ? (
                        <p className="mt-3 line-clamp-3 text-[14px] leading-relaxed text-warm-600">
                          {row.description}
                        </p>
                      ) : null}

                      <div className="mt-auto flex items-end justify-between gap-3 border-t border-warm-100 pt-4">
                        <span>
                          <span className="block text-[10.5px] tracking-wide text-warm-400 uppercase">
                            {t('courses.card.price')}
                          </span>
                          <span className="font-display block text-[18px] font-bold text-warm-900">
                            {formatVnd(row.price)}
                          </span>
                        </span>
                        <Link
                          href={routes.course(row.id)}
                          className="press rounded-lg btn-fire px-3.5 py-2 text-[13.5px] font-bold"
                        >
                          {t('courses.card.cta')}
                        </Link>
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
