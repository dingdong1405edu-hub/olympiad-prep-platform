/**
 * Dựng mã QR từ chuỗi VietQR do cổng thanh toán trả về.
 *
 * Vì sao vẽ ở server thay vì nhúng ảnh từ dịch vụ ngoài (img.vietqr.io…):
 *  - Không để bên thứ ba biết ai đang xem đơn nào, vào lúc nào.
 *  - Người dùng chặn CDN hoặc mạng chập chờn thì mã QR vẫn hiện.
 *  - Không phải nới CSP cho một tên miền ảnh chỉ để lấy đúng một tấm hình.
 *
 * Đầu ra là ĐƯỜNG VẼ SVG chứ không phải PNG: nét sắc ở mọi mật độ điểm ảnh, nhẹ
 * hơn ảnh bitmap, và giao diện tự đổi màu/animation được bằng CSS.
 */
import QRCode from 'qrcode';

export interface QrArtwork {
  /** Số module mỗi cạnh, chưa tính viền trắng. */
  size: number;
  /** Viền trắng bắt buộc quanh mã (chuẩn QR yêu cầu tối thiểu 4 module). */
  quietZone: number;
  /** Toàn bộ module dữ liệu, gộp theo hàng để chuỗi không phình. */
  dataPath: string;
  /** Ba ô định vị góc — vẽ riêng để bo góc mềm mà vẫn giữ đúng tỉ lệ 1:1:3:1:1. */
  finderPath: string;
}

/** Chuẩn QR: viền trắng tối thiểu 4 module, thiếu là máy quét bắt hụt. */
const QUIET_ZONE = 4;
/** Ô định vị luôn là 7×7 module ở ba góc. */
const FINDER_SIZE = 7;

/** Bo góc ô định vị. Giữ nhỏ: bo sâu quá là hỏng tỉ lệ nhận diện của máy quét. */
const FINDER_OUTER_RADIUS = 1.6;
const FINDER_INNER_RADIUS = 0.7;

function isInsideFinder(row: number, column: number, size: number): boolean {
  const inTopLeft = row < FINDER_SIZE && column < FINDER_SIZE;
  const inTopRight = row < FINDER_SIZE && column >= size - FINDER_SIZE;
  const inBottomLeft = row >= size - FINDER_SIZE && column < FINDER_SIZE;
  return inTopLeft || inTopRight || inBottomLeft;
}

/** Hình chữ nhật bo góc, viết bằng lệnh tương đối cho chuỗi ngắn. */
function roundedRect(x: number, y: number, width: number, height: number, radius: number): string {
  const r = Math.min(radius, width / 2, height / 2);
  return (
    `M${x + r} ${y}` +
    `h${width - 2 * r}a${r} ${r} 0 0 1 ${r} ${r}` +
    `v${height - 2 * r}a${r} ${r} 0 0 1 ${-r} ${r}` +
    `h${-(width - 2 * r)}a${r} ${r} 0 0 1 ${-r} ${-r}` +
    `v${-(height - 2 * r)}a${r} ${r} 0 0 1 ${r} ${-r}z`
  );
}

/**
 * Một ô định vị = vành ngoài 7×7 rỗng ruột + nhân đặc 3×3.
 * Vành vẽ bằng hai đường ngược chiều nhau, dựa vào fill-rule "evenodd" để khoét lỗ.
 */
function finderPattern(originX: number, originY: number): string {
  const outer = roundedRect(originX, originY, FINDER_SIZE, FINDER_SIZE, FINDER_OUTER_RADIUS);
  const hole = roundedRect(originX + 1, originY + 1, 5, 5, FINDER_OUTER_RADIUS - 0.5);
  const core = roundedRect(originX + 2, originY + 2, 3, 3, FINDER_INNER_RADIUS);
  return `${outer}${hole}${core}`;
}

/**
 * Vẽ mã QR cho một chuỗi.
 *
 * Mức sửa lỗi H (khôi phục ~30%) để đặt được huy hiệu ở giữa mã mà máy quét vẫn
 * đọc tốt — không có nó thì logo giữa mã là một canh bạc.
 */
export function buildQrArtwork(text: string): QrArtwork {
  const qr = QRCode.create(text, { errorCorrectionLevel: 'H' });
  const size = qr.modules.size;
  const modules = qr.modules.data;

  const runs: string[] = [];
  for (let row = 0; row < size; row += 1) {
    let column = 0;
    while (column < size) {
      const dark = modules[row * size + column] === 1 && !isInsideFinder(row, column, size);
      if (!dark) {
        column += 1;
        continue;
      }
      // Gộp các module tối liền nhau thành một hình chữ nhật: chuỗi ngắn đi
      // hàng chục lần so với việc vẽ từng ô, và trình duyệt cũng đỡ việc.
      let length = 0;
      while (
        column + length < size &&
        modules[row * size + column + length] === 1 &&
        !isInsideFinder(row, column + length, size)
      ) {
        length += 1;
      }
      runs.push(`M${column} ${row}h${length}v1h-${length}z`);
      column += length;
    }
  }

  return {
    size,
    quietZone: QUIET_ZONE,
    dataPath: runs.join(''),
    finderPath: [
      finderPattern(0, 0),
      finderPattern(size - FINDER_SIZE, 0),
      finderPattern(0, size - FINDER_SIZE),
    ].join(''),
  };
}

/** Không bao giờ để một chuỗi QR hỏng làm sập cả trang thanh toán. */
export function tryBuildQrArtwork(text: string | null | undefined): QrArtwork | null {
  if (!text) return null;
  try {
    return buildQrArtwork(text);
  } catch (error) {
    console.error('[commerce] không dựng được mã QR', error);
    return null;
  }
}
