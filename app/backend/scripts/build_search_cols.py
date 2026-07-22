# -*- coding: utf-8 -*-
"""
build_search_cols.py — tính lại ho_ten_kd + search_blob_kd cho TOÀN BỘ hồ sơ
ho_so (PLAN_PERF.md §2) — script IDEMPOTENT: luôn tính lại từ các cột nguồn
hiện có trong DB nên chạy lại bao nhiêu lần cũng ra cùng kết quả (không tích
lũy rác), an toàn chạy lại sau khi sửa dữ liệu (vd đổi tên xã/phường,
đổi kết luận bệnh...).

Vì sao cần script riêng (không tự populate trong db.init_schema): 13.326
dòng UPDATE mỗi lần khởi động serverless sẽ quá chậm — cột chỉ cần ALTER
TABLE thêm 1 lần (db.py:_migrate_search_cols, tự động lúc khởi động), còn
POPULATE dữ liệu chạy 1 lần bằng tay (local sqlite3 hoặc trên Turso) qua
script này. import_data.py tự tính 2 cột này cho hồ sơ NẠP MỚI về sau nên
không cần chạy lại script sau mỗi lần nạp — chỉ cần chạy khi:
  - Migrate DB cũ chưa từng có 2 cột này (lần đầu triển khai PLAN_PERF §2).
  - Sửa hàng loạt dữ liệu nguồn (vd script đổi tên xã) khiến search_blob_kd
    cũ không còn khớp giá trị mới.

Chạy (local, sqlite3): app/.venv/bin/python backend/scripts/build_search_cols.py
Chạy trên Turso: đặt biến môi trường TURSO_URL/TURSO_AUTH_TOKEN trước khi
chạy (cần cài libsql-experimental — máy dev sqlite3 hiện tại KHÔNG có gói
này; db.get_connection() tự chọn chế độ theo biến môi trường).

Ghi chú cho orchestrator (mirror trên Turso): 2 cột + logic populate CHÍNH
XÁC như dưới đây —
  ALTER TABLE ho_so ADD COLUMN ho_ten_kd TEXT;
  ALTER TABLE ho_so ADD COLUMN search_blob_kd TEXT;
  UPDATE ho_so SET ho_ten_kd = ?, search_blob_kd = ? WHERE ma_ho_so = ?;
(giá trị tính bằng services/fuzzy.build_search_cols() — xem hàm đó để biết
đúng công thức: bỏ dấu + lowercase của ho_ten (ho_ten_kd); và của ho_ten,
so_cccd, maxa_cu_tru, ma_ho_so, ket_luan_benh, ngay_sinh, ngay_vao, gioi_tinh,
tên cơ quan bệnh chính, nhãn phân loại sức khỏe — ghép bằng dấu cách
(search_blob_kd)).
"""
import os
import sys
import time

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
import config  # noqa: E402
import db  # noqa: E402
from services import fuzzy  # noqa: E402

BATCH_SIZE = 1000


def main():
    conn = db.get_connection()
    db.init_schema(conn)  # đảm bảo 2 cột đã tồn tại (ALTER TABLE nếu thiếu)

    t0 = time.time()
    rows = conn.execute('SELECT * FROM ho_so').fetchall()
    print(f'Đọc {len(rows)} hồ sơ trong {time.time() - t0:.1f}s')

    updates = []
    for r in rows:
        ho_ten_kd, blob = fuzzy.build_search_cols(r)
        updates.append((ho_ten_kd, blob, r['ma_ho_so']))

    t1 = time.time()
    n = 0
    for i in range(0, len(updates), BATCH_SIZE):
        batch = updates[i:i + BATCH_SIZE]
        conn.executemany(
            'UPDATE ho_so SET ho_ten_kd=?, search_blob_kd=? WHERE ma_ho_so=?',
            batch)
        conn.commit()
        n += len(batch)
        print(f'  ... {n}/{len(updates)}')
    print(f'Xong cập nhật {n} dòng trong {time.time() - t1:.1f}s')

    sample = conn.execute(
        'SELECT ma_ho_so, ho_ten, ho_ten_kd, search_blob_kd FROM ho_so LIMIT 1'
    ).fetchone()
    if sample:
        print('Spot-check:', dict(sample))

    conn.close()


if __name__ == '__main__':
    main()
