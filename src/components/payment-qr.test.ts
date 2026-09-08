/**
 * Dòng mô tả khóa học trên màn hình chờ chuyển khoản.
 *
 * Chỗ này chỉ có một dòng chữ nên dễ bị coi là chuyện vặt, nhưng nó nằm trong
 * vùng `truncate` của đầu panel: nói lặp một chữ là đẩy phần phân biệt khóa
 * (khối lớp, môn) ra ngoài chỗ bị cắt, và người dùng mất đúng thông tin cần để
 * biết mình đang trả tiền cho khóa nào.
 */
import { describe, expect, it } from 'vitest';
import { courseLine } from './payment-qr';

describe('courseLine', () => {
  it('bỏ tên chương trình khi tên khóa đã mở đầu bằng chính nó', () => {
    // Đây là hình dạng dữ liệu THẬT của nền tảng, không phải ca giả định.
    expect(courseLine('ASMOPSS', 'ASMOPSS – Khối 3–4–5 – Toán')).toBe('ASMOPSS – Khối 3–4–5 – Toán');
  });

  it('vẫn ghép khi tên khóa không nhắc tới chương trình', () => {
    expect(courseLine('NEO', 'Khối 6–7 – Tiếng Anh')).toBe('NEO · Khối 6–7 – Tiếng Anh');
  });

  it('không phân biệt hoa thường', () => {
    expect(courseLine('Neo', 'NEO – Khối 8–9')).toBe('NEO – Khối 8–9');
  });

  it('thiếu tên chương trình thì trả về mỗi tên khóa, không để lại dấu chấm giữa lơ lửng', () => {
    expect(courseLine('', 'Khối 3–4–5 – Toán')).toBe('Khối 3–4–5 – Toán');
    expect(courseLine('   ', 'Khối 3–4–5 – Toán')).toBe('Khối 3–4–5 – Toán');
  });

  it('chỉ gộp khi tên chương trình đứng ĐẦU, không phải nằm đâu đó giữa tên khóa', () => {
    // "FMC" có xuất hiện trong tên khóa, nhưng ở giữa. Bỏ nó đi thì dòng chữ mất
    // chương trình mà người đọc không suy ra được — nên trường hợp này vẫn ghép.
    expect(courseLine('FMC', 'Toán FMC – Khối 10')).toBe('FMC · Toán FMC – Khối 10');
  });
});
