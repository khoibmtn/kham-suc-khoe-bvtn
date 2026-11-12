-- 0002 — cho phép giới tính trống: gói Cowork có giá trị "Khác"/trống → app để trống,
-- nhân viên sửa theo hồ sơ giấy trên giao diện (quyết định của anh Khôi 11/11/2026).
ALTER TABLE ho_so DROP CONSTRAINT IF EXISTS ho_so_gioi_tinh_check;
ALTER TABLE ho_so ADD CONSTRAINT ho_so_gioi_tinh_check CHECK (gioi_tinh IN ('Nam','Nữ',''));
