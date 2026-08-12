'use client';

import { Counter, ProgressRing, Reveal } from '@/components/motion';
import { formatMinutes } from '@/lib/domain';

/**
 * Khối mở đầu trang kết quả. Điểm số chạy lên để mắt dừng lại một nhịp — đây là
 * khoảnh khắc học sinh chờ đợi nhất sau khi làm xong bài.
 */
export function ResultHero({
  rawScore,
  maxScore,
  percent,
  minutes,
  levelLabel,
}: {
  rawScore: number;
  maxScore: number;
  percent: number;
  minutes: number;
  levelLabel: string;
}) {
  return (
    <Reveal>
      <div className="rounded-2xl bg-gradient-to-br from-brand-600 to-brand-800 p-6 text-white shadow-[0_12px_28px_rgb(47_66_224/0.22)]">
        <div className="flex flex-wrap items-center justify-between gap-6">
          <div>
            <p className="text-sm font-medium text-brand-100">Kết quả của em</p>
            <p className="mt-1 text-4xl font-bold tracking-tight">
              <Counter value={rawScore} />
              <span className="text-2xl font-semibold text-brand-200">/{maxScore}</span>
            </p>
            <p className="mt-2 text-sm text-brand-100">
              Mức ước tính hiện tại: <strong className="text-white">{levelLabel}</strong>
            </p>
          </div>

          <div className="flex items-center gap-5">
            <div className="text-center">
              <ProgressRing
                value={percent}
                size={92}
                stroke={9}
                color="#ffffff"
                label={
                  <span className="text-lg font-bold text-white">
                    <Counter value={Math.round(percent)} suffix="%" />
                  </span>
                }
              />
              <p className="mt-1.5 text-xs text-brand-100">Điểm có trọng số</p>
            </div>
          </div>
        </div>

        <p className="mt-5 border-t border-white/20 pt-4 text-sm text-brand-100">
          Em làm bài trong {formatMinutes(minutes)}. Điểm có trọng số tính theo độ khó từng câu, nên
          làm đúng câu khó được ghi nhận nhiều hơn câu dễ.
        </p>
      </div>
    </Reveal>
  );
}
