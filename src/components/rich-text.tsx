/**
 * HIỂN THỊ ĐỀ BÀI: markdown gọn + công thức toán.
 *
 * Đề Olympic viết bằng markdown có LaTeX (`$\frac{1}{6}$`, bảng, khối mã).
 * Không render thì học sinh đọc phải chữ `\frac{1}{6}` — coi như không đọc được
 * đề, mà đọc được đề là điều kiện cần của cả tính năng này.
 *
 * VÌ SAO KHÔNG DÙNG KaTeX + react-markdown (spec §9.1 gợi ý KaTeX): hai thư
 * viện đó cộng lại ~300KB kèm một bộ font riêng, cho một tập cú pháp mà đề này
 * dùng chưa tới hai chục lệnh. Ở đây tự dựng đúng phần cần: phân số, căn, mũ,
 * chỉ số dưới và bảng ký hiệu — bằng HTML thuần nên in ra giấy vẫn đúng.
 *
 * KHÔNG dùng hook để Server Component lẫn Client Component đều import được.
 */
import type { ReactNode } from 'react';
import { cx } from '@/components/ui';

// ---------------------------------------------------------------------------
// Ký hiệu toán
// ---------------------------------------------------------------------------

const SYMBOLS: Record<string, string> = {
  times: '×',
  cdot: '·',
  div: '÷',
  pm: '±',
  mp: '∓',
  le: '≤',
  leq: '≤',
  ge: '≥',
  geq: '≥',
  ne: '≠',
  neq: '≠',
  approx: '≈',
  equiv: '≡',
  infty: '∞',
  pi: 'π',
  alpha: 'α',
  beta: 'β',
  gamma: 'γ',
  theta: 'θ',
  angle: '∠',
  triangle: '△',
  circ: '°',
  degree: '°',
  in: '∈',
  notin: '∉',
  subset: '⊂',
  subseteq: '⊆',
  cup: '∪',
  cap: '∩',
  emptyset: '∅',
  varnothing: '∅',
  rightarrow: '→',
  to: '→',
  Rightarrow: '⇒',
  leftrightarrow: '↔',
  ldots: '…',
  dots: '…',
  cdots: '⋯',
  perp: '⊥',
  parallel: '∥',
  sum: '∑',
  prod: '∏',
  percent: '%',
  // Chữ Hy Lạp còn thiếu — đề lý/hóa dùng ρ (khối lượng riêng), Δ (biến thiên).
  delta: 'δ',
  Delta: 'Δ',
  epsilon: 'ε',
  varepsilon: 'ε',
  lambda: 'λ',
  mu: 'μ',
  rho: 'ρ',
  sigma: 'σ',
  Sigma: 'Σ',
  phi: 'φ',
  varphi: 'φ',
  omega: 'ω',
  Omega: 'Ω',
  // Ô trống trong đề điền số, và ký hiệu phép toán tự định nghĩa.
  blacksquare: '■',
  square: '□',
  dagger: '†',
  ddagger: '‡',
  // Mũi tên và quan hệ.
  leftarrow: '←',
  gets: '←',
  uparrow: '↑',
  downarrow: '↓',
  mapsto: '↦',
  Leftarrow: '⇐',
  Leftrightarrow: '⇔',
  Longrightarrow: '⟹',
  implies: '⟹',
  Longleftrightarrow: '⟺',
  iff: '⟺',
  propto: '∝',
  sim: '∼',
  simeq: '≃',
  cong: '≅',
  ll: '≪',
  gg: '≫',
  supset: '⊃',
  supseteq: '⊇',
  forall: '∀',
  exists: '∃',
  partial: '∂',
  int: '∫',
  setminus: '\\',
  bullet: '•',
  ast: '∗',
  star: '⋆',
  prime: '′',
};

/** Lệnh chỉ để canh chữ — bỏ đi, thay bằng khoảng trắng. */
const SPACING = new Set(['quad', 'qquad', ',', ';', ':', '!', ' ']);
/**
 * Lệnh bao ngoặc co giãn — bỏ chính lệnh, giữ dấu ngoặc đi kèm.
 *
 * `operatorname` nằm đây vì phần thân của nó (`\operatorname{lcm}` → `lcm`) vốn
 * đã là chữ thường đứng, đúng thứ cần hiện; bỏ lệnh đi là ra ngay.
 */
const SIZING = new Set([
  'left',
  'right',
  'big',
  'Big',
  'bigg',
  'Bigg',
  'displaystyle',
  'text',
  'mathrm',
  'operatorname',
]);

/** Đọc một nhóm `{...}` cân bằng, hoặc một ký tự nếu không có ngoặc. */
function readGroup(src: string, start: number): { body: string; next: number } {
  if (src[start] !== '{') {
    // `x^2` — mũ chỉ gồm một ký tự.
    return { body: src[start] ?? '', next: start + 1 };
  }
  let depth = 0;
  for (let i = start; i < src.length; i += 1) {
    if (src[i] === '{') depth += 1;
    else if (src[i] === '}') {
      depth -= 1;
      if (depth === 0) return { body: src.slice(start + 1, i), next: i + 1 };
    }
  }
  return { body: src.slice(start + 1), next: src.length };
}

/** Chuyển một chuỗi LaTeX thành các phần tử React. */
function renderTex(src: string, keyPrefix: string): ReactNode[] {
  const out: ReactNode[] = [];
  let buffer = '';
  let index = 0;
  let keySeed = 0;

  const flush = () => {
    if (buffer !== '') {
      out.push(buffer);
      buffer = '';
    }
  };
  const nextKey = () => `${keyPrefix}-${(keySeed += 1)}`;

  while (index < src.length) {
    const char = src[index]!;

    if (char === '\\') {
      const match = /^\\([a-zA-Z]+|.)/.exec(src.slice(index));
      const command = match?.[1] ?? '';
      index += (match?.[0] ?? '\\').length;

      if (
        command === 'frac' ||
        command === 'dfrac' ||
        command === 'tfrac' ||
        command === 'cfrac'
      ) {
        const numerator = readGroup(src, index);
        const denominator = readGroup(src, numerator.next);
        index = denominator.next;
        flush();
        out.push(
          <span className="tex-frac" key={nextKey()}>
            <span>{renderTex(numerator.body, nextKey())}</span>
            <span>{renderTex(denominator.body, nextKey())}</span>
          </span>,
        );
        continue;
      }

      // Tổ hợp: hai tầng số như phân số nhưng KHÔNG có gạch ngang, đóng ngoặc lớn.
      if (command === 'binom' || command === 'dbinom' || command === 'tbinom') {
        const top = readGroup(src, index);
        const bottom = readGroup(src, top.next);
        index = bottom.next;
        flush();
        out.push(
          <span className="tex-binom" key={nextKey()}>
            <span className="tex-binom-paren">(</span>
            <span className="tex-binom-stack">
              <span>{renderTex(top.body, nextKey())}</span>
              <span>{renderTex(bottom.body, nextKey())}</span>
            </span>
            <span className="tex-binom-paren">)</span>
          </span>,
        );
        continue;
      }

      // Đồng dư: `\pmod{10}` phải ra “(mod 10)”, không phải chữ “pmod”.
      if (command === 'pmod') {
        const modulus = readGroup(src, index);
        index = modulus.next;
        buffer += ' (mod ';
        flush();
        out.push(<span key={nextKey()}>{renderTex(modulus.body, nextKey())}</span>);
        buffer += ')';
        continue;
      }

      if (command === 'textbf') {
        const body = readGroup(src, index);
        index = body.next;
        flush();
        out.push(
          <strong className="font-semibold" key={nextKey()}>
            {renderTex(body.body, nextKey())}
          </strong>,
        );
        continue;
      }

      if (command === 'sqrt') {
        const body = readGroup(src, index);
        index = body.next;
        flush();
        out.push(
          <span key={nextKey()}>
            √<span className="tex-sqrt">{renderTex(body.body, nextKey())}</span>
          </span>,
        );
        continue;
      }

      if (SYMBOLS[command]) {
        buffer += SYMBOLS[command];
        continue;
      }
      if (SPACING.has(command)) {
        buffer += ' ';
        continue;
      }
      if (SIZING.has(command)) continue;

      // Lệnh lạ: giữ nguyên phần chữ để không nuốt mất nội dung của đề.
      buffer += command;
      continue;
    }

    if (char === '^' || char === '_') {
      const group = readGroup(src, index + 1);
      index = group.next;
      flush();
      const inner = renderTex(group.body, nextKey());
      out.push(
        char === '^' ? (
          <sup key={nextKey()}>{inner}</sup>
        ) : (
          <sub key={nextKey()}>{inner}</sub>
        ),
      );
      continue;
    }

    if (char === '{' || char === '}') {
      index += 1;
      continue;
    }

    buffer += char;
    index += 1;
  }

  flush();
  return out;
}

export function MathSpan({ tex, display = false }: { tex: string; display?: boolean }) {
  return (
    <span className={display ? 'tex-display' : 'tex-inline'}>{renderTex(tex, 'm')}</span>
  );
}

// ---------------------------------------------------------------------------
// Markdown nội dòng
// ---------------------------------------------------------------------------

/**
 * Trả `\$` về dấu `$` bình thường.
 *
 * Đề toán tiền tệ viết `\$2` để dấu đô-la khỏi bị hiểu là mở công thức; nếu
 * không gỡ dấu thoát ở đây thì học sinh đọc phải "\$2".
 */
function unescapeDollar(text: string): string {
  return text.replace(/\\\$/g, '$');
}

/**
 * Cắt chuỗi theo `$...$`, `**đậm**` và `` `mã` ``.
 *
 * Dấu `$` đã thoát (`\$`) không được tính là mốc mở/đóng công thức — nếu tính
 * thì "\$2 cà phê và \$4 taxi" biến phần chữ ở giữa thành công thức toán.
 */
function renderInline(text: string, keyPrefix: string): ReactNode[] {
  const out: ReactNode[] = [];
  const pattern = /((?<!\\)\$(?:[^$\n\\]|\\.)+?(?<!\\)\$)|(\*\*[^*\n]+\*\*)|(`[^`\n]+`)/g;
  let cursor = 0;
  let key = 0;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(text)) !== null) {
    if (match.index > cursor) out.push(unescapeDollar(text.slice(cursor, match.index)));
    const token = match[0];
    key += 1;

    if (token.startsWith('$')) {
      out.push(<MathSpan key={`${keyPrefix}-${key}`} tex={token.slice(1, -1)} />);
    } else if (token.startsWith('**')) {
      out.push(
        <strong key={`${keyPrefix}-${key}`} className="font-semibold text-ink-900">
          {token.slice(2, -2)}
        </strong>,
      );
    } else {
      out.push(
        <code
          key={`${keyPrefix}-${key}`}
          className="rounded bg-ink-100 px-1 py-0.5 font-mono text-[0.9em] text-ink-800"
        >
          {token.slice(1, -1)}
        </code>,
      );
    }
    cursor = match.index + token.length;
  }

  if (cursor < text.length) out.push(unescapeDollar(text.slice(cursor)));
  return out;
}

// ---------------------------------------------------------------------------
// Markdown khối
// ---------------------------------------------------------------------------

type Block =
  | { kind: 'paragraph'; lines: string[] }
  | { kind: 'code'; lines: string[] }
  | { kind: 'math'; body: string }
  | { kind: 'list'; items: string[] }
  | { kind: 'table'; rows: string[][] };

function splitTableRow(line: string): string[] {
  return line
    .trim()
    .replace(/^\|/, '')
    .replace(/\|$/, '')
    .split('|')
    .map((cell) => cell.trim());
}

function isTableDivider(line: string): boolean {
  return /^\s*\|?[\s:-]+\|[\s|:-]*$/.test(line) && line.includes('-');
}

function toBlocks(markdown: string): Block[] {
  const lines = markdown.replace(/\r\n/g, '\n').split('\n');
  const blocks: Block[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i]!;

    if (line.trim().startsWith('```')) {
      const body: string[] = [];
      i += 1;
      while (i < lines.length && !lines[i]!.trim().startsWith('```')) {
        body.push(lines[i]!);
        i += 1;
      }
      i += 1;
      blocks.push({ kind: 'code', lines: body });
      continue;
    }

    if (line.trim().startsWith('$$')) {
      const first = line.trim().slice(2);
      if (first.endsWith('$$') && first.length > 2) {
        blocks.push({ kind: 'math', body: first.slice(0, -2) });
        i += 1;
        continue;
      }
      const body: string[] = first === '' ? [] : [first];
      i += 1;
      while (i < lines.length && !lines[i]!.trim().endsWith('$$')) {
        body.push(lines[i]!);
        i += 1;
      }
      if (i < lines.length) {
        const last = lines[i]!.trim().replace(/\$\$$/, '');
        if (last !== '') body.push(last);
        i += 1;
      }
      blocks.push({ kind: 'math', body: body.join(' ') });
      continue;
    }

    if (line.includes('|') && i + 1 < lines.length && isTableDivider(lines[i + 1]!)) {
      const rows: string[][] = [splitTableRow(line)];
      i += 2;
      while (i < lines.length && lines[i]!.includes('|') && lines[i]!.trim() !== '') {
        rows.push(splitTableRow(lines[i]!));
        i += 1;
      }
      blocks.push({ kind: 'table', rows });
      continue;
    }

    if (/^\s*[-*]\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\s*[-*]\s+/.test(lines[i]!)) {
        items.push(lines[i]!.replace(/^\s*[-*]\s+/, ''));
        i += 1;
      }
      blocks.push({ kind: 'list', items });
      continue;
    }

    if (line.trim() === '') {
      i += 1;
      continue;
    }

    const paragraph: string[] = [];
    while (
      i < lines.length &&
      lines[i]!.trim() !== '' &&
      !lines[i]!.trim().startsWith('```') &&
      !lines[i]!.trim().startsWith('$$') &&
      !/^\s*[-*]\s+/.test(lines[i]!)
    ) {
      paragraph.push(lines[i]!);
      i += 1;
    }
    blocks.push({ kind: 'paragraph', lines: paragraph });
  }

  return blocks;
}

/**
 * Hiển thị một đoạn markdown có công thức.
 *
 * Dùng cho: đề bài, lời giải mẫu, transcript AI đọc từ ảnh, mô tả tiêu chí barem.
 */
export function RichText({ children, className }: { children: string; className?: string }) {
  const blocks = toBlocks(children ?? '');

  return (
    <div className={cx('rich-text', className)}>
      {blocks.map((block, index) => {
        if (block.kind === 'code') {
          return (
            <pre
              key={index}
              className="scroll-x my-3 rounded-lg bg-ink-50 p-3 font-mono text-[13px] leading-relaxed text-ink-800 ring-1 ring-ink-100"
            >
              {block.lines.join('\n')}
            </pre>
          );
        }

        if (block.kind === 'math') {
          return (
            <div key={index} className="scroll-x my-3 text-center text-[1.05em]">
              <MathSpan tex={block.body} display />
            </div>
          );
        }

        if (block.kind === 'list') {
          return (
            <ul key={index} className="my-2 list-disc space-y-1 pl-5">
              {block.items.map((item, itemIndex) => (
                <li key={itemIndex}>{renderInline(item, `l${index}-${itemIndex}`)}</li>
              ))}
            </ul>
          );
        }

        if (block.kind === 'table') {
          const [head, ...body] = block.rows;
          return (
            <div key={index} className="scroll-x my-3">
              <table className="w-full min-w-max border-collapse text-left text-sm">
                <thead>
                  <tr className="border-b border-ink-200 bg-ink-50">
                    {(head ?? []).map((cell, cellIndex) => (
                      <th key={cellIndex} className="px-3 py-2 font-semibold text-ink-700">
                        {renderInline(cell, `th${index}-${cellIndex}`)}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {body.map((row, rowIndex) => (
                    <tr key={rowIndex} className="border-b border-ink-100 last:border-0">
                      {row.map((cell, cellIndex) => (
                        <td key={cellIndex} className="px-3 py-2 text-ink-700">
                          {renderInline(cell, `td${index}-${rowIndex}-${cellIndex}`)}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          );
        }

        return (
          <p key={index} className="my-2 leading-relaxed">
            {block.lines.map((line, lineIndex) => (
              <span key={lineIndex}>
                {lineIndex > 0 ? <br /> : null}
                {renderInline(line, `p${index}-${lineIndex}`)}
              </span>
            ))}
          </p>
        );
      })}
    </div>
  );
}
