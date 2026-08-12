'use client';

/**
 * SOẠN MỘT DANH SÁCH CÓ THỨ TỰ, MỖI MỤC GỒM TIÊU ĐỀ + NỘI DUNG.
 *
 * Dùng chung cho ba chỗ có cùng hình dạng dữ liệu nhưng khác ý nghĩa: khối nội
 * dung giới thiệu kỳ thi, câu hỏi thường gặp, và các chặng của khóa học.
 *
 * VÌ SAO KHÔNG ĐỂ NGƯỜI DÙNG GÕ JSON: người soạn nội dung không phải lập trình
 * viên. Một dấu phẩy thừa trong JSON sẽ làm mất cả bài giới thiệu vừa viết, và
 * lỗi hiện ra dưới dạng thông báo cú pháp mà họ không sửa được.
 *
 * Mục để trống hoàn toàn được bỏ qua khi lưu, nên bấm "thêm" rồi đổi ý thì
 * không cần xóa — cứ để đó và lưu bình thường.
 */
import { Button, Input, Label, Textarea } from '@/components/ui';

export interface PairItem {
  title: string;
  body: string;
}

export function PairListEditor({
  items,
  onChange,
  titleLabel,
  bodyLabel,
  addLabel,
  titlePlaceholder,
  bodyPlaceholder,
  max = 20,
}: {
  items: PairItem[];
  onChange: (next: PairItem[]) => void;
  titleLabel: string;
  bodyLabel: string;
  addLabel: string;
  titlePlaceholder?: string;
  bodyPlaceholder?: string;
  max?: number;
}) {
  function update(index: number, patch: Partial<PairItem>) {
    onChange(items.map((item, i) => (i === index ? { ...item, ...patch } : item)));
  }

  function remove(index: number) {
    onChange(items.filter((_, i) => i !== index));
  }

  /** Đổi vị trí một mục — thứ tự trong danh sách chính là thứ tự hiển thị. */
  function move(index: number, delta: number) {
    const target = index + delta;
    if (target < 0 || target >= items.length) return;
    const next = items.slice();
    const [moved] = next.splice(index, 1);
    next.splice(target, 0, moved);
    onChange(next);
  }

  return (
    <div className="space-y-3">
      {items.length === 0 ? (
        <p className="rounded-lg border border-dashed border-ink-200 px-4 py-6 text-center text-sm text-ink-500">
          Chưa có mục nào. Khối này sẽ không hiển thị trên trang.
        </p>
      ) : null}

      {items.map((item, index) => (
        <div key={index} className="rounded-lg border border-ink-200 bg-ink-50/40 p-3">
          <div className="mb-2 flex items-center justify-between gap-2">
            <span className="text-xs font-semibold text-ink-500">Mục {index + 1}</span>
            <span className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => move(index, -1)}
                disabled={index === 0}
                className="rounded px-2 py-1 text-xs text-ink-500 hover:bg-white disabled:opacity-30"
                aria-label="Đưa lên trên"
              >
                ↑
              </button>
              <button
                type="button"
                onClick={() => move(index, 1)}
                disabled={index === items.length - 1}
                className="rounded px-2 py-1 text-xs text-ink-500 hover:bg-white disabled:opacity-30"
                aria-label="Đưa xuống dưới"
              >
                ↓
              </button>
              <button
                type="button"
                onClick={() => remove(index)}
                className="rounded px-2 py-1 text-xs font-medium text-rose-600 hover:bg-white"
              >
                Xóa
              </button>
            </span>
          </div>

          <Label>{titleLabel}</Label>
          <Input
            value={item.title}
            onChange={(event) => update(index, { title: event.target.value })}
            placeholder={titlePlaceholder}
          />

          <div className="mt-2">
            <Label>{bodyLabel}</Label>
            <Textarea
              rows={3}
              value={item.body}
              onChange={(event) => update(index, { body: event.target.value })}
              placeholder={bodyPlaceholder}
            />
          </div>
        </div>
      ))}

      <Button
        type="button"
        variant="ghost"
        onClick={() => onChange([...items, { title: '', body: '' }])}
        disabled={items.length >= max}
      >
        + {addLabel}
      </Button>
    </div>
  );
}

/** Bỏ mục rỗng trước khi gửi lên máy chủ. */
export function cleanPairs(items: PairItem[]): PairItem[] {
  return items
    .map((item) => ({ title: item.title.trim(), body: item.body.trim() }))
    .filter((item) => item.title !== '' && item.body !== '');
}
