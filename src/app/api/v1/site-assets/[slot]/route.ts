import { readAssetBytes } from '@/lib/copy/assets';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ slot: string }> };

/**
 * Phục vụ một ảnh của trang bán hàng.
 *
 * CÔNG KHAI, không kiểm tra đăng nhập: đây là ảnh trên trang bán hàng, ai xem
 * trang cũng phải tải được. Khác hẳn `/api/v1/uploads/[id]` — bên đó là bài làm
 * của một học sinh cụ thể nên mới có kiểm tra quyền.
 *
 * KHÔNG dùng `ok()`: phải trả thẳng bytes cho thẻ <img>.
 *
 * `immutable` một năm là an toàn vì URL luôn kèm `?v=<version>`, và version đổi
 * mỗi lần admin tải ảnh mới (xem `saveAsset`). Không có `?v=` thì đây sẽ là một
 * cái bẫy: admin thay ảnh xong, khách cũ vẫn thấy ảnh cũ suốt một năm.
 */
export async function GET(_request: Request, context: Ctx) {
  const { slot } = await context.params;
  const asset = await readAssetBytes(decodeURIComponent(slot));

  if (!asset) {
    return new Response('Không tìm thấy ảnh.', { status: 404 });
  }

  return new Response(new Uint8Array(asset.data), {
    headers: {
      'Content-Type': asset.mimeType,
      'Content-Length': String(asset.data.byteLength),
      'Cache-Control': 'public, max-age=31536000, immutable',
    },
  });
}
