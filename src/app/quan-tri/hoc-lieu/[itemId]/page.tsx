import { notFound } from 'next/navigation';
import { hasRole, PUBLISH_ROLES, requireContentStaff } from '@/lib/auth';
import { getConfig } from '@/lib/config';
import { ApiError } from '@/lib/http';
import { routes } from '@/lib/routes';
import { formatDateTimeVN } from '@/lib/dates';
import { DIFFICULTY_LABEL, GRADE_BAND_LABEL, SUBJECT_LABEL } from '@/lib/domain';
import { getItem, listSkills, type ItemDetail } from '@/server/content/service';
import { listPrograms } from '@/server/catalog/service';
import { defaultEstimatedTimeSeconds } from '@/server/content/schemas';
import {
  Badge,
  Card,
  CardHeader,
  LinkButton,
  PageHeader,
  Section,
  StatTile,
  Table,
  Td,
  Tr,
} from '@/components/ui';
import { ItemEditor, type EditorSkillOption } from './item-editor';

export const dynamic = 'force-dynamic';

export const metadata = { title: 'Sửa câu hỏi' };

/** Trạng thái luôn kèm CHỮ; màu chỉ hỗ trợ nhìn nhanh (giống bảng kho câu hỏi). */
const STATUS_TONE: Record<ItemDetail['status'], 'neutral' | 'info' | 'success' | 'warn' | 'danger'> =
  {
    DRAFT: 'neutral',
    REVIEWED: 'info',
    PUBLISHED: 'success',
    FLAGGED: 'danger',
    RETIRED: 'warn',
  };

export default async function ItemDetailPage({
  params,
}: {
  params: Promise<{ itemId: string }>;
}) {
  const session = await requireContentStaff();
  const { itemId } = await params;

  const item = await getItem(itemId).catch((error: unknown) => {
    // Chỉ nuốt lỗi "không tìm thấy"; sự cố khác vẫn phải nổi lên để còn sửa.
    if (error instanceof ApiError && error.status === 404) return null;
    throw error;
  });
  if (!item) notFound();

  const [skills, programs, config] = await Promise.all([
    listSkills({}),
    listPrograms({ includeInactive: true }),
    getConfig(),
  ]);

  const skillOptions: EditorSkillOption[] = skills.map((skill) => ({
    id: skill.id,
    code: skill.code,
    name: skill.name,
    chapterCode: skill.chapter.code,
    chapterName: skill.chapter.name,
    subject: skill.chapter.subject,
    gradeBand: skill.chapter.gradeBand,
  }));

  const correctRate =
    item.stats.correctRate === null ? null : Math.round(item.stats.correctRate * 100);

  return (
    <>
      <PageHeader
        eyebrow="Kho câu hỏi"
        title={item.itemCode}
        subtitle={`${SUBJECT_LABEL[item.subject]} · ${GRADE_BAND_LABEL[item.gradeBand]} · Chương ${item.chapter.name} · Kỹ năng ${item.skill.code} — ${item.skill.name} · ${DIFFICULTY_LABEL[item.difficulty]}`}
        action={
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone={STATUS_TONE[item.status]} dot>
              {item.statusLabel}
            </Badge>
            <Badge tone="neutral">Bản {item.version}</Badge>
            <LinkButton href={routes.adminContent()} variant="secondary">
              ← Về kho câu hỏi
            </LinkButton>
          </div>
        }
      />

      <div className="stagger mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile
          label="Lượt được giao"
          value={<span className="tabular-nums">{item.stats.timesServed}</span>}
          hint={`${item.stats.timesCorrect} lượt trả lời đúng`}
        />
        <StatTile
          label="Tỷ lệ đúng"
          value={
            correctRate === null ? (
              <span className="text-ink-400">Chưa có</span>
            ) : (
              <span className="tabular-nums">{correctRate}%</span>
            )
          }
          hint={correctRate === null ? 'Câu chưa từng được giao' : undefined}
        />
        <StatTile
          label="Thời gian thực tế"
          value={
            item.stats.avgTimeSeconds === null ? (
              <span className="text-ink-400">Chưa có</span>
            ) : (
              <span className="tabular-nums">{Math.round(item.stats.avgTimeSeconds)} giây</span>
            )
          }
          hint={`Thời gian chuẩn đang đặt: ${item.estimatedTime} giây`}
        />
        <StatTile
          label="Báo lỗi"
          value={<span className="tabular-nums">{item.stats.reportCount}</span>}
          hint={
            item.flags.some((flag) => flag.status === 'OPEN')
              ? 'Còn phiếu chưa xử lý'
              : 'Không còn phiếu chờ'
          }
          tone={item.flags.some((flag) => flag.status === 'OPEN') ? 'danger' : undefined}
        />
      </div>

      <ItemEditor
        item={item}
        skills={skillOptions}
        programs={programs.map((program) => ({ code: program.code, name: program.name }))}
        defaultEstimatedTime={defaultEstimatedTimeSeconds(config.recommendation)}
        canPublish={hasRole(session, ...PUBLISH_ROLES)}
      />

      <Section className="mt-8">
        <Card>
          <CardHeader
            title="Lịch sử phiên bản"
            subtitle="Mỗi lần sửa đều lưu lại bản cũ để trả lời được: ai sửa gì, khi nào, vì sao."
          />
          {item.versions.length === 0 ? (
            <p className="text-sm text-ink-500">
              Câu này chưa có bản sửa nào — đây vẫn là nội dung gốc lúc tạo.
            </p>
          ) : (
            <Table head={['Phiên bản', 'Thời điểm lưu', 'Lý do sửa']}>
              {item.versions.map((version) => (
                <Tr key={version.version}>
                  <Td className="tabular-nums font-medium text-ink-800">Bản {version.version}</Td>
                  <Td className="whitespace-nowrap text-ink-600">
                    {formatDateTimeVN(version.createdAt)}
                  </Td>
                  <Td className="text-ink-600">{version.reason ?? 'Không ghi lý do'}</Td>
                </Tr>
              ))}
            </Table>
          )}
          <p className="mt-3 text-xs text-ink-500">
            Đang hiển thị tối đa 20 bản gần nhất. Nhật ký đầy đủ nằm ở mục Nhật ký hệ thống.
          </p>
        </Card>
      </Section>
    </>
  );
}
