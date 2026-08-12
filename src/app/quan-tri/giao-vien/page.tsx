import { requireAdmin } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { getConfig } from '@/lib/config';
import { SUBJECT_LABEL } from '@/lib/domain';
import { Alert, Badge, EmptyState, PageHeader, ProgressBar, StatTile, Table, Td, Tr } from '@/components/ui';

export const dynamic = 'force-dynamic';

export const metadata = { title: 'Giáo viên' };

/**
 * Bảng tải công việc giáo viên.
 * Đặc tả §18 nêu quá tải giáo viên là rủi ro lớn khi mở rộng quy mô — mỗi học
 * sinh cần 20 phút mỗi 2 tuần, nên phải nhìn thấy mức sử dụng trước khi bán thêm.
 */
export default async function AdminTeachersPage() {
  await requireAdmin();
  const config = await getConfig();

  const [teachers, unassigned] = await Promise.all([
    prisma.teacherProfile.findMany({
      include: {
        user: { select: { fullName: true, email: true } },
        _count: { select: { assignments: { where: { active: true } } } },
        sessions: {
          where: { status: 'SCHEDULED' },
          select: { id: true },
        },
      },
      orderBy: { createdAt: 'asc' },
    }),
    prisma.enrollment.count({ where: { status: 'ACTIVE', teacherAssignment: { is: null } } }),
  ]);

  const totalCapacity = teachers.reduce((sum, t) => sum + t.capacityPerCycle, 0);
  const totalAssigned = teachers.reduce((sum, t) => sum + t._count.assignments, 0);
  const overloaded = teachers.filter((t) => t._count.assignments > t.capacityPerCycle * 0.9);

  return (
    <div>
      <PageHeader
        eyebrow="Quản trị"
        title="Giáo viên và tải công việc"
        subtitle={`Mỗi học sinh cần ${config.teacher.sessionMinutes} phút tư vấn sau mỗi ${config.assessment.cycleDays} ngày.`}
      />

      <div className="mb-6 grid gap-3 sm:grid-cols-4">
        <StatTile label="Giáo viên" value={teachers.length} />
        <StatTile label="Đã phân công" value={totalAssigned} hint={`sức chứa ${totalCapacity}`} />
        <StatTile
          label="Mức sử dụng"
          value={totalCapacity > 0 ? `${Math.round((totalAssigned / totalCapacity) * 100)}%` : '0%'}
          tone={totalCapacity > 0 && totalAssigned / totalCapacity > 0.9 ? 'danger' : 'success'}
        />
        <StatTile
          label="Chưa có giáo viên"
          value={unassigned}
          hint={unassigned > 0 ? 'cần phân công' : 'đủ rồi'}
          tone={unassigned > 0 ? 'warn' : 'success'}
        />
      </div>

      {overloaded.length > 0 ? (
        <Alert tone="warn" className="mb-6" title="Có giáo viên sắp quá tải">
          {overloaded.map((t) => t.user.fullName).join(', ')} đang nhận số học sinh gần hoặc vượt
          sức chứa. Hãy tuyển thêm hoặc nâng sức chứa trước khi mở bán tiếp.
        </Alert>
      ) : null}

      {unassigned > 0 ? (
        <Alert tone="info" className="mb-6">
          Có <strong>{unassigned} học sinh</strong> đang học mà chưa được phân công giáo viên. Các
          em này sẽ không có buổi tư vấn sau kỳ đánh giá tới.
        </Alert>
      ) : null}

      {teachers.length === 0 ? (
        <EmptyState
          icon="🧑‍🏫"
          title="Chưa có giáo viên nào"
          description="Tạo tài khoản giáo viên ở mục Người dùng để bắt đầu phân công."
        />
      ) : (
        <Table head={['Giáo viên', 'Môn phụ trách', 'Học sinh / sức chứa', 'Mức sử dụng', 'Buổi sắp tới', 'Trạng thái']}>
          {teachers.map((teacher) => {
            const ratio =
              teacher.capacityPerCycle > 0
                ? teacher._count.assignments / teacher.capacityPerCycle
                : 0;
            return (
              <Tr key={teacher.id}>
                <Td className="font-medium text-ink-800">
                  {teacher.user.fullName}
                  <br />
                  <span className="text-xs text-ink-400">{teacher.user.email}</span>
                </Td>
                <Td className="text-ink-600">
                  {teacher.subjects.length > 0
                    ? teacher.subjects.map((s) => SUBJECT_LABEL[s]).join(', ')
                    : '—'}
                </Td>
                <Td className="tabular-nums">
                  {teacher._count.assignments} / {teacher.capacityPerCycle}
                </Td>
                <Td className="w-40">
                  <ProgressBar
                    value={Math.min(100, ratio * 100)}
                    color={ratio > 0.9 ? 'bg-rose-500' : ratio > 0.7 ? 'bg-amber-500' : 'bg-accent-600'}
                  />
                  <span className="mt-1 block text-xs text-ink-500 tabular-nums">
                    {Math.round(ratio * 100)}%
                  </span>
                </Td>
                <Td className="tabular-nums">{teacher.sessions.length}</Td>
                <Td>
                  <Badge tone={teacher.active ? 'success' : 'neutral'}>
                    {teacher.active ? 'Đang nhận' : 'Tạm ngừng'}
                  </Badge>
                </Td>
              </Tr>
            );
          })}
        </Table>
      )}
    </div>
  );
}
