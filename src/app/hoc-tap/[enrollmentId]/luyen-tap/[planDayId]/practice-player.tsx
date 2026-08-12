'use client';

/**
 * TRÌNH LUYỆN TẬP HẰNG NGÀY.
 *
 * Đây là nơi vòng lặp cá nhân hóa hiện ra rõ nhất với học sinh:
 *  - Phản hồi ngay sau mỗi câu theo 6 trường hợp của đặc tả §9.2. Thông điệp do
 *    server quyết định, giao diện chỉ hiển thị đúng những gì nhận được.
 *  - Thấy mastery nhích lên sau mỗi câu — bằng chứng trực quan rằng việc học có
 *    tác dụng.
 *  - Nút "Vì sao em nhận bài này?" mở ra lý do engine đã chọn câu đó, đúng yêu
 *    cầu tạo niềm tin vào cá nhân hóa (§9.1).
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { apiGet, apiPost } from '@/lib/client';
import { API, routes } from '@/lib/routes';
import type {
  AnswerFeedback,
  NextItemView,
  SolutionReveal,
  WhyThisItem,
} from '@/server/learning/service';
import { Alert, Badge, Button, Card, cx, LinkButton } from '@/components/ui';
import { Question } from '@/components/question';
import {
  AnimatedBar,
  CheckMark,
  Collapse,
  CrossMark,
  Skeleton,
  Toast,
  useToast,
} from '@/components/motion';

export function PracticePlayer({
  enrollmentId,
  planDayId,
  dateLabel,
  estimatedMinutes,
}: {
  enrollmentId: string;
  planDayId: string;
  dateLabel: string;
  estimatedMinutes: number;
}) {
  const router = useRouter();
  const { toast, show, hide } = useToast();

  const [item, setItem] = useState<NextItemView | null>(null);
  const [loading, setLoading] = useState(true);
  const [answer, setAnswer] = useState<unknown>(null);
  const [feedback, setFeedback] = useState<AnswerFeedback | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [hint, setHint] = useState<string | null>(null);
  const [solution, setSolution] = useState<SolutionReveal | null>(null);
  const [why, setWhy] = useState<WhyThisItem | null>(null);
  const [showWhy, setShowWhy] = useState(false);
  const [finished, setFinished] = useState(false);
  const [progress, setProgress] = useState({ done: 0, total: 0 });

  const startedAt = useRef<number>(Date.now());
  const viewedSolutionFirst = useRef(false);

  const loadNext = useCallback(async () => {
    setLoading(true);
    setAnswer(null);
    setFeedback(null);
    setHint(null);
    setSolution(null);
    setWhy(null);
    setShowWhy(false);
    viewedSolutionFirst.current = false;

    try {
      const next = await apiGet<NextItemView | null>(API.planDayNext(planDayId));
      if (!next) {
        setFinished(true);
      } else {
        setItem(next);
        setProgress(next.progress);
        startedAt.current = Date.now();
      }
    } catch (err) {
      show(err instanceof Error ? err.message : 'Không tải được câu hỏi.', 'error');
    } finally {
      setLoading(false);
    }
  }, [planDayId, show]);

  useEffect(() => {
    void apiPost(API.planDayStart(planDayId), {}).catch(() => undefined);
    void loadNext();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [planDayId]);

  async function submit() {
    if (!item || submitting) return;
    setSubmitting(true);
    try {
      const result = await apiPost<AnswerFeedback>(API.answer, {
        planDayItemId: item.planDayItemId,
        answer,
        timeMs: Date.now() - startedAt.current,
        hintUsed: hint !== null,
        solutionViewedBeforeAnswer: viewedSolutionFirst.current,
      });
      setFeedback(result);
      setProgress(result.progress);
      if (result.dayCompleted) setFinished(true);
    } catch (err) {
      show(err instanceof Error ? err.message : 'Không gửi được câu trả lời.', 'error');
    } finally {
      setSubmitting(false);
    }
  }

  async function retry() {
    setFeedback(null);
    setAnswer(null);
    startedAt.current = Date.now();
  }

  async function openHint() {
    if (!item) return;
    try {
      const result = await apiPost<{ hint: string | null; message: string }>(
        API.hint(item.planDayItemId),
        {},
      );
      setHint(result.hint ?? result.message);
    } catch (err) {
      show(err instanceof Error ? err.message : 'Chưa lấy được gợi ý.', 'error');
    }
  }

  async function openSolution() {
    if (!item) return;
    if (!feedback) viewedSolutionFirst.current = true;
    try {
      setSolution(await apiPost<SolutionReveal>(API.solution(item.planDayItemId), {}));
    } catch (err) {
      show(err instanceof Error ? err.message : 'Chưa xem được lời giải.', 'error');
    }
  }

  async function openWhy() {
    if (!item) return;
    setShowWhy((v) => !v);
    if (why) return;
    try {
      setWhy(await apiGet<WhyThisItem>(API.whyThisItem(item.planDayItemId)));
    } catch {
      // Không lấy được lý do thì ẩn đi, không làm phiền học sinh.
      setShowWhy(false);
    }
  }

  async function report() {
    if (!item) return;
    const reason = window.prompt('Em thấy câu này có vấn đề gì? (mô tả ngắn)');
    if (!reason || reason.trim().length < 3) return;
    try {
      await apiPost(API.reportItem, { itemId: item.itemId, reason: reason.trim() });
      show('Đã gửi báo lỗi tới đội biên soạn. Cảm ơn em!', 'success');
    } catch (err) {
      show(err instanceof Error ? err.message : 'Không gửi được báo lỗi.', 'error');
    }
  }

  // --- Màn hình hoàn thành -------------------------------------------------

  if (finished) {
    return (
      <div className="mx-auto max-w-xl py-6 text-center">
        <div className="animate-pop mx-auto mb-5 flex h-20 w-20 items-center justify-center rounded-full bg-accent-100 text-4xl">
          🎉
        </div>
        <h1 className="text-2xl font-bold tracking-tight text-ink-900">
          Xong buổi học hôm nay rồi!
        </h1>
        <p className="mt-2 text-ink-600">
          {feedback?.dayMessage ??
            'Hồ sơ năng lực của em vừa được cập nhật. Ngày mai hệ thống sẽ giao bài dựa trên đúng những gì em vừa làm.'}
        </p>

        {feedback ? (
          <Card className="mt-6 text-left">
            <p className="text-sm text-ink-500">Kỹ năng vừa luyện</p>
            <p className="font-semibold text-ink-900">{feedback.skillName}</p>
            <div className="mt-3">
              <div className="mb-1.5 flex items-baseline justify-between text-sm">
                <span className="text-ink-500">Mức thành thạo</span>
                <span className="font-semibold text-ink-800 tabular-nums">
                  {Math.round(feedback.masteryAfter)}/100
                </span>
              </div>
              <AnimatedBar value={feedback.masteryAfter} />
            </div>
          </Card>
        ) : null}

        <div className="mt-7 flex flex-wrap justify-center gap-3">
          <LinkButton href={routes.studyDashboard(enrollmentId)} size="lg">
            Về trang hôm nay
          </LinkButton>
          <LinkButton href={routes.skillMap(enrollmentId)} variant="secondary" size="lg">
            Xem bản đồ kỹ năng
          </LinkButton>
        </div>
        <Toast message={toast.message} tone={toast.tone} onClose={hide} />
      </div>
    );
  }

  // --- Đang tải ------------------------------------------------------------

  if (loading || !item) {
    return (
      <div className="mx-auto max-w-3xl">
        <Skeleton className="mb-4 h-6 w-48" />
        <Card>
          <Skeleton className="mb-3 h-5 w-full" />
          <Skeleton className="mb-6 h-5 w-3/4" />
          <div className="space-y-2.5">
            {[0, 1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-14 w-full" />
            ))}
          </div>
        </Card>
      </div>
    );
  }

  const percent = progress.total > 0 ? (progress.done / progress.total) * 100 : 0;

  return (
    <div className="mx-auto max-w-3xl">
      {/* Thanh trạng thái */}
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Badge tone="brand" dot>
            {item.blockLabel}
          </Badge>
          <span className="text-sm text-ink-500">{item.skillName}</span>
        </div>
        <span className="text-sm text-ink-500 tabular-nums">
          {progress.done}/{progress.total} câu · {dateLabel} · ~{estimatedMinutes} phút
        </span>
      </div>

      <div className="mb-4 h-1.5 w-full overflow-hidden rounded-full bg-ink-100">
        <div
          className="h-full rounded-full bg-brand-600 transition-all duration-500"
          style={{ width: `${percent}%` }}
        />
      </div>

      <p className="mb-4 text-sm text-ink-500">{item.blockDescription}</p>

      {/* Câu hỏi */}
      <Card key={`${item.planDayItemId}-${item.attemptNo}`} className="animate-fade-in">
        {item.isRetry ? (
          <Alert tone="info" className="mb-4">
            Em thử lại câu này lần {item.attemptNo}. Đọc lại đề thật chậm nhé.
          </Alert>
        ) : null}

        <Question
          item={{
            itemId: item.itemId,
            questionType: item.questionType,
            stem: item.stem,
            stemImageUrl: item.stemImageUrl,
            options: item.options,
          }}
          mode={feedback ? 'GRADED' : 'ANSWERING'}
          value={answer}
          onChange={setAnswer}
          showSolution={Boolean(solution)}
          result={
            feedback
              ? {
                  isCorrect: feedback.isCorrect,
                  correctAnswer: feedback.correctAnswer,
                  solution: solution?.solution ?? feedback.solution ?? undefined,
                  solutionSteps: solution?.solutionSteps ?? feedback.solutionSteps,
                }
              : solution
                ? { isCorrect: false, solution: solution.solution, solutionSteps: solution.solutionSteps }
                : null
          }
        />

        {hint && !feedback ? (
          <Alert tone="info" className="mt-4" title="Gợi ý">
            {hint}
          </Alert>
        ) : null}
      </Card>

      {/* Phản hồi sau khi trả lời */}
      {feedback ? (
        <Card
          className={cx(
            'animate-fade-up mt-4',
            feedback.isCorrect ? 'ring-accent-200' : 'ring-amber-200',
          )}
        >
          <div className="flex items-start gap-4">
            {feedback.isCorrect ? <CheckMark /> : <CrossMark />}
            <div className="min-w-0 flex-1">
              <p className="font-semibold text-ink-900">{feedback.outcomeLabel}</p>
              <p className="mt-1 text-sm text-ink-600">{feedback.message}</p>

              {feedback.nextStepHint ? (
                <p className="mt-2 text-sm font-medium text-brand-700">{feedback.nextStepHint}</p>
              ) : null}

              {feedback.prerequisites.length > 0 ? (
                <Alert tone="warn" className="mt-3">
                  Nên vá phần nền trước:{' '}
                  {feedback.prerequisites.map((p) => p.skillName).join(', ')}.
                </Alert>
              ) : null}

              {/* Mastery trước → sau */}
              <div className="mt-4">
                <div className="mb-1.5 flex items-baseline justify-between text-sm">
                  <span className="text-ink-500">
                    Mức thành thạo {feedback.skillName}
                  </span>
                  <span className="font-semibold tabular-nums">
                    <span className="text-ink-400">{Math.round(feedback.masteryBefore)}</span>
                    <span className="mx-1 text-ink-300">→</span>
                    <span className="text-ink-900">{Math.round(feedback.masteryAfter)}</span>
                    {feedback.delta !== 0 ? (
                      <span
                        className={cx(
                          'ml-2 text-xs',
                          feedback.delta > 0 ? 'text-accent-700' : 'text-rose-600',
                        )}
                      >
                        {feedback.delta > 0 ? '+' : ''}
                        {Math.round(feedback.delta)}
                      </span>
                    ) : null}
                  </span>
                </div>
                <AnimatedBar value={feedback.masteryAfter} />
              </div>

              {!feedback.countsAsMastered ? (
                <p className="mt-2 text-xs text-ink-500">
                  Câu này chưa được tính là đã thành thạo vì em đã xem lời giải trước khi trả lời.
                </p>
              ) : null}
            </div>
          </div>

          <div className="mt-5 flex flex-wrap gap-2.5">
            {feedback.canRetry ? (
              <Button variant="secondary" onClick={retry}>
                Thử lại ({feedback.retriesLeft} lượt)
              </Button>
            ) : null}
            {(feedback.shouldShowSolution || !feedback.isCorrect) && !solution ? (
              <Button variant="secondary" onClick={openSolution}>
                Xem lời giải
              </Button>
            ) : null}
            <Button onClick={loadNext} className="ml-auto">
              Câu tiếp theo →
            </Button>
          </div>
        </Card>
      ) : (
        <div className="mt-4 flex flex-wrap items-center gap-2.5">
          {item.hintAvailable && !hint ? (
            <Button variant="ghost" onClick={openHint}>
              Gợi ý
            </Button>
          ) : null}
          <Button variant="ghost" onClick={openSolution}>
            Xem lời giải
          </Button>
          <Button
            size="lg"
            className="ml-auto"
            onClick={submit}
            loading={submitting}
            disabled={answer === null || answer === '' || (Array.isArray(answer) && answer.length === 0)}
          >
            Trả lời
          </Button>
        </div>
      )}

      {/* Vì sao em nhận bài này */}
      <div className="mt-6">
        <button
          type="button"
          onClick={openWhy}
          className="link-underline text-sm font-medium text-brand-700"
        >
          Vì sao em nhận bài này?
        </button>
        <Collapse open={showWhy}>
          <div className="mt-3 rounded-xl bg-brand-50 p-4 ring-1 ring-brand-100">
            {why ? (
              <>
                <p className="text-sm text-ink-700">{why.reason}</p>
                {why.details.length > 0 ? (
                  <ul className="mt-2 list-inside list-disc space-y-1 text-sm text-ink-600">
                    {why.details.map((d) => (
                      <li key={d}>{d}</li>
                    ))}
                  </ul>
                ) : null}
                <p className="mt-2 text-xs text-ink-500">
                  Khối {why.blockLabel} · {why.skillName} · mức hiện tại{' '}
                  {Math.round(why.masteryScore)}/100 ({why.tierLabel})
                </p>
              </>
            ) : (
              <Skeleton className="h-10 w-full" />
            )}
          </div>
        </Collapse>
      </div>

      <div className="mt-8 text-center">
        <button
          type="button"
          onClick={report}
          className="text-xs text-ink-400 transition-colors hover:text-rose-600"
        >
          Báo lỗi câu hỏi này
        </button>
      </div>

      <Toast message={toast.message} tone={toast.tone} onClose={hide} />
    </div>
  );
}
