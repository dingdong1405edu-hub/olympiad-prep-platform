'use client';

/**
 * Bảng học sinh được phân công (specs §9.3).
 *
 * Lọc và sắp xếp chạy ngay trên máy: một giáo viên phụ trách tối đa vài chục
 * học sinh mỗi chu kỳ (TeacherProfile.capacityPerCycle), nên tải hết một lần
 * rồi lọc tại chỗ cho phản hồi tức thì, không phải chờ tải lại trang.
 *
 * Thứ tự mặc định theo đúng đặc tả: MỨC CẦN CHÚ Ý trước, rồi tới buổi tư vấn
 * gần nhất — giáo viên mở màn hình là thấy ngay ai cần mình trước.
 */
import { useMemo, useState } from 'react';
import Link from 'next/link';
import { routes } from '@/lib/routes';
import {
  Badge,
  EmptyState,
  FilterBar,
  Input,
  Label,
  ProgressBar,
  Select,
  Table,
  Td,
  Tr,
  cx,
} from '@/components/ui';

export type AttentionLevel = 'HIGH' | 'MEDIUM' | 'NONE';

export const ATTENTION_LABEL: Record<AttentionLevel, string> = {
  HIGH: 'Cần xử lý',
  MEDIUM: 'Cần để ý',
  NONE: 'Đang ổn',
};

const ATTENTION_TONE: Record<AttentionLevel, 'danger' | 'warn' | 'success'> = {
  HIGH: 'danger',
  MEDIUM: 'warn',
  NONE: 'success',
};

const ATTENTION_ORDER: Record<AttentionLevel, number> = { HIGH: 0, MEDIUM: 1, NONE: 2 };

export interface StudentRow {
  enrollmentId: string;
  studentName: string;
  gradeLabel: string;
  programName: string;
  programCode: string;
  subjectLabel: string;
  levelLabel: string;
  targetLevelLabel: string | null;
  /** 0–100 */
  completionRate: number;
  /** 0–100 */
  masteryAverage: number;
  masteryDelta: number | null;
  inactiveDays: number | null;
  lastActiveLabel: string;
  attention: AttentionLevel;
  alertLabels: string[];
  nextSessionAtMs: number | null;
  nextSessionLabel: string | null;
  cycleNo: number;
}

type SortKey = 'ATTENTION' | 'SESSION' | 'COMPLETION' | 'MASTERY' | 'NAME';

const SORT_LABEL: Record<SortKey, string> = {
  ATTENTION: 'Cần chú ý trước',
  SESSION: 'Buổi tư vấn gần nhất',
  COMPLETION: 'Hoàn thành thấp nhất',
  MASTERY: 'Mastery thấp nhất',
  NAME: 'Tên học sinh (A→Z)',
};

/** Bỏ dấu để tìm kiếm gõ không dấu vẫn ra kết quả. */
function normalize(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toLowerCase()
    .trim();
}

/** Buổi chưa đặt lịch xếp cuối, không xếp đầu như giá trị 0. */
const NO_SESSION = Number.MAX_SAFE_INTEGER;

export function StudentsTable({ rows }: { rows: StudentRow[] }) {
  const [search, setSearch] = useState('');
  const [program, setProgram] = useState('');
  const [subject, setSubject] = useState('');
  const [level, setLevel] = useState('');
  const [onlyAttention, setOnlyAttention] = useState(false);
  const [sort, setSort] = useState<SortKey>('ATTENTION');

  const programs = useMemo(
    () => [...new Set(rows.map((row) => row.programName))].sort(),
    [rows],
  );
  const subjects = useMemo(
    () => [...new Set(rows.map((row) => row.subjectLabel))].sort(),
    [rows],
  );
  const levels = useMemo(() => [...new Set(rows.map((row) => row.levelLabel))], [rows]);

  const visible = useMemo(() => {
    const needle = normalize(search);

    const filtered = rows.filter((row) => {
      if (program && row.programName !== program) return false;
      if (subject && row.subjectLabel !== subject) return false;
      if (level && row.levelLabel !== level) return false;
      if (onlyAttention && row.attention === 'NONE') return false;
      if (needle && !normalize(`${row.studentName} ${row.programName} ${row.subjectLabel}`).includes(needle)) {
        return false;
      }
      return true;
    });

    return [...filtered].sort((a, b) => {
      switch (sort) {
        case 'SESSION':
          return (a.nextSessionAtMs ?? NO_SESSION) - (b.nextSessionAtMs ?? NO_SESSION);
        case 'COMPLETION':
          return a.completionRate - b.completionRate;
        case 'MASTERY':
          return a.masteryAverage - b.masteryAverage;
        case 'NAME':
          return a.studentName.localeCompare(b.studentName, 'vi');
        default: {
          const byAttention = ATTENTION_ORDER[a.attention] - ATTENTION_ORDER[b.attention];
          if (byAttention !== 0) return byAttention;
          return (a.nextSessionAtMs ?? NO_SESSION) - (b.nextSessionAtMs ?? NO_SESSION);
        }
      }
    });
  }, [rows, search, program, subject, level, onlyAttention, sort]);

  const filtering = Boolean(search || program || subject || level || onlyAttention);

  function clearFilters() {
    setSearch('');
    setProgram('');
    setSubject('');
    setLevel('');
    setOnlyAttention(false);
  }

  return (
    <div>
      <FilterBar>
        <div className="min-w-52 flex-1">
          <Label htmlFor="student-search">Tìm học sinh</Label>
          <Input
            id="student-search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Gõ tên học sinh"
          />
        </div>

        {programs.length > 1 ? (
          <div className="min-w-40">
            <Label htmlFor="student-program">Kỳ thi</Label>
            <Select
              id="student-program"
              value={program}
              onChange={(event) => setProgram(event.target.value)}
            >
              <option value="">Tất cả</option>
              {programs.map((value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
            </Select>
          </div>
        ) : null}

        {subjects.length > 1 ? (
          <div className="min-w-36">
            <Label htmlFor="student-subject">Môn</Label>
            <Select
              id="student-subject"
              value={subject}
              onChange={(event) => setSubject(event.target.value)}
            >
              <option value="">Tất cả</option>
              {subjects.map((value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
            </Select>
          </div>
        ) : null}

        {levels.length > 1 ? (
          <div className="min-w-36">
            <Label htmlFor="student-level">Mức hiện tại</Label>
            <Select
              id="student-level"
              value={level}
              onChange={(event) => setLevel(event.target.value)}
            >
              <option value="">Tất cả</option>
              {levels.map((value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
            </Select>
          </div>
        ) : null}

        <div className="min-w-44">
          <Label htmlFor="student-sort">Sắp xếp</Label>
          <Select
            id="student-sort"
            value={sort}
            onChange={(event) => setSort(event.target.value as SortKey)}
          >
            {(Object.keys(SORT_LABEL) as SortKey[]).map((key) => (
              <option key={key} value={key}>
                {SORT_LABEL[key]}
              </option>
            ))}
          </Select>
        </div>

        <label className="flex items-center gap-2 py-2.5 text-sm text-ink-700">
          <input
            type="checkbox"
            checked={onlyAttention}
            onChange={(event) => setOnlyAttention(event.target.checked)}
            className="h-4 w-4 rounded border-ink-300"
          />
          Chỉ học sinh cần chú ý
        </label>

        {filtering ? (
          <button
            type="button"
            onClick={clearFilters}
            className="press rounded-lg px-3 py-2.5 text-sm font-medium text-ink-600 transition-colors hover:bg-ink-100"
          >
            Xóa bộ lọc
          </button>
        ) : null}
      </FilterBar>

      <p className="mb-3 text-sm text-ink-600">
        Đang hiện <strong className="tabular-nums">{visible.length}</strong>/{rows.length} học sinh
      </p>

      {visible.length === 0 ? (
        <EmptyState
          icon="🔍"
          title="Không có học sinh nào khớp bộ lọc"
          description="Thầy cô thử bỏ bớt điều kiện lọc, hoặc xóa ô tìm kiếm để xem lại toàn bộ danh sách."
        />
      ) : (
        <Table
          head={[
            'Học sinh',
            'Kỳ thi / Môn',
            'Mức hiện tại',
            'Hoàn thành lộ trình',
            'Mastery',
            'Hoạt động gần nhất',
            'Cần chú ý',
            'Buổi tư vấn',
          ]}
        >
          {visible.map((row) => (
            <Tr key={row.enrollmentId}>
              <Td>
                <Link
                  href={routes.teacherStudent(row.enrollmentId)}
                  className="font-medium text-brand-700 hover:underline"
                >
                  {row.studentName}
                </Link>
                <p className="text-xs text-ink-500">{row.gradeLabel}</p>
              </Td>

              <Td>
                <span className="block text-ink-700">{row.programName}</span>
                <span className="block text-xs text-ink-500">
                  {row.subjectLabel} · chu kỳ {row.cycleNo}
                </span>
              </Td>

              <Td>
                <span className="block text-ink-700">{row.levelLabel}</span>
                {row.targetLevelLabel ? (
                  <span className="block text-xs text-ink-500">
                    Mục tiêu: {row.targetLevelLabel}
                  </span>
                ) : (
                  <span className="block text-xs text-ink-400">Chưa đặt mục tiêu</span>
                )}
              </Td>

              <Td className="min-w-36">
                <span className="mb-1 block text-sm text-ink-700 tabular-nums">
                  {Math.round(row.completionRate)}%
                </span>
                <ProgressBar
                  value={row.completionRate}
                  color={
                    row.completionRate >= 70
                      ? 'bg-accent-600'
                      : row.completionRate >= 40
                        ? 'bg-amber-500'
                        : 'bg-rose-500'
                  }
                />
              </Td>

              <Td className="tabular-nums">
                <span className="text-ink-800">{Math.round(row.masteryAverage)}</span>
                {row.masteryDelta !== null && Math.round(row.masteryDelta) !== 0 ? (
                  <span
                    className={cx(
                      'ml-2 text-xs font-semibold',
                      row.masteryDelta > 0 ? 'text-accent-700' : 'text-rose-600',
                    )}
                  >
                    {row.masteryDelta > 0 ? '↑' : '↓'} {Math.abs(Math.round(row.masteryDelta))}
                  </span>
                ) : (
                  <span className="ml-2 text-xs text-ink-400">—</span>
                )}
              </Td>

              <Td>
                <span className="text-ink-700">{row.lastActiveLabel}</span>
              </Td>

              <Td>
                <Badge tone={ATTENTION_TONE[row.attention]} dot>
                  {ATTENTION_LABEL[row.attention]}
                </Badge>
                {row.alertLabels.length > 0 ? (
                  <p className="mt-1 max-w-56 text-xs text-ink-500">
                    {row.alertLabels.slice(0, 2).join(' · ')}
                    {row.alertLabels.length > 2 ? ` · +${row.alertLabels.length - 2}` : ''}
                  </p>
                ) : null}
              </Td>

              <Td>
                {row.nextSessionLabel ? (
                  <span className="text-ink-700">{row.nextSessionLabel}</span>
                ) : (
                  <span className="text-ink-400">Chưa đặt lịch</span>
                )}
              </Td>
            </Tr>
          ))}
        </Table>
      )}
    </div>
  );
}
