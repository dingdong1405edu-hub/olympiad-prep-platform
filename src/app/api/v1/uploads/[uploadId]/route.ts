import { getSession } from '@/lib/auth';
import { ApiError } from '@/lib/http';
import { readUploadForViewer } from '@/server/mock-exam/uploads';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ uploadId: string }> };

/**
 * Trả về ảnh bài làm.
 *
 * KHÔNG dùng `ok()` như các route khác: đây là ảnh nhị phân, phải trả thẳng
 * bytes để thẻ <img> và model vision đọc được.
 *
 * Quyền xem do `readUploadForViewer` quyết định: ảnh của bài đã gắn vào một tài
 * khoản có danh tính thì chỉ chủ nhân hoặc nhân sự đọc được; ảnh của khách chưa
 * đăng nhập thì link là chìa khóa (đánh đổi ghi trong IMPLEMENTATION_NOTES §8).
 */
export async function GET(_request: Request, context: Ctx) {
  const { uploadId } = await context.params;
  const viewer = await getSession();

  let upload: Awaited<ReturnType<typeof readUploadForViewer>>;
  try {
    upload = await readUploadForViewer(uploadId, viewer);
  } catch (error) {
    // Route này trả bytes chứ không trả JSON nên phải tự dịch lỗi sang HTTP.
    if (error instanceof ApiError) {
      return new Response(error.message, { status: error.status });
    }
    throw error;
  }

  if (!upload) {
    return new Response('Không tìm thấy ảnh.', { status: 404 });
  }

  return new Response(new Uint8Array(upload.data), {
    headers: {
      'Content-Type': upload.mimeType,
      'Content-Length': String(upload.data.byteLength),
      // Ảnh không bao giờ đổi nội dung nên cache thoải mái; riêng tư vì là bài
      // làm của một người cụ thể.
      'Cache-Control': 'private, max-age=31536000, immutable',
    },
  });
}
