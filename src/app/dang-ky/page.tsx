import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth';
import { routes } from '@/lib/routes';
import { FocusAside, FocusShell } from '@/components/shell';
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
      aside={
        <FocusAside
          eyebrow="Ba bước đầu tiên"
          title="Từ lúc đăng ký tới lộ trình riêng, mất chừng 20 phút."
          points={[
            {
              title: '1 · Khai báo lớp và mức tự thấy',
              description:
                'Hai câu hỏi ngắn, chỉ dùng để chọn độ khó cho bài kiểm tra đầu vào — không phải kết luận về con.',
            },
            {
              title: '2 · Làm bài kiểm tra đầu vào',
              description:
                'Bài trải đều các chương để hệ thống nhìn ra đâu là điểm mạnh, đâu là lỗ hổng thật sự.',
            },
            {
              title: '3 · Nhận lộ trình theo quỹ thời gian của mình',
              description:
                'Bạn cho biết mỗi tuần học được mấy buổi, mỗi buổi bao nhiêu phút; hệ thống tính ngược ra đích đến khả thi.',
            },
          ]}
        />
      }
      footer={
        <>
          Đã có tài khoản?{' '}
          <Link href={routes.login(next)} className="font-semibold text-navy-800 hover:underline">
            Đăng nhập
          </Link>
        </>
      }
    >
      <RegisterForm next={next} />
    </FocusShell>
  );
}
