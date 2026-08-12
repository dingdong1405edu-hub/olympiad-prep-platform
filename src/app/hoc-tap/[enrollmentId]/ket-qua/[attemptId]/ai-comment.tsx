'use client';

/**
 * Nhận xét của AI được tải RIÊNG sau khi trang đã hiện, để học sinh thấy điểm và
 * bản đồ năng lực ngay lập tức thay vì ngồi chờ mô hình ngôn ngữ trả lời.
 *
 * Khi hệ thống chưa cấu hình khóa AI, service tự sinh nhận xét từ dữ liệu có cấu
 * trúc và trả cờ fallbackUsed — giao diện vẫn hiển thị bình thường, chỉ ghi chú
 * nhỏ cho trung thực, KHÔNG báo lỗi cho học sinh.
 */
import { useEffect, useState } from 'react';
import { apiGet } from '@/lib/client';
import { API } from '@/lib/routes';
import { Card, CardHeader } from '@/components/ui';
import { SkeletonText } from '@/components/motion';

interface DiagnosticComment {
  summary: string;
  strengths: string[];
  weaknesses: string[];
  priorities: { skillName: string; why: string }[];
  encouragement: string;
  fallbackUsed: boolean;
}

interface ProgressComment {
  summary: string;
  improved: string[];
  stillWeak: string[];
  nextFocus: string[];
  fallbackUsed: boolean;
}

type Comment = Partial<DiagnosticComment & ProgressComment>;

export function AiComment({ attemptId, type }: { attemptId: string; type: string }) {
  const [data, setData] = useState<Comment | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let alive = true;
    const url =
      type === 'PROGRESS' ? API.aiProgressReport(attemptId) : API.aiDiagnosticComment(attemptId);

    apiGet<Comment>(url)
      .then((result) => {
        if (alive) setData(result);
      })
      .catch(() => {
        if (alive) setFailed(true);
      });

    return () => {
      alive = false;
    };
  }, [attemptId, type]);

  // Không có nhận xét cũng không sao — phần số liệu phía trên đã đủ dùng.
  if (failed) return null;

  if (!data) {
    return (
      <Card>
        <CardHeader title="Nhận xét dành riêng cho em" />
        <SkeletonText lines={4} />
      </Card>
    );
  }

  const positives = data.strengths ?? data.improved ?? [];
  const negatives = data.weaknesses ?? data.stillWeak ?? [];

  return (
    <Card className="animate-fade-up">
      <CardHeader title="Nhận xét dành riêng cho em" icon={<span aria-hidden>💬</span>} />

      {data.summary ? (
        <p className="stem-content text-ink-700">{data.summary}</p>
      ) : null}

      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        {positives.length > 0 ? (
          <div className="rounded-lg bg-accent-50 p-3.5">
            <p className="mb-2 text-sm font-semibold text-accent-700">Em đang làm tốt</p>
            <ul className="space-y-1.5 text-sm text-ink-700">
              {positives.map((line) => (
                <li key={line} className="flex gap-2">
                  <span aria-hidden className="text-accent-600">
                    ✓
                  </span>
                  {line}
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        {negatives.length > 0 ? (
          <div className="rounded-lg bg-amber-50 p-3.5">
            <p className="mb-2 text-sm font-semibold text-amber-800">Cần chú ý</p>
            <ul className="space-y-1.5 text-sm text-ink-700">
              {negatives.map((line) => (
                <li key={line} className="flex gap-2">
                  <span aria-hidden className="text-amber-600">
                    !
                  </span>
                  {line}
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </div>

      {data.nextFocus && data.nextFocus.length > 0 ? (
        <div className="mt-4">
          <p className="mb-1.5 text-sm font-semibold text-ink-700">Hai tuần tới nên tập trung</p>
          <ul className="list-inside list-disc space-y-1 text-sm text-ink-600">
            {data.nextFocus.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        </div>
      ) : null}

      {data.encouragement ? (
        <p className="mt-4 rounded-lg bg-brand-50 p-3.5 text-sm font-medium text-brand-800">
          {data.encouragement}
        </p>
      ) : null}

      {data.fallbackUsed ? (
        <p className="mt-4 text-xs text-ink-400">
          Nhận xét này được tổng hợp tự động từ số liệu bài làm.
        </p>
      ) : null}
    </Card>
  );
}
