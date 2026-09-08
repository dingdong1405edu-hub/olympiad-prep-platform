'use client';

/**
 * Bảng điều khiển kỳ thi — khóa học — bảng giá — mã giảm giá.
 *
 * Mọi thao tác ghi đều gọi API quản trị (/api/v1/admin/*), component này chỉ
 * dựng biểu mẫu và hiển thị. Ràng buộc nghiệp vụ (mã kỳ thi không trùng, môn
 * phải hợp lệ với khối, bảng giá gắn đúng một phạm vi…) do máy chủ quyết định.
 */
import { useState, type ReactNode } from 'react';
import { PairListEditor, cleanPairs, type PairItem } from '@/components/pair-list-editor';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { GradeBand, Subject } from '@prisma/client';
import type { CourseSummary, EffectivePricing, ProgramDetail, ProgramSummary } from '@/server/catalog/service';
import type { CouponRow } from '@/server/commerce/service';
import { apiPost } from '@/lib/client';
import { API, routes } from '@/lib/routes';
import { courseCoverSlot } from '@/lib/copy/images';
import { CourseCoverField } from './course-cover';
import { uploadCover } from './cover-api';
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
  /** URL ảnh đại diện theo khóa ô, trang cha đọc sẵn từ bảng SiteAsset. */
  coverUrlBySlot: Record<string, string>;
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
  coverUrlBySlot,
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

  /**
   * Lưu khóa học, và với khóa MỚI thì đẩy ảnh đại diện lên ngay sau đó.
   *
   * Ảnh phải chờ khóa học được tạo xong mới gửi được: khóa ô ảnh dựng từ mã kỳ
   * thi + khối + môn, mà lúc đang điền biểu mẫu thì khối và môn còn đổi được.
   *
   * Ảnh lỗi KHÔNG được báo như khóa học lỗi. Khóa học lúc đó đã nằm trong
   * database rồi; hiện lỗi đỏ trên biểu mẫu sẽ khiến người dùng bấm lưu lại lần
   * nữa, và lần đó chắc chắn báo trùng khối–môn. Nên đóng biểu mẫu, nói đúng
   * một câu là ảnh chưa lưu được, rồi để họ mở lại khóa vừa tạo và thử ảnh lần
   * nữa — đường đó vẫn còn nguyên.
   */
  async function submitCourse(
    body: Record<string, unknown>,
    coverFile: File | null,
    successMessage: string,
  ) {
    setSaving(true);
    setFormError(null);
    try {
      await apiPost(API.adminCourses, body);
    } catch (error) {
      setFormError(errorMessage(error));
      setSaving(false);
      return;
    }

    let coverError: string | null = null;
    if (coverFile && selected) {
      try {
        await uploadCover(
          courseCoverSlot(selected.code, String(body.gradeBand), String(body.subject)),
          coverFile,
        );
      } catch (error) {
        coverError = errorMessage(error);
      }
    }

    setPanel(null);
    show(
      coverError ? `${successMessage} Nhưng ảnh đại diện chưa lưu được: ${coverError}` : successMessage,
      coverError ? 'error' : 'success',
    );
    router.refresh();
    setSaving(false);
  }

  /**
   * Bật/tắt nhanh một kỳ thi.
   *
   * PHẢI GỬI LẠI ĐỦ MỌI TRƯỜNG, kể cả những trường nút này không đụng tới.
   * `upsertProgram` là thao tác ghi đè toàn bộ bản ghi: trường nào vắng mặt
   * trong payload sẽ được ghi thành null (xem `payload` trong
   * src/server/catalog/service.ts). Bản trước bỏ qua câu chốt, bài giới thiệu và
   * link video, nên chỉ cần bấm "Tạm ẩn" rồi "Mở lại" là toàn bộ nội dung bán
   * hàng vừa soạn biến mất, không cảnh báo, không hoàn tác được.
   */
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
        // Nội dung giới thiệu — giữ nguyên, đừng để nút bật/tắt xóa mất.
        tagline: program.tagline ?? undefined,
        longDescription: program.longDescription ?? undefined,
        introVideoUrl: program.introVideoUrl ?? undefined,
        introVideoPoster: program.introVideoPoster ?? undefined,
        sections: program.sections,
        faqs: program.faqs,
        active: !program.active,
      },
      program.active ? `Đã tạm ẩn kỳ thi ${program.code}.` : `Đã mở lại kỳ thi ${program.code}.`,
    );
  }

  /** Cùng lý do như toggleProgram: thiếu trường nào là trường đó bị xóa trắng. */
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
        tagline: course.tagline ?? undefined,
        longDescription: course.longDescription ?? undefined,
        introVideoUrl: course.introVideoUrl ?? undefined,
        outcomes: course.outcomes,
        syllabus: course.syllabus,
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
        {/* `key` là BẮT BUỘC, không phải để React đỡ cảnh báo.
            Các ô nhập của ProgramForm là useState khởi tạo MỘT LẦN từ prop. Không
            có key thì bấm "Sửa" sang kỳ thi khác chỉ đổi prop chứ không dựng lại
            component: tiêu đề đổi sang kỳ thi mới nhưng nội dung các ô vẫn là của
            kỳ thi cũ, và bấm Lưu sẽ gửi id kỳ thi mới kèm mã kỳ thi cũ → 409
            "Mã kỳ thi đã tồn tại". Đổi key buộc React vứt state cũ đi. */}
        {panel?.kind === 'program' ? (
          <ProgramForm
            key={panel.program?.id ?? 'tao-moi'}
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
                      // Trang đọc `searchParams.program` (xem page.tsx). Bản
                      // trước gửi `?kyThi=` nên bấm "Xem chi tiết" không đổi
                      // được kỳ thi đang xem — URL đổi mà nội dung đứng yên.
                      href={`${routes.adminPrograms()}?program=${program.code}`}
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

            {/* Cùng lý do như ProgramForm ở trên: thiếu key thì sửa khóa này lại
                lưu đè nội dung của khóa vừa mở trước đó. */}
            {panel?.kind === 'course' ? (
              <CourseForm
                key={panel.course?.id ?? 'tao-moi'}
                course={panel.course}
                programId={selected.id}
                programCode={selected.code}
                coverUrl={
                  panel.course
                    ? (coverUrlBySlot[
                        courseCoverSlot(
                          selected.code,
                          panel.course.gradeBand,
                          panel.course.subject,
                        )
                      ] ?? null)
                    : null
                }
                saving={saving}
                error={formError}
                onCancel={() => setPanel(null)}
                onSubmit={(body, coverFile) =>
                  submitCourse(
                    body,
                    coverFile,
                    panel.course ? 'Đã lưu thay đổi khóa học.' : 'Đã thêm khóa học mới.',
                  )
                }
              />
            ) : null}

            {panel?.kind === 'pricing' ? (
              <PricingForm
                key={panel.course?.id ?? 'gia-chung'}
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
            key={panel.coupon?.id ?? 'tao-moi'}
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

/** Vạch ngăn có tiêu đề, chia biểu mẫu dài thành các phần đọc được. */
function SectionDivider({ title, description }: { title: string; description?: string }) {
  return (
    <div className="sm:col-span-2 lg:col-span-3">
      <div className="mt-2 flex items-center gap-3 border-t border-ink-100 pt-5">
        <span className="text-sm font-semibold text-ink-800">{title}</span>
        <span className="h-px flex-1 bg-ink-100" aria-hidden />
      </div>
      {description ? <p className="mt-1 text-xs text-ink-500">{description}</p> : null}
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
  const [tagline, setTagline] = useState(program?.tagline ?? '');
  const [longDescription, setLongDescription] = useState(program?.longDescription ?? '');
  const [introVideoUrl, setIntroVideoUrl] = useState(program?.introVideoUrl ?? '');
  const [introVideoPoster, setIntroVideoPoster] = useState(program?.introVideoPoster ?? '');
  const [sections, setSections] = useState<PairItem[]>(
    (program?.sections ?? []).map((row) => ({ title: row.title, body: row.body })),
  );
  const [faqs, setFaqs] = useState<PairItem[]>(
    (program?.faqs ?? []).map((row) => ({ title: row.question, body: row.answer })),
  );

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
          tagline: tagline.trim() || undefined,
          longDescription: longDescription.trim() || undefined,
          introVideoUrl: introVideoUrl.trim() || undefined,
          introVideoPoster: introVideoPoster.trim() || undefined,
          sections: cleanPairs(sections),
          faqs: cleanPairs(faqs).map((row) => ({ question: row.title, answer: row.body })),
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

      <SectionDivider
        title="Nội dung giới thiệu"
        description="Phần khách đọc TRƯỚC khi trả tiền. Để trống thì khối tương ứng tự ẩn trên trang."
      />

      <FormField label="Câu chốt" hint="một dòng, hiện ngay dưới tên kỳ thi" wide>
        <Input
          value={tagline}
          onChange={(event) => setTagline(event.target.value)}
          placeholder="Luyện đúng cấu trúc đề ASMOPSS, đo tiến bộ mỗi 14 ngày"
        />
      </FormField>

      <FormField label="Video giới thiệu" hint="link YouTube, Vimeo hoặc tệp .mp4">
        <Input
          value={introVideoUrl}
          onChange={(event) => setIntroVideoUrl(event.target.value)}
          placeholder="https://www.youtube.com/watch?v=..."
        />
      </FormField>
      <FormField label="Ảnh nền video" hint="bỏ trống thì tự lấy ảnh của YouTube">
        <Input
          value={introVideoPoster}
          onChange={(event) => setIntroVideoPoster(event.target.value)}
          placeholder="https://..."
        />
      </FormField>

      <FormField label="Bài giới thiệu dài" hint="cách một dòng trống để sang đoạn mới" wide>
        <Textarea
          rows={6}
          value={longDescription}
          onChange={(event) => setLongDescription(event.target.value)}
        />
      </FormField>

      <FormField label="Các khối nội dung" hint="mỗi khối một tiêu đề và một đoạn" wide>
        <PairListEditor
          items={sections}
          onChange={setSections}
          titleLabel="Tiêu đề khối"
          bodyLabel="Nội dung"
          addLabel="Thêm khối nội dung"
          titlePlaceholder="Cấu trúc đề thi"
          max={12}
        />
      </FormField>

      <FormField label="Câu hỏi thường gặp riêng của kỳ thi" wide>
        <PairListEditor
          items={faqs}
          onChange={setFaqs}
          titleLabel="Câu hỏi"
          bodyLabel="Câu trả lời"
          addLabel="Thêm câu hỏi"
          titlePlaceholder="Thi vào tháng mấy?"
        />
      </FormField>
    </FormShell>
  );
}

// ---------------------------------------------------------------------------
// Biểu mẫu khóa học
// ---------------------------------------------------------------------------

function CourseForm({
  course,
  programId,
  programCode,
  coverUrl,
  saving,
  error,
  onCancel,
  onSubmit,
}: {
  course: CourseSummary | null;
  programId: string;
  /** Mã kỳ thi — cùng với khối và môn tạo nên khóa ô ảnh đại diện của khóa. */
  programCode: string;
  coverUrl: string | null;
  saving: boolean;
  error: string | null;
  onCancel: () => void;
  onSubmit: (body: Record<string, unknown>, coverFile: File | null) => void;
}) {
  const [coverFile, setCoverFile] = useState<File | null>(null);
  const [gradeBand, setGradeBand] = useState<GradeBand>(course?.gradeBand ?? 'A');
  const [subject, setSubject] = useState<Subject>(course?.subject ?? SUBJECTS_BY_BAND['A'][0]!);
  const [name, setName] = useState(course?.name ?? '');
  const [description, setDescription] = useState(course?.description ?? '');
  const [active, setActive] = useState(course?.active ?? true);
  const [tagline, setTagline] = useState(course?.tagline ?? '');
  const [longDescription, setLongDescription] = useState(course?.longDescription ?? '');
  const [introVideoUrl, setIntroVideoUrl] = useState(course?.introVideoUrl ?? '');
  const [outcomes, setOutcomes] = useState((course?.outcomes ?? []).join('\n'));
  const [syllabus, setSyllabus] = useState<PairItem[]>(
    (course?.syllabus ?? []).map((row) => ({ title: row.title, body: row.detail })),
  );

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
        onSubmit(
          {
          id: course?.id,
          programId,
          gradeBand,
          subject,
          name: name.trim(),
          description: description.trim() || undefined,
          active,
          tagline: tagline.trim() || undefined,
          longDescription: longDescription.trim() || undefined,
          introVideoUrl: introVideoUrl.trim() || undefined,
          outcomes: outcomes
            .split('\n')
            .map((line) => line.trim())
            .filter((line) => line.length > 0),
          syllabus: cleanPairs(syllabus).map((row) => ({ title: row.title, detail: row.body })),
          },
          coverFile,
        )
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

      <SectionDivider
        title="Trang giới thiệu khóa học"
        description="Hiển thị ở /khoa-hoc/<mã khóa> — khách xem trước khi bấm thanh toán."
      />

      {/* Khóa ô lấy theo khối/môn ĐÃ LƯU chứ không theo giá trị đang chọn trên
          biểu mẫu: đổi khối/môn của một khóa đã có rồi lưu thì ảnh thành ô mồ
          côi, đúng như khi đổi tên một ô trong images.ts.

          Khóa mới thì chưa có khóa ô nào (`slot={null}`) — ô ảnh giữ tệp lại và
          biểu mẫu đẩy lên sau khi khóa học được tạo, xem submitCourse. */}
      <CourseCoverField
        slot={course ? courseCoverSlot(programCode, course.gradeBand, course.subject) : null}
        initialUrl={coverUrl}
        onPick={setCoverFile}
      />

      <FormField label="Câu chốt" hint="một dòng, hiện dưới tên khóa" wide>
        <Input
          value={tagline}
          onChange={(event) => setTagline(event.target.value)}
          placeholder="Vá lỗ hổng số học trước khi bước vào hình học"
        />
      </FormField>

      <FormField label="Video giới thiệu" hint="link YouTube, Vimeo hoặc tệp .mp4" wide>
        <Input
          value={introVideoUrl}
          onChange={(event) => setIntroVideoUrl(event.target.value)}
          placeholder="https://www.youtube.com/watch?v=..."
        />
      </FormField>

      <FormField label="Bài giới thiệu dài" hint="cách một dòng trống để sang đoạn mới" wide>
        <Textarea
          rows={6}
          value={longDescription}
          onChange={(event) => setLongDescription(event.target.value)}
        />
      </FormField>

      <FormField label="Học xong con làm được gì" hint="mỗi dòng một ý" wide>
        <Textarea
          rows={4}
          value={outcomes}
          onChange={(event) => setOutcomes(event.target.value)}
          placeholder={'Quy đồng và so sánh phân số thành thạo\nGiải được bài toán chuyển động hai vật'}
        />
      </FormField>

      <FormField label="Nội dung khóa học theo chặng" wide>
        <PairListEditor
          items={syllabus}
          onChange={setSyllabus}
          titleLabel="Tên chặng"
          bodyLabel="Nội dung chặng"
          addLabel="Thêm chặng"
          titlePlaceholder="Chặng 1 — Đo năng lực và vá lỗ hổng"
          max={30}
        />
      </FormField>
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
