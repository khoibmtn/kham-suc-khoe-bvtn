# -*- coding: utf-8 -*-
"""db.py — kết nối CSDL dùng chung cho backend.

Hai chế độ (Giai đoạn 1 PLAN_VERCEL.md):
- LOCAL (mặc định, không có biến môi trường TURSO_URL): sqlite3 + file
  data/ksk.db, HÀNH VI Y NGUYÊN như trước — không đổi gì cho local dev.
- SERVERLESS (biến môi trường TURSO_URL có giá trị, dùng trên Vercel):
  libsql_experimental (Turso) kết nối REMOTE-ONLY thẳng tới Turso primary
  (PLAN_PERF.md §1 — KHÔNG file /tmp, KHÔNG `.sync()`) — nhất quán mạnh,
  không cold-start tải bản sao cục bộ. Trả về `ConnWrapper` mô phỏng đúng bề
  mặt sqlite3.Connection mà toàn bộ router hiện có đang dùng
  (`conn.execute(...).fetchone()/.fetchall()`, lặp qua kết quả,
  `row['col']`, `dict(row)`, `.lastrowid`, `.rowcount`, `.executemany()`,
  `.commit()`, `.close()`, `.cursor()`) — KHÔNG router nào phải sửa.
"""
import os
import sqlite3
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import config  # noqa: E402


def _is_serverless():
    return bool(os.getenv('TURSO_URL'))


# =====================================================================
# LOCAL (sqlite3) — hành vi y nguyên như trước khi có Giai đoạn 1.
# =====================================================================

def _get_connection_local():
    config.ensure_dirs()
    conn = sqlite3.connect(config.DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute('PRAGMA foreign_keys = ON')
    return conn


# =====================================================================
# SERVERLESS (libsql/Turso) — adapter kép: Row + Cursor/Conn wrapper.
#
# Ghi chú spike (đã kiểm chứng bằng /tmp/lsspike, python3.11 + libsql-
# experimental thật — KHÔNG suy đoán):
#   - fetchone()/fetchall() trả TUPLE THUẦN; cursor.description có tên cột
#     -> dựng Row tự map tên->index (không có sẵn kiểu như sqlite3.Row).
#   - Cursor KHÔNG iterable trực tiếp (`for r in cur` lỗi) -> CursorWrapper
#     tự cung cấp __iter__ (dùng fetchall()).
#   - Tham số phải là TUPLE, không được là list (`argument 'parameters':
#     'list' object cannot be converted to 'PyTuple'`) -> execute() ở đây
#     LUÔN ép params về tuple trước khi gọi thư viện gốc (nhiều router
#     trong code hiện tại build args bằng list, vd `args + [x, y]`).
#   - conn.executescript() CHẠY ĐƯỢC nhiều câu lệnh cách nhau bởi ';'
#     (đã kiểm chứng với schema.sql thật, có FTS5) -> không cần tự tách
#     câu lệnh.
#   - conn.executemany(sql, seq_of_tuples) chạy được.
#   - cursor.lastrowid / cursor.rowcount có sẵn.
#   - PRAGMA table_info(...) chạy được qua conn.execute().
# =====================================================================

class Row:
    """Mô phỏng sqlite3.Row: row[i], row['ten_cot'] (không phân biệt hoa
    thường như sqlite3.Row), .keys(), lặp qua GIÁ TRỊ, dict(row)."""

    __slots__ = ('_values', '_index')

    def __init__(self, description, values):
        self._values = tuple(values)
        # description: sequence các tuple (name, type_code, ...) — chỉ cần
        # phần tử [0]. Map LOWERCASE -> index đầu tiên khớp tên đó (giữ
        # hành vi case-insensitive như sqlite3.Row).
        index = {}
        for i, col in enumerate(description or ()):
            name = col[0]
            key = name.lower() if isinstance(name, str) else name
            if key not in index:
                index[key] = i
        self._index = index

    def keys(self):
        # Thứ tự cột gốc (không lowercase) — dựng lại từ _index không giữ
        # thứ tự gốc 1:1 khi có tên trùng hoa/thường, nhưng trường hợp đó
        # không xảy ra trong schema hiện tại; dùng danh sách theo index.
        ordered = [None] * len(self._values)
        for key, i in self._index.items():
            ordered[i] = key
        return ordered

    def __getitem__(self, key):
        if isinstance(key, (int, slice)):
            return self._values[key]
        try:
            return self._values[self._index[key.lower()]]
        except KeyError:
            raise KeyError(key)

    def __iter__(self):
        return iter(self._values)

    def __len__(self):
        return len(self._values)

    def __contains__(self, key):
        if isinstance(key, str):
            return key.lower() in self._index
        return key in self._values

    def __repr__(self):
        return f'<db.Row {dict(zip(self.keys(), self._values))!r}>'


def _to_tuple(params):
    if params is None:
        return ()
    if isinstance(params, tuple):
        return params
    return tuple(params)


class CursorWrapper:
    """Bọc cursor gốc của libsql — trả Row thay vì tuple thuần, hỗ trợ lặp
    trực tiếp (`for r in conn.execute(...)`), giữ .lastrowid/.rowcount."""

    def __init__(self, raw_cursor):
        self._raw = raw_cursor

    @property
    def lastrowid(self):
        return getattr(self._raw, 'lastrowid', None)

    @property
    def rowcount(self):
        return getattr(self._raw, 'rowcount', -1)

    @property
    def description(self):
        return self._raw.description

    def _wrap(self, value):
        if value is None:
            return None
        return Row(self._raw.description, value)

    def fetchone(self):
        return self._wrap(self._raw.fetchone())

    def fetchall(self):
        desc = self._raw.description
        return [Row(desc, v) for v in self._raw.fetchall()]

    def fetchmany(self, size=None):
        desc = self._raw.description
        raw = self._raw.fetchmany(size) if size is not None else self._raw.fetchmany()
        return [Row(desc, v) for v in raw]

    def execute(self, sql, params=()):
        self._raw.execute(sql, _to_tuple(params))
        return self

    def executemany(self, sql, seq_of_params):
        for params in seq_of_params:
            self._raw.execute(sql, _to_tuple(params))
        return self

    def executescript(self, sql_script):
        self._raw.executescript(sql_script)
        return self

    def close(self):
        close = getattr(self._raw, 'close', None)
        if close:
            close()

    def __iter__(self):
        return iter(self.fetchall())


class ConnWrapper:
    """Bọc libsql.Connection — mô phỏng đúng những gì router hiện dùng ở
    sqlite3.Connection: execute/executemany/executescript/commit/close/
    cursor(). `execute()` trả CursorWrapper (đã có Row + lặp được), khớp
    với cách dùng `conn.execute(sql, args).fetchone()` VÀ
    `for r in conn.execute(sql, args)` trong toàn bộ router hiện có."""

    def __init__(self, raw_conn):
        self._raw = raw_conn

    def execute(self, sql, params=()):
        raw_cursor = self._raw.execute(sql, _to_tuple(params))
        return CursorWrapper(raw_cursor)

    def executemany(self, sql, seq_of_params):
        seq = [_to_tuple(p) for p in seq_of_params]
        self._raw.executemany(sql, seq)
        return None

    def executescript(self, sql_script):
        self._raw.executescript(sql_script)

    def commit(self):
        self._raw.commit()

    def rollback(self):
        rb = getattr(self._raw, 'rollback', None)
        if rb:
            rb()

    def close(self):
        close = getattr(self._raw, 'close', None)
        if close:
            close()

    def cursor(self):
        return CursorWrapper(self._raw.cursor())


def _get_connection_serverless():
    import libsql_experimental as libsql  # import trễ — máy dev sqlite3
    # không cần cài gói này (chỉ Vercel Linux py3.12 mới có wheel).
    # PLAN_PERF.md §1 — REMOTE-ONLY: KHÔNG file /tmp, KHÔNG .sync() (embedded
    # replica trước đây .sync() qua mạng MỖI request -> ~3.7s/request kể cả
    # warm, và mỗi instance giữ bản sao riêng có thể STALE giữa nhiều người
    # dùng cùng lúc). Mỗi query đi thẳng Turso primary -> nhất quán mạnh
    # (mọi người luôn thấy dữ liệu mới nhất) + không tải 33MB lúc cold-start.
    raw = libsql.connect(
        database=os.environ['TURSO_URL'],
        auth_token=os.environ.get('TURSO_AUTH_TOKEN'),
    )
    return ConnWrapper(raw)


# =====================================================================
# API công khai — dùng CHUNG bởi mọi router, không phân biệt chế độ.
# =====================================================================

def get_connection():
    if _is_serverless():
        return _get_connection_serverless()
    return _get_connection_local()


def init_schema(conn=None):
    """Chạy schema.sql (idempotent nhờ IF NOT EXISTS) — cả 2 chế độ đều hỗ
    trợ executescript() (đã kiểm chứng bằng spike libsql-experimental)."""
    own = conn is None
    if own:
        conn = get_connection()
    with open(config.SCHEMA_SQL, encoding='utf-8') as f:
        conn.executescript(f.read())
    conn.commit()
    _migrate_search_cols(conn)
    if own:
        conn.close()


def _migrate_search_cols(conn):
    """PLAN_PERF.md §2 — DB đã tồn tại TRƯỚC KHI schema.sql có 2 cột
    ho_ten_kd/search_blob_kd (CREATE TABLE IF NOT EXISTS không tự thêm cột
    cho bảng đã có) -> tự ALTER TABLE thêm cột nếu còn thiếu. CHỈ thêm cột
    (rỗng) — KHÔNG populate dữ liệu ở đây (13.326 dòng, quá chậm để chạy mỗi
    lần khởi động serverless); populate bằng scripts/build_search_cols.py
    chạy riêng 1 lần (rồi import_data.py tự điền cho hồ sơ nạp mới)."""
    try:
        cols = {r['name'] for r in conn.execute('PRAGMA table_info(ho_so)')}
    except Exception:
        return
    changed = False
    for col in ('ho_ten_kd', 'search_blob_kd'):
        if col in cols:
            continue
        try:
            conn.execute(f'ALTER TABLE ho_so ADD COLUMN {col} TEXT')
            changed = True
        except Exception:
            # cột đã được instance khác thêm đồng thời (đua serverless), hoặc
            # lỗi tạm — không chặn khởi động server vì việc này.
            pass
    # Cờ "đã rà soát xong" từng mục (checkbox panel chi tiết) — thêm cho DB đã
    # tồn tại trước khi schema.sql có 4 cột này. INTEGER DEFAULT 0.
    for col in ('rs_hanh_chinh', 'rs_sinh_ton', 'rs_the_luc', 'rs_canh_bao_khac'):
        if col in cols:
            continue
        try:
            conn.execute(f'ALTER TABLE ho_so ADD COLUMN {col} INTEGER DEFAULT 0')
            changed = True
        except Exception:
            pass
    if changed:
        conn.commit()


def table_counts(conn):
    """Đếm nhanh số dòng mỗi bảng chính — dùng cho /api/health."""
    out = {}
    for t in ('nguoi_dung', 'ho_so', 'benh', 'dm_icd', 'nhat_ky',
              'phan_cong', 'danh_muc'):
        try:
            out[t] = conn.execute(f'SELECT COUNT(*) FROM {t}').fetchone()[0]
        except sqlite3.OperationalError:
            out[t] = None
        except Exception:
            # Chế độ serverless: lỗi từ libsql không phải sqlite3.OperationalError
            out[t] = None
    return out
