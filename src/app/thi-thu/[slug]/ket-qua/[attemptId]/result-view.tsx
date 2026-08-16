'use client';

/**
 * TRANG KẾT QUẢ.
 *
 * Mục tiêu: học sinh (và phụ huynh) hiểu được VÌ SAO mất điểm, không chỉ biết
 * mất bao nhiêu. Nên mỗi câu tự luận hiện đủ bốn thứ theo thứ tự:
 *   ảnh bài làm → AI đọc được gì → bảng barem mất điểm ở tiêu chí nào → lời giải mẫu.
 *
 * Transcript đặt TRƯỚC bảng điểm là có chủ ý: nếu AI đọc sai chữ, học sinh phát
 * hiện ngay ở dòng đầu tiên chứ không phải sau khi đã bực mình vì điểm thấp —
 * và có sẵn nút bắt AI đọc lại.
 */
import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { apiPatch, apiPost, ApiClientError } from '@/lib/client';
import { API, routes } from '@/lib/routes';
import type { AttemptResult, ResultAnswer } from '@/server/mock-exam/service';
import type { ResultAdvice } from '@/server/mock-exam/advice';
import { Alert, Badge, Button, Card, ProgressBar, cx } from '@/components/ui';
import { RichText } from '@/components/rich-text';
import { AdvicePanel } from './advice-panel';

function scoreTone(ratio: number): 'success' | 'warn' | 'danger' {
  if (ratio >= 0.7) return 'success';
  if (ratio >= 0.4) return 'warn';
  return 'danger';
}

export function ResultView({
  result,
  advice = null,
}: {
  result: AttemptResult;
  /**
   * Xếp học lực + đề xuất khóa học. Để tùy chọn vì cùng một component này còn
   * dùng lại ở màn chấm bài của giáo viên và quản trị.
   */
  advice?: ResultAdvice | null;
}) {
  const router = useRouter();
  const [busyQuestion, setBusyQuestion] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [openNumber, setOpenNumber] = useState<number | null>(null);
  const [finishing, setFinishing] = useState(false);

  /**
   * CHẤM NỐT NHỮNG CÂU CÒN BỎ LỬNG.
   *
   * Việc chấm chạy từ tab đang nộp bài. Đóng tab giữa chừng, rớt mạng, hoặc nhà
   * cung cấp AI chặn vì quá hạn mức tốc độ — những câu còn lại nằm im MÃI MÃI,
   * và vì bài chưa chấm xong nên trang này không xếp học lực. Người dùng mở lại
   * bao nhiêu lần cũng chỉ thấy đúng một dòng "chưa xếp được học lực", không có
   * cách nào thoát ra ngoài việc bấm tay từng câu một.
   *
   * PHẢI GOM CẢ HAI TRẠNG THÁI. Lần trước chỗ này chỉ nhặt câu PENDING, mà khi
   * bị 429 thì câu rơi vào FAILED — tức là đúng những câu cần chấm lại nhất thì
   * không được chấm lại. Đó chính là bốn câu treo trên bản chạy thật.
   */
  const unfinished = result.answers
    .filter((answer) => answer.status === 'PENDING' || answer.status === 'FAILED')
    .map((answer) => answer.questionId);
  const unfinishedKey = unfinished.join(',');
  const attemptedRef = useRef(new Set<string>());

  useEffect(() => {
    if (unfinishedKey === '') return;
    const todo = unfinishedKey.split(',').filter((id) => !attemptedRef.current.has(id));
    if (todo.length === 0) return;

    todo.forEach((id) => attemptedRef.current.add(id));
    setFinishing(true);

    void (async () => {
      let changed = false;
      for (const questionId of todo) {
        try {
          await apiPost(API.mockGrade(result.id), { questionId });
          changed = true;
        } catch {
          // Câu nào vẫn không xong thì để lại nút bấm tay ở câu đó.
        }
      }
      setFinishing(false);
      if (changed) router.refresh();
    })();
  }, [unfinishedKey, result.id, router]);

  const ratio = result.totalPoints > 0 ? result.score / result.totalPoints : 0;
  const tone = scoreTone(ratio);

  async function regrade(answer: ResultAnswer, rereadImages: boolean): Promise<void> {
    setBusyQuestion(answer.questionId);
    setError(null);
    try {
      await apiPost(API.mockGrade(result.id, rereadImages), { questionId: answer.questionId });
      router.refresh();
    } catch (caught) {
      setError(
        caught instanceof ApiClientError ? caught.message : 'Chấm lại không thành công.',
      );
    } finally {
      setBusyQuestion(null);
    }
  }

  return (
    <div className="mx-auto w-full max-w-4xl px-4 py-8">
      {/* ---------------- Điểm tổng ---------------- */}
      <Card className="text-center">
        <p className="text-sm text-ink-500">{result.examTitle}</p>

        <p
          className={cx(
            'mt-2 text-5xl font-bold tabular-nums',
            tone === 'success'
              ? 'text-accent-700'
              : tone === 'warn'
                ? 'text-amber-600'
                : 'text-rose-600',
          )}
        >
          {result.score}
          <span className="text-2xl text-ink-400"> / {result.totalPoints}</span>
        </p>

        <div className="mx-auto mt-4 max-w-md">
          <ProgressBar
            value={result.score}
            max={result.totalPoints}
            color={
              tone === 'success' ? 'bg-accent-600' : tone === 'warn' ? 'bg-amber-500' : 'bg-rose-500'
            }
          />
        </div>

        <ul className="mt-5 flex flex-wrap justify-center gap-2">
          {result.breakdown.map((part) => (
            <li key={part.part}>
              <Badge tone="neutral">
                {part.label} {part.awarded}/{part.total}
              </Badge>
            </li>
          ))}
        </ul>

        {result.finalScore !== null ? (
          <p className="mt-3 text-xs text-ink-500">
            Điểm đã được giáo viên xem lại (máy chấm: {result.autoScore}).
          </p>
        ) : null}
      </Card>

      {/* ---------------- Cảnh báo trạng thái ---------------- */}
      {!result.ai.live ? (
        <Alert tone="warn" title={result.ai.demo ? 'Chế độ thử' : 'Chưa gắn khóa AI'} className="mt-4">
          {result.ai.demo
            ? 'Điểm các câu tự luận trên đây là ĐIỂM MẪU do chế độ thử sinh ra, không phải AI chấm.'
            : 'Các câu tự luận chưa được chấm. Gắn GROQ_API_KEY hoặc OPENAI_API_KEY vào biến môi trường rồi bấm "Chấm lại câu này" ở từng câu.'}
        </Alert>
      ) : null}

      {result.failedCount > 0 ? (
        <Alert tone={finishing ? 'info' : 'danger'} className="mt-4">
          {finishing
            ? `Đang chấm lại ${result.failedCount} câu chưa xong. Cứ để trang mở — chấm nốt là điểm và học lực hiện ra.`
            : `Có ${result.failedCount} câu chấm chưa xong. Bấm “Chấm lại câu này” ở câu đó — các câu khác vẫn giữ nguyên điểm.`}
        </Alert>
      ) : null}

      {result.pendingCount > 0 ? (
        <Alert tone="info" className="mt-4">
          {finishing
            ? `Đang chấm nốt ${result.pendingCount} câu còn lại. Cứ để trang mở, xong là điểm và học lực hiện ra.`
            : `Còn ${result.pendingCount} câu chưa được chấm. Mở câu đó ra rồi bấm “Chấm lại câu này”.`}
        </Alert>
      ) : null}

      {result.solutionLock?.locked ? (
        <Alert tone="info" title="Đáp án và lời giải mẫu đang khóa" className="mt-4">
          Em còn {result.solutionLock.remaining} lượt thi đề này, nên đáp án đúng và lời giải mẫu
          chưa mở — mở ra bây giờ thì những lượt còn lại không còn ý nghĩa. Điểm từng câu, barem chấm
          và nhận xét thì em xem được đầy đủ ngay bên dưới.
        </Alert>
      ) : null}

      {error ? (
        <Alert tone="danger" className="mt-4">
          {error}
        </Alert>
      ) : null}

      {/* ---------------- Học lực + học tiếp gì ---------------- */}
      {advice ? <AdvicePanel advice={advice} /> : null}

      {/* ---------------- Từng câu ---------------- */}
      <div className="mt-6 space-y-3">
        {result.answers.map((answer) => (
          <AnswerCard
            key={answer.id}
            answer={answer}
            attemptId={result.id}
            open={openNumber === answer.number}
            canOverride={result.canOverride}
            busy={busyQuestion === answer.questionId}
            onToggle={() => setOpenNumber(openNumber === answer.number ? null : answer.number)}
            onRegrade={(reread) => void regrade(answer, reread)}
            onSaved={() => router.refresh()}
          />
        ))}
      </div>

      <div className="mt-8 flex flex-wrap justify-center gap-3">
        <Link
          href={routes.mockExam(result.examSlug)}
          className="press rounded-lg bg-brand-600 px-5 py-2.5 text-sm font-semibold text-white transition-all hover:bg-brand-700"
        >
          Làm lại đề này
        </Link>
        <Link
          href={routes.mockExams()}
          className="press rounded-lg bg-white px-5 py-2.5 text-sm font-semibold text-ink-700 ring-1 ring-ink-200 transition-all hover:bg-ink-50"
        >
          Xem các đề khác
        </Link>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------

function AnswerCard({
  answer,
  attemptId,
  open,
  canOverride,
  busy,
  onToggle,
  onRegrade,
  onSaved,
}: {
  answer: ResultAnswer;
  attemptId: string;
  open: boolean;
  canOverride: boolean;
  busy: boolean;
  onToggle: () => void;
  onRegrade: (rereadImages: boolean) => void;
  onSaved: () => void;
}) {
  const failed = answer.status === 'FAILED';
  const pending = answer.status === 'PENDING';
  const awarded = answer.awarded ?? 0;
  const full = !failed && !pending && awarded >= answer.maxPoints - 1e-9;
  const zero = !failed && !pending && awarded <= 1e-9;

  return (
    <Card padded={false} className="overflow-hidden">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className="flex w-full items-center gap-3 px-5 py-4 text-left transition-colors hover:bg-ink-50/70"
      >
        <span
          aria-hidden
          className={cx(
            'flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-sm font-bold',
            failed || pending
              ? 'bg-ink-100 text-ink-500'
              : full
                ? 'bg-accent-100 text-accent-700'
                : zero
                  ? 'bg-rose-100 text-rose-700'
                  : 'bg-amber-100 text-amber-700',
          )}
        >
          {answer.number}
        </span>

        <span className="min-w-0 flex-1">
          <span className="block text-sm font-semibold text-ink-900">
            Câu {answer.number}
            <span className="ml-2 font-normal text-ink-500">
              {failed ? 'chưa chấm được' : pending ? 'đang chờ chấm' : `${awarded}/${answer.maxPoints} điểm`}
            </span>
          </span>
          {answer.feedbackVi && !open ? (
            <span className="mt-0.5 block truncate text-sm text-ink-500">{answer.feedbackVi}</span>
          ) : null}
        </span>

        <span className="flex shrink-0 items-center gap-2">
          {answer.needsReview ? <Badge tone="warn">⚠ cần xem lại</Badge> : null}
          {answer.overridden ? <Badge tone="info">giáo viên sửa</Badge> : null}
          <span aria-hidden className="text-ink-400">
            {open ? '▲' : '▼'}
          </span>
        </span>
      </button>

      {open ? (
        <div className="animate-fade-down border-t border-ink-100 px-5 py-5">
          <RichText className="text-sm text-ink-700">{answer.promptMd}</RichText>

          {answer.options.length > 0 ? (
            <ul className="mt-3 space-y-1 text-sm">
              {answer.options.map((option, index) => {
                const key = ['A', 'B', 'C', 'D', 'E', 'F'][index] ?? String(index + 1);
                const chosen = answer.answerText === key;
                const correct = answer.answerKeyDisplay === key;
                return (
                  <li
                    key={key}
                    className={cx(
                      'rounded-lg px-3 py-1.5',
                      correct
                        ? 'bg-accent-50 text-accent-700'
                        : chosen
                          ? 'bg-rose-50 text-rose-700'
                          : 'text-ink-600',
                    )}
                  >
                    <strong className="mr-2">{key}.</strong>
                    {option}
                    {correct ? ' — đáp án đúng' : chosen ? ' — em đã chọn' : ''}
                  </li>
                );
              })}
            </ul>
          ) : null}

          {/* --- Bài làm của em --- */}
          <section className="mt-4">
            <h3 className="text-xs font-semibold tracking-wide text-ink-500 uppercase">
              Bài làm của em
            </h3>

            {answer.imageUrls.length > 0 ? (
              <div className="mt-2 flex flex-wrap gap-2">
                {answer.imageUrls.map((url) => (
                  // eslint-disable-next-line @next/next/no-img-element
                  <a key={url} href={url} target="_blank" rel="noreferrer">
                    <img
                      src={url}
                      alt="Ảnh bài làm"
                      className="h-40 w-auto rounded-lg ring-1 ring-ink-200"
                    />
                  </a>
                ))}
              </div>
            ) : null}

            {answer.answerText && answer.options.length === 0 ? (
              <p className="mt-2 rounded-lg bg-ink-50 px-3 py-2 text-sm whitespace-pre-wrap text-ink-800">
                {answer.answerText}
              </p>
            ) : null}

            {answer.answerGrid ? <GridPreview grid={answer.answerGrid} /> : null}

            {!answer.answerText && answer.imageUrls.length === 0 && !answer.answerGrid ? (
              <p className="mt-2 text-sm text-ink-400">Em bỏ trống câu này.</p>
            ) : null}
          </section>

          {/* --- AI đọc được gì --- */}
          {answer.transcriptMd ? (
            <section className="mt-4">
              <h3 className="text-xs font-semibold tracking-wide text-ink-500 uppercase">
                AI đọc được từ ảnh
              </h3>
              <div className="mt-2 rounded-lg bg-ink-50 px-3 py-2 text-sm text-ink-700 ring-1 ring-ink-100">
                <RichText>{answer.transcriptMd}</RichText>
              </div>
              {answer.imageUrls.length > 0 ? (
                <Button
                  variant="ghost"
                  size="sm"
                  className="mt-1"
                  loading={busy}
                  onClick={() => onRegrade(true)}
                >
                  AI đọc sai chữ của em? Bấm để đọc lại ảnh
                </Button>
              ) : null}
            </section>
          ) : null}

          {/* --- Barem --- */}
          {answer.criteria.length > 0 ? (
            <section className="mt-4">
              <h3 className="text-xs font-semibold tracking-wide text-ink-500 uppercase">
                Barem chấm
              </h3>
              <ul className="mt-2 space-y-2">
                {answer.criteria.map((criterion) => {
                  const rubric = answer.rubric.find((item) => item.code === criterion.code);
                  const gotAll = criterion.awarded >= criterion.points - 1e-9;
                  return (
                    <li
                      key={criterion.code}
                      className={cx(
                        'rounded-lg px-3 py-2 text-sm ring-1 ring-inset',
                        gotAll
                          ? 'bg-accent-50/60 ring-accent-100'
                          : criterion.awarded > 0
                            ? 'bg-amber-50/60 ring-amber-100'
                            : 'bg-rose-50/50 ring-rose-100',
                      )}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <p className="min-w-0 font-medium text-ink-800">
                          {rubric?.description ?? criterion.code}
                        </p>
                        <span className="shrink-0 font-bold tabular-nums text-ink-700">
                          {criterion.awarded}/{criterion.points}
                        </span>
                      </div>
                      {criterion.reason ? (
                        <p className="mt-1 text-ink-600">{criterion.reason}</p>
                      ) : null}
                      {criterion.evidence && criterion.evidence !== 'không tìm thấy' ? (
                        <p className="mt-1 border-l-2 border-ink-300 pl-2 text-ink-500 italic">
                          “{criterion.evidence}”
                        </p>
                      ) : null}
                    </li>
                  );
                })}
              </ul>
            </section>
          ) : null}

          {/* --- Nhận xét --- */}
          {answer.feedbackVi ? (
            <p className="mt-4 rounded-lg bg-brand-50/70 px-3 py-2.5 text-sm text-brand-900">
              {answer.feedbackVi}
            </p>
          ) : null}

          {answer.gradeDetail?.reason ? (
            <p className="mt-3 text-sm text-ink-600">{String(answer.gradeDetail.reason)}</p>
          ) : null}

          {answer.answerKeyDisplay && answer.options.length === 0 ? (
            <p className="mt-3 text-sm text-ink-700">
              Đáp án đúng: <strong>{answer.answerKeyDisplay}</strong>
            </p>
          ) : null}

          {/* --- Lỗi chấm --- */}
          {answer.errorMsg ? (
            <Alert tone="danger" className="mt-3">
              {answer.errorMsg}
            </Alert>
          ) : null}

          {answer.status === 'FAILED' || answer.status === 'PENDING' ? (
            <Button className="mt-3" loading={busy} onClick={() => onRegrade(false)}>
              Chấm lại câu này
            </Button>
          ) : null}

          {/* --- Lời giải mẫu --- */}
          {answer.solutionMd ? (
            <details className="mt-4 rounded-lg bg-ink-50 px-3 py-2 ring-1 ring-ink-100">
              <summary className="cursor-pointer text-sm font-semibold text-ink-700">
                Xem lời giải mẫu
              </summary>
              <RichText className="mt-2 text-sm text-ink-700">{answer.solutionMd}</RichText>
            </details>
          ) : null}

          {canOverride ? (
            <OverrideBox answer={answer} attemptId={attemptId} onSaved={onSaved} />
          ) : null}
        </div>
      ) : null}
    </Card>
  );
}

function GridPreview({ grid }: { grid: (string | null)[][] }) {
  return (
    <div
      className="mt-2 inline-grid gap-1 rounded-lg bg-ink-100 p-1"
      style={{ gridTemplateColumns: `repeat(${grid[0]?.length ?? 4}, minmax(0, 1fr))` }}
    >
      {grid.map((row, rowIndex) =>
        row.map((cell, colIndex) => (
          <span
            key={`${rowIndex}-${colIndex}`}
            className="flex h-10 w-10 items-center justify-center rounded bg-white text-lg font-bold text-ink-700"
          >
            {cell ?? '·'}
          </span>
        )),
      )}
    </div>
  );
}

/** Ô sửa điểm — chỉ hiện với giáo viên và quản trị. */
function OverrideBox({
  answer,
  attemptId,
  onSaved,
}: {
  answer: ResultAnswer;
  attemptId: string;
  onSaved: () => void;
}) {
  const [awarded, setAwarded] = useState(String(answer.awarded ?? 0));
  const [feedback, setFeedback] = useState(answer.feedbackVi ?? '');
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function save(): Promise<void> {
    setSaving(true);
    setMessage(null);
    try {
      await apiPatch(API.mockAnswer(attemptId, answer.id), {
        awarded: Number(awarded.replace(',', '.')),
        feedbackVi: feedback.trim() === '' ? null : feedback.trim(),
      });
      setMessage('Đã lưu điểm mới.');
      onSaved();
    } catch (error) {
      setMessage(error instanceof ApiClientError ? error.message : 'Lưu điểm thất bại.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mt-5 rounded-xl bg-navy-50 p-4 ring-1 ring-navy-100">
      <p className="text-xs font-semibold tracking-wide text-navy-700 uppercase">
        Giáo viên sửa điểm
      </p>
      <div className="mt-2 flex flex-wrap items-end gap-3">
        <label className="text-sm text-navy-800">
          Điểm (tối đa {answer.maxPoints})
          <input
            value={awarded}
            onChange={(event) => setAwarded(event.target.value)}
            inputMode="decimal"
            className="mt-1 block w-28 rounded-lg border border-navy-200 bg-white px-3 py-2 text-sm font-semibold tabular-nums focus:border-brand-500 focus:ring-4 focus:ring-brand-100 focus:outline-none"
          />
        </label>
        <label className="min-w-56 flex-1 text-sm text-navy-800">
          Nhận xét gửi học sinh
          <input
            value={feedback}
            onChange={(event) => setFeedback(event.target.value)}
            className="mt-1 block w-full rounded-lg border border-navy-200 bg-white px-3 py-2 text-sm focus:border-brand-500 focus:ring-4 focus:ring-brand-100 focus:outline-none"
          />
        </label>
        <Button size="sm" loading={saving} onClick={() => void save()}>
          Lưu
        </Button>
      </div>
      {message ? <p className="mt-2 text-sm text-navy-700">{message}</p> : null}
    </div>
  );
}
