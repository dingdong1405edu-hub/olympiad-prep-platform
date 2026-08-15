'use client';

/**
 * NÉN ẢNH BÀI LÀM NGAY TRONG TRÌNH DUYỆT (AI_GRADING_SPEC.md §10).
 *
 * Ảnh camera điện thoại là 4000×3000 và 4–8MB. Gửi thẳng lên thì: mạng 3G ở nhà
 * học sinh treo, database phình, và model vision vẫn tự thu nhỏ về ~1568px ở
 * phía nó — tức là trả tiền cho phần dữ liệu bị vứt đi.
 *
 * Nén tại máy: 1568px cạnh dài, JPEG chất lượng 0.82. Chữ viết tay vẫn đọc rõ,
 * dung lượng còn khoảng 200–400KB.
 */

/** Cạnh dài tối đa — kích thước mà các model vision đọc ảnh vào. */
const MAX_EDGE = 1568;
const JPEG_QUALITY = 0.82;

async function toBitmap(file: File): Promise<ImageBitmap> {
  // `imageOrientation: 'from-image'` để ảnh chụp dọc không bị xoay ngang: dữ
  // liệu EXIF sẽ mất sau khi vẽ lên canvas, phải áp dụng ngay lúc này.
  try {
    return await createImageBitmap(file, { imageOrientation: 'from-image' });
  } catch {
    return await createImageBitmap(file);
  }
}

function drawToBlob(
  bitmap: ImageBitmap,
  width: number,
  height: number,
): Promise<Blob | null> {
  if (typeof OffscreenCanvas !== 'undefined') {
    const canvas = new OffscreenCanvas(width, height);
    const context = canvas.getContext('2d');
    if (!context) return Promise.resolve(null);
    context.drawImage(bitmap, 0, 0, width, height);
    return canvas.convertToBlob({ type: 'image/jpeg', quality: JPEG_QUALITY });
  }

  // Safari cũ chưa có OffscreenCanvas — quay về canvas thường.
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d');
  if (!context) return Promise.resolve(null);
  context.drawImage(bitmap, 0, 0, width, height);
  return new Promise((resolve) => {
    canvas.toBlob((blob) => resolve(blob), 'image/jpeg', JPEG_QUALITY);
  });
}

/**
 * Nén một ảnh về kích thước tối ưu cho model vision.
 * Trình duyệt không nén được (định dạng lạ, hết bộ nhớ) thì trả lại file gốc —
 * thà gửi ảnh nặng còn hơn mất bài làm của học sinh.
 */
export async function compressForVision(file: File): Promise<Blob> {
  try {
    const bitmap = await toBitmap(file);
    const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));

    const blob = await drawToBlob(bitmap, width, height);
    bitmap.close?.();

    // Ảnh nhỏ sẵn mà nén xong lại nặng hơn thì giữ bản gốc.
    if (!blob || blob.size >= file.size) return file;
    return blob;
  } catch {
    return file;
  }
}

export interface UploadedImage {
  id: string;
  url: string;
  sizeBytes: number;
}

/** Nén rồi tải một ảnh lên kho. Ném lỗi có chữ tiếng Việt để hiện thẳng lên UI. */
export async function uploadExamImage(file: File): Promise<UploadedImage> {
  const blob = await compressForVision(file);
  const form = new FormData();
  form.append('file', blob, 'bai-lam.jpg');

  const response = await fetch('/api/v1/uploads', { method: 'POST', body: form });
  const payload = (await response.json().catch(() => null)) as
    | { ok: true; data: UploadedImage }
    | { ok: false; error: { message: string } }
    | null;

  if (!response.ok || !payload || !payload.ok) {
    throw new Error(
      payload && !payload.ok ? payload.error.message : 'Tải ảnh lên thất bại, em thử lại nhé.',
    );
  }
  return payload.data;
}
