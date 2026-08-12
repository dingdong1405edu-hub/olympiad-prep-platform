/**
 * Tiện ích ngày tháng theo múi giờ Việt Nam (UTC+7, không có DST).
 *
 * Quy ước: mọi "ngày lịch" (ngày học trong StudyPlanDay, hạn assessment) được
 * lưu dưới dạng Date ở mốc 00:00:00Z của đúng ngày lịch VN đó. Nhờ vậy so sánh
 * và unique key theo ngày luôn ổn định, không lệch do timezone của server.
 */

const VN_OFFSET_MS = 7 * 60 * 60 * 1000;

const WEEKDAY_VN = ['Chủ nhật', 'Thứ hai', 'Thứ ba', 'Thứ tư', 'Thứ năm', 'Thứ sáu', 'Thứ bảy'];

/** Khóa ngày lịch VN dạng "YYYY-MM-DD". */
export function vnDateKey(instant: Date = new Date()): string {
  return new Date(instant.getTime() + VN_OFFSET_MS).toISOString().slice(0, 10);
}

/** Chuyển "YYYY-MM-DD" thành Date mốc 00:00Z. */
export function dateFromKey(key: string): Date {
  return new Date(`${key}T00:00:00.000Z`);
}

/** Ngày lịch VN hôm nay, dưới dạng Date mốc 00:00Z. */
export function vnToday(instant: Date = new Date()): Date {
  return dateFromKey(vnDateKey(instant));
}

/** Chuẩn hóa một Date bất kỳ về mốc 00:00Z của ngày lịch VN tương ứng. */
export function toDateOnly(date: Date): Date {
  return dateFromKey(vnDateKey(date));
}

export function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * 86_400_000);
}

export function addHours(date: Date, hours: number): Date {
  return new Date(date.getTime() + hours * 3_600_000);
}

/** Số ngày nguyên từ `from` đến `to` (âm nếu `to` ở quá khứ). */
export function diffDays(to: Date, from: Date): number {
  return Math.round((toDateOnly(to).getTime() - toDateOnly(from).getTime()) / 86_400_000);
}

/** Số ngày còn lại tính từ hôm nay (0 = hôm nay, âm = đã qua). */
export function daysUntil(target: Date): number {
  return diffDays(target, vnToday());
}

/** 0 = Chủ nhật … 6 = Thứ bảy, theo lịch VN. */
export function vnWeekday(date: Date): number {
  return new Date(date.getTime() + VN_OFFSET_MS).getUTCDay();
}

export function formatDateVN(date: Date): string {
  const key = vnDateKey(date);
  const [y, m, d] = key.split('-');
  return `${d}/${m}/${y}`;
}

export function formatDayLabelVN(date: Date): string {
  return `${WEEKDAY_VN[vnWeekday(date)]}, ${formatDateVN(date).slice(0, 5)}`;
}

export function formatDateTimeVN(date: Date): string {
  const shifted = new Date(date.getTime() + VN_OFFSET_MS);
  const hh = String(shifted.getUTCHours()).padStart(2, '0');
  const mm = String(shifted.getUTCMinutes()).padStart(2, '0');
  return `${hh}:${mm} ${formatDateVN(date)}`;
}

/**
 * Sinh danh sách ngày học cho một chu kỳ, chỉ lấy `daysPerWeek` ngày mỗi tuần.
 * Rải đều trong tuần thay vì dồn liên tiếp để học sinh có ngày nghỉ xen kẽ.
 */
export function pickStudyDates(start: Date, totalDays: number, daysPerWeek: number): Date[] {
  const perWeek = Math.max(1, Math.min(7, daysPerWeek));
  const chosen: Date[] = [];
  // Chỉ số ngày trong tuần được chọn, rải đều: vd 5/7 → [0,1,2,4,5]
  const offsets: number[] = [];
  for (let i = 0; i < perWeek; i++) {
    offsets.push(Math.floor((i * 7) / perWeek));
  }

  let week = 0;
  while (chosen.length < totalDays) {
    for (const offset of offsets) {
      if (chosen.length >= totalDays) break;
      chosen.push(addDays(start, week * 7 + offset));
    }
    week += 1;
    if (week > 60) break; // chặn vòng lặp vô hạn
  }
  return chosen;
}
