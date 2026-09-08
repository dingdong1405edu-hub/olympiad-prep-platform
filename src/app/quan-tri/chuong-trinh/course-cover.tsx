'use client';

/**
 * Ô ẢNH ĐẠI DIỆN CỦA MỘT KHÓA HỌC.
 *
 * Ô này chạy ở HAI chế độ, vì hai biểu mẫu có hai tình huống khác nhau:
 *
 *   sửa khóa  (`slot` có giá trị)  → chọn tệp là đẩy lên ngay, độc lập với nút
 *                                    "Lưu khóa học".
 *   tạo khóa  (`slot` là null)     → giữ tệp lại, chờ khóa học được tạo xong.
 *
 * Vì sao tạo khóa không đẩy ngay: khóa ô ảnh dựng từ mã kỳ thi + khối + môn, mà
 * lúc đang tạo thì khối và môn còn đổi được. Đẩy ngay rồi người dùng đổi khối
 * hoặc bấm Hủy là bỏ lại một tấm ảnh không thuộc khóa nào, không ai thấy để dọn.
 *
 * Vì sao sửa khóa lại đẩy ngay: phần còn lại của biểu mẫu gửi JSON, còn ảnh
 * phải đi multipart. Gộp vào một lần bấm "Lưu" nghĩa là có lúc chữ lưu xong mà
 * ảnh thất bại, và người dùng không có cách nào biết nửa nào đã vào.
 */

import { useEffect, useRef, useState } from 'react';
import { Alert, Button } from '@/components/ui';
import { COVER_MAX_MB, deleteCover, uploadCover } from './cover-api';

export function CourseCoverField({
  slot,
  initialUrl,
  onPick,
  disabled = false,
}: {
  /** Khóa ô ảnh khi sửa khóa đã có; `null` khi đang tạo khóa mới. */
  slot: string | null;
  initialUrl: string | null;
  /** Chỉ dùng ở chế độ tạo khóa: giao tệp cho biểu mẫu giữ tới lúc lưu. */
  onPick?: (file: File | null) => void;
  disabled?: boolean;
}) {
  const [url, setUrl] = useState(initialUrl);
  const [pendingName, setPendingName] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const previewRef = useRef<string | null>(null);

  // Ảnh xem trước ở chế độ tạo khóa là blob trong bộ nhớ trình duyệt; không thu
  // hồi thì mỗi lần chọn lại tệp là rò thêm một khối.
  useEffect(
    () => () => {
      if (previewRef.current) URL.revokeObjectURL(previewRef.current);
    },
    [],
  );

  function showLocalPreview(file: File) {
    if (previewRef.current) URL.revokeObjectURL(previewRef.current);
    previewRef.current = URL.createObjectURL(file);
    setUrl(previewRef.current);
  }

  async function pick(file: File) {
    setError(null);
    setNote(null);

    if (file.size > COVER_MAX_MB * 1024 * 1024) {
      setError(`Ảnh nặng quá ${COVER_MAX_MB}MB. Hãy chọn ảnh nhỏ hơn.`);
      return;
    }

    // --- Tạo khóa mới: chỉ giữ tệp, chưa gửi đi đâu ---
    if (!slot) {
      showLocalPreview(file);
      setPendingName(file.name);
      onPick?.(file);
      setNote('Ảnh sẽ được lưu ngay sau khi khóa học được tạo.');
      return;
    }

    // --- Sửa khóa đã có: đẩy lên luôn ---
    setBusy(true);
    try {
      setUrl(await uploadCover(slot, file));
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

    if (!slot) {
      if (previewRef.current) {
        URL.revokeObjectURL(previewRef.current);
        previewRef.current = null;
      }
      setUrl(null);
      setPendingName(null);
      onPick?.(null);
      if (inputRef.current) inputRef.current.value = '';
      return;
    }

    setBusy(true);
    try {
      await deleteCover(slot);
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
              if (file) void pick(file);
            }}
            className="block w-full text-sm text-ink-600 file:mr-3 file:rounded-lg file:border-0 file:bg-ink-100 file:px-3 file:py-2 file:text-sm file:font-medium file:text-ink-700 hover:file:bg-ink-200 disabled:opacity-50"
          />
          <p className="mt-2 text-xs text-ink-500">
            Ảnh ngang, khuyến nghị 1200×675. Chủ thể nên nằm giữa — hai bên có thể bị cắt trên máy
            điện thoại. Nhận JPEG, PNG hoặc WEBP, tối đa {COVER_MAX_MB}MB.
          </p>
          <p className="mt-1 text-xs text-ink-400">
            {slot
              ? 'Ảnh lưu ngay khi chọn tệp, không chờ nút “Lưu khóa học”.'
              : 'Ảnh được lưu cùng lúc khóa học được tạo. Bấm “Hủy” là bỏ luôn cả ảnh.'}
          </p>
          {pendingName ? (
            <p className="mt-1 text-xs text-ink-500">Đã chọn: {pendingName}</p>
          ) : null}

          {url ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="mt-2"
              disabled={disabled || busy}
              onClick={() => void remove()}
            >
              {slot ? 'Gỡ ảnh' : 'Bỏ ảnh đã chọn'}
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
