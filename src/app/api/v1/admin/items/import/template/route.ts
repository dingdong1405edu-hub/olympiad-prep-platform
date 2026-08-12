import { requireContentStaff } from '@/lib/auth';
import { buildImportTemplateCsv } from '@/server/content/import';

/** Tải file CSV mẫu cho đội biên soạn. BOM UTF-8 để Excel mở không lỗi font tiếng Việt. */
export async function GET(): Promise<Response> {
  await requireContentStaff();

  const csv = '﻿' + buildImportTemplateCsv();
  return new Response(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': 'attachment; filename="mau-nhap-cau-hoi.csv"',
      'Cache-Control': 'no-store',
    },
  });
}
