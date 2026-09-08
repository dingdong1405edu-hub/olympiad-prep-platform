'use client';

/**
 * TRÌNH THAY ẢNH CỦA TRANG BÁN HÀNG.
 *
 * BỐN QUYẾT ĐỊNH VỀ GIAO DIỆN:
 *
 * 1. Mỗi ô hiện ĐÚNG khung tỉ lệ mà ảnh sẽ nằm vào trên trang thật. Người làm
 *    nội dung không đọc "16 / 9" mà hiểu ngay ảnh sẽ bị cắt ở đâu; nhìn khung
 *    thì hiểu. Ảnh lệch tỉ lệ nhiều thì báo ngay tại chỗ, không đợi họ mở trang
 *    chủ ra mới phát hiện đầu người bị cắt mất.
 *
 * 2. Ô trống nói rõ TRANG SẼ RA SAO KHI ĐỂ TRỐNG ("giữ khiên vẽ sẵn", "ẩn cả
 *    khối"). Không có câu đó thì mọi ô trống trông như một việc còn dang dở, và
 *    người ta tải bừa ảnh lên cho đủ.
 *
 * 3. Ảnh lên NGAY khi chọn tệp, không có nút "Lưu" riêng. Một ô là một ảnh, thao
 *    tác không thể gộp lô như sửa chữ, nên thêm một bước xác nhận chỉ tổ khiến
 *    người dùng tưởng mình chưa lưu.
 *
 * 4. Chữ thay ảnh (alt) nằm ngay dưới khung xem trước chứ không ở tab Chữ. Alt
 *    chỉ viết đúng được khi đang nhìn thấy ảnh. Nó vẫn đi qua đúng API kho chữ,
 *    nên vẫn có "về bản gốc" và vẫn nằm trong nhật ký như mọi câu khác.
 */
import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { apiDelete, apiPut } from '@/lib/client';
import { API } from '@/lib/routes';
import { uploadSiteAsset } from '@/lib/image';
import { Alert, Badge, Button, Card, Input, cx } from '@/components/ui';
import { Toast, useToast } from '@/components/motion';

export interface ImageSlotView {
  key: string;
  label: string;
  hint: string;
  aspect: string;
  recommended: string;
  fallbackNote: string;
  /** Ảnh hiện tại; null = ô còn trống. */
  url: string | null;
  sizeBytes: number | null;
  width: number | null;
  height: number | null;
  /** Chữ thay ảnh đang dùng và bản gốc trong mã nguồn. */
  alt: string;
  defaultAlt: string;
}

export interface ImageGroupView {
  key: string;
  label: string;
  description: string;
  slots: ImageSlotView[];
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** Tỉ lệ khai báo dạng 'rộng / cao' thành một số, để so với ảnh thật. */
function ratioOf(aspect: string): number | null {
  const [w, h] = aspect.split('/').map((part) => Number.parseFloat(part.trim()));
  return Number.isFinite(w) && Number.isFinite(h) && h > 0 ? w / h : null;
}

/**
 * Cảnh báo khi ảnh lệch tỉ lệ khuyến nghị quá 12%.
 *
 * Ngưỡng rộng tay là có chủ ý: ảnh 16:10 đặt vào ô 16:9 chỉ mất một dải mỏng,
 * cảnh báo ở mức đó là gây nhiễu. Nhưng ảnh dọc đặt vào ô ngang thì mất nửa nội
 * dung — đó mới là thứ cần nói trước khi trang lên.
 */
function ratioWarning(slot: ImageSlotView): string | null {
  if (slot.width === null || slot.height === null || slot.height === 0) return null;
  const want = ratioOf(slot.aspect);
  if (want === null) return null;
  const actual = slot.width / slot.height;
  if (Math.abs(actual - want) / want <= 0.12) return null;
  return actual > want
    ? 'Ảnh ngang hơn khung, hai mép trái phải sẽ bị cắt.'
    : 'Ảnh cao hơn khung, phần trên và dưới sẽ bị cắt.';
}

export function ImageEditor({ groups }: { groups: ImageGroupView[] }) {
  const router = useRouter();
  const { toast, show, hide } = useToast();
  const [busySlot, setBusySlot] = useState<string | null>(null);

  const filled = groups.reduce(
    (sum, group) => sum + group.slots.filter((slot) => slot.url !== null).length,
    0,
  );
  const total = groups.reduce((sum, group) => sum + group.slots.length, 0);

  async function upload(slot: string, file: File) {
    setBusySlot(slot);
    try {
      await uploadSiteAsset(slot, file);
      show('Đã tải ảnh lên. Trang công khai cập nhật trong vòng 20 giây.', 'success');
      router.refresh();
    } catch (error) {
      show(error instanceof Error ? error.message : 'Chưa tải được ảnh, thử lại giúp.', 'error');
    } finally {
      setBusySlot(null);
    }
  }

  async function remove(slot: ImageSlotView) {
    if (!window.confirm(`Gỡ ảnh khỏi ô "${slot.label}"?\n\n${slot.fallbackNote}`)) return;
    setBusySlot(slot.key);
    try {
      await apiDelete(API.adminSiteAsset(slot.key));
      show('Đã gỡ ảnh. Ô này quay về mặc định.', 'success');
      router.refresh();
    } catch (error) {
      show(error instanceof Error ? error.message : 'Chưa gỡ được ảnh.', 'error');
    } finally {
      setBusySlot(null);
    }
  }

  return (
    <div className="space-y-5">
      <Toast message={toast.message} tone={toast.tone} onClose={hide} />

      <Alert tone="info" title="Ảnh được nén ngay trên máy bạn trước khi gửi đi">
        Cứ chọn ảnh gốc từ máy ảnh hay điện thoại. Trình duyệt tự thu về tối đa 2000px và chuyển
        sang WEBP, nên ảnh 8MB thường chỉ còn vài trăm KB mà nhìn không khác gì. Logo nền trong
        suốt vẫn giữ được nền trong suốt.
      </Alert>

      <p className="text-sm text-ink-500">
        <strong className="font-semibold text-ink-800">
          {filled}/{total}
        </strong>{' '}
        ô đang có ảnh riêng. Ô còn trống không phải là lỗi — mỗi ô ghi rõ trang sẽ ra sao khi để
        trống.
      </p>

      {groups.map((group) => (
        <Card key={group.key} className="p-0">
          <div className="border-b border-ink-100 px-5 py-4">
            <p className="font-semibold text-ink-900">{group.label}</p>
            <p className="mt-1 text-sm text-ink-500">{group.description}</p>
          </div>

          <div className="grid gap-5 px-5 py-5 sm:grid-cols-2">
            {group.slots.map((slot) => (
              <SlotCard
                key={slot.key}
                slot={slot}
                busy={busySlot === slot.key}
                disabled={busySlot !== null && busySlot !== slot.key}
                onPick={(file) => upload(slot.key, file)}
                onRemove={() => remove(slot)}
                onSavedAlt={(message, tone) => {
                  show(message, tone);
                  if (tone === 'success') router.refresh();
                }}
              />
            ))}
          </div>
        </Card>
      ))}
    </div>
  );
}

function SlotCard({
  slot,
  busy,
  disabled,
  onPick,
  onRemove,
  onSavedAlt,
}: {
  slot: ImageSlotView;
  busy: boolean;
  disabled: boolean;
  onPick: (file: File) => void;
  onRemove: () => void;
  onSavedAlt: (message: string, tone: 'success' | 'error' | 'info') => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [alt, setAlt] = useState(slot.alt);
  const [savingAlt, setSavingAlt] = useState(false);

  const warning = ratioWarning(slot);
  const altDirty = alt !== slot.alt;
  const altCustom = alt.trim() !== slot.defaultAlt.trim();

  function pick(files: FileList | null) {
    const file = files?.[0];
    if (file) onPick(file);
  }

  async function saveAlt() {
    setSavingAlt(true);
    try {
      await apiPut(API.adminSiteCopy, { entries: { [`${slot.key}.alt`]: alt } });
      onSavedAlt('Đã lưu chữ thay ảnh.', 'success');
    } catch (error) {
      onSavedAlt(error instanceof Error ? error.message : 'Chưa lưu được.', 'error');
    } finally {
      setSavingAlt(false);
    }
  }

  return (
    <div className="rounded-xl border border-ink-100 p-4">
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <p className="text-sm font-medium text-ink-700">{slot.label}</p>
        {slot.url ? <Badge tone="brand">Đã có ảnh</Badge> : null}
        {warning ? <Badge tone="warn">Lệch tỉ lệ</Badge> : null}
      </div>

      {/* --- Khung xem trước, đúng tỉ lệ ảnh sẽ nằm vào trên trang thật --- */}
      <div
        onDragOver={(event) => {
          event.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(event) => {
          event.preventDefault();
          setDragging(false);
          if (!disabled && !busy) pick(event.dataTransfer.files);
        }}
        className={cx(
          'relative overflow-hidden rounded-lg border border-dashed transition-colors',
          dragging ? 'border-brand-500 bg-brand-50' : 'border-ink-200 bg-ink-50/60',
        )}
        style={{ aspectRatio: slot.aspect }}
      >
        {slot.url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={slot.url} alt="" className="h-full w-full object-cover" />
        ) : (
          <span className="absolute inset-0 flex items-center justify-center px-4 text-center text-xs text-ink-400">
            Kéo ảnh vào đây hoặc bấm nút bên dưới
          </span>
        )}

        {busy ? (
          <span className="absolute inset-0 flex items-center justify-center bg-white/80 text-sm font-medium text-ink-700">
            Đang xử lý…
          </span>
        ) : null}
      </div>

      <p className="mt-2 text-xs leading-relaxed text-ink-400">{slot.hint}</p>

      <p className="mt-1.5 flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-ink-400">
        <span className="font-mono">{slot.key}</span>
        <span>Khuyến nghị {slot.recommended}</span>
        {slot.width && slot.height ? (
          <span>
            Đang dùng {slot.width}×{slot.height}
            {slot.sizeBytes ? ` · ${formatSize(slot.sizeBytes)}` : ''}
          </span>
        ) : null}
      </p>

      {warning ? <p className="mt-1.5 text-xs text-amber-700">{warning}</p> : null}
      {slot.url ? null : <p className="mt-1.5 text-xs text-ink-500">{slot.fallbackNote}</p>}

      {/* --- Chữ thay ảnh: chỉ viết đúng được khi đang nhìn thấy ảnh --- */}
      <div className="mt-3">
        <label
          htmlFor={`alt-${slot.key}`}
          className="mb-1 flex flex-wrap items-center gap-2 text-xs font-medium text-ink-600"
        >
          Chữ thay ảnh
          {altCustom ? <Badge tone="brand">Đã sửa</Badge> : null}
          {altDirty ? <Badge tone="warn">Chưa lưu</Badge> : null}
        </label>
        <div className="flex gap-2">
          <Input
            id={`alt-${slot.key}`}
            value={alt}
            onChange={(event) => setAlt(event.target.value)}
            placeholder="Để trống nếu ảnh chỉ để trang trí"
          />
          <Button
            type="button"
            variant="ghost"
            onClick={saveAlt}
            loading={savingAlt}
            disabled={!altDirty}
          >
            Lưu
          </Button>
        </div>
      </div>

      {/* --- Thao tác --- */}
      <div className="mt-3 flex flex-wrap gap-2">
        <input
          ref={inputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          className="hidden"
          onChange={(event) => {
            pick(event.target.files);
            // Xóa giá trị để chọn lại ĐÚNG tệp vừa rồi vẫn kích hoạt onChange —
            // tình huống thật khi người dùng sửa ảnh trong Photoshop rồi tải lại.
            event.target.value = '';
          }}
        />
        <Button
          type="button"
          variant="secondary"
          onClick={() => inputRef.current?.click()}
          disabled={busy || disabled}
        >
          {slot.url ? 'Thay ảnh khác' : 'Chọn ảnh'}
        </Button>
        {slot.url ? (
          <Button type="button" variant="ghost" onClick={onRemove} disabled={busy || disabled}>
            Gỡ ảnh
          </Button>
        ) : null}
      </div>
    </div>
  );
}
