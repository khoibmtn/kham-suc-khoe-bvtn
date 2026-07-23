# PLAN — Tra cứu Phân loại sức khỏe (QĐ 1613/BYT) làm lại cho tiện dụng

Mục tiêu: thay trang "Phân loại sức khỏe" hiện tại (đang dump text thô, khó tra)
bằng công cụ tra cứu có cấu trúc: duyệt theo cơ quan, tìm kiếm, badge Loại I–V,
và tính nhanh thể lực. Làm DẦN theo phase — mỗi phase độc lập, ship được.

## Nghiên cứu đã xong (Phase 0)

Nguồn gốc: `doc/Quyet dinh 1613 PL suc khoe.doc` (Word có BẢNG thật).

Cấu trúc văn bản:
- **I. Quy định chung** — 5 loại sức khỏe: I Rất khỏe · II Khỏe · III Trung bình
  · IV Yếu · V Rất yếu.
- **II.1 Thể lực** — bảng SỐ theo giới (NAM/NỮ) × 2 nhóm (học sinh / lao động) ×
  5 loại × 3 chỉ số (chiều cao, cân nặng, vòng ngực). Có thể TÍNH tự động.
- **II.2 Bệnh tật** — ~100+ tiêu chí lâm sàng NHÓM THEO CƠ QUAN
  (MẮT 1–13, TAI-MŨI-HỌNG 14–22, RĂNG-HÀM-MẶT 23–25, … tim mạch, hô hấp, tiêu
  hóa, thần kinh-tâm thần, thận-tiết niệu, cơ-xương-khớp, da liễu, nội tiết,
  ngoại khoa, sản-phụ khoa). Mỗi tiêu chí có các tiểu mục (X.1, X.2…) → 1 Loại.

**Cách trích xuất TIN CẬY (quan trọng — đừng dùng txt):**
- `textutil -convert txt` LÀM MẤT cột → không suy được Loại (chính là lý do bản
  hiện tại tệ).
- `textutil -convert html "…1613….doc" -output qd1613.html` GIỮ `<table><tr><td>`
  → 7 bảng, 726 hàng, 5101 ô.
- **Loại = chỉ số cột chứa "x"**: cột 2 → Loại I, 3 → II, 4 → III, 5 → IV, 6 → V.
  Cột 0–1 = phần chữ điều kiện. (Đã kiểm chứng: tiêu chí "Thị lực" 5 hàng cho x ở
  cột 2..6 = Loại I..V đúng thứ tự; "2.1 Không có mộng thịt" → cột 2 = Loại I.)

## Phase 1 — Parser → JSON có cấu trúc  (nền tảng, làm trước)

Tạo `build/parse_qd1613.py` sinh ra `app/frontend/qd1613.json`.

Việc:
1. `textutil -convert html` file .doc → HTML tạm.
2. Duyệt các `<tr>`:
   - Nhận diện **header cơ quan** (ô chữ IN HOA: MẮT, TAI MŨI HỌNG, …) → đổi
     nhóm hiện tại.
   - Nhận diện **tiêu chí** (ô0 là số "N" hoặc "N." + tên) → mở tiêu chí mới.
   - **Tiểu mục**: ô0/ô1 = chữ điều kiện; `loai = (index cột có 'x') − 1`.
3. Thể lực (II.1): parse riêng 2 bảng số → mảng {loai, chieu_cao, can_nang,
   vong_nguc} cho từng nhóm × giới.
4. Xuất JSON:
```json
{
  "meta": {"nguon": "QĐ 1613/BYT 15/08/1997", "loai": {"1":"Rất khỏe", ...}},
  "the_luc": {
    "hoc_sinh": {"nam": [{"loai":1,"chieu_cao":"160 trở lên","can_nang":"48 trở lên","vong_nguc":"80 trở lên"}, ...], "nu": [...]},
    "lao_dong": {"nam": [...], "nu": [...]}
  },
  "benh_tat": [
    {"co_quan":"MẮT","so":1,"ten":"Thị lực",
     "muc":[{"dk":"10/10 (tổng 2 mắt 19-20/10)","loai":1}, {"dk":"...","loai":2}, ...]},
    {"co_quan":"MẮT","so":2,"ten":"Mộng thịt","muc":[{"dk":"Không có","loai":1}, ...]},
    ...
  ]
}
```
Tiêu chí nghiệm thu (Verifier):
- JSON hợp lệ; MỌI `muc.loai` ∈ 1..5.
- Số cơ quan ≥ 10; số tiêu chí ≥ 80 (đối chiếu số thứ tự lớn nhất mỗi cơ quan).
- Spot-check 4 ánh xạ đã biết: Thị lực 10/10 → I; Không có mộng thịt → I; "Răng
  sâu 6 cái trở lên" → đúng loại trong bảng; điếc đặc/nghe kém nặng → IV/V.
- Chạy 1 lần, commit `qd1613.json` (bỏ file .html tạm).

## Phase 2 — Giao diện tra cứu Bệnh tật  (thay phần dump text)

Sửa `app/frontend/js/tracuu.js` tab "Phân loại sức khỏe" đọc `qd1613.json`:
- Thanh cơ quan (chips/accordion): MẮT · TMH · RHM · … — bấm lọc theo cơ quan.
- Mỗi tiêu chí = card: "số + tên" + danh sách mục, mỗi mục có **badge Loại I–V
  tô màu** (I xanh lá → V đỏ, dùng lại thang màu dashboard).
- Ô **tìm kiếm** (không dấu) lọc theo từ khóa trong tên tiêu chí + nội dung mục.
- **Lọc theo Loại** (chips I–V): chỉ hiện mục dẫn tới loại đã chọn (vd xem nhanh
  mọi thứ → Loại V).
- Thuần JS, không thư viện. Giữ nút "Mở ICD-10 tab mới" như cũ.
Nghiệm thu: tìm "thị lực" ra tiêu chí Mắt; bấm cơ quan lọc đúng; badge loại đúng
màu; lọc Loại V chỉ còn mục loại V.

## Phase 3 — Thể lực: tra cứu + tính nhanh

- Form: giới tính + nhóm (học sinh / lao động) + chiều cao + cân nặng (+ vòng
  ngực nếu có) → suy **Loại thể lực = mức XẤU NHẤT trong các chỉ số** (đúng
  nguyên tắc QĐ1613), hiện kết quả + tô sáng hàng khớp trong bảng.
- Hiển thị bảng thể lực gọn theo giới.
Nghiệm thu: nhập Nam CC 158/CN 47/VN 79 (lao động) → ra Loại đúng theo bảng.

## Phase 4 (tùy chọn) — Tích hợp với hồ sơ

- Ở panel chi tiết: nút nhỏ "Tra QĐ1613 cơ quan này" mở tab Tra cứu, nhảy tới
  cơ quan tương ứng. Bỏ qua nếu không cần.

## Ghi chú vận hành
- `qd1613.json` để ở `app/frontend/` → serve tĩnh, KHÔNG cần backend (giống
  qd1613.txt hiện tại). Sau Phase 2 có thể xoá `qd1613.txt`.
- Mỗi phase: commit + push (Vercel tự deploy). Có thể giao từng phase cho
  subagent model rẻ theo đúng workflow [[workflow-plan-then-subagents]].
