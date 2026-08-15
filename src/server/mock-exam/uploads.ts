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
import { hasRole, type SessionUser } from '@/lib/auth';

/** Vai trò được xem bài làm của người khác. Giữ khớp với `STAFF_VIEW_ROLES` ở service.ts. */
const STAFF_VIEW_ROLES = [
  'SUPER_ADMIN',
  'OPS_ADMIN',
  'PROGRAM_MANAGER',
  'REVIEWER',
  'CONTENT_EDITOR',
  'TEACHER',
] as const;

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

/**
 * Đọc ảnh bài làm, có kiểm tra quyền.
 *
 * `IMPLEMENTATION_NOTES.md` §8 hứa: bài của khách chưa đăng nhập thì đường link
 * chính là chìa khóa, còn **bài của người đã đăng nhập thì chỉ chủ nhân hoặc
 * nhân sự xem được**. Vế thứ hai trước đây không được cài đặt ở đây — route chỉ
 * gọi thẳng `findUnique` rồi trả bytes, nên bất kỳ ai có id ảnh cũng đọc được
 * bài viết tay của một học sinh có danh tính.
 *
 * Ba trạng thái của một ảnh:
 *  - chưa gắn attempt (vừa chụp, chưa nộp) → link là chìa khóa, id là cuid ngẫu nhiên
 *  - gắn vào bài của khách (`userId = null`) → link là chìa khóa, đúng như đã hứa
 *  - gắn vào bài của người đã đăng nhập     → chỉ chủ nhân hoặc nhân sự
 */
export async function readUploadForViewer(
  id: string,
  viewer: SessionUser | null,
): Promise<{ mimeType: string; data: Buffer } | null> {
  const row = await prisma.mockExamUpload.findUnique({
    where: { id },
    select: { mimeType: true, data: true, attemptId: true },
  });
  if (!row) return null;

  if (row.attemptId !== null) {
    const attempt = await prisma.mockExamAttempt.findUnique({
      where: { id: row.attemptId },
      select: { userId: true },
    });
    const ownerId = attempt?.userId ?? null;
    if (ownerId !== null) {
      const isOwner = viewer?.id === ownerId;
      const isStaff = viewer ? hasRole(viewer, ...STAFF_VIEW_ROLES) : false;
      if (!isOwner && !isStaff) {
        throw ApiError.forbidden('Ảnh bài làm này thuộc về tài khoản khác.');
      }
    }
  }

  return { mimeType: row.mimeType, data: Buffer.from(row.data) };
}
