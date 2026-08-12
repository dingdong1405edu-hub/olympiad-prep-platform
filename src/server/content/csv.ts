/**
 * CSV thuần cho luồng import/export kho câu hỏi (specs §9.4, §19.4).
 *
 * Không dùng thư viện ngoài. File nguồn của đội biên soạn xuất từ Excel/Google
 * Sheets nên parser bắt buộc chịu được: BOM UTF-8, CRLF, dấu phẩy trong ô có
 * ngoặc kép, ngoặc kép lồng dạng "", xuống dòng bên trong ô. Tiếng Việt có dấu
 * và công thức LaTeX phải giữ nguyên từng ký tự.
 */

const BOM = '\uFEFF';

export interface CsvTable {
  headers: string[];
  rows: Record<string, string>[];
}

/**
 * Tách văn bản CSV thành các bản ghi thô (mảng ô).
 * Ngoặc kép chỉ được coi là ký tự mở chuỗi khi đứng ở ĐẦU ô — nhờ vậy nội dung
 * kiểu `3" x 5"` trong ô không ngoặc kép không làm hỏng toàn bộ file.
 */
function parseRecords(input: string): string[][] {
  const text = input.startsWith(BOM) ? input.slice(1) : input;

  const records: string[][] = [];
  let record: string[] = [];
  let field = '';
  let inQuotes = false;
  let i = 0;

  while (i < text.length) {
    const ch = text[i];

    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 2;
          continue;
        }
        inQuotes = false;
        i += 1;
        continue;
      }
      if (ch === '\r') {
        // Xuống dòng trong ô: chuẩn hóa CRLF về LF để nội dung đồng nhất.
        field += '\n';
        i += text[i + 1] === '\n' ? 2 : 1;
        continue;
      }
      field += ch;
      i += 1;
      continue;
    }

    if (ch === '"' && field === '') {
      inQuotes = true;
      i += 1;
      continue;
    }
    if (ch === ',') {
      record.push(field);
      field = '';
      i += 1;
      continue;
    }
    if (ch === '\r' || ch === '\n') {
      const skip = ch === '\r' && text[i + 1] === '\n' ? 2 : 1;
      record.push(field);
      records.push(record);
      record = [];
      field = '';
      i += skip;
      continue;
    }

    field += ch;
    i += 1;
  }

  if (field !== '' || record.length > 0) {
    record.push(field);
    records.push(record);
  }

  return records;
}

/**
 * Đọc CSV thành danh sách bản ghi theo tên cột.
 * Dòng đầu là header; dòng trống hoàn toàn bị bỏ qua; giá trị được cắt khoảng
 * trắng hai đầu (ô rỗng và ô toàn khoảng trắng là như nhau với người nhập liệu).
 */
export function parseCsv(text: string): CsvTable {
  const records = parseRecords(text ?? '');
  if (records.length === 0) return { headers: [], rows: [] };

  const headers = records[0].map((h) => h.trim());
  const rows: Record<string, string>[] = [];

  for (let r = 1; r < records.length; r++) {
    const record = records[r];
    if (record.every((cell) => cell.trim() === '')) continue;

    const row: Record<string, string> = {};
    for (let c = 0; c < headers.length; c++) {
      const header = headers[c];
      if (!header) continue;
      row[header] = (record[c] ?? '').trim();
    }
    rows.push(row);
  }

  return { headers, rows };
}

/** Bọc ngoặc kép khi ô chứa ký tự đặc biệt hoặc khoảng trắng ở hai đầu. */
function escapeField(value: string): string {
  const v = value ?? '';
  if (v === '') return '';
  if (/[",\r\n]/.test(v) || v !== v.trim()) {
    return `"${v.replace(/"/g, '""')}"`;
  }
  return v;
}

/**
 * Sinh CSV theo đúng thứ tự cột yêu cầu.
 * Có BOM UTF-8 ở đầu file vì Excel trên Windows cần BOM mới hiển thị đúng tiếng
 * Việt có dấu; `parseCsv` tự bỏ BOM nên file xuất ra vẫn import lại được.
 */
export function toCsv(headers: string[], rows: Record<string, string>[]): string {
  const lines: string[] = [headers.map(escapeField).join(',')];
  for (const row of rows) {
    lines.push(headers.map((header) => escapeField(row[header] ?? '')).join(','));
  }
  return BOM + lines.join('\r\n') + '\r\n';
}
