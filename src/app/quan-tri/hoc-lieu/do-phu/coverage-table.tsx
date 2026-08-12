'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import type { CoverageSkillRow, CoverageStatus } from '@/server/content/service';
import { routes } from '@/lib/routes';
import { DIFFICULTIES, DIFFICULTY_LABEL } from '@/lib/domain';
import {
  Alert,
  Badge,
  Button,
  Card,
  Input,
  Label,
  ProgressBar,
  Table,
  Td,
  cx,
} from '@/components/ui';

type StatusFilter = CoverageStatus | 'ALL';

const STATUS_TONE: Record<CoverageStatus, 'danger' | 'warn' | 'success'> = {
  EMPTY: 'danger',
  THIN: 'warn',
  OK: 'success',
};

/**
 * Hệ quả nghiệp vụ của từng mức phủ (specs §18).
 * Người vận hành cần biết "thiếu câu thì hỏng cái gì", không chỉ thấy con số.
 */
const STATUS_CONSEQUENCE: Record<CoverageStatus, string> = {
  EMPTY:
    'Engine không có câu nào để giao: học sinh hổng kỹ năng này sẽ không có đường học, phải mượn tạm kỹ năng lân cận.',
  THIN:
    'Kho quá mỏng nên engine buộc phải lặp lại câu cũ trong chu kỳ hai tuần — điểm tăng giả do học sinh nhớ đáp án.',
  OK: 'Đủ câu ở mọi bậc độ khó để engine xoay vòng mà không lặp bài.',
};

const FILTERS: { value: StatusFilter; label: string }[] = [
  { value: 'ALL', label: 'Tất cả kỹ năng' },
  { value: 'EMPTY', label: 'Chưa có câu nào' },
  { value: 'THIN', label: 'Thiếu câu' },
  { value: 'OK', label: 'Đủ câu' },
];

export function CoverageTable({
  rows,
  minPerDifficulty,
  minTotal,
}: {
  rows: CoverageSkillRow[];
  minPerDifficulty: number;
  minTotal: number;
}) {
  const [status, setStatus] = useState<StatusFilter>('ALL');
  const [search, setSearch] = useState('');

  const counts = useMemo(
    () => ({
      ALL: rows.length,
      EMPTY: rows.filter((row) => row.status === 'EMPTY').length,
      THIN: rows.filter((row) => row.status === 'THIN').length,
      OK: rows.filter((row) => row.status === 'OK').length,
    }),
    [rows],
  );

  const visible = useMemo(() => {
    const keyword = search.trim().toLowerCase();
    return rows.filter((row) => {
      if (status !== 'ALL' && row.status !== status) return false;
      if (!keyword) return true;
      return (
        row.skillCode.toLowerCase().includes(keyword) ||
        row.skillName.toLowerCase().includes(keyword) ||
        row.chapterCode.toLowerCase().includes(keyword) ||
        row.chapterName.toLowerCase().includes(keyword)
      );
    });
  }, [rows, status, search]);

  return (
    <div>
      <Card className="mb-4">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <Label>Lọc theo mức phủ</Label>
            <div className="flex flex-wrap gap-2">
              {FILTERS.map((option) => (
                <Button
                  key={option.value}
                  type="button"
                  size="sm"
                  variant={status === option.value ? 'primary' : 'secondary'}
                  onClick={() => setStatus(option.value)}
                  aria-pressed={status === option.value}
                >
                  {option.label}
                  <span className="tabular-nums opacity-80">({counts[option.value]})</span>
                </Button>
              ))}
            </div>
          </div>

          <div className="w-full sm:w-64">
            <Label htmlFor="coverage-search">Tìm kỹ năng</Label>
            <Input
              id="coverage-search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Mã hoặc tên kỹ năng, tên chương"
            />
          </div>
        </div>
      </Card>

      {visible.length === 0 ? (
        <Alert tone="info" title="Không có kỹ năng nào khớp">
          Hãy đổi mức phủ đang lọc hoặc xóa từ khóa tìm kiếm để xem lại toàn bộ danh sách.
        </Alert>
      ) : (
        <div className="animate-fade-up">
          <Table
            head={[
              'Kỹ năng',
              'Chương',
              'Đã xuất bản',
              ...DIFFICULTIES.map((difficulty) => DIFFICULTY_LABEL[difficulty]),
              'Mức phủ và hệ quả',
              '',
            ]}
          >
            {visible.map((row) => {
              const missingTotal = DIFFICULTIES.reduce(
                (sum, difficulty) => sum + (row.missingByDifficulty[difficulty] ?? 0),
                0,
              );

              return (
                <tr
                  key={row.skillId}
                  className={cx(
                    'transition-colors',
                    row.status === 'EMPTY' && 'bg-rose-50/60',
                    row.status === 'THIN' && 'bg-amber-50/50',
                    row.status === 'OK' && 'hover:bg-brand-50/40',
                  )}
                >
                  <Td>
                    <span className="block font-medium text-ink-800">{row.skillName}</span>
                    <span className="block text-xs text-ink-500">{row.skillCode}</span>
                  </Td>
                  <Td className="text-ink-600">
                    <span className="block">{row.chapterName}</span>
                    <span className="block text-xs text-ink-400">{row.chapterCode}</span>
                  </Td>
                  <Td className="whitespace-nowrap">
                    <span className="text-base font-semibold text-ink-900 tabular-nums">
                      {row.published}
                    </span>
                    <span className="text-xs text-ink-500"> / {minTotal} câu</span>
                  </Td>

                  {DIFFICULTIES.map((difficulty) => {
                    const count = row.byDifficulty[difficulty] ?? 0;
                    const missing = row.missingByDifficulty[difficulty] ?? 0;
                    return (
                      <Td key={difficulty} className="min-w-28">
                        <div className="flex items-baseline justify-between gap-2">
                          <span className="text-sm font-medium text-ink-800 tabular-nums">
                            {count}
                          </span>
                          <span className="text-xs text-ink-400 tabular-nums">/{minPerDifficulty}</span>
                        </div>
                        <ProgressBar
                          className="mt-1 h-1.5"
                          value={Math.min(count, minPerDifficulty)}
                          max={minPerDifficulty}
                          color={
                            count === 0
                              ? 'bg-rose-500'
                              : missing > 0
                                ? 'bg-amber-500'
                                : 'bg-accent-600'
                          }
                        />
                        <span
                          className={cx(
                            'mt-1 block text-xs tabular-nums',
                            missing > 0 ? 'text-amber-700' : 'text-ink-400',
                          )}
                        >
                          {missing > 0 ? `thiếu ${missing}` : 'đủ'}
                        </span>
                      </Td>
                    );
                  })}

                  <Td className="max-w-sm">
                    <Badge tone={STATUS_TONE[row.status]} dot>
                      {row.statusLabel}
                    </Badge>
                    <p className="mt-1.5 text-xs text-ink-600">{STATUS_CONSEQUENCE[row.status]}</p>
                    {missingTotal > 0 ? (
                      <p className="mt-1 text-xs font-medium text-ink-700 tabular-nums">
                        Cần bổ sung thêm {missingTotal} câu để đạt ngưỡng.
                      </p>
                    ) : null}
                  </Td>

                  <Td className="whitespace-nowrap">
                    <Link
                      href={`${routes.adminContent()}?skillId=${row.skillId}`}
                      className="link-underline text-sm font-medium text-brand-700"
                    >
                      Xem câu của kỹ năng
                    </Link>
                    <Link
                      href={routes.adminContentNew()}
                      className="link-underline mt-1 block text-sm font-medium text-brand-700"
                    >
                      Thêm câu mới
                    </Link>
                  </Td>
                </tr>
              );
            })}
          </Table>

          <p className="mt-3 text-xs text-ink-500 tabular-nums">
            Đang hiển thị {visible.length} trên tổng số {rows.length} kỹ năng. Chỉ câu ở trạng thái
            “Đã xuất bản” được tính vào độ phủ — câu nháp hoặc chờ thẩm định không giúp engine giao
            bài.
          </p>
        </div>
      )}
    </div>
  );
}
