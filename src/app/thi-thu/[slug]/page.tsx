import { notFound } from 'next/navigation';
import Link from 'next/link';
import { getSession } from '@/lib/auth';
import { ApiError } from '@/lib/http';
import { routes } from '@/lib/routes';
import { getExamIntro } from '@/server/mock-exam/service';
import { SiteShell } from '@/components/site-shell';
import { Alert, Badge } from '@/components/ui';
import { RichText } from '@/components/rich-text';
import { StartExamButton } from './start-button';

export const dynamic = 'force-dynamic';

export const metadata = { title: 'Đề thi thử' };

const SHELL = 'mx-auto w-full max-w-4xl px-5 lg:px-8';

/**
 * TRANG GIỚI THIỆU MỘT ĐỀ — cửa vào của khu thi thử.
 *
 * Tách hẳn khỏi màn hình làm bài là có chủ ý. Trước đây mở link đề là NHẢY THẲNG
 * vào đề với đồng hồ đã chạy: không ai kịp biết đề dài bao nhiêu, chấm kiểu gì,
 * và mình còn mấy lượt. Bây giờ vào đây xem trước, bấm bắt đầu mới tính giờ — và
 * mỗi lần bấm bắt đầu là một lượt thi RIÊNG ở máy chủ, không dính gì tới lượt cũ.
 */
export default async function MockExamIntroPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const session = await getSession();

  let intro;
  try {
    intro = await getExamIntro(slug, session);
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) notFound();
    throw error;
  }

  const quota = intro.quota;
  const usedUp = quota !== null && quota.remaining <= 0 && intro.liveAttemptId === null;

  return (
    <SiteShell signedIn={Boolean(session)}>
      <section className="paper relative overflow-hidden pt-14 pb-12 sm:pt-16">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 bg-[radial-gradient(90%_70%_at_80%_4%,#ffe6d5_0%,rgba(255,242,233,0)_62%),radial-gradient(70%_60%_at_8%_32%,#fff0e2_0%,rgba(255,251,248,0)_60%),linear-gradient(180deg,#fff7f1_0%,#fffbf8_82%)]"
        />
        <div className="grid-faint pointer-events-none absolute inset-0" aria-hidden />
        <div className={`${SHELL} relative`}>
          <Link
            href={routes.mockExams()}
            className="text-xs font-medium text-warm-500 hover:text-warm-900"
          >
            ← Tất cả đề thi thử
          </Link>
          <h1 className="font-display mt-3 text-3xl leading-tight text-warm-900 sm:text-4xl">
            {intro.title}
          </h1>
          <div className="mt-4 flex flex-wrap gap-2 text-xs text-warm-600">
            <span className="rounded-full bg-white px-3 py-1.5">{intro.questionCount} câu</span>
            <span className="rounded-full bg-white px-3 py-1.5">{intro.durationMin} phút</span>
            <span className="rounded-full bg-white px-3 py-1.5">{intro.totalPoints} điểm</span>
            {intro.essayCount > 0 ? (
              <span className="rounded-full bg-gold-400/20 px-3 py-1.5 text-brand-700">
                {intro.essayCount} câu tự luận chấm bằng AI
              </span>
            ) : null}
          </div>
        </div>
      </section>

      <section className={`${SHELL} py-10`}>
        <div className="grid gap-6 lg:grid-cols-[1fr_20rem]">
          <div className="min-w-0">
            {/* ---------------- Cấu trúc đề ---------------- */}
            <h2 className="text-lg font-semibold text-ink-900">Đề gồm những gì</h2>
            <ul className="mt-3 space-y-2">
              {intro.parts.map((part) => (
                <li
                  key={part.part}
                  className="flex items-center justify-between gap-3 rounded-lg bg-white px-4 py-3 ring-1 ring-ink-100"
                >
                  <span className="font-medium text-ink-800">{part.label}</span>
                  <span className="shrink-0 text-sm tabular-nums text-ink-500">
                    {part.count} câu · {part.points} điểm
                  </span>
                </li>
              ))}
            </ul>

            {intro.instructions ? (
              <div className="mt-6">
                <h2 className="text-lg font-semibold text-ink-900">Hướng dẫn làm bài</h2>
                <RichText className="mt-2 text-sm leading-relaxed text-ink-700">
                  {intro.instructions}
                </RichText>
              </div>
            ) : null}

            <h2 className="mt-6 text-lg font-semibold text-ink-900">Thi thử ở đây khác gì</h2>
            <ul className="mt-3 space-y-2 text-sm text-ink-700">
              {[
                'Làm đúng như thi thật: đồng hồ do máy chủ giữ, hết giờ là bài tự nộp.',
                'Không thấy đáp án, không thấy lời giải cho tới khi nộp bài.',
                'Trắc nghiệm và đáp số được chấm chính xác tuyệt đối bằng mã, không phải bằng AI.',
                'Câu tự luận thì chụp ảnh bài viết tay — AI đọc lại bài, chấm theo đúng barem của đề và chỉ ra em mất điểm ở bước nào.',
                'Nộp xong biết ngay học lực của mình và nên học tiếp cái gì.',
              ].map((line) => (
                <li key={line} className="flex gap-2">
                  <span aria-hidden className="text-accent-600">
                    ✓
                  </span>
                  <span className="min-w-0">{line}</span>
                </li>
              ))}
            </ul>
          </div>

          {/* ---------------- Cột bắt đầu ---------------- */}
          <aside className="lg:sticky lg:top-24 lg:self-start">
            <div className="rounded-xl bg-white p-5 ring-1 ring-ink-100 shadow-[0_1px_3px_rgb(120_70_45/0.05)]">
              {session === null ? (
                <>
                  <p className="text-sm font-semibold text-ink-900">Miễn phí 5 lượt cho đề này</p>
                  <p className="mt-1 text-sm text-ink-600">
                    Tạo tài khoản là làm được ngay. Có tài khoản thì bài làm, điểm và học lực của em
                    được lưu lại để so sánh giữa các lượt.
                  </p>
                  <Link
                    href={routes.register(routes.mockExam(intro.slug))}
                    className="press mt-4 block rounded-lg bg-brand-600 px-5 py-3 text-center text-sm font-semibold text-white transition-all hover:bg-brand-700"
                  >
                    Đăng ký miễn phí để làm bài
                  </Link>
                  <Link
                    href={routes.login(routes.mockExam(intro.slug))}
                    className="mt-2 block text-center text-sm font-medium text-brand-700 hover:underline"
                  >
                    Đã có tài khoản? Đăng nhập
                  </Link>
                </>
              ) : (
                <>
                  <p className="text-sm font-semibold text-ink-900">
                    {intro.liveAttemptId
                      ? 'Em đang có một lượt làm dở'
                      : `Còn ${quota?.remaining ?? 0}/${quota?.limit ?? 0} lượt miễn phí`}
                  </p>
                  <p className="mt-1 text-sm text-ink-600">
                    {intro.liveAttemptId
                      ? 'Vào tiếp thì đồng hồ chạy tiếp từ chỗ đang dở, và không tốn thêm lượt nào.'
                      : usedUp
                        ? 'Đăng ký khóa học để luyện tiếp với lộ trình riêng theo đúng chỗ em còn hổng.'
                        : 'Bấm bắt đầu là đồng hồ chạy. Đóng tab giữa chừng vẫn vào lại được đúng lượt đó.'}
                  </p>

                  {usedUp ? (
                    <Link
                      href={routes.courses()}
                      className="press mt-4 block rounded-lg bg-brand-600 px-5 py-3 text-center text-sm font-semibold text-white transition-all hover:bg-brand-700"
                    >
                      Xem các khóa học
                    </Link>
                  ) : (
                    <StartExamButton
                      slug={intro.slug}
                      resuming={intro.liveAttemptId !== null}
                      durationMin={intro.durationMin}
                    />
                  )}
                </>
              )}
            </div>

            {/* ---------------- Các lượt đã làm ---------------- */}
            {intro.history.length > 0 ? (
              <div className="mt-4 rounded-xl bg-white p-5 ring-1 ring-ink-100">
                <p className="text-xs font-semibold tracking-wide text-ink-500 uppercase">
                  Các lượt đã làm
                </p>
                <ul className="mt-3 space-y-2">
                  {intro.history.map((row, index) => (
                    <li key={row.attemptId}>
                      <Link
                        href={routes.mockExamResult(intro.slug, row.attemptId)}
                        className="flex items-center justify-between gap-3 rounded-lg px-3 py-2 text-sm transition-colors hover:bg-ink-50"
                      >
                        <span className="text-ink-600">
                          Lượt {intro.history.length - index}
                          {row.status !== 'DONE' ? (
                            <Badge tone="warn" className="ml-2">
                              chưa chấm xong
                            </Badge>
                          ) : null}
                        </span>
                        <span className="shrink-0 font-semibold tabular-nums text-ink-800">
                          {row.score}/{row.totalPoints}
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </aside>
        </div>

        {!intro.ai.live ? (
          <Alert tone="warn" title="Câu tự luận chưa chấm được" className="mt-8">
            {intro.ai.demo
              ? 'Hệ thống đang ở chế độ thử: điểm tự luận là ĐIỂM MẪU, không phải AI chấm.'
              : 'Chưa gắn khóa AI. Trắc nghiệm và đáp số vẫn chấm đầy đủ; câu tự luận sẽ được ghi "chưa chấm được".'}
          </Alert>
        ) : null}
      </section>
    </SiteShell>
  );
}
