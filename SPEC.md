# SPEC — Ứng dụng quản lý & rà soát dữ liệu Khám sức khỏe Người cao tuổi

> **Đối tượng đọc:** Claude Code. Đọc hết file này rồi lập plan, không cần hỏi thêm.
> **Bối cảnh:** TTYT Thủy Nguyên (mã CSKCB `31006`), đợt KSK NCT 2026,
> **13.326 hồ sơ** tại 8 xã/phường. Dữ liệu đã được chuẩn hóa sẵn bằng pipeline
> Python trong `build/`; app KHÔNG xử lý lại từ đầu mà nạp kết quả đã chuẩn hóa.

---

## 0. TL;DR — 3 pipeline cần xây

| # | Pipeline | Mục tiêu |
|---|---|---|
| 1 | **Rà soát** | Mỗi cán bộ được giao một tập hồ sơ, tra cứu cực nhanh, sửa bằng bàn phím, rời ô là tự lưu |
| 2 | **Xuất file** | Sinh file `.xlsm` đúng mẫu Bộ Y tế, có option thêm cột mở rộng |
| 3 | **Dashboard** | Tiến độ theo xã / theo cán bộ, số hồ sơ hoàn thành, đã xuất |

---

## 1. CẦN ĐỌC FILE NÀO

### 1.1. Đọc để NẠP DỮ LIỆU (bắt buộc)

**`output/KSK_DuLieuQuanLy_TOANBO.xlsx`** — nguồn nạp chính, 4 sheet:

| Sheet | Số dòng | Nội dung |
|---|---:|---|
| `BENH_NHAN` | 13.326 | 1 dòng/người, 34 cột |
| `BENH_CHI_TIET` | 39.645 | 1 dòng/bệnh, khóa ngoại `MA_HO_SO` |
| `PHAN_LOAI_CO_QUAN` | 186.564 | 1 dòng/(người × 14 cơ quan) |
| `TU_DIEN_ICD` | 3.850 | Từ điển khái niệm → ICD đã dùng |

### 1.2. Đọc để LẤY DANH MỤC (bắt buộc — dùng cho dropdown)

**`doc/Import_KSK_Tren 18.xlsm`** — file mẫu Bộ Y tế. Nạp các sheet ẩn:

| Sheet | Dòng | Dùng cho |
|---|---:|---|
| `dmicdme` | 35.735 | Danh mục ICD-10. Cột A = mã, cột B = **tên chính thức** |
| `dmtinh` | 34 | Tỉnh/TP |
| `dmdantoc` | 56 | Dân tộc |
| `dmnghenghiep` | 1.070 | Nghề nghiệp |
| `dmkhac` | — | Các list nhỏ: `AL2:AL4` giới tính, `BF2:BF12` thị lực, `BJ1:BJ16` loại hình KCB |
| `Hướng dẫn` | — | `B9:B24` đối tượng khám, `G8:G13` nguồn kinh phí |

⚠️ `dmxa` **rỗng** (do sắp xếp đơn vị hành chính 2025). Xã/phường nhập dạng text,
lấy list 8 giá trị từ dữ liệu thực tế (§6.2).

⚠️ Mã ICD trong `dmicdme` dùng quy ước **dagger/asterisk** — có mã là `E11.4†`.
Khi đánh index phải index **cả 2 dạng** (`E11.4†` và `E11.4`), nếu không tra
theo mã trần sẽ trượt.

### 1.3. Đọc để HIỂU LOGIC (nên đọc, không sửa)

| File | Nội dung |
|---|---|
| `build/normalize.py` | Tách & chuẩn hóa chuỗi chẩn đoán |
| `build/icd_map.py` | ~275 rule regex → ICD + cơ quan |
| `build/user_dict.py` | Nạp từ điển bác sĩ đã diễn giải |
| `build/mapper.py` | Bộ ánh xạ hợp nhất (thứ tự ưu tiên) |
| `build/classify.py` | Phân loại sức khỏe theo QĐ 1613 |
| `build/tien_su.py` | Suy luận cột tiền sử Y, AA–AY |
| `build/build_xlsm.py` | **Xuất file .xlsm — pipeline 2 gọi lại hàm ở đây** |
| `build/qd1613_fulltext.txt` | Toàn văn QĐ 1613/BYT-QĐ |

### 1.4. KHÔNG cần đọc
`tong-hop.xlsx`, `2026 KSKNCT 1.xlsx`, `2026 KSKNCT 2.xlsx` — dữ liệu thô, đã
được xử lý xong. Chỉ mở khi cần truy vết thủ công.

---

## 2. MÔ HÌNH DỮ LIỆU (SQLite)

```sql
-- ========== NGƯỜI DÙNG & PHÂN CÔNG ==========
CREATE TABLE nguoi_dung (
  id            INTEGER PRIMARY KEY,
  ten_dang_nhap TEXT UNIQUE NOT NULL,
  ho_ten        TEXT NOT NULL,
  vai_tro       TEXT NOT NULL CHECK(vai_tro IN ('admin','ra_soat')),
  mat_khau_hash TEXT NOT NULL,
  dang_hoat_dong INTEGER DEFAULT 1
);

-- ========== HỒ SƠ ==========
CREATE TABLE ho_so (
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
CREATE INDEX idx_hoso_xa      ON ho_so(maxa_cu_tru);
CREATE INDEX idx_hoso_nguoi   ON ho_so(nguoi_ra_soat_id);
CREATE INDEX idx_hoso_tt      ON ho_so(trang_thai);
CREATE INDEX idx_hoso_ngay    ON ho_so(ngay_vao);
CREATE INDEX idx_hoso_cccd    ON ho_so(so_cccd);

-- ========== BỆNH CHI TIẾT ==========
CREATE TABLE benh (
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
CREATE INDEX idx_benh_hoso ON benh(ma_ho_so);
CREATE INDEX idx_benh_icd  ON benh(ma_icd);

-- ========== DANH MỤC ICD ==========
CREATE TABLE dm_icd (
  ma      TEXT PRIMARY KEY,     -- giữ nguyên dạng gốc, kể cả 'E11.4†'
  ma_tran TEXT,                 -- đã bỏ †/*  -> dùng để tra
  ten     TEXT NOT NULL
);
CREATE INDEX idx_icd_tran ON dm_icd(ma_tran);
CREATE VIRTUAL TABLE dm_icd_fts USING fts5(ma, ten, content='dm_icd');

-- ========== NHẬT KÝ SỬA ==========
CREATE TABLE nhat_ky (
  id           INTEGER PRIMARY KEY,
  ma_ho_so     TEXT NOT NULL,
  nguoi_dung_id INTEGER,
  thoi_diem    TEXT DEFAULT (datetime('now','localtime')),
  ten_truong   TEXT,
  gia_tri_cu   TEXT,
  gia_tri_moi  TEXT
);
CREATE INDEX idx_nk_hoso ON nhat_ky(ma_ho_so);
CREATE INDEX idx_nk_nguoi ON nhat_ky(nguoi_dung_id, thoi_diem);

-- ========== PHÂN CÔNG THEO LÔ ==========
CREATE TABLE phan_cong (
  id            INTEGER PRIMARY KEY,
  nguoi_dung_id INTEGER REFERENCES nguoi_dung(id),
  pham_vi_loai  TEXT CHECK(pham_vi_loai IN ('xa','khoang_ma','danh_sach')),
  pham_vi_gia_tri TEXT,
  ngay_giao     TEXT DEFAULT (datetime('now','localtime')),
  ghi_chu       TEXT
);
```

**Nạp dữ liệu ban đầu:** script `import_data.py` đọc 4 sheet ở §1.1 + danh mục
ở §1.2 → ghi vào SQLite. Chạy 1 lần, idempotent (upsert theo `ma_ho_so`).

---

## 3. PIPELINE 1 — RÀ SOÁT

### 3.1. Phân công
- Admin gán hồ sơ cho cán bộ theo **xã**, theo **khoảng mã hồ sơ**, hoặc
  **danh sách chọn tay**.
- Mọi hồ sơ luôn có `nguoi_ra_soat_id`. Cán bộ chỉ thấy hồ sơ của mình;
  admin thấy tất cả.
- Mọi thay đổi ghi vào `nhat_ky` kèm `nguoi_dung_id` — bắt buộc, vì dữ liệu
  này sẽ nộp Bộ.

### 3.2. Màn hình DANH SÁCH (màn hình chính)

**Bố cục:** thanh lọc trên cùng → bảng kết quả → khung chi tiết bên phải
(hoặc trang riêng).

**Bộ lọc — tất cả phải thao tác được bằng bàn phím:**

| Bộ lọc | Kiểu | Ghi chú |
|---|---|---|
| Xã/phường | dropdown đa chọn | 8 giá trị, xem §6.2 |
| Ngày khám | date range picker | có preset: hôm nay, tuần này, cả đợt |
| Họ tên | ô text, **tìm fuzzy** | xem §3.3 |
| Số CCCD | ô text, khớp một phần | |
| Mã hồ sơ | ô text | |
| Trạng thái | dropdown | chưa/đang/hoàn thành/cần đối chiếu giấy |
| Cán bộ rà soát | dropdown | chỉ admin |
| **Cờ cảnh báo** | checkbox nhiều lựa chọn | mỗi cờ ở §4 là một checkbox |
| Phân loại SK | checkbox I–V | |
| Cơ quan bệnh chính | dropdown | 14 giá trị |

**Bảng kết quả:** Mã hồ sơ · Họ tên · Năm sinh · Giới · Xã · Ngày khám ·
Phân loại SK · Bệnh chính · Số cờ · Trạng thái.
Dòng có cờ đỏ tô nền đỏ nhạt, cờ vàng nền vàng nhạt.

**Phím tắt bắt buộc:**

| Phím | Tác dụng |
|---|---|
| `/` | Nhảy vào ô tìm kiếm |
| `↑` `↓` | Di chuyển trong danh sách kết quả |
| `Enter` | Mở hồ sơ đang chọn |
| `Esc` | Đóng chi tiết, quay lại danh sách |
| `Ctrl+↓` / `Ctrl+↑` | Hồ sơ kế tiếp / trước đó (khi đang mở chi tiết) |
| `Ctrl+S` | Đánh dấu hoàn thành + mở hồ sơ kế tiếp |
| `Ctrl+K` | Bảng lệnh nhanh |
| `F2` | Sửa ô đang focus |
| `Alt+1..9` | Nhảy tới nhóm trường tương ứng |

### 3.3. Tìm fuzzy họ tên
- Bỏ dấu tiếng Việt trước khi so khớp: `nguyen van a` khớp `NGUYỄN VĂN A`.
- Dùng `difflib.SequenceMatcher` (hoặc `rapidfuzz` nếu có), ngưỡng 0,75,
  sắp theo điểm giảm dần.
- Khớp cả **một phần từ**: gõ `thanh` ra `NGUYỄN THỊ THANH`.
- Debounce 200 ms, giới hạn 50 kết quả.

### 3.4. Màn hình CHI TIẾT — quy tắc bắt buộc

1. **Hiển thị đủ 103 trường của mẫu BYT** (§5), chia nhóm có thể gập:
   `A. Hành chính` · `B. Tiền sử` · `C. Thể lực & sinh hiệu` ·
   `D. Khám theo cơ quan` · `E. Cận lâm sàng` · `F. Kết luận`.
2. **Khung "Chẩn đoán gốc" luôn hiện, ghim ở đầu, chỉ đọc** — cán bộ đối chiếu
   từng ký tự người nhập đã gõ.
3. **Rời ô là tự lưu** (`onBlur` → PATCH → ghi `nhat_ky`). Hiện chỉ báo
   "Đã lưu" thoáng qua. Không có nút Lưu.
4. **Widget theo kiểu trường** — xem cột "Widget" ở §5:
   - `Có/Không` → **checkbox** (tick = "Có"), `Space` để bật/tắt.
   - Danh mục cố định → **dropdown** có gõ-để-lọc.
   - ICD → ô tự động gợi ý, tra trên `dm_icd_fts`, hiện `mã — tên`,
     **lưu tên nguyên văn** vào CSDL.
   - Phân loại 1–5 → nhóm nút radio, gõ phím `1`–`5` để chọn.
   - Ngày → ô text `dd/mm/yyyy` + lịch, tự chèn dấu `/`.
5. **Trường máy suy luận phải phân biệt được với dữ liệu gốc**: viền vàng +
   biểu tượng ⚠ + tooltip nói rõ lý do. Cán bộ xác nhận → viền chuyển xanh,
   gỡ cờ tương ứng.
6. **Bảng bệnh** (từ `benh`): thêm/sửa/xóa dòng; đổi bệnh chính bằng nút radio
   một-lựa-chọn; mỗi dòng hiện `chuoi_goc` và `nguon_anh_xa`.
7. **Kiểm tra tức thời** khi sửa phân loại: nếu
   `max(14 phân loại cơ quan) ≠ phan_loai_sk` → hiện dải cảnh báo đỏ, nêu rõ
   cơ quan nào đang cao nhất, kèm nút "Lấy theo mức nặng nhất".

### 3.5. Trường bổ sung phục vụ rà soát (ngoài 103 trường mẫu)
`trang_thai`, `nguoi_ra_soat_id`, `ghi_chu_can_bo`, `co_qc`, `so_loi`,
`chan_doan_goc`, `ma_benh_chinh`, `ma_benh_kem`, `ten_benh_kem`,
`co_quan_benh_chinh`, `glu_thoi_diem`, `glu_gia_tri`, `kq_dien_tim`,
`kq_sieu_am_o_bung`, `nam_sinh_nguon`, `tuoi`.

---

## 4. CỜ CẢNH BÁO (`co_qc`) — mỗi cờ là một checkbox lọc

| Mã cờ | Số ca | Mức | Ý nghĩa & việc cán bộ phải làm |
|---|---:|---|---|
| `NGAY_SINH_UOC_LUONG` | 13.317 | 🟡 | Nguồn chỉ có năm sinh, ngày/tháng là quy ước `01/01`. Bổ sung ngày thật nếu có |
| `THIEU_CCCD` | 1.654 | 🔴 | Không có số định danh. **Chặn xuất file** nếu chưa bổ sung |
| `CCCD_TRUNG` | 139 | 🔴 | 69 số CCCD bị dùng cho 139 bản ghi. App **tự tính khi nạp**, không có sẵn trong file. Có thể là trùng thật (2 người 1 số) hoặc 1 người khám 2 lần — phải phân biệt |
| `CO_PHAN_LOAI_NHUNG_KHONG_CO_CHAN_DOAN` | 138 | 🔴 | Xếp loại IV–V nhưng không ghi chẩn đoán nào. Phải đối chiếu sổ giấy |
| `CON_CHAN_DOAN_CHUA_ANH_XA` | 86 | 🟠 | Còn mẩu chữ chưa gán được ICD. Hiện chuỗi gốc, cho chọn ICD |
| `NGUON_DANH_DAU_NHIEU_PHAN_LOAI` | 21 | 🟠 | File gốc tích nhiều ô phân loại. Đang lấy mức nặng nhất, cần xác nhận |
| `THI_LUC_CHUA_RO_BEN_MAT` | 4 | 🟠 | Ghi `mắt 3/10` không rõ bên. Đang tạm ghi mắt trái |
| `ICD_MAY_TU_SUA_LOI_GO` | 2 | 🟠 | Máy đoán lỗi gõ và tự sửa. Hiện khái niệm neo + độ giống |
| `ICD_KHONG_DAC_HIEU` | 1 | 🟡 | Chỉ biết cơ quan, mã chung chung. Gợi ý chọn mã cụ thể hơn |
| `NAM_SINH_SAI_NGUON` | 0 | 🟠 | Năm sinh vô lý, đã suy từ tuổi |
| `THIEU_SINH_HIEU` | 13.326 | 🟡 | Chiều cao/cân nặng/mạch/HA/thị lực/thính lực **chưa có** — xem §6.4 |

App tự tính thêm `CCCD_TRUNG` và `THIEU_SINH_HIEU` lúc nạp.

---

## 5. BẢNG 103 TRƯỜNG CỦA MẪU BYT

Cột `Widget` quyết định giao diện. Cột `Nguồn` cho biết dữ liệu ở đâu ra:
`data` = có sẵn · `suy` = máy suy luận (phải gắn cờ) · `trống` = chờ nhập.

| # | Cột | Mã trường | Nhãn | Widget | Nguồn |
|---:|---|---|---|---|---|
| 1 | A | `TT` | Số thứ tự | auto | data |
| 2 | B | `MA_CSKCB` | Mã CSKCB | text (mặc định `31006`) | data |
| 3 | C | `MA_GTIN_CSKCB` | Mã GLN 13 ký tự | text | **trống** |
| 4 | D | `NGAY_VAO` | Ngày khám sức khỏe | date `dd/mm/yyyy` | data |
| 5 | E | `HO_TEN` | Họ tên (IN HOA) | text | data |
| 6 | F | `GIOI_TINH` | Giới tính | dropdown `GioiTinh` | data |
| 7 | G | `NGAY_SINH` | Ngày sinh | date | **suy** |
| 8 | H | `MA_DAN_TOC` | Dân tộc | dropdown `DM_dantoc` | suy (mặc định Kinh) |
| 9 | I | `SO_CCCD` | Số CCCD | text 12 số | data |
| 10 | J | `NGAYCAP_CCCD` | Ngày cấp CCCD | date | data |
| 11 | K | `NOICAP_CCCD` | Nơi cấp CCCD | text | data |
| 12 | L | `MATINH_CU_TRU` | Tỉnh/TP | dropdown `TINH` | suy (Hải Phòng) |
| 14 | N | `MAXA_CU_TRU` | Xã/Phường | dropdown 8 giá trị | data |
| 16 | P | `DIA_CHI` | Nơi ở hiện tại | text | data |
| 17 | Q | `MA_NGHE_NGHIEP` | Nghề nghiệp | dropdown `NgheNghiep` | suy (Không xác định) |
| 18 | R | `NHOM_MAU` | Nhóm máu | dropdown `A,B,AB,O` | **trống** |
| 19 | S | `DOI_TUONG` | Đối tượng khám | dropdown `DM_DTkham` | suy (Người cao tuổi) |
| 20 | T | `NGUON_CHI_TRA` | Nguồn chi trả | dropdown `DM_Nguonkinhphi` | suy (NS Địa phương) |
| 21 | U | `NOI_LAM_VIEC_HOC_TAP` | Nơi làm việc | text | trống |
| 22 | V | `DIEN_THOAI` | Điện thoại | text | **trống** |
| 23 | W | `LY_DO_VV` | Lý do khám | text | suy |
| 24 | X | `MA_LOAI_KCB` | Loại hình KCB | dropdown `DM_LHkcb` | suy (KSK định kỳ) |
| 25 | Y | `TSGD_MAC_BENH` | Gia đình mắc bệnh | **checkbox** | suy (Không) |
| 26 | Z | `TSGD_MA_BENH` | Tiền sử bệnh gia đình | **ICD autocomplete** | trống |
| 27 | AA | `TSBT_BENH_TRONG_5_NAM_QUA` | Bệnh trong 5 năm qua | **checkbox** | suy |
| 28–47 | AB–AU | 20 trường `TSBT_*` | Tiền sử theo nhóm bệnh | **checkbox** | suy |
| 48 | AV | `TSBT_BENH_KHAC` | Bệnh khác | **checkbox** | suy |
| 49 | AW | `TSBT_MA_BENH_KHAC` | Tên bệnh khác | **ICD autocomplete** ¹ | suy |
| 50 | AX | `TSBT_DANG_DIEU_TRI_BENH` | Đang điều trị | **checkbox** | suy |
| 51 | AY | `TSBT_MA_BENH` | Tên bệnh tiền sử | **ICD autocomplete** | suy (= bệnh chính) |
| 52 | AZ | `TSBT_TEN_THUOC_LIEU_LUONG` | Thuốc & liều | text | trống |
| 53 | BA | `TSBT_THAI_SAN` | Tiền sử thai sản | **checkbox** | suy (Không) |
| 54 | BB | `TSBT_MA_BENH_THAI_SAN` | Bệnh thai sản | ICD autocomplete | trống |
| 55 | BC | `TSBT_TEN_THUOC_THAI_SAN` | Thuốc thai sản | dropdown `DM_BPTT` | trống |
| 56 | BD | `CHIEU_CAO` | Chiều cao (cm) | số | **trống** |
| 57 | BE | `CAN_NANG` | Cân nặng (kg) | số | **trống** |
| 58 | BF | `CHI_SO_BMI` | BMI | số (tự tính) ² | **trống** |
| 59 | BG | `MACH` | Mạch (lần/phút) | text | **trống** |
| 60 | BH | `HUYET_AP` | Huyết áp | text `120/80` | **trống** |
| 61 | BI | `KHAM_THE_LUC_PL` | Phân loại thể lực | radio 1–5 | **trống** |
| 62–83 | BJ–CE | 11 cặp `<cơ quan>` + `_PL` | Khám 11 cơ quan | text + radio 1–5 | data |
| 84–87 | CF–CI | `KHONG_KINH_*`, `CO_KINH_*` | Thị lực | dropdown `DM_KQmat` (`0/10`…`10/10`) | 46 ca có, còn lại trống |
| 88 | CJ | `BENH_KHAC_MAT` | Bệnh về mắt | text | data |
| 89 | CK | `KHAM_MAT_PL` | Phân loại mắt | radio 1–5 | data |
| 90–93 | CL–CO | `TAI_*_NOI_*` | Thính lực (m) | số | **trống** |
| 94 | CP | `BENH_KHAC_TAI_MUI_HONG` | Bệnh TMH | text | data |
| 95 | CQ | `KHAM_TAI_MUI_HONG_PL` | Phân loại TMH | radio 1–5 | data |
| 96–97 | CR–CS | `HAM_TREN`, `HAM_DUOI` | Khám hàm | text | trống |
| 98 | CT | `BENH_KHAC_RANG_HAM_MAT` | Bệnh RHM | text | data |
| 99 | CU | `KHAM_RANG_HAM_MAT_PL` | Phân loại RHM | radio 1–5 | data |
| 100 | CV | *(Dịch vụ CLS)* | — | không dùng ³ | — |
| 101 | CW | `PHAN_LOAI_SK` | Phân loại sức khỏe | radio 1–5 | data |
| 102 | CX | `KET_LUAN_BENH` | Kết luận bệnh | **ICD autocomplete** | data |
| 103 | CY | `CAC_BENH_TAT_NEU_CO` | Tình trạng sức khỏe | textarea | data (= chuỗi gốc) |

¹ Cột AW trong file mẫu gốc khai validation `"0, 1"` nhưng dòng hướng dẫn ghi
"Nhập tên bệnh theo mã ICD-10" — **mâu thuẫn ngay trong file của Bộ**.
Đang điền theo dòng hướng dẫn (tên ICD). Nếu cổng báo lỗi cột này thì đây là lý do.

² BMI tự tính `cân nặng / (chiều cao/100)²`, làm tròn 2 chữ số, chỉ khi có đủ
chiều cao và cân nặng.

³ Cột 100 là con trỏ sang sheet `DM_CanLamSang`. Đợt này để trống — xem §6.3.

⚠️ Cột **M (13)** và **O (15)** là công thức tra cứu phụ trợ, **không có mã
trường ở dòng 2** nên không thuộc dữ liệu xuất. Công thức cột O trong chính
file mẫu đã hỏng (`#REF!`) do bỏ cấp huyện. Để trống.

---

## 6. QUY TẮC NGHIỆP VỤ

### 6.1. Phân loại sức khỏe — QĐ 1613/BYT-QĐ ngày 15/8/1997

> Mục III.3.3: *"Loại V: Chỉ cần có 1 chỉ số thấp nhất là loại V, xếp loại V."*

**Bất biến: `max(14 phân loại cơ quan) == phan_loai_sk`.**
App kiểm tra mỗi lần user sửa. 138 ca đang vi phạm đều là ca không có chẩn đoán.

Cách pipeline suy ngược (nguồn chỉ có phân loại chung):
1. Mỗi bệnh có trọng số nặng 1–5 (`SEVERITY` trong `build/classify.py`).
2. Cơ quan trọng số cao nhất → gán bằng phân loại chung của nguồn.
3. Bệnh nặng nhất của cơ quan đó = **bệnh chính**.
4. Cơ quan khác: quy đổi trọng số, **không vượt** phân loại chung.
5. Cơ quan không bệnh = loại I.

Đồng hạng thì ưu tiên theo thứ tự:
`TH → HH → TIEUHOA → THAN → NOITIET → CXK → TK → TT → NGOAI → DALIEU → SAN → MAT → TMH → RHM`
(nội khoa trước — nếu không, "mất răng" sẽ lấn át tăng huyết áp khi chọn bệnh chính).

### 6.2. Danh sách 8 xã/phường
`Phường Thủy Nguyên` (2.246) · `Xã Lê Ích Mộc` (1.873) · `Xã Lưu Kiếm` (1.749) ·
`Phường Bạch Đằng` (1.666) · `Phường Thiên Hương` (1.580) ·
`Phường Hòa Bình` (1.528) · `Xã Việt Khê` (1.366) · `Xã Nam Triệu` (1.318)

### 6.3. Cận lâm sàng
Đợt khám dùng: **đường máu mao mạch, siêu âm ổ bụng, điện tim**.
- Đường máu mao mạch **KHÔNG** đưa vào sheet `DM_CanLamSang` — danh mục BYT chỉ
  có `S01 Glucose` là **máu tĩnh mạch đo bằng máy sinh hóa**, khác bản chất xét
  nghiệm. Dữ liệu giữ ở `glu_thoi_diem` / `glu_gia_tri` để app hiển thị & thống kê.
- Điện tim → ghép vào `noi_khoa_tuan_hoan`.
- Siêu âm ổ bụng → ghép vào `noi_khoa_tieu_hoa`.

### 6.4. Sinh hiệu & thể lực
Toàn bộ chiều cao, cân nặng, BMI, mạch, huyết áp, thị lực, thính lực,
phân loại thể lực **chưa có dữ liệu**. Sẽ bổ sung sau. App phải:
- Cho nhập hàng loạt (nhập nhanh theo danh sách, chỉ 6 ô/người).
- Cho **nhập từ file Excel** (khớp theo CCCD, dự phòng theo họ tên + ngày khám).
- Tự tính BMI và gợi ý phân loại thể lực theo bảng QĐ 1613 mục II.1.2
  (`build/qd1613_fulltext.txt`), nhưng **cán bộ phải xác nhận**.

---

## 7. PIPELINE 2 — XUẤT FILE

### 7.1. Ràng buộc BẮT BUỘC (vi phạm ⇒ cổng BYT từ chối)

1. **Đúng 103 cột**, header dòng 1–2 khớp tuyệt đối file mẫu.
2. Dữ liệu bắt đầu **dòng 4** (dòng 3 là hướng dẫn của mẫu).
3. **Không tạo workbook mới.** Phải `shutil.copyfile` từ
   `doc/Import_KSK_Tren 18.xlsm` rồi mở
   `openpyxl.load_workbook(path, keep_vba=True)` và ghi đè.
   Tạo file mới sẽ mất 17 bộ data validation ⇒ cổng từ chối.
4. **Tên bệnh lấy nguyên văn** từ `dmicdme`. Các cột `KET_LUAN_BENH`,
   `TSBT_MA_BENH`, `TSGD_MA_BENH`, `TSBT_MA_BENH_THAI_SAN` có dropdown ràng buộc.
5. `SO_CCCD`, `NGAY_VAO`, `NGAY_SINH`, `NGAYCAP_CCCD` phải là **TEXT**
   (`number_format = '@'`), ngày dạng `dd/mm/yyyy`.
6. Phân loại (1–5) phải là **số nguyên**, không phải chuỗi.
7. **Tách file theo xã.** Gộp 13.326 ca vào 1 file làm openpyxl vượt bộ nhớ
   (phải giữ cả template kèm `dmicdme` 35.735 dòng cùng 1,4 triệu ô).
   Xuất **mỗi xã một tiến trình riêng** — xem `build/build_xlsm.py --xa`.
   Sau mỗi file phải `wb.close()` + `gc.collect()`.

### 7.2. Màn hình xuất file

- Chọn phạm vi: toàn bộ / theo xã / theo cán bộ / theo trạng thái / chọn tay.
- **Cảnh báo trước khi xuất**: liệt kê số hồ sơ còn cờ 🔴; cho phép
  "xuất kèm cả hồ sơ lỗi" (mặc định **tắt**).
- **Option cột mở rộng** (mặc định tắt — bật thì file KHÔNG nộp Bộ được,
  phải hiện cảnh báo rõ). Cột thêm ghi từ cột 104 trở đi:
  - `MA_BENH_CHINH` (mã ICD bệnh chính)
  - `MA_BENH_KEM` — nhiều mã, ngăn bởi `;`
  - `TEN_BENH_KEM` — nhiều tên, ngăn bởi `;`
  - `CO_QUAN_BENH_CHINH`
  - `CHAN_DOAN_GOC`
  - `CO_QC`, `SO_LOI`, `GHI_CHU_RA_SOAT`
  - `NGUOI_RA_SOAT`, `TRANG_THAI`, `THOI_DIEM_HOAN_THANH`
  - `GLU_THOI_DIEM`, `GLU_GIA_TRI`, `KQ_DIEN_TIM`, `KQ_SIEU_AM_O_BUNG`
  - Cho user tự tick chọn cột nào trong danh sách trên.
- Sau khi xuất: cập nhật `da_xuat_file = 1`, `lan_xuat_cuoi`, ghi `nhat_ky`.
- Xuất kèm **file kê** (`.xlsx`) liệt kê hồ sơ trong lô + cờ còn lại.

---

## 8. PIPELINE 3 — DASHBOARD

### 8.1. Thẻ tổng quan
Tổng hồ sơ · Đã rà soát (số + %) · Đang rà soát · Chưa rà soát ·
Cần đối chiếu giấy · Đã xuất file · Tổng số cờ 🔴 còn lại.

### 8.2. Tiến độ theo xã/phường
Bảng + biểu đồ cột chồng: mỗi xã hiện tổng · đã xong · đang làm · chưa làm ·
số cờ đỏ · % hoàn thành. Sắp theo % tăng dần (xã chậm nhất lên đầu).

### 8.3. Tiến độ theo cán bộ
Mỗi cán bộ: số hồ sơ được giao · đã hoàn thành · % · số lượt sửa (từ `nhat_ky`) ·
thời điểm hoạt động gần nhất · năng suất 7 ngày gần nhất (biểu đồ đường).

### 8.4. Chất lượng dữ liệu
- Biểu đồ cột: số ca theo từng mã cờ, còn lại so với ban đầu.
- Đường: số cờ đỏ giảm theo ngày.

### 8.5. Thống kê chuyên môn
- Phân bố phân loại sức khỏe I–V, tách theo xã.
- Top 20 bệnh theo mã ICD (từ bảng `benh`).
- Số ca theo cơ quan bệnh chính.
- Tỷ lệ mắc bệnh mạn tính chính: THA `I10` · ĐTĐ `E11*`/`E14*` ·
  COPD `J44.9` · thoái hóa khớp `M19.9`/`M17.9` · gan nhiễm mỡ `K76.0`.
- Phân bố glucose mao mạch theo ngưỡng (đói ≥7,0 · sau ăn ≥11,1 mmol/L).

### 8.6. Số liệu nền hiện tại (để kiểm tra sau khi nạp)

| Chỉ số | Giá trị |
|---|---:|
| Tổng hồ sơ | 13.326 |
| Tổng dòng bệnh | 39.645 |
| Phân loại SK | I: 1 · II: 421 · III: 2.012 · IV: 5.651 · V: 5.241 |
| Cơ quan bệnh chính (top 5) | Tiêu hóa 3.065 · Tuần hoàn 2.620 · RHM 1.913 · CXK 1.548 · Thận-TN 1.241 |
| Ca không xác định được bệnh chính | 139 |
| Nguồn ánh xạ | rule 96,3% · từ điển BS 3,7% |
| Có CCCD / trống | 11.672 / 1.654 |
| CCCD trùng | 69 số, dính 139 bản ghi |
| Dòng `PHAN_LOAI_CO_QUAN` | 186.564 (= 13.326 × 14) |

**Truy vấn kiểm tra sau khi nạp** — chạy các câu này, kết quả phải khớp bảng trên:

```sql
SELECT COUNT(*) FROM ho_so;                                    -- 13326
SELECT COUNT(*) FROM benh;                                     -- 39645
SELECT phan_loai_sk, COUNT(*) FROM ho_so GROUP BY 1;           -- 1,421,2012,5651,5241
SELECT COUNT(*) FROM ho_so WHERE ma_benh_chinh IS NULL
   OR ma_benh_chinh='';                                        -- 139
SELECT COUNT(*) FROM ho_so WHERE so_cccd IS NULL OR so_cccd=''; -- 1654
-- bất biến QĐ 1613: chỉ 138 ca được phép vi phạm (ca không có chẩn đoán)
SELECT COUNT(*) FROM ho_so h WHERE (
  SELECT MAX(pl) FROM (SELECT noi_khoa_tuan_hoan_pl pl UNION ALL
    SELECT noi_khoa_ho_hap_pl UNION ALL SELECT noi_khoa_tieu_hoa_pl UNION ALL
    SELECT noi_khoa_than_tietnieu_pl UNION ALL SELECT noi_khoa_noi_tiet_pl UNION ALL
    SELECT noi_khoa_co_xuong_khop_pl UNION ALL SELECT noi_khoa_than_kinh_pl UNION ALL
    SELECT noi_khoa_tam_than_pl UNION ALL SELECT kham_ngoai_khoa_pl UNION ALL
    SELECT kham_da_lieu_pl UNION ALL SELECT kham_san_phu_khoa_pl UNION ALL
    SELECT kham_mat_pl UNION ALL SELECT kham_tai_mui_hong_pl UNION ALL
    SELECT kham_rang_ham_mat_pl)) <> h.phan_loai_sk;            -- 138
```

---

## 9. GỢI Ý KỸ THUẬT

- **Backend:** Python + FastAPI (dùng lại được `build/` trực tiếp). SQLite là đủ.
- **Frontend:** ưu tiên bàn phím. React + TanStack Table, hoặc HTMX + Alpine
  nếu muốn gọn. Bắt buộc: điều hướng bàn phím, tự lưu khi rời ô, ô gợi ý ICD.
- **KHÔNG viết lại pipeline chuẩn hóa** — gọi `build/mapper.py`,
  `build/classify.py`, `build/build_xlsm.py`.
- `MA_HO_SO` là khóa chính — **không dùng CCCD** (12% thiếu, 68 ca trùng).
- Giữ nguyên `chan_doan_goc` và `benh.chuoi_goc`: mọi sửa đổi phải truy ngược
  được về đúng chữ người nhập đã gõ.
- Ghi `nhat_ky` cho **mọi** thay đổi.
- Sao lưu SQLite tự động hằng ngày.

---

## 10. CÁC BẪY ĐÃ GẶP — ĐỪNG LẶP LẠI

| Bẫy | Hậu quả thực tế |
|---|---|
| `replace('hoá','hóa')` không có ranh giới từ | Phá chữ "thoái" (chứa "hoá") → "thóai" |
| Regex bắt chuỗi con `liệt` | Khớp "tuyến tiền **liệt**" → báo nhầm tiền sử tai biến |
| Viết tắt `dd` không có `\b` | Khớp "viêm a**dd**" (âm đạo) → gán thành viêm dạ dày, 11 ca |
| Rule chỉ khớp bản gõ sai | "gan nhiễm mỡ" (3.921 lần, 10% dữ liệu) rơi vào mã fallback |
| Dải `[A-ZÀ-Ỹ]` cho chữ hoa tiếng Việt | Khối Unicode xen kẽ, dải này chứa cả chữ **thường** ('ư' nằm giữa 'À' và 'Ỹ') → cắt đôi chữ "xương" |
| Đồng âm tiếng Việt | "**tai** biến" → TMH; "nhịp **xoang**" → viêm xoang; "màng **nhĩ**" → tâm nhĩ |
| Tách chuỗi theo dấu `/` | Xé "H/c cushing", "cắt 2/3 dạ dày", "liệt 1/2 người" |
| Ký hiệu răng FDI dạng chấm `MR2.7` | Bị hiểu là số thập phân |
| Tự soạn tên bệnh | Đúng y học nhưng lệch câu chữ danh mục → cổng từ chối (74/100 ca) |
| Tra ICD không tính dagger | Mã thật là `E11.4†`, tra `E11.4` trượt → 31 ca sai tên bệnh |
| Trọng số "mất răng" để mức 4 | Lấn át tăng huyết áp khi chọn bệnh chính → phải để mức 3 |
| Tạo workbook mới thay vì copy template | Mất toàn bộ data validation → cổng từ chối |
| Gộp 13.326 ca vào 1 file .xlsm | Tiến trình bị kết thúc vì hết bộ nhớ (máy 3,9 GB) |
