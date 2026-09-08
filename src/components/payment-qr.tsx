'use client';

/**
 * Màn hình chờ chuyển khoản: mã QR hiện NGAY TRÊN TRANG này.
 *
 * Chủ đích thiết kế:
 *  - Người dùng KHÔNG bị đá sang tên miền của cổng thanh toán. Đang ở giữa việc
 *    mua khóa học cho con mà bị ném sang một trang lạ là lúc người ta bỏ cuộc.
 *  - Mã QR do server vẽ sẵn thành đường SVG → nét sắc ở mọi màn hình, không tải
 *    ảnh từ bên thứ ba, và tự đổi màu theo giao diện.
 *  - Trạng thái tự cập nhật: cứ vài giây hỏi server một lần, server hỏi lại cổng.
 *    Người dùng chuyển khoản xong là màn hình tự chuyển, không phải bấm "tôi đã
 *    thanh toán" rồi phấp phỏng.
 *  - Mọi thông tin gõ tay được (số tài khoản, số tiền, nội dung) đều có nút chép,
 *    vì không phải điện thoại nào cũng quét được mã trên chính màn hình của nó.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { apiGet, apiPost } from '@/lib/client';
import { API, routes } from '@/lib/routes';
import { bankFromBin, bankLabel } from '@/lib/banks';
import { formatVnd } from '@/lib/domain';
import { Button, cx } from '@/components/ui';
import { usePrefersReducedMotion } from '@/components/motion';
import type { PaymentSession } from '@/server/commerce/service';
import type { QrArtwork } from '@/server/commerce/qr';

/** Nhịp hỏi trạng thái. 3s đủ nhanh để thấy "tức thì" mà không đấm vào cổng. */
const POLL_INTERVAL_MS = 3_000;
/** Sau khi báo thành công, để người dùng kịp đọc rồi mới chuyển màn. */
const SUCCESS_DWELL_MS = 1_800;

// ---------------------------------------------------------------------------
// Mã QR
// ---------------------------------------------------------------------------

/**
 * Vẽ mã QR từ đường SVG server gửi sang.
 * Client KHÔNG mã hóa lại chuỗi VietQR — mọi thứ đã tính sẵn ở server.
 */
function QrCode({
  artwork,
  className,
  svgRef,
}: {
  artwork: QrArtwork;
  className?: string;
  svgRef?: React.Ref<SVGSVGElement>;
}) {
  const span = artwork.size + artwork.quietZone * 2;

  return (
    <svg
      ref={svgRef}
      viewBox={`0 0 ${span} ${span}`}
      className={className}
      role="img"
      aria-label="Mã QR chuyển khoản"
      shapeRendering="crispEdges"
    >
      <rect width={span} height={span} fill="#ffffff" />
      <g transform={`translate(${artwork.quietZone} ${artwork.quietZone})`} fill="#0d1b31">
        <path d={artwork.dataPath} />
        {/* evenodd để vành ô định vị rỗng ruột mà vẫn giữ được nhân đặc ở giữa */}
        <path d={artwork.finderPath} fillRule="evenodd" shapeRendering="geometricPrecision" />
      </g>
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Chép nhanh
// ---------------------------------------------------------------------------

function useCopy(): { copiedKey: string | null; copy: (key: string, value: string) => void } {
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => (timer.current ? clearTimeout(timer.current) : undefined), []);

  const copy = useCallback((key: string, value: string) => {
    const done = () => {
      setCopiedKey(key);
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => setCopiedKey(null), 1_800);
    };

    // navigator.clipboard chỉ có ở ngữ cảnh bảo mật; tụt về execCommand cho HTTP nội bộ.
    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(value).then(done).catch(() => fallbackCopy(value, done));
      return;
    }
    fallbackCopy(value, done);
  }, []);

  return { copiedKey, copy };
}

function fallbackCopy(value: string, done: () => void): void {
  const area = document.createElement('textarea');
  area.value = value;
  area.setAttribute('readonly', '');
  area.style.position = 'fixed';
  area.style.opacity = '0';
  document.body.appendChild(area);
  area.select();
  try {
    document.execCommand('copy');
    done();
  } finally {
    document.body.removeChild(area);
  }
}

function DetailRow({
  label,
  value,
  copyValue,
  copyKey,
  copiedKey,
  onCopy,
  emphasis = false,
  hint,
  compact = false,
}: {
  label: string;
  value: string;
  copyValue?: string;
  copyKey?: string;
  copiedKey?: string | null;
  onCopy?: (key: string, value: string) => void;
  emphasis?: boolean;
  hint?: string;
  /**
   * Nhãn và giá trị nằm CÙNG một dòng. Dành cho những dòng không ai phải gõ tay
   * (tên ngân hàng, chủ tài khoản) — dựng đứng chúng chỉ tốn chiều cao, mà chiều
   * cao ở đây là thứ đắt nhất: mỗi dòng thừa là một lần người dùng phải cuộn.
   */
  compact?: boolean;
}) {
  const copied = copyKey !== undefined && copiedKey === copyKey;

  if (compact) {
    return (
      <div className="flex items-baseline justify-between gap-3 border-b border-ink-100 py-2 last:border-b-0">
        <p className="shrink-0 text-xs font-medium tracking-wide text-ink-500 uppercase">{label}</p>
        <p
          className="min-w-0 truncate text-right text-sm font-semibold text-ink-800"
          title={hint ? `${value} — ${hint}` : value}
        >
          {value}
        </p>
      </div>
    );
  }

  return (
    <div className="flex items-start justify-between gap-3 border-b border-ink-100 py-2.5 last:border-b-0">
      <div className="min-w-0">
        <p className="text-xs font-medium tracking-wide text-ink-500 uppercase">{label}</p>
        <p
          className={cx(
            'mt-0.5 break-all',
            emphasis ? 'text-lg font-bold text-brand-700 tabular-nums' : 'font-semibold text-ink-800',
          )}
        >
          {value}
        </p>
        {hint ? <p className="mt-0.5 text-xs text-ink-500">{hint}</p> : null}
      </div>

      {copyValue && copyKey && onCopy ? (
        <button
          type="button"
          onClick={() => onCopy(copyKey, copyValue)}
          className={cx(
            'press mt-1 inline-flex shrink-0 items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-semibold transition-all duration-200',
            copied
              ? 'bg-accent-50 text-accent-700'
              : 'bg-ink-50 text-ink-600 hover:bg-brand-50 hover:text-brand-700',
          )}
          aria-label={`Chép ${label.toLowerCase()}`}
        >
          {copied ? (
            <>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" aria-hidden>
                <path
                  d="M4 12.5 9.5 18 20 6.5"
                  stroke="currentColor"
                  strokeWidth="3"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
              Đã chép
            </>
          ) : (
            <>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" aria-hidden>
                <rect x="9" y="9" width="11" height="11" rx="2.5" stroke="currentColor" strokeWidth="2" />
                <path
                  d="M15 5.5A2.5 2.5 0 0 0 12.5 3h-7A2.5 2.5 0 0 0 3 5.5v7A2.5 2.5 0 0 0 5.5 15"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                />
              </svg>
              Chép
            </>
          )}
        </button>
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Đếm ngược
// ---------------------------------------------------------------------------

function useCountdown(expiresAt: string | null): { remainingMs: number; expired: boolean } {
  const target = expiresAt ? new Date(expiresAt).getTime() : null;
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (target === null) return;
    const timer = setInterval(() => setNow(Date.now()), 1_000);
    return () => clearInterval(timer);
  }, [target]);

  if (target === null) return { remainingMs: Number.POSITIVE_INFINITY, expired: false };
  const remainingMs = Math.max(0, target - now);
  return { remainingMs, expired: remainingMs <= 0 };
}

/**
 * Dòng "chương trình · tên khóa" mà không nói lặp.
 *
 * Tên khóa trong dữ liệu thật đã mở đầu bằng chính tên chương trình
 * ("ASMOPSS" + "ASMOPSS – Khối 3–4–5 – Toán"), nên ghép thẳng hai trường ra
 * "ASMOPSS · ASMOPSS – Khối 3–4–5 – Toán" — vừa thừa vừa đẩy phần có ích ra
 * ngoài chỗ bị cắt trên màn hình hẹp.
 */
export function courseLine(programName: string, name: string): string {
  const program = programName.trim();
  const course = name.trim();
  if (!program) return course;
  return course.toLowerCase().startsWith(program.toLowerCase()) ? course : `${program} · ${course}`;
}

function formatClock(ms: number): string {
  if (!Number.isFinite(ms)) return '--:--';
  const total = Math.floor(ms / 1000);
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
}

// ---------------------------------------------------------------------------
// Panel chính
// ---------------------------------------------------------------------------

/** Hai cách trả tiền, trên màn hình hẹp chỉ hiện một cách tại một thời điểm. */
type PayTab = 'qr' | 'manual';

export function PaymentQrPanel({
  initialSession,
  onCancelled,
  onClose,
  className,
}: {
  initialSession: PaymentSession;
  /** Gọi khi người dùng hủy đơn — nơi gọi quyết định đóng modal hay điều hướng. */
  onCancelled?: () => void;
  /** Có hàm này thì hiện nút đóng ở góc — dùng khi panel nằm trong lớp phủ. */
  onClose?: () => void;
  className?: string;
}) {
  const router = useRouter();
  const reducedMotion = usePrefersReducedMotion();
  const { copiedKey, copy } = useCopy();

  const [session, setSession] = useState(initialSession);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [tab, setTab] = useState<PayTab>('qr');
  const svgRef = useRef<SVGSVGElement>(null);

  const paid = session.status === 'PAID';
  const closed = session.status === 'CANCELLED' || session.status === 'FAILED';
  const pending = session.status === 'PENDING';

  const { remainingMs, expired } = useCountdown(session.qr?.expiresAt ?? null);
  const qrUsable = pending && session.qr !== null && session.qrArtwork !== null && !expired;

  // --- Hỏi trạng thái định kỳ ------------------------------------------------
  //
  // Dừng hẳn khi tab bị ẩn: điện thoại khóa màn hình rồi mà vẫn gọi mạng là
  // đốt pin của người dùng chẳng để làm gì. Mở lại tab thì hỏi ngay lập tức.
  //
  // Hỏi hụt thì giãn nhịp theo cấp số nhân. Mạng 4G chập chờn hoặc mở nhiều tab
  // cùng lúc có thể làm server trả 429; cứ đều đặn 3 giây một lần mà đâm vào là
  // tự giữ mình ở trạng thái bị chặn.
  const retryAfter = useRef(0);
  const failures = useRef(0);

  const poll = useCallback(async () => {
    if (Date.now() < retryAfter.current) return;
    try {
      const next = await apiGet<PaymentSession>(API.paymentStatus(initialSession.orderCode));
      setSession(next);
      setError(null);
      failures.current = 0;
      retryAfter.current = 0;
    } catch {
      failures.current += 1;
      retryAfter.current = Date.now() + Math.min(30_000, POLL_INTERVAL_MS * 2 ** failures.current);
    }
  }, [initialSession.orderCode]);

  useEffect(() => {
    if (!pending) return;

    let timer: ReturnType<typeof setInterval> | null = null;

    const start = () => {
      if (timer !== null) return;
      timer = setInterval(() => void poll(), POLL_INTERVAL_MS);
    };
    const stop = () => {
      if (timer === null) return;
      clearInterval(timer);
      timer = null;
    };
    const onVisibility = () => {
      if (document.visibilityState === 'visible') {
        void poll();
        start();
      } else {
        stop();
      }
    };

    if (document.visibilityState === 'visible') start();
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      stop();
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [pending, poll]);

  // --- Thành công thì tự đi tiếp ---------------------------------------------
  useEffect(() => {
    if (!paid) return;
    const target = session.enrollmentId
      ? routes.onboarding(session.enrollmentId)
      : routes.myCourses();
    const timer = setTimeout(() => {
      router.push(target);
      router.refresh();
    }, reducedMotion ? 400 : SUCCESS_DWELL_MS);
    return () => clearTimeout(timer);
  }, [paid, session.enrollmentId, router, reducedMotion]);

  // --- Xin mã QR mới khi mã cũ hết hạn ---------------------------------------
  async function refreshQr() {
    setRefreshing(true);
    setError(null);
    try {
      const next = await apiGet<PaymentSession>(API.paymentStatus(initialSession.orderCode));
      setSession(next);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Không tạo được mã mới, vui lòng thử lại.');
    } finally {
      setRefreshing(false);
    }
  }

  async function cancel() {
    setCancelling(true);
    setError(null);
    try {
      const next = await apiPost<PaymentSession>(API.cancelPayment(initialSession.orderCode));
      setSession(next);
      onCancelled?.();
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Không hủy được đơn hàng.');
    } finally {
      setCancelling(false);
    }
  }

  /**
   * Tải mã QR về máy. Rất cần trên điện thoại: không ai quét được mã hiện trên
   * chính màn hình mình đang cầm, nhưng app ngân hàng nào cũng cho chọn ảnh từ
   * thư viện. Vẽ lại từ SVG nên ảnh ra nét ở mọi kích thước.
   */
  function downloadQr() {
    const node = svgRef.current;
    if (!node) return;

    const clone = node.cloneNode(true) as SVGSVGElement;
    clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
    clone.setAttribute('width', '1024');
    clone.setAttribute('height', '1024');

    const source = new XMLSerializer().serializeToString(clone);
    const image = new Image();
    image.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = 1024;
      canvas.height = 1024;
      const context = canvas.getContext('2d');
      if (!context) return;
      context.fillStyle = '#ffffff';
      context.fillRect(0, 0, 1024, 1024);
      context.drawImage(image, 0, 0, 1024, 1024);

      const link = document.createElement('a');
      link.href = canvas.toDataURL('image/png');
      link.download = `QR-${session.orderCode}.png`;
      link.click();
    };
    image.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(source)}`;
  }

  const bank = useMemo(() => bankFromBin(session.qr?.bin), [session.qr?.bin]);

  // -------------------------------------------------------------------------
  // Đã thanh toán
  // -------------------------------------------------------------------------
  if (paid) {
    return (
      <div
        className={cx(
          'animate-scale-in overflow-hidden rounded-2xl bg-white text-center ring-1 ring-accent-100 shadow-[0_18px_48px_-18px_rgb(15_157_112/0.45)]',
          className,
        )}
        role="status"
        aria-live="polite"
      >
        <div className="bg-gradient-to-b from-accent-50 to-white px-6 py-10">
          <span className="animate-pop mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-accent-100">
            <svg width="40" height="40" viewBox="0 0 24 24" fill="none" aria-hidden>
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

          <h2 className="mt-5 text-2xl font-bold text-ink-900">Đã nhận thanh toán</h2>
          <p className="mt-1.5 text-sm text-ink-600">
            {session.amountLabel} · {session.course.name}
          </p>
          <p className="mt-4 text-sm text-ink-500">
            Khóa học đã được kích hoạt. Đang chuyển bạn sang bài kiểm tra đầu vào…
          </p>

          <div className="mt-5 flex justify-center">
            <Button
              size="lg"
              onClick={() =>
                router.push(
                  session.enrollmentId ? routes.onboarding(session.enrollmentId) : routes.myCourses(),
                )
              }
            >
              Bắt đầu ngay
            </Button>
          </div>
        </div>
      </div>
    );
  }

  // -------------------------------------------------------------------------
  // Đơn đã đóng
  // -------------------------------------------------------------------------
  if (closed) {
    return (
      <div
        className={cx(
          'animate-fade-up overflow-y-auto rounded-2xl bg-white p-8 text-center ring-1 ring-ink-100',
          className,
        )}
      >
        <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-ink-100 text-2xl text-ink-400">
          ×
        </span>
        <h2 className="mt-4 text-lg font-bold text-ink-900">
          {session.status === 'CANCELLED' ? 'Đơn hàng đã hủy' : 'Giao dịch không thành công'}
        </h2>
        <p className="mt-1.5 text-sm text-ink-600">
          Mã đơn {session.orderCode} đã đóng. Bạn có thể đặt lại đơn mới bất cứ lúc nào.
        </p>
        <div className="mt-5 flex justify-center gap-2">
          {onClose ? (
            <Button variant="secondary" onClick={onClose}>
              Đóng
            </Button>
          ) : null}
          <Button
            variant={onClose ? 'ghost' : 'secondary'}
            onClick={() => router.push(routes.courses())}
          >
            Xem khóa học
          </Button>
        </div>
      </div>
    );
  }

  // -------------------------------------------------------------------------
  // Đang chờ chuyển khoản
  // -------------------------------------------------------------------------
  const urgent = remainingMs <= 5 * 60_000;

  /**
   * Bố cục ba tầng: ĐẦU và CHÂN ghim cứng, chỉ khúc giữa cuộn.
   *
   * Lý do: trước đây cả panel cuộn chung với trang. Trên điện thoại nó cao khoảng
   * 1000px trong khi màn hình chỉ ~700px, nên lúc người dùng dò số tài khoản thì
   * mã QR và số tiền đã trôi khỏi tầm mắt — phải lướt lên lướt xuống để đối chiếu
   * giữa màn hình mình và app ngân hàng. Giờ số tiền, đồng hồ đếm ngược và nút hủy
   * luôn nằm nguyên chỗ, dù khúc giữa có cuộn thế nào.
   *
   * Nơi gọi quyết định chiều cao bằng `className` (`h-full` trong lớp phủ,
   * `max-h-[…]` khi đặt thẳng trên trang); không truyền gì thì panel cao tự nhiên
   * như cũ và chẳng có gì phải cuộn.
   */
  return (
    <div
      className={cx(
        'animate-scale-in flex flex-col overflow-hidden rounded-2xl bg-white ring-1 ring-ink-100 shadow-[0_24px_64px_-28px_rgb(120_70_45/0.5)]',
        className,
      )}
    >
      {/* --- Đầu panel: số tiền + đồng hồ. GHIM, không cuộn mất ------------- */}
      <header className="grid-faint-soft relative shrink-0 bg-gradient-to-br from-warm-100 via-[#ffe2d0] to-[#ffd0b4] px-5 py-4 sm:px-6">
        <div className="relative flex items-center justify-between gap-3">
          <span className="inline-flex items-center gap-2 rounded-full bg-white/75 px-2.5 py-1 text-xs font-semibold text-brand-700 ring-1 ring-inset ring-white">
            <span className="relative flex h-2 w-2" aria-hidden>
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-brand-500 opacity-75" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-brand-600" />
            </span>
            Đang chờ chuyển khoản
          </span>

          {onClose ? (
            <button
              type="button"
              onClick={onClose}
              aria-label="Đóng màn hình thanh toán"
              className="press flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white/70 text-warm-600 ring-1 ring-inset ring-white transition-colors hover:bg-white hover:text-warm-900"
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden>
                <path d="M6 6l12 12M18 6 6 18" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
              </svg>
            </button>
          ) : null}
        </div>

        <div className="relative mt-3 flex items-end justify-between gap-4">
          <div className="min-w-0">
            <p className="text-[27px] leading-none font-bold tracking-tight text-warm-900 tabular-nums sm:text-3xl">
              {session.amountLabel}
            </p>
            <p className="mt-1.5 truncate text-xs text-warm-600 sm:text-sm">
              {courseLine(session.course.programName, session.course.name)}
            </p>
          </div>

          <div className="shrink-0 text-right">
            <p className="text-[10px] font-semibold tracking-wider text-warm-500 uppercase">Còn hiệu lực</p>
            <p
              className={cx(
                'font-mono text-xl leading-tight font-bold tabular-nums sm:text-2xl',
                urgent ? 'text-rose-600' : 'text-brand-700',
              )}
            >
              {formatClock(remainingMs)}
            </p>
          </div>
        </div>
      </header>

      {/*
        Trên màn hình hẹp, hai cách trả tiền chia thành hai thẻ thay vì xếp chồng.
        Xếp chồng là thứ đẻ ra đúng cái việc lướt lên lướt xuống mà ta đang bỏ đi:
        mỗi thẻ vừa một màn hình, người dùng chọn cách của mình rồi ở yên đó.
        Từ md trở lên màn hình đủ rộng cho cả hai cột nên không cần thẻ nữa.
      */}
      <div className="shrink-0 px-5 pt-3 md:hidden">
        {/*
          Nút bật/tắt thường chứ KHÔNG phải `role="tab"`: từ md trở lên cả hai khối
          cùng hiện một lúc, nên gọi chúng là tab là mô tả sai cho trình đọc màn
          hình. `aria-pressed` nói đúng cái đang xảy ra — một nút đang được chọn.
        */}
        <div className="flex gap-1 rounded-xl bg-ink-50 p-1 ring-1 ring-ink-100" role="group" aria-label="Cách thanh toán">
          {(
            [
              ['qr', 'Quét mã QR'],
              ['manual', 'Chuyển khoản tay'],
            ] as const
          ).map(([key, label]) => (
            <button
              key={key}
              type="button"
              aria-pressed={tab === key}
              onClick={() => setTab(key)}
              className={cx(
                'press flex-1 rounded-lg px-3 py-2 text-sm font-semibold transition-all duration-200',
                tab === key
                  ? 'bg-white text-brand-700 shadow-[0_1px_3px_rgb(120_70_45/0.14)]'
                  : 'text-ink-500 hover:text-ink-700',
              )}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {error ? (
        <p
          className="animate-fade-down shrink-0 border-b border-rose-100 bg-rose-50 px-5 py-2.5 text-sm text-rose-700 sm:px-6"
          role="alert"
        >
          {error}
        </p>
      ) : null}

      {/* --- Vùng cuộn DUY NHẤT của panel ---------------------------------- */}
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="grid gap-5 p-5 md:grid-cols-[minmax(0,264px)_minmax(0,1fr)] md:gap-6 md:p-6">
          {/*
            Mã QR. Từ md trở lên thì DÍNH lại khi cột phải cuộn — mắt người dùng
            đảo qua đảo lại giữa mã QR và bảng số tài khoản, để mã trôi mất là bắt
            họ cuộn ngược lên mỗi lần.

            `self-start` là bắt buộc: ô lưới mặc định kéo giãn hết chiều cao hàng,
            mà một phần tử đã cao bằng vùng cuộn thì chẳng còn chỗ nào để dính.
            `top-6` khớp với lề `md:p-6` của lưới nên lúc dính vẫn còn khoảng thở.
          */}
          <section
            className={cx(
              'md:sticky md:top-6 md:self-start',
              tab === 'qr' ? '' : 'hidden md:block',
            )}
          >
            <div className="relative mx-auto w-full max-w-[248px]">
              {/* Bốn góc vàng: khung ngắm quen thuộc, mắt biết ngay chỗ cần chĩa máy vào */}
              <span className="pointer-events-none absolute -top-1.5 -left-1.5 h-6 w-6 rounded-tl-lg border-t-2 border-l-2 border-gold-400" aria-hidden />
              <span className="pointer-events-none absolute -top-1.5 -right-1.5 h-6 w-6 rounded-tr-lg border-t-2 border-r-2 border-gold-400" aria-hidden />
              <span className="pointer-events-none absolute -bottom-1.5 -left-1.5 h-6 w-6 rounded-bl-lg border-b-2 border-l-2 border-gold-400" aria-hidden />
              <span className="pointer-events-none absolute -right-1.5 -bottom-1.5 h-6 w-6 rounded-br-lg border-r-2 border-b-2 border-gold-400" aria-hidden />

              <div className="relative overflow-hidden rounded-xl bg-white p-3 ring-1 ring-ink-200">
                {qrUsable && session.qrArtwork ? (
                  <>
                    <QrCode artwork={session.qrArtwork} className="block h-auto w-full" svgRef={svgRef} />

                    {/* Huy hiệu giữa mã. Mức sửa lỗi H cho phép che tới ~30% diện tích,
                        ở đây chỉ che ~4% nên không ảnh hưởng khả năng quét. */}
                    <span
                      className="pointer-events-none absolute top-1/2 left-1/2 flex h-[18%] w-[18%] -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-lg bg-white shadow-[0_0_0_3px_#fff]"
                      aria-hidden
                    >
                      <span className="flex h-full w-full items-center justify-center rounded-md bg-brand-600 text-[10px] font-bold text-white">
                        OLP
                      </span>
                    </span>
                  </>
                ) : (
                  <div className="flex aspect-square flex-col items-center justify-center gap-3 rounded-lg bg-ink-50 px-4 text-center">
                    <span className="text-3xl" aria-hidden>
                      ⏱
                    </span>
                    <p className="text-sm font-medium text-ink-700">Mã QR đã hết hạn</p>
                    <Button size="sm" variant="secondary" onClick={refreshQr} loading={refreshing}>
                      Tạo mã mới
                    </Button>
                  </div>
                )}
              </div>
            </div>

            {qrUsable ? (
              <div className="mt-3 flex flex-col gap-2">
                <Button variant="secondary" size="sm" onClick={downloadQr} className="w-full">
                  Lưu ảnh mã QR
                </Button>
                <p className="text-center text-xs leading-relaxed text-ink-500">
                  Đang dùng chính điện thoại này? Lưu ảnh rồi mở app ngân hàng và chọn QR từ thư viện.
                </p>
              </div>
            ) : null}
          </section>

          {/* --- Thông tin chuyển khoản ------------------------------------- */}
          <section className={cx('min-w-0', tab === 'manual' ? '' : 'hidden md:block')}>
            {/* Trên mobile chính cái thẻ đã nói đây là gì rồi — nhắc lại chỉ tốn chiều cao. */}
            <div className="mb-3 hidden items-center gap-2 md:flex">
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-50 text-brand-700" aria-hidden>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                  <path d="M3 10h18M5 10V20h14V10M12 3 3 8h18L12 3Z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
                </svg>
              </span>
              <div>
                <p className="text-sm font-semibold text-ink-900">Hoặc chuyển khoản thủ công</p>
                <p className="text-xs text-ink-500">Dùng khi app ngân hàng không quét được mã</p>
              </div>
            </div>

            {/*
              Hai dòng đầu chỉ để ĐỐI CHIẾU bằng mắt nên gom mỗi dòng một hàng.
              Ba dòng dưới là thứ người dùng phải gõ hoặc chép nên vẫn để dạng đứng,
              chữ to, có nút chép riêng — sai một ký tự ở đây là tiền đi lạc.
            */}
            <div className="rounded-xl bg-ink-50/60 px-4 py-1 ring-1 ring-ink-100">
              <DetailRow compact label="Ngân hàng" value={bankLabel(session.qr?.bin)} hint={bank?.fullName} />
              {session.qr?.accountName ? (
                <DetailRow compact label="Chủ tài khoản" value={session.qr.accountName} />
              ) : null}
              {session.qr?.accountNumber ? (
                <DetailRow
                  label="Số tài khoản"
                  value={session.qr.accountNumber}
                  copyValue={session.qr.accountNumber}
                  copyKey="account"
                  copiedKey={copiedKey}
                  onCopy={copy}
                />
              ) : null}
              <DetailRow
                label="Số tiền"
                value={formatVnd(session.amount)}
                copyValue={String(session.amount)}
                copyKey="amount"
                copiedKey={copiedKey}
                onCopy={copy}
                emphasis
              />
              {session.qr?.transferContent ? (
                <DetailRow
                  label="Nội dung chuyển khoản"
                  value={session.qr.transferContent}
                  copyValue={session.qr.transferContent}
                  copyKey="content"
                  copiedKey={copiedKey}
                  onCopy={copy}
                  hint="Giữ nguyên nội dung này để hệ thống đối soát tự động"
                />
              ) : null}
            </div>

            <ol className="mt-3.5 space-y-1.5 text-[13px] leading-snug text-ink-600">
              {[
                'Mở app ngân hàng và chọn quét mã QR',
                'Kiểm tra số tiền và nội dung khớp với bảng trên',
                'Xác nhận chuyển — trang này tự cập nhật, bạn không cần bấm gì thêm',
              ].map((step, index) => (
                <li key={step} className="flex gap-2">
                  <span className="mt-px flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full bg-brand-50 text-[11px] font-bold text-brand-700">
                    {index + 1}
                  </span>
                  <span>{step}</span>
                </li>
              ))}
            </ol>
          </section>
        </div>
      </div>

      {/* --- Chân panel: GHIM. Nút hủy phải luôn với tới được --------------- */}
      <footer className="shrink-0 border-t border-ink-100 bg-ink-50/60 px-5 py-2.5 sm:px-6">
        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
          {/*
            Chấm nhấp nháy này không phải trang trí: nó trả lời câu hỏi người dùng
            luôn hỏi sau khi bấm chuyển khoản — "xong rồi, giờ tôi phải làm gì nữa?".
            Câu trả lời là không phải làm gì, và nó cần nhìn thấy được mọi lúc.
          */}
          <div className="flex min-w-0 items-center gap-2">
            <span className="relative flex h-2 w-2 shrink-0" aria-hidden>
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-accent-500 opacity-70" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-accent-600" />
            </span>
            <p className="truncate text-xs text-ink-500">
              Tự động kiểm tra · đơn{' '}
              <span className="font-mono font-semibold text-ink-700">{session.orderCode}</span>
            </p>
          </div>

          <div className="flex shrink-0 items-center gap-2">
            {session.qr?.checkoutUrl ? (
              <a
                href={session.qr.checkoutUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="link-underline text-xs font-medium text-ink-500 hover:text-ink-700"
              >
                Gặp trục trặc?
              </a>
            ) : null}
            <Button variant="ghost" size="sm" onClick={cancel} loading={cancelling}>
              Hủy đơn
            </Button>
          </div>
        </div>
      </footer>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Bọc trong lớp phủ
// ---------------------------------------------------------------------------

/**
 * Mở panel thanh toán chồng lên trang hiện tại.
 * Không dùng <dialog> vì cần cuộn được trên màn hình thấp và tự đóng theo phím Esc
 * mà vẫn giữ được hiệu ứng nền mờ đồng nhất với phần còn lại của hệ thống.
 *
 * Lớp phủ này KHÔNG tự cuộn. Nó chỉ dựng một khung cao đúng bằng màn hình rồi
 * giao cho panel; panel tự lo cuộn phần giữa của nó. Trước đây lớp phủ cuộn cả
 * cụm nên đầu panel — số tiền và đồng hồ đếm ngược — trôi mất khi người dùng kéo
 * xuống xem số tài khoản.
 *
 * Bấm ra nền KHÔNG đóng: giữa lúc chuyển tiền mà lỡ tay chạm ra ngoài rồi mất
 * màn hình mã QR là quá đắt. Muốn đóng thì có phím Esc và nút × trên đầu panel.
 */
export function PaymentQrOverlay({
  session,
  onClose,
}: {
  session: PaymentSession;
  onClose: () => void;
}) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);

    // Khóa cuộn nền: cuộn trang phía sau trong lúc quét mã là mất phương hướng.
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = previous;
    };
  }, [onClose]);

  return (
    <div
      className="animate-fade-in fixed inset-0 z-50 flex flex-col bg-warm-900/50 p-3 backdrop-blur-sm sm:p-6"
      role="dialog"
      aria-modal="true"
      aria-label="Thanh toán bằng mã QR"
    >
      {/* `flex-1 min-h-0` cho panel một chiều cao XÁC ĐỊNH để `max-h-full` bám vào. */}
      <div className="mx-auto flex w-full max-w-3xl min-h-0 flex-1 flex-col justify-center">
        <PaymentQrPanel
          initialSession={session}
          onCancelled={onClose}
          onClose={onClose}
          className="max-h-full"
        />
      </div>
    </div>
  );
}
