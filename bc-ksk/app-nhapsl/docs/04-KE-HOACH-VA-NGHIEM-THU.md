# 04 — KẾ HOẠCH BUILD, NGHIỆM THU, TRIỂN KHAI

App chỉ dùng 2 ngày → ưu tiên chức năng nhân viên cần ngay; làm theo thứ tự, mỗi giai đoạn xong ghi một dòng vào `handoff/kenh-cowork/`.

## 1. Giai đoạn

| GĐ | Nội dung | Xong khi |
|---|---|---|
| 1 | Khung Next.js, schema Postgres, lệnh `import` (lần đầu + chạy thử), `users:create`, đăng nhập, middleware, nhật ký | Nạp `v0-20261111-thu` ra đúng số mục 2 |
| 2 | Phân công; màn hình rà soát: chọn đơn vị/ngày, thanh chỉ số, bảng, xác nhận, sửa CLS, sửa nhân thân, phím tắt, khóa lạc quan | Kịch bản A, B |
| 3 | Tìm kiếm không dấu, bộ lọc | Kịch bản C |
| 4 | Kho cá nhân, kho chung, chuyển buổi, nhận về, đề nghị chuyển, thêm hồ sơ + kiểm trùng, xác nhận/mở khóa danh sách | Kịch bản D, E, F |
| 5 | Dashboard nhân viên, dashboard admin | Số khớp SQL kiểm tra |
| 6 | Báo cáo Excel, xuất cho Cowork | Kịch bản G |
| 7 | **Nạp lại phiên bản mới** (mục 4 của `03-THIET-KE.md`) + trang Admin nạp dữ liệu | Kịch bản H |
| 8 | Deploy Vercel, tạo tài khoản, kiểm thử Playwright trên bản production, hướng dẫn sử dụng 1 trang `docs/HUONG-DAN-SU-DUNG.md` | Mục 5 |

GĐ 1–6 cần xong trước khi giao nhân viên. GĐ 7 phải xong trước khi Cowork gửi v1.

## 2. Số kiểm tra sau khi nạp `v0-20261111-thu`
- 60 buổi (TN 25, LK 31, VK 4); Σ `so_doan_tong` = 12.003 (TN 4.016, LK 7.147, VK 840).
- 12.071 hồ sơ trong buổi (TN 4.044, LK 7.179, VK 848); 351 hồ sơ kho chung; tổng 12.422.
- Đối chiếu buổi: `TN-20260907` sổ đoàn 81 / hiện có 78; `TN-20260922` 254 / 272; `LK-20261015` 323 / 333; `VK-20261019` 300 / 306.
- Tổng CLS trong buổi khớp `manifest.json` (ví dụ TN glucose 1.251, LK siêu âm 3.078, VK CTM 14).
- 9 user; sau "Phân công theo gợi ý": `TN-20260907` → `ngan`, `LK-20260928` → `diep`, các buổi `VK-*` và `LK-20260914`…`LK-20260919` chưa phân công.

**Sau khi nạp `v1-20261111-1400`** (bản giao nhân viên): 60 buổi; 12.003 hồ sơ trong buổi (TN 4.016, LK 7.147, VK 840); 419 hồ sơ kho chung; tổng 12.422. Tổng CLS trong buổi: CTM 628, Glucose 3.077, Urê 1.768, Creatinin 1.763, GOT 2.050, GPT 2.049, TPT nước tiểu 222, Siêu âm 6.448 (khớp `manifest.json`). Từng buổi sẽ có thừa/thiếu so sổ đoàn (do ngày đăng ký HIS lệch sổ) — đó là việc nhân viên rà, không phải lỗi app.

## 3. Kịch bản nghiệm thu
**A. Quyền**: `ngan` chỉ thấy buổi của mình; gọi API sửa hồ sơ buổi `diep` → 403; chưa đăng nhập gọi bất kỳ API → 401; trang bất kỳ → chuyển về đăng nhập.

**B. Rà soát**: mở `TN-20260907` → "Sổ đoàn 81 | Trong danh sách 78 | Đã xác nhận 0/78 | Thiếu 3". Xác nhận 1 hồ sơ → 1/78. Đổi siêu âm 1 hồ sơ → viền cam, lịch sử ghi `sua_cls` 1→0 bởi `ngan`. Hai trình duyệt sửa cùng hồ sơ → trình duyệt sau báo xung đột.

**C. Tìm & lọc**: "nguyen thi" ra các tên "Nguyễn Thị…"; 4 số cuối CCCD ra đúng người; "thuy 1960" khớp cả "Thủy"/"Thuỷ"; lọc "Siêu âm: Không" + "Chưa xác nhận" đếm khớp SQL; lọc cảnh báo "Nghi sao chép XN".

**D. Chuyển**: vào kho cá nhân → buổi giảm 1, kho cá nhân tăng 1. Vào kho chung → user khác nhận về buổi của họ. Chuyển sang buổi người khác bắt buộc lý do. Hồ sơ đã xác nhận không chuyển được.

**E. Thêm hồ sơ**: CCCD trùng hồ sơ kho chung → báo trùng, gợi ý nhận về, nhận về không sinh hồ sơ mới. Người mới không mã KCB → lưu được, tự xác nhận, nguồn "thêm tay".

**F. Xác nhận danh sách**: còn hồ sơ chưa xác nhận → nút khóa; lệch sổ đoàn → bắt buộc giải trình; sau xác nhận mọi sửa bị từ chối; admin mở khóa có lý do → sửa lại được.

**G. Xuất**: `bao_cao.xlsx` có `Tong hop`, `Theo buoi`, `Thuy Nguyen`, `Luu Kiem`, `Viet Khe`; `Tong hop` = tổng các sheet chi tiết; cột "Có trong TT KSK" đúng. Gói Cowork đủ 5 file, `ho_so.csv` đúng thứ tự cột, đọc bằng pandas không lỗi tiếng Việt.

**H. Nạp lại** — tự tạo gói thử `v0b` từ v0 bằng script test:
1. Đổi `cls_glucose` của hồ sơ X (chưa chạm) và Y (đã sửa CLS) → sau nạp: X đổi, Y giữ giá trị người rà soát, Y có cảnh báo `NGUON_DOI_SAU_RA_SOAT`.
2. Đổi `ma_buoi` của hồ sơ Z (chưa chạm) sang buổi khác → Z chuyển buổi; của hồ sơ W (đã chuyển vào kho cá nhân) → W giữ trong kho.
3. Bỏ hồ sơ P (chưa chạm) và Q (đã xác nhận) khỏi gói → P thành `an`; Q giữ, có cảnh báo `DA_GO_KHOI_NGUON`.
4. Thêm hồ sơ mới R vào kho chung → R xuất hiện ở kho chung.
5. Nạp lại chính v0 → tóm tắt báo 0 thay đổi.
6. Gói sai sha256 hoặc tổng manifest lệch → từ chối, không ghi gì.

## 4. Các điểm cần hỏi anh Khôi (ghi vào `handoff/kenh-cowork/`, không tự đoán)
- Danh sách nhân viên chính thức, họ tên đầy đủ (hiện chỉ có tên gọi theo sổ đoàn).
- Tên miền Vercel muốn dùng (mặc định `<ten-du-an>.vercel.app`).

## 5. Triển khai Vercel
1. `vercel link` (tài khoản Vercel của anh Khôi), tạo Neon Postgres qua Vercel Marketplace, vùng Singapore; đặt `SESSION_SECRET`.
2. Kiểm `.vercelignore` chứa `data/`, `handoff/`, `db/`; chạy `vercel build` rồi kiểm thư mục `.vercel/output` không có file CSV nào.
3. `vercel --prod`.
4. Từ máy anh Khôi: `npm run db:migrate`, `npm run import -- data/import/v0-20261111-thu --apply`, `npm run users:create` (lưu mật khẩu in ra vào file `handoff/mat-khau-<ngay>.txt` — thư mục này không deploy).
5. Chạy Playwright trên URL production: đăng nhập, mở một buổi, xác nhận, xuất báo cáo.

## 6. Kết thúc đợt rà soát (gỡ bỏ)
1. Admin bấm "Xuất cho Cowork" → lưu zip vào `handoff/export/`.
2. Xuất `bao_cao.xlsx` lần cuối.
3. Báo Cowork đọc kết quả (file trong `handoff/kenh-cowork/`).
4. Sau khi anh Khôi xác nhận: xóa CSDL Neon, xóa dự án Vercel (hoặc tắt deployment). Ghi lại thời điểm gỡ vào `handoff/kenh-cowork/`.
