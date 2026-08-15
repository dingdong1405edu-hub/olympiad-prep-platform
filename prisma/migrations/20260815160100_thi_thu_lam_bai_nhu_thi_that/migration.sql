-- Lượt thi thử chạy như một kỳ thi online thật.
--
-- Lượt thi được tạo lúc bấm BẮT ĐẦU chứ không phải lúc nộp, nên máy chủ giữ hạn
-- nộp (`expiresAt`) và đếm được mỗi tài khoản đã dùng bao nhiêu lượt cho mỗi đề.

-- Hạn nộp do máy chủ chốt. NULL với các lượt cũ (tạo lúc nộp, đã chấm xong rồi).
ALTER TABLE "MockExamAttempt" ADD COLUMN "expiresAt" TIMESTAMP(3);

-- Lượt mới mặc định là đang làm bài; các lượt cũ giữ nguyên trạng thái sẵn có.
ALTER TABLE "MockExamAttempt" ALTER COLUMN "status" SET DEFAULT 'IN_PROGRESS';

-- Đếm quota chạy ở mọi lần bấm bắt đầu nên phải có chỉ mục riêng.
CREATE INDEX "MockExamAttempt_userId_examId_idx" ON "MockExamAttempt"("userId", "examId");
