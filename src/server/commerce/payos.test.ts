/**
 * Chữ ký PayOS phải khớp BIT-ĐỐI-BIT với phía họ. Sai một dấu `&`, một khóa
 * chưa sort, một giá trị null chuyển sai — kết quả không phải "hơi lệch" mà là
 * webhook bị từ chối sạch, hoặc tệ hơn: nhận nhầm webhook giả.
 *
 * Các mẫu dữ liệu dưới đây lấy từ chính tài liệu PayOS.
 */
import { createHmac } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  payosObjectToQueryString,
  signPayosCreateRequest,
  signPayosData,
  verifyPayosWebhookBody,
} from './payos';
import { appBaseUrl, buildGatewayDescription, webhookUrlFor } from './gateway';

/**
 * Khóa GIẢ, chỉ dùng trong test. Không bao giờ đặt checksum key thật vào đây:
 * file test nằm trong repo, khóa thật thì nằm ở biến môi trường.
 */
const CHECKSUM_KEY = 'khoa-checksum-gia-dinh-cho-test-0123456789abcdef';

describe('payosObjectToQueryString', () => {
  it('sắp xếp khóa theo alphabet', () => {
    expect(payosObjectToQueryString({ zulu: 1, alpha: 2, mike: 3 })).toBe('alpha=2&mike=3&zulu=1');
  });

  it('chuyển null và undefined thành chuỗi rỗng', () => {
    // undefined bị loại khỏi object nhưng vẫn phải có mặt trong chuỗi ký với
    // giá trị rỗng — PayOS gửi trường rỗng chứ không bỏ hẳn trường đi.
    expect(payosObjectToQueryString({ a: null, b: 'x' })).toBe('a=&b=x');
  });

  it('coi chuỗi "null" như giá trị rỗng, đúng như SDK của PayOS', () => {
    expect(payosObjectToQueryString({ a: 'null', b: 1 })).toBe('a=&b=1');
  });

  it('JSON hóa mảng sau khi sort khóa từng phần tử', () => {
    const result = payosObjectToQueryString({
      items: [{ price: 1, name: 'A' }],
      orderCode: 7,
    });
    expect(result).toBe('items=[{"name":"A","price":1}]&orderCode=7');
  });

  it('giữ nguyên số 0 và chuỗi rỗng thay vì coi là thiếu', () => {
    expect(payosObjectToQueryString({ amount: 0, note: '' })).toBe('amount=0&note=');
  });
});

describe('signPayosCreateRequest', () => {
  /**
   * Tài liệu quy định ĐÚNG năm trường theo thứ tự cố định. Test này khóa chặt
   * chuỗi nguồn lại: đổi thứ tự hay thêm trường là đỏ ngay.
   */
  it('ký đúng chuỗi 5 trường theo thứ tự tài liệu', () => {
    const input = {
      amount: 700_000,
      cancelUrl: 'https://example.vn/huy',
      description: 'OLPABC123',
      orderCode: 123_456_789,
      returnUrl: 'https://example.vn/ket-qua',
    };

    const expected = createHmac('sha256', CHECKSUM_KEY)
      .update(
        'amount=700000&cancelUrl=https://example.vn/huy&description=OLPABC123' +
          '&orderCode=123456789&returnUrl=https://example.vn/ket-qua',
      )
      .digest('hex');

    expect(signPayosCreateRequest(input, CHECKSUM_KEY)).toBe(expected);
  });
});

describe('verifyPayosWebhookBody', () => {
  const data = {
    orderCode: 123,
    amount: 3000,
    description: 'VQRIO123',
    accountNumber: '12345678',
    reference: 'TF230204212323',
    transactionDateTime: '2023-02-04 18:25:00',
    currency: 'VND',
    paymentLinkId: '124c33293c43417ab7879e14c8d9eb18',
    code: '00',
    desc: 'Thành công',
    counterAccountBankId: '',
    counterAccountBankName: '',
    counterAccountName: '',
    counterAccountNumber: '',
    virtualAccountName: '',
    virtualAccountNumber: '',
  };

  function body(overrides: { signature?: string; data?: unknown } = {}): string {
    return JSON.stringify({
      code: '00',
      desc: 'success',
      success: true,
      data: overrides.data ?? data,
      signature: overrides.signature ?? signPayosData(data, CHECKSUM_KEY),
    });
  }

  it('chấp nhận webhook có chữ ký đúng', () => {
    expect(verifyPayosWebhookBody(body(), CHECKSUM_KEY)).toBe(true);
  });

  it('từ chối khi chữ ký sai', () => {
    expect(verifyPayosWebhookBody(body({ signature: 'f'.repeat(64) }), CHECKSUM_KEY)).toBe(false);
  });

  it('từ chối khi dữ liệu bị sửa dù chữ ký còn nguyên', () => {
    // Kịch bản tấn công thẳng vào tiền: giữ chữ ký cũ, nâng số tiền lên.
    const tampered = JSON.parse(body()) as { data: Record<string, unknown> };
    tampered.data.amount = 7_000_000;
    expect(verifyPayosWebhookBody(JSON.stringify(tampered), CHECKSUM_KEY)).toBe(false);
  });

  it('từ chối khi sai khóa checksum', () => {
    expect(verifyPayosWebhookBody(body(), 'khoa-khac')).toBe(false);
  });

  it('từ chối body không phải JSON, thiếu chữ ký hoặc thiếu data', () => {
    expect(verifyPayosWebhookBody('khong-phai-json', CHECKSUM_KEY)).toBe(false);
    expect(verifyPayosWebhookBody(JSON.stringify({ data }), CHECKSUM_KEY)).toBe(false);
    expect(verifyPayosWebhookBody(JSON.stringify({ signature: 'a' }), CHECKSUM_KEY)).toBe(false);
    expect(verifyPayosWebhookBody(JSON.stringify({ data: [], signature: 'a' }), CHECKSUM_KEY)).toBe(false);
  });

  it('không đổ vỡ khi chữ ký dài ngắn khác nhau', () => {
    // So sánh chống timing-attack ném lỗi nếu hai buffer lệch độ dài mà không chặn trước.
    expect(verifyPayosWebhookBody(body({ signature: 'abc' }), CHECKSUM_KEY)).toBe(false);
  });
});

describe('buildGatewayDescription', () => {
  /**
   * Mô tả chính là NỘI DUNG CHUYỂN KHOẢN. PayOS giới hạn 25 ký tự, và chỉ 9 ký
   * tự với tài khoản ngân hàng chưa liên kết payOS — nên mặc định phải ≤ 9.
   */
  it('gói mã đơn vào đúng 9 ký tự', () => {
    expect(buildGatewayDescription('OLP-260812-ABC123')).toBe('OLPABC123');
    expect(buildGatewayDescription('OLP-260812-ABC123')).toHaveLength(9);
  });

  it('không vỡ với mã đơn ngắn bất thường', () => {
    expect(buildGatewayDescription('X1').length).toBeLessThanOrEqual(9);
  });

  it('bỏ ký tự không phải chữ và số vì nội dung chuyển khoản không nhận', () => {
    expect(buildGatewayDescription('OLP-2608-A#B@C1')).toMatch(/^[0-9A-Z]+$/);
  });

  it('hai mã đơn khác nhau cho ra hai nội dung khác nhau', () => {
    // Trùng nội dung là mất khả năng đối soát bằng mắt khi cần tra tay.
    expect(buildGatewayDescription('OLP-260812-ABC123')).not.toBe(
      buildGatewayDescription('OLP-260812-XYZ789'),
    );
  });
});

describe('appBaseUrl', () => {
  /**
   * Hàm này quyết định `returnUrl`/`cancelUrl` GỬI RA NGOÀI cho PayOS và URL
   * webhook in ra cho người vận hành dán vào cổng. Sai ở đây không báo lỗi ở
   * đâu cả — chỉ là khách chuyển khoản xong rồi rơi vào một trang chết.
   */
  const KEYS = ['APP_URL', 'NEXT_PUBLIC_APP_URL', 'RAILWAY_PUBLIC_DOMAIN'] as const;
  let saved: Record<string, string | undefined>;

  beforeEach(() => {
    saved = Object.fromEntries(KEYS.map((key) => [key, process.env[key]]));
    for (const key of KEYS) delete process.env[key];
  });

  afterEach(() => {
    for (const key of KEYS) {
      if (saved[key] === undefined) delete process.env[key];
      else process.env[key] = saved[key];
    }
  });

  it('dùng APP_URL khi đó là địa chỉ công khai', () => {
    process.env.APP_URL = 'https://hoc.example.vn';
    expect(appBaseUrl()).toBe('https://hoc.example.vn');
  });

  it('cắt dấu / thừa ở cuối để không sinh ra URL hai gạch', () => {
    process.env.APP_URL = 'https://hoc.example.vn///';
    expect(webhookUrlFor('payos')).toBe('https://hoc.example.vn/api/v1/webhooks/payment/payos');
  });

  it('bỏ qua APP_URL trỏ về localhost khi đang chạy trên Railway', () => {
    // Đây là ca thật: .env phát triển để localhost và bị chép nguyên lên production.
    process.env.APP_URL = 'http://localhost:3000';
    process.env.RAILWAY_PUBLIC_DOMAIN = 'web-production-3f0b1.up.railway.app';
    expect(appBaseUrl()).toBe('https://web-production-3f0b1.up.railway.app');
  });

  it('bỏ qua cả 127.0.0.1 và ::1, không chỉ chữ "localhost"', () => {
    process.env.RAILWAY_PUBLIC_DOMAIN = 'web-production-3f0b1.up.railway.app';
    for (const loopback of ['http://127.0.0.1:3000', 'http://[::1]:3000', 'https://localhost']) {
      process.env.APP_URL = loopback;
      expect(appBaseUrl()).toBe('https://web-production-3f0b1.up.railway.app');
    }
  });

  it('KHÔNG bỏ qua tên miền chỉ vô tình chứa chữ localhost', () => {
    process.env.APP_URL = 'https://localhost.hoc.example.vn';
    process.env.RAILWAY_PUBLIC_DOMAIN = 'web-production-3f0b1.up.railway.app';
    expect(appBaseUrl()).toBe('https://localhost.hoc.example.vn');
  });

  it('giữ localhost khi chạy ở máy phát triển — không có domain công khai để thay', () => {
    process.env.APP_URL = 'http://localhost:3000';
    expect(appBaseUrl()).toBe('http://localhost:3000');
  });

  it('coi chuỗi rỗng là chưa đặt và rơi xuống domain Railway', () => {
    process.env.APP_URL = '';
    process.env.RAILWAY_PUBLIC_DOMAIN = 'web-production-3f0b1.up.railway.app';
    expect(appBaseUrl()).toBe('https://web-production-3f0b1.up.railway.app');
  });

  it('không cấu hình gì thì về mặc định localhost', () => {
    expect(appBaseUrl()).toBe('http://localhost:3000');
  });
});
