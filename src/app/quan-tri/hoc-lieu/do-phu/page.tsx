import type { GradeBand, Subject } from '@prisma/client';
import { requireContentStaff } from '@/lib/auth';
import { routes } from '@/lib/routes';
import {
  COVERAGE_DEFAULTS,
  getCoverageReport,
  listChapters,
} from '@/server/content/service';
import { listPrograms } from '@/server/catalog/service';
import {
  GRADE_BAND_VALUES,
  SUBJECT_VALUES,
  coverageFilterSchema,
  type CoverageFilter,
} from '@/server/content/schemas';
import {
  DIFFICULTIES,
  DIFFICULTY_LABEL,
  GRADE_BAND_LABEL,
  SUBJECT_LABEL,
} from '@/lib/domain';
import {
  Alert,
  Button,
  Card,
  CardHeader,
  EmptyState,
  FilterBar,
  Input,
  Label,
  LinkButton,
  PageHeader,
  ProgressBar,
  Select,
  StatTile,
} from '@/components/ui';
import { CoverageTable } from './coverage-table';

export const dynamic = 'force-dynamic';

export const metadata = { title: 'Độ phủ học liệu' };

type SearchParams = Record<string, string | string[] | undefined>;

function readParam(params: SearchParams, key: string): string | undefined {
  const raw = params[key];
  const value = (Array.isArray(raw) ? raw[0] : raw)?.trim();
  return value ? value : undefined;
}

export default async function CoveragePage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  await requireContentStaff();
  const params = await searchParams;

  // Báo cáo luôn tính cho MỘT môn + MỘT khối. Mặc định nhảy vào tổ hợp đã có
  // chương để người mở lần đầu không rơi vào màn hình trống.
  const chapters = await listChapters({});
  const firstWithData = chapters[0];
  const fallbackSubject: Subject = firstWithData?.subject ?? 'MATH';
  const fallbackGradeBand: GradeBand = firstWithData?.gradeBand ?? 'A';

  const raw: Record<string, string> = {
    subject: readParam(params, 'subject') ?? fallbackSubject,
    gradeBand: readParam(params, 'gradeBand') ?? fallbackGradeBand,
  };
  const programCode = readParam(params, 'programCode');
  if (programCode) raw.programCode = programCode;
  const minPerDifficulty = readParam(params, 'minPerDifficulty');
  if (minPerDifficulty) raw.minPerDifficulty = minPerDifficulty;

  const parsed = coverageFilterSchema.safeParse(raw);
  const filter: CoverageFilter = parsed.success
    ? parsed.data
    : coverageFilterSchema.parse({ subject: fallbackSubject, gradeBand: fallbackGradeBand });

  const [{ skills, summary }, programs] = await Promise.all([
    getCoverageReport(filter),
    listPrograms({ includeInactive: true }),
  ]);

  const needAttention = summary.emptyCount + summary.thinCount;

  return (
    <>
      <PageHeader
        eyebrow="Kho câu hỏi"
        title="Độ phủ học liệu"
        subtitle="Kỹ năng nào chưa đủ câu đã xuất bản? Đây là chỗ thủng khiến engine phải lặp câu hoặc không tìm được đường học cho học sinh."
        action={
          <div className="flex flex-wrap items-center gap-2">
            <LinkButton href={routes.adminContent()} variant="secondary">
              ← Về kho câu hỏi
            </LinkButton>
            <LinkButton href={routes.adminContentImport()}>Nhập câu hàng loạt</LinkButton>
          </div>
        }
      />

      <FilterBar>
        <form
          method="get"
          action={routes.adminContentCoverage()}
          className="grid w-full gap-3 sm:grid-cols-2 lg:grid-cols-5"
        >
          <div>
            <Label htmlFor="subject">Môn</Label>
            <Select id="subject" name="subject" defaultValue={filter.subject}>
              {SUBJECT_VALUES.map((subject) => (
                <option key={subject} value={subject}>
                  {SUBJECT_LABEL[subject]}
                </option>
              ))}
            </Select>
          </div>

          <div>
            <Label htmlFor="gradeBand">Khối</Label>
            <Select id="gradeBand" name="gradeBand" defaultValue={filter.gradeBand}>
              {GRADE_BAND_VALUES.map((band) => (
                <option key={band} value={band}>
                  {GRADE_BAND_LABEL[band]}
                </option>
              ))}
            </Select>
          </div>

          <div>
            <Label htmlFor="programCode" hint="gồm cả câu dùng chung">
              Kỳ thi
            </Label>
            <Select id="programCode" name="programCode" defaultValue={filter.programCode ?? ''}>
              <option value="">Mọi kỳ thi</option>
              {programs.map((program) => (
                <option key={program.id} value={program.code}>
                  {program.code} — {program.name}
                </option>
              ))}
            </Select>
          </div>

          <div>
            <Label htmlFor="minPerDifficulty" hint="câu / mỗi bậc độ khó">
              Ngưỡng đủ câu
            </Label>
            <Input
              id="minPerDifficulty"
              name="minPerDifficulty"
              type="number"
              min={1}
              max={1000}
              defaultValue={filter.minPerDifficulty ?? COVERAGE_DEFAULTS.minPerDifficulty}
            />
          </div>

          <div className="flex items-end">
            <Button type="submit" variant="secondary" className="w-full">
              Xem báo cáo
            </Button>
          </div>
        </form>
      </FilterBar>

      <div className="stagger mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile
          label="Tổng kỹ năng"
          value={<span className="tabular-nums">{summary.totalSkills}</span>}
          hint={`${summary.totalChapters} chương đang khai báo`}
        />
        <StatTile
          label="Kỹ năng trống"
          value={<span className="tabular-nums">{summary.emptyCount}</span>}
          hint={summary.emptyCount > 0 ? 'Không có đường học' : 'Không còn chỗ trống'}
          tone={summary.emptyCount > 0 ? 'danger' : 'success'}
        />
        <StatTile
          label="Kỹ năng mỏng"
          value={<span className="tabular-nums">{summary.thinCount}</span>}
          hint={summary.thinCount > 0 ? 'Engine sẽ lặp câu' : 'Đủ câu để xoay vòng'}
          tone={summary.thinCount > 0 ? 'warn' : 'success'}
        />
        <StatTile
          label="Câu đã xuất bản"
          value={<span className="tabular-nums">{summary.publishedTotal}</span>}
          hint="Chỉ câu đã xuất bản mới được engine dùng"
        />
      </div>

      <Card className="mb-5">
        <CardHeader
          title="Mức độ sẵn sàng"
          subtitle={`Ngưỡng đang đặt: tối thiểu ${summary.minPerDifficulty} câu ở MỖI bậc độ khó và ${summary.minTotal} câu cho mỗi kỹ năng.`}
          action={
            <span className="text-2xl font-bold text-ink-900 tabular-nums">
              {summary.coveragePercent}%
            </span>
          }
        />

        <ProgressBar
          value={summary.coveragePercent}
          color={
            summary.emptyCount > 0
              ? 'bg-rose-500'
              : summary.thinCount > 0
                ? 'bg-amber-500'
                : 'bg-accent-600'
          }
        />
        <p className="mt-2 text-sm text-ink-600">
          <strong className="tabular-nums">{summary.okCount}</strong>/
          <span className="tabular-nums">{summary.totalSkills}</span> kỹ năng đã đủ câu ở cả{' '}
          {DIFFICULTIES.length} bậc độ khó ({DIFFICULTIES.map((d) => DIFFICULTY_LABEL[d]).join(' · ')}
          ).
        </p>

        <Alert
          tone={summary.emptyCount > 0 ? 'danger' : summary.thinCount > 0 ? 'warn' : 'success'}
          className="mt-4"
          title={
            summary.goLiveReady
              ? 'Đủ điều kiện go-live về mặt học liệu'
              : 'Chưa đủ điều kiện go-live về mặt học liệu'
          }
        >
          {summary.message}
          {needAttention > 0 ? (
            <>
              {' '}
              Kỹ năng trống và mỏng đã được đẩy lên đầu bảng bên dưới để đội nội dung xử lý trước.
            </>
          ) : null}
        </Alert>
      </Card>

      {skills.length === 0 ? (
        <EmptyState
          icon="🌱"
          title="Chưa có kỹ năng nào cho môn và khối này"
          description="Độ phủ được tính trên cây kiến thức. Hãy khai báo chương và kỹ năng trước, sau đó quay lại để theo dõi tiến độ nhập câu."
          action={<LinkButton href={routes.adminTaxonomy()}>Dựng cây kiến thức</LinkButton>}
        />
      ) : (
        <CoverageTable
          rows={skills}
          minPerDifficulty={summary.minPerDifficulty}
          minTotal={summary.minTotal}
        />
      )}
    </>
  );
}
