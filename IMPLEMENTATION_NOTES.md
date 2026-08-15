# Ghi chú triển khai — Thi thử + chấm điểm bằng AI

Tài liệu này ghi những chỗ **làm khác** `AI_GRADING_SPEC.md` và **vì sao**, đúng
yêu cầu §0.3 và §12 B1 của spec. Đọc file này trước khi sửa tính năng.

---

## 1. Stack đã có, dùng lại nguyên (spec §12 B1)

| Hạng mục | Dự án đang dùng | Quyết định |
|---|---|---|
| Framework | Next.js 15 App Router, React 19 | Dùng lại, route handler dưới `src/app/api/v1/` |
| ORM | Prisma 6 + PostgreSQL 16 | Dùng lại, thêm 6 model mới |
| Auth | JWT ký HS256 (jose) trong cookie httpOnly, RBAC 8 vai trò | Dùng lại `getSession` / `requireRole` |
| UI kit | Tailwind 4 + `src/components/ui.tsx` | Dùng lại toàn bộ primitive, không tự viết class rời |
| Storage | **Chưa có** | Ảnh lưu trong Postgres — xem mục 4 |
| Hàng đợi | **Không có, và không thêm** | Trình duyệt tự điều phối, đúng spec §2 |
| Cấu hình | `AppConfig` + `src/lib/config/defaults.ts` | Thêm nhóm `mockExam` |

Không cài thêm gói npm nào cho tính năng này.

---

## 2. Đổi tên bảng so với spec §4

Tên trong spec đã bị các bảng cũ chiếm nghĩa trong hệ thống này, nên phải đổi:

| Spec | Trong dự án | Vì sao |
|---|---|---|
| `exams` | `MockExam` | `Assessment` đã là "bài kiểm tra" của engine cá nhân hóa |
| `questions` | `MockExamQuestion` | `QuestionItem` là kho câu hỏi có taxonomy chapter/skill |
| `rubric_criteria` | `MockExamRubric` | — |
| `attempts` | `MockExamAttempt` | `AssessmentAttempt` đã tồn tại |
| `attempt_answers` | `MockExamAnswer` | `ItemAttempt` đã tồn tại |
| — | `MockExamUpload` | Bảng mới, chứa ảnh bài làm |

Quy ước đặt tên cột theo dự án (camelCase, không `@@map`) chứ không theo
snake_case của SQL trong spec.

## 3. Đổi đường dẫn API so với spec §6

Mọi API của dự án nằm dưới `/api/v1`. Giữ nguyên `/api/exams` như spec sẽ tạo ra
hai họ đường dẫn song song trong cùng một codebase.

| Spec | Trong dự án |
|---|---|
| `GET /api/exams` | `GET /api/v1/exams` |
| `GET /api/exams/[slug]` | `GET /api/v1/exams/[slug]` |
| `POST /api/upload` | `POST /api/v1/uploads` |
| `POST /api/attempts/submit` | `POST /api/v1/exam-attempts` |
| `POST /api/grade/essay` | `POST /api/v1/exam-attempts/[attemptId]/grade` |
| `GET /api/attempts/[id]` | `GET /api/v1/exam-attempts/[attemptId]` |
| `PATCH /api/admin/answers/[id]` | `PATCH /api/v1/exam-attempts/[attemptId]/answers/[answerId]` |

Thêm `GET /api/v1/uploads/[uploadId]` để đọc ảnh (spec không nêu vì giả định
storage ngoài có URL công khai).

---

## 4. Ảnh bài làm nằm trong Postgres, không phải object storage

Spec §10 đề xuất Supabase Storage. Dự án chưa có storage nào, còn đĩa của
Railway bị xóa mỗi lần deploy — ghi ra file là mất bài của học sinh sau lần
deploy kế tiếp.

Chọn `BYTEA` trong bảng `MockExamUpload`, phục vụ qua `/api/v1/uploads/[id]`.
Ảnh đã nén ở trình duyệt còn ~200–400KB, một bài tối đa 30 ảnh. Khi nào có
S3/R2 thì chỉ cần thay `src/server/mock-exam/uploads.ts`, phần còn lại không đổi.

## 5. Không dùng math.js, tự viết bộ tính biểu thức

Spec §3.1–3.2 gợi ý math.js. Đã tự viết `src/server/mock-exam/expr.ts` (~150
dòng, có test) vì ngữ pháp cần dùng đóng kín ở bảy phép toán, còn math.js nặng
~600KB và bộ tính này còn chạy cả ở trình duyệt (ô xem trước câu 10).

**Sửa một lỗi trong verifier mẫu của spec:** cách đếm chữ số ở §3.2 loại nhầm
`0.2*8+0.4` và `(4*8)^0.2` — vốn là hai đáp án mẫu do chính đề bài in ra — vì nó
đếm cả số 0 của dấu thập phân. Bản cài đặt bỏ số 0 đứng ngay trước dấu thập phân
trước khi đếm. Có test cho cả bảy đáp án mẫu.

## 6. Không dùng KaTeX

Spec §9.1 gợi ý KaTeX. Đề dùng chưa tới hai chục lệnh LaTeX (`\frac`, `\sqrt`,
mũ, chỉ số, vài ký hiệu), trong khi KaTeX + react-markdown cộng lại ~300KB kèm
font riêng. `src/components/rich-text.tsx` render markdown gọn + tập lệnh đó
bằng HTML/CSS thuần. Cần công thức phức tạp hơn (ma trận, tích phân nhiều tầng)
thì thay module này, không đụng chỗ khác.

---

## 7. Nhà cung cấp AI: cắm khóa là chạy

Spec §7 chốt cứng `claude-sonnet-5`. Yêu cầu thực tế là **gắn Groq hoặc OpenAI
sau**, nên `src/server/mock-exam/ai-provider.ts` nói được hai phương ngữ HTTP
(OpenAI-compatible và Anthropic) sau một cửa duy nhất.

```bash
GROQ_API_KEY="gsk_..."     # hoặc OPENAI_API_KEY, hoặc ANTHROPIC_API_KEY
```

Không cần sửa mã. Tự dò theo thứ tự `groq → openai → anthropic`; ép đích danh
bằng `MOCK_AI_PROVIDER`. Tên model đổi được bằng `*_MODEL_VISION` /
`*_MODEL_GRADE` — Groq và OpenAI đổi tên model liên tục nên **không** khóa cứng
trong mã.

**Ba trạng thái, khác nhau rõ ràng:**

| Trạng thái | Khi nào | Câu tự luận |
|---|---|---|
| Chạy thật | Có khóa | AI đọc ảnh + chấm theo barem |
| Chưa có khóa | Không khóa nào | `FAILED` + lý do + nút "Chấm lại câu này". **Không bịa điểm** |
| Chế độ thử | `MOCK_AI_PROVIDER=mock` | Điểm mẫu, ghi rõ "chế độ thử" ở mọi chỗ hiển thị |

Ranh giới này là có chủ đích: thiếu khóa mà vẫn hiện ra một con số thì người
dùng sẽ tưởng AI đã chấm.

## 8. Bài thi của khách chưa đăng nhập

Spec §4 cho `user_id` NULL. Hệ quả: **đường link kết quả chính là chìa khóa**
(id là cuid ngẫu nhiên). Ảnh bài làm cũng vậy.

Bài của người đã đăng nhập thì chỉ chủ nhân hoặc giáo viên/quản trị xem được.
Muốn siết hẳn thì bắt đăng nhập ở `/thi-thu` — đổi một dòng trong
`src/middleware.ts`.

## 9. Khác nhỏ so với spec

- **Câu tự luận gõ tay được, không chỉ chụp ảnh.** Câu 9 của đề (`part: short`,
  `grading_mode: essay`) là dạng gõ vài dòng; bắt chụp ảnh cho câu đó là vô lý.
  Không ảnh + có chữ ⇒ chữ đó chính là transcript, bỏ luôn lượt gọi vision.
- **Tự luận bỏ trắng được chấm 0 ngay lúc nộp**, không tốn một lời gọi AI.
- **Câu lưới (câu 15) sai 1–2 ô** thì vẫn 0 điểm theo spec, nhưng được gắn cờ
  "cần xem lại" để giáo viên quyết định có cho điểm phần.
- **Giáo viên chấm bài ở `/giao-vien/thi-thu`**, không phải `/quan-tri`: khu
  quản trị bị middleware chặn với vai trò TEACHER. Quản trị có bản riêng ở
  `/quan-tri/thi-thu`. Cả hai dùng chung một màn hình chấm.
- **Chấm song song theo lô** (mặc định 4 câu một lúc) thay vì `Promise.all` toàn
  bộ: 10 câu là 20 lời gọi model cùng lúc, đủ để ăn 429 và hỏng cả bài.

---

## 10. Còn thiếu / việc tiếp theo

1. **Hình minh họa của đề.** Câu 1, 12, 15 có nhắc "xem hình" nhưng file
   `exam-asmopss-12.json` không kèm ảnh (`image_url` để trống). Cột `imageUrl`
   đã có sẵn — bỏ ảnh vào là hiện. Trong lúc chưa có ảnh, ba câu này khó làm
   đúng đề.
2. **Câu 15 chỉ so hướng vạch**, chưa xét vị trí góc trong ô (đúng ghi chú
   `q15_scope` trong file đề).
3. Backlog spec §16: số hóa đề từ PDF, self-consistency chấm 3 lần lấy trung vị,
   cache transcript theo hash ảnh, nút phúc khảo.
