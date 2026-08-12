/**
 * Tra tên ngân hàng từ mã BIN (6 số) mà cổng thanh toán trả về cùng mã VietQR.
 *
 * Chỉ để HIỂN THỊ cho người dùng đỡ hoang mang khi thấy một số tài khoản lạ.
 * Không dùng vào bất kỳ quyết định nghiệp vụ nào — thiếu một mã ở đây thì giao
 * diện lùi về hiển thị chính con số BIN, không có gì hỏng.
 */

export interface BankInfo {
  /** Tên viết tắt quen thuộc, đúng cách người dùng gọi hằng ngày. */
  shortName: string;
  fullName: string;
}

/** BIN theo chuẩn Napas/VietQR. */
export const BANKS_BY_BIN: Record<string, BankInfo> = {
  '970405': { shortName: 'Agribank', fullName: 'NH Nông nghiệp và Phát triển Nông thôn Việt Nam' },
  '970415': { shortName: 'VietinBank', fullName: 'NH TMCP Công Thương Việt Nam' },
  '970418': { shortName: 'BIDV', fullName: 'NH TMCP Đầu tư và Phát triển Việt Nam' },
  '970436': { shortName: 'Vietcombank', fullName: 'NH TMCP Ngoại Thương Việt Nam' },
  '970422': { shortName: 'MB Bank', fullName: 'NH TMCP Quân đội' },
  '970407': { shortName: 'Techcombank', fullName: 'NH TMCP Kỹ Thương Việt Nam' },
  '970416': { shortName: 'ACB', fullName: 'NH TMCP Á Châu' },
  '970432': { shortName: 'VPBank', fullName: 'NH TMCP Việt Nam Thịnh Vượng' },
  '970423': { shortName: 'TPBank', fullName: 'NH TMCP Tiên Phong' },
  '970403': { shortName: 'Sacombank', fullName: 'NH TMCP Sài Gòn Thương Tín' },
  '970437': { shortName: 'HDBank', fullName: 'NH TMCP Phát triển TP.HCM' },
  '970443': { shortName: 'SHB', fullName: 'NH TMCP Sài Gòn - Hà Nội' },
  '970441': { shortName: 'VIB', fullName: 'NH TMCP Quốc tế Việt Nam' },
  '970431': { shortName: 'Eximbank', fullName: 'NH TMCP Xuất Nhập khẩu Việt Nam' },
  '970426': { shortName: 'MSB', fullName: 'NH TMCP Hàng Hải' },
  '970448': { shortName: 'OCB', fullName: 'NH TMCP Phương Đông' },
  '970429': { shortName: 'SCB', fullName: 'NH TMCP Sài Gòn' },
  '970440': { shortName: 'SeABank', fullName: 'NH TMCP Đông Nam Á' },
  '970449': { shortName: 'LPBank', fullName: 'NH TMCP Lộc Phát Việt Nam' },
  '970452': { shortName: 'KienlongBank', fullName: 'NH TMCP Kiên Long' },
  '970454': { shortName: 'BVBank', fullName: 'NH TMCP Bản Việt' },
  '970400': { shortName: 'SaigonBank', fullName: 'NH TMCP Sài Gòn Công Thương' },
  '970409': { shortName: 'BacABank', fullName: 'NH TMCP Bắc Á' },
  '970412': { shortName: 'PVcomBank', fullName: 'NH TMCP Đại Chúng Việt Nam' },
  '970414': { shortName: 'OceanBank', fullName: 'NH TM TNHH MTV Đại Dương' },
  '970419': { shortName: 'NCB', fullName: 'NH TMCP Quốc Dân' },
  '970425': { shortName: 'ABBANK', fullName: 'NH TMCP An Bình' },
  '970427': { shortName: 'VietABank', fullName: 'NH TMCP Việt Á' },
  '970428': { shortName: 'NamABank', fullName: 'NH TMCP Nam Á' },
  '970430': { shortName: 'PGBank', fullName: 'NH TMCP Thịnh vượng và Phát triển' },
  '970433': { shortName: 'VietBank', fullName: 'NH TMCP Việt Nam Thương Tín' },
  '970438': { shortName: 'BaoVietBank', fullName: 'NH TMCP Bảo Việt' },
  '970446': { shortName: 'Co-opBank', fullName: 'NH Hợp tác xã Việt Nam' },
  '970421': { shortName: 'VRB', fullName: 'NH Liên doanh Việt - Nga' },
  '970424': { shortName: 'Shinhan Bank', fullName: 'NH TNHH MTV Shinhan Việt Nam' },
  '970434': { shortName: 'Indovina', fullName: 'NH TNHH Indovina' },
  '970442': { shortName: 'Hong Leong', fullName: 'NH TNHH MTV Hong Leong Việt Nam' },
  '970444': { shortName: 'CBBank', fullName: 'NH TM TNHH MTV Xây dựng Việt Nam' },
  '970457': { shortName: 'Woori', fullName: 'NH TNHH MTV Woori Việt Nam' },
  '970458': { shortName: 'UOB', fullName: 'NH TNHH MTV United Overseas Bank' },
  '546034': { shortName: 'CAKE', fullName: 'CAKE by VPBank' },
  '546035': { shortName: 'Ubank', fullName: 'Ubank by VPBank' },
  '963388': { shortName: 'Timo', fullName: 'Timo by Ban Viet Bank' },
  '971011': { shortName: 'Viettel Money', fullName: 'Tổng Công ty Dịch vụ số Viettel' },
  '971005': { shortName: 'VNPT Money', fullName: 'Dịch vụ số VNPT' },
};

export function bankFromBin(bin: string | null | undefined): BankInfo | null {
  if (!bin) return null;
  return BANKS_BY_BIN[bin.trim()] ?? null;
}

/** Tên hiển thị an toàn: có trong danh bạ thì lấy tên, không thì trả chính mã BIN. */
export function bankLabel(bin: string | null | undefined): string {
  const bank = bankFromBin(bin);
  if (bank) return bank.shortName;
  return bin ? `Ngân hàng ${bin}` : 'Ngân hàng thụ hưởng';
}
