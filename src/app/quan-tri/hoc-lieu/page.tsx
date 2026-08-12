import { requireSession, hasRole, CONTENT_ROLES, PUBLISH_ROLES } from '@/lib/auth';
import { routes } from '@/lib/routes';
import { listChapters, listItems, listSkills } from '@/server/content/service';
import { listPrograms } from '@/server/catalog/service';
import {
  DIFFICULTY_VALUES,
  GRADE_BAND_VALUES,
  ITEM_STATUS_VALUES,
  SUBJECT_VALUES,
  itemFilterSchema,
  type ItemFilter,
} from '@/server/content/schemas';
import {
  DIFFICULTY_LABEL,
  GRADE_BAND_LABEL,
  ITEM_STATUS_LABEL,
  SUBJECT_LABEL,
} from '@/lib/domain';
import {
  Alert,
  Card,
  EmptyState,
  Input,
  Label,
  LinkButton,
  PageHeader,
  Select,
} from '@/components/ui';
import { ItemsTable } from './items-table';

export const dynamic = 'force-dynamic';

export const metadata = { title: 'Kho câu hỏi' };

type SearchParams = Record<string, string | string[] | undefined>;

/** Lấy 1 giá trị chuỗi từ query, bỏ qua ô rỗng do form gửi lên. */
function readParam(params: SearchParams, key: string): string | undefined {
  const raw = params[key];
  const value = (Array.isArray(raw) ? raw[0] : raw)?.trim();
  return value ? value : undefined;
}

const FILTER_KEYS = [
  'search',
  'subject',
  'gradeBand',
  'chapterId',
  'skillId',
  'difficulty',
  'status',
  'programCode',
  'tag',
  'hasOpenFlags',
  'sort',
  'pageSize',
] as const;

const SORT_LABEL: Record<ItemFilter['sort'], string> = {
  RECENT: 'Sửa gần nhất',
  CODE: 'Mã câu (A→Z)',
  MOST_SERVED: 'Được giao nhiều nhất',
  MOST_REPORTED: 'Bị báo lỗi nhiều nhất',
  LOWEST_DISCRIMINATION: 'Phân loại kém nhất',
};

const PAGE_SIZE_OPTIONS = [25, 50, 100];

export default async function ContentItemsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  // hasRole thay vì requireContentStaff: Admin vận hành KHÔNG nằm trong nhóm học
  // liệu, và ném lỗi ở Server Component thì thành trang lỗi 500 không nói gì.
  // Thiếu quyền là chuyện bình thường, phải nói thành lời.
  const session = await requireSession();
  if (!hasRole(session, ...CONTENT_ROLES)) {
    return (
      <div>
        <PageHeader eyebrow="Quản trị" title="Kho câu hỏi" />
        <Alert tone="warn" title="Bạn không có quyền vào kho câu hỏi">
          Khu học liệu dành cho Biên soạn viên, Reviewer, Quản lý chương trình và Super Admin. Tài
          khoản Admin vận hành quản lý tài khoản và thanh toán, không soạn câu hỏi.
        </Alert>
      </div>
    );
  }

  const params = await searchParams;

  // Chỉ giữ khóa hợp lệ và bỏ ô rỗng trước khi validate — form GET luôn gửi kèm ô trống.
  const raw: Record<string, string> = {};
  for (const key of FILTER_KEYS) {
    const value = readParam(params, key);
    if (value) raw[key] = value;
  }
  const pageValue = readParam(params, 'page');
  if (pageValue) raw.page = pageValue;

  const parsed = itemFilterSchema.safeParse(raw);
  const filter: ItemFilter = parsed.success ? parsed.data : itemFilterSchema.parse({});

  const [result, chapters, skills, programs] = await Promise.all([
    listItems(filter),
    listChapters({ subject: filter.subject, gradeBand: filter.gradeBand }),
    listSkills({
      subject: filter.subject,
      gradeBand: filter.gradeBand,
      chapterId: filter.chapterId,
    }),
    listPrograms({ includeInactive: true }),
  ]);

  const canPublish = hasRole(session, ...PUBLISH_ROLES);

  /** Giữ nguyên bộ lọc khi chuyển trang. */
  function pageHref(page: number): string {
    const query = new URLSearchParams();
    for (const [key, value] of Object.entries(raw)) {
      if (key !== 'page' && value) query.set(key, value);
    }
    query.set('page', String(page));
    return `${routes.adminContent()}?${query.toString()}`;
  }

  return (
    <>
      <PageHeader
        title="Kho câu hỏi"
        subtitle="Nơi vận hành sống hằng ngày: biên soạn, thẩm định, xuất bản và theo dõi chất lượng câu hỏi."
        action={<LinkButton href={routes.adminContentNew()}>Thêm câu hỏi</LinkButton>}
      />

      <div className="mb-5 flex flex-wrap gap-2">
        <LinkButton href={routes.adminContentImport()} variant="secondary" size="sm">
          Nhập hàng loạt từ CSV
        </LinkButton>
        <LinkButton href={routes.adminContentCoverage()} variant="secondary" size="sm">
          Báo cáo độ phủ
        </LinkButton>
        <LinkButton href={routes.adminTaxonomy()} variant="secondary" size="sm">
          Cây kiến thức
        </LinkButton>
      </div>

      <Card className="mb-5">
        <form method="get" action={routes.adminContent()} className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div className="sm:col-span-2">
            <Label htmlFor="search">Tìm kiếm</Label>
            <Input
              id="search"
              name="search"
              defaultValue={filter.search ?? ''}
              placeholder="Mã câu, nội dung đề hoặc tag"
            />
          </div>

          <div>
            <Label htmlFor="subject">Môn</Label>
            <Select id="subject" name="subject" defaultValue={filter.subject ?? ''}>
              <option value="">Tất cả môn</option>
              {SUBJECT_VALUES.map((subject) => (
                <option key={subject} value={subject}>
                  {SUBJECT_LABEL[subject]}
                </option>
              ))}
            </Select>
          </div>

          <div>
            <Label htmlFor="gradeBand">Khối</Label>
            <Select id="gradeBand" name="gradeBand" defaultValue={filter.gradeBand ?? ''}>
              <option value="">Tất cả khối</option>
              {GRADE_BAND_VALUES.map((band) => (
                <option key={band} value={band}>
                  {GRADE_BAND_LABEL[band]}
                </option>
              ))}
            </Select>
          </div>

          <div>
            <Label htmlFor="chapterId" hint="lọc theo môn/khối phía trên">
              Chương
            </Label>
            <Select id="chapterId" name="chapterId" defaultValue={filter.chapterId ?? ''}>
              <option value="">Tất cả chương</option>
              {chapters.map((chapter) => (
                <option key={chapter.id} value={chapter.id}>
                  {chapter.code} — {chapter.name}
                </option>
              ))}
            </Select>
          </div>

          <div>
            <Label htmlFor="skillId" hint="chọn chương rồi lọc lại để thu hẹp">
              Kỹ năng
            </Label>
            <Select id="skillId" name="skillId" defaultValue={filter.skillId ?? ''}>
              <option value="">Tất cả kỹ năng</option>
              {skills.map((skill) => (
                <option key={skill.id} value={skill.id}>
                  {skill.chapter.code} · {skill.code} — {skill.name}
                </option>
              ))}
            </Select>
          </div>

          <div>
            <Label htmlFor="difficulty">Độ khó</Label>
            <Select id="difficulty" name="difficulty" defaultValue={filter.difficulty ?? ''}>
              <option value="">Mọi độ khó</option>
              {DIFFICULTY_VALUES.map((difficulty) => (
                <option key={difficulty} value={difficulty}>
                  {DIFFICULTY_LABEL[difficulty]}
                </option>
              ))}
            </Select>
          </div>

          <div>
            <Label htmlFor="status">Trạng thái</Label>
            <Select id="status" name="status" defaultValue={filter.status ?? ''}>
              <option value="">Mọi trạng thái</option>
              {ITEM_STATUS_VALUES.map((status) => (
                <option key={status} value={status}>
                  {ITEM_STATUS_LABEL[status]}
                </option>
              ))}
            </Select>
          </div>

          <div>
            <Label htmlFor="programCode">Kỳ thi</Label>
            <Select id="programCode" name="programCode" defaultValue={filter.programCode ?? ''}>
              <option value="">Mọi kỳ thi</option>
              {programs.map((program) => (
                <option key={program.id} value={program.code}>
                  {program.code} — {program.name}
                </option>
              ))}
            </Select>
            <p className="mt-1.5 text-xs text-ink-500">Gồm cả câu dùng chung cho mọi kỳ thi.</p>
          </div>

          <div>
            <Label htmlFor="sort">Sắp xếp</Label>
            <Select id="sort" name="sort" defaultValue={filter.sort}>
              {(Object.keys(SORT_LABEL) as ItemFilter['sort'][]).map((sort) => (
                <option key={sort} value={sort}>
                  {SORT_LABEL[sort]}
                </option>
              ))}
            </Select>
          </div>

          <div>
            <Label htmlFor="pageSize">Số câu mỗi trang</Label>
            <Select id="pageSize" name="pageSize" defaultValue={String(filter.pageSize)}>
              {PAGE_SIZE_OPTIONS.map((size) => (
                <option key={size} value={size}>
                  {size} câu
                </option>
              ))}
            </Select>
          </div>

          <div className="flex items-end gap-4 sm:col-span-2 lg:col-span-4">
            <label className="flex items-center gap-2 text-sm text-ink-700">
              <input
                type="checkbox"
                name="hasOpenFlags"
                value="true"
                defaultChecked={filter.hasOpenFlags === true}
                className="h-4 w-4 rounded border-ink-300"
              />
              Chỉ câu đang có báo lỗi chưa xử lý
            </label>

            <div className="flex flex-1 flex-wrap justify-end gap-2">
              <a
                href={routes.adminContent()}
                className="inline-flex items-center rounded-lg px-3 py-1.5 text-sm font-medium text-ink-600 hover:bg-ink-100"
              >
                Xóa bộ lọc
              </a>
              <button
                type="submit"
                className="inline-flex items-center rounded-lg bg-brand-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-brand-700"
              >
                Lọc danh sách
              </button>
            </div>
          </div>
        </form>
      </Card>

      <p className="mb-3 text-sm text-ink-600">
        Tìm thấy <strong className="tabular-nums">{result.total}</strong> câu hỏi
        {result.total > 0 ? (
          <>
            {' '}
            · trang <span className="tabular-nums">{result.page}</span>/
            <span className="tabular-nums">{result.pageCount}</span>
          </>
        ) : null}
      </p>

      {result.rows.length === 0 ? (
        <EmptyState
          title="Chưa có câu hỏi nào khớp bộ lọc"
          description="Hãy nới bộ lọc, hoặc thêm câu mới / nhập hàng loạt từ file CSV. Nhớ khai báo cây kiến thức trước khi nhập số lượng lớn."
          action={<LinkButton href={routes.adminContentNew()}>Thêm câu hỏi đầu tiên</LinkButton>}
        />
      ) : (
        <ItemsTable rows={result.rows} canPublish={canPublish} />
      )}

      {result.pageCount > 1 ? (
        <nav className="mt-5 flex flex-wrap items-center justify-between gap-3" aria-label="Phân trang">
          {result.page > 1 ? (
            <LinkButton href={pageHref(result.page - 1)} variant="secondary" size="sm">
              ← Trang trước
            </LinkButton>
          ) : (
            <span />
          )}
          <span className="text-sm text-ink-500 tabular-nums">
            Trang {result.page} / {result.pageCount}
          </span>
          {result.page < result.pageCount ? (
            <LinkButton href={pageHref(result.page + 1)} variant="secondary" size="sm">
              Trang sau →
            </LinkButton>
          ) : (
            <span />
          )}
        </nav>
      ) : null}
    </>
  );
}
