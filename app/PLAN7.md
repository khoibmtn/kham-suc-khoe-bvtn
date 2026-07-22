# PLAN ĐỢT 7 — Danh sách: phân trang, STT, tìm toàn cột + highlight; Sinh hiệu: lọc ngày (2026-07-22 lần 8)

1 workstream (Sonnet), backend + frontend tuần tự. 10 tiêu chí.

## A. Màn DANH SÁCH

1. **Chọn số dòng/trang:** dropdown page_size (10 / 20 / 50 / 100 / 200), **mặc
   định 20**. Đổi default backend `list_ho_so` từ 50 → 20. Đổi page_size cập
   nhật lại danh sách + về trang 1. (Mục đích: màn phân giải thấp còn thấy
   thanh cuộn ngang.)
2. **Cột STT** (số thứ tự) ở ĐẦU bảng, đánh số **liên tục toàn danh sách**:
   `STT = (page-1)*page_size + index_trong_trang + 1` (không reset mỗi trang).
3. **Bật lại cột "Mã hồ sơ"**, xếp **CUỐI CÙNG bên phải**. Thứ tự cột mới:
   STT · Họ tên · Năm sinh · Giới · CCCD · Xã · Ngày khám · Phân loại SK ·
   Bệnh chính · Số cờ · Trạng thái · **Mã hồ sơ**. (Mở chi tiết vẫn theo
   ma_ho_so như cũ.)
4. **Ô tìm kiếm gọn lại:** BỎ ô "Số CCCD" và "Mã hồ sơ" khỏi filter bar. Giữ
   1 ô "Họ tên (gõ gần đúng)" + thêm **checkbox "Chỉ tìm họ tên"** (mặc định
   TẮT). Cập nhật nhãn ô cho hợp (vd khi tắt checkbox đổi placeholder thành
   "Tìm mọi cột: tên, CCCD, xã, mã, bệnh...").
5. **Logic tìm kiếm:**
   - Checkbox BẬT → chỉ tìm cột họ tên (fuzzy hiện có, `fuzzy.rank_by_name`).
   - Checkbox TẮT → **tìm toàn cột**: khớp không dấu chuỗi con của từ khóa với
     các cột hiển thị (ho_ten, năm sinh, gioi_tinh, so_cccd, maxa_cu_tru,
     ngay_vao, phan_loai_sk, ket_luan_benh=bệnh chính, co_quan_benh_chinh,
     ma_ho_so, nhãn trạng thái). Dòng có BẤT KỲ cột nào khớp thì lấy. **Xếp
     hạng:** dòng khớp cột HỌ TÊN lên trước (dùng lại match_score của fuzzy để
     xếp trong nhóm này), rồi mới đến dòng khớp cột khác; trong cùng nhóm giữ
     thứ tự tt. Áp dụng SAU các filter SQL khác (xã, trạng thái, ngày...).
6. **Highlight từ khóa:** khi tìm toàn cột (checkbox tắt), highlight (thẻ
   `<mark>`) đoạn khớp từ khóa trong MỌI ô có chứa (khớp không dấu nhưng bôi
   đúng ký tự gốc). Escape HTML trước khi chèn mark (chống XSS).
7. **ESC trong ô tìm kiếm** (họ tên) → xóa sạch ô + reset kết quả về như chưa
   lọc; phải `stopPropagation`/`preventDefault` để KHÔNG kích hoạt phím tắt
   Esc-đóng-chi-tiết của keyboard.js. Áp dụng cho mọi ô text trong filter bar
   (CCCD/mã đã bỏ nên chỉ còn họ tên + các ô ngày).

## B. Màn SINH HIỆU

8. **Bổ sung lọc ngày khám:** thêm 2 ô "Từ ngày" / "Đến ngày" (giống Danh
   sách, điền 1 trong 2 vẫn lọc được) vào thanh lọc; backend
   `/api/sinh-hieu/danh-sach` nhận `ngay_tu`/`ngay_den` (tái dùng cách so
   sánh `_ymd` trong ho_so.py — chuyển TEXT dd/mm/yyyy sang yyyy-mm-dd).
9. **ESC trong ô tìm kiếm Sinh hiệu** (ô họ tên + ô ngày) → xóa + reset như A7.

## C. Ràng buộc & nghiệm thu
10. Không phá: luồng Enter/combobox/ngưỡng/autosave/phím tắt cũ; STT + total
    khớp (total = số dòng khớp bộ lọc, hiện ở dòng "Hiển thị a–b / X kết
    quả"); node --check toàn bộ JS; test API:
    - `GET /api/ho-so?page_size=20` mặc định trả ≤20 dòng;
    - tìm toàn cột: gõ "Nam Triệu" (không phải họ tên) ra hồ sơ xã đó; gõ
      "31006-2026-00001" ra đúng hồ sơ; gõ tên ra đúng người, họ tên xếp trước;
    - checkbox bật: chỉ ra theo họ tên;
    - `/api/sinh-hieu/danh-sach?ngay_tu=...` lọc đúng.

Test cổng 8894, kill khi xong. Không git (orchestrator commit+push để Render
tự deploy). Không đụng build/, doc/, output/.
