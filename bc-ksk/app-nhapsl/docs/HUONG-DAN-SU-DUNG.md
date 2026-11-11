# Hướng dẫn sử dụng — App rà soát hồ sơ giấy KSK 2026

**Địa chỉ:** https://ksk-ra-soat-2026.vercel.app · Dùng Chrome hoặc Edge trên máy tính.

## 1. Đăng nhập
Chọn **tên của mình** trong danh sách → mật khẩu `123456` → **Đăng nhập**. Đổi mật khẩu (nếu muốn) ở góc trên bên phải.

## 2. Bắt đầu rà soát
1. Trang **Danh sách của tôi** liệt kê các buổi khám anh/chị phụ trách: DS google sheet, số hồ sơ trong danh sách, đã xác nhận, thừa/thiếu.
2. Bấm vào một buổi để mở màn **Rà soát**.
3. Lấy từng hồ sơ giấy, tìm người đó trong bảng (gõ tên không dấu, năm sinh hoặc 4 số cuối CCCD vào ô tìm, phím `/`).
4. Đối chiếu: họ tên, giới tính, năm sinh, CCCD, địa chỉ, 8 cận lâm sàng (CTM · GLU · URE · CRE · GOT · GPT · NT · SA).
   - Cận lâm sàng khác giấy → bấm ô đó (hoặc phím số 1–8) để đổi. Ô đã sửa có **viền cam**.
   - Thông tin cá nhân khác giấy → **nhấp đúp** dòng (hoặc Enter) → sửa trong khung bên phải → **Lưu thay đổi**.
5. Khớp giấy → tích **Đã kiểm – có hồ sơ giấy** (hoặc phím `Space`). Dòng chuyển **nền xanh**.

Phím tắt: `↑/↓` chọn dòng · `Space` xác nhận · `1–8` đổi CLS · `Enter` mở chi tiết · `K` đưa vào kho của tôi · `C` đưa vào kho chung.

## 3. Hồ sơ không khớp danh sách
| Tình huống | Cách làm |
|---|---|
| Có trong máy nhưng **không có giấy**, nghi khám ngày khác | Đưa vào **kho của tôi** (`K`) để xem lại sau |
| Không phải người của buổi mình | Đưa vào **kho chờ chung** (`C`) hoặc **Chuyển sang buổi khác** (ghi lý do) |
| **Có giấy nhưng thiếu** trong danh sách | Tìm ở **Kho chờ** → *Nhận về buổi…*; hoặc **Tìm kiếm** toàn app → nếu đang ở buổi người khác bấm *Đề nghị chuyển về buổi của tôi* |
| Không tìm thấy ở đâu | **Thêm hồ sơ** (app tự kiểm trùng; mã KCB có thể để trống). Hồ sơ thêm tay tự được xác nhận |

Hồ sơ đã xác nhận phải **bỏ xác nhận** trước khi chuyển. Nhãn cảnh báo (vd *Nghi sao chép XN*, *CLS: HIS khác PM KSK*) — rê chuột để xem giải thích, xem kỹ phiếu giấy.

## 4. Chốt danh sách
Khi mọi hồ sơ trong buổi đã xác nhận → bấm **Xác nhận rà soát xong danh sách**. Nếu số hồ sơ khác DS google sheet, ghi **giải trình** (vd "3 người khám ngày 08/09 nhập nhầm"). Danh sách bị khóa; cần sửa lại thì báo admin mở khóa.

## 5. Admin (BS Khôi)
- **Tổng quan**: tiến độ từng nhân viên, thống kê từng đơn vị, nút **Xuất báo cáo Excel** và **Xuất gói cho Cowork (.zip)**.
- **Phân công**: *Phân công theo sổ đoàn* (gán theo DS google sheet) hoặc chọn nhiều buổi → gán người; sửa DS google sheet của buổi.
- **Người dùng**: thêm, khóa, đặt lại mật khẩu về `123456`. **Nhật ký**: mọi thao tác sửa. **Nạp dữ liệu**: nạp gói mới của Cowork (luôn *Chạy thử* trước).
- Kết thúc đợt: xuất gói Cowork + báo cáo lần cuối → báo Claude gỡ CSDL và dự án Vercel (docs/04 mục 6).
