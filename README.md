# Nền tảng ôn luyện Olympic cá nhân hóa bằng AI

Hệ thống ôn luyện trực tuyến cho các kỳ thi **ASMOPSS · NEO · STEM · FMC** (mở rộng được: PAS).
Đặc tả nghiệp vụ đầy đủ nằm ở [specs.md](specs.md) — tài liệu này chỉ nói về **cách chạy và cách code được tổ chức**.

> **Giá trị cốt lõi:** không bán "kho bài tập giống nhau cho tất cả". Kho học liệu được kiểm duyệt trước;
> engine nhận diện lỗ hổng kiến thức của **từng học sinh** rồi chọn đúng bài, đúng mức độ, đúng thời điểm.

---

## 1. Chạy dự án trong 5 phút

### Yêu cầu

| Phần mềm | Phiên bản | Ghi chú |
|---|---|---|
| Node.js | >= 20.11 (khuyến nghị 22+) | `node --version` |
| Docker Desktop | bất kỳ bản hiện hành | Chỉ dùng để chạy PostgreSQL |
| PostgreSQL | 16 | Nếu đã có sẵn, bỏ qua Docker và sửa `DATABASE_URL` |

### Các bước

```bash
# 1. Cài thư viện
npm install

# 2. Tạo file môi trường
cp .env.example .env        # Windows PowerShell: Copy-Item .env.example .env

# 3. Bật PostgreSQL (cần Docker Desktop ĐANG CHẠY)
npm run db:up

# 4. Tạo bảng + nạp dữ liệu mẫu
npm run db:push
npm run db:seed

# 5. Chạy ứng dụng
npm run dev
```

Mở http://localhost:3000

> **Cổng 5433, không phải 5432.** Container publish PostgreSQL ra cổng **5433** của máy để tránh
> đụng PostgreSQL cài sẵn (rất nhiều máy đã chiếm 5432). Nếu muốn dùng cổng khác, sửa đồng thời
> `docker-compose.yml` và `DATABASE_URL` trong `.env`.
>
> **Không dùng Docker?** Cài PostgreSQL 16 trực tiếp, tạo database `olympiad`, rồi sửa `DATABASE_URL`
> trong `.env` cho khớp. Các bước còn lại giữ nguyên.

### Tài khoản có sẵn sau khi seed

Mật khẩu chung: giá trị của `SEED_DEFAULT_PASSWORD` trong `.env` (mặc định `Olympiad@123`).

| Email | Vai trò | Dùng để xem |
|---|---|---|
| `admin@olympiad.vn` | Super Admin | Toàn bộ hệ thống, cấu hình, audit log |
| `pm@olympiad.vn` | Program Manager | Kỳ thi, khóa học, blueprint, giá |
| `editor@olympiad.vn` | Biên soạn viên | Nhập/sửa câu hỏi ở trạng thái nháp |
| `reviewer@olympiad.vn` | Reviewer | Duyệt và xuất bản câu hỏi |
| `ops@olympiad.vn` | Admin vận hành | Tài khoản, thanh toán, kích hoạt thủ công |
| `teacher1@olympiad.vn` | Giáo viên | Dashboard giáo viên, báo cáo trước buổi tư vấn |
| `hs1@example.com` | Học sinh (lớp 7) | Đã ghi danh NEO/Khối 6–7/Toán — có sẵn dữ liệu học |
| `hs4@example.com` | Học sinh (lớp 9) | Chưa ghi danh — dùng để thử luồng mua khóa |

> ⚠️ Toàn bộ câu hỏi trong seed được **sinh tự động cho môi trường demo**, có ghi rõ trong
> `sourceNote`. Đây **không phải** đề thi thật của bất kỳ kỳ thi nào.

---

## 2. Lệnh thường dùng

| Lệnh | Tác dụng |
|---|---|
| `npm run dev` | Chạy Next.js ở chế độ phát triển |
| `npm run build` | Generate Prisma client rồi build production |
| `npm run typecheck` | Kiểm tra TypeScript toàn dự án |
| `npm test` | Chạy unit test (engine + chấm bài + import) |
| `npm run test:watch` | Test ở chế độ theo dõi |
| `npm run db:up` / `db:down` | Bật / tắt PostgreSQL bằng Docker |
| `npm run db:push` | Đồng bộ schema vào DB (dev) |
| `npm run db:reset` | **Xóa sạch** rồi tạo lại toàn bộ bảng |
| `npm run db:seed` | Nạp dữ liệu mẫu |
| `npm run db:seed:exam` | Nạp riêng đề thi thử (`prisma/seed-data/*.json`) |
| `npm run smoke` | Kiểm thử trọn vòng nghiệp vụ trên DB phát triển |
| `npm run db:studio` | Mở Prisma Studio để xem dữ liệu |
| `npm run payos:webhook` | Đăng ký URL webhook với PayOS (chạy sau khi deploy) |

---

## 2b. Thanh toán qua PayOS (quét mã QR tại chỗ)

### Người mua thấy gì

Bấm **Thanh toán bằng mã QR** → mã QR hiện lên ngay trên trang, **không** bị
chuyển sang tên miền của cổng. Chuyển khoản xong thì màn hình tự đổi sang trạng
thái thành công và đi tiếp vào bài kiểm tra đầu vào — không phải bấm "tôi đã
thanh toán" rồi ngồi đợi.

Kèm theo mã QR là số tài khoản, số tiền và nội dung chuyển khoản, mỗi thứ một
nút chép, cùng nút **Lưu ảnh mã QR** cho người đang dùng chính chiếc điện thoại
đó (không ai quét được mã hiện trên màn hình mình đang cầm).

### Bật lên

```bash
# .env
PAYMENT_GATEWAY="PAYOS"
APP_URL="https://ten-mien-that.vn"        # dùng để dựng returnUrl và URL webhook

PAYOS_CLIENT_ID="..."                      # my.payos.vn → Kênh thanh toán
PAYOS_API_KEY="..."
PAYOS_CHECKSUM_KEY="..."
```

Thiếu bất kỳ khóa nào thì cổng báo lỗi cấu hình chứ **không** âm thầm rơi về
cổng giả lập — tránh chuyện tưởng đã thu tiền mà thật ra chưa. Trạng thái này
hiện ngay trên **Quản trị → Thanh toán**, kèm URL webhook có nút chép.

### Webhook

```
<APP_URL>/api/v1/webhooks/payment/payos
```

Dán vào my.payos.vn → Kênh thanh toán → Webhook, hoặc chạy `npm run payos:webhook`.
PayOS **gọi thử chính URL đó lúc đăng ký** và chỉ chấp nhận khi nhận HTTP 200, nên
ứng dụng phải đang chạy và truy cập được từ Internet. Muốn thử ở máy local thì mở
tunnel rồi truyền URL vào: `npm run payos:webhook -- https://abc.ngrok.io`.

**Không đăng ký được webhook vẫn bán hàng bình thường.** Trang chờ thanh toán tự
hỏi PayOS 3 giây một lần (`GET /api/v1/payments/:orderCode`), tiền vào là quyền
truy cập mở. Webhook chỉ làm việc đó nhanh hơn và đỡ tốn lượt gọi. Nhờ vậy luồng
QR chạy đúng cả ở localhost, nơi cổng không thể gọi ngược vào máy.

### Những chỗ dễ làm sai, đã xử lý sẵn

| Cạm bẫy | Cách xử lý |
|---|---|
| PayOS bắt `orderCode` là **số nguyên**, mã đơn nội bộ lại là chuỗi | Cột `Payment.gatewayOrderRef` giữ mã số song song, tra ngược hai chiều |
| `description` chính là **nội dung chuyển khoản**, giới hạn 25 ký tự (9 với tài khoản chưa liên kết payOS) | `buildGatewayDescription` gói vào đúng 9 ký tự: `OLP` + 6 ký tự đuôi mã đơn |
| Chữ ký lúc **tạo đơn** ký 5 trường theo thứ tự cố định, chữ ký **webhook** lại sort toàn bộ khóa | Hai hàm riêng trong `payos.ts`, có test khóa chặt từng chuỗi nguồn |
| PayOS gửi **gói thử** `orderCode: 123` khi đăng ký và chỉ nhận URL trả 200 | Webhook trả 200 kèm `reason: ORDER_NOT_FOUND` thay vì 404 |
| Chữ ký nằm **trong body**, không phải header | `verifyPayosWebhookBody` đọc thẳng raw body |
| Mã QR hết hạn giữa chừng | Xin cổng cấp mã mới cho **cùng đơn**; mã cũ lưu vào `previousOrderRefs` để webhook về muộn vẫn khớp được đơn |
| Webhook bắn trùng | Đi chung `settlePayment` — giành `idempotencyKey` trong transaction, quyền truy cập chỉ cấp một lần |
| Khách trả thiếu tiền | Đối soát dùng số tiền **cổng đã nhận**, lệch thì đánh dấu `AMOUNT_MISMATCH` và **không** kích hoạt |

---

## 2c. Thi thử chấm điểm bằng AI (`/thi-thu`)

Vào thẳng `/thi-thu` là có đề thật để làm — **không cần đăng nhập, không cần mua
khóa**. Làm bài có đồng hồ đếm ngược, câu tự luận thì **chụp ảnh bài giải viết
tay**, nộp xong nhận điểm từng câu kèm nhận xét tiếng Việt.

### Chấm hai tầng

| Kiểu câu | Ai chấm | Kết quả |
|---|---|---|
| Trắc nghiệm, đáp số, biểu thức, lưới | **Code**, ngay lúc nộp | Đúng tuyệt đối, không tốn tiền, không chờ mạng |
| Tự luận | **AI**, theo barem có sẵn | Điểm từng tiêu chí + trích dẫn bằng chứng từ bài làm |

Đáp số so **tương đương toán học**: `27 7/18`, `493/18`, `27,388889` và `45 độ`
đều được chấp nhận. Câu "tạo số 2 từ ba chữ số 2, 4, 8" có verifier riêng vì có
vô số đáp án đúng — và có ô xem trước ngay khi học sinh đang gõ.

### Gắn khóa AI (làm sau cũng được)

Chỉ cần **một** trong ba khóa, không phải sửa dòng mã nào:

```bash
# .env — chọn một
GROQ_API_KEY="gsk_..."          # rẻ và nhanh nhất
OPENAI_API_KEY="sk-..."
ANTHROPIC_API_KEY="sk-ant-..."
```

Hệ thống tự dò theo thứ tự `groq → openai → anthropic`. Ép đích danh bằng
`MOCK_AI_PROVIDER=groq|openai|anthropic`. Tên model đổi được bằng
`GROQ_MODEL_VISION` / `OPENAI_MODEL_GRADE`… — **model đọc ảnh phải là model có
thị giác**.

**Chưa gắn khóa thì sao:** phần trắc nghiệm/đáp số vẫn chấm đầy đủ; câu tự luận
ghi rõ "chưa chấm được" kèm nút *Chấm lại câu này*. Hệ thống **không bịa điểm**.
Muốn xem trọn luồng bằng điểm mẫu thì đặt `MOCK_AI_PROVIDER=mock` — mọi chỗ hiển
thị đều dán nhãn "chế độ thử".

### Chấm tay

Giáo viên vào `/giao-vien/thi-thu`, quản trị vào `/quan-tri/thi-thu`. Cột **cần
xem lại** gom đúng những câu AI tự khai là không chắc. Sửa điểm câu nào thì tổng
điểm cập nhật ngay và ghi vào nhật ký.

Chi tiết kỹ thuật và những chỗ làm khác spec: [IMPLEMENTATION_NOTES.md](IMPLEMENTATION_NOTES.md).

---

## 3. Kiến trúc

### Vì sao một ứng dụng Next.js thay vì tách Next + NestJS

specs.md §4.2 đề xuất NestJS cho API. Bản hiện thực này gộp về **một ứng dụng Next.js** với ranh giới
module giữ nguyên, vì ba lý do:

1. **Ít bộ phận chuyển động hơn** — một tiến trình, một lần deploy, một cấu hình. Quan trọng ở giai đoạn pilot.
2. **Ranh giới module không đổi** — `src/server/<module>/service.ts` tương ứng 1:1 với 13 module trong specs §6.
   Service là hàm thuần nghiệp vụ, **không import gì của Next.js**, nên tách sang NestJS sau này chỉ là
   viết lại lớp HTTP mỏng ở trên.
3. **Engine vẫn độc lập hoàn toàn** — `src/engine/` không biết gì về DB, HTTP hay LLM.

Khi quy mô đòi hỏi tách dịch vụ, thứ tự tách hợp lý: Content Bank → AI Service → Recommendation Engine.

### Sơ đồ lớp

```
┌──────────────────────────────────────────────────────────────┐
│  src/app/            Giao diện (Server + Client Component)   │
│  src/app/api/v1/     Route handler — chỉ lo HTTP, mỏng       │
├──────────────────────────────────────────────────────────────┤
│  src/server/<module>/service.ts   13 module nghiệp vụ        │
│  ↳ không import next/*, ném ApiError, trả plain object       │
├──────────────────────────────────────────────────────────────┤
│  src/engine/         Recommendation Engine — LOGIC THUẦN     │
│  ↳ không DB, không mạng, không LLM, có unit test đầy đủ      │
├──────────────────────────────────────────────────────────────┤
│  src/lib/            prisma · config · auth · http · dates…  │
├──────────────────────────────────────────────────────────────┤
│  PostgreSQL (Prisma)                                          │
└──────────────────────────────────────────────────────────────┘
```

### Cấu trúc thư mục

```
prisma/
  schema.prisma          Mô hình dữ liệu (~32 model) — nguồn sự thật
  seed.ts, seed-data/    Dữ liệu mẫu: catalog, taxonomy, sinh câu hỏi
src/
  engine/                Engine cá nhân hóa
    types.ts             Hợp đồng công khai — đọc file này trước tiên
    gap.ts               Gap Priority (specs §7.3)
    mastery.ts           Cập nhật hồ sơ năng lực sau mỗi câu
    difficulty.ts        Luật tăng/giảm độ khó
    day-plan.ts          Sinh kế hoạch từng ngày theo 5 block
    feasibility.ts       Kiểm tra tính khả thi của mục tiêu
    selection.ts         Chọn câu cho bài chẩn đoán / bài tiến bộ
    scoring.ts           Chấm có trọng số độ khó
  server/
    identity/ catalog/ commerce/ content/ assessment/
    student-model/ plan/ learning/ teacher/ notification/
    analytics/ ai/
  lib/
    prisma.ts config/ auth.ts http.ts domain.ts dates.ts
    audit.ts analytics.ts rate-limit.ts client.ts
  components/ui.tsx      Primitive giao diện dùng chung
  app/                   Trang và API route
```

---

## 3b. Hệ thống thiết kế

Giao diện ba khu vực (học sinh · giáo viên · quản trị) dùng chung một hệ thống thiết kế.
**Không tự viết class Tailwind rời rạc cho nút, thẻ, ô nhập** — nếu thấy thiếu, hãy bổ sung vào
`src/components/ui.tsx` để cả hệ thống cùng được hưởng.

| File | Nội dung |
|---|---|
| `src/app/globals.css` | Token màu, bóng đổ, nhịp chuyển động, keyframes, tiện ích animation |
| `src/components/ui.tsx` | Primitive **không dùng hook** → import được cả ở Server Component |
| `src/components/motion.tsx` | Thành phần có trạng thái: `Reveal`, `Counter`, `ProgressRing`, `Skeleton`, `Toast`… |
| `src/components/charts.tsx` | Biểu đồ mastery, bảng màu đã kiểm định cho người mù màu |
| `src/components/shell.tsx` | `AppShell`, `FocusShell`, điều hướng ba khu vực |

### Bảng màu

- **brand** (indigo) — hành động chính, nhận diện thương hiệu
- **accent** (xanh ngọc) — tiến bộ, thành tựu
- **ink** (xám ngả xanh) — chữ và đường viền, dịu mắt khi đọc lâu
- **4 mức mastery** — `#1c5cab` Mạnh · `#6da7ec` Ổn · `#eda100` Cần củng cố · `#d03b3b` Hổng

Bốn màu mastery và cặp xanh/đỏ của biểu đồ đã chạy qua trình kiểm định: cặp gần nhau đạt
ΔE ≥ 18 với người mù màu protan/deutan (ngưỡng an toàn là 8). **Đổi màu biểu đồ thì phải chạy
lại kiểm định** — đừng chọn bằng mắt.

### Quy tắc chuyển động

Chuyển động ở đây phục vụ việc **hiểu**, không phải trang trí:

1. Dẫn mắt tới thứ vừa thay đổi (mastery tăng, câu mới, cảnh báo xuất hiện).
2. Cho phản hồi tức thì khi bấm — đặc biệt quan trọng trên điện thoại, nơi không có hover.
3. Gợi ý thứ tự đọc bằng cách hiện lần lượt (`stagger`).

Ràng buộc: hiệu ứng xuất hiện **chỉ chạy một lần**; thời lượng 200–450ms; không bao giờ chặn
thao tác. `globals.css` tự tắt toàn bộ khi người dùng bật *giảm chuyển động* — đây là yêu cầu bắt
buộc vì sản phẩm dành cho trẻ em và một số em nhạy cảm tiền đình.

Tiện ích dùng trực tiếp làm `className`: `animate-fade-up` · `animate-fade-in` · `animate-scale-in`
· `animate-pop` · `animate-float` · `delay-1…6` · `stagger` · `hover-lift` · `press` · `skeleton`
· `bar-fill` · `hero-glow` · `rule-fade`.

---

## 4. Vòng lặp nghiệp vụ

```
Đăng ký → Mua/kích hoạt → Tự khai mức → Kiểm tra đầu vào 15 câu
   → Chấm có trọng số → Hồ sơ năng lực theo từng kỹ năng
   → Học sinh chọn mục tiêu (engine kiểm tra tính khả thi)
   → Sinh lộ trình theo ngày → Học, mastery cập nhật sau MỖI câu
   → Sau 14 ngày: bài kiểm tra tiến bộ (đo delta, không chỉ điểm)
   → Báo cáo AI → Giáo viên tư vấn 20 phút → Ghi notes + override
   → Engine sinh lộ trình chu kỳ mới ─┐
                                       └──> lặp tới kỳ thi
```

Mắt xích đóng vòng lặp nằm ở `saveSessionNotes()` (module teacher) gọi sang
`applyTeacherOverride()` (module plan): quyết định của con người quay ngược lại điều khiển engine.

---

## 5. Nguyên tắc khi viết thêm code

Đây là những ràng buộc khiến sản phẩm khác một website luyện đề thông thường. Vi phạm là hỏng giá trị cốt lõi.

1. **Không hard-code con số nghiệp vụ.** Giá, số câu, chu kỳ, ngưỡng, tỷ lệ, trọng số… đều nằm trong
   `src/lib/config/defaults.ts` và admin ghi đè được qua bảng `AppConfig`. Thấy mình sắp gõ một con số
   nghiệp vụ vào code — dừng lại và thêm nó vào config.
2. **Chỉ câu hỏi `PUBLISHED` mới được đưa vào engine, bài kiểm tra hay AI.** Chặn ngay trong mệnh đề
   `where` của Prisma, không chỉ ở giao diện.
3. **Mọi lựa chọn câu phải ghi lý do** vào bảng `Recommendation` (`reasonCode` + `reasonData`).
   Đây là tiêu chí nghiệm thu, đồng thời là nội dung của tính năng "Vì sao hệ thống giao bài này".
4. **LLM không quyết định chọn câu.** Engine chọn bằng dữ liệu và luật kiểm toán được; AI chỉ diễn giải.
5. **AI phải bám lời giải đã kiểm duyệt** (`QuestionItem.solution`), không bịa đề, không sửa đáp án.
6. **Không đưa thông tin định danh học sinh vào prompt AI** — dùng biệt danh.
7. **Không xóa ngày học bị bỏ lỡ** khỏi lịch sử; engine dàn lại lịch và ghi nguyên nhân.
8. **Webhook thanh toán phải idempotent** — bắn trùng chỉ được kích hoạt quyền truy cập một lần.
9. **Quyền truy cập gắn với `Enrollment`, không gắn cứng vào `Payment`** — để cấp học bổng, voucher 100%.
10. **Autosave mọi bài làm.** Mất bài của học sinh là mất niềm tin, nhất là trên mạng di động chập chờn.

---

## 6. AI

Hệ thống **chạy đầy đủ khi không có API key**: mọi hàm trong `src/server/ai/` đều có bản
"fallback" sinh nội dung từ dữ liệu có cấu trúc. Khác biệt duy nhất là văn phong của nhận xét.

Để bật LLM thật, điền `ANTHROPIC_API_KEY` trong `.env`.

| Thành phần | Vai trò |
|---|---|
| `client.ts` | Gọi Claude API, timeout, thử lại |
| `prompts.ts` | Prompt có **version** — đổi prompt thì phải tăng `PROMPT_VERSION` |
| `fallback.ts` | Sinh nội dung không cần mạng |
| `service.ts` | Cache theo `AiGeneration`, kiểm tra schema output, không bao giờ ném lỗi ra ngoài |

Mọi lần gọi đều ghi lại model, phiên bản prompt, token, độ trễ vào bảng `AiGeneration` — trả lời được
câu hỏi kiểm toán "nhận xét này do model nào, prompt version nào sinh ra".

---

## 7. Kiểm thử

```bash
npm test              # toàn bộ unit test
npm run typecheck     # TypeScript
```

Trọng tâm test nằm ở `src/engine/` — nơi đặt các quyết định ảnh hưởng trực tiếp tới việc học:
thứ tự ưu tiên lỗ hổng, luật tăng giảm độ khó, chống lặp câu, tính khả thi mục tiêu, chấm có trọng số.
Ngoài ra có test cho chấm bài (`src/server/learning/grading.test.ts`) và nhập liệu hàng loạt
(`src/server/content/import.test.ts`).

Trước khi go-live cần bổ sung: kiểm thử tải theo ngưỡng đồng thời đã cam kết, và kịch bản
E2E trọn vòng (specs §16.6).

---

## 8. Vận hành

- **Cấu hình hệ thống:** Admin → Cấu hình. Mọi tham số ở Phụ lục B của specs đều sửa được tại đây.
- **Ngân hàng câu hỏi:** Admin → Học liệu. Nhập Excel/CSV có bước kiểm tra trước (dry-run) bắt buộc,
  không ghi DB cho tới khi báo cáo kiểm tra sạch lỗi.
- **Độ phủ nội dung:** Admin → Học liệu → Độ phủ. Kỹ năng nào chưa đủ câu hiển thị ở đây. Đây là
  công cụ chống rủi ro lớn nhất của dự án: engine không thể cá nhân hóa nếu kho thiếu câu.
- **Sao lưu:** thiết lập `pg_dump` định kỳ và **diễn tập khôi phục** — sao lưu chưa từng phục hồi thử
  thì coi như chưa có.

---

## 9. Triển khai trên Railway

Bản chạy thật: **https://web-production-3f0b1.up.railway.app**

Hạ tầng gồm hai service trong cùng một project Railway:

| Service    | Vai trò                                                            |
| ---------- | ------------------------------------------------------------------ |
| `web`      | Ứng dụng Next.js, build từ nhánh `main` của repo GitHub             |
| `Postgres` | Cơ sở dữ liệu; `web` trỏ tới qua biến `${{Postgres.DATABASE_URL}}` |

### Quy trình deploy

Đẩy commit lên `main` là Railway tự build lại — không cần thao tác tay:

```bash
git push origin main
```

`railway.json` quy định vòng đời deploy:

- **Build:** Nixpacks chạy `npm run build` (bao gồm `prisma generate`).
- **Start:** `npx prisma migrate deploy && npx tsx scripts/bootstrap.ts && npm run start`.
  Ba bước, chạy tuần tự trước khi container nhận traffic:
  1. `migrate deploy` cập nhật schema. Dùng `migrate deploy` chứ không `db push`:
     production cần lịch sử migration để lăn tiến/lùi có kiểm soát.
  2. `scripts/bootstrap.ts` nạp dữ liệu mẫu khi cần. Đây là bước vá đúng cái bẫy
     `migrate deploy` chỉ dựng bảng chứ không nạp dữ liệu — database đúng schema
     nhưng rỗng làm cả trang chủ lẫn khu quản trị hiện "chưa có kỳ thi nào".
     Quyết định dựa trên **cột mốc phiên bản** `seed.version` mà seed ghi vào
     bảng `AppConfig` ở bước cuối cùng, so với `SEED_VERSION` trong
     `prisma/seed-version.ts`:

     | Tình huống | Cột mốc trong DB | Hành động |
     |---|---|---|
     | Database trống | chưa có | nạp toàn bộ |
     | Nạp dở dang (chết giữa chừng) | chưa kịp ghi | nạp lại để bù |
     | Dữ liệu mẫu trong mã nguồn đã đổi | phiên bản cũ | nạp bù phần mới |
     | Đã đúng phiên bản | trùng | bỏ qua |

     **Đổi bất cứ thứ gì trong `prisma/seed-data/` thì phải tăng `SEED_VERSION`.**
     Không tăng thì môi trường đã seed từ trước sẽ đứng mãi ở dữ liệu cũ — mọi
     bảng đều có dữ liệu nên không dấu hiệu nào cho thấy nó đang thiếu.
     Muốn tắt hẳn bước này: đặt `SKIP_BOOTSTRAP_SEED=1`.
  3. `npm run start` bật web server.
- **Healthcheck:** `GET /api/v1/health`, trả `database: "up" | "down"` kèm
  `seed.state` = `empty | partial | ready` và số đếm bốn bảng cốt lõi — đủ để
  biết từ xa database đang trống, nạp dở hay đã đầy đủ mà không cần vào DB.

> **Bắt buộc trước khi mở cho người dùng thật:** đặt biến `SEED_DEFAULT_PASSWORD`
> ở service `web` **trước lần deploy đầu tiên**. Không đặt thì các tài khoản mẫu
> — kể cả `admin@olympiad.vn` với quyền `SUPER_ADMIN` — sẽ mang đúng mật khẩu
> ghi công khai trong tài liệu này. Sau khi đăng nhập lần đầu, hãy xóa các tài
> khoản mẫu không dùng tới trong `/quan-tri/nguoi-dung`.

### Đổi schema

Sinh migration ở máy local rồi commit cùng code — đừng sửa schema trực tiếp trên production:

```bash
npx prisma migrate dev --name mo_ta_thay_doi
git add prisma/migrations && git commit && git push
```

### Biến môi trường

Đặt ở tab Variables của service `web` (xem `.env.example` cho danh sách đầy đủ).
`AUTH_SECRET` và `PAYMENT_WEBHOOK_SECRET` đã được sinh ngẫu nhiên riêng cho
production, khác giá trị trong `.env` local. `ANTHROPIC_API_KEY` đang để trống
nên phần nhận xét chạy bằng template fallback; điền key vào là có văn phong AI.

Để bật thanh toán thật, thêm `PAYMENT_GATEWAY=PAYOS` cùng ba khóa `PAYOS_*`
(xem §2b). `APP_URL` có thể bỏ trống — hệ thống tự lấy `RAILWAY_PUBLIC_DOMAIN`
mà Railway cấp sẵn, nên URL webhook luôn đúng tên miền production.

---

## 10. Tình trạng hiện tại

Cập nhật sau lần kiểm chứng gần nhất trên máy phát triển.

### Đã chạy được và đã kiểm chứng

| Hạng mục | Bằng chứng |
|---|---|
| Biên dịch | `npx tsc --noEmit` — **0 lỗi** |
| Unit test | `npm test` — **150/150 xanh** (engine, chấm bài, nhập liệu CSV) |
| Build production | `npm run build` — **thành công**, 39 trang |
| Nạp dữ liệu | `npm run db:seed` — **1.634 câu hỏi**, 5 kỳ thi, 56 khóa, 186 kỹ năng, 112 bài kiểm tra |
| Vòng lặp nghiệp vụ | `npx tsx scripts/smoke-test.ts` — **42/42 đạt** |
| Khởi tạo môi trường triển khai | `scripts/bootstrap.ts` chạy trên database trống: nạp đủ 5 kỳ thi / 56 khóa / 1.634 câu; chạy lần hai thì tự bỏ qua |
| Giao diện | 23 trang của cả ba khu vực trả HTTP 200 với tài khoản thật |

Kiểm thử trọn vòng bao gồm cả tiêu chí nghiệm thu quan trọng nhất của đặc tả (§17):
*hai học sinh sai ở kỹ năng khác nhau nhận bộ bài khác nhau*, và *hệ thống lưu lý do chọn từng câu*.

### Ngân hàng câu hỏi

**113 bộ sinh câu hỏi, phủ đủ cả 14 taxonomy** — không còn khóa nào chỉ có cây
kiến thức mà rỗng câu hỏi.

| Nhóm | Taxonomy | Câu hỏi |
|---|---|---|
| **Toán khối 6–7** (`M67`) | 82 kỹ năng | **1.218** — khóa pilot theo specs §16.0 |
| Toán khối 3–5, 8–9, 10–12 | 3 taxonomy | 96 |
| Khoa học khối 3–5, 6–7, 8–9 | 3 taxonomy | 96 |
| Tin học khối 3–5 → 10–12 | 4 taxonomy | 128 |
| Vật lý / Hóa học / Sinh học khối 10–12 | 3 taxonomy | 96 |
| | **14 taxonomy** | **1.634 câu** |

Mọi câu hỏi đều do bộ sinh tính ra đáp án và lời giải từ tham số vừa sinh —
không có đáp án viết tay, nên không thể lệch giữa đề và lời giải. Nhiễu là lỗi
sai có thật của từng môn: quên chia đôi khi tính tổng cấp số cộng, đọc số dư
nhị phân xuôi thay vì ngược, lấy khối lượng nước làm mẫu số khi tính nồng độ,
quên rằng gen có hai mạch khi đếm côđon.

Thêm chương mới: viết bộ sinh vào một file trong `prisma/seed-data/` rồi khai
báo ở `generators-all.ts`. Bộ khung không phải sửa.

### Phần đã bổ sung gần nhất

- **Module giáo viên đầy đủ**: `src/server/teacher/service.ts` cùng sáu endpoint
  `/api/v1/teacher/*` (danh sách học sinh kèm cảnh báo, hồ sơ, lịch tư vấn, chi
  tiết buổi, ghi nhận xét, đóng buổi). Ghi nhận xét là một lời gọi làm bốn việc:
  lưu nhận xét, chốt buổi, đẩy override vào engine cho chu kỳ sau và báo cho học
  sinh — nhận xét lưu trước, override đẩy sau, để không bao giờ có chuyện lộ
  trình đổi mà không ai biết vì sao.
- **Trang danh mục công khai**: `/ky-thi` liệt kê mọi kỳ thi, `/khoa-hoc` là danh
  mục khóa có bộ lọc theo kỳ thi / khối / môn. Bộ lọc đi qua query string nên
  chia sẻ được đường dẫn và chạy đúng cả khi chưa tải xong JavaScript.
- **API còn thiếu đã bù**: `/api/v1/programs`, `/api/v1/courses` (công khai),
  `/api/v1/ai/teacher-brief/[sessionId]`, `/api/v1/admin/analytics`,
  `/api/v1/admin/teachers/workload`.

### Nội dung bán hàng và khu quản trị

**Chữ trên trang công khai sửa được trong `/quan-tri/giao-dien`.** Nội dung gốc
nằm trong `src/lib/copy/defaults.ts` (khoảng 150 ô, chia 13 nhóm theo vị trí trên
trang); bảng `SiteCopy` chỉ lưu phần admin đã ghi đè. Hai điều luôn đúng nhờ cách
này: dựng môi trường mới là có ngay bản chữ đầy đủ, và "khôi phục bản gốc" chỉ là
xóa dòng ghi đè chứ không cần ai nhớ câu cũ viết thế nào.

**Giới thiệu và video của từng kỳ thi / khóa học nhập trong `/quan-tri/chuong-trinh`.**
Mỗi kỳ thi có câu chốt, bài giới thiệu dài, video, các khối nội dung tự do và
câu hỏi thường gặp riêng. Mỗi khóa có câu chốt, bài giới thiệu, video, danh sách
"học xong làm được gì" và nội dung theo chặng. Khối nào để trống thì tự ẩn trên
trang chứ không để lại tiêu đề rỗng.

Trình phát video nhận link YouTube, Vimeo hoặc tệp `.mp4`. Trang chỉ hiện ảnh nền
và nút phát; iframe chỉ được tạo sau cú bấm đầu tiên — khách không bấm thì không
tải vài trăm KB script và không bị theo dõi.

**Phễu bán hàng có thêm một bước.** Trước đây bấm vào một khóa là nhảy thẳng sang
trang thanh toán. Giờ có `/khoa-hoc/<mã khóa>`: video, mô tả, kết quả đạt được,
nội dung theo chặng, rồi mới tới nút đăng ký.

**Người dùng và phân quyền: `/quan-tri/nguoi-dung`.** Cấp/thu vai trò, tạo tài
khoản nhân sự, khóa và mở lại tài khoản. Ba chốt an toàn ở tầng API, tất cả nhắm
vào cùng một tai nạn — khóa mất người quản trị cuối cùng rồi không ai vào được:

1. Chỉ SUPER_ADMIN mới cấp hoặc thu hồi được quyền SUPER_ADMIN.
2. Không ai tự đổi vai trò hay tự khóa tài khoản của chính mình.
3. Không gỡ quyền hay khóa SUPER_ADMIN đang hoạt động cuối cùng.

### Quyết định nghiệp vụ cần chốt (specs §20)

Code đã để sẵn chỗ cắm cho từng mục:

- **Cổng thanh toán thật** — hiện dùng `MockGateway`, xem `src/server/commerce/gateway.ts`.
  Webhook đã idempotent bằng compare-and-swap trong transaction, sẵn sàng cho cổng thật.
- **Email/SMS thật** — hiện ghi bản ghi và log ra console, xem `src/server/notification/service.ts`.
- **700.000đ cho một môn, một kỳ thi hay combo**, và thời hạn truy cập bao lâu.
- **Ngưỡng người dùng đồng thời** cần cam kết, để chạy kiểm thử tải trước mùa thi.
- **Kế hoạch chuyển kho câu hỏi hiện có** — định dạng nguồn quyết định công cụ nhập liệu.

### AI

Hệ thống chạy đầy đủ khi `ANTHROPIC_API_KEY` để trống: mọi hàm trong `src/server/ai/` có bản
fallback sinh nhận xét từ dữ liệu có cấu trúc. Điền khóa API để bật mô hình ngôn ngữ thật —
văn phong nhận xét sẽ tự nhiên hơn, mọi thứ khác giữ nguyên.
