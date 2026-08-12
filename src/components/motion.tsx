'use client';

/**
 * Bộ chuyển động dùng chung.
 *
 * Nguyên tắc: chuyển động phải PHỤC VỤ VIỆC HIỂU — dẫn mắt tới thứ vừa đổi,
 * cho phản hồi tức thì, gợi ý thứ tự đọc. Không dùng để trang trí.
 * Mọi thành phần ở đây đều tự tắt khi người dùng bật "giảm chuyển động".
 */
import {
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { cx } from '@/components/ui';

/** Người dùng có yêu cầu giảm chuyển động không. */
export function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    const query = window.matchMedia('(prefers-reduced-motion: reduce)');
    setReduced(query.matches);
    const onChange = (event: MediaQueryListEvent) => setReduced(event.matches);
    query.addEventListener('change', onChange);
    return () => query.removeEventListener('change', onChange);
  }, []);

  return reduced;
}

// ---------------------------------------------------------------------------
// Reveal — hiện dần khi cuộn tới
// ---------------------------------------------------------------------------

type RevealDirection = 'up' | 'down' | 'left' | 'right' | 'none';

const HIDDEN_TRANSFORM: Record<RevealDirection, string> = {
  up: 'translateY(18px)',
  down: 'translateY(-18px)',
  left: 'translateX(18px)',
  right: 'translateX(-18px)',
  none: 'none',
};

/**
 * Hiện nội dung khi nó cuộn vào tầm nhìn, CHỈ MỘT LẦN.
 * Lặp lại mỗi lần cuộn qua sẽ gây mệt mắt khi đọc trang dài.
 */
export function Reveal({
  children,
  direction = 'up',
  delay = 0,
  className,
  as: Tag = 'div',
}: {
  children: ReactNode;
  direction?: RevealDirection;
  /** Mili giây. Dùng để xếp lớp thứ tự xuất hiện giữa các khối. */
  delay?: number;
  className?: string;
  as?: 'div' | 'section' | 'li' | 'article';
}) {
  const ref = useRef<HTMLElement | null>(null);
  const [shown, setShown] = useState(false);
  const reduced = usePrefersReducedMotion();

  useEffect(() => {
    if (reduced) {
      setShown(true);
      return;
    }
    const node = ref.current;
    if (!node) return;

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setShown(true);
            observer.disconnect();
          }
        }
      },
      { rootMargin: '0px 0px -8% 0px', threshold: 0.05 },
    );

    observer.observe(node);
    return () => observer.disconnect();
  }, [reduced]);

  return (
    <Tag
      ref={ref as never}
      className={className}
      style={{
        opacity: shown ? 1 : 0,
        transform: shown ? 'none' : HIDDEN_TRANSFORM[direction],
        transition: reduced
          ? undefined
          : `opacity 520ms cubic-bezier(0.16,1,0.3,1) ${delay}ms, transform 520ms cubic-bezier(0.16,1,0.3,1) ${delay}ms`,
        willChange: shown ? undefined : 'opacity, transform',
      }}
    >
      {children}
    </Tag>
  );
}

// ---------------------------------------------------------------------------
// Counter — số chạy tăng dần
// ---------------------------------------------------------------------------

/**
 * Đếm lên tới giá trị đích. Dùng cho các con số thành tích (điểm, phút học,
 * mastery) — chuyển động ở đây giúp học sinh CẢM nhận được mức tăng.
 * Không dùng cho số liệu vận hành trong bảng, ở đó cần đọc ngay.
 */
export function Counter({
  value,
  duration = 900,
  decimals = 0,
  suffix = '',
  prefix = '',
  className,
}: {
  value: number;
  duration?: number;
  decimals?: number;
  suffix?: string;
  prefix?: string;
  className?: string;
}) {
  const [display, setDisplay] = useState(0);
  const reduced = usePrefersReducedMotion();

  useEffect(() => {
    if (reduced || duration <= 0) {
      setDisplay(value);
      return;
    }

    let frame = 0;
    const start = performance.now();
    const from = 0;

    const tick = (now: number) => {
      const progress = Math.min(1, (now - start) / duration);
      // easeOutExpo: nhanh lúc đầu, dừng êm ở đích
      const eased = progress === 1 ? 1 : 1 - Math.pow(2, -10 * progress);
      setDisplay(from + (value - from) * eased);
      if (progress < 1) frame = requestAnimationFrame(tick);
    };

    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [value, duration, reduced]);

  const text = display.toLocaleString('vi-VN', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });

  return (
    <span className={className}>
      {prefix}
      {text}
      {suffix}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Thanh tiến độ có chuyển động
// ---------------------------------------------------------------------------

export function AnimatedBar({
  value,
  max = 100,
  color = 'bg-brand-600',
  height = 'h-2',
  delay = 0,
  className,
}: {
  value: number;
  max?: number;
  color?: string;
  height?: string;
  delay?: number;
  className?: string;
}) {
  const percent = max <= 0 ? 0 : Math.max(0, Math.min(100, (value / max) * 100));
  const [width, setWidth] = useState(0);
  const reduced = usePrefersReducedMotion();

  useEffect(() => {
    if (reduced) {
      setWidth(percent);
      return;
    }
    const timer = setTimeout(() => setWidth(percent), 60 + delay);
    return () => clearTimeout(timer);
  }, [percent, delay, reduced]);

  return (
    <div className={cx('w-full overflow-hidden rounded-full bg-ink-100', height, className)}>
      <div
        className={cx('h-full rounded-full', color)}
        style={{
          width: `${width}%`,
          transition: reduced ? undefined : 'width 780ms cubic-bezier(0.16,1,0.3,1)',
        }}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Vòng tiến độ
// ---------------------------------------------------------------------------

export function ProgressRing({
  value,
  max = 100,
  size = 88,
  stroke = 8,
  color = 'var(--color-brand-600)',
  label,
}: {
  value: number;
  max?: number;
  size?: number;
  stroke?: number;
  color?: string;
  label?: ReactNode;
}) {
  const percent = max <= 0 ? 0 : Math.max(0, Math.min(100, (value / max) * 100));
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;

  const [offset, setOffset] = useState(circumference);
  const reduced = usePrefersReducedMotion();

  useEffect(() => {
    const target = circumference * (1 - percent / 100);
    if (reduced) {
      setOffset(target);
      return;
    }
    const timer = setTimeout(() => setOffset(target), 80);
    return () => clearTimeout(timer);
  }, [percent, circumference, reduced]);

  return (
    <div className="relative inline-flex items-center justify-center">
      <svg width={size} height={size} className="-rotate-90" aria-hidden>
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="var(--color-ink-100)"
          strokeWidth={stroke}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          style={{ transition: reduced ? undefined : 'stroke-dashoffset 900ms cubic-bezier(0.16,1,0.3,1)' }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
        {label ?? <span className="text-lg font-bold text-ink-900">{Math.round(percent)}%</span>}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Trạng thái tải
// ---------------------------------------------------------------------------

export function Skeleton({ className }: { className?: string }) {
  return <div className={cx('skeleton', className)} aria-hidden />;
}

export function SkeletonText({ lines = 3, className }: { lines?: number; className?: string }) {
  return (
    <div className={cx('space-y-2', className)} aria-hidden>
      {Array.from({ length: lines }).map((_, index) => (
        <div
          key={index}
          className="skeleton h-3.5"
          style={{ width: index === lines - 1 ? '65%' : '100%' }}
        />
      ))}
    </div>
  );
}

export function Spinner({ className, label }: { className?: string; label?: string }) {
  return (
    <span className="inline-flex items-center gap-2" role="status">
      <svg
        className={cx('animate-spin-slow', className ?? 'h-4 w-4')}
        viewBox="0 0 24 24"
        fill="none"
        aria-hidden
      >
        <circle cx="12" cy="12" r="9" stroke="currentColor" strokeOpacity="0.2" strokeWidth="3" />
        <path
          d="M21 12a9 9 0 0 0-9-9"
          stroke="currentColor"
          strokeWidth="3"
          strokeLinecap="round"
        />
      </svg>
      {label ? <span className="text-sm">{label}</span> : <span className="sr-only">Đang tải</span>}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Phản hồi đúng / sai khi làm bài
// ---------------------------------------------------------------------------

/** Dấu tích được vẽ ra — dùng ngay sau khi học sinh trả lời đúng. */
export function CheckMark({ size = 40 }: { size?: number }) {
  return (
    <span
      className="animate-pop inline-flex items-center justify-center rounded-full bg-accent-100"
      style={{ width: size, height: size }}
    >
      <svg width={size * 0.55} height={size * 0.55} viewBox="0 0 24 24" fill="none" aria-hidden>
        <path
          className="check-draw"
          d="M4 12.5 9.5 18 20 6.5"
          stroke="var(--color-accent-600)"
          strokeWidth="3"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </span>
  );
}

/** Dấu chéo cho câu trả lời sai — nhẹ nhàng, không rung lắc gây áp lực. */
export function CrossMark({ size = 40 }: { size?: number }) {
  return (
    <span
      className="animate-pop inline-flex items-center justify-center rounded-full bg-rose-50"
      style={{ width: size, height: size }}
    >
      <svg width={size * 0.5} height={size * 0.5} viewBox="0 0 24 24" fill="none" aria-hidden>
        <path
          className="check-draw"
          d="M6 6l12 12M18 6L6 18"
          stroke="#d03b3b"
          strokeWidth="3"
          strokeLinecap="round"
        />
      </svg>
    </span>
  );
}

// ---------------------------------------------------------------------------
// Đóng / mở mềm
// ---------------------------------------------------------------------------

export function Collapse({ open, children }: { open: boolean; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const [height, setHeight] = useState(0);
  const reduced = usePrefersReducedMotion();

  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    setHeight(open ? node.scrollHeight : 0);
  }, [open, children]);

  return (
    <div
      style={{
        height: open ? height : 0,
        overflow: 'hidden',
        transition: reduced ? undefined : 'height 320ms cubic-bezier(0.16,1,0.3,1)',
      }}
    >
      <div ref={ref}>{children}</div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Thông báo nổi
// ---------------------------------------------------------------------------

export type ToastTone = 'success' | 'error' | 'info';

const TOAST_TONE: Record<ToastTone, string> = {
  success: 'bg-accent-600 text-white',
  error: 'bg-rose-600 text-white',
  info: 'bg-ink-800 text-white',
};

/**
 * Thông báo ngắn ở góc màn hình. Dùng cho việc đã lưu, đã gửi, có lỗi mạng —
 * những thứ không đáng chiếm cả màn hình nhưng phải cho người dùng biết.
 */
export function Toast({
  message,
  tone = 'info',
  onClose,
  duration = 3200,
}: {
  message: string | null;
  tone?: ToastTone;
  onClose: () => void;
  duration?: number;
}) {
  useEffect(() => {
    if (!message) return;
    const timer = setTimeout(onClose, duration);
    return () => clearTimeout(timer);
  }, [message, duration, onClose]);

  if (!message) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed inset-x-0 bottom-5 z-50 flex justify-center px-4 sm:justify-end sm:px-6"
    >
      <div
        className={cx(
          'animate-fade-up pointer-events-auto flex max-w-sm items-center gap-3 rounded-xl px-4 py-3 text-sm font-medium shadow-lg',
          TOAST_TONE[tone],
        )}
      >
        <span>{message}</span>
        <button
          type="button"
          onClick={onClose}
          className="ml-auto shrink-0 opacity-70 transition-opacity hover:opacity-100"
          aria-label="Đóng thông báo"
        >
          ✕
        </button>
      </div>
    </div>
  );
}

/** Quản lý một thông báo tại một thời điểm — đủ cho mọi màn hình trong hệ thống. */
export function useToast() {
  const [state, setState] = useState<{ message: string | null; tone: ToastTone }>({
    message: null,
    tone: 'info',
  });

  return {
    toast: state,
    show: (message: string, tone: ToastTone = 'info') => setState({ message, tone }),
    hide: () => setState((prev) => ({ ...prev, message: null })),
  };
}
