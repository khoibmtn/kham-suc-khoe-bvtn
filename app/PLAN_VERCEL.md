# PLAN chuyển KSK NCT sang Vercel + Turso (spike đã xác nhận khả thi)

## Kết quả spike (đã kiểm chứng)
- `libsql_experimental` (Python 3.11+) chạy được; FTS5 OK; nhưng kết quả trả về
  là **tuple thuần** — `row['ten_cot']` KHÔNG dùng được trực tiếp. `cursor.description`
  có tên cột → dựng được **lớp bọc Row**.

## Giai đoạn 1 — CODE PORT (subagent, KHÔNG cần tài khoản Turso)

Mục tiêu: app chạy được ở **2 chế độ**, không phá luồng cũ:
- **Local (dev):** vẫn dùng `sqlite3` + file `data/ksk.db` (không đổi hành vi).
- **Serverless (Vercel):** dùng `libsql_experimental` + Turso khi có biến môi
  trường `TURSO_URL`.

Tiêu chí:
1. **`backend/db.py` — adapter kép:**
   - `get_connection()`: nếu có `TURSO_URL` (+ `TURSO_AUTH_TOKEN`) → trả **ConnWrapper**
     bọc `libsql.connect("/tmp/ksk.db", sync_url=TURSO_URL, auth_token=TURSO_AUTH_TOKEN)`
     rồi `.sync()`. Ngược lại → `sqlite3.connect(DB_PATH)` với `row_factory=Row`
     như hiện tại.
   - **Lớp Row** (giống sqlite3.Row): hỗ trợ `row[i]`, `row['ten_cot']`,
     `.keys()`, lặp, `dict(row)`. Map tên→index bằng `cursor.description`.
   - **ConnWrapper / CursorWrapper**: `execute(sql, params=())` trả cursor mà
     `fetchone()/fetchall()/lặp` cho ra **Row**; hỗ trợ `commit()`, `close()`,
     `executemany()` (nếu code dùng), `lastrowid`, `execute` cho cả ghi. Giữ
     nguyên chữ ký để MỌI router hiện tại (dùng `conn.execute(...).fetchone()`,
     `for r in conn.execute(...)`, `r['col']`) chạy KHÔNG SỬA.
   - `init_schema` vẫn chạy (schema có sẵn trong file upload lên Turso; ở Turso
     `CREATE TABLE IF NOT EXISTS` idempotent).
   - Grep toàn backend các cách dùng DB đặc thù (`row_factory`, `lastrowid`,
     `executemany`, `PRAGMA`, `total_changes`) và đảm bảo adapter đáp ứng.
2. **Điểm vào Vercel:** thêm `app/main.py` (hoặc `api/index.py`) ở vị trí Vercel
   nhận diện, `from backend.main import app` (xử lý sys.path để import chạy trên
   Vercel). Bảo đảm StaticFiles vẫn phục vụ `frontend/` và `config.py` phân giải
   đường dẫn đúng khi cwd của Vercel khác (build/, doc/ có trong git; output/
   KHÔNG cần lúc chạy — chỉ import_data.py dùng, mà serverless KHÔNG chạy import).
3. **`requirements.txt`:** thêm `libsql-experimental`; `uvicorn` để lại cũng
   được (Vercel bỏ qua). KHÔNG để import_data.py chạy lúc khởi động trên Vercel.
4. **Lifespan:** bỏ `_sao_luu_hang_ngay` khi chạy serverless (không giữ file;
   Turso lo bền). `_snapshot_hom_nay` giữ (ghi vào DB). Bọc trong try/except để
   không làm chết cold start.
5. **Xuất .xlsm:** KHÔNG cần chạy trên Vercel đợt này (anh xuất ở máy cá nhân).
   Chỉ cần route không làm CRASH import lúc load app — lazy-import `build/` bên
   trong route xuất, để cold start các route thường nhẹ. Nếu bấm xuất trên
   Vercel mà chưa hỗ trợ thì trả thông báo "xuất file chạy ở máy cá nhân".
6. **KHÔNG phá local:** sau khi sửa, `./run.sh` (sqlite3) vẫn chạy y như cũ —
   test đăng nhập, danh sách, tìm kiếm, sinh hiệu, dashboard trên cổng test.

## Giai đoạn 2 — TÀI KHOẢN & DỮ LIỆU (cần anh Khôi)
- Tạo tài khoản **Turso** + **Vercel** (browse, anh tự đăng nhập/OAuth).
- Đưa `app/data/ksk.db` lên Turso: `turso db create ksk --from-file ...` → lấy
  `TURSO_URL` + token.
- Deploy Vercel từ repo, đặt env `TURSO_URL`, `TURSO_AUTH_TOKEN` → Preview →
  kiểm thử → Production.

## Rủi ro theo dõi
- Cold-start sync 33MB về /tmp (độ trễ request đầu) — đo sau khi có Turso.
- Ghi đồng thời nhiều nhân viên: writes đẩy về primary (Turso serialize) — OK.
- Mã hóa dữ liệu Turso (`encryption_key`) — cân nhắc bật.
