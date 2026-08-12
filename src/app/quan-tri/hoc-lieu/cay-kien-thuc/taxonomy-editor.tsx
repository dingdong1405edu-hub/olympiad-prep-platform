'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { GradeBand, Subject } from '@prisma/client';
import type { ChapterTreeNode, ChapterTreeSkill } from '@/server/content/service';
import { apiPatch, apiPost } from '@/lib/client';
import { API, routes } from '@/lib/routes';
import {
  Alert,
  Badge,
  Button,
  Card,
  EmptyState,
  Input,
  Label,
  Select,
  Textarea,
  cx,
} from '@/components/ui';
import { Collapse, Toast, useToast } from '@/components/motion';

// ---------------------------------------------------------------------------
// Kiểu dữ liệu truyền từ Server Component
// ---------------------------------------------------------------------------

export interface PrerequisiteOption {
  id: string;
  code: string;
  name: string;
  chapterCode: string;
  chapterName: string;
  gradeBand: GradeBand;
  gradeBandLabel: string;
}

/** Giá trị chung của form chương và form kỹ năng. */
interface NodeFormValues {
  code: string;
  name: string;
  description: string;
  order: string;
  blueprintWeight: string;
}

type Panel =
  | { kind: 'CHAPTER_NEW' }
  | { kind: 'CHAPTER_EDIT'; chapterId: string }
  | { kind: 'SKILL_NEW'; chapterId: string }
  | { kind: 'SKILL_EDIT'; chapterId: string; skillId: string }
  | { kind: 'PREREQ'; skillId: string };

/** Trần số kỹ năng tiên quyết do schema quy định (setPrerequisitesSchema). */
const MAX_PREREQUISITES = 20;

function samePanel(a: Panel | null, b: Panel): boolean {
  if (!a || a.kind !== b.kind) return false;
  if (a.kind === 'CHAPTER_NEW') return true;
  if (a.kind === 'CHAPTER_EDIT' && b.kind === 'CHAPTER_EDIT') return a.chapterId === b.chapterId;
  if (a.kind === 'SKILL_NEW' && b.kind === 'SKILL_NEW') return a.chapterId === b.chapterId;
  if (a.kind === 'SKILL_EDIT' && b.kind === 'SKILL_EDIT') return a.skillId === b.skillId;
  if (a.kind === 'PREREQ' && b.kind === 'PREREQ') return a.skillId === b.skillId;
  return false;
}

// ---------------------------------------------------------------------------
// Màn hình chính
// ---------------------------------------------------------------------------

export function TaxonomyEditor({
  subject,
  gradeBand,
  subjectLabel,
  gradeBandLabel,
  chapters,
  prerequisiteOptions,
}: {
  subject: Subject;
  gradeBand: GradeBand;
  subjectLabel: string;
  gradeBandLabel: string;
  chapters: ChapterTreeNode[];
  prerequisiteOptions: PrerequisiteOption[];
}) {
  const router = useRouter();
  const { toast, show, hide } = useToast();

  const [panel, setPanel] = useState<Panel | null>(null);
  /**
   * Bảng đang mở gần nhất. Giữ lại để nội dung còn nằm trong DOM suốt lúc thu
   * gọn — nếu bỏ ngay thì khung xẹp xuống giật cục thay vì trượt mềm.
   */
  const [rendered, setRendered] = useState<Panel | null>(null);
  /** Tăng sau mỗi lần lưu để form dựng lại, không giữ nội dung của lần trước. */
  const [epoch, setEpoch] = useState(0);
  const [openChapters, setOpenChapters] = useState<string[]>(() =>
    chapters.length > 0 ? [chapters[0]!.id] : [],
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const chapterOptions = useMemo(
    () => chapters.map((chapter) => ({ id: chapter.id, code: chapter.code, name: chapter.name })),
    [chapters],
  );

  function togglePanel(next: Panel) {
    setError(null);
    setPanel((current) => (samePanel(current, next) ? null : next));
  }

  function toggleChapter(id: string) {
    setOpenChapters((current) =>
      current.includes(id) ? current.filter((value) => value !== id) : [...current, id],
    );
  }

  /** Gọi API, giữ nguyên form khi lỗi để người dùng sửa tiếp thay vì gõ lại. */
  async function submit(action: () => Promise<unknown>, successMessage: string) {
    setSaving(true);
    setError(null);
    try {
      await action();
      setPanel(null);
      show(successMessage, 'success');
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Không lưu được thay đổi.');
    } finally {
      setSaving(false);
    }
  }

  function saveChapter(values: NodeFormValues, chapterId?: string) {
    return submit(
      () =>
        apiPost(API.adminChapters, {
          ...(chapterId ? { id: chapterId } : {}),
          subject,
          gradeBand,
          code: values.code.trim().toUpperCase(),
          name: values.name.trim(),
          description: values.description.trim() || null,
          order: Number(values.order),
          blueprintWeight: Number(values.blueprintWeight),
        }),
      chapterId ? 'Đã lưu thay đổi của chương.' : 'Đã thêm chương mới vào cây kiến thức.',
    );
  }

  function saveSkill(values: NodeFormValues, chapterId: string, skillId?: string) {
    return submit(
      () =>
        apiPost(API.adminSkills, {
          ...(skillId ? { id: skillId } : {}),
          chapterId,
          code: values.code.trim().toUpperCase(),
          name: values.name.trim(),
          description: values.description.trim() || null,
          order: Number(values.order),
          blueprintWeight: Number(values.blueprintWeight),
        }),
      skillId ? 'Đã lưu thay đổi của kỹ năng.' : 'Đã thêm kỹ năng mới.',
    );
  }

  function savePrerequisites(skillId: string, prerequisiteSkillIds: string[]) {
    return submit(
      () => apiPatch(API.adminSkills, { skillId, prerequisiteSkillIds }),
      'Đã cập nhật danh sách kỹ năng tiên quyết.',
    );
  }

  const allOpen = chapters.length > 0 && openChapters.length === chapters.length;

  return (
    <div>
      {error ? (
        <Alert tone="danger" className="mb-4" title="Chưa lưu được">
          {error}
        </Alert>
      ) : null}

      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-ink-600">
          Đang xem cây của <strong>{subjectLabel}</strong> · <strong>{gradeBandLabel}</strong>. Mọi
          thay đổi ở đây đều được ghi nhật ký để truy vết.
        </p>
        <div className="flex flex-wrap gap-2">
          {chapters.length > 0 ? (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setOpenChapters(allOpen ? [] : chapters.map((c) => c.id))}
            >
              {allOpen ? 'Thu gọn tất cả' : 'Mở tất cả chương'}
            </Button>
          ) : null}
          <Button size="sm" onClick={() => togglePanel({ kind: 'CHAPTER_NEW' })}>
            Thêm chương
          </Button>
        </div>
      </div>

      <Collapse open={panel?.kind === 'CHAPTER_NEW'}>
        <Card className="mb-4 ring-brand-200">
          <NodeForm
            heading="Thêm chương mới"
            description={`Chương thuộc ${subjectLabel} · ${gradeBandLabel}. Mã chương nên ngắn và không đổi về sau (ví dụ: PS, HH, SH).`}
            codeLabel="Mã chương"
            codePlaceholder="PS"
            namePlaceholder="Phân số"
            saving={saving}
            submitLabel="Tạo chương"
            onCancel={() => setPanel(null)}
            onSubmit={(values) => saveChapter(values)}
          />
        </Card>
      </Collapse>

      {chapters.length === 0 ? (
        <EmptyState
          icon="🌳"
          title="Nhánh này chưa có chương nào"
          description="Cây kiến thức là điều kiện bắt buộc trước khi nhập câu hỏi: mỗi câu phải gắn vào một kỹ năng thì hệ thống mới biết học sinh đang hổng phần nào."
          action={
            <Button onClick={() => togglePanel({ kind: 'CHAPTER_NEW' })}>
              Thêm chương đầu tiên
            </Button>
          }
        />
      ) : (
        <div className="stagger space-y-4">
          {chapters.map((chapter) => {
            const isOpen = openChapters.includes(chapter.id);
            const editingChapter = samePanel(panel, {
              kind: 'CHAPTER_EDIT',
              chapterId: chapter.id,
            });
            const addingSkill = samePanel(panel, { kind: 'SKILL_NEW', chapterId: chapter.id });

            return (
              <Card key={chapter.id}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <button
                    type="button"
                    onClick={() => toggleChapter(chapter.id)}
                    aria-expanded={isOpen}
                    className="press flex min-w-0 flex-1 items-start gap-3 text-left"
                  >
                    <span
                      aria-hidden
                      className={cx(
                        'mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-brand-50 text-brand-700 transition-transform duration-200',
                        isOpen && 'rotate-90',
                      )}
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                        <path
                          d="M9 6l6 6-6 6"
                          stroke="currentColor"
                          strokeWidth="2.5"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      </svg>
                    </span>
                    <span className="min-w-0">
                      <span className="block font-semibold text-ink-900">
                        {chapter.code} — {chapter.name}
                      </span>
                      <span className="mt-0.5 block text-sm text-ink-500 tabular-nums">
                        {chapter.skills.length} kỹ năng · {chapter.itemCounts.published}/
                        {chapter.itemCounts.total} câu đã xuất bản · Thứ tự {chapter.order} · Tỷ
                        trọng {chapter.blueprintWeight}
                      </span>
                    </span>
                  </button>

                  <div className="flex shrink-0 flex-wrap gap-2">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => togglePanel({ kind: 'CHAPTER_EDIT', chapterId: chapter.id })}
                    >
                      Sửa chương
                    </Button>
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => {
                        if (!openChapters.includes(chapter.id)) toggleChapter(chapter.id);
                        togglePanel({ kind: 'SKILL_NEW', chapterId: chapter.id });
                      }}
                    >
                      Thêm kỹ năng
                    </Button>
                  </div>
                </div>

                {chapter.description ? (
                  <p className="mt-2 text-sm text-ink-600">{chapter.description}</p>
                ) : null}

                <Collapse open={editingChapter}>
                  <div className="mt-4 rounded-xl bg-canvas p-4">
                    <NodeForm
                      heading={`Sửa chương ${chapter.code}`}
                      description="Đổi mã chương sẽ ảnh hưởng tới file import đang dùng mã cũ — hãy báo đội nội dung trước khi đổi."
                      codeLabel="Mã chương"
                      codePlaceholder="PS"
                      namePlaceholder="Phân số"
                      initial={{
                        code: chapter.code,
                        name: chapter.name,
                        description: chapter.description ?? '',
                        order: String(chapter.order),
                        blueprintWeight: String(chapter.blueprintWeight),
                      }}
                      saving={saving}
                      submitLabel="Lưu chương"
                      onCancel={() => setPanel(null)}
                      onSubmit={(values) => saveChapter(values, chapter.id)}
                    />
                  </div>
                </Collapse>

                <Collapse open={addingSkill}>
                  <div className="mt-4 rounded-xl bg-canvas p-4">
                    <NodeForm
                      heading={`Thêm kỹ năng vào chương ${chapter.code}`}
                      description="Kỹ năng là đơn vị nhỏ nhất engine dùng để xác định lỗ hổng. Đặt tên theo việc học sinh làm được, ví dụ: “So sánh hai phân số”."
                      codeLabel="Mã kỹ năng"
                      codePlaceholder="PS-SO-SANH"
                      namePlaceholder="So sánh hai phân số"
                      chapters={chapterOptions}
                      chapterId={chapter.id}
                      saving={saving}
                      submitLabel="Tạo kỹ năng"
                      onCancel={() => setPanel(null)}
                      onSubmit={(values, chapterId) =>
                        saveSkill(values, chapterId ?? chapter.id)
                      }
                    />
                  </div>
                </Collapse>

                <Collapse open={isOpen}>
                  <div className="mt-4 space-y-3 border-l-2 border-ink-100 pl-4">
                    {chapter.skills.length === 0 ? (
                      <p className="py-2 text-sm text-ink-500">
                        Chương này chưa có kỹ năng nào. Chỉ gắn câu hỏi vào chương là chưa đủ để cá
                        nhân hóa — hãy thêm ít nhất một kỹ năng.
                      </p>
                    ) : (
                      chapter.skills.map((skill) => (
                        <SkillRow
                          key={skill.id}
                          skill={skill}
                          chapterId={chapter.id}
                          chapterOptions={chapterOptions}
                          prerequisiteOptions={prerequisiteOptions}
                          panel={panel}
                          saving={saving}
                          onTogglePanel={togglePanel}
                          onCancel={() => setPanel(null)}
                          onSaveSkill={saveSkill}
                          onSavePrerequisites={savePrerequisites}
                        />
                      ))
                    )}
                  </div>
                </Collapse>
              </Card>
            );
          })}
        </div>
      )}

      <Toast message={toast.message} tone={toast.tone} onClose={hide} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Một kỹ năng trong cây
// ---------------------------------------------------------------------------

function SkillRow({
  skill,
  chapterId,
  chapterOptions,
  prerequisiteOptions,
  panel,
  saving,
  onTogglePanel,
  onCancel,
  onSaveSkill,
  onSavePrerequisites,
}: {
  skill: ChapterTreeSkill;
  chapterId: string;
  chapterOptions: { id: string; code: string; name: string }[];
  prerequisiteOptions: PrerequisiteOption[];
  panel: Panel | null;
  saving: boolean;
  onTogglePanel: (panel: Panel) => void;
  onCancel: () => void;
  onSaveSkill: (values: NodeFormValues, chapterId: string, skillId?: string) => void;
  onSavePrerequisites: (skillId: string, prerequisiteSkillIds: string[]) => void;
}) {
  const editing = samePanel(panel, { kind: 'SKILL_EDIT', chapterId, skillId: skill.id });
  const editingPrereq = samePanel(panel, { kind: 'PREREQ', skillId: skill.id });
  const noPublished = skill.itemCounts.published === 0;

  return (
    <div className="rounded-xl bg-canvas p-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-medium text-ink-800">
            {skill.code} — {skill.name}
          </p>
          {skill.description ? (
            <p className="mt-0.5 text-sm text-ink-600">{skill.description}</p>
          ) : null}

          <div className="mt-2 flex flex-wrap items-center gap-2">
            <Badge tone="neutral">Thứ tự {skill.order}</Badge>
            <Badge tone="neutral">Tỷ trọng {skill.blueprintWeight}</Badge>
            <Badge tone={noPublished ? 'warn' : 'brand'} dot>
              {skill.itemCounts.published} câu đã xuất bản
            </Badge>
            <span className="text-xs text-ink-500 tabular-nums">
              {skill.itemCounts.total} câu trong kho
            </span>
          </div>

          <p className="mt-2 text-sm text-ink-600">
            {skill.prerequisites.length === 0 ? (
              <span className="text-ink-500">
                Chưa khai kỹ năng tiên quyết — engine sẽ coi đây là kỹ năng nền.
              </span>
            ) : (
              <>
                Cần học trước:{' '}
                {skill.prerequisites.map((prerequisite, index) => (
                  <span key={prerequisite.id}>
                    {index > 0 ? ', ' : ''}
                    <strong className="font-medium text-ink-800">{prerequisite.code}</strong> (
                    {prerequisite.name})
                  </span>
                ))}
              </>
            )}
          </p>

          {noPublished ? (
            <p className="mt-1 text-sm text-amber-700">
              Chưa có câu nào được xuất bản cho kỹ năng này nên engine chưa dạy được phần đó.
            </p>
          ) : null}
        </div>

        <div className="flex shrink-0 flex-wrap gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onTogglePanel({ kind: 'SKILL_EDIT', chapterId, skillId: skill.id })}
          >
            Sửa
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onTogglePanel({ kind: 'PREREQ', skillId: skill.id })}
          >
            Kỹ năng tiên quyết
          </Button>
          <Link
            href={`${routes.adminContent()}?skillId=${skill.id}`}
            className="link-underline self-center text-sm font-medium text-brand-700"
          >
            Xem câu hỏi
          </Link>
        </div>
      </div>

      <Collapse open={editing}>
        <div className="mt-3 rounded-lg bg-white p-4 ring-1 ring-ink-100">
          <NodeForm
            heading={`Sửa kỹ năng ${skill.code}`}
            description="Chuyển kỹ năng sang chương khác sẽ kéo theo toàn bộ câu hỏi đang gắn với kỹ năng này."
            codeLabel="Mã kỹ năng"
            codePlaceholder="PS-SO-SANH"
            namePlaceholder="So sánh hai phân số"
            chapters={chapterOptions}
            chapterId={chapterId}
            initial={{
              code: skill.code,
              name: skill.name,
              description: skill.description ?? '',
              order: String(skill.order),
              blueprintWeight: String(skill.blueprintWeight),
            }}
            saving={saving}
            submitLabel="Lưu kỹ năng"
            onCancel={onCancel}
            onSubmit={(values, nextChapterId) =>
              onSaveSkill(values, nextChapterId ?? chapterId, skill.id)
            }
          />
        </div>
      </Collapse>

      <Collapse open={editingPrereq}>
        <div className="mt-3 rounded-lg bg-white p-4 ring-1 ring-ink-100">
          <PrerequisiteForm
            skill={skill}
            options={prerequisiteOptions}
            saving={saving}
            onCancel={onCancel}
            onSubmit={(ids) => onSavePrerequisites(skill.id, ids)}
          />
        </div>
      </Collapse>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Form dùng chung cho chương và kỹ năng
// ---------------------------------------------------------------------------

const EMPTY_VALUES: NodeFormValues = {
  code: '',
  name: '',
  description: '',
  order: '0',
  blueprintWeight: '1',
};

function NodeForm({
  heading,
  description,
  codeLabel,
  codePlaceholder,
  namePlaceholder,
  initial,
  chapters,
  chapterId,
  saving,
  submitLabel,
  onSubmit,
  onCancel,
}: {
  heading: string;
  description: string;
  codeLabel: string;
  codePlaceholder: string;
  namePlaceholder: string;
  initial?: NodeFormValues;
  /** Có danh sách chương = đang sửa kỹ năng (được phép chuyển chương). */
  chapters?: { id: string; code: string; name: string }[];
  chapterId?: string;
  saving: boolean;
  submitLabel: string;
  onSubmit: (values: NodeFormValues, chapterId?: string) => void;
  onCancel: () => void;
}) {
  const [values, setValues] = useState<NodeFormValues>(initial ?? EMPTY_VALUES);
  const [selectedChapter, setSelectedChapter] = useState(chapterId ?? '');

  function update(patch: Partial<NodeFormValues>) {
    setValues((current) => ({ ...current, ...patch }));
  }

  // Kiểm tra tại chỗ đúng luật của máy chủ để không phải chờ một vòng gọi API.
  const problem = (() => {
    const code = values.code.trim();
    if (code.length < 2) return 'Mã phải có ít nhất 2 ký tự.';
    if (!/^[A-Za-z0-9._-]+$/.test(code)) return 'Mã chỉ gồm chữ, số và ký tự . _ -';
    if (values.name.trim().length < 2) return 'Tên quá ngắn.';
    const order = Number(values.order);
    if (!Number.isInteger(order) || order < 0 || order > 999) {
      return 'Thứ tự phải là số nguyên từ 0 đến 999.';
    }
    const weight = Number(values.blueprintWeight);
    if (!Number.isFinite(weight) || weight <= 0 || weight > 100) {
      return 'Tỷ trọng blueprint phải lớn hơn 0 và không quá 100.';
    }
    if (chapters && !selectedChapter) return 'Hãy chọn chương cho kỹ năng.';
    return null;
  })();

  return (
    <div>
      <p className="font-semibold text-ink-900">{heading}</p>
      <p className="mt-0.5 mb-3 text-sm text-ink-500">{description}</p>

      <div className="grid gap-4 sm:grid-cols-2">
        {chapters ? (
          <div className="sm:col-span-2">
            <Label htmlFor={`${heading}-chapter`}>Chương chứa kỹ năng</Label>
            <Select
              id={`${heading}-chapter`}
              value={selectedChapter}
              onChange={(event) => setSelectedChapter(event.target.value)}
            >
              {chapters.map((chapter) => (
                <option key={chapter.id} value={chapter.id}>
                  {chapter.code} — {chapter.name}
                </option>
              ))}
            </Select>
          </div>
        ) : null}

        <div>
          <Label htmlFor={`${heading}-code`} hint="chữ, số và . _ -">
            {codeLabel}
          </Label>
          <Input
            id={`${heading}-code`}
            value={values.code}
            onChange={(event) => update({ code: event.target.value.toUpperCase() })}
            placeholder={codePlaceholder}
          />
        </div>

        <div>
          <Label htmlFor={`${heading}-name`}>Tên hiển thị</Label>
          <Input
            id={`${heading}-name`}
            value={values.name}
            onChange={(event) => update({ name: event.target.value })}
            placeholder={namePlaceholder}
          />
        </div>

        <div>
          <Label htmlFor={`${heading}-order`} hint="số nhỏ hiện trước">
            Thứ tự học
          </Label>
          <Input
            id={`${heading}-order`}
            type="number"
            min={0}
            max={999}
            value={values.order}
            onChange={(event) => update({ order: event.target.value })}
          />
        </div>

        <div>
          <Label htmlFor={`${heading}-weight`} hint="phần chiếm trong đề">
            Tỷ trọng blueprint
          </Label>
          <Input
            id={`${heading}-weight`}
            type="number"
            min={0.1}
            max={100}
            step="0.1"
            value={values.blueprintWeight}
            onChange={(event) => update({ blueprintWeight: event.target.value })}
          />
        </div>

        <div className="sm:col-span-2">
          <Label htmlFor={`${heading}-description`} hint="không bắt buộc">
            Mô tả ngắn
          </Label>
          <Textarea
            id={`${heading}-description`}
            className="min-h-20"
            value={values.description}
            onChange={(event) => update({ description: event.target.value })}
            placeholder="Học sinh làm được gì sau phần này?"
          />
        </div>
      </div>

      {problem ? (
        <Alert tone="warn" className="mt-3">
          {problem}
        </Alert>
      ) : null}

      <div className="mt-4 flex flex-wrap gap-2">
        <Button
          onClick={() => onSubmit(values, chapters ? selectedChapter : undefined)}
          disabled={saving || problem !== null}
          loading={saving}
        >
          {submitLabel}
        </Button>
        <Button variant="ghost" onClick={onCancel} disabled={saving}>
          Hủy
        </Button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Khai báo kỹ năng tiên quyết
// ---------------------------------------------------------------------------

function PrerequisiteForm({
  skill,
  options,
  saving,
  onSubmit,
  onCancel,
}: {
  skill: ChapterTreeSkill;
  options: PrerequisiteOption[];
  saving: boolean;
  onSubmit: (prerequisiteSkillIds: string[]) => void;
  onCancel: () => void;
}) {
  const [selected, setSelected] = useState<string[]>(() =>
    skill.prerequisites.map((prerequisite) => prerequisite.id),
  );
  const [search, setSearch] = useState('');

  // Một kỹ năng không thể là điều kiện tiên quyết của chính nó.
  const selectable = useMemo(
    () => options.filter((option) => option.id !== skill.id),
    [options, skill.id],
  );

  const visible = useMemo(() => {
    const keyword = search.trim().toLowerCase();
    if (!keyword) return selectable;
    return selectable.filter(
      (option) =>
        option.code.toLowerCase().includes(keyword) ||
        option.name.toLowerCase().includes(keyword) ||
        option.chapterCode.toLowerCase().includes(keyword) ||
        option.chapterName.toLowerCase().includes(keyword),
    );
  }, [selectable, search]);

  const tooMany = selected.length > MAX_PREREQUISITES;

  function toggle(id: string) {
    setSelected((current) =>
      current.includes(id) ? current.filter((value) => value !== id) : [...current, id],
    );
  }

  return (
    <div>
      <p className="font-semibold text-ink-900">Kỹ năng cần học trước “{skill.name}”</p>
      <p className="mt-0.5 mb-3 text-sm text-ink-500">
        Engine đi ngược danh sách này để tìm phần nền cần vá khi học sinh làm sai. Chỉ chọn kỹ năng
        thật sự là điều kiện tiên quyết — chọn thừa sẽ khiến lộ trình vòng vèo.
      </p>

      <Alert tone="info" className="mb-3">
        Danh sách tiên quyết <strong>không được tạo thành vòng lặp</strong> (A cần B, B lại cần A).
        Hệ thống sẽ từ chối và chỉ rõ đường vòng nếu điều đó xảy ra — khi ấy hãy bỏ bớt một mắt xích.
      </Alert>

      {selectable.length === 0 ? (
        <p className="text-sm text-ink-500">
          Môn này chưa có kỹ năng nào khác để chọn làm tiên quyết.
        </p>
      ) : (
        <>
          <div className="mb-3">
            <Label htmlFor={`prereq-search-${skill.id}`}>Tìm kỹ năng</Label>
            <Input
              id={`prereq-search-${skill.id}`}
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Mã hoặc tên kỹ năng, tên chương"
            />
          </div>

          <div className="max-h-72 space-y-1 overflow-y-auto rounded-lg bg-canvas p-2">
            {visible.length === 0 ? (
              <p className="p-2 text-sm text-ink-500">Không có kỹ năng nào khớp từ khóa.</p>
            ) : (
              visible.map((option) => (
                <label
                  key={option.id}
                  className="flex cursor-pointer items-start gap-2 rounded-lg px-2 py-1.5 text-sm transition-colors hover:bg-white"
                >
                  <input
                    type="checkbox"
                    className="mt-1 h-4 w-4 rounded border-ink-300"
                    checked={selected.includes(option.id)}
                    onChange={() => toggle(option.id)}
                  />
                  <span className="min-w-0">
                    <span className="block font-medium text-ink-800">
                      {option.code} — {option.name}
                    </span>
                    <span className="block text-xs text-ink-500">
                      {option.chapterCode} · {option.chapterName} · {option.gradeBandLabel}
                    </span>
                  </span>
                </label>
              ))
            )}
          </div>

          <p className="mt-2 text-sm text-ink-600 tabular-nums">
            Đang chọn {selected.length}/{MAX_PREREQUISITES} kỹ năng tiên quyết.
          </p>

          {tooMany ? (
            <Alert tone="warn" className="mt-2">
              Tối đa {MAX_PREREQUISITES} kỹ năng tiên quyết cho một kỹ năng. Hãy bỏ bớt để giữ lộ
              trình gọn gàng.
            </Alert>
          ) : null}
        </>
      )}

      <div className="mt-4 flex flex-wrap gap-2">
        <Button onClick={() => onSubmit(selected)} disabled={saving || tooMany} loading={saving}>
          Lưu danh sách tiên quyết
        </Button>
        {selected.length > 0 ? (
          <Button variant="secondary" onClick={() => setSelected([])} disabled={saving}>
            Bỏ chọn tất cả
          </Button>
        ) : null}
        <Button variant="ghost" onClick={onCancel} disabled={saving}>
          Hủy
        </Button>
      </div>
    </div>
  );
}
