import { notFound } from 'next/navigation';
import Link from 'next/link';
import { getProgramByCode } from '@/server/catalog/service';
import { getSession } from '@/lib/auth';
import { routes } from '@/lib/routes';
import { formatVnd, GRADE_BAND_LABEL, SUBJECT_LABEL } from '@/lib/domain';
import { AppShell } from '@/components/shell';
import { Alert, Badge, Card, LinkButton, PageHeader } from '@/components/ui';

export const dynamic = 'force-dynamic';

export default async function ProgramPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const session = await getSession();

  let program;
  try {
    program = await getProgramByCode(code);
  } catch {
    notFound();
  }

  return (
    <AppShell user={session ? { id: session.id, fullName: session.fullName, roles: session.roles } : null}>
      <PageHeader
        title={
          <span className="flex items-center gap-3">
            <span aria-hidden>{program.logoEmoji}</span>
            {program.name}
          </span>
        }
        subtitle={program.description}
      />

      {!program.active ? (
        <Alert tone="warn" className="mb-6" title="Kỳ thi này đang tạm đóng">
          Chương trình chưa mở bán cho mùa hiện tại. Bạn có thể chọn kỳ thi khác ở trang chủ.
        </Alert>
      ) : null}

      {program.highlights.length > 0 ? (
        <Card className="mb-6">
          <ul className="grid gap-2 sm:grid-cols-2">
            {program.highlights.map((highlight) => (
              <li key={highlight} className="flex gap-2 text-sm text-ink-700">
                <span aria-hidden className="text-brand-600">
                  •
                </span>
                {highlight}
              </li>
            ))}
          </ul>
        </Card>
      ) : null}

      <section className="mb-8">
        <h2 className="mb-1 text-lg font-bold text-ink-900">Khối lớp và môn đang mở</h2>
        <p className="mb-4 text-sm text-ink-500">
          Chọn đúng khối và môn bạn dự thi — nội dung ôn luyện bám theo cấu trúc đề của kỳ thi này.
        </p>

        <div className="space-y-5">
          {program.availability.map((band) => {
            const courses = program.courses.filter((course) => course.gradeBand === band.gradeBand);
            return (
              <div key={band.gradeBand}>
                <h3 className="mb-2 text-sm font-semibold tracking-wide text-ink-500 uppercase">
                  {GRADE_BAND_LABEL[band.gradeBand]}
                </h3>
                <div className="grid gap-3 sm:grid-cols-2">
                  {courses.map((course) => (
                    <Card key={course.id} className="flex flex-col justify-between">
                      <div>
                        <h4 className="font-semibold text-ink-900">
                          {SUBJECT_LABEL[course.subject]}
                        </h4>
                        {course.description ? (
                          <p className="mt-1 text-sm text-ink-600">{course.description}</p>
                        ) : null}
                      </div>
                      <div className="mt-4 flex items-center justify-between gap-3">
                        <div>
                          <p className="text-lg font-bold text-ink-900">
                            {formatVnd(course.pricing.price)}
                          </p>
                          <p className="text-xs text-ink-500">
                            Truy cập {course.pricing.accessDurationDays} ngày
                          </p>
                        </div>
                        <LinkButton href={routes.checkout(course.id)} size="sm">
                          Đăng ký học
                        </LinkButton>
                      </div>
                    </Card>
                  ))}
                </div>
              </div>
            );
          })}
        </div>

        {program.courses.length === 0 ? (
          <Card>
            <p className="text-sm text-ink-500">Chưa có khóa nào được mở cho kỳ thi này.</p>
          </Card>
        ) : null}
      </section>

      {program.activeCohort ? (
        <Card className="mb-8">
          <h2 className="font-semibold text-ink-900">Mùa thi {program.activeCohort.year}</h2>
          <p className="mt-1 text-sm text-ink-600">
            Ngày thi dự kiến:{' '}
            <strong>{program.activeCohort.examDate.toLocaleDateString('vi-VN')}</strong>. Hệ thống
            dùng mốc này để dồn trọng tâm ôn luyện khi kỳ thi tới gần.
          </p>
        </Card>
      ) : null}

      <section className="rounded-xl bg-white p-6 ring-1 ring-ink-100">
        <h2 className="text-lg font-bold text-ink-900">Bạn nhận được gì sau khi đăng ký</h2>
        <ol className="mt-4 space-y-3 text-sm text-ink-700">
          <li>
            <strong>Bài kiểm tra đầu vào 15 câu</strong> — chọn theo cấu trúc đề của kỳ thi, không
            phải câu ngẫu nhiên.
          </li>
          <li>
            <strong>Bản đồ năng lực theo từng kỹ năng</strong> — biết chính xác mình hổng chỗ nào.
          </li>
          <li>
            <strong>Lộ trình theo ngày</strong> — vừa với quỹ thời gian bạn khai báo.
          </li>
          <li>
            <strong>Bài kiểm tra tiến bộ mỗi 2 tuần</strong> — đo mức tiến bộ thật bằng câu neo.
          </li>
          <li>
            <strong>Buổi tư vấn 20 phút với giáo viên</strong> — sau mỗi lần kiểm tra tiến bộ.
          </li>
        </ol>

        <div className="mt-6">
          <LinkButton href={session ? routes.myCourses() : routes.register(routes.program(code))}>
            {session ? 'Tới khu vực học tập' : 'Tạo tài khoản để bắt đầu'}
          </LinkButton>
        </div>
      </section>

      <p className="mt-6 text-sm text-ink-500">
        <Link href={routes.home()} className="hover:text-brand-700">
          ← Xem các kỳ thi khác
        </Link>
      </p>
    </AppShell>
  );
}
