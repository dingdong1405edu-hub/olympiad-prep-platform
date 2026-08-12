'use client';

/**
 * Khối 6 + 7 của báo cáo trước buổi tư vấn: AI Recommendation và Teacher Notes.
 *
 * Hai khối này nằm chung một Client Component vì chúng CÙNG được gửi trong một
 * lần lưu: `aiBriefApproved` đi kèm notes trong `saveSessionNotesSchema`. Tách
 * đôi sẽ khiến giáo viên phải bấm lưu hai lần cho một quyết định.
 *
 * Đây là mắt xích đóng vòng lặp của cả hệ thống (specs §10.4): action giáo viên
 * chọn ở đây được engine nhận làm override cho chu kỳ 2 tuần kế tiếp. Vì vậy màn
 * hình phải nói RÕ RÀNG chuyện gì vừa xảy ra sau khi lưu.
 */
import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { TeacherAction } from '@prisma/client';
import { apiPost } from '@/lib/client';
import { API } from '@/lib/routes';
import { TEACHER_ACTION_LABEL } from '@/lib/domain';
import {
  FOLLOW_UP_LEVELS,
  FOLLOW_UP_LEVEL_LABEL,
  type FollowUpLevel,
} from '@/server/teacher/schemas';
import {
  Alert,
  Badge,
  Button,
  Card,
  CardHeader,
  ChoiceCard,
  Input,
  Label,
  Textarea,
  cx,
} from '@/components/ui';
import { Collapse, Toast, useToast } from '@/components/motion';

// --- Giới hạn khớp với saveSessionNotesSchema, để báo lỗi ngay trên máy ---
const NOTES_MIN = 10;
const NOTES_MAX = 8000;
const ACTION_ITEM_MAX = 10;
const ACTION_ITEM_LENGTH = 300;
const FOCUS_SKILL_MAX = 20;

const ACTION_ORDER: TeacherAction[] = [
  'KEEP_PLAN',
  'REDUCE_LOAD',
  'INCREASE_LOAD',
  'CHANGE_PRIORITY',
];

/** Mỗi action nói rõ engine sẽ làm gì ở chu kỳ sau — giáo viên chọn có căn cứ. */
const ACTION_EFFECT: Record<TeacherAction, string> = {
  KEEP_PLAN: 'Lộ trình hiện tại giữ nguyên, hệ thống chỉ ghi nhận thầy cô đã xem và chủ động không đổi.',
  REDUCE_LOAD: 'Hệ thống sinh lại lộ trình 2 tuần tới với ít bài mỗi ngày hơn.',
  INCREASE_LOAD: 'Hệ thống sinh lại lộ trình 2 tuần tới với nhiều bài mỗi ngày hơn.',
  CHANGE_PRIORITY: 'Hệ thống sinh lại lộ trình 2 tuần tới, ưu tiên đúng những kỹ năng thầy cô chọn.',
};

const FOLLOW_UP_HINT: Record<FollowUpLevel, string> = {
  NORMAL: 'Học sinh đi đúng nhịp, gặp lại ở chu kỳ sau.',
  WATCH: 'Cần nhìn lại sớm giữa chu kỳ.',
  ESCALATE: 'Cần báo phụ huynh hoặc quản lý chương trình.',
};

export interface SessionSkillOption {
  id: string;
  name: string;
  chapterName: string;
  masteryScore: number;
  tierLabel: string;
}

export interface SessionBriefView {
  overview: string;
  keyIssues: string[];
  talkingPoints: string[];
  suggestedActions: string[];
  /** true = bản tóm tắt dựng từ số liệu, KHÔNG do mô hình ngôn ngữ viết. */
  fallbackUsed: boolean;
}

export interface SessionNotesInitial {
  teacherNotes: string;
  actionCode: TeacherAction | null;
  actionItems: string[];
  focusSkillIds: string[];
  followUpLevel: FollowUpLevel | null;
  aiBriefApproved: boolean | null;
}

interface ActionItemRow {
  key: string;
  text: string;
}

export function SessionNotes({
  sessionId,
  studentName,
  brief,
  skills,
  initial,
  locked = false,
}: {
  sessionId: string;
  studentName: string;
  brief: SessionBriefView | null;
  skills: SessionSkillOption[];
  initial: SessionNotesInitial;
  /** Buổi đã hủy / học sinh vắng → không cho ghi tiếp, chỉ đọc. */
  locked?: boolean;
}) {
  const router = useRouter();
  const { toast, show, hide } = useToast();
  const nextKey = useRef(0);

  const [approved, setApproved] = useState<boolean | null>(initial.aiBriefApproved);
  const [notes, setNotes] = useState(initial.teacherNotes);
  const [actionCode, setActionCode] = useState<TeacherAction | null>(initial.actionCode);
  const [focusSkillIds, setFocusSkillIds] = useState<string[]>(initial.focusSkillIds);
  const [followUpLevel, setFollowUpLevel] = useState<FollowUpLevel | null>(initial.followUpLevel);
  const [items, setItems] = useState<ActionItemRow[]>(() =>
    initial.actionItems.map((text) => ({ key: `seed-${nextKey.current++}`, text })),
  );
  const [draft, setDraft] = useState('');

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedAction, setSavedAction] = useState<TeacherAction | null>(null);

  const notesLength = notes.trim().length;
  const needsSkills = actionCode === 'CHANGE_PRIORITY';
  const canAddItem =
    draft.trim().length > 0 && items.length < ACTION_ITEM_MAX && !locked;

  function addItem(text: string) {
    const value = text.trim().slice(0, ACTION_ITEM_LENGTH);
    if (!value || items.length >= ACTION_ITEM_MAX) return;
    setItems((current) => [...current, { key: `row-${nextKey.current++}`, text: value }]);
    setDraft('');
  }

  function removeItem(key: string) {
    setItems((current) => current.filter((row) => row.key !== key));
  }

  function toggleSkill(id: string) {
    setFocusSkillIds((current) => {
      if (current.includes(id)) return current.filter((value) => value !== id);
      if (current.length >= FOCUS_SKILL_MAX) return current;
      return [...current, id];
    });
  }

  function validate(): string | null {
    if (notesLength < NOTES_MIN) {
      return `Ghi chú buổi tư vấn cần ít nhất ${NOTES_MIN} ký tự để lần sau còn đọc lại được.`;
    }
    if (!actionCode) return 'Hãy chọn một hành động cho chu kỳ 2 tuần tới.';
    if (!followUpLevel) return 'Hãy chọn mức cần theo dõi sau buổi này.';
    if (actionCode === 'CHANGE_PRIORITY' && focusSkillIds.length === 0) {
      return 'Chọn “Đổi ưu tiên kỹ năng” thì cần chọn ít nhất một kỹ năng để engine bám theo.';
    }
    return null;
  }

  async function save() {
    const problem = validate();
    if (problem) {
      setError(problem);
      setSavedAction(null);
      return;
    }

    setSaving(true);
    setError(null);
    setSavedAction(null);

    try {
      await apiPost(API.teacherSessionNotes(sessionId), {
        teacherNotes: notes.trim(),
        actionCode,
        actionItems: items.map((row) => row.text),
        // Kỹ năng ưu tiên chỉ có nghĩa với action đổi ưu tiên, gửi kèm action
        // khác sẽ làm engine hiểu sai ý giáo viên.
        focusSkillIds: needsSkills ? focusSkillIds : [],
        followUpLevel,
        aiBriefApproved: approved,
      });
      setSavedAction(actionCode);
      show('Đã lưu buổi tư vấn và cập nhật lộ trình.', 'success');
      router.refresh();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Chưa lưu được, thầy cô thử lại giúp.';
      setError(message);
      show(message, 'error');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-4">
      {/* --- Khối 6: AI Recommendation --- */}
      <Card>
        <CardHeader
          title="Khuyến nghị trước buổi"
          subtitle="Do hệ thống chuẩn bị. Thầy cô là người quyết định cuối cùng."
          icon={<span aria-hidden>🧭</span>}
          action={
            approved === null ? (
              <Badge tone="neutral">Chưa đánh giá</Badge>
            ) : approved ? (
              <Badge tone="success" dot>
                Đã đồng ý
              </Badge>
            ) : (
              <Badge tone="warn" dot>
                Không đồng ý
              </Badge>
            )
          }
        />

        {brief === null ? (
          <p className="text-sm text-ink-500">
            Chưa dựng được bản tóm tắt cho buổi này. Thầy cô đọc các khối số liệu phía trên và ghi
            nhận xét trực tiếp bên dưới nhé.
          </p>
        ) : (
          <div className="space-y-4">
            <p className="text-sm leading-relaxed text-ink-700">{brief.overview}</p>

            <BriefList title="Vấn đề nổi bật" items={brief.keyIssues} tone="warn" />
            <BriefList title="Gợi ý câu hỏi trong buổi" items={brief.talkingPoints} tone="brand" />

            {brief.suggestedActions.length > 0 ? (
              <div>
                <p className="mb-1.5 text-xs font-semibold tracking-wide text-ink-500 uppercase">
                  Đề xuất hành động
                </p>
                <ul className="stagger space-y-1.5">
                  {brief.suggestedActions.map((suggestion) => (
                    <li
                      key={suggestion}
                      className="flex items-start gap-2.5 text-sm leading-relaxed text-ink-700"
                    >
                      <span aria-hidden className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-sky-500" />
                      <span className="min-w-0 flex-1">{suggestion}</span>
                      {locked ? null : (
                        <button
                          type="button"
                          disabled={items.length >= ACTION_ITEM_MAX}
                          onClick={() => addItem(suggestion)}
                          className="press shrink-0 rounded-md bg-brand-50 px-2 py-0.5 text-xs font-medium text-brand-700 transition-colors hover:bg-brand-100 disabled:opacity-50"
                        >
                          + Việc cần làm
                        </button>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}

            {brief.fallbackUsed ? (
              <p className="rounded-lg bg-ink-50 px-3 py-2 text-xs leading-relaxed text-ink-600">
                <strong>Lưu ý:</strong> đây là bản tóm tắt <strong>tự động dựng từ số liệu học tập</strong>{' '}
                của học sinh, không phải do mô hình ngôn ngữ viết. Nội dung đúng theo con số nhưng
                không có phần diễn giải sư phạm — thầy cô đọc kỹ các khối số liệu trước khi dùng.
              </p>
            ) : null}
          </div>
        )}

        <div className="mt-4 border-t border-ink-100 pt-4">
          <p className="mb-2 text-sm font-medium text-ink-700">
            Thầy cô thấy khuyến nghị này có dùng được không?
          </p>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant={approved === true ? 'success' : 'secondary'}
              size="sm"
              disabled={locked}
              onClick={() => setApproved(true)}
              aria-pressed={approved === true}
            >
              Đồng ý
            </Button>
            <Button
              type="button"
              variant={approved === false ? 'danger' : 'secondary'}
              size="sm"
              disabled={locked}
              onClick={() => setApproved(false)}
              aria-pressed={approved === false}
            >
              Không đồng ý
            </Button>
          </div>
          <p className="mt-2 text-xs text-ink-500">
            Đánh giá này được lưu cùng ghi chú, dùng để đo chất lượng khuyến nghị theo thời gian.
          </p>
        </div>
      </Card>

      {/* --- Khối 7: Teacher Notes --- */}
      <Card>
        <CardHeader
          title="Ghi chú sau buổi"
          subtitle={`Những gì thầy cô ghi ở đây sẽ điều khiển lộ trình 2 tuần tới của ${studentName}.`}
          icon={<span aria-hidden>✍️</span>}
        />

        {locked ? (
          <Alert tone="info" className="mb-4">
            Buổi này không ở trạng thái đang diễn ra nên phần ghi chú chỉ để xem lại.
          </Alert>
        ) : null}

        <div className="mb-4">
          <Label htmlFor="teacher-notes" hint={`${notesLength}/${NOTES_MAX} ký tự`}>
            Nội dung đã trao đổi
          </Label>
          <Textarea
            id="teacher-notes"
            value={notes}
            disabled={locked}
            maxLength={NOTES_MAX}
            onChange={(event) => setNotes(event.target.value)}
            className="min-h-40"
            placeholder={
              'Nguyên nhân thật sự của lỗi (kiến thức / chiến thuật / đọc đề / tâm lý thời gian)?\n' +
              'Mục tiêu hiện tại có còn hợp lý không?\n' +
              '1–3 khuyến nghị quan trọng nhất cho 2 tuần tới.'
            }
          />
          {notesLength > 0 && notesLength < NOTES_MIN ? (
            <p className="mt-1.5 text-sm text-amber-700">
              Còn thiếu {NOTES_MIN - notesLength} ký tự nữa.
            </p>
          ) : null}
        </div>

        {/* --- Việc cần làm --- */}
        <div className="mb-5">
          <Label hint={`tối đa ${ACTION_ITEM_MAX} việc`}>Việc cần làm của học sinh</Label>

          {items.length === 0 ? (
            <p className="mb-2 rounded-lg border border-dashed border-ink-200 px-3 py-3 text-sm text-ink-500">
              Chưa có việc nào. Một hai việc cụ thể, làm được ngay sẽ hiệu quả hơn một danh sách dài.
            </p>
          ) : (
            <ul className="mb-2 space-y-2">
              {items.map((row, index) => (
                <li
                  key={row.key}
                  className="animate-fade-up flex items-start gap-3 rounded-lg bg-ink-50 px-3 py-2"
                >
                  <span
                    aria-hidden
                    className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-brand-100 text-xs font-bold text-brand-700 tabular-nums"
                  >
                    {index + 1}
                  </span>
                  <span className="min-w-0 flex-1 text-sm text-ink-800">{row.text}</span>
                  {locked ? null : (
                    <button
                      type="button"
                      onClick={() => removeItem(row.key)}
                      className="press shrink-0 rounded-md px-2 py-0.5 text-sm text-ink-400 transition-colors hover:bg-rose-50 hover:text-rose-600"
                      aria-label={`Xóa việc: ${row.text}`}
                    >
                      ✕
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}

          {locked ? null : (
            <div className="flex gap-2">
              <Input
                value={draft}
                maxLength={ACTION_ITEM_LENGTH}
                placeholder="Ví dụ: mỗi ngày làm 3 câu phân số, ghi lại bước bị vướng"
                onChange={(event) => setDraft(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    event.preventDefault();
                    addItem(draft);
                  }
                }}
                aria-label="Thêm một việc cần làm"
              />
              <Button type="button" variant="secondary" disabled={!canAddItem} onClick={() => addItem(draft)}>
                Thêm
              </Button>
            </div>
          )}
          {items.length >= ACTION_ITEM_MAX ? (
            <p className="mt-1.5 text-xs text-ink-500">Đã đủ {ACTION_ITEM_MAX} việc.</p>
          ) : null}
        </div>

        {/* --- Action gửi cho engine --- */}
        <div className="mb-5">
          <Label>Lộ trình 2 tuần tới sẽ đi theo hướng nào?</Label>
          <div className="grid gap-2 sm:grid-cols-2">
            {ACTION_ORDER.map((code) => (
              <ChoiceCard
                key={code}
                selected={actionCode === code}
                disabled={locked}
                onClick={() => setActionCode(code)}
                title={TEACHER_ACTION_LABEL[code]}
                description={ACTION_EFFECT[code]}
              />
            ))}
          </div>

          <Collapse open={needsSkills}>
            <div className="mt-3 rounded-xl bg-brand-50/50 p-3 ring-1 ring-brand-100">
              <p className="mb-2 text-sm font-medium text-ink-700">
                Chọn kỹ năng cần ưu tiên
                <span className="ml-1 font-normal text-ink-500">
                  (đang chọn {focusSkillIds.length}/{FOCUS_SKILL_MAX})
                </span>
              </p>

              {skills.length === 0 ? (
                <p className="text-sm text-ink-500">
                  Chưa có dữ liệu kỹ năng cho học sinh này. Thầy cô chọn hướng khác giúp nhé.
                </p>
              ) : (
                <ul className="scroll-x max-h-64 space-y-1.5 overflow-y-auto pr-1">
                  {skills.map((skill) => {
                    const picked = focusSkillIds.includes(skill.id);
                    return (
                      <li key={skill.id}>
                        <button
                          type="button"
                          disabled={locked}
                          onClick={() => toggleSkill(skill.id)}
                          aria-pressed={picked}
                          className={cx(
                            'press flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left transition-colors',
                            picked ? 'bg-white ring-1 ring-brand-300' : 'hover:bg-white/70',
                          )}
                        >
                          <span
                            aria-hidden
                            className={cx(
                              'flex h-4 w-4 shrink-0 items-center justify-center rounded border-2 text-[10px] font-bold text-white',
                              picked ? 'border-brand-600 bg-brand-600' : 'border-ink-300 bg-white',
                            )}
                          >
                            {picked ? '✓' : ''}
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-sm text-ink-800">{skill.name}</span>
                            <span className="block truncate text-xs text-ink-500">
                              {skill.chapterName}
                            </span>
                          </span>
                          <span className="shrink-0 text-xs text-ink-600 tabular-nums">
                            {Math.round(skill.masteryScore)}
                          </span>
                          <Badge tone="neutral">{skill.tierLabel}</Badge>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </Collapse>
        </div>

        {/* --- Mức theo dõi --- */}
        <div className="mb-5">
          <Label>Mức cần theo dõi</Label>
          <div className="grid gap-2 sm:grid-cols-3">
            {FOLLOW_UP_LEVELS.map((level) => (
              <ChoiceCard
                key={level}
                selected={followUpLevel === level}
                disabled={locked}
                onClick={() => setFollowUpLevel(level)}
                title={FOLLOW_UP_LEVEL_LABEL[level]}
                description={FOLLOW_UP_HINT[level]}
              />
            ))}
          </div>
        </div>

        {error ? (
          <Alert tone="danger" className="mb-4" title="Chưa lưu được">
            {error}
          </Alert>
        ) : null}

        {savedAction ? (
          <Alert tone="success" className="mb-4" title="Đã đóng vòng lặp cho học sinh này">
            <p>
              Ghi chú đã lưu. Quyết định <strong>{TEACHER_ACTION_LABEL[savedAction]}</strong> đã được
              gửi sang bộ máy gợi ý: {ACTION_EFFECT[savedAction]}
            </p>
            <p className="mt-1">
              {studentName} sẽ thấy lộ trình mới cùng {items.length > 0 ? `${items.length} việc cần làm` : 'ghi chú'}{' '}
              của thầy cô ở màn hình học tập.
            </p>
          </Alert>
        ) : null}

        {locked ? null : (
          <div className="flex flex-wrap items-center gap-3">
            <Button onClick={save} loading={saving} size="lg">
              Lưu và cập nhật lộ trình
            </Button>
            <p className="text-sm text-ink-500">
              Lưu xong, chu kỳ này mới được tính là đã rà soát xong.
            </p>
          </div>
        )}
      </Card>

      <Toast message={toast.message} tone={toast.tone} onClose={hide} />
    </div>
  );
}

/** Danh sách gạch đầu dòng của brief — mỗi khối một tông màu để mắt bắt nhanh. */
function BriefList({
  title,
  items,
  tone,
}: {
  title: string;
  items: string[];
  tone: 'warn' | 'brand' | 'info';
}) {
  if (items.length === 0) return null;

  const dot =
    tone === 'warn' ? 'bg-amber-500' : tone === 'brand' ? 'bg-brand-500' : 'bg-sky-500';

  return (
    <div>
      <p className="mb-1.5 text-xs font-semibold tracking-wide text-ink-500 uppercase">{title}</p>
      <ul className="stagger space-y-1.5">
        {items.map((entry) => (
          <li key={entry} className="flex gap-2.5 text-sm leading-relaxed text-ink-700">
            <span aria-hidden className={cx('mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full', dot)} />
            <span className="min-w-0">{entry}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
