/**
 * GỌI API ẢNH ĐẠI DIỆN KHÓA HỌC.
 *
 * Tách khỏi `course-cover.tsx` vì có HAI đường dẫn tới cùng hai lời gọi này:
 * biểu mẫu sửa khóa đẩy ảnh lên ngay khi chọn tệp, còn biểu mẫu tạo khóa phải
 * chờ khóa học được tạo xong mới biết khóa ô ảnh là gì (khóa ô dựng từ khối và
 * môn — hai thứ người dùng còn đang chọn). Để hai chỗ tự viết `fetch` riêng thì
 * sớm muộn cũng lệch nhau ở phần đọc lỗi.
 *
 * Không dùng `apiPost` trong `@/lib/client`: hàm đó `JSON.stringify` phần thân,
 * còn ảnh phải đi `multipart/form-data`.
 */

export const COVER_MAX_MB = 5;

/** Ném lỗi kèm đúng câu máy chủ trả về, để biểu mẫu hiện lại nguyên văn. */
interface ApiEnvelope {
  ok?: boolean;
  data?: unknown;
  error?: { message?: string };
}

async function unwrap(response: Response, fallback: string): Promise<Record<string, unknown>> {
  let json: ApiEnvelope | null = null;
  try {
    json = (await response.json()) as ApiEnvelope;
  } catch {
    json = null;
  }
  if (!response.ok || !json?.ok) {
    throw new Error(json?.error?.message ?? fallback);
  }
  return (json.data ?? {}) as Record<string, unknown>;
}

/**
 * Đẩy ảnh lên một ô. Kèm luôn kích thước thật đo ở trình duyệt: route ảnh chỉ
 * ghi `width`/`height` khi biểu mẫu gửi lên, và thiếu hai số đó thì thẻ `<img>`
 * không có kích thước nên trang giật một nhịp lúc ảnh về.
 */
export async function uploadCover(slot: string, file: File): Promise<string> {
  if (file.size > COVER_MAX_MB * 1024 * 1024) {
    throw new Error(`Ảnh nặng quá ${COVER_MAX_MB}MB. Hãy chọn ảnh nhỏ hơn.`);
  }

  const body = new FormData();
  body.set('slot', slot);
  body.set('file', file);

  const size = await measure(file);
  if (size) {
    body.set('width', String(size.width));
    body.set('height', String(size.height));
  }

  const data = await unwrap(
    await fetch('/api/v1/admin/site-assets', { method: 'POST', body }),
    'Không tải được ảnh lên.',
  );
  return data.url as string;
}

/** Gỡ ảnh khỏi một ô. */
export async function deleteCover(slot: string): Promise<void> {
  await unwrap(
    await fetch(`/api/v1/admin/site-assets/${encodeURIComponent(slot)}`, { method: 'DELETE' }),
    'Không gỡ được ảnh.',
  );
}

/**
 * Đo ảnh bằng chính trình duyệt. Trả `null` khi không đọc được — lúc đó vẫn tải
 * ảnh lên bình thường, chỉ là mất số đo, chứ không chặn người dùng.
 */
function measure(file: File): Promise<{ width: number; height: number } | null> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      resolve({ width: img.naturalWidth, height: img.naturalHeight });
      URL.revokeObjectURL(url);
    };
    img.onerror = () => {
      resolve(null);
      URL.revokeObjectURL(url);
    };
    img.src = url;
  });
}
