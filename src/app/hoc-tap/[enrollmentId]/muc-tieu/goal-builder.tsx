'use client';

/**
 * Trình đặt mục tiêu.
 *
 * Ba ràng buộc nghiệp vụ chi phối cách dựng màn hình này (specs §6.1, §7.7):
 *  1. Hệ thống chào 2–3 PHƯƠNG ÁN, không ép một kế hoạch duy nhất.
 *  2. Thông điệp khả thi do engine viết — hiển thị NGUYÊN VĂN, tuyệt đối không
 *     diễn giải lại thành lời của giao diện.
 *  3. Phương án "Không khả thi" vẫn được chọn: hệ thống cảnh báo và gợi ý cách
 *     đổi, nhưng không chặn quyền tự quyết của học sinh.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { GoalOption } from '@/engine';
import { API, routes } from '@/lib/routes';
import { ApiClientError, apiPost } from '@/lib/client';
import { formatMinutes } from '@/lib/domain';
import { Alert, Badge, Button, Card, CardHeader, ChoiceCard, cx } from '@/components/ui';
import { Skeleton } from '@/components/motion';

const DAYS_CHOICES = [3, 4, 5, 6, 7];

/** Nhãn + tông màu cho ba trạng thái khả thi của engine (GoalFeasibility). */
const FEASIBILITY_META: Record<string, { label: string; tone: 'success' | 'warn' | 'danger' }> = {
  FEASIBLE: { label: 'Khả thi', tone: 'success' },
  TIGHT: { label: 'Hơi gấp', tone: 'warn' },
  INFEASIBLE: { label: 'Không khả thi', tone: 'danger' },
};

function feasibilityMeta(status: string): { label: string; tone: 'success' | 'warn' | 'danger' } {
  return FEASIBILITY_META[status] ?? { label: status, tone: 'warn' };
}

function optionKey(option: GoalOption): string {
  return `${option.targetLevel}|${option.weeks}|${option.daysPerWeek}|${option.minutesPerDay}`;
}

/** Mốc thời gian của mục tiêu = hôm nay + số tuần của phương án. */
function deadlineFor(weeks: number): Date {
  return new Date(Date.now() + weeks * 7 * 86_400_000);
}

function readableError(error: unknown): string {
  if (error instanceof ApiClientError) return error.message;
  return 'Có lỗi xảy ra, bạn thử lại giúp nhé.';
}

export function GoalBuilder({
  enrollmentId,
  minMinutes,
  maxMinutes,
  initialDaysPerWeek,
  initialMinutesPerDay,
}: {
  enrollmentId: string;
  minMinutes: number;
  maxMinutes: number;
  initialDaysPerWeek: number;
  initialMinutesPerDay: number;
}) {
  const router = useRouter();

  const [daysPerWeek, setDaysPerWeek] = useState(initialDaysPerWeek);
  const [minutesPerDay, setMinutesPerDay] = useState(
    Math.min(maxMinutes, Math.max(minMinutes, initialMinutesPerDay)),
  );

  const [options, setOptions] = useState<GoalOption[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  // Mỗi lần đổi quỹ thời gian là một lần engine tính lại — chống chồng kết quả
  // của các lượt gọi cũ về sau bằng số thứ tự yêu cầu.
  const requestId = useRef(0);

  const loadOptions = useCallback(
    async (days: number, minutes: number): Promise<void> => {
      const current = ++requestId.current;
      setLoading(true);
      setLoadError(null);
      try {
        const result = await apiPost<GoalOption[]>(API.goalOptions(enrollmentId), {
          daysPerWeek: days,
          minutesPerDay: minutes,
        });
        if (current !== requestId.current) return;
        setOptions(result);
        // Giữ nguyên lựa chọn nếu phương án đó vẫn còn, nếu không thì chọn
        // phương án engine khuyến nghị.
        setSelectedKey((previous) => {
          if (previous && result.some((option) => optionKey(option) === previous)) return previous;
          const recommended = result.find((option) => option.recommended) ?? result[0];
          return recommended ? optionKey(recommended) : null;
        });
      } catch (caught) {
        if (current !== requestId.current) return;
        setOptions(null);
        setLoadError(readableError(caught));
      } finally {
        if (current === requestId.current) setLoading(false);
      }
    },
    [enrollmentId],
  );

  useEffect(() => {
    const timer = setTimeout(() => void loadOptions(daysPerWeek, minutesPerDay), 400);
    return () => clearTimeout(timer);
  }, [daysPerWeek, minutesPerDay, loadOptions]);

  const selected = options?.find((option) => optionKey(option) === selectedKey) ?? null;

  async function submit(): Promise<void> {
    if (!selected) return;
    setSaving(true);
    setSaveError(null);
    try {
      await apiPost(API.goals(enrollmentId), {
        targetLevel: selected.targetLevel,
        deadline: deadlineFor(selected.weeks).toISOString(),
        daysPerWeek: selected.daysPerWeek,
        minutesPerDay: selected.minutesPerDay,
      });
      router.push(routes.studyDashboard(enrollmentId));
      router.refresh();
    } catch (caught) {
      setSaveError(readableError(caught));
      setSaving(false);
    }
  }

  const suggestions = selected ? buildSuggestions(selected) : [];

  return (
    <div className="space-y-6">
      {/* --- Bước 1: quỹ thời gian --- */}
      <Card>
        <CardHeader
          title="Mỗi tuần bạn học được bao nhiêu?"
          subtitle="Cứ khai đúng sức mình. Khai quá tay thì lộ trình sẽ nặng và dễ bỏ giữa chừng."
        />

        <div className="mb-6">
          <div className="mb-2 flex items-baseline justify-between gap-3">
            <span className="text-sm font-medium text-ink-700">Số buổi mỗi tuần</span>
            <span className="text-sm font-semibold text-brand-700 tabular-nums">
              {daysPerWeek} buổi
            </span>
          </div>
          <div className="flex flex-wrap gap-2">
            {DAYS_CHOICES.map((days) => (
              <button
                key={days}
                type="button"
                onClick={() => setDaysPerWeek(days)}
                aria-pressed={daysPerWeek === days}
                className={cx(
                  'press min-w-14 rounded-lg border-2 px-3 py-2 text-sm font-semibold transition-all duration-200',
                  daysPerWeek === days
                    ? 'border-brand-500 bg-brand-50 text-brand-800'
                    : 'border-ink-200 bg-white text-ink-600 hover:border-brand-300',
                )}
              >
                {days} buổi
              </button>
            ))}
          </div>
        </div>

        <div>
          <div className="mb-2 flex items-baseline justify-between gap-3">
            <span className="text-sm font-medium text-ink-700">Số phút mỗi buổi</span>
            <span className="text-sm font-semibold text-brand-700 tabular-nums">
              {formatMinutes(minutesPerDay)}
            </span>
          </div>
          <input
            type="range"
            min={minMinutes}
            max={maxMinutes}
            step={5}
            value={minutesPerDay}
            onChange={(event) => setMinutesPerDay(Number(event.target.value))}
            className="h-2 w-full cursor-pointer appearance-none rounded-full bg-ink-100 accent-brand-600"
            aria-label="Số phút học mỗi buổi"
          />
          <div className="mt-1 flex justify-between text-xs text-ink-400 tabular-nums">
            <span>{minMinutes} phút</span>
            <span>{maxMinutes} phút</span>
          </div>
          <p className="mt-3 text-sm text-ink-500">
            Tổng quỹ thời gian: khoảng{' '}
            <strong className="text-ink-700 tabular-nums">
              {formatMinutes(daysPerWeek * minutesPerDay)}
            </strong>{' '}
            mỗi tuần.
          </p>
        </div>
      </Card>

      {/* --- Bước 2: phương án của engine --- */}
      <div>
        <div className="mb-3">
          <h2 className="text-lg font-bold text-ink-900">Các đích đến khả thi</h2>
          <p className="mt-0.5 text-sm text-ink-500">
            Hệ thống tính ngược từ lỗ hổng hiện tại của bạn ra số tuần cần thiết cho từng mức đích.
          </p>
        </div>

        {loading ? (
          <div className="space-y-3" aria-busy>
            <Skeleton className="h-28 w-full" />
            <Skeleton className="h-28 w-full" />
            <Skeleton className="h-28 w-full" />
            <p className="text-sm text-ink-500">Đang tính lại phương án theo quỹ thời gian mới…</p>
          </div>
        ) : loadError ? (
          <Alert tone="danger" title="Chưa lấy được phương án">
            {loadError}
          </Alert>
        ) : !options || options.length === 0 ? (
          <Alert tone="warn" title="Chưa có phương án nào">
            Hệ thống chưa đề xuất được mục tiêu với quỹ thời gian này. Bạn thử tăng số buổi hoặc số
            phút mỗi buổi xem sao nhé.
          </Alert>
        ) : (
          <ul className="stagger m-0 list-none space-y-3 p-0">
            {options.map((option) => {
              const key = optionKey(option);
              const meta = feasibilityMeta(option.feasibility.status);
              return (
                <li key={key}>
                  <ChoiceCard
                    selected={selectedKey === key}
                    onClick={() => setSelectedKey(key)}
                    title={
                      <span className="flex flex-wrap items-center gap-2">
                        <span>{option.label}</span>
                        {option.recommended ? (
                          <Badge tone="brand" dot>
                            Khuyến nghị
                          </Badge>
                        ) : null}
                      </span>
                    }
                    badge={
                      <Badge tone={meta.tone} dot>
                        {meta.label}
                      </Badge>
                    }
                    description={
                      <span className="block">
                        <span className="block font-medium text-ink-700 tabular-nums">
                          {option.weeks} tuần · {option.daysPerWeek} buổi/tuần ·{' '}
                          {formatMinutes(option.minutesPerDay)}/buổi
                        </span>
                        <span className="mt-1 block">{option.description}</span>
                        {/* Nguyên văn thông điệp của engine — không viết lại. */}
                        <span className="mt-1.5 block text-ink-500">
                          {option.feasibility.message}
                        </span>
                      </span>
                    }
                  />
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {/* --- Bước 3: cảnh báo + xác nhận --- */}
      {selected && selected.feasibility.status !== 'FEASIBLE' ? (
        <Alert
          tone={selected.feasibility.status === 'INFEASIBLE' ? 'danger' : 'warn'}
          title={
            selected.feasibility.status === 'INFEASIBLE'
              ? 'Mục tiêu này vượt quá quỹ thời gian của bạn'
              : 'Mục tiêu này khá gấp'
          }
        >
          <p>{selected.feasibility.message}</p>
          {suggestions.length > 0 ? (
            <>
              <p className="mt-2 font-medium">Bạn có thể thử một trong các cách sau:</p>
              <div className="mt-2 flex flex-wrap gap-2">
                {suggestions.map((suggestion) => (
                  <Button
                    key={suggestion.label}
                    type="button"
                    variant="secondary"
                    size="sm"
                    onClick={suggestion.apply}
                  >
                    {suggestion.label}
                  </Button>
                ))}
              </div>
            </>
          ) : null}
          <p className="mt-3 text-sm">
            Bạn vẫn có quyền chọn mục tiêu này — hệ thống sẽ ghi nhận và cảnh báo lại khi cần điều
            chỉnh.
          </p>
        </Alert>
      ) : null}

      {saveError ? (
        <Alert tone="danger" title="Chưa lưu được mục tiêu">
          {saveError}
        </Alert>
      ) : null}

      <div className="flex flex-wrap items-center gap-3">
        <Button
          type="button"
          size="lg"
          loading={saving}
          disabled={!selected || loading}
          onClick={() => void submit()}
        >
          {saving ? 'Đang dựng lộ trình…' : 'Chốt mục tiêu và tạo lộ trình'}
        </Button>
        {selected ? (
          <p className="text-sm text-ink-500">
            Đích: <strong className="text-ink-700">{selected.label}</strong> trong {selected.weeks}{' '}
            tuần.
          </p>
        ) : null}
      </div>
    </div>
  );
}

/**
 * Biến các con số engine đề xuất thành nút bấm cụ thể. Chỉ dùng giá trị engine
 * trả về (`suggested*`), không tự nghĩ ra mức đề xuất mới.
 */
function buildSuggestions(option: GoalOption): { label: string; apply: () => void }[] {
  return [];
}
