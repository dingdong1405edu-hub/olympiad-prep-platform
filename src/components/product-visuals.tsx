/**
 * Ảnh minh họa sản phẩm cho trang bán hàng.
 *
 * Lý do tồn tại: cả lời chào của sản phẩm là "hệ thống biết con bạn yếu chỗ
 * nào". Nói suông thì ai cũng nói được. Mấy khối dưới đây vẽ lại đúng những
 * màn hình học sinh thật sự nhìn thấy — bản đồ kỹ năng, việc hôm nay, đường
 * tiến bộ — để khách tin bằng mắt thay vì bằng tính từ.
 *
 * Dựng bằng HTML/SVG chứ không phải ảnh chụp: nhẹ hơn, nét ở mọi mật độ điểm
 * ảnh, đọc được bằng trình đọc màn hình, và không lỗi thời mỗi lần giao diện
 * thật đổi một chi tiết nhỏ.
 *
 * Số liệu ở đây là MINH HỌA, chọn sao cho giống một hồ sơ có thật: có mảng
 * mạnh, có mảng hổng, tiến bộ không đều. Một biểu đồ toàn màu xanh đi lên
 * thẳng tắp là thứ khiến phụ huynh nghi ngờ chứ không phải tin tưởng.
 */
import { cx } from '@/components/ui';

// ---------------------------------------------------------------------------
// Bản đồ kỹ năng
// ---------------------------------------------------------------------------

const TIERS = {
  strong: { label: 'Mạnh', color: '#1c5cab', bg: 'bg-[#1c5cab]' },
  ok: { label: 'Ổn', color: '#6da7ec', bg: 'bg-[#6da7ec]' },
  warn: { label: 'Cần củng cố', color: '#eda100', bg: 'bg-[#eda100]' },
  gap: { label: 'Hổng', color: '#d03b3b', bg: 'bg-[#d03b3b]' },
} as const;

type TierKey = keyof typeof TIERS;

const SKILL_ROWS: { name: string; value: number; tier: TierKey }[] = [
  { name: 'Số học & chia hết', value: 88, tier: 'strong' },
  { name: 'Phân số, tỉ lệ', value: 74, tier: 'ok' },
  { name: 'Biểu thức đại số', value: 61, tier: 'ok' },
  { name: 'Hình học phẳng', value: 38, tier: 'warn' },
  { name: 'Toán chuyển động', value: 21, tier: 'gap' },
  { name: 'Suy luận logic', value: 46, tier: 'warn' },
];

export function SkillMapVisual({ className }: { className?: string }) {
  return (
    <figure className={cx('overflow-hidden rounded-2xl bg-white', className)}>
      <figcaption className="flex items-center justify-between gap-3 border-b border-ink-100 px-5 py-3.5">
        <div>
          <p className="text-[13px] font-semibold text-ink-900">Bản đồ kỹ năng</p>
          <p className="text-[11px] text-ink-500">Cập nhật sau mỗi câu trả lời</p>
        </div>
        <span className="rounded-full bg-ink-100 px-2.5 py-1 text-[10px] font-semibold tracking-wide text-ink-600 uppercase">
          Khối B · Toán
        </span>
      </figcaption>

      <div className="space-y-3 px-5 py-4">
        {SKILL_ROWS.map((row) => (
          <div key={row.name}>
            <div className="flex items-baseline justify-between gap-3">
              <span className="truncate text-[12.5px] font-medium text-ink-700">{row.name}</span>
              <span
                className="shrink-0 text-[12px] font-bold tabular-nums"
                style={{ color: TIERS[row.tier].color }}
              >
                {row.value}
              </span>
            </div>
            <div className="mt-1.5 h-[7px] w-full overflow-hidden rounded-full bg-ink-100">
              <div
                className="h-full rounded-full"
                style={{ width: `${row.value}%`, backgroundColor: TIERS[row.tier].color }}
              />
            </div>
          </div>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 border-t border-ink-100 bg-ink-50/60 px-5 py-3">
        {(Object.keys(TIERS) as TierKey[]).map((key) => (
          <span key={key} className="flex items-center gap-1.5 text-[11px] text-ink-600">
            <span
              className="h-2 w-2 rounded-full"
              style={{ backgroundColor: TIERS[key].color }}
              aria-hidden
            />
            {TIERS[key].label}
          </span>
        ))}
      </div>
    </figure>
  );
}

// ---------------------------------------------------------------------------
// Việc hôm nay
// ---------------------------------------------------------------------------

const TODAY_ITEMS = [
  { title: 'Vá lỗ hổng: toán chuyển động', meta: '4 câu · dễ → vừa', reason: 'Sai 5/6 câu ở bài đo gần nhất', tone: 'gap' as const, done: true },
  { title: 'Củng cố: hình học phẳng', meta: '5 câu · vừa', reason: 'Đúng nhưng chậm hơn chuẩn 40%', tone: 'warn' as const, done: true },
  { title: 'Thử thách: biểu thức đại số', meta: '3 câu · khó', reason: 'Đã vững mức vừa, nâng độ khó', tone: 'ok' as const, done: false },
];

const TONE_DOT = { gap: '#d03b3b', warn: '#eda100', ok: '#6da7ec' };

export function TodayPlanVisual({ className }: { className?: string }) {
  return (
    <figure className={cx('overflow-hidden rounded-2xl bg-white', className)}>
      <figcaption className="flex items-center justify-between gap-3 border-b border-ink-100 px-5 py-3.5">
        <div>
          <p className="text-[13px] font-semibold text-ink-900">Việc hôm nay</p>
          <p className="text-[11px] text-ink-500">Thứ Ba · khoảng 35 phút</p>
        </div>
        <span className="rounded-full bg-accent-50 px-2.5 py-1 text-[10px] font-bold text-accent-700">
          2/3 xong
        </span>
      </figcaption>

      <ul className="divide-y divide-ink-100">
        {TODAY_ITEMS.map((item) => (
          <li key={item.title} className="flex gap-3 px-5 py-3.5">
            <span
              aria-hidden
              className={cx(
                'mt-0.5 flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full border-2',
                item.done ? 'border-accent-600 bg-accent-600' : 'border-ink-300 bg-white',
              )}
            >
              {item.done ? (
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none">
                  <path
                    d="M5 12.5 10 17.5 19 7"
                    stroke="white"
                    strokeWidth="4"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              ) : null}
            </span>

            <div className="min-w-0 flex-1">
              <p
                className={cx(
                  'text-[12.5px] font-semibold',
                  item.done ? 'text-ink-400 line-through' : 'text-ink-900',
                )}
              >
                {item.title}
              </p>
              <p className="mt-0.5 text-[11px] text-ink-500">{item.meta}</p>
              <p className="mt-1.5 flex items-start gap-1.5 text-[11px] leading-snug text-ink-600">
                <span
                  className="mt-[5px] h-1.5 w-1.5 shrink-0 rounded-full"
                  style={{ backgroundColor: TONE_DOT[item.tone] }}
                  aria-hidden
                />
                <span className="italic">Vì sao: {item.reason}</span>
              </p>
            </div>
          </li>
        ))}
      </ul>
    </figure>
  );
}

// ---------------------------------------------------------------------------
// Đường tiến bộ
// ---------------------------------------------------------------------------

/** Điểm đo qua 5 chu kỳ 14 ngày. Có một nhịp chững ở giữa cho thật. */
const PROGRESS = [32, 44, 51, 49, 63, 71];
const CYCLE_LABELS = ['T0', 'T2', 'T4', 'T6', 'T8', 'T10'];

export function ProgressChartVisual({ className }: { className?: string }) {
  const width = 320;
  const height = 132;
  const padX = 8;
  const padY = 12;

  const stepX = (width - padX * 2) / (PROGRESS.length - 1);
  const scaleY = (value: number) => height - padY - (value / 100) * (height - padY * 2);

  const points = PROGRESS.map((value, index) => ({
    x: padX + index * stepX,
    y: scaleY(value),
    value,
  }));

  const line = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' ');
  const area = `${line} L${points[points.length - 1]!.x.toFixed(1)} ${height - padY} L${padX} ${height - padY} Z`;
  const last = points[points.length - 1]!;

  return (
    <figure className={cx('overflow-hidden rounded-2xl bg-white', className)}>
      <figcaption className="flex items-end justify-between gap-3 border-b border-ink-100 px-5 py-3.5">
        <div>
          <p className="text-[13px] font-semibold text-ink-900">Mastery trung bình</p>
          <p className="text-[11px] text-ink-500">Đo bằng câu neo, 5 chu kỳ</p>
        </div>
        <p className="text-right">
          <span className="text-xl font-bold text-navy-900 tabular-nums">71</span>
          <span className="ml-1.5 text-[11px] font-bold text-accent-700">+39</span>
        </p>
      </figcaption>

      <div className="px-4 pt-3 pb-2">
        <svg
          viewBox={`0 0 ${width} ${height}`}
          className="h-auto w-full"
          role="img"
          aria-label="Mastery trung bình tăng từ 32 lên 71 qua 5 chu kỳ đánh giá, có một nhịp chững ở chu kỳ thứ ba."
        >
          <defs>
            <linearGradient id="progress-fill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--color-navy-500)" stopOpacity="0.22" />
              <stop offset="100%" stopColor="var(--color-navy-500)" stopOpacity="0" />
            </linearGradient>
          </defs>

          {[25, 50, 75].map((tick) => (
            <line
              key={tick}
              x1={padX}
              x2={width - padX}
              y1={scaleY(tick)}
              y2={scaleY(tick)}
              stroke="var(--color-ink-100)"
              strokeWidth="1"
            />
          ))}

          <path d={area} fill="url(#progress-fill)" />
          <path
            d={line}
            fill="none"
            stroke="var(--color-navy-700)"
            strokeWidth="2.4"
            strokeLinecap="round"
            strokeLinejoin="round"
          />

          {points.map((point) => (
            <circle
              key={point.x}
              cx={point.x}
              cy={point.y}
              r="3"
              fill="#fff"
              stroke="var(--color-navy-700)"
              strokeWidth="2"
            />
          ))}

          <circle cx={last.x} cy={last.y} r="5.5" fill="var(--color-gold-400)" />
          <circle cx={last.x} cy={last.y} r="5.5" fill="none" stroke="#fff" strokeWidth="2" />
        </svg>

        <div className="mt-1 flex justify-between px-1">
          {CYCLE_LABELS.map((label) => (
            <span key={label} className="text-[10px] font-medium text-ink-400 tabular-nums">
              {label}
            </span>
          ))}
        </div>
      </div>
    </figure>
  );
}

// ---------------------------------------------------------------------------
// Thẻ "vì sao bài này" — nổi lên trên ảnh hero
// ---------------------------------------------------------------------------

export function WhyThisItemCard({ className }: { className?: string }) {
  return (
    <div
      className={cx(
        'w-[248px] rounded-xl bg-white p-4 shadow-[0_18px_38px_-14px_rgb(13_27_49/0.4),0_0_0_1px_rgb(13_27_49/0.06)]',
        className,
      )}
    >
      <div className="flex items-center gap-2">
        <span className="flex h-6 w-6 items-center justify-center rounded-full bg-gold-100 text-[11px] font-bold text-gold-700">
          ?
        </span>
        <p className="text-[11.5px] font-bold tracking-wide text-ink-800 uppercase">
          Vì sao bài này
        </p>
      </div>
      <p className="mt-2.5 text-[12.5px] leading-relaxed text-ink-600">
        Em sai <strong className="font-semibold text-ink-900">5/6 câu</strong> dạng chuyển động
        ngược chiều ở bài đo gần nhất. Bốn câu hôm nay đi từ dễ lên vừa để dựng lại nền.
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Bảng so sánh mức khó — dùng ở mục tính năng
// ---------------------------------------------------------------------------

export function DifficultyDialVisual({ className }: { className?: string }) {
  const steps = [
    { label: 'Dễ', active: false },
    { label: 'Vừa', active: false },
    { label: 'Khó', active: true },
    { label: 'Rất khó', active: false },
  ];

  return (
    <div className={cx('rounded-2xl bg-white p-5', className)}>
      <p className="text-[13px] font-semibold text-ink-900">Độ khó tự điều chỉnh</p>
      <p className="mt-0.5 text-[11px] text-ink-500">Ba câu đúng liên tiếp → nâng một bậc</p>

      <div className="mt-4 flex items-end gap-1.5">
        {steps.map((step, index) => (
          <div key={step.label} className="flex-1 text-center">
            <div
              className={cx(
                'rounded-t-md transition-all',
                step.active ? 'bg-navy-800' : 'bg-navy-100',
              )}
              style={{ height: `${22 + index * 14}px` }}
            />
            <p
              className={cx(
                'mt-1.5 text-[10.5px] font-medium',
                step.active ? 'text-navy-900' : 'text-ink-400',
              )}
            >
              {step.label}
            </p>
          </div>
        ))}
      </div>

      <p className="mt-3 rounded-lg bg-navy-50 px-3 py-2 text-[11.5px] leading-snug text-navy-700">
        Đang ở mức <strong className="font-semibold">Khó</strong> — em đã đúng 3 câu liền ở mức Vừa.
      </p>
    </div>
  );
}
