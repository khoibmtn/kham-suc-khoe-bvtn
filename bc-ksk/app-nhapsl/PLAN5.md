# PLAN5 — Giai đoạn 5 (dashboard) + 6 (báo cáo Excel, xuất cho Cowork)

Hợp đồng: `src/lib/api-types.ts` mục "Phase 5" và "Phase 6". Thuật ngữ hiển thị: `NHAN` trong `src/lib/cls.ts` ("DS google sheet", "DS đẩy cổng").
Chỉ số thống nhất: docs/03 mục 5 (thừa/thiếu cộng theo từng buổi, không bù trừ; chênh lệch ròng riêng).

## T9 — API dashboard + nhật ký (Sonnet)
1. `GET /api/dashboard/toi` (nhân viên: buổi + kho của mình; admin: toàn bộ) đúng `TheTongHop`.
2. `GET /api/dashboard/admin` theo user / theo đơn vị (+ dòng Cộng) / kho chung / đề nghị chờ; CLS và DS đẩy cổng chỉ tính hồ sơ đã xác nhận.
3. `GET /api/nhat-ky` lọc user, hành động, khoảng ngày, đối tượng, phân trang 100.
4. Mọi con số khớp truy vấn SQL độc lập (test so sánh trực tiếp).

## T10 — Báo cáo Excel + xuất Cowork (Sonnet)
5. `bao_cao.xlsx`: sheet `Tong hop` (TN, LK, VK, Cộng), `Theo buoi`, `Thuy Nguyen`, `Luu Kiem`, `Viet Khe` — cột theo docs/01 mục 4.10a với thuật ngữ mới; tiêu đề đậm, cố định dòng tiêu đề, độ rộng cột vừa, `#,##0`, Times New Roman 12; CCCD/mã KCB dạng chữ.
6. `Tong hop` = tổng các sheet chi tiết (test đọc lại file bằng ExcelJS); tùy chọn chỉ đã xác nhận (mặc định) / tất cả; nhân viên chỉ xuất buổi của mình.
7. Gói Cowork (docs/02 mục 7): `manifest.json`, `ho_so.csv` (đúng thứ tự 42 cột), `buoi_kham.csv`, `nhat_ky.csv`, `bao_cao.xlsx`; CSV UTF-8 có BOM; đọc bằng pandas không lỗi tiếng Việt, CCCD giữ số 0 (dtype=str).
8. `npm run export:cowork` ghi `handoff/export/<YYYYMMDD-HHMM>/`; `GET /api/export/cowork.zip` (admin) cùng nội dung; nhật ký xuất.

## T11 — Giao diện (Antigravity)
9. Trang chủ nhân viên thành dashboard (thẻ tổng, bảng buổi đủ cột, kho cá nhân + thao tác nhanh, nút xuất báo cáo phần mình).
10. `/admin` Tổng quan: thẻ tổng, bảng theo user, bảng theo đơn vị (8 CLS), kho chung, đề nghị chờ, nút xuất Excel (tùy chọn) và xuất Cowork.
11. `/admin/nhat-ky`: lọc + phân trang.
12. Sửa tồn: thông báo có "Hoàn tác" giữ ≥ 10 giây; chân trang chú thích không bị cắt ở 1366px.

## Chung
13. tsc, lint, test, build sạch; số dashboard khớp SQL; kịch bản G đạt.
