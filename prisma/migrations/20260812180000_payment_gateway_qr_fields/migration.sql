-- Tích hợp cổng thanh toán trả mã QR tại chỗ (PayOS).
--
-- gatewayOrderRef: PayOS yêu cầu orderCode là số nguyên và duy nhất vĩnh viễn
--   theo merchant. Mã đơn nội bộ của hệ thống là chuỗi (OLP-260812-ABC123) nên
--   cần thêm một mã số song song để đối chiếu hai chiều.
-- gatewayMeta: chuỗi VietQR + thông tin tài khoản nhận do cổng trả về. Lưu lại
--   để tải lại trang là vẽ lại đúng QR cũ, không phải gọi cổng tạo đơn mới.

ALTER TABLE "Payment" ADD COLUMN "gatewayOrderRef" INTEGER;
ALTER TABLE "Payment" ADD COLUMN "gatewayMeta" JSONB;

CREATE UNIQUE INDEX "Payment_gatewayOrderRef_key" ON "Payment"("gatewayOrderRef");
