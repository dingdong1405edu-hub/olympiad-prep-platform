/**
 * TOÀN BỘ CHỮ HIỂN THỊ TRÊN CÁC TRANG CÔNG KHAI.
 *
 * Đây là nguồn duy nhất của mọi câu chữ ở khu bán hàng: trang chủ, danh mục kỳ
 * thi, danh mục khóa học, thanh điều hướng và chân trang. Admin sửa được từng
 * dòng trong `/quan-tri/giao-dien` mà KHÔNG cần deploy lại.
 *
 * CÁCH HOẠT ĐỘNG:
 *  - Giá trị mặc định nằm ngay ở file này, trong mã nguồn. Đây là bản gốc.
 *  - Bảng `SiteCopy` chỉ chứa những khóa admin đã sửa. Xóa một dòng ở đó là
 *    quay về đúng bản gốc — không có trạng thái "mất chữ".
 *  - Trang gọi `getCopy()` rồi `t('khóa')`. Khóa lạ trả về chính nó để lỗi
 *    hiện ra ngay khi nhìn, thay vì render ra khoảng trắng im lặng.
 *
 * QUY ƯỚC ĐẶT KHÓA: `<trang>.<khối>.<vai trò>`, các mục lặp lại đánh số từ 1.
 * Ví dụ `home.steps.3.title`. Đánh số giữ cho thứ tự hiển thị luôn rõ ràng khi
 * admin nhìn danh sách trong trang quản trị.
 *
 * THÊM CHỮ MỚI: khai báo ở đây kèm nhãn tiếng Việt dễ hiểu; trang quản trị tự
 * mọc thêm ô nhập, không phải sửa gì bên đó.
 */

export interface CopyField {
  key: string;
  /** Nhãn hiển thị cho admin — viết như đang chỉ vào vị trí trên trang. */
  label: string;
  /** Nội dung gốc. */
  value: string;
  /** true ⇒ dùng ô nhập nhiều dòng trong trang quản trị. */
  multiline?: boolean;
  /** Giải thích thêm khi nhãn chưa đủ rõ. */
  hint?: string;
}

export interface CopyGroup {
  key: string;
  label: string;
  description: string;
  fields: CopyField[];
}

/** Rút gọn khai báo một ô chữ. */
function f(key: string, label: string, value: string, opts: Partial<CopyField> = {}): CopyField {
  return { key, label, value, ...opts };
}

/** Sinh nhanh danh sách mục lặp lại có đánh số (bước, câu hỏi, số liệu…). */
function repeat<T extends Record<string, string>>(
  prefix: string,
  items: T[],
  labels: Record<keyof T, string>,
  multiline: (keyof T)[] = [],
): CopyField[] {
  const out: CopyField[] = [];
  items.forEach((item, index) => {
    const n = index + 1;
    for (const name of Object.keys(item) as (keyof T)[]) {
      out.push(
        f(`${prefix}.${n}.${String(name)}`, `${n}. ${labels[name]}`, item[name], {
          multiline: multiline.includes(name),
        }),
      );
    }
  });
  return out;
}

// ---------------------------------------------------------------------------
// NHÓM 1 — Thanh điều hướng và chân trang
// ---------------------------------------------------------------------------

const NAV_GROUP: CopyGroup = {
  key: 'nav',
  label: 'Thanh điều hướng & chân trang',
  description: 'Chữ trên thanh menu trên cùng và phần chân của mọi trang bán hàng.',
  fields: [
    f('nav.brand.name', 'Tên thương hiệu', 'Olympiad Prep'),
    f('nav.brand.tagline', 'Dòng phụ dưới tên thương hiệu', 'Ôn luyện cá nhân hóa'),
    f('nav.link.programs', 'Menu — Kỳ thi', 'Kỳ thi'),
    f('nav.link.courses', 'Menu — Khóa học', 'Khóa học'),
    f('nav.link.mock', 'Menu — Thi thử', 'Thi thử'),
    f('nav.link.how', 'Menu — Cách hoạt động', 'Cách hoạt động'),
    f('nav.link.parents', 'Menu — Cho phụ huynh', 'Cho phụ huynh'),
    f('nav.link.faq', 'Menu — Câu hỏi', 'Câu hỏi'),
    f('nav.cta.signedIn', 'Nút khi đã đăng nhập', 'Vào khu học tập'),
    f('nav.cta.login', 'Nút đăng nhập', 'Đăng nhập'),
    f('nav.cta.register', 'Nút đăng ký', 'Kiểm tra miễn phí'),
    f(
      'footer.tagline',
      'Câu giới thiệu ở chân trang',
      'Ôn luyện cá nhân hóa cho ASMOPSS, NEO, STEM và FMC. Mỗi học sinh một lộ trình, tính lại sau mỗi bài làm.',
      { multiline: true },
    ),
    f('footer.column.explore', 'Tiêu đề cột liên kết', 'Khám phá'),
    f('footer.link.register', 'Liên kết tạo tài khoản', 'Tạo tài khoản'),
    f('footer.column.promise', 'Tiêu đề cột cam kết', 'Cam kết với phụ huynh'),
    f('footer.promise.1', 'Cam kết 1', 'Chỉ thu thập dữ liệu cần cho việc học.'),
    f('footer.promise.2', 'Cam kết 2', 'Không dùng dữ liệu học sinh cho mục đích khác.'),
    f('footer.promise.3', 'Cam kết 3', 'Câu hỏi do đội chuyên môn biên soạn và kiểm duyệt.'),
    f('footer.promise.4', 'Cam kết 4', 'AI không tự ra đề, chỉ chọn bài và giải thích.'),
    f(
      'footer.copyright',
      'Dòng bản quyền',
      'Olympiad Prep. Nền tảng ôn luyện Olympic cá nhân hóa.',
      { hint: 'Năm hiện tại được thêm tự động ở phía trước.' },
    ),
    f('footer.season', 'Dòng bên phải chân trang', 'Đang nhận học sinh cho mùa thi', {
      hint: 'Năm kế tiếp được thêm tự động ở phía sau.',
    }),
  ],
};

// ---------------------------------------------------------------------------
// NHÓM 2 — Trang chủ: phần đầu
// ---------------------------------------------------------------------------

const HOME_HERO_GROUP: CopyGroup = {
  key: 'home.hero',
  label: 'Trang chủ — Màn hình đầu tiên',
  description:
    'Phần khách nhìn thấy ngay khi vào trang. Quyết định phần lớn việc họ có đọc tiếp hay không.',
  fields: [
    f('home.hero.badge', 'Nhãn nhỏ phía trên tiêu đề', 'Ôn luyện vòng quốc gia'),
    f('home.hero.title.before', 'Tiêu đề — phần đầu', 'Con bạn đang yếu'),
    f('home.hero.title.highlight', 'Tiêu đề — chữ được gạch chân vàng', 'chính xác'),
    f('home.hero.title.after', 'Tiêu đề — phần cuối', 'chỗ nào?'),
    f(
      'home.hero.subtitle',
      'Đoạn mô tả dưới tiêu đề',
      'Hầu hết học sinh ôn Olympic đều học chăm. Cái thiếu không phải thời gian, mà là biết chắc nên dồn thời gian đó vào đâu. Hệ thống đo năng lực theo từng kỹ năng nhỏ, tìm ra lỗ hổng thật và giao đúng bài cần học hôm nay.',
      { multiline: true },
    ),
    f('home.hero.cta.guest', 'Nút chính — khách chưa đăng nhập', 'Kiểm tra đầu vào miễn phí'),
    f('home.hero.cta.member', 'Nút chính — người đã đăng nhập', 'Vào khu học tập'),
    f('home.hero.cta.secondary', 'Nút phụ', 'Xem cách hoạt động'),
    f(
      'home.hero.note',
      'Dòng trấn an dưới hai nút',
      'Không cần thẻ thanh toán · Xong bài là có ngay bản đồ kỹ năng',
    ),
  ],
};

const HOME_STATS_GROUP: CopyGroup = {
  key: 'home.stats',
  label: 'Trang chủ — Dải số liệu',
  description: 'Bốn con số trên nền xanh đậm ngay dưới màn hình đầu tiên.',
  fields: repeat(
    'home.stats',
    [
      { value: '186', label: 'kỹ năng được đo riêng', hint: 'không phải 4 môn chung chung' },
      { value: '15', label: 'câu ở bài đầu vào', hint: 'bám cấu trúc đề thật' },
      { value: '14', label: 'ngày một chu kỳ đo', hint: 'có câu neo để so sánh' },
      { value: '20', label: 'phút tư vấn cùng giáo viên', hint: 'sau mỗi lần đo' },
    ],
    { value: 'Con số', label: 'Nhãn', hint: 'Ghi chú nhỏ' },
  ),
};

// ---------------------------------------------------------------------------
// NHÓM 3 — Trang chủ: vấn đề
// ---------------------------------------------------------------------------

const HOME_PROBLEM_GROUP: CopyGroup = {
  key: 'home.problem',
  label: 'Trang chủ — Vấn đề đang giải',
  description: 'Khối so sánh "kho đề thông thường" với "nền tảng này".',
  fields: [
    f(
      'home.problem.title',
      'Tiêu đề',
      'Học thêm 2 tiếng mỗi ngày không bằng học đúng 30 phút',
    ),
    f(
      'home.problem.body1',
      'Đoạn văn thứ nhất',
      'Một học sinh làm 200 bài phân số mà không ai chỉ ra em đang nhầm ở bước quy đồng thì 200 bài đó chỉ củng cố cái sai. Vấn đề của việc ôn thi không nằm ở khối lượng — nó nằm ở chỗ không ai đủ thời gian ngồi soi từng em xem lỗ hổng thật nằm ở đâu.',
      { multiline: true },
    ),
    f(
      'home.problem.body2',
      'Đoạn văn thứ hai',
      'Đó chính xác là việc mà một hệ thống làm tốt hơn con người: nhớ từng câu, từng lỗi, từng giây do dự của từng học sinh, rồi rút ra kết luận.',
      { multiline: true },
    ),
    f('home.problem.old.title', 'Tiêu đề cột trái', 'Kho đề thông thường'),
    f('home.problem.old.1', 'Cột trái — gạch đầu dòng 1', 'Mọi học sinh thấy cùng một danh sách bài.'),
    f('home.problem.old.2', 'Cột trái — gạch đầu dòng 2', 'Gia đình tự đoán con yếu chỗ nào.'),
    f(
      'home.problem.old.3',
      'Cột trái — gạch đầu dòng 3',
      'Làm nhiều bài dễ vẫn thấy điểm cao, lỗ hổng còn nguyên.',
    ),
    f('home.problem.old.4', 'Cột trái — gạch đầu dòng 4', 'Không có cách nào biết con tiến bộ bao nhiêu.'),
    f('home.problem.new.title', 'Tiêu đề cột phải', 'Nền tảng này'),
    f(
      'home.problem.new.1',
      'Cột phải — gạch đầu dòng 1',
      'Hồ sơ năng lực theo từng kỹ năng nhỏ, cập nhật sau mỗi câu.',
    ),
    f('home.problem.new.2', 'Cột phải — gạch đầu dòng 2', 'Bài được giao đúng chỗ yếu, kèm lý do cụ thể.'),
    f('home.problem.new.3', 'Cột phải — gạch đầu dòng 3', 'Độ khó tự nâng khi con vững, tự hạ khi con đuối.'),
    f(
      'home.problem.new.4',
      'Cột phải — gạch đầu dòng 4',
      'Đo tiến bộ bằng câu neo mỗi 14 ngày, có giáo viên xác nhận.',
    ),
  ],
};

// ---------------------------------------------------------------------------
// NHÓM 4 — Trang chủ: danh sách kỳ thi
// ---------------------------------------------------------------------------

const HOME_PROGRAMS_GROUP: CopyGroup = {
  key: 'home.programs',
  label: 'Trang chủ — Khối chọn kỳ thi',
  description: 'Phần dẫn cho danh sách kỳ thi. Bản thân các thẻ kỳ thi lấy từ mục Chương trình.',
  fields: [
    f('home.programs.title', 'Tiêu đề', 'Chọn kỳ thi của con'),
    f(
      'home.programs.subtitle',
      'Mô tả',
      'Mỗi kỳ thi có cấu trúc đề riêng, thang điểm riêng và kiểu tư duy riêng. Hệ thống ra bài bám đúng cấu trúc đó chứ không dùng chung một kho cho tất cả.',
      { multiline: true },
    ),
    f('home.programs.empty.title', 'Khi chưa có kỳ thi nào', 'Chưa có kỳ thi nào đang mở'),
    f(
      'home.programs.empty.body',
      'Khi chưa có kỳ thi nào — mô tả',
      'Nếu bạn là quản trị viên, hãy nạp dữ liệu mẫu hoặc tạo chương trình trong khu vực quản trị.',
      { multiline: true },
    ),
  ],
};

// ---------------------------------------------------------------------------
// NHÓM 5 — Trang chủ: cách hoạt động
// ---------------------------------------------------------------------------

const HOME_STEPS_GROUP: CopyGroup = {
  key: 'home.steps',
  label: 'Trang chủ — Cách hoạt động',
  description: 'Sáu bước của chu trình học, hiển thị trên nền xanh đậm.',
  fields: [
    f('home.steps.title', 'Tiêu đề khối', 'Một chu trình khép kín, lặp tới ngày thi'),
    f(
      'home.steps.subtitle',
      'Mô tả khối',
      'Không có bước nào là hộp đen. Ở mỗi bước, gia đình đều thấy hệ thống đang kết luận gì về con mình và dựa trên dữ liệu nào.',
      { multiline: true },
    ),
    ...repeat(
      'home.steps',
      [
        {
          title: 'Làm bài kiểm tra đầu vào',
          body: '15 câu chọn theo đúng cấu trúc đề của kỳ thi con bạn nhắm tới — không phải 15 câu ngẫu nhiên lấy từ kho chung.',
        },
        {
          title: 'Hệ thống chỉ ra chỗ hổng',
          body: 'Chấm theo độ khó, chủ đề và cả tốc độ làm bài. Hai học sinh cùng 10/15 nhưng sai khác nhau sẽ nhận hai lộ trình khác nhau.',
        },
        {
          title: 'Gia đình tự chọn mục tiêu',
          body: 'Khai thật con học được mấy ngày một tuần, mỗi ngày bao nhiêu phút. Hệ thống tính ngược xem mục tiêu đó có khả thi không và nói thẳng nếu không.',
        },
        {
          title: 'Học đúng bài mình cần',
          body: 'Mỗi ngày một danh sách ngắn: vá lỗ hổng, củng cố, thử thách vừa sức. Bài nào cũng kèm câu trả lời cho "vì sao con phải làm bài này".',
        },
        {
          title: 'Đo lại sau mỗi 14 ngày',
          body: 'Bài kiểm tra tiến bộ có câu neo để so với lần trước — đo mức tiến bộ thật, không phải đếm số bài đã làm.',
        },
        {
          title: 'Giáo viên tư vấn 20 phút',
          body: 'Thầy cô đọc báo cáo trước buổi, trao đổi đúng vấn đề đang vướng, rồi cùng gia đình chỉnh lộ trình cho 2 tuần kế tiếp.',
        },
      ],
      { title: 'Tên bước', body: 'Mô tả bước' },
      ['body'],
    ),
  ],
};

// ---------------------------------------------------------------------------
// NHÓM 6 — Trang chủ: ba tính năng có hình minh họa
// ---------------------------------------------------------------------------

const HOME_FEATURES_GROUP: CopyGroup = {
  key: 'home.features',
  label: 'Trang chủ — Ba tính năng chính',
  description: 'Ba khối xen kẽ trái phải, mỗi khối kèm một hình minh họa sản phẩm.',
  fields: [
    f('home.features.title', 'Tiêu đề khối', 'Đây là những gì con bạn thật sự nhìn thấy'),

    f('home.features.1.eyebrow', '1. Nhãn nhỏ', 'Mỗi ngày'),
    f('home.features.1.title', '1. Tiêu đề', 'Một danh sách ngắn, và lý do cho từng bài'),
    f(
      'home.features.1.body1',
      '1. Đoạn văn thứ nhất',
      'Không phải một kho bài để con tự bơi. Mỗi ngày là ba tới năm việc, xếp theo thứ tự: vá chỗ hổng nặng nhất trước, rồi củng cố, rồi mới tới thử thách.',
      { multiline: true },
    ),
    f(
      'home.features.1.body2',
      '1. Đoạn văn thứ hai',
      'Bài nào cũng bấm được nút “vì sao bài này” để xem hệ thống đang dựa vào dữ liệu nào mà giao. Con hiểu mình đang sửa cái gì thì mới chịu ngồi làm.',
      { multiline: true },
    ),

    f('home.features.2.eyebrow', '2. Nhãn nhỏ', 'Theo thời gian thực'),
    f('home.features.2.title', '2. Tiêu đề', 'Độ khó bám sát con, không bám sát giáo án'),
    f(
      'home.features.2.body1',
      '2. Đoạn văn thứ nhất',
      'Ba câu đúng liên tiếp là nâng một bậc. Hai câu sai liên tiếp là hạ xuống và quay lại nền. Con luôn ở vùng vừa đủ khó để phải nghĩ, nhưng chưa đủ khó để bỏ cuộc.',
      { multiline: true },
    ),
    f(
      'home.features.2.body2',
      '2. Đoạn văn thứ hai',
      'Đây là chỗ lớp học đông không làm được: một giáo viên không thể chỉnh độ khó riêng cho ba mươi em cùng lúc, sau từng câu.',
      { multiline: true },
    ),

    f('home.features.3.eyebrow', '3. Nhãn nhỏ', 'Mỗi 14 ngày'),
    f('home.features.3.title', '3. Tiêu đề', 'Tiến bộ đo bằng câu neo, không đếm số bài'),
    f(
      'home.features.3.body1',
      '3. Đoạn văn thứ nhất',
      '“Con làm được 300 bài rồi” không nói lên điều gì. Bài kiểm tra tiến bộ dùng câu neo — những câu có cùng độ khó với lần đo trước — nên con số tăng lên là tăng thật, không phải do đề lần này dễ hơn.',
      { multiline: true },
    ),
    f(
      'home.features.3.body2',
      '3. Đoạn văn thứ hai',
      'Đường tiến bộ có lúc chững lại, và hệ thống không giấu điều đó. Một biểu đồ chỉ biết đi lên là một biểu đồ không đáng tin.',
      { multiline: true },
    ),
  ],
};

// ---------------------------------------------------------------------------
// NHÓM 7 — Trang chủ: cho phụ huynh
// ---------------------------------------------------------------------------

const HOME_PARENTS_GROUP: CopyGroup = {
  key: 'home.parents',
  label: 'Trang chủ — Cho phụ huynh',
  description: 'Khối thuyết phục người trả tiền, khác với khối thuyết phục người học.',
  fields: [
    f('home.parents.title', 'Tiêu đề', 'Phụ huynh biết chính xác mình đang trả tiền cho cái gì'),
    f(
      'home.parents.body',
      'Đoạn mở đầu',
      'Nỗi khổ lớn nhất khi đầu tư cho con học thêm là không có cách nào biết nó có tác dụng hay không, cho tới lúc thi xong thì đã muộn. Ở đây, sau mỗi 14 ngày gia đình nhận một báo cáo bằng số, kèm phần diễn giải bằng lời cho người không chuyên môn.',
      { multiline: true },
    ),
    ...repeat(
      'home.parents.item',
      [
        {
          title: 'Mastery từng mảng tăng bao nhiêu',
          detail: 'So với chính con 14 ngày trước, không so với bạn cùng lớp.',
        },
        {
          title: 'Lỗi nào đã sửa được, lỗi nào còn lặp',
          detail: 'Gọi tên cụ thể chứ không phải “cần cố gắng thêm”.',
        },
        {
          title: 'Thời gian học thật so với cam kết',
          detail: 'Biết con có ngồi vào bàn thật hay không.',
        },
        {
          title: 'Mục tiêu còn khả thi không',
          detail: 'Nếu không kịp, hệ thống nói sớm để còn điều chỉnh.',
        },
      ],
      { title: 'Tiêu đề', detail: 'Diễn giải' },
    ),
    f('home.parents.session.title', 'Thẻ buổi tư vấn — nhãn', 'Buổi tư vấn 20 phút'),
    f(
      'home.parents.session.body',
      'Thẻ buổi tư vấn — nội dung',
      'Sau mỗi lần đo, giáo viên đọc trước toàn bộ hồ sơ rồi mới vào buổi. Không mất mười phút đầu để hỏi lại “dạo này cháu học thế nào” — đi thẳng vào chỗ đang vướng và chốt điều chỉnh cho hai tuần tới.',
      { multiline: true },
    ),
  ],
};

// ---------------------------------------------------------------------------
// NHÓM 8 — Trang chủ: câu hỏi thường gặp và lời kêu gọi cuối
// ---------------------------------------------------------------------------

const HOME_FAQ_GROUP: CopyGroup = {
  key: 'home.faq',
  label: 'Trang chủ — Câu hỏi thường gặp',
  description: 'Sáu cặp hỏi đáp ở gần cuối trang chủ.',
  fields: [
    f('home.faq.title', 'Tiêu đề khối', 'Câu hỏi thường gặp'),
    f(
      'home.faq.subtitle',
      'Mô tả khối',
      'Còn thắc mắc khác? Tạo tài khoản và làm thử bài đầu vào — mất khoảng 20 phút và không cần thanh toán.',
      { multiline: true },
    ),
    ...repeat(
      'home.faq',
      [
        {
          question: 'Khác gì so với các kho đề luyện thi khác?',
          answer:
            'Kho đề bán cho bạn quyền tự chọn bài trong một kho chung — việc chọn đúng bài vẫn là của bạn. Ở đây, hệ thống giữ một hồ sơ năng lực riêng cho từng học sinh theo từng kỹ năng nhỏ, và tự quyết định hôm nay em nên làm bài nào, ở mức khó nào, bao nhiêu câu.',
        },
        {
          question: 'AI có tự ra đề không?',
          answer:
            'Không. Toàn bộ câu hỏi do đội chuyên môn biên soạn và qua kiểm duyệt trước khi vào kho. AI chỉ đọc dữ liệu làm bài của học sinh để chọn câu phù hợp và diễn giải lại lời giải đã được duyệt cho dễ hiểu hơn.',
        },
        {
          question: 'Một bài 15 câu có đủ để đánh giá con tôi không?',
          answer:
            'Không, và hệ thống cũng không coi đó là kết luận cuối cùng. Đó là mốc khởi đầu để có cái mà bắt đầu. Hồ sơ năng lực được cập nhật sau mỗi câu con làm, và được đo lại chính thức bằng câu neo sau mỗi 14 ngày.',
        },
        {
          question: 'Nếu con học không kịp theo kế hoạch?',
          answer:
            'Hệ thống tự dàn lại lịch và nói rõ phần nào bị lùi, thay vì để kế hoạch dồn thành một đống nợ khiến con nản. Gia đình cũng có thể đổi mục tiêu bất cứ lúc nào — hệ thống sẽ tính lại khối lượng cho phù hợp.',
        },
        {
          question: 'Phụ huynh theo dõi được không?',
          answer:
            'Được. Sau mỗi chu kỳ 14 ngày đều có báo cáo bằng số liệu cụ thể: mastery từng mảng kiến thức tăng bao nhiêu, tốc độ làm bài cải thiện thế nào, lỗi nào đã sửa được và lỗi nào còn lặp lại.',
        },
        {
          question: 'Con tôi mất gốc, có theo được không?',
          answer:
            'Đây chính là trường hợp hệ thống làm tốt nhất. Bài kiểm tra đầu vào sẽ tìm ra đúng tầng kiến thức bị hổng, kể cả khi nó nằm ở lớp dưới, rồi dựng lại từ đó lên. Độ khó sẽ hạ xuống mức con làm được trước khi nâng dần.',
        },
      ],
      { question: 'Câu hỏi', answer: 'Câu trả lời' },
      ['answer'],
    ),
  ],
};

const HOME_CTA_GROUP: CopyGroup = {
  key: 'home.cta',
  label: 'Trang chủ — Lời kêu gọi cuối trang',
  description: 'Khối màu xanh đậm ở cuối trang chủ, chốt hành động.',
  fields: [
    f('home.cta.title', 'Tiêu đề', 'Bắt đầu bằng bài kiểm tra đầu vào 15 câu'),
    f(
      'home.cta.body',
      'Mô tả',
      'Mất khoảng 20 phút. Xong bài, bạn thấy ngay bản đồ kỹ năng của con: mạnh ở đâu, hổng ở đâu, và nên sửa theo thứ tự nào.',
      { multiline: true },
    ),
    f('home.cta.primary.guest', 'Nút chính — khách', 'Làm bài kiểm tra miễn phí'),
    f('home.cta.primary.member', 'Nút chính — đã đăng nhập', 'Tiếp tục học'),
    f('home.cta.secondary', 'Nút phụ', 'Đã có tài khoản'),
    f(
      'home.cta.note',
      'Dòng trấn an cuối',
      'Không cần thẻ thanh toán · Dữ liệu học tập của con thuộc về gia đình',
    ),
  ],
};

// ---------------------------------------------------------------------------
// NHÓM 9 — Trang danh mục kỳ thi và khóa học
// ---------------------------------------------------------------------------

const CATALOG_GROUP: CopyGroup = {
  key: 'catalog',
  label: 'Trang danh mục kỳ thi & khóa học',
  description: 'Chữ trên hai trang /ky-thi và /khoa-hoc.',
  fields: [
    f('programs.eyebrow', 'Kỳ thi — nhãn nhỏ', 'Danh mục kỳ thi'),
    f(
      'programs.title',
      'Kỳ thi — tiêu đề',
      'Chọn đúng kỳ thi trước, rồi mới nói chuyện ôn luyện',
    ),
    f(
      'programs.subtitle',
      'Kỳ thi — mô tả',
      'Mỗi kỳ thi có cấu trúc đề, thang điểm và kiểu tư duy riêng. Hệ thống ra bài bám đúng cấu trúc của kỳ thi bạn chọn chứ không dùng chung một kho câu hỏi cho tất cả.',
      { multiline: true },
    ),
    f('programs.stat.programs', 'Kỳ thi — nhãn số liệu 1', 'Kỳ thi đang mở'),
    f('programs.stat.courses', 'Kỳ thi — nhãn số liệu 2', 'Khóa học'),
    f('programs.stat.subjects', 'Kỳ thi — nhãn số liệu 3', 'Môn học'),
    f('programs.empty.title', 'Kỳ thi — khi trống', 'Chưa có kỳ thi nào đang mở'),
    f(
      'programs.empty.body',
      'Kỳ thi — khi trống, mô tả',
      'Danh mục kỳ thi được nạp từ khu vực quản trị. Nếu bạn là quản trị viên, hãy nạp dữ liệu mẫu hoặc tạo chương trình mới rồi quay lại trang này.',
      { multiline: true },
    ),
    f('programs.card.courses', 'Kỳ thi — nhãn khối khóa học', 'Khóa đang mở'),
    f('programs.card.cta', 'Kỳ thi — nút xem chi tiết', 'Xem chi tiết kỳ thi'),

    f('courses.eyebrow', 'Khóa học — nhãn nhỏ', 'Danh mục khóa học'),
    f('courses.title', 'Khóa học — tiêu đề', 'Tất cả khóa đang mở'),
    f(
      'courses.subtitle',
      'Khóa học — mô tả',
      'Mỗi khóa gắn với một kỳ thi, một khối lớp và một môn. Chọn đúng ba thứ đó là hệ thống có đủ dữ liệu để đo năng lực và ra bài cho con.',
      { multiline: true },
    ),
    f('courses.filter.program', 'Khóa học — nhãn lọc kỳ thi', 'Kỳ thi'),
    f('courses.filter.band', 'Khóa học — nhãn lọc khối', 'Khối lớp'),
    f('courses.filter.subject', 'Khóa học — nhãn lọc môn', 'Môn học'),
    f('courses.filter.clear', 'Khóa học — nút bỏ lọc', 'Bỏ lọc'),
    f('courses.empty.title', 'Khóa học — khi trống', 'Chưa có khóa học nào đang mở'),
    f('courses.empty.filtered', 'Khóa học — khi lọc không ra gì', 'Không có khóa nào khớp bộ lọc'),
    f(
      'courses.empty.body',
      'Khóa học — khi trống, mô tả',
      'Danh mục được nạp từ khu vực quản trị. Nếu bạn là quản trị viên, hãy nạp dữ liệu mẫu rồi quay lại.',
      { multiline: true },
    ),
    f(
      'courses.empty.filteredBody',
      'Khóa học — khi lọc không ra gì, mô tả',
      'Thử bỏ bớt một tiêu chí — không phải kỳ thi nào cũng mở đủ mọi môn ở mọi khối.',
      { multiline: true },
    ),
    f('courses.card.cta', 'Khóa học — nút trên thẻ', 'Đăng ký'),
    f('courses.card.price', 'Khóa học — nhãn giá', 'Học phí'),
  ],
};

// ---------------------------------------------------------------------------
// NHÓM 10 — Trang chi tiết một kỳ thi
// ---------------------------------------------------------------------------

const PROGRAM_PAGE_GROUP: CopyGroup = {
  key: 'program',
  label: 'Trang chi tiết kỳ thi',
  description:
    'Chữ khung của trang /ky-thi/<mã>. Phần giới thiệu và video riêng của từng kỳ thi nằm ở mục Chương trình.',
  fields: [
    f('program.back', 'Liên kết quay lại', 'Tất cả kỳ thi'),
    f('program.price.label', 'Nhãn giá', 'Học phí từ'),
    f('program.cta.guest', 'Nút chính — khách', 'Làm bài kiểm tra đầu vào'),
    f('program.cta.member', 'Nút chính — đã đăng nhập', 'Vào khu học tập'),
    f('program.video.title', 'Tiêu đề khối video', 'Xem qua một phút'),
    f(
      'program.video.subtitle',
      'Mô tả khối video',
      'Video giới thiệu cách kỳ thi này được ôn luyện trên nền tảng.',
      { multiline: true },
    ),
    f('program.deliverables.title', 'Tiêu đề khối "gồm những gì"', 'Đăng ký rồi con nhận được gì'),
    ...repeat(
      'program.deliverables',
      [
        {
          title: 'Bài kiểm tra đầu vào 15 câu',
          detail:
            'Chọn theo cấu trúc đề của chính kỳ thi này, không phải câu ngẫu nhiên lấy từ kho chung.',
        },
        {
          title: 'Bản đồ năng lực theo từng kỹ năng',
          detail: 'Biết chính xác con hổng chỗ nào, ở mức nào, thay vì một điểm số chung chung.',
        },
        {
          title: 'Lộ trình theo ngày',
          detail:
            'Vừa với quỹ thời gian gia đình khai báo. Học không kịp thì hệ thống tự dàn lại lịch.',
        },
        {
          title: 'Bài kiểm tra tiến bộ mỗi 14 ngày',
          detail: 'Đo mức tiến bộ thật bằng câu neo, so với chính con ở chu kỳ trước.',
        },
        {
          title: 'Buổi tư vấn 20 phút với giáo viên',
          detail: 'Sau mỗi lần đo. Thầy cô đọc hồ sơ trước, vào buổi là đi thẳng vào chỗ đang vướng.',
        },
      ],
      { title: 'Tên mục', detail: 'Diễn giải' },
      ['detail'],
    ),
    f('program.courses.title', 'Tiêu đề khối khóa học', 'Chọn khối lớp và môn'),
    f(
      'program.courses.subtitle',
      'Mô tả khối khóa học',
      'Mỗi khóa là một môn ở một khối lớp. Đăng ký khóa nào thì con làm bài đầu vào của khóa đó.',
      { multiline: true },
    ),
    f('program.faq.title', 'Tiêu đề khối hỏi đáp riêng', 'Hỏi đáp về kỳ thi này'),
  ],
};

// ---------------------------------------------------------------------------
// NHÓM 11 — Trang chi tiết khóa học
// ---------------------------------------------------------------------------

const COURSE_PAGE_GROUP: CopyGroup = {
  key: 'course',
  label: 'Trang chi tiết khóa học',
  description:
    'Chữ khung của trang giới thiệu một khóa. Nội dung riêng từng khóa nằm ở mục Chương trình.',
  fields: [
    f('course.back', 'Liên kết quay lại', 'Tất cả khóa học'),
    f('course.video.title', 'Tiêu đề khối video', 'Video giới thiệu khóa học'),
    f('course.outcomes.title', 'Tiêu đề khối kết quả', 'Học xong con làm được gì'),
    f('course.syllabus.title', 'Tiêu đề khối nội dung', 'Nội dung khóa học'),
    f('course.cta.title', 'Tiêu đề khối chốt đơn', 'Bắt đầu với bài kiểm tra đầu vào'),
    f(
      'course.cta.body',
      'Mô tả khối chốt đơn',
      'Đăng ký xong là con làm được ngay bài đầu vào của khóa này, và có bản đồ kỹ năng trong khoảng 20 phút.',
      { multiline: true },
    ),
    f('course.cta.button', 'Nút đăng ký', 'Đăng ký khóa này'),
    f('course.price.label', 'Nhãn giá', 'Học phí'),
    f('course.access.label', 'Nhãn thời hạn', 'Thời hạn truy cập'),
    f('course.empty.intro', 'Khi khóa chưa có bài giới thiệu', 'Khóa học này chưa có bài giới thiệu chi tiết.'),
  ],
};

// ---------------------------------------------------------------------------
// Tổng hợp
// ---------------------------------------------------------------------------

export const COPY_GROUPS: CopyGroup[] = [
  NAV_GROUP,
  HOME_HERO_GROUP,
  HOME_STATS_GROUP,
  HOME_PROBLEM_GROUP,
  HOME_PROGRAMS_GROUP,
  HOME_STEPS_GROUP,
  HOME_FEATURES_GROUP,
  HOME_PARENTS_GROUP,
  HOME_FAQ_GROUP,
  HOME_CTA_GROUP,
  CATALOG_GROUP,
  PROGRAM_PAGE_GROUP,
  COURSE_PAGE_GROUP,
];

/** Bản đồ khóa → nội dung gốc, dựng từ chính khai báo ở trên. */
export const SITE_COPY_DEFAULTS: Record<string, string> = Object.fromEntries(
  COPY_GROUPS.flatMap((group) => group.fields.map((field) => [field.key, field.value])),
);

/** Bản đồ khóa → mô tả ô nhập, dùng cho trang quản trị và để kiểm tra khóa hợp lệ. */
export const COPY_FIELD_BY_KEY: Record<string, CopyField> = Object.fromEntries(
  COPY_GROUPS.flatMap((group) => group.fields.map((field) => [field.key, field])),
);

export type CopyKey = string;
