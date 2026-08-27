import Link from 'next/link';
import { routes } from '@/lib/routes';
import { FocusShell } from '@/components/shell';
import { ForgotPasswordForm } from './forgot-form';

export const metadata = { title: 'Quên mật khẩu' };

export default function ForgotPasswordPage() {
  return (
    <FocusShell
      title="Đặt lại mật khẩu"
      subtitle="Nhập email hoặc số điện thoại đã đăng ký, hệ thống sẽ gửi mã xác nhận."
      footer={
        <Link href={routes.login()} className="font-semibold text-warm-800 hover:underline">
          ← Quay lại đăng nhập
        </Link>
      }
    >
      <ForgotPasswordForm />
    </FocusShell>
  );
}
