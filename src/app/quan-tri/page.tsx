import type { ReactNode } from 'react';
import Link from 'next/link';
import type { Role } from '@prisma/client';
import { ADMIN_ROLES, CONTENT_ROLES, getSession, hasRole } from '@/lib/auth';
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
        {/* Cũng lọc theo vai trò như khối lối tắt: mỗi dòng ở đây là một liên
            kết, và liên kết dẫn tới trang bị chặn thì chỉ tổ gây bực. */}
        <ul className="divide-y divide-ink-100">
          {[
            {
              label: 'Kỹ năng chưa có câu hỏi nào',
              value: skillsEmpty,
              href: routes.adminContentCoverage(),
              hint: 'Engine không thể giao bài cho kỹ năng trống — đây là điều kiện bắt buộc trước khi mở bán.',
              urgent: true,
              roles: CONTENT_ROLES,
            },
            {
              label: 'Câu hỏi bị báo lỗi chờ xử lý',
              value: openFlags,
              href: routes.adminContent(),
              hint: 'Học sinh hoặc giáo viên đã báo có vấn đề về đề bài, đáp án hoặc lời giải.',
              urgent: true,
              roles: CONTENT_ROLES,
            },
            {
              label: 'Học sinh chưa có giáo viên phụ trách',
              value: unassignedEnrollments,
              href: routes.adminTeachers(),
              hint: 'Không có người phụ trách thì buổi tư vấn 20 phút sau mỗi chu kỳ sẽ bị bỏ trống.',
              urgent: false,
              roles: ADMIN_ROLES,
            },
            {
              label: 'Đơn hàng còn treo',
              value: pendingPayments,
              href: routes.adminPayments(),
              hint: 'Đơn chưa nhận được xác nhận từ cổng thanh toán — cần đối soát hoặc kích hoạt thủ công.',
              urgent: false,
              roles: ADMIN_ROLES,
            },
            {
              label: `Sắp hết quyền truy cập trong ${config.notification.triggers.accessExpiringBeforeDays} ngày`,
              value: expiringEnrollments,
              href: routes.adminUsers(),
              hint: 'Liên hệ gia hạn trước khi học sinh mất lộ trình đang học dở.',
              urgent: false,
              roles: ['SUPER_ADMIN', 'OPS_ADMIN'] as Role[],
            },
          ]
            .filter((row) => hasRole(session, ...row.roles))
            .map((row) => (
              <TodoRow
                key={row.href + row.label}
                label={row.label}
                value={row.value}
                href={row.href}
                hint={row.hint}
                urgent={row.urgent}
              />
            ))}
        </ul>
      </Section>

      {/* Danh sách này viết theo VIỆC MUỐN LÀM chứ không theo tên trang.
          Bản trước chỉ liệt kê tên sáu trang và bỏ sót hẳn "Giao diện" — tức là
          trang sửa chữ không có lối vào nào ngoài thanh điều hướng, và trên điện
          thoại thanh đó lại nằm ngoài màn hình. Quản trị viên kết luận là hệ
          thống không cho sửa chữ, dù tính năng vẫn chạy. */}
      <Section
        title="Việc thường làm"
        subtitle="Bấm thẳng vào việc cần làm — không phải nhớ tên trang."
      >
        {/* Lọc theo vai trò: mời người ta bấm vào một trang mà họ bị chặn ngay
            khi tới nơi còn khó chịu hơn là không hiện lối tắt đó. */}
        <div className="grid gap-3 sm:grid-cols-2">
          {[
            {
              href: routes.adminSiteCopy(),
              title: 'Sửa chữ trên trang công khai',
              hint: 'Tiêu đề, mô tả, câu hỏi thường gặp, chân trang… Sửa xong bấm Lưu là trang đổi ngay, không cần lập trình.',
              roles: ['SUPER_ADMIN', 'PROGRAM_MANAGER'] as Role[],
            },
            {
              href: routes.adminPrograms(),
              title: 'Thêm / sửa kỳ thi và khóa học',
              hint: 'Giới thiệu, video, nội dung từng chặng, khối lớp, môn, giá bán và mã giảm giá.',
              roles: ADMIN_ROLES,
            },
            {
              href: routes.adminContentNew(),
              title: 'Thêm câu hỏi mới',
              hint: 'Soạn từng câu kèm đáp án, gợi ý và lời giải; hoặc nhập hàng loạt từ tệp CSV.',
              roles: CONTENT_ROLES,
            },
            {
              href: routes.adminUsers(),
              title: 'Thêm tài khoản và cấp quyền',
              hint: 'Tạo tài khoản nhân sự, đổi vai trò, khóa hoặc mở lại tài khoản.',
              roles: ['SUPER_ADMIN', 'OPS_ADMIN'] as Role[],
            },
            {
              href: routes.adminContentCoverage(),
              title: 'Kiểm tra độ phủ kho câu hỏi',
              hint: 'Kỹ năng nào chưa đủ câu để engine giao bài — cần xử lý trước khi mở bán.',
              roles: CONTENT_ROLES,
            },
            {
              href: routes.adminPayments(),
              title: 'Đối soát giao dịch',
              hint: 'Đơn còn treo, kích hoạt thủ công và hoàn tiền.',
              roles: ADMIN_ROLES,
            },
          ]
            .filter((task) => hasRole(session, ...task.roles))
            .map((task) => (
              <TaskLink key={task.href} href={task.href} title={task.title} hint={task.hint} />
            ))}
        </div>

        <div className="mt-4 flex flex-wrap gap-2 border-t border-ink-100 pt-4">
          <LinkButton href={routes.adminTeachers()} variant="ghost" size="sm">
            Tải công việc giáo viên
          </LinkButton>
          <LinkButton href={routes.adminReports()} variant="ghost" size="sm">
            Báo cáo chi tiết
          </LinkButton>
          <LinkButton href={routes.adminConfig()} variant="ghost" size="sm">
            Cấu hình hệ thống
          </LinkButton>
          <LinkButton href={routes.adminAudit()} variant="ghost" size="sm">
            Nhật ký thay đổi
          </LinkButton>
        </div>
      </Section>
    </>
  );
}

/** Một việc quản trị viên hay làm: nói rõ làm được gì, không chỉ tên trang. */
function TaskLink({ href, title, hint }: { href: string; title: string; hint: string }) {
  return (
    <Link
      href={href}
      className="hover-lift group rounded-xl bg-white p-4 ring-1 ring-ink-100 shadow-[0_1px_3px_rgb(120_70_45/0.05)]"
    >
      <p className="font-semibold text-ink-900 group-hover:text-warm-900">{title} →</p>
      <p className="mt-1 text-sm leading-relaxed text-ink-600">{hint}</p>
    </Link>
  );
}
