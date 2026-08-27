'use client';

/**
 * TRÌNH PHÁT VIDEO GIỚI THIỆU.
 *
 * Chấp nhận ba nguồn mà người quản trị thực tế sẽ dán vào: link YouTube (mọi
 * dạng), link Vimeo, và link tệp mp4/webm trực tiếp. Dán sai định dạng thì hiện
 * một lời nhắc chứ không để khung đen im lặng — người sửa nội dung cần biết ngay
 * là link chưa dùng được.
 *
 * VÌ SAO KHÔNG NHÚNG THẲNG IFRAME NGAY KHI TẢI TRANG: một iframe YouTube kéo
 * theo vài trăm KB script và cookie theo dõi cho MỌI khách vào trang, kể cả
 * người không bao giờ bấm phát. Ở đây chỉ hiện ảnh nền cùng nút phát; iframe chỉ
 * được tạo sau cú bấm đầu tiên. Trang nhẹ hơn hẳn và khách không bị theo dõi khi
 * chưa đồng ý xem.
 */
import { useMemo, useState } from 'react';

interface ParsedVideo {
  kind: 'youtube' | 'vimeo' | 'file';
  /** Địa chỉ nhúng (iframe) hoặc địa chỉ tệp. */
  src: string;
  /** Ảnh nền suy ra được từ nguồn, khi người dùng không tự đặt. */
  poster?: string;
}

/** Nhận diện nguồn video từ một đường dẫn bất kỳ. */
export function parseVideoUrl(raw: string): ParsedVideo | null {
  const url = raw.trim();
  if (url === '') return null;

  // YouTube: youtu.be/ID, /watch?v=ID, /embed/ID, /shorts/ID, /live/ID
  const yt =
    /(?:youtube\.com\/(?:watch\?(?:.*&)?v=|embed\/|shorts\/|live\/)|youtu\.be\/)([A-Za-z0-9_-]{6,})/.exec(
      url,
    );
  if (yt) {
    const id = yt[1];
    return {
      kind: 'youtube',
      // `rel=0` để không gợi ý video của kênh khác ngay sau khi xem xong.
      src: `https://www.youtube-nocookie.com/embed/${id}?rel=0&autoplay=1`,
      poster: `https://i.ytimg.com/vi/${id}/maxresdefault.jpg`,
    };
  }

  const vimeo = /vimeo\.com\/(?:video\/)?(\d+)/.exec(url);
  if (vimeo) {
    return { kind: 'vimeo', src: `https://player.vimeo.com/video/${vimeo[1]}?autoplay=1` };
  }

  if (/^https?:\/\/.+\.(mp4|webm|ogg|mov)(\?.*)?$/i.test(url)) {
    return { kind: 'file', src: url };
  }

  return null;
}

export function IntroVideo({
  url,
  poster,
  title,
  className,
}: {
  url: string;
  poster?: string | null;
  title: string;
  className?: string;
}) {
  const video = useMemo(() => parseVideoUrl(url), [url]);
  const [playing, setPlaying] = useState(false);

  if (!video) {
    return (
      <div
        className={`flex aspect-video items-center justify-center rounded-2xl bg-warm-50 px-6 text-center ring-1 ring-warm-200 ${className ?? ''}`}
      >
        <p className="max-w-sm text-[14px] leading-relaxed text-warm-500">
          Đường dẫn video chưa dùng được. Hãy dán link YouTube, Vimeo hoặc một tệp .mp4.
        </p>
      </div>
    );
  }

  const cover = poster?.trim() || video.poster;

  if (video.kind === 'file') {
    return (
      <video
        className={`aspect-video w-full rounded-2xl bg-warm-100 object-cover ring-1 ring-warm-200 ${className ?? ''}`}
        src={video.src}
        poster={cover ?? undefined}
        controls
        preload="none"
        playsInline
      >
        Trình duyệt của bạn không phát được video này.
      </video>
    );
  }

  if (!playing) {
    return (
      <button
        type="button"
        onClick={() => setPlaying(true)}
        aria-label={`Phát video: ${title}`}
        className={`group relative block aspect-video w-full overflow-hidden rounded-2xl bg-warm-100 ring-1 ring-warm-200 ${className ?? ''}`}
      >
        {cover ? (
          // Ảnh nền lấy từ nhà cung cấp video nên dùng thẻ img thường: next/image
          // đòi khai báo trước tên miền, mà admin có thể dán link từ bất kỳ đâu.
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={cover}
            alt=""
            className="absolute inset-0 h-full w-full object-cover opacity-85 transition-transform duration-500 group-hover:scale-[1.03]"
            loading="lazy"
          />
        ) : null}
        <span className="absolute inset-0 bg-gradient-to-t from-warm-950/70 via-warm-950/10 to-transparent" />
        <span className="absolute inset-0 flex items-center justify-center">
          <span className="flex h-16 w-16 items-center justify-center rounded-full bg-white/95 shadow-[0_10px_30px_-8px_rgb(120_70_45/0.6)] transition-transform duration-300 group-hover:scale-110">
            <svg viewBox="0 0 24 24" className="ml-1 h-7 w-7 fill-warm-900" aria-hidden>
              <path d="M8 5.5v13l11-6.5-11-6.5Z" />
            </svg>
          </span>
        </span>
        <span className="absolute right-4 bottom-4 left-4 text-left text-[14px] font-semibold text-white drop-shadow">
          {title}
        </span>
      </button>
    );
  }

  return (
    <iframe
      className={`aspect-video w-full rounded-2xl bg-warm-100 ring-1 ring-warm-200 ${className ?? ''}`}
      src={video.src}
      title={title}
      allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
      allowFullScreen
    />
  );
}
