# PLAN3 — Giai đoạn 3: tìm kiếm không dấu + bộ lọc (docs/04 kịch bản C)

Hợp đồng: `src/lib/api-types.ts` mục "Phase 3: search" (`GET /api/tim-kiem`, `KetQuaTimKiem`, quy tắc khớp từ khóa).
Bộ lọc thuần, dùng chung: `src/lib/loc-ho-so.ts` (`BoLoc`, `BO_LOC_MAC_DINH`, `khopBoLoc`, `locHoSo`, `khacGoc`, `soBoLocDangBat`).

## Tiêu chí nghiệm thu
### T5 — Backend tìm kiếm (Sonnet)
1. `GET /api/tim-kiem` đúng hợp đồng, 4 phạm vi; quyền: phạm vi `buoi` của buổi người khác → 403; chưa đăng nhập → 401.
2. Khớp: "nguyen thi" → mọi kết quả có từ bắt đầu bằng "nguyen" và "thi"; "thuy 1960" khớp cả "Thủy" và "Thuỷ" sinh 1960; 4 số cuối CCCD ra đúng người; mã KCB, SĐT, số thẻ BHYT (một phần) tìm được; nhiều từ khóa AND.
3. `co_quyen_sua` đúng theo vị trí; nhân viên tìm `tat_ca` thấy hồ sơ người khác nhưng `co_quyen_sua=false`.
4. < 500 ms trên 12.422 hồ sơ (đo local, dùng chỉ mục trigram có sẵn).
5. Test vitest xanh cho các ca trên (gói nhỏ có "Thủy"/"Thuỷ").

### T6 — Giao diện (Antigravity Argon)
6. Màn rà soát: ô tìm một dòng (gõ tự do, trễ 250 ms, phím `/` để vào ô, Esc xóa) lọc ngay trong danh sách đang mở.
7. Thanh bộ lọc: Trạng thái (Tất cả / Đã xác nhận / Chưa xác nhận); 8 CLS mỗi ô 3 trạng thái (Tất cả → Có → Không); TT KSK; Nguồn (HIS / Thêm tay / Nhận từ kho chung); Đã sửa so với gốc; Cảnh báo (chỉ mã có trong danh sách, kèm số lượng). Kết hợp AND. Hiện "Đang hiển thị X / M hồ sơ" + "Xóa bộ lọc".
8. Phím tắt và chọn dòng chạy trên danh sách đã lọc; STT giữ số gốc; thanh chỉ số vẫn tính trên toàn danh sách.
9. Bộ lọc của từng buổi giữ khi tải lại trang (sessionStorage).
10. Trang `/tim-kiem` (menu "Tìm kiếm"): ô tìm + phạm vi (Buổi của tôi / Kho chờ chung / Toàn bộ app); bảng kết quả có cột Vị trí (đơn vị · ngày · người phụ trách / Kho chung / Kho của …); hồ sơ sửa được → nút "Mở trong danh sách" tới `/ra-soat/<ma_buoi>?chon=<id>` (màn rà soát chọn và cuộn tới dòng đó); không sửa được → ghi "Chỉ xem".
11. Trạng thái rỗng/đang tải/lỗi đầy đủ; "tong > gioi_han" → báo "Hiển thị 200 / N kết quả, hãy gõ thêm từ khóa".

### Chung
12. tsc, lint, test, build sạch. Kịch bản C đạt trên `nhapsl_dev` (v1): lọc "Siêu âm: Không" + "Chưa xác nhận" đếm khớp SQL; lọc "Nghi sao chép XN".
