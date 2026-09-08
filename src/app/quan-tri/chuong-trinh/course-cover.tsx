'use client';

/**
 * Ô ẢNH ĐẠI DIỆN CỦA MỘT KHÓA HỌC.
 *
 * Vì sao không nằm cùng biểu mẫu khóa học: phần còn lại của biểu mẫu gửi JSON
 * qua `/api/v1/admin/courses`, còn ảnh là nhị phân nên phải đi
 * `multipart/form-data` qua `/api/v1/admin/site-assets`. Trộn hai thứ vào một
 * lần bấm "Lưu" nghĩa là có lúc chữ lưu xong mà ảnh thất bại (hoặc ngược lại),
 * và người dùng không có cách nào biết nửa nào đã vào. Ở đây ảnh lưu NGAY khi
 * chọn tệp, độc lập với nút Lưu của biểu mẫu — bấm Hủy cũng không lấy lại ảnh
 * cũ, và điều đó được nói thẳng dưới khung xem trước.
 *
 * Ô này chỉ hiện khi SỬA khóa đã có. Khóa mới chưa có mã khối–môn chốt lại thì
 * chưa có khóa ô để ghi ảnh vào.
 */

import { useRef, useState } from 'react';
import { Alert, Button } from '@/components/ui';

const MAX_MB = 5;

export function CourseCoverField({
  slot,
  initialUrl,
  disabled = false,
}: {
  /** Khóa ô ảnh, dựng bằng `courseCoverSlot()` ở phía server. */
  slot: string;
  initialUrl: string | null;
  disabled?: boolean;
}) {
  const [url, setUrl] = useState(initialUrl);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  async function upload(file: File) {
    setError(null);
    setNote(null);

    if (file.size > MAX_MB * 1024 * 1024) {
      setError(`Ảnh nặng quá ${MAX_MB}MB. Hãy chọn ảnh nhỏ hơn.`);
      return;
    }

    setBusy(true);
    try {
      const body = new FormData();
      body.set('slot', slot);
      body.set('file', file);
      const response = await fetch('/api/v1/admin/site-assets', { method: 'POST', body });
      const json = await response.json();
      if (!response.ok || !json?.ok) {
        throw new Error(json?.error?.message ?? 'Không tải được ảnh lên.');
      }
      setUrl(json.data.url as string);
      setNote('Đã lưu ảnh đại diện.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Không tải được ảnh lên.');
    } finally {
      setBusy(false);
      // Cho phép chọn lại đúng tệp vừa rồi sau khi sửa ảnh ngoài máy.
      if (inputRef.current) inputRef.current.value = '';
    }
  }

  async function remove() {
    setError(null);
    setNote(null);
    setBusy(true);
    try {
      const response = await fetch(`/api/v1/admin/site-assets/${encodeURIComponent(slot)}`, {
        method: 'DELETE',
      });
      const json = await response.json();
      if (!response.ok || !json?.ok) {
        throw new Error(json?.error?.message ?? 'Không gỡ được ảnh.');
      }
      setUrl(null);
      setNote('Đã gỡ ảnh. Thẻ khóa học quay về nền chuyển màu.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Không gỡ được ảnh.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="sm:col-span-2 lg:col-span-3">
      <p className="mb-1.5 block text-sm font-medium text-ink-700">
        Ảnh đại diện khóa học
        <span className="ml-1 font-normal text-ink-400">
          hiện trên thẻ ở trang danh mục và đầu trang giới thiệu khóa
        </span>
      </p>

      <div className="flex flex-wrap items-start gap-4">
        <div
          className="w-64 shrink-0 overflow-hidden rounded-xl border border-ink-200 bg-ink-50"
          style={{ aspectRatio: '16 / 9' }}
        >
          {url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={url} alt="" className="h-full w-full object-cover" />
          ) : (
            <div className="grid h-full place-items-center px-3 text-center text-xs text-ink-400">
              Chưa có ảnh — thẻ khóa học đang dùng nền chuyển màu theo màu kỳ thi
            </div>
          )}
        </div>

        <div className="min-w-52 flex-1">
          <input
            ref={inputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            disabled={disabled || busy}
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) void upload(file);
            }}
            className="block w-full text-sm text-ink-600 file:mr-3 file:rounded-lg file:border-0 file:bg-ink-100 file:px-3 file:py-2 file:text-sm file:font-medium file:text-ink-700 hover:file:bg-ink-200 disabled:opacity-50"
          />
          <p className="mt-2 text-xs text-ink-500">
            Ảnh ngang, khuyến nghị 1200×675. Chủ thể nên nằm giữa — hai bên có thể bị cắt trên máy
            điện thoại. Nhận JPEG, PNG hoặc WEBP, tối đa {MAX_MB}MB.
          </p>
          <p className="mt-1 text-xs text-ink-400">
            Ảnh lưu ngay khi chọn tệp, không chờ nút “Lưu khóa học”.
          </p>

          {url ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="mt-2"
              disabled={disabled || busy}
              onClick={() => void remove()}
            >
              Gỡ ảnh
            </Button>
          ) : null}
        </div>
      </div>

      {error ? (
        <Alert tone="danger" className="mt-3">
          {error}
        </Alert>
      ) : null}
      {note && !error ? (
        <Alert tone="success" className="mt-3">
          {note}
        </Alert>
      ) : null}
    </div>
  );
}
