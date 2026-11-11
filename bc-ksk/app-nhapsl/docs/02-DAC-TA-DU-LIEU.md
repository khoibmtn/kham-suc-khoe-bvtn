# 02 — ĐẶC TẢ DỮ LIỆU (hợp đồng `nhapsl-import-1`)

App nhận dữ liệu **duy nhất** từ gói file do Cowork xuất, và trả kết quả cho Cowork bằng gói xuất. Tài liệu này là hợp đồng giữa hai bên: Cowork cam kết xuất đúng, app cam kết đọc đúng và từ chối gói sai.

## 1. Vị trí và phiên bản
- Gói nhập: `/Users/buiminhkhoi/Documents/Antigravity/kham-suc-khoe/bc-ksk/app-nhapsl/data/import/<phien_ban>/`
- Phiên bản hiện có: **`v0-20261111-thu`** — bản thử để dựng và kiểm thử app. Cờ cận lâm sàng lấy từ phần mềm KSK, **chưa** đối chiếu danh sách xét nghiệm HIS/LIS.
- **`v1-20261111-1400` — bản chính thức** (đã có): 12.003 hồ sơ trong buổi, khớp tổng sổ đoàn từng đơn vị (TN 4.016, LK 7.147, VK 840); cận lâm sàng chuẩn hóa theo Sổ kết quả xét nghiệm và Sổ chẩn đoán hình ảnh của HIS; 419 hồ sơ ở kho chờ chung (68 hồ sơ vượt sổ đoàn + 351 ứng viên). Địa chỉ chi tiết có cho 6.801 người (lấy từ sổ kết quả HIS). **App dùng bản này để giao nhân viên.** Nếu app đã nạp v0 để thử, xóa dữ liệu thử rồi nạp v1 như lần đầu, hoặc nạp lại theo `docs/03-THIET-KE.md` mục 4.
- Tên phiên bản tăng dần theo thời gian; app từ chối nạp phiên bản cũ hơn phiên bản đã nạp (trừ khi `--force`).

## 2. Thành phần gói

| File | Bắt buộc | Nội dung |
|---|---|---|
| `manifest.json` | Có | Thông tin gói, số dòng, tổng kiểm tra, mã băm |
| `buoi_kham.csv` | Có | Danh mục buổi khám (60 dòng ở v0) |
| `ho_so.csv` | Có | Toàn bộ hồ sơ: trong buổi + kho chờ chung (12.422 dòng ở v0) |
| `nguoi_dung.csv` | Có | Danh sách tài khoản gợi ý (không có mật khẩu) |

Quy ước chung cho mọi CSV:
- UTF-8 **có BOM**, phân cách dấu phẩy, dòng 1 là tên cột, trường chứa dấu phẩy được bao nháy kép (chuẩn RFC 4180).
- **Đọc mọi cột dạng chuỗi** (mã KCB, CCCD có số 0 đầu). Ô trống = chuỗi rỗng.
- Cờ 0/1 là chuỗi `"0"`/`"1"`. Ngày `dd/mm/yyyy`. Tên cột chính xác như dưới, thứ tự có thể khác; cột thừa bỏ qua (cảnh báo), thiếu cột bắt buộc → từ chối cả gói.

## 3. `manifest.json`

```json
{
  "schema": "nhapsl-import-1",
  "phien_ban": "v0-20261111-thu",
  "tao_luc": "2026-11-11 13:11:51",            // giờ Việt Nam
  "tao_boi": "Cowork (Claude)",
  "mo_ta": "…",
  "so_dong": { "buoi_kham.csv": 60, "ho_so.csv": 12422,
               "ho_so_trong_buoi": 12071, "ho_so_kho_chung": 351, "nguoi_dung.csv": 9 },
  "tong_theo_don_vi": {
    "TN": { "so_buoi": 25, "so_doan": 4016, "ho_so_trong_buoi": 4044,
            "cls_ctm": 82, "cls_glucose": 1251, "cls_ure": 151, "cls_creatinin": 150,
            "cls_got": 357, "cls_gpt": 357, "cls_tpt_nuoc_tieu": 52, "cls_sieu_am": 2541 },
    "LK": { … }, "VK": { … } },
  "sha256": { "buoi_kham.csv": "…", "ho_so.csv": "…", "nguoi_dung.csv": "…" }
}
```
App phải: (1) kiểm `schema` đúng `nhapsl-import-1`; (2) kiểm sha256 từng file; (3) đếm lại số dòng và các tổng trong `tong_theo_don_vi` (đếm trên `ho_so.csv` với `vi_tri_ban_dau = buoi`) — lệch bất kỳ số nào → từ chối, in rõ số nào lệch.

## 4. `buoi_kham.csv`

| Cột | Kiểu | Bắt buộc | Ý nghĩa |
|---|---|---|---|
| `ma_buoi` | chuỗi | Có, duy nhất | `<don_vi>-<yyyymmdd>`, ví dụ `TN-20260907`. Khóa ổn định giữa các phiên bản |
| `don_vi` | `TN`/`LK`/`VK` | Có | |
| `ten_don_vi` | chuỗi | Có | Phường Thủy Nguyên / Phường Lưu Kiếm / Xã Việt Khê |
| `ngay_kham` | dd/mm/yyyy | Có | |
| `diem_kham` | chuỗi | Không | Ví dụ "TYT Hoa Động" |
| `doan_kham` | chuỗi | Không | "Đoàn 2", "Đoàn 3" |
| `nv_goi_y` | username | Không | Người phụ trách gợi ý theo sổ đoàn (trống ở LK 14–19/09 và cả 4 buổi VK) |
| `so_doan_tong` | số nguyên | Có | **Số người khám chuẩn của buổi theo sổ đoàn** |
| `so_doan_duoi_6`, `so_doan_6_18`, `so_doan_tu_18` | số | Không | Cơ cấu tuổi theo sổ đoàn |
| `so_doan_xn_mau`, `so_doan_nuoc_tieu`, `so_doan_sieu_am` | số | Không | Số lượt xét nghiệm máu, nước tiểu, siêu âm theo sổ đoàn (chỉ hiển thị tham khảo) |
| `so_doan_co_kl`, `so_doan_cho_kl` | số | Không | Số phiếu có kết luận / chờ kết luận theo sổ đoàn |

v0: 60 buổi — TN 25 (07/09–05/10), LK 31 (14/09–20/10), VK 4 (16–19/10); Σ `so_doan_tong` = 12.003 (TN 4.016, LK 7.147, VK 840).

## 5. `ho_so.csv`

| Cột | Kiểu | Bắt buộc | Ý nghĩa / quy tắc |
|---|---|---|---|
| `ma_ho_so` | chuỗi | Có, duy nhất | Khóa ổn định giữa các phiên bản. Hồ sơ từ HIS: `H<ma_kcb>`. Cowork không đổi mã của một người giữa các phiên bản |
| `vi_tri_ban_dau` | `buoi` / `kho_chung` | Có | Nơi Cowork đề xuất đặt hồ sơ |
| `ma_buoi` | chuỗi | Có nếu `buoi` | Phải tồn tại trong `buoi_kham.csv` |
| `don_vi_goi_y` | `TN`/`LK`/`VK`/trống | Không | Với hồ sơ kho chung: đơn vị đoán theo địa chỉ thẻ, dùng để lọc trong kho |
| `ma_kcb` | chuỗi | Không | Mã KCB trên HIS |
| `ho_ten` | chuỗi | Có | IN HOA có dấu |
| `gioi_tinh` | `Nam`/`Nữ`/`Khác`/trống | Có | `Khác` hoặc trống → app để **trống** (không từ chối gói), nhân viên sửa theo hồ sơ giấy trên giao diện (anh Khôi chốt 11/11/2026). Giá trị khác → từ chối |
| `nam_sinh` | 4 số | Có | |
| `cccd` | chuỗi số | Không | 12 số (một số 9 số CMND) |
| `so_the_bhyt`, `so_dt` | chuỗi | Không | Chỉ dùng để tìm kiếm, không hiện trên bảng |
| `dia_chi_chi_tiet` | chuỗi | Không | Tổ dân phố/thôn/xóm. **v0 trống toàn bộ** (HIS chưa xuất được); người rà soát nhập tay |
| `dia_chi_the` | chuỗi | Không | Cấp xã/phường (ví dụ `Phường Lưu Kiếm--Thành phố Hải Phòng`), hiển thị phụ |
| `ngay_gio_dang_ky_his` | `dd/mm/yyyy HH:MM` | Không | Thời điểm đăng ký trên HIS, hiển thị phụ để phát hiện nhập nhầm ngày |
| `cls_ctm` | 0/1 | Có | Tổng phân tích tế bào máu ngoại vi. **Từ v1, 8 cờ `cls_*` = có kết quả trên Sổ KQ XN / Sổ CĐHA của HIS** (nguồn chuẩn); v0 lấy từ phần mềm KSK |
| `cls_glucose` | 0/1 | Có | Định lượng glucose máu |
| `cls_ure` | 0/1 | Có | Định lượng urê máu |
| `cls_creatinin` | 0/1 | Có | Định lượng creatinin máu |
| `cls_got` | 0/1 | Có | Đo hoạt độ AST (GOT) |
| `cls_gpt` | 0/1 | Có | Đo hoạt độ ALT (GPT) |
| `cls_tpt_nuoc_tieu` | 0/1 | Có | Tổng phân tích nước tiểu |
| `cls_sieu_am` | 0/1 | Có | Siêu âm ổ bụng |
| `cls_ghi_chu` | chuỗi | Không | Khác biệt giữa sổ KQ HIS và phần mềm KSK, ví dụ "Sổ KQ HIS có, phần mềm KSK không: SA; Phần mềm KSK có, sổ KQ HIS không (không tính): GLU, URE". Hiện khi rê chuột vào ô CLS |
| `co_tt_ksk` | 0/1 | Có | Có hồ sơ trong dữ liệu phần mềm KSK (file TT KSK). **Dùng cho cột "Có trong TT KSK"** của báo cáo |
| `so_ksk` | chuỗi | Không | Số phiếu KSK |
| `ky_so` | 0/1 | Không | Hồ sơ đã ký số trên phần mềm KSK |
| `ket_luan_phan_loai` | `1`–`5`/trống | Không | Phân loại sức khỏe |
| `canh_bao` | mã, phân cách `\|` | Không | Xem bảng mã dưới. App hiển thị biểu tượng + lọc được |
| `ghi_chu_cowork` | chuỗi | Không | Ghi chú của Cowork (ví dụ lý do đưa vào kho chung) |

Mã cảnh báo (`canh_bao`), app hiển thị bằng nhãn tiếng Việt:

| Mã | Nhãn hiển thị | Ý nghĩa |
|---|---|---|
| `NGHI_SAO_CHEP_XN` | Nghi sao chép XN | Kết quả xét nghiệm trùng y hệt hồ sơ khác — xem kỹ phiếu giấy |
| `KHONG_CO_TT_KSK` | Không có trong TT KSK | Có đăng ký HIS nhưng không có hồ sơ trên phần mềm KSK |
| `NGOAI_DS_SO_BO` | Ngoài DS sơ bộ | Không thuộc danh sách 12.003 Cowork chốt sơ bộ — dễ là hồ sơ thừa của buổi |
| `CLS_LECH_NGUON` | CLS lệch nguồn | (từ v1) Sổ KQ HIS và phần mềm KSK không thống nhất; cờ `cls_*` đã theo sổ KQ HIS; chi tiết ở `cls_ghi_chu` |
| `LECH_NGAY` | Ngày CLS khác ngày đăng ký | (từ v1) Ngày làm xét nghiệm/siêu âm trên HIS khác ngày buổi khám |
| `KHONG_BANG_CHUNG` | Chưa có bằng chứng khám | (từ v1) Không có kết quả CLS trên HIS và không có hồ sơ trên phần mềm KSK — được đưa vào để đủ sổ đoàn, **phải kiểm hồ sơ giấy** (220 hồ sơ: LK 180, TN 40) |
| `CO_KQ_CLS_HIS` | Có kết quả CLS trên HIS | (từ v1, hồ sơ kho chung) Người này có làm CLS trong đợt — nhiều khả năng đã khám, ưu tiên tìm giấy |
| *(mã khác)* | hiển thị nguyên mã | App không từ chối mã lạ, chỉ hiển thị |

v0: 12.422 dòng = 12.071 trong buổi (TN 4.044, LK 7.179, VK 848) + 351 kho chung.

## 6. `nguoi_dung.csv`

| Cột | Ý nghĩa |
|---|---|
| `username` | Tên đăng nhập, chữ thường không dấu |
| `ho_ten` | Tên hiển thị |
| `vai_tro` | `admin` / `nhan_vien` |

v0: `admin` (Bùi Minh Khôi), `ngan`, `trinh`, `le`, `giang`, `san`, `diep`, `lien`, `hoa`. Lệnh `users:create` chỉ tạo user chưa có, không đổi mật khẩu user đã có.

## 7. Dữ liệu xuất cho Cowork (`handoff/export/<YYYYMMDD-HHMM>/`)
Tạo bằng `npm run export:cowork` hoặc nút trên trang Admin (tải về file zip cùng cấu trúc).

| File | Nội dung |
|---|---|
| `manifest.json` | `schema: "nhapsl-export-1"`, thời điểm xuất, phiên bản gói nhập đang dùng, số dòng, tổng theo đơn vị (đã xác nhận, từng CLS) |
| `ho_so.csv` | Mọi hồ sơ (trong buổi, kho cá nhân, kho chung, đã gỡ khỏi nguồn) |
| `buoi_kham.csv` | Mọi buổi + trạng thái rà soát |
| `nhat_ky.csv` | Toàn bộ nhật ký |
| `bao_cao.xlsx` | Đúng file báo cáo dùng ngay (`docs/01-YEU-CAU.md` mục 4.10a) |

`ho_so.csv` xuất — cột theo đúng thứ tự:
`ma_ho_so, nguon, trang_thai_nguon, vi_tri, ma_buoi, don_vi, ngay_kham, kho_cua_user, ma_kcb, ho_ten, gioi_tinh, nam_sinh, cccd, dia_chi_chi_tiet, cls_ctm, cls_glucose, cls_ure, cls_creatinin, cls_got, cls_gpt, cls_tpt_nuoc_tieu, cls_sieu_am, nguon_cls_ctm, nguon_cls_glucose, nguon_cls_ure, nguon_cls_creatinin, nguon_cls_got, nguon_cls_gpt, nguon_cls_tpt_nuoc_tieu, nguon_cls_sieu_am, co_tt_ksk, canh_bao, ma_buoi_ban_dau, da_xac_nhan, xac_nhan_boi, xac_nhan_luc, da_sua_theo_giay, ghi_chu, tao_boi, tao_luc, sua_boi, sua_luc`
- `nguon`: `cowork` (từ gói) / `them_tay`.
- `trang_thai_nguon`: `co_trong_goi` / `da_go_khoi_goi` (phiên bản mới không còn hồ sơ này).
- `vi_tri`: `buoi` / `kho_ca_nhan` / `kho_chung` / `an` (đã gỡ khỏi nguồn và chưa được rà soát).
- `cls_*`: giá trị hiện hành (đã sửa theo giấy nếu có); `nguon_cls_*`: giá trị trong gói nhập mới nhất.
- `da_sua_theo_giay`: 1 nếu bất kỳ trường nhân thân hoặc CLS nào khác giá trị trong gói.
- Thời điểm dạng `yyyy-mm-dd HH:MM:SS` giờ Việt Nam.

`buoi_kham.csv` xuất: `ma_buoi, don_vi, ngay_kham, diem_kham, phu_trach, so_doan_tong, ho_so_hien_co, da_xac_nhan, thua, thieu, bo_sung, trang_thai, xac_nhan_boi, xac_nhan_luc, giai_trinh`.

`nhat_ky.csv`: `thoi_diem, username, hanh_dong, doi_tuong, ma_doi_tuong, truong, gia_tri_cu, gia_tri_moi, ghi_chu`.
