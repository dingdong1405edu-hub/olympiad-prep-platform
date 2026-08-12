/**
 * Content Bank — nghiệp vụ kho câu hỏi (specs §5.3, §9.4 (b), §19.5 #19).
 *
 * Đây là nơi vận hành sống hàng ngày: nhập câu, thẩm định, xuất bản, sửa hàng
 * loạt, theo dõi độ phủ và chất lượng câu hỏi.
 *
 * Hai bất biến không được phá:
 *  1. `getPublishedItemPool` là CỔNG DUY NHẤT cấp câu cho engine/AI và luôn lọc
 *     status = PUBLISHED ngay trong mệnh đề where (specs §19.2 #6).
 *  2. Mọi lần sửa câu đều tăng version + lưu snapshot bản cũ + ghi audit
 *     (specs §5.3) để trả lời được "ai sửa gì, khi nào, vì sao".
 *
 * File này là logic thuần: không import next/server, không trả NextResponse.
 */
import type {
  Chapter,
  Difficulty,
  GradeBand,
  ItemStatus,
  Prisma,
  QuestionItem,
  Role,
  Skill,
  Subject,
} from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { ApiError } from '@/lib/http';
import { AUDIT_ACTIONS, writeAudit } from '@/lib/audit';
import { PUBLISH_ROLES } from '@/lib/auth';
import { getConfig } from '@/lib/config';
import {
  DIFFICULTIES,
  DIFFICULTY_LABEL,
  ITEM_STATUS_LABEL,
  ITEM_STATUS_TRANSITIONS,
} from '@/lib/domain';
import { toCsv } from './csv';
import { IMPORT_TEMPLATE_HEADERS, itemSnapshot } from './import';
import {
  checkAnswerConsistency,
  defaultDifficultyNumeric,
  defaultEstimatedTimeSeconds,
  parseOptions,
  type ChapterFilter,
  type CoverageFilter,
  type CreateItemInput,
  type FlagFilter,
  type FlagItemInput,
  type ItemAnalyticsFilter,
  type ItemFilter,
  type ItemOption,
  type PublishedPoolFilter,
  type SkillFilter,
  type UpdateItemInput,
  type UpsertChapterInput,
  type UpsertSkillInput,
} from './schemas';

// ---------------------------------------------------------------------------
// Hằng số vận hành (không phải tham số nghiệp vụ — không nằm trong AppConfig)
// ---------------------------------------------------------------------------

/** Phân trang mặc định của màn hình quản trị. */
const DEFAULT_PAGE_SIZE = 25;
const MAX_PAGE_SIZE = 200;
/** Trần số câu mỗi lần sửa hàng loạt, tránh khóa bảng quá lâu. */
export const BULK_MAX_ITEMS = 500;
/** Trần số câu mỗi lần xuất CSV. */
export const EXPORT_MAX_ROWS = 5000;
/** Trần kích thước pool cấp cho engine trong một lần gọi. */
const POOL_MAX_ITEMS = 5000;
/** Dưới số học sinh này thì chỉ số phân biệt (discrimination) không có ý nghĩa thống kê. */
const MIN_STUDENTS_FOR_DISCRIMINATION = 10;
/** Quy tắc Kelley: so nhóm 27% điểm cao với 27% điểm thấp. */
const DISCRIMINATION_GROUP_FRACTION = 0.27;

/** Audit action riêng của module — bảng dùng chung AUDIT_ACTIONS chưa có mục taxonomy. */
export const CONTENT_AUDIT_ACTIONS = {
  CHAPTER_UPSERT: 'chapter.upsert',
  CHAPTER_DELETE: 'chapter.delete',
  SKILL_UPSERT: 'skill.upsert',
  SKILL_PREREQUISITES: 'skill.prerequisites',
  ITEM_CLONE: 'item.clone',
  ITEM_BULK_UPDATE: 'item.bulk_update',
  ITEM_FLAG: 'item.flag',
  ITEM_STATS_RECOMPUTE: 'item.stats_recompute',
} as const;

/** Ngưỡng mặc định của dashboard coverage — vận hành chỉnh được qua tham số. */
export const COVERAGE_DEFAULTS = {
  /**
   * Mỗi kỹ năng cần tối thiểu ngần này câu PUBLISHED cho MỖI bậc độ khó.
   * 5 câu/bậc là mức tối thiểu để engine còn xoay vòng được trong một chu kỳ
   * 2 tuần mà không giao lại đúng câu cũ (specs §7.5 anti-repeat).
   */
  minPerDifficulty: 5,
} as const;

/** Ngưỡng mặc định để đánh dấu câu bất thường trong analytics. */
export const ANALYTICS_DEFAULTS = {
  /** Dưới ngưỡng lượt làm này thì chưa kết luận dễ/khó. */
  minAttempts: 20,
  /** Tỷ lệ đúng >= mức này: câu quá dễ, gần như không phân loại được. */
  easyThreshold: 0.92,
  /** Tỷ lệ đúng <= mức này: câu quá khó hoặc sai đáp án. */
  hardThreshold: 0.28,
  /** Thời gian thực tế / thời gian chuẩn vượt mức này: câu tốn giờ bất thường. */
  slowRatio: 1.6,
  /** Tỷ lệ báo lỗi trên lượt làm vượt mức này: cần rà soát nội dung. */
  reportRateThreshold: 0.05,
} as const;

// ---------------------------------------------------------------------------
// Tiện ích chung
// ---------------------------------------------------------------------------

function pagination(page?: number, pageSize?: number): { skip: number; take: number; page: number; pageSize: number } {
  const size = Math.min(MAX_PAGE_SIZE, Math.max(1, Math.trunc(pageSize ?? DEFAULT_PAGE_SIZE)));
  const current = Math.max(1, Math.trunc(page ?? 1));
  return { skip: (current - 1) * size, take: size, page: current, pageSize: size };
}

/** Item có programScope rỗng dùng chung cho mọi kỳ thi; ngược lại phải chứa mã. */
function programScopeWhere(programCode?: string): Prisma.QuestionItemWhereInput | null {
  if (!programCode) return null;
  return {
    OR: [{ programScope: { isEmpty: true } }, { programScope: { has: programCode.toUpperCase() } }],
  };
}

function emptyDifficultyCounts(): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const difficulty of DIFFICULTIES) counts[difficulty] = 0;
  return counts;
}

function truncate(text: string, max: number): string {
  const clean = text.replace(/\s+/g, ' ').trim();
  return clean.length <= max ? clean : `${clean.slice(0, max)}…`;
}

// ===========================================================================
// TAXONOMY — CHƯƠNG
// ===========================================================================

export interface ChapterListRow extends Chapter {
  _count: { skills: number; items: number };
}

export async function listChapters(filter: ChapterFilter = {}): Promise<ChapterListRow[]> {
  const search = filter.search?.trim();
  return prisma.chapter.findMany({
    where: {
      subject: filter.subject,
      gradeBand: filter.gradeBand,
      ...(search
        ? {
            OR: [
              { code: { contains: search, mode: 'insensitive' } },
              { name: { contains: search, mode: 'insensitive' } },
            ],
          }
        : {}),
    },
    orderBy: [{ subject: 'asc' }, { gradeBand: 'asc' }, { order: 'asc' }, { code: 'asc' }],
    include: { _count: { select: { skills: true, items: true } } },
  });
}

export interface ChapterTreeSkill {
  id: string;
  code: string;
  name: string;
  description: string | null;
  order: number;
  blueprintWeight: number;
  prerequisites: { id: string; code: string; name: string }[];
  itemCounts: { total: number; published: number; byStatus: Record<string, number> };
}

export interface ChapterTreeNode {
  id: string;
  code: string;
  name: string;
  description: string | null;
  order: number;
  blueprintWeight: number;
  skills: ChapterTreeSkill[];
  itemCounts: { total: number; published: number };
}

/** Cây chương → kỹ năng kèm số câu theo trạng thái, phục vụ màn hình taxonomy. */
export async function getChapterTree(subject: Subject, gradeBand: GradeBand): Promise<ChapterTreeNode[]> {
  const chapters = await prisma.chapter.findMany({
    where: { subject, gradeBand },
    orderBy: [{ order: 'asc' }, { code: 'asc' }],
    include: {
      skills: {
        orderBy: [{ order: 'asc' }, { code: 'asc' }],
        include: {
          prerequisites: {
            include: { prerequisite: { select: { id: true, code: true, name: true } } },
          },
        },
      },
    },
  });

  const skillIds = chapters.flatMap((chapter) => chapter.skills.map((skill) => skill.id));
  const grouped =
    skillIds.length > 0
      ? await prisma.questionItem.groupBy({
          by: ['skillId', 'status'],
          where: { skillId: { in: skillIds } },
          _count: { _all: true },
        })
      : [];

  const bySkill = new Map<string, Record<string, number>>();
  for (const row of grouped) {
    const entry = bySkill.get(row.skillId) ?? {};
    entry[row.status] = row._count._all;
    bySkill.set(row.skillId, entry);
  }

  return chapters.map((chapter) => {
    const skills: ChapterTreeSkill[] = chapter.skills.map((skill) => {
      const byStatus = bySkill.get(skill.id) ?? {};
      const total = Object.values(byStatus).reduce((sum, n) => sum + n, 0);
      return {
        id: skill.id,
        code: skill.code,
        name: skill.name,
        description: skill.description,
        order: skill.order,
        blueprintWeight: skill.blueprintWeight,
        prerequisites: skill.prerequisites.map((p) => p.prerequisite),
        itemCounts: { total, published: byStatus.PUBLISHED ?? 0, byStatus },
      };
    });

    return {
      id: chapter.id,
      code: chapter.code,
      name: chapter.name,
      description: chapter.description,
      order: chapter.order,
      blueprintWeight: chapter.blueprintWeight,
      skills,
      itemCounts: {
        total: skills.reduce((sum, s) => sum + s.itemCounts.total, 0),
        published: skills.reduce((sum, s) => sum + s.itemCounts.published, 0),
      },
    };
  });
}

export async function upsertChapter(input: UpsertChapterInput, actorId: string): Promise<Chapter> {
  const existing = input.id
    ? await prisma.chapter.findUnique({ where: { id: input.id } })
    : await prisma.chapter.findUnique({
        where: {
          subject_gradeBand_code: { subject: input.subject, gradeBand: input.gradeBand, code: input.code },
        },
      });

  if (input.id && !existing) throw ApiError.notFound('Không tìm thấy chương cần sửa.');

  if (existing) {
    const clash = await prisma.chapter.findUnique({
      where: {
        subject_gradeBand_code: { subject: input.subject, gradeBand: input.gradeBand, code: input.code },
      },
      select: { id: true },
    });
    if (clash && clash.id !== existing.id) {
      throw ApiError.conflict(`Mã chương "${input.code}" đã tồn tại trong môn/khối này.`);
    }

    const updated = await prisma.chapter.update({
      where: { id: existing.id },
      data: {
        subject: input.subject,
        gradeBand: input.gradeBand,
        code: input.code,
        name: input.name,
        description: input.description ?? null,
        order: input.order,
        blueprintWeight: input.blueprintWeight,
      },
    });

    await writeAudit({
      actorId,
      action: CONTENT_AUDIT_ACTIONS.CHAPTER_UPSERT,
      entityType: 'Chapter',
      entityId: updated.id,
      before: { code: existing.code, name: existing.name, order: existing.order, blueprintWeight: existing.blueprintWeight },
      after: { code: updated.code, name: updated.name, order: updated.order, blueprintWeight: updated.blueprintWeight },
    });
    return updated;
  }

  const created = await prisma.chapter.create({
    data: {
      subject: input.subject,
      gradeBand: input.gradeBand,
      code: input.code,
      name: input.name,
      description: input.description ?? null,
      order: input.order,
      blueprintWeight: input.blueprintWeight,
    },
  });

  await writeAudit({
    actorId,
    action: CONTENT_AUDIT_ACTIONS.CHAPTER_UPSERT,
    entityType: 'Chapter',
    entityId: created.id,
    after: { code: created.code, name: created.name, subject: created.subject, gradeBand: created.gradeBand },
  });
  return created;
}

/**
 * Xóa chương. Quan hệ trong schema là cascade nên xóa chương còn câu hỏi sẽ
 * xóa luôn toàn bộ câu + lịch sử làm bài — chặn cứng, bắt chuyển câu đi trước.
 */
export async function deleteChapter(id: string, actorId: string): Promise<void> {
  const chapter = await prisma.chapter.findUnique({
    where: { id },
    include: { _count: { select: { items: true, skills: true } } },
  });
  if (!chapter) throw ApiError.notFound('Không tìm thấy chương cần xóa.');

  if (chapter._count.items > 0) {
    throw ApiError.conflict(
      `Chương "${chapter.name}" đang có ${chapter._count.items} câu hỏi. Hãy chuyển hoặc ngừng sử dụng số câu này trước khi xóa chương.`,
    );
  }

  await prisma.chapter.delete({ where: { id } });

  await writeAudit({
    actorId,
    action: CONTENT_AUDIT_ACTIONS.CHAPTER_DELETE,
    entityType: 'Chapter',
    entityId: id,
    before: { code: chapter.code, name: chapter.name, skills: chapter._count.skills },
  });
}

// ===========================================================================
// TAXONOMY — KỸ NĂNG
// ===========================================================================

export interface SkillListRow extends Skill {
  chapter: { id: string; code: string; name: string; subject: Subject; gradeBand: GradeBand };
  prerequisites: { id: string; code: string; name: string }[];
  _count: { items: number };
}

export async function listSkills(filter: SkillFilter = {}): Promise<SkillListRow[]> {
  const search = filter.search?.trim();
  const skills = await prisma.skill.findMany({
    where: {
      chapterId: filter.chapterId,
      chapter: {
        subject: filter.subject,
        gradeBand: filter.gradeBand,
      },
      ...(search
        ? {
            OR: [
              { code: { contains: search, mode: 'insensitive' } },
              { name: { contains: search, mode: 'insensitive' } },
            ],
          }
        : {}),
    },
    orderBy: [{ chapter: { order: 'asc' } }, { order: 'asc' }, { code: 'asc' }],
    include: {
      chapter: { select: { id: true, code: true, name: true, subject: true, gradeBand: true } },
      prerequisites: { include: { prerequisite: { select: { id: true, code: true, name: true } } } },
      _count: { select: { items: true } },
    },
  });

  return skills.map((skill) => ({
    ...skill,
    prerequisites: skill.prerequisites.map((p) => p.prerequisite),
  }));
}

export async function upsertSkill(input: UpsertSkillInput, actorId: string): Promise<Skill> {
  const chapter = await prisma.chapter.findUnique({ where: { id: input.chapterId } });
  if (!chapter) throw ApiError.badRequest('Chương được chọn không tồn tại.');

  const existing = input.id
    ? await prisma.skill.findUnique({ where: { id: input.id } })
    : await prisma.skill.findUnique({ where: { code: input.code } });

  if (input.id && !existing) throw ApiError.notFound('Không tìm thấy kỹ năng cần sửa.');

  if (existing) {
    const clash = await prisma.skill.findUnique({ where: { code: input.code }, select: { id: true } });
    if (clash && clash.id !== existing.id) {
      throw ApiError.conflict(`Mã kỹ năng "${input.code}" đã được dùng cho kỹ năng khác.`);
    }

    const updated = await prisma.skill.update({
      where: { id: existing.id },
      data: {
        chapterId: input.chapterId,
        code: input.code,
        name: input.name,
        description: input.description ?? null,
        order: input.order,
        blueprintWeight: input.blueprintWeight,
      },
    });

    await writeAudit({
      actorId,
      action: CONTENT_AUDIT_ACTIONS.SKILL_UPSERT,
      entityType: 'Skill',
      entityId: updated.id,
      before: { code: existing.code, name: existing.name, chapterId: existing.chapterId },
      after: { code: updated.code, name: updated.name, chapterId: updated.chapterId },
    });
    return updated;
  }

  const created = await prisma.skill.create({
    data: {
      chapterId: input.chapterId,
      code: input.code,
      name: input.name,
      description: input.description ?? null,
      order: input.order,
      blueprintWeight: input.blueprintWeight,
    },
  });

  await writeAudit({
    actorId,
    action: CONTENT_AUDIT_ACTIONS.SKILL_UPSERT,
    entityType: 'Skill',
    entityId: created.id,
    after: { code: created.code, name: created.name, chapterId: created.chapterId },
  });
  return created;
}

/**
 * Đặt lại toàn bộ danh sách kỹ năng tiên quyết.
 * Đồ thị tiên quyết PHẢI không có chu trình: engine đi ngược đồ thị để tìm bài
 * vá lỗ hổng, một vòng lặp sẽ làm học sinh không bao giờ có đường học.
 */
export async function setSkillPrerequisites(
  skillId: string,
  prerequisiteSkillIds: string[],
  actorId: string,
): Promise<void> {
  const skill = await prisma.skill.findUnique({
    where: { id: skillId },
    include: { chapter: { select: { subject: true } } },
  });
  if (!skill) throw ApiError.notFound('Không tìm thấy kỹ năng.');

  const wanted = Array.from(new Set(prerequisiteSkillIds.map((id) => id.trim()).filter(Boolean)));
  if (wanted.includes(skillId)) {
    throw ApiError.badRequest('Một kỹ năng không thể là điều kiện tiên quyết của chính nó.');
  }

  const prerequisites = wanted.length
    ? await prisma.skill.findMany({
        where: { id: { in: wanted } },
        include: { chapter: { select: { subject: true } } },
      })
    : [];

  if (prerequisites.length !== wanted.length) {
    const found = new Set(prerequisites.map((p) => p.id));
    const missing = wanted.filter((id) => !found.has(id));
    throw ApiError.badRequest(`Không tìm thấy kỹ năng tiên quyết: ${missing.join(', ')}.`);
  }

  const wrongSubject = prerequisites.filter((p) => p.chapter.subject !== skill.chapter.subject);
  if (wrongSubject.length > 0) {
    throw ApiError.badRequest(
      `Kỹ năng tiên quyết phải cùng môn: ${wrongSubject.map((p) => p.code).join(', ')} không thuộc môn của "${skill.code}".`,
    );
  }

  // Dựng đồ thị hiện tại rồi thay cạnh của skill này bằng danh sách mới.
  const edges = await prisma.skillPrerequisite.findMany({
    select: { skillId: true, prerequisiteSkillId: true },
  });
  const needs = new Map<string, string[]>();
  for (const edge of edges) {
    if (edge.skillId === skillId) continue;
    const list = needs.get(edge.skillId) ?? [];
    list.push(edge.prerequisiteSkillId);
    needs.set(edge.skillId, list);
  }
  needs.set(skillId, wanted);

  const cyclePath = findCycleFrom(skillId, needs);
  if (cyclePath) {
    const codes = await prisma.skill.findMany({
      where: { id: { in: cyclePath } },
      select: { id: true, code: true },
    });
    const codeById = new Map(codes.map((c) => [c.id, c.code]));
    throw ApiError.badRequest(
      `Danh sách tiên quyết tạo thành vòng lặp: ${cyclePath.map((id) => codeById.get(id) ?? id).join(' → ')}.`,
    );
  }

  await prisma.$transaction([
    prisma.skillPrerequisite.deleteMany({ where: { skillId } }),
    ...(wanted.length > 0
      ? [
          prisma.skillPrerequisite.createMany({
            data: wanted.map((prerequisiteSkillId) => ({ skillId, prerequisiteSkillId })),
            skipDuplicates: true,
          }),
        ]
      : []),
  ]);

  await writeAudit({
    actorId,
    action: CONTENT_AUDIT_ACTIONS.SKILL_PREREQUISITES,
    entityType: 'Skill',
    entityId: skillId,
    after: { prerequisiteSkillIds: wanted },
  });
}

/** DFS tìm đường quay lại chính `start` theo cạnh "cần học trước". */
function findCycleFrom(start: string, needs: Map<string, string[]>): string[] | null {
  const stack: { node: string; path: string[] }[] = [{ node: start, path: [start] }];
  const visited = new Set<string>();

  while (stack.length > 0) {
    const current = stack.pop()!;
    for (const next of needs.get(current.node) ?? []) {
      if (next === start) return [...current.path, start];
      if (visited.has(next)) continue;
      visited.add(next);
      stack.push({ node: next, path: [...current.path, next] });
    }
  }
  return null;
}

// ===========================================================================
// CÂU HỎI — DANH SÁCH & CHI TIẾT
// ===========================================================================

function buildItemWhere(filter: ItemFilter | ItemAnalyticsFilter): Prisma.QuestionItemWhereInput {
  const search = filter.search?.trim();
  const and: Prisma.QuestionItemWhereInput[] = [];

  const programWhere = programScopeWhere(filter.programCode);
  if (programWhere) and.push(programWhere);

  if (search) {
    and.push({
      OR: [
        { itemCode: { contains: search, mode: 'insensitive' } },
        { stem: { contains: search, mode: 'insensitive' } },
        { tags: { has: search } },
      ],
    });
  }

  return {
    subject: filter.subject,
    gradeBand: filter.gradeBand,
    chapterId: filter.chapterId,
    skillId: filter.skillId,
    difficulty: filter.difficulty,
    status: filter.status,
    ...(filter.tag ? { tags: { has: filter.tag } } : {}),
    ...(filter.hasOpenFlags ? { flags: { some: { status: 'OPEN' } } } : {}),
    ...(and.length > 0 ? { AND: and } : {}),
  };
}

function itemOrderBy(sort: ItemFilter['sort']): Prisma.QuestionItemOrderByWithRelationInput[] {
  switch (sort) {
    case 'CODE':
      return [{ itemCode: 'asc' }];
    case 'MOST_SERVED':
      return [{ timesServed: 'desc' }, { itemCode: 'asc' }];
    case 'MOST_REPORTED':
      return [{ reportCount: 'desc' }, { itemCode: 'asc' }];
    case 'LOWEST_DISCRIMINATION':
      return [{ discrimination: { sort: 'asc', nulls: 'last' } }, { itemCode: 'asc' }];
    default:
      return [{ updatedAt: 'desc' }];
  }
}

export interface ItemListRow {
  id: string;
  itemCode: string;
  subject: Subject;
  gradeBand: GradeBand;
  actualGradeScope: number[];
  programScope: string[];
  difficulty: Difficulty;
  difficultyNumeric: number;
  questionType: string;
  status: ItemStatus;
  statusLabel: string;
  version: number;
  stemPreview: string;
  tags: string[];
  estimatedTime: number;
  timesServed: number;
  timesCorrect: number;
  correctRate: number | null;
  reportCount: number;
  openFlagCount: number;
  discrimination: number | null;
  chapter: { id: string; code: string; name: string };
  skill: { id: string; code: string; name: string };
  publishedAt: Date | null;
  updatedAt: Date;
}

export async function listItems(
  filter: ItemFilter,
): Promise<{ rows: ItemListRow[]; total: number; page: number; pageSize: number; pageCount: number }> {
  const where = buildItemWhere(filter);
  const { skip, take, page, pageSize } = pagination(filter.page, filter.pageSize);

  const [total, items] = await Promise.all([
    prisma.questionItem.count({ where }),
    prisma.questionItem.findMany({
      where,
      orderBy: itemOrderBy(filter.sort),
      skip,
      take,
      select: {
        id: true,
        itemCode: true,
        subject: true,
        gradeBand: true,
        actualGradeScope: true,
        programScope: true,
        difficulty: true,
        difficultyNumeric: true,
        questionType: true,
        status: true,
        version: true,
        stem: true,
        tags: true,
        estimatedTime: true,
        timesServed: true,
        timesCorrect: true,
        reportCount: true,
        discrimination: true,
        publishedAt: true,
        updatedAt: true,
        chapter: { select: { id: true, code: true, name: true } },
        skill: { select: { id: true, code: true, name: true } },
        _count: { select: { flags: { where: { status: 'OPEN' } } } },
      },
    }),
  ]);

  const rows: ItemListRow[] = items.map((item) => ({
    id: item.id,
    itemCode: item.itemCode,
    subject: item.subject,
    gradeBand: item.gradeBand,
    actualGradeScope: item.actualGradeScope,
    programScope: item.programScope,
    difficulty: item.difficulty,
    difficultyNumeric: item.difficultyNumeric,
    questionType: item.questionType,
    status: item.status,
    statusLabel: ITEM_STATUS_LABEL[item.status],
    version: item.version,
    stemPreview: truncate(item.stem, 160),
    tags: item.tags,
    estimatedTime: item.estimatedTime,
    timesServed: item.timesServed,
    timesCorrect: item.timesCorrect,
    correctRate: item.timesServed > 0 ? item.timesCorrect / item.timesServed : null,
    reportCount: item.reportCount,
    openFlagCount: item._count.flags,
    discrimination: item.discrimination,
    chapter: item.chapter,
    skill: item.skill,
    publishedAt: item.publishedAt,
    updatedAt: item.updatedAt,
  }));

  return { rows, total, page, pageSize, pageCount: Math.max(1, Math.ceil(total / pageSize)) };
}

export interface ItemDetail {
  id: string;
  itemCode: string;
  subject: Subject;
  gradeBand: GradeBand;
  actualGradeScope: number[];
  programScope: string[];
  chapter: { id: string; code: string; name: string };
  skill: { id: string; code: string; name: string };
  difficulty: Difficulty;
  difficultyNumeric: number;
  questionType: string;
  stem: string;
  stemImageUrl: string | null;
  options: ItemOption[];
  correctAnswer: unknown;
  answerTolerance: number | null;
  solution: string;
  solutionSteps: unknown;
  hint: string | null;
  estimatedTime: number;
  tags: string[];
  status: ItemStatus;
  statusLabel: string;
  allowedTransitions: ItemStatus[];
  version: number;
  sourceNote: string | null;
  createdById: string | null;
  reviewedById: string | null;
  publishedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  stats: {
    timesServed: number;
    timesCorrect: number;
    correctRate: number | null;
    /** Đổi BigInt sang số để route JSON hóa được. */
    totalTimeMs: number;
    avgTimeSeconds: number | null;
    discrimination: number | null;
    reportCount: number;
  };
  versions: { version: number; reason: string | null; changedById: string | null; createdAt: Date }[];
  flags: {
    id: string;
    reason: string;
    detail: string | null;
    reporterRole: string;
    status: string;
    createdAt: Date;
  }[];
}

export async function getItem(id: string): Promise<ItemDetail> {
  const item = await prisma.questionItem.findUnique({
    where: { id },
    include: {
      chapter: { select: { id: true, code: true, name: true } },
      skill: { select: { id: true, code: true, name: true } },
      versions: {
        orderBy: { version: 'desc' },
        take: 20,
        select: { version: true, reason: true, changedById: true, createdAt: true },
      },
      flags: {
        orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
        take: 50,
        select: { id: true, reason: true, detail: true, reporterRole: true, status: true, createdAt: true },
      },
    },
  });
  if (!item) throw ApiError.notFound('Không tìm thấy câu hỏi.');

  const totalTimeMs = Number(item.totalTimeMs);
  return {
    id: item.id,
    itemCode: item.itemCode,
    subject: item.subject,
    gradeBand: item.gradeBand,
    actualGradeScope: item.actualGradeScope,
    programScope: item.programScope,
    chapter: item.chapter,
    skill: item.skill,
    difficulty: item.difficulty,
    difficultyNumeric: item.difficultyNumeric,
    questionType: item.questionType,
    stem: item.stem,
    stemImageUrl: item.stemImageUrl,
    options: parseOptions(item.options),
    correctAnswer: item.correctAnswer,
    answerTolerance: item.answerTolerance,
    solution: item.solution,
    solutionSteps: item.solutionSteps,
    hint: item.hint,
    estimatedTime: item.estimatedTime,
    tags: item.tags,
    status: item.status,
    statusLabel: ITEM_STATUS_LABEL[item.status],
    allowedTransitions: ITEM_STATUS_TRANSITIONS[item.status],
    version: item.version,
    sourceNote: item.sourceNote,
    createdById: item.createdById,
    reviewedById: item.reviewedById,
    publishedAt: item.publishedAt,
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
    stats: {
      timesServed: item.timesServed,
      timesCorrect: item.timesCorrect,
      correctRate: item.timesServed > 0 ? item.timesCorrect / item.timesServed : null,
      totalTimeMs,
      avgTimeSeconds: item.timesServed > 0 ? totalTimeMs / item.timesServed / 1000 : null,
      discrimination: item.discrimination,
      reportCount: item.reportCount,
    },
    versions: item.versions,
    flags: item.flags,
  };
}

// ===========================================================================
// CÂU HỎI — TẠO / SỬA / NHÂN BẢN
// ===========================================================================

async function resolveSkillContext(skillId: string) {
  const skill = await prisma.skill.findUnique({
    where: { id: skillId },
    include: { chapter: { select: { id: true, subject: true, gradeBand: true } } },
  });
  if (!skill) {
    throw ApiError.badRequest('Kỹ năng không tồn tại — hãy khai báo taxonomy trước khi thêm câu hỏi.');
  }
  return skill;
}

export async function createItem(input: CreateItemInput, actorId: string): Promise<QuestionItem> {
  const skill = await resolveSkillContext(input.skillId);
  if (input.chapterId && input.chapterId !== skill.chapterId) {
    throw ApiError.badRequest('Chương được chọn không khớp với chương của kỹ năng.');
  }

  const duplicate = await prisma.questionItem.findUnique({
    where: { itemCode: input.itemCode },
    select: { id: true },
  });
  if (duplicate) throw ApiError.conflict(`Mã câu hỏi "${input.itemCode}" đã tồn tại.`);

  const answerError = checkAnswerConsistency({
    questionType: input.questionType,
    options: input.options,
    correctAnswer: input.correctAnswer,
  });
  if (answerError) throw ApiError.badRequest(answerError);

  const config = await getConfig();
  const item = await prisma.questionItem.create({
    data: {
      itemCode: input.itemCode,
      programScope: input.programScope,
      actualGradeScope: input.actualGradeScope,
      subject: skill.chapter.subject,
      gradeBand: skill.chapter.gradeBand,
      chapterId: skill.chapterId,
      skillId: skill.id,
      difficulty: input.difficulty,
      difficultyNumeric: input.difficultyNumeric ?? defaultDifficultyNumeric(input.difficulty),
      questionType: input.questionType,
      stem: input.stem,
      stemImageUrl: input.stemImageUrl ?? null,
      options: input.options as unknown as Prisma.InputJsonValue,
      correctAnswer: input.correctAnswer as unknown as Prisma.InputJsonValue,
      answerTolerance: input.answerTolerance ?? null,
      solution: input.solution,
      solutionSteps: input.solutionSteps as unknown as Prisma.InputJsonValue,
      hint: input.hint ?? null,
      estimatedTime: input.estimatedTime ?? defaultEstimatedTimeSeconds(config.recommendation),
      tags: input.tags,
      sourceNote: input.sourceNote ?? null,
      // Câu mới luôn là bản nháp — xuất bản là một bước riêng có kiểm duyệt.
      status: 'DRAFT',
      version: 1,
      createdById: actorId,
    },
  });

  await writeAudit({
    actorId,
    action: AUDIT_ACTIONS.ITEM_CREATE,
    entityType: 'QuestionItem',
    entityId: item.id,
    after: itemSnapshot(item),
  });
  return item;
}

/** Trường ảnh hưởng trực tiếp tới việc chấm điểm và định tuyến của engine. */
const CRITICAL_ITEM_FIELDS = [
  'stem',
  'options',
  'correctAnswer',
  'answerTolerance',
  'solution',
  'questionType',
  'difficulty',
  'skillId',
] as const;

export async function updateItem(
  id: string,
  input: UpdateItemInput,
  actorId: string,
): Promise<QuestionItem> {
  const current = await prisma.questionItem.findUnique({ where: { id } });
  if (!current) throw ApiError.notFound('Không tìm thấy câu hỏi.');

  const data: Prisma.QuestionItemUncheckedUpdateInput = {};

  if (input.skillId && input.skillId !== current.skillId) {
    const skill = await resolveSkillContext(input.skillId);
    data.skillId = skill.id;
    data.chapterId = skill.chapterId;
    data.subject = skill.chapter.subject;
    data.gradeBand = skill.chapter.gradeBand;
  }

  const questionType = input.questionType ?? current.questionType;
  const options = input.options ?? parseOptions(current.options);
  const correctAnswer = input.correctAnswer ?? (current.correctAnswer as unknown);

  if (
    input.options !== undefined ||
    input.correctAnswer !== undefined ||
    input.questionType !== undefined
  ) {
    const answerError = checkAnswerConsistency({ questionType, options, correctAnswer });
    if (answerError) throw ApiError.badRequest(answerError);
  }

  if (input.programScope !== undefined) data.programScope = input.programScope;
  if (input.actualGradeScope !== undefined) data.actualGradeScope = input.actualGradeScope;
  if (input.difficulty !== undefined) {
    data.difficulty = input.difficulty;
    if (input.difficultyNumeric === undefined) data.difficultyNumeric = defaultDifficultyNumeric(input.difficulty);
  }
  if (input.difficultyNumeric !== undefined) data.difficultyNumeric = input.difficultyNumeric;
  if (input.questionType !== undefined) data.questionType = input.questionType;
  if (input.stem !== undefined) data.stem = input.stem;
  if (input.stemImageUrl !== undefined) data.stemImageUrl = input.stemImageUrl ?? null;
  if (input.options !== undefined) data.options = input.options as unknown as Prisma.InputJsonValue;
  if (input.correctAnswer !== undefined) {
    data.correctAnswer = input.correctAnswer as unknown as Prisma.InputJsonValue;
  }
  if (input.answerTolerance !== undefined) data.answerTolerance = input.answerTolerance ?? null;
  if (input.solution !== undefined) data.solution = input.solution;
  if (input.solutionSteps !== undefined) {
    data.solutionSteps = input.solutionSteps as unknown as Prisma.InputJsonValue;
  }
  if (input.hint !== undefined) data.hint = input.hint ?? null;
  if (input.estimatedTime !== undefined) data.estimatedTime = input.estimatedTime;
  if (input.tags !== undefined) data.tags = input.tags;
  if (input.sourceNote !== undefined) data.sourceNote = input.sourceNote ?? null;

  if (Object.keys(data).length === 0) {
    throw ApiError.badRequest('Không có thay đổi nào để lưu.');
  }

  const criticalChanged = CRITICAL_ITEM_FIELDS.some((field) => input[field] !== undefined);
  /**
   * Sửa nội dung/đáp án của câu đang phát hành thì phải rút khỏi kho xuất bản
   * và thẩm định lại; PUBLISHED → REVIEWED là bước hợp lệ trong specs §5.3.
   */
  const unpublish = criticalChanged && current.status === 'PUBLISHED';
  if (unpublish) {
    data.status = 'REVIEWED';
    data.publishedAt = null;
  }

  const [, updated] = await prisma.$transaction([
    prisma.questionItemVersion.upsert({
      where: { itemId_version: { itemId: current.id, version: current.version } },
      create: {
        itemId: current.id,
        version: current.version,
        snapshot: itemSnapshot(current) as Prisma.InputJsonValue,
        changedById: actorId,
        reason: input.reason ?? 'Cập nhật nội dung câu hỏi',
      },
      update: {},
    }),
    prisma.questionItem.update({
      where: { id: current.id },
      data: { ...data, version: current.version + 1 },
    }),
  ]);

  await writeAudit({
    actorId,
    action: AUDIT_ACTIONS.ITEM_UPDATE,
    entityType: 'QuestionItem',
    entityId: current.id,
    before: itemSnapshot(current),
    after: { ...itemSnapshot(updated), reason: input.reason ?? null, unpublished: unpublish },
  });

  return updated;
}

/** Nhân bản câu để biên soạn biến thể — bản sao luôn là bản nháp, số liệu về 0. */
export async function cloneItem(id: string, actorId: string): Promise<QuestionItem> {
  const source = await prisma.questionItem.findUnique({ where: { id } });
  if (!source) throw ApiError.notFound('Không tìm thấy câu hỏi cần nhân bản.');

  const base = `${source.itemCode}-C`;
  const taken = await prisma.questionItem.findMany({
    where: { itemCode: { startsWith: base } },
    select: { itemCode: true },
  });
  const takenSet = new Set(taken.map((t) => t.itemCode));
  let suffix = 1;
  while (takenSet.has(`${base}${suffix}`)) suffix += 1;

  const clone = await prisma.questionItem.create({
    data: {
      itemCode: `${base}${suffix}`,
      programScope: source.programScope,
      actualGradeScope: source.actualGradeScope,
      subject: source.subject,
      gradeBand: source.gradeBand,
      chapterId: source.chapterId,
      skillId: source.skillId,
      difficulty: source.difficulty,
      difficultyNumeric: source.difficultyNumeric,
      questionType: source.questionType,
      stem: source.stem,
      stemImageUrl: source.stemImageUrl,
      options: source.options as Prisma.InputJsonValue,
      correctAnswer: source.correctAnswer as Prisma.InputJsonValue,
      answerTolerance: source.answerTolerance,
      solution: source.solution,
      solutionSteps: source.solutionSteps as Prisma.InputJsonValue,
      hint: source.hint,
      estimatedTime: source.estimatedTime,
      tags: source.tags,
      sourceNote: `Nhân bản từ ${source.itemCode}`,
      status: 'DRAFT',
      version: 1,
      createdById: actorId,
    },
  });

  await writeAudit({
    actorId,
    action: CONTENT_AUDIT_ACTIONS.ITEM_CLONE,
    entityType: 'QuestionItem',
    entityId: clone.id,
    before: { sourceItemCode: source.itemCode },
    after: { itemCode: clone.itemCode },
  });
  return clone;
}

// ===========================================================================
// CÂU HỎI — WORKFLOW TRẠNG THÁI
// ===========================================================================

function assertPublishRight(actorRoles: Role[]): void {
  if (!actorRoles.some((role) => PUBLISH_ROLES.includes(role))) {
    throw ApiError.forbidden('Chỉ Reviewer, Quản lý chương trình hoặc Super Admin mới được xuất bản câu hỏi.');
  }
}

/** Câu chưa đủ chất lượng thì không được lên PUBLISHED — engine chỉ dùng câu này. */
function assertPublishable(item: QuestionItem): void {
  if (!item.solution.trim()) {
    throw ApiError.conflict('Không thể xuất bản câu chưa có lời giải chuẩn.');
  }
  const answerError = checkAnswerConsistency({
    questionType: item.questionType,
    options: parseOptions(item.options),
    correctAnswer: item.correctAnswer,
  });
  if (answerError) throw ApiError.conflict(`Không thể xuất bản: ${answerError}`);
}

export async function transitionItemStatus(
  id: string,
  next: ItemStatus,
  actorId: string,
  actorRoles: Role[],
): Promise<void> {
  const item = await prisma.questionItem.findUnique({ where: { id } });
  if (!item) throw ApiError.notFound('Không tìm thấy câu hỏi.');
  if (item.status === next) return;

  const allowed = ITEM_STATUS_TRANSITIONS[item.status];
  if (!allowed.includes(next)) {
    throw ApiError.badRequest(
      `Không thể chuyển từ "${ITEM_STATUS_LABEL[item.status]}" sang "${ITEM_STATUS_LABEL[next]}". Chuyển hợp lệ: ${allowed
        .map((s) => ITEM_STATUS_LABEL[s])
        .join(', ')}.`,
    );
  }

  if (next === 'PUBLISHED') {
    assertPublishRight(actorRoles);
    assertPublishable(item);
  }

  await prisma.questionItem.update({
    where: { id },
    data: {
      status: next,
      ...(next === 'PUBLISHED' ? { publishedAt: new Date(), reviewedById: actorId } : {}),
    },
  });

  await writeAudit({
    actorId,
    action: AUDIT_ACTIONS.ITEM_STATUS_CHANGE,
    entityType: 'QuestionItem',
    entityId: id,
    before: { status: item.status },
    after: { status: next, itemCode: item.itemCode },
  });
}

export interface BulkItemPatch {
  status?: ItemStatus;
  difficulty?: Difficulty;
  /** Thay thế toàn bộ tag hiện có (không cộng dồn). */
  tags?: string[];
  programScope?: string[];
}

/**
 * Sửa hàng loạt. Câu nào không chuyển trạng thái hợp lệ được thì bỏ qua thay vì
 * làm hỏng cả lô — số trả về là số câu thực sự đổi.
 */
export async function bulkUpdateItems(
  ids: string[],
  patch: BulkItemPatch,
  actorId: string,
  actorRoles: Role[],
): Promise<number> {
  const uniqueIds = Array.from(new Set(ids.filter(Boolean)));
  if (uniqueIds.length === 0) throw ApiError.badRequest('Chưa chọn câu hỏi nào.');
  if (uniqueIds.length > BULK_MAX_ITEMS) {
    throw ApiError.badRequest(`Mỗi lần chỉ sửa tối đa ${BULK_MAX_ITEMS} câu.`);
  }

  const data: Prisma.QuestionItemUncheckedUpdateManyInput = {};
  if (patch.difficulty !== undefined) data.difficulty = patch.difficulty;
  if (patch.tags !== undefined) data.tags = patch.tags;
  if (patch.programScope !== undefined) {
    data.programScope = patch.programScope.map((p) => p.toUpperCase());
  }
  if (patch.status !== undefined) data.status = patch.status;
  if (Object.keys(data).length === 0) throw ApiError.badRequest('Không có trường nào để cập nhật.');

  const items = await prisma.questionItem.findMany({
    where: { id: { in: uniqueIds } },
    select: { id: true, itemCode: true, status: true, solution: true },
  });
  if (items.length === 0) throw ApiError.notFound('Không tìm thấy câu hỏi nào trong danh sách đã chọn.');

  let eligible = items;
  if (patch.status !== undefined) {
    const nextStatus = patch.status;
    if (nextStatus === 'PUBLISHED') {
      assertPublishRight(actorRoles);
      // Thiếu lời giải là chặn cứng: AI không có nguồn grounding (specs §8.2).
      eligible = eligible.filter((item) => item.solution.trim().length > 0);
    }
    eligible = eligible.filter(
      (item) => item.status === nextStatus || ITEM_STATUS_TRANSITIONS[item.status].includes(nextStatus),
    );
    if (nextStatus === 'PUBLISHED') {
      data.publishedAt = new Date();
      data.reviewedById = actorId;
    }
  }

  if (eligible.length === 0) return 0;

  const result = await prisma.questionItem.updateMany({
    where: { id: { in: eligible.map((item) => item.id) } },
    data,
  });

  await writeAudit({
    actorId,
    action: CONTENT_AUDIT_ACTIONS.ITEM_BULK_UPDATE,
    entityType: 'QuestionItem',
    entityId: `bulk:${new Date().toISOString()}`,
    before: { requestedIds: uniqueIds, skipped: items.length - eligible.length },
    after: {
      updated: result.count,
      itemCodes: eligible.map((item) => item.itemCode),
      patch: {
        status: patch.status ?? null,
        difficulty: patch.difficulty ?? null,
        tags: patch.tags ?? null,
        programScope: patch.programScope ?? null,
      },
    },
  });

  return result.count;
}

// ===========================================================================
// BÁO LỖI CÂU HỎI
// ===========================================================================

export async function flagItem(input: FlagItemInput): Promise<void> {
  const item = await prisma.questionItem.findUnique({
    where: { id: input.itemId },
    select: { id: true, itemCode: true },
  });
  if (!item) throw ApiError.notFound('Không tìm thấy câu hỏi được báo lỗi.');

  await prisma.$transaction([
    prisma.itemFlag.create({
      data: {
        itemId: item.id,
        reporterId: input.reporterId ?? null,
        reporterRole: input.reporterRole,
        reason: input.reason,
        detail: input.detail ?? null,
      },
    }),
    prisma.questionItem.update({
      where: { id: item.id },
      data: { reportCount: { increment: 1 } },
    }),
  ]);

  await writeAudit({
    actorId: input.reporterId ?? null,
    actorRole: input.reporterRole,
    action: CONTENT_AUDIT_ACTIONS.ITEM_FLAG,
    entityType: 'QuestionItem',
    entityId: item.id,
    after: { itemCode: item.itemCode, reason: input.reason },
  });
}

export interface FlagListRow {
  id: string;
  reason: string;
  detail: string | null;
  reporterId: string | null;
  reporterRole: string;
  status: string;
  resolvedById: string | null;
  resolvedAt: Date | null;
  createdAt: Date;
  item: {
    id: string;
    itemCode: string;
    status: ItemStatus;
    statusLabel: string;
    stemPreview: string;
    skill: { id: string; code: string; name: string };
    chapter: { id: string; code: string; name: string };
  };
}

export async function listFlags(
  filter: FlagFilter,
): Promise<{ rows: FlagListRow[]; total: number; page: number; pageSize: number }> {
  const where: Prisma.ItemFlagWhereInput = {
    status: filter.status,
    itemId: filter.itemId,
    reporterRole: filter.reporterRole,
  };
  const { skip, take, page, pageSize } = pagination(filter.page, filter.pageSize);

  const [total, flags] = await Promise.all([
    prisma.itemFlag.count({ where }),
    prisma.itemFlag.findMany({
      where,
      orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
      skip,
      take,
      include: {
        item: {
          select: {
            id: true,
            itemCode: true,
            status: true,
            stem: true,
            skill: { select: { id: true, code: true, name: true } },
            chapter: { select: { id: true, code: true, name: true } },
          },
        },
      },
    }),
  ]);

  const rows: FlagListRow[] = flags.map((flag) => ({
    id: flag.id,
    reason: flag.reason,
    detail: flag.detail,
    reporterId: flag.reporterId,
    reporterRole: flag.reporterRole,
    status: flag.status,
    resolvedById: flag.resolvedById,
    resolvedAt: flag.resolvedAt,
    createdAt: flag.createdAt,
    item: {
      id: flag.item.id,
      itemCode: flag.item.itemCode,
      status: flag.item.status,
      statusLabel: ITEM_STATUS_LABEL[flag.item.status],
      stemPreview: truncate(flag.item.stem, 160),
      skill: flag.item.skill,
      chapter: flag.item.chapter,
    },
  }));

  return { rows, total, page, pageSize };
}

export async function resolveFlag(
  flagId: string,
  resolution: 'RESOLVED' | 'REJECTED',
  actorId: string,
): Promise<void> {
  const flag = await prisma.itemFlag.findUnique({
    where: { id: flagId },
    include: { item: { select: { id: true, itemCode: true, reportCount: true } } },
  });
  if (!flag) throw ApiError.notFound('Không tìm thấy phiếu báo lỗi.');
  if (flag.status !== 'OPEN') throw ApiError.conflict('Phiếu báo lỗi này đã được xử lý.');

  const operations: Prisma.PrismaPromise<unknown>[] = [
    prisma.itemFlag.update({
      where: { id: flagId },
      data: { status: resolution, resolvedById: actorId, resolvedAt: new Date() },
    }),
  ];

  // Báo lỗi bị bác bỏ thì trả lại reportCount để thống kê chất lượng không bị nhiễu.
  if (resolution === 'REJECTED') {
    operations.push(
      prisma.questionItem.update({
        where: { id: flag.itemId },
        data: { reportCount: Math.max(0, flag.item.reportCount - 1) },
      }),
    );
  }

  await prisma.$transaction(operations);

  await writeAudit({
    actorId,
    action: AUDIT_ACTIONS.ITEM_FLAG_RESOLVE,
    entityType: 'ItemFlag',
    entityId: flagId,
    before: { status: flag.status, reason: flag.reason },
    after: { status: resolution, itemCode: flag.item.itemCode },
  });
}

// ===========================================================================
// CỔNG CẤP CÂU CHO ENGINE
// ===========================================================================

/**
 * CỔNG DUY NHẤT cấp câu hỏi cho engine / bài kiểm tra / AI.
 * status = 'PUBLISHED' được ép ngay trong where — không bao giờ lọc ở tầng UI
 * (specs §19.2 #6). Mọi module khác PHẢI đi qua hàm này.
 */
export async function getPublishedItemPool(filter: PublishedPoolFilter): Promise<QuestionItem[]> {
  const and: Prisma.QuestionItemWhereInput[] = [];

  const programWhere = programScopeWhere(filter.programCode);
  if (programWhere) and.push(programWhere);

  if (filter.actualGrade !== undefined) {
    // Câu có actualGradeScope rỗng dùng cho cả khối; ngược lại phải đúng lớp thực tế.
    and.push({
      OR: [{ actualGradeScope: { isEmpty: true } }, { actualGradeScope: { has: filter.actualGrade } }],
    });
  }

  const where: Prisma.QuestionItemWhereInput = {
    status: 'PUBLISHED',
    subject: filter.subject,
    gradeBand: filter.gradeBand,
    ...(filter.skillIds && filter.skillIds.length > 0 ? { skillId: { in: filter.skillIds } } : {}),
    ...(filter.chapterIds && filter.chapterIds.length > 0 ? { chapterId: { in: filter.chapterIds } } : {}),
    ...(filter.difficulties && filter.difficulties.length > 0
      ? { difficulty: { in: filter.difficulties } }
      : {}),
    ...(filter.excludeItemIds && filter.excludeItemIds.length > 0
      ? { id: { notIn: filter.excludeItemIds } }
      : {}),
    ...(and.length > 0 ? { AND: and } : {}),
  };

  return prisma.questionItem.findMany({
    where,
    // Ưu tiên câu ít được giao để kho được khai thác đều, giảm lặp câu giữa HS.
    orderBy: [{ timesServed: 'asc' }, { id: 'asc' }],
    take: Math.min(POOL_MAX_ITEMS, filter.limit ?? POOL_MAX_ITEMS),
  });
}

// ===========================================================================
// DASHBOARD COVERAGE (specs §18 — chống rủi ro "skill không đủ câu")
// ===========================================================================

export type CoverageStatus = 'OK' | 'THIN' | 'EMPTY';

export interface CoverageSkillRow {
  skillId: string;
  skillCode: string;
  skillName: string;
  chapterId: string;
  chapterCode: string;
  chapterName: string;
  published: number;
  byDifficulty: Record<string, number>;
  missingByDifficulty: Record<string, number>;
  status: CoverageStatus;
  statusLabel: string;
}

export interface CoverageSummary {
  subject: Subject;
  gradeBand: GradeBand;
  programCode: string | null;
  totalChapters: number;
  totalSkills: number;
  publishedTotal: number;
  byDifficulty: Record<string, number>;
  okCount: number;
  thinCount: number;
  emptyCount: number;
  /** % kỹ năng đạt chuẩn phủ. */
  coveragePercent: number;
  minPerDifficulty: number;
  minTotal: number;
  /** specs §16.3: điều kiện go-live là không còn kỹ năng trống. */
  goLiveReady: boolean;
  message: string;
}

export async function getCoverageReport(
  input: CoverageFilter,
): Promise<{ skills: CoverageSkillRow[]; summary: CoverageSummary }> {
  const minPerDifficulty = Math.max(1, input.minPerDifficulty ?? COVERAGE_DEFAULTS.minPerDifficulty);
  const minTotal = Math.max(
    minPerDifficulty,
    input.minTotal ?? minPerDifficulty * DIFFICULTIES.length,
  );

  const chapters = await prisma.chapter.findMany({
    where: { subject: input.subject, gradeBand: input.gradeBand },
    orderBy: [{ order: 'asc' }, { code: 'asc' }],
    include: { skills: { orderBy: [{ order: 'asc' }, { code: 'asc' }] } },
  });

  const skillIds = chapters.flatMap((chapter) => chapter.skills.map((skill) => skill.id));

  const programWhere = programScopeWhere(input.programCode);
  const grouped =
    skillIds.length > 0
      ? await prisma.questionItem.groupBy({
          by: ['skillId', 'difficulty'],
          where: {
            skillId: { in: skillIds },
            status: 'PUBLISHED',
            ...(programWhere ? { AND: [programWhere] } : {}),
          },
          _count: { _all: true },
        })
      : [];

  const countsBySkill = new Map<string, Record<string, number>>();
  for (const row of grouped) {
    const entry = countsBySkill.get(row.skillId) ?? emptyDifficultyCounts();
    entry[row.difficulty] = row._count._all;
    countsBySkill.set(row.skillId, entry);
  }

  const skills: CoverageSkillRow[] = [];
  const totalByDifficulty = emptyDifficultyCounts();

  for (const chapter of chapters) {
    for (const skill of chapter.skills) {
      const byDifficulty = countsBySkill.get(skill.id) ?? emptyDifficultyCounts();
      const published = DIFFICULTIES.reduce((sum, d) => sum + (byDifficulty[d] ?? 0), 0);
      for (const difficulty of DIFFICULTIES) {
        totalByDifficulty[difficulty] += byDifficulty[difficulty] ?? 0;
      }

      const missingByDifficulty: Record<string, number> = {};
      for (const difficulty of DIFFICULTIES) {
        missingByDifficulty[difficulty] = Math.max(0, minPerDifficulty - (byDifficulty[difficulty] ?? 0));
      }

      const thin =
        published < minTotal || DIFFICULTIES.some((d) => (byDifficulty[d] ?? 0) < minPerDifficulty);
      const status: CoverageStatus = published === 0 ? 'EMPTY' : thin ? 'THIN' : 'OK';

      skills.push({
        skillId: skill.id,
        skillCode: skill.code,
        skillName: skill.name,
        chapterId: chapter.id,
        chapterCode: chapter.code,
        chapterName: chapter.name,
        published,
        byDifficulty,
        missingByDifficulty,
        status,
        statusLabel:
          status === 'EMPTY' ? 'Chưa có câu nào' : status === 'THIN' ? 'Thiếu câu' : 'Đủ câu',
      });
    }
  }

  // Đưa kỹ năng có vấn đề lên đầu: vận hành cần thấy chỗ thủng trước tiên.
  const rank: Record<CoverageStatus, number> = { EMPTY: 0, THIN: 1, OK: 2 };
  skills.sort((a, b) => rank[a.status] - rank[b.status] || a.published - b.published);

  const emptyCount = skills.filter((s) => s.status === 'EMPTY').length;
  const thinCount = skills.filter((s) => s.status === 'THIN').length;
  const okCount = skills.filter((s) => s.status === 'OK').length;
  const publishedTotal = skills.reduce((sum, s) => sum + s.published, 0);

  const summary: CoverageSummary = {
    subject: input.subject,
    gradeBand: input.gradeBand,
    programCode: input.programCode ?? null,
    totalChapters: chapters.length,
    totalSkills: skills.length,
    publishedTotal,
    byDifficulty: totalByDifficulty,
    okCount,
    thinCount,
    emptyCount,
    coveragePercent: skills.length === 0 ? 0 : Math.round((okCount / skills.length) * 100),
    minPerDifficulty,
    minTotal,
    goLiveReady: skills.length > 0 && emptyCount === 0,
    message:
      skills.length === 0
        ? 'Chưa khai báo kỹ năng nào cho môn/khối này — hãy dựng taxonomy trước khi nhập câu.'
        : emptyCount > 0
          ? `Còn ${emptyCount} kỹ năng chưa có câu nào đã xuất bản — chưa đủ điều kiện go-live.`
          : thinCount > 0
            ? `Có ${thinCount} kỹ năng còn mỏng (dưới ${minPerDifficulty} câu ở ít nhất một bậc độ khó).`
            : 'Kho câu hỏi đã phủ đủ mọi kỹ năng theo ngưỡng đang đặt.',
  };

  return { skills, summary };
}

// ===========================================================================
// ANALYTICS THEO CÂU HỎI
// ===========================================================================

export type ItemQualityFlag = 'TOO_EASY' | 'TOO_HARD' | 'TOO_SLOW' | 'HIGH_REPORT' | 'LOW_DATA' | 'LOW_DISCRIMINATION';

export const ITEM_QUALITY_FLAG_LABEL: Record<ItemQualityFlag, string> = {
  TOO_EASY: 'Quá dễ',
  TOO_HARD: 'Quá khó',
  TOO_SLOW: 'Tốn thời gian bất thường',
  HIGH_REPORT: 'Bị báo lỗi nhiều',
  LOW_DATA: 'Chưa đủ dữ liệu',
  LOW_DISCRIMINATION: 'Phân loại kém',
};

export interface ItemAnalyticsRow {
  id: string;
  itemCode: string;
  status: ItemStatus;
  statusLabel: string;
  difficulty: Difficulty;
  difficultyLabel: string;
  chapterName: string;
  skillName: string;
  timesServed: number;
  timesCorrect: number;
  correctRate: number | null;
  avgTimeSeconds: number | null;
  estimatedTime: number;
  timeRatio: number | null;
  reportCount: number;
  reportRate: number | null;
  discrimination: number | null;
  qualityFlags: ItemQualityFlag[];
  qualityLabels: string[];
}

export interface ItemAnalyticsSummary {
  itemsInView: number;
  itemsWithData: number;
  totalAttempts: number;
  avgCorrectRate: number | null;
  tooEasy: number;
  tooHard: number;
  tooSlow: number;
  highReport: number;
  lowData: number;
  thresholds: {
    minAttempts: number;
    easyThreshold: number;
    hardThreshold: number;
    slowRatio: number;
    reportRateThreshold: number;
  };
}

export async function getItemAnalytics(
  filter: ItemAnalyticsFilter,
): Promise<{
  rows: ItemAnalyticsRow[];
  total: number;
  page: number;
  pageSize: number;
  summary: ItemAnalyticsSummary;
}> {
  const thresholds = {
    minAttempts: filter.minAttempts ?? ANALYTICS_DEFAULTS.minAttempts,
    easyThreshold: filter.easyThreshold ?? ANALYTICS_DEFAULTS.easyThreshold,
    hardThreshold: filter.hardThreshold ?? ANALYTICS_DEFAULTS.hardThreshold,
    slowRatio: filter.slowRatio ?? ANALYTICS_DEFAULTS.slowRatio,
    reportRateThreshold: filter.reportRateThreshold ?? ANALYTICS_DEFAULTS.reportRateThreshold,
  };

  const where = buildItemWhere(filter);
  const { skip, take, page, pageSize } = pagination(filter.page, filter.pageSize);

  const [total, items] = await Promise.all([
    prisma.questionItem.count({ where }),
    prisma.questionItem.findMany({
      where,
      orderBy: itemOrderBy(filter.sort === 'RECENT' ? 'MOST_SERVED' : filter.sort),
      skip,
      take,
      select: {
        id: true,
        itemCode: true,
        status: true,
        difficulty: true,
        estimatedTime: true,
        timesServed: true,
        timesCorrect: true,
        totalTimeMs: true,
        discrimination: true,
        reportCount: true,
        chapter: { select: { name: true } },
        skill: { select: { name: true } },
      },
    }),
  ]);

  const rows: ItemAnalyticsRow[] = items.map((item) => {
    const served = item.timesServed;
    const correctRate = served > 0 ? item.timesCorrect / served : null;
    const avgTimeSeconds = served > 0 ? Number(item.totalTimeMs) / served / 1000 : null;
    const timeRatio =
      avgTimeSeconds !== null && item.estimatedTime > 0 ? avgTimeSeconds / item.estimatedTime : null;
    const reportRate = served > 0 ? item.reportCount / served : null;

    const qualityFlags: ItemQualityFlag[] = [];
    if (served < thresholds.minAttempts) {
      qualityFlags.push('LOW_DATA');
    } else {
      if (correctRate !== null && correctRate >= thresholds.easyThreshold) qualityFlags.push('TOO_EASY');
      if (correctRate !== null && correctRate <= thresholds.hardThreshold) qualityFlags.push('TOO_HARD');
      if (timeRatio !== null && timeRatio >= thresholds.slowRatio) qualityFlags.push('TOO_SLOW');
      if (item.discrimination !== null && item.discrimination < 0.1) {
        qualityFlags.push('LOW_DISCRIMINATION');
      }
    }
    if (reportRate !== null && reportRate >= thresholds.reportRateThreshold && item.reportCount > 0) {
      qualityFlags.push('HIGH_REPORT');
    }

    return {
      id: item.id,
      itemCode: item.itemCode,
      status: item.status,
      statusLabel: ITEM_STATUS_LABEL[item.status],
      difficulty: item.difficulty,
      difficultyLabel: DIFFICULTY_LABEL[item.difficulty],
      chapterName: item.chapter.name,
      skillName: item.skill.name,
      timesServed: served,
      timesCorrect: item.timesCorrect,
      correctRate,
      avgTimeSeconds,
      estimatedTime: item.estimatedTime,
      timeRatio,
      reportCount: item.reportCount,
      reportRate,
      discrimination: item.discrimination,
      qualityFlags,
      qualityLabels: qualityFlags.map((flag) => ITEM_QUALITY_FLAG_LABEL[flag]),
    };
  });

  const withData = rows.filter((row) => row.timesServed >= thresholds.minAttempts);
  const summary: ItemAnalyticsSummary = {
    itemsInView: rows.length,
    itemsWithData: withData.length,
    totalAttempts: rows.reduce((sum, row) => sum + row.timesServed, 0),
    avgCorrectRate:
      withData.length > 0
        ? withData.reduce((sum, row) => sum + (row.correctRate ?? 0), 0) / withData.length
        : null,
    tooEasy: rows.filter((row) => row.qualityFlags.includes('TOO_EASY')).length,
    tooHard: rows.filter((row) => row.qualityFlags.includes('TOO_HARD')).length,
    tooSlow: rows.filter((row) => row.qualityFlags.includes('TOO_SLOW')).length,
    highReport: rows.filter((row) => row.qualityFlags.includes('HIGH_REPORT')).length,
    lowData: rows.filter((row) => row.qualityFlags.includes('LOW_DATA')).length,
    thresholds,
  };

  return { rows, total, page, pageSize, summary };
}

/**
 * Tính lại quality_stats của một câu từ dữ liệu làm bài thật (specs §5.3).
 * Discrimination dùng quy tắc Kelley 27%: chênh lệch tỷ lệ đúng giữa nhóm học
 * sinh mạnh nhất và yếu nhất; dưới ngưỡng mẫu tối thiểu thì để null thay vì
 * đưa ra con số vô nghĩa.
 */
export async function recomputeItemStats(itemId: string): Promise<void> {
  const item = await prisma.questionItem.findUnique({
    where: { id: itemId },
    select: { id: true, itemCode: true },
  });
  if (!item) throw ApiError.notFound('Không tìm thấy câu hỏi.');

  const attempts = await prisma.itemAttempt.findMany({
    where: { itemId, isCorrect: { not: null } },
    select: { enrollmentId: true, isCorrect: true, timeMs: true },
    orderBy: { createdAt: 'asc' },
  });

  if (attempts.length === 0) {
    await prisma.questionItem.update({
      where: { id: itemId },
      data: { timesServed: 0, timesCorrect: 0, totalTimeMs: BigInt(0), discrimination: null },
    });
    return;
  }

  const timesServed = attempts.length;
  const timesCorrect = attempts.filter((a) => a.isCorrect === true).length;
  const totalTimeMs = attempts.reduce(
    (sum, a) => sum + BigInt(Math.max(0, Math.trunc(a.timeMs))),
    BigInt(0),
  );

  // Chỉ lấy lần làm ĐẦU TIÊN của mỗi học sinh để không bị nhiễu bởi làm lại.
  const firstResultByEnrollment = new Map<string, boolean>();
  for (const attempt of attempts) {
    if (!firstResultByEnrollment.has(attempt.enrollmentId)) {
      firstResultByEnrollment.set(attempt.enrollmentId, attempt.isCorrect === true);
    }
  }

  const discrimination = await computeDiscrimination(firstResultByEnrollment);

  await prisma.questionItem.update({
    where: { id: itemId },
    data: { timesServed, timesCorrect, totalTimeMs, discrimination },
  });

  await writeAudit({
    action: CONTENT_AUDIT_ACTIONS.ITEM_STATS_RECOMPUTE,
    entityType: 'QuestionItem',
    entityId: itemId,
    after: { itemCode: item.itemCode, timesServed, timesCorrect, discrimination },
  });
}

async function computeDiscrimination(firstResultByEnrollment: Map<string, boolean>): Promise<number | null> {
  const enrollmentIds = Array.from(firstResultByEnrollment.keys());
  if (enrollmentIds.length < MIN_STUDENTS_FOR_DISCRIMINATION) return null;

  const [totals, corrects] = await Promise.all([
    prisma.itemAttempt.groupBy({
      by: ['enrollmentId'],
      where: { enrollmentId: { in: enrollmentIds }, isCorrect: { not: null } },
      _count: { _all: true },
    }),
    prisma.itemAttempt.groupBy({
      by: ['enrollmentId'],
      where: { enrollmentId: { in: enrollmentIds }, isCorrect: true },
      _count: { _all: true },
    }),
  ]);

  const totalByEnrollment = new Map(totals.map((row) => [row.enrollmentId, row._count._all]));
  const correctByEnrollment = new Map(corrects.map((row) => [row.enrollmentId, row._count._all]));

  const ranked = enrollmentIds
    .map((id) => {
      const total = totalByEnrollment.get(id) ?? 0;
      const correct = correctByEnrollment.get(id) ?? 0;
      return { id, ability: total > 0 ? correct / total : 0 };
    })
    .sort((a, b) => b.ability - a.ability);

  const groupSize = Math.max(1, Math.round(ranked.length * DISCRIMINATION_GROUP_FRACTION));
  const top = ranked.slice(0, groupSize);
  const bottom = ranked.slice(-groupSize);

  const rate = (group: { id: string }[]): number =>
    group.filter((entry) => firstResultByEnrollment.get(entry.id) === true).length / group.length;

  return Number((rate(top) - rate(bottom)).toFixed(4));
}

// ===========================================================================
// XUẤT CSV (đối xứng với import — file xuất ra nhập lại được)
// ===========================================================================

function serializeCorrectAnswer(value: unknown): string {
  if (Array.isArray(value)) return value.map((v) => String(v)).join('|');
  if (value === null || value === undefined) return '';
  return String(value);
}

function serializeOptions(options: ItemOption[]): string {
  return options.map((option) => `${option.key}: ${option.text}`).join(' | ');
}

/** Xuất kho câu theo bộ lọc, dùng đúng bộ cột của file mẫu import. */
export async function exportItemsCsv(filter: ItemFilter): Promise<string> {
  const where = buildItemWhere(filter);
  const items = await prisma.questionItem.findMany({
    where,
    orderBy: [{ itemCode: 'asc' }],
    take: EXPORT_MAX_ROWS,
    include: {
      chapter: { select: { code: true } },
      skill: { select: { code: true } },
    },
  });

  const rows: Record<string, string>[] = items.map((item) => ({
    item_code: item.itemCode,
    program_scope: item.programScope.join('|'),
    grade_band: item.gradeBand,
    actual_grade_scope: item.actualGradeScope.join('|'),
    subject: item.subject,
    chapter_code: item.chapter.code,
    skill_code: item.skill.code,
    difficulty: item.difficulty,
    difficulty_numeric: String(item.difficultyNumeric),
    question_type: item.questionType,
    stem: item.stem,
    stem_image_url: item.stemImageUrl ?? '',
    options: serializeOptions(parseOptions(item.options)),
    correct_answer: serializeCorrectAnswer(item.correctAnswer),
    answer_tolerance: item.answerTolerance === null ? '' : String(item.answerTolerance),
    solution: item.solution,
    solution_steps: Array.isArray(item.solutionSteps)
      ? item.solutionSteps.map((step) => String(step)).join('|')
      : '',
    hint: item.hint ?? '',
    estimated_time: String(item.estimatedTime),
    tags: item.tags.join('|'),
    source_note: item.sourceNote ?? '',
    action: '',
  }));

  return toCsv(IMPORT_TEMPLATE_HEADERS, rows);
}
