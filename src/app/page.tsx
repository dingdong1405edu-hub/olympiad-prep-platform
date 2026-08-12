import Link from 'next/link';
import { getCatalogTree } from '@/server/catalog/service';
import { getSession } from '@/lib/auth';
import { routes } from '@/lib/routes';
import { formatVnd } from '@/lib/domain';
import { MarketingShell } from '@/components/marketing';
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

const STEPS = [
  {
    n: '01',
    title: 'Làm bài kiểm tra đầu vào',
    body: '15 câu chọn theo đúng cấu trúc đề của kỳ thi con bạn nhắm tới — không phải 15 câu ngẫu nhiên lấy từ kho chung.',
  },
  {
    n: '02',
    title: 'Hệ thống chỉ ra chỗ hổng',
    body: 'Chấm theo độ khó, chủ đề và cả tốc độ làm bài. Hai học sinh cùng 10/15 nhưng sai khác nhau sẽ nhận hai lộ trình khác nhau.',
  },
  {
    n: '03',
    title: 'Gia đình tự chọn mục tiêu',
    body: 'Khai thật con học được mấy ngày một tuần, mỗi ngày bao nhiêu phút. Hệ thống tính ngược xem mục tiêu đó có khả thi không và nói thẳng nếu không.',
  },
  {
    n: '04',
    title: 'Học đúng bài mình cần',
    body: 'Mỗi ngày một danh sách ngắn: vá lỗ hổng, củng cố, thử thách vừa sức. Bài nào cũng kèm câu trả lời cho "vì sao con phải làm bài này".',
  },
  {
    n: '05',
    title: 'Đo lại sau mỗi 14 ngày',
    body: 'Bài kiểm tra tiến bộ có câu neo để so với lần trước — đo mức tiến bộ thật, không phải đếm số bài đã làm.',
  },
  {
    n: '06',
    title: 'Giáo viên tư vấn 20 phút',
    body: 'Thầy cô đọc báo cáo trước buổi, trao đổi đúng vấn đề đang vướng, rồi cùng gia đình chỉnh lộ trình cho 2 tuần kế tiếp.',
  },
];

const FAQS = [
  {
    q: 'Khác gì so với các kho đề luyện thi khác?',
    a: 'Kho đề bán cho bạn quyền tự chọn bài trong một kho chung — việc chọn đúng bài vẫn là của bạn. Ở đây, hệ thống giữ một hồ sơ năng lực riêng cho từng học sinh theo từng kỹ năng nhỏ, và tự quyết định hôm nay em nên làm bài nào, ở mức khó nào, bao nhiêu câu.',
  },
  {
    q: 'AI có tự ra đề không?',
    a: 'Không. Toàn bộ câu hỏi do đội chuyên môn biên soạn và qua kiểm duyệt trước khi vào kho. AI chỉ đọc dữ liệu làm bài của học sinh để chọn câu phù hợp và diễn giải lại lời giải đã được duyệt cho dễ hiểu hơn.',
  },
  {
    q: 'Một bài 15 câu có đủ để đánh giá con tôi không?',
    a: 'Không, và hệ thống cũng không coi đó là kết luận cuối cùng. Đó là mốc khởi đầu để có cái mà bắt đầu. Hồ sơ năng lực được cập nhật sau mỗi câu con làm, và được đo lại chính thức bằng câu neo sau mỗi 14 ngày.',
  },
  {
    q: 'Nếu con học không kịp theo kế hoạch?',
    a: 'Hệ thống tự dàn lại lịch và nói rõ phần nào bị lùi, thay vì để kế hoạch dồn thành một đống nợ khiến con nản. Gia đình cũng có thể đổi mục tiêu bất cứ lúc nào — hệ thống sẽ tính lại khối lượng cho phù hợp.',
  },
  {
    q: 'Phụ huynh theo dõi được không?',
    a: 'Được. Sau mỗi chu kỳ 14 ngày đều có báo cáo bằng số liệu cụ thể: mastery từng mảng kiến thức tăng bao nhiêu, tốc độ làm bài cải thiện thế nào, lỗi nào đã sửa được và lỗi nào còn lặp lại.',
  },
  {
    q: 'Con tôi mất gốc, có theo được không?',
    a: 'Đây chính là trường hợp hệ thống làm tốt nhất. Bài kiểm tra đầu vào sẽ tìm ra đúng tầng kiến thức bị hổng, kể cả khi nó nằm ở lớp dưới, rồi dựng lại từ đó lên. Độ khó sẽ hạ xuống mức con làm được trước khi nâng dần.',
  },
];

export default async function HomePage() {
  const [programs, session] = await Promise.all([getCatalogTree(), getSession()]);
  const openPrograms = programs.filter((program) => program.active);
  const primaryCta = session ? routes.myCourses() : routes.register();

  return (
    <MarketingShell signedIn={Boolean(session)}>
      {/* ================= Hero ================= */}
      <section className="paper relative overflow-hidden pt-28 pb-16 sm:pt-36 lg:pt-40 lg:pb-24">
        <div className="grid-faint pointer-events-none absolute inset-0" aria-hidden />

        <div className={`${SHELL} relative`}>
          <div className="grid items-center gap-14 lg:grid-cols-[1.05fr_1fr] lg:gap-16">
            {/* --- Lời chào --- */}
            <div>
              <p className="animate-fade-down inline-flex items-center gap-2 rounded-full bg-white px-3.5 py-1.5 text-[11px] font-bold tracking-[0.14em] text-navy-700 uppercase ring-1 ring-navy-100">
                <span className="h-1.5 w-1.5 rounded-full bg-gold-400" aria-hidden />
                Ôn luyện vòng quốc gia
              </p>

              <h1 className="animate-fade-up delay-1 font-display mt-6 max-w-2xl text-[38px] leading-[1.08] font-bold tracking-tight text-navy-900 text-balance sm:text-[54px] lg:text-[66px]">
                Con bạn đang yếu <span className="gold-underline">chính xác</span> chỗ nào?
              </h1>

              <p className="animate-fade-up delay-2 mt-6 max-w-xl text-[17px] leading-relaxed text-navy-600 text-pretty sm:text-lg">
                Hầu hết học sinh ôn Olympic đều học chăm. Cái thiếu không phải thời gian, mà là biết
                chắc nên dồn thời gian đó vào đâu. Hệ thống đo năng lực theo từng kỹ năng nhỏ, tìm ra
                lỗ hổng thật và giao đúng bài cần học hôm nay.
              </p>

              <div className="animate-fade-up delay-3 mt-9 flex flex-wrap items-center gap-3">
                <Link
                  href={primaryCta}
                  className="press inline-flex items-center gap-2.5 rounded-xl bg-navy-900 px-7 py-4 text-[15px] font-semibold text-white shadow-[0_12px_30px_-10px_rgb(13_27_49/0.55)] transition-all hover:bg-navy-800 hover:shadow-[0_18px_40px_-12px_rgb(13_27_49/0.6)]"
                >
                  {session ? 'Vào khu học tập' : 'Kiểm tra đầu vào miễn phí'}
                  <span aria-hidden>→</span>
                </Link>
                <a
                  href="#cach-hoat-dong"
                  className="press inline-flex items-center gap-2 rounded-xl bg-white px-6 py-4 text-[15px] font-semibold text-navy-800 ring-1 ring-navy-200 transition-all hover:ring-navy-300"
                >
                  Xem cách hoạt động
                </a>
              </div>

              <p className="animate-fade-up delay-4 mt-5 text-[13px] text-navy-500">
                Không cần thẻ thanh toán · Xong bài là có ngay bản đồ kỹ năng
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
            {[
              { v: '186', l: 'kỹ năng được đo riêng', h: 'không phải 4 môn chung chung' },
              { v: '15', l: 'câu ở bài đầu vào', h: 'bám cấu trúc đề thật' },
              { v: '14', l: 'ngày một chu kỳ đo', h: 'có câu neo để so sánh' },
              { v: '20', l: 'phút tư vấn cùng giáo viên', h: 'sau mỗi lần đo' },
            ].map((stat, index) => (
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
                Học thêm 2 tiếng mỗi ngày không bằng học đúng 30 phút
              </h2>
              <p className="mt-5 max-w-lg text-[16.5px] leading-relaxed text-navy-600 text-pretty">
                Một học sinh làm 200 bài phân số mà không ai chỉ ra em đang nhầm ở bước quy đồng thì
                200 bài đó chỉ củng cố cái sai. Vấn đề của việc ôn thi không nằm ở khối lượng — nó
                nằm ở chỗ không ai đủ thời gian ngồi soi từng em xem lỗ hổng thật nằm ở đâu.
              </p>
              <p className="mt-4 max-w-lg text-[16.5px] leading-relaxed text-navy-600 text-pretty">
                Đó chính xác là việc mà một hệ thống làm tốt hơn con người: nhớ từng câu, từng lỗi,
                từng giây do dự của từng học sinh, rồi rút ra kết luận.
              </p>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="rounded-2xl bg-white p-6 ring-1 ring-navy-100">
                <p className="text-[11px] font-bold tracking-[0.14em] text-ink-400 uppercase">
                  Kho đề thông thường
                </p>
                <ul className="mt-4 space-y-3">
                  {[
                    'Mọi học sinh thấy cùng một danh sách bài.',
                    'Gia đình tự đoán con yếu chỗ nào.',
                    'Làm nhiều bài dễ vẫn thấy điểm cao, lỗ hổng còn nguyên.',
                    'Không có cách nào biết con tiến bộ bao nhiêu.',
                  ].map((line) => (
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
                  Nền tảng này
                </p>
                <ul className="mt-4 space-y-3">
                  {[
                    'Hồ sơ năng lực theo từng kỹ năng nhỏ, cập nhật sau mỗi câu.',
                    'Bài được giao đúng chỗ yếu, kèm lý do cụ thể.',
                    'Độ khó tự nâng khi con vững, tự hạ khi con đuối.',
                    'Đo tiến bộ bằng câu neo mỗi 14 ngày, có giáo viên xác nhận.',
                  ].map((line) => (
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
              Chọn kỳ thi của con
            </h2>
            <p className="mt-4 max-w-2xl text-[16.5px] leading-relaxed text-navy-600">
              Mỗi kỳ thi có cấu trúc đề riêng, thang điểm riêng và kiểu tư duy riêng. Hệ thống ra bài
              bám đúng cấu trúc đó chứ không dùng chung một kho cho tất cả.
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
              <p className="font-medium text-navy-700">Chưa có kỳ thi nào đang mở</p>
              <p className="mx-auto mt-1 max-w-md text-sm text-navy-500">
                Nếu bạn là quản trị viên, hãy nạp dữ liệu mẫu hoặc tạo chương trình trong khu vực
                quản trị.
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
              Một chu trình khép kín, lặp tới ngày thi
            </h2>
            <p className="mt-4 max-w-2xl text-[16.5px] leading-relaxed text-navy-200">
              Không có bước nào là hộp đen. Ở mỗi bước, gia đình đều thấy hệ thống đang kết luận gì
              về con mình và dựa trên dữ liệu nào.
            </p>
          </Reveal>

          <ol className="mt-14 grid gap-x-10 gap-y-11 sm:grid-cols-2 lg:grid-cols-3">
            {STEPS.map((step, index) => (
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
              Đây là những gì con bạn thật sự nhìn thấy
            </h2>
          </Reveal>

          <div className="mt-16 space-y-20 lg:space-y-28">
            {/* --- Việc hôm nay --- */}
            <Reveal>
              <div className="grid items-center gap-10 lg:grid-cols-2 lg:gap-16">
                <div className="lg:order-2">
                  <p className="text-[11px] font-bold tracking-[0.16em] text-gold-600 uppercase">
                    Mỗi ngày
                  </p>
                  <h3 className="font-display mt-3 text-[26px] leading-snug font-bold text-navy-900 sm:text-[32px]">
                    Một danh sách ngắn, và lý do cho từng bài
                  </h3>
                  <p className="mt-4 text-[16px] leading-relaxed text-navy-600 text-pretty">
                    Không phải một kho bài để con tự bơi. Mỗi ngày là ba tới năm việc, xếp theo thứ
                    tự: vá chỗ hổng nặng nhất trước, rồi củng cố, rồi mới tới thử thách.
                  </p>
                  <p className="mt-4 text-[16px] leading-relaxed text-navy-600 text-pretty">
                    Bài nào cũng bấm được nút <em className="text-navy-800">“vì sao bài này”</em> để
                    xem hệ thống đang dựa vào dữ liệu nào mà giao. Con hiểu mình đang sửa cái gì thì
                    mới chịu ngồi làm.
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
                    Theo thời gian thực
                  </p>
                  <h3 className="font-display mt-3 text-[26px] leading-snug font-bold text-navy-900 sm:text-[32px]">
                    Độ khó bám sát con, không bám sát giáo án
                  </h3>
                  <p className="mt-4 text-[16px] leading-relaxed text-navy-600 text-pretty">
                    Ba câu đúng liên tiếp là nâng một bậc. Hai câu sai liên tiếp là hạ xuống và quay
                    lại nền. Con luôn ở vùng vừa đủ khó để phải nghĩ, nhưng chưa đủ khó để bỏ cuộc.
                  </p>
                  <p className="mt-4 text-[16px] leading-relaxed text-navy-600 text-pretty">
                    Đây là chỗ lớp học đông không làm được: một giáo viên không thể chỉnh độ khó
                    riêng cho ba mươi em cùng lúc, sau từng câu.
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
                    Mỗi 14 ngày
                  </p>
                  <h3 className="font-display mt-3 text-[26px] leading-snug font-bold text-navy-900 sm:text-[32px]">
                    Tiến bộ đo bằng câu neo, không đếm số bài
                  </h3>
                  <p className="mt-4 text-[16px] leading-relaxed text-navy-600 text-pretty">
                    “Con làm được 300 bài rồi” không nói lên điều gì. Bài kiểm tra tiến bộ dùng câu
                    neo — những câu có cùng độ khó với lần đo trước — nên con số tăng lên là tăng
                    thật, không phải do đề lần này dễ hơn.
                  </p>
                  <p className="mt-4 text-[16px] leading-relaxed text-navy-600 text-pretty">
                    Đường tiến bộ có lúc chững lại, và hệ thống không giấu điều đó. Một biểu đồ chỉ
                    biết đi lên là một biểu đồ không đáng tin.
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
                Phụ huynh biết chính xác mình đang trả tiền cho cái gì
              </h2>
              <p className="mt-5 text-[16.5px] leading-relaxed text-navy-600 text-pretty">
                Nỗi khổ lớn nhất khi đầu tư cho con học thêm là không có cách nào biết nó có tác dụng
                hay không, cho tới lúc thi xong thì đã muộn. Ở đây, sau mỗi 14 ngày gia đình nhận một
                báo cáo bằng số, kèm phần diễn giải bằng lời cho người không chuyên môn.
              </p>

              <ul className="mt-8 space-y-4">
                {[
                  {
                    t: 'Mastery từng mảng tăng bao nhiêu',
                    d: 'So với chính con 14 ngày trước, không so với bạn cùng lớp.',
                  },
                  {
                    t: 'Lỗi nào đã sửa được, lỗi nào còn lặp',
                    d: 'Gọi tên cụ thể chứ không phải “cần cố gắng thêm”.',
                  },
                  {
                    t: 'Thời gian học thật so với cam kết',
                    d: 'Biết con có ngồi vào bàn thật hay không.',
                  },
                  {
                    t: 'Mục tiêu còn khả thi không',
                    d: 'Nếu không kịp, hệ thống nói sớm để còn điều chỉnh.',
                  },
                ].map((row) => (
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
                    Buổi tư vấn 20 phút
                  </p>
                  <p className="mt-3 text-[15px] leading-relaxed text-navy-100 text-pretty">
                    Sau mỗi lần đo, giáo viên đọc trước toàn bộ hồ sơ rồi mới vào buổi. Không mất
                    mười phút đầu để hỏi lại “dạo này cháu học thế nào” — đi thẳng vào chỗ đang vướng
                    và chốt điều chỉnh cho hai tuần tới.
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
                Câu hỏi thường gặp
              </h2>
              <p className="mt-4 text-[15.5px] leading-relaxed text-navy-600">
                Còn thắc mắc khác? Tạo tài khoản và làm thử bài đầu vào — mất khoảng 20 phút và không
                cần thanh toán.
              </p>
            </Reveal>

            <Reveal delay={100}>
              <div className="divide-y divide-navy-100 border-y border-navy-100">
                {FAQS.map((faq) => (
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
                  Bắt đầu bằng bài kiểm tra đầu vào 15 câu
                </h2>
                <p className="mx-auto mt-5 max-w-xl text-[16.5px] leading-relaxed text-navy-200 text-pretty">
                  Mất khoảng 20 phút. Xong bài, bạn thấy ngay bản đồ kỹ năng của con: mạnh ở đâu,
                  hổng ở đâu, và nên sửa theo thứ tự nào.
                </p>

                <div className="mt-9 flex flex-wrap justify-center gap-3">
                  <Link
                    href={primaryCta}
                    className="press inline-flex items-center gap-2.5 rounded-xl bg-gold-300 px-8 py-4 text-[15px] font-bold text-navy-900 shadow-[0_14px_34px_-12px_rgb(221_169_44/0.7)] transition-all hover:bg-gold-200"
                  >
                    {session ? 'Tiếp tục học' : 'Làm bài kiểm tra miễn phí'}
                    <span aria-hidden>→</span>
                  </Link>
                  {session ? null : (
                    <Link
                      href={routes.login()}
                      className="press inline-flex items-center rounded-xl px-6 py-4 text-[15px] font-semibold text-navy-100 ring-1 ring-navy-600 transition-colors hover:bg-navy-800"
                    >
                      Đã có tài khoản
                    </Link>
                  )}
                </div>

                <p className="mt-6 text-[13px] text-navy-400">
                  Không cần thẻ thanh toán · Dữ liệu học tập của con thuộc về gia đình
                </p>
              </div>
            </div>
          </Reveal>
        </div>
      </section>
    </MarketingShell>
  );
}
