# PLAN ĐỢT 3 — Sinh hiệu & validation ngưỡng (phản hồi 2026-07-22, lần 2)

10 tiêu chí, 2 workstream TUẦN TỰ: A backend (Sonnet) → B frontend (Sonnet),
orchestrator verify cuối. Mỗi tiêu chí kiểm được yes/no.

## Bối cảnh phản hồi
- Nút "⚠ Xác nhận" đang hiện ở các ô sinh hiệu (chiều cao, cân nặng, mạch, HA)
  và Số CCCD trong màn chi tiết → SAI: theo SPEC §5 các trường này Nguồn =
  **trống**/data, KHÔNG phải "suy". Chỉ trường suy thật mới có ⚠/Xác nhận.
- Page Sinh hiệu còn dùng select-multiple cũ, thiếu tìm tên, file mẫu rỗng,
  còn 2 cột thị lực/thính lực (phải nhập chi tiết trong từng case → bỏ).

## Workstream A — Backend

1. **Bảng cài đặt ngưỡng sinh hiệu:** bảng `cai_dat(khoa TEXT PRIMARY KEY,
   gia_tri TEXT)` lưu JSON `nguong_sinh_hieu`; GET `/api/cai-dat` (mọi user),
   PUT `/api/cai-dat` (admin). Mặc định: mach 10–300 lần/phút; can_nang 20–200
   kg; chieu_cao 100–250 cm (user ghi "2500" — hiểu là typo của 250 cm, đã
   config được nên chỉnh lại tùy ý); HA tâm thu 60–280, tâm trương 20–140,
   ràng buộc tâm thu > tâm trương.
2. **Service validation dùng chung** `services/sinh_hieu_valid.py`:
   - `check(field, value, nguong)` → {hop_le, ly_do} cho chieu_cao/can_nang/
     mach/huyet_ap.
   - `chuan_hoa_huyet_ap('12080'|'120/80'|'120-80')` → '120/80': nếu chuỗi
     toàn số, thử các cách tách 2 số sao cho cả hai nằm trong ngưỡng và
     tâm thu > tâm trương (ví dụ 12080→120/80, 9060→90/60, 14090→140/90);
     không tách được → không hợp lệ.
   - PATCH sinh hiệu & PATCH ho_so (các trường này) trả 422 kèm thông báo
     tiếng Việt rõ ràng khi ngoài ngưỡng; giá trị HA được chuẩn hóa trước khi
     lưu và trả về giá trị đã chuẩn hóa trong response.
3. **File mẫu Excel có sẵn danh sách BN:** GET `/api/sinh-hieu/mau-excel` nhận
   cùng bộ lọc của danh sách sinh hiệu (xa multi, ho_ten, trang_thai, sinh
   hiệu thiếu/đủ) → file .xlsx gồm 1 dòng/BN đang khớp lọc với cột:
   MA_HO_SO, HO_TEN, SO_CCCD, NGAY_KHAM, XA_PHUONG (khóa, chỉ đọc) +
   CHIEU_CAO, CAN_NANG, MACH, HUYET_AP (trống chờ điền). KHÔNG còn cột thị
   lực/thính lực.
4. **Import Excel:** khớp ưu tiên MA_HO_SO (có sẵn trong file mẫu) → SO_CCCD →
   họ tên+ngày khám; chỉ nhận 4 trường sinh hiệu trên; áp dụng validation
   ngưỡng từng dòng — dòng ngoài ngưỡng bị từ chối và liệt kê rõ lý do trong
   báo cáo (không âm thầm bỏ); vẫn ghi nhat_ky từng trường.
5. **API danh sách sinh hiệu:** thêm filter `ho_ten` (fuzzy như danh sách
   chính) + `xa` multi; response bỏ 2 cột thị lực/thính lực.

## Workstream B — Frontend

6. **Page Sinh hiệu — bộ lọc giống Danh sách:** Xã/phường dùng multiselect
   checkbox "Tất cả" (component Multiselect có sẵn), thêm ô "Họ tên (gõ gần
   đúng)" debounce 200ms; grid bỏ 2 cột Thị lực/Thính lực (còn đúng 4 ô nhập:
   chiều cao, cân nặng, mạch, HA + BMI + PL); nút "Tải file mẫu" tải theo bộ
   lọc hiện tại.
7. **Bỏ "⚠ Xác nhận" sai chỗ:** trong fields.js chỉ các trường Nguồn='suy'
   theo SPEC §5 giữ cơ chế suy (ngay_sinh, ma_dan_toc, matinh_cu_tru,
   ma_nghe_nghiep, doi_tuong, nguon_chi_tra, ly_do_vv, ma_loai_kcb, nhóm tiền
   sử Y/AA–AY). Sinh hiệu (chieu_cao, can_nang, chi_so_bmi, mach, huyet_ap,
   kham_the_luc_pl, thính lực CL–CO) và so_cccd KHÔNG còn viền vàng/⚠/nút
   Xác nhận.
8. **Validation UX (cả grid Sinh hiệu lẫn nhóm C màn chi tiết):** ngưỡng lấy
   từ /api/cai-dat; gõ HA liền số tự tách thành ../.. khi blur; giá trị ngoài
   ngưỡng → ô nền đỏ nhạt + viền đỏ + tooltip lý do, KHÔNG autosave giá trị
   sai (giữ nguyên giá trị cũ trong DB, toast báo lỗi); admin có màn "Cài đặt"
   (nav mới, admin-only) chỉnh ngưỡng, lưu qua PUT /api/cai-dat.
9. **Radio phân loại nằm ngang cùng nhãn:** mọi radio 1–5 hiển thị
   `( ) I  ( ) II  ( ) III  ( ) IV  ( ) V` — nhãn NGAY CẠNH nút cùng dòng
   (hiện nhãn rơi xuống dòng dưới). Áp dụng toàn app (organ cards, thể lực,
   sinh hiệu, phan_loai_sk).
10. **Màu trạng thái ô:**
    - Ô cần rà soát (trường suy thật, ô đang vi phạm ngưỡng, ô thuộc cờ đang
      bật) tô NỔI hơn hiện tại (nền vàng đậm hơn + viền trái dày).
    - Autosave thành công → ô chuyển nền XANH nhạt (giữ ~1.5s rồi phai, hoặc
      giữ viền trái xanh) ở cả màn chi tiết lẫn grid sinh hiệu để nhận biết
      đã lưu.

## Ràng buộc chung
- Không đụng build/, doc/, output/. Không git. Không phá phím tắt & autosave.
- Test cổng 8866 (A) / 8877 (B), kill khi xong; orchestrator restart 8000.
