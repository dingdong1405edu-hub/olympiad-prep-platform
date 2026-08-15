import { handle, ok } from '@/lib/http';
import { listPublishedExams } from '@/server/mock-exam/service';

export const dynamic = 'force-dynamic';

/** Danh sách đề thi thử đã phát hành. Công khai — không cần đăng nhập. */
export const GET = handle(async () => ok(await listPublishedExams()));
