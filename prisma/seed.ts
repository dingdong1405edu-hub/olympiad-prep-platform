/**
 * NẠP DỮ LIỆU MẪU CHO TOÀN HỆ THỐNG.
 *
 *   npx tsx prisma/seed.ts      (hoặc: npm run db:seed)
 *
 * NGUYÊN TẮC:
 *  - CHẠY LẠI NHIỀU LẦN KHÔNG NHÂN ĐÔI DỮ LIỆU: mọi thao tác ghi đều đi qua
 *    `upsert` theo khóa duy nhất, hoặc `createMany({ skipDuplicates: true })`.
 *  - KIỂM TRA TRƯỚC KHI GHI: taxonomy sai hoặc thiếu bộ sinh câu hỏi thì dừng
 *    ngay, không ghi nửa vời vào DB.
 *  - Không hard-code con số nghiệp vụ: giá / thời hạn / số câu lấy từ
 *    `seed-data/catalog.ts` và `DEFAULT_CONFIG` (Phụ lục B specs).
 */
import { pathToFileURL } from 'node:url';
import bcrypt from 'bcryptjs';
import {
  PrismaClient,
  type Difficulty,
  type EnrollmentSource,
  type GradeBand,
  type Prisma,
  type Role,
  type StudentLevel,
  type Subject,
} from '@prisma/client';

import {
  COHORT_END,
  COHORT_EXAM,
  COHORT_START,
  COHORT_YEAR,
  COUPONS,
  DEFAULT_ACCESS_DAYS,
  DEFAULT_PRICE,
  PRICING_LABEL,
  PROGRAMS,
  buildCourses,
  gradeBandOf,
} from './seed-data/catalog';
import {
  TAXONOMIES,
  flatSkills,
  fullSkillCode,
  validateTaxonomy,
  type TaxonomySeed,
} from './seed-data/taxonomy';
import { generateItems, splitReadyTaxonomies } from './seed-data/generators-all';
import { CONFIG_GROUP_META, DEFAULT_CONFIG } from '../src/lib/config/defaults';
import type { BlueprintSpec } from '../src/engine/types';

const prisma = new PrismaClient({ log: ['error'] });

/** Mật khẩu chung của mọi tài khoản mẫu. */
const SEED_PASSWORD = process.env.SEED_DEFAULT_PASSWORD ?? 'Olympiad@123';

/** Mốc xuất bản CỐ ĐỊNH để chạy lại nhiều lần vẫn ra dữ liệu giống hệt. */
const PUBLISHED_AT = new Date('2026-01-15T00:00:00.000Z');

/** Số bản ghi mỗi lô `createMany` cho ngân hàng câu hỏi. */
const ITEM_BATCH = 1000;

/** Số truy vấn chạy song song — giữ dưới kích thước connection pool mặc định. */
const CONCURRENCY = 10;

// ===========================================================================
// TIỆN ÍCH
// ===========================================================================

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

/** Chạy `fn` theo từng lô song song để rút ngắn thời gian nạp. */
async function mapBatched<T, R>(items: T[], fn: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = [];
  for (const batch of chunk(items, CONCURRENCY)) {
    out.push(...(await Promise.all(batch.map(fn))));
  }
  return out;
}

function addDays(from: Date, days: number): Date {
  const d = new Date(from);
  d.setDate(d.getDate() + days);
  return d;
}

function num(value: number): string {
  return value.toLocaleString('vi-VN');
}

function step(no: number, title: string): void {
  console.log(`\n[${no}] ${title}`);
}

function done(message: string): void {
  console.log(`    ✓ ${message}`);
}

// ===========================================================================
// BƯỚC 1 — KIỂM TRA TRƯỚC KHI GHI
// ===========================================================================

/**
 * Bắt lỗi dữ liệu nguồn TRƯỚC khi chạm vào DB: mã trùng, prerequisite treo,
 * chu trình tiên quyết, thiếu bộ sinh câu hỏi.
 */
function preflight(): string[] {
  const errors: string[] = [];
  const seenPairs = new Set<string>();
  const seenPrefixes = new Set<string>();
  const seenSkillCodes = new Set<string>();

  for (const tax of TAXONOMIES) {
    const pair = `${tax.subject}/${tax.gradeBand}`;
    if (seenPairs.has(pair)) errors.push(`Có hai taxonomy cho cùng (môn, khối) ${pair}`);
    seenPairs.add(pair);

    if (seenPrefixes.has(tax.prefix)) errors.push(`Trùng tiền tố mã taxonomy: ${tax.prefix}`);
    seenPrefixes.add(tax.prefix);

    for (const err of validateTaxonomy(tax)) errors.push(`[${tax.prefix}] ${err}`);

    // Skill.code là UNIQUE TOÀN CỤC trong DB → phải kiểm tra mã đầy đủ, không chỉ mã ngắn
    for (const { skill } of flatSkills(tax)) {
      const full = fullSkillCode(tax, skill.code);
      if (seenSkillCodes.has(full)) errors.push(`Trùng mã kỹ năng toàn cục: ${full}`);
      seenSkillCodes.add(full);
    }
  }

  // Thiếu bộ sinh KHÔNG còn là lỗi chặn: đặc tả §16.0 yêu cầu chạy trọn vòng một
  // môn/khối trước rồi mới mở rộng. Seed nạp những taxonomy đã đủ bộ sinh và in
  // rõ phần còn lại — thiếu sót được nhìn thấy chứ không bị nuốt im lặng.
  return errors;
}

// ===========================================================================
// BƯỚC 2 — CATALOG: CHƯƠNG TRÌNH, MÙA THI, KHÓA HỌC, GIÁ, MÃ GIẢM GIÁ
// ===========================================================================

interface CatalogResult {
  programIdByCode: Map<string, string>;
  cohortIdByProgram: Map<string, string>;
  /** Khóa `${programCode}|${gradeBand}|${subject}` → id khóa học. */
  courseIdByKey: Map<string, string>;
  courseCount: number;
}

function courseKey(programCode: string, gradeBand: GradeBand, subject: Subject): string {
  return `${programCode}|${gradeBand}|${subject}`;
}

async function seedCatalog(): Promise<CatalogResult> {
  const programIdByCode = new Map<string, string>();
  for (const p of PROGRAMS) {
    const row = await prisma.program.upsert({
      where: { code: p.code },
      create: {
        code: p.code,
        name: p.name,
        shortName: p.shortName,
        logoEmoji: p.logoEmoji,
        colorHex: p.colorHex,
        description: p.description,
        highlights: p.highlights as Prisma.InputJsonValue,
        season: p.season,
        active: p.active,
        order: p.order,
      },
      update: {
        name: p.name,
        shortName: p.shortName,
        logoEmoji: p.logoEmoji,
        colorHex: p.colorHex,
        description: p.description,
        highlights: p.highlights as Prisma.InputJsonValue,
        season: p.season,
        active: p.active,
        order: p.order,
      },
    });
    programIdByCode.set(p.code, row.id);
  }
  done(`${PROGRAMS.length} chương trình (kỳ thi)`);

  // Mùa thi chỉ mở cho chương trình đang bật; chương trình tắt vẫn giữ nguyên dữ liệu.
  const cohortIdByProgram = new Map<string, string>();
  for (const p of PROGRAMS) {
    if (!p.active) continue;
    const programId = programIdByCode.get(p.code);
    if (!programId) continue;
    const cohort = await prisma.cohort.upsert({
      where: { programId_year: { programId, year: COHORT_YEAR } },
      create: {
        programId,
        year: COHORT_YEAR,
        name: `${p.shortName} mùa ${COHORT_YEAR}`,
        startDate: COHORT_START,
        endDate: COHORT_END,
        examDate: COHORT_EXAM,
        active: true,
      },
      update: {
        name: `${p.shortName} mùa ${COHORT_YEAR}`,
        startDate: COHORT_START,
        endDate: COHORT_END,
        examDate: COHORT_EXAM,
        active: true,
      },
    });
    cohortIdByProgram.set(p.code, cohort.id);
  }
  done(`${cohortIdByProgram.size} mùa thi ${COHORT_YEAR}`);

  const courses = buildCourses();
  const courseIdByKey = new Map<string, string>();
  await mapBatched(courses, async (c) => {
    const programId = programIdByCode.get(c.programCode);
    if (!programId) throw new Error(`Không tìm thấy chương trình ${c.programCode}`);
    const row = await prisma.course.upsert({
      where: {
        programId_gradeBand_subject: {
          programId,
          gradeBand: c.gradeBand,
          subject: c.subject,
        },
      },
      create: {
        programId,
        gradeBand: c.gradeBand,
        subject: c.subject,
        name: c.name,
        description: c.description,
        active: true,
      },
      update: { name: c.name, description: c.description, active: true },
    });
    courseIdByKey.set(courseKey(c.programCode, c.gradeBand, c.subject), row.id);
  });
  done(`${courses.length} khóa học (chương trình × khối × môn)`);

  // Pricing KHÔNG có khóa duy nhất trong schema → tự dò theo (courseId, label) để
  // chạy lại không tạo thêm bảng giá trùng.
  let pricingCreated = 0;
  await mapBatched([...courseIdByKey.values()], async (courseId) => {
    const existing = await prisma.pricing.findFirst({ where: { courseId, label: PRICING_LABEL } });
    const data = {
      label: PRICING_LABEL,
      price: DEFAULT_PRICE,
      currency: DEFAULT_CONFIG.commerce.currency,
      accessDurationDays: DEFAULT_ACCESS_DAYS,
      active: true,
    };
    if (existing) {
      await prisma.pricing.update({ where: { id: existing.id }, data });
    } else {
      // validFrom / validTo để trống = luôn hiệu lực, tránh khóa nhầm luồng mua hàng.
      await prisma.pricing.create({ data: { ...data, courseId } });
      pricingCreated += 1;
    }
  });
  done(`${courseIdByKey.size} bảng giá (${num(DEFAULT_PRICE)}đ / ${DEFAULT_ACCESS_DAYS} ngày), mới tạo ${pricingCreated}`);

  for (const c of COUPONS) {
    await prisma.coupon.upsert({
      where: { code: c.code },
      create: {
        code: c.code,
        type: c.type,
        value: c.value,
        maxUses: c.maxUses,
        expiresAt: COHORT_END,
        active: true,
      },
      // KHÔNG đụng `usedCount`: đó là số liệu vận hành thật.
      update: { type: c.type, value: c.value, maxUses: c.maxUses, expiresAt: COHORT_END, active: true },
    });
  }
  done(`${COUPONS.length} mã giảm giá`);

  return { programIdByCode, cohortIdByProgram, courseIdByKey, courseCount: courses.length };
}

// ===========================================================================
// BƯỚC 3 — TAXONOMY: CHƯƠNG & KỸ NĂNG
// ===========================================================================

interface TaxonomyMaps {
  /** mã chương ngắn → id chương trong DB */
  chapterIdByCode: Map<string, string>;
  /** mã kỹ năng ngắn → id kỹ năng trong DB */
  skillIdByCode: Map<string, string>;
  /** id chương → trọng số blueprint (dùng dựng đề kiểm tra) */
  chapterWeights: Record<string, number>;
}

async function seedTaxonomy(tax: TaxonomySeed): Promise<TaxonomyMaps> {
  const chapterIdByCode = new Map<string, string>();
  const chapterWeights: Record<string, number> = {};

  await mapBatched(
    tax.chapters.map((chapter, index) => ({ chapter, index })),
    async ({ chapter, index }) => {
      const row = await prisma.chapter.upsert({
        where: {
          subject_gradeBand_code: {
            subject: tax.subject,
            gradeBand: tax.gradeBand,
            code: chapter.code,
          },
        },
        create: {
          subject: tax.subject,
          gradeBand: tax.gradeBand,
          code: chapter.code,
          name: chapter.name,
          description: chapter.description ?? null,
          order: index + 1,
          blueprintWeight: chapter.weight,
        },
        update: {
          name: chapter.name,
          description: chapter.description ?? null,
          order: index + 1,
          blueprintWeight: chapter.weight,
        },
      });
      chapterIdByCode.set(chapter.code, row.id);
      chapterWeights[row.id] = chapter.weight;
    },
  );

  // Kỹ năng: mã trong DB là mã ĐẦY ĐỦ (`${prefix}-${code}`) vì Skill.code unique toàn cục.
  const skillRows = tax.chapters.flatMap((chapter) =>
    chapter.skills.map((skill, index) => ({ chapter, skill, index })),
  );
  const skillIdByCode = new Map<string, string>();
  await mapBatched(skillRows, async ({ chapter, skill, index }) => {
    const chapterId = chapterIdByCode.get(chapter.code);
    if (!chapterId) throw new Error(`Thiếu chương ${chapter.code} của ${tax.prefix}`);
    const row = await prisma.skill.upsert({
      where: { code: fullSkillCode(tax, skill.code) },
      create: {
        chapterId,
        code: fullSkillCode(tax, skill.code),
        name: skill.name,
        description: skill.description ?? null,
        order: index + 1,
        blueprintWeight: skill.weight ?? 1,
      },
      update: {
        chapterId,
        name: skill.name,
        description: skill.description ?? null,
        order: index + 1,
        blueprintWeight: skill.weight ?? 1,
      },
    });
    skillIdByCode.set(skill.code, row.id);
  });

  // Quan hệ tiên quyết tạo SAU khi đã có đủ id của mọi kỹ năng trong taxonomy.
  const prereqRows: Prisma.SkillPrerequisiteCreateManyInput[] = [];
  for (const { skill } of flatSkills(tax)) {
    const skillId = skillIdByCode.get(skill.code);
    if (!skillId) continue;
    for (const prereqCode of skill.prereq ?? []) {
      const prerequisiteSkillId = skillIdByCode.get(prereqCode);
      if (!prerequisiteSkillId) {
        throw new Error(`${tax.prefix}: kỹ năng tiên quyết không tồn tại → ${prereqCode}`);
      }
      prereqRows.push({ skillId, prerequisiteSkillId });
    }
  }
  if (prereqRows.length > 0) {
    await prisma.skillPrerequisite.createMany({ data: prereqRows, skipDuplicates: true });
  }

  return { chapterIdByCode, skillIdByCode, chapterWeights };
}

// ===========================================================================
// BƯỚC 4 — NGÂN HÀNG CÂU HỎI
// ===========================================================================

interface ItemStats {
  generated: number;
  inserted: number;
}

/**
 * Ghi câu hỏi theo lô lớn. `skipDuplicates` chống nhân đôi theo `itemCode` nên
 * câu ĐÃ CÓ sẽ được giữ nguyên (không ghi đè bản đã biên tập tay). Muốn dựng
 * lại toàn bộ ngân hàng câu hỏi từ bộ sinh mới: `npm run db:reset && npm run db:seed`.
 */
async function seedItems(
  tax: TaxonomySeed,
  maps: TaxonomyMaps,
  authors: { editorId: string; reviewerId: string },
): Promise<ItemStats> {
  const groups = generateItems(tax, PUBLISHED_AT);
  const rows: Prisma.QuestionItemCreateManyInput[] = [];

  for (const group of groups) {
    const chapterId = maps.chapterIdByCode.get(group.chapterCode);
    const skillId = maps.skillIdByCode.get(group.skillCode);
    if (!chapterId || !skillId) {
      throw new Error(`${tax.prefix}: không ánh xạ được ${group.chapterCode}/${group.skillCode}`);
    }
    for (const item of group.items) {
      rows.push({
        itemCode: item.itemCode,
        // programScope rỗng = câu hỏi dùng chung cho mọi kỳ thi (specs §5)
        programScope: [],
        gradeBand: tax.gradeBand,
        actualGradeScope: [],
        subject: tax.subject,
        chapterId,
        skillId,
        difficulty: item.difficulty,
        difficultyNumeric: item.difficultyNumeric,
        questionType: item.questionType,
        stem: item.stem,
        options: item.options as unknown as Prisma.InputJsonValue,
        correctAnswer: item.correctAnswer as Prisma.InputJsonValue,
        answerTolerance: item.answerTolerance,
        solution: item.solution,
        solutionSteps: item.solutionSteps as unknown as Prisma.InputJsonValue,
        hint: item.hint,
        estimatedTime: item.estimatedTime,
        tags: item.tags,
        status: item.status,
        sourceNote: 'Sinh tự động từ bộ dữ liệu mẫu (seed)',
        createdById: authors.editorId,
        // Chỉ câu đã qua duyệt mới có người kiểm duyệt (workflow specs §5.3)
        reviewedById: item.status === 'DRAFT' ? null : authors.reviewerId,
        publishedAt: item.publishedAt,
      });
    }
  }

  let inserted = 0;
  for (const batch of chunk(rows, ITEM_BATCH)) {
    const res = await prisma.questionItem.createMany({ data: batch, skipDuplicates: true });
    inserted += res.count;
  }
  return { generated: rows.length, inserted };
}

// ===========================================================================
// BƯỚC 5 — NGƯỜI DÙNG
// ===========================================================================

interface StaffSeed {
  email: string;
  fullName: string;
  roles: Role[];
}

const STAFF: StaffSeed[] = [
  { email: 'admin@olympiad.vn', fullName: 'Nguyễn Quản Trị', roles: ['SUPER_ADMIN'] },
  { email: 'pm@olympiad.vn', fullName: 'Trần Chương Trình', roles: ['PROGRAM_MANAGER'] },
  { email: 'editor@olympiad.vn', fullName: 'Lê Biên Tập', roles: ['CONTENT_EDITOR'] },
  { email: 'reviewer@olympiad.vn', fullName: 'Phạm Kiểm Duyệt', roles: ['REVIEWER'] },
  { email: 'ops@olympiad.vn', fullName: 'Đỗ Vận Hành', roles: ['OPS_ADMIN'] },
];

interface TeacherSeed {
  email: string;
  fullName: string;
  bio: string;
}

const TEACHERS: TeacherSeed[] = [
  {
    email: 'teacher1@olympiad.vn',
    fullName: 'Cô Nguyễn Thu Hà',
    bio: 'Giáo viên Toán khối 6–7, 8 năm ôn luyện đội tuyển Olympic Toán và Khoa học.',
  },
  {
    email: 'teacher2@olympiad.vn',
    fullName: 'Thầy Vũ Minh Khôi',
    bio: 'Giáo viên Toán, chuyên bồi dưỡng tư duy giải toán cho học sinh trung học cơ sở.',
  },
];

interface StudentSeed {
  email: string;
  fullName: string;
  actualGrade: number;
  school: string;
  parentName: string;
  parentPhone: string;
  parentEmail: string;
  /** Không ghi danh khi để trống — dùng để thử luồng mua hàng. */
  enroll?: {
    programCode: string;
    subject: Subject;
    source: EnrollmentSource;
    teacherEmail?: string;
  };
}

const STUDENTS: StudentSeed[] = [
  {
    email: 'hs1@example.com',
    fullName: 'Nguyễn Minh An',
    actualGrade: 7,
    school: 'THCS Nguyễn Trãi',
    parentName: 'Nguyễn Văn Bình',
    parentPhone: '0901234501',
    parentEmail: 'ph1@example.com',
    // MANUAL = kích hoạt thủ công, entitlement KHÔNG phụ thuộc Payment (specs §11)
    enroll: { programCode: 'NEO', subject: 'MATH', source: 'MANUAL', teacherEmail: 'teacher1@olympiad.vn' },
  },
  {
    email: 'hs2@example.com',
    fullName: 'Trần Bảo Ngọc',
    actualGrade: 6,
    school: 'THCS Lê Quý Đôn',
    parentName: 'Trần Thị Mai',
    parentPhone: '0901234502',
    parentEmail: 'ph2@example.com',
    enroll: { programCode: 'NEO', subject: 'MATH', source: 'MANUAL' },
  },
  {
    email: 'hs3@example.com',
    fullName: 'Lê Gia Huy',
    actualGrade: 7,
    school: 'THCS Chu Văn An',
    parentName: 'Lê Quang Dũng',
    parentPhone: '0901234503',
    parentEmail: 'ph3@example.com',
    // Học bổng: minh họa entitlement cấp không qua thanh toán
    enroll: { programCode: 'ASMOPSS', subject: 'MATH', source: 'SCHOLARSHIP' },
  },
  {
    email: 'hs4@example.com',
    fullName: 'Phạm Khánh Linh',
    actualGrade: 9,
    school: 'THCS Trưng Vương',
    parentName: 'Phạm Hồng Sơn',
    parentPhone: '0901234504',
    parentEmail: 'ph4@example.com',
    // Cố tình KHÔNG ghi danh để thử luồng chọn kỳ thi → mua hàng
  },
];

interface UserResult {
  userIdByEmail: Map<string, string>;
  teacherProfileIdByEmail: Map<string, string>;
  enrollmentCount: number;
}

async function upsertUser(
  email: string,
  fullName: string,
  roles: Role[],
  passwordHash: string,
): Promise<string> {
  const user = await prisma.user.upsert({
    where: { email },
    create: { email, fullName, passwordHash, status: 'ACTIVE', emailVerified: true },
    update: { fullName, passwordHash, status: 'ACTIVE', emailVerified: true },
  });
  await prisma.userRole.createMany({
    data: roles.map((role) => ({ userId: user.id, role })),
    skipDuplicates: true,
  });
  return user.id;
}

async function seedUsers(catalog: CatalogResult): Promise<UserResult> {
  const passwordHash = await bcrypt.hash(SEED_PASSWORD, 10);
  const userIdByEmail = new Map<string, string>();

  for (const staff of STAFF) {
    userIdByEmail.set(staff.email, await upsertUser(staff.email, staff.fullName, staff.roles, passwordHash));
  }
  done(`${STAFF.length} tài khoản quản trị / nội dung`);

  const teacherProfileIdByEmail = new Map<string, string>();
  for (const teacher of TEACHERS) {
    const userId = await upsertUser(teacher.email, teacher.fullName, ['TEACHER'], passwordHash);
    userIdByEmail.set(teacher.email, userId);
    const profile = await prisma.teacherProfile.upsert({
      where: { userId },
      create: {
        userId,
        bio: teacher.bio,
        subjects: ['MATH'],
        capacityPerCycle: DEFAULT_CONFIG.teacher.defaultCapacityPerCycle,
        active: true,
      },
      update: {
        bio: teacher.bio,
        subjects: ['MATH'],
        capacityPerCycle: DEFAULT_CONFIG.teacher.defaultCapacityPerCycle,
        active: true,
      },
    });
    teacherProfileIdByEmail.set(teacher.email, profile.id);
  }
  done(`${TEACHERS.length} giáo viên (capacity ${DEFAULT_CONFIG.teacher.defaultCapacityPerCycle} HS/chu kỳ)`);

  const expiresAt = addDays(new Date(), DEFAULT_ACCESS_DAYS);
  let enrollmentCount = 0;

  for (const s of STUDENTS) {
    const userId = await upsertUser(s.email, s.fullName, ['STUDENT'], passwordHash);
    userIdByEmail.set(s.email, userId);

    // Luôn lưu LỚP THỰC TẾ, khối chỉ là hệ quả suy ra (specs §3.2)
    const gradeBand = gradeBandOf(s.actualGrade);
    const profileData = {
      actualGrade: s.actualGrade,
      gradeBand,
      school: s.school,
      parentName: s.parentName,
      parentPhone: s.parentPhone,
      parentEmail: s.parentEmail,
    };
    const profile = await prisma.studentProfile.upsert({
      where: { userId },
      create: { userId, ...profileData },
      update: profileData,
    });

    if (!s.enroll) continue;

    const courseId = catalog.courseIdByKey.get(courseKey(s.enroll.programCode, gradeBand, s.enroll.subject));
    if (!courseId) throw new Error(`Không có khóa học ${s.enroll.programCode}/${gradeBand}/${s.enroll.subject}`);
    const cohortId = catalog.cohortIdByProgram.get(s.enroll.programCode) ?? null;

    const enrollment = await prisma.enrollment.upsert({
      where: { studentId_courseId: { studentId: profile.id, courseId } },
      create: {
        studentId: profile.id,
        courseId,
        cohortId,
        source: s.enroll.source,
        status: 'ACTIVE',
        // Thời hạn truy cập tính từ ngày kích hoạt (specs §11)
        expiresAt,
        // selfDeclaredLevel để trống → còn nguyên bước tự khai mức + bài kiểm tra đầu vào
      },
      update: { cohortId, source: s.enroll.source, status: 'ACTIVE' },
    });
    enrollmentCount += 1;

    if (s.enroll.teacherEmail) {
      const teacherId = teacherProfileIdByEmail.get(s.enroll.teacherEmail);
      if (!teacherId) throw new Error(`Không tìm thấy giáo viên ${s.enroll.teacherEmail}`);
      await prisma.teacherAssignment.upsert({
        where: { enrollmentId: enrollment.id },
        create: { teacherId, enrollmentId: enrollment.id, active: true },
        update: { teacherId, active: true },
      });
    }
  }
  done(`${STUDENTS.length} học sinh, ${enrollmentCount} lượt ghi danh (hết hạn ${expiresAt.toLocaleDateString('vi-VN')})`);

  return { userIdByEmail, teacherProfileIdByEmail, enrollmentCount };
}

// ===========================================================================
// BƯỚC 6 — BÀI KIỂM TRA (BLUEPRINT)
// ===========================================================================

/**
 * Tỷ lệ độ khó theo mức HS tự khai (mỗi hàng cộng lại = 1).
 * Mức càng cao càng nghiêng về câu Giỏi, nhưng luôn giữ phần câu Trung bình
 * làm "câu neo" để đo tiến bộ tương đối giữa các chu kỳ (specs §7.9–7.10).
 */
const DIFFICULTY_MIX: Record<StudentLevel, Record<Difficulty, number>> = {
  WEAK: { AVERAGE: 0.6, GOOD: 0.3, EXCELLENT: 0.1 },
  AVERAGE: { AVERAGE: 0.45, GOOD: 0.35, EXCELLENT: 0.2 },
  GOOD: { AVERAGE: 0.3, GOOD: 0.4, EXCELLENT: 0.3 },
  EXCELLENT: { AVERAGE: 0.2, GOOD: 0.35, EXCELLENT: 0.45 },
};

/** Số câu neo tối thiểu trong mỗi đề. */
const MIN_ANCHOR_ITEMS = 3;

function buildBlueprint(chapterWeights: Record<string, number>): BlueprintSpec {
  return {
    chapterWeights,
    difficultyMixByLevel: DIFFICULTY_MIX,
    minAnchorItems: MIN_ANCHOR_ITEMS,
  };
}

async function seedAssessments(
  catalog: CatalogResult,
  mapsByTaxKey: Map<string, TaxonomyMaps>,
): Promise<number> {
  const cfg = DEFAULT_CONFIG.assessment;
  let count = 0;

  const courses = buildCourses();
  await mapBatched(courses, async (c) => {
    const maps = mapsByTaxKey.get(`${c.subject}:${c.gradeBand}`);
    if (!maps) return; // chưa có taxonomy cho (môn, khối) → chưa dựng được đề
    const courseId = catalog.courseIdByKey.get(courseKey(c.programCode, c.gradeBand, c.subject));
    if (!courseId) return;

    const blueprint = buildBlueprint(maps.chapterWeights) as unknown as Prisma.InputJsonValue;

    await prisma.assessment.upsert({
      where: { courseId_type: { courseId, type: 'DIAGNOSTIC' } },
      create: {
        courseId,
        type: 'DIAGNOSTIC',
        name: `Bài kiểm tra đầu vào — ${c.name}`,
        itemCount: cfg.diagnosticItemCount,
        timeLimitMinutes: cfg.diagnosticTimeLimitMinutes,
        blueprint,
        active: true,
      },
      update: {
        name: `Bài kiểm tra đầu vào — ${c.name}`,
        itemCount: cfg.diagnosticItemCount,
        timeLimitMinutes: cfg.diagnosticTimeLimitMinutes,
        blueprint,
        active: true,
      },
    });

    await prisma.assessment.upsert({
      where: { courseId_type: { courseId, type: 'PROGRESS' } },
      create: {
        courseId,
        type: 'PROGRESS',
        name: `Bài kiểm tra tiến bộ ${cfg.cycleDays} ngày — ${c.name}`,
        itemCount: cfg.progressItemCount,
        timeLimitMinutes: cfg.progressTimeLimitMinutes,
        blueprint,
        active: true,
      },
      update: {
        name: `Bài kiểm tra tiến bộ ${cfg.cycleDays} ngày — ${c.name}`,
        itemCount: cfg.progressItemCount,
        timeLimitMinutes: cfg.progressTimeLimitMinutes,
        blueprint,
        active: true,
      },
    });
    count += 2;
  });

  return count;
}

// ===========================================================================
// BƯỚC 7 — FEATURE FLAG & CẤU HÌNH
// ===========================================================================

const FEATURE_FLAGS = [
  {
    key: 'parent_dashboard',
    description: 'Trang theo dõi dành cho phụ huynh — chưa mở trong bản MVP.',
  },
  {
    key: 'ai_tutor_chat',
    description: 'Trợ giảng AI hỏi đáp theo lời giải đã kiểm duyệt — chưa mở trong bản MVP.',
  },
  {
    key: 'gamification',
    description: 'Huy hiệu, chuỗi ngày học và bảng xếp hạng — chưa mở trong bản MVP.',
  },
];

async function seedOperations(adminId: string | undefined): Promise<{ flags: number; configs: number }> {
  for (const flag of FEATURE_FLAGS) {
    await prisma.featureFlag.upsert({
      where: { key: flag.key },
      create: { key: flag.key, enabled: false, programScope: [], description: flag.description },
      // Không ép `enabled` về false khi chạy lại: admin có thể đã bật thủ công.
      update: { description: flag.description },
    });
  }

  // Ghi nhóm "assessment" bằng đúng giá trị mặc định để chứng minh cơ chế ghi đè
  // hoạt động mà KHÔNG làm đổi hành vi hệ thống (specs Phụ lục B).
  const meta = CONFIG_GROUP_META.assessment;
  await prisma.appConfig.upsert({
    where: { key: 'assessment' },
    create: {
      key: 'assessment',
      value: DEFAULT_CONFIG.assessment as unknown as Prisma.InputJsonValue,
      scope: 'GLOBAL',
      label: meta.label,
      description: meta.description,
      updatedById: adminId ?? null,
    },
    // Chạy lại KHÔNG ghi đè giá trị admin đã chỉnh, chỉ làm mới nhãn mô tả.
    update: { label: meta.label, description: meta.description },
  });

  return { flags: FEATURE_FLAGS.length, configs: 1 };
}

// ===========================================================================
// BƯỚC 8 — BẢNG TỔNG KẾT
// ===========================================================================

function row(label: string, value: string): void {
  console.log(`  ${label.padEnd(30, '.')} ${value.padStart(9)}`);
}

async function printSummary(startedAt: number): Promise<void> {
  const [
    programs,
    cohorts,
    courses,
    pricings,
    coupons,
    chapters,
    skills,
    prereqs,
    itemsByStatus,
    users,
    rolesGrouped,
    students,
    teachers,
    enrollments,
    assignments,
    assessments,
    flags,
    configs,
  ] = await Promise.all([
    prisma.program.count(),
    prisma.cohort.count(),
    prisma.course.count(),
    prisma.pricing.count(),
    prisma.coupon.count(),
    prisma.chapter.count(),
    prisma.skill.count(),
    prisma.skillPrerequisite.count(),
    prisma.questionItem.groupBy({ by: ['status'], _count: { _all: true } }),
    prisma.user.count(),
    prisma.userRole.groupBy({ by: ['role'], _count: { _all: true } }),
    prisma.studentProfile.count(),
    prisma.teacherProfile.count(),
    prisma.enrollment.count(),
    prisma.teacherAssignment.count(),
    prisma.assessment.count(),
    prisma.featureFlag.count(),
    prisma.appConfig.count(),
  ]);

  const totalItems = itemsByStatus.reduce((sum, r) => sum + r._count._all, 0);

  console.log('\n===========================================================');
  console.log('  TỔNG KẾT DỮ LIỆU TRONG DATABASE');
  console.log('===========================================================');
  row('Chương trình (kỳ thi)', num(programs));
  row('Mùa thi', num(cohorts));
  row('Khóa học', num(courses));
  row('Bảng giá', num(pricings));
  row('Mã giảm giá', num(coupons));
  row('Chương', num(chapters));
  row('Kỹ năng', num(skills));
  row('Quan hệ tiên quyết', num(prereqs));
  row('Câu hỏi (tổng)', num(totalItems));
  for (const r of [...itemsByStatus].sort((a, b) => b._count._all - a._count._all)) {
    row(`  · ${r.status}`, num(r._count._all));
  }
  row('Người dùng', num(users));
  for (const r of [...rolesGrouped].sort((a, b) => a.role.localeCompare(b.role))) {
    row(`  · ${r.role}`, num(r._count._all));
  }
  row('Hồ sơ học sinh', num(students));
  row('Hồ sơ giáo viên', num(teachers));
  row('Ghi danh', num(enrollments));
  row('Phân công giáo viên', num(assignments));
  row('Bài kiểm tra', num(assessments));
  row('Feature flag', num(flags));
  row('Nhóm cấu hình ghi đè', num(configs));
  console.log('===========================================================');
  console.log(`  Mật khẩu chung mọi tài khoản mẫu: ${SEED_PASSWORD}`);
  console.log(`  Thời gian nạp: ${((Date.now() - startedAt) / 1000).toFixed(1)} giây`);
  console.log('===========================================================\n');
}

// ===========================================================================
// ĐIỂM VÀO
// ===========================================================================

/**
 * Nạp toàn bộ dữ liệu mẫu. Được xuất ra để `scripts/bootstrap.ts` gọi lại khi
 * môi trường triển khai lên lần đầu với database còn trống.
 */
export async function seedDatabase(): Promise<void> {
  const startedAt = Date.now();
  console.log('===========================================================');
  console.log('  NẠP DỮ LIỆU MẪU — NỀN TẢNG ÔN LUYỆN OLYMPIC');
  console.log('===========================================================');

  step(1, 'Kiểm tra dữ liệu nguồn trước khi ghi');
  const errors = preflight();
  if (errors.length > 0) {
    console.error(`\n  ✗ Phát hiện ${errors.length} lỗi — DỪNG LẠI, không ghi gì vào database:\n`);
    for (const err of errors) console.error(`    - ${err}`);
    console.error('\n  Sửa dữ liệu trong prisma/seed-data/ rồi chạy lại.\n');
    process.exitCode = 1;
    return;
  }
  const skillTotal = TAXONOMIES.reduce((sum, t) => sum + flatSkills(t).length, 0);
  done(`${TAXONOMIES.length} taxonomy, ${skillTotal} kỹ năng — cấu trúc hợp lệ`);

  // Chỉ nạp câu hỏi cho taxonomy đã đủ bộ sinh; phần còn lại được nêu tên rõ ràng
  // để đội nội dung biết chính xác còn nợ những gì (đặc tả §18: không cắt bớt im lặng).
  const { ready, pending } = splitReadyTaxonomies(TAXONOMIES);
  if (pending.length > 0) {
    console.log(
      `\n  ⚠ ${pending.length}/${TAXONOMIES.length} taxonomy CHƯA có đủ bộ sinh câu hỏi.`,
    );
    console.log('    Chương trình và cây kiến thức của chúng vẫn được tạo, nhưng KHÔNG có câu hỏi:');
    for (const p of pending) {
      console.log(`      - ${p.tax.subject}/${p.tax.gradeBand} (${p.tax.prefix}): thiếu ${p.missing.join(', ')}`);
    }
    console.log('    Bổ sung bộ sinh trong prisma/seed-data/ rồi chạy lại seed để nạp tiếp.\n');
  }

  step(2, 'Chương trình, mùa thi, khóa học, bảng giá, mã giảm giá');
  const catalog = await seedCatalog();

  step(3, 'Người dùng, ghi danh, phân công giáo viên');
  const users = await seedUsers(catalog);

  step(4, 'Taxonomy (chương, kỹ năng, tiên quyết) và ngân hàng câu hỏi');
  const editorId = users.userIdByEmail.get('editor@olympiad.vn');
  const reviewerId = users.userIdByEmail.get('reviewer@olympiad.vn');
  if (!editorId || !reviewerId) throw new Error('Thiếu tài khoản biên tập / kiểm duyệt');

  const mapsByTaxKey = new Map<string, TaxonomyMaps>();
  let generatedTotal = 0;
  let insertedTotal = 0;
  const readyKeys = new Set(ready.map((t) => `${t.subject}:${t.gradeBand}`));
  for (const tax of TAXONOMIES) {
    // Cây kiến thức luôn được tạo cho MỌI taxonomy — đó là dữ liệu chuẩn hóa,
    // độc lập với việc đã có bộ sinh câu hỏi hay chưa.
    const maps = await seedTaxonomy(tax);
    const key = `${tax.subject}:${tax.gradeBand}`;
    mapsByTaxKey.set(key, maps);

    if (!readyKeys.has(key)) {
      console.log(
        `    · ${tax.subject}/${tax.gradeBand} (${tax.prefix}): ` +
          `${maps.chapterIdByCode.size} chương, ${maps.skillIdByCode.size} kỹ năng, ` +
          `0 câu — CHƯA có bộ sinh`,
      );
      continue;
    }

    const stats = await seedItems(tax, maps, { editorId, reviewerId });
    generatedTotal += stats.generated;
    insertedTotal += stats.inserted;
    console.log(
      `    · ${tax.subject}/${tax.gradeBand} (${tax.prefix}): ` +
        `${maps.chapterIdByCode.size} chương, ${maps.skillIdByCode.size} kỹ năng, ` +
        `${num(stats.generated)} câu (mới ${num(stats.inserted)})`,
    );
  }
  done(`${num(generatedTotal)} câu hỏi đã sinh, ${num(insertedTotal)} câu ghi mới lần này`);

  step(5, 'Bài kiểm tra đầu vào và kiểm tra tiến bộ');
  const assessmentCount = await seedAssessments(catalog, mapsByTaxKey);
  done(`${assessmentCount} bài kiểm tra (DIAGNOSTIC + PROGRESS cho mỗi khóa có taxonomy)`);

  step(6, 'Feature flag và cấu hình hệ thống');
  const ops = await seedOperations(users.userIdByEmail.get('admin@olympiad.vn'));
  done(`${ops.flags} feature flag (tắt), ${ops.configs} nhóm cấu hình ghi đè`);

  await printSummary(startedAt);
}

/**
 * Chỉ tự chạy khi file này LÀ điểm vào (`tsx prisma/seed.ts`). Khi được import
 * từ nơi khác — như `scripts/bootstrap.ts` lúc triển khai — thì chỉ xuất hàm ra
 * để phía gọi tự quyết định thời điểm chạy và tự CHỜ kết quả.
 */
const invokedDirectly =
  process.argv[1] !== undefined && pathToFileURL(process.argv[1]).href === import.meta.url;

if (invokedDirectly) {
  seedDatabase()
    .catch((error: unknown) => {
      console.error('\n✗ NẠP DỮ LIỆU THẤT BẠI:');
      console.error(error instanceof Error ? (error.stack ?? error.message) : error);
      process.exitCode = 1;
    })
    .finally(async () => {
      await prisma.$disconnect();
    });
}
