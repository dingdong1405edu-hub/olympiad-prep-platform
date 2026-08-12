'use client';

/**
 * Trình sửa cấu hình.
 *
 * Mỗi tham số hiển thị kèm GIÁ TRỊ MẶC ĐỊNH để người vận hành luôn biết mình đã
 * đổi những gì so với xuất xưởng — thiếu điều này thì sau vài tháng không ai còn
 * nhớ vì sao hệ thống đang chạy với con số đó.
 *
 * Cấu hình lồng nhau (ví dụ trọng số engine) được chỉnh trực tiếp bằng JSON, vì
 * dựng form động cho mọi hình dạng sẽ phức tạp hơn giá trị nó mang lại; ô nhập
 * có kiểm tra cú pháp trước khi cho lưu.
 */
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { apiPatch } from '@/lib/client';
import { API } from '@/lib/routes';
import { Alert, Badge, Button, Card, CardHeader, Input, Select, cx } from '@/components/ui';
import { Toast, useToast } from '@/components/motion';

export interface ConfigGroupView {
  key: string;
  label: string;
  description: string;
  value: Record<string, unknown>;
  defaults: Record<string, unknown>;
}

/** Nhãn tiếng Việt cho những tham số hay được chỉnh nhất. */
const FIELD_LABEL: Record<string, string> = {
  diagnosticItemCount: 'Số câu bài kiểm tra đầu vào',
  cycleDays: 'Chu kỳ đánh giá (ngày)',
  gracePeriodDays: 'Ân hạn khi quá hạn (ngày)',
  progressItemCount: 'Số câu bài kiểm tra tiến bộ',
  recentExclusionDays: 'Loại câu đã gặp trong (ngày)',
  minMinutesPerDay: 'Tối thiểu phút/ngày',
  maxMinutesPerDay: 'Tối đa phút/ngày',
  minItemsPerDay: 'Tối thiểu câu/ngày',
  maxItemsPerDay: 'Tối đa câu/ngày',
  itemCooldownDays: 'Không lặp lại câu trong (ngày)',
  masteredThreshold: 'Ngưỡng coi như đã vững',
  gapThreshold: 'Ngưỡng coi là hổng',
  spacedRepetitionDays: 'Ôn lại sau (ngày)',
  challengeUnlockMastery: 'Mastery mở khối thử thách',
  maxSkillsPerDay: 'Số kỹ năng tối đa mỗi ngày',
  minutesPerMasteryPoint: 'Phút cần cho 1 điểm mastery',
  feasibilitySafetyFactor: 'Hệ số an toàn khi tính khả thi',
  infeasibleRatio: 'Ngưỡng coi là không khả thi',
  sessionMinutes: 'Thời lượng buổi tư vấn (phút)',
  defaultCapacityPerCycle: 'Số học sinh tối đa mỗi giáo viên',
  defaultPrice: 'Giá mặc định (đồng)',
  accessDurationDays: 'Thời hạn truy cập (ngày)',
  currency: 'Đơn vị tiền tệ',
  gateway: 'Cổng thanh toán',
  maxPerDay: 'Số thông báo tối đa mỗi ngày',
  model: 'Model AI',
  cheapModel: 'Model AI cho tác vụ nhẹ',
  promptVersion: 'Phiên bản prompt',
  maxOutputTokens: 'Giới hạn token đầu ra',
  timeoutMs: 'Thời gian chờ AI (ms)',
  anonymizeStudent: 'Ẩn danh học sinh trong prompt',
  enabled: 'Bật',
  minConfidenceForLevelChange: 'Độ tin cậy tối thiểu để đổi mức',
  minAttemptsForLevelChange: 'Số câu tối thiểu để đổi mức',
  autoCreateSessionAfterAssessment: 'Tự tạo buổi tư vấn sau đánh giá',
  allowManualActivation: 'Cho phép kích hoạt thủ công',
};

/** Tham số ảnh hưởng trực tiếp tới học sinh đang học — cần cảnh báo rõ. */
const SENSITIVE = new Set([
  'cycleDays',
  'maxMinutesPerDay',
  'maxItemsPerDay',
  'diagnosticItemCount',
  'weights',
  'blockRatio',
]);

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function sameValue(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

export function ConfigEditor({ groups }: { groups: ConfigGroupView[] }) {
  return (
    <div className="space-y-5">
      {groups.map((group) => (
        <ConfigGroupCard key={group.key} group={group} />
      ))}
    </div>
  );
}

function ConfigGroupCard({ group }: { group: ConfigGroupView }) {
  const router = useRouter();
  const { toast, show, hide } = useToast();

  const [draft, setDraft] = useState<Record<string, unknown>>(group.value);
  const [jsonErrors, setJsonErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const changedKeys = Object.keys(group.defaults).filter(
    (key) => !sameValue(draft[key], group.defaults[key]),
  );

  function update(key: string, value: unknown) {
    setDraft((prev) => ({ ...prev, [key]: value }));
  }

  async function save() {
    if (Object.keys(jsonErrors).length > 0) {
      setError('Còn ô JSON chưa hợp lệ, hãy sửa trước khi lưu.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await apiPatch(API.adminConfig, { group: group.key, value: draft });
      show(`Đã lưu nhóm "${group.label}".`, 'success');
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Không lưu được cấu hình.');
    } finally {
      setSaving(false);
    }
  }

  function resetToDefaults() {
    setDraft({ ...group.defaults });
    setJsonErrors({});
  }

  return (
    <Card>
      <CardHeader
        title={
          <span className="flex items-center gap-2">
            {group.label}
            {changedKeys.length > 0 ? (
              <Badge tone="warn">{changedKeys.length} tham số đã đổi</Badge>
            ) : (
              <Badge tone="neutral">Đang dùng mặc định</Badge>
            )}
          </span>
        }
        subtitle={group.description}
      />

      {error ? (
        <Alert tone="danger" className="mb-4">
          {error}
        </Alert>
      ) : null}

      <div className="space-y-4">
        {Object.entries(group.defaults).map(([key, defaultValue]) => {
          const value = draft[key];
          const changed = !sameValue(value, defaultValue);
          const label = FIELD_LABEL[key] ?? key;

          return (
            <div key={key} className="border-b border-ink-100 pb-4 last:border-0 last:pb-0">
              <div className="mb-1.5 flex flex-wrap items-baseline justify-between gap-2">
                <label
                  htmlFor={`${group.key}-${key}`}
                  className="text-sm font-medium text-ink-700"
                >
                  {label}
                  {SENSITIVE.has(key) ? (
                    <span className="ml-2 text-xs font-normal text-amber-700">
                      ảnh hưởng học sinh đang học
                    </span>
                  ) : null}
                </label>
                <span
                  className={cx(
                    'text-xs tabular-nums',
                    changed ? 'font-medium text-amber-700' : 'text-ink-400',
                  )}
                >
                  mặc định:{' '}
                  {typeof defaultValue === 'object'
                    ? 'xem JSON'
                    : String(defaultValue)}
                </span>
              </div>

              {typeof defaultValue === 'boolean' ? (
                <Select
                  id={`${group.key}-${key}`}
                  value={String(value)}
                  onChange={(event) => update(key, event.target.value === 'true')}
                  className="max-w-xs"
                >
                  <option value="true">Bật</option>
                  <option value="false">Tắt</option>
                </Select>
              ) : typeof defaultValue === 'number' ? (
                <Input
                  id={`${group.key}-${key}`}
                  type="number"
                  step="any"
                  className="max-w-xs tabular-nums"
                  value={value === null || value === undefined ? '' : String(value)}
                  onChange={(event) => update(key, Number(event.target.value))}
                />
              ) : typeof defaultValue === 'string' ? (
                <Input
                  id={`${group.key}-${key}`}
                  className="max-w-md"
                  value={value === null || value === undefined ? '' : String(value)}
                  onChange={(event) => update(key, event.target.value)}
                />
              ) : isPlainObject(defaultValue) || Array.isArray(defaultValue) ? (
                <>
                  <textarea
                    id={`${group.key}-${key}`}
                    rows={Math.min(10, JSON.stringify(value, null, 2).split('\n').length)}
                    defaultValue={JSON.stringify(value, null, 2)}
                    onChange={(event) => {
                      try {
                        const parsed: unknown = JSON.parse(event.target.value);
                        update(key, parsed);
                        setJsonErrors((prev) => {
                          const next = { ...prev };
                          delete next[key];
                          return next;
                        });
                      } catch {
                        setJsonErrors((prev) => ({ ...prev, [key]: 'JSON chưa hợp lệ' }));
                      }
                    }}
                    className="w-full rounded-lg border border-ink-200 bg-white px-3 py-2.5 font-mono text-xs text-ink-800 focus:border-brand-500 focus:ring-4 focus:ring-brand-100 focus:outline-none"
                  />
                  {jsonErrors[key] ? (
                    <p className="mt-1 text-sm text-rose-600">{jsonErrors[key]}</p>
                  ) : null}
                  <details className="mt-1.5">
                    <summary className="cursor-pointer text-xs text-ink-400">
                      Xem giá trị mặc định
                    </summary>
                    <pre className="mt-1 overflow-x-auto rounded bg-ink-50 p-2 font-mono text-xs text-ink-600">
                      {JSON.stringify(defaultValue, null, 2)}
                    </pre>
                  </details>
                </>
              ) : null}
            </div>
          );
        })}
      </div>

      <div className="mt-5 flex flex-wrap gap-3">
        <Button onClick={save} loading={saving}>
          Lưu nhóm này
        </Button>
        <Button variant="secondary" onClick={resetToDefaults} disabled={changedKeys.length === 0}>
          Khôi phục mặc định
        </Button>
      </div>

      <Toast message={toast.message} tone={toast.tone} onClose={hide} />
    </Card>
  );
}
