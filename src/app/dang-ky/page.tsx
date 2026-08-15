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

  if (session) redirect(next ?? routes.mockExams());

  return (
    <FocusShell
      title="Tạo tài khoản học sinh"
      subtitle="Xong là vào thi thử được ngay — 5 lượt miễn phí cho mỗi đề."
      aside={
        <FocusAside
          eyebrow="Ngay sau khi đăng ký"
          title="Làm một đề Olympic thật, có người chấm, trong 180 phút."
          points={[
            {
              title: '1 · Chọn đề và bấm bắt đầu',
              description:
                'Đồng hồ do máy chủ giữ đúng như thi thật. Đóng nhầm tab vẫn vào lại được đúng lượt đang làm.',
            },
            {
              title: '2 · Chụp ảnh bài giải tự luận',
              description:
                'AI đọc lại bài viết tay của con, chấm theo đúng barem của đề và chỉ ra mất điểm ở bước nào.',
            },
            {
              title: '3 · Biết học lực và học tiếp cái gì',
              description:
                'Nộp xong có ngay mức Kém / Trung bình / Khá / Giỏi dựa trên điểm, kèm khóa học phù hợp với chỗ còn hổng.',
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
