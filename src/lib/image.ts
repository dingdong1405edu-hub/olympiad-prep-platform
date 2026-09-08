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
  type = 'image/jpeg',
  quality = JPEG_QUALITY,
): Promise<Blob | null> {
  if (typeof OffscreenCanvas !== 'undefined') {
    const canvas = new OffscreenCanvas(width, height);
    const context = canvas.getContext('2d');
    if (!context) return Promise.resolve(null);
    context.drawImage(bitmap, 0, 0, width, height);
    return canvas.convertToBlob({ type, quality });
  }

  // Safari cũ chưa có OffscreenCanvas — quay về canvas thường.
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d');
  if (!context) return Promise.resolve(null);
  context.drawImage(bitmap, 0, 0, width, height);
  return new Promise((resolve) => {
    canvas.toBlob((blob) => resolve(blob), type, quality);
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

// ---------------------------------------------------------------------------
// ẢNH CỦA TRANG BÁN HÀNG
//
// Cùng bộ máy nén nhưng khác hẳn mục tiêu với ảnh bài làm ở trên. Ảnh bài làm
// chỉ cần đủ để model đọc chữ viết tay rồi thôi; ảnh ở đây là thứ khách nhìn
// đầu tiên trên màn hình Retina, nén tay quá là thấy rõ vệt bẩn quanh chữ.
// ---------------------------------------------------------------------------

/** Cạnh dài tối đa của ảnh trang bán hàng — vừa đủ cho ảnh nền rộng trên màn 2x. */
const WEB_MAX_EDGE = 2000;
const WEB_QUALITY = 0.85;

export interface CompressedImage {
  blob: Blob;
  width: number;
  height: number;
}

/**
 * Nén một ảnh cho trang bán hàng, GIỮ NGUYÊN NỀN TRONG SUỐT.
 *
 * Ưu tiên WEBP chứ không phải JPEG, vì một trong các ô ảnh là logo trên thanh
 * menu: đổ logo nền trong suốt sang JPEG sẽ ra một khối chữ nhật đen sì. WEBP
 * vừa giữ được kênh alpha vừa nhẹ hơn PNG cho ảnh chụp.
 *
 * Trình duyệt không xuất được WEBP thì lui về PNG với ảnh có thể có nền trong
 * suốt, và JPEG với ảnh còn lại — chứ không lẳng lặng ép mọi thứ về JPEG.
 *
 * Nén hỏng ở bất kỳ bước nào thì trả lại file gốc kèm kích thước đo được, để
 * admin vẫn tải ảnh lên được thay vì gặp một lỗi không hiểu vì sao.
 */
export async function compressForWeb(file: File): Promise<CompressedImage> {
  let bitmap: ImageBitmap;
  try {
    bitmap = await toBitmap(file);
  } catch {
    return { blob: file, width: 0, height: 0 };
  }

  const source = { width: bitmap.width, height: bitmap.height };
  try {
    const scale = Math.min(1, WEB_MAX_EDGE / Math.max(bitmap.width, bitmap.height));
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));

    // PNG là định dạng duy nhất trong danh sách cho phép có thể mang nền trong
    // suốt, nên nó quyết định đường lui khi WEBP không dùng được.
    const mayHaveAlpha = file.type === 'image/png';

    let blob = await drawToBlob(bitmap, width, height, 'image/webp', WEB_QUALITY);
    // Trình duyệt không hỗ trợ WEBP trả về PNG (hoặc null) thay vì báo lỗi.
    if (!blob || blob.type !== 'image/webp') {
      blob = mayHaveAlpha
        ? await drawToBlob(bitmap, width, height, 'image/png')
        : await drawToBlob(bitmap, width, height, 'image/jpeg', WEB_QUALITY);
    }

    if (!blob) return { blob: file, ...source };

    // Ảnh vốn đã nhỏ và tối ưu sẵn: nén xong nặng hơn thì giữ bản gốc. Kích
    // thước trả về vẫn là kích thước THẬT của bản gốc, không phải bản đã thu.
    if (blob.size >= file.size) return { blob: file, ...source };

    return { blob, width, height };
  } catch {
    return { blob: file, ...source };
  } finally {
    bitmap.close?.();
  }
}

export interface SiteAssetInfo {
  slot: string;
  url: string;
  mimeType: string;
  sizeBytes: number;
  width: number | null;
  height: number | null;
  updatedAt: string;
}

/** Nén rồi tải một ảnh lên một ô của trang bán hàng. Chỉ admin gọi được. */
export async function uploadSiteAsset(slot: string, file: File): Promise<SiteAssetInfo> {
  const { blob, width, height } = await compressForWeb(file);

  // Đuôi tệp phải khớp định dạng thật, vì máy chủ đọc `file.type` để quyết định
  // nhận hay từ chối và để lưu lại làm `Content-Type` khi phục vụ ảnh sau này.
  const extension = (blob.type.split('/')[1] ?? 'jpg').replace('jpeg', 'jpg');

  const form = new FormData();
  form.append('slot', slot);
  form.append('file', blob, `${slot.replace(/[^a-z0-9]+/gi, '-')}.${extension}`);
  if (width > 0) form.append('width', String(width));
  if (height > 0) form.append('height', String(height));

  const response = await fetch('/api/v1/admin/site-assets', { method: 'POST', body: form });
  const payload = (await response.json().catch(() => null)) as
    | { ok: true; data: SiteAssetInfo }
    | { ok: false; error: { message: string } }
    | null;

  if (!response.ok || !payload || !payload.ok) {
    throw new Error(
      payload && !payload.ok ? payload.error.message : 'Tải ảnh lên thất bại, thử lại giúp.',
    );
  }
  return payload.data;
}
