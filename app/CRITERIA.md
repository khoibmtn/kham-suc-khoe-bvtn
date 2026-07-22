# ACCEPTANCE CRITERIA — trích xuất từ SPEC.md (Analyst, agent-team loop)

PHASE 0 — Foundation (scaffold app/, SQLite schema §2, import_data.py, catalogs, computed flags CCCD_TRUNG & THIEU_SINH_HIEU):

ACCEPTANCE CRITERIA:
1. Toàn bộ code ứng dụng (backend, frontend, script nạp dữ liệu, DB, config) nằm trong `app/` — testable by: không có file code mới nào ngoài `app/`.
2. `app/` chứa app FastAPI + SQLite theo gợi ý §9, không viết lại pipeline chuẩn hóa — testable by: import trực tiếp `build/normalize.py`, `build/mapper.py`, `build/classify.py`, `build/build_xlsm.py` (qua sys.path) thay vì code trùng lặp logic.
3. Schema SQLite đúng khớp §2: đủ 6 bảng (`nguoi_dung`, `ho_so`, `benh`, `dm_icd`, `nhat_ky`, `phan_cong`) + FTS5 `dm_icd_fts` + 5 index trên `ho_so` + index trên `benh`/`nhat_ky` — testable by: `.schema` khớp field-by-field với khối SQL §2.
4. `dm_icd.ma` giữ nguyên dạng gốc gồm dagger/asterisk (`E11.4†`), `dm_icd.ma_tran` là mã đã bỏ †/* — testable by: `SELECT ma, ma_tran FROM dm_icd WHERE ma LIKE '%†%'` trả ≥1 dòng, `ma_tran` sạch.
5. `import_data.py` idempotent theo `ma_ho_so` (upsert) — testable by: chạy 2 lần, `COUNT(*)` không đổi.
6. 6 truy vấn §8.6 khớp: ho_so=13326; benh=39645; phan_loai_sk = 1/421/2012/5651/5241; ma_benh_chinh rỗng=139; so_cccd rỗng=1654; vi phạm bất biến QĐ1613=138.
7. Cờ `CCCD_TRUNG` tự tính lúc nạp: 69 số CCCD trùng, 139 bản ghi có cờ trong `co_qc`.
8. Cờ `THIEU_SINH_HIEU` tự tính lúc nạp: 13326 ca có cờ ngay sau nạp.
9. Danh mục nạp từ `doc/Import_KSK_Tren 18.xlsm`: dmicdme 35735 (A=mã, B=tên), dmtinh 34, dmdantoc 56, dmnghenghiep 1070, dmkhac (giới tính AL2:AL4, thị lực BF2:BF12, loại hình KCB BJ1:BJ16), Hướng dẫn (đối tượng B9:B24, kinh phí G8:G13) — số dòng khớp.
10. Không dùng `dmxa`; danh sách 8 xã lấy từ dữ liệu: Phường Thủy Nguyên 2246 · Xã Lê Ích Mộc 1873 · Xã Lưu Kiếm 1749 · Phường Bạch Đằng 1666 · Phường Thiên Hương 1580 · Phường Hòa Bình 1528 · Xã Việt Khê 1366 · Xã Nam Triệu 1318.

PHASE 1 — Pipeline Rà soát (§3, §4, §5, §6.1):

ACCEPTANCE CRITERIA:
1. Phân công 3 kiểu (`xa`, `khoang_ma`, `danh_sach`) ghi vào `phan_cong` + gán `nguoi_ra_soat_id`; cán bộ chỉ thấy hồ sơ của mình, admin thấy tất cả — testable by: gọi API danh sách với 2 tài khoản khác vai trò.
2. Mọi thay đổi trường ghi `nhat_ky` kèm `nguoi_dung_id`, `ten_truong`, `gia_tri_cu`, `gia_tri_moi`.
3. Danh sách có đủ 9 bộ lọc thao tác bằng bàn phím: Xã (đa chọn), Ngày khám (range + preset hôm nay/tuần này/cả đợt), Họ tên (fuzzy), CCCD (một phần), Mã hồ sơ, Trạng thái, Cán bộ (chỉ admin), Cờ cảnh báo (checkbox từng cờ §4), Phân loại SK (I–V), Cơ quan bệnh chính (14 giá trị).
4. Bảng kết quả đủ cột: Mã hồ sơ · Họ tên · Năm sinh · Giới · Xã · Ngày khám · Phân loại SK · Bệnh chính · Số cờ · Trạng thái; dòng cờ đỏ nền đỏ nhạt, cờ vàng nền vàng nhạt.
5. Đủ 9 phím tắt: `/` tìm kiếm; `↑↓` di chuyển; `Enter` mở; `Esc` đóng; `Ctrl+↓/↑` hồ sơ kế/trước; `Ctrl+S` hoàn thành + kế tiếp; `Ctrl+K` bảng lệnh; `F2` sửa ô focus; `Alt+1..9` nhảy nhóm trường.
6. Fuzzy họ tên: bỏ dấu (`nguyen van a` khớp `NGUYỄN VĂN A`), ngưỡng 0.75 sắp điểm giảm dần, khớp một phần từ (`thanh` → `NGUYỄN THỊ THANH`), debounce 200ms, ≤50 kết quả.
7. Chi tiết đủ 103 trường §5, 6 nhóm gập được (A Hành chính · B Tiền sử · C Thể lực · D Khám cơ quan · E CLS · F Kết luận); khung "Chẩn đoán gốc" ghim đầu, chỉ đọc.
8. Autosave onBlur → PATCH → `nhat_ky` → chỉ báo "Đã lưu" thoáng qua; KHÔNG có nút Lưu.
9. Widget đúng §5: Có/Không=checkbox+Space; danh mục=dropdown gõ-lọc; ICD=autocomplete `dm_icd_fts` hiện "mã — tên" lưu tên nguyên văn; PL 1–5=radio+phím 1–5; ngày=text dd/mm/yyyy tự chèn `/` + lịch.
10. Bất biến QĐ1613 kiểm tra tức thời khi sửa: vi phạm → dải đỏ nêu cơ quan cao nhất + nút "Lấy theo mức nặng nhất"; trường suy luận viền vàng + ⚠ + tooltip, xác nhận → viền xanh + gỡ cờ.

PHASE 2 — Pipeline Xuất file (§7):

ACCEPTANCE CRITERIA:
1. Đúng 103 cột, header dòng 1–2 khớp tuyệt đối file mẫu.
2. Dữ liệu bắt đầu dòng 4, dòng 3 giữ nguyên hướng dẫn mẫu.
3. Không tạo workbook mới: copy template + `keep_vba=True` (tái dùng `write_xlsm` của `build/build_xlsm.py`), giữ nguyên data validation.
4. Tên bệnh nguyên văn từ `dmicdme` cho `KET_LUAN_BENH`, `TSBT_MA_BENH`, `TSGD_MA_BENH`, `TSBT_MA_BENH_THAI_SAN`.
5. `SO_CCCD`, `NGAY_VAO`, `NGAY_SINH`, `NGAYCAP_CCCD` là TEXT (`number_format='@'`), ngày `dd/mm/yyyy`.
6. Phân loại 1–5 là số nguyên.
7. Tách file theo xã, mỗi xã một tiến trình (subprocess), `wb.close()` + `gc.collect()` sau mỗi file.
8. Màn hình xuất chọn phạm vi: toàn bộ / theo xã / theo cán bộ / theo trạng thái / chọn tay.
9. Cảnh báo trước xuất: đếm hồ sơ còn cờ 🔴, toggle "xuất kèm hồ sơ lỗi" mặc định TẮT; option cột mở rộng mặc định TẮT + cảnh báo "không nộp Bộ được", cột từ 104 trở đi, user tick chọn từng cột trong danh sách §7.2.
10. Sau xuất: `da_xuat_file=1`, `lan_xuat_cuoi`, ghi `nhat_ky`; kèm file kê `.xlsx` liệt kê hồ sơ + cờ còn lại.

PHASE 3 — Dashboard (§8):

ACCEPTANCE CRITERIA:
1. Thẻ tổng quan đủ 7 chỉ số: Tổng · Đã rà soát (số+%) · Đang · Chưa · Cần đối chiếu giấy · Đã xuất · Tổng cờ 🔴 còn lại.
2. Tiến độ theo xã: bảng + biểu đồ cột chồng (tổng/xong/đang/chưa/cờ đỏ/%), sắp % tăng dần.
3. Tiến độ theo cán bộ: giao · hoàn thành · % · lượt sửa (nhat_ky) · hoạt động gần nhất · năng suất 7 ngày (đường).
4. Chất lượng dữ liệu: cột số ca theo mã cờ (hiện tại vs ban đầu); đường cờ đỏ giảm theo ngày.
5. Thống kê chuyên môn đủ 5 mục: PL SK I–V theo xã; top 20 ICD; số ca theo cơ quan bệnh chính; tỷ lệ mạn tính (I10, E11*/E14*, J44.9, M19.9/M17.9, K76.0); phân bố glucose (đói ≥7.0, sau ăn ≥11.1).
6. Baseline lúc nạp được lưu (top 5 cơ quan: Tiêu hóa 3065 · Tuần hoàn 2620 · RHM 1913 · CXK 1548 · Thận-TN 1241); dashboard phân biệt baseline vs hiện tại.
7. Dashboard GET-only, không sửa dữ liệu nghiệp vụ.
8. Refresh phản ánh đúng thay đổi mới nhất.

PHASE 4 — Sinh hiệu bulk entry + Excel import (§6.4):

ACCEPTANCE CRITERIA:
1. Màn hình nhập nhanh theo danh sách, 6 ô/người (chiều cao, cân nặng, mạch, huyết áp, thị lực, thính lực).
2. Import Excel khớp theo CCCD, dự phòng họ tên + ngày khám.
3. BMI = cân nặng/(chiều cao/100)², làm tròn 2 chữ số, chỉ khi đủ 2 giá trị.
4. Gợi ý phân loại thể lực theo QĐ1613 II.1.2 nhưng cán bộ phải xác nhận mới ghi `kham_the_luc_pl`.
5. Nhập đủ sinh hiệu → gỡ cờ `THIEU_SINH_HIEU` khỏi `co_qc`.
6. Nhập tay và import Excel đều ghi `nhat_ky` theo từng trường đổi.
7. Import Excel báo cáo rõ số dòng khớp / không khớp + lý do, không âm thầm bỏ qua.

EXISTING PATTERNS TO FOLLOW:
- `build/build_xlsm.py:185` `write_xlsm(recs, path)` — tái dùng cho P2.
- `build/build_xlsm.py` `main()` `--xa` subprocess per xã — P2 shell ra cơ chế này.
- `build/mapper.py` `phan_tich(raw_dx)`; `build/classify.py` `classify_person`, `severity_of`, thứ tự ưu tiên cơ quan TH→…→RHM.
- `build/build_import.py`: `fmt_date, clean_cccd, clean_gioi, clean_nam_sinh, clean_noi_cap, parse_pl, is_bat_thuong, icd_official, ten_chinh_thuc, CFG, XA_MAP`.
- `output/KSK_Import_TOANBO.xlsm` — mẫu đối chiếu cấu trúc file xuất.

OUT OF SCOPE:
- Viết lại bất kỳ module nào trong `build/`.
- Cột 100 (DM_CanLamSang) — để trống. Cột M/O — công thức phụ trợ, O để trống.
- Sheet `dmxa`. Xử lý lại file thô. Dùng CCCD làm khóa.

QUYẾT ĐỊNH MẶC ĐỊNH (điểm SPEC chưa nêu rõ):
- Auth: pbkdf2 + session cookie, admin/admin123 seed.
- Xuất file: background job + polling.
- Cờ đỏ theo ngày: bảng snapshot hằng ngày + baseline lúc nạp.
- Backup: copy DB khi khởi động, giữ 30 bản.
