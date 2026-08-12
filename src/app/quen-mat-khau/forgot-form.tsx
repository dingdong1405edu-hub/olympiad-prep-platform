'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { apiPost } from '@/lib/client';
import { API, routes } from '@/lib/routes';
import { Alert, Button, Field, Input } from '@/components/ui';

export function ForgotPasswordForm() {
  const router = useRouter();
  const [step, setStep] = useState<'REQUEST' | 'CONFIRM'>('REQUEST');
  const [identifier, setIdentifier] = useState('');
  const [code, setCode] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [devOtp, setDevOtp] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function requestCode(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const result = await apiPost<{ sent: boolean; devOtp?: string }>(API.forgotPassword, {
        identifier: identifier.trim(),
      });
      setDevOtp(result.devOtp ?? null);
      setStep('CONFIRM');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Không gửi được mã xác nhận.');
    } finally {
      setSubmitting(false);
    }
  }

  async function confirmReset(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await apiPost(API.resetPassword, {
        identifier: identifier.trim(),
        code: code.trim(),
        newPassword,
      });
      router.push(routes.login());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Không đặt lại được mật khẩu.');
      setSubmitting(false);
    }
  }

  if (step === 'REQUEST') {
    return (
      <form onSubmit={requestCode} noValidate>
        {error ? (
          <Alert tone="danger" className="mb-4">
            {error}
          </Alert>
        ) : null}

        <Field label="Email hoặc số điện thoại" htmlFor="identifier">
          <Input
            id="identifier"
            required
            value={identifier}
            onChange={(event) => setIdentifier(event.target.value)}
          />
        </Field>

        <Button type="submit" className="w-full" disabled={submitting}>
          {submitting ? 'Đang gửi…' : 'Gửi mã xác nhận'}
        </Button>
      </form>
    );
  }

  return (
    <form onSubmit={confirmReset} noValidate>
      {error ? (
        <Alert tone="danger" className="mb-4">
          {error}
        </Alert>
      ) : null}

      <Alert tone="info" className="mb-4">
        Nếu tài khoản tồn tại, mã xác nhận đã được gửi.
        {devOtp ? (
          <p className="mt-1">
            Môi trường phát triển — mã của bạn là <strong>{devOtp}</strong>.
          </p>
        ) : null}
      </Alert>

      <Field label="Mã xác nhận" htmlFor="code">
        <Input
          id="code"
          inputMode="numeric"
          required
          value={code}
          onChange={(event) => setCode(event.target.value)}
        />
      </Field>

      <Field label="Mật khẩu mới" htmlFor="newPassword" hint="ít nhất 8 ký tự">
        <Input
          id="newPassword"
          type="password"
          autoComplete="new-password"
          required
          minLength={8}
          value={newPassword}
          onChange={(event) => setNewPassword(event.target.value)}
        />
      </Field>

      <Button type="submit" className="w-full" disabled={submitting}>
        {submitting ? 'Đang cập nhật…' : 'Đặt lại mật khẩu'}
      </Button>
    </form>
  );
}
