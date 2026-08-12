'use client';

import { Counter, Reveal } from '@/components/motion';

/**
 * Ba con số nói lên cách sản phẩm vận hành, không phải chỉ số marketing bịa ra:
 * đây là các tham số thật của hệ thống (số câu bài đầu vào, chu kỳ đánh giá,
 * thời lượng buổi tư vấn). Số chạy lên để mắt dừng lại ở đó một nhịp.
 */
const STATS = [
  { value: 15, suffix: ' câu', label: 'Bài kiểm tra đầu vào', hint: 'chọn theo cấu trúc đề thi' },
  { value: 14, suffix: ' ngày', label: 'Một chu kỳ đánh giá', hint: 'đo tiến bộ bằng câu neo' },
  { value: 20, suffix: ' phút', label: 'Tư vấn cùng giáo viên', hint: 'sau mỗi lần đo' },
];

export function HeroStats() {
  return (
    <Reveal delay={220}>
      <dl className="mx-auto mt-12 grid max-w-2xl grid-cols-1 gap-3 sm:grid-cols-3">
        {STATS.map((stat) => (
          <div
            key={stat.label}
            className="rounded-xl bg-white/80 px-4 py-4 ring-1 ring-ink-100 backdrop-blur"
          >
            <dd className="text-2xl font-bold tracking-tight text-brand-700">
              <Counter value={stat.value} suffix={stat.suffix} />
            </dd>
            <dt className="mt-0.5 text-sm font-medium text-ink-700">{stat.label}</dt>
            <p className="mt-0.5 text-xs text-ink-500">{stat.hint}</p>
          </div>
        ))}
      </dl>
    </Reveal>
  );
}
