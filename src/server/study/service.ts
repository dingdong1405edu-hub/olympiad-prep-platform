/**
 * TỔNG QUAN HỌC TẬP — dữ liệu cho màn hình "Khóa học của tôi".
 *
 * Module này không có bảng riêng; nó ghép ba nguồn đã có (ghi danh, lộ trình,
 * bài kiểm tra) thành đúng một câu trả lời: **bây giờ tôi nên làm gì?**
 *
 * Vì sao phải nằm ở tầng service chứ không viết thẳng trong trang: thứ tự ưu
 * tiên giữa "bài đang làm dở", "buổi học hôm nay" và "bài kiểm tra tới hạn" là
 * luật nghiệp vụ. Trang chỉ được phép trình bày, không được tự nghĩ ra luật —
 * nếu không, mỗi màn hình lại đề nghị học sinh một việc khác nhau.
 */
import { routes } from '@/lib/routes';
import { formatMinutes } from '@/lib/domain';
import {
  listEnrollmentsForUser,
  type EnrollmentSummary,
} from '@/server/commerce/service';
import { getTodayPlan, type PlanProgress } from '@/server/plan/service';
import { getAssessmentStatus } from '@/server/assessment/service';

/**
 * Loại việc cần làm tiếp. Thứ tự khai báo KHÔNG mang ý nghĩa; độ ưu tiên nằm ở
 * `STEP_PRIORITY` bên dưới để đọc một chỗ là thấy hết.
 */
export type StudyStepKind =
  | 'RESUME_ATTEMPT'
  | 'PRACTICE'
  | 'ASSESSMENT_DUE'
  | 'DIAGNOSTIC'
  | 'ONBOARDING'
  | 'GOAL'
  | 'PLAN'
  | 'REST'
  | 'CYCLE_END'
  | 'EMPTY_DAY'
  | 'BLOCKED';

/**
 * Việc cần làm tiếp của MỘT khóa.
 *
 * `title` là câu trả lời, `description` là lý do, `cta` là chữ trên nút. Tách ba
 * phần để giao diện xếp được theo nhiều cách mà không phải cắt chuỗi.
 */
export interface StudyStep {
  kind: StudyStepKind;
  title: string;
  description: string;
  cta: string;
  href: string;
  /** true = cần làm hôm nay; giao diện tô đậm và đưa lên đầu. */
  urgent: boolean;
}

/** Số càng nhỏ càng phải làm trước. */
const STEP_PRIORITY: Record<StudyStepKind, number> = {
  // Bỏ dở giữa chừng là trạng thái tệ nhất: bài đang tính giờ, câu đã trả lời
  // chưa được chấm. Luôn đứng đầu.
  RESUME_ATTEMPT: 0,
  PRACTICE: 1,
  ASSESSMENT_DUE: 2,
  // Ba việc "chưa khởi động được" — quan trọng nhưng không gấp trong ngày.
  ONBOARDING: 3,
  DIAGNOSTIC: 4,
  GOAL: 5,
  PLAN: 6,
  CYCLE_END: 7,
  EMPTY_DAY: 8,
  REST: 9,
  // Hết hạn hoặc bị khóa: không làm gì được nữa, đẩy xuống cuối danh sách.
  BLOCKED: 10,
};

export interface StudyCard {
  enrollment: EnrollmentSummary;
  step: StudyStep;
  progress: PlanProgress;
  /** Buổi học gần nhất trong lịch — có thể là hôm nay hoặc buổi kế tiếp. */
  day: {
    id: string;
    dateLabel: string;
    isToday: boolean;
    itemCount: number;
    doneCount: number;
    estimatedMinutes: number;
  } | null;
  goal: {
    targetLevelLabel: string;
    deadlineLabel: string;
    daysLeft: number;
    daysPerWeek: number;
    minutesPerDay: number;
  } | null;
  cycle: { cycleNo: number; completedDays: number; totalDays: number; percent: number } | null;
}

export interface StudyTotals {
  activeCourses: number;
  /** Chuỗi dài nhất trong các khóa — cộng dồn sẽ là con số vô nghĩa. */
  streakDays: number;
  minutesStudied: number;
  itemsAnswered: number;
  accuracy: number;
}

export interface StudyOverview {
  cards: StudyCard[];
  totals: StudyTotals;
  /** Thẻ gấp nhất; null khi chưa ghi danh khóa nào. */
  focus: StudyCard | null;
  /** Có ít nhất một khóa hết hạn hoặc bị khóa. */
  hasBlocked: boolean;
}

// ---------------------------------------------------------------------------

export async function getStudyOverview(userId: string): Promise<StudyOverview> {
  const enrollments = await listEnrollmentsForUser(userId);
  const cards = await Promise.all(enrollments.map((enrollment) => buildCard(enrollment)));

  cards.sort((a, b) => {
    const byPriority = STEP_PRIORITY[a.step.kind] - STEP_PRIORITY[b.step.kind];
    if (byPriority !== 0) return byPriority;
    // Cùng mức gấp thì khóa sắp hết hạn lên trước.
    return a.enrollment.daysLeft - b.enrollment.daysLeft;
  });

  return {
    cards,
    totals: sumTotals(cards),
    focus: cards.find((card) => card.step.kind !== 'BLOCKED') ?? null,
    hasBlocked: cards.some((card) => card.step.kind === 'BLOCKED'),
  };
}

// ---------------------------------------------------------------------------

const EMPTY_PROGRESS: PlanProgress = {
  completedDays: 0,
  totalDays: 0,
  completionRate: 0,
  minutesStudied: 0,
  streakDays: 0,
  itemsAnswered: 0,
  accuracy: 0,
};

async function buildCard(enrollment: EnrollmentSummary): Promise<StudyCard> {
  const base = { enrollment, progress: EMPTY_PROGRESS, day: null, goal: null, cycle: null };

  if (enrollment.status !== 'ACTIVE') {
    return {
      ...base,
      step: {
        kind: 'BLOCKED',
        title:
          enrollment.status === 'EXPIRED'
            ? `Quyền truy cập đã hết hạn ngày ${enrollment.expiresAtLabel}`
            : 'Quyền truy cập đang tạm khóa',
        description:
          enrollment.status === 'EXPIRED'
            ? 'Lộ trình và toàn bộ tiến độ vẫn được giữ nguyên. Gia hạn là học tiếp đúng chỗ đang dở.'
            : 'Hãy liên hệ bộ phận hỗ trợ để mở lại quyền truy cập cho khóa này.',
        cta: enrollment.status === 'EXPIRED' ? 'Xem khóa học' : 'Xem tài khoản',
        href:
          enrollment.status === 'EXPIRED'
            ? routes.course(enrollment.course.id)
            : routes.account(),
        urgent: false,
      },
    };
  }

  // Chưa khai hồ sơ thì chắc chắn chưa có lộ trình lẫn bài kiểm tra — gọi thêm
  // hai truy vấn nữa chỉ để nhận về toàn số 0.
  if (enrollment.onboardedAt === null) {
    return {
      ...base,
      step: {
        kind: 'ONBOARDING',
        title: 'Khai báo thông tin học tập',
        description:
          'Cho hệ thống biết bạn đang học lớp mấy và tự thấy mình ở mức nào, để chọn đúng độ khó cho bài kiểm tra đầu vào.',
        cta: 'Bắt đầu',
        href: routes.onboarding(enrollment.id),
        urgent: true,
      },
    };
  }

  const [status, today] = await Promise.all([
    getAssessmentStatus(enrollment.id),
    getTodayPlan(enrollment.id),
  ]);

  const day = today.day
    ? {
        id: today.day.id,
        dateLabel: today.day.dateLabel,
        isToday: today.isStudyDayToday,
        itemCount: today.day.itemCount,
        doneCount: today.day.doneCount,
        estimatedMinutes: today.day.estimatedMinutes,
      }
    : null;

  const card: Omit<StudyCard, 'step'> = {
    enrollment,
    progress: today.progress,
    day,
    goal: today.goal
      ? {
          targetLevelLabel: today.goal.targetLevelLabel,
          deadlineLabel: today.goal.deadlineLabel,
          daysLeft: today.goal.daysLeft,
          daysPerWeek: today.goal.daysPerWeek,
          minutesPerDay: today.goal.minutesPerDay,
        }
      : null,
    cycle: today.plan
      ? {
          cycleNo: today.cycleProgress.cycleNo,
          completedDays: today.cycleProgress.completedDays,
          totalDays: today.cycleProgress.totalDays,
          percent: today.cycleProgress.percent,
        }
      : null,
  };

  return { ...card, step: pickStep(enrollment, status, today, day) };
}

function pickStep(
  enrollment: EnrollmentSummary,
  status: Awaited<ReturnType<typeof getAssessmentStatus>>,
  today: Awaited<ReturnType<typeof getTodayPlan>>,
  day: StudyCard['day'],
): StudyStep {
  const id = enrollment.id;

  // 1. Bài kiểm tra đang làm dở — đồng hồ vẫn chạy, phải quay lại trước tiên.
  if (status.inProgressAttemptId) {
    return {
      kind: 'RESUME_ATTEMPT',
      title: 'Bạn có một bài kiểm tra đang làm dở',
      description:
        'Bài vẫn giữ nguyên các câu bạn đã trả lời. Nộp xong hệ thống mới tính lại được năng lực và lộ trình.',
      cta: 'Làm tiếp bài',
      href: routes.assessmentPlayer(id, status.inProgressAttemptId),
      urgent: true,
    };
  }

  // 2. Chưa có bài đầu vào thì chưa có gì để xếp lộ trình.
  if (!status.hasDiagnostic) {
    return {
      kind: 'DIAGNOSTIC',
      title: 'Làm bài kiểm tra đầu vào',
      description:
        'Bài trải đều các chương để hệ thống nhìn ra điểm mạnh và lỗ hổng thật sự. Sai cũng không sao — đây không phải bài chấm điểm.',
      cta: 'Làm bài đầu vào',
      href: routes.diagnostic(id),
      urgent: true,
    };
  }

  if (!today.goal) {
    return {
      kind: 'GOAL',
      title: 'Đặt mục tiêu học tập',
      description:
        'Bạn cho biết mỗi tuần học được mấy buổi và mỗi buổi bao nhiêu phút; hệ thống tính ngược ra các đích đến khả thi để bạn chọn.',
      cta: 'Đặt mục tiêu',
      href: routes.goalBuilder(id),
      urgent: true,
    };
  }

  if (!today.plan) {
    return {
      kind: 'PLAN',
      title: 'Tạo lộ trình cho chu kỳ đầu tiên',
      description:
        'Đã có mục tiêu và hồ sơ năng lực. Bước cuối là chia mục tiêu đó thành từng buổi học vừa sức.',
      cta: 'Tạo lộ trình',
      href: routes.studyDashboard(id),
      urgent: true,
    };
  }

  // 3. Buổi học của hôm nay còn câu chưa làm — việc chính của một ngày bình thường.
  if (day && day.isToday && day.doneCount < day.itemCount) {
    const remaining = day.itemCount - day.doneCount;
    const started = day.doneCount > 0;
    return {
      kind: 'PRACTICE',
      title: started ? `Còn ${remaining} câu là xong buổi hôm nay` : 'Buổi học hôm nay',
      description: started
        ? `Bạn đã làm ${day.doneCount}/${day.itemCount} câu. Phần còn lại khoảng ${formatMinutes(
            Math.round((day.estimatedMinutes * remaining) / Math.max(1, day.itemCount)),
          )}.`
        : `${day.itemCount} câu, khoảng ${formatMinutes(day.estimatedMinutes)}. Hệ thống chấm ngay sau mỗi câu.`,
      cta: started ? 'Tiếp tục học' : 'Bắt đầu học',
      href: routes.practice(id, day.id),
      urgent: true,
    };
  }

  // 4. Bài kiểm tra tiến bộ tới hạn. Xếp SAU buổi học hôm nay vì bài này có hạn
  //    tính bằng ngày, còn buổi học thì mất luôn nếu bỏ qua hôm nay.
  const assessment = today.nextAssessment;
  if (assessment && assessment.state === 'DUE') {
    return {
      kind: 'ASSESSMENT_DUE',
      title: `${assessment.name} đã tới hạn`,
      description: assessment.message,
      cta: 'Xem bài kiểm tra',
      href: routes.studyDashboard(id),
      urgent: true,
    };
  }

  // 5. Hết ngày học trong chu kỳ.
  if (!day) {
    return {
      kind: 'CYCLE_END',
      title: 'Chu kỳ này đã học hết',
      description:
        'Làm bài kiểm tra tiến bộ để hệ thống đo lại năng lực và mở chu kỳ mới với trọng tâm khác.',
      cta: 'Vào khóa học',
      href: routes.studyDashboard(id),
      urgent: false,
    };
  }

  if (day.itemCount === 0) {
    return {
      kind: 'EMPTY_DAY',
      title: 'Buổi học này chưa có câu hỏi',
      description:
        'Kho câu của các kỹ năng đang ưu tiên còn thiếu. Đội chuyên môn đang bổ sung, bạn quay lại sau nhé.',
      cta: 'Xem lộ trình',
      href: routes.studyDashboard(id),
      urgent: false,
    };
  }

  // 6. Không còn việc bắt buộc: hôm nay là ngày nghỉ, hoặc buổi hôm nay đã xong.
  const doneToday = day.isToday && day.doneCount >= day.itemCount;
  return {
    kind: 'REST',
    title: doneToday ? 'Xong buổi hôm nay rồi!' : 'Hôm nay là ngày nghỉ',
    description: doneToday
      ? `Buổi kế tiếp theo lịch là ${day.dateLabel}. Nghỉ đúng lịch cũng là một phần của lộ trình.`
      : `Buổi kế tiếp: ${day.dateLabel} — ${day.itemCount} câu, khoảng ${formatMinutes(day.estimatedMinutes)}. Bạn vẫn có thể học sớm.`,
    cta: doneToday ? 'Xem lộ trình' : 'Học sớm buổi tới',
    href: doneToday ? routes.studyDashboard(id) : routes.practice(id, day.id),
    urgent: false,
  };
}

/**
 * Gộp số liệu của mọi khóa.
 *
 * Tỷ lệ đúng phải tính lại từ tổng số câu chứ KHÔNG lấy trung bình cộng các tỷ
 * lệ: một khóa mới làm 5 câu đúng cả 5 sẽ kéo con số chung lên như thể nó ngang
 * hàng với khóa đã làm 300 câu.
 */
function sumTotals(cards: StudyCard[]): StudyTotals {
  let minutesStudied = 0;
  let itemsAnswered = 0;
  let correct = 0;
  let streakDays = 0;

  for (const card of cards) {
    const p = card.progress;
    minutesStudied += p.minutesStudied;
    itemsAnswered += p.itemsAnswered;
    correct += p.accuracy * p.itemsAnswered;
    streakDays = Math.max(streakDays, p.streakDays);
  }

  return {
    activeCourses: cards.filter((card) => card.enrollment.status === 'ACTIVE').length,
    streakDays,
    minutesStudied,
    itemsAnswered,
    accuracy: itemsAnswered === 0 ? 0 : correct / itemsAnswered,
  };
}
