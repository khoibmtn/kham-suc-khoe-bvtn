// fields.js — bảng mô tả field theo §5 SPEC: mã trường (cột DB lowercase),
// nhãn, widget, nhóm (A-F), danh mục dùng, nguồn dữ liệu ('data'|'suy'|'trong').
//
// widget: 'text' | 'number' | 'date' | 'checkbox' | 'dropdown' | 'icd' |
//         'radio5' | 'textarea' | 'readonly'

const FIELD_GROUPS = [
  { key: 'A', ten: 'A. Hành chính' },
  { key: 'B', ten: 'B. Tiền sử' },
  { key: 'C', ten: 'C. Thể lực & sinh hiệu' },
  { key: 'D', ten: 'D. Khám theo cơ quan' },
  { key: 'E', ten: 'E. Cận lâm sàng' },
  { key: 'F', ten: 'F. Kết luận' },
];

const FIELD_DEFS = [
  // ===== A. Hành chính =====
  { code: 'ma_cskcb', label: 'Mã CSKCB', widget: 'text', group: 'A', nguon: 'data' },
  { code: 'ma_gtin_cskcb', label: 'Mã GLN 13 ký tự', widget: 'text', group: 'A', nguon: 'trong' },
  { code: 'ngay_vao', label: 'Ngày khám sức khỏe', widget: 'date', group: 'A', nguon: 'data' },
  { code: 'ho_ten', label: 'Họ tên (IN HOA)', widget: 'text', group: 'A', nguon: 'data', uppercase: true },
  { code: 'gioi_tinh', label: 'Giới tính', widget: 'dropdown', catalog: 'gioi_tinh', group: 'A', nguon: 'data' },
  { code: 'ngay_sinh', label: 'Ngày sinh', widget: 'date', group: 'A', nguon: 'suy' },
  { code: 'ma_dan_toc', label: 'Dân tộc', widget: 'dropdown', catalog: 'dmdantoc', group: 'A', nguon: 'suy' },
  { code: 'so_cccd', label: 'Số CCCD', widget: 'text', group: 'A', nguon: 'data' },
  { code: 'ngaycap_cccd', label: 'Ngày cấp CCCD', widget: 'date', group: 'A', nguon: 'data' },
  { code: 'noicap_cccd', label: 'Nơi cấp CCCD', widget: 'text', group: 'A', nguon: 'data' },
  { code: 'matinh_cu_tru', label: 'Tỉnh/TP', widget: 'dropdown', catalog: 'dmtinh', group: 'A', nguon: 'suy' },
  { code: 'maxa_cu_tru', label: 'Xã/Phường', widget: 'dropdown', catalog: 'xa', group: 'A', nguon: 'data' },
  { code: 'dia_chi', label: 'Nơi ở hiện tại', widget: 'text', group: 'A', nguon: 'data' },
  { code: 'ma_nghe_nghiep', label: 'Nghề nghiệp', widget: 'dropdown', catalog: 'dmnghenghiep', group: 'A', nguon: 'suy' },
  { code: 'nhom_mau', label: 'Nhóm máu', widget: 'dropdown', catalog: 'nhom_mau', group: 'A', nguon: 'trong' },
  { code: 'doi_tuong', label: 'Đối tượng khám', widget: 'dropdown', catalog: 'doi_tuong', group: 'A', nguon: 'suy' },
  { code: 'nguon_chi_tra', label: 'Nguồn chi trả', widget: 'dropdown', catalog: 'nguon_kinh_phi', group: 'A', nguon: 'suy' },
  { code: 'noi_lam_viec_hoc_tap', label: 'Nơi làm việc', widget: 'text', group: 'A', nguon: 'trong' },
  { code: 'dien_thoai', label: 'Điện thoại', widget: 'text', group: 'A', nguon: 'trong' },
  { code: 'ly_do_vv', label: 'Lý do khám', widget: 'text', group: 'A', nguon: 'suy' },
  { code: 'ma_loai_kcb', label: 'Loại hình KCB', widget: 'dropdown', catalog: 'loai_kcb', group: 'A', nguon: 'suy' },

  // ===== B. Tiền sử =====
  { code: 'tsgd_mac_benh', label: 'Gia đình mắc bệnh', widget: 'checkbox', group: 'B', nguon: 'suy' },
  { code: 'tsgd_ma_benh', label: 'Tiền sử bệnh gia đình', widget: 'icd', group: 'B', nguon: 'trong' },
  { code: 'tsbt_benh_trong_5_nam_qua', label: 'Bệnh trong 5 năm qua', widget: 'checkbox', group: 'B', nguon: 'suy' },
  { code: 'tsbt_benh_than_kinh', label: 'Bệnh thần kinh', widget: 'checkbox', group: 'B', nguon: 'suy' },
  { code: 'tsbt_benh_mat', label: 'Bệnh mắt', widget: 'checkbox', group: 'B', nguon: 'suy' },
  { code: 'tsbt_benh_tai', label: 'Bệnh tai', widget: 'checkbox', group: 'B', nguon: 'suy' },
  { code: 'tsbt_benh_tim', label: 'Bệnh tim', widget: 'checkbox', group: 'B', nguon: 'suy' },
  { code: 'tsbt_phau_thuat_tim', label: 'Phẫu thuật tim', widget: 'checkbox', group: 'B', nguon: 'suy' },
  { code: 'tsbt_tang_huyet_ap', label: 'Tăng huyết áp', widget: 'checkbox', group: 'B', nguon: 'suy' },
  { code: 'tsbt_kho_tho', label: 'Khó thở', widget: 'checkbox', group: 'B', nguon: 'suy' },
  { code: 'tsbt_benh_phoi', label: 'Bệnh phổi', widget: 'checkbox', group: 'B', nguon: 'suy' },
  { code: 'tsbt_benh_than', label: 'Bệnh thận', widget: 'checkbox', group: 'B', nguon: 'suy' },
  { code: 'tsbt_nghien_ruou', label: 'Nghiện rượu', widget: 'checkbox', group: 'B', nguon: 'suy' },
  { code: 'tsbt_dai_thao_duong', label: 'Đái tháo đường', widget: 'checkbox', group: 'B', nguon: 'suy' },
  { code: 'tsbt_benh_tam_than', label: 'Bệnh tâm thần', widget: 'checkbox', group: 'B', nguon: 'suy' },
  { code: 'tsbt_mat_y_thuc', label: 'Mất ý thức', widget: 'checkbox', group: 'B', nguon: 'suy' },
  { code: 'tsbt_ngat', label: 'Ngất', widget: 'checkbox', group: 'B', nguon: 'suy' },
  { code: 'tsbt_benh_tieu_hoa', label: 'Bệnh tiêu hóa', widget: 'checkbox', group: 'B', nguon: 'suy' },
  { code: 'tsbt_roi_loan_giac_ngu', label: 'Rối loạn giấc ngủ', widget: 'checkbox', group: 'B', nguon: 'suy' },
  { code: 'tsbt_tai_bien', label: 'Tai biến', widget: 'checkbox', group: 'B', nguon: 'suy' },
  { code: 'tsbt_benh_cot_song', label: 'Bệnh cột sống', widget: 'checkbox', group: 'B', nguon: 'suy' },
  { code: 'tsbt_ruou_thuong_xuyen', label: 'Uống rượu thường xuyên', widget: 'checkbox', group: 'B', nguon: 'suy' },
  { code: 'tsbt_ma_tuy', label: 'Ma túy', widget: 'checkbox', group: 'B', nguon: 'suy' },
  { code: 'tsbt_benh_khac', label: 'Bệnh khác', widget: 'checkbox', group: 'B', nguon: 'suy' },
  { code: 'tsbt_ma_benh_khac', label: 'Tên bệnh khác', widget: 'icd', group: 'B', nguon: 'suy' },
  { code: 'tsbt_dang_dieu_tri_benh', label: 'Đang điều trị', widget: 'checkbox', group: 'B', nguon: 'suy' },
  { code: 'tsbt_ma_benh', label: 'Tên bệnh tiền sử', widget: 'icd', group: 'B', nguon: 'suy' },
  { code: 'tsbt_ten_thuoc_lieu_luong', label: 'Thuốc & liều', widget: 'text', group: 'B', nguon: 'trong' },
  { code: 'tsbt_thai_san', label: 'Tiền sử thai sản', widget: 'checkbox', group: 'B', nguon: 'suy' },
  { code: 'tsbt_ma_benh_thai_san', label: 'Bệnh thai sản', widget: 'icd', group: 'B', nguon: 'trong' },
  { code: 'tsbt_ten_thuoc_thai_san', label: 'Biện pháp tránh thai', widget: 'text', group: 'B', nguon: 'trong' },

  // ===== C. Thể lực & sinh hiệu =====
  { code: 'chieu_cao', label: 'Chiều cao (cm)', widget: 'number', group: 'C', nguon: 'trong' },
  { code: 'can_nang', label: 'Cân nặng (kg)', widget: 'number', group: 'C', nguon: 'trong' },
  { code: 'chi_so_bmi', label: 'BMI', widget: 'readonly', group: 'C', nguon: 'trong' },
  { code: 'mach', label: 'Mạch (lần/phút)', widget: 'text', group: 'C', nguon: 'trong' },
  { code: 'huyet_ap', label: 'Huyết áp (vd 120/80)', widget: 'text', group: 'C', nguon: 'trong' },
  { code: 'kham_the_luc_pl', label: 'Phân loại thể lực', widget: 'radio5', group: 'C', nguon: 'trong' },

  // ===== D. Khám theo cơ quan =====
  { code: 'noi_khoa_tuan_hoan', label: 'Khám Tuần hoàn', widget: 'text', group: 'D', nguon: 'data' },
  { code: 'noi_khoa_tuan_hoan_pl', label: 'Phân loại Tuần hoàn', widget: 'radio5', group: 'D', nguon: 'data' },
  { code: 'noi_khoa_ho_hap', label: 'Khám Hô hấp', widget: 'text', group: 'D', nguon: 'data' },
  { code: 'noi_khoa_ho_hap_pl', label: 'Phân loại Hô hấp', widget: 'radio5', group: 'D', nguon: 'data' },
  { code: 'noi_khoa_tieu_hoa', label: 'Khám Tiêu hóa', widget: 'text', group: 'D', nguon: 'data' },
  { code: 'noi_khoa_tieu_hoa_pl', label: 'Phân loại Tiêu hóa', widget: 'radio5', group: 'D', nguon: 'data' },
  { code: 'noi_khoa_than_tn_sd', label: 'Khám Thận - TN - SD', widget: 'text', group: 'D', nguon: 'data' },
  { code: 'noi_khoa_than_tietnieu_pl', label: 'Phân loại Thận - TN - SD', widget: 'radio5', group: 'D', nguon: 'data' },
  { code: 'noi_khoa_noi_tiet', label: 'Khám Nội tiết', widget: 'text', group: 'D', nguon: 'data' },
  { code: 'noi_khoa_noi_tiet_pl', label: 'Phân loại Nội tiết', widget: 'radio5', group: 'D', nguon: 'data' },
  { code: 'noi_khoa_co_xuong_khop', label: 'Khám Cơ - Xương - Khớp', widget: 'text', group: 'D', nguon: 'data' },
  { code: 'noi_khoa_co_xuong_khop_pl', label: 'Phân loại Cơ - Xương - Khớp', widget: 'radio5', group: 'D', nguon: 'data' },
  { code: 'noi_khoa_than_kinh', label: 'Khám Thần kinh', widget: 'text', group: 'D', nguon: 'data' },
  { code: 'noi_khoa_than_kinh_pl', label: 'Phân loại Thần kinh', widget: 'radio5', group: 'D', nguon: 'data' },
  { code: 'noi_khoa_tam_than', label: 'Khám Tâm thần', widget: 'text', group: 'D', nguon: 'data' },
  { code: 'noi_khoa_tam_than_pl', label: 'Phân loại Tâm thần', widget: 'radio5', group: 'D', nguon: 'data' },
  { code: 'ket_qua_kham_ngoai_khoa', label: 'Khám Ngoại khoa', widget: 'text', group: 'D', nguon: 'data' },
  { code: 'kham_ngoai_khoa_pl', label: 'Phân loại Ngoại khoa', widget: 'radio5', group: 'D', nguon: 'data' },
  { code: 'ket_qua_kham_da_lieu', label: 'Khám Da liễu', widget: 'text', group: 'D', nguon: 'data' },
  { code: 'kham_da_lieu_pl', label: 'Phân loại Da liễu', widget: 'radio5', group: 'D', nguon: 'data' },
  { code: 'ket_qua_kham_san_phu_khoa', label: 'Khám Sản phụ khoa', widget: 'text', group: 'D', nguon: 'data' },
  { code: 'kham_san_phu_khoa_pl', label: 'Phân loại Sản phụ khoa', widget: 'radio5', group: 'D', nguon: 'data' },
  { code: 'khong_kinh_mat_phai', label: 'Không kính - mắt phải', widget: 'dropdown', catalog: 'thi_luc', group: 'D', nguon: 'trong' },
  { code: 'khong_kinh_mat_trai', label: 'Không kính - mắt trái', widget: 'dropdown', catalog: 'thi_luc', group: 'D', nguon: 'trong' },
  { code: 'co_kinh_mat_phai', label: 'Có kính - mắt phải', widget: 'dropdown', catalog: 'thi_luc', group: 'D', nguon: 'trong' },
  { code: 'co_kinh_mat_trai', label: 'Có kính - mắt trái', widget: 'dropdown', catalog: 'thi_luc', group: 'D', nguon: 'trong' },
  { code: 'benh_khac_mat', label: 'Bệnh về mắt', widget: 'text', group: 'D', nguon: 'data' },
  { code: 'kham_mat_pl', label: 'Phân loại Mắt', widget: 'radio5', group: 'D', nguon: 'data' },
  { code: 'tai_trai_noi_thuong', label: 'Tai trái nói thường (m)', widget: 'number', group: 'D', nguon: 'trong' },
  { code: 'tai_trai_noi_tham', label: 'Tai trái nói thầm (m)', widget: 'number', group: 'D', nguon: 'trong' },
  { code: 'tai_phai_noi_thuong', label: 'Tai phải nói thường (m)', widget: 'number', group: 'D', nguon: 'trong' },
  { code: 'tai_phai_noi_tham', label: 'Tai phải nói thầm (m)', widget: 'number', group: 'D', nguon: 'trong' },
  { code: 'benh_khac_tai_mui_hong', label: 'Bệnh Tai - Mũi - Họng', widget: 'text', group: 'D', nguon: 'data' },
  { code: 'kham_tai_mui_hong_pl', label: 'Phân loại TMH', widget: 'radio5', group: 'D', nguon: 'data' },
  { code: 'ham_tren', label: 'Khám hàm trên', widget: 'text', group: 'D', nguon: 'trong' },
  { code: 'ham_duoi', label: 'Khám hàm dưới', widget: 'text', group: 'D', nguon: 'trong' },
  { code: 'benh_khac_rang_ham_mat', label: 'Bệnh Răng - Hàm - Mặt', widget: 'text', group: 'D', nguon: 'data' },
  { code: 'kham_rang_ham_mat_pl', label: 'Phân loại RHM', widget: 'radio5', group: 'D', nguon: 'data' },

  // ===== E. Cận lâm sàng (§6.3 — trường mở rộng phục vụ rà soát) =====
  { code: 'glu_thoi_diem', label: 'Glucose - thời điểm đo', widget: 'text', group: 'E', nguon: 'data' },
  { code: 'glu_gia_tri', label: 'Glucose mao mạch (mmol/L)', widget: 'number', group: 'E', nguon: 'data' },
  { code: 'kq_dien_tim', label: 'Kết quả điện tim', widget: 'textarea', group: 'E', nguon: 'data' },
  { code: 'kq_sieu_am_o_bung', label: 'Kết quả siêu âm ổ bụng', widget: 'textarea', group: 'E', nguon: 'data' },

  // ===== F. Kết luận =====
  { code: 'phan_loai_sk', label: 'Phân loại sức khỏe', widget: 'radio5', group: 'F', nguon: 'data' },
  { code: 'ket_luan_benh', label: 'Kết luận bệnh (bệnh chính)', widget: 'icd', group: 'F', nguon: 'data' },
  { code: 'cac_benh_tat_neu_co', label: 'Tình trạng sức khỏe (ghi chú)', widget: 'textarea', group: 'F', nguon: 'data' },
  { code: 'ma_benh_chinh', label: 'Mã ICD bệnh chính', widget: 'readonly', group: 'F', nguon: 'trong' },
  { code: 'co_quan_benh_chinh', label: 'Cơ quan bệnh chính', widget: 'readonly', group: 'F', nguon: 'trong' },
  { code: 'ma_benh_kem', label: 'Mã bệnh kèm', widget: 'readonly', group: 'F', nguon: 'trong' },
  { code: 'ten_benh_kem', label: 'Tên bệnh kèm', widget: 'readonly', group: 'F', nguon: 'trong' },
  { code: 'ghi_chu_ra_soat', label: 'Ghi chú rà soát (hệ thống)', widget: 'textarea', group: 'F', nguon: 'trong' },
  { code: 'ghi_chu_can_bo', label: 'Ghi chú nhân viên', widget: 'textarea', group: 'F', nguon: 'trong' },
];

const FIELD_BY_CODE = Object.fromEntries(FIELD_DEFS.map((f) => [f.code, f]));

// Đợt 6 criterion 1: MỌI trường number cần chuẩn hoá dấu thập phân (','->'.')
// khi blur — nguồn CHÂN LÝ DUY NHẤT phía frontend, khớp 1:1 với
// backend/services/sinh_hieu_valid.py:NUMERIC_FIELDS. mach có widget 'text'
// (không phải 'number') nhưng vẫn là trường số nên có mặt ở đây.
const NUMERIC_FIELD_CODES = new Set([
  'chieu_cao', 'can_nang', 'glu_gia_tri', 'tai_trai_noi_thuong',
  'tai_trai_noi_tham', 'tai_phai_noi_thuong', 'tai_phai_noi_tham', 'mach',
]);

const RADIO5_LABELS = { 1: 'I', 2: 'II', 3: 'III', 4: 'IV', 5: 'V' };

function fieldsOfGroup(g) {
  return FIELD_DEFS.filter((f) => f.group === g);
}

// Criterion 11 — nhóm D "Khám theo cơ quan" hiển thị dạng card: mỗi card có
// tiêu đề tên cơ quan, bên trong là (các) ô kết quả khám rồi hàng radio phân
// loại NGAY DƯỚI. 11 cặp text+_pl đơn giản + 3 card ghép (Mắt/TMH/RHM) —
// đúng 38 trường nhóm D, không thừa không thiếu (khớp FIELD_DEFS group 'D').
const ORGAN_CARDS_D = [
  { title: 'Tuần hoàn', fields: ['noi_khoa_tuan_hoan', 'noi_khoa_tuan_hoan_pl'] },
  { title: 'Hô hấp', fields: ['noi_khoa_ho_hap', 'noi_khoa_ho_hap_pl'] },
  { title: 'Tiêu hóa', fields: ['noi_khoa_tieu_hoa', 'noi_khoa_tieu_hoa_pl'] },
  { title: 'Thận - Tiết niệu - Sinh dục', fields: ['noi_khoa_than_tn_sd', 'noi_khoa_than_tietnieu_pl'] },
  { title: 'Nội tiết', fields: ['noi_khoa_noi_tiet', 'noi_khoa_noi_tiet_pl'] },
  { title: 'Cơ - Xương - Khớp', fields: ['noi_khoa_co_xuong_khop', 'noi_khoa_co_xuong_khop_pl'] },
  { title: 'Thần kinh', fields: ['noi_khoa_than_kinh', 'noi_khoa_than_kinh_pl'] },
  { title: 'Tâm thần', fields: ['noi_khoa_tam_than', 'noi_khoa_tam_than_pl'] },
  { title: 'Ngoại khoa', fields: ['ket_qua_kham_ngoai_khoa', 'kham_ngoai_khoa_pl'] },
  { title: 'Da liễu', fields: ['ket_qua_kham_da_lieu', 'kham_da_lieu_pl'] },
  { title: 'Sản phụ khoa', fields: ['ket_qua_kham_san_phu_khoa', 'kham_san_phu_khoa_pl'] },
  {
    title: 'Mắt',
    fields: ['khong_kinh_mat_phai', 'khong_kinh_mat_trai', 'co_kinh_mat_phai',
      'co_kinh_mat_trai', 'benh_khac_mat', 'kham_mat_pl'],
  },
  {
    title: 'Tai - Mũi - Họng',
    fields: ['tai_trai_noi_thuong', 'tai_trai_noi_tham', 'tai_phai_noi_thuong',
      'tai_phai_noi_tham', 'benh_khac_tai_mui_hong', 'kham_tai_mui_hong_pl'],
  },
  {
    title: 'Răng - Hàm - Mặt',
    fields: ['ham_tren', 'ham_duoi', 'benh_khac_rang_ham_mat', 'kham_rang_ham_mat_pl'],
  },
];
