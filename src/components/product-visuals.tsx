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
 *
 * BẢNG MÀU: các khối này nằm trên trang bán hàng nền kem nên dùng thang lửa
 * (đỏ → cam → hổ phách) chứ không dùng thang tier bốn màu của khu học tập.
 * Ở đây mức độ đọc được bằng CHIỀU DÀI thanh, màu chỉ đi kèm cho dễ quét mắt;
 * còn trong app thì màu phải tự nó mang nghĩa nên mới cần bốn màu tách bạch.
 */
import { cx } from '@/components/ui';

/** Ba nấc của thang lửa, xếp theo mức thành thạo từ thấp tới cao. */
const RAMP = {
  hot: 'from-brand-600 to-brand-400',
  warm: 'from-brand-400 to-gold-400',
  good: 'from-gold-400 to-gold-300',
} as const;

type RampKey = keyof typeof RAMP;

function MeterRow({
  name,
  value,
  ramp,
  suffix = '%',
}: {
  name: string;
  value: number;
  ramp: RampKey;
  /** Bản đồ kỹ năng hiện "34%", báo cáo phụ huynh hiện "+38". */
  suffix?: string;
}) {
  return (
    <div className="grid grid-cols-[1fr_auto] items-center gap-2.5 border-t border-warm-200 py-2.5 first:border-t-0">
      <div>
        <p className="text-[13px] font-semibold text-warm-800">{name}</p>
        <div className="mt-[7px] h-[7px] overflow-hidden rounded-full bg-warm-100">
          <div
            className={cx('bar-fill h-full rounded-full bg-gradient-to-r', RAMP[ramp])}
            style={{ width: `${value}%` }}
          />
        </div>
      </div>
      <span className="min-w-[38px] text-right text-[12.5px] font-bold text-brand-700 tabular-nums">
        {suffix === '%' ? `${value}%` : suffix}
      </span>
    </div>
  );
}

function CardHead({
  title,
  sub,
  chip,
}: {
  title: string;
  sub: string;
  chip: string;
}) {
  return (
    <div className="mb-4 flex items-center justify-between gap-3">
      <div className="min-w-0">
        <p className="truncate text-[14px] font-bold text-warm-900">{title}</p>
        <p className="mt-0.5 text-[11.5px] text-warm-400">{sub}</p>
      </div>
      <span className="shrink-0 rounded-full bg-warm-100 px-2.5 py-1.5 text-[10.5px] font-bold tracking-wide text-brand-700 uppercase shadow-[inset_0_0_0_1px_var(--color-warm-200)]">
        {chip}
      </span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Bản đồ kỹ năng
// ---------------------------------------------------------------------------

const SKILL_ROWS: { name: string; value: number; ramp: RampKey }[] = [
  { name: 'Quy đồng & so sánh phân số', value: 34, ramp: 'hot' },
  { name: 'Tỉ lệ thức và bài toán tỉ lệ', value: 46, ramp: 'hot' },
  { name: 'Ước chung lớn nhất, bội chung', value: 68, ramp: 'warm' },
  { name: 'Suy luận logic, tìm quy luật', value: 81, ramp: 'good' },
  { name: 'Hình học phẳng cơ bản', value: 90, ramp: 'good' },
];

export function SkillMapVisual({ className }: { className?: string }) {
  return (
    <figure className={cx('p-6', className)}>
      <CardHead
        title="Bản đồ kỹ năng · Toán khối 6"
        sub="Cập nhật sau mỗi câu con làm"
        chip="Cập nhật 2 phút trước"
      />
      {SKILL_ROWS.map((row) => (
        <MeterRow key={row.name} name={row.name} value={row.value} ramp={row.ramp} />
      ))}
    </figure>
  );
}

// ---------------------------------------------------------------------------
// Báo cáo gửi phụ huynh — cùng dạng thanh, nhưng đọc là mức TĂNG sau 14 ngày
// ---------------------------------------------------------------------------

const REPORT_ROWS: { name: string; value: number; ramp: RampKey; delta: string }[] = [
  { name: 'Quy đồng & so sánh phân số', value: 72, ramp: 'hot', delta: '+38' },
  { name: 'Tỉ lệ thức và bài toán tỉ lệ', value: 65, ramp: 'warm', delta: '+19' },
  { name: 'Suy luận logic, tìm quy luật', value: 88, ramp: 'good', delta: '+7' },
];

export function ParentReportVisual({ className }: { className?: string }) {
  return (
    <figure className={cx('p-6', className)}>
      <CardHead
        title="Báo cáo gửi phụ huynh · chu kỳ 4"
        sub="Gửi tự động sau mỗi lần đo"
        chip="14 ngày"
      />
      {REPORT_ROWS.map((row) => (
        <MeterRow
          key={row.name}
          name={row.name}
          value={row.value}
          ramp={row.ramp}
          suffix={row.delta}
        />
      ))}

      <div className="mt-4 rounded-2xl bg-warm-50 p-3.5 shadow-[inset_0_0_0_1px_var(--color-warm-200)]">
        <p className="text-[12.5px] leading-relaxed text-warm-700">
          <strong className="font-bold text-brand-700">Diễn giải:</strong> lỗi quy đồng mẫu đã gần
          như hết. Còn lặp ở bước rút gọn sau khi cộng — hai tuần tới sẽ tập trung vào đây.
        </p>
      </div>
    </figure>
  );
}

// ---------------------------------------------------------------------------
// Việc hôm nay
// ---------------------------------------------------------------------------

const TODAY_ITEMS = [
  {
    title: 'Quy đồng mẫu số — 6 câu',
    meta: 'Vá lỗ hổng · mức 2/5',
    time: '12 phút',
    tone: 'from-brand-600 to-brand-500',
  },
  {
    title: 'Bài toán tỉ lệ nghịch — 5 câu',
    meta: 'Củng cố · mức 3/5',
    time: '14 phút',
    tone: 'from-brand-500 to-brand-400',
  },
  {
    title: 'Tìm quy luật dãy số — 2 câu',
    meta: 'Thử thách · mức 4/5',
    time: '6 phút',
    tone: 'from-brand-400 to-gold-400',
  },
];

export function TodayPlanVisual({ className }: { className?: string }) {
  return (
    <figure className={cx('p-6', className)}>
      <CardHead title="Việc hôm nay · Thứ Ba" sub="Ước tính 32 phút" chip="3 việc" />

      <ol className="space-y-2.5">
        {TODAY_ITEMS.map((item, index) => (
          <li
            key={item.title}
            className="flex gap-3.5 rounded-2xl bg-warm-50 p-3.5 shadow-[inset_0_0_0_1px_var(--color-warm-200)]"
          >
            <span
              aria-hidden
              className={cx(
                'flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br text-[14px] font-extrabold text-white',
                item.tone,
              )}
            >
              {index + 1}
            </span>
            <div className="min-w-0">
              <p className="text-[13.5px] font-bold text-warm-900">{item.title}</p>
              <p className="mt-0.5 text-[11.5px] text-warm-400">{item.meta}</p>
            </div>
            <span className="ml-auto self-center text-[10.5px] font-bold whitespace-nowrap text-brand-700">
              {item.time}
            </span>
          </li>
        ))}
      </ol>
    </figure>
  );
}

// ---------------------------------------------------------------------------
// Đồng hồ độ khó
// ---------------------------------------------------------------------------

/**
 * Chuỗi kết quả gần nhất. Có hai câu sai xen giữa: một dãy toàn dấu đúng trông
 * như quảng cáo, còn đây là thứ khách sẽ thật sự thấy trên màn hình của con.
 */
const RECENT = ['ok', 'ok', 'ok', 'no', 'ok', 'ok', 'no', 'ok', 'na', 'na'] as const;

export function DifficultyDialVisual({ className }: { className?: string }) {
  return (
    <figure className={cx('p-6', className)}>
      <CardHead title="Độ khó đang áp dụng" sub="Tự chỉnh sau từng câu" chip="Mức 3 / 5" />

      <div className="flex flex-col items-start gap-5 sm:flex-row sm:items-center sm:gap-7">
        <svg
          viewBox="0 0 180 108"
          width="180"
          height="108"
          className="shrink-0"
          role="img"
          aria-label="Độ khó đang ở mức 3 trên thang 5 bậc."
        >
          <defs>
            <linearGradient id="dial-ramp" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" stopColor="var(--color-gold-300)" />
              <stop offset="55%" stopColor="var(--color-brand-400)" />
              <stop offset="100%" stopColor="var(--color-brand-600)" />
            </linearGradient>
          </defs>

          <path
            d="M18 96 A 72 72 0 0 1 162 96"
            fill="none"
            stroke="var(--color-warm-200)"
            strokeWidth="15"
            strokeLinecap="round"
          />
          {/* Cung màu vẽ dần khi khối lọt vào màn hình — xem .check-draw ở globals */}
          <path
            d="M18 96 A 72 72 0 0 1 162 96"
            fill="none"
            stroke="url(#dial-ramp)"
            strokeWidth="15"
            strokeLinecap="round"
            strokeDasharray="226"
            strokeDashoffset="0"
            style={{ animation: 'dial-sweep 1.6s var(--ease-out-expo) both' }}
          />
          <circle cx="126" cy="42" r="7" fill="#fff" stroke="var(--color-brand-600)" strokeWidth="4" />
          <text
            x="90"
            y="80"
            textAnchor="middle"
            className="font-display"
            fontSize="34"
            fontWeight="700"
            fill="var(--color-warm-900)"
          >
            3
          </text>
          <text
            x="90"
            y="96"
            textAnchor="middle"
            fontSize="10"
            fontWeight="700"
            fill="var(--color-warm-400)"
          >
            TRÊN 5 BẬC
          </text>
        </svg>

        <ul className="space-y-2.5">
          {[
            { c: 'bg-gold-300', t: 'Bậc 1–2 · xây lại nền' },
            { c: 'bg-brand-400', t: 'Bậc 3 · vùng vừa sức' },
            { c: 'bg-brand-600', t: 'Bậc 4–5 · thử thách' },
          ].map((row) => (
            <li key={row.t} className="flex items-center gap-2.5 text-[12.5px] text-warm-500">
              <span aria-hidden className={cx('h-2.5 w-2.5 shrink-0 rounded-full', row.c)} />
              {row.t}
            </li>
          ))}
        </ul>
      </div>

      <div className="mt-5 flex flex-wrap gap-1.5" aria-hidden>
        {RECENT.map((mark, index) => (
          <span
            key={index}
            className={cx(
              'flex h-[26px] w-[26px] items-center justify-center rounded-lg text-[11px] font-extrabold',
              mark === 'ok' && 'bg-gradient-to-br from-gold-400 to-gold-300 text-[#8a4212]',
              mark === 'no' && 'bg-gradient-to-br from-brand-600 to-brand-500 text-white',
              mark === 'na' && 'bg-warm-100 text-warm-300 shadow-[inset_0_0_0_1px_var(--color-warm-200)]',
            )}
          >
            {mark === 'ok' ? '✓' : mark === 'no' ? '✕' : '·'}
          </span>
        ))}
      </div>
      <p className="mt-3 text-[12px] text-warm-400">
        3 đúng liên tiếp → nâng bậc · 2 sai liên tiếp → hạ bậc
      </p>
    </figure>
  );
}

// ---------------------------------------------------------------------------
// Đường tiến bộ
// ---------------------------------------------------------------------------

/** Điểm đo qua các chu kỳ 14 ngày. Có một nhịp chững ở giữa cho thật. */
const PROGRESS = [32, 44, 51, 68, 84];
const CYCLE_LABELS = ['Đầu vào', 'Chu kỳ 1', 'Chu kỳ 2', 'Chu kỳ 3', 'Chu kỳ 4'];

export function ProgressChartVisual({ className }: { className?: string }) {
  const width = 460;
  const height = 210;
  const left = 60;
  const right = 440;
  const top = 20;
  const bottom = 180;

  const stepX = (right - left) / (PROGRESS.length - 1);
  const scaleY = (value: number) => bottom - (value / 100) * (bottom - top);

  const points = PROGRESS.map((value, index) => ({ x: left + index * stepX, y: scaleY(value) }));
  const line = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x} ${p.y.toFixed(0)}`).join(' ');
  const area = `${line} L${right} ${bottom} L${left} ${bottom} Z`;
  const last = points[points.length - 1]!;

  return (
    <figure className={cx('p-6', className)}>
      <CardHead
        title="Mastery trung bình · 5 chu kỳ"
        sub="Đo bằng câu neo cùng độ khó"
        chip="+52 điểm"
      />

      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="h-auto w-full"
        role="img"
        aria-label="Mastery trung bình tăng từ 32 lên 84 qua bốn chu kỳ đo, có một nhịp chững ở chu kỳ thứ hai."
      >
        <defs>
          <linearGradient id="progress-line" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="var(--color-gold-400)" />
            <stop offset="60%" stopColor="var(--color-brand-400)" />
            <stop offset="100%" stopColor="var(--color-brand-600)" />
          </linearGradient>
          <linearGradient id="progress-fill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--color-brand-400)" stopOpacity="0.2" />
            <stop offset="100%" stopColor="var(--color-brand-400)" stopOpacity="0" />
          </linearGradient>
        </defs>

        {[0, 25, 50, 75, 100].map((tick) => (
          <line
            key={tick}
            x1="34"
            x2="450"
            y1={scaleY(tick)}
            y2={scaleY(tick)}
            stroke="var(--color-warm-200)"
            strokeWidth="1"
          />
        ))}
        {[
          { v: 100, y: 24 },
          { v: 50, y: 104 },
          { v: 0, y: 184 },
        ].map((tick) => (
          <text
            key={tick.v}
            x="26"
            y={tick.y}
            textAnchor="end"
            fontSize="10"
            fill="var(--color-warm-300)"
          >
            {tick.v}
          </text>
        ))}

        <path d={area} fill="url(#progress-fill)" />
        <path
          d={line}
          fill="none"
          stroke="url(#progress-line)"
          strokeWidth="4"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeDasharray="420"
          strokeDashoffset="0"
          style={{ animation: 'line-draw 1.6s var(--ease-out-expo) both' }}
        />

        {points.map((point, index) => (
          <circle
            key={point.x}
            cx={point.x}
            cy={point.y}
            r={index === points.length - 1 ? 6.5 : 5.5}
            fill="#fff"
            stroke={
              index === points.length - 1 ? 'var(--color-brand-600)' : 'var(--color-brand-400)'
            }
            strokeWidth="3.5"
          />
        ))}

        {CYCLE_LABELS.map((label, index) => (
          <text
            key={label}
            x={left + index * stepX}
            y="202"
            textAnchor="middle"
            fontSize="10"
            fontWeight="600"
            fill="var(--color-warm-400)"
          >
            {label}
          </text>
        ))}

        {/* Nhãn cho nhịp chững — thứ mà một biểu đồ quảng cáo sẽ giấu đi */}
        <rect
          x={points[2]!.x - 46}
          y={points[2]!.y + 12}
          width="92"
          height="20"
          rx="6"
          fill="var(--color-warm-100)"
        />
        <text
          x={points[2]!.x}
          y={points[2]!.y + 26}
          textAnchor="middle"
          fontSize="10"
          fontWeight="700"
          fill="var(--color-brand-700)"
        >
          chững 1 chu kỳ
        </text>

        <circle cx={last.x} cy={last.y} r="11" fill="var(--color-brand-500)" opacity="0.16" />
      </svg>
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
        'w-[262px] rounded-2xl bg-white p-4 shadow-[0_26px_50px_-26px_rgb(150_80_50/0.5),inset_0_0_0_1px_var(--color-warm-200)]',
        className,
      )}
    >
      <p className="flex items-center gap-2 text-[10.5px] font-extrabold tracking-[0.12em] text-brand-700 uppercase">
        <span aria-hidden>◆</span> Vì sao bài này
      </p>
      <p className="mt-2.5 text-[13px] leading-relaxed text-warm-700">
        Con sai <strong className="font-bold text-warm-900">4/5 câu</strong> quy đồng mẫu trong 7
        ngày qua, và thời gian làm mỗi câu gấp đôi trung bình.
      </p>
      <span className="mt-3 inline-block rounded-lg bg-warm-100 px-2.5 py-1.5 text-[11px] font-bold text-brand-700">
        Vá lỗ hổng · ưu tiên cao nhất
      </span>
    </div>
  );
}
