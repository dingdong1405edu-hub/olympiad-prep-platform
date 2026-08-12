'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { StudentLevel } from '@prisma/client';
import { apiPost } from '@/lib/client';
import { API, routes } from '@/lib/routes';
import { Alert, Button, ChoiceCard } from '@/components/ui';

/** Mô tả bằng lời để học sinh tự nhận ra mình, thay vì chỉ đưa nhãn khô khan. */
const LEVELS: { value: StudentLevel; title: string; description: string }[] = [
  {
    value: 'WEAK',
    title: 'Em còn thấy khó',
    description: 'Nhiều phần em chưa nắm chắc, làm bài hay sai ở bước cơ bản.',
  },
  {
    value: 'AVERAGE',
    title: 'Em ở mức trung bình',
    description: 'Bài quen thuộc thì làm được, gặp bài lạ hoặc nhiều bước thì hay vướng.',
  },
  {
    value: 'GOOD',
    title: 'Em khá vững',
    description: 'Làm tốt phần lớn bài trên lớp, muốn luyện thêm dạng khó của kỳ thi.',
  },
  {
    value: 'EXCELLENT',
    title: 'Em học tốt',
    description: 'Em thường đạt điểm cao và muốn tập trung vào bài nâng cao, nhiều bước.',
  },
];

export function OnboardingForm({ enrollmentId }: { enrollmentId: string }) {
  const router = useRouter();
  const [level, setLevel] = useState<StudentLevel | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function submit() {
    if (!level) return;
    setError(null);
    setSubmitting(true);
    try {
      await apiPost(API.onboarding(enrollmentId), { selfDeclaredLevel: level });
      router.push(routes.diagnostic(enrollmentId));
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Không lưu được lựa chọn.');
      setSubmitting(false);
    }
  }

  return (
    <div>
      {error ? (
        <Alert tone="danger" className="mb-4">
          {error}
        </Alert>
      ) : null}

      <div className="stagger space-y-3">
        {LEVELS.map((option) => (
          <ChoiceCard
            key={option.value}
            selected={level === option.value}
            onClick={() => setLevel(option.value)}
            title={option.title}
            description={option.description}
          />
        ))}
      </div>

      <div className="mt-7 flex justify-end">
        <Button size="lg" onClick={submit} disabled={!level} loading={submitting}>
          {submitting ? 'Đang chuẩn bị bài…' : 'Tiếp tục'}
        </Button>
      </div>
    </div>
  );
}
