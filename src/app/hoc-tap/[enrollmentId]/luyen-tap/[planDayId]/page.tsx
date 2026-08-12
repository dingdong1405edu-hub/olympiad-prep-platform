import { requireSession } from '@/lib/auth';
import { getEnrollmentForUser } from '@/server/commerce/service';
import { getPlanDay } from '@/server/plan/service';
import { PracticePlayer } from './practice-player';

export const dynamic = 'force-dynamic';

export const metadata = { title: 'Luyện tập hôm nay' };

export default async function PracticePage({
  params,
}: {
  params: Promise<{ enrollmentId: string; planDayId: string }>;
}) {
  const { enrollmentId, planDayId } = await params;
  const session = await requireSession();

  // Kiểm tra quyền hai lớp: khóa phải của học sinh này, và ngày học phải thuộc khóa đó.
  await getEnrollmentForUser(session.id, enrollmentId);
  const day = await getPlanDay(planDayId, session.id);

  return (
    <PracticePlayer
      enrollmentId={enrollmentId}
      planDayId={planDayId}
      dateLabel={day.dateLabel}
      estimatedMinutes={day.estimatedMinutes}
    />
  );
}
