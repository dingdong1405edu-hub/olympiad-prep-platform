import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth';
import { routes } from '@/lib/routes';
import { FocusShell } from '@/components/shell';
import { LoginForm } from './login-form';

export const dynamic = 'force-dynamic';

export const metadata = { title: 'Đăng nhập' };

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const session = await getSession();
  const { next } = await searchParams;

  if (session) redirect(next ?? routes.myCourses());

  return (
    <FocusShell
      title="Đăng nhập"
      subtitle="Dùng email hoặc số điện thoại bạn đã đăng ký."
      footer={
        <>
          Chưa có tài khoản?{' '}
          <Link href={routes.register(next)} className="font-medium text-brand-700 hover:underline">
            Đăng ký ngay
          </Link>
        </>
      }
    >
      <LoginForm next={next} />
    </FocusShell>
  );
}
