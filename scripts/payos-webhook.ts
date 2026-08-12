/**
 * Đăng ký URL nhận webhook với PayOS.
 *
 *   npm run payos:webhook                    # dùng APP_URL trong .env
 *   npm run payos:webhook -- https://abc.vn  # chỉ định URL gốc khác
 *
 * PayOS GỌI THỬ chính URL đó ngay trong lúc đăng ký và chỉ chấp nhận khi nhận
 * được HTTP 200. Nghĩa là:
 *   - Ứng dụng phải ĐANG CHẠY và truy cập được từ Internet.
 *   - localhost KHÔNG đăng ký được; muốn thử ở máy thì mở tunnel (ngrok/cloudflared)
 *     rồi truyền URL public vào đây.
 *
 * Không đăng ký được cũng KHÔNG chặn việc bán hàng: trang chờ thanh toán tự hỏi
 * PayOS vài giây một lần, nên tiền vào là quyền truy cập vẫn mở. Webhook chỉ làm
 * việc đó nhanh hơn và đỡ tốn lượt gọi.
 */
import { readFileSync } from 'node:fs';
import { readPayosCredentials, registerPayosWebhook } from '../src/server/commerce/payos';
import { appBaseUrl, webhookUrlFor } from '../src/server/commerce/gateway';

/**
 * Nạp .env cho script chạy ngoài Next.js.
 *
 * Tự đọc thay vì kéo thêm thư viện: script này chỉ cần vài khóa dạng KEY=VALUE
 * đơn giản, và một phụ thuộc mới chỉ để làm đúng chừng đó là không đáng.
 * Biến đã có sẵn trong môi trường (Railway, CI) luôn được ưu tiên.
 */
function loadEnvFile(path = '.env'): void {
  let content: string;
  try {
    content = readFileSync(path, 'utf8');
  } catch {
    return; // Không có .env cũng bình thường — môi trường thật cấp biến trực tiếp.
  }

  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;

    const separator = trimmed.indexOf('=');
    if (separator <= 0) continue;

    const key = trimmed.slice(0, separator).trim();
    if (process.env[key] !== undefined) continue;

    const raw = trimmed.slice(separator + 1).trim();
    process.env[key] = raw.replace(/^(['"])(.*)\1$/s, '$2');
  }
}

async function main(): Promise<void> {
  loadEnvFile();

  const credentials = readPayosCredentials();
  if (!credentials) {
    console.error(
      '✗ Thiếu khóa PayOS. Đặt PAYOS_CLIENT_ID, PAYOS_API_KEY và PAYOS_CHECKSUM_KEY trong .env rồi chạy lại.',
    );
    process.exitCode = 1;
    return;
  }

  const override = process.argv[2]?.trim();
  const base = (override || appBaseUrl()).replace(/\/+$/, '');
  const webhookUrl = override ? `${base}/api/v1/webhooks/payment/payos` : webhookUrlFor('payos');

  if (webhookUrl.includes('localhost') || webhookUrl.includes('127.0.0.1')) {
    console.error(`✗ PayOS không gọi được vào ${webhookUrl}.`);
    console.error('  Deploy trước, hoặc mở tunnel rồi truyền URL public:');
    console.error('  npm run payos:webhook -- https://<ten-mien-cong-khai>');
    process.exitCode = 1;
    return;
  }

  console.info(`→ Đang đăng ký webhook: ${webhookUrl}`);

  try {
    const result = await registerPayosWebhook(webhookUrl);
    console.info(`✓ PayOS đã nhận webhook URL: ${result.webhookUrl}`);
    console.info('  Từ giờ mọi giao dịch thành công sẽ được báo về ngay lập tức.');
  } catch (error) {
    console.error('✗ Đăng ký thất bại:', error instanceof Error ? error.message : error);
    console.error('  Thường do một trong ba nguyên nhân:');
    console.error('   1. Ứng dụng chưa chạy hoặc URL chưa truy cập được từ Internet.');
    console.error('   2. URL trả về mã khác 200 (kiểm tra bằng cách mở URL đó trên trình duyệt).');
    console.error('   3. Khóa PAYOS_CLIENT_ID / PAYOS_API_KEY không đúng kênh thanh toán.');
    process.exitCode = 1;
  }
}

void main();
