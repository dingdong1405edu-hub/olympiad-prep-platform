'use client';

/**
 * TRÌNH LÀM BÀI.
 *
 * Hai yêu cầu bắt buộc của đặc tả được hiện thực ở đây:
 *  1. AUTOSAVE (§19.2 #7) — lưu sau mỗi thay đổi và mỗi lần chuyển câu. Mất mạng
 *     ngắn hay bấm F5 đều phải khôi phục đúng chỗ đang dở. Trạng thái lưu hiển
 *     thị công khai để học sinh yên tâm.
 *  2. KHÔNG LỘ ĐÁP ÁN — dữ liệu server gửi xuống vốn đã không có đáp án và lời
 *     giải, nên không có gì để lộ ở phía client.
 *
 * Thời gian làm từng câu được đo bằng mốc thời điểm chuyển câu, không phải bằng
 * bộ đếm chạy nền, để tab bị ẩn không làm sai số liệu.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { apiPatch, apiPost } from '@/lib/client';
import { API, routes } from '@/lib/routes';
import type { AttemptSession } from '@/server/assessment/service';
import { Alert, Button, Card, cx } from '@/components/ui';
import { Question, type QuestionView } from '@/components/question';
import { Spinner, Toast, useToast } from '@/components/motion';

type SaveState = 'IDLE' | 'SAVING' | 'SAVED' | 'ERROR';

const AUTOSAVE_DELAY_MS = 900;

export function AttemptPlayer({
  enrollmentId,
  attempt,
}: {
  enrollmentId: string;
  attempt: AttemptSession;
}) {
  const router = useRouter();
  const { toast, show, hide } = useToast();

  const [index, setIndex] = useState(() => {
    const firstUnanswered = attempt.items.findIndex((item) => !item.answered);
    return firstUnanswered === -1 ? 0 : firstUnanswered;
  });
  const [answers, setAnswers] = useState<Record<string, unknown>>(() =>
    Object.fromEntries(attempt.items.map((item) => [item.itemAttemptId, item.answer ?? null])),
  );
  const [times, setTimes] = useState<Record<string, number>>(() =>
    Object.fromEntries(attempt.items.map((item) => [item.itemAttemptId, item.timeMs ?? 0])),
  );
  const [saveState, setSaveState] = useState<SaveState>('IDLE');
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [remaining, setRemaining] = useState<number | null>(attempt.remainingSeconds);

  const enteredAt = useRef<number>(Date.now());
  const dirty = useRef<Set<string>>(new Set());
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const total = attempt.items.length;
  const current = attempt.items[index]!;
  const answeredCount = attempt.items.filter(
    (item) => answers[item.itemAttemptId] !== null && answers[item.itemAttemptId] !== '',
  ).length;

  // --- Autosave ------------------------------------------------------------

  const flush = useCallback(async () => {
    if (dirty.current.size === 0) return;
    const ids = [...dirty.current];
    dirty.current.clear();

    setSaveState('SAVING');
    try {
      await apiPatch(API.attemptAutosave(attempt.attemptId), {
        answers: ids.map((id) => ({
          itemAttemptId: id,
          answer: answers[id] ?? null,
          timeMs: times[id] ?? 0,
        })),
      });
      setSaveState('SAVED');
      setSavedAt(
        new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }),
      );
    } catch {
      // Lưu hỏng thì trả các câu về hàng đợi để lần sau thử lại — không mất bài.
      ids.forEach((id) => dirty.current.add(id));
      setSaveState('ERROR');
    }
  }, [answers, times, attempt.attemptId]);

  function markDirty(itemAttemptId: string) {
    dirty.current.add(itemAttemptId);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => void flush(), AUTOSAVE_DELAY_MS);
  }

  function recordTime() {
    const spent = Date.now() - enteredAt.current;
    enteredAt.current = Date.now();
    setTimes((prev) => ({
      ...prev,
      [current.itemAttemptId]: (prev[current.itemAttemptId] ?? 0) + spent,
    }));
    dirty.current.add(current.itemAttemptId);
  }

  function goTo(next: number) {
    if (next < 0 || next >= total || next === index) return;
    recordTime();
    void flush();
    setIndex(next);
  }

  function setAnswer(value: unknown) {
    setAnswers((prev) => ({ ...prev, [current.itemAttemptId]: value }));
    markDirty(current.itemAttemptId);
  }

  // Lưu nốt khi rời trang — chống mất bài lúc đóng tab đột ngột.
  useEffect(() => {
    const onHide = () => {
      if (dirty.current.size > 0) void flush();
    };
    window.addEventListener('pagehide', onHide);
    document.addEventListener('visibilitychange', onHide);
    return () => {
      window.removeEventListener('pagehide', onHide);
      document.removeEventListener('visibilitychange', onHide);
    };
  }, [flush]);

  // --- Đồng hồ đếm ngược (chỉ khi bài có giới hạn thời gian) ----------------

  useEffect(() => {
    if (remaining === null) return;
    if (remaining <= 0) {
      void handleSubmit();
      return;
    }
    const id = setTimeout(() => setRemaining((v) => (v === null ? null : v - 1)), 1000);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [remaining]);

  // --- Nộp bài -------------------------------------------------------------

  async function handleSubmit() {
    if (submitting) return;
    setSubmitting(true);
    recordTime();
    try {
      await flush();
      await apiPost(API.attemptSubmit(attempt.attemptId), {});
      router.push(routes.attemptResult(enrollmentId, attempt.attemptId));
      router.refresh();
    } catch (err) {
      show(err instanceof Error ? err.message : 'Không nộp được bài.', 'error');
      setSubmitting(false);
      setConfirming(false);
    }
  }

  const view: QuestionView = {
    itemId: current.itemId,
    questionType: current.questionType,
    stem: current.stem,
    stemImageUrl: current.stemImageUrl,
    options: current.options,
    difficultyLabel: current.difficultyLabel,
  };

  return (
    <div className="mx-auto max-w-3xl">
      {/* Thanh trạng thái */}
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-ink-900">
            Câu {index + 1} / {total}
          </p>
          <p className="text-xs text-ink-500">
            Đã trả lời {answeredCount}/{total}
          </p>
        </div>

        <div className="flex items-center gap-3 text-xs">
          {remaining !== null ? (
            <span
              className={cx(
                'rounded-md px-2 py-1 font-semibold tabular-nums',
                remaining < 120 ? 'bg-rose-50 text-rose-700' : 'bg-ink-100 text-ink-600',
              )}
            >
              Còn {Math.floor(remaining / 60)}:{String(remaining % 60).padStart(2, '0')}
            </span>
          ) : null}
          <SaveIndicator state={saveState} savedAt={savedAt} />
        </div>
      </div>

      <div className="mb-4 h-1.5 w-full overflow-hidden rounded-full bg-ink-100">
        <div
          className="h-full rounded-full bg-brand-600 transition-all duration-500"
          style={{ width: `${((index + 1) / total) * 100}%` }}
        />
      </div>

      {attempt.resumed ? (
        <Alert tone="info" className="mb-4">
          Bài của em đã được khôi phục đúng chỗ đang làm dở.
        </Alert>
      ) : null}

      {/* Câu hỏi */}
      <Card key={current.itemAttemptId} className="animate-fade-in">
        <Question
          item={view}
          mode="ANSWERING"
          value={answers[current.itemAttemptId] ?? null}
          onChange={setAnswer}
        />
      </Card>

      {/* Điều hướng */}
      <div className="mt-5 flex items-center justify-between gap-3">
        <Button variant="secondary" onClick={() => goTo(index - 1)} disabled={index === 0}>
          ← Câu trước
        </Button>

        {index < total - 1 ? (
          <Button onClick={() => goTo(index + 1)}>Câu tiếp →</Button>
        ) : (
          <Button variant="success" onClick={() => setConfirming(true)}>
            Nộp bài
          </Button>
        )}
      </div>

      {/* Lưới số câu */}
      <div className="mt-7">
        <p className="mb-2 text-xs font-medium tracking-wide text-ink-500 uppercase">
          Chuyển nhanh tới câu
        </p>
        <div className="flex flex-wrap gap-2">
          {attempt.items.map((item, i) => {
            const done =
              answers[item.itemAttemptId] !== null && answers[item.itemAttemptId] !== '';
            return (
              <button
                key={item.itemAttemptId}
                type="button"
                onClick={() => goTo(i)}
                aria-current={i === index ? 'true' : undefined}
                aria-label={`Câu ${i + 1}${done ? ', đã trả lời' : ', chưa trả lời'}`}
                className={cx(
                  'press h-9 w-9 rounded-lg text-sm font-semibold transition-all duration-200',
                  i === index
                    ? 'bg-brand-600 text-white ring-2 ring-brand-200 ring-offset-2'
                    : done
                      ? 'bg-brand-50 text-brand-700 ring-1 ring-brand-200'
                      : 'bg-white text-ink-500 ring-1 ring-ink-200 hover:ring-ink-300',
                )}
              >
                {i + 1}
              </button>
            );
          })}
        </div>
      </div>

      <div className="mt-8 flex justify-center">
        <Button variant="ghost" onClick={() => setConfirming(true)}>
          Nộp bài ngay
        </Button>
      </div>

      {/* Hộp xác nhận nộp bài */}
      {confirming ? (
        <div className="fixed inset-0 z-40 flex items-end justify-center bg-ink-900/40 p-4 sm:items-center">
          <div className="animate-scale-in w-full max-w-md rounded-2xl bg-white p-6 shadow-[0_12px_28px_rgb(120_70_45/0.2)]">
            <h2 className="text-lg font-bold text-ink-900">Nộp bài kiểm tra?</h2>
            {answeredCount < total ? (
              <Alert tone="warn" className="mt-3">
                Em còn <strong>{total - answeredCount} câu</strong> chưa trả lời. Câu bỏ trống được
                tính là chưa làm được — điều đó cũng giúp hệ thống biết em còn yếu chỗ nào.
              </Alert>
            ) : (
              <p className="mt-2 text-sm text-ink-600">
                Em đã trả lời đủ {total} câu. Sau khi nộp, em sẽ thấy ngay mình mạnh ở đâu và cần
                sửa gì trước.
              </p>
            )}

            <div className="mt-6 flex gap-3">
              <Button
                variant="secondary"
                className="flex-1"
                onClick={() => setConfirming(false)}
                disabled={submitting}
              >
                Quay lại làm tiếp
              </Button>
              <Button variant="success" className="flex-1" onClick={handleSubmit} loading={submitting}>
                {submitting ? 'Đang chấm…' : 'Nộp bài'}
              </Button>
            </div>
          </div>
        </div>
      ) : null}

      <Toast message={toast.message} tone={toast.tone} onClose={hide} />
    </div>
  );
}

function SaveIndicator({ state, savedAt }: { state: SaveState; savedAt: string | null }) {
  if (state === 'SAVING') {
    return (
      <span className="flex items-center gap-1.5 text-ink-500">
        <Spinner className="h-3.5 w-3.5" />
        Đang lưu…
      </span>
    );
  }
  if (state === 'ERROR') {
    return (
      <span className="rounded-md bg-amber-50 px-2 py-1 font-medium text-amber-700">
        Chưa lưu được — sẽ tự thử lại
      </span>
    );
  }
  if (state === 'SAVED' && savedAt) {
    return <span className="text-ink-500">Đã lưu lúc {savedAt}</span>;
  }
  return <span className="text-ink-400">Bài được lưu tự động</span>;
}
