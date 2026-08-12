'use client';

/**
 * Hiển thị và trả lời một câu hỏi — dùng chung cho cả bài kiểm tra lẫn luyện tập.
 *
 * Hai chế độ:
 *   ANSWERING — học sinh đang làm, TUYỆT ĐỐI không lộ đáp án hay lời giải.
 *   GRADED    — đã chấm xong, đánh dấu đáp án đúng và đáp án đã chọn.
 *
 * Ở chế độ GRADED, đúng/sai được thể hiện bằng CẢ nhãn chữ lẫn màu và biểu
 * tượng — không bao giờ chỉ bằng màu, để học sinh mù màu vẫn đọc được.
 */
import { useMemo } from 'react';
import { cx } from '@/components/ui';

export interface QuestionOption {
  key: string;
  text: string;
  imageUrl?: string | null;
}

export interface QuestionView {
  itemId: string;
  questionType: 'SINGLE_CHOICE' | 'MULTIPLE_CHOICE' | 'NUMERIC' | 'SHORT_ANSWER';
  stem: string;
  stemImageUrl?: string | null;
  options?: QuestionOption[] | null;
  difficultyLabel?: string;
  estimatedTime?: number;
}

export interface QuestionResult {
  isCorrect: boolean;
  correctAnswer?: unknown;
  solution?: string;
  solutionSteps?: string[];
}

export type QuestionMode = 'ANSWERING' | 'GRADED';

function toKeyArray(value: unknown): string[] {
  if (Array.isArray(value)) return value.map((v) => String(v));
  if (value === null || value === undefined || value === '') return [];
  return [String(value)];
}

export function Question({
  item,
  mode,
  value,
  onChange,
  showSolution = false,
  result,
  disabled = false,
}: {
  item: QuestionView;
  mode: QuestionMode;
  value: unknown;
  onChange?: (next: unknown) => void;
  showSolution?: boolean;
  result?: QuestionResult | null;
  disabled?: boolean;
}) {
  const graded = mode === 'GRADED';
  const selected = useMemo(() => toKeyArray(value), [value]);
  const correctKeys = useMemo(
    () => (graded ? toKeyArray(result?.correctAnswer) : []),
    [graded, result?.correctAnswer],
  );

  const isChoice =
    item.questionType === 'SINGLE_CHOICE' || item.questionType === 'MULTIPLE_CHOICE';
  const multi = item.questionType === 'MULTIPLE_CHOICE';

  function toggle(key: string): void {
    if (graded || disabled || !onChange) return;
    if (!multi) {
      onChange(key);
      return;
    }
    const next = selected.includes(key)
      ? selected.filter((k) => k !== key)
      : [...selected, key].sort();
    onChange(next);
  }

  return (
    <div className="animate-fade-in">
      {/* Đề bài */}
      <div className="stem-content text-base text-ink-800">{item.stem}</div>

      {item.stemImageUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={item.stemImageUrl}
          alt="Hình minh họa của câu hỏi"
          className="mt-3 max-h-72 w-auto rounded-lg ring-1 ring-ink-100"
        />
      ) : null}

      {multi && !graded ? (
        <p className="mt-2 text-sm text-ink-500">Câu này có thể có nhiều đáp án đúng.</p>
      ) : null}

      {/* Phương án trắc nghiệm */}
      {isChoice && item.options && item.options.length > 0 ? (
        <ul className="mt-4 space-y-2.5">
          {item.options.map((option) => {
            const isSelected = selected.includes(option.key);
            const isCorrect = correctKeys.includes(option.key);
            const wrongPick = graded && isSelected && !isCorrect;

            return (
              <li key={option.key}>
                <button
                  type="button"
                  onClick={() => toggle(option.key)}
                  disabled={graded || disabled}
                  aria-pressed={isSelected}
                  className={cx(
                    'press flex w-full items-start gap-3 rounded-xl border-2 p-3.5 text-left transition-all duration-200',
                    graded
                      ? isCorrect
                        ? 'border-accent-500 bg-accent-50'
                        : wrongPick
                          ? 'border-rose-400 bg-rose-50'
                          : 'border-ink-200 bg-white opacity-70'
                      : isSelected
                        ? 'border-brand-500 bg-brand-50 shadow-[0_4px_16px_rgb(47_66_224/0.12)]'
                        : 'border-ink-200 bg-white hover:border-brand-300 hover:bg-brand-50/40',
                    (graded || disabled) && 'cursor-default',
                  )}
                >
                  <span
                    aria-hidden
                    className={cx(
                      'mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center text-sm font-bold transition-colors',
                      multi ? 'rounded-md' : 'rounded-full',
                      graded
                        ? isCorrect
                          ? 'bg-accent-600 text-white'
                          : wrongPick
                            ? 'bg-rose-500 text-white'
                            : 'bg-ink-100 text-ink-500'
                        : isSelected
                          ? 'bg-brand-600 text-white'
                          : 'bg-ink-100 text-ink-600',
                    )}
                  >
                    {option.key}
                  </span>

                  <span className="min-w-0 flex-1 pt-0.5 text-ink-800">{option.text}</span>

                  {graded && (isCorrect || wrongPick) ? (
                    <span
                      className={cx(
                        'mt-0.5 shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold',
                        isCorrect ? 'bg-accent-600 text-white' : 'bg-rose-500 text-white',
                      )}
                    >
                      {isCorrect ? 'Đáp án đúng' : 'Bạn đã chọn'}
                    </span>
                  ) : null}
                </button>
              </li>
            );
          })}
        </ul>
      ) : null}

      {/* Điền số */}
      {item.questionType === 'NUMERIC' ? (
        <div className="mt-4">
          <label htmlFor={`ans-${item.itemId}`} className="mb-1.5 block text-sm font-medium text-ink-700">
            Đáp án của bạn
          </label>
          <input
            id={`ans-${item.itemId}`}
            inputMode="decimal"
            autoComplete="off"
            disabled={graded || disabled}
            value={value === null || value === undefined ? '' : String(value)}
            onChange={(event) => onChange?.(event.target.value)}
            placeholder="Nhập số, ví dụ 12,5"
            className="w-full max-w-xs rounded-lg border border-ink-200 bg-white px-3 py-2.5 text-lg font-semibold text-ink-800 tabular-nums transition-all focus:border-brand-500 focus:ring-4 focus:ring-brand-100 focus:outline-none disabled:bg-ink-50"
          />
          <p className="mt-1.5 text-xs text-ink-500">Dùng dấu phẩy cho phần thập phân.</p>
        </div>
      ) : null}

      {/* Trả lời ngắn */}
      {item.questionType === 'SHORT_ANSWER' ? (
        <div className="mt-4">
          <label htmlFor={`ans-${item.itemId}`} className="mb-1.5 block text-sm font-medium text-ink-700">
            Đáp án của bạn
          </label>
          <input
            id={`ans-${item.itemId}`}
            autoComplete="off"
            disabled={graded || disabled}
            value={value === null || value === undefined ? '' : String(value)}
            onChange={(event) => onChange?.(event.target.value)}
            className="w-full rounded-lg border border-ink-200 bg-white px-3 py-2.5 text-ink-800 transition-all focus:border-brand-500 focus:ring-4 focus:ring-brand-100 focus:outline-none disabled:bg-ink-50"
          />
        </div>
      ) : null}

      {/* Kết quả chấm cho câu tự luận / điền số */}
      {graded && !isChoice && result ? (
        <div
          className={cx(
            'mt-3 rounded-lg px-3.5 py-2.5 text-sm ring-1 ring-inset',
            result.isCorrect
              ? 'bg-accent-50 text-accent-700 ring-accent-100'
              : 'bg-rose-50 text-rose-900 ring-rose-200',
          )}
        >
          <p className="font-semibold">{result.isCorrect ? 'Chính xác' : 'Chưa đúng'}</p>
          {!result.isCorrect && result.correctAnswer !== undefined ? (
            <p className="mt-0.5">
              Đáp án đúng: <strong>{String(result.correctAnswer)}</strong>
            </p>
          ) : null}
        </div>
      ) : null}

      {/* Lời giải — chỉ hiện sau khi đã chấm */}
      {graded && showSolution && result?.solution ? (
        <div className="animate-fade-up mt-4 rounded-xl bg-ink-50 p-4 ring-1 ring-ink-100">
          <p className="mb-2 text-sm font-semibold text-ink-700">Lời giải</p>
          {result.solutionSteps && result.solutionSteps.length > 0 ? (
            <ol className="mb-3 space-y-1.5">
              {result.solutionSteps.map((stepText, index) => (
                <li key={index} className="flex gap-2.5 text-sm text-ink-700">
                  <span
                    aria-hidden
                    className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-white text-xs font-bold text-brand-700 ring-1 ring-ink-200"
                  >
                    {index + 1}
                  </span>
                  <span className="stem-content">{stepText}</span>
                </li>
              ))}
            </ol>
          ) : null}
          <p className="stem-content text-sm leading-relaxed text-ink-600">{result.solution}</p>
        </div>
      ) : null}
    </div>
  );
}
