'use client';

import { useMemo, useState } from 'react';
import type { ImportReport, ImportRowResult } from '@/server/content/import';
import { apiPost } from '@/lib/client';
import { API, routes } from '@/lib/routes';
import {
  Alert,
  Badge,
  Button,
  Card,
  CardHeader,
  Input,
  Label,
  LinkButton,
  ProgressBar,
  StatTile,
  Table,
  Td,
  Textarea,
  Tr,
  cx,
} from '@/components/ui';
import { Spinner } from '@/components/motion';

// ---------------------------------------------------------------------------
// Kiểu dữ liệu báo cáo — máy chủ lược bỏ payload `data` trước khi trả về
// ---------------------------------------------------------------------------

type ReportRow = Omit<ImportRowResult, 'data'>;
type Report = Omit<ImportReport, 'rows'> & { rows: ReportRow[] };

const ACTION_LABEL: Record<ReportRow['action'], string> = {
  CREATE: 'Tạo mới',
  UPDATE: 'Cập nhật',
  SKIP: 'Bỏ qua',
  ERROR: 'Lỗi',
};

/** Trạng thái dòng luôn hiện bằng CHỮ; màu chỉ để quét mắt nhanh. */
const ACTION_TONE: Record<ReportRow['action'], 'success' | 'info' | 'neutral' | 'danger'> = {
  CREATE: 'success',
  UPDATE: 'info',
  SKIP: 'neutral',
  ERROR: 'danger',
};

const STEPS = [
  { title: 'Lấy dữ liệu vào', hint: 'Tải file mẫu, chọn file hoặc dán nội dung' },
  { title: 'Kiểm tra thử', hint: 'Xem báo cáo từng dòng trước khi ghi' },
  { title: 'Nhập thật', hint: 'Ghi vào kho ở trạng thái Bản nháp' },
] as const;

/** Báo cáo có thể tới 5000 dòng — chỉ dựng ngần này hàng để trình duyệt không nghẽn. */
const MAX_VISIBLE_ROWS = 200;

export function ImportWizard({
  templateHeaders,
  maxRows,
  chapterCount,
  skillCount,
}: {
  templateHeaders: string[];
  maxRows: number;
  chapterCount: number;
  skillCount: number;
}) {
  // Đổi khóa để React dựng lại ô chọn file — cách gọn nhất để xóa file đã chọn.
  const [fileFieldKey, setFileFieldKey] = useState(0);

  const [csv, setCsv] = useState('');
  const [fileName, setFileName] = useState<string | null>(null);
  const [dryReport, setDryReport] = useState<Report | null>(null);
  const [finalReport, setFinalReport] = useState<Report | null>(null);
  const [running, setRunning] = useState<'DRY' | 'REAL' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [onlyErrors, setOnlyErrors] = useState(false);

  const hasContent = csv.trim().length > 0;
  const report = finalReport ?? dryReport;

  /** Bước đang đứng — quyết định đâu là hành động chính duy nhất của màn hình. */
  const currentStep = finalReport ? 3 : dryReport ? 3 : hasContent ? 2 : 1;
  const done = finalReport !== null;

  /** Đổi nội dung là báo cáo cũ hết hiệu lực — không cho ghi thật bằng kết quả kiểm tra của file khác. */
  function replaceCsv(next: string, name: string | null) {
    setCsv(next);
    setFileName(name);
    setDryReport(null);
    setFinalReport(null);
    setError(null);
    setOnlyErrors(false);
  }

  function pickFile(file: File | undefined) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const text = typeof reader.result === 'string' ? reader.result : '';
      // Excel lưu CSV kèm BOM — bỏ đi để tên cột đầu tiên không bị lệch.
      replaceCsv(text.replace(/^﻿/, ''), file.name);
    };
    reader.onerror = () => {
      setError('Không đọc được file này. Hãy lưu lại dạng CSV UTF-8 rồi thử lần nữa.');
    };
    reader.readAsText(file, 'utf-8');
  }

  async function run(dryRun: boolean) {
    setRunning(dryRun ? 'DRY' : 'REAL');
    setError(null);
    try {
      const result = await apiPost<Report>(API.adminItemsImport, { csv, dryRun });
      if (dryRun) {
        setDryReport(result);
        setFinalReport(null);
        setOnlyErrors(result.failed > 0);
      } else {
        setFinalReport(result);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Không chạy được lần nhập này.');
    } finally {
      setRunning(null);
    }
  }

  async function importForReal() {
    if (!dryReport) return;
    const writable = dryReport.created + dryReport.updated;
    const confirmed = window.confirm(
      dryReport.failed > 0
        ? `Ghi ${writable} dòng hợp lệ vào kho và bỏ qua ${dryReport.failed} dòng lỗi?`
        : `Ghi ${writable} dòng vào kho câu hỏi? Câu sẽ nằm ở trạng thái Bản nháp.`,
    );
    if (!confirmed) return;
    await run(false);
  }

  function startOver() {
    replaceCsv('', null);
    setFileFieldKey((key) => key + 1);
  }

  return (
    <div className="space-y-5">
      <StepTracker current={currentStep} done={done} />

      {error ? (
        <Alert tone="danger" title="Chưa xử lý được">
          {error}
        </Alert>
      ) : null}

      {/* --- Bước 1 --------------------------------------------------------- */}
      <Card>
        <CardHeader
          title="Bước 1 · Lấy dữ liệu vào"
          subtitle={`Mỗi lần nhập tối đa ${maxRows.toLocaleString('vi-VN')} dòng. File lớn hơn hãy chia nhỏ.`}
          action={
            <Button
              variant="secondary"
              size="sm"
              onClick={() => {
                window.location.href = API.adminItemsTemplate;
              }}
            >
              Tải file CSV mẫu
            </Button>
          }
        />

        <p className="mb-4 text-sm text-ink-600">
          File mẫu có sẵn hai dòng ví dụ và đủ {templateHeaders.length} cột chuẩn. Cột bắt buộc:{' '}
          <strong>item_code</strong>, <strong>chapter_code</strong>, <strong>skill_code</strong>,{' '}
          <strong>difficulty</strong>, <strong>stem</strong>, <strong>correct_answer</strong>,{' '}
          <strong>solution</strong>. Tên cột tiếng Việt (mã câu, kỹ năng, đề bài, đáp án, lời giải…)
          cũng được nhận.
        </p>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <Label htmlFor="import-file" hint="định dạng .csv, mã hóa UTF-8">
              Chọn file từ máy
            </Label>
            <Input
              id="import-file"
              key={fileFieldKey}
              type="file"
              accept=".csv,text/csv"
              onChange={(event) => pickFile(event.target.files?.[0])}
            />
            {fileName ? (
              <p className="animate-fade-up mt-1.5 text-xs text-accent-700">
                Đã nạp nội dung từ “{fileName}”.
              </p>
            ) : (
              <p className="mt-1.5 text-xs text-ink-500">
                Nội dung file được đọc ngay trên máy bạn rồi mới gửi lên để kiểm tra.
              </p>
            )}
          </div>

          <div>
            <Label>Cây kiến thức hiện có</Label>
            <div className="flex flex-wrap items-center gap-2 py-2">
              <Badge tone={chapterCount > 0 ? 'brand' : 'danger'}>{chapterCount} chương</Badge>
              <Badge tone={skillCount > 0 ? 'brand' : 'danger'}>{skillCount} kỹ năng</Badge>
            </div>
            <p className="text-xs text-ink-500">
              Import không tự tạo chương/kỹ năng mới. Mã kỹ năng lạ sẽ bị báo lỗi để tránh gắn thẻ
              sai hàng loạt.
            </p>
          </div>
        </div>

        <div className="mt-4">
          <Label htmlFor="import-csv" hint="hoặc dán trực tiếp nội dung CSV vào đây">
            Nội dung CSV
          </Label>
          <Textarea
            id="import-csv"
            className="min-h-40 font-mono text-xs"
            value={csv}
            spellCheck={false}
            onChange={(event) => replaceCsv(event.target.value, null)}
            placeholder={`${templateHeaders.slice(0, 8).join(',')},…`}
          />
          {hasContent ? (
            <p className="mt-1.5 text-xs text-ink-500 tabular-nums">
              Đang có {csv.length.toLocaleString('vi-VN')} ký tự. Số dòng chính xác sẽ hiện sau khi
              kiểm tra thử.
            </p>
          ) : null}
        </div>
      </Card>

      {/* --- Bước 2 --------------------------------------------------------- */}
      <Card className={cx(currentStep === 2 && 'ring-brand-200')}>
        <CardHeader
          title="Bước 2 · Kiểm tra thử"
          subtitle="Chạy thử không ghi gì vào kho. Đây là bước bắt buộc trước khi nhập thật."
        />

        <div className="flex flex-wrap items-center gap-3">
          <Button
            variant={currentStep === 2 ? 'primary' : 'secondary'}
            onClick={() => run(true)}
            disabled={!hasContent || running !== null}
            loading={running === 'DRY'}
          >
            {dryReport ? 'Kiểm tra lại' : 'Chạy kiểm tra thử'}
          </Button>
          {hasContent ? (
            <Button variant="ghost" onClick={startOver} disabled={running !== null}>
              Xóa nội dung, nhập file khác
            </Button>
          ) : null}
          {!hasContent ? (
            <p className="text-sm text-ink-500">Hãy chọn file hoặc dán nội dung CSV ở bước 1.</p>
          ) : null}
        </div>

        {running === 'DRY' ? (
          <p className="mt-4 text-sm text-ink-500">
            <Spinner label="Đang đối chiếu từng dòng với cây kiến thức…" />
          </p>
        ) : null}

        {dryReport && !finalReport ? (
          <div className="animate-fade-up mt-5">
            <ReportView
              report={dryReport}
              onlyErrors={onlyErrors}
              onToggleOnlyErrors={setOnlyErrors}
            />
          </div>
        ) : null}
      </Card>

      {/* --- Bước 3 --------------------------------------------------------- */}
      <Card className={cx(currentStep === 3 && !done && 'ring-brand-200')}>
        <CardHeader
          title="Bước 3 · Nhập thật vào kho"
          subtitle="Chỉ mở sau khi đã có báo cáo kiểm tra thử của đúng nội dung đang nạp."
        />

        <Alert tone="info" className="mb-4" title="Câu nhập vào luôn ở trạng thái Bản nháp">
          Không có đường tắt đưa câu thẳng lên “Đã xuất bản”. Sau khi nhập, câu phải được thẩm định
          rồi xuất bản thì engine và AI mới dùng để giao bài. Câu đang xuất bản mà bị ghi đè nội dung
          cũng sẽ tự quay về Bản nháp để duyệt lại.
        </Alert>

        {!dryReport ? (
          <p className="text-sm text-ink-500">
            Hãy chạy kiểm tra thử ở bước 2 trước. Báo cáo từng dòng là cách duy nhất để biết file có
            sạch hay không.
          </p>
        ) : done ? (
          <div className="space-y-4">
            <Alert tone="success" title="Đã ghi xong vào kho câu hỏi">
              Tạo mới {finalReport.created} câu · Cập nhật {finalReport.updated} câu · Bỏ qua{' '}
              {finalReport.skipped} dòng · Lỗi {finalReport.failed} dòng.
            </Alert>
            <ReportView
              report={finalReport}
              onlyErrors={onlyErrors}
              onToggleOnlyErrors={setOnlyErrors}
            />
            <div className="flex flex-wrap gap-2">
              <LinkButton href={`${routes.adminContent()}?status=DRAFT&sort=RECENT`}>
                Xem các câu vừa nhập
              </LinkButton>
              <Button variant="secondary" onClick={startOver}>
                Nhập tiếp file khác
              </Button>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            {dryReport.failed > 0 ? (
              <Alert tone="warn" title={`Sẽ bỏ qua ${dryReport.failed} dòng lỗi`}>
                Hệ thống vẫn ghi được {dryReport.created + dryReport.updated} dòng hợp lệ, nhưng{' '}
                {dryReport.failed} dòng lỗi sẽ <strong>không</strong> được nhập. Nếu muốn nhập đủ,
                hãy sửa file rồi kiểm tra lại. Xem chi tiết lỗi ở bước 2.
              </Alert>
            ) : (
              <Alert tone="success">
                Không có dòng nào lỗi. {dryReport.created + dryReport.updated} dòng đã sẵn sàng ghi
                vào kho.
              </Alert>
            )}

            <Button
              onClick={importForReal}
              disabled={running !== null || dryReport.created + dryReport.updated === 0}
              loading={running === 'REAL'}
            >
              {dryReport.failed > 0
                ? `Nhập ${dryReport.created + dryReport.updated} dòng hợp lệ, bỏ qua ${dryReport.failed} dòng`
                : `Nhập thật ${dryReport.created + dryReport.updated} dòng`}
            </Button>

            {dryReport.created + dryReport.updated === 0 ? (
              <p className="text-sm text-ink-500">
                Chưa có dòng nào hợp lệ để ghi. Hãy sửa các lỗi ở bước 2 rồi kiểm tra lại.
              </p>
            ) : null}
          </div>
        )}
      </Card>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Thanh 3 bước
// ---------------------------------------------------------------------------

function StepTracker({ current, done }: { current: number; done: boolean }) {
  const percent = done ? 100 : ((current - 1) / (STEPS.length - 1)) * 100;

  return (
    <Card>
      <ProgressBar value={percent} className="mb-4" />
      <ol className="grid gap-3 sm:grid-cols-3">
        {STEPS.map((step, index) => {
          const number = index + 1;
          const isDone = done || number < current;
          const isCurrent = !done && number === current;
          return (
            <li key={step.title} className="flex items-start gap-3">
              <span
                // key đổi theo trạng thái để hiệu ứng chạy lại đúng lúc bước thay đổi
                key={`${number}-${isCurrent}-${isDone}`}
                className={cx(
                  'flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-bold',
                  isCurrent && 'animate-pop bg-brand-600 text-white',
                  isDone && 'bg-accent-600 text-white',
                  !isCurrent && !isDone && 'bg-ink-100 text-ink-500',
                )}
                aria-hidden
              >
                {isDone ? '✓' : number}
              </span>
              <span className="min-w-0">
                <span
                  className={cx(
                    'block text-sm font-semibold',
                    isCurrent ? 'text-brand-800' : 'text-ink-700',
                  )}
                >
                  Bước {number}. {step.title}
                  {isCurrent ? <span className="sr-only"> (đang ở bước này)</span> : null}
                  {isDone ? <span className="sr-only"> (đã xong)</span> : null}
                </span>
                <span className="mt-0.5 block text-xs text-ink-500">{step.hint}</span>
              </span>
            </li>
          );
        })}
      </ol>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Báo cáo theo từng dòng
// ---------------------------------------------------------------------------

function ReportView({
  report,
  onlyErrors,
  onToggleOnlyErrors,
}: {
  report: Report;
  onlyErrors: boolean;
  onToggleOnlyErrors: (value: boolean) => void;
}) {
  const warnedCount = useMemo(
    () => report.rows.filter((row) => row.warnings.length > 0 && row.action !== 'ERROR').length,
    [report.rows],
  );

  const rows = onlyErrors ? report.rows.filter((row) => row.action === 'ERROR') : report.rows;
  const visible = rows.slice(0, MAX_VISIBLE_ROWS);

  return (
    <div>
      <div className="stagger mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile label="Tổng số dòng" value={<span className="tabular-nums">{report.total}</span>} />
        <StatTile
          label="Tạo mới"
          value={<span className="tabular-nums">{report.created}</span>}
          hint={report.dryRun ? 'dự kiến' : 'đã ghi'}
        />
        <StatTile
          label="Cập nhật"
          value={<span className="tabular-nums">{report.updated}</span>}
          hint={report.dryRun ? 'dự kiến' : 'đã ghi'}
        />
        <StatTile
          label="Dòng lỗi"
          value={<span className="tabular-nums">{report.failed}</span>}
          hint={report.failed > 0 ? 'cần sửa file' : 'không có lỗi'}
          tone={report.failed > 0 ? 'danger' : 'success'}
        />
      </div>

      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-ink-600">
          Bỏ qua <span className="tabular-nums">{report.skipped}</span> dòng (dòng trống hoặc đánh
          dấu bỏ qua) · <span className="tabular-nums">{warnedCount}</span> dòng có cảnh báo nhưng
          vẫn ghi được.
        </p>
        <label className="flex items-center gap-2 text-sm text-ink-700">
          <input
            type="checkbox"
            className="h-4 w-4 rounded border-ink-300"
            checked={onlyErrors}
            onChange={(event) => onToggleOnlyErrors(event.target.checked)}
          />
          Chỉ xem dòng lỗi
        </label>
      </div>

      {visible.length === 0 ? (
        <Alert tone="success">
          {onlyErrors
            ? 'Không có dòng nào lỗi — file đã sạch.'
            : 'File không có dòng dữ liệu nào để hiển thị.'}
        </Alert>
      ) : (
        <Table head={['Dòng', 'Mã câu', 'Kết quả', 'Chi tiết']}>
          {visible.map((row) => (
            <Tr
              key={`${row.rowNumber}-${row.itemCode ?? 'x'}`}
              className={row.action === 'ERROR' ? 'bg-rose-50/60' : undefined}
            >
              <Td className="tabular-nums whitespace-nowrap text-ink-500">Dòng {row.rowNumber}</Td>
              <Td className="font-medium whitespace-nowrap text-ink-800">
                {row.itemCode ?? <span className="font-normal text-ink-400">chưa có mã</span>}
              </Td>
              <Td>
                <Badge tone={ACTION_TONE[row.action]} dot>
                  {ACTION_LABEL[row.action]}
                </Badge>
              </Td>
              <Td className="max-w-xl">
                {row.errors.length === 0 && row.warnings.length === 0 ? (
                  <span className="text-ink-400">Không có vấn đề gì.</span>
                ) : null}
                {row.errors.length > 0 ? (
                  <ul className="list-disc space-y-1 pl-4 text-rose-700">
                    {row.errors.map((message, index) => (
                      <li key={index}>{message}</li>
                    ))}
                  </ul>
                ) : null}
                {row.warnings.length > 0 ? (
                  <ul className="mt-1 list-disc space-y-1 pl-4 text-amber-700">
                    {row.warnings.map((message, index) => (
                      <li key={index}>Cảnh báo: {message}</li>
                    ))}
                  </ul>
                ) : null}
              </Td>
            </Tr>
          ))}
        </Table>
      )}

      {rows.length > MAX_VISIBLE_ROWS ? (
        <p className="mt-3 text-xs text-ink-500">
          Đang hiển thị {MAX_VISIBLE_ROWS} dòng đầu trên tổng số {rows.length} dòng khớp bộ lọc. Bật
          “Chỉ xem dòng lỗi” để soi nhanh phần cần sửa.
        </p>
      ) : null}
    </div>
  );
}
