import { notFound } from 'next/navigation';
import { getExamForPlayer } from '@/server/mock-exam/service';
import { ApiError } from '@/lib/http';
import { ExamPlayer } from './exam-player';

export const dynamic = 'force-dynamic';

export const metadata = { title: 'Đang làm bài thi thử' };

/**
 * Màn hình làm bài.
 *
 * Đề được lấy Ở MÁY CHỦ rồi truyền thẳng xuống, không để trình duyệt tự gọi API:
 * học sinh mở trang là thấy đề ngay, không có khoảnh khắc màn hình trắng chờ tải
 * — và cũng không có cơ hội đọc đáp án qua tab Network vì service đã bóc sạch.
 */
export default async function MockExamPlayerPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;

  try {
    const exam = await getExamForPlayer(slug);
    return <ExamPlayer exam={exam} />;
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) notFound();
    throw error;
  }
}
