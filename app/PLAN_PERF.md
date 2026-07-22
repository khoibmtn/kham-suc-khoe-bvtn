# PLAN tối ưu tốc độ + xung đột đa người dùng (Vercel+Turso)

## Chẩn đoán (đo thực tế trên live)
- Mọi request ~3.7s KỂ CẢ WARM → `db.py` gọi `.sync()` mạng mỗi lần (embedded
  replica). Search 5s = + quét 13.326 dòng bằng Python. Vercel(US) ↔ Turso(Tokyo)
  = mỗi query vượt TBD.
- Embedded replica còn gây **không nhất quán đa người dùng** (mỗi instance có
  bản sao riêng, stale) → SAI cho app nhiều người sửa.

## Hướng: REMOTE-ONLY + co-locate + SQL-paginate search

### 1. db.py — chế độ remote-only (subagent)
- Serverless: `libsql.connect(database=os.environ['TURSO_URL'], auth_token=...)`
  — KHÔNG file /tmp, KHÔNG `.sync()`. Mỗi query đi thẳng Turso primary →
  **nhất quán mạnh** (mọi người thấy dữ liệu mới nhất), không cold-start 33MB.
- Giữ ConnWrapper/Row (đã có). Local vẫn sqlite3 (không đổi).
- Giảm số query/ request nếu dễ (vd gộp COUNT + page).

### 2. Search SQL-paginated, KHÔNG quét Python (subagent)
- Thêm cột không dấu vào ho_so: `ho_ten_kd` + `search_blob_kd` (gộp không dấu
  của ho_ten, so_cccd, maxa_cu_tru, ma_ho_so, ket_luan_benh...). Migration:
  ALTER TABLE + UPDATE 1 lần (chạy trên Turso qua script, và cả import_data.py
  để DB mới cũng có).
- Tìm toàn cột: `WHERE search_blob_kd LIKE '%'||?||'%'` (từ khóa đã bỏ dấu) +
  LIMIT/OFFSET → chỉ trả 1 trang, xếp ho_ten khớp trước bằng
  `ORDER BY (ho_ten_kd LIKE ? ) DESC, tt`. Bỏ `_global_search_rank` Python.
- "Chỉ tìm họ tên": `WHERE ho_ten_kd LIKE '%'||?||'%'`.
- Áp cho cả /api/sinh-hieu/danh-sach (đang cũng fuzzy Python).

### 3. Co-locate Turso gần Vercel (orchestrator tự làm bằng CLI)
- Tạo lại Turso DB ở region gần Vercel (thử Singapore/US-East) → Vercel↔Turso
  còn <10ms. Cập nhật env `TURSO_URL` trên Vercel. (User có thể cần dán URL mới.)
- Thử đặt Vercel `regions: ["sin1"]` (Singapore, gần VN) nếu Hobby cho phép.

### 4. Xung đột đa người dùng
- **Thiết kế PATCH theo TỪNG TRƯỜNG đã an toàn sẵn**: mỗi lần lưu chỉ set 1
  trường → 2 người sửa 2 trường KHÁC nhau của cùng bệnh nhân → cả 2 đều lưu,
  KHÔNG đụng nhau.
- Cùng 1 trường, cùng lúc → last-write-wins + `nhat_ky` ghi ai sửa. Với
  remote-only (nhất quán mạnh) người sau khi mở đã thấy giá trị mới nhất.
- **Thêm cảnh báo trễ (subagent):** PATCH kèm `gia_tri_dang_xem` (giá trị client
  đang thấy); nếu giá trị hiện tại trong DB KHÁC (người khác vừa sửa) → vẫn lưu
  nhưng trả cờ `da_bi_nguoi_khac_sua` + giá trị cũ để UI hiện toast "Trường này
  vừa được <người> sửa lúc <giờ>". Không chặn, chỉ báo.

## Nghiệm thu
- Warm request < 0.8s (list/sinh-hieu), search < 1s.
- 2 phiên sửa 2 trường cùng bệnh nhân → cả 2 lưu.
- Sửa cùng trường → cái sau thắng + có cờ cảnh báo.
- node --check + test local sqlite không hồi quy.
