import { requireAdmin } from '@/lib/auth';
import {
  getBusinessKpis,
  getContentKpis,
  getEngineKpis,
  getLearningKpis,
  getRetentionKpis,
  getTeacherKpis,
} from '@/server/analytics/service';
import { formatVnd } from '@/lib/domain';
import { addDays, formatDateVN, vnToday } from '@/lib/dates';
import { Card, CardHeader, FilterBar, PageHeader, StatTile } from '@/components/ui';

export const dynamic = 'force-dynamic';

export const metadata = { title: 'Báo cáo' };

const RANGES = [7, 30, 90] as const;

function pct(value: number): string {
  return `${Math.round(value * (value <= 1 ? 100 : 1))}%`;
}

/** Sáu nhóm KPI của đặc tả §13.1, cùng chịu một bộ lọc thời gian phía trên. */
export default async function AdminReportsPage({
  searchParams,
}: {
  searchParams: Promise<{ days?: string }>;
}) {
  await requireAdmin();
  const { days } = await searchParams;
  const windowDays = RANGES.includes(Number(days) as never) ? Number(days) : 30;

  const to = new Date();
  const from = addDays(vnToday(), -windowDays);
  const range = { from, to };

  const [business, learning, content, engine, teacher, retention] = await Promise.all([
    getBusinessKpis(range),
    getLearningKpis(range),
    getContentKpis(),
    getEngineKpis(range),
    getTeacherKpis(range),
    getRetentionKpis(range),
  ]);

  return (
    <div>
      <PageHeader
        eyebrow="Quản trị"
        title="Báo cáo và chỉ số"
        subtitle={`Số liệu từ ${formatDateVN(from)} đến ${formatDateVN(to)}.`}
      />

      <FilterBar>
        <div>
          <p className="mb-1.5 text-sm font-medium text-ink-700">Khoảng thời gian</p>
          <div className="flex gap-2">
            {RANGES.map((option) => (
              <a
                key={option}
                href={`?days=${option}`}
                className={
                  option === windowDays
                    ? 'press rounded-lg bg-brand-600 px-3.5 py-2 text-sm font-medium text-white'
                    : 'press rounded-lg bg-white px-3.5 py-2 text-sm font-medium text-ink-600 ring-1 ring-ink-200 hover:bg-ink-50'
                }
              >
                {option} ngày
              </a>
            ))}
          </div>
        </div>
      </FilterBar>

      {/* 1. Kinh doanh */}
      <section className="mb-8">
        <h2 className="mb-3 text-lg font-bold text-ink-900">Kinh doanh</h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <StatTile label="Doanh thu" value={formatVnd(business.revenue.total)} hint={`${business.revenue.paidOrders} đơn`} />
          <StatTile label="Giá trị đơn trung bình" value={formatVnd(Math.round(business.revenue.averageOrderValue))} />
          <StatTile label="Xem → thanh toán" value={pct(business.funnel.viewToPaidRate)} hint={`${business.funnel.viewProgram} lượt xem`} />
          <StatTile label="Hoàn tiền" value={formatVnd(business.refund.amount)} hint={`${business.refund.orders} đơn`} />
        </div>
      </section>

      {/* 2. Học tập */}
      <section className="mb-8">
        <h2 className="mb-3 text-lg font-bold text-ink-900">Học tập</h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <StatTile label="Số câu đã làm" value={learning.practice.totalItems.toLocaleString('vi-VN')} hint={`${learning.practice.activeStudents} học sinh`} />
          <StatTile label="Tỷ lệ đúng" value={pct(learning.practice.accuracy)} />
          <StatTile label="Tổng phút học" value={learning.time.totalMinutes.toLocaleString('vi-VN')} />
          <StatTile
            label="Mastery thay đổi TB"
            value={`${learning.mastery.averageDelta >= 0 ? '+' : ''}${learning.mastery.averageDelta.toFixed(2)}`}
            hint={`${learning.mastery.measuredAttempts} lượt đo`}
          />
        </div>
      </section>

      {/* 3. Nội dung */}
      <section className="mb-8">
        <h2 className="mb-3 text-lg font-bold text-ink-900">Nội dung</h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <StatTile label="Câu đã xuất bản" value={content.items.published.toLocaleString('vi-VN')} hint={`${content.items.total} tổng`} />
          <StatTile
            label="Độ phủ kỹ năng"
            value={pct(content.skills.coverageRate)}
            hint={`${content.skills.withoutItems} kỹ năng trống`}
            tone={content.skills.withoutItems > 0 ? 'warn' : 'success'}
          />
          <StatTile label="Câu quá dễ / quá khó" value={`${content.quality.tooEasy} / ${content.quality.tooHard}`} hint={`${content.quality.evaluated} câu đủ dữ liệu`} />
          <StatTile
            label="Phiếu báo lỗi đang mở"
            value={content.flags.openFlags}
            tone={content.flags.openFlags > 0 ? 'warn' : 'neutral'}
          />
        </div>
      </section>

      {/* 4. Engine & AI */}
      <section className="mb-8">
        <h2 className="mb-3 text-lg font-bold text-ink-900">Engine và AI</h2>
        <Card>
          <CardHeader title="Chỉ số vận hành của engine cá nhân hóa" />
          <pre className="scroll-x rounded-lg bg-ink-50 p-3 font-mono text-xs text-ink-600">
            {JSON.stringify(engine, null, 2)}
          </pre>
        </Card>
      </section>

      {/* 5. Giáo viên & 6. Retention */}
      <section className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader title="Giáo viên" />
          <pre className="scroll-x rounded-lg bg-ink-50 p-3 font-mono text-xs text-ink-600">
            {JSON.stringify(teacher, null, 2)}
          </pre>
        </Card>
        <Card>
          <CardHeader title="Giữ chân học sinh" />
          <pre className="scroll-x rounded-lg bg-ink-50 p-3 font-mono text-xs text-ink-600">
            {JSON.stringify(retention, null, 2)}
          </pre>
        </Card>
      </section>
    </div>
  );
}
