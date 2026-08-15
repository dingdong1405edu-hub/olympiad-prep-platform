import Link from 'next/link';
import { getSession } from '@/lib/auth';
import { routes } from '@/lib/routes';
import { listPublishedExams, aiStatus } from '@/server/mock-exam/service';
import { SiteShell } from '@/components/site-shell';
import { Badge, EmptyState } from '@/components/ui';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Thi thử — chấm điểm bằng AI',
  description:
    'Làm đề thi Olympic thật trên máy, chụp ảnh bài giải tự luận và nhận điểm kèm nhận xét từng câu theo barem.',
};

const SHELL = 'mx-auto w-full max-w-5xl px-5 lg:px-8';

/**
 * Danh sách đề thi thử.
 *
 * Vào được ngay, không cần đăng nhập, không cần mua khóa: đây là cửa vào rộng
 * nhất của sản phẩm — ai cũng thử được một đề thật rồi mới quyết định học.
 */
export default async function MockExamListPage() {
  const [exams, session] = await Promise.all([listPublishedExams(), getSession()]);
  const ai = aiStatus();

  return (
    <SiteShell signedIn={Boolean(session)}>
      <section className="relative overflow-hidden bg-navy-900 pt-28 pb-14 sm:pt-36 lg:pt-40">
        <div className="grid-faint-dark pointer-events-none absolute inset-0" aria-hidden />
        <div className={`${SHELL} relative`}>
          <p className="text-[11px] font-bold tracking-[0.18em] text-gold-400 uppercase">
            Thi thử có chấm
          </p>
          <h1 className="font-display mt-3 max-w-2xl text-3xl leading-tight text-white sm:text-4xl lg:text-5xl">
            Làm đề thật. Chụp bài giải. Nhận điểm từng câu.
          </h1>
          <p className="mt-4 max-w-2xl text-navy-200">
            Trắc nghiệm và đáp số được máy chấm chính xác tuyệt đối. Câu tự luận thì chụp ảnh bài làm
            viết tay — AI đọc lại bài, chấm theo đúng barem của đề và chỉ ra em mất điểm ở bước nào.
          </p>

          <div className="mt-6 flex flex-wrap gap-2 text-xs text-navy-200">
            <span className="rounded-full bg-white/10 px-3 py-1.5">Không cần đăng nhập</span>
            <span className="rounded-full bg-white/10 px-3 py-1.5">Có đồng hồ đếm ngược</span>
            <span className="rounded-full bg-white/10 px-3 py-1.5">Nhận xét bằng tiếng Việt</span>
          </div>
        </div>
      </section>

      <section className={`${SHELL} py-12`}>
        {exams.length === 0 ? (
          <EmptyState
            icon="📄"
            title="Chưa có đề thi thử nào trong hệ thống"
            description="Nạp đề mẫu bằng lệnh: npm run db:seed:exam"
          />
        ) : (
          <ul className="stagger grid gap-5 sm:grid-cols-2">
            {exams.map((exam) => (
              <li key={exam.slug} className="animate-fade-up">
                <Link
                  href={routes.mockExam(exam.slug)}
                  className="hover-lift block h-full rounded-xl bg-white p-6 ring-1 ring-ink-100 shadow-[0_1px_3px_rgb(23_27_38/0.05)] transition-all"
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

                  <h2 className="text-lg font-bold text-ink-900">{exam.title}</h2>
                  <p className="mt-1 text-sm text-ink-500">
                    {[exam.subject === 'math' ? 'Toán' : exam.subject, exam.gradeLevel]
                      .filter(Boolean)
                      .join(' · ')}
                  </p>

                  <span className="mt-4 inline-flex items-center gap-1.5 text-sm font-semibold text-brand-700">
                    Bắt đầu làm bài →
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
              : 'Chưa gắn khóa AI. Trắc nghiệm và đáp số vẫn chấm bình thường; câu tự luận sẽ được ghi "chưa chấm được" và chấm lại sau khi gắn khóa.'}
          </p>
        ) : null}
      </section>
    </SiteShell>
  );
}
