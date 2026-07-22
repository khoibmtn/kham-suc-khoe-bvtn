# PLAN ĐỢT 10 — Chống cache JS + filter nhân viên cho user thường + combobox xóa được (2026-07-22 lần 11)

1 workstream (Sonnet). 4 tiêu chí. Bối cảnh: đã kiểm chứng LIVE — tìm kiếm +
checkbox "Chỉ tìm họ tên" HOẠT ĐỘNG ĐÚNG; "lỗi" người dùng gặp là do trình
duyệt cache file .js cũ sau mỗi lần deploy. Bug thị lực-không-xóa-được là THẬT.

## 1. Chống cache tài sản tĩnh (gốc rễ "lỗi ma")
Mỗi deploy đổi nội dung .js/.css/.html nhưng URL không đổi → trình duyệt dùng
bản cache cũ → tìm kiếm/đăng nhập "hỏng" cho tới khi hard-refresh.
- Trong `backend/main.py`: thay `StaticFiles` mặc định bằng lớp con gắn header
  `Cache-Control: no-cache, must-revalidate` (hoặc `max-age=0`) cho MỌI response
  tĩnh (đặc biệt index.html + /js/*.js + /app.css). Cách: subclass StaticFiles
  override `file_response`/`get_response` để set header, HOẶC middleware gắn
  header cho path không phải `/api`. Đảm bảo `/api/*` không bị đụng.
- Kết quả: sau 1 lần hard-refresh cuối để lấy bản có header no-cache, các deploy
  sau tự cập nhật khi tải lại trang thường (không cần Cmd+Shift+R nữa).

## 2. Filter "Nhân viên rà soát" cho USER THƯỜNG
Hiện dropdown này chỉ hiện với admin → user thường không lọc được "chỉ hồ sơ
của tôi" vs "tất cả (của tôi + chưa giao)".
- **Frontend (list.js):** LUÔN hiện dropdown "Nhân viên rà soát". Với user
  thường chỉ 2 option: **"Tất cả"** (value rỗng) và **"<họ tên user đăng nhập>"**
  (value = user.id). Dùng `user` object sẵn có (từ /api/me: user.id, user.ho_ten).
  Với admin giữ nguyên danh sách đầy đủ.
- **Backend (ho_so.py build_where):** với user thường, nếu param
  `nguoi_ra_soat_id` == chính user.id → CHỈ hồ sơ của user đó
  (`nguoi_ra_soat_id = user.id`); nếu rỗng ("Tất cả") → giữ như hiện tại
  (`nguoi_ra_soat_id IS NULL OR = user.id`). KHÔNG cho user thường lọc theo
  id người khác (nếu truyền id khác → bỏ qua, coi như Tất cả — chống dò dữ liệu).

## 3. Combobox danh mục: XÓA ĐƯỢC (đặc biệt ô thị lực Mắt)
`combobox.js` hiện `revertNoMatch()` khôi phục giá trị cũ khi ô trống → KHÔNG
xóa được giá trị đã nhập (thị lực, giới tính, dân tộc...).
- Sửa: khi ô **để TRỐNG** (`el.value.trim()===''`) lúc blur/Enter/Tab →
  coi là **XÓA CÓ CHỦ Ý** → lưu rỗng/null (clear field, ghi nhat_ky), KHÔNG
  revert. Chỉ revert khi ô có chữ RÁC không khớp mục nào (giữ chống-lưu-rác).
- **ESC trên combobox** (khi menu mở hoặc đóng, đang có giá trị): xóa trắng ô
  + lưu null (đúng yêu cầu "delete hoặc ESC thì xóa trắng ô thị lực"); vẫn
  đảm bảo ESC không kẹt (nếu ô đã rỗng sẵn thì để nổi bọt đóng panel như cũ).
- Áp cho MỌI field dùng combobox (Đợt 4) — thị lực khong_kinh/co_kinh mắt
  trái/phải là trường hợp chính. Đảm bảo lưu null gỡ đúng (không phá autosave).

## 4. Nghiệm thu
- Không phá: tìm kiếm toàn cột/STT/phân trang (Đợt 7), frame lọc (Đợt 8), auth
  (Đợt 9), phím tắt, autosave.
- Test cổng 8897:
  - `curl -I` một file /js/list.js → header `Cache-Control` chứa no-cache;
    `/api/health` KHÔNG bị gắn no-cache sai chỗ (hoặc có cũng không sao — miễn
    api hoạt động).
  - user thường: `GET /api/ho-so?nguoi_ra_soat_id=<self>` → chỉ hồ sơ của
    mình (vd raso1 → 1318); `?nguoi_ra_soat_id=<id admin khác>` → coi như Tất
    cả (không lộ hồ sơ người khác); rỗng → own+unassigned (13326 với raso1 nếu
    chưa ai giao khác... dùng số thực tế).
  - combobox: mô phỏng/đọc code xác nhận blur khi trống → clear (không revert).
  - node --check + py_compile toàn bộ file đụng tới.

Test cổng 8897, kill khi xong. Không git (orchestrator commit+push → Render tự
deploy). Không đụng build/, doc/, output/. Không sửa dữ liệu thật.
