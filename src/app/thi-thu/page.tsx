import Link from 'next/link';
import { getSession } from '@/lib/auth';
import { routes } from '@/lib/routes';
import { listPublishedExams, aiStatus } from '@/server/mock-exam/service';
import { getConfigGroup } from '@/lib/config';
import { SiteShell } from '@/components/site-shell';
import { Badge, EmptyState } from '@/components/ui';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Thi thử — chấm điểm bằng AI',
  description:
    'Làm đề thi Olympic thật trên máy, chụp ảnh bài giải tự luận và nhận điểm kèm nhận xét từng câu theo barem, rồi biết mình đang ở mức học lực nào.',
};

const SHELL = 'mx-auto w-full max-w-5xl px-5 lg:px-8';

/**
 * CỬA VÀO CỦA CẢ SẢN PHẨM.
 *
 * Đây là trang người lạ gặp đầu tiên, nên nó phải trả lời xong ba câu trước khi
 * ai đó chịu bỏ ra 180 phút: làm bài này là làm cái gì, ai chấm và chấm kiểu gì,
 * xong rồi mình được gì. Bản cũ chỉ có một câu tiêu đề rồi thả thẳng vào danh
 * sách đề — không ai biết mình sắp bước vào cái gì.
 */
export default async function MockExamListPage() {
  const [exams, session, config] = await Promise.all([
    listPublishedExams(),
    getSession(),
    getConfigGroup('mockExam'),
  ]);
  const ai = aiStatus();
  const freeAttempts = config.freeAttemptsPerExam;

  const steps = [
    {
      step: '1',
      title: 'Bấm bắt đầu, đồng hồ chạy',
      body: 'Đúng như phòng thi: máy chủ giữ giờ, hết giờ bài tự nộp. Đóng nhầm tab hay mất điện thì vào lại đúng lượt đang làm, bài còn nguyên.',
    },
    {
      step: '2',
      title: 'Chụp ảnh bài giải viết tay',
      body: 'Trắc nghiệm và đáp số máy chấm chính xác tuyệt đối. Câu tự luận thì chụp ảnh bài làm — AI đọc lại chữ viết tay và chấm theo đúng barem của đề.',
    },
    {
      step: '3',
      title: 'Nhận điểm từng câu, không phải một con số',
      body: 'Mỗi câu tự luận cho biết mất điểm ở tiêu chí nào và vì sao, kèm nhận xét tiếng Việt. Thấy AI đọc sai chữ thì bấm cho đọc lại.',
    },
    {
      step: '4',
      title: 'Biết mình đang ở đâu và học tiếp gì',
      body: 'Xếp học lực Kém / Trung bình / Khá / Giỏi dựa trên điểm, chỉ ra phần mạnh phần yếu, rồi gợi ý khóa học đúng khối và đúng chỗ còn hổng.',
    },
  ];

  return (
    <SiteShell signedIn={Boolean(session)}>
      <section className="paper relative overflow-hidden pt-14 pb-14 sm:pt-16 lg:pt-20">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 bg-[radial-gradient(90%_70%_at_80%_4%,#ffe6d5_0%,rgba(255,242,233,0)_62%),radial-gradient(70%_60%_at_8%_32%,#fff0e2_0%,rgba(255,251,248,0)_60%),linear-gradient(180deg,#fff7f1_0%,#fffbf8_82%)]"
        />
        <div className="grid-faint pointer-events-none absolute inset-0" aria-hidden />
        <div className={`${SHELL} relative`}>
          <p className="text-[11px] font-bold tracking-[0.18em] text-brand-700 uppercase">
            Thi thử có chấm
          </p>
          <h1 className="font-display mt-3 max-w-2xl text-3xl leading-tight text-warm-900 sm:text-4xl lg:text-5xl">
            Làm đề thật. Chụp bài giải. Nhận điểm từng câu.
          </h1>
          <p className="mt-4 max-w-2xl text-warm-500">
            Không phải bài trắc nghiệm cho vui. Đây là đề Olympic thật, chấm bằng đúng barem của đề,
            và nói cho em biết em đang ở mức nào so với yêu cầu của kỳ thi.
          </p>

          <div className="mt-6 flex flex-wrap gap-2 text-xs text-warm-500">
            <span className="rounded-full bg-gold-400/20 px-3 py-1.5 font-semibold text-brand-700">
              {freeAttempts} lượt miễn phí mỗi đề
            </span>
            <span className="rounded-full bg-white px-3 py-1.5">Đồng hồ như thi thật</span>
            <span className="rounded-full bg-white px-3 py-1.5">Chấm tự luận theo barem</span>
            <span className="rounded-full bg-white px-3 py-1.5">Có xếp học lực</span>
          </div>

          {session === null ? (
            <div className="mt-7 flex flex-wrap items-center gap-3">
              <Link
                href={routes.register(routes.mockExams())}
                className="press rounded-lg bg-gold-400 px-6 py-3 text-sm font-bold text-warm-900 transition-all hover:bg-gold-300"
              >
                Đăng ký miễn phí để làm bài
              </Link>
              <Link
                href={routes.login(routes.mockExams())}
                className="text-sm font-medium text-warm-500 hover:text-warm-900"
              >
                Đã có tài khoản? Đăng nhập
              </Link>
            </div>
          ) : null}
        </div>
      </section>

      {/* ---------------- Bốn bước ---------------- */}
      <section className={`${SHELL} py-12`}>
        <h2 className="font-display text-2xl text-ink-900">Thi thử ở đây diễn ra thế nào</h2>
        <ol className="stagger mt-6 grid gap-4 sm:grid-cols-2">
          {steps.map((item) => (
            <li
              key={item.step}
              className="animate-fade-up rounded-xl bg-white p-5 ring-1 ring-ink-100 shadow-[0_1px_3px_rgb(120_70_45/0.05)]"
            >
              <span
                aria-hidden
                className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-brand-600 to-brand-400 text-sm font-bold text-white"
              >
                {item.step}
              </span>
              <h3 className="mt-3 font-semibold text-ink-900">{item.title}</h3>
              <p className="mt-1 text-sm leading-relaxed text-ink-600">{item.body}</p>
            </li>
          ))}
        </ol>
      </section>

      {/* ---------------- Danh sách đề ---------------- */}
      <section className={`${SHELL} pb-16`}>
        <h2 className="font-display text-2xl text-ink-900">Chọn một đề để bắt đầu</h2>
        <p className="mt-1 text-sm text-ink-600">
          Mỗi tài khoản có {freeAttempts} lượt miễn phí cho mỗi đề. Bấm vào đề để xem cấu trúc trước
          khi tính giờ.
        </p>

        {exams.length === 0 ? (
          <EmptyState
            icon="📄"
            title="Chưa có đề thi thử nào đang mở"
            description="Các đề đang được chuẩn bị. Quay lại sau ít hôm nhé."
          />
        ) : (
          <ul className="stagger mt-6 grid gap-5 sm:grid-cols-2">
            {exams.map((exam) => (
              <li key={exam.slug} className="animate-fade-up">
                <Link
                  href={routes.mockExam(exam.slug)}
                  className="hover-lift block h-full rounded-xl bg-white p-6 ring-1 ring-ink-100 shadow-[0_1px_3px_rgb(120_70_45/0.05)] transition-all"
                >
                  <div className="mb-3 flex flex-wrap gap-2">
                    <Badge tone="brand">{exam.questionCount} câu</Badge>
                    <Badge tone="neutral">{exam.durationMin} phút</Badge>
                    <Badge tone="neutral">{exam.totalPoints} điểm</Badge>
                    {exam.essayCount > 0 ? (
                      <Badge tone="info" dot>
                        {exam.essayCount} câu tự luận AI chấm
                      </Badge>
                    ) : null}
                  </div>

                  <h3 className="text-lg font-bold text-ink-900">{exam.title}</h3>
                  <p className="mt-1 text-sm text-ink-500">
                    {[exam.subject === 'math' ? 'Toán' : exam.subject, exam.gradeLevel]
                      .filter(Boolean)
                      .join(' · ')}
                  </p>

                  <span className="mt-4 inline-flex items-center gap-1.5 text-sm font-semibold text-brand-700">
                    Xem đề và bắt đầu →
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}

        {/* Nói thật về tình trạng AI ngay ở cửa vào, đừng để học sinh nộp xong mới biết. */}
        {!ai.live && exams.length > 0 ? (
          <p className="mt-6 rounded-lg bg-amber-50 px-4 py-3 text-sm text-amber-900 ring-1 ring-amber-200">
            {ai.demo
              ? 'Hệ thống đang ở chế độ thử: câu tự luận nhận ĐIỂM MẪU, không phải điểm AI chấm.'
              : 'Phần chấm tự luận bằng AI đang tạm nghỉ. Trắc nghiệm và đáp số vẫn chấm bình thường; câu tự luận sẽ được chấm bù sau.'}
          </p>
        ) : null}
      </section>
    </SiteShell>
  );
}
