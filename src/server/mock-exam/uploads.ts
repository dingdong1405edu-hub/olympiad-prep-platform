/**
 * KHO ẢNH BÀI LÀM.
 *
 * Ảnh nằm trong Postgres (bảng `MockExamUpload`) chứ không ra đĩa hay S3 —
 * lý do đầy đủ ghi ở model trong `prisma/schema.prisma`: đĩa Railway bị xóa mỗi
 * lần deploy, còn dự án thì chưa có object storage nào để dùng lại.
 *
 * Kiểu ảnh được nhận cố tình hẹp: ba định dạng mà mọi model vision đều đọc
 * được. Nhận SVG/HEIC vào đây là vừa mở đường cho script chạy trong trình duyệt,
 * vừa khiến lượt gọi AI hỏng ở tận bước cuối.
 */
import { prisma } from '@/lib/prisma';
import { ApiError } from '@/lib/http';
import { getConfigGroup } from '@/lib/config';

const ALLOWED_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);

export interface StoredUpload {
  id: string;
  url: string;
  sizeBytes: number;
}

export async function storeUpload(file: unknown): Promise<StoredUpload> {
  if (!(file instanceof File)) {
    throw ApiError.badRequest('Thiếu tệp ảnh trong biểu mẫu (trường `file`).');
  }

  const config = await getConfigGroup('mockExam');
  const mimeType = (file.type || 'image/jpeg').toLowerCase();

  if (!ALLOWED_TYPES.has(mimeType)) {
    throw ApiError.badRequest('Chỉ nhận ảnh JPEG, PNG hoặc WEBP.');
  }
  if (file.size > config.maxImageBytes) {
    const mb = Math.round((config.maxImageBytes / (1024 * 1024)) * 10) / 10;
    throw ApiError.badRequest(`Ảnh nặng quá ${mb}MB. Hãy chụp lại hoặc để hệ thống nén giúp.`);
  }
  if (file.size === 0) {
    throw ApiError.badRequest('Tệp ảnh rỗng.');
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const row = await prisma.mockExamUpload.create({
    data: { mimeType, sizeBytes: buffer.byteLength, data: buffer },
    select: { id: true, sizeBytes: true },
  });

  return { id: row.id, url: `/api/v1/uploads/${row.id}`, sizeBytes: row.sizeBytes };
}

export async function readUpload(
  id: string,
): Promise<{ mimeType: string; data: Buffer } | null> {
  const row = await prisma.mockExamUpload.findUnique({ where: { id } });
  if (!row) return null;
  return { mimeType: row.mimeType, data: Buffer.from(row.data) };
}
