'use client';

import { useState } from 'react';
import { apiPost } from '@/lib/client';
import { API } from '@/lib/routes';
import { Alert, Button, Field, Input } from '@/components/ui';
import { Toast, useToast } from '@/components/motion';

export function ChangePasswordForm() {
  const { toast, show, hide } = useToast();
  const [oldPassword, setOld] = useState('');
  const [newPassword, setNew] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);

    if (newPassword !== confirm) {
      setError('Hai lần nhập mật khẩu mới chưa khớp nhau.');
      return;
    }

    setSubmitting(true);
    try {
      await apiPost(API.changePassword, { oldPassword, newPassword });
      setOld('');
      setNew('');
      setConfirm('');
      show('Đã đổi mật khẩu thành công.', 'success');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Không đổi được mật khẩu.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={submit} noValidate>
      {error ? (
        <Alert tone="danger" className="mb-4">
          {error}
        </Alert>
      ) : null}

      <div className="grid gap-x-4 sm:grid-cols-2">
        <Field label="Mật khẩu hiện tại" htmlFor="oldPassword">
          <Input
            id="oldPassword"
            type="password"
            autoComplete="current-password"
            required
            value={oldPassword}
            onChange={(event) => setOld(event.target.value)}
          />
        </Field>
        <div />
        <Field label="Mật khẩu mới" htmlFor="newPassword" hint="ít nhất 8 ký tự">
          <Input
            id="newPassword"
            type="password"
            autoComplete="new-password"
            required
            minLength={8}
            value={newPassword}
            onChange={(event) => setNew(event.target.value)}
          />
        </Field>
        <Field label="Nhập lại mật khẩu mới" htmlFor="confirmPassword">
          <Input
            id="confirmPassword"
            type="password"
            autoComplete="new-password"
            required
            minLength={8}
            value={confirm}
            onChange={(event) => setConfirm(event.target.value)}
          />
        </Field>
      </div>

      <Button type="submit" loading={submitting}>
        Đổi mật khẩu
      </Button>

      <Toast message={toast.message} tone={toast.tone} onClose={hide} />
    </form>
  );
}
