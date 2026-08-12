/**
 * Catalog — Program (kỳ thi) → Course (khóa) → Cohort (mùa) → Pricing
 * (specs §3.1, §3.2, §6 module 2, §11).
 *
 * Nguyên tắc: mọi kỳ thi chạy chung một luồng code. Thêm ASMOPSS/NEO/STEM/FMC/PAS…
 * chỉ là thêm bản ghi Program — tuyệt đối không rẽ nhánh theo `program.code`.
 */
import { Prisma } from '@prisma/client';
import type { Cohort, Course, GradeBand, Pricing, Program, Subject } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { ApiError } from '@/lib/http';
import { getConfig, type CommerceConfig } from '@/lib/config';
import { writeAudit } from '@/lib/audit';
import {
  GRADE_BANDS,
  GRADE_BAND_LABEL,
  SUBJECTS_BY_BAND,
  SUBJECT_LABEL,
  formatVnd,
} from '@/lib/domain';
import {
  listCoursesSchema,
  listProgramsSchema,
  programCodeSchema,
  upsertCohortSchema,
  upsertCourseSchema,
  upsertPricingSchema,
  upsertProgramSchema,
  type ListCoursesFilter,
  type ListProgramsOptions,
  type UpsertCohortInput,
  type UpsertCourseInput,
  type UpsertPricingInput,
  type UpsertProgramInput,
} from './schemas';

// ---------------------------------------------------------------------------
// Audit
// ---------------------------------------------------------------------------

const CATALOG_AUDIT = {
  PROGRAM_UPSERT: 'catalog.program_upsert',
  COURSE_UPSERT: 'catalog.course_upsert',
  PRICING_UPSERT: 'catalog.pricing_upsert',
  COHORT_UPSERT: 'catalog.cohort_upsert',
} as const;

// ---------------------------------------------------------------------------
// Kiểu dữ liệu trả về
// ---------------------------------------------------------------------------

export interface ProgramSummary {
  id: string;
  code: string;
  name: string;
  shortName: string | null;
  logoEmoji: string;
  colorHex: string;
  description: string;
  highlights: string[];
  season: string | null;
  active: boolean;
  order: number;
  courseCount: number;
  gradeBands: GradeBand[];
  subjects: Subject[];

  // --- Nội dung giới thiệu, dùng ở trang bán hàng trước khi thanh toán ---
  tagline: string | null;
  longDescription: string | null;
  introVideoUrl: string | null;
  introVideoPoster: string | null;
  sections: ContentSection[];
  faqs: ContentFaq[];
}

/** Một khối nội dung tự do do admin soạn. */
export interface ContentSection {
  title: string;
  body: string;
}

export interface ContentFaq {
  question: string;
  answer: string;
}

/** Một chặng trong nội dung khóa học. */
export interface SyllabusStep {
  title: string;
  detail: string;
}

export interface CourseSummary {
  id: string;
  programId: string;
  gradeBand: GradeBand;
  gradeBandLabel: string;
  subject: Subject;
  subjectLabel: string;
  name: string;
  description: string | null;
  active: boolean;

  // --- Nội dung giới thiệu riêng của khóa ---
  tagline: string | null;
  longDescription: string | null;
  introVideoUrl: string | null;
  outcomes: string[];
  syllabus: SyllabusStep[];
}

export interface EffectivePricing {
  price: number;
  currency: string;
  accessDurationDays: number;
  /** COURSE = bảng giá riêng của khóa, PROGRAM = giá chung kỳ thi, CONFIG = giá mặc định hệ thống. */
  source: 'COURSE' | 'PROGRAM' | 'CONFIG';
  pricingId: string | null;
  label: string;
  priceLabel: string;
}

export interface CohortSummary {
  id: string;
  programId: string;
  year: number;
  name: string;
  startDate: Date;
  endDate: Date;
  examDate: Date;
  active: boolean;
}

export interface ProgramDetail extends ProgramSummary {
  courses: Array<CourseSummary & { pricing: EffectivePricing }>;
  /** Khối → môn đang thực sự mở bán của kỳ thi này (specs §3.2). */
  availability: Array<{ gradeBand: GradeBand; gradeBandLabel: string; subjects: Subject[] }>;
  pricing: EffectivePricing;
  cohorts: CohortSummary[];
  activeCohort: CohortSummary | null;
  config: Prisma.JsonValue;
  warnings: string[];
}

export interface CourseDetail extends CourseSummary {
  createdAt: Date;
  updatedAt: Date;
  program: {
    id: string;
    code: string;
    name: string;
    shortName: string | null;
    logoEmoji: string;
    colorHex: string;
  };
  pricing: EffectivePricing;
  chapterCount: number;
  skillCount: number;
  /** Chỉ đếm câu đã PUBLISHED — đúng nguồn mà engine được phép dùng. */
  publishedItemCount: number;
  activeCohort: CohortSummary | null;
  warnings: string[];
}

export interface CatalogTreeBand {
  gradeBand: GradeBand;
  gradeBandLabel: string;
  courses: Array<CourseSummary & { price: number; currency: string }>;
}

export interface CatalogTreeProgram extends ProgramSummary {
  bands: CatalogTreeBand[];
  /** Giá thấp nhất trong các khóa của kỳ thi — hiển thị "từ …đ" ở trang chủ. */
  fromPrice: number;
  currency: string;
  examDate: Date | null;
}

// ---------------------------------------------------------------------------
// Tiện ích nội bộ
// ---------------------------------------------------------------------------

function toStringArray(value: Prisma.JsonValue): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((entry): entry is string => typeof entry === 'string');
}

/**
 * Đọc mảng JSON dạng [{ a, b }] về đúng kiểu, bỏ qua phần tử hỏng.
 *
 * Cột JSON không có ràng buộc cấu trúc ở tầng database, nên dữ liệu cũ hoặc do
 * nhập tay có thể lệch hình dạng. Lọc ở đây để mọi nơi dùng đều nhận đúng kiểu
 * và một phần tử hỏng không làm sập cả trang.
 */
function toPairArray<A extends string, B extends string>(
  value: Prisma.JsonValue,
  first: A,
  second: B,
): { [K in A | B]: string }[] {
  if (!Array.isArray(value)) return [];
  const out: { [K in A | B]: string }[] = [];
  for (const entry of value) {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) continue;
    const row = entry as Record<string, unknown>;
    const a = row[first];
    const b = row[second];
    if (typeof a !== 'string' || typeof b !== 'string') continue;
    if (a.trim() === '' && b.trim() === '') continue;
    out.push({ [first]: a, [second]: b } as { [K in A | B]: string });
  }
  return out;
}

function sortGradeBands(bands: Iterable<GradeBand>): GradeBand[] {
  const unique = new Set(bands);
  return GRADE_BANDS.filter((band) => unique.has(band));
}

/** Giữ thứ tự môn theo khối để danh sách hiển thị luôn ổn định. */
function sortSubjects(subjects: Iterable<Subject>): Subject[] {
  const unique = new Set(subjects);
  const ordered: Subject[] = [];
  for (const band of GRADE_BANDS) {
    for (const subject of SUBJECTS_BY_BAND[band]) {
      if (unique.has(subject) && !ordered.includes(subject)) ordered.push(subject);
    }
  }
  return ordered;
}

function toCourseSummary(course: Course): CourseSummary {
  return {
    id: course.id,
    programId: course.programId,
    gradeBand: course.gradeBand,
    gradeBandLabel: GRADE_BAND_LABEL[course.gradeBand],
    subject: course.subject,
    subjectLabel: SUBJECT_LABEL[course.subject],
    name: course.name,
    description: course.description,
    active: course.active,
    tagline: course.tagline,
    longDescription: course.longDescription,
    introVideoUrl: course.introVideoUrl,
    outcomes: toStringArray(course.outcomes),
    syllabus: toPairArray(course.syllabus, 'title', 'detail'),
  };
}

function toCohortSummary(cohort: Cohort): CohortSummary {
  return {
    id: cohort.id,
    programId: cohort.programId,
    year: cohort.year,
    name: cohort.name,
    startDate: cohort.startDate,
    endDate: cohort.endDate,
    examDate: cohort.examDate,
    active: cohort.active,
  };
}

function toProgramSummary(program: Program, courses: Course[]): ProgramSummary {
  return {
    id: program.id,
    code: program.code,
    name: program.name,
    shortName: program.shortName,
    logoEmoji: program.logoEmoji,
    colorHex: program.colorHex,
    description: program.description,
    highlights: toStringArray(program.highlights),
    season: program.season,
    active: program.active,
    order: program.order,
    courseCount: courses.length,
    gradeBands: sortGradeBands(courses.map((course) => course.gradeBand)),
    subjects: sortSubjects(courses.map((course) => course.subject)),
    tagline: program.tagline,
    longDescription: program.longDescription,
    introVideoUrl: program.introVideoUrl,
    introVideoPoster: program.introVideoPoster,
    sections: toPairArray(program.sections, 'title', 'body'),
    faqs: toPairArray(program.faqs, 'question', 'answer'),
  };
}

/** Bảng giá còn hiệu lực tại thời điểm `now`; bản tạo sau đè bản tạo trước. */
function pickValidPricing(rows: Pricing[], now: Date): Pricing | null {
  const valid = rows.filter(
    (row) =>
      row.active &&
      (row.validFrom === null || row.validFrom <= now) &&
      (row.validTo === null || row.validTo >= now),
  );
  if (valid.length === 0) return null;
  return valid.reduce((best, row) => (row.createdAt > best.createdAt ? row : best));
}

function toEffectivePricing(
  row: Pricing | null,
  source: 'COURSE' | 'PROGRAM',
  commerce: CommerceConfig,
): EffectivePricing {
  if (!row) {
    // Chưa cấu hình bảng giá → dùng giá mặc định trong config, KHÔNG viết số vào code (specs §11)
    return {
      price: commerce.defaultPrice,
      currency: commerce.currency,
      accessDurationDays: commerce.accessDurationDays,
      source: 'CONFIG',
      pricingId: null,
      label: 'Giá mặc định hệ thống',
      priceLabel: formatVnd(commerce.defaultPrice),
    };
  }
  return {
    price: row.price,
    currency: row.currency,
    accessDurationDays: row.accessDurationDays,
    source,
    pricingId: row.id,
    label: row.label,
    priceLabel: formatVnd(row.price),
  };
}

/** Thứ tự ưu tiên: giá riêng khóa → giá chung kỳ thi → giá mặc định trong config. */
function resolvePricing(
  courseRows: Pricing[],
  programRows: Pricing[],
  commerce: CommerceConfig,
  now: Date,
): EffectivePricing {
  const byCourse = pickValidPricing(courseRows, now);
  if (byCourse) return toEffectivePricing(byCourse, 'COURSE', commerce);

  const byProgram = pickValidPricing(programRows, now);
  if (byProgram) return toEffectivePricing(byProgram, 'PROGRAM', commerce);

  return toEffectivePricing(null, 'PROGRAM', commerce);
}

function groupPricings(rows: Pricing[]): {
  byCourse: Map<string, Pricing[]>;
  byProgram: Map<string, Pricing[]>;
} {
  const byCourse = new Map<string, Pricing[]>();
  const byProgram = new Map<string, Pricing[]>();
  for (const row of rows) {
    if (row.courseId) {
      const list = byCourse.get(row.courseId) ?? [];
      list.push(row);
      byCourse.set(row.courseId, list);
    } else if (row.programId) {
      const list = byProgram.get(row.programId) ?? [];
      list.push(row);
      byProgram.set(row.programId, list);
    }
  }
  return { byCourse, byProgram };
}

/** Mùa thi dùng cho engine: ưu tiên mùa có ngày thi gần nhất còn ở phía trước. */
function pickActiveCohort(cohorts: Cohort[], now: Date): Cohort | null {
  const active = cohorts.filter((cohort) => cohort.active);
  if (active.length === 0) return null;

  const upcoming = active
    .filter((cohort) => cohort.examDate >= now)
    .sort((a, b) => a.examDate.getTime() - b.examDate.getTime());
  if (upcoming.length > 0) return upcoming[0]!;

  // Không còn mùa nào phía trước → lấy mùa gần nhất đã diễn ra để vẫn có mốc tham chiếu
  return active.reduce((latest, cohort) => (cohort.examDate > latest.examDate ? cohort : latest));
}

async function requireProgram(programId: string): Promise<Program> {
  const program = await prisma.program.findUnique({ where: { id: programId } });
  if (!program) throw ApiError.notFound('Không tìm thấy kỳ thi.');
  return program;
}

// ---------------------------------------------------------------------------
// Đọc catalog
// ---------------------------------------------------------------------------

export async function listPrograms(options: ListProgramsOptions = {}): Promise<ProgramSummary[]> {
  const { includeInactive } = listProgramsSchema.parse(options);

  const programs = await prisma.program.findMany({
    where: includeInactive ? {} : { active: true },
    orderBy: [{ order: 'asc' }, { name: 'asc' }],
    include: {
      courses: {
        where: includeInactive ? {} : { active: true },
        orderBy: [{ gradeBand: 'asc' }, { subject: 'asc' }],
      },
    },
  });

  return programs.map((program) => toProgramSummary(program, program.courses));
}

export async function getProgramByCode(code: string): Promise<ProgramDetail> {
  const normalized = programCodeSchema.parse(code);

  const program = await prisma.program.findUnique({
    where: { code: normalized },
    include: {
      courses: { where: { active: true }, orderBy: [{ gradeBand: 'asc' }, { subject: 'asc' }] },
      cohorts: { orderBy: { year: 'desc' } },
      pricings: true,
    },
  });
  if (!program) throw ApiError.notFound('Không tìm thấy kỳ thi này.');

  const config = await getConfig();
  const now = new Date();

  const coursePricings = await prisma.pricing.findMany({
    where: { courseId: { in: program.courses.map((course) => course.id) } },
  });
  const { byCourse } = groupPricings(coursePricings);
  const programRows = program.pricings.filter((row) => row.courseId === null);

  const courses = program.courses.map((course) => ({
    ...toCourseSummary(course),
    pricing: resolvePricing(byCourse.get(course.id) ?? [], programRows, config.commerce, now),
  }));

  const availability = sortGradeBands(program.courses.map((course) => course.gradeBand)).map((band) => ({
    gradeBand: band,
    gradeBandLabel: GRADE_BAND_LABEL[band],
    subjects: sortSubjects(
      program.courses.filter((course) => course.gradeBand === band).map((course) => course.subject),
    ),
  }));

  const activeCohort = pickActiveCohort(program.cohorts, now);

  const warnings: string[] = [];
  if (courses.length === 0) warnings.push('Kỳ thi này chưa có khóa học nào đang mở.');
  if (!activeCohort) warnings.push('Kỳ thi này chưa khai báo mùa thi — engine sẽ không có ngày thi để tính ưu tiên.');

  return {
    ...toProgramSummary(program, program.courses),
    courses,
    availability,
    pricing: resolvePricing([], programRows, config.commerce, now),
    cohorts: program.cohorts.map(toCohortSummary),
    activeCohort: activeCohort ? toCohortSummary(activeCohort) : null,
    config: program.config,
    warnings,
  };
}

export async function listCourses(filter: ListCoursesFilter = {}): Promise<CourseSummary[]> {
  const { programId, gradeBand, subject, active } = listCoursesSchema.parse(filter);

  const courses = await prisma.course.findMany({
    where: {
      ...(programId ? { programId } : {}),
      ...(gradeBand ? { gradeBand } : {}),
      ...(subject ? { subject } : {}),
      active: active ?? true,
    },
    orderBy: [{ gradeBand: 'asc' }, { subject: 'asc' }, { name: 'asc' }],
  });

  return courses.map(toCourseSummary);
}

export async function getCourse(courseId: string): Promise<CourseDetail> {
  const course = await prisma.course.findUnique({
    where: { id: courseId },
    include: { program: { include: { cohorts: true } } },
  });
  if (!course) throw ApiError.notFound('Không tìm thấy khóa học.');

  const config = await getConfig();
  const now = new Date();

  const [pricingRows, chapterCount, skillCount, publishedItemCount] = await Promise.all([
    prisma.pricing.findMany({
      where: { OR: [{ courseId: course.id }, { programId: course.programId, courseId: null }] },
    }),
    prisma.chapter.count({ where: { subject: course.subject, gradeBand: course.gradeBand } }),
    prisma.skill.count({
      where: { chapter: { subject: course.subject, gradeBand: course.gradeBand } },
    }),
    // Chỉ câu PUBLISHED mới được engine/AI dùng; programScope rỗng = dùng chung mọi kỳ thi
    prisma.questionItem.count({
      where: {
        status: 'PUBLISHED',
        subject: course.subject,
        gradeBand: course.gradeBand,
        OR: [{ programScope: { isEmpty: true } }, { programScope: { has: course.program.code } }],
      },
    }),
  ]);

  const pricing = resolvePricing(
    pricingRows.filter((row) => row.courseId === course.id),
    pricingRows.filter((row) => row.courseId === null && row.programId === course.programId),
    config.commerce,
    now,
  );

  const activeCohort = pickActiveCohort(course.program.cohorts, now);

  const warnings: string[] = [];
  if (chapterCount === 0 || skillCount === 0) {
    warnings.push(
      `Chưa có chương/kỹ năng cho ${SUBJECT_LABEL[course.subject]} – ${GRADE_BAND_LABEL[course.gradeBand]}.`,
    );
  }
  if (publishedItemCount < config.assessment.diagnosticItemCount) {
    warnings.push(
      `Kho câu hỏi đã xuất bản chỉ có ${publishedItemCount} câu, chưa đủ ${config.assessment.diagnosticItemCount} câu cho bài kiểm tra đầu vào.`,
    );
  }
  if (pricing.source === 'CONFIG') {
    warnings.push('Khóa học chưa có bảng giá riêng, đang áp dụng giá mặc định của hệ thống.');
  }
  if (!activeCohort) {
    warnings.push('Kỳ thi chưa khai báo mùa thi — engine sẽ không có ngày thi để tính ưu tiên.');
  }

  return {
    ...toCourseSummary(course),
    createdAt: course.createdAt,
    updatedAt: course.updatedAt,
    program: {
      id: course.program.id,
      code: course.program.code,
      name: course.program.name,
      shortName: course.program.shortName,
      logoEmoji: course.program.logoEmoji,
      colorHex: course.program.colorHex,
    },
    pricing,
    chapterCount,
    skillCount,
    publishedItemCount,
    activeCohort: activeCohort ? toCohortSummary(activeCohort) : null,
    warnings,
  };
}

export async function getEffectivePricing(courseId: string): Promise<EffectivePricing> {
  const course = await prisma.course.findUnique({
    where: { id: courseId },
    select: { id: true, programId: true },
  });
  if (!course) throw ApiError.notFound('Không tìm thấy khóa học.');

  const [config, rows] = await Promise.all([
    getConfig(),
    prisma.pricing.findMany({
      where: { OR: [{ courseId: course.id }, { programId: course.programId, courseId: null }] },
    }),
  ]);

  return resolvePricing(
    rows.filter((row) => row.courseId === course.id),
    rows.filter((row) => row.courseId === null && row.programId === course.programId),
    config.commerce,
    new Date(),
  );
}

export async function getActiveCohort(programId: string): Promise<CohortSummary | null> {
  const cohorts = await prisma.cohort.findMany({ where: { programId, active: true } });
  const picked = pickActiveCohort(cohorts, new Date());
  return picked ? toCohortSummary(picked) : null;
}

export async function listCohorts(programId: string): Promise<CohortSummary[]> {
  const cohorts = await prisma.cohort.findMany({
    where: { programId },
    orderBy: { year: 'desc' },
  });
  return cohorts.map(toCohortSummary);
}

export async function getCatalogTree(): Promise<CatalogTreeProgram[]> {
  const [config, programs, pricings] = await Promise.all([
    getConfig(),
    prisma.program.findMany({
      where: { active: true },
      orderBy: [{ order: 'asc' }, { name: 'asc' }],
      include: {
        courses: { where: { active: true }, orderBy: [{ gradeBand: 'asc' }, { subject: 'asc' }] },
        cohorts: { where: { active: true } },
      },
    }),
    prisma.pricing.findMany({ where: { active: true } }),
  ]);

  const now = new Date();
  const { byCourse, byProgram } = groupPricings(pricings);

  return programs.map((program) => {
    const programRows = byProgram.get(program.id) ?? [];

    const bands: CatalogTreeBand[] = sortGradeBands(program.courses.map((course) => course.gradeBand)).map(
      (band) => ({
        gradeBand: band,
        gradeBandLabel: GRADE_BAND_LABEL[band],
        courses: program.courses
          .filter((course) => course.gradeBand === band)
          .map((course) => {
            const pricing = resolvePricing(
              byCourse.get(course.id) ?? [],
              programRows,
              config.commerce,
              now,
            );
            return { ...toCourseSummary(course), price: pricing.price, currency: pricing.currency };
          }),
      }),
    );

    const prices = bands.flatMap((band) => band.courses.map((course) => course.price));
    const activeCohort = pickActiveCohort(program.cohorts, now);

    return {
      ...toProgramSummary(program, program.courses),
      bands,
      fromPrice: prices.length > 0 ? Math.min(...prices) : config.commerce.defaultPrice,
      currency: config.commerce.currency,
      examDate: activeCohort?.examDate ?? null,
    };
  });
}

// ---------------------------------------------------------------------------
// Ghi catalog (admin / program manager)
// ---------------------------------------------------------------------------

export async function upsertProgram(input: UpsertProgramInput, actorId: string): Promise<Program> {
  const data = upsertProgramSchema.parse(input);

  const existing = data.id
    ? await prisma.program.findUnique({ where: { id: data.id } })
    : await prisma.program.findUnique({ where: { code: data.code } });

  if (data.id && !existing) throw ApiError.notFound('Không tìm thấy kỳ thi cần cập nhật.');

  // Mã kỳ thi là khóa tra cứu công khai, không cho trùng sang bản ghi khác
  if (existing && existing.code !== data.code) {
    const duplicated = await prisma.program.findUnique({ where: { code: data.code } });
    if (duplicated && duplicated.id !== existing.id) {
      throw ApiError.conflict(`Mã kỳ thi ${data.code} đã tồn tại.`);
    }
  }

  const payload = {
    code: data.code,
    name: data.name,
    shortName: data.shortName ?? null,
    logoEmoji: data.logoEmoji,
    colorHex: data.colorHex,
    description: data.description,
    highlights: (data.highlights ?? undefined) as Prisma.InputJsonValue | undefined,
    season: data.season ?? null,
    active: data.active,
    order: data.order,
    config: (data.config ?? undefined) as Prisma.InputJsonValue | undefined,
    tagline: data.tagline ?? null,
    longDescription: data.longDescription ?? null,
    introVideoUrl: data.introVideoUrl ?? null,
    introVideoPoster: data.introVideoPoster ?? null,
    sections: (data.sections ?? undefined) as Prisma.InputJsonValue | undefined,
    faqs: (data.faqs ?? undefined) as Prisma.InputJsonValue | undefined,
  };

  const saved = existing
    ? await prisma.program.update({ where: { id: existing.id }, data: payload })
    : await prisma.program.create({ data: { ...payload, description: data.description } });

  await writeAudit({
    actorId,
    action: CATALOG_AUDIT.PROGRAM_UPSERT,
    entityType: 'Program',
    entityId: saved.id,
    before: existing ?? undefined,
    after: saved,
  });

  return saved;
}

export async function upsertCourse(input: UpsertCourseInput, actorId: string): Promise<Course> {
  const data = upsertCourseSchema.parse(input);

  await requireProgram(data.programId);

  // Môn phải hợp lệ với khối theo bảng specs §3.2 (VD: Vật lý chỉ có ở khối D)
  if (!SUBJECTS_BY_BAND[data.gradeBand].includes(data.subject)) {
    throw ApiError.badRequest(
      `${SUBJECT_LABEL[data.subject]} không áp dụng cho ${GRADE_BAND_LABEL[data.gradeBand]}.`,
    );
  }

  const existing = data.id
    ? await prisma.course.findUnique({ where: { id: data.id } })
    : await prisma.course.findUnique({
        where: {
          programId_gradeBand_subject: {
            programId: data.programId,
            gradeBand: data.gradeBand,
            subject: data.subject,
          },
        },
      });

  if (data.id && !existing) throw ApiError.notFound('Không tìm thấy khóa học cần cập nhật.');

  const payload = {
    programId: data.programId,
    gradeBand: data.gradeBand,
    subject: data.subject,
    name: data.name,
    description: data.description ?? null,
    active: data.active,
    tagline: data.tagline ?? null,
    longDescription: data.longDescription ?? null,
    introVideoUrl: data.introVideoUrl ?? null,
    outcomes: (data.outcomes ?? undefined) as Prisma.InputJsonValue | undefined,
    syllabus: (data.syllabus ?? undefined) as Prisma.InputJsonValue | undefined,
  };

  let saved: Course;
  try {
    saved = existing
      ? await prisma.course.update({ where: { id: existing.id }, data: payload })
      : await prisma.course.create({ data: payload });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      throw ApiError.conflict('Kỳ thi này đã có khóa cho đúng khối và môn đó.');
    }
    throw error;
  }

  await writeAudit({
    actorId,
    action: CATALOG_AUDIT.COURSE_UPSERT,
    entityType: 'Course',
    entityId: saved.id,
    before: existing ?? undefined,
    after: saved,
  });

  return saved;
}

export async function upsertPricing(input: UpsertPricingInput, actorId: string): Promise<Pricing> {
  const data = upsertPricingSchema.parse(input);

  if (data.courseId) {
    const course = await prisma.course.findUnique({ where: { id: data.courseId }, select: { id: true } });
    if (!course) throw ApiError.notFound('Không tìm thấy khóa học để gắn bảng giá.');
  }
  if (data.programId) await requireProgram(data.programId);

  const existing = data.id ? await prisma.pricing.findUnique({ where: { id: data.id } }) : null;
  if (data.id && !existing) throw ApiError.notFound('Không tìm thấy bảng giá cần cập nhật.');

  const payload = {
    programId: data.programId ?? null,
    courseId: data.courseId ?? null,
    label: data.label,
    price: data.price,
    currency: data.currency,
    accessDurationDays: data.accessDurationDays,
    validFrom: data.validFrom ?? null,
    validTo: data.validTo ?? null,
    active: data.active,
  };

  const saved = existing
    ? await prisma.pricing.update({ where: { id: existing.id }, data: payload })
    : await prisma.pricing.create({ data: { ...payload, price: data.price } });

  await writeAudit({
    actorId,
    action: CATALOG_AUDIT.PRICING_UPSERT,
    entityType: 'Pricing',
    entityId: saved.id,
    before: existing ?? undefined,
    after: saved,
  });

  return saved;
}

export async function upsertCohort(input: UpsertCohortInput, actorId: string): Promise<CohortSummary> {
  const data = upsertCohortSchema.parse(input);

  await requireProgram(data.programId);

  const existing = data.id
    ? await prisma.cohort.findUnique({ where: { id: data.id } })
    : await prisma.cohort.findUnique({
        where: { programId_year: { programId: data.programId, year: data.year } },
      });

  if (data.id && !existing) throw ApiError.notFound('Không tìm thấy mùa thi cần cập nhật.');

  const payload = {
    programId: data.programId,
    year: data.year,
    name: data.name,
    startDate: data.startDate,
    endDate: data.endDate,
    examDate: data.examDate,
    active: data.active,
  };

  let saved: Cohort;
  try {
    saved = existing
      ? await prisma.cohort.update({ where: { id: existing.id }, data: payload })
      : await prisma.cohort.create({ data: payload });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      throw ApiError.conflict(`Kỳ thi này đã có mùa ${data.year}.`);
    }
    throw error;
  }

  await writeAudit({
    actorId,
    action: CATALOG_AUDIT.COHORT_UPSERT,
    entityType: 'Cohort',
    entityId: saved.id,
    before: existing ?? undefined,
    after: saved,
  });

  return toCohortSummary(saved);
}
