-- 0006 — phase 12: kiểm soát nhập nhầm CCCD / mã KCB / SĐT
-- canh_bao_so = thông điệp kiểm số (src/lib/kiem-so.ts), dữ liệu SUY RA; tính lại mỗi lần ghi hồ sơ
-- và bằng `npm run kiem-so` (điền cho hồ sơ cũ).
ALTER TABLE ho_so ADD COLUMN canh_bao_so TEXT[] NOT NULL DEFAULT '{}';
