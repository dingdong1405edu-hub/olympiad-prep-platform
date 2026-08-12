import type { ReactNode } from 'react';
import Link from 'next/link';
import { ADMIN_ROLES, getSession, hasRole } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { getConfig } from '@/lib/config';
import { listPayments } from '@/server/commerce/service';
import { COVERAGE_DEFAULTS } from '@/server/content/service';
import { DIFFICULTIES, formatVnd } from '@/lib/domain';
import { addDays, formatDateTimeVN, vnToday } from '@/lib/dates';
import { routes } from '@/lib/routes';
import { Alert, Badge, Card, CardHeader, EmptyState, LinkButton, PageHeader, StatTile } from '@/components/ui';

export const dynamic = 'force-dynamic';

export const metadata = { title: 'Tổng quan vận hành' };

function count(value: number): string {
  return value.toLocaleString('vi-VN');
}

function percent(part: number, whole: number): number {
  return whole > 0 ? Math.round((part / whole) * 100) : 0;
}

/** Một việc cần xử lý: có số lượng, có đường dẫn đi thẳng tới màn hình xử lý. */
function TodoRow({
  label,
  value,
  href,
  hint,
  urgent,
}: {
  label: string;
  value: number;
  href: string;
  hint: string;
  urgent: boolean;
}) {
  return (
    <li className="flex flex-wrap items-center justify-between gap-3 py-3">
      <div className="min-w-0">
        <Link href={href} className="font-medium text-ink-800 hover:text-brand-700">
          {label}
        </Link>
        <p className="mt-0.5 text-sm text-ink-500">{hint}</p>
      </div>
      <Badge tone={value === 0 ? 'success' : urgent ? 'danger' : 'warn'}>
        {value === 0 ? 'Không còn tồn' : `${count(value)} việc`}
      </Badge>
    </li>
  );
}

function Section({ title, subtitle, children }: { title: string; subtitle?: string; children: ReactNode }) {
  return (
    <Card className="mt-6">
      <CardHeader title={title} subtitle={subtitle} />
      {children}
    </Card>
  );
}

export default async function AdminOverviewPage() {
  const session = await getSession();
  if (!session || !hasRole(session, ...ADMIN_ROLES)) {
    return (
      <Alert tone="warn" title="Trang này dành cho nhóm quản trị">
        Tài khoản của bạn đang ở nhóm học liệu. Bạn vẫn vào được kho câu hỏi, nhưng số liệu kinh doanh và
        vận hành chỉ mở cho Quản lý chương trình, Admin vận hành và Super Admin.
      </Alert>
    );
  }

  const config = await getConfig();

  // Cửa sổ "đang hoạt động" lấy từ ngưỡng cảnh báo bỏ học của giáo viên, không đặt số cứng.
  const activeWindowDays = config.teacher.alerts.inactiveDays;
  const activeSince = addDays(new Date(), -activeWindowDays);
  const today = vnToday();
  const now = new Date();

  // Ngưỡng "đủ câu" cho một kỹ năng dùng đúng công thức của dashboard độ phủ học liệu.
  const minItemsPerSkill = COVERAGE_DEFAULTS.minPerDifficulty * DIFFICULTIES.length;

  const [
    paidSummary,
    activeEnrollments,
    activeGroups,
    completedDays,
    dueDays,
    publishedItems,
    totalSkills,
    itemsBySkill,
    upcomingSessions,
    nextSession,
    pendingPayments,
    openFlags,
    unassignedEnrollments,
    expiringEnrollments,
    pendingOnboarding,
  ] = await Promise.all([
    // Doanh thu và số khóa đã bán lấy từ module Thương mại để dùng đúng một cách tính.
    listPayments({ status: 'PAID', pageSize: 1 }),
    prisma.enrollment.count({ where: { status: 'ACTIVE' } }),
    prisma.itemAttempt.groupBy({ by: ['enrollmentId'], where: { createdAt: { gte: activeSince } } }),
    prisma.studyPlanDay.count({ where: { status: 'COMPLETED' } }),
    prisma.studyPlanDay.count({ where: { date: { lte: today } } }),
    prisma.questionItem.count({ where: { status: 'PUBLISHED' } }),
    prisma.skill.count(),
    prisma.questionItem.groupBy({
      by: ['skillId'],
      where: { status: 'PUBLISHED' },
      _count: { _all: true },
    }),
    prisma.teacherSession.count({ where: { status: 'SCHEDULED', scheduledAt: { gte: now } } }),
    prisma.teacherSession.findFirst({
      where: { status: 'SCHEDULED', scheduledAt: { gte: now } },
      orderBy: { scheduledAt: 'asc' },
      select: {
        scheduledAt: true,
        teacher: { select: { user: { select: { fullName: true } } } },
      },
    }),
    prisma.payment.count({ where: { status: 'PENDING' } }),
    prisma.itemFlag.count({ where: { status: 'OPEN' } }),
    prisma.enrollment.count({ where: { status: 'ACTIVE', teacherAssignment: { is: null } } }),
    prisma.enrollment.count({
      where: {
        status: 'ACTIVE',
        expiresAt: { gte: now, lte: addDays(now, config.notification.triggers.accessExpiringBeforeDays) },
      },
    }),
    prisma.enrollment.count({ where: { status: 'ACTIVE', onboardedAt: null } }),
  ]);

  const skillsWithEnough = itemsBySkill.filter((row) => row._count._all >= minItemsPerSkill).length;
  const skillsShort = Math.max(0, totalSkills - skillsWithEnough);
  const skillsEmpty = Math.max(0, totalSkills - itemsBySkill.length);

  const activeStudents = activeGroups.length;
  const completionRate = percent(completedDays, dueDays);

  const hasAnyData = paidSummary.total > 0 || activeEnrollments > 0 || publishedItems > 0;

  return (
    <>
      <PageHeader
        title="Tổng quan vận hành"
        subtitle={`Xin chào ${session.fullName}. Đây là bức tranh nhanh của nền tảng hôm nay.`}
        action={
          <LinkButton href={routes.adminReports()} variant="secondary" size="sm">
            Xem báo cáo chi tiết
          </LinkButton>
        }
      />

      {!hasAnyData ? (
        <EmptyState
          title="Nền tảng chưa có dữ liệu vận hành"
          description="Hãy tạo kỳ thi và khóa học trước, sau đó nhập kho câu hỏi. Khi có học sinh đầu tiên, các số liệu ở đây sẽ tự cập nhật."
          action={<LinkButton href={routes.adminPrograms()}>Tạo kỳ thi đầu tiên</LinkButton>}
        />
      ) : null}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile
          label="Học sinh đang học"
          value={count(activeStudents)}
          hint={`Có làm bài trong ${activeWindowDays} ngày gần đây · ${count(activeEnrollments)} lượt ghi danh còn hiệu lực`}
        />
        <StatTile
          label="Khóa đã bán"
          value={count(paidSummary.total)}
          hint={`${count(pendingPayments)} đơn còn chờ thanh toán`}
        />
        <StatTile
          label="Doanh thu đã thu"
          value={formatVnd(paidSummary.paidAmount)}
          hint="Tổng các đơn ở trạng thái đã thanh toán"
        />
        <StatTile
          label="Hoàn thành lộ trình"
          value={`${completionRate}%`}
          hint={`${count(completedDays)}/${count(dueDays)} ngày học đã tới hạn`}
          tone={completionRate >= 70 ? 'success' : completionRate >= 40 ? 'warn' : 'danger'}
        />
        <StatTile
          label="Câu đã xuất bản"
          value={count(publishedItems)}
          hint="Chỉ câu đã xuất bản mới được engine giao cho học sinh"
        />
        <StatTile
          label="Kỹ năng chưa đủ câu"
          value={count(skillsShort)}
          hint={`Cần tối thiểu ${minItemsPerSkill} câu/kỹ năng · ${count(skillsEmpty)} kỹ năng chưa có câu nào`}
          tone={skillsEmpty > 0 ? 'danger' : skillsShort > 0 ? 'warn' : 'success'}
        />
        <StatTile
          label="Buổi tư vấn sắp tới"
          value={count(upcomingSessions)}
          hint={
            nextSession?.scheduledAt
              ? `Gần nhất: ${formatDateTimeVN(nextSession.scheduledAt)}${
                  nextSession.teacher?.user.fullName ? ` · ${nextSession.teacher.user.fullName}` : ''
                }`
              : 'Chưa có buổi nào được đặt lịch'
          }
        />
        <StatTile
          label="Chưa làm bài đầu vào"
          value={count(pendingOnboarding)}
          hint="Học sinh đã kích hoạt khóa nhưng chưa khởi động lộ trình"
          tone={pendingOnboarding > 0 ? 'warn' : 'success'}
        />
      </div>

      <Section
        title="Việc cần xử lý"
        subtitle="Danh sách rút gọn để đội vận hành biết nên mở màn hình nào trước."
      >
        <ul className="divide-y divide-ink-100">
          <TodoRow
            label="Kỹ năng chưa có câu hỏi nào"
            value={skillsEmpty}
            href={routes.adminContentCoverage()}
            hint="Engine không thể giao bài cho kỹ năng trống — đây là điều kiện bắt buộc trước khi mở bán."
            urgent
          />
          <TodoRow
            label="Câu hỏi bị báo lỗi chờ xử lý"
            value={openFlags}
            href={routes.adminContent()}
            hint="Học sinh hoặc giáo viên đã báo có vấn đề về đề bài, đáp án hoặc lời giải."
            urgent
          />
          <TodoRow
            label="Học sinh chưa có giáo viên phụ trách"
            value={unassignedEnrollments}
            href={routes.adminTeachers()}
            hint="Không có người phụ trách thì buổi tư vấn 20 phút sau mỗi chu kỳ sẽ bị bỏ trống."
            urgent={false}
          />
          <TodoRow
            label="Đơn hàng còn treo"
            value={pendingPayments}
            href={routes.adminPayments()}
            hint="Đơn chưa nhận được xác nhận từ cổng thanh toán — cần đối soát hoặc kích hoạt thủ công."
            urgent={false}
          />
          <TodoRow
            label={`Sắp hết quyền truy cập trong ${config.notification.triggers.accessExpiringBeforeDays} ngày`}
            value={expiringEnrollments}
            href={routes.adminUsers()}
            hint="Liên hệ gia hạn trước khi học sinh mất lộ trình đang học dở."
            urgent={false}
          />
        </ul>
      </Section>

      <Section title="Lối tắt thường dùng">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <LinkButton href={routes.adminPrograms()} variant="secondary">
            Kỳ thi, khóa học và bảng giá
          </LinkButton>
          <LinkButton href={routes.adminUsers()} variant="secondary">
            Người dùng và kích hoạt thủ công
          </LinkButton>
          <LinkButton href={routes.adminPayments()} variant="secondary">
            Giao dịch và hoàn tiền
          </LinkButton>
          <LinkButton href={routes.adminTeachers()} variant="secondary">
            Tải công việc giáo viên
          </LinkButton>
          <LinkButton href={routes.adminConfig()} variant="secondary">
            Cấu hình hệ thống
          </LinkButton>
          <LinkButton href={routes.adminAudit()} variant="secondary">
            Nhật ký thay đổi
          </LinkButton>
        </div>
      </Section>
    </>
  );
}
