// Nội dung hướng dẫn sử dụng nhanh — một nguồn duy nhất cho trang /huong-dan và docs/HUONG-DAN-NHANH.md
// (sinh bằng `npx tsx scripts/demo/tao-huong-dan-md.ts`). Cú pháp chữ: **đậm**, `phím/nút`.
// Ảnh chụp trên CSDL demo (dữ liệu giả) — xem scripts/demo/chup-huong-dan.ts.

export type Buoc = { n?: number; t: string };
export type Anh = { file: string; alt: string };
export type Khoi = { tieuDe?: string; anh?: Anh; buoc?: Buoc[]; ds?: string[] };
export type Muc = {
  id: string;
  tieuDe: string;
  khiNao: string;
  khoi: Khoi[];
  luuY?: string[];
  danhChoAdmin?: boolean;
};

export const NAM_BUOC: { so: number; ten: string; mo: string }[] = [
  { so: 1, ten: 'Tìm', mo: 'Lấy hồ sơ giấy, gõ tên không dấu vào ô tìm.' },
  { so: 2, ten: 'Đối chiếu', mo: 'So họ tên, năm sinh, CCCD và 8 cận lâm sàng với giấy.' },
  { so: 3, ten: 'Sửa nếu khác giấy', mo: 'Bấm ô cận lâm sàng hoặc mở chi tiết để sửa theo giấy.' },
  { so: 4, ten: 'Xác nhận', mo: 'Khớp giấy thì tích “Đã kiểm – có hồ sơ giấy”.' },
  { so: 5, ten: 'Chốt danh sách', mo: 'Hết hồ sơ thì bấm “Xác nhận rà soát xong danh sách”.' },
];

export const PHIM_TAT: { phim: string; viec: string }[] = [
  { phim: '/', viec: 'Đưa con trỏ vào ô tìm kiếm / quay lại ô tìm (chữ cũ tự bôi đen để gõ đè)' },
  { phim: '↓ / Enter (đang ở ô tìm)', viec: 'Xuống danh sách, chọn dòng đầu kết quả' },
  { phim: '↑ / ↓', viec: 'Chọn dòng trên / dòng dưới' },
  { phim: 'Space', viec: 'Xác nhận hoặc bỏ xác nhận hồ sơ đang chọn' },
  { phim: '1 – 8', viec: 'Đổi ô cận lâm sàng thứ 1–8 (CTM, GLU, URE, CRE, GOT, GPT, NT, SA)' },
  { phim: 'Enter', viec: 'Mở khung chi tiết (nhấp đúp vào dòng cũng được)' },
  { phim: 'K', viec: 'Đưa hồ sơ vào kho của tôi' },
  { phim: 'C', viec: 'Đưa hồ sơ vào kho chờ chung' },
];

export const MUC: Muc[] = [
  {
    id: 'dang-nhap',
    tieuDe: 'Đăng nhập',
    khiNao: 'Mỗi lần bắt đầu làm việc. Dùng Chrome hoặc Edge trên máy tính.',
    khoi: [
      {
        anh: { file: '01-dang-nhap.png', alt: 'Trang đăng nhập với ô chọn tên, ô mật khẩu và nút Đăng nhập' },
        buoc: [
          { n: 1, t: 'Bấm ô **Tên đăng nhập** và chọn **tên của mình** trong danh sách.' },
          { n: 2, t: 'Gõ **mật khẩu** do admin phát (ban đầu là `123456`).' },
          { n: 3, t: 'Bấm **Đăng nhập**.' },
        ],
      },
    ],
    luuY: [
      'Muốn đổi mật khẩu: bấm **Đổi mật khẩu** ở góc trên bên phải sau khi đăng nhập.',
      'Gõ sai mật khẩu nhiều lần, app khóa tạm 15 phút. Quên mật khẩu thì nhờ admin đặt lại.',
    ],
  },
  {
    id: 'dashboard',
    tieuDe: 'Theo dõi tiến độ trên trang Danh sách của tôi',
    khiNao: 'Sau khi đăng nhập: xem mình phụ trách buổi nào, đã làm được bao nhiêu.',
    khoi: [
      {
        anh: { file: '02-dashboard-nhan-vien.png', alt: 'Trang Danh sách của tôi: các thẻ thống kê, ô tìm hồ sơ và bảng các buổi khám' },
        buoc: [
          { n: 1, t: 'Xem thẻ **Tiến độ %**: số hồ sơ đã xác nhận trên tổng số hồ sơ trong danh sách của bạn.' },
          { n: 2, t: 'Xem thẻ **Thừa / Thiếu**: danh sách trên máy nhiều hơn hay ít hơn so với **DS google sheet** (sổ đoàn).' },
          { n: 3, t: 'Bấm vào **ngày khám** (chữ xanh) của một buổi trong bảng để mở danh sách rà soát của buổi đó.' },
          { n: 4, t: 'Gõ tên, năm sinh hoặc CCCD vào ô **Tìm hồ sơ**, bấm **Tìm hồ sơ**: app mở trang **Tìm kiếm** với kết quả.' },
        ],
      },
    ],
    luuY: ['Buổi có nhãn **Đã xác nhận** là buổi đã chốt xong, không cần làm tiếp.'],
  },
  {
    id: 'mo-danh-sach',
    tieuDe: 'Mở danh sách rà soát',
    khiNao: 'Khi bắt đầu rà soát một buổi khám. Đây là màn hình bạn làm việc nhiều nhất.',
    khoi: [
      {
        anh: { file: '03-man-ra-soat-tong-the.png', alt: 'Màn rà soát: thanh chỉ số, ô tìm, lọc nhanh và bảng hồ sơ' },
        buoc: [
          { n: 1, t: 'Đọc **thanh chỉ số**: DS google sheet, Trong danh sách, **Đã xác nhận** (x/y), Thừa, Thiếu.' },
          { n: 2, t: 'Dùng **ô tìm** để tìm nhanh một hồ sơ (phím `/`).' },
          { n: 3, t: 'Dùng **Lọc nhanh** để chỉ xem nhóm hồ sơ cần chú ý (chưa xác nhận, có cảnh báo…).' },
          { n: 4, t: 'Làm việc trên **bảng hồ sơ**: mỗi dòng một người, 8 ô cận lâm sàng ở bên phải, ô xác nhận ở cuối dòng.' },
        ],
      },
    ],
    luuY: ['Dòng **nền xanh** là hồ sơ đã xác nhận. Ô có **viền cam** là ô đã sửa so với dữ liệu gốc.'],
  },
  {
    id: 'tim-kiem',
    tieuDe: 'Tìm hồ sơ trong danh sách',
    khiNao: 'Khi cầm một hồ sơ giấy và cần tìm đúng dòng của người đó.',
    khoi: [
      {
        anh: {
          file: '04-tim-kiem-trong-danh-sach.png',
          alt: 'Gõ “hung” vào ô tìm (nền màu gạch), bảng lọc còn 3 / 38 hồ sơ và bấm ↓ chọn dòng đầu',
        },
        buoc: [
          {
            n: 1,
            t: 'Bấm vào **ô tìm** (hoặc nhấn `/`) rồi gõ **tên không dấu**, ghi chú, năm sinh, CCCD hoặc mã KCB. Ô trống có nền **vàng cam nhạt** (chưa tìm); khi có chữ sẽ đổi sang nền **màu gạch**, chữ trắng (đang tìm).',
          },
          {
            n: 2,
            t: 'App hỗ trợ **tìm mờ theo thứ tự chữ cái** (ví dụ gõ “ng anh” khớp “Nguyễn Hoàng Anh”), tìm cả trong **cột Ghi chú**, và **tô vàng** các chữ cái khớp từ khóa.',
          },
          {
            n: 3,
            t: 'Nhìn dòng **Đang hiển thị 3 / 38 hồ sơ**: bảng chỉ còn những người khớp từ khóa.',
          },
          {
            n: 4,
            t: 'Nhấn `↓` hoặc `Enter` để từ ô tìm **xuống danh sách**, chọn dòng đầu kết quả (có viền nhấn); sau đó dùng `Space`, `1`–`8`, `Enter`, `K`, `C` bình thường trên danh sách đã lọc.',
          },
          {
            n: 5,
            t: 'Nhấn `/` để **quay lại ô tìm** (chữ cũ được bôi đen để gõ đè tên người tiếp theo).',
          },
        ],
      },
    ],
    luuY: [
      'Tìm không phân biệt dấu và chữ hoa/thường: gõ “thuy” vẫn ra “Thủy”, “Thuỷ”; gõ “ng anh” khớp mọi tên có các chữ theo đúng thứ tự như “Nguyễn Hoàng Anh”.',
      'Tìm kiếm tra cứu cả trong **cột Ghi chú** và tự động **tô vàng** những ký tự khớp.',
      'Xóa tìm kiếm: bấm dấu **×** trong ô hoặc nhấn `Esc`.',
    ],
  },
  {
    id: 'sua-cls',
    tieuDe: 'Kiểm tra và sửa cận lâm sàng',
    khiNao: 'Khi so 8 cận lâm sàng trên máy với phiếu giấy.',
    khoi: [
      {
        anh: { file: '05-kiem-tra-sua-cls.png', alt: 'Một dòng được chọn, 8 ô cận lâm sàng, ô URE viền cam và nhãn cảnh báo' },
        buoc: [
          { n: 1, t: 'Nhìn **8 ô cận lâm sàng**: CTM, GLU, URE, CRE, GOT, GPT, NT, SA. Ô **xanh** là có làm, ô **xám** là không làm. So từng ô với phiếu giấy.' },
          { n: 2, t: 'Ô nào **khác giấy** thì bấm vào ô đó (hoặc nhấn phím `1`–`8`) để đổi. Ô đã sửa có **viền cam**; bấm lần nữa để trả lại như cũ.' },
          { n: 3, t: 'Gặp **nhãn cảnh báo** (vàng cam): rê chuột vào nhãn để đọc giải thích, rồi xem kỹ phiếu giấy.' },
        ],
      },
    ],
    luuY: ['Chỉ có 8 cận lâm sàng này; kỹ thuật khác không nhập vào app.'],
  },
  {
    id: 'sua-hanh-chinh',
    tieuDe: 'Sửa thông tin hành chính và lưu',
    khiNao: 'Khi họ tên, giới tính, năm sinh, CCCD hoặc địa chỉ trên máy khác phiếu giấy.',
    khoi: [
      {
        anh: { file: '06-sua-thong-tin-hanh-chinh.png', alt: 'Khung chi tiết hồ sơ với các ô nhập, dòng “Gốc”, nút Lưu thay đổi và tab Lịch sử' },
        buoc: [
          { n: 1, t: '**Nhấp đúp** vào dòng (hoặc chọn dòng rồi nhấn `Enter`) để mở khung chi tiết bên phải. Sửa các ô khác giấy: họ tên, giới tính, năm sinh, CCCD, địa chỉ.' },
          { n: 2, t: 'Dòng **Gốc: …** màu cam cho biết giá trị ban đầu, để bạn biết mình đã sửa gì.' },
          { n: 3, t: 'Bấm **Lưu thay đổi**. Chưa bấm thì chưa được lưu.' },
          { n: 4, t: 'Bấm tab **Lịch sử** để xem ai đã sửa gì, lúc nào.' },
        ],
      },
    ],
    luuY: ['CCCD để trống hoặc đủ 9 hoặc 12 số. Họ tên và năm sinh không được để trống.'],
  },
  {
    id: 'xac-nhan',
    tieuDe: 'Xác nhận hồ sơ',
    khiNao: 'Khi hồ sơ trên máy đã khớp với hồ sơ giấy (sau khi đã sửa nếu có khác).',
    khoi: [
      {
        anh: { file: '07-xac-nhan-ho-so.png', alt: 'Dòng nền xanh đã tích Đã kiểm, số Đã xác nhận tăng lên 13/38' },
        buoc: [
          { n: 1, t: 'Tích ô **Đã kiểm – có hồ sơ giấy** ở cuối dòng (hoặc chọn dòng rồi nhấn `Space`). Dòng chuyển **nền xanh**.' },
          { n: 2, t: 'Nhìn số **Đã xác nhận** trên thanh chỉ số tăng thêm 1.' },
        ],
      },
    ],
    luuY: ['Tích nhầm thì bấm lần nữa để bỏ xác nhận.'],
  },
  {
    id: 'loc',
    tieuDe: 'Lọc hồ sơ chưa xác nhận và lọc nhanh',
    khiNao: 'Khi muốn biết còn những hồ sơ nào phải làm, hoặc chỉ xem một nhóm hồ sơ.',
    khoi: [
      {
        anh: { file: '08-loc-chua-xac-nhan.png', alt: 'Chip Chưa xác nhận được bật, số hiển thị 25/38 và bộ lọc chi tiết theo 8 cận lâm sàng' },
        buoc: [
          { n: 1, t: 'Bấm nút **Chưa xác nhận (25)** trong mục **Lọc nhanh**: bảng chỉ còn hồ sơ chưa làm.' },
          { n: 2, t: 'Xem dòng **Đang hiển thị 25 / 38 hồ sơ** để biết còn bao nhiêu.' },
          { n: 3, t: 'Bấm **Bộ lọc chi tiết** để lọc theo từng cận lâm sàng: bấm một ô để xoay vòng **Tất cả → Có → Không**.' },
        ],
      },
    ],
    luuY: ['Bấm **Xóa bộ lọc** để trở lại xem toàn bộ danh sách.'],
  },
  {
    id: 'loai-khoi',
    tieuDe: 'Loại hồ sơ khỏi danh sách',
    khiNao: 'Khi hồ sơ có trên máy nhưng không có giấy, hoặc không thuộc buổi này.',
    khoi: [
      {
        anh: { file: '09-loai-khoi-danh-sach.png', alt: 'Khung chi tiết với ba nút trong mục Chuyển hồ sơ' },
        buoc: [
          { n: 1, t: '**Đưa vào kho của tôi** (phím `K`): không thấy giấy, nghi khám ngày khác. Hồ sơ nằm chờ để bạn xem lại sau.' },
          { n: 2, t: '**Đưa vào kho chờ chung** (phím `C`): không phải người của buổi mình, để người phụ trách khác nhận. App hỏi lý do.' },
          { n: 3, t: '**Chuyển sang buổi khác…**: biết chắc người này khám buổi nào.' },
        ],
      },
      {
        tieuDe: 'Chuyển sang buổi khác',
        anh: { file: '09b-chuyen-sang-buoi-khac.png', alt: 'Hộp thoại chuyển hồ sơ sang buổi khám khác' },
        buoc: [
          { n: 1, t: 'Chọn **buổi khám đích** trong 2 nhóm rõ ràng: **Buổi của tôi — chuyển ngay** hoặc **Buổi của người khác — gửi đề nghị, chờ người phụ trách buổi đó chấp nhận**.' },
          { n: 2, t: 'Gõ **lý do** (bắt buộc), ví dụ “Hồ sơ giấy ghi ngày khám 14/09”.' },
          { n: 3, t: 'Bấm **Chuyển sang buổi đã chọn** (với buổi của mình) hoặc **Gửi đề nghị** (khi gửi sang buổi của người khác — người phụ trách buổi đích sẽ trực tiếp chấp nhận mà không cần qua Admin).' },
        ],
      },
    ],
    luuY: [
      'Hồ sơ **đã xác nhận** phải **bỏ xác nhận** trước (bấm lại ô Đã kiểm) thì mới chuyển được.',
      'Buổi đã chốt (khóa) không nhận hồ sơ chuyển vào.',
    ],
  },
  {
    id: 'them-ho-so',
    tieuDe: 'Thêm hồ sơ và kiểm trùng',
    khiNao: 'Có hồ sơ giấy nhưng tìm khắp nơi không thấy người đó trên máy.',
    khoi: [
      {
        anh: { file: '10-them-ho-so.png', alt: 'Hộp thoại Thêm hồ sơ, cảnh báo hồ sơ trùng và nút Nhận hồ sơ này về buổi' },
        buoc: [
          { n: 1, t: 'Bấm **+ Thêm hồ sơ** phía trên bảng. Điền họ tên, giới tính, năm sinh (bắt buộc), CCCD, địa chỉ nếu có; bấm 8 ô cận lâm sàng theo giấy. Mã KCB có thể để trống.' },
          { n: 2, t: 'Nếu hiện khung **Phát hiện … hồ sơ trùng**, người này đã có trong hệ thống: **không tạo mới**.' },
          { n: 3, t: 'Hồ sơ trùng đang ở kho thì bấm **Nhận hồ sơ này về buổi**. Đang ở buổi người khác thì bấm **Đề nghị chuyển về buổi này**.' },
        ],
      },
    ],
    luuY: [
      'Chỉ khi chắc chắn là **người khác** mới tích “Vẫn tạo mới” và ghi lý do.',
      'Hồ sơ thêm tay được xác nhận ngay khi thêm.',
    ],
  },
  {
    id: 'nhan-tu-kho',
    tieuDe: 'Nhận hồ sơ vào danh sách (từ kho)',
    khiNao: 'Có hồ sơ giấy của một người đang nằm trong kho chờ chung hoặc kho của tôi.',
    khoi: [
      {
        anh: { file: '11b-kho-cho-chung.png', alt: 'Tab Kho chờ chung với bộ lọc đơn vị, ô tìm và nút Nhận về buổi' },
        buoc: [
          { n: 1, t: 'Bấm **Kho chờ** trên thanh menu, chọn tab **Kho chờ chung**. Lọc theo **đơn vị** hoặc gõ tên vào ô **Tìm hồ sơ**.' },
          { n: 2, t: 'Ở dòng đúng người, bấm **Nhận về buổi…**, chọn buổi bạn phụ trách rồi bấm **Nhận về buổi khám**.' },
        ],
      },
    ],
    luuY: ['Hồ sơ nhận về sẽ vào danh sách của buổi bạn chọn. Nhớ đối chiếu và xác nhận như hồ sơ khác.'],
  },
  {
    id: 'kho-cho',
    tieuDe: 'Kho chờ cá nhân và kho chờ chung',
    khiNao: 'Để xem lại những hồ sơ đã tạm cất đi.',
    khoi: [
      {
        anh: { file: '11-kho-cua-toi.png', alt: 'Tab Kho của tôi với cột Nguồn gốc và nút Nhận về buổi' },
        buoc: [
          { n: 1, t: 'Cột **Nguồn gốc** cho biết hồ sơ đến từ buổi nào, ai chuyển, lúc nào.' },
          { n: 2, t: 'Bấm **Nhận về buổi…** để đưa hồ sơ trở lại danh sách của buổi bạn phụ trách.' },
        ],
      },
      {
        ds: [
          '**Kho của tôi**: chỉ bạn thấy. Dùng cho hồ sơ “chưa chắc, xem lại sau”.',
          '**Kho chờ chung**: ai cũng thấy. Dùng cho hồ sơ không thuộc buổi của bạn, người khác có thể nhận.',
          'Con số cạnh chữ **Kho chờ** trên menu là số hồ sơ trong kho của tôi.',
        ],
      },
    ],
  },
  {
    id: 'tim-toan-app',
    tieuDe: 'Tìm toàn app và đề nghị chuyển hai chiều',
    khiNao: 'Có giấy của một người đang nằm ở buổi của nhân viên khác (xin nhận về), hoặc muốn gửi hồ sơ từ buổi của mình sang buổi của nhân viên khác (gửi sang).',
    khoi: [
      {
        anh: { file: '12-tim-kiem-toan-app.png', alt: 'Trang Tìm kiếm với phạm vi Toàn bộ DS, dòng Chỉ xem và nút Chuyển về buổi của tôi' },
        buoc: [
          { n: 1, t: 'Bấm **Tìm kiếm** trên menu, gõ từ khóa (họ tên, ghi chú, năm sinh, CCCD, mã KCB — hỗ trợ **tìm mờ theo thứ tự** và **tô vàng** chữ khớp), **Phạm vi** mặc định là **Toàn bộ DS** (có thể thu hẹp: Buổi của tôi, Kho chờ chung). Bấm dấu **✕** cuối ô hoặc **Esc** để xóa chữ.' },
          { n: 2, t: 'Dùng thanh **Bộ lọc tìm kiếm** (Xã/phường, Ngày khám, 8 cận lâm sàng **Tất cả / Có / Không**, Xác nhận, Nhân viên rà soát, Ghi chú, DS đẩy cổng, Nguồn, Vị trí) để lọc kết quả. Khi bật ít nhất 1 bộ lọc, bạn có thể bấm **Tìm kiếm** ngay cả khi để trống ô từ khóa.' },
          { n: 3, t: 'Đề nghị chuyển hỗ trợ **hai chiều**: (1) **Xin nhận về** — hồ sơ đang ở buổi người khác, bạn bấm **Chuyển về buổi của tôi** để xin nhận về buổi của mình; (2) **Gửi sang** — hồ sơ đang ở buổi của bạn, bạn chọn buổi của người khác để gửi đề nghị sang cho họ.' },
          { n: 4, t: '**Ai là người duyệt?** Người phụ trách buổi đối ứng sẽ **trực tiếp duyệt** mà không cần qua Admin: với **Xin nhận về**, người đang giữ buổi gốc duyệt; với **Gửi sang**, người nhận (phụ trách buổi đích) trực tiếp chấp nhận. **Quản trị viên (Admin)** vẫn có quyền phê duyệt toàn bộ đề nghị ở cả hai chiều.' },
        ],
      },
      {
        tieuDe: 'Nếu bạn là người duyệt đề nghị (người đang giữ hoặc người nhận)',
        anh: { file: '13-de-nghi-chuyen.png', alt: 'Tab Đề nghị chuyển với nút Đồng ý và Từ chối' },
        buoc: [
          { n: 1, t: 'Vào **Kho chờ**, tab **Đề nghị chuyển** (menu hiện **Đề nghị: n** khi có đề nghị chờ bạn duyệt). Mỗi dòng có nhãn rõ **Xin nhận về** hoặc **Gửi sang** và ghi rõ **Người duyệt**.' },
          { n: 2, t: 'Bấm **Đồng ý** để chuyển hồ sơ ngay sang buổi đích, hoặc bấm **Từ chối** nếu không đúng (có thể ghi lý do ngắn gọn).' },
        ],
      },
    ],
  },
  {
    id: 'thong-bao-de-nghi',
    tieuDe: 'Thông báo đề nghị chuyển',
    khiNao: 'Khi nhân viên khác gửi đề nghị xin nhận hồ sơ từ buổi của bạn hoặc muốn gửi hồ sơ sang buổi của bạn.',
    khoi: [
      {
        anh: {
          file: '13b-thong-bao-de-nghi.png',
          alt: 'Dải thông báo màu vàng dưới thanh trên cùng, nút Xem và xử lý và popup góc phải khi có đề nghị chuyển mới',
        },
        buoc: [
          {
            n: 1,
            t: '**Dải vàng** ngay dưới thanh trên cùng báo bạn có bao nhiêu đề nghị chuyển hồ sơ đang chờ xử lý, kèm nhãn **Xin nhận về** hoặc **Gửi sang** và tên người duyệt.',
          },
          {
            n: 2,
            t: 'Bấm **Xem và xử lý →** trên dải vàng (hoặc **Xem và xử lý** trong popup) để mở tab **Đề nghị chuyển**, rồi bấm **Đồng ý** hoặc **Từ chối** trực tiếp mà không cần chờ Admin.',
          },
          {
            n: 3,
            t: 'Đọc **popup góc phải** cho mỗi đề nghị mới: biết rõ loại đề nghị (**Xin nhận về** / **Gửi sang**), ai gửi, hồ sơ nào, từ buổi nào sang buổi nào, người duyệt và lý do.',
          },
        ],
      },
    ],
    luuY: [
      'Popup góc phải **tự mờ và tắt sau 10 giây**, nhưng **dải vàng** vẫn còn cho đến khi bạn xử lý xong hết các đề nghị gửi đến mình.',
      'Trên thanh menu và thanh tab dưới điện thoại, mục **Kho chờ** hiện huy hiệu **Đề nghị: N** đếm chính xác các đề nghị đang chờ bạn duyệt.',
    ],
  },
  {
    id: 'chot',
    tieuDe: 'Chốt danh sách',
    khiNao: 'Khi mọi hồ sơ của buổi đã xác nhận xong.',
    khoi: [
      {
        anh: { file: '14-chot-danh-sach.png', alt: 'Hộp thoại Xác nhận rà soát xong danh sách buổi khám' },
        buoc: [
          { n: 1, t: 'Bấm **Xác nhận rà soát xong danh sách** (nút xanh, sáng lên khi hết hồ sơ chưa xác nhận). Đọc phần **tóm tắt**: DS google sheet, trong danh sách, đã xác nhận, thừa, thiếu.' },
          { n: 2, t: 'Nếu số hồ sơ **lệch DS google sheet**, ghi **giải trình** (bắt buộc), ví dụ “2 phiếu khám ngày 15/09 nhập nhầm sang buổi này”.' },
          { n: 3, t: 'Bấm **Xác nhận và khóa danh sách**.' },
        ],
      },
      {
        tieuDe: 'Sau khi chốt',
        anh: { file: '14b-danh-sach-da-khoa.png', alt: 'Dải xanh Đã xác nhận bởi … và nhãn Đã xác nhận trên buổi đã khóa' },
        buoc: [
          { n: 1, t: 'Dải xanh **Đã xác nhận bởi …** ghi người chốt, thời điểm và giải trình.' },
          { n: 2, t: 'Nhãn **Đã xác nhận** cạnh tên buổi: danh sách đã khóa.' },
        ],
      },
    ],
    luuY: ['Danh sách đã khóa thì không sửa, thêm hay chuyển hồ sơ được nữa. Cần sửa: báo admin **mở khóa**.'],
  },
  {
    id: 'kiem-tra-so',
    tieuDe: 'Kiểm tra số CCCD, mã KCB, SĐT',
    khiNao:
      'Khi nhập mới, sửa thông tin hồ sơ hoặc rà soát các hồ sơ có nhãn "Xem lại số".',
    khoi: [
      {
        tieuDe: '1. Quy tắc nhận diện 3 loại số',
        ds: [
          '**Mã KCB**: chuẩn HIS gồm **10 chữ số, bắt đầu bằng `26`** (ví dụ `2602083219`). Nếu ô Mã KCB có 12 số bắt đầu bằng `0` thì thường là gõ nhầm số CCCD sang.',
          '**Số CCCD / CMND**: gồm **12 chữ số** (hoặc CMND 9 số cũ). Với CCCD 12 số: 3 số đầu là mã tỉnh/thành (`001`–`096`), **số thứ 4** cho biết thế kỷ sinh và giới tính (sinh 1900–1999: `0` = Nam, `1` = Nữ; sinh 2000–2099: `2` = Nam, `3` = Nữ), **số thứ 5–6** là 2 số cuối của năm sinh (theo quy định mã hóa số định danh cá nhân của Bộ Công an). Lệch với hồ sơ chỉ là **cảnh báo**: đối chiếu giấy tờ để biết sai ở giới tính/năm sinh hay ở số CCCD.',
          '**Số điện thoại (SĐT)**: gồm **10 chữ số, bắt đầu bằng `0`** (đầu `03, 05, 07, 08, 09` hoặc cố định `02`).',
        ],
      },
      {
        tieuDe: '2. Ý nghĩa thông báo Đỏ (lỗi) và Cam (cảnh báo)',
        ds: [
          '**Màu đỏ (Lỗi chắc chắn)**: gõ nhầm loại số sang ô khác (ví dụ gõ số CCCD hoặc SĐT vào ô Mã KCB), sai độ dài hoặc có ký tự lạ. Khi ô đang sửa có lỗi đỏ, **nút Lưu / Thêm hồ sơ sẽ tự khóa** kèm lý do để tránh lưu nhầm.',
          '**Màu cam (Cảnh báo cần xem lại)**: số có điểm bất thường như **CCCD lệch năm sinh / giới tính**, mã KCB khác mẫu 10 số đầu `26`, hoặc trùng số với hồ sơ khác.',
          '**Khi nào bấm "Vẫn lưu"?** Nếu bấm Lưu khi có cảnh báo cam, hộp thoại xác nhận sẽ hiện ra. Hãy đối chiếu lại tờ giấy: nếu gõ nhầm thì bấm **Sửa lại**; nếu trên giấy tờ thực tế đúng là như vậy thì bấm **Vẫn lưu** (hệ thống vẫn cho lưu và ghi chú vào lịch sử).',
        ],
      },
      {
        tieuDe: '3. Tự rà soát và lọc "Nghi nhầm số"',
        ds: [
          'Hồ sơ có sẵn bị nghi nhầm số sẽ hiện nhãn cam **Xem lại số** ở cột Họ tên, gạch chân cam ở số cần kiểm và dòng tự động **`⚠ Xem lại: ...`** ở cột Ghi chú.',
          'Trên màn **Rà soát**, bấm chip lọc nhanh **Nghi nhầm số (N)** (hoặc chọn trong Bộ lọc chi tiết) để lọc riêng các hồ sơ cần kiểm tra lại số.',
          'Trên trang **Tìm kiếm**, chọn bộ lọc **Nghi nhầm số: Có** để tra cứu toàn bộ hồ sơ có cảnh báo số trong phạm vi đang chọn.',
        ],
      },
    ],
  },
  {
    id: 'dien-thoai-thong-bao',
    tieuDe: 'Dùng trên điện thoại & thông báo',
    khiNao:
      'Khi muốn theo dõi tiến độ, duyệt đề nghị chuyển hồ sơ trên điện thoại hoặc nhận tiếng chuông báo ngay khi có đề nghị mới.',
    khoi: [
      {
        tieuDe: '1. Cài ứng dụng lên màn hình chính (Android & iPhone)',
        ds: [
          '**Trên điện thoại Android (Chrome)**: mở trang web ứng dụng → bấm biểu tượng menu **⋮** (góc trên phải) → chọn **Cài đặt ứng dụng** hoặc **Thêm vào màn hình chính**.',
          '**Trên iPhone / iPad (Safari)**: mở trang web trong Safari → bấm nút **Chia sẻ** (biểu tượng ô vuông có mũi tên lên ở thanh dưới) → chọn **Thêm vào MH chính** → bấm **Thêm**. Mở ứng dụng từ biểu tượng **Rà soát KSK** trên màn hình chính.',
          'Giao diện trên điện thoại có **thanh 5 tab dưới cùng** (**Trang chủ · Rà soát · Kho & đề nghị · Tìm kiếm · Thêm**) để chuyển nhanh bằng một tay.',
        ],
      },
      {
        tieuDe: '2. Bật âm báo và thông báo đẩy',
        buoc: [
          {
            n: 1,
            t: 'Bấm nút **chuông (Âm báo)** trên thanh trên cùng hoặc vào mục **Thêm → Thông báo & âm báo**.',
          },
          {
            n: 2,
            t: '**Âm báo trong ứng dụng** (mặc định đang bật): phát tiếng chuông 3 nốt kiểu tin nhắn iPhone và rung nhẹ khi có đề nghị chuyển hồ sơ gửi đến bạn (kể cả khi tab trình duyệt đang ẩn trên máy tính). Nếu sau 2 phút vẫn còn đề nghị chờ và bạn chưa mở tab Đề nghị chuyển, chuông sẽ nhắc lại. Bấm **Nghe thử** để kiểm tra loa.',
          },
          {
            n: 3,
            t: '**Thông báo trên thiết bị này (Web Push)**: bấm **Bật thông báo** và chọn **Cho phép** khi trình duyệt hỏi. Thông báo đẩy hiện cả khi khóa màn hình hoặc đóng tab; âm báo chỉ phát khi app đang mở. Có thể bấm **Gửi thử** để kiểm tra ngay.',
          },
        ],
      },
      {
        tieuDe: '3. Tự động duyệt đề nghị chuyển là gì?',
        ds: [
          'Để việc chuyển hồ sơ hai chiều (**Xin nhận về** và **Gửi sang**) không phải chờ lâu khi người duyệt (người giữ buổi gốc hoặc người nhận ở buổi đích) đang bận, **Quản trị viên (Admin)** có thể cấu hình chế độ **Tự động duyệt đề nghị chuyển** tại trang **Tổng quan (/admin)**: **Tắt**, **Duyệt ngay khi có đề nghị**, hoặc **Duyệt nếu sau N phút chưa xử lý** (mặc định 5 phút) — áp dụng cho **cả hai chiều**.',
          'Trong tab **Kho chờ → Đề nghị chuyển**, dòng đầu trang cho biết chế độ tự duyệt hiện tại và mỗi đề nghị đang chờ sẽ hiển thị đồng hồ đếm ngược **Tự duyệt sau mm:ss**.',
          'Các đề nghị được hệ thống tự duyệt sẽ gắn nhãn **Tự động**. Nếu hồ sơ đã xác nhận hoặc buổi khám đã chốt khóa thì hệ thống **không tự duyệt** và sẽ hiện nhãn đỏ báo cần xử lý tay (người phụ trách hoặc Admin đều duyệt được).',
        ],
      },
    ],
  },
  {
    id: 'hoi-dap',
    tieuDe: 'Câu hỏi thường gặp',
    khiNao: 'Khi gặp tình huống chưa rõ phải làm gì.',
    khoi: [
      {
        ds: [
          '**Tôi sửa nhầm thì sao?** Ô cận lâm sàng: bấm lại để trả về. Thông tin hành chính: nhìn dòng “Gốc: …”, gõ lại giá trị cũ rồi **Lưu thay đổi**. Mọi lần sửa đều ghi vào tab **Lịch sử**, không sợ mất dấu.',
          '**Có giấy nhưng không tìm thấy người đó?** Thử gõ ít chữ hơn (chỉ tên, hoặc năm sinh, hoặc 4 số cuối CCCD). Rồi tìm ở **Kho chờ chung** và **Tìm kiếm → Toàn bộ DS**. Vẫn không có thì **Thêm hồ sơ**.',
          '**Trên máy có người nhưng không có hồ sơ giấy?** Nhấn `K` đưa vào **kho của tôi** và xem lại cuối buổi. Chắc chắn không phải người của buổi mình thì đưa vào **kho chờ chung** (nhấn `C`).',
          '**App báo “Hồ sơ vừa được người khác sửa, đã tải lại bản mới nhất”?** Hai người cùng mở một hồ sơ và người kia lưu trước. App đã tải bản mới: xem lại rồi sửa tiếp phần của bạn.',
          '**Không chuyển được hồ sơ?** Hồ sơ đã xác nhận phải bỏ xác nhận trước. Buổi đích đã chốt cũng không nhận thêm.',
          '**Danh sách đã khóa mà cần sửa?** Báo admin (BS Khôi) mở khóa. Sửa xong thì chốt lại.',
          '**Số lượng lệch DS google sheet (thừa/thiếu)?** Không sao nếu có lý do. Tìm thêm giấy ở kho; không có thì chốt và ghi giải trình.',
        ],
      },
    ],
  },
  {
    id: 'admin',
    tieuDe: 'Dành cho admin',
    khiNao: 'Chỉ tài khoản quản trị (BS Bùi Minh Khôi) thấy các mục này trên menu.',
    danhChoAdmin: true,
    khoi: [
      {
        tieuDe: 'Tổng quan',
        anh: { file: '15-admin-tong-quan.png', alt: 'Trang Tổng quan: bảng tiến độ theo nhân viên, thống kê theo đơn vị và nút xuất dữ liệu' },
        buoc: [
          { n: 1, t: 'Bảng **Tiến độ theo nhân viên**: ai đã làm đến đâu. Bấm tên để mở trang Phân công lọc theo người đó.' },
          { n: 2, t: 'Bảng **Thống kê theo đơn vị**: DS google sheet, trong danh sách, đã xác nhận, thừa/thiếu, từng cận lâm sàng.' },
          { n: 3, t: 'Nút **Xuất báo cáo Excel** và **Xuất gói cho Cowork (.zip)** ở phần Xuất dữ liệu & Báo cáo.' },
        ],
      },
      {
        tieuDe: 'Phân công',
        anh: { file: '15b-admin-phan-cong.png', alt: 'Trang Phân công: bộ lọc, ô chọn nhiều buổi và nút Gán' },
        buoc: [
          { n: 1, t: 'Dùng **bộ lọc** (đơn vị, người phụ trách, trạng thái, ngày) để thu hẹp danh sách buổi.' },
          { n: 2, t: 'Tích các buổi cần gán (hoặc **Chọn tất cả đang lọc**), chọn người ở ô **Gán cho**.' },
          { n: 3, t: 'Bấm **Gán**. Nút **Phân công theo DS google sheet** gán tự động theo gợi ý của sổ đoàn.' },
        ],
      },
      {
        ds: [
          '**Người dùng**: thêm tài khoản, khóa/mở khóa, đặt lại mật khẩu về `123456`.',
          '**Nạp dữ liệu**: nạp gói dữ liệu mới của Cowork. Luôn bấm **Chạy thử** và đọc kết quả trước khi nạp thật.',
          '**Nhật ký**: xem mọi thao tác sửa (ai, lúc nào, giá trị cũ và mới).',
          '**Mở khóa danh sách**: vào buổi đã chốt, bấm **Mở khóa**, ghi lý do.',
          '**Xuất**: cuối đợt, xuất gói Cowork và báo cáo Excel lần cuối rồi báo gỡ hệ thống.',
        ],
      },
    ],
  },
];
