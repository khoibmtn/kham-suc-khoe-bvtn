# PLAN2 — Giai đoạn 2: phân công + màn hình rà soát (docs/04 mục 1, kịch bản A, B)

Hợp đồng API + kiểu dữ liệu: **`src/lib/api-types.ts`** (nguồn duy nhất; backend và giao diện cùng theo).
Đã có từ GĐ1: auth (`requireUser/requireAdmin` trong `src/lib/auth/guard.ts`), `getSql()`, `ghiNhatKy()`, `CLS`, `CANH_BAO_NHAN`, `khongDau`.
Mật khẩu mặc định `123456` (anh Khôi chốt 11/11); đăng nhập chọn tên từ danh sách (`GET /api/auth/ds-dang-nhap`, công khai).

## Tiêu chí nghiệm thu (yes/no)
### T3 — Backend (subagent Sonnet)
1. Mọi route GĐ2 trong `api-types.ts` hoạt động, trả JSON đúng kiểu; lỗi `{error}` tiếng Việt.
2. Quyền (docs/03 mục 3.1): nhân viên chỉ thấy/sửa buổi mình phụ trách; buổi người khác → 403; chưa đăng nhập → 401; route admin với nhân viên → 403.
3. Chỉ số buổi đúng công thức docs/03 mục 5 (hien_co, da_xac_nhan, thua, thieu, bo_sung, tien_do), tính bằng SQL gộp (1 truy vấn cho danh sách 60 buổi).
4. Trạng thái buổi tự cập nhật: có ≥1 hồ sơ xác nhận → `dang_ra_soat`; về 0 → `chua_ra_soat` (trừ `da_xac_nhan`).
5. Buổi `da_xac_nhan` → mọi ghi hồ sơ của buổi trả 423.
6. Khóa lạc quan: `version` lệch → 409 kèm bản hiện tại; mỗi ghi thành công `version+1`, `updated_by/at`.
7. Sửa nhân thân → `sua_nhan_than=true`, `ho_ten_kd` tính lại; sửa CLS → `sua_cls=true`; xác nhận không đổi cờ. Validate: họ tên không rỗng, giới tính Nam/Nữ, năm sinh 1900–2026, CCCD rỗng/9/12 số, CLS 0/1.
8. Nhật ký mỗi trường đổi (ai, lúc, hành động, trường, cũ→mới); `GET lich-su` trả đúng thứ tự thời gian.
9. Phân công: gán/bỏ gán hàng loạt; "theo gợi ý" gán theo `nv_goi_y` (mặc định không ghi đè); ghi nhật ký. Sau theo-gợi-ý trên v1: `TN-20260907`→ngan, `LK-20260928`→diep, `VK-*` và `LK-20260914`…`LK-20260919` chưa phân công.
10. Quản lý user: tạo (mk 123456), sửa họ tên/vai trò/khóa, đặt lại mk 123456 (session_version+1); admin không tự khóa mình.
11. Sửa/thêm buổi (admin) có nhật ký; `ma_buoi` = `<don_vi>-<yyyymmdd>`, trùng → 400.
12. Test vitest cho tầng nghiệp vụ (quyền, 409, 423, cờ, trạng thái buổi, phân công gợi ý) xanh.

### T4 — Giao diện (Antigravity, Gemini 4 Argon High)
13. Khung app: thanh trên cùng (tên app, điều hướng: "Danh sách của tôi", admin thêm "Phân công", "Người dùng"; họ tên user, Đổi mật khẩu, Đăng xuất).
14. `/`: bảng các buổi (nhân viên: của mình; admin: tất cả + lọc đơn vị/người phụ trách): đơn vị, ngày dd/mm/yyyy, điểm khám, sổ đoàn, trong DS, đã xác nhận, thừa, thiếu, trạng thái, tiến độ %; bấm dòng → mở rà soát. Thẻ tổng nhỏ (số buổi, tổng hồ sơ, đã xác nhận, %).
15. `/ra-soat`: chọn Đơn vị → Ngày (chỉ buổi được xem) → mở `/ra-soat/[ma_buoi]`.
16. `/ra-soat/[ma_buoi]`: thanh chỉ số `Sổ đoàn: N | Trong danh sách: M | Đã xác nhận: X/M | Thừa | Thiếu`; bảng: STT, mã KCB, họ tên, GT, năm sinh, CCCD, địa chỉ chi tiết, 8 ô CLS (CTM · GLU · URE · CRE · GOT · GPT · NT · SA), ô "Đã kiểm – có hồ sơ giấy"; dòng phụ nhỏ: ngày giờ ĐK HIS, Có/Không TT KSK, nhãn cảnh báo.
17. Bấm ô CLS đổi 0↔1 ngay (cập nhật lạc quan, lỗi thì hoàn lại + báo); ô khác `src` viền cam; tooltip tên đầy đủ + `cls_ghi_chu`. Dòng đã xác nhận nền xanh nhạt.
18. Khung chi tiết bên phải: sửa nhân thân (mã KCB, họ tên, giới tính, năm sinh, CCCD, địa chỉ chi tiết, ghi chú) + tab Lịch sử; trường khác `src` có ghi "Gốc: …".
19. Phím tắt: ↑/↓ chọn dòng, Space xác nhận/bỏ xác nhận, 1–8 bật/tắt CLS (không kích hoạt khi đang gõ trong ô nhập).
20. 409 → thông báo "Hồ sơ vừa được người khác sửa, đã tải lại" và thay dòng bằng bản server; 423/403 → thông báo rõ, không cho sửa (buổi khóa: ô CLS, checkbox bị vô hiệu).
21. Admin `/admin/phan-cong`: bảng 60 buổi, chọn nhiều → gán cho user (hoặc bỏ gán); nút "Phân công theo sổ đoàn" (hộp xác nhận); sửa điểm khám/đoàn/sổ đoàn; thêm buổi.
22. Admin `/admin/nguoi-dung`: danh sách, tạo, sửa họ tên/vai trò, khóa/mở (xác nhận), đặt lại mật khẩu 123456 (xác nhận).
23. Danh sách 340 dòng tải < 1,5 s trên máy local; giao diện 100% tiếng Việt, số có dấu chấm ngàn, chữ ≥ 14px, bảng kẻ dòng rõ.

### Chung
24. `npx tsc --noEmit`, `npm run lint`, `npm test`, `npm run build` sạch.
25. Kịch bản A và B (docs/04 mục 3) chạy đạt trên `nhapsl_dev` đã nạp v1.
