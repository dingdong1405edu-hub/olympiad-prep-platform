import Link from 'next/link';
import { getCatalogTree } from '@/server/catalog/service';
import { getSession } from '@/lib/auth';
import { routes } from '@/lib/routes';
import { formatVnd, SUBJECT_LABEL } from '@/lib/domain';
import { MarketingShell } from '@/components/marketing';
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
  const [programs, session] = await Promise.all([getCatalogTree(), getSession()]);

  const openPrograms = programs.filter((program) => program.active);
  const totalCourses = openPrograms.reduce((sum, program) => sum + program.courseCount, 0);
  const allSubjects = [...new Set(openPrograms.flatMap((program) => program.subjects))];

  return (
    <MarketingShell signedIn={Boolean(session)}>
      {/* ================= Đầu trang ================= */}
      <section className="relative overflow-hidden bg-navy-900 pt-28 pb-16 sm:pt-36 lg:pt-40 lg:pb-20">
        <div className="grid-faint-dark pointer-events-none absolute inset-0" aria-hidden />
        <div className={`${SHELL} relative`}>
          <p className="text-[11px] font-bold tracking-[0.18em] text-gold-400 uppercase">
            Danh mục kỳ thi
          </p>
          <h1 className="font-display mt-3 max-w-3xl text-[34px] leading-[1.1] font-bold tracking-tight text-white text-balance sm:text-5xl lg:text-[56px]">
            Chọn đúng kỳ thi trước, rồi mới nói chuyện ôn luyện
          </h1>
          <p className="mt-5 max-w-2xl text-[16.5px] leading-relaxed text-navy-200 text-pretty">
            Mỗi kỳ thi có cấu trúc đề, thang điểm và kiểu tư duy riêng. Hệ thống ra bài bám đúng cấu
            trúc của kỳ thi bạn chọn chứ không dùng chung một kho câu hỏi cho tất cả.
          </p>

          {openPrograms.length > 0 ? (
            <dl className="mt-10 flex flex-wrap gap-x-10 gap-y-5">
              {[
                { k: 'Kỳ thi đang mở', v: String(openPrograms.length) },
                { k: 'Khóa học', v: String(totalCourses) },
                { k: 'Môn học', v: String(allSubjects.length) },
              ].map((stat) => (
                <div key={stat.k}>
                  <dt className="text-[11px] font-semibold tracking-[0.14em] text-navy-400 uppercase">
                    {stat.k}
                  </dt>
                  <dd className="font-display mt-1 text-3xl font-bold text-white tabular-nums">
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
            <div className="rounded-2xl border border-dashed border-navy-200 bg-navy-50/50 px-6 py-16 text-center">
              <p className="font-display text-xl font-bold text-navy-800">
                Chưa có kỳ thi nào đang mở
              </p>
              <p className="mx-auto mt-2 max-w-md text-[15px] leading-relaxed text-navy-500">
                Danh mục kỳ thi được nạp từ khu vực quản trị. Nếu bạn là quản trị viên, hãy nạp dữ
                liệu mẫu hoặc tạo chương trình mới rồi quay lại trang này.
              </p>
              <Link
                href={routes.home()}
                className="mt-6 inline-block text-[14px] font-semibold text-navy-700 underline underline-offset-4 hover:text-navy-900"
              >
                ← Về trang chủ
              </Link>
            </div>
          ) : (
            <div className="space-y-8">
              {openPrograms.map((program, index) => (
                <Reveal key={program.id} delay={index * 70}>
                  <article className="overflow-hidden rounded-2xl bg-white ring-1 ring-navy-100 shadow-[0_2px_12px_-6px_rgb(13_27_49/0.12)]">
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
                            <span className="rounded-md bg-navy-50 px-2 py-0.5 text-[11.5px] font-medium text-navy-600">
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

                        <h2 className="font-display mt-2 text-[26px] leading-snug font-bold text-navy-900">
                          <Link
                            href={routes.program(program.code)}
                            className="transition-colors hover:text-navy-700"
                          >
                            {program.name}
                          </Link>
                        </h2>

                        <p className="mt-3 text-[15px] leading-relaxed text-navy-600">
                          {program.description}
                        </p>

                        {program.highlights.length > 0 ? (
                          <ul className="mt-4 space-y-1.5">
                            {program.highlights.slice(0, 4).map((highlight) => (
                              <li
                                key={highlight}
                                className="flex gap-2 text-[14px] leading-snug text-navy-700"
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
                            className="press rounded-xl bg-navy-900 px-5 py-2.5 text-[14.5px] font-semibold text-white transition-colors hover:bg-navy-800"
                          >
                            Xem chi tiết kỳ thi
                          </Link>
                          {program.fromPrice > 0 ? (
                            <span className="text-[13.5px] text-navy-500">
                              Học phí từ{' '}
                              <strong className="font-display text-[17px] font-bold text-navy-900">
                                {formatVnd(program.fromPrice)}
                              </strong>
                            </span>
                          ) : null}
                        </div>
                      </div>

                      {/* --- Khối lớp & môn --- */}
                      <div className="rounded-xl bg-navy-50/60 p-5 ring-1 ring-navy-100">
                        <p className="text-[11px] font-semibold tracking-[0.14em] text-navy-500 uppercase">
                          Khóa đang mở
                        </p>

                        {program.bands.length === 0 ? (
                          <p className="mt-3 text-[14px] text-navy-500">
                            Kỳ thi này chưa mở khóa nào cho mùa hiện tại.
                          </p>
                        ) : (
                          <ul className="mt-3 space-y-3">
                            {program.bands.map((band) => (
                              <li key={band.gradeBand}>
                                <p className="text-[13.5px] font-semibold text-navy-800">
                                  {band.gradeBandLabel}
                                </p>
                                <ul className="mt-1 flex flex-wrap gap-1.5">
                                  {band.courses.map((course) => (
                                    <li key={course.id}>
                                      <Link
                                        href={routes.checkout(course.id)}
                                        className="inline-flex items-baseline gap-1.5 rounded-lg bg-white px-2.5 py-1 text-[12.5px] ring-1 ring-navy-200 transition-shadow hover:ring-navy-300"
                                      >
                                        <span className="font-medium text-navy-700">
                                          {SUBJECT_LABEL[course.subject]}
                                        </span>
                                        <span className="text-[11.5px] text-navy-400 tabular-nums">
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
    </MarketingShell>
  );
}
