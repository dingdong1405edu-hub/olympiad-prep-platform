'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { apiPost } from '@/lib/client';
import { API, routes } from '@/lib/routes';
import { Alert, Button, Field, Input, Select } from '@/components/ui';

const GRADES = [3, 4, 5, 6, 7, 8, 9, 10, 11, 12];

export function RegisterForm({ next }: { next?: string }) {
  const router = useRouter();
  const [form, setForm] = useState({
    fullName: '',
    email: '',
    phone: '',
    password: '',
    actualGrade: '7',
    school: '',
    parentName: '',
    parentPhone: '',
  });
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  function update(key: keyof typeof form, value: string) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await apiPost(API.register, {
        fullName: form.fullName.trim(),
        email: form.email.trim() || undefined,
        phone: form.phone.trim() || undefined,
        password: form.password,
        actualGrade: Number(form.actualGrade),
        school: form.school.trim() || undefined,
        parentName: form.parentName.trim() || undefined,
        parentPhone: form.parentPhone.trim() || undefined,
      });
      router.push(next ?? routes.myCourses());
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Không tạo được tài khoản.');
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

      <Field label="Họ và tên học sinh" htmlFor="fullName">
        <Input
          id="fullName"
          required
          value={form.fullName}
          onChange={(event) => update('fullName', event.target.value)}
        />
      </Field>

      <Field label="Email" htmlFor="email" hint="hoặc dùng số điện thoại bên dưới">
        <Input
          id="email"
          type="email"
          autoComplete="email"
          value={form.email}
          onChange={(event) => update('email', event.target.value)}
        />
      </Field>

      <Field label="Số điện thoại" htmlFor="phone" hint="tùy chọn">
        <Input
          id="phone"
          inputMode="tel"
          value={form.phone}
          onChange={(event) => update('phone', event.target.value)}
        />
      </Field>

      <Field label="Mật khẩu" htmlFor="password" hint="ít nhất 8 ký tự">
        <Input
          id="password"
          type="password"
          autoComplete="new-password"
          required
          minLength={8}
          value={form.password}
          onChange={(event) => update('password', event.target.value)}
        />
      </Field>

      <Field label="Lớp đang học" htmlFor="actualGrade">
        <Select
          id="actualGrade"
          value={form.actualGrade}
          onChange={(event) => update('actualGrade', event.target.value)}
        >
          {GRADES.map((grade) => (
            <option key={grade} value={grade}>
              Lớp {grade}
            </option>
          ))}
        </Select>
      </Field>

      <details className="mb-4 rounded-lg bg-ink-50 px-4 py-3">
        <summary className="cursor-pointer text-sm font-medium text-ink-600">
          Thông tin thêm (không bắt buộc)
        </summary>
        <div className="mt-3">
          <Field label="Trường" htmlFor="school">
            <Input
              id="school"
              value={form.school}
              onChange={(event) => update('school', event.target.value)}
            />
          </Field>
          <Field label="Tên phụ huynh" htmlFor="parentName">
            <Input
              id="parentName"
              value={form.parentName}
              onChange={(event) => update('parentName', event.target.value)}
            />
          </Field>
          <Field label="Điện thoại phụ huynh" htmlFor="parentPhone">
            <Input
              id="parentPhone"
              inputMode="tel"
              value={form.parentPhone}
              onChange={(event) => update('parentPhone', event.target.value)}
            />
          </Field>
        </div>
      </details>

      <Button type="submit" className="w-full" disabled={submitting}>
        {submitting ? 'Đang tạo tài khoản…' : 'Tạo tài khoản'}
      </Button>

      <p className="mt-3 text-xs text-ink-500">
        Chúng tôi chỉ thu thập thông tin cần thiết cho việc học. Dữ liệu học tập của học sinh không
        được dùng cho mục đích nào khác.
      </p>
    </form>
  );
}
