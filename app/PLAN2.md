# PLAN ĐỢT 2 — Phản hồi UX sau lần chạy thật đầu tiên (2026-07-22)

12 tiêu chí nghiệm thu, chia 2 workstream chạy TUẦN TỰ (A backend → B frontend),
verify cuối. Mỗi tiêu chí phải kiểm được yes/no.

## Nhóm 1 — Tài khoản & phân quyền (backend + màn hình riêng)

1. **Màn "Người dùng" (admin):** tạo tài khoản (Họ tên, tên đăng nhập/nickname
   DUY NHẤT, mật khẩu); sửa họ tên; nút "Đặt lại mật khẩu mặc định" (mật khẩu
   mặc định `ksk@2026`, hiển thị rõ sau khi đặt); nút "Vô hiệu hóa"/"Kích hoạt"
   (`dang_hoat_dong`); nút "Xóa" — chỉ xóa được khi tài khoản CHƯA có dấu vết
   (không có `nhat_ky`, `phan_cong`, không là `nguoi_ra_soat_id` của hồ sơ nào);
   nếu có dấu vết → báo lỗi gợi ý dùng vô hiệu hóa.
2. **Tài khoản vô hiệu** không đăng nhập được (login trả lỗi rõ ràng); session
   đang mở của tài khoản đó bị từ chối ở request kế tiếp.
3. **Màn "Tài khoản của tôi" (mọi user):** đổi Họ tên, đổi mật khẩu (bắt nhập
   mật khẩu cũ); KHÔNG đổi được tên đăng nhập; user thường không thấy/không gọi
   được API quản trị người dùng (403).
4. **Giao việc là TÙY CHỌN:** hồ sơ `nguoi_ra_soat_id IS NULL` → mọi cán bộ
   thấy và sửa được (danh sách, chi tiết, PATCH, sinh hiệu); hồ sơ ĐÃ giao →
   chỉ người được giao + admin (như cũ). Mọi sửa đổi vẫn ghi `nhat_ky` kèm
   đúng `nguoi_dung_id` người sửa.
5. **Dọn dữ liệu test về baseline:** script một-lần
   `backend/scripts/don_dep_du_lieu_test.py`:
   - Hoàn nguyên mọi trường ho_so bị sửa trong quá trình test máy (dò từ
     `nhat_ky`: với mỗi (ma_ho_so, ten_truong) lấy `gia_tri_cu` của bản ghi
     ĐẦU TIÊN), gồm sinh hiệu/CCCD/điện thoại… trên các hồ sơ 00001–00004 v.v.
   - Xóa dòng bệnh test đã thêm (bảng benh hiện 39.646 — phải về 39.645).
   - Reset `da_xuat_file=0`, `lan_xuat_cuoi=NULL` toàn bộ (đợt xuất Nam Triệu
     là xuất thử), `kham_the_luc_pl` test → NULL.
   - Tính lại `co_qc` (THIEU_SINH_HIEU, THIEU_CCCD…), `so_loi`, `chi_so_bmi`.
   - Xóa các dòng `nhat_ky` test tương ứng.
   - Sau chạy: cả 6 truy vấn §8.6 khớp (13326 / 39645 / 1-421-2012-5651-5241 /
     139 / 1654 / 138) + THIEU_SINH_HIEU=13326 + không hồ sơ nào da_xuat_file=1.
   - GIỮ: users admin/raso1, phan_cong demo, snapshot/baseline.

## Nhóm 2 — Màn hình danh sách

6. **Đếm kết quả:** ngay trên bảng hiện "Hiển thị a–b / **X kết quả**" (X =
   tổng khớp bộ lọc hiện tại; khi không lọc = tổng được thấy). Cập nhật mỗi lần
   lọc/chuyển trang.
7. **Splitter kéo được** giữa panel danh sách (trái) và chi tiết (phải); lưu
   tỷ lệ vào localStorage, khôi phục khi mở lại; kéo không làm vỡ bố cục.
8. **Bộ lọc gọn & tiện:**
   - Xã/phường, Cờ cảnh báo, Phân loại SK (và Trạng thái, Cơ quan bệnh chính
     nếu hợp bố cục) → **dropdown đa chọn kiểu checkbox** (click mở panel
     checkbox, không cần Cmd-click), có mục **"Tất cả"** (mặc định); nút hiển
     thị tóm tắt lựa chọn ("Tất cả" / "3 xã đã chọn"...).
   - Ngày khám: 2 ô có nhãn rõ **"Từ ngày" / "Đến ngày"**; điền 1 trong 2 vẫn
     lọc được (chỉ từ / chỉ đến / đúng 1 ngày khi cả 2 bằng nhau); preset giữ
     nguyên.
   - Bố cục filter bar sắp xếp lại gọn (nhóm hàng hợp lý, không tràn dọc).

## Nhóm 3 — Chi tiết & Sinh hiệu

9. **Nhóm A–F + Bảng bệnh mặc định MỞ HẾT** khi mở hồ sơ (vẫn gập được thủ công).
10. **Họ tên tự IN HOA:** gõ chữ thường trong ô Họ tên (chi tiết + mọi nơi nhập
    họ tên) tự hiển thị và LƯU chữ hoa (uppercase cả tiếng Việt có dấu).
11. **Khám cơ quan dạng card:** mỗi cơ quan 1 card có tiêu đề tên cơ quan,
    trong card: ô kết quả khám + hàng radio phân loại NẰM NGAY DƯỚI, dính
    nhau; card có viền/nền phân biệt rõ cơ quan này với cơ quan kia; grid card
    tự xuống dòng khi resize, kết quả và phân loại không bao giờ tách rời.
12. **Trang Sinh hiệu cùng triết lý:** khối gợi ý phân loại thể lực + nút xác
    nhận nằm gọn trong hàng của người đó (không tràn/lệch cột), bảng nhập giữ
    thẳng hàng khi resize.

## Ràng buộc chung
- Không đụng `build/`, `doc/`, `output/`. Không git.
- Autosave/nhật ký/phím tắt/hành vi cũ không được thoái lui (Ctrl+S, Esc, Alt+1..9…).
- Test bằng cổng riêng (8844/8855), kill khi xong; cổng 8000 do orchestrator
  khởi động lại cuối cùng.
