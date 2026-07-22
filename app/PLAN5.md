# PLAN ĐỢT 5 — Tự động chọn Phân loại thể lực (2026-07-22, lần 4)

Yêu cầu: sau khi autosave thể lực & sinh hiệu ĐỦ THÔNG TIN thì tự động chọn
phân loại thể lực phù hợp (thay cơ chế gợi ý + nút xác nhận). Cán bộ vẫn
chỉnh tay được sau đó. 5 tiêu chí:

1. **Backend PATCH /api/ho-so/{ma}** (màn chi tiết): khi thay đổi đụng tới
   chieu_cao/can_nang (và mạch/HA nếu the_luc.py cần) và ĐỦ dữ liệu để tính
   gợi ý theo QĐ1613 (services/the_luc.py có sẵn) → tự ghi
   `kham_the_luc_pl = gợi ý`, ghi nhat_ky (ten_truong='kham_the_luc_pl',
   ghi rõ nguồn tự động trong gia_tri_moi hoặc chuẩn hiện có), trả về giá trị
   mới trong response để UI cập nhật.
2. **Backend PATCH /api/sinh-hieu/{ma}** (trang sinh hiệu): cùng logic — đủ
   dữ liệu → tự set kham_the_luc_pl, không cần bấm "Gợi ý PL"/"Xác nhận" nữa;
   response trả kham_the_luc_pl mới.
3. **Quy tắc ghi đè:** mỗi khi sinh hiệu nền (chiều cao/cân nặng…) thay đổi →
   PL thể lực tính lại và ghi đè (kể cả đã có giá trị); user chỉnh tay radio
   trực tiếp thì giá trị tay được lưu bình thường (PATCH kham_the_luc_pl) và
   GIỮ cho tới lần sinh hiệu thay đổi kế tiếp. Xóa chiều cao/cân nặng (không
   còn đủ dữ liệu) → KHÔNG tự xóa PL đã có.
4. **Frontend:** màn chi tiết — radio Phân loại thể lực tự nhảy sang giá trị
   mới + flash xanh khi response trả về; trang sinh hiệu — cột PL hiển thị
   giá trị tự chọn (badge như sh-pl-confirmed), nút "Gợi ý PL" và popover
   xác nhận GỠ BỎ; luồng Enter cuối hàng (Đợt 4) đổi thành: lưu HA xong →
   (PL đã tự set từ response) → focus thẳng chiều cao BN kế tiếp.
5. **Regression:** BMI vẫn tự tính; ngưỡng/tách HA giữ nguyên; nhat_ky đủ;
   node --check; không phá phím tắt.

Test cổng 8892, kill khi xong. Không git, không đụng build/.
