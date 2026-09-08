/**
 * Test bộ hiển thị đề bài.
 *
 * Đề dùng thật làm dữ liệu test: nếu một lệnh LaTeX trong `exam-asmopss-12.json`
 * lọt ra màn hình dưới dạng `\frac{1}{6}` thì học sinh coi như không đọc được đề.
 */
import { readFileSync, readdirSync } from 'node:fs';
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

  it('ký hiệu riêng của đề ASMOPSS 2019 ra ký tự, không ra tên lệnh', () => {
    const html = render(
      '$40 \\times 40 \\times 40 = 20 \\times 20 \\times 20 \\times \\blacksquare$ ' +
        'với $a \\ddagger b$, $\\rho$, $\\Delta$ và $x \\Longrightarrow y$.',
    );
    expect(html).toContain('■');
    expect(html).toContain('‡');
    expect(html).toContain('ρ');
    expect(html).toContain('Δ');
    expect(html).toContain('⟹');
    for (const name of ['blacksquare', 'ddagger', 'rho', 'Delta', 'Longrightarrow']) {
      expect(html).not.toContain(name);
    }
  });

  it('phân số liên tục \\cfrac dựng như phân số thường', () => {
    const html = render('$$a + \\cfrac{1}{b + \\cfrac{1}{c}}$$');
    expect(html).toContain('tex-frac');
    expect(html).not.toContain('cfrac');
  });

  it('tổ hợp, đồng dư và operatorname ra ký hiệu toán', () => {
    const html = render(
      '$\\binom{85}{2}$ và $9^{2019} \\equiv 9 \\pmod{10}$, $\\operatorname{lcm}(4, 3)$.',
    );
    expect(html).toContain('tex-binom');
    expect(html).toContain('(mod ');
    expect(html).toContain('lcm');
    // Không lệnh nào lọt ra dạng chữ. (`binom` phải soi kèm `{` vì tên class
    // `tex-binom` cũng chứa chuỗi đó.)
    expect(html).not.toContain('binom{');
    expect(html).not.toContain('pmod');
    expect(html).not.toContain('operatorname');
    expect(html).not.toContain('\\');
  });

  it('dấu đô-la đã thoát ra dấu $, không mở công thức', () => {
    const html = render('Mua cà phê \\$2 và trả taxi \\$4, tổng \\$6.');
    expect(html).toContain('$2');
    expect(html).toContain('$6');
    expect(html).not.toContain('\\$');
    expect(html).not.toContain('tex-inline');
  });

  it('không vỡ với chuỗi rỗng hoặc LaTeX cụt', () => {
    expect(() => render('')).not.toThrow();
    expect(() => render('$\\frac{1}{')).not.toThrow();
    expect(() => render('$$ chưa đóng')).not.toThrow();
  });
});

/**
 * Quét toàn bộ đề đang seed, không chỉ vài câu mẫu.
 *
 * Một lệnh LaTeX renderer chưa biết sẽ lọt ra màn hình dưới dạng tên lệnh —
 * `\blacksquare` thành chữ "blacksquare" — mà xem qua file JSON thì không thấy.
 * Cách duy nhất bắt được là cho renderer chạy thật trên từng câu.
 */
describe('mọi đề thi thử render sạch lệnh LaTeX', () => {
  const DIR = 'prisma/seed-data';
  const LEAKS = ['frac{', 'binom{', 'pmod', 'operatorname', 'blacksquare', 'ddagger'];

  for (const file of readdirSync(DIR).filter((f) => f.startsWith('exam-') && f.endsWith('.json'))) {
    it(file, () => {
      const data = JSON.parse(readFileSync(`${DIR}/${file}`, 'utf8')) as {
        questions: { number: number; prompt_md: string; options?: string[]; solution_md?: string }[];
      };
      const found: string[] = [];

      for (const q of data.questions) {
        const spots: [string, string][] = [['đề bài', q.prompt_md]];
        (q.options ?? []).forEach((o, i) => spots.push([`phương án ${i + 1}`, o]));
        if (q.solution_md) spots.push(['lời giải', q.solution_md]);

        for (const [where, text] of spots) {
          if (!text) continue;
          // Bỏ tên class (chứa "frac"/"binom") và mã nội dòng (được phép có `\`).
          const body = renderToStaticMarkup(<RichText>{text}</RichText>)
            .replace(/class="[^"]*"/g, '')
            .replace(/<code[^>]*>[\s\S]*?<\/code>/g, '');

          if (body.includes('\\')) found.push(`câu ${q.number} ${where}: còn dấu \\`);
          for (const leak of LEAKS) {
            if (body.includes(leak)) found.push(`câu ${q.number} ${where}: lọt ${leak}`);
          }
        }
      }

      expect(found).toEqual([]);
    });
  }
});
