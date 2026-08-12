/**
 * BỘ SINH CÂU HỎI: thống kê – xác suất đơn giản và suy luận logic
 * (hai chương STAT và LOGIC của Toán khối 6–7).
 *
 * Đặc thù nhóm này: đề bài phải TỰ CHỨA ĐỦ DỮ KIỆN vì không có hình vẽ hay bảng
 * biểu kèm theo — bảng số liệu được viết thẳng bằng chữ trong đề.
 * Với bài suy luận, chỉ được có ĐÚNG MỘT kết luận đúng, không phụ thuộc giả định
 * ngầm nào của người đọc.
 *
 * File này KHÔNG import gì từ `src/` (tsx không đọc `paths` của tsconfig).
 */
import type { Draft, Gen, GenCtx } from './generators';
import { fmt, gcd, pick, ri, roundDec, shuffle, td } from './generators';

/** Danh sách số ngăn cách bằng dấu chấm phẩy — kiểu trình bày quen thuộc ở phổ thông. */
function listOf(values: number[]): string {
  return values.map((v) => fmt(v)).join('; ');
}

/** Phân số tối giản dạng chuỗi; mẫu bằng 1 thì trả về số nguyên. */
function fracStr(n: number, d: number): string {
  const g = gcd(Math.abs(n), Math.abs(d)) || 1;
  const nn = n / g;
  const dd = d / g;
  return dd === 1 ? fmt(nn) : `${fmt(nn)}/${fmt(dd)}`;
}

const SUBJECTS = ['Toán', 'Văn', 'Anh', 'Khoa học', 'Lịch sử'];
const CLASSES = ['6A', '6B', '7A', '7B', '7C'];

// ---------------------------------------------------------------------------
// STAT — Thống kê và xác suất đơn giản
// ---------------------------------------------------------------------------

function STAT01(ctx: GenCtx): Draft {
  const { r, lvl, slot } = ctx;
  const mon = pick(r, SUBJECTS);

  if (lvl === 0) {
    const diem = [5, 6, 7, 8, 9];
    const soHS = diem.map(() => ri(r, 2, 9));
    const tong = soHS.reduce((a, b) => a + b, 0);
    const idx = ri(r, 0, diem.length - 1);
    const val = soHS[idx]!;
    return {
      stem: `Kết quả bài kiểm tra môn ${mon} của một lớp được ghi lại như sau.\nĐiểm: ${listOf(diem)}\nSố học sinh: ${listOf(soHS)}\nHỏi có bao nhiêu học sinh đạt điểm ${diem[idx]}?`,
      correct: `${fmt(val)} học sinh`,
      numeric: val,
      distractors: td(`${fmt(val)} học sinh`, [
        `${fmt(diem[idx]!)} học sinh`,
        `${fmt(tong)} học sinh`,
        `${fmt(soHS[(idx + 1) % soHS.length]!)} học sinh`,
        `${fmt(tong - val)} học sinh`,
      ]),
      solution: `Bảng cho biết mỗi giá trị điểm đi kèm số học sinh đạt điểm đó. Cột điểm ${diem[idx]} ứng với ${val} học sinh. Trả lời ${diem[idx]} là nhầm GIÁ TRỊ điểm với TẦN SỐ (số học sinh) — đây là nhầm lẫn cơ bản nhất khi đọc bảng số liệu.`,
      steps: [`Tìm cột điểm ${diem[idx]} trong bảng`, `Tần số tương ứng là ${val} học sinh`],
      hint: 'Tần số là số học sinh, không phải giá trị điểm.',
      tags: ['bảng số liệu', 'tần số'],
    };
  }

  if (lvl === 1) {
    const diem = [4, 5, 6, 7, 8, 9];
    const soHS = diem.map(() => ri(r, 1, 8));
    const tong = soHS.reduce((a, b) => a + b, 0);
    if (slot % 2 === 0) {
      const nguong = pick(r, [7, 8]);
      const val = diem.reduce((acc, d, i) => (d >= nguong ? acc + soHS[i]! : acc), 0);
      return {
        stem: `Điểm kiểm tra môn ${mon} của lớp ${pick(r, CLASSES)} được thống kê như sau.\nĐiểm: ${listOf(diem)}\nSố học sinh: ${listOf(soHS)}\nHỏi có bao nhiêu học sinh đạt từ ${nguong} điểm trở lên?`,
        correct: `${fmt(val)} học sinh`,
        numeric: val,
        distractors: td(`${fmt(val)} học sinh`, [
          `${fmt(tong - val)} học sinh`,
          `${fmt(tong)} học sinh`,
          `${fmt(val - 1)} học sinh`,
          `${fmt(diem.filter((d) => d >= nguong).length)} học sinh`,
        ]),
        solution: `Các mức điểm từ ${nguong} trở lên gồm ${listOf(diem.filter((d) => d >= nguong))}, với số học sinh lần lượt là ${listOf(diem.map((d, i) => (d >= nguong ? soHS[i]! : 0)).filter((v) => v > 0))}. Cộng lại: ${diem.filter((d, i) => d >= nguong).map((_, k) => fmt(soHS[diem.findIndex((d) => d >= nguong) + k]!)).join(' + ')} = ${val} (học sinh). Trả lời ${fmt(diem.filter((d) => d >= nguong).length)} là đếm số MỨC ĐIỂM chứ không cộng số học sinh.`,
        steps: [
          `Chọn các mức điểm ≥ ${nguong}: ${listOf(diem.filter((d) => d >= nguong))}`,
          `Cộng tần số tương ứng`,
          `Tổng = ${val} học sinh`,
        ],
        hint: 'Cộng số học sinh của các mức điểm thỏa mãn, không đếm số mức điểm.',
        tags: ['bảng số liệu', 'tần số', 'hai bước'],
      };
    }
    const maxIdx = soHS.indexOf(Math.max(...soHS));
    const val = diem[maxIdx]!;
    return {
      stem: `Điểm kiểm tra môn ${mon} của một lớp được thống kê như sau.\nĐiểm: ${listOf(diem)}\nSố học sinh: ${listOf(soHS)}\nMức điểm nào có nhiều học sinh đạt được nhất?`,
      correct: `${fmt(val)} điểm`,
      numeric: val,
      distractors: td(`${fmt(val)} điểm`, [
        `${fmt(soHS[maxIdx]!)} điểm`,
        `${fmt(Math.max(...diem))} điểm`,
        `${fmt(diem[soHS.indexOf(Math.min(...soHS))]!)} điểm`,
        `${fmt(tong)} điểm`,
      ]),
      solution: `So sánh các tần số ${listOf(soHS)}, giá trị lớn nhất là ${Math.max(...soHS)} học sinh, ứng với mức ${val} điểm. Câu hỏi hỏi MỨC ĐIỂM nên đáp án là ${val} điểm; trả lời ${soHS[maxIdx]} là đưa ra tần số chứ không phải mức điểm. Trả lời ${Math.max(...diem)} là lấy điểm cao nhất trong bảng, không liên quan tới số học sinh.`,
      steps: [
        `Tần số lớn nhất là ${Math.max(...soHS)} học sinh`,
        `Tần số đó ứng với mức ${val} điểm`,
      ],
      hint: 'Tìm tần số lớn nhất trước, rồi trả lời mức điểm tương ứng.',
      tags: ['bảng số liệu', 'mốt'],
    };
  }

  // lvl 2 — suy ngược từ tỉ lệ phần trăm hoặc tìm tần số còn thiếu
  const diem = [5, 6, 7, 8, 9];
  const soHS = [ri(r, 2, 6), ri(r, 3, 8), ri(r, 4, 9), ri(r, 2, 7), ri(r, 1, 5)];
  const tong = soHS.reduce((a, b) => a + b, 0);
  if (slot % 2 === 0) {
    const nguong = 8;
    const dat = diem.reduce((acc, d, i) => (d >= nguong ? acc + soHS[i]! : acc), 0);
    const val = roundDec((dat / tong) * 100, 2);
    return {
      stem: `Điểm kiểm tra môn ${mon} của một lớp được thống kê như sau.\nĐiểm: ${listOf(diem)}\nSố học sinh: ${listOf(soHS)}\nHỏi tỉ lệ học sinh đạt từ ${nguong} điểm trở lên chiếm bao nhiêu phần trăm cả lớp? (Làm tròn đến hai chữ số thập phân.)`,
      correct: `${fmt(val)}%`,
      numeric: val,
      distractors: td(`${fmt(val)}%`, [
        `${fmt(roundDec((dat / (tong - dat)) * 100, 2))}%`,
        `${fmt(dat)}%`,
        `${fmt(roundDec(((tong - dat) / tong) * 100, 2))}%`,
        `${fmt(roundDec((dat / tong) * 10, 2))}%`,
      ]),
      solution: `Tổng số học sinh cả lớp = ${soHS.map((v) => fmt(v)).join(' + ')} = ${tong} (học sinh). Số học sinh đạt từ ${nguong} điểm trở lên = ${fmt(soHS[3]!)} + ${fmt(soHS[4]!)} = ${dat} (học sinh). Tỉ lệ = ${dat} : ${tong} × 100 = ${fmt(val)} (%). Chia cho số học sinh CÒN LẠI thay vì cho cả lớp (ra ${fmt(roundDec((dat / (tong - dat)) * 100, 2))}%) là lỗi thường gặp.`,
      steps: [
        `Tổng cả lớp = ${tong} học sinh`,
        `Đạt ≥ ${nguong} điểm = ${dat} học sinh`,
        `Tỉ lệ = ${dat} : ${tong} × 100 = ${fmt(val)}%`,
      ],
      hint: 'Mẫu số của tỉ lệ phần trăm là TỔNG cả lớp.',
      tags: ['bảng số liệu', 'phần trăm', 'nhiều bước'],
    };
  }
  const thieuIdx = ri(r, 0, diem.length - 1);
  const val = soHS[thieuIdx]!;
  const bietTong = tong;
  const conLai = soHS.filter((_, i) => i !== thieuIdx);
  return {
    stem: `Một lớp có ${bietTong} học sinh. Điểm kiểm tra môn ${mon} được thống kê như sau, trong đó số học sinh đạt ${diem[thieuIdx]} điểm bị mờ mất.\nĐiểm: ${listOf(diem)}\nSố học sinh: ${diem.map((_, i) => (i === thieuIdx ? '?' : fmt(soHS[i]!))).join('; ')}\nHỏi có bao nhiêu học sinh đạt ${diem[thieuIdx]} điểm?`,
    correct: `${fmt(val)} học sinh`,
    numeric: val,
    distractors: td(`${fmt(val)} học sinh`, [
      `${fmt(bietTong - val - 1)} học sinh`,
      `${fmt(diem[thieuIdx]!)} học sinh`,
      `${fmt(bietTong)} học sinh`,
      `${fmt(conLai.reduce((a, b) => a + b, 0))} học sinh`,
    ]),
    solution: `Tổng số học sinh của các mức đã biết = ${conLai.map((v) => fmt(v)).join(' + ')} = ${fmt(conLai.reduce((a, b) => a + b, 0))} (học sinh). Vì cả lớp có ${bietTong} học sinh nên số học sinh đạt ${diem[thieuIdx]} điểm = ${bietTong} − ${fmt(conLai.reduce((a, b) => a + b, 0))} = ${val} (học sinh). Trả lời ${fmt(conLai.reduce((a, b) => a + b, 0))} là dừng ở tổng các mức đã biết mà quên trừ khỏi sĩ số.`,
    steps: [
      `Tổng các mức đã biết = ${fmt(conLai.reduce((a, b) => a + b, 0))} học sinh`,
      `Số còn thiếu = ${bietTong} − ${fmt(conLai.reduce((a, b) => a + b, 0))} = ${val} học sinh`,
    ],
    hint: 'Tổng mọi tần số phải bằng sĩ số lớp.',
    tags: ['bảng số liệu', 'suy luận ngược'],
  };
}

function STAT02(ctx: GenCtx): Draft {
  const { r, lvl, slot } = ctx;

  if (lvl === 0) {
    const n = ri(r, 4, 6);
    const values: number[] = [];
    for (let i = 0; i < n; i++) values.push(ri(r, 4, 10));
    // Ép tổng chia hết cho n để trung bình ra số đẹp
    const tong = values.reduce((a, b) => a + b, 0);
    const bu = (n - (tong % n)) % n;
    values[values.length - 1] = values[values.length - 1]! + bu;
    const tongMoi = values.reduce((a, b) => a + b, 0);
    const val = tongMoi / n;
    return {
      stem: `Điểm ${n} bài kiểm tra của bạn Minh lần lượt là ${listOf(values)}. Tính điểm trung bình của Minh.`,
      correct: fmt(val),
      numeric: val,
      distractors: td(fmt(val), [
        fmt(tongMoi),
        fmt(roundDec(tongMoi / (n - 1), 2)),
        fmt(Math.max(...values)),
        fmt(roundDec((Math.max(...values) + Math.min(...values)) / 2, 2)),
      ]),
      solution: `Trung bình cộng = tổng các giá trị chia cho số giá trị. Tổng = ${values.map((v) => fmt(v)).join(' + ')} = ${tongMoi}. Có ${n} bài nên điểm trung bình = ${tongMoi} : ${n} = ${fmt(val)}. Chia cho ${n - 1} (ra ${fmt(roundDec(tongMoi / (n - 1), 2))}) là đếm thiếu một bài.`,
      steps: [`Tổng = ${tongMoi}`, `Số bài = ${n}`, `Trung bình = ${tongMoi} : ${n} = ${fmt(val)}`],
      hint: 'Cộng tất cả rồi chia cho số lượng.',
      tags: ['trung bình cộng'],
    };
  }

  if (lvl === 1) {
    const diem = [6, 7, 8, 9];
    const soHS = diem.map(() => ri(r, 2, 8));
    const tongHS = soHS.reduce((a, b) => a + b, 0);
    const tongDiem = diem.reduce((acc, d, i) => acc + d * soHS[i]!, 0);
    const val = roundDec(tongDiem / tongHS, 2);
    return {
      stem: `Điểm kiểm tra của một nhóm học sinh được thống kê như sau.\nĐiểm: ${listOf(diem)}\nSố học sinh: ${listOf(soHS)}\nTính điểm trung bình của nhóm. (Làm tròn đến hai chữ số thập phân.)`,
      correct: fmt(val),
      numeric: val,
      distractors: td(fmt(val), [
        fmt(roundDec(diem.reduce((a, b) => a + b, 0) / diem.length, 2)),
        fmt(roundDec(tongDiem / diem.length, 2)),
        fmt(tongHS),
        fmt(roundDec(tongDiem, 2)),
      ]),
      solution: `Phải nhân mỗi mức điểm với SỐ HỌC SINH đạt mức đó rồi mới cộng: tổng điểm = ${diem.map((d, i) => `${d} × ${soHS[i]}`).join(' + ')} = ${tongDiem}. Tổng số học sinh = ${soHS.map((v) => fmt(v)).join(' + ')} = ${tongHS}. Điểm trung bình = ${tongDiem} : ${tongHS} = ${fmt(val)}. Lấy trung bình của bốn mức điểm (ra ${fmt(roundDec(diem.reduce((a, b) => a + b, 0) / diem.length, 2))}) là bỏ qua tần số — lỗi nặng nhất ở dạng này.`,
      steps: [
        `Tổng điểm = ${diem.map((d, i) => `${d}×${soHS[i]}`).join(' + ')} = ${tongDiem}`,
        `Tổng số học sinh = ${tongHS}`,
        `Trung bình = ${tongDiem} : ${tongHS} = ${fmt(val)}`,
      ],
      hint: 'Mỗi mức điểm phải nhân với số học sinh đạt mức đó trước khi cộng.',
      tags: ['trung bình cộng', 'tần số'],
    };
  }

  // lvl 2 — suy ngược: biết trung bình, tìm giá trị còn thiếu
  const n = ri(r, 4, 6);
  const tb = ri(r, 6, 9);
  const values: number[] = [];
  for (let i = 0; i < n - 1; i++) values.push(ri(r, 4, 10));
  const daCo = values.reduce((a, b) => a + b, 0);
  const val = tb * n - daCo;
  if (val < 0 || val > 10 || slot % 2 === 1) {
    // Biến thể: thêm một bài nữa để nâng trung bình lên mức mong muốn
    const nCu = ri(r, 3, 5);
    const tbCu = ri(r, 5, 7);
    const tbMoi = tbCu + 1;
    const canThem = tbMoi * (nCu + 1) - tbCu * nCu;
    return {
      stem: `Bạn An đã làm ${nCu} bài kiểm tra với điểm trung bình là ${tbCu}. Hỏi bài kiểm tra thứ ${nCu + 1} An phải đạt bao nhiêu điểm để điểm trung bình của cả ${nCu + 1} bài là ${tbMoi}?`,
      correct: fmt(canThem),
      numeric: canThem,
      distractors: td(fmt(canThem), [
        fmt(tbMoi),
        fmt(tbMoi + 1),
        fmt(tbCu * nCu),
        fmt(roundDec(tbMoi * (nCu + 1), 2)),
      ]),
      solution: `Tổng điểm ${nCu} bài đầu = ${tbCu} × ${nCu} = ${fmt(tbCu * nCu)}. Để trung bình ${nCu + 1} bài là ${tbMoi} thì tổng điểm phải là ${tbMoi} × ${nCu + 1} = ${fmt(tbMoi * (nCu + 1))}. Vậy bài cuối cần đạt ${fmt(tbMoi * (nCu + 1))} − ${fmt(tbCu * nCu)} = ${canThem} (điểm). Trả lời ${tbMoi} là tưởng chỉ cần đạt đúng mức trung bình mới — sai, vì còn phải kéo các bài cũ lên.`,
      steps: [
        `Tổng cũ = ${tbCu} × ${nCu} = ${fmt(tbCu * nCu)}`,
        `Tổng cần có = ${tbMoi} × ${nCu + 1} = ${fmt(tbMoi * (nCu + 1))}`,
        `Bài cuối = ${fmt(tbMoi * (nCu + 1))} − ${fmt(tbCu * nCu)} = ${canThem}`,
      ],
      hint: 'Đưa về TỔNG điểm trước và sau, rồi lấy hiệu.',
      tags: ['trung bình cộng', 'suy luận ngược', 'nhiều bước'],
    };
  }
  return {
    stem: `Điểm ${n - 1} bài kiểm tra đầu của bạn Lan lần lượt là ${listOf(values)}. Hỏi bài thứ ${n} Lan phải đạt bao nhiêu điểm để điểm trung bình của cả ${n} bài bằng ${tb}?`,
    correct: fmt(val),
    numeric: val,
    distractors: td(fmt(val), [fmt(tb), fmt(daCo), fmt(tb * n), fmt(roundDec(daCo / (n - 1), 2))]),
    solution: `Muốn trung bình ${n} bài bằng ${tb} thì tổng điểm phải là ${tb} × ${n} = ${fmt(tb * n)}. Tổng ${n - 1} bài đã có = ${values.map((v) => fmt(v)).join(' + ')} = ${daCo}. Vậy bài cuối cần ${fmt(tb * n)} − ${daCo} = ${val} (điểm). Trả lời ${tb} là tưởng bài cuối chỉ cần bằng đúng mức trung bình mong muốn.`,
    steps: [
      `Tổng cần có = ${tb} × ${n} = ${fmt(tb * n)}`,
      `Tổng đã có = ${daCo}`,
      `Bài cuối = ${fmt(tb * n)} − ${daCo} = ${val}`,
    ],
    hint: 'Tính tổng điểm cần có trước, rồi trừ đi phần đã có.',
    tags: ['trung bình cộng', 'suy luận ngược'],
  };
}

function STAT03(ctx: GenCtx): Draft {
  const { r, lvl, slot } = ctx;

  if (lvl === 0) {
    if (slot % 2 === 0) {
      const dieuKien = pick(r, [
        { mo: 'số chẵn', dem: 3 },
        { mo: 'số lẻ', dem: 3 },
        { mo: 'số lớn hơn 4', dem: 2 },
        { mo: 'số nhỏ hơn 3', dem: 2 },
      ]);
      const val = fracStr(dieuKien.dem, 6);
      return {
        stem: `Gieo một con xúc xắc cân đối sáu mặt. Tính xác suất để mặt xuất hiện có số chấm là ${dieuKien.mo}.`,
        correct: val,
        distractors: td(val, [
          fracStr(6, dieuKien.dem),
          fracStr(dieuKien.dem, 12),
          fmt(dieuKien.dem),
          fracStr(dieuKien.dem + 1, 6),
        ]),
        solution: `Con xúc xắc có 6 mặt nên có 6 kết quả có thể xảy ra, tất cả đồng khả năng. Số kết quả thuận lợi cho biến cố "${dieuKien.mo}" là ${dieuKien.dem}. Xác suất = ${dieuKien.dem}/6 = ${val}. Đảo ngược tử và mẫu (ra ${fracStr(6, dieuKien.dem)}) là lỗi hay gặp: mẫu số luôn là TỔNG số kết quả có thể.`,
        steps: [
          `Số kết quả có thể = 6`,
          `Số kết quả thuận lợi = ${dieuKien.dem}`,
          `Xác suất = ${dieuKien.dem}/6 = ${val}`,
        ],
        hint: 'Xác suất bằng số kết quả thuận lợi chia cho tổng số kết quả.',
        tags: ['xác suất', 'xúc xắc'],
      };
    }
    const do1 = ri(r, 2, 6);
    const xanh = ri(r, 2, 6);
    const tong = do1 + xanh;
    const val = fracStr(do1, tong);
    return {
      stem: `Một hộp có ${do1} viên bi đỏ và ${xanh} viên bi xanh, các viên bi chỉ khác nhau về màu. Lấy ngẫu nhiên một viên bi. Tính xác suất lấy được bi đỏ.`,
      correct: val,
      distractors: td(val, [
        fracStr(do1, xanh),
        fracStr(xanh, tong),
        fmt(do1),
        fracStr(1, tong),
      ]),
      solution: `Tổng số bi trong hộp = ${do1} + ${xanh} = ${tong} (viên), mỗi viên có khả năng được lấy như nhau. Số viên bi đỏ là ${do1}. Xác suất lấy được bi đỏ = ${do1}/${tong} = ${val}. Lấy ${do1}/${xanh} (tỉ số đỏ trên xanh) là sai, vì mẫu số phải là TỔNG số bi.`,
      steps: [
        `Tổng số bi = ${do1} + ${xanh} = ${tong}`,
        `Số bi đỏ = ${do1}`,
        `Xác suất = ${do1}/${tong} = ${val}`,
      ],
      hint: 'Mẫu số là tổng số bi trong hộp, không phải số bi màu còn lại.',
      tags: ['xác suất', 'bốc bi'],
    };
  }

  if (lvl === 1) {
    const do1 = ri(r, 3, 8);
    const xanh = ri(r, 3, 8);
    const vang = ri(r, 2, 6);
    const tong = do1 + xanh + vang;
    const val = fracStr(do1 + vang, tong);
    return {
      stem: `Một hộp có ${do1} viên bi đỏ, ${xanh} viên bi xanh và ${vang} viên bi vàng, chỉ khác nhau về màu. Lấy ngẫu nhiên một viên. Tính xác suất lấy được viên bi KHÔNG phải màu xanh.`,
      correct: val,
      distractors: td(val, [
        fracStr(xanh, tong),
        fracStr(do1, tong),
        fracStr(do1 + vang, xanh),
        fracStr(vang, tong),
      ]),
      solution: `Tổng số bi = ${do1} + ${xanh} + ${vang} = ${tong} (viên). Bi không phải màu xanh gồm bi đỏ và bi vàng: ${do1} + ${vang} = ${do1 + vang} (viên). Xác suất = ${do1 + vang}/${tong} = ${val}. Có thể kiểm tra bằng cách khác: xác suất lấy được bi xanh là ${fracStr(xanh, tong)}, nên xác suất KHÔNG xanh = 1 − ${fracStr(xanh, tong)} = ${val} ✓.`,
      steps: [
        `Tổng số bi = ${tong}`,
        `Bi không xanh = ${do1} + ${vang} = ${do1 + vang}`,
        `Xác suất = ${do1 + vang}/${tong} = ${val}`,
      ],
      hint: 'Có thể đếm trực tiếp, hoặc lấy 1 trừ đi xác suất của biến cố đối.',
      tags: ['xác suất', 'biến cố đối'],
    };
  }

  // lvl 2 — suy ngược: biết xác suất, tìm số lượng
  const xanh = ri(r, 3, 9);
  const k = ri(r, 2, 4);
  const tong = xanh * k;
  const val = tong - xanh;
  const xs = fracStr(xanh, tong);
  return {
    stem: `Một hộp chỉ có bi xanh và bi đỏ. Biết hộp có ${xanh} viên bi xanh và xác suất lấy ngẫu nhiên được một viên bi xanh là ${xs}. Hỏi trong hộp có bao nhiêu viên bi đỏ?`,
    correct: `${fmt(val)} viên`,
    numeric: val,
    distractors: td(`${fmt(val)} viên`, [
      `${fmt(tong)} viên`,
      `${fmt(xanh)} viên`,
      `${fmt(val + xanh)} viên`,
      `${fmt(Math.max(1, val - xanh))} viên`,
    ]),
    solution: `Gọi tổng số bi là T. Xác suất lấy được bi xanh = ${xanh}/T = ${xs}, suy ra T = ${tong} (viên). Số bi đỏ = tổng trừ số bi xanh = ${tong} − ${xanh} = ${val} (viên). Trả lời ${tong} là đưa ra TỔNG số bi chứ không phải số bi đỏ — đọc kỹ câu hỏi.`,
    steps: [
      `${xanh}/T = ${xs} ⇒ T = ${tong} viên`,
      `Số bi đỏ = ${tong} − ${xanh} = ${val} viên`,
    ],
    hint: 'Tìm tổng số bi từ xác suất trước, rồi trừ đi số bi xanh.',
    tags: ['xác suất', 'suy luận ngược', 'nhiều bước'],
  };
}

// ---------------------------------------------------------------------------
// LOGIC — Suy luận
// ---------------------------------------------------------------------------

const NAMES = ['An', 'Bình', 'Chi', 'Dũng', 'Hà', 'Khoa'];

function LOGIC01(ctx: GenCtx): Draft {
  const { r, lvl, slot } = ctx;

  if (lvl === 0) {
    const [a, b, c] = shuffle(r, NAMES).slice(0, 3) as [string, string, string];
    const d1 = ri(r, 2, 6);
    const d2 = ri(r, 2, 6);
    const val = `${c}`;
    return {
      stem: `${a} cao hơn ${b} là ${d1} cm. ${b} cao hơn ${c} là ${d2} cm. Hỏi ai là người thấp nhất trong ba bạn?`,
      correct: val,
      distractors: td(val, [a, b, 'Không xác định được', `${a} và ${b} cao bằng nhau`]),
      solution: `Từ "${a} cao hơn ${b}" ta có ${a} > ${b}. Từ "${b} cao hơn ${c}" ta có ${b} > ${c}. Ghép lại: ${a} > ${b} > ${c}. Vậy ${c} là người thấp nhất. Hai số ${d1} cm và ${d2} cm chỉ để xác nhận thứ tự, không cần dùng tới khi trả lời câu hỏi này.`,
      steps: [`${a} > ${b}`, `${b} > ${c}`, `Suy ra ${a} > ${b} > ${c} nên ${c} thấp nhất`],
      hint: 'Xếp ba bạn lên một hàng theo thứ tự cao thấp rồi đọc kết quả.',
      tags: ['suy luận', 'thứ tự'],
    };
  }

  if (lvl === 1) {
    const [a, b, c] = shuffle(r, NAMES).slice(0, 3) as [string, string, string];
    const mons = shuffle(r, ['Toán', 'Văn', 'Anh']) as [string, string, string];
    return {
      stem: `Ba bạn ${a}, ${b}, ${c} mỗi bạn thích đúng một môn khác nhau trong ba môn ${mons[0]}, ${mons[1]}, ${mons[2]}. Biết rằng: ${a} không thích ${mons[0]} và cũng không thích ${mons[1]}; ${b} không thích ${mons[1]}. Hỏi ${b} thích môn nào?`,
      correct: mons[0],
      distractors: td(mons[0], [mons[1], mons[2], 'Không xác định được']),
      solution: `${a} không thích ${mons[0]} và ${mons[1]} nên ${a} thích ${mons[2]}. Môn ${mons[2]} đã có người, mà ${b} không thích ${mons[1]}, nên ${b} chỉ có thể thích ${mons[0]}. Bạn còn lại là ${c} thích ${mons[1]}. Kiểm tra lại: ${a}–${mons[2]}, ${b}–${mons[0]}, ${c}–${mons[1]} thỏa mãn mọi dữ kiện ✓.`,
      steps: [
        `${a} loại ${mons[0]} và ${mons[1]} ⇒ ${a} thích ${mons[2]}`,
        `${b} loại ${mons[1]} và ${mons[2]} đã có người ⇒ ${b} thích ${mons[0]}`,
        `${c} thích ${mons[1]}`,
      ],
      hint: 'Bắt đầu từ bạn bị loại nhiều nhất — bạn đó chỉ còn một lựa chọn.',
      tags: ['suy luận', 'loại trừ'],
    };
  }

  // lvl 2 — suy luận có mệnh đề phủ định lồng nhau
  const [a, b, c, d] = shuffle(r, NAMES).slice(0, 4) as [string, string, string, string];
  const giai = shuffle(r, ['nhất', 'nhì', 'ba', 'tư']) as [string, string, string, string];
  const val = `${b} đạt giải ${giai[0]}`;
  return {
    stem: `Bốn bạn ${a}, ${b}, ${c}, ${d} đạt bốn giải khác nhau: ${giai[0]}, ${giai[1]}, ${giai[2]}, ${giai[3]}. Biết rằng: ${a} không đạt giải ${giai[0]} và không đạt giải ${giai[3]}; ${c} đạt giải ${giai[3]}; ${d} không đạt giải ${giai[0]}. Hỏi ai đạt giải ${giai[0]}, và đó là giải nào?`,
    correct: val,
    distractors: td(val, [
      `${a} đạt giải ${giai[0]}`,
      `${d} đạt giải ${giai[0]}`,
      `${c} đạt giải ${giai[0]}`,
      'Không xác định được',
    ]),
    solution: `${c} đã đạt giải ${giai[3]} nên ba bạn còn lại chia nhau ${giai[0]}, ${giai[1]}, ${giai[2]}. ${a} không đạt giải ${giai[0]}, ${d} cũng không đạt giải ${giai[0]}, mà ${c} đã có giải khác — vậy chỉ còn ${b} đạt giải ${giai[0]}. Kiểm tra: loại trừ hết ba người, người còn lại buộc phải nhận giải đó ✓.`,
    steps: [
      `${c} đạt giải ${giai[3]}`,
      `${a} và ${d} đều loại giải ${giai[0]}`,
      `Chỉ còn ${b} ⇒ ${b} đạt giải ${giai[0]}`,
    ],
    hint: 'Gạch bỏ dần những người không thể nhận giải đó, ai còn lại là đáp án.',
    tags: ['suy luận', 'loại trừ', 'nhiều bước'],
  };
}

function LOGIC02(ctx: GenCtx): Draft {
  const { r, lvl } = ctx;

  if (lvl === 0) {
    const loai = ri(r, 3, 6);
    const val = loai + 1;
    return {
      stem: `Trong một chiếc hộp có bi thuộc ${loai} màu khác nhau. Hỏi phải lấy ra ít nhất bao nhiêu viên bi (không nhìn vào hộp) để chắc chắn có ít nhất hai viên cùng màu?`,
      correct: `${fmt(val)} viên`,
      numeric: val,
      distractors: td(`${fmt(val)} viên`, [
        `${fmt(loai)} viên`,
        `${fmt(2 * loai)} viên`,
        `${fmt(val + 1)} viên`,
        `${fmt(loai - 1)} viên`,
      ]),
      solution: `Trường hợp xấu nhất là ${loai} viên lấy ra có ${loai} màu khác nhau, khi đó vẫn chưa có hai viên nào cùng màu. Nhưng viên thứ ${val} bắt buộc phải trùng màu với một trong ${loai} viên trước đó, vì chỉ có ${loai} màu. Vậy cần lấy ít nhất ${val} viên. Trả lời ${loai} viên là quên xét đúng trường hợp xấu nhất.`,
      steps: [
        `Xấu nhất: ${loai} viên đầu có ${loai} màu khác nhau`,
        `Viên thứ ${val} buộc phải trùng màu`,
        `Cần ít nhất ${val} viên`,
      ],
      hint: 'Xét trường hợp xấu nhất: mỗi màu lấy được đúng một viên.',
      tags: ['Dirichlet', 'chuồng bồ câu'],
    };
  }

  if (lvl === 1) {
    const loai = ri(r, 3, 5);
    const k = ri(r, 3, 4);
    const val = loai * (k - 1) + 1;
    return {
      stem: `Một hộp chứa bi thuộc ${loai} màu khác nhau, mỗi màu có rất nhiều viên. Hỏi phải lấy ra ít nhất bao nhiêu viên để chắc chắn có ít nhất ${k} viên cùng màu?`,
      correct: `${fmt(val)} viên`,
      numeric: val,
      distractors: td(`${fmt(val)} viên`, [
        `${fmt(loai * k)} viên`,
        `${fmt(loai * (k - 1))} viên`,
        `${fmt(loai + k)} viên`,
        `${fmt(k)} viên`,
      ]),
      solution: `Trường hợp xấu nhất là mỗi màu lấy được đúng ${k - 1} viên mà vẫn chưa đủ ${k} viên cùng màu: khi đó đã lấy ${loai} × ${k - 1} = ${fmt(loai * (k - 1))} (viên). Chỉ cần thêm 1 viên nữa là chắc chắn có một màu đủ ${k} viên. Vậy cần ít nhất ${fmt(loai * (k - 1))} + 1 = ${val} (viên). Trả lời ${fmt(loai * k)} là tính thừa: không cần mọi màu đều đạt ${k} viên.`,
      steps: [
        `Xấu nhất: mỗi màu ${k - 1} viên ⇒ ${loai} × ${k - 1} = ${fmt(loai * (k - 1))} viên`,
        `Thêm 1 viên là chắc chắn đủ`,
        `Cần ít nhất ${val} viên`,
      ],
      hint: 'Công thức: số ngăn × (số cần − 1) + 1.',
      tags: ['Dirichlet', 'chuồng bồ câu'],
    };
  }

  // lvl 2 — Dirichlet dạng chia ngăn theo số dư hoặc theo tháng sinh
  const hs = ri(r, 4, 8) * 12 + ri(r, 1, 11);
  const val = Math.ceil(hs / 12);
  return {
    stem: `Một trường có ${hs} học sinh. Chứng tỏ rằng có ít nhất một tháng trong năm mà số học sinh sinh vào tháng đó không ít hơn một số nào đó. Hỏi số đó lớn nhất bằng bao nhiêu?`,
    correct: `${fmt(val)} học sinh`,
    numeric: val,
    distractors: td(`${fmt(val)} học sinh`, [
      `${fmt(Math.floor(hs / 12))} học sinh`,
      `${fmt(val + 1)} học sinh`,
      `12 học sinh`,
      `${fmt(hs - 12)} học sinh`,
    ]),
    solution: `Một năm có 12 tháng, coi mỗi tháng là một "ngăn" và mỗi học sinh là một "đồ vật". Nếu mọi tháng đều có không quá ${val - 1} học sinh thì tổng số học sinh nhiều nhất là 12 × ${val - 1} = ${fmt(12 * (val - 1))} < ${hs}, mâu thuẫn. Vậy phải có ít nhất một tháng có từ ${val} học sinh trở lên. Con số ${val} chính là ${hs} chia 12 rồi làm tròn LÊN. Lấy phần nguyên (${fmt(Math.floor(hs / 12))}) là làm tròn xuống — sai chiều.`,
    steps: [
      `12 tháng đóng vai trò 12 ngăn`,
      `Giả sử mỗi tháng ≤ ${val - 1} học sinh ⇒ tổng ≤ ${fmt(12 * (val - 1))} < ${hs}`,
      `Mâu thuẫn ⇒ có tháng ≥ ${val} học sinh`,
    ],
    hint: 'Chia số học sinh cho 12 rồi làm tròn LÊN.',
    tags: ['Dirichlet', 'phản chứng', 'nhiều bước'],
  };
}

function LOGIC03(ctx: GenCtx): Draft {
  const { r, lvl, slot } = ctx;

  if (lvl === 0) {
    const phan = ri(r, 2, 5);
    const moiPhan = ri(r, 3, 9);
    const tong = phan * moiPhan;
    return {
      stem: `Chia ${tong} quyển vở thành ${phan} phần bằng nhau. Hỏi mỗi phần có bao nhiêu quyển vở?`,
      correct: `${fmt(moiPhan)} quyển`,
      numeric: moiPhan,
      distractors: td(`${fmt(moiPhan)} quyển`, [
        `${fmt(tong - phan)} quyển`,
        `${fmt(phan)} quyển`,
        `${fmt(moiPhan + 1)} quyển`,
        `${fmt(tong)} quyển`,
      ]),
      solution: `Chia đều ${tong} quyển vở cho ${phan} phần: mỗi phần có ${tong} : ${phan} = ${moiPhan} (quyển). Kiểm tra lại: ${phan} × ${moiPhan} = ${tong} ✓. Lấy hiệu ${tong} − ${phan} = ${fmt(tong - phan)} là nhầm phép chia thành phép trừ.`,
      steps: [`Mỗi phần = ${tong} : ${phan} = ${moiPhan} quyển`],
      hint: 'Chia đều thì dùng phép chia.',
      tags: ['chia phần'],
    };
  }

  if (lvl === 1) {
    if (slot % 2 === 0) {
      const lan = ri(r, 2, 3);
      const nhom = Math.pow(3, lan);
      return {
        stem: `Có ${nhom} đồng xu giống hệt nhau về bề ngoài, trong đó có đúng một đồng nhẹ hơn các đồng còn lại. Dùng một chiếc cân thăng bằng hai đĩa (không có quả cân), hỏi cần cân ít nhất bao nhiêu lần để chắc chắn tìm ra đồng xu nhẹ đó?`,
        correct: `${fmt(lan)} lần`,
        numeric: lan,
        distractors: td(`${fmt(lan)} lần`, [
          `${fmt(lan + 1)} lần`,
          `${fmt(nhom / 2)} lần`,
          `${fmt(nhom - 1)} lần`,
          `${fmt(Math.max(1, lan - 1))} lần`,
        ]),
        solution: `Mỗi lần cân chia số đồng xu thành BA nhóm bằng nhau: đặt hai nhóm lên hai đĩa, nhóm còn lại để ngoài. Nếu cân thăng bằng thì đồng nhẹ nằm ở nhóm ngoài, ngược lại nó nằm ở đĩa nhẹ hơn. Như vậy mỗi lần cân thu hẹp phạm vi còn 1/3. Vì ${nhom} = 3^${lan} nên sau ${lan} lần cân là tìm ra. Chia đôi (thay vì chia ba) sẽ cần nhiều lần cân hơn — cân thăng bằng cho BA kết quả chứ không phải hai.`,
        steps: [
          `Mỗi lần cân chia 3 nhóm bằng nhau`,
          `Sau mỗi lần, phạm vi còn 1/3`,
          `${nhom} = 3^${lan} ⇒ cần ${lan} lần`,
        ],
        hint: 'Cân thăng bằng cho ba kết quả, nên chia ba chứ không chia đôi.',
        tags: ['cân đo', 'suy luận'],
      };
    }
    const tong = ri(r, 5, 12) * 2;
    const hieu = ri(r, 1, Math.floor(tong / 2) - 1) * 2;
    const lon = (tong + hieu) / 2;
    return {
      stem: `Hai bạn có tổng cộng ${tong} viên kẹo. Nếu bạn thứ nhất cho bạn thứ hai ${hieu / 2} viên thì hai bạn có số kẹo bằng nhau. Hỏi ban đầu bạn thứ nhất có bao nhiêu viên kẹo?`,
      correct: `${fmt(lon)} viên`,
      numeric: lon,
      distractors: td(`${fmt(lon)} viên`, [
        `${fmt(tong - lon)} viên`,
        `${fmt(tong / 2)} viên`,
        `${fmt(lon - hieu / 2)} viên`,
        `${fmt(tong)} viên`,
      ]),
      solution: `Cho đi ${hieu / 2} viên thì bằng nhau, nghĩa là ban đầu bạn thứ nhất hơn bạn thứ hai 2 × ${hieu / 2} = ${hieu} (viên) — cho đi bao nhiêu thì người kia nhận bấy nhiêu, nên khoảng cách giảm GẤP ĐÔI số kẹo cho đi. Biết tổng ${tong} và hiệu ${hieu}: bạn thứ nhất có (${tong} + ${hieu}) : 2 = ${lon} (viên). Nhầm hiệu là ${hieu / 2} thay vì ${hieu} là lỗi cốt lõi của dạng bài này.`,
      steps: [
        `Hiệu ban đầu = 2 × ${hieu / 2} = ${hieu} viên`,
        `Bạn thứ nhất = (${tong} + ${hieu}) : 2 = ${lon} viên`,
      ],
      hint: 'Cho đi một viên thì khoảng cách giảm hai viên.',
      tags: ['chia phần', 'tổng hiệu'],
    };
  }

  // lvl 2 — chia theo tỉ lệ nhiều phần
  const p1 = ri(r, 1, 4);
  const p2 = ri(r, 1, 4);
  const p3 = ri(r, 1, 4);
  const tongPhan = p1 + p2 + p3;
  const moiPhan = ri(r, 3, 12);
  const tong = tongPhan * moiPhan;
  const val = p3 * moiPhan;
  return {
    stem: `Chia ${tong} quyển sách cho ba lớp theo tỉ lệ ${p1} : ${p2} : ${p3}. Hỏi lớp thứ ba nhận được bao nhiêu quyển sách?`,
    correct: `${fmt(val)} quyển`,
    numeric: val,
    distractors: td(`${fmt(val)} quyển`, [
      `${fmt(moiPhan)} quyển`,
      `${fmt(p1 * moiPhan)} quyển`,
      `${fmt(p2 * moiPhan)} quyển`,
      `${fmt(roundDec(tong / 3, 2))} quyển`,
    ]),
    solution: `Tổng số phần bằng nhau = ${p1} + ${p2} + ${p3} = ${tongPhan} (phần). Giá trị một phần = ${tong} : ${tongPhan} = ${moiPhan} (quyển). Lớp thứ ba nhận ${p3} phần nên được ${p3} × ${moiPhan} = ${val} (quyển). Kiểm tra: ${fmt(p1 * moiPhan)} + ${fmt(p2 * moiPhan)} + ${val} = ${tong} ✓. Dừng ở ${moiPhan} quyển là quên nhân với số phần của lớp thứ ba; chia đều cho 3 (ra ${fmt(roundDec(tong / 3, 2))}) là bỏ qua tỉ lệ.`,
    steps: [
      `Tổng số phần = ${p1} + ${p2} + ${p3} = ${tongPhan}`,
      `Một phần = ${tong} : ${tongPhan} = ${moiPhan} quyển`,
      `Lớp ba = ${p3} × ${moiPhan} = ${val} quyển`,
    ],
    hint: 'Tìm giá trị một phần trước, rồi nhân với số phần của lớp cần tính.',
    tags: ['chia tỉ lệ', 'nhiều bước'],
  };
}

export const STAT_LOGIC_GENERATORS: Record<string, Gen> = {
  STAT01,
  STAT02,
  STAT03,
  LOGIC01,
  LOGIC02,
  LOGIC03,
};
