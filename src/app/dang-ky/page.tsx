import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth';
import { routes } from '@/lib/routes';
import { FocusShell } from '@/components/shell';
import { RegisterForm } from './register-form';

export const dynamic = 'force-dynamic';

export const metadata = { title: 'Đăng ký' };

export default async function RegisterPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const session = await getSession();
  const { next } = await searchParams;

  if (session) redirect(next ?? routes.myCourses());

  return (
    <FocusShell
      title="Tạo tài khoản học sinh"
      subtitle="Chỉ cần vài thông tin cơ bản để bắt đầu bài kiểm tra đầu vào."
      footer={
        <>
          Đã có tài khoản?{' '}
          <Link href={routes.login(next)} className="font-medium text-brand-700 hover:underline">
            Đăng nhập
          </Link>
        </>
      }
    >
      <RegisterForm next={next} />
    </FocusShell>
  );
}
