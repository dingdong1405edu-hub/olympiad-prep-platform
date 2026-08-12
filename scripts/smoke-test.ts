/**
 * KIỂM THỬ TRỌN VÒNG trên database phát triển.
 *
 * Chạy:  npx tsx scripts/smoke-test.ts
 * Yêu cầu: PostgreSQL đang chạy và đã nạp dữ liệu mẫu (npm run db:seed).
 *
 * Kịch bản đi đúng vòng lặp nghiệp vụ của specs.md §21.3:
 *   đăng ký → kích hoạt khóa → tự khai mức → kiểm tra đầu vào → chấm và dựng
 *   hồ sơ năng lực → đặt mục tiêu → sinh lộ trình → làm bài trong ngày →
 *   kiểm tra tiến bộ → báo cáo.
 *
 * Script này KHÔNG dọn dẹp dữ liệu nó tạo ra: tài khoản thử dùng tiền tố
 * "smoke+<mốc thời gian>" nên chạy nhiều lần vẫn không đụng nhau, và dữ liệu
 * còn lại có ích khi cần xem tận mắt trong Prisma Studio.
 */
import { prisma } from '../src/lib/prisma';
import { registerStudent } from '../src/server/identity/service';
import { activateEnrollmentManually } from '../src/server/commerce/service';
import {
  getAssessmentStatus,
  getAttemptReport,
  startDiagnostic,
  submitAttempt,
  autosaveAttempt,
} from '../src/server/assessment/service';
import { getMasteryMap } from '../src/server/student-model/service';
import { createGoal, getGoalOptions, getTodayPlan } from '../src/server/plan/service';
import { getConfig } from '../src/lib/config';
import { addDays } from '../src/lib/dates';

// ---------------------------------------------------------------------------

let passed = 0;
let failed = 0;
const failures: string[] = [];

function check(label: string, condition: boolean, detail?: string): void {
  if (condition) {
    passed += 1;
    console.log(`  ✓ ${label}`);
  } else {
    failed += 1;
    failures.push(label + (detail ? ` — ${detail}` : ''));
    console.log(`  ✗ ${label}${detail ? ` — ${detail}` : ''}`);
  }
}

function section(title: string): void {
  console.log(`\n▸ ${title}`);
}

// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  const stamp = Date.now();
  console.log('KIỂM THỬ TRỌN VÒNG — nền tảng ôn luyện Olympic');
  console.log('='.repeat(60));

  // --- 0. Dữ liệu nền -------------------------------------------------------
  section('Dữ liệu nền');

  const course = await prisma.course.findFirst({
    where: { active: true, subject: 'MATH', gradeBand: 'B' },
    include: { program: true },
  });

  if (!course) {
    console.error(
      '\nKhông tìm thấy khóa Toán khối 6–7 nào. Hãy chạy "npm run db:seed" trước khi kiểm thử.',
    );
    process.exitCode = 1;
    return;
  }
  console.log(`  Khóa dùng để thử: ${course.program.name} — ${course.name}`);

  const publishedCount = await prisma.questionItem.count({
    where: { status: 'PUBLISHED', subject: 'MATH', gradeBand: 'B' },
  });
  check('Kho câu hỏi đã xuất bản không rỗng', publishedCount > 0, `${publishedCount} câu`);

  const skillCount = await prisma.skill.count({
    where: { chapter: { subject: 'MATH', gradeBand: 'B' } },
  });
  check('Cây kỹ năng đã khai báo', skillCount >= 20, `${skillCount} kỹ năng`);

  // --- 1. Đăng ký -----------------------------------------------------------
  section('Đăng ký tài khoản học sinh');

  const email = `smoke+${stamp}@example.com`;
  const registered = await registerStudent({
    fullName: 'Học sinh Kiểm Thử',
    email,
    password: 'SmokeTest@123',
    actualGrade: 7,
  });
  check('Tạo được tài khoản và hồ sơ học sinh', Boolean(registered.userId && registered.studentProfileId));

  const profile = await prisma.studentProfile.findUnique({
    where: { id: registered.studentProfileId },
  });
  check('Lưu đúng lớp thực tế (specs §3.2)', profile?.actualGrade === 7, `lớp ${profile?.actualGrade}`);
  check('Suy ra đúng khối từ lớp', profile?.gradeBand === 'B', `khối ${profile?.gradeBand}`);

  // --- 2. Kích hoạt khóa học ------------------------------------------------
  section('Kích hoạt khóa học (đường học bổng, không qua thanh toán)');

  const activation = await activateEnrollmentManually({
    studentUserId: registered.userId,
    courseId: course.id,
    source: 'SCHOLARSHIP',
    actorId: registered.userId,
  });
  const enrollmentId = activation.enrollmentId;
  check('Cấp được quyền truy cập mà không cần Payment (specs §11)', Boolean(enrollmentId));

  const enrollment = await prisma.enrollment.findUnique({ where: { id: enrollmentId } });
  check('Quyền truy cập không gắn cứng vào đơn hàng', enrollment?.paymentId === null);
  check('Trạng thái ghi danh là ACTIVE', enrollment?.status === 'ACTIVE');

  // --- 3. Tự khai mức + bài kiểm tra đầu vào --------------------------------
  section('Bài kiểm tra đầu vào');

  await prisma.enrollment.update({
    where: { id: enrollmentId },
    data: { selfDeclaredLevel: 'AVERAGE', onboardedAt: new Date() },
  });

  const diagnostic = await startDiagnostic(enrollmentId);
  check('Sinh được bài chẩn đoán', diagnostic.items.length > 0, `${diagnostic.items.length} câu`);
  check(
    'Đúng số câu theo cấu hình (mặc định 15)',
    diagnostic.items.length === diagnostic.itemCount,
    `${diagnostic.items.length}/${diagnostic.itemCount}`,
  );

  const leakedAnswer = diagnostic.items.some(
    (item) => 'correctAnswer' in (item as object) || 'solution' in (item as object),
  );
  check('KHÔNG lộ đáp án hay lời giải khi đang làm bài', !leakedAnswer);

  const distinctSkills = new Set<string>();
  const dbItems = await prisma.questionItem.findMany({
    where: { id: { in: diagnostic.items.map((item) => item.itemId) } },
    select: { id: true, skillId: true, status: true },
  });
  dbItems.forEach((item) => distinctSkills.add(item.skillId));
  check(
    'Chỉ lấy câu đã PUBLISHED (specs §19.2 #2)',
    dbItems.every((item) => item.status === 'PUBLISHED'),
  );
  check('Phủ nhiều kỹ năng khác nhau', distinctSkills.size >= 5, `${distinctSkills.size} kỹ năng`);

  const recommendations = await prisma.recommendation.count({ where: { enrollmentId } });
  check(
    'Ghi lý do chọn từng câu để kiểm toán (tiêu chí nghiệm thu §17)',
    recommendations > 0,
    `${recommendations} bản ghi`,
  );

  // Resume: gọi lại phải trả đúng bài đang dở, không tạo bài mới
  const resumed = await startDiagnostic(enrollmentId);
  check('Gọi lại trả về đúng bài đang dở, không tạo bài mới', resumed.attemptId === diagnostic.attemptId);

  // --- 4. Làm bài và autosave ----------------------------------------------
  section('Autosave và nộp bài');

  // Trả lời đúng một nửa số câu để tạo hồ sơ năng lực lệch, có chỗ mạnh chỗ yếu.
  const answerKeys = await prisma.questionItem.findMany({
    where: { id: { in: diagnostic.items.map((item) => item.itemId) } },
    select: { id: true, correctAnswer: true, questionType: true, options: true },
  });
  const keyById = new Map(answerKeys.map((item) => [item.id, item]));

  const answers = diagnostic.items.map((item, index) => {
    const key = keyById.get(item.itemId);
    const answerCorrectly = index % 2 === 0;
    let answer: unknown = null;
    if (key) {
      if (answerCorrectly) {
        answer = key.correctAnswer;
      } else if (key.questionType === 'NUMERIC') {
        answer = Number(key.correctAnswer) + 1;
      } else {
        const options = (key.options as { key: string }[]) ?? [];
        const wrong = options.find((option) => option.key !== key.correctAnswer);
        answer = wrong?.key ?? 'Z';
      }
    }
    return { itemAttemptId: item.itemAttemptId, answer, timeMs: 45_000 + index * 1_000 };
  });

  await autosaveAttempt({ attemptId: diagnostic.attemptId, userId: registered.userId, answers });
  await autosaveAttempt({ attemptId: diagnostic.attemptId, userId: registered.userId, answers });
  const afterAutosave = await prisma.assessmentAttempt.findUnique({
    where: { id: diagnostic.attemptId },
    include: { _count: { select: { itemAttempts: true } } },
  });
  check(
    'Autosave gọi nhiều lần không nhân bản dữ liệu',
    afterAutosave?._count.itemAttempts === diagnostic.items.length,
    `${afterAutosave?._count.itemAttempts} bản ghi`,
  );

  const report = await submitAttempt({ attemptId: diagnostic.attemptId, userId: registered.userId });
  check('Chấm bài ngay khi nộp', report.rawScore >= 0 && report.maxScore === diagnostic.items.length);
  check('Có điểm theo trọng số độ khó, không chỉ đếm câu đúng', report.weightedScore > 0);
  check('Ước lượng được mức năng lực', Boolean(report.estimatedLevel));
  check('Chỉ ra ưu tiên học trước', report.priorities.length > 0, `${report.priorities.length} ưu tiên`);

  // --- 5. Hồ sơ năng lực ----------------------------------------------------
  section('Hồ sơ năng lực');

  const masteryRows = await prisma.studentSkillMastery.count({ where: { enrollmentId } });
  check(
    'Lưu mastery cho MỌI kỹ năng, kể cả chưa có dữ liệu (specs §7.2)',
    masteryRows === skillCount,
    `${masteryRows}/${skillCount}`,
  );

  const snapshots = await prisma.masterySnapshot.count({ where: { enrollmentId } });
  check('Chụp mốc mastery làm baseline để đo tiến bộ', snapshots > 0, `${snapshots} bản ghi`);

  const map = await getMasteryMap(enrollmentId);
  check('Dựng được bản đồ năng lực theo chương', map.chapters.length > 0, `${map.chapters.length} chương`);

  const tiers = new Set(map.chapters.flatMap((chapter) => chapter.skills.map((skill) => skill.tier)));
  check('Phân hóa được mức thành thạo giữa các kỹ năng', tiers.size >= 2, `${tiers.size} mức khác nhau`);

  const status = await getAssessmentStatus(enrollmentId);
  check('Đặt được lịch kiểm tra tiến bộ kế tiếp', status.nextDueAt !== null);
  check('Ghi nhận đã làm bài đầu vào', status.hasDiagnostic);

  const fetched = await getAttemptReport(diagnostic.attemptId, registered.userId);
  check('Xem lại được báo cáo sau khi nộp', fetched.rawScore === report.rawScore);
  check('Lời giải chỉ hiện SAU khi nộp bài', fetched.items.every((item) => item.solution !== undefined));

  // --- 6. Mục tiêu và lộ trình ----------------------------------------------
  section('Đặt mục tiêu và sinh lộ trình');

  const options = await getGoalOptions(enrollmentId, { daysPerWeek: 5, minutesPerDay: 50 });
  check('Đề xuất được các phương án mục tiêu', options.length > 0, `${options.length} phương án`);
  check('Có đúng một phương án được khuyến nghị', options.filter((o) => o.recommended).length === 1);
  check(
    'Mỗi phương án đều nói rõ mức khả thi',
    options.every((o) => Boolean(o.feasibility.status && o.feasibility.message)),
  );

  const chosen = options.find((o) => o.recommended) ?? options[0]!;
  const goal = await createGoal({
    enrollmentId,
    targetLevel: chosen.targetLevel,
    deadline: addDays(new Date(), chosen.weeks * 7),
    daysPerWeek: 5,
    minutesPerDay: 50,
  });
  check('Lưu được mục tiêu và sinh lộ trình', Boolean(goal.goalId && goal.planId));

  const planDays = await prisma.studyPlanDay.findMany({
    where: { planId: goal.planId },
    include: { items: { include: { item: { select: { skillId: true, estimatedTime: true } } } } },
    orderBy: { dayIndex: 'asc' },
  });
  check('Sinh được các ngày học', planDays.length > 0, `${planDays.length} ngày`);

  const config = await getConfig();
  const overloaded = planDays.filter((day) => day.estimatedMinutes > config.recommendation.maxMinutesPerDay);
  check(
    'Không ngày nào vượt trần thời lượng cấu hình',
    overloaded.length === 0,
    `${overloaded.length} ngày vượt`,
  );

  const budget = 50 * config.recommendation.feasibilitySafetyFactor + 15;
  const overBudget = planDays.filter((day) => day.estimatedMinutes > budget);
  check(
    'Khối lượng bám quỹ thời gian học sinh khai (50 phút/ngày)',
    overBudget.length === 0,
    `${overBudget.length} ngày vượt quỹ`,
  );

  const allItemIds = planDays.flatMap((day) => day.items.map((planItem) => planItem.itemId));
  check(
    'Không giao lặp một câu trong cùng lộ trình (chống học thuộc)',
    new Set(allItemIds).size === allItemIds.length,
    `${allItemIds.length} câu, ${new Set(allItemIds).size} câu khác nhau`,
  );

  const blocks = new Set(planDays.flatMap((day) => day.items.map((planItem) => planItem.block)));
  check(
    'Cân bằng nhiều loại block, không chỉ đuổi theo điểm yếu',
    blocks.size >= 2,
    `${[...blocks].join(', ')}`,
  );

  const planRecommendations = await prisma.recommendation.count({
    where: { enrollmentId, planDayId: { not: null } },
  });
  check(
    'Mỗi câu trong lộ trình đều có lý do được lưu lại',
    planRecommendations > 0,
    `${planRecommendations} bản ghi`,
  );

  const today = await getTodayPlan(enrollmentId);
  check('Dựng được màn hình "Hôm nay học gì"', Boolean(today));

  // --- 7. Tiêu chí nghiệm thu: hai học sinh khác nhau → lộ trình khác nhau ---
  section('Cá nhân hóa: hai học sinh lỗi khác nhau nhận lộ trình khác nhau');

  const second = await registerStudent({
    fullName: 'Học sinh Đối Chứng',
    email: `smoke-b+${stamp}@example.com`,
    password: 'SmokeTest@123',
    actualGrade: 7,
  });
  const secondActivation = await activateEnrollmentManually({
    studentUserId: second.userId,
    courseId: course.id,
    source: 'SCHOLARSHIP',
    actorId: second.userId,
  });
  const secondEnrollmentId = secondActivation.enrollmentId;

  await prisma.enrollment.update({
    where: { id: secondEnrollmentId },
    data: { selfDeclaredLevel: 'AVERAGE', onboardedAt: new Date() },
  });

  const secondDiagnostic = await startDiagnostic(secondEnrollmentId);
  // Trả lời ĐẢO NGƯỢC so với học sinh A: A đúng câu chẵn, B đúng câu lẻ.
  const secondAnswers = secondDiagnostic.items.map((item, index) => {
    const key = keyById.get(item.itemId);
    const answerCorrectly = index % 2 === 1;
    let answer: unknown = null;
    if (key) {
      if (answerCorrectly) {
        answer = key.correctAnswer;
      } else if (key.questionType === 'NUMERIC') {
        answer = Number(key.correctAnswer) + 1;
      } else {
        const opts = (key.options as { key: string }[]) ?? [];
        answer = opts.find((option) => option.key !== key.correctAnswer)?.key ?? 'Z';
      }
    }
    return { itemAttemptId: item.itemAttemptId, answer, timeMs: 50_000 };
  });

  await autosaveAttempt({
    attemptId: secondDiagnostic.attemptId,
    userId: second.userId,
    answers: secondAnswers,
  });
  await submitAttempt({ attemptId: secondDiagnostic.attemptId, userId: second.userId });

  const secondOptions = await getGoalOptions(secondEnrollmentId, {
    daysPerWeek: 5,
    minutesPerDay: 50,
  });
  const secondChosen = secondOptions.find((o) => o.recommended) ?? secondOptions[0]!;
  const secondGoal = await createGoal({
    enrollmentId: secondEnrollmentId,
    targetLevel: secondChosen.targetLevel,
    deadline: addDays(new Date(), secondChosen.weeks * 7),
    daysPerWeek: 5,
    minutesPerDay: 50,
  });

  const secondItems = await prisma.planDayItem.findMany({
    where: { planDay: { planId: secondGoal.planId } },
    select: { itemId: true },
  });
  const setA = new Set(allItemIds);
  const setB = new Set(secondItems.map((row) => row.itemId));
  const shared = [...setB].filter((id) => setA.has(id)).length;
  const overlap = setB.size > 0 ? shared / setB.size : 1;

  check(
    'HAI HỌC SINH NHẬN BỘ BÀI KHÁC NHAU (tiêu chí nghiệm thu §17)',
    overlap < 0.75 && setB.size > 0,
    `trùng ${Math.round(overlap * 100)}% (${shared}/${setB.size} câu)`,
  );

  const masteryA = await getMasteryMap(enrollmentId);
  const masteryB = await getMasteryMap(secondEnrollmentId);
  check(
    'Hồ sơ năng lực hai em khác nhau',
    JSON.stringify(masteryA.weakest) !== JSON.stringify(masteryB.weakest),
  );

  // --- 8. Cách ly dữ liệu giữa các học sinh ---------------------------------
  section('Cách ly dữ liệu giữa học sinh');

  const other = { userId: second.userId };

  let blocked = false;
  try {
    await getAttemptReport(diagnostic.attemptId, other.userId);
  } catch {
    blocked = true;
  }
  check('Học sinh khác KHÔNG xem được bài của người này', blocked);

  // --- Tổng kết -------------------------------------------------------------
  console.log('\n' + '='.repeat(60));
  console.log(`KẾT QUẢ: ${passed} đạt, ${failed} không đạt`);
  if (failures.length > 0) {
    console.log('\nCác mục không đạt:');
    failures.forEach((item) => console.log(`  - ${item}`));
    process.exitCode = 1;
  } else {
    console.log('Toàn bộ vòng lặp nghiệp vụ chạy đúng.');
  }
}

main()
  .catch((error) => {
    console.error('\nKiểm thử dừng vì lỗi:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
