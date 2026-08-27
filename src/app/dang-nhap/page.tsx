import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth';
import { routes } from '@/lib/routes';
import { FocusAside, FocusShell } from '@/components/shell';
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
      aside={
        <FocusAside
          eyebrow="Tiếp tục lộ trình"
          title="Buổi học hôm nay đã được xếp sẵn, chờ bạn quay lại."
          points={[
            {
              title: 'Không phải nhớ hôm nay học gì',
              description:
                'Mở lên là thấy ngay buổi của hôm nay: bao nhiêu câu, mất khoảng bao lâu, và vì sao lại là những câu đó.',
            },
            {
              title: 'Nghỉ vài hôm cũng không mất bài',
              description:
                'Buổi bị lỡ được dồn sang những buổi còn lại cho vừa sức, không dồn cục vào một ngày.',
            },
            {
              title: 'Tiến độ được lưu sau từng câu',
              description:
                'Đang làm dở mà mất mạng hay hết pin, lần sau vào vẫn đúng chỗ vừa dừng.',
            },
          ]}
        />
      }
      footer={
        <>
          Chưa có tài khoản?{' '}
          <Link
            href={routes.register(next)}
            className="font-semibold text-warm-800 hover:underline"
          >
            Đăng ký ngay
          </Link>
        </>
      }
    >
      <LoginForm next={next} />
    </FocusShell>
  );
}
