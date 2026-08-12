import { notFound, redirect } from 'next/navigation';
import { getSession } from '@/lib/auth';
import { previewCheckout } from '@/server/commerce/service';
import { routes } from '@/lib/routes';
import { AppShell } from '@/components/shell';
import { CheckoutForm } from './checkout-form';

export const dynamic = 'force-dynamic';

export const metadata = { title: 'Thanh toán' };

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
      <div className="mx-auto max-w-lg">
        <h1 className="text-2xl font-bold text-ink-900">Đăng ký khóa học</h1>
        <p className="mt-1 text-sm text-ink-500">
          {preview.course.programName} · {preview.course.subjectLabel} ·{' '}
          {preview.course.gradeBandLabel}
        </p>

        <div className="mt-6">
          <CheckoutForm courseId={courseId} initialPreview={preview} />
        </div>
      </div>
    </AppShell>
  );
}
