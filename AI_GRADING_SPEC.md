# SPEC: Tính năng "Thi thử + Chấm điểm bằng AI"

> **Đọc hết file này trước khi viết dòng code đầu tiên.**
> Mục tiêu: MVP demo được trong thời gian ngắn nhất. **Ưu tiên NHANH > rẻ > tối ưu.**

---

## 0. QUY TẮC BẮT BUỘC CHO AGENT

1. **Dò stack hiện tại trước.** Đọc `package.json`, `prisma/schema.prisma` (hoặc `drizzle/`, `supabase/migrations/`), cấu trúc thư mục `app/` hoặc `pages/`, file `.env.example`. **Tái sử dụng** ORM / auth / UI kit / storage đã có. Tuyệt đối không cài thêm framework mới nếu dự án đã có tương đương.
2. **KHÔNG dùng message queue ngoài** (Inngest, Trigger.dev, BullMQ, Redis...). MVP này client tự orchestrate. Lý do: ít hạ tầng = ship nhanh.
3. **KHÔNG tự ý đổi tên bảng/route** đã định nghĩa dưới đây. Nếu buộc phải đổi vì trùng, ghi rõ vào `IMPLEMENTATION_NOTES.md`.
4. **Mỗi bước xong phải chạy được.** Không viết 20 file rồi mới test. Theo đúng thứ tự ở §12.
5. Ngôn ngữ UI: **tiếng Việt**. Code/biến/comment: tiếng Anh.
6. Khi gặp quyết định mơ hồ → chọn phương án **ít code nhất** và ghi chú lại, không hỏi lại.

---

## 1. PHẠM VI MVP

### CÓ trong MVP
- Học sinh chọn 1 đề thi → làm bài → nộp → nhận điểm + nhận xét từng câu.
- 3 kiểu câu hỏi: trắc nghiệm, trả lời ngắn, tự luận (chụp ảnh bài làm).
- Chấm tự luận bằng AI theo **rubric có sẵn**, trả về điểm từng tiêu chí + trích dẫn bằng chứng.
- Đếm giờ làm bài (countdown).
- Trang kết quả: tổng điểm, điểm từng câu, transcript AI đọc được từ ảnh, feedback tiếng Việt.
- Trang quản trị tối thiểu: xem lại bài đã nộp, sửa điểm bằng tay.

### KHÔNG có trong MVP (ghi vào backlog, đừng làm)
- Tự động số hóa đề từ PDF (đề đầu tiên seed bằng tay — file JSON đã có sẵn ở §14).
- Xếp hạng, leaderboard, huy hiệu.
- Thanh toán, giới hạn lượt thi.
- Chống gian lận (chuyển tab, webcam giám sát).
- Self-consistency (chấm 3 lần lấy median) — chỉ chấm 1 lần.
- Realtime websocket — dùng polling/client orchestration.

---

## 2. KIẾN TRÚC TỔNG THỂ

```
┌──────────────────────────────────────────────────────────────┐
│  CLIENT (Next.js / React)                                     │
│                                                               │
│  1. GET /api/exams/[slug]        → tải đề (không có đáp án)   │
│  2. Làm bài, lưu draft vào localStorage                       │
│  3. Ảnh tự luận → nén client-side → POST /api/upload          │
│  4. POST /api/attempts/submit    → tạo attempt, chấm tầng A+B │
│     ← trả về ngay: điểm A+B + danh sách essay cần chấm        │
│  5. Promise.all: POST /api/grade/essay  ×N câu SONG SONG      │
│     ← mỗi câu trả về điểm + feedback, cập nhật progress bar   │
│  6. Redirect /results/[attemptId]                             │
└──────────────────────────────────────────────────────────────┘
```

**Vì sao client orchestrate:** chấm 1 câu tự luận mất 15–40s. Chạy 10 câu tuần tự trong 1 HTTP request = timeout chắc chắn. Cho client bắn 10 request song song → tổng ~40s, có progress bar đẹp để demo, và **không cần dựng queue**.

**Chốt chặn:** nếu 1 request lỗi → retry 1 lần → vẫn lỗi thì đánh dấu câu đó `status = 'failed'`, cho user bấm "Chấm lại câu này" ở trang kết quả. Không để cả bài thi hỏng vì 1 câu.

---

## 3. PHÂN TẦNG CHẤM ĐIỂM (quan trọng nhất)

**Không bao giờ để AI chấm những gì code chấm được.** Mỗi câu hỏi có field `grading_mode`:

| `grading_mode` | Áp dụng | Cách chấm | Gọi AI? |
|---|---|---|---|
| `exact` | Trắc nghiệm | So sánh string với `answer_key` | Không |
| `numeric` | Đáp số là số/phân số | Parse → so sánh **tương đương toán học** (`27 7/18` == `493/18` == `27.3889`) với sai số `1e-6` | Không |
| `expression` | Câu 10 (vô số đáp án đúng) | Verifier thuật toán: check chữ số dùng + eval kết quả | Không |
| `grid` | Câu 15 (điền hình vào lưới) | So sánh mảng 2D với đáp án | Không |
| `essay` | Tự luận | Pipeline 2-call: transcribe → chấm theo rubric | **Có** |

### 3.1 Verifier cho `numeric`
```ts
// lib/grading/numeric.ts
// Chấp nhận: "27 7/18", "493/18", "27.388889", "27,388889" (dấu phẩy VN)
// Cách nhanh nhất: dùng math.js
import { evaluate, fraction } from 'mathjs'

export function normalizeNumeric(input: string): number | null {
  const s = input.trim().replace(/,/g, '.').replace(/\s+/g, ' ')
  // hỗn số "a b/c" -> a + b/c
  const mixed = s.match(/^(-?\d+)\s+(\d+)\/(\d+)$/)
  if (mixed) return Number(mixed[1]) + Number(mixed[2]) / Number(mixed[3])
  // độ: "45", "45°", "45 do"
  const deg = s.match(/^(-?[\d.]+)\s*(°|do|độ|degree)?$/i)
  if (deg) return Number(deg[1])
  try { return Number(evaluate(s)) } catch { return null }
}

export function checkNumeric(user: string, key: string, tol = 1e-6): boolean {
  const a = normalizeNumeric(user), b = normalizeNumeric(key)
  if (a === null || b === null) return false
  return Math.abs(a - b) < tol
}
```

### 3.2 Verifier cho `expression` (câu 10)
Đề: dùng đúng 3 chữ số **2, 4, 8** (mỗi số **một lần**) + phép toán, tạo ra kết quả **2**.
Có vô số đáp án đúng (`8-4-2`, `(8-4)/2`, `2^4/8`, `4^2/8`, `.2*8+.4`...). Không thể so string.

```ts
// lib/grading/expression.ts
import { evaluate } from 'mathjs'

export function checkExpression(
  input: string,
  cfg: { digits: number[]; target: number; tol?: number }
): { ok: boolean; reason?: string } {
  const expr = input.replace(/\s/g, '').replace(/×/g, '*').replace(/÷/g, '/').replace(/√/g, 'sqrt')
  // 1. Chỉ cho phép ký tự an toàn
  if (!/^[0-9+\-*/^().sqrt]+$/.test(expr)) return { ok: false, reason: 'Chứa ký tự không hợp lệ' }
  // 2. Đếm chữ số dùng, phải khớp multiset
  const used = (expr.match(/\d/g) ?? []).map(Number).sort()
  const need = [...cfg.digits].sort()
  if (JSON.stringify(used) !== JSON.stringify(need))
    return { ok: false, reason: `Phải dùng đúng các chữ số ${cfg.digits.join(', ')}, mỗi số một lần` }
  // 3. Eval
  try {
    const v = Number(evaluate(expr))
    if (!isFinite(v)) return { ok: false, reason: 'Biểu thức không xác định' }
    return Math.abs(v - cfg.target) < (cfg.tol ?? 1e-9)
      ? { ok: true }
      : { ok: false, reason: `Biểu thức bằng ${v}, không bằng ${cfg.target}` }
  } catch { return { ok: false, reason: 'Không phân tích được biểu thức' } }
}
```

> **Lưu ý an toàn:** `evaluate` của math.js chạy trong sandbox riêng, không phải `eval()` của JS. Vẫn phải whitelist ký tự như trên. Đặt giới hạn độ dài input 200 ký tự.

---

## 4. DATA MODEL

Postgres. Nếu dự án dùng Prisma → viết vào `schema.prisma`. Nếu Drizzle → `db/schema.ts`. Nếu Supabase thuần → tạo migration SQL. Dưới đây là SQL chuẩn, tự chuyển đổi.

```sql
-- ============ ĐỀ THI ============
CREATE TABLE exams (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug          text UNIQUE NOT NULL,
  title         text NOT NULL,
  subject       text,                       -- 'math'
  grade_level   text,                       -- 'primary'
  duration_min  int NOT NULL DEFAULT 180,
  total_points  int NOT NULL,
  instructions  text,
  is_published  boolean NOT NULL DEFAULT false,
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE questions (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  exam_id       uuid NOT NULL REFERENCES exams(id) ON DELETE CASCADE,
  number        int NOT NULL,               -- 1..20
  part          text NOT NULL,              -- 'mcq' | 'short' | 'essay'
  grading_mode  text NOT NULL,              -- xem §3
  max_points    numeric(5,2) NOT NULL,
  prompt_md     text NOT NULL,              -- đề bài, markdown + LaTeX ($...$)
  image_url     text,                       -- hình minh hoạ (nếu có)
  options       jsonb,                      -- ['4','26','29','31','56'] cho mcq
  answer_key    jsonb NOT NULL,             -- xem §5
  solution_md   text,                       -- lời giải mẫu (dùng để chấm essay)
  config        jsonb,                      -- tham số cho verifier (digits, target, grid...)
  UNIQUE (exam_id, number)
);

-- Rubric: chỉ dùng cho grading_mode = 'essay'
CREATE TABLE rubric_criteria (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  question_id   uuid NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
  code          text NOT NULL,              -- 'c1','c2'...
  points        numeric(5,2) NOT NULL,
  description   text NOT NULL,              -- mô tả tiêu chí, càng cụ thể càng tốt
  order_index   int NOT NULL,
  UNIQUE (question_id, code)
);

-- ============ BÀI LÀM ============
CREATE TABLE attempts (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  exam_id       uuid NOT NULL REFERENCES exams(id),
  user_id       uuid,                       -- NULL nếu chưa login (MVP cho phép)
  status        text NOT NULL DEFAULT 'grading',  -- 'grading'|'done'|'partial_failed'
  started_at    timestamptz NOT NULL DEFAULT now(),
  submitted_at  timestamptz,
  auto_score    numeric(6,2) NOT NULL DEFAULT 0,  -- điểm AI + verifier
  final_score   numeric(6,2),                     -- sau khi giáo viên sửa
  total_points  numeric(6,2) NOT NULL
);

CREATE TABLE attempt_answers (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  attempt_id    uuid NOT NULL REFERENCES attempts(id) ON DELETE CASCADE,
  question_id   uuid NOT NULL REFERENCES questions(id),
  answer_text   text,                       -- mcq/short/expression
  answer_json   jsonb,                      -- grid
  image_urls    text[],                     -- ảnh bài làm tự luận (1..3 ảnh)
  transcript_md text,                       -- AI đọc được gì từ ảnh
  status        text NOT NULL DEFAULT 'pending', -- 'pending'|'graded'|'failed'
  awarded       numeric(5,2),
  confidence    numeric(3,2),
  needs_review  boolean NOT NULL DEFAULT false,
  feedback_vi   text,
  criteria_json jsonb,                      -- [{code,points,awarded,evidence,reason}]
  error_msg     text,
  graded_at     timestamptz,
  overridden_by uuid,                       -- giáo viên sửa tay
  UNIQUE (attempt_id, question_id)
);

CREATE INDEX idx_attempt_answers_attempt ON attempt_answers(attempt_id);
CREATE INDEX idx_attempts_user ON attempts(user_id, submitted_at DESC);
```

---

## 5. ĐỊNH DẠNG `answer_key` THEO `grading_mode`

```jsonc
// exact  (trắc nghiệm)
{ "value": "B" }

// numeric
{ "value": "493/18", "display": "27 7/18", "tolerance": 1e-6 }

// expression  -> config chứa ràng buộc
{ "examples": ["8-4-2", "(8-4)/2", "2^4/8", ".2*8+.4"] }
// config: { "digits": [2,4,8], "target": 2 }

// grid  (câu 15)
{ "grid": [["/","\\","/","\\"], ["\\","/","\\","/"], ...] }

// essay -> answer_key chỉ để hiển thị đáp số cuối, điểm tính từ rubric_criteria
{ "final": "56" }
```

---

## 6. API ROUTES

Tất cả dưới `app/api/`. Dùng Route Handler (Next.js App Router). Nếu dự án là Pages Router → chuyển sang `pages/api/` giữ nguyên path.

| Method | Path | Mô tả |
|---|---|---|
| GET | `/api/exams` | Danh sách đề đã publish |
| GET | `/api/exams/[slug]` | Chi tiết đề + câu hỏi. **BẮT BUỘC strip `answer_key`, `solution_md`, rubric** |
| POST | `/api/upload` | Nhận `FormData(file)` → lưu storage → trả `{ url }` |
| POST | `/api/attempts/submit` | Tạo attempt, chấm hết tầng A+B ngay (sync), trả `{ attemptId, autoGraded[], pendingEssays[] }` |
| POST | `/api/grade/essay` | Body `{ attemptId, questionId }` → chấm 1 câu tự luận → trả kết quả. **Đây là route client gọi song song.** |
| GET | `/api/attempts/[id]` | Kết quả đầy đủ (kèm rubric + lời giải mẫu, vì đã nộp bài rồi) |
| PATCH | `/api/admin/answers/[id]` | Giáo viên sửa điểm: `{ awarded, feedback_vi }` |

**Cấu hình bắt buộc cho `/api/grade/essay`:**
```ts
export const maxDuration = 300   // Vercel Pro. Nếu Hobby -> 60, phải đổi model nhanh hơn
export const runtime = 'nodejs'
```

**Rate-limit tối thiểu:** chặn > 30 request/phút/IP vào `/api/grade/essay` (in-memory Map là đủ cho MVP).

---

## 7. PIPELINE CHẤM TỰ LUẬN (2 CALL, KHÔNG GỘP)

```
ảnh[] ──► CALL 1: TRANSCRIBE (vision) ──► transcript_md (lưu DB)
                                              │
          rubric_criteria + solution_md ──────┼──► CALL 2: GRADE ──► JSON điểm
```

**Tại sao tách:**
- Call 1 chỉ chép lại, **cấm phán xét đúng sai** → transcript trung thực, không "sửa hộ" học sinh.
- Transcript lưu DB → chấm lại không cần gọi vision lần nữa (rẻ hơn nhiều, nhanh hơn nhiều).
- Học sinh xem được transcript → khiếu nại "AI đọc sai chữ tôi" có căn cứ.
- Đổi model chấm không đụng tới bước OCR.

Model: `claude-sonnet-5` cho cả 2 call (vision + reasoning tốt, đủ nhanh).
`temperature: 0`. Call 2 dùng **tool use / structured output**, không parse text tự do.

> Trước khi code, kiểm tra tên model string mới nhất tại `https://docs.claude.com`. Đừng hard-code sai tên model.

---

## 8. PROMPT TEMPLATES (copy nguyên văn)

### 8.1 CALL 1 — TRANSCRIBE

**System:**
```
Bạn là công cụ chép lại bài làm viết tay của học sinh. Nhiệm vụ DUY NHẤT của bạn là chép lại chính xác những gì có trên ảnh.

QUY TẮC TUYỆT ĐỐI:
1. KHÔNG sửa lỗi sai của học sinh. Nếu học sinh viết "2^6 = 62", bạn chép đúng "2^6 = 62".
2. KHÔNG bổ sung bước giải mà học sinh không viết.
3. KHÔNG đánh giá, KHÔNG nhận xét, KHÔNG cho điểm.
4. Đoạn nào không đọc được, ghi chính xác: [không đọc được]
5. Nếu ảnh trống hoặc không có bài làm, trả về đúng: [không có bài làm]
6. Giữ nguyên thứ tự dòng. Mỗi dòng bài làm là một dòng output.
7. Công thức toán viết bằng LaTeX inline: $...$
8. Nếu học sinh vẽ hình, mô tả ngắn gọn trong ngoặc vuông, ví dụ: [hình vẽ: tam giác ABC, có đánh dấu góc vuông tại A]

Chỉ xuất phần nội dung chép lại. Không thêm lời mở đầu hay kết luận.
```

**User:** `[ảnh 1..N]` + `Chép lại bài làm cho câu {number}. Đề bài câu này: {prompt_md}`

### 8.2 CALL 2 — GRADE

**System:**
```
Bạn là giám khảo chấm thi Olympic Toán tiểu học. Bạn chấm theo BAREM CÓ SẴN, không tự nghĩ ra tiêu chí mới.

QUY TẮC CHẤM:
1. Chỉ được cho điểm theo các tiêu chí trong BAREM. Tổng điểm = tổng điểm các tiêu chí.
2. Mỗi tiêu chí chỉ cho điểm khi tìm được BẰNG CHỨNG cụ thể trong bài làm. Phải trích dẫn nguyên văn đoạn đó vào trường "evidence".
3. Nếu không tìm được bằng chứng cho một tiêu chí, cho 0 điểm cho tiêu chí đó và ghi rõ lý do.
4. Cho điểm từng phần: học sinh làm đúng hướng nhưng sai số học vẫn được điểm ở tiêu chí về phương pháp.
5. Cách trình bày khác lời giải mẫu nhưng đúng về mặt toán học thì VẪN CHO ĐIỂM ĐỦ. Lời giải mẫu chỉ là tham khảo, không phải chuẩn duy nhất.
6. Nếu transcript ghi [không có bài làm] → tất cả tiêu chí = 0, confidence = 1.0.
7. Nếu transcript có nhiều [không đọc được] ở chỗ quan trọng → đặt needs_human_review = true và confidence < 0.6.
8. confidence là mức độ chắc chắn của bạn về điểm số (0.0–1.0).
9. feedback_vi: viết cho học sinh tiểu học đọc. Tiếng Việt, thân thiện, tối đa 3 câu. Nêu cụ thể em làm được gì và thiếu gì. KHÔNG chê bai.

Không được cho điểm vượt quá max_points của tiêu chí. Không được cho điểm âm.
```

**User:**
```
## ĐỀ BÀI (câu {number}, tối đa {max_points} điểm)
{prompt_md}

## LỜI GIẢI MẪU (tham khảo, không phải chuẩn duy nhất)
{solution_md}

## BAREM
{rubric_criteria dạng: [c1] 2.0 điểm — mô tả...}

## BÀI LÀM CỦA HỌC SINH (đã chép lại từ ảnh)
{transcript_md}
```

**Tool schema bắt buộc (structured output):**
```json
{
  "name": "submit_grade",
  "description": "Nộp kết quả chấm điểm",
  "input_schema": {
    "type": "object",
    "properties": {
      "criteria": {
        "type": "array",
        "items": {
          "type": "object",
          "properties": {
            "code":     { "type": "string" },
            "awarded":  { "type": "number" },
            "evidence": { "type": "string", "description": "Trích nguyên văn từ bài làm. Ghi 'không tìm thấy' nếu không có." },
            "reason":   { "type": "string" }
          },
          "required": ["code", "awarded", "evidence", "reason"]
        }
      },
      "confidence":          { "type": "number" },
      "needs_human_review":  { "type": "boolean" },
      "feedback_vi":         { "type": "string" }
    },
    "required": ["criteria", "confidence", "needs_human_review", "feedback_vi"]
  }
}
```

**Hậu kiểm bắt buộc trong code (không tin model tuyệt đối):**
```ts
// clamp mỗi tiêu chí về [0, points], loại code lạ, tính lại tổng bằng code
const valid = result.criteria
  .filter(c => rubricMap.has(c.code))
  .map(c => ({ ...c, awarded: clamp(c.awarded, 0, rubricMap.get(c.code)!.points) }))
const total = Math.min(sum(valid.map(c => c.awarded)), question.max_points)
// tự động cờ review
const needsReview = result.needs_human_review || result.confidence < 0.7
                    || transcript.includes('[không đọc được]')
```

---

## 9. UI SCREENS

| Route | Nội dung |
|---|---|
| `/thi-thu` | Danh sách đề. Card: tên đề, số câu, thời gian, tổng điểm, nút "Bắt đầu" |
| `/thi-thu/[slug]` | Màn hình làm bài (chi tiết dưới) |
| `/thi-thu/[slug]/ket-qua/[attemptId]` | Kết quả |

### 9.1 Màn hình làm bài
- **Header sticky:** tên đề · countdown (đỏ khi < 10 phút) · nút "Nộp bài".
- **Sidebar/bottom nav:** lưới số câu 1–20. Màu: xám = chưa làm, xanh = đã làm. Click nhảy tới câu.
- **Thân bài — render theo `part`:**
  - `mcq` → radio group A–E, hiện `options`
  - `short` + `numeric` → input text + dòng gợi ý *"Nhập phân số dạng `7/18` hoặc hỗn số `27 7/18`"*
  - `short` + `expression` → input text + preview kết quả realtime: *"Biểu thức của em bằng: 2 ✓"* (chạy verifier client-side để user tự kiểm, nhưng **điểm vẫn chấm ở server**)
  - `essay` → nút "Chụp bài làm" + preview thumbnail, cho phép 1–3 ảnh, xoá/chụp lại
  - `grid` (câu 15) → render lưới 4×4, mỗi ô là toggle 2 trạng thái `/` `\`
- **Render LaTeX:** dùng KaTeX (`react-katex` hoặc `rehype-katex`). Nhẹ và nhanh hơn MathJax.
- **Auto-save draft:** ghi vào `localStorage` mỗi 5s, key `attempt_draft_{slug}`. Khôi phục khi reload.

### 9.2 Màn hình "đang chấm"
Modal full-screen sau khi nộp:
```
Đang chấm bài của bạn...
[████████░░░░░░░░]  6/10 câu tự luận

✓ Câu 11  ✓ Câu 12  ⟳ Câu 13  ○ Câu 14 ...
```
Cập nhật realtime khi từng `Promise` resolve. **Đây là phần ăn điểm nhất khi demo — làm cho mượt.**

### 9.3 Màn hình kết quả
- Điểm lớn ở giữa: `78 / 100`, kèm vòng tròn progress.
- Breakdown 3 phần: Trắc nghiệm `8/10` · Trả lời ngắn `16/20` · Tự luận `54/70`.
- Accordion từng câu:
  - Header: số câu · điểm `5/7` · badge màu · icon ⚠ nếu `needs_review`
  - Body: đề bài · bài làm của em (ảnh + transcript AI đọc được) · **bảng barem** cho thấy mất điểm ở đâu · feedback tiếng Việt · lời giải mẫu (collapse)
- Câu `status = 'failed'` → hiện nút "Chấm lại câu này" gọi lại `/api/grade/essay`.

---

## 10. XỬ LÝ ẢNH PHÍA CLIENT

Không cần OpenCV cho MVP. Chỉ cần nén đúng cách:

```ts
// lib/image.ts
export async function compressForVision(file: File): Promise<Blob> {
  const bitmap = await createImageBitmap(file)
  const MAX = 1568                          // kích thước tối ưu cho vision model
  const scale = Math.min(1, MAX / Math.max(bitmap.width, bitmap.height))
  const w = Math.round(bitmap.width * scale)
  const h = Math.round(bitmap.height * scale)
  const canvas = new OffscreenCanvas(w, h)
  const ctx = canvas.getContext('2d')!
  ctx.drawImage(bitmap, 0, 0, w, h)
  return canvas.convertToBlob({ type: 'image/jpeg', quality: 0.82 })
}
```

Input chụp ảnh:
```html
<input type="file" accept="image/*" capture="environment" multiple />
```

Hướng dẫn hiển thị cho học sinh ngay cạnh nút chụp:
> 📸 Chụp **1 ảnh cho 1 câu**. Đặt giấy phẳng, đủ sáng, chụp thẳng từ trên xuống. Viết chữ rõ, không viết đè.

Storage: dùng cái dự án đã có (Supabase Storage / Cloudflare R2 / S3). Nếu chưa có → Supabase Storage bucket `exam-submissions`, public read (MVP), path `{attemptId}/{questionNumber}-{index}.jpg`.

---

## 11. XỬ LÝ LỖI

| Tình huống | Xử lý |
|---|---|
| API AI trả 429 / 529 | Retry 2 lần, backoff 2s → 5s |
| API AI timeout > 90s | Đánh dấu `status='failed'`, `error_msg` |
| Model không gọi tool | Retry 1 lần với prompt nhắc lại; vẫn lỗi → `failed` |
| Transcript = `[không có bài làm]` | Cho 0 điểm, **không gọi Call 2** (tiết kiệm + tránh AI bịa) |
| Ảnh upload lỗi | Cho user chụp lại, không mất bài làm các câu khác |
| Vài câu failed | `attempts.status = 'partial_failed'`, vẫn hiện kết quả các câu khác |

---

## 12. THỨ TỰ TRIỂN KHAI (làm đúng thứ tự, mỗi bước test được)

- [ ] **B1.** Đọc stack hiện tại. Ghi `IMPLEMENTATION_NOTES.md`: ORM gì, auth gì, storage gì, UI kit gì.
- [ ] **B2.** Migration DB (§4). Chạy migrate thành công.
- [ ] **B3.** Seed đề ASMOPSS từ §14 → script `scripts/seed-asmopss.ts`. Query kiểm tra: đủ 20 câu, tổng `max_points` = 100.
- [ ] **B4.** `GET /api/exams/[slug]` + trang `/thi-thu` + `/thi-thu/[slug]` render được đề (chưa cần nộp). **Kiểm tra kỹ: response KHÔNG chứa `answer_key`.**
- [ ] **B5.** Verifier tầng A+B (`exact`, `numeric`, `expression`, `grid`) + unit test với các case ở §14.
- [ ] **B6.** `POST /api/attempts/submit` — chấm A+B, lưu DB. Test bằng Postman/curl.
- [ ] **B7.** `POST /api/upload` + nén ảnh client + UI chụp ảnh.
- [ ] **B8.** `POST /api/grade/essay` — pipeline 2 call. Test 1 câu bằng ảnh chụp tay thật.
- [ ] **B9.** Client orchestration + màn hình progress.
- [ ] **B10.** Trang kết quả đầy đủ.
- [ ] **B11.** Trang admin sửa điểm.
- [ ] **B12.** Polish: loading state, empty state, responsive mobile, favicon, meta.

---

## 13. ACCEPTANCE CRITERIA

Coi là **xong** khi chạy được kịch bản demo sau từ đầu đến cuối, không lỗi:

1. Vào `/thi-thu` → thấy đề "ASMOPSS 12 — Mathematics Primary".
2. Bắt đầu → countdown chạy → làm câu 1–5 (trắc nghiệm), câu 6–10 (nhập text).
3. Câu 10 nhập `8-4-2` → preview hiện ✓. Nhập `8-4-1` → hiện ✗ kèm lý do "phải dùng đúng chữ số 2, 4, 8".
4. Câu 11 chụp ảnh 1 tờ giấy viết tay lời giải → thấy thumbnail.
5. Nộp bài → progress bar chạy → sau < 60s về trang kết quả.
6. Trang kết quả: điểm A+B **chính xác 100%**, câu 11 có transcript đọc đúng chữ viết tay, có bảng barem, có feedback tiếng Việt.
7. Reload trang kết quả → dữ liệu vẫn còn (đã lưu DB, không phải state tạm).
8. Vào admin sửa điểm câu 11 từ 5 → 7 → tổng điểm cập nhật.

**Test bắt buộc trước khi báo cáo:** chụp 1 bài làm **cố tình sai** (ví dụ câu 11 viết `2^6 = 64` rồi kết luận `64` thay vì `56`) → AI phải cho **điểm từng phần** (được `c1`, mất `c2`,`c3`), không cho 0, cũng không cho 7.

---

## 14. SEED DATA — ĐỀ ASMOPSS 12 MATHEMATICS PRIMARY

> ⚠️ **HAI LỖI TRONG ĐÁP ÁN GỐC ĐÃ ĐƯỢC SỬA** — đã kiểm chứng bằng tính toán:
> - **Câu 6:** đáp án chính xác là **493/18 = 27 7/18** (bản PDF gốc in nhầm/bị lỗi font thành "28"). Tổng: `1/6+25/12+61/20+121/30+211/42+337/56+505/72 = 493/18`.
> - **Câu 20b:** đáp án gốc thiếu trường hợp **1×3×5**. Với `A=46` → `pq+pr+qr=23`, có **3** nghiệm: `1×1×11`, `1×2×7`, `1×3×5`. (Bảng liệt kê trong đáp án gốc ghi nhầm `1,3,5 → A=45`.)
> Rubric câu 20 dưới đây đã tính theo **3** nghiệm.

Dùng file `exam-asmopss-12.json` đi kèm. Cấu trúc:

```jsonc
{
  "exam": { "slug": "asmopss-12-math-primary", "title": "...", "duration_min": 180, "total_points": 100 },
  "questions": [
    {
      "number": 1, "part": "mcq", "grading_mode": "exact", "max_points": 2,
      "prompt_md": "...", "options": ["4","26","29","31","56"],
      "answer_key": { "value": "B" }
    },
    // ...
    {
      "number": 11, "part": "essay", "grading_mode": "essay", "max_points": 7,
      "prompt_md": "...", "solution_md": "...",
      "answer_key": { "final": "56" },
      "rubric": [
        { "code": "c1", "points": 2, "description": "Tính đúng tổng số tập con của tập 6 phần tử = 2^6 = 64" },
        { "code": "c2", "points": 3, "description": "Nhận ra cần đếm phần bù: số tập con KHÔNG chứa số lẻ = số tập con của {2,4,6} = 2^3 = 8" },
        { "code": "c3", "points": 2, "description": "Kết luận đúng: 64 − 8 = 56" }
      ]
    }
  ]
}
```

### Quy tắc viết rubric (áp dụng khi thêm đề mới sau này)
1. Mỗi câu 7 điểm → **2–4 tiêu chí**. Ít hơn 2 thì AI chấm nhị phân (0 hoặc 7). Nhiều hơn 4 thì AI phân vân, confidence tụt.
2. Tiêu chí phải **quan sát được trong bài viết**, không phải suy đoán. ✅ "Viết ra được đẳng thức r+w=(r−w)²". ❌ "Hiểu bản chất bài toán".
3. Chia điểm theo tỷ lệ: **phương pháp/hướng giải nhiều điểm hơn phép tính cuối**. Đề Olympic chấm tư duy, không chấm số học.
4. Câu có nhiều ý (17a/17b, 20a/20b) → tách tiêu chí riêng cho từng ý.
5. Câu có nhiều đáp án đúng (20b) → tiêu chí phải ghi rõ *"nêu được ít nhất N trường hợp"* và *"chứng minh đã liệt kê đủ"*.

---

## 15. BIẾN MÔI TRƯỜNG

```bash
ANTHROPIC_API_KEY=sk-ant-...
ANTHROPIC_MODEL=claude-sonnet-5     # để đổi model không cần sửa code
GRADING_TIMEOUT_MS=90000
GRADING_MAX_RETRIES=2
CONFIDENCE_REVIEW_THRESHOLD=0.7
```

---

## 16. BACKLOG SAU MVP (đừng làm bây giờ)

- Số hóa đề tự động từ PDF + màn hình admin duyệt JSON.
- Self-consistency: chấm 3 lần, lấy median, lệch > 1.5đ → đẩy review.
- Phiếu trả lời in sẵn có marker ArUco → tự cắt vùng từng câu.
- Analytics: điểm yếu theo chủ đề (số học / hình học / tổ hợp / logic).
- Nút "Phúc khảo" cho học sinh + hàng đợi review cho giáo viên.
- Cache transcript theo hash ảnh để chấm lại không tốn vision call.
