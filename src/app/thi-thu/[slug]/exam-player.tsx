'use client';

/**
 * MÀN HÌNH LÀM BÀI THI THỬ — MỘT LƯỢT THI CỤ THỂ.
 *
 * Trang này luôn thuộc về đúng một lượt thi đã tồn tại ở máy chủ
 * (`/thi-thu/<đề>/lam-bai/<id lượt>`). Đó là điều làm nó chạy được như một kỳ
 * thi online thật:
 *
 *  1. ĐỀ SẠCH MỖI LƯỢT. Bài làm nạp từ chính lượt thi này, không phải từ một
 *     bản nháp chung của cả cái đề. Trước đây bản nháp chỉ khóa theo slug đề nên
 *     mở đề lần thứ hai là hiện nguyên bài của lần trước.
 *  2. ĐỒNG HỒ CỦA MÁY CHỦ. Số giây còn lại do máy chủ cấp lúc mở trang và được
 *     chỉnh lại sau mỗi lần tự lưu. Xóa localStorage hay vặn giờ máy không xin
 *     thêm được phút nào.
 *  3. KHÔNG MẤT BÀI. Tự lưu lên máy chủ mỗi 5 giây và mỗi lần đổi đáp án, kèm
 *     một bản sao trong localStorage của riêng lượt này để không mất phần vừa gõ
 *     khi rớt mạng.
 *  4. Ảnh chụp lên được ngay, thấy được ảnh vừa chụp, xóa được ảnh mờ.
 *  5. Nộp xong thấy máy đang làm gì (spec §9.2) — các câu tự luận chấm song song,
 *     mỗi câu xong thì sáng lên một ô.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { apiPost, apiPut, ApiClientError } from '@/lib/client';
import { API, routes } from '@/lib/routes';
import { uploadExamImage } from '@/lib/image';
import type { PlayerQuestion, Sitting } from '@/server/mock-exam/service';
import { Alert, Badge, Button, Card, ProgressBar, cx } from '@/components/ui';
import { RichText } from '@/components/rich-text';

// ---------------------------------------------------------------------------
// Bản nháp
// ---------------------------------------------------------------------------

interface AnswerDraft {
  text?: string;
  grid?: (string | null)[][];
  imageUrls?: string[];
}

const AUTOSAVE_MS = 5_000;

/**
 * Bản sao chống rớt mạng, khóa theo ĐÚNG LƯỢT THI.
 *
 * Khóa cũ chỉ có slug đề, nên bản nháp của lượt trước tự động chui vào lượt sau.
 * Có id lượt thi trong khóa thì chuyện đó không thể xảy ra nữa: lượt mới có khóa
 * mới, và bản nháp cũ chết theo lượt cũ.
 */
function draftKey(attemptId: string): string {
  return `attempt_draft_v2_${attemptId}`;
}

function readLocalDraft(attemptId: string): Record<string, AnswerDraft> | null {
  try {
    const raw = window.localStorage.getItem(draftKey(attemptId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Record<string, AnswerDraft>;
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch {
    return null;
  }
}

/** Câu này có gì để lưu không — dùng để biết bản nào mới hơn. */
function filledCount(answers: Record<string, AnswerDraft>): number {
  return Object.values(answers).filter(
    (draft) =>
      (draft.text ?? '').trim() !== '' ||
      (draft.imageUrls?.length ?? 0) > 0 ||
      (draft.grid ?? []).some((row) => row.some((cell) => cell !== null)),
  ).length;
}

// ---------------------------------------------------------------------------
// Đồng hồ
// ---------------------------------------------------------------------------

function formatClock(seconds: number): string {
  const safe = Math.max(0, Math.floor(seconds));
  const h = Math.floor(safe / 3600);
  const m = Math.floor((safe % 3600) / 60);
  const s = safe % 60;
  const pad = (n: number) => String(n).padStart(2, '0');
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
}

// ---------------------------------------------------------------------------
// Tiến độ chấm
// ---------------------------------------------------------------------------

type GradeState = 'waiting' | 'running' | 'done' | 'failed';

interface GradingRow {
  questionId: string;
  number: number;
  state: GradeState;
  awarded: number | null;
  maxPoints: number;
}

// ---------------------------------------------------------------------------

export function ExamPlayer({ sitting }: { sitting: Sitting }) {
  const router = useRouter();
  const { exam, attemptId } = sitting;

  /** Bài làm đã lưu ở máy chủ cho ĐÚNG lượt này — nguồn sự thật lúc mở trang. */
  const serverAnswers = useMemo(() => {
    const map: Record<string, AnswerDraft> = {};
    for (const saved of sitting.answers) {
      const draft: AnswerDraft = {};
      if (saved.text !== null) draft.text = saved.text;
      if (saved.grid !== null) draft.grid = saved.grid;
      if (saved.imageUrls.length > 0) draft.imageUrls = saved.imageUrls;
      if (Object.keys(draft).length > 0) map[String(saved.number)] = draft;
    }
    return map;
  }, [sitting.answers]);

  const [answers, setAnswers] = useState<Record<string, AnswerDraft>>(serverAnswers);
  const [current, setCurrent] = useState(0);
  const [phase, setPhase] = useState<'doing' | 'grading'>('doing');
  const [grading, setGrading] = useState<GradingRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState<Record<number, boolean>>({});
  const [saveState, setSaveState] = useState<'saved' | 'saving' | 'offline'>('saved');
  const submittedRef = useRef(false);

  /**
   * Đồng hồ neo vào MÁY CHỦ.
   *
   * `deadline` là mốc thời gian của máy học sinh tương ứng với hạn nộp của máy
   * chủ, tính từ số giây còn lại mà máy chủ vừa cấp. Không đọc `expiresAt` trực
   * tiếp vì đồng hồ máy học sinh có thể lệch hàng giờ.
   */
  const [deadline, setDeadline] = useState(() => Date.now() + sitting.secondsLeft * 1_000);
  const [now, setNow] = useState(() => Date.now());
  const secondsLeft = Math.max(0, Math.floor((deadline - now) / 1000));

  // --- Khôi phục phần gõ dở khi rớt mạng ---
  // Chỉ nhận bản localStorage khi nó ĐẦY ĐẶN HƠN bản máy chủ: nghĩa là lần tự
  // lưu cuối cùng chưa kịp đi. Cùng lượt thi nên không có chuyện lẫn bài.
  useEffect(() => {
    const local = readLocalDraft(attemptId);
    if (local && filledCount(local) > filledCount(serverAnswers)) setAnswers(local);
  }, [attemptId, serverAnswers]);

  // --- Tự lưu lên máy chủ ---
  const pendingSaveRef = useRef<Record<string, AnswerDraft> | null>(null);
  const savingRef = useRef(false);

  const flushSave = useCallback(async () => {
    const next = pendingSaveRef.current;
    if (next === null || savingRef.current || submittedRef.current) return;
    pendingSaveRef.current = null;
    savingRef.current = true;
    setSaveState('saving');
    try {
      const reply = await apiPut<{ secondsLeft: number }>(API.mockDraft(attemptId), {
        answers: exam.questions.map((question) => {
          const draft = next[String(question.number)] ?? {};
          return {
            number: question.number,
            text: draft.text ?? null,
            grid: draft.grid ?? null,
            imageUrls: draft.imageUrls ?? [],
          };
        }),
      });
      // Chỉnh lại đồng hồ theo máy chủ sau mỗi lần lưu — trôi giờ bao nhiêu cũng
      // được kéo về đúng.
      setDeadline(Date.now() + reply.secondsLeft * 1_000);
      setSaveState('saved');
    } catch {
      // Rớt mạng: bản localStorage vẫn còn, lần lưu sau gửi lại toàn bộ.
      pendingSaveRef.current = next;
      setSaveState('offline');
    } finally {
      savingRef.current = false;
    }
  }, [attemptId, exam.questions]);

  const saveDraft = useCallback(
    (next: Record<string, AnswerDraft>) => {
      try {
        window.localStorage.setItem(draftKey(attemptId), JSON.stringify(next));
      } catch {
        // Hết chỗ lưu (chế độ ẩn danh) — không chặn học sinh làm bài.
      }
      pendingSaveRef.current = next;
    },
    [attemptId],
  );

  useEffect(() => {
    const timer = setInterval(() => void flushSave(), AUTOSAVE_MS);
    return () => clearInterval(timer);
  }, [flushSave]);

  const update = useCallback(
    (number: number, patch: AnswerDraft) => {
      setAnswers((previous) => {
        const next = {
          ...previous,
          [String(number)]: { ...previous[String(number)], ...patch },
        };
        saveDraft(next);
        return next;
      });
    },
    [saveDraft],
  );

  // --- Đồng hồ đếm ngược ---
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1_000);
    return () => clearInterval(timer);
  }, []);

  // ---------------------------------------------------------------------------
  // Nộp bài
  // ---------------------------------------------------------------------------

  const submit = useCallback(async () => {
    if (submittedRef.current) return;

    /**
     * Ảnh đang tải lên thì chưa được nộp.
     *
     * `answers` chỉ có đường dẫn ảnh SAU khi tải lên xong. Bấm "Nộp bài" giữa
     * chừng — hoặc hết giờ đúng lúc đó — thì câu ấy đi lên máy chủ với danh sách
     * ảnh rỗng: bài làm em vừa chụp biến mất, chấm 0, và không một dòng báo lỗi
     * nào. Chặn ở đây và nói rõ còn thiếu gì.
     */
    const pendingUploads = Object.entries(uploading)
      .filter(([, busy]) => busy)
      .map(([number]) => number);
    if (pendingUploads.length > 0) {
      setError(
        `Ảnh của câu ${pendingUploads.join(', ')} đang tải lên. Đợi vài giây cho ảnh hiện ra rồi bấm nộp lại — nộp bây giờ sẽ mất ảnh đó.`,
      );
      return;
    }

    submittedRef.current = true;
    setError(null);
    setPhase('grading');

    try {
      const payload = await apiPost<{
        attemptId: string;
        pending: { questionId: string; number: number; maxPoints: number }[];
        parallelLimit: number;
      }>(API.mockSubmit(attemptId), {
        answers: exam.questions.map((question) => {
          const draft = answers[String(question.number)] ?? {};
          return {
            number: question.number,
            text: draft.text ?? null,
            grid: draft.grid ?? null,
            imageUrls: draft.imageUrls ?? [],
          };
        }),
      });

      // Nộp xong là bản sao chống rớt mạng hết nhiệm vụ.
      window.localStorage.removeItem(draftKey(attemptId));

      const resultHref = routes.mockExamResult(exam.slug, payload.attemptId);
      if (payload.pending.length === 0) {
        router.push(resultHref);
        return;
      }

      setGrading(
        payload.pending.map((item) => ({
          questionId: item.questionId,
          number: item.number,
          state: 'waiting' as GradeState,
          awarded: null,
          maxPoints: item.maxPoints,
        })),
      );

      await runGrading(payload.attemptId, payload.pending, payload.parallelLimit, setGrading);
      router.push(resultHref);
    } catch (caught) {
      submittedRef.current = false;
      setPhase('doing');
      setError(
        caught instanceof ApiClientError
          ? caught.message
          : 'Không nộp được bài. Kiểm tra mạng rồi bấm nộp lại — bài làm của em vẫn còn.',
      );
    }
  }, [answers, attemptId, exam.questions, exam.slug, router, uploading]);

  /**
   * Hết giờ là tự nộp.
   *
   * Bây giờ mốc hết giờ do máy chủ cấp cho ĐÚNG lượt này, nên trường hợp cũ —
   * mở một bản nháp quá hạn của lần trước rồi bị nộp ngay khi trang vừa hiện —
   * không còn tồn tại: lượt quá hạn đã được máy chủ nộp hộ và chấm xong, mở lại
   * chỉ ra trang kết quả. Ở đây chỉ còn đúng một tình huống: đang làm thì hết giờ.
   */
  useEffect(() => {
    if (phase !== 'doing' || secondsLeft > 0) return;
    void submit();
  }, [secondsLeft, phase, submit]);

  // --- Cảnh báo khi đóng tab giữa chừng ---
  // Cảnh báo cả lúc đang chấm: việc chấm chạy từ chính tab này, đóng đi thì các
  // câu còn lại nằm im ở trạng thái "chờ chấm" cho tới khi có người bấm chấm lại.
  useEffect(() => {
    const handler = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, []);

  // ---------------------------------------------------------------------------

  const question = exam.questions[current]!;
  const answeredNumbers = useMemo(() => {
    const set = new Set<number>();
    for (const [number, draft] of Object.entries(answers)) {
      const filled =
        (draft.text ?? '').trim() !== '' ||
        (draft.imageUrls ?? []).length > 0 ||
        (draft.grid ?? []).some((row) => row.some((cell) => cell !== null));
      if (filled) set.add(Number(number));
    }
    return set;
  }, [answers]);

  if (phase === 'grading') {
    return <GradingScreen rows={grading} demo={exam.ai.demo} live={exam.ai.live} />;
  }

  return (
    <div className="min-h-screen bg-ink-50 pb-24">
      {/* ---------------- Thanh trên cùng ---------------- */}
      <header className="sticky top-0 z-30 border-b border-ink-200 bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center gap-3 px-4 py-3">
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold text-ink-900">{exam.title}</p>
            <p className="text-xs text-ink-500">
              Lượt {sitting.attemptNumber}/{sitting.quota.limit} · đã làm{' '}
              {answeredNumbers.size}/{exam.questions.length} câu ·{' '}
              <span
                className={cx(
                  saveState === 'offline' ? 'font-semibold text-rose-600' : 'text-ink-400',
                )}
              >
                {saveState === 'offline'
                  ? 'mất mạng — bài đang giữ trên máy em'
                  : saveState === 'saving'
                    ? 'đang lưu…'
                    : 'đã lưu'}
              </span>
            </p>
          </div>

          <div
            className={cx(
              'rounded-lg px-3 py-1.5 font-mono text-lg font-bold tabular-nums',
              secondsLeft < 600 ? 'bg-rose-50 text-rose-700' : 'bg-ink-100 text-ink-800',
            )}
            aria-label="Thời gian còn lại"
          >
            {formatClock(secondsLeft)}
          </div>

          <Button onClick={() => void submit()} size="sm">
            Nộp bài
          </Button>
        </div>

        {/* Lưới số câu — bấm là nhảy tới câu đó */}
        <div className="scroll-x mx-auto max-w-5xl px-4 pb-3">
          <div className="flex gap-1.5">
            {exam.questions.map((item, index) => (
              <button
                key={item.id}
                type="button"
                onClick={() => setCurrent(index)}
                aria-current={index === current}
                className={cx(
                  'press h-8 w-8 shrink-0 rounded-lg text-sm font-semibold transition-colors',
                  index === current
                    ? 'bg-brand-600 text-white'
                    : answeredNumbers.has(item.number)
                      ? 'bg-accent-100 text-accent-700 ring-1 ring-accent-300'
                      : 'bg-ink-100 text-ink-500 hover:bg-ink-200',
                )}
              >
                {item.number}
              </button>
            ))}
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-4 py-6">
        {saveState === 'offline' ? (
          <Alert tone="warn" title="Máy chủ chưa nhận được bài" className="mb-4">
            Mạng đang chập chờn. Bài của em vẫn được giữ trên máy này và sẽ tự gửi lại — cứ làm tiếp,
            nhưng đừng đóng tab cho tới khi dòng trạng thái ở trên hiện “đã lưu”.
          </Alert>
        ) : null}

        {!exam.ai.live ? (
          <Alert tone="warn" title="Câu tự luận chưa chấm được" className="mb-4">
            {exam.ai.demo
              ? 'Hệ thống đang ở chế độ thử: điểm tự luận là điểm mẫu, không phải AI chấm.'
              : 'Chưa gắn khóa AI nên các câu tự luận sẽ báo "chưa chấm được" sau khi nộp. ' +
                'Phần trắc nghiệm và đáp số vẫn được chấm đầy đủ và chính xác.'}
          </Alert>
        ) : null}

        {error ? (
          <Alert tone="danger" className="mb-4">
            {error}
          </Alert>
        ) : null}

        <Card className="animate-fade-up">
          <div className="mb-4 flex flex-wrap items-center gap-2">
            <Badge tone="brand">Câu {question.number}</Badge>
            <Badge tone="neutral">{question.maxPoints} điểm</Badge>
            {question.gradingMode === 'ESSAY' ? (
              <Badge tone="info" dot>
                AI chấm theo barem
              </Badge>
            ) : (
              <Badge tone="success" dot>
                Máy chấm ngay
              </Badge>
            )}
          </div>

          <RichText className="text-[15px] text-ink-800">{question.promptMd}</RichText>

          {question.imageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={question.imageUrl}
              alt={`Hình minh họa câu ${question.number}`}
              className="mt-3 max-h-80 w-auto rounded-lg ring-1 ring-ink-100"
            />
          ) : null}

          <div className="mt-5">
            <QuestionInput
              question={question}
              draft={answers[String(question.number)] ?? {}}
              uploading={uploading[question.number] ?? false}
              onChange={(patch) => update(question.number, patch)}
              onUploadingChange={(value) =>
                setUploading((prev) => ({ ...prev, [question.number]: value }))
              }
            />
          </div>
        </Card>

        <div className="mt-4 flex items-center justify-between gap-3">
          <Button
            variant="secondary"
            onClick={() => setCurrent((index) => Math.max(0, index - 1))}
            disabled={current === 0}
          >
            ← Câu trước
          </Button>

          {current < exam.questions.length - 1 ? (
            <Button variant="secondary" onClick={() => setCurrent((index) => index + 1)}>
              Câu sau →
            </Button>
          ) : (
            <Button onClick={() => void submit()}>Nộp bài</Button>
          )}
        </div>
      </main>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Ô trả lời theo từng kiểu câu
// ---------------------------------------------------------------------------

const CHOICE_KEYS = ['A', 'B', 'C', 'D', 'E', 'F'];

function QuestionInput({
  question,
  draft,
  uploading,
  onChange,
  onUploadingChange,
}: {
  question: PlayerQuestion;
  draft: AnswerDraft;
  uploading: boolean;
  onChange: (patch: AnswerDraft) => void;
  onUploadingChange: (value: boolean) => void;
}) {
  if (question.part === 'MCQ') {
    return (
      <ul className="space-y-2.5">
        {question.options.map((option, index) => {
          const key = CHOICE_KEYS[index] ?? String(index + 1);
          const selected = (draft.text ?? '') === key;
          return (
            <li key={key}>
              <button
                type="button"
                onClick={() => onChange({ text: selected ? '' : key })}
                aria-pressed={selected}
                className={cx(
                  'press flex w-full items-start gap-3 rounded-xl border-2 p-3.5 text-left transition-all',
                  selected
                    ? 'border-brand-500 bg-brand-50 shadow-[0_4px_16px_rgb(47_66_224/0.12)]'
                    : 'border-ink-200 bg-white hover:border-brand-300 hover:bg-brand-50/40',
                )}
              >
                <span
                  aria-hidden
                  className={cx(
                    'mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-sm font-bold',
                    selected ? 'bg-brand-600 text-white' : 'bg-ink-100 text-ink-600',
                  )}
                >
                  {key}
                </span>
                <span className="min-w-0 flex-1 pt-0.5 text-ink-800">
                  <RichText>{option}</RichText>
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    );
  }

  if (question.gradingMode === 'NUMERIC') {
    return (
      <div>
        <label className="mb-1.5 block text-sm font-medium text-ink-700" htmlFor={`q-${question.id}`}>
          Đáp số của em
        </label>
        <input
          id={`q-${question.id}`}
          value={draft.text ?? ''}
          onChange={(event) => onChange({ text: event.target.value })}
          autoComplete="off"
          className="w-full max-w-sm rounded-lg border border-ink-200 bg-white px-3 py-2.5 text-lg font-semibold text-ink-800 tabular-nums focus:border-brand-500 focus:ring-4 focus:ring-brand-100 focus:outline-none"
          placeholder="Ví dụ: 27 7/18"
        />
        <p className="mt-1.5 text-xs text-ink-500">
          Viết phân số dạng <code className="rounded bg-ink-100 px-1">7/18</code>, hỗn số dạng{' '}
          <code className="rounded bg-ink-100 px-1">27 7/18</code>, hoặc số thập phân. Viết kèm đơn vị
          cũng được.
        </p>
      </div>
    );
  }

  if (question.gradingMode === 'EXPRESSION') {
    return <ExpressionInput question={question} draft={draft} onChange={onChange} />;
  }

  if (question.gradingMode === 'GRID') {
    return <GridInput question={question} draft={draft} onChange={onChange} />;
  }

  return (
    <EssayInput
      question={question}
      draft={draft}
      uploading={uploading}
      onChange={onChange}
      onUploadingChange={onUploadingChange}
    />
  );
}

/**
 * Câu "tạo ra số N từ các chữ số cho trước".
 *
 * Kiểm ngay khi gõ để học sinh tự thấy mình dùng thừa chữ số hay tính sai —
 * nhưng ĐIỂM VẪN CHẤM Ở MÁY CHỦ (spec §9.1). Ô này chỉ là cái gương.
 */
function ExpressionInput({
  question,
  draft,
  onChange,
}: {
  question: PlayerQuestion;
  draft: AnswerDraft;
  onChange: (patch: AnswerDraft) => void;
}) {
  const config = question.config as unknown as {
    digits?: number[];
    target?: number;
    tolerance?: number | null;
    max_length?: number | null;
  };

  const value = draft.text ?? '';
  const digits = Array.isArray(config.digits) ? config.digits.join(', ') : null;

  /**
   * KHÔNG chấm thử tại chỗ.
   *
   * Trước đây ô này gọi thẳng `checkExpression` ngay trong trình duyệt và in ✓/✗
   * sau mỗi ký tự. Đó là một cái máy dò đáp án: em không giải được thì cứ gõ bừa
   * cho tới khi hiện ✓, và câu này thành điểm cho không. Trong phòng thi không
   * ai chấm hộ từng dòng nháp, ở đây cũng vậy — chỉ nhắc luật viết.
   */
  return (
    <div>
      <label className="mb-1.5 block text-sm font-medium text-ink-700" htmlFor={`q-${question.id}`}>
        Biểu thức của em
      </label>
      <input
        id={`q-${question.id}`}
        value={value}
        onChange={(event) => onChange({ text: event.target.value })}
        autoComplete="off"
        spellCheck={false}
        className="w-full max-w-md rounded-lg border border-ink-200 bg-white px-3 py-2.5 font-mono text-lg text-ink-800 focus:border-brand-500 focus:ring-4 focus:ring-brand-100 focus:outline-none"
        placeholder="Ví dụ: (8-4)/2"
      />
      <p className="mt-1.5 text-xs text-ink-500">
        {digits ? `Chỉ dùng các chữ số ${digits}, mỗi chữ số đúng một lần. ` : ''}
        Dùng được: + − × ÷ ( ) ^ , dấu thập phân và căn bậc hai (viết √ hoặc sqrt).
      </p>
    </div>
  );
}

/** Lưới 4×4 câu 15: mỗi ô là một vạch, bấm để đổi hướng. */
function GridInput({
  question,
  draft,
  onChange,
}: {
  question: PlayerQuestion;
  draft: AnswerDraft;
  onChange: (patch: AnswerDraft) => void;
}) {
  const config = question.config as unknown as {
    rows?: number;
    cols?: number;
    cell_states?: string[];
    labels?: string[][];
    prefilled?: Record<string, string>;
  };

  const rows = config.rows ?? 4;
  const cols = config.cols ?? 4;
  const states = config.cell_states ?? ['/', '\\'];
  const labels = config.labels ?? null;
  const prefilled = config.prefilled ?? {};

  const grid = useMemo(() => {
    const base: (string | null)[][] = Array.from({ length: rows }, () =>
      Array.from({ length: cols }, () => null),
    );
    // Ô đề đã cho sẵn (dấu ghim ở ô P) luôn hiện đúng giá trị đó.
    if (labels) {
      for (const [rowIndex, row] of labels.entries()) {
        for (const [colIndex, label] of row.entries()) {
          if (prefilled[label] !== undefined) base[rowIndex]![colIndex] = prefilled[label]!;
        }
      }
    }
    for (const [rowIndex, row] of (draft.grid ?? []).entries()) {
      for (const [colIndex, cell] of row.entries()) {
        if (base[rowIndex] && cell !== null) base[rowIndex]![colIndex] = cell;
      }
    }
    return base;
  }, [rows, cols, labels, prefilled, draft.grid]);

  function toggle(rowIndex: number, colIndex: number): void {
    const label = labels?.[rowIndex]?.[colIndex];
    if (label && prefilled[label] !== undefined) return; // ô đề cho sẵn, không sửa

    const currentValue = grid[rowIndex]![colIndex];
    const position = currentValue === null ? -1 : states.indexOf(currentValue);
    const nextValue = states[(position + 1) % states.length] ?? states[0]!;

    const next = grid.map((row) => [...row]);
    next[rowIndex]![colIndex] = nextValue;
    onChange({ grid: next });
  }

  return (
    <div>
      <p className="mb-2 text-sm text-ink-600">
        Bấm vào ô để đổi hướng vạch. Ô đề cho sẵn đã khóa.
      </p>
      <div
        className="inline-grid gap-1 rounded-xl bg-ink-100 p-1"
        style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}
      >
        {grid.map((row, rowIndex) =>
          row.map((cell, colIndex) => {
            const label = labels?.[rowIndex]?.[colIndex];
            const locked = Boolean(label && prefilled[label] !== undefined);
            return (
              <button
                key={`${rowIndex}-${colIndex}`}
                type="button"
                onClick={() => toggle(rowIndex, colIndex)}
                disabled={locked}
                aria-label={`Ô ${label ?? `${rowIndex + 1}-${colIndex + 1}`}`}
                className={cx(
                  'press relative flex h-14 w-14 items-center justify-center rounded-lg text-2xl font-bold transition-colors sm:h-16 sm:w-16',
                  locked
                    ? 'bg-brand-50 text-brand-700 ring-2 ring-brand-300'
                    : cell === null
                      ? 'bg-white text-ink-300 hover:bg-brand-50'
                      : 'bg-white text-ink-800 ring-1 ring-ink-200',
                )}
              >
                {label ? (
                  <span className="absolute top-0.5 left-1 text-[10px] font-medium text-ink-400">
                    {label}
                  </span>
                ) : null}
                {cell ?? '·'}
              </button>
            );
          }),
        )}
      </div>
    </div>
  );
}

/** Câu tự luận: chụp ảnh bài làm, hoặc gõ thẳng lời giải. */
function EssayInput({
  question,
  draft,
  uploading,
  onChange,
  onUploadingChange,
}: {
  question: PlayerQuestion;
  draft: AnswerDraft;
  uploading: boolean;
  onChange: (patch: AnswerDraft) => void;
  onUploadingChange: (value: boolean) => void;
}) {
  const [uploadError, setUploadError] = useState<string | null>(null);
  const images = draft.imageUrls ?? [];
  const MAX_IMAGES = 3;

  async function handleFiles(fileList: FileList | null): Promise<void> {
    if (!fileList || fileList.length === 0) return;
    setUploadError(null);
    onUploadingChange(true);

    const room = MAX_IMAGES - images.length;
    const picked = Array.from(fileList).slice(0, Math.max(0, room));
    const uploaded: string[] = [];

    // `finally` chứ không phải gọi ở cuối hàm: cờ "đang tải" nay CHẶN nút nộp
    // bài, nên một lỗi bất ngờ làm cờ kẹt ở true sẽ khóa luôn đường nộp — hỏng
    // nặng hơn cả cái lỗi mà nó sinh ra để vá.
    try {
      for (const file of picked) {
        try {
          const result = await uploadExamImage(file);
          uploaded.push(result.url);
        } catch (error) {
          setUploadError(error instanceof Error ? error.message : 'Tải ảnh lên thất bại.');
        }
      }

      if (uploaded.length > 0) onChange({ imageUrls: [...images, ...uploaded] });
    } finally {
      onUploadingChange(false);
    }
  }

  return (
    <div>
      <div className="rounded-xl bg-brand-50/60 p-4 ring-1 ring-brand-100">
        <p className="text-sm font-medium text-brand-900">📸 Chụp bài làm của em</p>
        <p className="mt-1 text-sm text-brand-800/80">
          Mỗi câu một ảnh. Đặt giấy phẳng, đủ sáng, chụp thẳng từ trên xuống. Viết chữ rõ, không viết
          đè lên nhau.
        </p>

        <div className="mt-3 flex flex-wrap items-center gap-2">
          <label
            className={cx(
              'press inline-flex cursor-pointer items-center gap-2 rounded-lg bg-brand-600 px-4 py-2.5 text-sm font-medium text-white transition-all hover:bg-brand-700',
              (uploading || images.length >= MAX_IMAGES) && 'pointer-events-none opacity-55',
            )}
          >
            {uploading ? 'Đang tải ảnh lên…' : images.length > 0 ? 'Chụp thêm ảnh' : 'Chụp bài làm'}
            <input
              type="file"
              accept="image/*"
              capture="environment"
              multiple
              className="hidden"
              onChange={(event) => {
                void handleFiles(event.target.files);
                event.target.value = '';
              }}
            />
          </label>
          <span className="text-xs text-brand-800/70">
            {images.length}/{MAX_IMAGES} ảnh
          </span>
        </div>

        {uploadError ? (
          <p className="mt-2 text-sm text-rose-700" role="alert">
            {uploadError}
          </p>
        ) : null}

        {images.length > 0 ? (
          <div className="mt-3 flex flex-wrap gap-3">
            {images.map((url) => (
              <div key={url} className="relative">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={url}
                  alt="Ảnh bài làm của em"
                  className="h-28 w-24 rounded-lg object-cover ring-1 ring-ink-200"
                />
                <button
                  type="button"
                  onClick={() => onChange({ imageUrls: images.filter((item) => item !== url) })}
                  className="press absolute -top-2 -right-2 flex h-6 w-6 items-center justify-center rounded-full bg-rose-600 text-xs font-bold text-white"
                  aria-label="Xóa ảnh này"
                >
                  ✕
                </button>
              </div>
            ))}
          </div>
        ) : null}
      </div>

      <div className="mt-4">
        <label className="mb-1.5 block text-sm font-medium text-ink-700" htmlFor={`t-${question.id}`}>
          Hoặc gõ lời giải bằng bàn phím
          <span className="ml-1 font-normal text-ink-400">(không bắt buộc)</span>
        </label>
        <textarea
          id={`t-${question.id}`}
          value={draft.text ?? ''}
          onChange={(event) => onChange({ text: event.target.value })}
          rows={5}
          className="w-full rounded-lg border border-ink-200 bg-white px-3 py-2.5 text-sm text-ink-800 focus:border-brand-500 focus:ring-4 focus:ring-brand-100 focus:outline-none"
          placeholder="Em có thể trình bày lời giải ở đây nếu không tiện chụp ảnh."
        />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Màn hình đang chấm
// ---------------------------------------------------------------------------

/**
 * Bắn các lời gọi chấm, tối đa `limit` câu cùng lúc.
 *
 * Vì sao không `Promise.all` tất cả: 10 câu là 20 lời gọi model cùng lúc, đủ để
 * ăn 429 của nhà cung cấp và hỏng nguyên bài. Chạy theo lô nhỏ vẫn xong trong
 * chưa đầy một phút mà không ai bị chặn.
 *
 * Một câu lỗi thì thử LẠI MỘT LẦN rồi thôi — máy chủ đã ghi câu đó là "chấm
 * hỏng", trang kết quả có nút chấm lại (spec §2).
 */
async function runGrading(
  attemptId: string,
  pending: { questionId: string; number: number; maxPoints: number }[],
  limit: number,
  setGrading: (updater: (rows: GradingRow[]) => GradingRow[]) => void,
): Promise<void> {
  const queue = [...pending];
  const size = Math.max(1, Math.min(limit || 4, 8));

  async function worker(): Promise<void> {
    for (;;) {
      const item = queue.shift();
      if (!item) return;

      setGrading((rows) =>
        rows.map((row) =>
          row.questionId === item.questionId ? { ...row, state: 'running' } : row,
        ),
      );

      let result: { awarded: number | null; status: string } | null = null;
      for (let attempt = 0; attempt < 2 && result === null; attempt += 1) {
        try {
          result = await apiPost<{ awarded: number | null; status: string }>(
            API.mockGrade(attemptId),
            { questionId: item.questionId },
          );
        } catch {
          result = attempt === 0 ? null : { awarded: null, status: 'FAILED' };
        }
      }

      setGrading((rows) =>
        rows.map((row) =>
          row.questionId === item.questionId
            ? {
                ...row,
                state: result?.status === 'GRADED' ? 'done' : 'failed',
                awarded: result?.awarded ?? null,
              }
            : row,
        ),
      );
    }
  }

  await Promise.all(Array.from({ length: Math.min(size, queue.length) }, () => worker()));
}

function GradingScreen({
  rows,
  demo,
  live,
}: {
  rows: GradingRow[];
  demo: boolean;
  live: boolean;
}) {
  const finished = rows.filter((row) => row.state === 'done' || row.state === 'failed').length;

  return (
    <div className="flex min-h-screen items-center justify-center bg-ink-50 px-4">
      <Card className="w-full max-w-lg text-center">
        <h1 className="text-xl font-bold text-ink-900">Đang chấm bài của em…</h1>
        <p className="mt-1 text-sm text-ink-500">
          {live
            ? 'AI đang đọc ảnh bài làm rồi chấm theo barem. Việc này mất khoảng 15–40 giây mỗi câu.'
            : demo
              ? 'Chế độ thử: điểm tự luận là điểm mẫu, không phải AI chấm.'
              : 'Chưa gắn khóa AI nên các câu tự luận sẽ được đánh dấu để chấm lại sau.'}
        </p>

        <div className="mt-5">
          <ProgressBar value={finished} max={rows.length} />
          <p className="mt-2 text-sm font-medium text-ink-700">
            {finished}/{rows.length} câu tự luận
          </p>
        </div>

        <ul className="mt-5 flex flex-wrap justify-center gap-2">
          {rows.map((row) => (
            <li
              key={row.questionId}
              className={cx(
                'flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-sm font-medium',
                row.state === 'done'
                  ? 'bg-accent-50 text-accent-700'
                  : row.state === 'failed'
                    ? 'bg-rose-50 text-rose-700'
                    : row.state === 'running'
                      ? 'bg-brand-50 text-brand-700'
                      : 'bg-ink-100 text-ink-500',
              )}
            >
              <span aria-hidden>
                {row.state === 'done'
                  ? '✓'
                  : row.state === 'failed'
                    ? '!'
                    : row.state === 'running'
                      ? '⟳'
                      : '○'}
              </span>
              Câu {row.number}
              {row.state === 'done' && row.awarded !== null ? (
                <span className="tabular-nums">
                  {row.awarded}/{row.maxPoints}
                </span>
              ) : null}
            </li>
          ))}
        </ul>

        <p className="mt-5 text-xs text-ink-400">
          Đừng đóng trang này. Xong là hệ thống tự chuyển sang trang kết quả.
        </p>
      </Card>
    </div>
  );
}
