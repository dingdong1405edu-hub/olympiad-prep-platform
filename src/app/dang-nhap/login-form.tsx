'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { apiPost } from '@/lib/client';
import { API, routes } from '@/lib/routes';
import { Alert, Button, Field, Input } from '@/components/ui';

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
      await apiPost(API.login, { identifier: identifier.trim(), password });
      router.push(next ?? routes.myCourses());
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
