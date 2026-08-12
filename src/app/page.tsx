import Link from 'next/link';
import { getCatalogTree } from '@/server/catalog/service';
import { getSession } from '@/lib/auth';
import { routes } from '@/lib/routes';
import { formatVnd } from '@/lib/domain';
import { AppShell } from '@/components/shell';
import { Card, LinkButton } from '@/components/ui';

// Trang đọc dữ liệu catalog từ DB nên không dựng tĩnh lúc build.
export const dynamic = 'force-dynamic';

const STEPS = [
  {
    title: 'Làm bài kiểm tra đầu vào',
    body: '15 câu được chọn theo cấu trúc đề của đúng kỳ thi bạn nhắm tới — không phải 15 câu ngẫu nhiên.',
  },
  {
    title: 'Hệ thống chỉ ra chỗ hổng',
    body: 'Chấm theo độ khó, chủ đề và tốc độ làm bài. Hai bạn cùng 10/15 nhưng sai khác nhau sẽ nhận lộ trình khác nhau.',
  },
  {
    title: 'Bạn tự chọn mục tiêu',
    body: 'Nói rõ bạn học được mấy ngày một tuần, mỗi ngày bao nhiêu phút. Hệ thống tính ngược xem mục tiêu có khả thi không.',
  },
  {
    title: 'Học đúng bài mình cần',
    body: 'Mỗi ngày một danh sách ngắn: vá lỗ hổng, củng cố, thử thách vừa sức. Luôn nói rõ vì sao bài này được giao.',
  },
  {
    title: 'Đo lại sau mỗi 2 tuần',
    body: 'Bài kiểm tra tiến bộ có câu neo để so với lần trước — đo mức tiến bộ thật, không chỉ đếm điểm.',
  },
  {
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
];

export default async function HomePage() {
  const [programs, session] = await Promise.all([getCatalogTree(), getSession()]);
  const openPrograms = programs.filter((program) => program.active);

  return (
    <AppShell user={session ? { id: session.id, fullName: session.fullName, roles: session.roles } : null}>
      {/* Hero */}
      <section className="py-8 text-center sm:py-14">
        <p className="text-sm font-semibold tracking-wide text-brand-700 uppercase">
          Ôn luyện vòng quốc gia
        </p>
        <h1 className="mx-auto mt-3 max-w-3xl text-3xl leading-tight font-bold text-ink-900 sm:text-4xl">
          Hệ thống biết bạn đang yếu phần nào và giao đúng bài bạn cần hôm nay
        </h1>
        <p className="mx-auto mt-4 max-w-2xl text-base text-ink-600">
          Dành cho học sinh chuẩn bị ASMOPSS, NEO, STEM và FMC. Không phải một kho bài tập chung —
          mỗi học sinh có một lộ trình riêng, được tính lại sau mỗi bài làm.
        </p>
        <div className="mt-7 flex flex-wrap justify-center gap-3">
          <LinkButton href={session ? routes.myCourses() : routes.register()} size="lg">
            {session ? 'Vào khu vực học tập' : 'Bắt đầu ngay'}
          </LinkButton>
          <LinkButton href="#cach-hoat-dong" variant="secondary" size="lg">
            Xem cách hoạt động
          </LinkButton>
        </div>
      </section>

      {/* Chọn kỳ thi */}
      <section className="py-6">
        <h2 className="text-xl font-bold text-ink-900">Chọn kỳ thi của bạn</h2>
        <p className="mt-1 text-sm text-ink-500">
          Mỗi kỳ thi có cấu trúc đề riêng, hệ thống ra bài bám theo đúng cấu trúc đó.
        </p>

        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          {openPrograms.map((program) => (
            <Link
              key={program.id}
              href={routes.program(program.code)}
              className="group rounded-xl bg-white p-5 shadow-sm ring-1 ring-ink-100 transition hover:shadow-md hover:ring-brand-200"
            >
              <div className="flex items-start gap-3">
                <span
                  aria-hidden
                  className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-xl"
                  style={{ backgroundColor: `${program.colorHex}1a` }}
                >
                  {program.logoEmoji}
                </span>
                <div className="min-w-0">
                  <h3 className="font-semibold text-ink-900 group-hover:text-brand-700">
                    {program.name}
                  </h3>
                  <p className="mt-1 line-clamp-2 text-sm text-ink-600">{program.description}</p>
                </div>
              </div>

              <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-ink-500">
                <span>{program.bands.length} khối lớp</span>
                <span>{program.courseCount} khóa</span>
                {program.fromPrice > 0 ? (
                  <span className="font-medium text-ink-700">từ {formatVnd(program.fromPrice)}</span>
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
      </section>

      {/* Cách hoạt động */}
      <section id="cach-hoat-dong" className="scroll-mt-24 py-10">
        <h2 className="text-xl font-bold text-ink-900">Cách hệ thống làm việc với bạn</h2>
        <ol className="mt-5 grid gap-4 sm:grid-cols-2">
          {STEPS.map((step, index) => (
            <li key={step.title} className="rounded-xl bg-white p-5 ring-1 ring-ink-100">
              <span className="flex h-7 w-7 items-center justify-center rounded-full bg-brand-50 text-sm font-bold text-brand-700">
                {index + 1}
              </span>
              <h3 className="mt-3 font-semibold text-ink-900">{step.title}</h3>
              <p className="mt-1 text-sm text-ink-600">{step.body}</p>
            </li>
          ))}
        </ol>
        <p className="mt-4 text-sm text-ink-500">
          Chu trình này lặp lại sau mỗi 2 tuần cho tới ngày thi.
        </p>
      </section>

      {/* Khác biệt */}
      <section className="py-6">
        <h2 className="text-xl font-bold text-ink-900">Vì sao lộ trình riêng lại quan trọng</h2>
        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          <Card>
            <p className="text-sm font-semibold text-ink-500">Kho đề thông thường</p>
            <ul className="mt-3 space-y-2 text-sm text-ink-600">
              <li>Mọi học sinh thấy cùng một danh sách bài.</li>
              <li>Bạn phải tự đoán mình yếu chỗ nào.</li>
              <li>Làm nhiều bài dễ vẫn thấy điểm cao, nhưng lỗ hổng còn nguyên.</li>
              <li>Không ai biết bạn tiến bộ bao nhiêu.</li>
            </ul>
          </Card>
          <Card className="ring-brand-200">
            <p className="text-sm font-semibold text-brand-700">Nền tảng này</p>
            <ul className="mt-3 space-y-2 text-sm text-ink-700">
              <li>Hồ sơ năng lực theo từng kỹ năng nhỏ, cập nhật sau mỗi câu.</li>
              <li>Bài được giao đúng chỗ yếu, kèm lý do cụ thể.</li>
              <li>Độ khó tự tăng khi bạn vững, tự hạ khi bạn đuối.</li>
              <li>Đo tiến bộ bằng câu neo sau mỗi 2 tuần, có giáo viên xác nhận.</li>
            </ul>
          </Card>
        </div>
      </section>

      {/* FAQ */}
      <section className="py-10">
        <h2 className="text-xl font-bold text-ink-900">Câu hỏi thường gặp</h2>
        <div className="mt-5 space-y-3">
          {FAQS.map((faq) => (
            <details key={faq.q} className="rounded-xl bg-white p-5 ring-1 ring-ink-100">
              <summary className="cursor-pointer font-medium text-ink-800">{faq.q}</summary>
              <p className="mt-2 text-sm text-ink-600">{faq.a}</p>
            </details>
          ))}
        </div>
      </section>

      <section className="rounded-xl bg-brand-600 px-6 py-10 text-center">
        <h2 className="text-xl font-bold text-white">Bắt đầu bằng bài kiểm tra đầu vào 15 câu</h2>
        <p className="mx-auto mt-2 max-w-xl text-sm text-brand-50">
          Mất khoảng 20 phút. Xong bài, bạn sẽ thấy ngay mình mạnh ở đâu, hổng ở đâu và nên sửa
          theo thứ tự nào.
        </p>
        <div className="mt-6 flex justify-center">
          <LinkButton href={session ? routes.myCourses() : routes.register()} variant="secondary" size="lg">
            {session ? 'Tiếp tục học' : 'Tạo tài khoản'}
          </LinkButton>
        </div>
      </section>
    </AppShell>
  );
}
