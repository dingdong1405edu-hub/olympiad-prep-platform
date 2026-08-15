-- Thêm trạng thái "đang làm bài" cho lượt thi thử.
--
-- Tách riêng một migration chỉ để thêm giá trị enum là BẮT BUỘC, không phải cho
-- gọn: PostgreSQL cấm dùng một giá trị enum vừa thêm ngay trong cùng transaction
-- đã thêm nó. Migration sau mới được đặt giá trị này làm DEFAULT của cột.
ALTER TYPE "MockAttemptStatus" ADD VALUE IF NOT EXISTS 'IN_PROGRESS' BEFORE 'GRADING';
