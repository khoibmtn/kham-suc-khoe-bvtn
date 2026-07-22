-- schema.sql — CSDL SQLite ứng dụng quản lý & rà soát KSK NCT.
-- Đúng khớp field-by-field với khối SQL ở SPEC.md §2. Các bảng ngoài §2
-- (danh_muc, baseline_thongke, snapshot_ngay) là bổ sung theo PLAN.md,
-- không thay thế/đổi 6 bảng gốc.

PRAGMA foreign_keys = ON;

-- ========== NGƯỜI DÙNG & PHÂN CÔNG ==========
CREATE TABLE IF NOT EXISTS nguoi_dung (
  id            INTEGER PRIMARY KEY,
  ten_dang_nhap TEXT UNIQUE NOT NULL,
  ho_ten        TEXT NOT NULL,
  vai_tro       TEXT NOT NULL CHECK(vai_tro IN ('admin','ra_soat')),
  mat_khau_hash TEXT NOT NULL,
  dang_hoat_dong INTEGER DEFAULT 1
);

-- ========== HỒ SƠ ==========
CREATE TABLE IF NOT EXISTS ho_so (
  ma_ho_so      TEXT PRIMARY KEY,          -- 31006-2026-00001
  tt            INTEGER,                   -- số thứ tự trong file xã
  -- 103 trường của mẫu BYT: xem §5, lưu ĐÚNG TÊN MÃ TRƯỜNG
  ma_cskcb TEXT, ma_gtin_cskcb TEXT, ngay_vao TEXT, ho_ten TEXT,
  gioi_tinh TEXT, ngay_sinh TEXT, ma_dan_toc TEXT, so_cccd TEXT,
  ngaycap_cccd TEXT, noicap_cccd TEXT, matinh_cu_tru TEXT, maxa_cu_tru TEXT,
  dia_chi TEXT, ma_nghe_nghiep TEXT, nhom_mau TEXT, doi_tuong TEXT,
  nguon_chi_tra TEXT, noi_lam_viec_hoc_tap TEXT, dien_thoai TEXT,
  ly_do_vv TEXT, ma_loai_kcb TEXT,
  -- tiền sử (Y, AA–AY)
  tsgd_mac_benh TEXT, tsgd_ma_benh TEXT,
  tsbt_benh_trong_5_nam_qua TEXT, tsbt_benh_than_kinh TEXT,
  tsbt_benh_mat TEXT, tsbt_benh_tai TEXT, tsbt_benh_tim TEXT,
  tsbt_phau_thuat_tim TEXT, tsbt_tang_huyet_ap TEXT, tsbt_kho_tho TEXT,
  tsbt_benh_phoi TEXT, tsbt_benh_than TEXT, tsbt_nghien_ruou TEXT,
  tsbt_dai_thao_duong TEXT, tsbt_benh_tam_than TEXT, tsbt_mat_y_thuc TEXT,
  tsbt_ngat TEXT, tsbt_benh_tieu_hoa TEXT, tsbt_roi_loan_giac_ngu TEXT,
  tsbt_tai_bien TEXT, tsbt_benh_cot_song TEXT, tsbt_ruou_thuong_xuyen TEXT,
  tsbt_ma_tuy TEXT, tsbt_benh_khac TEXT, tsbt_ma_benh_khac TEXT,
  tsbt_dang_dieu_tri_benh TEXT, tsbt_ma_benh TEXT,
  tsbt_ten_thuoc_lieu_luong TEXT, tsbt_thai_san TEXT,
  tsbt_ma_benh_thai_san TEXT, tsbt_ten_thuoc_thai_san TEXT,
  -- thể lực
  chieu_cao REAL, can_nang REAL, chi_so_bmi REAL, mach TEXT, huyet_ap TEXT,
  kham_the_luc_pl INTEGER,
  -- khám theo cơ quan (text + phân loại)
  noi_khoa_tuan_hoan TEXT, noi_khoa_tuan_hoan_pl INTEGER,
  noi_khoa_ho_hap TEXT, noi_khoa_ho_hap_pl INTEGER,
  noi_khoa_tieu_hoa TEXT, noi_khoa_tieu_hoa_pl INTEGER,
  noi_khoa_than_tn_sd TEXT, noi_khoa_than_tietnieu_pl INTEGER,
  noi_khoa_noi_tiet TEXT, noi_khoa_noi_tiet_pl INTEGER,
  noi_khoa_co_xuong_khop TEXT, noi_khoa_co_xuong_khop_pl INTEGER,
  noi_khoa_than_kinh TEXT, noi_khoa_than_kinh_pl INTEGER,
  noi_khoa_tam_than TEXT, noi_khoa_tam_than_pl INTEGER,
  ket_qua_kham_ngoai_khoa TEXT, kham_ngoai_khoa_pl INTEGER,
  ket_qua_kham_da_lieu TEXT, kham_da_lieu_pl INTEGER,
  ket_qua_kham_san_phu_khoa TEXT, kham_san_phu_khoa_pl INTEGER,
  khong_kinh_mat_phai TEXT, khong_kinh_mat_trai TEXT,
  co_kinh_mat_phai TEXT, co_kinh_mat_trai TEXT,
  benh_khac_mat TEXT, kham_mat_pl INTEGER,
  tai_trai_noi_thuong TEXT, tai_trai_noi_tham TEXT,
  tai_phai_noi_thuong TEXT, tai_phai_noi_tham TEXT,
  benh_khac_tai_mui_hong TEXT, kham_tai_mui_hong_pl INTEGER,
  ham_tren TEXT, ham_duoi TEXT, benh_khac_rang_ham_mat TEXT,
  kham_rang_ham_mat_pl INTEGER,
  phan_loai_sk INTEGER, ket_luan_benh TEXT, cac_benh_tat_neu_co TEXT,
  -- ===== cột hỗ trợ tìm kiếm SQL-paginated (PLAN_PERF.md §2) =====
  -- ho_ten_kd: ho_ten không dấu + lowercase. search_blob_kd: gộp không dấu
  -- + lowercase của nhiều cột hiển thị (xem services/fuzzy.build_search_cols)
  -- -> tìm kiếm bằng WHERE ...LIKE '%kw%' KHÔNG cần quét Python.
  ho_ten_kd TEXT, search_blob_kd TEXT,
  -- ===== trường mở rộng (KHÔNG xuất ra file nộp Bộ) =====
  ma_benh_chinh TEXT, co_quan_benh_chinh TEXT,
  ma_benh_kem TEXT, ten_benh_kem TEXT,          -- ngăn bởi ';'
  nam_sinh_nguon INTEGER, tuoi INTEGER,
  glu_thoi_diem TEXT, glu_gia_tri REAL,
  kq_dien_tim TEXT, kq_sieu_am_o_bung TEXT,
  chan_doan_goc TEXT,                            -- chuỗi gốc người nhập gõ
  -- ===== quản lý rà soát =====
  nguoi_ra_soat_id INTEGER REFERENCES nguoi_dung(id),
  trang_thai    TEXT DEFAULT 'chua_ra_soat'
                CHECK(trang_thai IN ('chua_ra_soat','dang_ra_soat',
                                     'hoan_thanh','can_doi_chieu_giay')),
  co_qc         TEXT,      -- danh sách mã cờ ngăn bởi ';'
  so_loi        INTEGER DEFAULT 0,
  ghi_chu_ra_soat TEXT,
  ghi_chu_can_bo  TEXT,
  thoi_diem_hoan_thanh TEXT,
  da_xuat_file  INTEGER DEFAULT 0,
  lan_xuat_cuoi TEXT
);
CREATE INDEX IF NOT EXISTS idx_hoso_xa      ON ho_so(maxa_cu_tru);
CREATE INDEX IF NOT EXISTS idx_hoso_nguoi   ON ho_so(nguoi_ra_soat_id);
CREATE INDEX IF NOT EXISTS idx_hoso_tt      ON ho_so(trang_thai);
CREATE INDEX IF NOT EXISTS idx_hoso_ngay    ON ho_so(ngay_vao);
CREATE INDEX IF NOT EXISTS idx_hoso_cccd    ON ho_so(so_cccd);

-- ========== BỆNH CHI TIẾT ==========
CREATE TABLE IF NOT EXISTS benh (
  id            INTEGER PRIMARY KEY,
  ma_ho_so      TEXT NOT NULL REFERENCES ho_so(ma_ho_so) ON DELETE CASCADE,
  stt_benh      INTEGER,
  la_benh_chinh INTEGER DEFAULT 0,
  ma_icd        TEXT,
  ten_icd       TEXT,           -- LUÔN lấy nguyên văn từ dmicdme
  co_quan       TEXT,           -- TH|HH|TIEUHOA|THAN|NOITIET|CXK|TK|TT|
                                -- NGOAI|DALIEU|SAN|MAT|TMH|RHM
  muc_do_nang   INTEGER,        -- 1..5
  chuoi_goc     TEXT,           -- mẩu chữ người nhập gõ
  khai_niem     TEXT,
  nguon_anh_xa  TEXT,           -- tu_dien_khoi|rule|fuzzy|organ_fallback
  dien_giai_bs  TEXT,
  can_ra_soat   INTEGER DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_benh_hoso ON benh(ma_ho_so);
CREATE INDEX IF NOT EXISTS idx_benh_icd  ON benh(ma_icd);

-- ========== DANH MỤC ICD ==========
CREATE TABLE IF NOT EXISTS dm_icd (
  ma      TEXT PRIMARY KEY,     -- giữ nguyên dạng gốc, kể cả 'E11.4†'
  ma_tran TEXT,                 -- đã bỏ †/*  -> dùng để tra
  ten     TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_icd_tran ON dm_icd(ma_tran);
CREATE VIRTUAL TABLE IF NOT EXISTS dm_icd_fts USING fts5(ma, ten, content='dm_icd');

-- ========== NHẬT KÝ SỬA ==========
CREATE TABLE IF NOT EXISTS nhat_ky (
  id           INTEGER PRIMARY KEY,
  ma_ho_so     TEXT NOT NULL,
  nguoi_dung_id INTEGER,
  thoi_diem    TEXT DEFAULT (datetime('now','localtime')),
  ten_truong   TEXT,
  gia_tri_cu   TEXT,
  gia_tri_moi  TEXT
);
CREATE INDEX IF NOT EXISTS idx_nk_hoso ON nhat_ky(ma_ho_so);
CREATE INDEX IF NOT EXISTS idx_nk_nguoi ON nhat_ky(nguoi_dung_id, thoi_diem);

-- ========== PHÂN CÔNG THEO LÔ ==========
CREATE TABLE IF NOT EXISTS phan_cong (
  id            INTEGER PRIMARY KEY,
  nguoi_dung_id INTEGER REFERENCES nguoi_dung(id),
  pham_vi_loai  TEXT CHECK(pham_vi_loai IN ('xa','khoang_ma','danh_sach')),
  pham_vi_gia_tri TEXT,
  ngay_giao     TEXT DEFAULT (datetime('now','localtime')),
  ghi_chu       TEXT
);

-- =====================================================================
-- BỔ SUNG NGOÀI §2 (không thay đổi 6 bảng gốc ở trên) — theo PLAN.md
-- =====================================================================

-- Danh mục dùng cho dropdown (§1.2): tỉnh, dân tộc, nghề nghiệp, giới tính,
-- thị lực, loại hình KCB, đối tượng khám, nguồn kinh phí...
CREATE TABLE IF NOT EXISTS danh_muc (
  id    INTEGER PRIMARY KEY,
  loai  TEXT NOT NULL,   -- 'dmtinh' | 'dmdantoc' | 'dmnghenghiep' | 'gioi_tinh'
                         -- | 'thi_luc' | 'loai_kcb' | 'doi_tuong' | 'nguon_kinh_phi'
  ma    TEXT,
  ten   TEXT NOT NULL,
  thu_tu INTEGER
);
CREATE INDEX IF NOT EXISTS idx_danhmuc_loai ON danh_muc(loai);

-- Số liệu nền lúc nạp (baseline) — dashboard P3 so sánh hiện tại vs baseline.
CREATE TABLE IF NOT EXISTS baseline_thongke (
  nhom  TEXT NOT NULL,    -- 'co_qc' | 'co_quan_benh_chinh' | 'tong_quan'
  ma    TEXT NOT NULL,
  ten   TEXT,
  gia_tri INTEGER NOT NULL,
  thoi_diem_nap TEXT DEFAULT (datetime('now','localtime')),
  PRIMARY KEY (nhom, ma)
);

-- Snapshot hằng ngày số cờ đỏ còn lại — phục vụ biểu đồ §8.4 "cờ đỏ giảm
-- theo ngày". Ghi 1 dòng/ngày lúc khởi động server hoặc khi có ngày mới.
CREATE TABLE IF NOT EXISTS snapshot_ngay (
  ngay          TEXT PRIMARY KEY,   -- yyyy-mm-dd
  so_co_do      INTEGER NOT NULL,
  so_da_ra_soat INTEGER NOT NULL,
  chi_tiet_co   TEXT                -- JSON {ma_co: so_luong}
);

-- Cài đặt hệ thống dạng khoá/giá trị JSON (Đợt 3 criterion 1) — hiện dùng
-- cho ngưỡng sinh hiệu (khoa='nguong_sinh_hieu', gia_tri=JSON). Seed mặc
-- định do services/sinh_hieu_valid.py:load_nguong() ghi ở lần đọc đầu tiên
-- nếu chưa có dòng nào (không seed cứng ở đây để tránh phụ thuộc thứ tự).
CREATE TABLE IF NOT EXISTS cai_dat (
  khoa    TEXT PRIMARY KEY,
  gia_tri TEXT
);
