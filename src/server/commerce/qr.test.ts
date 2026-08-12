/**
 * Mã QR sai một module là người dùng đứng trước màn hình quét mãi không được và
 * bỏ đi. Bộ test này khóa những tính chất khiến mã KHÔNG quét được.
 */
import { describe, expect, it } from 'vitest';
import { buildQrArtwork, tryBuildQrArtwork } from './qr';

/** Chuỗi VietQR thật do PayOS trả về (đã thay số tài khoản). */
const VIETQR_SAMPLE =
  '00020101021238570010A00000072701270006970422011300110123456780208QRIBFTTA53037045802VN' +
  '62110807OLPABC1236304B5B1';

describe('buildQrArtwork', () => {
  it('dựng được mã cho chuỗi VietQR thật', () => {
    const artwork = buildQrArtwork(VIETQR_SAMPLE);

    // Kích thước QR luôn là 4·version + 17 → luôn lẻ và ≥ 21.
    expect(artwork.size).toBeGreaterThanOrEqual(21);
    expect((artwork.size - 17) % 4).toBe(0);
    expect(artwork.dataPath.length).toBeGreaterThan(0);
  });

  it('giữ viền trắng tối thiểu 4 module theo chuẩn QR', () => {
    // Thiếu viền này là máy quét không tách được mã khỏi nền.
    expect(buildQrArtwork(VIETQR_SAMPLE).quietZone).toBeGreaterThanOrEqual(4);
  });

  it('vẽ đủ ba ô định vị góc', () => {
    const { finderPath } = buildQrArtwork(VIETQR_SAMPLE);
    // Mỗi ô gồm 3 hình (vành ngoài, lỗ, nhân) → 3 ô là 9 lệnh "moveto".
    expect(finderPath.match(/M/g)).toHaveLength(9);
  });

  it('không vẽ đè module dữ liệu lên vùng ô định vị', () => {
    const artwork = buildQrArtwork(VIETQR_SAMPLE);
    const finderSize = 7;

    // Mọi đoạn dữ liệu đều phải nằm ngoài ba góc 7×7, nếu không hai lớp vẽ
    // chồng nhau sẽ phá tỉ lệ 1:1:3:1:1 mà máy quét dựa vào để định vị.
    const segments = [...artwork.dataPath.matchAll(/M(\d+) (\d+)h(\d+)/g)];
    expect(segments.length).toBeGreaterThan(0);

    for (const [, x, y, length] of segments) {
      const column = Number(x);
      const row = Number(y);
      const end = column + Number(length) - 1;

      const overlapsTopLeft = row < finderSize && column < finderSize;
      const overlapsTopRight = row < finderSize && end >= artwork.size - finderSize;
      const overlapsBottomLeft = row >= artwork.size - finderSize && column < finderSize;

      expect(overlapsTopLeft || overlapsTopRight || overlapsBottomLeft).toBe(false);
    }
  });

  it('gộp module liền nhau thành một hình chữ nhật', () => {
    const artwork = buildQrArtwork(VIETQR_SAMPLE);
    const segments = [...artwork.dataPath.matchAll(/h(\d+)/g)];
    // Có ít nhất một đoạn dài hơn 1 module → việc gộp thật sự có tác dụng,
    // nếu không chuỗi SVG sẽ phình lên hàng trăm KB.
    expect(segments.some(([, length]) => Number(length) > 1)).toBe(true);
  });

  it('mã dài hơn thì cần nhiều module hơn', () => {
    const short = buildQrArtwork('OLP1');
    const long = buildQrArtwork(VIETQR_SAMPLE.repeat(2));
    expect(long.size).toBeGreaterThan(short.size);
  });
});

describe('tryBuildQrArtwork', () => {
  it('trả null thay vì ném lỗi khi không có chuỗi', () => {
    // Trang thanh toán phải sống sót kể cả khi cổng quên trả mã QR.
    expect(tryBuildQrArtwork(null)).toBeNull();
    expect(tryBuildQrArtwork(undefined)).toBeNull();
    expect(tryBuildQrArtwork('')).toBeNull();
  });

  it('vẫn dựng được với chuỗi hợp lệ', () => {
    expect(tryBuildQrArtwork(VIETQR_SAMPLE)?.size).toBeGreaterThan(0);
  });
});
