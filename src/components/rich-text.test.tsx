/**
 * Test bộ hiển thị đề bài.
 *
 * Đề dùng thật làm dữ liệu test: nếu một lệnh LaTeX trong `exam-asmopss-12.json`
 * lọt ra màn hình dưới dạng `\frac{1}{6}` thì học sinh coi như không đọc được đề.
 */
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { RichText } from './rich-text';

function render(markdown: string): string {
  return renderToStaticMarkup(<RichText>{markdown}</RichText>);
}

describe('RichText', () => {
  it('dựng phân số thành khối tử/mẫu, không để lọt lệnh LaTeX (câu 6)', () => {
    const html = render(
      'Tính giá trị biểu thức:\n\n$$\\frac{1}{6} + \\frac{25}{12} + \\frac{61}{20}$$',
    );
    expect(html).toContain('tex-frac');
    expect(html).not.toContain('frac{');
    expect(html).not.toContain('\\');
  });

  it('công thức nội dòng nằm gọn trong câu chữ (câu 7)', () => {
    const html = render('Trong hình vuông $ABCD$, $DF = FE = EC$.');
    expect(html).toContain('tex-inline');
    expect(html).toContain('ABCD');
    expect(html).not.toContain('$');
  });

  it('mũ và chỉ số thành sup/sub', () => {
    const html = render('Số tập con là $2^6 = 64$ và $a_{1}$.');
    expect(html).toContain('<sup>6</sup>');
    expect(html).toContain('<sub>1</sub>');
  });

  it('đổi ký hiệu lệnh sang ký tự đọc được', () => {
    const html = render('$71.2 \\times 8.1$, $x \\le 3$, $\\sqrt{16}$, $\\angle ABC$');
    expect(html).toContain('×');
    expect(html).toContain('≤');
    expect(html).toContain('√');
    expect(html).toContain('∠');
  });

  it('giữ khối mã của câu 2 nguyên vẹn từng dòng', () => {
    const html = render('Xét quy luật:\n\n```\n1\n2   3\n4   5   6\n```');
    expect(html).toContain('<pre');
    expect(html).toContain('2   3');
  });

  it('dựng bảng markdown của câu 11', () => {
    const html = render('| Tập con | Mô tả |\n|---|---|\n| { } | tập rỗng |\n| {1} | một phần tử |');
    expect(html).toContain('<table');
    expect(html).toContain('tập rỗng');
    expect(html).not.toContain('|---|');
  });

  it('in đậm, mã nội dòng và gạch đầu dòng', () => {
    const html = render('**tất cả đều trúng** và `*`\n\n- ý một\n- ý hai');
    expect(html).toContain('<strong');
    expect(html).toContain('<code');
    expect(html).toContain('<ul');
    expect(html).toContain('ý hai');
    expect(html).not.toContain('**');
  });

  it('không vỡ với chuỗi rỗng hoặc LaTeX cụt', () => {
    expect(() => render('')).not.toThrow();
    expect(() => render('$\\frac{1}{')).not.toThrow();
    expect(() => render('$$ chưa đóng')).not.toThrow();
  });
});
