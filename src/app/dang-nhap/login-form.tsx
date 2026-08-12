'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { Role } from '@prisma/client';
import { apiPost } from '@/lib/client';
import { API, routes } from '@/lib/routes';
import { landingRoute } from '@/lib/areas';
import { Alert, Button, Field, Input } from '@/components/ui';

/** Phần dữ liệu của `POST /api/v1/auth/login` mà biểu mẫu này cần. */
interface LoginResponse {
  user: { id: string; fullName: string; roles: Role[] };
}

export function LoginForm({ next }: { next?: string }) {
  const router = useRouter();
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      // Đưa người dùng về ĐÚNG khu của họ chứ không mặc định "Khóa học của tôi".
      // Tài khoản quản trị, biên soạn viên hay giáo viên không ghi danh khóa nào,
      // nên màn hình đó với họ là một trang trống báo "Bạn chưa ghi danh khóa
      // nào" — ấn tượng đầu tiên sau khi đăng nhập không nên là một ngõ cụt.
      const result = await apiPost<LoginResponse>(API.login, {
        identifier: identifier.trim(),
        password,
      });
      router.push(next ?? landingRoute(result?.user?.roles ?? []));
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Không đăng nhập được.');
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} noValidate>
      {error ? (
        <Alert tone="danger" className="mb-4">
          {error}
        </Alert>
      ) : null}

      <Field label="Email hoặc số điện thoại" htmlFor="identifier">
        <Input
          id="identifier"
          name="identifier"
          autoComplete="username"
          required
          value={identifier}
          onChange={(event) => setIdentifier(event.target.value)}
          placeholder="hs1@example.com"
        />
      </Field>

      <Field label="Mật khẩu" htmlFor="password">
        <Input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
          value={password}
          onChange={(event) => setPassword(event.target.value)}
        />
      </Field>

      <Button type="submit" className="w-full" disabled={submitting}>
        {submitting ? 'Đang đăng nhập…' : 'Đăng nhập'}
      </Button>

      <p className="mt-3 text-center text-sm">
        <Link href={routes.forgotPassword()} className="text-navy-500 hover:text-navy-900">
          Quên mật khẩu?
        </Link>
      </p>
    </form>
  );
}
