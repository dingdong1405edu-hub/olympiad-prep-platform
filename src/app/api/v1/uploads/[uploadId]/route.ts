import { readUpload } from '@/server/mock-exam/uploads';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ uploadId: string }> };

/**
 * Trả về ảnh bài làm.
 *
 * KHÔNG dùng `ok()` như các route khác: đây là ảnh nhị phân, phải trả thẳng
 * bytes để thẻ <img> và model vision đọc được.
 *
 * Ai có link thì xem được — link chứa cuid ngẫu nhiên. Đánh đổi này ghi trong
 * IMPLEMENTATION_NOTES.md cùng lý do: bài làm của khách chưa đăng nhập cũng
 * phải xem lại được.
 */
export async function GET(_request: Request, context: Ctx) {
  const { uploadId } = await context.params;
  const upload = await readUpload(uploadId);

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
