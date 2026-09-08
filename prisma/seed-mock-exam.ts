/**
 * NẠP ĐỀ THI THỬ TỪ FILE JSON (AI_GRADING_SPEC.md §12 B3).
 *
 *   npx tsx prisma/seed-mock-exam.ts        (hoặc: npm run db:seed:exam)
 *
 * Chạy lại bao nhiêu lần cũng được: mọi thao tác ghi đi qua `upsert` theo khóa
 * duy nhất (slug của đề, số câu trong đề, mã tiêu chí trong câu).
 *
 * KIỂM TRA TRƯỚC KHI GHI, không ghi nửa vời: tổng điểm các câu phải khớp
 * `total_points` in trên đề. Sai lệch nghĩa là file đề bị sửa hỏng — thà dừng
 * lại còn hơn để học sinh thi một đề 97 điểm mà màn hình ghi "/100".
 *
 * Thêm đề mới: bỏ file JSON vào `prisma/seed-data/`, khai thêm một dòng vào
 * `EXAM_FILES` bên dưới, rồi tăng SEED_VERSION để môi trường đã deploy tự nạp.
 */
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { PrismaClient, type MockGradingMode, type MockPart, type Prisma } from '@prisma/client';
import { z } from 'zod';

/** Các file đề sẽ được nạp, theo thứ tự hiển thị. */
const EXAM_FILES = [
  'exam-asmopss-12.json',
  'exam-asmopss-2019-math-primary.json',
  'exam-asmopss-2019-math-secondary.json',
  'exam-asmopss-2019-science-primary.json',
  'exam-asmopss-2019-science-secondary.json',
  'exam-asmopss-2022-math-primary.json',
  'exam-asmopss-2022-math-secondary.json',
  'exam-asmopss-2022-science-primary.json',
  'exam-asmopss-2022-science-secondary.json',
  'exam-asmopss-2020-math-primary.json',
  'exam-asmopss-2020-math-secondary.json',
  'exam-asmopss-2020-science-primary.json',
  'exam-asmopss-2020-science-secondary.json',
  'exam-final-asmopss-x-science-primary.json',
  'exam-final-asmopss-x-science-secondary.json',
] as const;

const PART: Record<string, MockPart> = {
  mcq: 'MCQ',
  short: 'SHORT',
  essay: 'ESSAY',
};

const GRADING_MODE: Record<string, MockGradingMode> = {
  exact: 'EXACT',
  numeric: 'NUMERIC',
  expression: 'EXPRESSION',
  grid: 'GRID',
  essay: 'ESSAY',
};

const rubricSchema = z.object({
  code: z.string().min(1),
  points: z.number().positive(),
  description: z.string().min(1),
});

const questionSchema = z.object({
  number: z.number().int().positive(),
  part: z.enum(['mcq', 'short', 'essay']),
  grading_mode: z.enum(['exact', 'numeric', 'expression', 'grid', 'essay']),
  max_points: z.number().positive(),
  prompt_md: z.string().min(1),
  image_url: z.string().nullish(),
  options: z.array(z.string()).optional(),
  answer_key: z.unknown(),
  solution_md: z.string().nullish(),
  config: z.record(z.unknown()).optional(),
  rubric: z.array(rubricSchema).optional(),
});

const examFileSchema = z.object({
  exam: z.object({
    slug: z.string().min(1),
    title: z.string().min(1),
    subject: z.string().nullish(),
    grade_level: z.string().nullish(),
    duration_min: z.number().int().positive(),
    total_points: z.number().positive(),
    instructions: z.string().nullish(),
  }),
  questions: z.array(questionSchema).min(1),
});

type ExamFile = z.infer<typeof examFileSchema>;

function readExamFile(fileName: string): ExamFile {
  const path = new URL(`./seed-data/${fileName}`, import.meta.url);
  const raw: unknown = JSON.parse(readFileSync(path, 'utf8'));
  return examFileSchema.parse(raw);
}

/**
 * Đề chỉ hợp lệ khi ba thứ khớp nhau: tổng điểm, số câu không trùng, và câu
 * chấm bằng barem thì phải CÓ barem — thiếu barem thì AI không có gì để bám và
 * sẽ tự nghĩ ra tiêu chí, đúng thứ spec §8.2 cấm.
 */
function assertConsistent(file: ExamFile, fileName: string): void {
  const { exam, questions } = file;

  const numbers = new Set(questions.map((q) => q.number));
  if (numbers.size !== questions.length) {
    throw new Error(`${fileName}: có số câu bị trùng.`);
  }

  const sum = questions.reduce((total, q) => total + q.max_points, 0);
  if (Math.abs(sum - exam.total_points) > 1e-6) {
    throw new Error(
      `${fileName}: tổng điểm các câu là ${sum} nhưng đề ghi ${exam.total_points}. ` +
        'Sửa file đề trước khi nạp.',
    );
  }

  for (const q of questions) {
    if (q.grading_mode === 'essay') {
      const rubricPoints = (q.rubric ?? []).reduce((total, c) => total + c.points, 0);
      if (!q.rubric || q.rubric.length === 0) {
        throw new Error(`${fileName}: câu ${q.number} chấm bằng barem nhưng không có barem.`);
      }
      if (rubricPoints - q.max_points > 1e-6) {
        throw new Error(
          `${fileName}: câu ${q.number} có barem cộng lại ${rubricPoints} điểm, ` +
            `vượt quá ${q.max_points} điểm tối đa của câu.`,
        );
      }
    }
    if (q.grading_mode === 'expression') {
      const cfg = q.config ?? {};
      if (!Array.isArray(cfg.digits) || typeof cfg.target !== 'number') {
        throw new Error(
          `${fileName}: câu ${q.number} chấm bằng verifier biểu thức nhưng thiếu ` +
            '`config.digits` hoặc `config.target`.',
        );
      }
    }
  }
}

async function seedOneExam(prisma: PrismaClient, fileName: string): Promise<string> {
  const file = readExamFile(fileName);
  assertConsistent(file, fileName);

  const { exam: meta, questions } = file;

  const exam = await prisma.mockExam.upsert({
    where: { slug: meta.slug },
    create: {
      slug: meta.slug,
      title: meta.title,
      subject: meta.subject ?? null,
      gradeLevel: meta.grade_level ?? null,
      durationMin: meta.duration_min,
      totalPoints: meta.total_points,
      instructions: meta.instructions ?? null,
      isPublished: true,
    },
    update: {
      title: meta.title,
      subject: meta.subject ?? null,
      gradeLevel: meta.grade_level ?? null,
      durationMin: meta.duration_min,
      totalPoints: meta.total_points,
      instructions: meta.instructions ?? null,
      isPublished: true,
    },
  });

  for (const q of questions) {
    const data = {
      part: PART[q.part]!,
      gradingMode: GRADING_MODE[q.grading_mode]!,
      maxPoints: q.max_points,
      promptMd: q.prompt_md,
      imageUrl: q.image_url ?? null,
      options: (q.options ?? []) as Prisma.InputJsonValue,
      answerKey: (q.answer_key ?? {}) as Prisma.InputJsonValue,
      solutionMd: q.solution_md ?? null,
      config: (q.config ?? {}) as Prisma.InputJsonValue,
    };

    const question = await prisma.mockExamQuestion.upsert({
      where: { examId_number: { examId: exam.id, number: q.number } },
      create: { examId: exam.id, number: q.number, ...data },
      update: data,
    });

    for (const [index, criterion] of (q.rubric ?? []).entries()) {
      await prisma.mockExamRubric.upsert({
        where: { questionId_code: { questionId: question.id, code: criterion.code } },
        create: {
          questionId: question.id,
          code: criterion.code,
          points: criterion.points,
          description: criterion.description,
          orderIndex: index,
        },
        update: {
          points: criterion.points,
          description: criterion.description,
          orderIndex: index,
        },
      });
    }

    // Barem trong file là bản chuẩn: mã nào không còn trong file thì bỏ đi,
    // nếu không AI vẫn thấy tiêu chí cũ và chấm theo barem đã bị thay.
    const keepCodes = (q.rubric ?? []).map((c) => c.code);
    await prisma.mockExamRubric.deleteMany({
      where: { questionId: question.id, code: { notIn: keepCodes.length > 0 ? keepCodes : [''] } },
    });
  }

  // Câu bị xóa khỏi file đề cũng phải biến khỏi database — nhưng chỉ khi chưa ai
  // làm nó, vì xóa câu là xóa luôn bài làm gắn với câu đó.
  const fileNumbers = questions.map((q) => q.number);
  const orphans = await prisma.mockExamQuestion.findMany({
    where: { examId: exam.id, number: { notIn: fileNumbers } },
    select: { id: true, number: true, _count: { select: { answers: true } } },
  });
  for (const orphan of orphans) {
    if (orphan._count.answers > 0) {
      console.warn(
        `[seed-exam] Câu ${orphan.number} không còn trong file đề nhưng đã có bài làm — giữ lại.`,
      );
      continue;
    }
    await prisma.mockExamQuestion.delete({ where: { id: orphan.id } });
  }

  return `${meta.slug}: ${questions.length} câu, ${meta.total_points} điểm`;
}

/** Nạp toàn bộ đề thi thử. Được `prisma/seed.ts` gọi khi seed cả hệ thống. */
export async function seedMockExams(prisma: PrismaClient): Promise<string[]> {
  const results: string[] = [];
  for (const fileName of EXAM_FILES) {
    results.push(await seedOneExam(prisma, fileName));
  }
  return results;
}

const invokedDirectly =
  process.argv[1] !== undefined && pathToFileURL(process.argv[1]).href === import.meta.url;

if (invokedDirectly) {
  const prisma = new PrismaClient();
  seedMockExams(prisma)
    .then((results) => {
      for (const line of results) console.log(`✓ ${line}`);
    })
    .catch((error: unknown) => {
      console.error('✗ Nạp đề thi thử thất bại:');
      console.error(error instanceof Error ? (error.stack ?? error.message) : error);
      process.exitCode = 1;
    })
    .finally(async () => {
      await prisma.$disconnect();
    });
}
