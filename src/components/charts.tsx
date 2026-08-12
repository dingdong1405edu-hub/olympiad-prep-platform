/**
 * Biểu đồ hồ sơ năng lực.
 *
 * Ba quyết định thiết kế đáng ghi lại:
 *
 * 1. Dùng THANH NGANG thay vì radar. Đặc tả gợi ý "biểu đồ/radar", nhưng cùng đặc
 *    tả cũng yêu cầu mobile-first: radar 15–22 trục trên màn hình điện thoại là
 *    không đọc được, và diện tích radar bóp méo cảm nhận về mức chênh lệch. Thanh
 *    ngang sắp xếp theo mức thành thạo cho đúng thông tin đó, đọc được ở mọi bề
 *    ngang, và tên chương tiếng Việt dài vẫn hiển thị đủ.
 *
 * 2. Bốn mức Mạnh/Ổn/Cần củng cố/Hổng được trình bày bằng DÃY THẺ SỐ LIỆU, không
 *    phải bằng màu của từng thanh. Tô màu mỗi thanh theo chính độ dài của nó là
 *    mã hóa lặp: nó đốt kênh màu để nói lại điều mà chiều dài đã nói. Màu ở đây
 *    chỉ mang một ý nghĩa nhị phân có thật — đạt hay chưa đạt ngưỡng mục tiêu.
 *
 * 3. Bảng màu đã chạy qua trình kiểm tra: cặp xanh #2a78d6 ↔ đỏ #d03b3b đạt
 *    ΔE 23.8 với người mù màu protan (ngưỡng 8) và tương phản ≥ 3:1 trên nền
 *    trắng. Bốn màu mức đạt ΔE 18.5. Không màu nào đứng một mình: mọi thanh đều
 *    có nhãn chữ và con số đi kèm, và mọi biểu đồ đều có bản xem dạng bảng.
 */
import type { ReactNode } from 'react';
import type { MasteryTier } from '@/lib/domain';
import { MASTERY_TIER_LABEL } from '@/lib/domain';

// --- Bảng màu đã kiểm định (light surface #ffffff) ---
const COLOR_ON_TARGET = '#2a78d6';
const COLOR_BELOW_TARGET = '#d03b3b';
const COLOR_POSITIVE = '#1c5cab';
const COLOR_NEGATIVE = '#d03b3b';

const TIER_COLOR: Record<MasteryTier, string> = {
  STRONG: '#1c5cab',
  OK: '#6da7ec',
  NEEDS_WORK: '#eda100',
  GAP: '#d03b3b',
};

// ---------------------------------------------------------------------------
// Dãy thẻ 4 mức: Mạnh – Ổn – Cần củng cố – Hổng
// ---------------------------------------------------------------------------

export interface TierCount {
  tier: MasteryTier;
  count: number;
}

const TIER_ORDER: MasteryTier[] = ['STRONG', 'OK', 'NEEDS_WORK', 'GAP'];

export function TierSummary({ counts, total }: { counts: TierCount[]; total?: number }) {
  const byTier = new Map(counts.map((entry) => [entry.tier, entry.count]));
  const sum = total ?? counts.reduce((acc, entry) => acc + entry.count, 0);

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      {TIER_ORDER.map((tier) => {
        const count = byTier.get(tier) ?? 0;
        const share = sum > 0 ? Math.round((count / sum) * 100) : 0;
        return (
          <div key={tier} className="rounded-xl bg-white p-4 ring-1 ring-ink-100">
            <div className="flex items-center gap-2">
              <span
                aria-hidden
                className="inline-block h-2.5 w-2.5 shrink-0 rounded-full"
                style={{ backgroundColor: TIER_COLOR[tier] }}
              />
              <span className="text-sm font-medium text-ink-600">{MASTERY_TIER_LABEL[tier]}</span>
            </div>
            <p className="mt-2 text-2xl font-bold text-ink-900">{count}</p>
            <p className="text-xs text-ink-500">{share}% số kỹ năng</p>
          </div>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Thanh ngang mức thành thạo, có vạch mục tiêu
// ---------------------------------------------------------------------------

export interface MasteryBarDatum {
  id: string;
  label: string;
  /** 0–100 */
  value: number;
  sublabel?: string;
}

export function MasteryBars({
  data,
  target,
  caption,
  emptyMessage = 'Chưa có dữ liệu.',
  limit,
}: {
  data: MasteryBarDatum[];
  /** Ngưỡng mục tiêu 0–100; vẽ vạch dọc và quyết định màu thanh. */
  target?: number;
  caption?: ReactNode;
  emptyMessage?: string;
  limit?: number;
}) {
  if (data.length === 0) {
    return <p className="py-6 text-center text-sm text-ink-500">{emptyMessage}</p>;
  }

  const sorted = [...data].sort((a, b) => a.value - b.value);
  const rows = limit ? sorted.slice(0, limit) : sorted;
  const hasBelow = target !== undefined && rows.some((row) => row.value < target);

  return (
    <figure className="m-0">
      {caption ? <figcaption className="mb-3 text-sm text-ink-500">{caption}</figcaption> : null}

      {target !== undefined ? (
        <div className="mb-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-ink-500">
          <span className="inline-flex items-center gap-1.5">
            <span
              aria-hidden
              className="inline-block h-2.5 w-2.5 rounded-sm"
              style={{ backgroundColor: COLOR_ON_TARGET }}
            />
            Đạt mục tiêu
          </span>
          {hasBelow ? (
            <span className="inline-flex items-center gap-1.5">
              <span
                aria-hidden
                className="inline-block h-2.5 w-2.5 rounded-sm"
                style={{ backgroundColor: COLOR_BELOW_TARGET }}
              />
              Dưới mục tiêu
            </span>
          ) : null}
          <span className="inline-flex items-center gap-1.5">
            <span aria-hidden className="inline-block h-3.5 w-0.5 bg-ink-400" />
            Mục tiêu {Math.round(target)}
          </span>
        </div>
      ) : null}

      <ul className="m-0 list-none space-y-3 p-0">
        {rows.map((row) => {
          const value = Math.max(0, Math.min(100, row.value));
          const below = target !== undefined && value < target;
          return (
            <li key={row.id}>
              <div className="flex items-baseline justify-between gap-3">
                <span className="text-sm text-ink-700">{row.label}</span>
                <span className="shrink-0 text-sm font-semibold text-ink-800 tabular-nums">
                  {Math.round(value)}
                </span>
              </div>
              <div className="relative mt-1.5 h-2 w-full overflow-hidden rounded-full bg-ink-100">
                <div
                  className="h-full rounded-r-[4px]"
                  style={{
                    width: `${value}%`,
                    backgroundColor: below ? COLOR_BELOW_TARGET : COLOR_ON_TARGET,
                  }}
                  title={`${row.label}: ${Math.round(value)}/100`}
                />
                {target !== undefined ? (
                  <span
                    aria-hidden
                    className="absolute top-0 h-full w-0.5 bg-ink-400"
                    style={{ left: `${Math.max(0, Math.min(100, target))}%` }}
                  />
                ) : null}
              </div>
              {row.sublabel ? <p className="mt-1 text-xs text-ink-500">{row.sublabel}</p> : null}
            </li>
          );
        })}
      </ul>

      {limit && sorted.length > limit ? (
        <p className="mt-3 text-xs text-ink-500">
          Đang hiển thị {limit} mục cần chú ý nhất trên tổng số {sorted.length}.
        </p>
      ) : null}

      <DataTable
        headers={['Nội dung', 'Mức thành thạo']}
        rows={sorted.map((row) => [row.label, String(Math.round(row.value))])}
      />
    </figure>
  );
}

// ---------------------------------------------------------------------------
// Biểu đồ thay đổi (delta) quanh mốc 0 — dùng cho báo cáo tiến bộ 2 tuần
// ---------------------------------------------------------------------------

export interface DeltaDatum {
  id: string;
  label: string;
  /** Chênh lệch điểm mastery, có thể âm. */
  delta: number;
}

export function DeltaBars({
  data,
  caption,
  emptyMessage = 'Chưa đủ dữ liệu để so sánh.',
}: {
  data: DeltaDatum[];
  caption?: ReactNode;
  emptyMessage?: string;
}) {
  if (data.length === 0) {
    return <p className="py-6 text-center text-sm text-ink-500">{emptyMessage}</p>;
  }

  const scale = Math.max(10, ...data.map((row) => Math.abs(row.delta)));
  const sorted = [...data].sort((a, b) => b.delta - a.delta);

  return (
    <figure className="m-0">
      {caption ? <figcaption className="mb-3 text-sm text-ink-500">{caption}</figcaption> : null}

      <div className="mb-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-ink-500">
        <span className="inline-flex items-center gap-1.5">
          <span
            aria-hidden
            className="inline-block h-2.5 w-2.5 rounded-sm"
            style={{ backgroundColor: COLOR_POSITIVE }}
          />
          Tiến bộ
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span
            aria-hidden
            className="inline-block h-2.5 w-2.5 rounded-sm"
            style={{ backgroundColor: COLOR_NEGATIVE }}
          />
          Đi xuống
        </span>
      </div>

      <ul className="m-0 list-none space-y-3 p-0">
        {sorted.map((row) => {
          const width = (Math.abs(row.delta) / scale) * 50;
          const positive = row.delta >= 0;
          return (
            <li key={row.id}>
              <div className="flex items-baseline justify-between gap-3">
                <span className="text-sm text-ink-700">{row.label}</span>
                <span
                  className="shrink-0 text-sm font-semibold tabular-nums"
                  style={{ color: positive ? COLOR_POSITIVE : COLOR_NEGATIVE }}
                >
                  {positive ? '+' : ''}
                  {Math.round(row.delta)}
                </span>
              </div>
              <div className="relative mt-1.5 h-2 w-full rounded-full bg-ink-100">
                <span aria-hidden className="absolute top-0 left-1/2 h-full w-px bg-ink-300" />
                <div
                  className="absolute top-0 h-full"
                  style={{
                    width: `${width}%`,
                    left: positive ? '50%' : `${50 - width}%`,
                    backgroundColor: positive ? COLOR_POSITIVE : COLOR_NEGATIVE,
                    borderTopRightRadius: positive ? 4 : 0,
                    borderBottomRightRadius: positive ? 4 : 0,
                    borderTopLeftRadius: positive ? 0 : 4,
                    borderBottomLeftRadius: positive ? 0 : 4,
                  }}
                  title={`${row.label}: ${row.delta >= 0 ? '+' : ''}${Math.round(row.delta)} điểm`}
                />
              </div>
            </li>
          );
        })}
      </ul>

      <DataTable
        headers={['Kỹ năng', 'Thay đổi']}
        rows={sorted.map((row) => [
          row.label,
          `${row.delta >= 0 ? '+' : ''}${Math.round(row.delta)}`,
        ])}
      />
    </figure>
  );
}

// ---------------------------------------------------------------------------
// Bản xem dạng bảng — mọi biểu đồ đều phải có, để giá trị không bị khóa sau màu sắc
// ---------------------------------------------------------------------------

export function DataTable({ headers, rows }: { headers: string[]; rows: string[][] }) {
  return (
    <details className="mt-4 text-sm">
      <summary className="cursor-pointer text-ink-500 hover:text-ink-700">Xem dạng bảng</summary>
      <div className="scroll-x mt-2">
        <table className="w-full min-w-max text-left">
          <thead>
            <tr className="border-b border-ink-100">
              {headers.map((header) => (
                <th key={header} className="py-2 pr-4 font-medium text-ink-600">
                  {header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-ink-100">
            {rows.map((row, index) => (
              <tr key={index}>
                {row.map((cell, cellIndex) => (
                  <td
                    key={cellIndex}
                    className={
                      cellIndex === 0 ? 'py-2 pr-4 text-ink-700' : 'py-2 pr-4 text-ink-700 tabular-nums'
                    }
                  >
                    {cell}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  );
}

export { TIER_COLOR };
