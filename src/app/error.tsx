'use client';

/**
 * MÀN HÌNH LỖI DÙNG CHUNG.
 *
 * Trước đây dự án không có `error.tsx` ở bất kỳ đâu, nên mọi lỗi phía máy chủ
 * đều rơi vào trang trắng mặc định của Next: không nói gì, không có đường quay
 * lại, không có gì để báo cho bộ phận kỹ thuật. Người dùng chỉ biết "bấm vào là
 * hỏng" — đúng thứ khó dò nhất khi nhận báo lỗi.
 *
 * Ở đây nói rõ ba điều: đã có lỗi, thử lại được, và mã lỗi để đối chiếu nhật ký.
 * KHÔNG in `error.message` ra: thông điệp lỗi phía máy chủ có thể lộ cấu trúc
 * truy vấn hoặc đường dẫn tệp.
 */
import { useEffect } from 'react';
import Link from 'next/link';
import { routes } from '@/lib/routes';

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('[ui] lỗi không bắt được', error);
  }, [error]);

  return (
    <div className="paper flex min-h-screen items-center justify-center px-5 py-16">
      <div className="w-full max-w-lg rounded-2xl bg-white p-8 ring-1 ring-warm-100 shadow-[0_24px_56px_-24px_rgb(120_70_45/0.35)]">
        <div className="gold-rule mb-4" aria-hidden />
        <h1 className="font-display text-2xl font-bold tracking-tight text-warm-900">
          Trang này đang gặp sự cố
        </h1>
        <p className="mt-2 text-[15px] leading-relaxed text-warm-600">
          Lỗi xảy ra ở phía máy chủ, không phải do thao tác của bạn. Dữ liệu bạn đã lưu trước đó vẫn
          nguyên vẹn.
        </p>

        <div className="mt-6 flex flex-wrap gap-3">
          <button
            type="button"
            onClick={reset}
            className="press rounded-lg btn-fire px-5 py-2.5 text-sm font-bold"
          >
            Thử lại
          </button>
          <Link
            href={routes.home()}
            className="press rounded-lg px-5 py-2.5 text-sm font-semibold text-warm-700 ring-1 ring-warm-200 transition-colors hover:bg-warm-50"
          >
            Về trang chủ
          </Link>
        </div>

        {error.digest ? (
          <p className="mt-6 border-t border-warm-100 pt-4 text-xs text-warm-400">
            Mã lỗi để báo cho bộ phận kỹ thuật:{' '}
            <code className="font-mono text-warm-600">{error.digest}</code>
          </p>
        ) : null}
      </div>
    </div>
  );
}
