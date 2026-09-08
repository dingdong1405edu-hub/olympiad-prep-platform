/**
 * SƠ ĐỒ ĐƯỜNG DẪN CỦA TOÀN HỆ THỐNG.
 *
 * Mọi liên kết trong giao diện phải gọi hàm ở đây thay vì viết chuỗi tay —
 * đổi cấu trúc URL chỉ cần sửa một chỗ.
 */

export const routes = {
  // --- Công khai ---
  home: () => '/',
  programs: () => '/ky-thi',
  program: (code: string) => `/ky-thi/${code.toLowerCase()}`,
  /** Danh mục khóa học; bộ lọc đi qua query string để chia sẻ được đường dẫn. */
  courses: (filter?: { programCode?: string; gradeBand?: string; subject?: string }) => {
    const query = new URLSearchParams();
    if (filter?.programCode) query.set('ky_thi', filter.programCode.toUpperCase());
    if (filter?.gradeBand) query.set('khoi', filter.gradeBand.toUpperCase());
    if (filter?.subject) query.set('mon', filter.subject.toUpperCase());
    const search = query.toString();
    return search ? `/khoa-hoc?${search}` : '/khoa-hoc';
  },
  /** Trang giới thiệu một khóa — khách xem nội dung và video TRƯỚC khi trả tiền. */
  course: (courseId: string) => `/khoa-hoc/${courseId}`,
  register: (next?: string) => (next ? `/dang-ky?next=${encodeURIComponent(next)}` : '/dang-ky'),
  login: (next?: string) => (next ? `/dang-nhap?next=${encodeURIComponent(next)}` : '/dang-nhap'),
  forgotPassword: () => '/quen-mat-khau',
  /** Trang xác nhận sau khi thoát — nơi API đăng xuất chuyển hướng tới. */
  loggedOut: () => '/dang-xuat',

  // --- Thi thử chấm bằng AI ---
  /** Giới thiệu + danh sách đề: ai cũng xem được. */
  mockExams: () => '/thi-thu',
  /** Giới thiệu một đề + nút bắt đầu: xem được khi chưa đăng nhập. */
  mockExam: (slug: string) => `/thi-thu/${slug}`,
  /** Màn hình làm bài của MỘT lượt thi cụ thể — chỉ chủ lượt thi vào được. */
  mockExamSitting: (slug: string, attemptId: string) => `/thi-thu/${slug}/lam-bai/${attemptId}`,
  mockExamResult: (slug: string, attemptId: string) => `/thi-thu/${slug}/ket-qua/${attemptId}`,

  // --- Thanh toán ---
  checkout: (courseId: string) => `/thanh-toan/${courseId}`,
  checkoutResult: (orderCode: string) => `/thanh-toan/ket-qua/${orderCode}`,

  // --- Học sinh ---
  myCourses: () => '/hoc-tap',
  studyDashboard: (enrollmentId: string) => `/hoc-tap/${enrollmentId}`,
  onboarding: (enrollmentId: string) => `/hoc-tap/${enrollmentId}/khoi-dong`,
  diagnostic: (enrollmentId: string) => `/hoc-tap/${enrollmentId}/kiem-tra-dau-vao`,
  assessmentPlayer: (enrollmentId: string, attemptId: string) =>
    `/hoc-tap/${enrollmentId}/bai-kiem-tra/${attemptId}`,
  attemptResult: (enrollmentId: string, attemptId: string) =>
    `/hoc-tap/${enrollmentId}/ket-qua/${attemptId}`,
  goalBuilder: (enrollmentId: string) => `/hoc-tap/${enrollmentId}/muc-tieu`,
  practice: (enrollmentId: string, planDayId: string) =>
    `/hoc-tap/${enrollmentId}/luyen-tap/${planDayId}`,
  skillMap: (enrollmentId: string) => `/hoc-tap/${enrollmentId}/ban-do-ky-nang`,
  assessments: (enrollmentId: string) => `/hoc-tap/${enrollmentId}/danh-gia`,
  teacherSessions: (enrollmentId: string) => `/hoc-tap/${enrollmentId}/buoi-tu-van`,
  account: () => '/tai-khoan',

  // --- Giáo viên ---
  teacherHome: () => '/giao-vien',
  teacherStudent: (enrollmentId: string) => `/giao-vien/hoc-sinh/${enrollmentId}`,
  teacherSession: (sessionId: string) => `/giao-vien/buoi-tu-van/${sessionId}`,
  teacherMockExams: () => '/giao-vien/thi-thu',
  teacherMockAttempt: (attemptId: string) => `/giao-vien/thi-thu/${attemptId}`,

  // --- Quản trị ---
  adminHome: () => '/quan-tri',
  adminPrograms: () => '/quan-tri/chuong-trinh',
  adminContent: () => '/quan-tri/hoc-lieu',
  adminContentItem: (itemId: string) => `/quan-tri/hoc-lieu/${itemId}`,
  adminContentNew: () => '/quan-tri/hoc-lieu/tao-moi',
  adminContentImport: () => '/quan-tri/hoc-lieu/nhap-lieu',
  adminContentCoverage: () => '/quan-tri/hoc-lieu/do-phu',
  adminTaxonomy: () => '/quan-tri/hoc-lieu/cay-kien-thuc',
  adminSiteCopy: () => '/quan-tri/giao-dien',
  adminUsers: () => '/quan-tri/nguoi-dung',
  adminPayments: () => '/quan-tri/thanh-toan',
  adminTeachers: () => '/quan-tri/giao-vien',
  adminReports: () => '/quan-tri/bao-cao',
  adminConfig: () => '/quan-tri/cau-hinh',
  adminAudit: () => '/quan-tri/nhat-ky',
  adminMockExams: () => '/quan-tri/thi-thu',
  adminMockAttempt: (attemptId: string) => `/quan-tri/thi-thu/${attemptId}`,
} as const;

/** Tiền tố các khu vực cần đăng nhập — dùng bởi middleware. */
export const PROTECTED_PREFIXES = {
  student: ['/hoc-tap', '/tai-khoan', '/thanh-toan'],
  teacher: ['/giao-vien'],
  admin: ['/quan-tri'],
} as const;

export const API = {
  base: '/api/v1',

  // Auth
  register: '/api/v1/auth/register',
  login: '/api/v1/auth/login',
  logout: '/api/v1/auth/logout',
  me: '/api/v1/auth/me',
  forgotPassword: '/api/v1/auth/forgot-password',
  resetPassword: '/api/v1/auth/reset-password',

  // Catalog & commerce
  programs: '/api/v1/programs',
  courses: '/api/v1/courses',
  checkoutPreview: '/api/v1/checkout/preview',
  checkout: '/api/v1/checkout',
  confirmMockPayment: '/api/v1/checkout/confirm',
  /** Trạng thái đơn + đối soát với cổng; `doi_soat=0` để chỉ đọc dữ liệu nội bộ. */
  paymentStatus: (orderCode: string, reconcile = true) =>
    `/api/v1/payments/${encodeURIComponent(orderCode)}${reconcile ? '' : '?doi_soat=0'}`,
  cancelPayment: (orderCode: string) => `/api/v1/payments/${encodeURIComponent(orderCode)}/cancel`,

  // Học tập
  enrollments: '/api/v1/enrollments',
  onboarding: (enrollmentId: string) => `/api/v1/enrollments/${enrollmentId}/onboarding`,
  diagnosticStart: (enrollmentId: string) => `/api/v1/enrollments/${enrollmentId}/diagnostic`,
  progressStart: (enrollmentId: string) => `/api/v1/enrollments/${enrollmentId}/progress-assessment`,
  assessmentStatus: (enrollmentId: string) => `/api/v1/enrollments/${enrollmentId}/assessment-status`,
  attempt: (attemptId: string) => `/api/v1/attempts/${attemptId}`,
  attemptAutosave: (attemptId: string) => `/api/v1/attempts/${attemptId}/autosave`,
  attemptSubmit: (attemptId: string) => `/api/v1/attempts/${attemptId}/submit`,
  attemptReport: (attemptId: string) => `/api/v1/attempts/${attemptId}/report`,

  goalOptions: (enrollmentId: string) => `/api/v1/enrollments/${enrollmentId}/goal-options`,
  goals: (enrollmentId: string) => `/api/v1/enrollments/${enrollmentId}/goals`,
  plan: (enrollmentId: string) => `/api/v1/enrollments/${enrollmentId}/plan`,
  today: (enrollmentId: string) => `/api/v1/enrollments/${enrollmentId}/today`,
  reschedule: (enrollmentId: string) => `/api/v1/enrollments/${enrollmentId}/plan/reschedule`,
  masteryMap: (enrollmentId: string) => `/api/v1/enrollments/${enrollmentId}/mastery`,

  planDayStart: (planDayId: string) => `/api/v1/plan-days/${planDayId}/start`,
  planDayNext: (planDayId: string) => `/api/v1/plan-days/${planDayId}/next`,
  answer: '/api/v1/practice/answer',
  hint: (planDayItemId: string) => `/api/v1/practice/${planDayItemId}/hint`,
  solution: (planDayItemId: string) => `/api/v1/practice/${planDayItemId}/solution`,
  whyThisItem: (planDayItemId: string) => `/api/v1/practice/${planDayItemId}/why`,
  reportItem: '/api/v1/practice/report',

  // Thi thử chấm bằng AI
  exams: '/api/v1/exams',
  exam: (slug: string) => `/api/v1/exams/${encodeURIComponent(slug)}`,
  uploads: '/api/v1/uploads',
  /** Bắt đầu (hoặc vào tiếp) một lượt thi — cần đăng nhập. */
  mockStart: (slug: string) => `/api/v1/exams/${encodeURIComponent(slug)}/start`,
  /** Tự lưu bản nháp của lượt đang làm. */
  mockDraft: (attemptId: string) => `/api/v1/exam-attempts/${attemptId}/draft`,
  mockSubmit: (attemptId: string) => `/api/v1/exam-attempts/${attemptId}/submit`,
  mockAttempt: (attemptId: string) => `/api/v1/exam-attempts/${attemptId}`,
  /** `docLai = true` khi học sinh báo AI đọc sai chữ: bỏ transcript cũ, đọc ảnh lại. */
  mockGrade: (attemptId: string, docLai = false) =>
    `/api/v1/exam-attempts/${attemptId}/grade${docLai ? '?doc_lai=1' : ''}`,
  mockAnswer: (attemptId: string, answerId: string) =>
    `/api/v1/exam-attempts/${attemptId}/answers/${answerId}`,

  // AI
  aiDiagnosticComment: (attemptId: string) => `/api/v1/ai/diagnostic-comment/${attemptId}`,
  aiProgressReport: (attemptId: string) => `/api/v1/ai/progress-report/${attemptId}`,
  aiTeacherBrief: (sessionId: string) => `/api/v1/ai/teacher-brief/${sessionId}`,
  aiExplain: (itemId: string) => `/api/v1/ai/explain/${itemId}`,

  // Giáo viên
  teacherStudents: '/api/v1/teacher/students',
  teacherAlerts: '/api/v1/teacher/alerts',
  teacherDossier: (enrollmentId: string) => `/api/v1/teacher/students/${enrollmentId}`,
  teacherSessions: '/api/v1/teacher/sessions',
  teacherSession: (sessionId: string) => `/api/v1/teacher/sessions/${sessionId}`,
  teacherSessionNotes: (sessionId: string) => `/api/v1/teacher/sessions/${sessionId}/notes`,

  // Quản trị
  adminItems: '/api/v1/admin/items',
  adminItem: (id: string) => `/api/v1/admin/items/${id}`,
  adminItemStatus: (id: string) => `/api/v1/admin/items/${id}/status`,
  adminItemsImport: '/api/v1/admin/items/import',
  adminItemsTemplate: '/api/v1/admin/items/import/template',
  adminCoverage: '/api/v1/admin/content/coverage',
  adminChapters: '/api/v1/admin/chapters',
  adminSkills: '/api/v1/admin/skills',
  adminFlags: '/api/v1/admin/flags',
  adminUsers: '/api/v1/admin/users',
  adminEnrollments: '/api/v1/admin/enrollments',
  adminPayments: '/api/v1/admin/payments',
  adminTeacherWorkload: '/api/v1/admin/teachers/workload',
  adminConfig: '/api/v1/admin/config',
  adminSiteCopy: '/api/v1/admin/site-copy',
  adminSiteAssets: '/api/v1/admin/site-assets',
  adminSiteAsset: (slot: string) => `/api/v1/admin/site-assets/${encodeURIComponent(slot)}`,
  adminAnalytics: '/api/v1/admin/analytics',
  adminAudit: '/api/v1/admin/audit',
  adminPrograms: '/api/v1/admin/programs',
  adminCourses: '/api/v1/admin/courses',
  adminPricing: '/api/v1/admin/pricing',
  adminCoupons: '/api/v1/admin/coupons',

  // Khác
  events: '/api/v1/events',
  notifications: '/api/v1/notifications',
  changePassword: '/api/v1/auth/change-password',
} as const;
