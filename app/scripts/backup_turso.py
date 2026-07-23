#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
backup_turso.py — Sao lưu DB Turso (production online) về 1 file SQLite trên
máy anh, có dấu thời gian.

VÌ SAO GIẢI PHÁP NÀY:
- Đọc-CHỈ trên Turso (chỉ chạy SELECT) -> KHÔNG ảnh hưởng tốc độ/trải nghiệm
  của nhân viên đang rà soát online (SQLite/libsql cho phép nhiều reader song
  song, không khoá writer).
- File tạo ra dùng được ĐỒNG THỜI 2 việc:
    1) Bản SAO LƯU an toàn: data/backups/ksk_YYYYMMDD_HHMMSS.db
    2) Nguồn "dữ liệu thực" để chạy app LOCAL nhanh & AN TOÀN — vì là bản COPY
       cục bộ nên: (a) mọi query chạy tại chỗ, không phải đi Tokyo -> nhanh;
       (b) mọi thao tác test/sửa nằm trên bản copy, KHÔNG đụng production.
- Chỉ dùng thư viện chuẩn Python (urllib + sqlite3) — KHÔNG cần cài
  libsql-experimental (build lỗi trên macOS Py3.9) hay turso CLI.

CÁCH DÙNG:
  cd app
  export TURSO_URL="libsql://ksk-khoibmtn.aws-ap-northeast-1.turso.io"
  export TURSO_AUTH_TOKEN="<token Turso của anh>"
  python3 scripts/backup_turso.py             # -> data/backups/ksk_<ts>.db
  python3 scripts/backup_turso.py --to-data    # + ghi đè data/ksk.db để ./run.sh dùng ngay

ĐỊNH KỲ (tuỳ chọn, ví dụ mỗi giờ) — thêm vào crontab máy anh:
  0 * * * * cd /Users/buiminhkhoi/Documents/Antigravity/kham-suc-khoe/app && \
    TURSO_URL="libsql://..." TURSO_AUTH_TOKEN="..." /usr/bin/python3 scripts/backup_turso.py
"""
import base64
import json
import os
import sqlite3
import sys
import urllib.request
from datetime import datetime

APP_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))  # .../app
SCHEMA = os.path.join(APP_DIR, 'backend', 'schema.sql')
BACKUP_DIR = os.path.join(APP_DIR, 'data', 'backups')
DATA_DB = os.path.join(APP_DIR, 'data', 'ksk.db')

PAGE = 4000  # số dòng mỗi lần kéo (phân trang để tránh 1 response quá lớn)


def http_endpoint(turso_url):
    host = turso_url.replace('libsql://', '').replace('https://', '').rstrip('/')
    return f'https://{host}/v2/pipeline'


def _decode(v):
    """Giải mã 1 giá trị theo giao thức Hrana v2 của Turso."""
    t = v.get('type')
    if t == 'null':
        return None
    if t == 'integer':
        return int(v['value'])
    if t == 'float':
        return float(v['value'])
    if t == 'text':
        return v['value']
    if t == 'blob':
        return base64.b64decode(v['base64'])
    return v.get('value')


def run_sql(endpoint, token, sql, args=None):
    """Chạy 1 câu SQL trên Turso qua HTTP pipeline. Trả (cols, rows)."""
    body = {'requests': [
        {'type': 'execute', 'stmt': {'sql': sql, 'args': args or []}},
        {'type': 'close'},
    ]}
    req = urllib.request.Request(
        endpoint, data=json.dumps(body).encode('utf-8'),
        headers={'Authorization': f'Bearer {token}',
                 'Content-Type': 'application/json'})
    with urllib.request.urlopen(req, timeout=180) as r:
        data = json.loads(r.read().decode('utf-8'))
    res = data['results'][0]
    if res.get('type') != 'ok':
        raise RuntimeError(f'Turso trả lỗi: {res.get("error")}')
    result = res['response']['result']
    cols = [c['name'] for c in result['cols']]
    rows = [[_decode(v) for v in row] for row in result['rows']]
    return cols, rows


def build_local_db(out_path, fetch_tables, fetch_count, fetch_page):
    """Dựng 1 file SQLite hoàn chỉnh từ nguồn (Turso). `fetch_*` là các callback
    để tách phần lấy dữ liệu ra khỏi phần ghi -> dễ kiểm thử."""
    os.makedirs(os.path.dirname(out_path), exist_ok=True)
    if os.path.exists(out_path):
        os.remove(out_path)
    conn = sqlite3.connect(out_path)
    try:
        # 1) Dựng cấu trúc từ schema.sql (đủ mọi bảng + FTS5 + index).
        with open(SCHEMA, encoding='utf-8') as f:
            conn.executescript(f.read())
        conn.commit()

        # Tắt kiểm tra khoá ngoại trong lúc nạp (thứ tự copy theo alphabet nên
        # bảng con có thể được nạp trước bảng cha) — dữ liệu NGUỒN đã toàn vẹn,
        # nên không cần kiểm tra lại. PRAGMA chỉ có tác dụng ngoài transaction.
        conn.execute('PRAGMA foreign_keys=OFF')

        # 2) Copy dữ liệu từng bảng (bỏ bảng hệ thống/FTS shadow/litestream).
        tables = fetch_tables()
        for t in tables:
            local_cols = [r[1] for r in conn.execute(f'PRAGMA table_info("{t}")')]
            if not local_cols:
                print(f'  (bỏ qua "{t}" — không có trong schema local)')
                continue
            total = fetch_count(t)
            offset, copied = 0, 0
            while True:
                cols_t, rows_t = fetch_page(t, offset, PAGE)
                if not rows_t:
                    break
                keep = [i for i, c in enumerate(cols_t) if c in local_cols]
                col_list = ','.join(f'"{cols_t[i]}"' for i in keep)
                ph = ','.join('?' * len(keep))
                batch = [[row[i] for i in keep] for row in rows_t]
                conn.executemany(
                    f'INSERT INTO "{t}" ({col_list}) VALUES ({ph})', batch)
                copied += len(rows_t)
                offset += PAGE
                print(f'  {t}: {copied}/{total}')
                if len(rows_t) < PAGE:
                    break
            conn.commit()

        # 3) Rebuild chỉ mục FTS5 (dm_icd_fts dùng content='dm_icd', không có
        #    trigger nên phải nạp lại từ bảng nguồn sau khi copy xong).
        try:
            conn.execute("INSERT INTO dm_icd_fts(dm_icd_fts) VALUES('rebuild')")
            conn.commit()
        except Exception as e:  # noqa: BLE001
            print(f'  (cảnh báo: không rebuild được FTS: {e})')
    finally:
        conn.close()


def main():
    turso_url = os.environ.get('TURSO_URL')
    token = os.environ.get('TURSO_AUTH_TOKEN')
    if not turso_url or not token:
        print('Thiếu TURSO_URL / TURSO_AUTH_TOKEN trong biến môi trường.\n'
              'Xem hướng dẫn ở đầu file scripts/backup_turso.py.')
        sys.exit(1)
    endpoint = http_endpoint(turso_url)
    to_data = '--to-data' in sys.argv[1:]

    def fetch_tables():
        _, rows = run_sql(
            endpoint, token,
            "SELECT name FROM sqlite_master WHERE type='table' "
            "AND name NOT LIKE 'sqlite_%' "
            "AND name NOT LIKE '\\_%' ESCAPE '\\' "
            "AND name NOT LIKE 'dm_icd_fts%' ORDER BY name")
        return [r[0] for r in rows]

    def fetch_count(t):
        _, rows = run_sql(endpoint, token, f'SELECT COUNT(*) FROM "{t}"')
        return rows[0][0]

    def fetch_page(t, offset, limit):
        return run_sql(endpoint, token,
                       f'SELECT * FROM "{t}" LIMIT {limit} OFFSET {offset}')

    ts = datetime.now().strftime('%Y%m%d_%H%M%S')
    out_path = os.path.join(BACKUP_DIR, f'ksk_{ts}.db')
    print(f'Sao lưu Turso -> {out_path}')
    t0 = datetime.now()
    build_local_db(out_path, fetch_tables, fetch_count, fetch_page)
    dt = (datetime.now() - t0).total_seconds()

    size_mb = os.path.getsize(out_path) / 1e6
    n = sqlite3.connect(out_path).execute(
        'SELECT COUNT(*) FROM ho_so').fetchone()[0]
    print(f'XONG sau {dt:.1f}s — {size_mb:.1f} MB, {n} hồ sơ.')

    if to_data:
        import shutil
        shutil.copy2(out_path, DATA_DB)
        print(f'Đã ghi đè {DATA_DB} — chạy ./run.sh để dùng bản dữ liệu thực này.')


if __name__ == '__main__':
    main()
