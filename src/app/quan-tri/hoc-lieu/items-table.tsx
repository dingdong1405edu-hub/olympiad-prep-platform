'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { Difficulty, ItemStatus, QuestionType } from '@prisma/client';
import type { ItemListRow } from '@/server/content/service';
import { apiPatch, apiPost } from '@/lib/client';
import { API, routes } from '@/lib/routes';
import {
  DIFFICULTIES,
  DIFFICULTY_LABEL,
  ITEM_STATUS_LABEL,
  ITEM_STATUS_TRANSITIONS,
  QUESTION_TYPE_LABEL,
} from '@/lib/domain';
import { Alert, Badge, Button, Card, Input, Label, Select, Table, Td } from '@/components/ui';

/** Trạng thái luôn hiển thị kèm CHỮ; màu chỉ để nhìn nhanh, không mang thông tin riêng. */
const STATUS_TONE: Record<ItemStatus, 'neutral' | 'info' | 'success' | 'warn' | 'danger'> = {
  DRAFT: 'neutral',
  REVIEWED: 'info',
  PUBLISHED: 'success',
  FLAGGED: 'danger',
  RETIRED: 'warn',
};

const BULK_STATUSES: ItemStatus[] = ['REVIEWED', 'PUBLISHED', 'DRAFT', 'RETIRED', 'FLAGGED'];

type BulkMode = 'STATUS' | 'DIFFICULTY' | 'TAGS';

interface BulkFailure {
  itemCode: string;
  message: string;
}

export function ItemsTable({ rows, canPublish }: { rows: ItemListRow[]; canPublish: boolean }) {
  const router = useRouter();

  const [selected, setSelected] = useState<string[]>([]);
  const [mode, setMode] = useState<BulkMode>('STATUS');
  const [nextStatus, setNextStatus] = useState<ItemStatus>('REVIEWED');
  const [nextDifficulty, setNextDifficulty] = useState<Difficulty>('AVERAGE');
  const [tagsText, setTagsText] = useState('');
  const [reason, setReason] = useState('');

  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [failures, setFailures] = useState<BulkFailure[]>([]);
  const [message, setMessage] = useState<string | null>(null);

  const selectedRows = rows.filter((row) => selected.includes(row.id));
  const allSelected = rows.length > 0 && selected.length === rows.length;

  /**
   * Câu nào thực sự đổi được trạng thái — luật chuyển trạng thái lấy từ
   * ITEM_STATUS_TRANSITIONS (specs §5.3); máy chủ vẫn kiểm tra lại lần cuối.
   */
  const statusTargets = selectedRows.filter(
    (row) => row.status !== nextStatus && ITEM_STATUS_TRANSITIONS[row.status].includes(nextStatus),
  );
  const publishBlocked = mode === 'STATUS' && nextStatus === 'PUBLISHED' && !canPublish;

  function toggle(id: string) {
    setSelected((current) =>
      current.includes(id) ? current.filter((value) => value !== id) : [...current, id],
    );
  }

  function toggleAll() {
    setSelected(allSelected ? [] : rows.map((row) => row.id));
  }

  function parsedTags(): string[] {
    return Array.from(
      new Set(
        tagsText
          .split(',')
          .map((tag) => tag.trim())
          .filter((tag) => tag.length > 0),
      ),
    );
  }

  async function applyBulk() {
    const targets = mode === 'STATUS' ? statusTargets : selectedRows;
    if (targets.length === 0) return;

    setRunning(true);
    setMessage(null);
    setFailures([]);
    setProgress({ done: 0, total: targets.length });

    const collected: BulkFailure[] = [];
    let succeeded = 0;

    for (const row of targets) {
      try {
        if (mode === 'STATUS') {
          await apiPost(API.adminItemStatus(row.id), { status: nextStatus });
        } else if (mode === 'DIFFICULTY') {
          await apiPatch(API.adminItem(row.id), {
            difficulty: nextDifficulty,
            reason: reason.trim() || 'Sửa hàng loạt: đổi độ khó',
          });
        } else {
          await apiPatch(API.adminItem(row.id), {
            tags: parsedTags(),
            reason: reason.trim() || 'Sửa hàng loạt: đặt lại tag',
          });
        }
        succeeded += 1;
      } catch (err) {
        collected.push({
          itemCode: row.itemCode,
          message: err instanceof Error ? err.message : 'Lỗi không xác định.',
        });
      }
      setProgress((current) => ({ ...current, done: current.done + 1 }));
    }

    setFailures(collected);
    const skipped = selectedRows.length - targets.length;
    setMessage(
      `Đã cập nhật ${succeeded}/${targets.length} câu.` +
        (skipped > 0 ? ` Bỏ qua ${skipped} câu không chuyển được trạng thái này.` : '') +
        (collected.length > 0 ? ` ${collected.length} câu gặp lỗi (xem bên dưới).` : ''),
    );
    setRunning(false);
    setSelected([]);
    router.refresh();
  }

  return (
    <div>
      {selected.length > 0 ? (
        <Card className="mb-4 ring-brand-200">
          <p className="mb-3 text-sm font-semibold text-ink-800">
            Đang chọn {selected.length} câu ở trang này
          </p>

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div>
              <Label htmlFor="bulk-mode">Thao tác</Label>
              <Select
                id="bulk-mode"
                value={mode}
                onChange={(event) => setMode(event.target.value as BulkMode)}
              >
                <option value="STATUS">Đổi trạng thái</option>
                <option value="DIFFICULTY">Đổi độ khó</option>
                <option value="TAGS">Đặt lại tag</option>
              </Select>
            </div>

            {mode === 'STATUS' ? (
              <div>
                <Label htmlFor="bulk-status">Chuyển sang</Label>
                <Select
                  id="bulk-status"
                  value={nextStatus}
                  onChange={(event) => setNextStatus(event.target.value as ItemStatus)}
                >
                  {BULK_STATUSES.map((status) => (
                    <option key={status} value={status}>
                      {ITEM_STATUS_LABEL[status]}
                    </option>
                  ))}
                </Select>
              </div>
            ) : null}

            {mode === 'DIFFICULTY' ? (
              <div>
                <Label htmlFor="bulk-difficulty">Độ khó mới</Label>
                <Select
                  id="bulk-difficulty"
                  value={nextDifficulty}
                  onChange={(event) => setNextDifficulty(event.target.value as Difficulty)}
                >
                  {DIFFICULTIES.map((difficulty) => (
                    <option key={difficulty} value={difficulty}>
                      {DIFFICULTY_LABEL[difficulty]}
                    </option>
                  ))}
                </Select>
              </div>
            ) : null}

            {mode === 'TAGS' ? (
              <div className="sm:col-span-2">
                <Label htmlFor="bulk-tags" hint="cách nhau bằng dấu phẩy">
                  Danh sách tag mới
                </Label>
                <Input
                  id="bulk-tags"
                  value={tagsText}
                  onChange={(event) => setTagsText(event.target.value)}
                  placeholder="phân số, so sánh"
                />
              </div>
            ) : null}

            {mode !== 'STATUS' ? (
              <div>
                <Label htmlFor="bulk-reason" hint="lưu vào lịch sử phiên bản">
                  Lý do sửa
                </Label>
                <Input
                  id="bulk-reason"
                  value={reason}
                  onChange={(event) => setReason(event.target.value)}
                  placeholder="Ví dụ: chuẩn hóa tag theo chương"
                />
              </div>
            ) : null}
          </div>

          {mode === 'STATUS' ? (
            <p className="mt-3 text-sm text-ink-600">
              {statusTargets.length}/{selected.length} câu chuyển được sang “
              {ITEM_STATUS_LABEL[nextStatus]}”. Câu không hợp luồng trạng thái sẽ được bỏ qua.
            </p>
          ) : null}

          {mode === 'DIFFICULTY' ? (
            <Alert tone="warn" className="mt-3">
              Đổi độ khó là thay đổi ảnh hưởng tới cách engine chọn bài. Câu đang{' '}
              <strong>Đã xuất bản</strong> sẽ tự quay về <strong>Đã thẩm định</strong> để được duyệt
              lại trước khi dùng tiếp.
            </Alert>
          ) : null}

          {mode === 'TAGS' ? (
            <Alert tone="warn" className="mt-3">
              Danh sách tag mới sẽ <strong>thay thế toàn bộ</strong> tag hiện có của các câu đã chọn,
              không cộng dồn. Để trống nghĩa là xóa hết tag.
            </Alert>
          ) : null}

          {publishBlocked ? (
            <Alert tone="danger" className="mt-3" title="Bạn không có quyền xuất bản">
              Chỉ Reviewer chuyên môn, Quản lý chương trình hoặc Super Admin mới được đưa câu lên
              trạng thái “Đã xuất bản”. Hãy chuyển các câu này sang “Đã thẩm định” rồi báo người
              duyệt.
            </Alert>
          ) : null}

          <div className="mt-4 flex flex-wrap items-center gap-3">
            <Button
              onClick={applyBulk}
              disabled={
                running ||
                publishBlocked ||
                (mode === 'STATUS' ? statusTargets.length === 0 : selectedRows.length === 0)
              }
            >
              {running
                ? `Đang xử lý ${progress.done}/${progress.total}…`
                : `Áp dụng cho ${mode === 'STATUS' ? statusTargets.length : selected.length} câu`}
            </Button>
            <Button variant="ghost" onClick={() => setSelected([])} disabled={running}>
              Bỏ chọn tất cả
            </Button>
          </div>
        </Card>
      ) : null}

      {message ? (
        <Alert tone={failures.length > 0 ? 'warn' : 'success'} className="mb-4">
          {message}
        </Alert>
      ) : null}

      {failures.length > 0 ? (
        <Alert tone="danger" className="mb-4" title="Các câu chưa cập nhật được">
          <ul className="mt-1 list-disc space-y-1 pl-5">
            {failures.map((failure) => (
              <li key={failure.itemCode}>
                <strong>{failure.itemCode}</strong>: {failure.message}
              </li>
            ))}
          </ul>
        </Alert>
      ) : null}

      <Table
        head={[
          <label key="all" className="flex items-center gap-2 font-normal">
            <input
              type="checkbox"
              checked={allSelected}
              onChange={toggleAll}
              className="h-4 w-4 rounded border-ink-300"
              aria-label="Chọn tất cả câu ở trang này"
            />
            <span className="sr-only">Chọn</span>
          </label>,
          'Mã câu',
          'Trích đề',
          'Chương / Kỹ năng',
          'Độ khó',
          'Loại câu',
          'Trạng thái',
          'Tỷ lệ đúng',
          'Lượt làm',
          'Báo lỗi',
        ]}
      >
        {rows.map((row) => (
          <tr key={row.id} className={selected.includes(row.id) ? 'bg-brand-50/60' : undefined}>
            <Td>
              <input
                type="checkbox"
                checked={selected.includes(row.id)}
                onChange={() => toggle(row.id)}
                className="h-4 w-4 rounded border-ink-300"
                aria-label={`Chọn câu ${row.itemCode}`}
              />
            </Td>
            <Td>
              <Link
                href={routes.adminContentItem(row.id)}
                className="font-medium text-brand-700 hover:underline"
              >
                {row.itemCode}
              </Link>
              <p className="text-xs text-ink-400">Bản {row.version}</p>
            </Td>
            <Td className="max-w-md">
              <span className="line-clamp-2 block text-ink-700">{row.stemPreview}</span>
              {row.tags.length > 0 ? (
                <span className="mt-1 block text-xs text-ink-400">{row.tags.join(' · ')}</span>
              ) : null}
            </Td>
            <Td>
              <span className="block text-ink-700">{row.chapter.name}</span>
              <span className="block text-xs text-ink-500">
                {row.skill.code} — {row.skill.name}
              </span>
            </Td>
            <Td>{DIFFICULTY_LABEL[row.difficulty]}</Td>
            <Td className="text-ink-600">
              {QUESTION_TYPE_LABEL[row.questionType as QuestionType] ?? row.questionType}
            </Td>
            <Td>
              <Badge tone={STATUS_TONE[row.status]}>{row.statusLabel}</Badge>
            </Td>
            <Td className="tabular-nums">
              {row.correctRate === null ? (
                <span className="text-ink-400">Chưa có</span>
              ) : (
                `${Math.round(row.correctRate * 100)}%`
              )}
            </Td>
            <Td className="tabular-nums">{row.timesServed}</Td>
            <Td className="tabular-nums">
              {row.reportCount}
              {row.openFlagCount > 0 ? (
                <Badge tone="danger" className="ml-2">
                  {row.openFlagCount} chưa xử lý
                </Badge>
              ) : null}
            </Td>
          </tr>
        ))}
      </Table>

      <p className="mt-3 text-xs text-ink-500">
        Thao tác hàng loạt chỉ áp dụng cho các câu đang hiển thị ở trang này.
      </p>
    </div>
  );
}
