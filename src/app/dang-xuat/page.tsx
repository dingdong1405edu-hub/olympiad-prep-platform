import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth';
import { routes } from '@/lib/routes';
import { FocusShell } from '@/components/shell';
import { LinkButton } from '@/components/ui';

export const dynamic = 'force-dynamic';

export const metadata = { title: 'Đã đăng xuất' };

/**
 * Trang xác nhận sau khi thoát.
 *
 * Trang này KHÔNG tự đăng xuất — việc đó do `POST /api/v1/auth/logout` làm rồi
 * chuyển hướng tới đây. Nếu để nó tự xóa phiên thì chỉ cần một thẻ <img> trỏ vào
 * đường dẫn này trên diễn đàn bất kỳ là đá được người dùng ra khỏi hệ thống.
 *
 * Vào thẳng khi vẫn đang đăng nhập nghĩa là gõ nhầm URL, nên trả người dùng về
 * chỗ họ đang học thay vì hiện một lời chào tạm biệt sai.
 */
export default async function LoggedOutPage() {
  const session = await getSession();
  if (session) redirect(routes.myCourses());

  return (
    <FocusShell
      title="Bạn đã đăng xuất"
      subtitle="Phiên làm việc đã được đóng trên thiết bị này. Tiến độ học và mọi bài đã làm vẫn được lưu nguyên vẹn."
      footer={
        <>
          Chưa có tài khoản?{' '}
          <Link href={routes.register()} className="font-medium text-warm-800 hover:underline">
            Đăng ký học thử
          </Link>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        <LinkButton href={routes.login()} size="lg" className="w-full">
          Đăng nhập lại
        </LinkButton>
        <LinkButton href={routes.home()} variant="secondary" size="lg" className="w-full">
          Về trang chủ
        </LinkButton>
      </div>

      <div className="mt-6 rounded-xl bg-warm-50 px-4 py-3.5 text-sm leading-relaxed text-warm-600 ring-1 ring-warm-100">
        <p className="font-semibold text-warm-900">Đang dùng máy chung?</p>
        <p className="mt-1">
          Hãy đóng luôn cửa sổ trình duyệt để xóa nốt các trang còn nằm trong bộ nhớ tạm.
        </p>
      </div>
    </FocusShell>
  );
}
