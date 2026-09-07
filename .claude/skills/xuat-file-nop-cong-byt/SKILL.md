---
name: xuat-file-nop-cong-byt
description: >-
  Biến file mẫu .xlsm của Bộ Y tế thành file import ĐƯỢC vào Cổng dữ liệu sức khỏe
  (admin.csdlksk.vn). Gồm 4 quy tắc bắt buộc, cách tách ca khám nhiều lần, cách tự
  kiểm tra file trước khi đẩy, và các giới hạn không sửa được từ phía file.
triggers:
  - "xuất file nộp Bộ"
  - "đẩy lên cổng sức khỏe"
  - "import vào csdlksk"
  - "file xlsm không nhận phường xã"
  - "cổng không nhận dữ liệu"
  - "sửa file mẫu Bộ Y tế"
---

# Xuất file nộp Cổng dữ liệu sức khỏe (BYT)

Đúc kết từ phiên điều tra 2026-09-07/08: đọc mã nguồn JS công khai của cổng
(`admin.csdlksk.vn`), chặn và đọc payload thật, rồi đẩy thử từng ca để kiểm chứng.
**Mọi kết luận dưới đây đều đã xác minh bằng thực nghiệm, không suy đoán.**

## Bối cảnh: vì sao file mẫu của Bộ không dùng thẳng được

File `Import_KSK_Tren_18.xlsm` có 3 khiếm khuyết. Trình đọc Excel của cổng là
**SheetJS chạy trong trình duyệt**, và nó **chỉ đọc giá trị đã tính sẵn** — công
thức không có cached value thì coi như ô rỗng. openpyxl lại không tính được công
thức. Vì vậy phải **tự tra danh mục và ghi giá trị thật**.

## 4 quy tắc bắt buộc

### 1. Cột O ẩn = `MAHUYEN`, ghi dạng TEXT

Đây là trường **quyết định phường/xã**. Cổng gửi lên server đúng con số ở ô này
(`payload.ward`); **tên xã ở cột N không hề được gửi đi**.

- Công thức gốc của Bộ lấy nhầm `dmhuyen` cột D (`HUYEN_ID` — mã nội bộ) và còn
  kèm lỗi `#REF!`. Mã server thực nhận là **cột E (`MAHUYEN`)**.
- Ví dụ Phường Bạch Đằng: `MAHUYEN=11473` ĐÚNG · `HUYEN_ID=12327` SAI ·
  `id` trong API danh mục `=1153` cũng SAI.
- **Ghi dạng text** — nhiều xã có mã bắt đầu bằng số 0 (`01708`, `00292`).
- Cột M ẩn (mã tỉnh) không quan trọng: cổng tự giải theo TÊN tỉnh rồi ghi đè bằng
  id sống của nó. Vẫn nên ghi giá trị thật thay vì để công thức.

Tra bằng chính sheet `dmhuyen` trong file mẫu: khoá `C = MATINH & TENXA`, lấy cột E.

### 2. Bốn cột bệnh phải là MÃ ICD, tách bằng `;`, TUYỆT ĐỐI không có dấu phẩy

`TSBT_MA_BENH_KHAC` (AW) · `TSBT_MA_BENH` (AY) · `KET_LUAN_BENH` (CX) ·
`CAC_BENH_TAT_NEU_CO` (CY).

Hàm `ln()` của cổng tách chuỗi theo `; , |` rồi dò regex
`[A-Z][0-9]{1,3}(\.[0-9]{1,4})?`. Không rút được mã nào thì nó **GHI ĐÈ trường
bằng chuỗi rỗng** — tên bệnh tiếng Việt bị xoá chứ không được giữ.

**Bẫy quan trọng:** cổng đọc **CY trước** rồi ghi đè luôn CX. CY sai là mất cả hai.

### 3. `SO_CCCD` phải đúng 12 chữ số

Sai độ dài → cổng báo `Số căn cước công dân không hợp lệ` và **loại nguyên dòng**.
Lọc trước khi xuất: `length(trim(so_cccd)) <> 12`.

### 4. Một CCCD chỉ được xuất hiện MỘT LẦN trong mỗi file

Cổng khớp bệnh nhân theo CCCD. Hai dòng cùng CCCD trong một file có nguy cơ đè lên
nhau. Nếu có ca khám nhiều lần thì **tách thành nhiều file**: file 1 chứa lần khám
sớm nhất của mỗi người, file 2 chứa lần kế tiếp… Upload lần lượt theo thứ tự.

## Giới hạn KHÔNG chữa được từ phía file

- **Ô "Tên bệnh đang điều trị"** (`medicalHistory.driverMedicalHistory.currentTreatmentDisease`):
  bảng ánh xạ cột Excel của Bộ cho phiếu người lớn **thiếu hẳn khoá** cho trường
  này, và cơ chế tiền tố `sectionPrefixes` cũng không với tới `driverMedicalHistory`.
  Dữ liệu bệnh vẫn vào đúng mục "Tiền sử bệnh khác" qua cột AW.
- **Bệnh nhân đã tồn tại thì cổng KHÔNG cập nhật lại địa chỉ.** Ca từng tạo bằng
  file lỗi sẽ vĩnh viễn trống phường/xã dù import lại đúng mã — phải xoá trên cổng
  rồi nhập lại.
- **Nghề nghiệp** không khớp danh mục `dmnghenghiep` sẽ bị bỏ im lặng.

## Chỗ sửa trong repo này

- `build/build_xlsm.py` → `write_xlsm()`: tra `dmtinh`/`dmhuyen` ngay trong file mẫu,
  ghi giá trị thật vào cột M và O (cột O `number_format='@'`).
- `app/backend/services/export_xlsm.py` → `_row_to_rec()`: `KET_LUAN_BENH` ←
  `ma_benh_chinh`; `CAC_BENH_TAT_NEU_CO` ← `ma_benh_chinh` + `ma_benh_kem`; các
  trường `tsbt_*`/`tsgd_*` tra ngược tên bệnh → mã ICD qua `dm_icd` bằng
  `_build_ten_to_ma_icd()` / `_ma_icd_tu_ten()` (dùng chung với đường xuất HIS).

Xem commit `e234b99`.

## Tự kiểm tra TRƯỚC khi đẩy — bắt buộc

Đọc lại file bằng **chính thư viện cổng dùng** (SheetJS), không dùng openpyxl, vì
openpyxl đọc được cached value mà SheetJS chưa chắc thấy giống.

```bash
mkdir -p /tmp/sheetjstest && cd /tmp/sheetjstest && npm install xlsx --silent
node -e '
const XLSX=require("xlsx"),fs=require("fs");
const p=process.argv[1], wards=process.argv[2];
const live=new Set(fs.readFileSync(wards,"utf8").trim().split("\n").map(l=>l.split("|")[1]));
const wb=XLSX.read(fs.readFileSync(p),{type:"buffer"});
const n=wb.SheetNames.find(s=>!s.toLowerCase().startsWith("dm")&&!s.toLowerCase().includes("hướng dẫn"));
const m=XLSX.utils.sheet_to_json(wb.Sheets[n],{header:1,raw:true,defval:""});
const h=m[1],iX=h.indexOf("MAXA_CU_TRU"),iC=h.indexOf("SO_CCCD"),iCY=h.indexOf("CAC_BENH_TAT_NEU_CO");
const ICD=/([A-Z][0-9]{1,3}(\.[0-9]{1,4})?)/i;
let rows=0,oBad=0,oEmpty=0,cyBad=0,ccBad=0; const cc=new Map();
for(let i=3;i<m.length;i++){const r=m[i]; if(!r.some(v=>v!=="")) continue; rows++;
  const o=String(r[iX+1]||"").trim(); if(!o)oEmpty++; else if(!live.has(o))oBad++;
  const cy=String(r[iCY]||"").trim(); if(!cy||!ICD.test(cy)||cy.includes(","))cyBad++;
  const c=String(r[iC]||"").trim(); if(c.length!==12)ccBad++; else cc.set(c,(cc.get(c)||0)+1);}
console.log({rows,oEmpty,oBad,cyBad,ccBad,cccdTrung:[...cc.values()].filter(v=>v>1).length});
' "$FILE" "build/dm_xa_haiphong_live.txt"
```

**Tiêu chí đạt: `oEmpty`, `oBad`, `cyBad`, `ccBad`, `cccdTrung` đều bằng 0.**

Sheet được cổng chọn = sheet đầu tiên không bắt đầu bằng `dm` và không chứa
"hướng dẫn"; dòng 2 là mã trường, dữ liệu từ dòng 4.

## Danh mục xã sống của cổng

`build/dm_xa_haiphong_live.txt` — định dạng `id|area_code|tên`, 114 đơn vị của
Hải Phòng sau sáp nhập (gồm cả Hải Dương).
`area_code` chính là `MAHUYEN`. Lấy lại khi cần:
`GET https://api.emrhub.vn/api/admin/provinces/31/wards` (31 = id tỉnh sống của
Hải Phòng, cần token nên phải bắt từ phiên đăng nhập của người dùng).

## Đọc lỗi sau khi import

Cổng trả log dạng `[ERROR]Dòng 65: HỌ TÊN - Thất bại: <lý do>`. **"Dòng N" là số
dòng Excel** (dữ liệu bắt đầu từ dòng 4), không phải số thứ tự bản ghi — đã kiểm
chứng khớp 67/67. Bóc ca lỗi bằng `rows[N-4]`.

## Quy tắc an toàn khi thao tác trên cổng

- **Không mở file bằng Excel rồi lưu lại** trước khi upload: cột M/O là giá trị
  cứng, Excel sẽ tính lại thành `#REF!`.
- Khi cần điều tra, có thể chặn request bằng cách vá `window.fetch` +
  `XMLHttpRequest.prototype.send` để đọc payload mà **không ghi gì lên cổng**.
- App dùng axios/XHR chứ không phải fetch — vá cả hai.
- react-query cache khá lâu: muốn ép gọi lại API phải đổi tham số truy vấn, hoặc
  vá trước rồi điều hướng trong SPA (không reload trang, nếu reload là mất bản vá).
- **Tuyệt đối không tự tạo/sửa/xoá phiếu khám khi chưa được anh Khôi đồng ý.**
