'use client';

/**
 * Bảng điều khiển kỳ thi — khóa học — bảng giá — mã giảm giá.
 *
 * Mọi thao tác ghi đều gọi API quản trị (/api/v1/admin/*), component này chỉ
 * dựng biểu mẫu và hiển thị. Ràng buộc nghiệp vụ (mã kỳ thi không trùng, môn
 * phải hợp lệ với khối, bảng giá gắn đúng một phạm vi…) do máy chủ quyết định.
 */
import { useState, type ReactNode } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { GradeBand, Subject } from '@prisma/client';
import type { CourseSummary, EffectivePricing, ProgramDetail, ProgramSummary } from '@/server/catalog/service';
import type { CouponRow } from '@/server/commerce/service';
import { apiPost } from '@/lib/client';
import { API, routes } from '@/lib/routes';
import {
  GRADE_BANDS,
  GRADE_BAND_LABEL,
  SUBJECTS_BY_BAND,
  SUBJECT_LABEL,
  formatVnd,
} from '@/lib/domain';
import { formatDateVN } from '@/lib/dates';
import {
  Alert,
  Badge,
  Button,
  Card,
  CardHeader,
  EmptyState,
  Input,
  Label,
  PageHeader,
  Section,
  Select,
  Table,
  Td,
  Textarea,
  Tr,
  cx,
} from '@/components/ui';
import { Toast, useToast } from '@/components/motion';

// ---------------------------------------------------------------------------
// Kiểu dữ liệu
// ---------------------------------------------------------------------------

type CourseWithPricing = CourseSummary & { pricing: EffectivePricing };

type Panel =
  | { kind: 'program'; program: ProgramSummary | null }
  | { kind: 'course'; course: CourseSummary | null }
  | { kind: 'pricing'; course: CourseWithPricing | null }
  | { kind: 'coupon'; coupon: CouponRow | null }
  | null;

interface Props {
  programs: ProgramSummary[];
  selected: ProgramDetail | null;
  hiddenCourses: CourseSummary[];
  coupons: CouponRow[];
  canEdit: boolean;
  defaultPrice: number;
  defaultCurrency: string;
  defaultAccessDays: number;
  /** Khối mùa thi do trang cha dựng sẵn (Server Component) — chèn đúng vị trí. */
  children?: ReactNode;
}

const PRICING_SOURCE_LABEL: Record<EffectivePricing['source'], string> = {
  COURSE: 'Bảng giá riêng của khóa',
  PROGRAM: 'Bảng giá chung kỳ thi',
  CONFIG: 'Giá mặc định hệ thống',
};

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Có lỗi xảy ra, vui lòng thử lại.';
}

/** Ngày cho ô <input type="date">. */
function dateInputValue(value: Date | string | null | undefined): string {
  if (!value) return '';
  const date = typeof value === 'string' ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return '';
  return date.toISOString().slice(0, 10);
}

// ---------------------------------------------------------------------------

export function ProgramManager({
  programs,
  selected,
  hiddenCourses,
  coupons,
  canEdit,
  defaultPrice,
  defaultCurrency,
  defaultAccessDays,
  children,
}: Props) {
  const router = useRouter();
  const { toast, show, hide } = useToast();

  const [panel, setPanel] = useState<Panel>(null);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  /** Gửi một biểu mẫu lên API, làm mới dữ liệu trang khi thành công. */
  async function submit(url: string, body: unknown, successMessage: string) {
    setSaving(true);
    setFormError(null);
    try {
      await apiPost(url, body);
      setPanel(null);
      show(successMessage, 'success');
      router.refresh();
    } catch (error) {
      setFormError(errorMessage(error));
    } finally {
      setSaving(false);
    }
  }

  /** Bật/tắt nhanh một kỳ thi — gửi lại đúng bản ghi hiện có, chỉ đổi cờ hoạt động. */
  async function toggleProgram(program: ProgramSummary) {
    await submit(
      API.adminPrograms,
      {
        id: program.id,
        code: program.code,
        name: program.name,
        shortName: program.shortName ?? undefined,
        logoEmoji: program.logoEmoji,
        colorHex: program.colorHex,
        description: program.description,
        highlights: program.highlights,
        season: program.season ?? undefined,
        order: program.order,
        active: !program.active,
      },
      program.active ? `Đã tạm ẩn kỳ thi ${program.code}.` : `Đã mở lại kỳ thi ${program.code}.`,
    );
  }

  async function toggleCourse(course: CourseSummary) {
    await submit(
      API.adminCourses,
      {
        id: course.id,
        programId: course.programId,
        gradeBand: course.gradeBand,
        subject: course.subject,
        name: course.name,
        description: course.description ?? undefined,
        active: !course.active,
      },
      course.active ? 'Đã tạm ẩn khóa học.' : 'Đã mở lại khóa học.',
    );
  }

  return (
    <>
      <PageHeader
        eyebrow="Vận hành"
        title="Chương trình & kỳ thi"
        subtitle="Kỳ thi, khóa học theo khối – môn, mùa thi, bảng giá và mã giảm giá đều là dữ liệu khai báo được."
        action={
          canEdit ? (
            <Button onClick={() => { setFormError(null); setPanel({ kind: 'program', program: null }); }}>
              Thêm kỳ thi
            </Button>
          ) : null
        }
      />

      <Alert tone="info" title="Thêm kỳ thi mới chỉ là THÊM BẢN GHI — không cần lập trình" className="mb-6">
        Toàn bộ hệ thống chạy chung một luồng cho mọi kỳ thi. Khai báo mã (ASMOPSS, NEO, STEM, FMC,
        PAS…), thêm khóa theo khối – môn, đặt mùa thi và bảng giá là kỳ thi mới sẵn sàng mở bán:
        engine, kho câu hỏi và báo cáo tự nhận diện, không ai phải sửa mã nguồn hay triển khai lại.
      </Alert>

      {!canEdit ? (
        <Alert tone="warn" className="mb-6" title="Bạn đang ở chế độ chỉ xem">
          Chỉ Quản lý chương trình và Super Admin được tạo/sửa kỳ thi, khóa học và bảng giá. Bạn vẫn
          xem được toàn bộ cấu hình hiện tại.
        </Alert>
      ) : null}

      {/* --------------------------------------------------------------- */}
      {/* Danh sách kỳ thi                                                 */}
      {/* --------------------------------------------------------------- */}
      <Section
        title="Kỳ thi đang khai báo"
        description={`${programs.length} kỳ thi trong hệ thống. Bấm vào một kỳ thi để xem khóa học, mùa thi và bảng giá.`}
      >
        {panel?.kind === 'program' ? (
          <ProgramForm
            program={panel.program}
            saving={saving}
            error={formError}
            onCancel={() => setPanel(null)}
            onSubmit={(body) =>
              submit(
                API.adminPrograms,
                body,
                panel.program ? 'Đã lưu thay đổi kỳ thi.' : 'Đã tạo kỳ thi mới.',
              )
            }
          />
        ) : null}

        {programs.length === 0 ? (
          <EmptyState
            icon="🏆"
            title="Chưa có kỳ thi nào"
            description="Hãy tạo kỳ thi đầu tiên. Sau đó thêm khóa học theo khối – môn rồi nhập kho câu hỏi."
            action={
              canEdit ? (
                <Button onClick={() => setPanel({ kind: 'program', program: null })}>
                  Tạo kỳ thi đầu tiên
                </Button>
              ) : undefined
            }
          />
        ) : (
          <div className="stagger grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {programs.map((program) => {
              const isSelected = selected?.id === program.id;
              return (
                <Card
                  key={program.id}
                  className={cx(
                    'flex flex-col gap-3',
                    isSelected ? 'ring-2 ring-brand-300' : undefined,
                  )}
                >
                  <div className="flex items-start gap-3">
                    <span
                      aria-hidden
                      className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-lg"
                      style={{ backgroundColor: `${program.colorHex}1a` }}
                    >
                      {program.logoEmoji}
                    </span>
                    <div className="min-w-0">
                      <p className="flex flex-wrap items-center gap-2 font-semibold text-ink-900">
                        {program.code}
                        <Badge tone={program.active ? 'success' : 'neutral'} dot>
                          {program.active ? 'Đang mở' : 'Tạm ẩn'}
                        </Badge>
                      </p>
                      <p className="truncate text-sm text-ink-600">{program.name}</p>
                      <p className="mt-0.5 text-xs text-ink-500">
                        {program.season ? `Mùa ${program.season} · ` : ''}
                        {program.courseCount} khóa ·{' '}
                        {program.gradeBands.length > 0
                          ? program.gradeBands.map((band) => GRADE_BAND_LABEL[band]).join(', ')
                          : 'chưa có khối nào'}
                      </p>
                    </div>
                  </div>

                  <div className="mt-auto flex flex-wrap gap-2">
                    <Link
                      href={`${routes.adminPrograms()}?kyThi=${program.code}`}
                      className="press inline-flex items-center rounded-lg bg-brand-50 px-3 py-1.5 text-sm font-medium text-brand-700 transition-colors hover:bg-brand-100"
                    >
                      {isSelected ? 'Đang xem' : 'Xem chi tiết'}
                    </Link>
                    {canEdit ? (
                      <>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => { setFormError(null); setPanel({ kind: 'program', program }); }}
                        >
                          Sửa
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          loading={saving}
                          onClick={() => toggleProgram(program)}
                        >
                          {program.active ? 'Tạm ẩn' : 'Mở lại'}
                        </Button>
                      </>
                    ) : null}
                  </div>
                </Card>
              );
            })}
          </div>
        )}
      </Section>

      {/* --------------------------------------------------------------- */}
      {/* Khóa học của kỳ thi đang chọn                                    */}
      {/* --------------------------------------------------------------- */}
      {selected ? (
        <>
          <Section
            title={`Khóa học của ${selected.code}`}
            description="Mỗi khóa là một cặp khối – môn. Giá hiển thị là giá đang thực sự áp dụng cho người mua."
            action={
              canEdit ? (
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => { setFormError(null); setPanel({ kind: 'course', course: null }); }}
                >
                  Thêm khóa học
                </Button>
              ) : null
            }
          >
            {selected.warnings.length > 0 ? (
              <Alert tone="warn" className="mb-4" title="Cần bổ sung trước khi mở bán">
                <ul className="mt-1 list-disc space-y-1 pl-5">
                  {selected.warnings.map((warning) => (
                    <li key={warning}>{warning}</li>
                  ))}
                </ul>
              </Alert>
            ) : null}

            {panel?.kind === 'course' ? (
              <CourseForm
                course={panel.course}
                programId={selected.id}
                saving={saving}
                error={formError}
                onCancel={() => setPanel(null)}
                onSubmit={(body) =>
                  submit(
                    API.adminCourses,
                    body,
                    panel.course ? 'Đã lưu thay đổi khóa học.' : 'Đã thêm khóa học mới.',
                  )
                }
              />
            ) : null}

            {panel?.kind === 'pricing' ? (
              <PricingForm
                course={panel.course}
                programId={selected.id}
                programPricing={selected.pricing}
                defaultPrice={defaultPrice}
                defaultCurrency={defaultCurrency}
                defaultAccessDays={defaultAccessDays}
                saving={saving}
                error={formError}
                onCancel={() => setPanel(null)}
                onSubmit={(body) => submit(API.adminPricing, body, 'Đã lưu bảng giá.')}
              />
            ) : null}

            {selected.courses.length === 0 ? (
              <EmptyState
                icon="📚"
                title="Kỳ thi này chưa có khóa học nào đang mở"
                description="Thêm khóa theo từng cặp khối – môn, ví dụ Khối B – Toán. Học sinh chỉ mua được khóa đang mở."
                action={
                  canEdit ? (
                    <Button onClick={() => setPanel({ kind: 'course', course: null })}>
                      Thêm khóa học đầu tiên
                    </Button>
                  ) : undefined
                }
              />
            ) : (
              <Table
                head={['Khóa học', 'Khối', 'Môn', 'Giá đang áp dụng', 'Nguồn giá', 'Thời hạn', 'Thao tác']}
              >
                {selected.courses.map((course) => (
                  <Tr key={course.id}>
                    <Td>
                      <span className="font-medium text-ink-800">{course.name}</span>
                      {course.description ? (
                        <span className="mt-0.5 block text-xs text-ink-500">{course.description}</span>
                      ) : null}
                    </Td>
                    <Td>{course.gradeBandLabel}</Td>
                    <Td>{course.subjectLabel}</Td>
                    <Td className="font-semibold tabular-nums">{course.pricing.priceLabel}</Td>
                    <Td>
                      <Badge tone={course.pricing.source === 'CONFIG' ? 'warn' : 'brand'}>
                        {PRICING_SOURCE_LABEL[course.pricing.source]}
                      </Badge>
                    </Td>
                    <Td className="tabular-nums">{course.pricing.accessDurationDays} ngày</Td>
                    <Td>
                      {canEdit ? (
                        <div className="flex flex-wrap gap-1">
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => { setFormError(null); setPanel({ kind: 'course', course }); }}
                          >
                            Sửa
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => { setFormError(null); setPanel({ kind: 'pricing', course }); }}
                          >
                            Đặt giá
                          </Button>
                          <Button size="sm" variant="ghost" loading={saving} onClick={() => toggleCourse(course)}>
                            Tạm ẩn
                          </Button>
                        </div>
                      ) : (
                        <span className="text-ink-400">—</span>
                      )}
                    </Td>
                  </Tr>
                ))}
              </Table>
            )}

            {hiddenCourses.length > 0 ? (
              <Card className="mt-4">
                <CardHeader
                  title="Khóa đang tạm ẩn"
                  subtitle="Không bán được nhưng dữ liệu học tập của học sinh cũ vẫn giữ nguyên."
                />
                <ul className="divide-y divide-ink-100">
                  {hiddenCourses.map((course) => (
                    <li key={course.id} className="flex flex-wrap items-center justify-between gap-3 py-2.5">
                      <span className="text-sm text-ink-700">
                        {course.name}
                        <span className="ml-2 text-xs text-ink-500">
                          {course.gradeBandLabel} · {course.subjectLabel}
                        </span>
                      </span>
                      {canEdit ? (
                        <Button size="sm" variant="secondary" loading={saving} onClick={() => toggleCourse(course)}>
                          Mở lại
                        </Button>
                      ) : null}
                    </li>
                  ))}
                </ul>
              </Card>
            ) : null}

            <Card className="mt-4">
              <CardHeader
                title="Bảng giá chung của kỳ thi"
                subtitle="Áp dụng cho mọi khóa chưa có bảng giá riêng."
                action={
                  canEdit ? (
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => { setFormError(null); setPanel({ kind: 'pricing', course: null }); }}
                    >
                      Đặt giá chung
                    </Button>
                  ) : null
                }
              />
              <div className="flex flex-wrap items-baseline gap-x-6 gap-y-2">
                <p className="text-2xl font-bold text-ink-900 tabular-nums">{selected.pricing.priceLabel}</p>
                <p className="text-sm text-ink-600">
                  {selected.pricing.label} · {selected.pricing.accessDurationDays} ngày truy cập
                </p>
                <Badge tone={selected.pricing.source === 'CONFIG' ? 'warn' : 'brand'}>
                  {PRICING_SOURCE_LABEL[selected.pricing.source]}
                </Badge>
              </div>
            </Card>
          </Section>

          {children}
        </>
      ) : (
        <Alert tone="info" className="mb-8">
          Chọn một kỳ thi ở trên để xem khóa học, mùa thi và bảng giá của kỳ thi đó.
        </Alert>
      )}

      {/* --------------------------------------------------------------- */}
      {/* Mã giảm giá                                                      */}
      {/* --------------------------------------------------------------- */}
      <Section
        title="Mã giảm giá"
        description="Dùng cho chiến dịch tuyển sinh và học bổng một phần. Mã 100% sẽ kích hoạt khóa ngay khi đặt hàng."
        action={
          canEdit ? (
            <Button
              variant="secondary"
              size="sm"
              onClick={() => { setFormError(null); setPanel({ kind: 'coupon', coupon: null }); }}
            >
              Tạo mã giảm giá
            </Button>
          ) : null
        }
      >
        {panel?.kind === 'coupon' ? (
          <CouponForm
            coupon={panel.coupon}
            programs={programs}
            saving={saving}
            error={formError}
            onCancel={() => setPanel(null)}
            onSubmit={(body) =>
              submit(API.adminCoupons, body, panel.coupon ? 'Đã cập nhật mã giảm giá.' : 'Đã tạo mã giảm giá.')
            }
          />
        ) : null}

        {coupons.length === 0 ? (
          <EmptyState
            icon="🎟️"
            title="Chưa có mã giảm giá nào"
            description="Tạo mã theo phần trăm hoặc số tiền, giới hạn lượt dùng và ngày hết hạn để kiểm soát ngân sách khuyến mãi."
          />
        ) : (
          <Table head={['Mã', 'Loại giảm', 'Đã dùng', 'Hết hạn', 'Phạm vi', 'Trạng thái', 'Thao tác']}>
            {coupons.map((coupon) => (
              <Tr key={coupon.id}>
                <Td className="font-semibold text-ink-800">{coupon.code}</Td>
                <Td>
                  {coupon.valueLabel}
                  <span className="block text-xs text-ink-500">{coupon.typeLabel}</span>
                </Td>
                <Td className="tabular-nums">
                  {coupon.usedCount}
                  {coupon.maxUses === null ? ' / không giới hạn' : ` / ${coupon.maxUses}`}
                </Td>
                <Td>{coupon.expiresAt ? formatDateVN(new Date(coupon.expiresAt)) : 'Không đặt hạn'}</Td>
                <Td className="text-ink-600">
                  {coupon.courseId
                    ? 'Một khóa học'
                    : coupon.programId
                      ? (programs.find((p) => p.id === coupon.programId)?.code ?? 'Một kỳ thi')
                      : 'Toàn hệ thống'}
                </Td>
                <Td>
                  <Badge tone={coupon.usable ? 'success' : 'neutral'} dot>
                    {coupon.usable
                      ? 'Đang dùng được'
                      : coupon.expired
                        ? 'Đã hết hạn'
                        : coupon.active
                          ? 'Hết lượt dùng'
                          : 'Đã tắt'}
                  </Badge>
                </Td>
                <Td>
                  {canEdit ? (
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => { setFormError(null); setPanel({ kind: 'coupon', coupon }); }}
                    >
                      Sửa
                    </Button>
                  ) : (
                    <span className="text-ink-400">—</span>
                  )}
                </Td>
              </Tr>
            ))}
          </Table>
        )}
      </Section>

      <Toast message={toast.message} tone={toast.tone} onClose={hide} />
    </>
  );
}

// ---------------------------------------------------------------------------
// Khung biểu mẫu dùng chung
// ---------------------------------------------------------------------------

function FormShell({
  title,
  description,
  error,
  saving,
  submitLabel,
  onCancel,
  onSubmit,
  children,
}: {
  title: string;
  description?: string;
  error: string | null;
  saving: boolean;
  submitLabel: string;
  onCancel: () => void;
  onSubmit: () => void;
  children: ReactNode;
}) {
  return (
    <Card className="animate-fade-up mb-4 ring-brand-200">
      <CardHeader title={title} subtitle={description} />
      <form
        onSubmit={(event) => {
          event.preventDefault();
          onSubmit();
        }}
      >
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{children}</div>

        {error ? (
          <Alert tone="danger" className="mt-4">
            {error}
          </Alert>
        ) : null}

        <div className="mt-5 flex flex-wrap gap-2">
          <Button type="submit" loading={saving}>
            {submitLabel}
          </Button>
          <Button type="button" variant="ghost" onClick={onCancel} disabled={saving}>
            Hủy
          </Button>
        </div>
      </form>
    </Card>
  );
}

function FormField({
  label,
  hint,
  wide,
  children,
}: {
  label: string;
  hint?: string;
  wide?: boolean;
  children: ReactNode;
}) {
  return (
    <div className={wide ? 'sm:col-span-2 lg:col-span-3' : undefined}>
      <Label hint={hint}>{label}</Label>
      {children}
    </div>
  );
}

function CheckboxRow({
  checked,
  onChange,
  label,
  hint,
}: {
  checked: boolean;
  onChange: (value: boolean) => void;
  label: string;
  hint?: string;
}) {
  return (
    <label className="flex items-start gap-2.5 rounded-lg bg-ink-50 px-3 py-2.5 text-sm text-ink-700">
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        className="mt-0.5 h-4 w-4 rounded border-ink-300"
      />
      <span>
        <span className="font-medium">{label}</span>
        {hint ? <span className="mt-0.5 block text-xs text-ink-500">{hint}</span> : null}
      </span>
    </label>
  );
}

// ---------------------------------------------------------------------------
// Biểu mẫu kỳ thi
// ---------------------------------------------------------------------------

function ProgramForm({
  program,
  saving,
  error,
  onCancel,
  onSubmit,
}: {
  program: ProgramSummary | null;
  saving: boolean;
  error: string | null;
  onCancel: () => void;
  onSubmit: (body: Record<string, unknown>) => void;
}) {
  const [code, setCode] = useState(program?.code ?? '');
  const [name, setName] = useState(program?.name ?? '');
  const [shortName, setShortName] = useState(program?.shortName ?? '');
  const [description, setDescription] = useState(program?.description ?? '');
  const [season, setSeason] = useState(program?.season ?? '');
  const [logoEmoji, setLogoEmoji] = useState(program?.logoEmoji ?? '🏆');
  const [colorHex, setColorHex] = useState(program?.colorHex ?? '#2563eb');
  const [order, setOrder] = useState(String(program?.order ?? 0));
  const [active, setActive] = useState(program?.active ?? true);
  const [highlights, setHighlights] = useState((program?.highlights ?? []).join('\n'));

  return (
    <FormShell
      title={program ? `Sửa kỳ thi ${program.code}` : 'Thêm kỳ thi mới'}
      description="Khai báo xong là kỳ thi chạy được ngay — không cần lập trình viên can thiệp."
      error={error}
      saving={saving}
      submitLabel={program ? 'Lưu kỳ thi' : 'Tạo kỳ thi'}
      onCancel={onCancel}
      onSubmit={() =>
        onSubmit({
          id: program?.id,
          code: code.trim().toUpperCase(),
          name: name.trim(),
          shortName: shortName.trim() || undefined,
          description: description.trim(),
          season: season.trim() || undefined,
          logoEmoji: logoEmoji.trim() || undefined,
          colorHex: colorHex.trim() || undefined,
          order: Number(order) || 0,
          active,
          highlights: highlights
            .split('\n')
            .map((line) => line.trim())
            .filter((line) => line.length > 0),
        })
      }
    >
      <FormField label="Mã kỳ thi" hint="chữ in hoa, ví dụ ASMOPSS">
        <Input value={code} onChange={(event) => setCode(event.target.value)} placeholder="PAS" required />
      </FormField>
      <FormField label="Tên đầy đủ">
        <Input value={name} onChange={(event) => setName(event.target.value)} required />
      </FormField>
      <FormField label="Tên rút gọn" hint="không bắt buộc">
        <Input value={shortName} onChange={(event) => setShortName(event.target.value)} />
      </FormField>

      <FormField label="Giới thiệu kỳ thi" hint="ít nhất 10 ký tự, hiện ở trang bán khóa" wide>
        <Textarea value={description} onChange={(event) => setDescription(event.target.value)} required />
      </FormField>

      <FormField label="Điểm nổi bật" hint="mỗi dòng một ý" wide>
        <Textarea
          value={highlights}
          onChange={(event) => setHighlights(event.target.value)}
          placeholder={'Đề thi bám sát cấu trúc chính thức\nCó buổi tư vấn 20 phút mỗi chu kỳ'}
        />
      </FormField>

      <FormField label="Mùa hiện tại" hint="ví dụ 2026">
        <Input value={season} onChange={(event) => setSeason(event.target.value)} />
      </FormField>
      <FormField label="Biểu tượng">
        <Input value={logoEmoji} onChange={(event) => setLogoEmoji(event.target.value)} maxLength={8} />
      </FormField>
      <FormField label="Màu nhận diện" hint="#RRGGBB">
        <Input value={colorHex} onChange={(event) => setColorHex(event.target.value)} placeholder="#2563eb" />
      </FormField>
      <FormField label="Thứ tự hiển thị" hint="số nhỏ hiện trước">
        <Input
          type="number"
          min={0}
          max={999}
          value={order}
          onChange={(event) => setOrder(event.target.value)}
          className="tabular-nums"
        />
      </FormField>
      <div className="sm:col-span-2">
        <CheckboxRow
          checked={active}
          onChange={setActive}
          label="Đang mở theo mùa"
          hint="Tắt khi hết mùa thi: kỳ thi biến mất khỏi trang bán, học sinh cũ vẫn học bình thường."
        />
      </div>
    </FormShell>
  );
}

// ---------------------------------------------------------------------------
// Biểu mẫu khóa học
// ---------------------------------------------------------------------------

function CourseForm({
  course,
  programId,
  saving,
  error,
  onCancel,
  onSubmit,
}: {
  course: CourseSummary | null;
  programId: string;
  saving: boolean;
  error: string | null;
  onCancel: () => void;
  onSubmit: (body: Record<string, unknown>) => void;
}) {
  const [gradeBand, setGradeBand] = useState<GradeBand>(course?.gradeBand ?? 'A');
  const [subject, setSubject] = useState<Subject>(course?.subject ?? SUBJECTS_BY_BAND['A'][0]!);
  const [name, setName] = useState(course?.name ?? '');
  const [description, setDescription] = useState(course?.description ?? '');
  const [active, setActive] = useState(course?.active ?? true);

  const subjects = SUBJECTS_BY_BAND[gradeBand];

  function changeBand(next: GradeBand) {
    setGradeBand(next);
    // Môn phải hợp lệ với khối (specs §3.2) — đổi khối thì chọn lại môn đầu tiên.
    if (!SUBJECTS_BY_BAND[next].includes(subject)) setSubject(SUBJECTS_BY_BAND[next][0]!);
  }

  return (
    <FormShell
      title={course ? `Sửa khóa ${course.name}` : 'Thêm khóa học'}
      description="Mỗi khóa gắn với đúng một cặp khối – môn; hệ thống tự lấy đúng kho câu hỏi tương ứng."
      error={error}
      saving={saving}
      submitLabel={course ? 'Lưu khóa học' : 'Thêm khóa học'}
      onCancel={onCancel}
      onSubmit={() =>
        onSubmit({
          id: course?.id,
          programId,
          gradeBand,
          subject,
          name: name.trim(),
          description: description.trim() || undefined,
          active,
        })
      }
    >
      <FormField label="Khối">
        <Select value={gradeBand} onChange={(event) => changeBand(event.target.value as GradeBand)}>
          {GRADE_BANDS.map((band) => (
            <option key={band} value={band}>
              {GRADE_BAND_LABEL[band]}
            </option>
          ))}
        </Select>
      </FormField>
      <FormField label="Môn" hint="chỉ hiện môn hợp lệ với khối">
        <Select value={subject} onChange={(event) => setSubject(event.target.value as Subject)}>
          {subjects.map((value) => (
            <option key={value} value={value}>
              {SUBJECT_LABEL[value]}
            </option>
          ))}
        </Select>
      </FormField>
      <FormField label="Tên khóa học">
        <Input value={name} onChange={(event) => setName(event.target.value)} required />
      </FormField>
      <FormField label="Mô tả ngắn" hint="không bắt buộc" wide>
        <Textarea value={description} onChange={(event) => setDescription(event.target.value)} />
      </FormField>
      <div className="sm:col-span-2">
        <CheckboxRow checked={active} onChange={setActive} label="Đang mở bán" />
      </div>
    </FormShell>
  );
}

// ---------------------------------------------------------------------------
// Biểu mẫu bảng giá
// ---------------------------------------------------------------------------

function PricingForm({
  course,
  programId,
  programPricing,
  defaultPrice,
  defaultCurrency,
  defaultAccessDays,
  saving,
  error,
  onCancel,
  onSubmit,
}: {
  /** null = đặt bảng giá chung cho cả kỳ thi. */
  course: CourseWithPricing | null;
  programId: string;
  programPricing: EffectivePricing;
  defaultPrice: number;
  defaultCurrency: string;
  defaultAccessDays: number;
  saving: boolean;
  error: string | null;
  onCancel: () => void;
  onSubmit: (body: Record<string, unknown>) => void;
}) {
  const current = course ? course.pricing : programPricing;
  // Chỉ sửa đè khi bảng giá hiện tại đúng phạm vi đang mở; ngược lại tạo bản ghi mới.
  const editableId =
    course && current.source === 'COURSE'
      ? current.pricingId
      : !course && current.source === 'PROGRAM'
        ? current.pricingId
        : null;

  const [label, setLabel] = useState(
    current.source === 'CONFIG' ? (course ? `Giá khóa ${course.name}` : 'Giá chung kỳ thi') : current.label,
  );
  const [price, setPrice] = useState(String(current.source === 'CONFIG' ? defaultPrice : current.price));
  const [accessDurationDays, setAccessDurationDays] = useState(
    String(current.accessDurationDays || defaultAccessDays),
  );
  const [validFrom, setValidFrom] = useState('');
  const [validTo, setValidTo] = useState('');
  const [active, setActive] = useState(true);

  return (
    <FormShell
      title={course ? `Bảng giá cho khóa ${course.name}` : 'Bảng giá chung của kỳ thi'}
      description="Giá và thời hạn truy cập là dữ liệu — đổi giá không cần triển khai lại hệ thống."
      error={error}
      saving={saving}
      submitLabel="Lưu bảng giá"
      onCancel={onCancel}
      onSubmit={() =>
        onSubmit({
          id: editableId ?? undefined,
          ...(course ? { courseId: course.id } : { programId }),
          label: label.trim() || undefined,
          price: Number(price),
          currency: defaultCurrency,
          accessDurationDays: Number(accessDurationDays),
          validFrom: validFrom || undefined,
          validTo: validTo || undefined,
          active,
        })
      }
    >
      <FormField label="Tên bảng giá" hint="hiện trong đối soát">
        <Input value={label} onChange={(event) => setLabel(event.target.value)} />
      </FormField>
      <FormField label={`Giá (${defaultCurrency})`} hint="số nguyên, không dấu chấm">
        <Input
          type="number"
          min={0}
          step={1000}
          value={price}
          onChange={(event) => setPrice(event.target.value)}
          className="tabular-nums"
          required
        />
      </FormField>
      <FormField label="Thời hạn truy cập (ngày)">
        <Input
          type="number"
          min={1}
          max={3650}
          value={accessDurationDays}
          onChange={(event) => setAccessDurationDays(event.target.value)}
          className="tabular-nums"
          required
        />
      </FormField>
      <FormField label="Hiệu lực từ" hint="để trống là áp dụng ngay">
        <Input type="date" value={validFrom} onChange={(event) => setValidFrom(event.target.value)} />
      </FormField>
      <FormField label="Hiệu lực đến" hint="để trống là không giới hạn">
        <Input type="date" value={validTo} onChange={(event) => setValidTo(event.target.value)} />
      </FormField>
      <div>
        <CheckboxRow checked={active} onChange={setActive} label="Đang áp dụng" />
      </div>
      <div className="sm:col-span-2 lg:col-span-3">
        <p className="text-sm text-ink-500">
          Giá đang áp dụng: <strong className="text-ink-700">{current.priceLabel}</strong> (
          {PRICING_SOURCE_LABEL[current.source]}).{' '}
          {editableId
            ? 'Lưu sẽ cập nhật đúng bảng giá này.'
            : 'Lưu sẽ tạo bảng giá mới và đè lên giá đang dùng.'}
        </p>
      </div>
    </FormShell>
  );
}

// ---------------------------------------------------------------------------
// Biểu mẫu mã giảm giá
// ---------------------------------------------------------------------------

function CouponForm({
  coupon,
  programs,
  saving,
  error,
  onCancel,
  onSubmit,
}: {
  coupon: CouponRow | null;
  programs: ProgramSummary[];
  saving: boolean;
  error: string | null;
  onCancel: () => void;
  onSubmit: (body: Record<string, unknown>) => void;
}) {
  const [code, setCode] = useState(coupon?.code ?? '');
  const [type, setType] = useState<'PERCENT' | 'AMOUNT'>(coupon?.type ?? 'PERCENT');
  const [value, setValue] = useState(String(coupon?.value ?? 10));
  const [maxUses, setMaxUses] = useState(coupon?.maxUses === null || coupon === null ? '' : String(coupon.maxUses));
  const [expiresAt, setExpiresAt] = useState(dateInputValue(coupon?.expiresAt ?? null));
  const [programId, setProgramId] = useState(coupon?.programId ?? '');
  const [active, setActive] = useState(coupon?.active ?? true);

  return (
    <FormShell
      title={coupon ? `Sửa mã ${coupon.code}` : 'Tạo mã giảm giá'}
      description="Mã đã phát hành không đổi được số lượt đã dùng; giới hạn mới phải lớn hơn số lượt đã dùng."
      error={error}
      saving={saving}
      submitLabel={coupon ? 'Lưu mã giảm giá' : 'Tạo mã'}
      onCancel={onCancel}
      onSubmit={() =>
        onSubmit({
          code: code.trim().toUpperCase(),
          type,
          value: Number(value),
          maxUses: maxUses.trim() === '' ? null : Number(maxUses),
          expiresAt: expiresAt || null,
          programId: programId || null,
          active,
        })
      }
    >
      <FormField label="Mã giảm giá" hint="viết liền, không dấu">
        <Input
          value={code}
          onChange={(event) => setCode(event.target.value)}
          placeholder="TUYENSINH2026"
          disabled={Boolean(coupon)}
          required
        />
      </FormField>
      <FormField label="Kiểu giảm">
        <Select value={type} onChange={(event) => setType(event.target.value as 'PERCENT' | 'AMOUNT')}>
          <option value="PERCENT">Giảm theo phần trăm</option>
          <option value="AMOUNT">Giảm số tiền</option>
        </Select>
      </FormField>
      <FormField label={type === 'PERCENT' ? 'Phần trăm giảm (1–100)' : 'Số tiền giảm (VND)'}>
        <Input
          type="number"
          min={1}
          max={type === 'PERCENT' ? 100 : undefined}
          value={value}
          onChange={(event) => setValue(event.target.value)}
          className="tabular-nums"
          required
        />
        {type === 'PERCENT' ? null : (
          <p className="mt-1.5 text-xs text-ink-500">{formatVnd(Number(value) || 0)}</p>
        )}
      </FormField>
      <FormField label="Giới hạn lượt dùng" hint="để trống là không giới hạn">
        <Input
          type="number"
          min={1}
          value={maxUses}
          onChange={(event) => setMaxUses(event.target.value)}
          className="tabular-nums"
        />
      </FormField>
      <FormField label="Ngày hết hạn" hint="để trống là không đặt hạn">
        <Input type="date" value={expiresAt} onChange={(event) => setExpiresAt(event.target.value)} />
      </FormField>
      <FormField label="Áp dụng cho kỳ thi" hint="để trống là toàn hệ thống">
        <Select value={programId} onChange={(event) => setProgramId(event.target.value)}>
          <option value="">Mọi kỳ thi</option>
          {programs.map((program) => (
            <option key={program.id} value={program.id}>
              {program.code} — {program.name}
            </option>
          ))}
        </Select>
      </FormField>
      <div className="sm:col-span-2">
        <CheckboxRow
          checked={active}
          onChange={setActive}
          label="Đang phát hành"
          hint="Tắt để ngừng nhận mã này mà vẫn giữ lịch sử đơn hàng đã dùng."
        />
      </div>
    </FormShell>
  );
}
