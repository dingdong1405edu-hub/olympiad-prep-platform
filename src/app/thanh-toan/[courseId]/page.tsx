import { notFound, redirect } from 'next/navigation';
import { getSession } from '@/lib/auth';
import { previewCheckout } from '@/server/commerce/service';
import { routes } from '@/lib/routes';
import { AppShell } from '@/components/shell';
import { Card } from '@/components/ui';
import { CheckoutForm } from './checkout-form';

export const dynamic = 'force-dynamic';

export const metadata = { title: 'Thanh toán' };

/**
 * Học phí bao gồm những gì. Viết cố định ở đây vì ba thứ này đúng với MỌI khóa
 * của nền tảng, không phải dữ liệu riêng của từng khóa.
 */
const INCLUDED = [
  {
    title: 'Bài kiểm tra đầu vào 15 câu',
    detail: 'Dựng bản đồ kỹ năng ngay sau khi làm: mạnh ở đâu, hổng ở đâu.',
  },
  {
    title: 'Lộ trình học theo từng ngày',
    detail: 'Mỗi ngày một danh sách bài đúng sức, tự giãn lại khi con học chậm hoặc nhanh hơn.',
  },
  {
    title: 'Thi thử chấm tự động',
    detail: 'Đề bám cấu trúc kỳ thi thật, chấm được cả câu tự luận chụp từ vở.',
  },
];

export default async function CheckoutPage({ params }: { params: Promise<{ courseId: string }> }) {
  const { courseId } = await params;
  const session = await getSession();

  if (!session) redirect(routes.login(routes.checkout(courseId)));

  let preview;
  try {
    preview = await previewCheckout({ courseId });
  } catch {
    notFound();
  }

  return (
    <AppShell user={{ id: session.id, fullName: session.fullName, roles: session.roles }}>
      <div className="mx-auto max-w-5xl">
        <header>
          <div className="flex flex-wrap items-center gap-1.5 text-xs font-semibold">
            <span className="rounded-full bg-brand-50 px-2.5 py-1 text-brand-700">
              {preview.course.programName}
            </span>
            <span className="rounded-full bg-ink-100 px-2.5 py-1 text-ink-600">
              {preview.course.subjectLabel}
            </span>
            <span className="rounded-full bg-ink-100 px-2.5 py-1 text-ink-600">
              {preview.course.gradeBandLabel}
            </span>
          </div>
          <h1 className="mt-3 text-2xl font-bold tracking-tight text-ink-900 sm:text-3xl">
            {preview.course.name}
          </h1>
        </header>

        {/*
          Hai thứ quyết định bố cục này:

          1. Trên mobile bảng tiền và nút thanh toán đi TRƯỚC phần giới thiệu
             (`order-1`). Người đã bấm vào trang này là người đã quyết mua rồi —
             bắt họ cuộn qua một đoạn quảng cáo mới thấy nút trả tiền là vô duyên.
          2. Trên màn hình rộng bảng tiền DÍNH lại (`md:sticky`). Đọc phần giới
             thiệu bên trái bao lâu thì tổng tiền và nút bấm vẫn nằm nguyên trong
             tầm mắt, không phải cuộn ngược lên tìm.

          Chia cột từ `md` (768px) chứ không đợi `lg`: ở khoảng 768–1023px — máy
          tính bảng và laptop nhỏ — bố cục một cột kéo thẻ tóm tắt rộng hết bề
          ngang, thành ra một nút "Thanh toán" dài cả gang tay trông rất nghiệp dư.
        */}
        <div className="mt-6 grid gap-5 md:grid-cols-[minmax(0,1fr)_minmax(0,21rem)] md:items-start">
          <div className="order-2 space-y-4 md:order-1">
            {preview.course.description ? (
              <Card>
                <h2 className="text-sm font-semibold text-ink-900">Về khóa học này</h2>
                <p className="mt-2 text-sm leading-relaxed text-ink-600">
                  {preview.course.description}
                </p>
              </Card>
            ) : null}

            <Card>
              <h2 className="text-sm font-semibold text-ink-900">Học phí đã bao gồm</h2>
              <ul className="mt-3 space-y-3">
                {INCLUDED.map((item) => (
                  <li key={item.title} className="flex gap-3">
                    <span
                      className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-accent-50 text-accent-600"
                      aria-hidden
                    >
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none">
                        <path
                          d="M4 12.5 9.5 18 20 6.5"
                          stroke="currentColor"
                          strokeWidth="3.5"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      </svg>
                    </span>
                    <div>
                      <p className="text-sm font-semibold text-ink-800">{item.title}</p>
                      <p className="mt-0.5 text-xs leading-relaxed text-ink-500">{item.detail}</p>
                    </div>
                  </li>
                ))}
              </ul>
            </Card>
          </div>

          <div className="order-1 md:order-2 md:sticky md:top-4">
            <CheckoutForm courseId={courseId} initialPreview={preview} />
          </div>
        </div>
      </div>
    </AppShell>
  );
}
