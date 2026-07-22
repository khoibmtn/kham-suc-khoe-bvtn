# PLAN ĐỢT 9 — Fix phiên "Chưa đăng nhập" (bền qua restart) + phân công sửa/xóa + sinh hiệu cột định danh + import Excel thu gọn (2026-07-22 lần 10)

1 workstream (Sonnet). 8 tiêu chí. Ưu tiên #1 là bug auth.

## Nhóm 1 — BUG QUAN TRỌNG: "Chưa đăng nhập" ngẫu nhiên

**Nguyên nhân gốc:** `backend/auth.py` lưu phiên trong **dict RAM phía server**.
Render free khởi động lại thường xuyên (ngủ sau 15' + mỗi lần deploy) → dict bị
xóa → cookie còn nhưng server không nhận ra → 401 "Chưa đăng nhập". Xảy ra
toàn app, thấy rõ ở trang Sinh hiệu.

1. **Chuyển sang phiên KHÔNG trạng thái (signed cookie):**
   - Khóa bí mật `session_secret` sinh 1 lần bằng `secrets.token_hex(32)`, lưu
     trong bảng `cai_dat` (key='session_secret') — bền qua restart vì DB được
     Litestream giữ. Đọc lúc khởi động; chưa có thì sinh & lưu.
   - Token cookie = payload `{uid, exp}` (exp ~7 ngày) + chữ ký HMAC-SHA256 bằng
     secret (dùng `hmac`/`hashlib`, base64 urlsafe, `hmac.compare_digest`).
   - `login`: tạo token, set cookie `ksk_session` (httponly, samesite=lax,
     secure khi https). `get_current_user`: verify chữ ký + hạn + user còn
     `dang_hoat_dong=1` (query DB) → trả user; sai/hết hạn → 401. `logout`:
     xóa cookie. BỎ dict phiên RAM cũ.
   - Giữ nguyên chữ ký các endpoint dùng `Depends(auth.get_current_user)` và
     `require_admin`. (Chấp nhận: đổi cơ chế nên mọi người phải đăng nhập lại 1
     lần sau deploy này — bình thường.)
2. **Frontend tự xử lý 401:** trong `api.js`, mọi response 401 → tự chuyển về
   màn đăng nhập (gọi 1 callback do app.js đăng ký: ẩn app-shell, hiện
   login-screen, báo "Phiên đã hết, mời đăng nhập lại") thay vì để trang kẹt
   chữ "Chưa đăng nhập". Áp cho mọi trang (danh sách, sinh hiệu, dashboard...).

## Nhóm 2 — Trang Phân công: sửa/xóa

3. **Backend:** `DELETE /api/phan-cong/{id}` (admin) — xóa dòng phan_cong VÀ gỡ
   giao: set `nguoi_ra_soat_id=NULL` cho các ho_so đang thuộc phạm vi phân công
   đó (đúng nguoi_dung_id + đúng pham_vi_loai/gia_tri), ghi nhat_ky. Thêm
   `PATCH /api/phan-cong/{id}` đổi người được giao (chuyển nguoi_ra_soat_id của
   các ho_so trong phạm vi sang người mới), ghi nhat_ky.
4. **Frontend (app.js phân công):** mỗi dòng bảng "Đã giao" thêm nút **Sửa**
   (đổi nhân viên — dropdown/prompt) và **Xóa** (xác nhận rồi gọi DELETE, làm
   mới bảng + thông báo số hồ sơ được gỡ giao).

## Nhóm 3 — Trang Sinh hiệu: cột định danh

5. **Backend `/api/sinh-hieu/danh-sach`:** item bổ sung `nam_sinh`
   (ngay_sinh 4 số cuối), `gioi_tinh`, `so_cccd`.
6. **Frontend `sinhhieu.js`:** thêm 3 cột **Năm sinh · Giới · CCCD** SAU cột Họ
   tên (trước cột Xã). Cập nhật colspan hàng rỗng/thông báo. Giữ 4 ô nhập + BMI
   + PL + nút xóa dòng.

## Nhóm 4 — Import Excel thu gọn

7. **Hàng Import Excel thành section bấm mới mở:** nút **"▸ Nhập từ Excel"**;
   bấm mới hiện (Tải file mẫu, chọn file, nút Nhập, báo cáo). Mặc định ĐÓNG để
   tránh bấm nhầm. Nhớ trạng thái localStorage.

## Nhóm 5 — Nghiệm thu
8. Không phá: phím tắt, tìm kiếm/STT/phân trang (Đợt 7), frame lọc (Đợt 8),
   autosave, ngưỡng sinh hiệu. Test cổng 8896:
   - login → lấy cookie; **giả lập restart**: dừng & chạy lại uvicorn (dict RAM
     mất) → dùng LẠI cookie cũ gọi `/api/me` và `/api/sinh-hieu/danh-sach` vẫn
     **200** (chứng minh phiên bền qua restart). Trước khi fix thì sẽ 401.
   - DELETE phân công test → nguoi_ra_soat_id các hồ sơ về NULL, nhat_ky có; rồi
     KHÔI PHỤC lại phân công demo raso1←Phường Nam Triệu như cũ.
   - sinh-hieu danh-sach item có nam_sinh/gioi_tinh/so_cccd.
   - node --check + py_compile toàn bộ file đụng tới.

Test cổng 8896, kill khi xong. Không git (orchestrator commit+push → Render tự
deploy). Không đụng build/, doc/, output/. Không sửa dữ liệu thật (revert mọi
thay đổi test).
