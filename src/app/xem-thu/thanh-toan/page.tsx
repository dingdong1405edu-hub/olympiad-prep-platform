import { notFound } from 'next/navigation';
import { buildQrArtwork } from '@/server/commerce/qr';
import type { PaymentSession } from '@/server/commerce/service';
import { PreviewSwitcher } from './preview-switcher';

/**
 * Trang XEM THỬ màn hình thanh toán — chỉ chạy ở máy phát triển.
 *
 * Vì sao cần: sửa giao diện màn hình trả tiền mà muốn nhìn thấy nó thì bình
 * thường phải có database, phải đăng nhập, phải tạo một đơn hàng thật ở PayOS.
 * Trang này dựng sẵn một phiên thanh toán bằng dữ liệu giả nên mở phát là thấy,
 * xem được cả hai kiểu đặt panel (trên trang và trong lớp phủ) mà không đụng
 * vào tiền thật hay dữ liệu thật.
 *
 * Chặn cứng ở production: đây là công cụ nội bộ, người dùng cuối không có việc gì
 * ở đây và một màn hình thanh toán giả bày công khai chỉ tổ gây hiểu nhầm.
 */
export const dynamic = 'force-dynamic';

export const metadata = { title: 'Xem thử màn hình thanh toán' };

/** Chuỗi VietQR thật lấy từ một đơn PayOS đã hủy — chỉ để mã QR vẽ ra đúng dạng. */
const SAMPLE_VIETQR =
  '00020101021238570010A000000727012700069704160113LOCCASS00033902080QRIBFTTA53037045405700005802VN62290825CSQ7FFK8DH1 OLPCJPQ546304';

export default async function PaymentPreviewPage() {
  if (process.env.NODE_ENV === 'production') notFound();

  const expiresAt = new Date(Date.now() + 11 * 60_000).toISOString();

  const session: PaymentSession = {
    orderCode: 'OLP-260908-CJPQ54',
    status: 'PENDING',
    statusLabel: 'Chờ thanh toán',
    gateway: 'PAYOS',
    amount: 700_000,
    // Đúng định dạng `formatVnd` sinh ra, để xem thử không lừa mắt mình.
    amountLabel: '700.000đ',
    currency: 'VND',
    createdAt: new Date().toISOString(),
    qr: {
      raw: SAMPLE_VIETQR,
      bin: '970416',
      accountNumber: 'LOCCASS000339027',
      accountName: 'TRUONG DINH HAI',
      transferContent: 'CSQ7FFK8DH1 OLPCJPQ54',
      amount: 700_000,
      expiresAt,
      checkoutUrl: 'https://pay.payos.vn/web/xem-thu',
      paymentLinkId: 'xem-thu',
    },
    qrArtwork: buildQrArtwork(SAMPLE_VIETQR),
    enrollmentId: null,
    course: {
      id: 'xem-thu',
      name: 'ASMOPSS – Khối 3–4–5 – Toán',
      programName: 'ASMOPSS',
    },
    expired: false,
  };

  return <PreviewSwitcher session={session} />;
}
