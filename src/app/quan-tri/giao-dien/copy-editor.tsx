'use client';

/**
 * TRÌNH SỬA CHỮ CỦA TRANG CÔNG KHAI.
 *
 * BA QUYẾT ĐỊNH VỀ GIAO DIỆN, đều xuất phát từ việc người dùng ở đây là người
 * làm nội dung chứ không phải lập trình viên:
 *
 * 1. Mỗi ô hiện nhãn mô tả VỊ TRÍ trên trang ("Tiêu đề — phần đầu") chứ không
 *    hiện khóa kỹ thuật. Khóa vẫn có nhưng nằm mờ bên dưới, để khi cần đối
 *    chiếu với lập trình viên thì vẫn tra được.
 *
 * 2. Ô nào đã đổi so với bản gốc thì đánh dấu rõ và cho khôi phục riêng từng ô.
 *    Không có dấu này thì sau vài tháng không ai biết trang đang chạy chữ gốc
 *    hay chữ ai đó sửa vội một hôm nào đó.
 *
 * 3. Chỉ gửi lên những ô THỰC SỰ ĐỔI trong lần sửa này. Gửi hết vài trăm ô mỗi
 *    lần lưu sẽ ghi đè cả những chỗ người khác vừa sửa ở tab bên cạnh.
 */
import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { apiDelete, apiPut } from '@/lib/client';
import { API } from '@/lib/routes';
import { Alert, Badge, Button, Card, Input, Textarea, cx } from '@/components/ui';
import { Toast, useToast } from '@/components/motion';

export interface CopyFieldView {
  key: string;
  label: string;
  hint?: string;
  multiline?: boolean;
  /** Nội dung đang hiển thị trên trang. */
  current: string;
  /** Nội dung gốc trong mã nguồn. */
  defaultValue: string;
}

export interface CopyGroupView {
  key: string;
  label: string;
  description: string;
  fields: CopyFieldView[];
}

const API_URL = API.adminSiteCopy;

export function CopyEditor({ groups }: { groups: CopyGroupView[] }) {
  const router = useRouter();
  const { toast, show, hide } = useToast();

  const initial = useMemo(() => {
    const map: Record<string, string> = {};
    for (const group of groups) for (const field of group.fields) map[field.key] = field.current;
    return map;
  }, [groups]);

  const [values, setValues] = useState<Record<string, string>>(initial);
  const [openGroup, setOpenGroup] = useState<string>(groups[0]?.key ?? '');
  const [saving, setSaving] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [search, setSearch] = useState('');

  const fieldByKey = useMemo(() => {
    const map: Record<string, CopyFieldView> = {};
    for (const group of groups) for (const field of group.fields) map[field.key] = field;
    return map;
  }, [groups]);

  /** Ô đã đổi so với lần tải trang — đây mới là thứ được gửi lên. */
  const dirtyKeys = useMemo(
    () => Object.keys(values).filter((key) => values[key] !== initial[key]),
    [values, initial],
  );

  /** Ô đang khác bản gốc — dùng để đánh dấu, không liên quan tới việc lưu. */
  function isCustom(key: string): boolean {
    return (values[key] ?? '').trim() !== (fieldByKey[key]?.defaultValue ?? '').trim();
  }

  const customCount = Object.keys(values).filter(isCustom).length;
  const term = search.trim().toLowerCase();

  const visibleGroups = useMemo(() => {
    if (term === '') return groups;
    return groups
      .map((group) => ({
        ...group,
        fields: group.fields.filter(
          (field) =>
            field.label.toLowerCase().includes(term) ||
            field.key.toLowerCase().includes(term) ||
            (values[field.key] ?? '').toLowerCase().includes(term),
        ),
      }))
      .filter((group) => group.fields.length > 0);
  }, [groups, term, values]);

  async function save() {
    if (dirtyKeys.length === 0) {
      show('Chưa có thay đổi nào để lưu.', 'info');
      return;
    }
    setSaving(true);
    try {
      const entries: Record<string, string> = {};
      for (const key of dirtyKeys) entries[key] = values[key];
      const result = await apiPut<{ updated: number; restored: number }>(API_URL, { entries });
      show(
        `Đã lưu. ${result.updated} ô dùng nội dung riêng, ${result.restored} ô quay về bản gốc.`,
        'success',
      );
      router.refresh();
    } catch (error) {
      show(error instanceof Error ? error.message : 'Chưa lưu được, thử lại giúp.', 'error');
    } finally {
      setSaving(false);
    }
  }

  async function resetAll() {
    if (!window.confirm('Khôi phục TOÀN BỘ chữ về bản gốc? Mọi nội dung đã sửa sẽ mất.')) return;
    setResetting(true);
    try {
      await apiDelete<{ removed: number }>(API_URL);
      const restored: Record<string, string> = {};
      for (const key of Object.keys(values)) restored[key] = fieldByKey[key].defaultValue;
      setValues(restored);
      show('Đã khôi phục toàn bộ chữ về bản gốc.', 'success');
      router.refresh();
    } catch (error) {
      show(error instanceof Error ? error.message : 'Chưa khôi phục được.', 'error');
    } finally {
      setResetting(false);
    }
  }

  return (
    <div className="space-y-5">
      <Toast message={toast.message} tone={toast.tone} onClose={hide} />

      {/* --- Thanh thao tác --- */}
      <div className="sticky top-16 z-20 flex flex-wrap items-center gap-3 rounded-xl border border-ink-100 bg-white/95 p-3 shadow-sm backdrop-blur">
        <div className="min-w-52 flex-1">
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Tìm theo nhãn hoặc nội dung…"
            aria-label="Tìm ô chữ"
          />
        </div>

        <span className="text-sm text-ink-500">
          {customCount > 0 ? (
            <>
              <strong className="font-semibold text-ink-800">{customCount}</strong> ô đang dùng nội
              dung riêng
            </>
          ) : (
            'Toàn bộ đang dùng bản gốc'
          )}
        </span>

        <div className="ml-auto flex items-center gap-2">
          <Button
            type="button"
            variant="ghost"
            onClick={resetAll}
            loading={resetting}
            disabled={customCount === 0}
          >
            Khôi phục tất cả
          </Button>
          <Button type="button" onClick={save} loading={saving} disabled={dirtyKeys.length === 0}>
            {dirtyKeys.length > 0 ? `Lưu ${dirtyKeys.length} thay đổi` : 'Lưu'}
          </Button>
        </div>
      </div>

      {visibleGroups.length === 0 ? (
        <Alert tone="info" title="Không tìm thấy ô nào khớp">
          Thử từ khóa khác, hoặc xóa ô tìm kiếm để xem lại toàn bộ.
        </Alert>
      ) : null}

      {/* --- Các nhóm --- */}
      {visibleGroups.map((group) => {
        const open = term !== '' || openGroup === group.key;
        const changed = group.fields.filter((field) => isCustom(field.key)).length;

        return (
          <Card key={group.key} className="overflow-hidden p-0">
            <button
              type="button"
              onClick={() => setOpenGroup(open && term === '' ? '' : group.key)}
              className="flex w-full items-start justify-between gap-4 px-5 py-4 text-left transition-colors hover:bg-ink-50/60"
              aria-expanded={open}
            >
              <span>
                <span className="flex items-center gap-2.5">
                  <span className="font-semibold text-ink-900">{group.label}</span>
                  {changed > 0 ? <Badge tone="brand">{changed} đã sửa</Badge> : null}
                </span>
                <span className="mt-1 block text-sm text-ink-500">{group.description}</span>
              </span>
              <span
                aria-hidden
                className={cx(
                  'mt-1 shrink-0 text-lg leading-none text-ink-400 transition-transform duration-200',
                  open && 'rotate-45',
                )}
              >
                +
              </span>
            </button>

            {open ? (
              <div className="space-y-4 border-t border-ink-100 px-5 py-5">
                {group.fields.map((field) => {
                  const custom = isCustom(field.key);
                  const dirty = values[field.key] !== initial[field.key];

                  return (
                    <div key={field.key}>
                      <div className="mb-1.5 flex flex-wrap items-center gap-2">
                        <label
                          htmlFor={`copy-${field.key}`}
                          className="text-sm font-medium text-ink-700"
                        >
                          {field.label}
                        </label>
                        {custom ? <Badge tone="brand">Đã sửa</Badge> : null}
                        {dirty ? <Badge tone="warn">Chưa lưu</Badge> : null}
                        {custom ? (
                          <button
                            type="button"
                            onClick={() =>
                              setValues((prev) => ({ ...prev, [field.key]: field.defaultValue }))
                            }
                            className="text-xs font-medium text-brand-700 underline underline-offset-2 hover:text-brand-800"
                          >
                            về bản gốc
                          </button>
                        ) : null}
                      </div>

                      {field.multiline ? (
                        <Textarea
                          id={`copy-${field.key}`}
                          rows={Math.min(8, Math.max(3, Math.ceil(values[field.key].length / 90)))}
                          value={values[field.key]}
                          onChange={(event) =>
                            setValues((prev) => ({ ...prev, [field.key]: event.target.value }))
                          }
                        />
                      ) : (
                        <Input
                          id={`copy-${field.key}`}
                          value={values[field.key]}
                          onChange={(event) =>
                            setValues((prev) => ({ ...prev, [field.key]: event.target.value }))
                          }
                        />
                      )}

                      <p className="mt-1 flex flex-wrap gap-x-3 text-xs text-ink-400">
                        <span className="font-mono">{field.key}</span>
                        {field.hint ? <span>{field.hint}</span> : null}
                      </p>

                      {custom ? (
                        <p className="mt-1 text-xs text-ink-400">
                          Bản gốc: <span className="text-ink-500">{field.defaultValue}</span>
                        </p>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            ) : null}
          </Card>
        );
      })}
    </div>
  );
}
