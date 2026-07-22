# PLAN ĐỢT 4 — Luồng nhập liệu bàn phím + đổi tên xã/phường (2026-07-22, lần 3)

2 workstream TUẦN TỰ: A backend/data (Sonnet) → B frontend (Sonnet). 9 tiêu chí.

## Workstream A — Đổi tên đơn vị hành chính

Thực tế sau sắp xếp 2025: **chỉ "Việt Khê" là Xã, còn lại đều là Phường.**
Hiện DB đang có 3 tên sai: `Xã Lê Ích Mộc`, `Xã Lưu Kiếm`, `Xã Nam Triệu`.

1. **Script migration** `backend/scripts/doi_ten_xa_phuong.py` (idempotent):
   - `ho_so.maxa_cu_tru`: `Xã Lê Ích Mộc`→`Phường Lê Ích Mộc`,
     `Xã Lưu Kiếm`→`Phường Lưu Kiếm`, `Xã Nam Triệu`→`Phường Nam Triệu`
     (`Xã Việt Khê` giữ nguyên).
   - `phan_cong.pham_vi_gia_tri` thay tên tương ứng (bản ghi demo raso1).
   - Sau chạy: GROUP BY maxa_cu_tru ra đúng 8 tên mới với số lượng cũ
     (Phường Lê Ích Mộc 1873, Phường Lưu Kiếm 1749, Phường Nam Triệu 1318,
     Xã Việt Khê 1366, 4 phường còn lại giữ nguyên). Chạy 2 lần không đổi.
2. **Backend đồng bộ:** `XA_LIST` trong routers/ho_so.py cập nhật 8 tên mới;
   `import_data.py` áp mapping đổi tên NGAY KHI NẠP (re-import tương lai không
   hồi sinh tên cũ); placeholder ví dụ trong frontend (app.js phân công
   "vd: Xã Nam Triệu"…) và README đổi theo. KHÔNG sửa build/ (dữ liệu xuất
   lấy từ DB nên tự đúng).

## Workstream B — Luồng bàn phím nhập liệu

### Màn CHI TIẾT
3. **Enter = lưu & sang ô kế:** trong input text/số/ngày: Enter → blur
   (autosave nếu hợp lệ) → focus ô nhập liệu KẾ TIẾP theo thứ tự hiển thị
   (bỏ qua ô readonly/ẩn). Tab giữ hành vi mặc định (autosave onBlur đã có).
   Textarea: Enter giữ xuống dòng (không nhảy ô), Tab để sang ô kế.
   Giá trị KHÔNG hợp lệ (ngưỡng sinh hiệu): không lưu, ô đỏ + tooltip,
   focus Ở LẠI ô đó; Esc khôi phục giá trị đã lưu gần nhất.
4. **Combobox danh mục = custom, không dùng datalist:** mọi dropdown
   gõ-để-lọc (giới tính, dân tộc, tỉnh, nghề nghiệp, xã, thị lực 0/10–10/10,
   đối tượng, nguồn chi trả, loại hình KCB, nhóm máu, trạng thái…) chuyển
   sang combobox tự dựng (pattern giống ICD autocomplete có sẵn):
   - Focus vào → menu tự mở hiện toàn bộ lựa chọn.
   - `↑`/`↓` di chuyển highlight, Enter chọn mục highlight.
   - Gõ ký tự → lọc realtime (khớp không dấu, khớp chuỗi con: gõ `5` lọc
     `5/10`); Enter → chọn KẾT QUẢ ĐẦU TIÊN của danh sách đã lọc.
   - Không có kết quả khớp → Enter/Tab: ô coi như CHƯA nhập (giữ/khôi phục
     giá trị cũ, không lưu rác) và chuyển sang ô kế.
   - Chọn xong → autosave → focus ô kế. Esc đóng menu không chọn.
5. **ICD autocomplete:** Enter chọn mục highlight (mặc định mục đầu) rồi
   sang ô kế — thống nhất với combobox.
6. **Radio/checkbox:** phím `1–5` chọn radio (đã có) + Enter sang ô kế;
   checkbox: Space bật/tắt, Enter sang ô kế.
7. **Không phá phím tắt cũ:** Ctrl+S/Ctrl+K/Ctrl+↑↓/Esc/Alt+1..9/F2//
   vẫn đúng; không double-save (Enter gây blur không được PATCH 2 lần).

### Trang SINH HIỆU
8. **Luồng Enter/Tab theo hàng:** focus đi trái→phải: chiều cao → cân nặng →
   mạch → huyết áp; Enter ở ô huyết áp (hoặc ô cuối có dữ liệu hợp lệ) →
   tự bấm "Gợi ý PL" của hàng đó → focus ô chiều cao của BN KẾ TIẾP; lặp
   luồng như vậy suốt danh sách. Tab tại HA đi tiếp tự nhiên. Giá trị sai
   ngưỡng: đỏ, không lưu, focus ở lại. (Ngưỡng + auto tách HA dùng chung
   NguongCheck đã có — không làm lại.)
9. **Regression:** autosave xanh/đỏ, gợi ý PL, import Excel, multiselect lọc
   không thoái lui; node --check toàn bộ JS.

## Ràng buộc chung
- Không đụng build/, doc/, output/. Không git.
- Test cổng 8890 (A) / 8891 (B), kill khi xong; orchestrator restart 8000.
