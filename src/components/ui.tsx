/**
 * Bộ primitive giao diện dùng chung cho toàn hệ thống.
 *
 * File này KHÔNG dùng hook để cả Server Component lẫn Client Component đều
 * import được. Mọi thứ cần trạng thái nằm ở src/components/motion.tsx.
 *
 * Mọi màn hình chỉ dùng component ở đây — không tự viết class Tailwind rời rạc
 * cho nút, thẻ, ô nhập, để giao diện ba khu vực (học sinh / giáo viên / quản
 * trị) trông như một sản phẩm duy nhất.
 */
import type {
  ButtonHTMLAttributes,
  InputHTMLAttributes,
  ReactNode,
  SelectHTMLAttributes,
  TextareaHTMLAttributes,
} from 'react';
import Link from 'next/link';
import type { MasteryTier } from '@/lib/domain';

export function cx(...values: (string | false | null | undefined)[]): string {
  return values.filter(Boolean).join(' ');
}

// ---------------------------------------------------------------------------
// Button
// ---------------------------------------------------------------------------

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'success' | 'subtle';
type ButtonSize = 'sm' | 'md' | 'lg';

const BUTTON_VARIANT: Record<ButtonVariant, string> = {
  primary:
    'bg-brand-600 text-white shadow-[0_1px_2px_rgb(120_70_45/0.08)] hover:bg-brand-700 hover:shadow-[0_6px_18px_rgb(47_66_224/0.28)]',
  secondary: 'bg-white text-ink-700 ring-1 ring-inset ring-ink-200 hover:bg-ink-50 hover:ring-ink-300',
  ghost: 'bg-transparent text-ink-600 hover:bg-ink-100 hover:text-ink-900',
  subtle: 'bg-brand-50 text-brand-700 hover:bg-brand-100',
  danger: 'bg-rose-600 text-white hover:bg-rose-700',
  success: 'bg-accent-600 text-white hover:bg-accent-700',
};

const BUTTON_SIZE: Record<ButtonSize, string> = {
  sm: 'px-3 py-1.5 text-sm gap-1.5',
  md: 'px-4 py-2.5 text-sm gap-2',
  lg: 'px-6 py-3 text-base gap-2.5',
};

const BUTTON_BASE =
  'press inline-flex items-center justify-center rounded-lg font-medium transition-all duration-200 disabled:pointer-events-none disabled:opacity-55';

/** Vòng quay không cần hook — chỉ là SVG có animation CSS. */
function InlineSpinner() {
  return (
    <svg className="animate-spin-slow h-4 w-4 shrink-0" viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeOpacity="0.25" strokeWidth="3" />
      <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}

export function Button({
  variant = 'primary',
  size = 'md',
  loading = false,
  icon,
  className,
  children,
  disabled,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** Hiện vòng quay và khóa nút — dùng khi đang gửi dữ liệu. */
  loading?: boolean;
  icon?: ReactNode;
}) {
  return (
    <button
      className={cx(BUTTON_BASE, BUTTON_VARIANT[variant], BUTTON_SIZE[size], className)}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...props}
    >
      {loading ? <InlineSpinner /> : icon}
      {children}
    </button>
  );
}

export function LinkButton({
  href,
  variant = 'primary',
  size = 'md',
  icon,
  className,
  children,
}: {
  href: string;
  variant?: ButtonVariant;
  size?: ButtonSize;
  icon?: ReactNode;
  className?: string;
  children: ReactNode;
}) {
  return (
    <Link
      href={href}
      className={cx(BUTTON_BASE, BUTTON_VARIANT[variant], BUTTON_SIZE[size], className)}
    >
      {icon}
      {children}
    </Link>
  );
}

// ---------------------------------------------------------------------------
// Card
// ---------------------------------------------------------------------------

export function Card({
  className,
  children,
  interactive = false,
  padded = true,
}: {
  className?: string;
  children: ReactNode;
  /** Bật hiệu ứng nhấc nhẹ khi rê chuột — chỉ dùng cho thẻ bấm được. */
  interactive?: boolean;
  padded?: boolean;
}) {
  return (
    <div
      className={cx(
        'rounded-xl bg-white ring-1 ring-ink-100 shadow-[0_1px_3px_rgb(120_70_45/0.05)]',
        padded && 'p-5',
        interactive && 'hover-lift cursor-pointer',
        className,
      )}
    >
      {children}
    </div>
  );
}

export function CardHeader({
  title,
  subtitle,
  action,
  icon,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  action?: ReactNode;
  icon?: ReactNode;
}) {
  return (
    <div className="mb-4 flex items-start justify-between gap-3">
      <div className="flex min-w-0 items-start gap-3">
        {icon ? (
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-brand-50 text-brand-700">
            {icon}
          </span>
        ) : null}
        <div className="min-w-0">
          <h2 className="text-base font-semibold text-ink-900">{title}</h2>
          {subtitle ? <p className="mt-0.5 text-sm text-ink-500">{subtitle}</p> : null}
        </div>
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}

export function PageHeader({
  title,
  subtitle,
  action,
  eyebrow,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  action?: ReactNode;
  eyebrow?: ReactNode;
}) {
  return (
    <div className="animate-fade-up mb-6 flex flex-wrap items-end justify-between gap-3">
      <div>
        {eyebrow ? (
          <p className="mb-1 text-xs font-semibold tracking-wider text-brand-700 uppercase">
            {eyebrow}
          </p>
        ) : null}
        <h1 className="text-2xl font-bold tracking-tight text-ink-900">{title}</h1>
        {subtitle ? <p className="mt-1 text-sm text-ink-500">{subtitle}</p> : null}
      </div>
      {action}
    </div>
  );
}

export function Section({
  title,
  description,
  action,
  children,
  className,
}: {
  title?: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={cx('mb-8', className)}>
      {title ? (
        <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
          <div>
            <h2 className="text-lg font-bold text-ink-900">{title}</h2>
            {description ? <p className="mt-0.5 text-sm text-ink-500">{description}</p> : null}
          </div>
          {action}
        </div>
      ) : null}
      {children}
    </section>
  );
}

// ---------------------------------------------------------------------------
// Badge
// ---------------------------------------------------------------------------

type BadgeTone = 'neutral' | 'brand' | 'success' | 'warn' | 'danger' | 'info';

const BADGE_TONE: Record<BadgeTone, string> = {
  neutral: 'bg-ink-100 text-ink-600',
  brand: 'bg-brand-50 text-brand-700',
  success: 'bg-accent-50 text-accent-700',
  warn: 'bg-amber-50 text-amber-700',
  danger: 'bg-rose-50 text-rose-700',
  info: 'bg-sky-50 text-sky-700',
};

const BADGE_DOT: Record<BadgeTone, string> = {
  neutral: 'bg-ink-400',
  brand: 'bg-brand-500',
  success: 'bg-accent-500',
  warn: 'bg-amber-500',
  danger: 'bg-rose-500',
  info: 'bg-sky-500',
};

export function Badge({
  tone = 'neutral',
  dot = false,
  className,
  children,
}: {
  tone?: BadgeTone;
  /** Thêm chấm màu phía trước — giúp phân biệt khi in trắng đen. */
  dot?: boolean;
  className?: string;
  children: ReactNode;
}) {
  return (
    <span
      className={cx(
        'inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium whitespace-nowrap',
        BADGE_TONE[tone],
        className,
      )}
    >
      {dot ? <span className={cx('h-1.5 w-1.5 rounded-full', BADGE_DOT[tone])} aria-hidden /> : null}
      {children}
    </span>
  );
}

export const TIER_TONE: Record<MasteryTier, BadgeTone> = {
  STRONG: 'brand',
  OK: 'info',
  NEEDS_WORK: 'warn',
  GAP: 'danger',
};

export const TIER_BAR_COLOR: Record<MasteryTier, string> = {
  STRONG: 'bg-[#1c5cab]',
  OK: 'bg-[#6da7ec]',
  NEEDS_WORK: 'bg-[#eda100]',
  GAP: 'bg-[#d03b3b]',
};

// ---------------------------------------------------------------------------
// Form
// ---------------------------------------------------------------------------

export function Label({
  htmlFor,
  children,
  hint,
}: {
  htmlFor?: string;
  children: ReactNode;
  hint?: string;
}) {
  return (
    <label htmlFor={htmlFor} className="mb-1.5 block text-sm font-medium text-ink-700">
      {children}
      {hint ? <span className="ml-1 font-normal text-ink-400">{hint}</span> : null}
    </label>
  );
}

const FIELD_BASE =
  'w-full rounded-lg border border-ink-200 bg-white px-3 py-2.5 text-sm text-ink-800 transition-all duration-200 placeholder:text-ink-400 hover:border-ink-300 focus:border-brand-500 focus:ring-4 focus:ring-brand-100 focus:outline-none disabled:bg-ink-50 disabled:text-ink-400';

export function Input({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={cx(FIELD_BASE, className)} {...props} />;
}

export function Textarea({ className, ...props }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={cx(FIELD_BASE, 'min-h-24 resize-y', className)} {...props} />;
}

export function Select({ className, children, ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select className={cx(FIELD_BASE, 'cursor-pointer', className)} {...props}>
      {children}
    </select>
  );
}

export function Field({
  label,
  hint,
  error,
  htmlFor,
  children,
}: {
  label: string;
  hint?: string;
  error?: string | null;
  htmlFor?: string;
  children: ReactNode;
}) {
  return (
    <div className="mb-4">
      <Label htmlFor={htmlFor} hint={hint}>
        {label}
      </Label>
      {children}
      {error ? (
        <p className="animate-fade-down mt-1.5 text-sm text-rose-600" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}

/** Lựa chọn dạng thẻ bấm — dùng cho tự khai mức, chọn mục tiêu, chọn đáp án. */
export function ChoiceCard({
  selected,
  onClick,
  title,
  description,
  badge,
  disabled,
  className,
}: {
  selected: boolean;
  onClick?: () => void;
  title: ReactNode;
  description?: ReactNode;
  badge?: ReactNode;
  disabled?: boolean;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-pressed={selected}
      className={cx(
        'press w-full rounded-xl border-2 p-4 text-left transition-all duration-200 disabled:cursor-not-allowed disabled:opacity-60',
        selected
          ? 'border-brand-500 bg-brand-50/60 shadow-[0_4px_16px_rgb(47_66_224/0.12)]'
          : 'border-ink-200 bg-white hover:border-brand-300 hover:bg-brand-50/30',
        className,
      )}
    >
      <span className="flex items-start justify-between gap-3">
        <span className="min-w-0">
          <span className={cx('block font-semibold', selected ? 'text-brand-800' : 'text-ink-800')}>
            {title}
          </span>
          {description ? (
            <span className="mt-1 block text-sm text-ink-600">{description}</span>
          ) : null}
        </span>
        <span className="flex shrink-0 items-center gap-2">
          {badge}
          <span
            aria-hidden
            className={cx(
              'flex h-5 w-5 items-center justify-center rounded-full border-2 transition-all duration-200',
              selected ? 'border-brand-600 bg-brand-600' : 'border-ink-300 bg-white',
            )}
          >
            {selected ? (
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none">
                <path
                  d="M5 12.5 10 17.5 19 7"
                  stroke="white"
                  strokeWidth="3.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            ) : null}
          </span>
        </span>
      </span>
    </button>
  );
}

// ---------------------------------------------------------------------------
// Alert
// ---------------------------------------------------------------------------

type AlertTone = 'info' | 'success' | 'warn' | 'danger';

const ALERT_TONE: Record<AlertTone, string> = {
  info: 'bg-sky-50 text-sky-900 ring-sky-200',
  success: 'bg-accent-50 text-accent-700 ring-accent-100',
  warn: 'bg-amber-50 text-amber-900 ring-amber-200',
  danger: 'bg-rose-50 text-rose-900 ring-rose-200',
};

const ALERT_ICON: Record<AlertTone, string> = {
  info: 'ℹ',
  success: '✓',
  warn: '!',
  danger: '!',
};

export function Alert({
  tone = 'info',
  title,
  children,
  className,
}: {
  tone?: AlertTone;
  title?: ReactNode;
  children?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cx(
        'animate-fade-up flex gap-3 rounded-lg px-4 py-3 text-sm ring-1 ring-inset',
        ALERT_TONE[tone],
        className,
      )}
      role={tone === 'danger' ? 'alert' : undefined}
    >
      <span
        aria-hidden
        className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-white/70 text-xs font-bold"
      >
        {ALERT_ICON[tone]}
      </span>
      <div className="min-w-0">
        {title ? <p className="font-semibold">{title}</p> : null}
        {children ? <div className={title ? 'mt-1' : undefined}>{children}</div> : null}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tiến độ & thống kê
// ---------------------------------------------------------------------------

export function ProgressBar({
  value,
  max = 100,
  color = 'bg-brand-600',
  className,
}: {
  value: number;
  max?: number;
  color?: string;
  className?: string;
}) {
  const percent = max <= 0 ? 0 : Math.max(0, Math.min(100, (value / max) * 100));
  return (
    <div
      className={cx('h-2 w-full overflow-hidden rounded-full bg-ink-100', className)}
      role="progressbar"
      aria-valuenow={Math.round(percent)}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <div
        className={cx('bar-fill h-full rounded-full', color)}
        style={{ width: `${percent}%` }}
      />
    </div>
  );
}

export function StatTile({
  label,
  value,
  hint,
  tone,
  icon,
  trend,
  className,
}: {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  tone?: BadgeTone;
  icon?: ReactNode;
  /** Chênh lệch so với kỳ trước; dương là tăng. */
  trend?: number;
  className?: string;
}) {
  return (
    <div
      className={cx(
        'hover-lift rounded-xl bg-white p-4 ring-1 ring-ink-100 shadow-[0_1px_3px_rgb(120_70_45/0.05)]',
        className,
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <p className="text-xs font-medium tracking-wide text-ink-500 uppercase">{label}</p>
        {icon ? <span className="text-ink-300">{icon}</span> : null}
      </div>
      <p className="mt-1.5 text-2xl font-bold text-ink-900">{value}</p>
      <div className="mt-1 flex items-center gap-2 text-sm text-ink-500">
        {typeof trend === 'number' && trend !== 0 ? (
          <span
            className={cx(
              'inline-flex items-center gap-0.5 text-xs font-semibold tabular-nums',
              trend > 0 ? 'text-accent-700' : 'text-rose-600',
            )}
          >
            {trend > 0 ? '↑' : '↓'} {Math.abs(trend)}
          </span>
        ) : null}
        {hint ? tone ? <Badge tone={tone}>{hint}</Badge> : <span>{hint}</span> : null}
      </div>
    </div>
  );
}

export function EmptyState({
  title,
  description,
  action,
  icon,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
  icon?: ReactNode;
}) {
  return (
    <div className="animate-fade-up rounded-xl border border-dashed border-ink-200 bg-white/60 px-6 py-12 text-center">
      {icon ? (
        <div className="mb-3 flex justify-center text-3xl text-ink-300" aria-hidden>
          {icon}
        </div>
      ) : null}
      <p className="font-medium text-ink-700">{title}</p>
      {description ? (
        <p className="mx-auto mt-1 max-w-md text-sm text-ink-500">{description}</p>
      ) : null}
      {action ? <div className="mt-4 flex justify-center">{action}</div> : null}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Bảng
// ---------------------------------------------------------------------------

export function Table({ head, children }: { head: ReactNode[]; children: ReactNode }) {
  return (
    <div className="scroll-x rounded-xl bg-white ring-1 ring-ink-100 shadow-[0_1px_3px_rgb(120_70_45/0.05)]">
      <table className="w-full min-w-max text-left text-sm">
        <thead className="border-b border-ink-100 bg-ink-50/70">
          <tr>
            {head.map((cell, index) => (
              <th
                key={index}
                className="px-4 py-3 font-semibold whitespace-nowrap text-ink-600"
                scope="col"
              >
                {cell}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-ink-100">{children}</tbody>
      </table>
    </div>
  );
}

export function Tr({ children, className }: { children: ReactNode; className?: string }) {
  return <tr className={cx('transition-colors hover:bg-brand-50/40', className)}>{children}</tr>;
}

export function Td({ children, className }: { children: ReactNode; className?: string }) {
  return <td className={cx('px-4 py-3 align-middle text-ink-700', className)}>{children}</td>;
}

// ---------------------------------------------------------------------------
// Khác
// ---------------------------------------------------------------------------

export function Divider({ className }: { className?: string }) {
  return <div className={cx('rule-fade my-6', className)} aria-hidden />;
}

/** Hàng bộ lọc — đặt phía trên mọi thứ nó lọc, không nhét vào trong từng thẻ. */
export function FilterBar({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={cx(
        'mb-4 flex flex-wrap items-end gap-3 rounded-xl bg-white p-3 ring-1 ring-ink-100',
        className,
      )}
    >
      {children}
    </div>
  );
}
