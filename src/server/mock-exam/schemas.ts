/**
 * Hợp đồng dữ liệu giữa trình duyệt và máy chủ cho luồng thi thử.
 * Mọi thứ đi vào đều phải qua đây trước khi chạm database.
 */
import { z } from 'zod';

/** Ảnh chỉ được trỏ vào kho của chính hệ thống — chặn nhét URL ngoài vào prompt. */
export const uploadUrlSchema = z
  .string()
  .regex(/^\/api\/v1\/uploads\/[A-Za-z0-9_-]{10,40}$/, 'Đường dẫn ảnh không hợp lệ.');

export const answerInputSchema = z.object({
  /** Số câu in trên đề (1..20) — bền hơn id khi đề được seed lại. */
  number: z.number().int().positive(),
  text: z.string().max(5_000).nullish(),
  /** Lưới câu 15. */
  grid: z.array(z.array(z.string().max(4).nullable())).max(20).nullish(),
  imageUrls: z.array(uploadUrlSchema).max(3).optional().default([]),
});

/**
 * Bản nháp gửi lên trong lúc làm bài, và bản cuối cùng lúc bấm nộp.
 *
 * KHÔNG còn nhận `slug` hay `startedAt` từ trình duyệt: lượt thi đã tồn tại ở
 * máy chủ từ lúc bấm bắt đầu, nên đề nào và bắt đầu lúc nào là chuyện máy chủ
 * biết. Trước đây trình duyệt tự khai giờ bắt đầu, tức là tự cho mình thêm giờ
 * làm bài bao nhiêu cũng được.
 */
export const saveDraftSchema = z.object({
  answers: z.array(answerInputSchema).max(100).default([]),
});

export const gradeEssaySchema = z.object({
  questionId: z.string().min(1).max(60),
});

export const overrideAnswerSchema = z.object({
  awarded: z.number().min(0).max(100),
  feedbackVi: z.string().max(2_000).nullish(),
});

export type AnswerInput = z.infer<typeof answerInputSchema>;
export type SaveDraftInput = z.infer<typeof saveDraftSchema>;
