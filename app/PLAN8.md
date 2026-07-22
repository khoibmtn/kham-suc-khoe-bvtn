# PLAN ĐỢT 8 — Danh sách: frame lọc cố định + section lọc nâng cao thu gọn; đổi "Cán bộ"→"Nhân viên" (2026-07-22 lần 9)

1 workstream (Sonnet), chủ yếu frontend list.js + app.css + rename toàn dự án. 6 tiêu chí.

## Bối cảnh
Panel trái (#list-view) hiện: filter-bar (4 hàng: text/select/date/actions) →
summary → table-wrap → pager, tất cả cuộn CHUNG. Cần tách thành 3 vùng.

## Tiêu chí

1. **Bố cục cố định (sticky) trong #list-view:**
   - `#list-view` thành flex column, chiều cao vừa khung nhìn
     (`height: calc(100vh - <chiều cao header>)`; header#app-header cao ~48px).
   - **Vùng TRÊN (filter frame): cố định**, không cuộn.
   - **Vùng GIỮA (bảng danh sách): flex:1, overflow-y:auto** — CHỈ vùng này cuộn dọc.
   - **Vùng DƯỚI (dòng summary + pager): cố định**, luôn thấy trên giao diện.
   - Giữ nguyên splitter kéo rộng/hẹp giữa list và detail (Đợt 2) + cuộn ngang bảng.

2. **Frame lọc — mặc định chỉ hiện 4 nhóm:**
   - Ô "Tìm kiếm" (+ checkbox "Chỉ tìm họ tên" — Đợt 7).
   - Dropdown "Xã/phường".
   - Dropdown "Cờ cảnh báo".
   - Khoảng ngày ("Từ ngày"/"Đến ngày" + nút Chọn nhanh).

3. **Section "Bộ lọc nâng cao" thu gọn được:** một nút/thanh bấm để mở rộng
   xuống (mặc định ĐÓNG). Bên trong chứa: Phân loại SK, Trạng thái, Cơ quan
   bệnh chính, **Nhân viên rà soát** (chỉ admin). Bấm lần nữa để ẩn (tiết kiệm
   diện tích). Trạng thái mở/đóng nhớ trong localStorage. Nút "Xóa hết bộ lọc"
   vẫn hiện ở frame cố định (không nằm trong section ẩn).

4. **Đổi "Cán bộ" → "Nhân viên" TOÀN DỰ ÁN** (giữ hoa/thường: "Cán bộ"→"Nhân
   viên", "cán bộ"→"nhân viên") trong MỌI chuỗi hiển thị + comment ở frontend
   (js) và backend (py). KHÔNG đổi tên biến/định danh code (đều ASCII, không
   chứa dấu nên không dính). KHÔNG sửa dữ liệu trong DB (ho_ten "Cán bộ rà
   soát 1" của raso1 là dữ liệu — để nguyên). Sau đổi: `py_compile` mọi .py
   đụng tới + `node --check` mọi .js đụng tới đều PASS.
   (Gợi ý: 17 file chứa "án bộ" — grep `grep -rln "án bộ" frontend backend`.)

5. **Không phá:** phím tắt (Đợt 4), tìm kiếm toàn cột + STT + phân trang (Đợt
   7), autosave, dropdown Multiselect, ESC-clear. Kết quả đếm + pager vẫn đúng.

6. **Nghiệm thu:** node --check toàn bộ js; serve cổng 8895, login admin,
   GET / + /js/list.js 200; `grep -rc "án bộ" frontend backend` = 0 (không còn
   "Cán bộ"); GET /api/ho-so vẫn trả đúng (phân trang/tìm kiếm không đổi hành
   vi backend). Kiểm mắt: đọc lại code đảm bảo sticky (position/overflow),
   colspan, id không trùng.

Test cổng 8895, kill khi xong. Không git (orchestrator commit+push → Render
tự deploy). Không đụng build/, doc/, output/.
