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

def _ksk_token_match(value, tokens_str, mode):
    """UDF SQLite cho Box điều kiện (Bộ lọc nâng cao, ho_so.py) — khớp
    Chứa/Không chứa/Bắt đầu bằng/Kết thúc bằng: từng tiếng TRỌN VẸN, ĐÚNG
    THỨ TỰ, không dấu/không phân biệt hoa thường. Import trễ (như
    services/fuzzy.py:build_search_cols đã làm) để tránh phụ thuộc thứ tự
    import ở module-load của db.py (module lõi, nạp rất sớm)."""
    from services import fuzzy  # noqa: E402
    return 1 if fuzzy.token_order_whole_word_match(tokens_str, value, mode) else 0


def _get_connection_local():
    config.ensure_dirs()
    conn = sqlite3.connect(config.DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute('PRAGMA foreign_keys = ON')
    conn.create_function('ksk_token_match', 3, _ksk_token_match)
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
    # TODO: ksk_token_match (Chứa/Không chứa/Bắt đầu bằng/Kết thúc bằng — Box
    # điều kiện của Bộ lọc nâng cao, xem ho_so.py:_dk_condition_sql) CHƯA
    # được đăng ký ở nhánh serverless này vì libsql_experimental không hỗ trợ
    # conn.create_function (Python UDF). Nhánh serverless hiện là legacy/
    # không dùng cho triển khai LAN thực tế (xem ghi chú đầu file) nên chưa
    # tối ưu — nếu bật lại Turso, 4 toán tử trên sẽ lỗi "no such function".
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
    _migrate_khoa_phong(conn)
    _migrate_bo_loc_nang_cao(conn)
    _migrate_danh_dau_xuat(conn)
    _migrate_don_thi_luc_tu_do(conn)
    _migrate_ma_cskcb(conn)
    _migrate_dinh_chinh_cskcb_gln(conn)
    _migrate_xoa_san_phu_khoa_nam(conn)
    _migrate_chuan_hoa_bt(conn)
    _migrate_dong_bo_ten_icd(conn)
    _migrate_snapshot_danh_dau_xuat(conn)
    _migrate_ngay_thang_khong_hop_le(conn)
    _migrate_gan_nguoi_tao_danh_sach(conn)
    _migrate_danh_sach_an(conn)
    _migrate_danh_sach_khoa(conn)
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


_KHOA_PHONG_MAC_DINH = ('TCHC', 'Điều dưỡng', 'Dân số & PT', 'ATTP', 'YTCC',
                         'KSBT', 'KHNV')


def _migrate_khoa_phong(conn):
    """(a) ALTER TABLE nguoi_dung ADD COLUMN khoa_phong_id nếu chưa có
    (bảng nguoi_dung có thể đã tồn tại TRƯỚC KHI schema.sql có cột này —
    CREATE TABLE IF NOT EXISTS không tự thêm cột cho bảng đã có, giống
    _migrate_search_cols ở trên). (b) seed 7 khoa/phòng mặc định vào bảng
    khoa_phong CHỈ KHI bảng đang RỖNG lúc khởi động server (bảng phải tồn
    tại trước — executescript(schema.sql) đã chạy trước hàm này trong
    init_schema())."""
    try:
        cols = {r['name'] for r in conn.execute('PRAGMA table_info(nguoi_dung)')}
    except Exception:
        return
    changed = False
    if 'khoa_phong_id' not in cols:
        try:
            conn.execute(
                'ALTER TABLE nguoi_dung ADD COLUMN khoa_phong_id INTEGER '
                'REFERENCES khoa_phong(id)')
            changed = True
        except Exception:
            # cột đã được instance khác thêm đồng thời, hoặc lỗi tạm — không
            # chặn khởi động server vì việc này.
            pass
    try:
        so_luong = conn.execute('SELECT COUNT(*) FROM khoa_phong').fetchone()[0]
        if so_luong == 0:
            conn.executemany('INSERT INTO khoa_phong(ten) VALUES (?)',
                             [(t,) for t in _KHOA_PHONG_MAC_DINH])
            changed = True
    except Exception:
        pass
    if changed:
        conn.commit()


def _migrate_bo_loc_nang_cao(conn):
    """ALTER TABLE nguoi_dung ADD COLUMN bo_loc_nang_cao_tuy_chon nếu DB đã
    tồn tại TRƯỚC KHI schema.sql có cột này — cùng khuôn với
    _migrate_khoa_phong ở trên. JSON {show_extra, field_order} lưu THEO TÀI
    KHOẢN cho "Box điều kiện" (Bộ lọc nâng cao, list.js) — xem auth.py."""
    try:
        cols = {r['name'] for r in conn.execute('PRAGMA table_info(nguoi_dung)')}
    except Exception:
        return
    if 'bo_loc_nang_cao_tuy_chon' in cols:
        return
    try:
        conn.execute(
            'ALTER TABLE nguoi_dung ADD COLUMN bo_loc_nang_cao_tuy_chon TEXT')
        conn.commit()
    except Exception:
        # cột đã được instance khác thêm đồng thời, hoặc lỗi tạm — không
        # chặn khởi động server vì việc này.
        pass


def _migrate_danh_dau_xuat(conn):
    """ALTER TABLE ho_so ADD COLUMN danh_dau_xuat nếu DB đã tồn tại TRƯỚC KHI
    schema.sql có cột này — cùng khuôn với _migrate_bo_loc_nang_cao ở trên.
    Cờ "đánh dấu xuất file" (checkbox chọn tay ở Danh sách + Chi tiết) —
    mặc định CHỌN HẾT (phản hồi anh Khôi) để hành vi xuất file GIỮ NGUYÊN
    như trước khi có tính năng này (xuất toàn bộ theo phạm vi) trừ khi
    nhân viên chủ động BỎ chọn từng hồ sơ muốn loại trừ.

    ALTER ... DEFAULT 1 tự backfill 1 cho MỌI hồ sơ hiện có nếu đây là lần
    ĐẦU TIÊN thêm cột (DB chưa từng chạy qua bản trước đó). Nếu cột đã tồn
    tại (server đã từng chạy bản CŨ với DEFAULT 0), backfill 1 LẦN DUY NHẤT
    thêm — đánh dấu đã backfill trong bảng cai_dat để KHÔNG lặp lại mỗi lần
    khởi động (lặp lại sẽ ghi đè mất lựa chọn bỏ-chọn thủ công của nhân
    viên về sau)."""
    try:
        cols = {r['name'] for r in conn.execute('PRAGMA table_info(ho_so)')}
    except Exception:
        return
    if 'danh_dau_xuat' not in cols:
        try:
            conn.execute(
                'ALTER TABLE ho_so ADD COLUMN danh_dau_xuat INTEGER DEFAULT 1')
            conn.commit()
        except Exception:
            # cột đã được instance khác thêm đồng thời, hoặc lỗi tạm — không
            # chặn khởi động server vì việc này.
            pass
        return

    _KHOA_BACKFILL = 'danh_dau_xuat_da_backfill'
    try:
        da_backfill = conn.execute(
            'SELECT 1 FROM cai_dat WHERE khoa=?', (_KHOA_BACKFILL,)).fetchone()
        if da_backfill:
            return
        conn.execute('UPDATE ho_so SET danh_dau_xuat=1 '
                     'WHERE danh_dau_xuat=0 OR danh_dau_xuat IS NULL')
        conn.execute(
            'INSERT INTO cai_dat(khoa, gia_tri) VALUES (?, ?) '
            'ON CONFLICT(khoa) DO NOTHING', (_KHOA_BACKFILL, 'true'))
        conn.commit()
    except Exception:
        pass


_THI_LUC_COLS = ('khong_kinh_mat_phai', 'khong_kinh_mat_trai',
                  'co_kinh_mat_phai', 'co_kinh_mat_trai')


def _migrate_don_thi_luc_tu_do(conn):
    """Đợt trước từng cho gõ chữ tự do (vd "ĐNT") ở 4 ô thị lực — phản hồi
    anh Khôi: KHÓA lại, chỉ cho chọn đúng x/10 trong danh mục như cũ. Dọn 1
    LẦN DUY NHẤT (đánh dấu qua cai_dat, tránh chạy lại mỗi lần khởi động —
    lặp lại sẽ xoá cả giá trị x/10 hợp lệ mới nhập SAU migration): giá trị
    nào KHÔNG khớp danh mục thi_luc (0/10..10/10) thì xoá về NULL (coi như
    chưa nhập, đúng yêu cầu)."""
    _KHOA = 'thi_luc_tu_do_da_don'
    try:
        da_don = conn.execute(
            'SELECT 1 FROM cai_dat WHERE khoa=?', (_KHOA,)).fetchone()
        if da_don:
            return
        hop_le = {r['ten'] for r in conn.execute(
            "SELECT ten FROM danh_muc WHERE loai='thi_luc'")}
        if not hop_le:
            return
        placeholders = ','.join('?' * len(hop_le))
        for col in _THI_LUC_COLS:
            conn.execute(
                f"UPDATE ho_so SET {col}=NULL "
                f"WHERE {col} IS NOT NULL AND {col} != '' "
                f"AND {col} NOT IN ({placeholders})",
                tuple(hop_le))
        conn.execute(
            'INSERT INTO cai_dat(khoa, gia_tri) VALUES (?, ?) '
            'ON CONFLICT(khoa) DO NOTHING', (_KHOA, 'true'))
        conn.commit()
    except Exception:
        pass


_MA_CSKCB_MOI = '8934285050981'
_MA_CSKCB_CU = '31006'


def _migrate_ma_cskcb(conn):
    """Đổi mã CSKCB cũ '31006' -> mã mới '8934285050981' + seed danh mục
    'ma_cskcb' với mã mới (dropdown ô "Mã CSKCB" màn Chi tiết). Backfill
    ho_so 1 LẦN DUY NHẤT (đánh dấu qua cai_dat, cùng khuôn với
    _migrate_danh_dau_xuat/_migrate_don_thi_luc_tu_do ở trên) — lặp lại sẽ
    ghi đè mất giá trị ma_cskcb mà nhân viên đã CHỦ ĐỘNG sửa lại thành
    '31006' sau khi migration đã chạy 1 lần."""
    _KHOA = 'ma_cskcb_da_backfill'
    try:
        da_backfill = conn.execute(
            'SELECT 1 FROM cai_dat WHERE khoa=?', (_KHOA,)).fetchone()
        if da_backfill:
            return
        # Seed danh mục — existence check riêng (belt & braces) dù guard
        # cai_dat ở trên đã đảm bảo cả hàm này chỉ chạy trọn vẹn 1 lần.
        da_co = conn.execute(
            "SELECT COUNT(*) FROM danh_muc WHERE loai='ma_cskcb' AND ten=?",
            (_MA_CSKCB_MOI,)).fetchone()[0]
        if da_co == 0:
            conn.execute(
                "INSERT INTO danh_muc(loai, ma, ten) VALUES ('ma_cskcb', NULL, ?)",
                (_MA_CSKCB_MOI,))
        conn.execute(
            'UPDATE ho_so SET ma_cskcb=? WHERE ma_cskcb=?',
            (_MA_CSKCB_MOI, _MA_CSKCB_CU))
        conn.execute(
            'INSERT INTO cai_dat(khoa, gia_tri) VALUES (?, ?) '
            'ON CONFLICT(khoa) DO NOTHING', (_KHOA, 'true'))
        conn.commit()
    except Exception:
        pass


_MA_CSKCB_DUNG = '31006'
_MA_GLN_DUNG = '8934285050981'


def _migrate_dinh_chinh_cskcb_gln(conn):
    """Đính chính lỗi ở _migrate_ma_cskcb phía trên: anh Khôi xác nhận lại
    2 mã đã bị NHẦM LẪN — '31006' MỚI ĐÚNG là mã CSKCB (không phải mã cần
    đổi đi), còn '8934285050981' MỚI ĐÚNG là mã GLN 13 ký tự (không phải mã
    CSKCB thay thế). Ghi đè KHÔNG ĐIỀU KIỆN ma_cskcb='31006' và
    ma_gtin_cskcb='8934285050981' cho TOÀN BỘ hồ sơ — khác nguyên tắc "chỉ
    điền chỗ trống" của các migration khác trong file này, vì đây là ĐÍNH
    CHÍNH dữ liệu sai (anh Khôi yêu cầu tường minh "điền lại vào toàn bộ cơ
    sở dữ liệu"). Dọn mục danh mục 'ma_cskcb'='8934285050981' cũ (sai) để
    nhân viên không chọn nhầm lại; seed đúng 2 danh mục."""
    _KHOA = 'cskcb_gln_da_dinh_chinh'
    try:
        da_chay = conn.execute(
            'SELECT 1 FROM cai_dat WHERE khoa=?', (_KHOA,)).fetchone()
        if da_chay:
            return
        conn.execute('UPDATE ho_so SET ma_cskcb=?', (_MA_CSKCB_DUNG,))
        conn.execute('UPDATE ho_so SET ma_gtin_cskcb=?', (_MA_GLN_DUNG,))
        conn.execute(
            "DELETE FROM danh_muc WHERE loai='ma_cskcb' AND ten=?",
            (_MA_GLN_DUNG,))
        da_co_cskcb = conn.execute(
            "SELECT COUNT(*) FROM danh_muc WHERE loai='ma_cskcb' AND ten=?",
            (_MA_CSKCB_DUNG,)).fetchone()[0]
        if da_co_cskcb == 0:
            conn.execute(
                "INSERT INTO danh_muc(loai, ma, ten) VALUES "
                "('ma_cskcb', NULL, ?)", (_MA_CSKCB_DUNG,))
        da_co_gln = conn.execute(
            "SELECT COUNT(*) FROM danh_muc WHERE loai='ma_gtin_cskcb' AND ten=?",
            (_MA_GLN_DUNG,)).fetchone()[0]
        if da_co_gln == 0:
            conn.execute(
                "INSERT INTO danh_muc(loai, ma, ten) VALUES "
                "('ma_gtin_cskcb', NULL, ?)", (_MA_GLN_DUNG,))
        conn.execute(
            'INSERT INTO cai_dat(khoa, gia_tri) VALUES (?, ?) '
            'ON CONFLICT(khoa) DO NOTHING', (_KHOA, 'true'))
        conn.commit()
    except Exception:
        pass


_SAN_PHU_KHOA_PL_COLS = (
    'noi_khoa_tuan_hoan_pl', 'noi_khoa_ho_hap_pl', 'noi_khoa_tieu_hoa_pl',
    'noi_khoa_than_tietnieu_pl', 'noi_khoa_noi_tiet_pl',
    'noi_khoa_co_xuong_khop_pl', 'noi_khoa_than_kinh_pl',
    'noi_khoa_tam_than_pl', 'kham_ngoai_khoa_pl', 'kham_da_lieu_pl',
    'kham_san_phu_khoa_pl', 'kham_mat_pl', 'kham_tai_mui_hong_pl',
    'kham_rang_ham_mat_pl',
)


def _migrate_xoa_san_phu_khoa_nam(conn):
    """Nam giới không khám sản phụ khoa — phản hồi anh Khôi: dữ liệu nguồn
    từng nạp nhầm/thừa kết quả khám sản phụ khoa (ket_qua_kham_san_phu_khoa)
    và phân loại (kham_san_phu_khoa_pl) cho hồ sơ Nam. Xoá về NULL 1 LẦN
    DUY NHẤT (đánh dấu qua cai_dat, cùng khuôn với các hàm _migrate_* khác ở
    trên) — lặp lại sẽ xoá luôn dữ liệu Nam mà nhân viên có thể đã cố tình
    backfill lại sau migration (dù hiếm khi hợp lệ về nghiệp vụ).

    Hồ sơ Nam bị đổi (2 cột trên VỐN đã có giá trị trước khi xoá) có thể
    làm co_quan "nặng nhất" trong bất biến QĐ1613 thay đổi (mất hẳn 1 ứng
    viên max) -> phải tính lại check_invariant()/sync_vi_pham_flag() cho
    ĐÚNG các hồ sơ đó (giống cách routers/ho_so.py, routers/benh.py làm sau
    mọi lần ghi ảnh hưởng phan_loai_sk/*_pl) để banner "vi phạm bất biến"
    không bị lệch. Hồ sơ Nam mà 2 cột này vốn đã NULL/rỗng thì bỏ qua, tránh
    gọi check_invariant/sync_vi_pham_flag tràn lan không cần thiết."""
    _KHOA = 'san_phu_khoa_nam_da_xoa'
    try:
        da_xoa = conn.execute(
            'SELECT 1 FROM cai_dat WHERE khoa=?', (_KHOA,)).fetchone()
        if da_xoa:
            return
        from services import qc  # noqa: E402 — import trễ, xem _ksk_token_match

        anh_huong = conn.execute(
            "SELECT ma_ho_so FROM ho_so WHERE gioi_tinh='Nam' AND ("
            "kham_san_phu_khoa_pl IS NOT NULL OR "
            "(ket_qua_kham_san_phu_khoa IS NOT NULL AND "
            "ket_qua_kham_san_phu_khoa<>''))").fetchall()
        ma_ho_so_anh_huong = [r['ma_ho_so'] for r in anh_huong]

        conn.execute(
            "UPDATE ho_so SET ket_qua_kham_san_phu_khoa=NULL, "
            "kham_san_phu_khoa_pl=NULL WHERE gioi_tinh='Nam'")

        cols_sql = ', '.join(_SAN_PHU_KHOA_PL_COLS)
        for ma_ho_so in ma_ho_so_anh_huong:
            row = conn.execute(
                f'SELECT {cols_sql}, kham_the_luc_pl, phan_loai_sk '
                'FROM ho_so WHERE ma_ho_so=?', (ma_ho_so,)).fetchone()
            if row is None:
                continue
            inv = qc.check_invariant(row)
            qc.sync_vi_pham_flag(conn, ma_ho_so, inv)

        conn.execute(
            'INSERT INTO cai_dat(khoa, gia_tri) VALUES (?, ?) '
            'ON CONFLICT(khoa) DO NOTHING', (_KHOA, 'true'))
        conn.commit()
    except Exception:
        pass


_BT_COLS = ('ham_tren', 'ham_duoi', 'kq_dien_tim', 'kq_sieu_am_o_bung',
            'cac_benh_tat_neu_co')


def _migrate_chuan_hoa_bt(conn):
    """Chuẩn hoá viết tắt "bt"/"BT" (và mọi biến thể hoa/thường khác) thành
    "Bình thường" cho ĐÚNG 5 cột đã khảo sát toàn bộ 97 cột TEXT của ho_so
    còn dùng viết tắt này (_BT_COLS) — phản hồi anh Khôi: dữ liệu nguồn gõ
    tắt không nhất quán, cần hiển thị đầy đủ chữ khi xuất/xem hồ sơ. So khớp
    TOÀN BỘ giá trị (LOWER(cot)='bt'), KHÔNG dùng LIKE — tránh đụng các giá
    trị chỉ CHỨA chuỗi con "bt" (ví dụ tên người, địa chỉ, chẩn đoán có lẫn
    "bt" ở giữa). KHÔNG áp dụng cho cột khác dù trùng pattern (ho_ten,
    dia_chi, ho_ten_kd, chan_doan_goc — chan_doan_goc là cột CHỈ ĐỌC theo
    §3.4.2, tuyệt đối không đụng) và KHÔNG đụng bảng benh.

    1 LẦN DUY NHẤT (đánh dấu qua cai_dat) — lặp lại vô hại về mặt dữ liệu
    (WHERE LOWER(cot)='bt' sẽ không còn khớp gì sau lần đầu) nhưng vẫn dùng
    cờ cho nhất quán với các hàm _migrate_* khác và tránh quét 5 cột x toàn
    bộ ho_so mỗi lần khởi động server."""
    _KHOA = 'bt_binh_thuong_da_chuan_hoa'
    try:
        da_chuan_hoa = conn.execute(
            'SELECT 1 FROM cai_dat WHERE khoa=?', (_KHOA,)).fetchone()
        if da_chuan_hoa:
            return
        for col in _BT_COLS:
            conn.execute(
                f"UPDATE ho_so SET {col}='Bình thường' "
                f"WHERE LOWER({col})='bt'")
        conn.execute(
            'INSERT INTO cai_dat(khoa, gia_tri) VALUES (?, ?) '
            'ON CONFLICT(khoa) DO NOTHING', (_KHOA, 'true'))
        conn.commit()
    except Exception:
        pass


def _migrate_dong_bo_ten_icd(conn):
    """Đồng bộ benh.ten_icd theo danh mục dm_icd mới nhất (dm_icd có thể đã
    được nạp lại/sửa tên sau khi bản ghi benh.ten_icd đã lưu nguyên văn từ
    lúc nạp — phản hồi anh Khôi: tên ICD hiển thị bị lệch so với danh mục
    hiện hành). 2 tầng join, ưu tiên CHÍNH XÁC trước:
      1) benh.ma_icd = dm_icd.ma (giữ nguyên †/*) — khớp ĐÚNG mã gốc.
      2) fallback qua dm_icd.ma_tran (đã bỏ †/*) CHỈ cho dòng KHÔNG khớp ở
         tầng 1 — dữ liệu có 88 nhóm ma_tran bị trùng bởi 2 dm_icd.ma khác
         nhau (12 nhóm có ten THỰC SỰ khác nhau, vd 'A02.2'/'A02.2†') nên
         PHẢI chọn 1 kết quả XÁC ĐỊNH (ORDER BY ma LIMIT 1), không để SQLite
         tự chọn ngẫu nhiên giữa các dòng dm_icd trùng ma_tran.
    Dòng ma_icd không khớp dm_icd ở CẢ 2 tầng thì giữ nguyên ten_icd.

    1 LẦN DUY NHẤT (đánh dấu qua cai_dat) — lặp lại sẽ ghi đè mất ten_icd mà
    nhân viên có thể đã tự sửa tay lệch khỏi danh mục sau khi migration đã
    chạy 1 lần (cùng lý do dùng cờ như _migrate_ma_cskcb ở trên)."""
    _KHOA = 'ten_icd_da_dong_bo'
    try:
        da_dong_bo = conn.execute(
            'SELECT 1 FROM cai_dat WHERE khoa=?', (_KHOA,)).fetchone()
        if da_dong_bo:
            return
        # Tầng 1 — khớp CHÍNH XÁC ma_icd = dm_icd.ma.
        conn.execute(
            "UPDATE benh SET ten_icd = ("
            "  SELECT ten FROM dm_icd WHERE dm_icd.ma = benh.ma_icd) "
            "WHERE ma_icd IS NOT NULL AND ma_icd <> '' "
            "AND EXISTS (SELECT 1 FROM dm_icd WHERE dm_icd.ma = benh.ma_icd) "
            "AND ten_icd IS NOT ("
            "  SELECT ten FROM dm_icd WHERE dm_icd.ma = benh.ma_icd)")
        # Tầng 2 — fallback qua ma_tran (đã bỏ †/*), CHỈ cho dòng KHÔNG khớp
        # tầng 1. ORDER BY ma LIMIT 1 để chọn xác định khi ma_tran bị trùng
        # bởi nhiều dm_icd.ma khác nhau.
        conn.execute(
            "UPDATE benh SET ten_icd = ("
            "  SELECT ten FROM dm_icd "
            "  WHERE dm_icd.ma_tran = REPLACE(REPLACE(benh.ma_icd,'†',''),'*','') "
            "  ORDER BY ma LIMIT 1) "
            "WHERE ma_icd IS NOT NULL AND ma_icd <> '' "
            "AND NOT EXISTS (SELECT 1 FROM dm_icd WHERE dm_icd.ma = benh.ma_icd) "
            "AND EXISTS (SELECT 1 FROM dm_icd "
            "  WHERE dm_icd.ma_tran = REPLACE(REPLACE(benh.ma_icd,'†',''),'*','')) "
            "AND ten_icd IS NOT ("
            "  SELECT ten FROM dm_icd "
            "  WHERE dm_icd.ma_tran = REPLACE(REPLACE(benh.ma_icd,'†',''),'*','') "
            "  ORDER BY ma LIMIT 1)")
        conn.execute(
            'INSERT INTO cai_dat(khoa, gia_tri) VALUES (?, ?) '
            'ON CONFLICT(khoa) DO NOTHING', (_KHOA, 'true'))
        conn.commit()
    except Exception:
        pass


_TEN_DS_SNAPSHOT_XUAT = 'DS xuất 27.07'


def _migrate_snapshot_danh_dau_xuat(conn):
    """Phản hồi anh Khôi (2026-07-27): trước khi checkbox "đánh dấu xuất
    file" có thể bị đổi sang cơ chế "chọn case" cho tính năng danh sách tùy
    chỉnh (đang bàn thiết kế, CHƯA triển khai UI) — chụp lại NGAY 1 LẦN DUY
    NHẤT trạng thái ho_so.danh_dau_xuat=1 hiện có vào 1 "danh sách" tên
    'DS xuất 27.07' để không mất, TẠI THỜI ĐIỂM server khởi động lại lần
    này (đánh dấu qua cai_dat, không snapshot lại nếu chạy tiếp các lần
    sau — tránh ghi đè danh sách nếu nhân viên đã tự sửa/xoá bớt case khỏi
    đó về sau)."""
    _KHOA = 'snapshot_danh_dau_xuat_27_07_da_tao'
    try:
        da_chay = conn.execute(
            'SELECT 1 FROM cai_dat WHERE khoa=?', (_KHOA,)).fetchone()
        if da_chay:
            return
        cur = conn.execute('INSERT INTO danh_sach(ten) VALUES (?)',
                           (_TEN_DS_SNAPSHOT_XUAT,))
        danh_sach_id = cur.lastrowid
        ma_list = [r['ma_ho_so'] for r in conn.execute(
            'SELECT ma_ho_so FROM ho_so WHERE danh_dau_xuat=1').fetchall()]
        conn.executemany(
            'INSERT INTO danh_sach_ho_so(danh_sach_id, ma_ho_so) '
            'VALUES (?, ?)', [(danh_sach_id, ma) for ma in ma_list])
        conn.execute(
            'INSERT INTO cai_dat(khoa, gia_tri) VALUES (?, ?) '
            'ON CONFLICT(khoa) DO NOTHING', (_KHOA, 'true'))
        conn.commit()
    except Exception:
        pass


def _migrate_ngay_thang_khong_hop_le(conn):
    """Rà soát TOÀN BỘ ho_so, gắn cờ NGAY_THANG_KHONG_HOP_LE (services/qc.py)
    cho hồ sơ có ≥1 trong 3 trường ngày (ngay_sinh/ngay_vao/ngaycap_cccd) sai
    định dạng hoặc không tồn tại trong lịch (vd '01/01/144', '30/02/2000') —
    phản hồi anh Khôi: widget nhập ngày (renderDate(), frontend/js/
    widgets.js) trước đây không validate gì, cần rà soát dữ liệu CŨ đã lưu
    sai. CHỈ ĐÁNH DẤU, KHÔNG tự động sửa/xoá bất kỳ giá trị ngày tháng nào —
    validate mới (services/ngay_thang_valid.py, gọi ở PATCH /api/ho-so) chỉ
    chặn lưu sai THÊM từ nay, không đụng dữ liệu cũ. TÁI SỬ DỤNG
    services/qc.sync_ngay_thang_flag() (không viết lại logic parse ngày lần
    2, không tự commit trong vòng lặp — commit 1 lần ở cuối).

    1 LẦN DUY NHẤT (đánh dấu qua cai_dat) — lặp lại vô hại về mặt dữ liệu
    (add_flag() idempotent) nhưng dùng cờ cho nhất quán với các hàm
    _migrate_* khác và tránh quét toàn bộ ho_so mỗi lần khởi động server."""
    _KHOA = 'ngay_thang_khong_hop_le_da_rasoat'
    try:
        da_chay = conn.execute(
            'SELECT 1 FROM cai_dat WHERE khoa=?', (_KHOA,)).fetchone()
        if da_chay:
            return
        from services import qc  # noqa: E402 — import trễ, xem _ksk_token_match
        rows = conn.execute(
            'SELECT ma_ho_so, ngay_sinh, ngay_vao, ngaycap_cccd, co_qc '
            'FROM ho_so').fetchall()
        for row in rows:
            qc.sync_ngay_thang_flag(conn, row['ma_ho_so'], row)
        conn.execute(
            'INSERT INTO cai_dat(khoa, gia_tri) VALUES (?, ?) '
            'ON CONFLICT(khoa) DO NOTHING', (_KHOA, 'true'))
        conn.commit()
    except Exception:
        pass


def _migrate_gan_nguoi_tao_danh_sach(conn):
    """Phản hồi anh Khôi (2026-07-27): tính năng "Danh sách tùy chỉnh" đổi
    sang phân quyền theo chủ sở hữu (chỉ người tạo/admin mới xóa/thêm/bớt
    case) — nhưng các danh sách tạo TRƯỚC đợt này (vd 'DS xuất 27.07' tạo tự
    động qua _migrate_snapshot_danh_dau_xuat ở trên, và bất kỳ danh sách nào
    khác lỡ có nguoi_tao_id NULL) chưa có chủ. Gán MỘT LẦN DUY NHẤT cho MỌI
    danh_sach đang NULL về tài khoản admin ĐẦU TIÊN trong hệ thống (id nhỏ
    nhất, vai_tro='admin') để không ai bị khóa khỏi các danh sách đang dùng
    hàng ngày.

    1 LẦN DUY NHẤT (đánh dấu qua cai_dat) — CHỈ gán cho danh sách ĐANG NULL
    tại thời điểm migration chạy lần đầu, không phải "luôn ép về admin": nếu
    sau đó ai đó (không phải admin) đổi nguoi_tao_id sang giá trị khác, lần
    khởi động sau KHÔNG được ghi đè lại.

    Nếu hệ thống chưa có tài khoản admin nào (không nên xảy ra nhưng phòng
    thủ) -> bỏ qua an toàn, KHÔNG set cờ cai_dat, để lần khởi động sau thử
    lại (một khi đã có admin)."""
    _KHOA = 'danh_sach_gan_nguoi_tao_da_chay'
    try:
        da_chay = conn.execute(
            'SELECT 1 FROM cai_dat WHERE khoa=?', (_KHOA,)).fetchone()
        if da_chay:
            return
        admin = conn.execute(
            "SELECT id FROM nguoi_dung WHERE vai_tro='admin' "
            'ORDER BY id LIMIT 1').fetchone()
        if not admin:
            return
        conn.execute(
            'UPDATE danh_sach SET nguoi_tao_id=? WHERE nguoi_tao_id IS NULL',
            (admin['id'],))
        conn.execute(
            'INSERT INTO cai_dat(khoa, gia_tri) VALUES (?, ?) '
            'ON CONFLICT(khoa) DO NOTHING', (_KHOA, 'true'))
        conn.commit()
    except Exception:
        pass


def _migrate_danh_sach_an(conn):
    """ALTER TABLE danh_sach ADD COLUMN an nếu DB đã tồn tại TRƯỚC KHI
    schema.sql có cột này — cùng khuôn với _migrate_search_cols/
    _migrate_bo_loc_nang_cao ở trên. Cờ "ẩn danh sách" (khối "Quản lý danh
    sách" ở Cài đặt, admin-only) — ẩn khỏi dropdown "Xem theo danh sách" và
    popover "Thêm vào danh sách" của MỌI người dùng, KHÔNG xóa dữ liệu.
    DEFAULT 0 -> mọi danh_sach hiện có tự động "đang hiện" sau migration,
    giữ nguyên hành vi trước khi có tính năng này."""
    try:
        cols = {r['name'] for r in conn.execute('PRAGMA table_info(danh_sach)')}
    except Exception:
        return
    if 'an' in cols:
        return
    try:
        conn.execute('ALTER TABLE danh_sach ADD COLUMN an INTEGER NOT NULL DEFAULT 0')
        conn.commit()
    except Exception:
        # cột đã được instance khác thêm đồng thời, hoặc lỗi tạm — không
        # chặn khởi động server vì việc này.
        pass


def _migrate_danh_sach_khoa(conn):
    """ALTER TABLE danh_sach ADD COLUMN khoa nếu DB đã tồn tại TRƯỚC KHI
    schema.sql có cột này — cùng khuôn với _migrate_danh_sach_an ở trên. Cờ
    "khóa danh sách" (khối "Quản lý danh sách" ở Cài đặt, admin-only) — chặn
    TUYỆT ĐỐI (kể cả admin/chủ sở hữu) hành động thêm/gỡ hồ sơ khỏi danh
    sách đó (xem routers/danh_sach.py:_require_quyen_them_go), KHÔNG ảnh
    hưởng xem/lọc/xóa/ẩn/sửa tên. DEFAULT 0 -> mọi danh_sach hiện có tự động
    "chưa khóa" sau migration, giữ nguyên hành vi trước khi có tính năng
    này."""
    try:
        cols = {r['name'] for r in conn.execute('PRAGMA table_info(danh_sach)')}
    except Exception:
        return
    if 'khoa' in cols:
        return
    try:
        conn.execute('ALTER TABLE danh_sach ADD COLUMN khoa INTEGER NOT NULL DEFAULT 0')
        conn.commit()
    except Exception:
        # cột đã được instance khác thêm đồng thời, hoặc lỗi tạm — không
        # chặn khởi động server vì việc này.
        pass


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
