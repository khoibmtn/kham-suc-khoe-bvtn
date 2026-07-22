# PLAN ĐỢT 6 — Chuẩn hóa số thập phân + cột danh sách + header chi tiết (2026-07-22, lần 5)

6 tiêu chí, 1 workstream (Sonnet).

## 1. Chuẩn hóa số thập phân (mọi trường number)
Danh sách trường số: `chieu_cao`, `can_nang`, `glu_gia_tri`, `tai_trai_noi_thuong`,
`tai_trai_noi_tham`, `tai_phai_noi_thuong`, `tai_phai_noi_tham` (m), `mach`
(số nguyên). (`chi_so_bmi` readonly tự tính — không nhập.)
- **Frontend (blur):** nhập `6,7` → tự đổi hiển thị `6.7` rồi mới autosave;
  nhập không phải số (`abc`, `6,7,8`, `6.7.8`) → ô đỏ + tooltip "Phải là số",
  KHÔNG lưu, focus ở lại (theo chuẩn luồng Enter Đợt 4); Esc khôi phục.
- **Backend (PATCH /api/ho-so + /api/sinh-hieu):** chuẩn hóa `,`→`.` TRƯỚC khi
  validate; parse float thất bại → 422 thông báo tiếng Việt; giá trị lưu DB
  luôn là số/chuỗi có dấu chấm (khớp định dạng file mẫu BYT khi xuất).
- Import Excel sinh hiệu: cùng chuẩn hóa `,`→`.` từng ô số.
- Ngưỡng sinh hiệu hiện có (Đợt 3) vẫn áp sau khi chuẩn hóa (nhập `65,5` cân
  nặng → lưu 65.5, qua ngưỡng bình thường).

## 2. Cột danh sách BN
Bỏ cột "Mã hồ sơ"; thêm cột **CCCD** ngay SAU cột Giới. Thứ tự mới:
Họ tên · Năm sinh · Giới · **CCCD** · Xã · Ngày khám · Phân loại SK ·
Bệnh chính · Số cờ · Trạng thái. Backend list response bổ sung `so_cccd`.
(Mã hồ sơ vẫn là khóa nội bộ để mở chi tiết — chỉ ẩn khỏi bảng; bộ lọc theo
mã hồ sơ giữ nguyên.)

## 3. Header panel chi tiết
Dưới tên BN (to, đậm) thêm 2 dòng phụ nhỏ:
- Dòng 1: `Năm sinh: 1963 · Nam · CCCD: 0312...` (thiếu CCCD → "CCCD: —").
- Dòng 2: `Thành phố Hải Phòng / Phường Thủy Nguyên / TDP Cổng Đất · Khám: 14/04/2026`.
Cập nhật khi chuyển hồ sơ (Ctrl+↓↑). Mã hồ sơ vẫn hiện (nhỏ) vì là khóa tra cứu.

## 4-6. Regression
node --check; không phá luồng Enter/combobox/ngưỡng; test PATCH `6,7` glucose
→ DB `6.7`; PATCH `abc` → 422; danh sách trả so_cccd; cột đúng thứ tự.

Test cổng 8893, kill khi xong. Không git, không đụng build/.
