# Plan chuyển KSK NCT sang chạy trên Vercel (nghiên cứu 2026-07)

> Cập nhật sau khi tra cứu: **khả thi & MIỄN PHÍ**, công sức vừa phải (khoảng
> 1–2 đợt làm việc). Hai thay đổi 2026 làm điều này dễ hơn hẳn:
> - Vercel **Fluid Compute** (mặc định): Hobby free = **300 giây/hàm, 2GB RAM**
>   (trước 60s/512MB) → hết OOM, xuất .xlsm chạy được.
> - **libSQL/Turso** driver Python `libsql_experimental` **tương thích sqlite3**
>   → đổi DB gần như drop-in, KHÔNG phải viết lại async.

## 1. Kiến trúc đích

```
Trình duyệt ─► Vercel (FastAPI chạy zero-config, 300s/2GB, Fluid Compute)
                   │  (đọc: replica cục bộ ở /tmp — nhanh; ghi: đẩy về primary)
                   └─► Turso (libSQL) — DB đám mây, tương thích 100% file SQLite
```

- **DB: Turso (libSQL).** File `ksk.db` hiện tại đưa lên Turso **không cần
  migrate** (cùng định dạng SQLite; FTS5 tra ICD giữ nguyên). Trên serverless
  dùng **embedded replica**: `libsql.connect("/tmp/ksk.db", sync_url=..., auth_token=...)`
  → mỗi cold start `con.sync()` kéo dữ liệu về `/tmp`, đọc cục bộ (nhanh), ghi
  đẩy thẳng về primary (bền, nhất quán giữa nhiều nhân viên).
- **FastAPI: zero-config.** Vercel tự nhận `app` (ASGI), không cần vercel.json
  cho phần cơ bản. Frontend tĩnh phục vụ luôn qua chính app (mount StaticFiles
  no-cache đã có).
- **Auth cookie ký số:** đã stateless → chạy tốt trên serverless, không đổi.

## 2. Việc cần làm (theo module)

| # | Việc | Mức | Ghi chú |
|---|---|---|---|
| 1 | `backend/db.py`: `get_connection()` trả về **libsql** khi có biến `TURSO_URL` (serverless), ngược lại vẫn dùng `sqlite3` (chạy local) | Vừa | Rủi ro chính: cách truy cập `row['ten_cot']`. sqlite3 dùng `row_factory=Row`; phải xác minh libsql trả tên cột được không — nếu không, viết 1 lớp bọc Row nhỏ (dùng chung, không phải sửa từng router) |
| 2 | Điểm vào Vercel: thêm `api/index.py` (hoặc `pyproject.toml [tool.vercel] entrypoint`) trỏ tới app; sửa `config.py` cho đúng đường dẫn khi chạy trên Vercel (build/, doc/ có sẵn trong git; output/ không cần lúc chạy) | Vừa | |
| 3 | `requirements.txt`: thêm `libsql-experimental`, bỏ `uvicorn` (chỉ dùng local) | Nhỏ | |
| 4 | **Migrate dữ liệu:** `turso db create ksk --from-file app/data/ksk.db` (đưa nguyên file 33MB lên). Lấy URL + auth token → đặt vào Vercel env `TURSO_URL`, `TURSO_AUTH_TOKEN` | Nhỏ | 1 lệnh |
| 5 | **Xuất .xlsm:** bỏ subprocess (vốn chỉ để tiết kiệm RAM trên Render 512MB) → chạy in-process từng xã, ghi ra `/tmp`, stream tải về. Đặt `maxDuration: 300` cho route này | Vừa | HOẶC giữ xuất file **ở máy cá nhân** như hiện tại → công sức = 0 |
| 6 | Bỏ backup-ra-file lúc khởi động (serverless không giữ file); Turso lo bền + có point-in-time. Giữ `_snapshot_hom_nay` (ghi vào Turso) | Nhỏ | |
| 7 | Lazy-import `build/` (mapper, icd_map, concepts.json) chỉ trong route xuất file → cold start các route thường nhẹ | Nhỏ | |
| 8 | Kiểm thử trên Vercel Preview (đăng nhập, tìm kiếm, autosave, sinh hiệu, dashboard) | Vừa | |

## 3. Rủi ro cần thử trước (spike 30 phút)
1. **`row['ten_cot']` với libsql**: viết thử 1 script `libsql.connect + execute + fetchone`, kiểm tra truy cập cột theo tên. Đây là điểm quyết định "drop-in" hay phải bọc Row. → làm ĐẦU TIÊN.
2. **Cold-start sync 33MB** về `/tmp` mất bao lâu (ảnh hưởng độ trễ request đầu). Partial-sync giảm nhẹ; Fluid giữ instance ấm.
3. **FTS5 dm_icd_fts** hoạt động qua Turso (bảng ảo + trigger có sẵn trong file upload — cần xác nhận sau migrate).

## 4. Bảo mật (dữ liệu y tế)
Turso lưu dữ liệu trên đám mây (nước ngoài). Có tùy chọn **mã hóa**
(`encryption_key`) để dữ liệu trên Turso ở dạng mã hóa. Repo giữ **Private**.
Anh đã xác nhận tự chịu trách nhiệm bảo mật.

## 5. Chi phí & so sánh
- **Vercel Hobby + Turso free = 0đ.** Không ngủ như Render free? Vercel functions
  vẫn cold-start nhưng không "ngủ 15 phút" kiểu Render; Fluid giữ ấm tốt hơn.
- Khác thảm họa Render+B2+Litestream: Turso là DB được quản lý (không tự dựng
  sao lưu bằng Litestream → không đụng trần tải B2). **Không lặp lại sự cố cũ.**

## 6. Đề xuất trình tự khi anh muốn làm
1. Tôi làm **spike** mục 3.1 (xác minh row-access) — quyết định độ lớn thật.
2. Anh tạo tài khoản **Turso** + **Vercel** (như các app khác của anh), chạy
   `turso db create --from-file` để đưa dữ liệu lên (tôi hướng dẫn từng lệnh).
3. Tôi lập plan chi tiết theo bảng mục 2 → giao subagent thực hiện từng phần →
   deploy Preview → kiểm thử → chuyển Production.

Tài liệu tham khảo: Vercel FastAPI (zero-config, Fluid 300s/2GB), Turso
`libsql-experimental` (embedded replica, sqlite3-compat, FTS5).
