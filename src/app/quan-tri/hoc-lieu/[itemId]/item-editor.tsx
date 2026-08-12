'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { Difficulty, GradeBand, ItemStatus, QuestionType, Subject } from '@prisma/client';
import type { ItemDetail } from '@/server/content/service';
import {
  autoOptionKey,
  checkAnswerConsistency,
  type ItemOption,
} from '@/server/content/schemas';
import { apiPatch, apiPost } from '@/lib/client';
import { API, routes } from '@/lib/routes';
import {
  DIFFICULTIES,
  DIFFICULTY_LABEL,
  GRADE_BAND_GRADES,
  GRADE_BAND_LABEL,
  ITEM_STATUS_LABEL,
  QUESTION_TYPE_LABEL,
  SUBJECT_LABEL,
} from '@/lib/domain';
import {
  Alert,
  Badge,
  Button,
  Card,
  CardHeader,
  Input,
  Label,
  Select,
  Textarea,
} from '@/components/ui';

// ---------------------------------------------------------------------------
// Kiểu dữ liệu truyền từ Server Component
// ---------------------------------------------------------------------------

export interface EditorSkillOption {
  id: string;
  code: string;
  name: string;
  chapterCode: string;
  chapterName: string;
  subject: Subject;
  gradeBand: GradeBand;
}

export interface EditorProgramOption {
  code: string;
  name: string;
}

const QUESTION_TYPES: QuestionType[] = [
  'SINGLE_CHOICE',
  'MULTIPLE_CHOICE',
  'NUMERIC',
  'SHORT_ANSWER',
];

const STATUS_TONE: Record<ItemStatus, 'neutral' | 'info' | 'success' | 'warn' | 'danger'> = {
  DRAFT: 'neutral',
  REVIEWED: 'info',
  PUBLISHED: 'success',
  FLAGGED: 'danger',
  RETIRED: 'warn',
};

/** Vì sao mỗi bước trạng thái tồn tại — nói bằng tiếng Việt cho người vận hành. */
const STATUS_HINT: Record<ItemStatus, string> = {
  DRAFT: 'Trả về bản nháp để biên soạn lại.',
  REVIEWED: 'Đã thẩm định chuyên môn, chờ người có quyền xuất bản.',
  PUBLISHED: 'Cho phép engine và AI dùng câu này để giao bài.',
  FLAGGED: 'Đánh dấu câu đang có nghi vấn, tạm dừng đưa vào bài mới.',
  RETIRED: 'Ngừng sử dụng vĩnh viễn, không xuất hiện trong bài nào nữa.',
};

const EMPTY_OPTIONS: ItemOption[] = [
  { key: 'A', text: '' },
  { key: 'B', text: '' },
  { key: 'C', text: '' },
  { key: 'D', text: '' },
];

function toStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.map((entry) => String(entry)) : [];
}

export function ItemEditor({
  item,
  skills,
  programs,
  defaultEstimatedTime,
  canPublish,
}: {
  /** Bỏ trống = màn hình tạo mới. */
  item?: ItemDetail;
  skills: EditorSkillOption[];
  programs: EditorProgramOption[];
  /** Suy từ cấu hình engine (phút/ngày ÷ số câu/ngày) — không hard-code. */
  defaultEstimatedTime: number;
  canPublish: boolean;
}) {
  const router = useRouter();
  const isEdit = Boolean(item);

  const [itemCode, setItemCode] = useState(item?.itemCode ?? '');
  const [skillId, setSkillId] = useState(item?.skill.id ?? skills[0]?.id ?? '');
  const [programScope, setProgramScope] = useState<string[]>(item?.programScope ?? []);
  const [gradeScope, setGradeScope] = useState<number[]>(item?.actualGradeScope ?? []);
  const [difficulty, setDifficulty] = useState<Difficulty>(item?.difficulty ?? 'AVERAGE');
  const [difficultyNumeric, setDifficultyNumeric] = useState(
    item ? String(item.difficultyNumeric) : '',
  );
  const [questionType, setQuestionType] = useState<QuestionType>(
    (item?.questionType as QuestionType | undefined) ?? 'SINGLE_CHOICE',
  );
  const [stem, setStem] = useState(item?.stem ?? '');
  const [stemImageUrl, setStemImageUrl] = useState(item?.stemImageUrl ?? '');
  const [options, setOptions] = useState<ItemOption[]>(
    item && item.options.length > 0 ? item.options : EMPTY_OPTIONS,
  );
  const [singleAnswer, setSingleAnswer] = useState(
    typeof item?.correctAnswer === 'string' ? item.correctAnswer : '',
  );
  const [multiAnswer, setMultiAnswer] = useState<string[]>(toStringArray(item?.correctAnswer));
  const [numericAnswer, setNumericAnswer] = useState(
    typeof item?.correctAnswer === 'number' ? String(item.correctAnswer) : '',
  );
  const [answerTolerance, setAnswerTolerance] = useState(
    item?.answerTolerance === null || item?.answerTolerance === undefined
      ? ''
      : String(item.answerTolerance),
  );
  const [solution, setSolution] = useState(item?.solution ?? '');
  const [stepsText, setStepsText] = useState(toStringArray(item?.solutionSteps).join('\n'));
  const [hint, setHint] = useState(item?.hint ?? '');
  const [estimatedTime, setEstimatedTime] = useState(
    String(item?.estimatedTime ?? defaultEstimatedTime),
  );
  const [tagsText, setTagsText] = useState((item?.tags ?? []).join(', '));
  const [sourceNote, setSourceNote] = useState(item?.sourceNote ?? '');
  const [reason, setReason] = useState('');

  const [saving, setSaving] = useState(false);
  const [changingStatus, setChangingStatus] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [showPreview, setShowPreview] = useState(false);

  const selectedSkill = skills.find((skill) => skill.id === skillId);
  const isChoice = questionType === 'SINGLE_CHOICE' || questionType === 'MULTIPLE_CHOICE';
  const gradeChoices = selectedSkill ? GRADE_BAND_GRADES[selectedSkill.gradeBand] : [];

  /** Phương án rỗng chỉ là dòng người dùng chưa điền — không gửi lên máy chủ. */
  const cleanOptions = useMemo(
    () =>
      isChoice
        ? options
            .map((option) => ({ key: option.key.trim().toUpperCase(), text: option.text.trim() }))
            .filter((option) => option.key.length > 0 && option.text.length > 0)
        : [],
    [isChoice, options],
  );

  function buildCorrectAnswer(): string | string[] | number | null {
    if (questionType === 'SINGLE_CHOICE') return singleAnswer.trim().toUpperCase() || null;
    if (questionType === 'MULTIPLE_CHOICE') {
      const answers = multiAnswer.map((key) => key.trim().toUpperCase()).filter(Boolean);
      return answers.length > 0 ? answers : null;
    }
    if (questionType === 'NUMERIC') {
      const value = Number(numericAnswer.trim());
      return numericAnswer.trim() === '' || !Number.isFinite(value) ? null : value;
    }
    // SHORT_ANSWER dùng chung ô nhập với SINGLE_CHOICE (cả hai đều là một chuỗi).
    return singleAnswer.trim() || null;
  }

  const tags = useMemo(
    () =>
      Array.from(
        new Set(
          tagsText
            .split(',')
            .map((tag) => tag.trim())
            .filter((tag) => tag.length > 0),
        ),
      ),
    [tagsText],
  );

  const solutionSteps = useMemo(
    () =>
      stepsText
        .split('\n')
        .map((step) => step.trim())
        .filter((step) => step.length > 0),
    [stepsText],
  );

  /** Kiểm tra tại chỗ bằng ĐÚNG luật của máy chủ (checkAnswerConsistency). */
  function validate(): string | null {
    if (!isEdit && itemCode.trim().length < 2) return 'Hãy đặt mã câu hỏi (ít nhất 2 ký tự).';
    if (!skillId) return 'Hãy chọn kỹ năng cho câu hỏi.';
    if (stem.trim().length < 5) return 'Nội dung đề bài quá ngắn.';
    if (solution.trim().length < 5) {
      return 'Lời giải chuẩn là bắt buộc — đây là nguồn duy nhất để AI giải thích cho học sinh.';
    }
    const correctAnswer = buildCorrectAnswer();
    if (correctAnswer === null) return 'Hãy nhập đáp án đúng cho câu hỏi.';
    return checkAnswerConsistency({ questionType, options: cleanOptions, correctAnswer });
  }

  function basePayload(): Record<string, unknown> {
    const numeric = Number(difficultyNumeric.trim());
    const time = Number(estimatedTime.trim());
    const tolerance = Number(answerTolerance.trim());

    return {
      skillId,
      programScope,
      actualGradeScope: gradeScope,
      difficulty,
      ...(difficultyNumeric.trim() && Number.isFinite(numeric)
        ? { difficultyNumeric: Math.round(numeric) }
        : {}),
      questionType,
      stem: stem.trim(),
      stemImageUrl: stemImageUrl.trim() || null,
      options: cleanOptions,
      correctAnswer: buildCorrectAnswer(),
      answerTolerance:
        questionType === 'NUMERIC' && answerTolerance.trim() && Number.isFinite(tolerance)
          ? tolerance
          : null,
      solution: solution.trim(),
      solutionSteps,
      hint: hint.trim() || null,
      ...(estimatedTime.trim() && Number.isFinite(time) && time > 0
        ? { estimatedTime: Math.round(time) }
        : {}),
      tags,
      sourceNote: sourceNote.trim() || null,
    };
  }

  /** Chỉ gửi trường đã đổi: mỗi lần lưu đều tăng số phiên bản nên tránh sửa rỗng. */
  function changedPayload(current: ItemDetail): Record<string, unknown> | null {
    const next = basePayload();
    const before: Record<string, unknown> = {
      skillId: current.skill.id,
      programScope: current.programScope,
      actualGradeScope: current.actualGradeScope,
      difficulty: current.difficulty,
      difficultyNumeric: current.difficultyNumeric,
      questionType: current.questionType,
      stem: current.stem,
      stemImageUrl: current.stemImageUrl,
      options: current.options,
      correctAnswer: current.correctAnswer,
      answerTolerance: current.answerTolerance,
      solution: current.solution,
      solutionSteps: toStringArray(current.solutionSteps),
      hint: current.hint,
      estimatedTime: current.estimatedTime,
      tags: current.tags,
      sourceNote: current.sourceNote,
    };

    const patch: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(next)) {
      if (JSON.stringify(value) !== JSON.stringify(before[key] ?? null)) patch[key] = value;
    }
    return Object.keys(patch).length === 0 ? null : patch;
  }

  async function save() {
    const problem = validate();
    if (problem) {
      setError(problem);
      setMessage(null);
      return;
    }

    setSaving(true);
    setError(null);
    setMessage(null);

    try {
      if (item) {
        const patch = changedPayload(item);
        if (!patch) {
          setMessage('Chưa có thay đổi nào để lưu.');
          setSaving(false);
          return;
        }
        await apiPatch(API.adminItem(item.id), {
          ...patch,
          reason: reason.trim() || 'Cập nhật nội dung câu hỏi',
        });
        setReason('');
        setMessage('Đã lưu. Hệ thống đã tạo bản ghi phiên bản mới để truy vết thay đổi.');
        router.refresh();
      } else {
        const created = await apiPost<{ id: string; itemCode: string; status: ItemStatus }>(
          API.adminItems,
          { ...basePayload(), itemCode: itemCode.trim() },
        );
        router.push(routes.adminContentItem(created.id));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Không lưu được câu hỏi.');
    } finally {
      setSaving(false);
    }
  }

  async function changeStatus(next: ItemStatus) {
    if (!item) return;
    if (
      (next === 'RETIRED' || next === 'PUBLISHED') &&
      !window.confirm(
        next === 'PUBLISHED'
          ? 'Xuất bản câu này? Sau khi xuất bản, engine sẽ dùng câu để giao bài cho học sinh.'
          : 'Ngừng sử dụng câu này? Câu sẽ không xuất hiện trong bài học mới nữa.',
      )
    ) {
      return;
    }

    setChangingStatus(true);
    setError(null);
    setMessage(null);
    try {
      await apiPost(API.adminItemStatus(item.id), { status: next });
      setMessage(`Đã chuyển trạng thái sang “${ITEM_STATUS_LABEL[next]}”.`);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Không đổi được trạng thái.');
    } finally {
      setChangingStatus(false);
    }
  }

  async function resolveFlag(flagId: string, resolution: 'RESOLVED' | 'REJECTED') {
    setError(null);
    try {
      await apiPatch(API.adminFlags, { flagId, resolution });
      setMessage(
        resolution === 'RESOLVED'
          ? 'Đã đánh dấu phiếu báo lỗi là đã xử lý.'
          : 'Đã bác bỏ phiếu báo lỗi này.',
      );
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Không xử lý được phiếu báo lỗi.');
    }
  }

  // --- Biên tập phương án ---------------------------------------------------

  function updateOption(index: number, patch: Partial<ItemOption>) {
    setOptions((current) =>
      current.map((option, i) => (i === index ? { ...option, ...patch } : option)),
    );
  }

  function addOption() {
    setOptions((current) =>
      current.length >= 12 ? current : [...current, { key: autoOptionKey(current.length), text: '' }],
    );
  }

  function removeOption(index: number) {
    setOptions((current) => {
      const removed = current[index];
      if (removed) {
        const key = removed.key.trim().toUpperCase();
        setSingleAnswer((answer) => (answer.trim().toUpperCase() === key ? '' : answer));
        setMultiAnswer((answers) => answers.filter((entry) => entry.toUpperCase() !== key));
      }
      return current.filter((_, i) => i !== index);
    });
  }

  function toggleMultiAnswer(key: string) {
    const upper = key.trim().toUpperCase();
    setMultiAnswer((current) =>
      current.includes(upper) ? current.filter((entry) => entry !== upper) : [...current, upper],
    );
  }

  const validationProblem = validate();

  return (
    <div className="grid gap-5 lg:grid-cols-3">
      <div className="space-y-5 lg:col-span-2">
        {error ? (
          <Alert tone="danger" title="Chưa lưu được">
            {error}
          </Alert>
        ) : null}
        {message ? <Alert tone="success">{message}</Alert> : null}

        {/* --- Phân loại --- */}
        <Card>
          <CardHeader
            title="Phân loại câu hỏi"
            subtitle="Metadata quyết định engine giao câu cho ai — sai chỗ này là sai toàn bộ cá nhân hóa."
          />

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <Label htmlFor="itemCode" hint="chữ, số và . _ -">
                Mã câu hỏi
              </Label>
              <Input
                id="itemCode"
                value={itemCode}
                disabled={isEdit}
                onChange={(event) => setItemCode(event.target.value.toUpperCase())}
                placeholder="M67-PS-00001"
              />
              {isEdit ? (
                <p className="mt-1.5 text-xs text-ink-500">Mã câu không đổi sau khi tạo.</p>
              ) : null}
            </div>

            <div>
              <Label htmlFor="skillId" hint="quyết định môn, khối và chương">
                Kỹ năng
              </Label>
              <Select
                id="skillId"
                value={skillId}
                onChange={(event) => setSkillId(event.target.value)}
              >
                {skills.length === 0 ? <option value="">Chưa có kỹ năng nào</option> : null}
                {skills.map((skill) => (
                  <option key={skill.id} value={skill.id}>
                    {skill.chapterCode} · {skill.code} — {skill.name}
                  </option>
                ))}
              </Select>
              {selectedSkill ? (
                <p className="mt-1.5 text-xs text-ink-500">
                  {SUBJECT_LABEL[selectedSkill.subject]} · {GRADE_BAND_LABEL[selectedSkill.gradeBand]}{' '}
                  · Chương {selectedSkill.chapterName}
                </p>
              ) : (
                <p className="mt-1.5 text-xs text-rose-600">
                  Chưa khai báo kỹ năng nào — hãy dựng cây kiến thức trước khi thêm câu hỏi.
                </p>
              )}
            </div>

            <div>
              <Label htmlFor="difficulty">Độ khó</Label>
              <Select
                id="difficulty"
                value={difficulty}
                onChange={(event) => setDifficulty(event.target.value as Difficulty)}
              >
                {DIFFICULTIES.map((value) => (
                  <option key={value} value={value}>
                    {DIFFICULTY_LABEL[value]}
                  </option>
                ))}
              </Select>
            </div>

            <div>
              <Label htmlFor="difficultyNumeric" hint="1–10, để trống thì hệ thống tự tính">
                Độ khó chi tiết
              </Label>
              <Input
                id="difficultyNumeric"
                type="number"
                min={1}
                max={10}
                value={difficultyNumeric}
                onChange={(event) => setDifficultyNumeric(event.target.value)}
              />
            </div>

            <div>
              <Label htmlFor="questionType">Loại câu</Label>
              <Select
                id="questionType"
                value={questionType}
                onChange={(event) => setQuestionType(event.target.value as QuestionType)}
              >
                {QUESTION_TYPES.map((type) => (
                  <option key={type} value={type}>
                    {QUESTION_TYPE_LABEL[type]}
                  </option>
                ))}
              </Select>
            </div>

            <div>
              <Label htmlFor="estimatedTime" hint="giây">
                Thời gian chuẩn
              </Label>
              <Input
                id="estimatedTime"
                type="number"
                min={1}
                value={estimatedTime}
                onChange={(event) => setEstimatedTime(event.target.value)}
              />
            </div>

            <div className="sm:col-span-2">
              <Label hint="để trống = dùng cho mọi kỳ thi">Phạm vi kỳ thi</Label>
              <div className="flex flex-wrap gap-3">
                {programs.length === 0 ? (
                  <p className="text-sm text-ink-500">Chưa có kỳ thi nào được khai báo.</p>
                ) : null}
                {programs.map((program) => (
                  <label key={program.code} className="flex items-center gap-2 text-sm text-ink-700">
                    <input
                      type="checkbox"
                      className="h-4 w-4 rounded border-ink-300"
                      checked={programScope.includes(program.code)}
                      onChange={() =>
                        setProgramScope((current) =>
                          current.includes(program.code)
                            ? current.filter((code) => code !== program.code)
                            : [...current, program.code],
                        )
                      }
                    />
                    {program.code}
                  </label>
                ))}
              </div>
            </div>

            <div className="sm:col-span-2">
              <Label hint="để trống = dùng cho cả khối">Lớp áp dụng</Label>
              <div className="flex flex-wrap gap-3">
                {gradeChoices.length === 0 ? (
                  <p className="text-sm text-ink-500">Hãy chọn kỹ năng để biết khối lớp.</p>
                ) : null}
                {gradeChoices.map((grade) => (
                  <label key={grade} className="flex items-center gap-2 text-sm text-ink-700">
                    <input
                      type="checkbox"
                      className="h-4 w-4 rounded border-ink-300"
                      checked={gradeScope.includes(grade)}
                      onChange={() =>
                        setGradeScope((current) =>
                          current.includes(grade)
                            ? current.filter((value) => value !== grade)
                            : [...current, grade].sort((a, b) => a - b),
                        )
                      }
                    />
                    Lớp {grade}
                  </label>
                ))}
              </div>
            </div>
          </div>
        </Card>

        {/* --- Đề bài & phương án --- */}
        <Card>
          <CardHeader title="Đề bài và đáp án" />

          <div className="mb-4">
            <Label htmlFor="stem" hint="giữ nguyên xuống dòng; công thức viết bằng LaTeX">
              Nội dung đề bài
            </Label>
            <Textarea
              id="stem"
              className="min-h-32"
              value={stem}
              onChange={(event) => setStem(event.target.value)}
              placeholder="So sánh hai phân số $\frac{3}{4}$ và $\frac{5}{8}$…"
            />
          </div>

          <div className="mb-4">
            <Label htmlFor="stemImageUrl" hint="không bắt buộc">
              Ảnh minh họa cho đề (URL)
            </Label>
            <Input
              id="stemImageUrl"
              value={stemImageUrl}
              onChange={(event) => setStemImageUrl(event.target.value)}
              placeholder="https://…"
            />
          </div>

          {isChoice ? (
            <div className="mb-4">
              <Label hint={questionType === 'MULTIPLE_CHOICE' ? 'chọn tất cả đáp án đúng' : 'chọn một đáp án đúng'}>
                Phương án trả lời
              </Label>

              <div className="space-y-2">
                {options.map((option, index) => {
                  const key = option.key.trim().toUpperCase();
                  const checked =
                    questionType === 'SINGLE_CHOICE'
                      ? singleAnswer.trim().toUpperCase() === key && key !== ''
                      : multiAnswer.includes(key);
                  return (
                    <div key={index} className="flex items-start gap-2">
                      <input
                        type={questionType === 'SINGLE_CHOICE' ? 'radio' : 'checkbox'}
                        name="correct-option"
                        className="mt-3 h-4 w-4 shrink-0 border-ink-300"
                        checked={checked}
                        onChange={() =>
                          questionType === 'SINGLE_CHOICE'
                            ? setSingleAnswer(key)
                            : toggleMultiAnswer(key)
                        }
                        aria-label={`Đánh dấu phương án ${option.key} là đáp án đúng`}
                      />
                      <Input
                        className="w-16 shrink-0 text-center"
                        value={option.key}
                        onChange={(event) =>
                          updateOption(index, { key: event.target.value.toUpperCase() })
                        }
                        aria-label={`Ký hiệu phương án ${index + 1}`}
                      />
                      <Input
                        value={option.text}
                        onChange={(event) => updateOption(index, { text: event.target.value })}
                        placeholder={`Nội dung phương án ${option.key || index + 1}`}
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="mt-0.5 shrink-0"
                        onClick={() => removeOption(index)}
                        aria-label={`Xóa phương án ${option.key}`}
                      >
                        Xóa
                      </Button>
                    </div>
                  );
                })}
              </div>

              <Button
                type="button"
                variant="secondary"
                size="sm"
                className="mt-3"
                onClick={addOption}
                disabled={options.length >= 12}
              >
                Thêm phương án
              </Button>
            </div>
          ) : null}

          {questionType === 'NUMERIC' ? (
            <div className="mb-4 grid gap-4 sm:grid-cols-2">
              <div>
                <Label htmlFor="numericAnswer">Đáp án (số)</Label>
                <Input
                  id="numericAnswer"
                  type="number"
                  step="any"
                  value={numericAnswer}
                  onChange={(event) => setNumericAnswer(event.target.value)}
                />
              </div>
              <div>
                <Label htmlFor="answerTolerance" hint="0 = phải đúng tuyệt đối">
                  Sai số cho phép
                </Label>
                <Input
                  id="answerTolerance"
                  type="number"
                  step="any"
                  min={0}
                  value={answerTolerance}
                  onChange={(event) => setAnswerTolerance(event.target.value)}
                />
              </div>
            </div>
          ) : null}

          {questionType === 'SHORT_ANSWER' ? (
            <div className="mb-4">
              <Label htmlFor="shortAnswer">Đáp án chuẩn</Label>
              <Input
                id="shortAnswer"
                value={singleAnswer}
                onChange={(event) => setSingleAnswer(event.target.value)}
                placeholder="Đáp án đúng dạng chữ"
              />
            </div>
          ) : null}

          <div className="mb-4">
            <Label htmlFor="solution" hint="bắt buộc — AI chỉ được giải thích dựa trên lời giải này">
              Lời giải chuẩn
            </Label>
            <Textarea
              id="solution"
              className="min-h-32"
              value={solution}
              onChange={(event) => setSolution(event.target.value)}
            />
          </div>

          <div className="mb-4">
            <Label htmlFor="steps" hint="mỗi dòng là một bước">
              Các bước giải
            </Label>
            <Textarea
              id="steps"
              value={stepsText}
              onChange={(event) => setStepsText(event.target.value)}
              placeholder={'Quy đồng mẫu số\nSo sánh hai tử số\nKết luận'}
            />
          </div>

          <div className="mb-4">
            <Label htmlFor="hint" hint="hiện trước khi học sinh xem lời giải">
              Gợi ý
            </Label>
            <Textarea id="hint" value={hint} onChange={(event) => setHint(event.target.value)} />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <Label htmlFor="tags" hint="cách nhau bằng dấu phẩy">
                Tag
              </Label>
              <Input
                id="tags"
                value={tagsText}
                onChange={(event) => setTagsText(event.target.value)}
                placeholder="phân số, so sánh"
              />
            </div>
            <div>
              <Label htmlFor="sourceNote">Nguồn câu hỏi</Label>
              <Input
                id="sourceNote"
                value={sourceNote}
                onChange={(event) => setSourceNote(event.target.value)}
                placeholder="Biên soạn nội bộ 2026"
              />
            </div>
          </div>
        </Card>

        {/* --- Xem trước --- */}
        <Card>
          <CardHeader
            title="Xem trước như học sinh nhìn thấy"
            action={
              <Button variant="secondary" size="sm" onClick={() => setShowPreview((v) => !v)}>
                {showPreview ? 'Ẩn xem trước' : 'Hiện xem trước'}
              </Button>
            }
          />
          {showPreview ? (
            <div className="rounded-xl bg-canvas p-4">
              <p className="mb-2 text-xs text-ink-500">
                {DIFFICULTY_LABEL[difficulty]} · {QUESTION_TYPE_LABEL[questionType]}
              </p>
              <p className="stem-content text-ink-900">{stem || 'Chưa nhập đề bài.'}</p>
              {stemImageUrl.trim() ? (
                <p className="mt-2 text-xs text-ink-500">[Ảnh minh họa: {stemImageUrl}]</p>
              ) : null}

              {isChoice ? (
                <ul className="mt-4 space-y-2">
                  {cleanOptions.map((option) => (
                    <li
                      key={option.key}
                      className="rounded-lg bg-white px-3 py-2 text-sm text-ink-800 ring-1 ring-ink-100"
                    >
                      <strong className="mr-2">{option.key}.</strong>
                      {option.text}
                    </li>
                  ))}
                  {cleanOptions.length === 0 ? (
                    <li className="text-sm text-ink-500">Chưa có phương án nào.</li>
                  ) : null}
                </ul>
              ) : (
                <p className="mt-4 text-sm text-ink-500">
                  Học sinh sẽ tự nhập câu trả lời vào ô trống.
                </p>
              )}

              <p className="mt-4 text-xs text-ink-500">
                Học sinh chỉ thấy phần trên. Đáp án, gợi ý và lời giải chỉ hiện sau khi nộp bài.
              </p>
            </div>
          ) : (
            <p className="text-sm text-ink-500">
              Bật xem trước để kiểm tra câu hỏi hiển thị đúng như học sinh sẽ thấy.
            </p>
          )}
        </Card>
      </div>

      {/* --- Cột hành động --- */}
      <div className="space-y-5">
        <Card>
          <CardHeader title={isEdit ? 'Lưu thay đổi' : 'Tạo câu hỏi'} />

          {validationProblem ? (
            <Alert tone="warn" className="mb-3">
              {validationProblem}
            </Alert>
          ) : (
            <Alert tone="success" className="mb-3">
              Câu hỏi đã đủ điều kiện lưu.
            </Alert>
          )}

          {isEdit ? (
            <div className="mb-3">
              <Label htmlFor="reason" hint="lưu vào lịch sử phiên bản">
                Lý do sửa
              </Label>
              <Input
                id="reason"
                value={reason}
                onChange={(event) => setReason(event.target.value)}
                placeholder="Ví dụ: sửa lỗi chính tả ở phương án B"
              />
            </div>
          ) : (
            <p className="mb-3 text-sm text-ink-600">
              Câu mới luôn được lưu ở trạng thái <strong>Bản nháp</strong>. Phải qua thẩm định và xuất
              bản thì engine mới dùng để giao bài.
            </p>
          )}

          <Button className="w-full" onClick={save} disabled={saving}>
            {saving ? 'Đang lưu…' : isEdit ? 'Lưu thay đổi' : 'Tạo câu hỏi'}
          </Button>
        </Card>

        {item ? (
          <Card>
            <CardHeader
              title="Trạng thái"
              subtitle="Luồng: Bản nháp → Đã thẩm định → Đã xuất bản → Bị báo lỗi / Ngừng sử dụng."
              action={<Badge tone={STATUS_TONE[item.status]}>{item.statusLabel}</Badge>}
            />

            <div className="space-y-2">
              {item.allowedTransitions.map((next) => {
                if (next === 'PUBLISHED' && !canPublish) return null;
                return (
                  <div key={next}>
                    <Button
                      variant={next === 'PUBLISHED' ? 'success' : 'secondary'}
                      className="w-full"
                      onClick={() => changeStatus(next)}
                      disabled={changingStatus}
                    >
                      Chuyển sang “{ITEM_STATUS_LABEL[next]}”
                    </Button>
                    <p className="mt-1 text-xs text-ink-500">{STATUS_HINT[next]}</p>
                  </div>
                );
              })}
            </div>

            {item.allowedTransitions.includes('PUBLISHED') && !canPublish ? (
              <Alert tone="info" className="mt-3" title="Bạn chưa có quyền xuất bản">
                Chỉ Reviewer chuyên môn, Quản lý chương trình hoặc Super Admin mới được đưa câu vào
                kho xuất bản. Câu đã ở trạng thái “Đã thẩm định” — hãy báo người duyệt kiểm tra.
              </Alert>
            ) : null}

            {item.status === 'PUBLISHED' ? (
              <Alert tone="warn" className="mt-3">
                Sửa đề bài, phương án, đáp án, lời giải, loại câu, độ khó hoặc kỹ năng của câu đang
                xuất bản sẽ tự đưa câu về <strong>Đã thẩm định</strong> để duyệt lại.
              </Alert>
            ) : null}
          </Card>
        ) : null}

        {item && item.flags.length > 0 ? (
          <Card>
            <CardHeader title="Phiếu báo lỗi" subtitle={`${item.stats.reportCount} lượt báo lỗi`} />
            <ul className="space-y-3">
              {item.flags.map((flag) => (
                <li key={flag.id} className="rounded-lg bg-canvas p-3">
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-sm font-medium text-ink-800">{flag.reason}</p>
                    <Badge tone={flag.status === 'OPEN' ? 'danger' : 'neutral'}>
                      {flag.status === 'OPEN'
                        ? 'Chưa xử lý'
                        : flag.status === 'RESOLVED'
                          ? 'Đã xử lý'
                          : 'Đã bác bỏ'}
                    </Badge>
                  </div>
                  {flag.detail ? <p className="mt-1 text-sm text-ink-600">{flag.detail}</p> : null}
                  {flag.status === 'OPEN' ? (
                    <div className="mt-2 flex gap-2">
                      <Button size="sm" variant="secondary" onClick={() => resolveFlag(flag.id, 'RESOLVED')}>
                        Đã xử lý
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => resolveFlag(flag.id, 'REJECTED')}>
                        Bác bỏ
                      </Button>
                    </div>
                  ) : null}
                </li>
              ))}
            </ul>
          </Card>
        ) : null}
      </div>
    </div>
  );
}
