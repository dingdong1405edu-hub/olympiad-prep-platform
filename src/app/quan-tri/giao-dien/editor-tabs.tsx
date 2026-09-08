'use client';

/**
 * Hai tab của trang "Giao diện & nội dung": Chữ và Ảnh.
 *
 * Cả hai trình sửa đều được DỰNG SẴN và chỉ ẩn/hiện bằng CSS, chứ không tháo ra
 * lắp lại khi đổi tab. Trình sửa chữ giữ hàng trăm ô đang gõ dở trong state của
 * nó; tháo ra là mất sạch. Người làm nội dung thường sửa chữ, nhảy sang xem lại
 * tấm ảnh, rồi quay về gõ tiếp — nếu lần quay về nào cũng mất bài thì họ sẽ chỉ
 * dám sửa một ô rồi lưu ngay, đúng thói quen mà trình sửa này muốn tránh.
 */
import { useState, type ReactNode } from 'react';
import { cx } from '@/components/ui';

export function EditorTabs({
  copyLabel,
  imageLabel,
  copyPanel,
  imagePanel,
}: {
  copyLabel: string;
  imageLabel: string;
  copyPanel: ReactNode;
  imagePanel: ReactNode;
}) {
  const [tab, setTab] = useState<'copy' | 'image'>('copy');

  const tabs = [
    { id: 'copy' as const, label: copyLabel },
    { id: 'image' as const, label: imageLabel },
  ];

  return (
    <div>
      <div className="mb-5 flex gap-1 border-b border-ink-100" role="tablist">
        {tabs.map((item) => (
          <button
            key={item.id}
            type="button"
            role="tab"
            aria-selected={tab === item.id}
            aria-controls={`panel-${item.id}`}
            onClick={() => setTab(item.id)}
            className={cx(
              '-mb-px border-b-2 px-4 py-2.5 text-sm font-medium transition-colors',
              tab === item.id
                ? 'border-brand-600 text-brand-700'
                : 'border-transparent text-ink-500 hover:text-ink-800',
            )}
          >
            {item.label}
          </button>
        ))}
      </div>

      <div id="panel-copy" role="tabpanel" hidden={tab !== 'copy'}>
        {copyPanel}
      </div>
      <div id="panel-image" role="tabpanel" hidden={tab !== 'image'}>
        {imagePanel}
      </div>
    </div>
  );
}
