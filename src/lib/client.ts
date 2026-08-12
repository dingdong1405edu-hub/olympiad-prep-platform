'use client';

/**
 * Client gọi API — dùng chung cho mọi Client Component.
 * Tự bóc định dạng { ok, data } | { ok, error } của `src/lib/http.ts`.
 */

export class ApiClientError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly status: number,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = 'ApiClientError';
  }
}

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
  });

  let payload: unknown = null;
  try {
    payload = await response.json();
  } catch {
    throw new ApiClientError('Máy chủ trả về dữ liệu không hợp lệ.', 'BAD_RESPONSE', response.status);
  }

  const body = payload as
    | { ok: true; data: T }
    | { ok: false; error: { code: string; message: string; details?: unknown } };

  if (!response.ok || !body.ok) {
    const error = 'error' in body ? body.error : undefined;
    throw new ApiClientError(
      error?.message ?? 'Có lỗi xảy ra, vui lòng thử lại.',
      error?.code ?? 'UNKNOWN',
      response.status,
      error?.details,
    );
  }

  return body.data;
}

export function apiGet<T>(url: string): Promise<T> {
  return request<T>(url, { method: 'GET' });
}

export function apiPost<T>(url: string, body?: unknown): Promise<T> {
  return request<T>(url, { method: 'POST', body: JSON.stringify(body ?? {}) });
}

export function apiPatch<T>(url: string, body?: unknown): Promise<T> {
  return request<T>(url, { method: 'PATCH', body: JSON.stringify(body ?? {}) });
}

export function apiPut<T>(url: string, body?: unknown): Promise<T> {
  return request<T>(url, { method: 'PUT', body: JSON.stringify(body ?? {}) });
}

export function apiDelete<T>(url: string): Promise<T> {
  return request<T>(url, { method: 'DELETE' });
}

/** Gửi sự kiện analytics, không chặn UI và không bao giờ ném lỗi. */
export function trackClient(eventName: string, properties?: Record<string, unknown>): void {
  void fetch('/api/v1/events', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ events: [{ eventName, properties: properties ?? {} }] }),
    keepalive: true,
  }).catch(() => undefined);
}
