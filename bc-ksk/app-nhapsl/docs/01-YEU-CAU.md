# 01 — YÊU CẦU NGHIỆP VỤ

## 1. Nguyên văn yêu cầu của anh Khôi (11/11/2026)

> tôi muốn dùng claude code xây dựng 1 ứng dụng để nhân viên rà soát từng hồ sơ giấy. ứng dụng phải đảm bảo thực hiện được việc sau:
> * đăng nhập theo user để gán user theo từng ngày và ghi dấu hoạt động sửa chữa theo user
> * thiết lập ngày khám, địa điểm khám cho từng user
> * khi user đăng nhập sẽ thấy được danh sách khám của mình phụ trách. trường hợp có trường hợp không phải của mình có thể chuyển sang người khác hoặc đưa vào danh sách chờ. user thấy thiếu có thể vào danh sách chờ xem có ca của mình không để nhận về
> * user chọn địa phương, chọn ngày: sẽ hiển thị danh sách theo ngày đó, báo số lượng hồ sơ có trong danh sách. mỗi case sẽ có thông tin đối chiếu gồm: mã KCB, họ tên, giới tính, năm sinh, số CCCD, địa chỉ (tổ dân phố, xóm..., không cần xã phường thành phố vì đã ở bộ lọc), có làm hay không các cận lâm sàng: CTM, Glucose, Ure, Creatinin, GOT, GPT, TPT nước tiểu, Siêu âm ổ bụng và nút xác nhận là đã kiểm, có hồ sơ giấy
> * Khi user check đúng case đó khớp với hồ sơ giấy sẽ check xác nhận. thông tin trên giao diện cũng hiển thị bao nhiêu hồ sơ đã xác nhận trên tổng số hồ sơ có trong danh sách. bộ lọc phải lọc được những case đã xác nhận, case chưa xác nhận; đồng thời lọc được những ca có làm/không làm từng cận lâm sàng
> * Giao diện phải có tìm kiếm linh hoạt: ví dụ tìm được theo họ tên, năm sinh, CCCD...
> * đồng thời có chức năng loại case ra khỏi danh sách vào danh sách chờ của chính user đó (tạm chưa xếp vào danh sách nào để chờ kiểm tra lại, ví có thể khám vào 1 ngày nhưng nhập liệu vào ngày khác)
> * đồng thời có chức năng thêm case vào: thêm các thông tin cơ bản như mã KCB, họ tên, giới tính, năm sinh, số CCCD, địa chỉ (tổ dân phố, xóm..., không cần xã phường thành phố vì đã ở bộ lọc), có làm hay không các cận lâm sàng: CTM, Glucose, Ure, Creatinin, GOT, GPT, TPT nước tiểu, Siêu âm ổ bụng (mã KCB chưa có thì có thể để trống). mỗi danh sách sau khi hoàn thành thì có nút xác nhận rà soát xong danh sách đó
> * mỗi user có dashboard theo dõi được tiến độ: danh sách nào đã xác nhận, danh sách nào chưa, thừa thiếu bao nhiêu hồ sơ, còn bao nhiêu hồ sơ chưa rà soát..
> * admin (là tôi) cũng có dashboard nhìn được tiến độ mỗi user (bao nhiêu ngày phụ trách, bao nhiêu hồ sơ, đã xác nhận được danh sách bao nhiêu ngày, bao nhiêu hồ sơ, bổ sung thêm bao nhiêu hồ sơ, còn bao nhiêu hồ sơ chưa xác nhận, tiến độ bao nhiêu %)
> * Danh sách đó cũng phải xuất ra định dạng để quay lại đây bạn đọc được, đủ thông tin để làm các báo cáo thống kê trên; đồng thời ngay trên app cũng xuất được file báo cáo dùng được luôn như sheet tổng hợp thống kê mỗi xã, phường các thông tin: tổng số người khám, số người được chỉ định từng cận lâm sàng (không cần thống kê làm ít nhất 1 cận lâm sàng nào đó), số hồ sơ có trong dữ liệu khám sức khỏe (chính là file TT KSK xxx mà tôi cho bạn đọc); đồng thời có sheet chi tiết, mỗi xã phường 1 sheet; thông tin như trong danh sách kèm theo đánh dấu có trong danh sách TT KSK hay không)

## 2. Mục đích và nguyên tắc nghiệp vụ

- **Hồ sơ giấy là chuẩn.** Danh sách điện tử chỉ là bản nháp để đối chiếu. Khi giấy và máy khác nhau, người rà soát sửa theo giấy.
- **Sổ đoàn là số chuẩn của mỗi buổi khám** (cột `so_doan_tong` trong `buoi_kham.csv` của gói dữ liệu). Sau rà soát, số hồ sơ đã xác nhận của một buổi lý tưởng bằng `so_doan_tong`. Lệch thì phải giải trình bằng ghi chú.
- **Một người = một hồ sơ trong toàn app.** Một hồ sơ tại mỗi thời điểm chỉ nằm ở một chỗ: một danh sách buổi khám, hoặc kho chờ cá nhân của một user, hoặc kho chờ chung.
- **Chỉ 8 cận lâm sàng** thuộc danh mục KSK toàn dân (theo danh mục kỹ thuật áp dụng cho KSK toàn dân). Không thêm kỹ thuật khác:

| Mã trong app | Tên hiển thị | Tên kỹ thuật chuẩn |
|---|---|---|
| `ctm` | CTM | Tổng phân tích tế bào máu ngoại vi (máy đếm laser hoặc tổng trở) |
| `glucose` | Glucose | Định lượng glucose [máu] |
| `ure` | Urê | Định lượng urê máu |
| `creatinin` | Creatinin | Định lượng creatinin (máu) |
| `got` | GOT | Đo hoạt độ AST (GOT) [máu] |
| `gpt` | GPT | Đo hoạt độ ALT (GPT) [máu] |
| `tpt_nuoc_tieu` | TPT nước tiểu | Tổng phân tích nước tiểu (bằng máy tự động) |
| `sieu_am` | Siêu âm ổ bụng | Siêu âm ổ bụng |

Một người làm 0, 1 hoặc nhiều kỹ thuật trong danh mục này.

## 3. Khái niệm dùng trong app

| Khái niệm | Nghĩa |
|---|---|
| **Đơn vị (địa phương)** | Phường Thủy Nguyên (TN), Phường Lưu Kiếm (LK), Xã Việt Khê (VK) |
| **Buổi khám / Danh sách** | Một cặp (đơn vị, ngày khám). Có 60 buổi: TN 25, LK 31, VK 4. Mỗi buổi có số sổ đoàn, điểm khám, đoàn khám, người phụ trách |
| **Hồ sơ (case)** | Một người được khám. Có thông tin nhân thân, 8 cờ cận lâm sàng, trạng thái xác nhận |
| **Xác nhận hồ sơ** | Người rà soát tích "Đã kiểm – có hồ sơ giấy" sau khi đối chiếu khớp với giấy (đã sửa thông tin, cờ CLS theo giấy nếu khác) |
| **Xác nhận danh sách** | Người phụ trách bấm "Xác nhận rà soát xong danh sách" khi đã xử lý hết hồ sơ của buổi. Danh sách bị khóa sau khi xác nhận |
| **Kho chờ cá nhân** | Nơi user tạm gác hồ sơ đang nghi ngờ (ví dụ khám ngày khác nhưng nhập liệu nhầm ngày). Chỉ user đó thấy và xử lý |
| **Kho chờ chung** | Nơi chứa hồ sơ chưa thuộc buổi nào. Mọi user thấy, tìm và nhận về buổi của mình |
| **Thừa / thiếu** | So sánh số hồ sơ đang có trong danh sách buổi với số sổ đoàn của buổi: thừa = có − sổ đoàn (nếu dương), thiếu = sổ đoàn − có (nếu dương) |
| **Bổ sung** | Hồ sơ do user thêm tay (không có trong dữ liệu HIS ban đầu) hoặc nhận từ kho chờ chung |

## 4. Chức năng chi tiết

### 4.1. Đăng nhập, phân quyền, nhật ký
- Đăng nhập bằng tên đăng nhập + mật khẩu. Hai vai trò: `admin`, `nhan_vien`.
- Tài khoản tạo từ `nguoi_dung.csv` của gói dữ liệu bằng lệnh `npm run users:create` (mật khẩu ngẫu nhiên in ra một lần) hoặc admin tạo trên giao diện. Không có đăng ký tự do. Người dùng được đổi mật khẩu.
- Mọi thao tác ghi (xác nhận, bỏ xác nhận, sửa trường, chuyển hồ sơ, thêm hồ sơ, xác nhận danh sách, mở khóa, phân công) ghi vào nhật ký: thời điểm, user, hành động, đối tượng, giá trị cũ → mới, ghi chú.
- Mỗi hồ sơ có tab "Lịch sử" xem toàn bộ nhật ký của hồ sơ đó.
- Phiên đăng nhập hết hạn sau 12 giờ không hoạt động.

### 4.2. Phân công (admin)
- Admin quản lý user: tạo, sửa họ tên, đặt lại mật khẩu, khóa/mở.
- Admin phân công **mỗi buổi khám cho 1 user phụ trách**. Có nút "Phân công theo sổ đoàn" gán sẵn theo cột `nv_goi_y` trong `buoi_kham.csv` (buổi nào trống thì để chưa phân công).
- Admin sửa được thông tin buổi khám: điểm khám, đoàn khám, số sổ đoàn (có nhật ký), thêm buổi mới nếu phát hiện thiếu.
- Phân công hàng loạt: chọn nhiều buổi → gán cho một user.

### 4.3. Màn hình làm việc của nhân viên
- Sau khi đăng nhập, nhân viên thấy **danh sách các buổi mình phụ trách**, mỗi buổi kèm: đơn vị, ngày, điểm khám, sổ đoàn, số hồ sơ đang có, số đã xác nhận, thừa/thiếu, trạng thái danh sách.
- Chọn **đơn vị → ngày** (hai bộ chọn, chỉ hiện buổi mình phụ trách; admin thấy tất cả) để mở danh sách.
- Đầu danh sách luôn hiển thị: `Sổ đoàn: N | Trong danh sách: M | Đã xác nhận: X/M | Thừa: … | Thiếu: …`.
- Mỗi dòng hồ sơ hiển thị: STT, mã KCB, họ tên, giới tính, năm sinh, CCCD, địa chỉ chi tiết, 8 ô cận lâm sàng (có/không), ô "Đã kiểm – có hồ sơ giấy", nút thao tác.
- Hiển thị phụ (nhỏ, màu nhạt, giúp đối chiếu): ngày + giờ đăng ký HIS, có trong TT KSK hay không, nghi sao chép xét nghiệm.
- Ô cận lâm sàng **sửa trực tiếp được** (bấm để đổi có/không). Mỗi lần đổi ghi nhật ký. Ô nào đã khác dữ liệu gốc thì tô màu để biết đã sửa theo giấy.
- Sửa nhanh nhân thân (họ tên, giới tính, năm sinh, CCCD, địa chỉ, mã KCB) qua form; ghi nhật ký.
- Thao tác bàn phím: ↑/↓ chuyển dòng, phím cách tích xác nhận, phím số 1–8 bật/tắt từng cận lâm sàng của dòng đang chọn (để rà nhanh hàng trăm hồ sơ).

### 4.4. Bộ lọc và tìm kiếm
- Lọc trạng thái: Tất cả / Đã xác nhận / Chưa xác nhận.
- Lọc từng cận lâm sàng: Tất cả / Có làm / Không làm (8 bộ lọc độc lập, kết hợp AND).
- Lọc thêm: Có trong TT KSK / Không; Nguồn hồ sơ (dữ liệu HIS / thêm tay / nhận từ kho chờ chung); Đã sửa so với dữ liệu gốc.
- Ô tìm kiếm linh hoạt, một ô duy nhất, gõ tự do:
  - Họ tên không dấu, một phần tên ("ng van an", "hoa 1960").
  - Năm sinh (4 số), CCCD (đủ hoặc một phần, ≥ 4 số), mã KCB, số điện thoại, số thẻ BHYT.
  - Nhiều từ khóa kết hợp AND ("nguyen thi 1958 2345").
- Tìm được trong phạm vi: danh sách đang mở / tất cả buổi mình phụ trách / kho chờ chung / toàn bộ app (admin hoặc khi nhân viên cần tìm hồ sơ nằm nhầm buổi của người khác — chỉ xem, không sửa được hồ sơ không thuộc mình, nhưng có nút "Đề nghị chuyển về buổi của tôi" gửi cho người đang giữ hoặc admin).

### 4.5. Chuyển hồ sơ
Từ một dòng hồ sơ trong danh sách của mình, user có các lựa chọn:
1. **Đưa vào kho chờ cá nhân** — tạm gác, chưa xếp buổi nào (ví dụ nghi khám ngày khác).
2. **Đưa vào kho chờ chung** — không phải của mình; ai thấy thiếu thì nhận.
3. **Chuyển sang buổi khác** — chọn đơn vị + ngày đích; hồ sơ sang danh sách của người phụ trách buổi đó. Bắt buộc nhập lý do ngắn.
4. Từ **kho chờ cá nhân** hoặc **kho chờ chung**: "Nhận về buổi …" (chọn một buổi mình phụ trách).
- Không chuyển được hồ sơ đã xác nhận (phải bỏ xác nhận trước). Không chuyển vào/ra danh sách đã khóa.
- Hồ sơ trong kho chờ chung hiển thị nguồn gốc: từ buổi nào, ai đưa vào, lý do.
- Kho chờ chung ban đầu nhận các hồ sơ có `vi_tri_ban_dau = kho_chung` trong gói dữ liệu (bản v0 có 351 hồ sơ), để người rà soát tìm người có giấy nhưng thiếu trong danh sách.

### 4.6. Thêm hồ sơ
- Nút "Thêm hồ sơ" trong danh sách đang mở. Trường: mã KCB (không bắt buộc), họ tên (bắt buộc), giới tính (bắt buộc), năm sinh (bắt buộc), CCCD (không bắt buộc, nếu nhập phải đủ 12 số hoặc 9 số CMND cũ), địa chỉ chi tiết, 8 cờ cận lâm sàng, ghi chú.
- Trước khi lưu, app **tìm trùng** trên toàn app theo CCCD, mã KCB, hoặc họ tên không dấu + năm sinh. Nếu có, hiện hồ sơ trùng đang nằm ở đâu và gợi ý "Nhận hồ sơ đó về" thay vì tạo mới. User vẫn có thể tạo mới nếu chắc chắn khác người (phải ghi lý do).
- Hồ sơ thêm tay được tự động đánh dấu "Đã kiểm – có hồ sơ giấy" (vì thêm từ giấy) và nguồn = `them_tay`.

### 4.7. Xác nhận danh sách
- Nút "Xác nhận rà soát xong danh sách" bật khi **mọi hồ sơ còn trong danh sách đều đã xác nhận**.
- Nếu số đã xác nhận ≠ sổ đoàn: app cảnh báo rõ thừa/thiếu bao nhiêu, bắt buộc nhập giải trình rồi mới xác nhận được.
- Sau xác nhận: danh sách khóa, không sửa, không chuyển vào/ra. Admin mở khóa được (bắt buộc ghi lý do).

### 4.8. Dashboard nhân viên
- Thẻ tổng: số buổi phụ trách; số buổi đã xác nhận / chưa; tổng hồ sơ; đã xác nhận; chưa rà soát; số hồ sơ trong kho chờ cá nhân; % tiến độ.
- Bảng từng buổi: đơn vị, ngày, điểm khám, sổ đoàn, hồ sơ trong danh sách, đã xác nhận, chưa xác nhận, thừa, thiếu, bổ sung, trạng thái danh sách. Bấm vào để mở.
- Danh sách hồ sơ đang trong kho chờ cá nhân, có nút xử lý nhanh.

### 4.9. Dashboard admin
- Bảng theo user: số buổi phụ trách; số buổi đã xác nhận; tổng hồ sơ phụ trách; đã xác nhận; bổ sung (thêm tay + nhận từ kho chung); còn chưa xác nhận; số trong kho chờ cá nhân; **% tiến độ = hồ sơ đã xác nhận / tổng hồ sơ phụ trách**; lần hoạt động gần nhất.
- Bảng theo đơn vị: sổ đoàn, hồ sơ hiện có, đã xác nhận, thừa/thiếu, có trong TT KSK, số người được chỉ định từng cận lâm sàng (chỉ tính hồ sơ đã xác nhận).
- Bảng theo buổi (toàn bộ 60 buổi) với các cột như dashboard nhân viên + người phụ trách; lọc theo đơn vị, trạng thái, người phụ trách.
- Số hồ sơ trong kho chờ chung; danh sách đề nghị chuyển đang chờ.
- Nhật ký hoạt động toàn app (lọc theo user, ngày, hành động).

### 4.10. Xuất dữ liệu
**(a) Báo cáo Excel dùng ngay** (nút trên dashboard admin, nhân viên xuất được phần mình):
- Sheet `Tong hop`: mỗi đơn vị một dòng + dòng Cộng. Cột: Đơn vị; Sổ đoàn; **Tổng số người khám** (= số hồ sơ đã xác nhận có giấy); Số người được chỉ định CTM; Glucose; Urê; Creatinin; GOT; GPT; TPT nước tiểu; Siêu âm ổ bụng; **Số hồ sơ có trong dữ liệu TT KSK**; Số hồ sơ không có trong TT KSK; Thừa/thiếu so sổ đoàn. Không có cột "làm ít nhất 1 cận lâm sàng".
- Sheet `Theo buoi`: mỗi buổi một dòng, cùng các cột như trên + người phụ trách + trạng thái danh sách.
- Sheet `Thuy Nguyen`, `Luu Kiem`, `Viet Khe`: mỗi đơn vị một sheet chi tiết. Cột: STT, Ngày khám, Mã KCB, Họ tên, Giới tính, Năm sinh, CCCD, Địa chỉ chi tiết, 8 cột cận lâm sàng (đánh "x" nếu có), **Có trong TT KSK (Có/Không)**, Đã xác nhận, Người xác nhận, Thời điểm xác nhận, Nguồn hồ sơ, Ghi chú.
- Tùy chọn khi xuất: chỉ hồ sơ đã xác nhận (mặc định) hoặc tất cả.
- Định dạng: tiêu đề in đậm, cố định dòng tiêu đề, độ rộng cột vừa nội dung, số có dấu chấm ngăn nghìn, font Times New Roman 12 (theo văn bản hành chính).

**(b) Xuất dữ liệu máy đọc cho Cowork** — xem `docs/02-DAC-TA-DU-LIEU.md` mục 7.

### 4.11. Nạp dữ liệu (admin)
- **Nguồn duy nhất là gói dữ liệu do Cowork xuất** (`data/import/<phien_ban>/`, đặc tả `nhapsl-import-1` trong `docs/02-DAC-TA-DU-LIEU.md`). App không đọc file HIS/LIS/TT KSK gốc.
- **Nạp lần đầu**: CSDL trống → nạp toàn bộ buổi khám, hồ sơ (vào đúng buổi hoặc kho chờ chung), danh sách người dùng gợi ý.
- **Nạp lại phiên bản mới** (ví dụ v0 thử → v1 sau khi Cowork đối chiếu danh sách xét nghiệm): cập nhật theo quy tắc ở `docs/03-THIET-KE.md` mục 4. Nguyên tắc: **không bao giờ làm mất công rà soát** của nhân viên (xác nhận, sửa theo giấy, chuyển chỗ, hồ sơ thêm tay).
- Có hai cách nạp: lệnh `npm run import` (chính, chạy từ máy anh Khôi) và trang Admin → "Nạp dữ liệu" (tải lên các file của gói). Cả hai đều bắt buộc **chạy thử trước** để xem tóm tắt (thêm mới / cập nhật / giữ nguyên do đã rà soát / gỡ khỏi nguồn) rồi mới xác nhận ghi.
- Lịch sử các lần nạp (phiên bản, thời điểm, người nạp, tóm tắt) xem được ở trang Admin.

## 5. Yêu cầu phi chức năng
- Triển khai trên **Vercel**, dùng trong 2 ngày, 8–10 người đồng thời; danh sách 400 dòng tải < 1,5 giây; tìm kiếm phản hồi < 500 ms.
- Chỉ người có tài khoản mới truy cập; không lập chỉ mục tìm kiếm (noindex); kết thúc đợt rà soát thì xuất kết quả, sau đó xóa CSDL và dự án Vercel (theo `docs/04` mục 6).
- Chống ghi đè đồng thời: hai người sửa cùng hồ sơ → người lưu sau nhận thông báo "hồ sơ đã thay đổi, tải lại".
- Nhân viên dùng Chrome/Edge trên máy tính; giao diện gọn, chữ ≥ 14px, bảng có dòng kẻ rõ.
