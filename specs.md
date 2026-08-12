# SPECS — Nền tảng ôn luyện Olympic cá nhân hóa bằng AI

> **Sản phẩm:** Hệ thống ôn luyện trực tuyến cá nhân hóa cho các kỳ thi **ASMOPSS – NEO – STEM – FMC** (mở rộng: PAS)
> **Nguồn nghiệp vụ:** `WEB học ôn các kỳ thi.docx`
> **Phiên bản:** 1.0 — ngày 11/08/2026
> **Mục đích tài liệu:** Kế hoạch triển khai chi tiết toàn bộ dự án cho đội phát triển (kiến trúc, dữ liệu, module, lộ trình sprint, tiêu chí nghiệm thu, rủi ro và các lưu ý bắt buộc).

---

## MỤC LỤC

1. [Tổng quan & ý tưởng cốt lõi](#1-tổng-quan--ý-tưởng-cốt-lõi)
2. [Mục tiêu dự án](#2-mục-tiêu-dự-án)
3. [Phạm vi sản phẩm](#3-phạm-vi-sản-phẩm)
4. [Kiến trúc hệ thống & tech stack đề xuất](#4-kiến-trúc-hệ-thống--tech-stack-đề-xuất)
5. [Mô hình dữ liệu (Database Schema)](#5-mô-hình-dữ-liệu-database-schema)
6. [Đặc tả module & API](#6-đặc-tả-module--api)
7. [Recommendation Engine — đặc tả chi tiết](#7-recommendation-engine--đặc-tả-chi-tiết)
8. [AI Layer — đặc tả chi tiết](#8-ai-layer--đặc-tả-chi-tiết)
9. [Đặc tả màn hình (UI/UX)](#9-đặc-tả-màn-hình-uiux)
10. [Quy tắc nghiệp vụ chi tiết](#10-quy-tắc-nghiệp-vụ-chi-tiết)
11. [Thanh toán & quyền truy cập](#11-thanh-toán--quyền-truy-cập)
12. [Thông báo & nhắc học](#12-thông-báo--nhắc-học)
13. [Analytics & KPI](#13-analytics--kpi)
14. [Bảo mật & dữ liệu trẻ em](#14-bảo-mật--dữ-liệu-trẻ-em)
15. [Yêu cầu phi chức năng](#15-yêu-cầu-phi-chức-năng)
16. [Kế hoạch triển khai — Roadmap & Sprint](#16-kế-hoạch-triển-khai--roadmap--sprint)
17. [Tiêu chí nghiệm thu MVP](#17-tiêu-chí-nghiệm-thu-mvp)
18. [Rủi ro & giảm thiểu](#18-rủi-ro--giảm-thiểu)
19. [CÁC LƯU Ý QUAN TRỌNG (bắt buộc đọc)](#19-các-lưu-ý-quan-trọng-bắt-buộc-đọc)
20. [Câu hỏi cần chốt trước kickoff](#20-câu-hỏi-cần-chốt-trước-kickoff)
21. [Phụ lục](#21-phụ-lục)

---

## 1. Tổng quan & ý tưởng cốt lõi

### 1.1. Ý tưởng cốt lõi

**Không bán "kho bài tập giống nhau cho tất cả".** Hệ thống xây dựng kho học liệu lớn đã kiểm duyệt, sau đó **AI/Engine nhận diện lỗ hổng kiến thức của từng học sinh** và tự chọn bài phù hợp để tạo **lộ trình ôn luyện riêng** cho chính học sinh đó.

### 1.2. Chu trình xuyên suốt của hệ thống

```
HS làm bài kiểm tra đầu vào (15 câu)
        │
        ▼
AI phát hiện lỗ hổng kiến thức → lập Hồ sơ năng lực (Mastery Profile)
        │
        ▼
HS đặt mục tiêu (level đích + deadline + quỹ thời gian)
        │
        ▼
AI lập lộ trình học tập (Study Plan theo ngày/tuần)
        │
        ▼
AI giao bài đúng chỗ yếu — nguồn bài từ KHO ĐÃ KIỂM DUYỆT
        │  (mastery cập nhật sau MỖI câu trả lời)
        ▼
Kiểm tra tiến bộ mỗi 2 tuần (Progress Assessment — đo delta)
        │
        ▼
AI tổng hợp report → Giáo viên tư vấn 20 phút → ghi notes/override
        │
        ▼
AI tái lập lộ trình ──────► lặp lại chu kỳ 2 tuần đến kỳ thi
```

### 1.3. Khác biệt so với website luyện đề thông thường

| Khía cạnh | Kho bài truyền thống | Nền tảng này |
|---|---|---|
| Vận hành | HS mua tài khoản, tự chọn đề trong kho chung | Kho rất lớn; AI/engine chọn bài theo hồ sơ năng lực cá nhân |
| Nội dung | Giống nhau, chỉ chia theo lớp/chủ đề | Mỗi HS nhận bộ bài, thứ tự, cường độ và đánh giá khác nhau |
| Điều chỉnh | Ít hoặc không điều chỉnh theo kết quả | Sau mỗi bài / mỗi tuần / mỗi test 2 tuần: hồ sơ năng lực cập nhật, lộ trình tái tính toán |
| Giáo viên | Dạy/giải bài chung | Tập trung 20 phút tư vấn định kỳ dựa trên báo cáo AI |

### 1.4. Nguyên tắc nền tảng (đội IT phải hiểu đúng)

1. **AI KHÔNG phải nguồn tạo đề tự do.** Nguồn bài chính là kho câu hỏi do đơn vị xây dựng, kiểm duyệt, gắn metadata đầy đủ.
2. **AI/Engine chỉ chọn** đúng câu, đúng mức độ, đúng chủ đề, đúng thời điểm; và tạo nhận xét/giải thích/lộ trình dựa trên dữ liệu.
3. **15 câu đầu vào chỉ để phân loại nhanh** — hồ sơ chính xác được cập nhật liên tục trong quá trình học.
4. **Mỗi kỳ thi có blueprint riêng** — hệ thống phải cho admin cấu hình "luật của từng kỳ thi", **không hard-code**.
5. **Lưu toàn bộ lịch sử:** câu đã giao, đúng/sai, thời gian, số lần thử, chủ đề, độ khó, tiến bộ, lịch sử tư vấn.

### 1.5. Định nghĩa thành công

> Một học sinh sau khi vào hệ thống phải cảm nhận rõ: *"Website biết mình đang yếu phần nào và hôm nay đang giao đúng những bài mình cần để tiến lên mức mục tiêu"* — không phải chỉ là "website có nhiều bài tập".

**Lõi hệ thống = Question Bank + Taxonomy + Student Mastery + Recommendation Engine + Assessment Loop.** Website bán khóa, thanh toán, giao diện học là lớp bao quanh lõi này.

---

## 2. Mục tiêu dự án

### 2.1. Mục tiêu kinh doanh

- Chuyển nhu cầu ôn luyện hiện có thành sản phẩm số bán theo quy mô **hàng nghìn học sinh** tham gia vòng quốc gia.
- Bán quyền truy cập theo **từng học sinh / từng chương trình thi**, giá khởi điểm đề xuất **700.000đ** (phải là tham số cấu hình, không hard-code).
- Tạo doanh thu trước kỳ thi quốc gia; duy trì tương tác suốt giai đoạn ôn luyện.
- Tận dụng lợi thế độc quyền: hiểu cấu trúc kỳ thi, kho đề, dữ liệu thí sinh.
- Giảm chi phí dạy trực tiếp: giáo viên chỉ can thiệp ở điểm giá trị cao.
- Xây CSDL năng lực học sinh phục vụ cải tiến nội dung, khóa nâng cao, tuyển chọn vòng quốc tế.

### 2.2. Mục tiêu giáo dục

- Xác định đúng trình độ hiện tại và lỗ hổng kiến thức cụ thể của từng HS.
- Lập lộ trình có mục tiêu thời gian rõ (VD: Trung bình → Khá trong 1–2 tháng).
- Giao khối lượng phù hợp quỹ thời gian thực tế (không quá nhiều, không quá dễ).
- Học bù lỗ hổng trước, nâng độ khó sau, bám blueprint kỳ thi mục tiêu.
- Đo tiến bộ định kỳ bằng dữ liệu, có giáo viên xác nhận/định hướng mỗi chu kỳ 2 tuần.

---

## 3. Phạm vi sản phẩm

### 3.1. Cấu trúc chương trình (Program → Course → Cohort)

Trang đầu hiển thị **4 lựa chọn kỳ thi: ASMOPSS, NEO, STEM, FMC** (kiến trúc phải cho phép thêm kỳ thi mới, VD: PAS, mà không sửa code). Mỗi kỳ thi là một **Program** độc lập — dùng chung engine + kho nội dung, nhưng có blueprint, quy tắc ra bài, kỹ năng ưu tiên và giao diện thông tin riêng.

| Đối tượng | Dữ liệu quản lý |
|---|---|
| **Program** (kỳ thi) | Tên, logo, mô tả, mùa thi, môn áp dụng, khối lớp, thời lượng đề, blueprint, giá, thời hạn truy cập |
| **Course** (khóa) | Program + khối lớp + môn học. VD: ASMOPSS / Khối 6–7 / Toán |
| **Cohort** (mùa) | 2026, 2027… để quản trị đề, tài khoản, báo cáo theo mùa thi |
| **Pricing** | Mặc định 700.000đ/HS/program; cho phép thay đổi/coupon/combo |

### 3.2. Khối lớp và môn học

| Khối | Lớp | Môn |
|---|---|---|
| **A** | 3 – 4 – 5 | Toán; Khoa học tự nhiên; Công nghệ thông tin |
| **B** | 6 – 7 | Toán; Khoa học tự nhiên; Công nghệ thông tin |
| **C** | 8 – 9 | Toán; Khoa học tự nhiên; Công nghệ thông tin |
| **D** | 10 – 11 – 12 | Toán; Vật lý; Hóa học; Sinh học; Công nghệ thông tin |

> ⚠️ **Lưu ý thiết kế:** Mỗi HS vẫn phải lưu **lớp thực tế** (3, 4, 5…) dù nội dung gom theo khối — để AI điều chỉnh độ khó và về sau có thể tách nội dung theo lớp.

### 3.3. Cấu trúc kiến thức 4 tầng (taxonomy — BẮT BUỘC)

| Tầng | Ví dụ | Vai trò |
|---|---|---|
| **Môn** | Toán – Khối 3–5 | Phạm vi cao nhất |
| **Chương** | Phân số | ~20–25 chương/môn/khối |
| **Kỹ năng (Skill)** | So sánh phân số; cộng phân số; toán lời văn | Đơn vị AI dùng để xác định "hổng phần nào" |
| **Câu hỏi (Item)** | `M345-FRA-00127` | Đơn vị giao học, kiểm tra, thống kê |

> ⚠️ Chỉ gắn câu hỏi với "chương" là **chưa đủ** để cá nhân hóa thật sự — bắt buộc phải có tầng **skill**.

### 3.4. Quy mô kho nội dung dự kiến

- Mỗi môn/khối: ~20–25 chương; mỗi chương 3 kho theo mức **Trung bình – Khá – Giỏi**, mỗi kho ~100 câu.
- → Một môn/khối ≈ **6.000–7.500 câu**. Nhân với nhiều khối, nhiều môn, 4 program → thiết kế DB + công cụ nhập liệu cho quy mô **hàng chục nghìn → hàng trăm nghìn item** ngay từ đầu.

### 3.5. Ngoài phạm vi MVP (làm sau)

- Conversational AI tutor (chat tự do có giới hạn phạm vi).
- Machine-learning knowledge tracing / IRT (chỉ khi đủ dữ liệu).
- Sinh biến thể câu hỏi bán tự động (phải có quy trình kiểm duyệt).
- Parent dashboard riêng, auto-booking giáo viên, gamification (Giai đoạn 2).
- Mock contest, ranking chuẩn hóa, dự báo huy chương, tích hợp CRM/BI (Giai đoạn 3).

---

## 4. Kiến trúc hệ thống & tech stack đề xuất

### 4.1. Nguyên tắc kiến trúc

1. **Modular monolith** cho MVP (không microservices sớm) — nhưng ranh giới module rõ ràng, đặc biệt **Recommendation Engine tách thành package thuần logic, kiểm thử độc lập được**.
2. **Config-driven:** mọi luật kỳ thi, blueprint, giá, trọng số, chu kỳ… đọc từ DB/config, không hard-code.
3. **Event-driven bên trong:** mỗi lần trả lời câu hỏi phát sinh event → cập nhật mastery, analytics, notification qua queue.
4. **AI qua lớp trừu tượng:** model/prompt/version là cấu hình; mọi call AI đều log và có fallback.
5. **Audit-first:** mọi thay đổi câu hỏi, điểm, entitlement, notes đều ghi audit log.

### 4.2. Tech stack đề xuất

| Lớp | Công nghệ | Lý do |
|---|---|---|
| Frontend | **Next.js 15 (App Router) + TypeScript + TailwindCSS + shadcn/ui** | Mobile-first, SSR cho landing/SEO, 1 codebase cho HS + GV + Admin |
| Công thức toán | **KaTeX** (render), lưu LaTeX trong stem/solution | Câu hỏi Toán/Lý/Hóa bắt buộc có công thức |
| Backend | **NestJS (Node.js + TypeScript)** — modular monolith | Module hóa 1:1 với 13 module nghiệp vụ; DI thuận tiện test |
| Engine | **Package TypeScript thuần** (`packages/engine`) | Kiểm thử độc lập, không phụ thuộc DB/framework |
| Database | **PostgreSQL 16** (JSONB cho options/metadata/config) | Quan hệ + linh hoạt; đủ cho hàng trăm nghìn item |
| Cache/Queue | **Redis + BullMQ** | Session, rate limit, hàng đợi AI jobs / grading / notification |
| Storage | **S3-compatible** (AWS S3 / DO Spaces) | Ảnh trong câu hỏi, file import, export |
| AI/LLM | **Claude API** (mặc định `claude-sonnet-5` cho report/nhận xét; `claude-haiku-4-5` cho tác vụ rẻ như gợi ý tag) — qua adapter, model/prompt là config trong admin | Chất lượng tiếng Việt tốt; đổi model không sửa code |
| Thanh toán | Adapter pattern — **VNPay / MoMo / ZaloPay / PayOS** (chốt ở kickoff) + kích hoạt thủ công | Webhook idempotent bắt buộc |
| Auth | JWT access + refresh token; OTP email/SMS | Chuẩn, đơn giản |
| Video tư vấn | MVP: **link ngoài (Google Meet/Zoom)** dán tay | Không tự build video call ở MVP |
| Hạ tầng | Docker + Docker Compose (dev) → cloud (AWS/DO) + CDN Cloudflare; staging + production | Autoscaling trước mùa thi |
| Observability | **Sentry** (error) + structured logs + uptime alert; metrics (Prometheus/Grafana hoặc hosted) | Alert cho payment/AI/job failure |
| CI/CD | GitHub Actions: lint → test → build → deploy staging → manual approve production | |

### 4.3. Kiến trúc logic (6 lớp — theo tài liệu nghiệp vụ)

| Lớp | Chức năng |
|---|---|
| **Rules/Blueprint Layer** | Luật kỳ thi, phân bố câu, prerequisite, ràng buộc nội dung |
| **Student Model** | Mastery, confidence, history, target, quỹ thời gian |
| **Recommendation Engine** | Tính gap, chọn skill, chọn item, xếp lịch |
| **LLM/AI Layer** | Nhận xét, giải thích, report giáo viên, hội thoại học tập |
| **Safety/Validation** | AI chỉ tham chiếu item/solution đã publish; kiểm output; log |
| **Analytics** | Hiệu quả nội dung, tiến bộ, conversion, retention |

### 4.4. Cấu trúc repo đề xuất (monorepo)

```
web-olympic/
├─ apps/
│  ├─ web/                # Next.js — UI học sinh + giáo viên + admin
│  └─ api/                # NestJS — modular monolith (13 module ở mục 6)
├─ packages/
│  ├─ engine/             # Recommendation Engine thuần TS + test đầy đủ
│  ├─ shared/             # types, DTO, constants, validation schemas (zod)
│  └─ ai/                 # AI adapter: prompts (versioned), guards, logging
├─ infra/                 # Docker, IaC, CI/CD, script backup/restore
├─ tools/                 # Script import content, seed taxonomy, migration
└─ docs/                  # specs.md, ERD, API spec, ADRs, test plan
```

---

## 5. Mô hình dữ liệu (Database Schema)

### 5.1. Sơ đồ quan hệ tổng quát

```
User ─┬─ StudentProfile ── Enrollment ── Course ── Program ── Cohort
      ├─ TeacherProfile ── TeacherAssignment          │
      └─ (roles: RBAC)                                └─ Pricing/Coupon
                                                            │
Enrollment ── Goal ── StudyPlan ── StudyPlanDay ── PlanDayItem   Payment
     │                                                │
     ├─ AssessmentAttempt ── ItemAttempt ─────────────┤
     │         │                  │                   │
     │    Assessment          QuestionItem ── Skill ── Chapter
     │    (blueprint)              │            │
     ├─ StudentSkillMastery ───────┘       SkillPrerequisite
     ├─ MasterySnapshot
     ├─ Recommendation (audit "vì sao chọn câu này")
     └─ TeacherSession (report, notes, override)
```

### 5.2. Bảng chi tiết — nhóm Người dùng & Thương mại

| Bảng | Trường chính | Ghi chú |
|---|---|---|
| `users` | id, email, phone, password_hash, full_name, status, created_at | Tài khoản chung mọi role |
| `roles` / `user_roles` | student, parent, teacher, content_editor, reviewer, program_manager, ops_admin, super_admin | RBAC — 8 role |
| `student_profiles` | user_id, actual_grade (lớp thực tế 3–12), grade_band, school (optional), parent_name, parent_phone, parent_email, preferences | ⚠️ bắt buộc lưu lớp thực tế |
| `programs` | id, code (ASMOPSS/NEO/STEM/FMC/PAS…), name, logo, description, season, active, config JSONB | Thêm kỳ thi mới = thêm bản ghi |
| `courses` | id, program_id, grade_band (A/B/C/D), subject, name, active | Program + khối + môn |
| `cohorts` | id, program_id, year, start_date, end_date, exam_date | Mùa thi — exam_date dùng cho "độ gần kỳ thi" |
| `pricings` | id, course_id/program_id, price, currency, access_duration_days, valid_from, valid_to | Giá là dữ liệu, không phải hằng số |
| `coupons` | id, code, type (percent/amount), value, max_uses, used_count, expires_at, applicable program/course | |
| `payments` | id, user_id, order_code, amount, gateway, status, gateway_txn_id, webhook_payload JSONB, idempotency_key, created_at | Webhook idempotent |
| `enrollments` | id, student_id, course_id, cohort_id, source (paid/manual/scholarship), payment_id (nullable), starts_at, expires_at, status | **Entitlement gắn enrollment, KHÔNG gắn cứng payment** |

### 5.3. Bảng chi tiết — nhóm Học liệu

| Bảng | Trường chính | Ghi chú |
|---|---|---|
| `chapters` | id, course_scope (subject+band), code, name, order, blueprint_weight | ~20–25/môn/khối |
| `skills` | id, chapter_id, code, name, description, order | Đơn vị chẩn đoán |
| `skill_prerequisites` | skill_id, prerequisite_skill_id | Đồ thị tiên quyết |
| `question_items` | Xem metadata bắt buộc bên dưới | Hàng trăm nghìn dòng |
| `question_item_versions` | item_id, version, snapshot JSONB, changed_by, changed_at, reason | Audit khi sửa câu |
| `item_flags` | item_id, reporter (AI/teacher/student), reason, status, resolved_by | Ticket báo lỗi câu hỏi |

**Metadata bắt buộc của `question_items` (không được bớt):**

| Field | Yêu cầu |
|---|---|
| `item_id` | Mã duy nhất, không đổi (VD `M345-FRA-00127`) |
| `program_scope` | ASMOPSS/NEO/STEM/FMC hoặc "dùng chung" (mảng) |
| `grade_band` | A(3–5) / B(6–7) / C(8–9) / D(10–12) |
| `actual_grade_scope` | Nếu câu chỉ phù hợp lớp cụ thể |
| `subject` | Toán/KHTN/Lý/Hóa/Sinh/CNTT |
| `chapter_id`, `skill_id` | Bắt buộc — không có thì không cá nhân hóa được |
| `difficulty` | Trung bình/Khá/Giỏi + numeric 1–10 (bổ sung) |
| `question_type` | single_choice / multiple_choice / numeric / short_answer |
| `stem` | Nội dung câu hỏi (hỗ trợ LaTeX + ảnh) |
| `options` | JSONB các phương án (nếu trắc nghiệm) |
| `correct_answer` | Đáp án chuẩn |
| `solution` | Lời giải chuẩn **đã kiểm duyệt** (nguồn grounding duy nhất cho AI) |
| `estimated_time` | Thời gian chuẩn (giây) — engine dùng xếp lịch |
| `tags` | Từ khóa, dạng toán, prerequisite, contest pattern |
| `status` | **Draft → Reviewed → Published → Flagged / Retired** |
| `version` | Tăng khi sửa; lưu snapshot |
| `source_note` | Nguồn/năm biên soạn (không hiển thị cho HS) |
| `quality_stats` | Tỷ lệ đúng, discrimination, lượt làm (tự tích lũy) |

**Workflow trạng thái câu hỏi:**

| Trạng thái | Người xử lý | Quy tắc |
|---|---|---|
| Draft | Biên soạn viên | Nhập câu, đáp án, lời giải, metadata |
| Technical Review | Reviewer chuyên môn | Kiểm đáp án/lời giải/độ khó/skill |
| Published | Quản trị chuyên môn | **Chỉ câu Published mới được engine sử dụng** |
| Flagged | AI/GV/HS báo lỗi | Tạm ngừng hoặc vẫn dùng theo chính sách |
| Retired | Quản trị | Không giao mới, giữ lịch sử cho audit |

### 5.4. Bảng chi tiết — nhóm Học tập & Đánh giá

| Bảng | Trường chính | Ghi chú |
|---|---|---|
| `assessments` | id, course_id, type (diagnostic/progress/mock), blueprint JSONB, item_count, time_limit | Blueprint = cấu hình tỷ trọng chương/skill/độ khó |
| `assessment_attempts` | id, enrollment_id, assessment_id, started_at, submitted_at, score, estimated_level, state JSONB (autosave), status | Autosave + resume bắt buộc |
| `item_attempts` | id, enrollment_id, item_id, context (diagnostic/practice/assessment), plan_day_id?, is_correct, answer, time_ms, attempt_no, hint_used, solution_viewed_before_answer, error_pattern, created_at | **Bảng lớn nhất hệ thống** — index kỹ |
| `student_skill_mastery` | enrollment_id, skill_id, mastery_score (0–100), confidence, attempt_count, recent_accuracy, avg_time_ratio, error_pattern JSONB, last_practiced_at, difficulty_ceiling | Trạng thái hiện tại — cập nhật sau MỖI câu; lưu đủ mọi skill kể cả chưa có dữ liệu |
| `mastery_snapshots` | enrollment_id, skill_id, mastery_score, confidence, captured_at, trigger (diagnostic/biweekly/manual) | Lịch sử để tính **delta** |
| `goals` | id, enrollment_id, current_level, target_level, deadline, days_per_week, minutes_per_day, feasibility_status, created_at | Mức: Kém/TB/Khá/Giỏi (tên đổi được trong admin) |
| `study_plans` | id, enrollment_id, goal_id, cycle_no, week_focus JSONB, status, generated_by (engine version), created_at | Tái sinh mỗi chu kỳ 2 tuần |
| `study_plan_days` | id, plan_id, date, status (Planned/InProgress/Completed/Missed/Rescheduled), estimated_minutes, actual_minutes | Không xóa ngày Missed |
| `plan_day_items` | id, plan_day_id, item_id, block (warmup/repair/core/challenge/review), order, status | |
| `recommendations` | id, enrollment_id, item_id/skill_id, reason_code, reason_data JSONB, engine_version, created_at | **Audit "vì sao chọn câu này"** — tiêu chí nghiệm thu |

### 5.5. Bảng chi tiết — nhóm Giáo viên, Vận hành

| Bảng | Trường chính | Ghi chú |
|---|---|---|
| `teacher_assignments` | teacher_id, enrollment_id, assigned_at, capacity_slot | Phân công + capacity |
| `teacher_sessions` | id, enrollment_id, teacher_id, scheduled_at, duration (mặc định 20p), meeting_link, ai_brief JSONB, teacher_notes, action_code (keep/reduce/increase/change_priority), status | Chu kỳ 14 ngày |
| `notifications` | id, user_id, channel (email/sms/push/inapp), template_code, payload, status, sent_at | |
| `audit_logs` | id, actor_id, action, entity_type, entity_id, before JSONB, after JSONB, created_at | Câu hỏi, điểm override, entitlement, notes |
| `ai_logs` | id, use_case, model, prompt_version, input_ref, output, tokens, latency_ms, cost, status, created_at | Trace mọi AI output |
| `analytics_events` | id, user_id, event_name, properties JSONB, created_at | Xem danh sách event mục 13.2 |
| `app_configs` | key, value JSONB, scope (global/program/course), updated_by | Toàn bộ Phụ lục B |
| `feature_flags` | key, enabled, program_scope | Bật/tắt tính năng theo program |

---

## 6. Đặc tả module & API

13 module — mỗi module là 1 NestJS module, ranh giới rõ, giao tiếp qua service interface + event.

| # | Module | Trách nhiệm | API chính (REST `/api/v1`) |
|---|---|---|---|
| 1 | **Identity/Auth** | Đăng ký, login, OTP, refresh token, role, permission | `POST /auth/register`, `/auth/login`, `/auth/otp/verify`, `/auth/refresh`, `GET /me` |
| 2 | **Catalog** | Program, course, grade, subject, pricing | `GET /programs`, `GET /programs/:id/courses`, `GET /courses/:id` |
| 3 | **Commerce** | Checkout, coupon, payment webhook, entitlement | `POST /checkout`, `POST /checkout/apply-coupon`, `POST /webhooks/payment/:gateway` (idempotent), `POST /admin/enrollments/manual-activate` |
| 4 | **Content Bank** | Chapter, skill, item, import, review, publish | `CRUD /admin/chapters|skills|items`, `POST /admin/items/import` (Excel/CSV + validation), `POST /admin/items/:id/transition`, `GET /admin/items?filter…` |
| 5 | **Assessment** | Tạo test theo blueprint, session, autosave, chấm | `POST /assessments/:type/start`, `PATCH /attempts/:id/autosave`, `POST /attempts/:id/submit`, `GET /attempts/:id/result` |
| 6 | **Student Model** | Mastery/confidence/error history | `GET /me/mastery`, `GET /me/mastery/history` (nội bộ: `updateMasteryOnAttempt(event)`) |
| 7 | **Recommendation** | Tính gap, chọn skill/item, sinh plan | `POST /plans/generate`, `GET /plans/current`, `GET /plans/today`, `POST /plans/reschedule` |
| 8 | **AI Service** | Comment, explanation, teacher brief; prompt/version/log | Nội bộ qua queue: `ai.diagnostic_comment`, `ai.progress_report`, `ai.teacher_brief`, `ai.explain_solution` |
| 9 | **Learning Player** | Practice session, event tracking | `POST /practice/day/:id/start`, `POST /practice/items/:id/answer`, `POST /practice/items/:id/hint`, `POST /items/:id/report` |
| 10 | **Teacher** | Assignment, calendar, session notes | `GET /teacher/students`, `GET /teacher/students/:id/profile`, `GET /teacher/sessions`, `POST /teacher/sessions/:id/notes` |
| 11 | **Analytics** | Events, dashboards, export | `POST /events` (batch), `GET /admin/analytics/*`, `GET /admin/export/*` |
| 12 | **Notification** | Email/SMS/push/in-app reminders | Queue consumer + `GET /me/notifications`, cấu hình cadence |
| 13 | **Admin** | CMS + operations + audit + config | `CRUD /admin/configs`, `GET /admin/audit-logs`, `GET /admin/users?search`, quản lý coupon/refund/teacher |

**Quy ước chung:**

- Mọi API trả lỗi chuẩn `{code, message, details}`; validate bằng zod/class-validator ở edge.
- Mọi endpoint ghi analytics event tương ứng (mục 13.2).
- Mọi mutation quan trọng (item, điểm, entitlement, notes, config) → tự động ghi `audit_logs`.
- Autosave: `PATCH .../autosave` nhận state từng câu, idempotent, không mất bài khi refresh/mất mạng ngắn.

---

## 7. Recommendation Engine — đặc tả chi tiết

> **Đây là phần quan trọng nhất của sản phẩm.** Tách thành `packages/engine` thuần TypeScript, không phụ thuộc DB/framework, phủ unit test đầy đủ. LLM **không** tham gia quyết định chọn câu — quyết định dựa trên dữ liệu có cấu trúc + luật có thể kiểm toán.

### 7.1. Input của engine

| Nhóm dữ liệu | Biến |
|---|---|
| Năng lực | Mastery theo skill/chapter, độ khó đã làm được, độ ổn định, tốc độ |
| Mục tiêu | Mức đích, ngày đích, kỳ thi, blueprint mục tiêu |
| Quỹ thời gian | Số ngày/tuần, phút/ngày, ngày nghỉ, lịch kiểm tra 2 tuần |
| Lịch sử | Câu đã làm, lỗi lặp, thời gian học thật, bỏ bài, số lần xem lời giải |
| Nội dung | Danh sách item đủ điều kiện (Published), độ khó, skill, prerequisite, estimated_time |
| Ràng buộc | Không lặp quá sớm, không giao câu chưa kiểm duyệt, không vượt tải/ngày |

### 7.2. Hồ sơ năng lực (Student Mastery Profile)

- Vector mastery theo **từng skill** (VD Toán khối 6–7 có ~80 skill → lưu đủ 80, kể cả skill chưa có dữ liệu, với `confidence` thấp).
- Cập nhật **sau mỗi câu hỏi** — không đợi hết bài.
- Trường dữ liệu: `mastery_score` (0–100), `confidence`, `attempt_count`, `recent_accuracy`, `avg_time_ratio` (thời gian thực tế/chuẩn), `error_pattern` (kiến thức / đọc đề / tính toán / suy luận / cẩu thả), `last_practiced_at` (cho spaced repetition), `difficulty_ceiling`.

### 7.3. Điểm ưu tiên lỗ hổng (Gap Priority)

Phiên bản 1 dùng **công thức trọng số** (sau này thay bằng ML khi đủ dữ liệu):

```
GapPriority(skill) = Deficit(skill)                 // mức thiếu hụt so với mục tiêu
                   × BlueprintWeight(skill)          // tầm quan trọng trong blueprint kỳ thi
                   × ExamProximity(t)                // độ gần kỳ thi
                   × RepeatErrorFactor(skill)        // lỗi lặp lại
                   × PrerequisiteFactor(skill)       // hệ số tiên quyết (skill chặn skill khác → ưu tiên cao)
```

> ⚠️ **Mọi trọng số lưu trong `app_configs`** để đội chuyên môn tự điều chỉnh, không sửa code.

Engine chọn câu trong các skill có GapPriority cao nhất, nhưng **phải cân bằng**: ôn lỗ hổng + củng cố đã học + luyện dạng đề thi + thử thách vừa sức. **Không "đuổi theo điểm yếu" vô hạn.**

### 7.4. Luật chọn/điều chỉnh độ khó

| Tình huống | Hành động |
|---|---|
| Sai liên tiếp hoặc thời gian quá dài | Hạ độ khó, đưa bài prerequisite |
| Đúng ổn định 2–3 lần cùng skill, thời gian tốt | Tăng độ khó một bậc |
| Đúng nhưng quá chậm / dùng gợi ý | **Chưa** coi là mastered hoàn toàn |
| Đã mastered nhưng lâu không luyện | Giao câu kiểm tra retention (spaced repetition) |

Ngưỡng cụ thể (số lần, %, hệ số thời gian) = cấu hình admin.

### 7.5. Chống lặp & chống học thuộc

- Mỗi item có `exposure_count` theo HS và toàn hệ thống.
- Không giao lại đúng câu trong khoảng thời gian cấu hình (trừ chủ đích "retry").
- Ưu tiên câu tương đương cùng skill nhưng khác số liệu/ngữ cảnh.
- Khi kiểm tra định kỳ: **loại khỏi pool các câu HS vừa gặp gần đây** để tránh tăng điểm giả tạo.

### 7.6. Sinh kế hoạch ngày (Day Plan)

Cấu trúc một ngày học (tỷ lệ block cấu hình được):

| Block | Nội dung | Ví dụ |
|---|---|---|
| Warm-up | Ôn kỹ năng đã học 2–3 ngày trước | 5 câu |
| Repair | Đúng vào skill đang hổng (GapPriority cao) | 8–12 câu |
| Core | Chương mục tiêu tuần | 6–10 câu |
| Challenge | Cao hơn 1 bậc nếu mastery tốt | 2–4 câu |
| Mini review | Trộn để kiểm tra retention | 3–5 câu |

- Tổng thời lượng tính theo `estimated_time` từng item, khớp quỹ phút/ngày của HS (VD 45–60 phút), **không vượt max phút/ngày và max câu/ngày** (config).
- HS bỏ nhiều ngày → engine tự dàn lại kế hoạch (reschedule), báo rõ phần nào bị lùi, ghi nguyên nhân.

### 7.7. Kiểm tra tính khả thi của mục tiêu (Goal Feasibility)

Khi HS đặt mục tiêu (VD "TB → Khá trong 4 tuần, 5 ngày/tuần, 50 phút/ngày"), engine **tính ngược**:

```
tổng_phút_cần = Σ (khối lượng ước tính để nâng các skill thiếu hụt về ngưỡng mục tiêu)
tổng_phút_có  = số_tuần × ngày/tuần × phút/ngày
nếu tổng_phút_cần > tổng_phút_có × hệ_số_an_toàn:
    → CẢNH BÁO không khả thi + đề xuất: tăng thời gian / lùi deadline / hạ mục tiêu
```

Hệ thống hiển thị 2–3 phương án mục tiêu khả thi để HS chọn — **không ép một kế hoạch duy nhất**.

### 7.8. Auditability (bắt buộc)

Mỗi lần engine chọn item → ghi `recommendations` với `reason_code` + `reason_data` (skill gap, độ khó, block, điểm ưu tiên). Đây là tiêu chí nghiệm thu MVP: *"hệ thống lưu lý do chọn item"*, và UI hiển thị ngắn gọn *"Vì sao hệ thống giao bài này"*.

### 7.9. Diagnostic Blueprint (bài đầu vào 15 câu)

15 câu **không random đơn thuần** — theo "Diagnostic Blueprint" từng program/khối/môn (tỷ trọng chương, kỹ năng, độ khó). Mức tự khai chỉ chọn **vùng độ khó ban đầu**:

| Mức tự khai | Định hướng bộ 15 câu (cấu hình được) | Mục tiêu |
|---|---|---|
| Kém | Ưu tiên cơ bản + vài câu trung bình kiểm tra trần | Tránh test quá khó → dữ liệu vô nghĩa |
| Trung bình | Trộn cơ bản + trung bình + vài câu khá | Xác định khoảng chuyển tiếp |
| Khá | Tăng trung bình/khá, cài vài câu giỏi | Phân biệt khá thật vs học mẹo |
| Giỏi | Trọng tâm khá/giỏi, vẫn có câu neo cơ bản | Đánh giá chiều sâu và tốc độ |

> ⚠️ **Chấm không được đơn giản "đúng 10/15 = Khá".** Chấm theo độ khó + chủ đề + thời gian. Hai HS cùng 10/15 nhưng sai ở kỹ năng khác nhau → **lộ trình khác nhau** (tiêu chí nghiệm thu).

### 7.10. Progress Assessment mỗi 14 ngày

Cấu trúc bài (blueprint riêng, cấu hình được):

1. **Câu neo (anchor)** — cùng độ khó/skill với baseline → đo tiến bộ tương đối.
2. **Câu skill đã luyện 2 tuần qua** → kiểm tra lỗ hổng đã sửa chưa.
3. **Câu mới theo blueprint kỳ thi** → tránh "học tủ".
4. Không dùng lại câu HS đã gặp gần đây.

Kết quả bắt buộc có **delta**: mastery tăng/giảm, tốc độ tăng/giảm, lỗi biến mất/lỗi còn lặp — không chỉ điểm tuyệt đối.

---

## 8. AI Layer — đặc tả chi tiết

### 8.1. AI ĐƯỢC làm

| Use case | Input | Output |
|---|---|---|
| Nhận xét cá nhân hóa sau diagnostic/assessment | Kết quả có cấu trúc (điểm theo skill, thời gian, lỗi) | Nhận xét dễ hiểu: làm tốt gì, thường sai gì, sửa theo thứ tự nào |
| Tóm tắt lỗi nổi bật + skill ưu tiên | Mastery profile + error patterns | Danh sách 3–5 ưu tiên |
| Diễn giải kế hoạch học | Output của Recommendation Engine | Kế hoạch bằng ngôn ngữ tự nhiên |
| Giải thích lời giải theo nhiều mức chi tiết | **Solution đã duyệt** (bắt buộc bám theo) | Giải thích lại, không thay thế solution |
| Report 1 trang cho giáo viên | Toàn bộ dữ liệu 2 tuần (đã cấu trúc) | Pre-session brief (mục 9.3) |
| Gợi ý tag/difficulty cho câu mới | Nội dung câu | **Chỉ gợi ý — con người phê duyệt** |

### 8.2. AI KHÔNG được (Safety rules — enforce bằng code, không chỉ bằng prompt)

- ❌ Không tự bịa câu hỏi "thi thật" chưa qua kho/kiểm duyệt.
- ❌ Không tự sửa đáp án chuẩn trong runtime.
- ❌ Không tự thay đổi level/lộ trình mà không lưu nguyên nhân + dữ liệu dẫn tới thay đổi.
- ❌ Không nhận xét mang tính chẩn đoán tâm lý / kết luận quá mức về học sinh.
- ❌ Không đưa PII vượt mức cần thiết vào prompt (dùng `student_id`/biệt danh).
- ❌ Nếu có chat: không trả lời ngoài phạm vi học tập.

### 8.3. Kiến trúc AI Service

```
[Module nghiệp vụ] → enqueue job (BullMQ) → [AI Service worker]
                                              │ 1. Lấy dữ liệu cấu trúc (chỉ item/solution Published)
                                              │ 2. Render prompt template (versioned trong DB/config)
                                              │ 3. Gọi LLM qua adapter (model = config)
                                              │ 4. Validate output (schema + từ khóa cấm + độ dài)
                                              │ 5. Ghi ai_logs (prompt_version, model, tokens, cost, latency)
                                              │ 6. Fallback nếu fail: template tĩnh từ dữ liệu cấu trúc
                                              ▼
                                         Lưu kết quả + notify
```

**Nguyên tắc:**

- Chạy **async qua queue** — không block request của HS; retry có backoff; alert khi fail rate cao.
- Prompt là **template có version** trong admin (Phụ lục B: "AI prompt/version/model"); đổi prompt không cần deploy.
- Mọi output AI **trace được**: report nào sinh từ prompt version nào, model nào (tiêu chí nghiệm thu + auditability).
- Có **fallback không-AI**: nếu LLM lỗi/quá tải, sinh nhận xét từ template + số liệu để hệ thống không tê liệt.
- Cache/batch job AI mùa cao điểm (queue) để chịu tải.

---

## 9. Đặc tả màn hình (UI/UX)

### 9.1. Nguyên tắc UX/UI

- **Mobile-first** — HS/phụ huynh dùng điện thoại/tablet nhiều.
- Mỗi màn hình **một hành động chính** — không biến web thành thư viện menu.
- Luôn hiển thị tiến độ theo mục tiêu: *"Bạn đang ở đâu – còn bao xa – hôm nay cần làm gì"*.
- Giải thích ngắn *"Vì sao hệ thống giao bài này"* → tạo niềm tin vào cá nhân hóa.
- Không lạm dụng bảng xếp hạng; tập trung tiến bộ cá nhân.
- Biểu đồ cho HS đơn giản; báo cáo chuyên sâu dành cho GV/admin.
- Phản hồi đúng/sai nhanh; lời giải chi tiết mở theo logic học (hạn chế học thuộc đáp án).

### 9.2. Màn hình Học sinh (14 màn hình)

| # | Màn hình | Chức năng chính |
|---|---|---|
| 1 | **Landing/Home** | Giới thiệu 4 kỳ thi, lợi ích, khối/môn, giá, CTA "Bắt đầu", FAQ |
| 2 | **Program Detail** | Mô tả kỳ thi, đối tượng, môn/khối, giá, nội dung chương trình |
| 3 | **Register/Login** | Đăng ký (email/SĐT, họ tên, lớp, trường tùy chọn, thông tin phụ huynh), OTP/email verification, quên mật khẩu |
| 4 | **Checkout** | Chọn khóa, mã giảm giá, cổng thanh toán, trạng thái đơn |
| 5 | **Onboarding** | Lớp thực tế, khối, môn, **tự khai mức: Kém/TB/Khá/Giỏi** (dữ liệu khởi tạo, không phải kết luận) |
| 6 | **Diagnostic Test** | 15 câu, timer (nếu bật), **autosave, resume khi thoát giữa chừng** |
| 7 | **Diagnostic Result** | Điểm + thời gian + mức thực tế ước tính; **radar/biểu đồ nhóm kỹ năng: Mạnh – Ổn – Cần củng cố – Hổng**; 3–5 ưu tiên học trước; nhận xét AI; 2–3 lựa chọn mục tiêu khả thi |
| 8 | **Goal Builder** | Chọn level mục tiêu + deadline + số ngày/tuần + phút/ngày; cảnh báo nếu không khả thi |
| 9 | **Study Dashboard** | "Hôm nay học gì? Mất bao lâu? Vì sao? Xong thì tiến độ đổi thế nào?"; mục tiêu + số ngày còn lại; block nhỏ tạo cảm giác hoàn thành; nút Bắt đầu/Tạm dừng/Tiếp tục; streak; assessment/teacher session sắp tới |
| 10 | **Practice Player** | Câu hỏi (LaTeX/ảnh), hint, trả lời, lời giải, bookmark, **báo lỗi câu hỏi** |
| 11 | **Chapter/Skill Map** | Xem mastery từng mảng (không nhất thiết cho tự chọn hết bài) |
| 12 | **Assessments** | Lịch, bài đã làm, report, so sánh tiến bộ (delta) |
| 13 | **Teacher Session** | Lịch hẹn, link meeting, notes sau buổi |
| 14 | **Profile/Account** | Thông tin cá nhân, khóa đã mua, hóa đơn, cài đặt thông báo |

**Phản hồi sau mỗi câu (Practice Player):**

| Trường hợp | Phản hồi hệ thống |
|---|---|
| Đúng, nhanh | Xác nhận ngắn; tăng mastery; có thể tăng độ khó |
| Đúng, chậm | Vẫn tăng mastery nhưng ít hơn; gợi ý cách làm tối ưu |
| Sai lần đầu | Hint hoặc cho thử lại (theo cấu hình) |
| Sai lặp | Lời giải chuẩn từng bước; gắn error pattern; đưa bài prerequisite |
| Xem lời giải trước khi trả lời | Ghi nhận learning event, **không tính mastered** |
| Báo lỗi câu hỏi | Tạo ticket gắn `item_id` cho admin/reviewer |

### 9.3. Dashboard Giáo viên

- Danh sách HS được phân công, sắp xếp theo buổi tư vấn gần nhất / mức cần chú ý.
- Bộ lọc: program, khối, môn, mức hiện tại, target, % hoàn thành.
- **Thẻ cảnh báo:** giảm điểm; bỏ học > X ngày; sai lặp 1 skill; target không khả thi; assessment quá hạn.
- Hồ sơ HS: mastery map, timeline, câu sai tiêu biểu, tốc độ, plan hiện tại.
- **AI pre-session brief** tự tạo trước buổi — GV đánh dấu "đồng ý/không đồng ý".
- Notes sau buổi theo template; chọn action: **giữ plan / giảm tải / tăng tải / đổi ưu tiên skill** (engine nhận override).
- Lịch + link meeting (Google Meet/Zoom dán tay ở MVP).

**Report giáo viên xem trước buổi (7 khối):**

| Khối | Nội dung |
|---|---|
| Overview | Kỳ thi, khối, môn, mục tiêu, thời gian còn lại, số giờ đã học |
| Performance | Điểm đầu vào, điểm 2 tuần, delta, tốc độ |
| Mastery Map | Top điểm mạnh, top lỗ hổng, confidence |
| Error Patterns | 5 lỗi lặp nhiều nhất + ví dụ item |
| Engagement | Ngày học/tuần, tỷ lệ hoàn thành, bỏ bài, xem lời giải |
| AI Recommendation | 3 ưu tiên cho buổi trao đổi + lộ trình đề xuất |
| Teacher Notes | Ô ghi chú, action items, mức cần theo dõi |

### 9.4. Dashboard Quản trị

**(a) Quản trị chương trình:** tạo/sửa program (thêm được PAS…); bật/tắt theo mùa; cấu hình khối/môn; blueprint diagnostic/progress/mock; pricing/coupon/combo/thời hạn; chu kỳ tư vấn (14 ngày) + thời lượng (20 phút).

**(b) Quản trị học liệu (Question Bank Admin — PHẢI ĐỦ MẠNH):** CRUD chapter/skill/prerequisite/item; **import/export Excel-CSV có validation trước import**; bulk edit tag/difficulty/status; workflow duyệt; version history; audit ai sửa gì; clone câu; analytics theo item (lượt làm, tỷ lệ đúng, thời gian, discrimination, tỷ lệ báo lỗi); dashboard coverage (skill nào thiếu câu).

**(c) Quản trị người dùng & thanh toán:** tìm HS theo tên/SĐT/email/mã đơn; kích hoạt/khóa/gia hạn thủ công; transaction, refund note, coupon usage; phân công giáo viên + capacity + lịch; export cho CSKH/kế toán.

---

## 10. Quy tắc nghiệp vụ chi tiết

### 10.1. Trình độ học sinh

- 4 mức hiển thị: **Kém, Trung bình, Khá, Giỏi** — tên đổi được trong admin; ngưỡng cấu hình.
- Mức tự khai **chỉ phục vụ khởi tạo**; mức thực tế do test + lịch sử xác định.
- **Không "nhảy level" sau một bài duy nhất** — cần độ tin cậy + sự ổn định.
- Level tổng là hiển thị; bên dưới luôn lưu mastery theo skill.

### 10.2. Completion & Overdue

- Mỗi ngày học có status: `Planned / In Progress / Completed / Missed / Rescheduled`.
- **Không xóa ngày Missed khỏi lịch sử** — engine reschedule + ghi nguyên nhân.
- HS học vượt plan → mở "Optional Challenge" nhưng **không phá tỷ lệ cân bằng nội dung**.

### 10.3. Chu kỳ Biweekly Assessment

1. Đến hạn (mặc định 14 ngày, config) → **banner ưu tiên** trên dashboard.
2. Grace period do admin cấu hình.
3. Nộp bài → chấm ngay → report → tạo nhiệm vụ book/attend teacher session.
4. **Chỉ khi session hoàn tất (hoặc quá hạn theo rule), plan cycle mới được coi là "fully reviewed"** → sinh plan chu kỳ mới.

### 10.4. Buổi tư vấn giáo viên 20 phút — mục tiêu

- Giải thích các vấn đề AI phát hiện nhưng HS chưa hiểu.
- Kiểm tra nguyên nhân lỗi: kiến thức / chiến thuật / tâm lý thời gian / đọc đề / thói quen.
- Điều chỉnh mục tiêu nếu quá cao/quá thấp.
- Giao 1–3 khuyến nghị "con người" giá trị cao cho 2 tuần tới → engine nhận override.

### 10.5. Phân quyền (RBAC — 8 role)

| Role | Quyền chính |
|---|---|
| Học sinh | Mua/kích hoạt khóa, làm test, học bài, xem lộ trình/report, đặt lịch tư vấn |
| Phụ huynh | Xem tiến độ, thanh toán, nhận thông báo (MVP: có thể dùng chung account gia đình) |
| Giáo viên/Tutor | **Chỉ xem HS được phân công**, report AI, lịch, notes, điều chỉnh khuyến nghị trong phạm vi cho phép |
| Biên soạn viên | Tạo/sửa câu Draft, import, gắn metadata — **không xem thanh toán** |
| Reviewer chuyên môn | Duyệt câu, sửa difficulty/tag/solution, flag lỗi |
| Program Manager | Cấu hình kỳ thi, blueprint, course, lịch, tiêu chí đánh giá |
| Admin vận hành | Tài khoản, thanh toán, coupon, refund, hỗ trợ — **không sửa đáp án** |
| Super Admin | Phân quyền, cấu hình hệ thống, audit log, API key, security |

---

## 11. Thanh toán & quyền truy cập

- MVP hỗ trợ **1 payment gateway phổ biến tại VN** (chốt ở kickoff: VNPay/MoMo/ZaloPay/PayOS) + **admin kích hoạt thủ công**.
- **Webhook idempotent** (idempotency_key theo mã giao dịch) — tuyệt đối tránh kích hoạt trùng.
- **Entitlement gắn với `enrollments`, KHÔNG gắn cứng payment** → cấp được học bổng, voucher 100%, tài khoản nội bộ.
- Giá 700.000đ = cấu hình ban đầu; có bảng price/campaign theo thời gian.
- Coupon: theo %/số tiền, giới hạn lượt, hạn dùng, phạm vi program/course.
- Combo nhiều môn / nhiều kỳ thi: thiết kế schema hỗ trợ sẵn, bật sau.
- **Thời hạn truy cập là cấu hình** — chưa chốt chính sách nên không hard-code.
- Luồng tiền/đơn hàng phải có: trạng thái đơn rõ ràng, log webhook đầy đủ, đối soát được, refund note.

---

## 12. Thông báo & nhắc học

| Trigger | Kênh/Thông điệp |
|---|---|
| Sau mua | Xác nhận kích hoạt + hướng dẫn làm diagnostic |
| Chưa làm diagnostic sau 24h | Nhắc hoàn thành bài đầu vào |
| Đầu ngày học | Nội dung hôm nay + thời lượng dự kiến |
| Bỏ học 2–3 ngày | Nhắc nhẹ + nút tái sắp lịch |
| Sắp assessment | Nhắc trước 1–2 ngày |
| Có report mới | Thông báo tiến bộ + nút xem report |
| Sắp teacher session | Nhắc lịch + link meeting |
| Teacher notes xong | Tóm tắt action 2 tuần tiếp theo |
| Sắp hết quyền truy cập | Gia hạn hoặc chuyển khóa tiếp theo |

Kênh: email (MVP bắt buộc), in-app (MVP), SMS/Zalo OA/push (Giai đoạn 2). **Cadence cấu hình trong admin** — tránh spam gây tác dụng ngược.

---

## 13. Analytics & KPI

### 13.1. KPI theo nhóm

| Nhóm | KPI |
|---|---|
| Kinh doanh | Visitor → signup → checkout → paid conversion; doanh thu theo program; coupon; refund |
| Học tập | % hoàn thành plan; phút học; câu/ngày; mastery delta; assessment delta |
| Nội dung | Coverage skill; số item/skill; item quá dễ/quá khó; question error rate |
| AI/Engine | Tỷ lệ plan hoàn thành; số lần điều chỉnh độ khó; recommendation acceptance |
| Giáo viên | Số session; attendance; notes completion; HS cần escalation |
| Retention | Active D1/D7/D14; số ngày không học; churn trước kỳ thi |

### 13.2. Sự kiện tracking (chuẩn hóa tên event)

| Event | Thuộc tính chính |
|---|---|
| `view_program` | program_id |
| `start_checkout` | course_id, price |
| `purchase_success` | order_id, course_id |
| `diagnostic_started` | course_id, self_level |
| `item_answered` | item_id, skill_id, correct, time_ms, hint_used |
| `diagnostic_completed` | score, estimated_level |
| `goal_created` | target_level, deadline, minutes_per_day |
| `study_day_started` | plan_day_id |
| `study_day_completed` | completion_rate, minutes |
| `solution_viewed` | item_id, before_answer? |
| `assessment_completed` | type, score, mastery_delta |
| `teacher_session_booked` | teacher_id, scheduled_at |
| `teacher_session_completed` | action_code |
| `recommendation_changed` | reason, old_priority, new_priority |

---

## 14. Bảo mật & dữ liệu trẻ em

> Hệ thống xử lý dữ liệu **học sinh nhỏ tuổi** → bảo mật + tối thiểu hóa dữ liệu là **yêu cầu sản phẩm**, không phải phần thêm sau.

1. **Thu thập tối thiểu** dữ liệu cần thiết; tách thông tin đăng nhập/phụ huynh và dữ liệu học tập.
2. HTTPS toàn bộ; mật khẩu băm mạnh (bcrypt/argon2); session/token expiration; **rate limiting + chống brute-force** (đặc biệt login/OTP).
3. **RBAC nghiêm:** GV chỉ xem HS được phân công; biên soạn viên không xem thanh toán; CSKH không sửa đáp án.
4. **Audit log** cho: thay đổi câu hỏi, điểm override, payment/entitlement, notes quan trọng.
5. **Backup DB định kỳ + quy trình restore đã diễn tập** (không chỉ backup — phải test restore).
6. **Không đưa PII vào prompt AI** — dùng `student_id`/biệt danh; kiểm duyệt output AI.
7. Chính sách lưu/xóa dữ liệu; cơ chế phụ huynh yêu cầu cập nhật/xóa theo pháp luật hiện hành (Nghị định 13/2023 về bảo vệ dữ liệu cá nhân của VN).
8. Nếu triển khai chat AI: giới hạn phạm vi học tập, không trả lời ngoài lề.
9. Secrets qua vault/env; API key có scope; phân môi trường dev/staging/prod tách biệt dữ liệu.

---

## 15. Yêu cầu phi chức năng

| Yêu cầu | Mức mong muốn |
|---|---|
| **Scalability** | Hàng nghìn HS đồng thời lúc cao điểm; **load test trước mùa thi**; queue cho AI jobs; autoscaling |
| **Performance** | Dashboard phản hồi nhanh (<1–2s); submit câu + autosave gần thời gian thực |
| **Reliability** | Không mất bài khi refresh/mất mạng ngắn — autosave mọi attempt |
| **Observability** | Log, metrics, error tracking, **alert cho payment/AI/job failure** |
| **Accessibility** | Mobile-first; font dễ đọc; công thức/hình có phương án hiển thị rõ trên màn nhỏ |
| **Maintainability** | Config-driven (program/blueprint/price); engine module hóa |
| **Auditability** | Biết câu nào được chọn vì sao; AI comment sinh từ model/prompt version nào |
| **Localization** | Tiếng Việt trước; kiến trúc i18n sẵn sàng tiếng Anh (thi quốc tế) |

---

## 16. Kế hoạch triển khai — Roadmap & Sprint

### 16.0. Chiến lược tổng

> **Prototype end-to-end 1 môn/khối trước, scale sau.** Nhập vài trăm câu metadata tốt → chạy trọn vòng diagnostic → mastery → plan → practice → assessment → teacher report. Khi logic đúng mới scale kho nội dung. **Import hàng chục nghìn câu trước khi chốt taxonomy = chi phí làm lại rất lớn.**

Hai workstream song song:

- **Workstream IT** (bên dưới).
- **Workstream Nội dung** (đội chuyên môn — thường là critical path): chốt taxonomy chương/skill → biên soạn/chuẩn hóa câu + metadata → review → sẵn sàng import từ Sprint 3.

### 16.1. Nhân sự đề xuất

| Vai trò | Số lượng | Ghi chú |
|---|---|---|
| PM/BA | 1 | Kiêm liên lạc đội chuyên môn nội dung |
| Tech Lead / Architect | 1 | Sở hữu engine + kiến trúc |
| Backend Dev | 2 | NestJS, PostgreSQL, queue |
| Frontend Dev | 2 | Next.js; 1 người mạnh về admin UI |
| UI/UX Designer | 1 | Mobile-first, design system từ Sprint 0 |
| QA | 1 | Test plan, automation E2E, load test |
| Đội nội dung (ngoài IT) | 2–4 biên soạn + 1–2 reviewer | Bắt đầu NGAY từ Sprint 0 |

### 16.2. Giai đoạn 0 — Chuẩn bị (Sprint 0, 2 tuần)

| Hạng mục | Deliverable |
|---|---|
| Kickoff — chốt 10 câu hỏi (mục 20) | Biên bản quyết định |
| Chốt taxonomy pilot (1 môn/khối, VD NEO – Khối 6–7 – Toán) | Danh sách 20–25 chương + ~80 skill + prerequisite |
| ERD chi tiết + API spec khung | `docs/erd`, OpenAPI draft |
| Design system + wireframe các màn hình chính | Figma |
| Setup monorepo, CI/CD, môi trường dev/staging, Sentry | Repo chạy được, deploy staging tự động |
| Template Excel/CSV nhập câu hỏi + hướng dẫn biên soạn | Đội nội dung bắt đầu soạn câu ngay |

### 16.3. Giai đoạn 1 — MVP có thể bán được (Sprint 1–8, ~16 tuần)

> Mục tiêu MVP: **chứng minh giá trị "cá nhân hóa"**, không cố làm mọi tính năng. Pilot 1–2 kỳ thi, một số khối/môn nhu cầu lớn.

| Sprint | Trọng tâm | Deliverables chính |
|---|---|---|
| **1** | Nền móng | Auth (đăng ký/login/OTP/quên mật khẩu) + RBAC 8 role; StudentProfile (lưu lớp thực tế); Catalog CRUD (program/course/cohort/pricing); Landing + Program Detail |
| **2** | Question Bank v1 | CRUD chapter/skill/prerequisite/item; workflow Draft→Reviewed→Published→Flagged/Retired; versioning; search/filter; **import Excel/CSV + validation**; render LaTeX + ảnh; Enrollment + manual activation + entitlement check |
| **3** | Assessment core | Blueprint config (diagnostic); sinh đề 15 câu từ kho Published theo blueprint + mức tự khai; assessment session: timer, **autosave, resume**; chấm tự động theo độ khó/chủ đề/thời gian; **import lô câu pilot đầu tiên (200–300 câu) — kiểm chứng công cụ bằng dữ liệu thật** |
| **4** | Diagnostic end-to-end | Onboarding (tự khai level); Diagnostic Result (radar Mạnh–Ổn–Củng cố–Hổng, ưu tiên, mức ước tính); khởi tạo `student_skill_mastery`; AI Service v1: nhận xét diagnostic (prompt versioned + log + fallback) |
| **5** | Engine v1 + Goal | `packages/engine`: GapPriority + chọn item + anti-repeat + luật độ khó (unit test đầy đủ); Goal Builder + feasibility check (tính ngược quỹ thời gian); sinh StudyPlan/StudyPlanDay theo block warm-up/repair/core/challenge/review |
| **6** | Vòng lặp học | Practice Player đầy đủ (hint, lời giải theo logic, bookmark, báo lỗi câu); cập nhật mastery sau mỗi câu; phản hồi 6 trường hợp (mục 9.2); Study Dashboard "Hôm nay học gì"; reschedule khi bỏ ngày; hiển thị "vì sao giao bài này" |
| **7** | Chu kỳ 2 tuần + Teacher + Payment | Progress Assessment 14 ngày (anchor + trained + mới; loại câu gặp gần đây); report delta HS + bản chuyên sâu GV; Teacher Dashboard (danh sách, cảnh báo, hồ sơ HS, AI pre-session brief, notes + action override → engine); **tích hợp payment gateway + webhook idempotent + coupon** |
| **8** | Vận hành + cứng hóa | Notifications cơ bản (email + in-app: 9 trigger); Admin operations (tìm user, kích hoạt/gia hạn, transaction, phân công GV); analytics events + dashboard KPI cơ bản; audit log toàn hệ thống; **load test theo ngưỡng đã chốt**; security review; UAT; nạp đủ kho pilot (~vài nghìn câu); **Go-live pilot** |

**Điều kiện go-live pilot:** toàn bộ tiêu chí nghiệm thu MVP (mục 17) PASS + kho pilot đủ câu Published cho mọi skill trong blueprint (dashboard coverage không có skill trống).

### 16.4. Giai đoạn 2 — Tự động hóa & tối ưu (~8–12 tuần sau MVP)

- Adaptive difficulty tinh hơn theo dữ liệu thật (quality_stats, discrimination).
- Parent dashboard + notifications đa kênh (SMS/Zalo OA/push).
- Tự động booking giáo viên theo availability/capacity.
- Item analytics/IRT hoặc mô hình difficulty data-driven.
- AI giải thích theo phong cách HS; conversational tutor **giới hạn phạm vi**.
- Gamification: badges, streak, leaderboard — nguyên tắc không gây áp lực quá mức.
- Mở rộng program/khối/môn theo kết quả pilot.

### 16.5. Giai đoạn 3 — Nền tảng quy mô lớn

- Multi-year cohort, mock contest, ranking chuẩn hóa.
- Khuyến nghị bằng ML/knowledge tracing (khi đủ dữ liệu).
- Sinh biến thể câu semi-automatic **có kiểm duyệt**.
- Dự báo khả năng đạt mục tiêu/huy chương — chỉ khi đủ dữ liệu + được hiệu chuẩn.
- Tích hợp CRM, marketing automation, BI, hệ thống tổ chức kỳ thi hiện có.

### 16.6. Chiến lược kiểm thử

| Loại | Phạm vi |
|---|---|
| Unit test | **Engine coverage cao nhất** (GapPriority, chọn độ khó, anti-repeat, feasibility, sinh plan); grading; entitlement |
| Integration test | Webhook payment (idempotency — bắn trùng webhook phải không kích hoạt 2 lần); autosave/resume; workflow trạng thái item; RBAC matrix (từng role × từng resource) |
| E2E | Happy path trọn vòng: đăng ký → mua → diagnostic → goal → học 1 ngày → assessment → teacher notes → re-plan |
| Personalization test | **2 HS giả lập sai khác kỹ năng nhau → phải nhận plan khác nhau** (tiêu chí nghiệm thu) |
| Load test | Ngưỡng concurrent chốt ở kickoff; kịch bản cao điểm: đồng loạt làm assessment + AI jobs dồn queue |
| Content QA | Validation import; câu Published phải đủ metadata; coverage theo skill |

---

## 17. Tiêu chí nghiệm thu MVP

| Hạng mục | Điều kiện PASS |
|---|---|
| Đăng ký & mua | HS đăng ký, mua/kích hoạt course, thấy entitlement đúng |
| Diagnostic | Đúng 15 câu từ kho **Published** theo blueprint + mức tự khai; autosave; chấm ngay |
| Personalization | **Hai HS lỗi khác nhau nhận plan/bộ bài khác nhau; hệ thống lưu lý do chọn item** |
| Goal | HS đặt target + deadline + time budget; engine tạo plan **không vượt tải cấu hình** |
| Learning | Mỗi attempt lưu đúng/sai/thời gian/hint/solution; mastery cập nhật |
| Assessment 14 ngày | Tự đến hạn, tạo test, report **delta** |
| Teacher | GV thấy pre-session report, notes, action items |
| Question Bank | Import bulk; workflow Draft→Published; search/filter |
| Admin | Cấu hình program/course/price/blueprint **mà không sửa code** |
| Audit & Security | RBAC, audit log, payment log, AI output trace cơ bản |
| Scale test | Đạt ngưỡng concurrent user hai bên thống nhất trước go-live |

---

## 18. Rủi ro & giảm thiểu

| Rủi ro | Hậu quả | Giảm thiểu |
|---|---|---|
| Kho câu thiếu metadata | AI không thể cá nhân hóa thật | **Bắt buộc taxonomy chapter/skill/difficulty trước khi import lớn**; validation chặn import thiếu trường |
| 15 câu bị hiểu là chẩn đoán tuyệt đối | Phân loại sai HS | Baseline nhanh + continuous mastery + assessment 14 ngày; truyền thông đúng trong UI |
| AI hallucination | Giải sai/nhận xét sai | Grounding vào solution Published; validation output; log; teacher review; fallback template |
| Nội dung không đủ ở một skill | Engine lặp câu / không có đường học | **Dashboard coverage** + rule fallback (mở rộng sang skill lân cận/prerequisite) |
| Lộ trình quá nặng | HS bỏ cuộc | Time budget + feasibility check + completion feedback + auto-reschedule |
| Giáo viên quá tải | Không đủ 20 phút/2 tuần khi scale | Capacity planning, pool teacher, auto assignment (GĐ2), ưu tiên case cần can thiệp |
| Mùa cao điểm quá tải | Website chậm đúng lúc thi | Load test, cache, **queue AI jobs**, autoscaling |
| Vận hành content tốn công | Nút thắt không ở code mà ở nhập/duyệt câu | **CMS/import/versioning làm từ MVP (Sprint 2)** |
| Chậm workstream nội dung | Code xong không có gì để dạy | Đội nội dung khởi động từ Sprint 0; theo dõi tiến độ nhập câu như KPI dự án |
| Webhook thanh toán trùng/lỗi | Kích hoạt trùng, thất thoát | Idempotency key + log webhook + đối soát; test bắn trùng |

---

## 19. CÁC LƯU Ý QUAN TRỌNG (bắt buộc đọc)

Tổng hợp mọi điểm "không được bỏ qua" từ tài liệu nghiệp vụ + lưu ý kỹ thuật thực tế:

### 19.1. Về thứ tự làm việc

1. **Taxonomy trước — import sau.** Chốt skill model (chương/skill/prerequisite) trước khi nhập hàng loạt. Import hàng chục nghìn câu rồi mới sửa taxonomy = làm lại toàn bộ tagging.
2. **Prototype end-to-end 1 môn/khối trước** (vài trăm câu metadata tốt), chạy trọn chu trình rồi mới scale.
3. **Đội nội dung phải chạy song song từ ngày đầu** — content là critical path thật sự của dự án, không phải code.

### 19.2. Về kiến trúc & code

4. **Config-driven mọi thứ:** giá, thời hạn, blueprint, trọng số recommendation, chu kỳ 14 ngày, thời lượng 20 phút, số câu diagnostic, tên 4 level, ngưỡng độ khó, tỷ lệ block, max tải/ngày, khoảng không lặp item, cadence thông báo, grace period, teacher capacity, AI model/prompt/version, feature flags theo program (danh sách đầy đủ ở Phụ lục 21.2). **Nếu thấy mình đang hard-code một trong các giá trị này — dừng lại.**
5. **Engine tách package thuần, test độc lập.** LLM không quyết định chọn câu. Mọi quyết định của engine phải audit được (`recommendations.reason`).
6. **Chỉ câu Published được đưa vào engine/AI.** Enforce ở tầng query, không chỉ ở UI.
7. **Autosave + resume mọi bài làm.** Mất bài của học sinh = mất niềm tin, đặc biệt trên mobile mạng yếu.
8. **Webhook thanh toán idempotent; entitlement tách khỏi payment.**
9. **Audit log ngay từ đầu** — thêm sau rất khó truy vết ngược.

### 19.3. Về AI

10. AI **grounding vào solution đã duyệt** — không tự bịa đề, không sửa đáp án runtime, không kết luận tâm lý về HS.
11. **Không đưa PII vào prompt** — dùng student_id/biệt danh.
12. Mọi AI call: **log model + prompt version + tokens + cost**; chạy qua **queue** (không block UX); có **fallback template** khi AI lỗi.
13. Chấm điểm diagnostic **không phải "đúng 10/15 = Khá"** — theo độ khó + chủ đề + thời gian.

### 19.4. Về dữ liệu & nội dung

14. **Lưu lớp thực tế** của HS dù nội dung gom theo khối.
15. `item_attempts` là bảng lớn nhất — thiết kế index/partition từ đầu (theo enrollment_id, created_at).
16. Câu hỏi Toán/Lý/Hóa cần **LaTeX + ảnh** — pipeline import phải xử lý được (kho nguồn hiện ở Word/Excel/PDF → cần kế hoạch migration, hỏi kickoff Q8).
17. Tiếng Việt: UTF-8 mọi nơi, font hiển thị công thức + dấu tiếng Việt trên mobile; timezone `Asia/Ho_Chi_Minh` cho mọi lịch/chu kỳ.
18. **Anti-repeat + anchor items** — không để HS "tăng điểm giả" do gặp lại câu cũ.

### 19.5. Về vận hành

19. **Question Bank Admin phải đủ mạnh từ MVP** (import, bulk edit, versioning, coverage dashboard) — đây là nơi vận hành sống hàng ngày.
20. **Load test trước mùa thi** — cao điểm là lúc đồng loạt làm assessment; queue AI jobs để không sập.
21. **Backup + diễn tập restore** định kỳ.
22. Teacher capacity: 1 GV × 20 phút/HS/2 tuần → tính sớm số GV cần theo số HS bán ra; có cảnh báo quá tải.
23. Dữ liệu trẻ em: tối thiểu hóa, chính sách xóa/cập nhật theo yêu cầu phụ huynh (Nghị định 13/2023).
24. Không lạm dụng leaderboard/xếp hạng — tập trung tiến bộ cá nhân (đối tượng là trẻ em).

---

## 20. Câu hỏi cần chốt trước kickoff

Quyết định triển khai (không đổi ý tưởng cốt lõi) — IT chuẩn bị phương án + ước lượng cho từng lựa chọn:

| # | Câu hỏi | Ảnh hưởng |
|---|---|---|
| 1 | 700.000đ mua 1 program/1 môn hay combo? Thời hạn bao lâu? | Schema pricing, checkout |
| 2 | Mùa đầu pilot program/khối/môn nào? | Phạm vi content + Sprint 3–8 |
| 3 | Định dạng câu hỏi MVP: chỉ single-choice hay cả multiple/numeric/short answer? | Practice player, grading, import |
| 4 | Có cần timer chuẩn thi ở diagnostic/progress test ngay MVP? | Assessment UX |
| 5 | Cổng thanh toán nào? Cần hóa đơn điện tử/tích hợp kế toán? | Commerce module |
| 6 | Buổi 20 phút: Google Meet/Zoom link tay hay video tích hợp? | Teacher module (đề xuất: link tay ở MVP) |
| 7 | Parent account riêng ở MVP hay chỉ student account? | Auth, dashboard (đề xuất: chỉ student ở MVP) |
| 8 | Kho câu hiện ở định dạng nào (Word/Excel/PDF/DB)? | Kế hoạch migration + công cụ import |
| 9 | Ai duyệt cuối câu hỏi? Ai được override recommendation? | RBAC, workflow |
| 10 | Ngưỡng concurrent users cam kết ngày cao điểm? | Load test target, hạ tầng |

---

## 21. Phụ lục

### 21.1. Wireflow luồng chính

```
Landing → Chọn ASMOPSS/NEO/STEM/FMC → Chọn khối/môn → Đăng ký
→ Thanh toán/Kích hoạt → Tự khai level → Diagnostic 15 câu
→ AI/Engine chấm & Mastery Profile → Chọn mục tiêu + deadline + time budget
→ Sinh Study Plan → Học theo ngày → Cập nhật mastery liên tục
→ 14-day Assessment → AI Progress Report → Teacher Session 20 phút
→ Teacher Notes/Override → Re-plan → LẶP CHU KỲ ĐẾN KỲ THI
```

### 21.2. Danh mục cấu hình admin (không hard-code) — checklist

- [ ] Giá và thời hạn truy cập
- [ ] Danh sách program/course đang mở
- [ ] Số câu diagnostic (mặc định 15)
- [ ] Chu kỳ assessment (mặc định 14 ngày)
- [ ] Thời lượng teacher session (mặc định 20 phút)
- [ ] 4 level hiển thị và ngưỡng
- [ ] Blueprint từng bài test
- [ ] Trọng số recommendation
- [ ] Tỷ lệ repair/core/challenge
- [ ] Max phút/ngày và max câu/ngày
- [ ] Khoảng không lặp item
- [ ] Rule tăng/giảm difficulty
- [ ] Notification cadence
- [ ] Grace period assessment
- [ ] Teacher capacity
- [ ] AI prompt/version/model
- [ ] Feature flags theo program

### 21.3. Kịch bản mẫu (dùng làm E2E test case chuẩn)

Học sinh A — lớp 7, chọn **NEO / Khối 6–7 / Toán**, tự khai "Trung bình":

1. Hệ thống tạo diagnostic 15 câu theo blueprint (thiên Trung bình + câu neo cơ bản + vài câu Khá).
2. A đạt **9/15**. Phân tích: đại số cơ bản ổn; **tỉ lệ + toán lời văn yếu**; hình học trung bình; chậm ở câu nhiều bước.
3. AI ước tính "Trung bình cao"; 3 ưu tiên: tỉ lệ, lập phương trình từ lời văn, tốc độ biến đổi.
4. A chọn mục tiêu **"Lên Khá trong 6 tuần"**, 5 ngày/tuần, 50 phút/ngày.
5. Engine lập tuần 1: 40% repair tỉ lệ, 25% lời văn, 15% hình học, 10% retention, 10% challenge → chia 5 ngày.
6. Sau 4 ngày: tỉ lệ tốt → giảm bài dễ, tăng bài Khá; lời văn vẫn sai lặp → đưa prerequisite + lời giải từng bước.
7. Ngày 14: progress test — 9/15 → **11/15**, tốc độ +12%, mastery tỉ lệ +18, lời văn chỉ +4.
8. GV nhận report trước buổi 20 phút; khuyến nghị: tập đọc dữ kiện, gạch từ khóa, **không tăng độ khó lời văn trong 1 tuần**.
9. Engine nhận teacher override → điều chỉnh tuần 3–4 → tiếp tục theo dõi.

### 21.4. Ví dụ cấu trúc lộ trình 6 tuần

| Tuần | Trọng tâm | Cơ chế |
|---|---|---|
| 1 | Sửa lỗ hổng nền tảng | Bài prerequisite + mức Trung bình; tạo thói quen |
| 2 | Củng cố và đo lần 1 | Tăng mix; Progress Assessment + Teacher Session |
| 3 | Nâng lên mức Khá | Tăng câu Khá ở skill đã ổn; giữ repair skill yếu |
| 4 | Ổn định và đo lần 2 | Mixed set; kiểm retention; Teacher Session |
| 5 | Bám blueprint kỳ thi | Bài tích hợp/nhiều bước + quản lý thời gian |
| 6 | Tổng hợp / mô phỏng | Mock set, ôn lỗi cuối, chiến thuật làm bài, readiness report |

### 21.5. Backlog ưu tiên

| Priority | Feature | Mức |
|---|---|---|
| P0 | Program/Course catalog | Bắt buộc |
| P0 | Auth + Student Profile | Bắt buộc |
| P0 | Enrollment + entitlement | Bắt buộc |
| P0 | Payment/Manual activation | Bắt buộc |
| P0 | Question Bank + import + publish | Bắt buộc |
| P0 | Diagnostic 15 items | Bắt buộc |
| P0 | Automatic grading | Bắt buộc |
| P0 | Mastery profile | Bắt buộc |
| P0 | Recommendation engine v1 | Bắt buộc |
| P0 | Goal & time budget | Bắt buộc |
| P0 | Study plan/day schedule | Bắt buộc |
| P0 | Practice player | Bắt buộc |
| P0 | 14-day progress assessment | Bắt buộc |
| P0 | Teacher report & notes | Bắt buộc |
| P1 | Notifications | Nên có |
| P1 | Parent dashboard | Nên có |
| P1 | Booking/calendar automation | Nên có |
| P1 | Advanced analytics | Nên có |
| P2 | AI conversational tutor | Sau MVP |
| P2 | ML knowledge tracing | Sau khi đủ dữ liệu |
| P2 | Semi-auto item generation | Sau khi có quy trình kiểm duyệt |

### 21.6. Deliverables kỹ thuật cần tạo tiếp từ tài liệu này

1. **PRD chi tiết theo user story** (từng màn hình mục 9).
2. **ERD/database schema** đầy đủ (từ mục 5) + migration scripts.
3. **API specification** (OpenAPI — từ mục 6).
4. **UI wireframe/prototype** (Figma — từ mục 9).
5. **Sprint backlog** chi tiết (từ mục 16.3).
6. **Test plan + tiêu chí tải** (từ mục 16.6 + kickoff Q10).
7. **Kế hoạch migration kho câu hỏi hiện có** (sau kickoff Q8).

---

*Tài liệu này chuyển thể toàn bộ đặc tả nghiệp vụ trong "WEB học ôn các kỳ thi.docx" thành kế hoạch triển khai kỹ thuật. Mọi thay đổi nghiệp vụ cần cập nhật lại cả hai tài liệu và tăng version ở đầu file.*
