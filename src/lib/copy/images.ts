/**
 * TOÀN BỘ Ô ẢNH CÓ THỂ THAY TRÊN CÁC TRANG CÔNG KHAI.
 *
 * File này là bản song song của `defaults.ts`, cùng một triết lý: danh sách ô
 * nằm trong mã nguồn, bảng `SiteAsset` chỉ chứa những ô admin ĐÃ tải ảnh lên.
 * Gỡ ảnh = xóa dòng = quay về hình mặc định, không cần ai nhớ ảnh cũ là gì.
 *
 * KHÁC BIỆT QUAN TRỌNG SO VỚI CHỮ: mọi ô ở đây đều TÙY CHỌN.
 * Chữ luôn có bản gốc trong mã nguồn nên trang không bao giờ trống. Ảnh thì
 * không — bản gốc là "không có ảnh". Vì vậy mỗi ô phải khai báo `fallback`:
 * trang làm gì khi chưa ai tải ảnh lên.
 *
 *   'hidden'   ⇒ ẩn hẳn khối đó, bố cục khép lại như chưa từng có
 *   'visual'   ⇒ giữ hình vẽ SVG đang dùng hôm nay
 *   'gradient' ⇒ giữ nền chuyển màu đang dùng hôm nay
 *
 * Nhờ vậy trang chạy đúng như bây giờ khi database chưa có ảnh nào, và mỗi ảnh
 * admin tải lên là một cải thiện cộng thêm chứ không phải một chỗ có thể vỡ.
 *
 * ALT TEXT KHÔNG NẰM Ở ĐÂY. Nó là chữ, nên sống trong kho chữ như mọi câu khác
 * (khóa `<slot>.alt`, xem `IMAGE_ALT_GROUP` trong `defaults.ts`). Admin sửa alt
 * bằng đúng ô nhập và đúng nút "về bản gốc" đã quen.
 */

/** Trang làm gì khi ô ảnh còn trống. */
export type ImageFallback = 'hidden' | 'visual' | 'gradient';

export interface ImageSlot {
  /** Khóa, cũng là khóa chính trong bảng `SiteAsset`. */
  key: string;
  /** Nhãn cho admin — viết như đang chỉ tay vào vị trí trên trang. */
  label: string;
  /** Vì sao có ô này và ảnh nên chụp gì. */
  hint: string;
  /** Tỉ lệ khuyến nghị dạng `rộng / cao`, dùng cho khung xem trước. */
  aspect: string;
  /** Kích thước gợi ý, hiện nguyên văn cho admin. */
  recommended: string;
  fallback: ImageFallback;
  /** Mô tả điều xảy ra khi ô trống, hiện ngay dưới khung xem trước. */
  fallbackNote: string;
  /** Alt mặc định. Rỗng ⇒ ảnh thuần trang trí, để `alt=""` cho trình đọc màn hình bỏ qua. */
  defaultAlt: string;
}

export interface ImageGroup {
  key: string;
  label: string;
  description: string;
  slots: ImageSlot[];
}

export const SITE_IMAGE_GROUPS: ImageGroup[] = [
  {
    key: 'brand',
    label: 'Thương hiệu & chia sẻ',
    description:
      'Logo trên thanh menu và ảnh hiện lên khi ai đó dán link trang chủ vào Facebook, Zalo hay Messenger.',
    slots: [
      {
        key: 'nav.brand.logo',
        label: 'Logo trên thanh menu',
        hint: 'Thay khiên huy chương vẽ sẵn. Nên là ảnh PNG hoặc WEBP nền trong suốt, hình vuông.',
        aspect: '1 / 1',
        recommended: '256×256',
        fallback: 'visual',
        fallbackNote: 'Chưa tải thì giữ khiên huy chương vẽ sẵn như hiện nay.',
        defaultAlt: '',
      },
      {
        key: 'site.og.image',
        label: 'Ảnh khi chia sẻ link',
        hint: 'Ảnh hiện kèm link khi dán lên mạng xã hội. Nên có tên thương hiệu in trên ảnh vì chữ mô tả thường bị cắt.',
        aspect: '1200 / 630',
        recommended: '1200×630',
        fallback: 'hidden',
        fallbackNote: 'Chưa tải thì link chia sẻ chỉ hiện tiêu đề và mô tả, không có ảnh.',
        defaultAlt: '',
      },
    ],
  },

  {
    key: 'home.hero',
    label: 'Phần đầu trang chủ',
    description: 'Màn hình đầu tiên khách nhìn thấy, phía trên nút đăng ký.',
    slots: [
      {
        key: 'home.hero.background',
        label: 'Ảnh nền phần đầu',
        hint: 'Phủ mờ phía sau các quầng màu cam, không đè lên chữ. Ảnh càng ít chi tiết vụn càng đẹp — lớp học, bàn viết, bảng đen.',
        aspect: '16 / 9',
        recommended: '2000×1125',
        fallback: 'gradient',
        fallbackNote: 'Chưa tải thì giữ nguyên nền chuyển màu kem đào như hiện nay.',
        defaultAlt: '',
      },
      {
        key: 'home.hero.portrait',
        label: 'Ảnh nổi ở cột phải phần đầu',
        hint: 'Tấm ảnh dọc nhỏ nổi cạnh hình bản đồ kỹ năng. Ảnh một học sinh đang học hợp hơn ảnh nhóm đông.',
        aspect: '3 / 4',
        recommended: '600×800',
        fallback: 'hidden',
        fallbackNote: 'Chưa tải thì cột phải chỉ có bản đồ kỹ năng như hiện nay.',
        defaultAlt: 'Học sinh đang luyện đề',
      },
    ],
  },

  {
    key: 'home.visuals',
    label: 'Thay hình vẽ bằng ảnh chụp sản phẩm',
    description:
      'Năm khối minh họa đang được VẼ bằng mã (bản đồ kỹ năng, việc hôm nay, mức khó, tiến bộ, báo cáo phụ huynh). Tải ảnh lên là ô đó chuyển sang dùng ảnh; gỡ ảnh là quay lại hình vẽ.',
    slots: [
      {
        key: 'home.hero.skillmap',
        label: 'Bản đồ kỹ năng — phần đầu trang',
        hint: 'Khối lớn ở cột phải màn hình đầu tiên. Nên là ảnh chụp màn hình thật của bản đồ kỹ năng trong khu học tập.',
        aspect: '16 / 10',
        recommended: '1400×875',
        fallback: 'visual',
        fallbackNote: 'Chưa tải thì giữ hình bản đồ kỹ năng vẽ sẵn như hiện nay.',
        defaultAlt: 'Bản đồ kỹ năng của học sinh, mỗi mảng kiến thức một thanh mức độ',
      },
      {
        key: 'home.features.1.image',
        label: 'Việc hôm nay — khối tính năng 1',
        hint: 'Ảnh chụp danh sách việc trong ngày. Chụp đủ cả tiêu đề khối để người xem biết đang nhìn màn hình nào.',
        aspect: '16 / 10',
        recommended: '1400×875',
        fallback: 'visual',
        fallbackNote: 'Chưa tải thì giữ hình danh sách việc vẽ sẵn như hiện nay.',
        defaultAlt: 'Danh sách ba việc cần làm trong ngày, kèm thời gian ước tính từng việc',
      },
      {
        key: 'home.features.2.image',
        label: 'Mức khó — khối tính năng 2',
        hint: 'Ảnh chụp phần hiển thị mức khó đang được điều chỉnh theo sức học.',
        aspect: '16 / 10',
        recommended: '1400×875',
        fallback: 'visual',
        fallbackNote: 'Chưa tải thì giữ hình đồng hồ mức khó vẽ sẵn như hiện nay.',
        defaultAlt: 'Thang mức khó đang được điều chỉnh theo sức học của học sinh',
      },
      {
        key: 'home.features.3.image',
        label: 'Tiến bộ — khối tính năng 3',
        hint: 'Ảnh chụp biểu đồ tiến bộ qua các chu kỳ đo.',
        aspect: '16 / 10',
        recommended: '1400×875',
        fallback: 'visual',
        fallbackNote: 'Chưa tải thì giữ biểu đồ tiến bộ vẽ sẵn như hiện nay.',
        defaultAlt: 'Biểu đồ tiến bộ của học sinh qua các chu kỳ đo 14 ngày',
      },
      {
        key: 'home.parents.report',
        label: 'Báo cáo phụ huynh — khối "Cho phụ huynh"',
        hint: 'Ảnh chụp bản báo cáo gửi phụ huynh sau mỗi chu kỳ. Nhớ che tên học sinh thật trước khi chụp.',
        aspect: '16 / 10',
        recommended: '1400×875',
        fallback: 'visual',
        fallbackNote: 'Chưa tải thì giữ hình báo cáo vẽ sẵn như hiện nay.',
        defaultAlt: 'Báo cáo gửi phụ huynh, thể hiện mức tăng của từng mảng kiến thức sau 14 ngày',
      },
    ],
  },

  {
    key: 'home.gallery',
    label: 'Dải ảnh giữa trang',
    description:
      'Một khối ảnh riêng nằm giữa phần "Cho phụ huynh" và phần câu hỏi thường gặp. Tiêu đề và mô tả của khối sửa ở nhóm chữ "Dải ảnh giữa trang".',
    slots: [1, 2, 3, 4].map((n) => ({
      key: `home.gallery.${n}`,
      label: `Ảnh ${n}`,
      hint:
        n === 1
          ? 'Ảnh đầu tiên hiện to gấp đôi ba ảnh còn lại, nên chọn tấm đẹp nhất cho ô này.'
          : 'Hiện ở kích thước nhỏ, cạnh ảnh lớn.',
      aspect: n === 1 ? '4 / 3' : '1 / 1',
      recommended: n === 1 ? '1200×900' : '800×800',
      fallback: 'hidden' as const,
      fallbackNote:
        n === 1
          ? 'Chưa tải ảnh nào trong nhóm này thì cả khối bị ẩn, trang liền mạch như chưa từng có nó.'
          : 'Chưa tải thì ô này bị bỏ qua, các ảnh còn lại tự dồn lại.',
      defaultAlt: '',
    })),
  },

  {
    key: 'home.sections',
    label: 'Ảnh trong các khối nội dung',
    description: 'Ảnh xen vào phần dành cho phụ huynh và khối kêu gọi đăng ký ở cuối trang.',
    slots: [
      {
        key: 'home.parents.photo',
        label: 'Ảnh khối "Cho phụ huynh"',
        hint: 'Nằm dưới ảnh báo cáo gửi phụ huynh. Ảnh buổi tư vấn hoặc phụ huynh ngồi cùng con hợp nhất.',
        aspect: '4 / 3',
        recommended: '1000×750',
        fallback: 'hidden',
        fallbackNote: 'Chưa tải thì khối này giữ nguyên như hiện nay.',
        defaultAlt: 'Buổi trao đổi giữa giáo viên và phụ huynh',
      },
      {
        key: 'home.cta.image',
        label: 'Ảnh khối chốt cuối trang',
        hint: 'Nằm trên tiêu đề của khối kêu gọi đăng ký. Ảnh ngang, dùng làm dải ảnh rộng.',
        aspect: '21 / 9',
        recommended: '1600×686',
        fallback: 'hidden',
        fallbackNote: 'Chưa tải thì khối chốt vẫn là nền chuyển màu như hiện nay.',
        defaultAlt: '',
      },
    ],
  },
];

/** Tra nhanh một ô theo khóa; cũng là bộ lọc khóa hợp lệ khi nhận tải lên. */
export const IMAGE_SLOT_BY_KEY: Record<string, ImageSlot> = Object.fromEntries(
  SITE_IMAGE_GROUPS.flatMap((group) => group.slots.map((slot) => [slot.key, slot])),
);

export const IMAGE_SLOT_KEYS: string[] = Object.keys(IMAGE_SLOT_BY_KEY);

// ---------------------------------------------------------------------------
// Ô ảnh của KHÓA HỌC — họ ô duy nhất không khai báo được sẵn trong mã nguồn
// ---------------------------------------------------------------------------

/**
 * Ảnh đại diện của từng khóa học.
 *
 * Mọi ô phía trên là ô CỐ ĐỊNH: một vị trí trên trang, khai một dòng ở đây, hết.
 * Khóa học thì không — nó là dữ liệu, admin thêm một khóa mới lúc nào cũng được
 * (đúng điều kiện nghiệm thu "thêm kỳ thi = thêm bản ghi"), nên không có cách
 * nào liệt kê trước tất cả ô ảnh của chúng trong một mảng tĩnh.
 *
 * Vì vậy họ ô này được nhận diện bằng KHUÔN KHÓA thay vì bằng danh sách:
 *
 *     course.<mã kỳ thi>-<khối>-<môn>.cover      ví dụ: course.olp-a-math.cover
 *
 * Khóa dựng từ ba thứ định danh một khóa học trong lược đồ (`@@unique([programId,
 * gradeBand, subject])`) chứ không phải từ `id`. Nhờ vậy ảnh vẫn đúng chỗ sau khi
 * seed lại ở môi trường mới — nơi `id` là chuỗi cuid hoàn toàn khác.
 *
 * Đổi lại, hai điều phải giữ: mọi chỗ kiểm khóa hợp lệ đều gọi
 * `resolveImageSlot()` chứ không tra `IMAGE_SLOT_BY_KEY`, và đổi mã kỳ thi thì
 * ảnh của các khóa thuộc kỳ thi đó thành ô mồ côi — hệt như khi đổi tên một ô
 * trong `SITE_IMAGE_GROUPS`.
 */
const COURSE_COVER_PATTERN = /^course\.[a-z0-9]+(?:-[a-z0-9]+)*\.cover$/;

/** Bản mô tả dùng chung cho mọi ô ảnh khóa học. */
export const COURSE_COVER_SLOT: Omit<ImageSlot, 'key'> = {
  label: 'Ảnh đại diện khóa học',
  hint: 'Hiện trên thẻ khóa học ở trang danh mục và ở đầu trang giới thiệu khóa. Ảnh ngang, chủ thể nằm giữa — hai bên có thể bị cắt trên máy điện thoại.',
  aspect: '16 / 9',
  recommended: '1200×675',
  fallback: 'gradient',
  fallbackNote: 'Chưa tải thì thẻ khóa học giữ nền chuyển màu theo màu nhận diện của kỳ thi.',
  defaultAlt: '',
};

/** Khóa ô ảnh đại diện của một khóa học. Chỉ nhận ba thứ định danh khóa đó. */
export function courseCoverSlot(programCode: string, gradeBand: string, subject: string): string {
  return `course.${programCode}-${gradeBand}-${subject}`.toLowerCase() + '.cover';
}

/** Ô này có phải ảnh đại diện khóa học không. */
export function isCourseCoverSlot(slot: string): boolean {
  return COURSE_COVER_PATTERN.test(slot);
}

/**
 * Bản mô tả của một ô bất kỳ, hoặc `null` khi khóa không thuộc ô nào.
 *
 * Đây là CỬA DUY NHẤT để hỏi "khóa này có hợp lệ không". Dùng nó thay cho
 * `slot in IMAGE_SLOT_BY_KEY` ở mọi chỗ nhận dữ liệu từ ngoài vào.
 */
export function resolveImageSlot(slot: string): ImageSlot | null {
  const fixed = IMAGE_SLOT_BY_KEY[slot];
  if (fixed) return fixed;
  if (isCourseCoverSlot(slot)) return { key: slot, ...COURSE_COVER_SLOT };
  return null;
}

/** Khóa chữ chứa alt của một ô ảnh. */
export function altKey(slot: string): string {
  return `${slot}.alt`;
}
