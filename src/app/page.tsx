import Link from 'next/link';
import { getCatalogTree } from '@/server/catalog/service';
import { getSession } from '@/lib/auth';
import { routes } from '@/lib/routes';
import { formatVnd } from '@/lib/domain';
import { AppShell } from '@/components/shell';
import { Card, LinkButton } from '@/components/ui';
import { Reveal } from '@/components/motion';
import { HeroStats } from './hero-stats';

// Trang đọc catalog từ DB nên không dựng tĩnh lúc build.
export const dynamic = 'force-dynamic';

const STEPS = [
  {
    n: '01',
    title: 'Làm bài kiểm tra đầu vào',
    body: '15 câu chọn theo đúng cấu trúc đề của kỳ thi bạn nhắm tới — không phải 15 câu ngẫu nhiên.',
  },
  {
    n: '02',
    title: 'Hệ thống chỉ ra chỗ hổng',
    body: 'Chấm theo độ khó, chủ đề và tốc độ. Hai bạn cùng 10/15 nhưng sai khác nhau sẽ nhận lộ trình khác nhau.',
  },
  {
    n: '03',
    title: 'Bạn tự chọn mục tiêu',
    body: 'Khai thật bạn học được mấy ngày một tuần, mỗi ngày bao nhiêu phút. Hệ thống tính ngược xem có khả thi không.',
  },
  {
    n: '04',
    title: 'Học đúng bài mình cần',
    body: 'Mỗi ngày một danh sách ngắn: vá lỗ hổng, củng cố, thử thách vừa sức. Luôn nói rõ vì sao bài này được giao.',
  },
  {
    n: '05',
    title: 'Đo lại sau mỗi 2 tuần',
    body: 'Bài kiểm tra tiến bộ có câu neo để so với lần trước — đo mức tiến bộ thật, không chỉ đếm điểm.',
  },
  {
    n: '06',
    title: 'Giáo viên tư vấn 20 phút',
    body: 'Thầy cô đọc báo cáo trước buổi, trao đổi đúng vấn đề, rồi điều chỉnh lộ trình cho 2 tuần kế tiếp.',
  },
];

const FAQS = [
  {
    q: 'Khác gì so với các kho đề luyện thi khác?',
    a: 'Kho đề bán cho bạn quyền tự chọn bài trong một kho chung. Ở đây, hệ thống theo dõi hồ sơ năng lực của riêng bạn theo từng kỹ năng nhỏ và tự quyết định hôm nay bạn nên làm bài nào, ở mức khó nào, bao nhiêu câu.',
  },
  {
    q: 'AI có tự ra đề không?',
    a: 'Không. Toàn bộ câu hỏi do đội chuyên môn biên soạn và kiểm duyệt trước. AI chỉ đọc dữ liệu làm bài của bạn để chọn câu phù hợp và giải thích lại lời giải đã được duyệt.',
  },
  {
    q: 'Một bài 15 câu có đủ để đánh giá em không?',
    a: 'Không, và hệ thống cũng không coi đó là kết luận cuối. Đó chỉ là mốc khởi đầu. Hồ sơ năng lực được cập nhật sau mỗi câu bạn làm, và được đo lại chính thức sau mỗi 2 tuần.',
  },
  {
    q: 'Nếu em học không kịp theo kế hoạch?',
    a: 'Hệ thống tự dàn lại lịch và nói rõ phần nào bị lùi. Bạn cũng có thể đổi mục tiêu bất cứ lúc nào — hệ thống sẽ tính lại khối lượng cho phù hợp.',
  },
  {
    q: 'Phụ huynh theo dõi được không?',
    a: 'Được. Sau mỗi chu kỳ 2 tuần đều có báo cáo tiến bộ bằng số liệu cụ thể: mastery từng mảng kiến thức tăng bao nhiêu, tốc độ làm bài cải thiện thế nào, lỗi nào đã sửa được.',
  },
];

export default async function HomePage() {
  const [programs, session] = await Promise.all([getCatalogTree(), getSession()]);
  const openPrograms = programs.filter((program) => program.active);

  return (
    <AppShell
      user={session ? { id: session.id, fullName: session.fullName, roles: session.roles } : null}
    >
      {/* ---------------- Hero ---------------- */}
      <section className="hero-glow -mx-4 px-4 py-10 text-center sm:py-16">
        <p className="animate-fade-down inline-flex items-center gap-2 rounded-full bg-white px-3.5 py-1.5 text-xs font-semibold tracking-wide text-brand-700 uppercase ring-1 ring-brand-100">
          <span className="h-1.5 w-1.5 rounded-full bg-accent-500" aria-hidden />
          Ôn luyện vòng quốc gia
        </p>

        <h1 className="animate-fade-up delay-1 mx-auto mt-5 max-w-3xl text-3xl leading-[1.15] font-bold tracking-tight text-ink-900 sm:text-5xl">
          Hệ thống biết bạn đang yếu phần nào
          <span className="block bg-gradient-to-r from-brand-600 to-accent-600 bg-clip-text text-transparent">
            và giao đúng bài bạn cần hôm nay
          </span>
        </h1>

        <p className="animate-fade-up delay-2 mx-auto mt-5 max-w-2xl text-base text-ink-600 sm:text-lg">
          Dành cho học sinh chuẩn bị ASMOPSS, NEO, STEM và FMC. Không phải một kho bài tập chung —
          mỗi học sinh có một lộ trình riêng, được tính lại sau mỗi bài làm.
        </p>

        <div className="animate-fade-up delay-3 mt-8 flex flex-wrap justify-center gap-3">
          <LinkButton href={session ? routes.myCourses() : routes.register()} size="lg">
            {session ? 'Vào khu vực học tập' : 'Bắt đầu miễn phí'}
          </LinkButton>
          <LinkButton href="#cach-hoat-dong" variant="secondary" size="lg">
            Xem cách hoạt động
          </LinkButton>
        </div>

        <HeroStats />
      </section>

      {/* ---------------- Chọn kỳ thi ---------------- */}
      <Reveal as="section" className="py-10">
        <h2 className="text-xl font-bold tracking-tight text-ink-900 sm:text-2xl">
          Chọn kỳ thi của bạn
        </h2>
        <p className="mt-1 text-sm text-ink-500">
          Mỗi kỳ thi có cấu trúc đề riêng. Hệ thống ra bài bám đúng cấu trúc đó.
        </p>

        <div className="stagger mt-6 grid gap-4 sm:grid-cols-2">
          {openPrograms.map((program) => (
            <Link
              key={program.id}
              href={routes.program(program.code)}
              className="hover-lift group block rounded-xl bg-white p-5 ring-1 ring-ink-100 shadow-[0_1px_3px_rgb(23_27_38/0.05)]"
            >
              <div className="flex items-start gap-3.5">
                <span
                  aria-hidden
                  className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl text-2xl transition-transform duration-300 group-hover:scale-110"
                  style={{ backgroundColor: `${program.colorHex}1a` }}
                >
                  {program.logoEmoji}
                </span>
                <div className="min-w-0">
                  <h3 className="font-semibold text-ink-900 transition-colors group-hover:text-brand-700">
                    {program.name}
                  </h3>
                  <p className="mt-1 line-clamp-2 text-sm text-ink-600">{program.description}</p>
                </div>
              </div>

              <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-ink-100 pt-3 text-sm text-ink-500">
                <span>{program.bands.length} khối lớp</span>
                <span aria-hidden className="text-ink-300">
                  ·
                </span>
                <span>{program.courseCount} khóa</span>
                {program.fromPrice > 0 ? (
                  <span className="ml-auto font-semibold text-ink-800">
                    từ {formatVnd(program.fromPrice)}
                  </span>
                ) : null}
              </div>
            </Link>
          ))}
        </div>

        {openPrograms.length === 0 ? (
          <Card className="mt-4">
            <p className="text-sm text-ink-500">
              Chưa có kỳ thi nào đang mở. Nếu bạn là quản trị viên, hãy chạy lệnh nạp dữ liệu mẫu
              hoặc tạo chương trình trong khu vực quản trị.
            </p>
          </Card>
        ) : null}
      </Reveal>

      {/* ---------------- Cách hoạt động ---------------- */}
      <section id="cach-hoat-dong" className="scroll-mt-24 py-10">
        <Reveal>
          <h2 className="text-xl font-bold tracking-tight text-ink-900 sm:text-2xl">
            Cách hệ thống làm việc với bạn
          </h2>
          <p className="mt-1 text-sm text-ink-500">
            Một chu trình khép kín, lặp lại sau mỗi 2 tuần cho tới ngày thi.
          </p>
        </Reveal>

        <ol className="mt-6 grid gap-4 sm:grid-cols-2">
          {STEPS.map((step, index) => (
            <Reveal as="li" key={step.n} delay={index * 70}>
              <div className="hover-lift h-full rounded-xl bg-white p-5 ring-1 ring-ink-100">
                <span
                  aria-hidden
                  className="text-sm font-black tracking-wider text-brand-200 tabular-nums"
                >
                  {step.n}
                </span>
                <h3 className="mt-1 font-semibold text-ink-900">{step.title}</h3>
                <p className="mt-1.5 text-sm leading-relaxed text-ink-600">{step.body}</p>
              </div>
            </Reveal>
          ))}
        </ol>
      </section>

      {/* ---------------- Khác biệt ---------------- */}
      <Reveal as="section" className="py-10">
        <h2 className="text-xl font-bold tracking-tight text-ink-900 sm:text-2xl">
          Vì sao lộ trình riêng lại quan trọng
        </h2>

        <div className="mt-6 grid gap-4 sm:grid-cols-2">
          <div className="rounded-xl bg-white p-5 ring-1 ring-ink-100">
            <p className="text-sm font-semibold text-ink-500">Kho đề thông thường</p>
            <ul className="mt-3 space-y-2.5 text-sm text-ink-600">
              {[
                'Mọi học sinh thấy cùng một danh sách bài.',
                'Bạn phải tự đoán mình yếu chỗ nào.',
                'Làm nhiều bài dễ vẫn thấy điểm cao, lỗ hổng còn nguyên.',
                'Không ai biết bạn tiến bộ bao nhiêu.',
              ].map((line) => (
                <li key={line} className="flex gap-2.5">
                  <span aria-hidden className="mt-0.5 shrink-0 text-ink-300">
                    ✕
                  </span>
                  {line}
                </li>
              ))}
            </ul>
          </div>

          <div className="rounded-xl bg-gradient-to-br from-brand-50 to-accent-50 p-5 ring-1 ring-brand-200">
            <p className="text-sm font-semibold text-brand-700">Nền tảng này</p>
            <ul className="mt-3 space-y-2.5 text-sm text-ink-700">
              {[
                'Hồ sơ năng lực theo từng kỹ năng nhỏ, cập nhật sau mỗi câu.',
                'Bài được giao đúng chỗ yếu, kèm lý do cụ thể.',
                'Độ khó tự tăng khi bạn vững, tự hạ khi bạn đuối.',
                'Đo tiến bộ bằng câu neo sau mỗi 2 tuần, có giáo viên xác nhận.',
              ].map((line) => (
                <li key={line} className="flex gap-2.5">
                  <span aria-hidden className="mt-0.5 shrink-0 font-bold text-accent-600">
                    ✓
                  </span>
                  {line}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </Reveal>

      {/* ---------------- FAQ ---------------- */}
      <Reveal as="section" className="py-10">
        <h2 className="text-xl font-bold tracking-tight text-ink-900 sm:text-2xl">
          Câu hỏi thường gặp
        </h2>
        <div className="mt-6 space-y-3">
          {FAQS.map((faq) => (
            <details
              key={faq.q}
              className="group rounded-xl bg-white p-5 ring-1 ring-ink-100 transition-shadow open:shadow-[0_4px_12px_rgb(23_27_38/0.06)]"
            >
              <summary className="flex cursor-pointer items-center justify-between gap-3 font-medium text-ink-800 marker:content-['']">
                {faq.q}
                <span
                  aria-hidden
                  className="shrink-0 text-ink-400 transition-transform duration-300 group-open:rotate-45"
                >
                  +
                </span>
              </summary>
              <p className="mt-3 text-sm leading-relaxed text-ink-600">{faq.a}</p>
            </details>
          ))}
        </div>
      </Reveal>

      {/* ---------------- CTA cuối ---------------- */}
      <Reveal as="section">
        <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-brand-600 to-brand-800 px-6 py-12 text-center shadow-[0_12px_28px_rgb(47_66_224/0.25)]">
          <div
            aria-hidden
            className="animate-float absolute -top-16 -right-10 h-48 w-48 rounded-full bg-white/10 blur-2xl"
          />
          <div
            aria-hidden
            className="animate-float absolute -bottom-20 -left-10 h-56 w-56 rounded-full bg-accent-300/15 blur-3xl"
            style={{ animationDelay: '1.4s' }}
          />

          <div className="relative">
            <h2 className="text-2xl font-bold tracking-tight text-white">
              Bắt đầu bằng bài kiểm tra đầu vào 15 câu
            </h2>
            <p className="mx-auto mt-3 max-w-xl text-sm text-brand-100 sm:text-base">
              Mất khoảng 20 phút. Xong bài, bạn thấy ngay mình mạnh ở đâu, hổng ở đâu và nên sửa
              theo thứ tự nào.
            </p>
            <div className="mt-7 flex justify-center">
              <LinkButton
                href={session ? routes.myCourses() : routes.register()}
                variant="secondary"
                size="lg"
              >
                {session ? 'Tiếp tục học' : 'Tạo tài khoản'}
              </LinkButton>
            </div>
          </div>
        </div>
      </Reveal>
    </AppShell>
  );
}
