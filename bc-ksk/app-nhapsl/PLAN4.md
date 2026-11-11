# PLAN4 — Giai đoạn 4: kho chờ, chuyển, nhận về, đề nghị chuyển, thêm hồ sơ, xác nhận/mở khóa danh sách
(docs/04 kịch bản D, E, F) + góp ý giao diện của anh Khôi (11/11/2026)

Hợp đồng: `src/lib/api-types.ts` mục "Phase 4". Migration `0003_chuyen_ho_so.sql` (cột `chuyen_*`, `de_nghi_chuyen.xu_ly_ghi_chu`).
Thuật ngữ hiển thị (anh Khôi chốt): "Sổ đoàn" → **"DS google sheet"**; "TT KSK" → **"DS đẩy cổng"**; `CLS_LECH_NGUON` → "CLS: HIS khác PM KSK" + mô tả (`NHAN`, `CANH_BAO_NHAN`, `CANH_BAO_MO_TA` trong `src/lib/cls.ts`).

## T7 — Backend (Sonnet)
1. Chuyển: vào kho cá nhân / kho chung / buổi khác (bắt buộc lý do). Hồ sơ đã xác nhận → 400; buổi nguồn/đích khóa → 423; quyền nguồn đúng; `da_di_chuyen`, `chuyen_*`, nhật ký.
2. Nhận về: từ kho chung (mọi user) / kho cá nhân của mình → buổi mình phụ trách; từ kho chung → `nhan_tu_kho_chung=true` (tính vào "bổ sung").
3. `GET kho-ca-nhan`, `GET kho-chung` (lọc đơn vị gợi ý, tìm kiếm cùng quy tắc), hiển thị nguồn gốc chuyển.
4. Kiểm trùng (CCCD / mã KCB / họ tên không dấu + năm sinh) và thêm hồ sơ: trùng mà không có lý do → 409 kèm danh sách trùng; thêm tay tự xác nhận, `nguon='them_tay'`.
5. Xác nhận danh sách: còn hồ sơ chưa xác nhận → 400; lệch DS google sheet → bắt buộc giải trình; sau đó mọi ghi → 423; admin mở khóa (bắt buộc lý do) → sửa lại được.
6. Đề nghị chuyển: tạo / liệt kê / đồng ý (thực hiện chuyển) / từ chối; quyền đúng.
7. Test vitest cho 1–6 xanh (kịch bản D, E, F ở tầng nghiệp vụ).

## T8 — Giao diện (Antigravity) — giao sau khi T6 xong
(Chi tiết trong `handoff/tasks/T8-ui.md`.)
