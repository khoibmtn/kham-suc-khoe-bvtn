# -*- coding: utf-8 -*-
"""
export_xlsm.py — Pipeline 2: xuất file .xlsm nộp Bộ Y tế (§7 SPEC).

KHÔNG viết lại pipeline xuất: bảng `ho_so` được thiết kế để tên cột (viết
hoa) khớp THẲNG với mã trường mẫu BYT (đã kiểm chứng: 99/99 mã trường ở
dòng 2 của `doc/Import_KSK_Tren 18.xlsm` có cột `ho_so` cùng tên viết
thường) — nên "ánh xạ ngược" của import_data.py chỉ là `col.upper()`,
không cần bảng tra riêng. Việc ghi file thật sự vẫn gọi lại
`build/build_xlsm.write_xlsm` (qua tiến trình con `export_worker.py`),
đúng bẫy §10: KHÔNG tạo workbook mới, tách theo xã, mỗi xã một tiến trình.

Job chạy NỀN trên 1 thread; mỗi xã lại là 1 SUBPROCESS riêng (export_worker.py)
để hệ điều hành thu hồi bộ nhớ openpyxl sau từng file (bẫy §10 SPEC).
"""
import datetime
import io
import json
import os
import re
import subprocess
import sys
import threading
import uuid

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
import config  # noqa: E402
import db  # noqa: E402
from services import qc  # noqa: E402

WORKER_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'export_worker.py')
EXPORTS_DIR = os.path.join(config.DATA_DIR, 'exports')

SCOPE_TYPES = ('toan_bo', 'xa', 'can_bo', 'trang_thai', 'chon_tay')

TRANG_THAI_NHAN = {
    'chua_ra_soat': 'Chưa rà soát', 'dang_ra_soat': 'Đang rà soát',
    'hoan_thanh': 'Hoàn thành', 'can_doi_chieu_giay': 'Cần đối chiếu giấy',
}

# Danh sách cột mở rộng CHÍNH XÁC theo §7.2 SPEC — cột từ 104 trở đi, mặc
# định KHÔNG ghi, chỉ ghi khi user tick chọn & bật option (mặc định TẮT).
EXTENDED_COLUMNS = [
    ('MA_BENH_CHINH', 'Mã bệnh chính'),
    ('MA_BENH_KEM', 'Mã bệnh kèm'),
    ('TEN_BENH_KEM', 'Tên bệnh kèm'),
    ('CO_QUAN_BENH_CHINH', 'Cơ quan bệnh chính'),
    ('CHAN_DOAN_GOC', 'Chẩn đoán gốc'),
    ('CO_QC', 'Cờ QC'),
    ('SO_LOI', 'Số lỗi'),
    ('GHI_CHU_RA_SOAT', 'Ghi chú rà soát'),
    ('NGUOI_RA_SOAT', 'Người rà soát'),
    ('TRANG_THAI', 'Trạng thái'),
    ('THOI_DIEM_HOAN_THANH', 'Thời điểm hoàn thành'),
    ('GLU_THOI_DIEM', 'Thời điểm đo glucose'),
    ('GLU_GIA_TRI', 'Giá trị glucose'),
    ('KQ_DIEN_TIM', 'Kết quả điện tim'),
    ('KQ_SIEU_AM_O_BUNG', 'Kết quả siêu âm ổ bụng'),
]
EXTENDED_LABELS = dict(EXTENDED_COLUMNS)
EXTENDED_CODES = {c for c, _ in EXTENDED_COLUMNS}

_JOBS = {}
_JOBS_LOCK = threading.Lock()


# ============================= PHẠM VI =============================
def resolve_scope_where(pham_vi, gia_tri):
    gia_tri = gia_tri or []
    if pham_vi == 'toan_bo':
        return '1=1', []
    if pham_vi == 'xa':
        vals = [v for v in gia_tri if v]
        if not vals:
            raise ValueError('Thiếu danh sách xã/phường')
        return f"maxa_cu_tru IN ({','.join('?' * len(vals))})", vals
    if pham_vi == 'can_bo':
        try:
            vals = [int(v) for v in gia_tri]
        except (TypeError, ValueError):
            raise ValueError('Mã nhân viên không hợp lệ')
        if not vals:
            raise ValueError('Thiếu danh sách nhân viên')
        return f"nguoi_ra_soat_id IN ({','.join('?' * len(vals))})", vals
    if pham_vi == 'trang_thai':
        vals = [v for v in gia_tri if v]
        if not vals:
            raise ValueError('Thiếu danh sách trạng thái')
        return f"trang_thai IN ({','.join('?' * len(vals))})", vals
    if pham_vi == 'chon_tay':
        vals = [v for v in gia_tri if v]
        if not vals:
            raise ValueError('Danh sách mã hồ sơ rỗng')
        return f"ma_ho_so IN ({','.join('?' * len(vals))})", vals
    raise ValueError(f"pham_vi không hợp lệ: {pham_vi!r} (phải là {SCOPE_TYPES})")


def _red_flag_where():
    parts, args = [], []
    for f in sorted(qc.RED_FLAGS):
        parts.append("(';'||co_qc||';') LIKE ?")
        args.append(f'%;{f};%')
    return '(' + ' OR '.join(parts) + ')', args


def preview(conn, pham_vi, gia_tri, include_errors):
    """Đếm trước khi xuất (§7.2): tổng trong phạm vi, số còn cờ 🔴, sẽ xuất,
    sẽ loại trừ (nếu include_errors=False, các ca cờ đỏ bị loại)."""
    where_sql, args = resolve_scope_where(pham_vi, gia_tri)
    tong = conn.execute(f'SELECT COUNT(*) FROM ho_so WHERE {where_sql}', args).fetchone()[0]
    red_sql, red_args = _red_flag_where()
    do_flag_count = conn.execute(
        f'SELECT COUNT(*) FROM ho_so WHERE {where_sql} AND {red_sql}',
        args + red_args).fetchone()[0]
    se_loai_tru = 0 if include_errors else do_flag_count
    return {'tong': tong, 'do_flag_count': do_flag_count,
            'se_xuat': tong - se_loai_tru, 'se_loai_tru': se_loai_tru}


# ================= XUẤT .XLSX ĐƠN THUẦN (không macro) =================
# Khác pipeline .xlsm nộp Bộ: KHÔNG mở template nặng (dmicdme 35.735 dòng),
# KHÔNG job nền/đĩa, KHÔNG subprocess — chỉ dựng 1 workbook write_only trong
# bộ nhớ rồi trả bytes. Nhờ vậy chạy được CẢ trên bản đám mây (serverless
# không có tiến trình nền/đĩa bền) lẫn máy local, tải về ngay.
FIRST_DATA_ROW = 4              # mẫu BYT: dòng 1 nhãn, 2 mã trường, 3 hướng dẫn
_NCOL = 103                     # đúng 103 cột như mẫu 'Trên 18'
_PLAIN_TEXT_CODES = {'SO_CCCD', 'NGAY_VAO', 'NGAY_SINH', 'NGAYCAP_CCCD'}
_TPL_HEADER_CACHE = None


def _template_header():
    """Đọc 3 dòng header (nhãn/mã/hướng dẫn) của sheet 'Trên 18' từ template
    — CHỈ 3 dòng đầu (read_only, không đụng sheet danh mục nặng). Trả
    (header_rows: list[3][103], code2col: {MÃ_TRƯỜNG: chỉ_số_cột 1-based}).
    Cache ở module vì header cố định, dùng lại cho mọi lần xuất."""
    global _TPL_HEADER_CACHE
    if _TPL_HEADER_CACHE is None:
        import openpyxl
        wb = openpyxl.load_workbook(config.CATALOG_XLSM, read_only=True,
                                    keep_vba=False)
        ws = wb['Trên 18']
        header_rows = []
        for row in ws.iter_rows(min_row=1, max_row=3, values_only=True):
            vals = list(row[:_NCOL])
            vals += [None] * (_NCOL - len(vals))
            header_rows.append(vals)
        wb.close()
        code2col = {}
        for c, code in enumerate(header_rows[1], 1):   # dòng 2 = mã trường
            if code:
                code2col[str(code).strip()] = c
        _TPL_HEADER_CACHE = (header_rows, code2col)
    return _TPL_HEADER_CACHE


def _plain_xlsx_bytes(rows):
    """Dựng .xlsx write_only: 1 sheet 'Trên 18' (3 dòng header giống mẫu +
    dữ liệu từ dòng 4). Trả (bytes, số_dòng)."""
    import openpyxl
    from openpyxl.cell import WriteOnlyCell
    from openpyxl.styles import Alignment, Font

    header_rows, code2col = _template_header()
    text_cols = {code2col[c] for c in _PLAIN_TEXT_CODES if c in code2col}

    wb = openpyxl.Workbook(write_only=True)
    ws = wb.create_sheet('Trên 18')
    ws.freeze_panes = 'B4'
    bold = Font(bold=True)
    wrap = Alignment(wrap_text=True, vertical='top')

    for ri, hrow in enumerate(header_rows, 1):
        cells = []
        for v in hrow:
            c = WriteOnlyCell(ws, value=(v if v not in (None, '') else None))
            if ri == 1:
                c.font = bold
            c.alignment = wrap
            cells.append(c)
        ws.append(cells)

    for i, row in enumerate(rows):
        rec = {k.upper(): row[k] for k in row.keys()}
        line = [None] * _NCOL
        line[0] = i + 1                                # cột TT
        for code, col in code2col.items():
            if code in rec and rec[code] not in (None, ''):
                line[col - 1] = rec[code]
        cells = []
        for ci, v in enumerate(line, 1):
            c = WriteOnlyCell(ws, value=v)
            if ci in text_cols and v not in (None, ''):
                c.number_format = '@'                  # giữ CCCD/ngày dạng text
            cells.append(c)
        ws.append(cells)

    bio = io.BytesIO()
    wb.save(bio)
    wb.close()
    return bio.getvalue(), len(rows)


def build_plain_xlsx(conn, pham_vi, gia_tri, include_errors):
    """Xuất .xlsx đơn thuần cho phạm vi đã chọn (gộp mọi hồ sơ vào 1 sheet).
    Loại hồ sơ còn cờ đỏ khi include_errors=False, hệt logic .xlsm. Ném
    ValueError nếu phạm vi rỗng — router chuyển thành 400."""
    where_sql, args = resolve_scope_where(pham_vi, gia_tri)
    rows = conn.execute(
        f'SELECT * FROM ho_so WHERE {where_sql} ORDER BY maxa_cu_tru, tt',
        args).fetchall()
    if not rows:
        raise ValueError('Không có hồ sơ nào khớp phạm vi đã chọn')
    if not include_errors:
        red_sql, red_args = _red_flag_where()
        red_set = {r['ma_ho_so'] for r in conn.execute(
            f'SELECT ma_ho_so FROM ho_so WHERE {where_sql} AND {red_sql}',
            args + red_args)}
        rows = [r for r in rows if r['ma_ho_so'] not in red_set]
        if not rows:
            raise ValueError('Toàn bộ hồ sơ trong phạm vi đều còn cờ đỏ — '
                             'bật "Xuất kèm cả hồ sơ lỗi" nếu vẫn muốn xuất')
    return _plain_xlsx_bytes(rows)


# ============================= XÂY BẢN GHI =============================
def _xa_filename(xa):
    ten = re.sub(r'[^\w]+', '_', xa or 'Chua_xac_dinh').strip('_')
    return f'KSK_Import_{ten}.xlsm'


def _row_to_rec(row, tt):
    """Đảo ngược import_data.py: tên cột `ho_so` viết hoa == mã trường BYT
    (đã kiểm chứng field-by-field với dòng 2 của template — xem docstring
    module). write_xlsm() tự bỏ qua các khoá không khớp mã trường mẫu."""
    rec = {k.upper(): row[k] for k in row.keys()}
    rec['TT'] = tt
    return rec


def _row_ext(row, ho_ten_ra_soat):
    """Giá trị cho các cột mở rộng §7.2 — chỉ dùng khi user bật option."""
    return {
        'MA_BENH_CHINH': row['ma_benh_chinh'],
        'MA_BENH_KEM': row['ma_benh_kem'],
        'TEN_BENH_KEM': row['ten_benh_kem'],
        'CO_QUAN_BENH_CHINH': qc.TEN_CQ.get(row['co_quan_benh_chinh'], row['co_quan_benh_chinh']),
        'CHAN_DOAN_GOC': row['chan_doan_goc'],
        'CO_QC': row['co_qc'],
        'SO_LOI': row['so_loi'],
        'GHI_CHU_RA_SOAT': row['ghi_chu_ra_soat'],
        'NGUOI_RA_SOAT': ho_ten_ra_soat,
        'TRANG_THAI': TRANG_THAI_NHAN.get(row['trang_thai'], row['trang_thai']),
        'THOI_DIEM_HOAN_THANH': row['thoi_diem_hoan_thanh'],
        'GLU_THOI_DIEM': row['glu_thoi_diem'],
        'GLU_GIA_TRI': row['glu_gia_tri'],
        'KQ_DIEN_TIM': row['kq_dien_tim'],
        'KQ_SIEU_AM_O_BUNG': row['kq_sieu_am_o_bung'],
    }


# ============================= JOB =============================
def _save_job(job):
    path = os.path.join(job['job_dir'], 'job.json')
    tmp = path + '.tmp'
    with open(tmp, 'w', encoding='utf-8') as f:
        json.dump(job, f, ensure_ascii=False, indent=2)
    os.replace(tmp, path)


def _log(job, msg):
    line = f"[{datetime.datetime.now().strftime('%H:%M:%S')}] {msg}"
    job['log'].append(line)
    _save_job(job)


def create_job(pham_vi, gia_tri, include_errors, extended, admin_id):
    """Chuẩn bị job (đọc DB, gom theo xã, đếm cờ đỏ) rồi khởi động thread nền.
    Ném ValueError nếu phạm vi rỗng/không hợp lệ — router chuyển thành 400."""
    conn = db.get_connection()
    try:
        where_sql, args = resolve_scope_where(pham_vi, gia_tri)
        rows = conn.execute(
            f'SELECT * FROM ho_so WHERE {where_sql} ORDER BY maxa_cu_tru, tt',
            args).fetchall()
        red_sql, red_args = _red_flag_where()
        red_set = {r['ma_ho_so'] for r in conn.execute(
            f'SELECT ma_ho_so FROM ho_so WHERE {where_sql} AND {red_sql}',
            args + red_args)}
        user_map = {r['id']: r['ho_ten'] for r in
                    conn.execute('SELECT id, ho_ten FROM nguoi_dung')}
    finally:
        conn.close()

    if not rows:
        raise ValueError('Không có hồ sơ nào khớp phạm vi đã chọn')

    ext_enabled = bool(extended and extended.get('enabled'))
    ext_columns = []
    if ext_enabled:
        ext_columns = [c for c in (extended.get('columns') or []) if c in EXTENDED_CODES]

    xa_groups = {}
    for row in rows:
        xa_groups.setdefault(row['maxa_cu_tru'] or 'Chưa xác định', []).append(row)

    do_flag_count = sum(1 for r in rows if r['ma_ho_so'] in red_set)
    se_loai_tru = 0 if include_errors else do_flag_count

    ts = datetime.datetime.now().strftime('%Y%m%d_%H%M%S')
    job_id = f'{ts}_{uuid.uuid4().hex[:6]}'
    job_dir = os.path.join(EXPORTS_DIR, job_id)
    os.makedirs(job_dir, exist_ok=True)

    job = {
        'id': job_id, 'status': 'queued',
        'created_at': datetime.datetime.now().isoformat(),
        'admin_id': admin_id,
        'params': {'pham_vi': pham_vi, 'gia_tri': gia_tri,
                    'include_errors': include_errors,
                    'extended': {'enabled': ext_enabled, 'columns': ext_columns}},
        'tong_pham_vi': len(rows), 'do_flag_count': do_flag_count,
        'se_xuat': len(rows) - se_loai_tru, 'se_loai_tru': se_loai_tru,
        'xa_progress': [{'xa': xa, 'so_ca': len(v), 'status': 'cho'}
                         for xa, v in sorted(xa_groups.items())],
        'log': [], 'files': [], 'error': None, 'job_dir': job_dir,
    }
    with _JOBS_LOCK:
        _JOBS[job_id] = job
    _save_job(job)

    t = threading.Thread(target=_run_job,
                          args=(job_id, rows, red_set, user_map, include_errors,
                                ext_enabled, ext_columns),
                          daemon=True)
    t.start()
    return job


def _run_job(job_id, rows, red_set, user_map, include_errors, ext_enabled, ext_columns):
    job = _JOBS[job_id]
    job['status'] = 'running'
    _log(job, f"Bắt đầu xuất {len(rows)} hồ sơ trong phạm vi đã chọn "
              f"(cờ đỏ: {job['do_flag_count']}, "
              f"{'gồm cả hồ sơ lỗi' if include_errors else 'loại trừ hồ sơ lỗi'})")

    xa_groups = {}
    for row in rows:
        xa_groups.setdefault(row['maxa_cu_tru'] or 'Chưa xác định', []).append(row)

    exported_ma = []
    ke_records = []  # (row, included: bool, ten_file|None) — cho file kê
    had_error = False

    for prog in job['xa_progress']:
        xa = prog['xa']
        xa_rows = xa_groups.get(xa, [])

        included_rows, skip_rows = [], []
        for r in xa_rows:
            is_red = r['ma_ho_so'] in red_set
            if is_red and not include_errors:
                skip_rows.append(r)
            else:
                included_rows.append(r)
        for r in skip_rows:
            ke_records.append((r, False, None))

        if not included_rows:
            prog['status'] = 'xong'
            prog['so_ca'] = 0
            _log(job, f"Xã {xa}: không có hồ sơ để xuất "
                      f"(toàn bộ {len(skip_rows)} ca bị loại do cờ đỏ)")
            _save_job(job)
            continue

        prog['status'] = 'dang_chay'
        _log(job, f"Xã {xa}: đang xuất {len(included_rows)} ca ...")

        recs = []
        for i, r in enumerate(included_rows, 1):
            rec = _row_to_rec(r, i)
            if ext_enabled:
                rec['_EXT'] = _row_ext(r, user_map.get(r['nguoi_ra_soat_id'], ''))
            recs.append(rec)

        filename = _xa_filename(xa)
        output_path = os.path.join(job['job_dir'], filename)
        handoff_name = re.sub(r'[^\w]+', '_', xa).strip('_') or 'xa'
        handoff_path = os.path.join(job['job_dir'], f'.handoff_{handoff_name}.json')
        with open(handoff_path, 'w', encoding='utf-8') as f:
            json.dump({'records': recs,
                       'extended': {'enabled': ext_enabled, 'columns': ext_columns,
                                    'labels': EXTENDED_LABELS}},
                      f, ensure_ascii=False)

        result = subprocess.run(
            [sys.executable, WORKER_PATH, handoff_path, output_path],
            capture_output=True, text=True)

        try:
            os.remove(handoff_path)
        except OSError:
            pass

        if result.returncode == 0:
            prog['status'] = 'xong'
            prog['so_ca'] = len(included_rows)
            job['files'].append({'ten': filename, 'duong_dan': output_path,
                                  'loai': 'xlsm', 'xa': xa})
            for r in included_rows:
                exported_ma.append(r['ma_ho_so'])
                ke_records.append((r, True, filename))
            _log(job, f"Xã {xa}: xong — {len(included_rows)} ca -> {filename}")
        else:
            prog['status'] = 'loi'
            had_error = True
            err_tail = (result.stderr or '').strip()[-800:]
            prog['loi'] = err_tail
            _log(job, f"Xã {xa}: LỖI — {err_tail}")
            for r in included_rows:
                ke_records.append((r, False, None))
        _save_job(job)

    _log(job, 'Đang tạo file kê ...')
    file_ke_path = os.path.join(job['job_dir'], 'file_ke.xlsx')
    _write_file_ke(ke_records, file_ke_path)
    job['files'].append({'ten': 'file_ke.xlsx', 'duong_dan': file_ke_path,
                          'loai': 'file_ke'})
    _save_job(job)

    if exported_ma:
        conn = db.get_connection()
        try:
            now = datetime.datetime.now().strftime('%Y-%m-%d %H:%M:%S')
            for ma in exported_ma:
                old = conn.execute('SELECT da_xuat_file FROM ho_so WHERE ma_ho_so=?',
                                    (ma,)).fetchone()
                conn.execute(
                    'UPDATE ho_so SET da_xuat_file=1, lan_xuat_cuoi=? WHERE ma_ho_so=?',
                    (now, ma))
                conn.execute(
                    'INSERT INTO nhat_ky(ma_ho_so, nguoi_dung_id, ten_truong, '
                    'gia_tri_cu, gia_tri_moi) VALUES (?,?,?,?,?)',
                    (ma, job['admin_id'], 'da_xuat_file',
                     str(old['da_xuat_file']) if old else '0', '1'))
            conn.commit()
        finally:
            conn.close()
        _log(job, f'Đã cập nhật da_xuat_file cho {len(exported_ma)} hồ sơ')

    job['status'] = 'error' if had_error else 'done'
    job['finished_at'] = datetime.datetime.now().isoformat()
    _log(job, 'Hoàn tất — có lỗi ở một số xã, xem log.' if had_error else 'Hoàn tất.')
    _save_job(job)


def _write_file_ke(records, path):
    """File kê .xlsx (§7.2/§7 mục 10) — workbook THƯỜNG (không phải file
    nộp Bộ), liệt kê MỌI hồ sơ trong lô + cờ còn lại + đã đưa vào file hay
    bị loại + tên file .xlsm chứa nó."""
    import openpyxl
    from openpyxl.styles import Font, PatternFill

    wb = openpyxl.Workbook()
    ws = wb.active
    ws.title = 'Kê danh sách xuất'
    headers = ['Mã hồ sơ', 'Họ tên', 'Xã/phường', 'Trạng thái', 'Cờ còn lại',
               'Kết quả', 'Tên file .xlsm']
    for c, h in enumerate(headers, 1):
        cell = ws.cell(1, c, h)
        cell.font = Font(bold=True)
        cell.fill = PatternFill('solid', fgColor='DDEBF7')
    r = 2
    for row, included, filename in records:
        ws.cell(r, 1, row['ma_ho_so'])
        ws.cell(r, 2, row['ho_ten'])
        ws.cell(r, 3, row['maxa_cu_tru'])
        ws.cell(r, 4, TRANG_THAI_NHAN.get(row['trang_thai'], row['trang_thai']))
        ws.cell(r, 5, row['co_qc'] or '')
        ws.cell(r, 6, 'Đã đưa vào file' if included else 'Bị loại (còn cờ 🔴)')
        ws.cell(r, 7, filename or '')
        r += 1
    for col, w in zip('ABCDEFG', (20, 24, 20, 18, 40, 20, 30)):
        ws.column_dimensions[col].width = w
    wb.save(path)
    wb.close()


def get_job(job_id):
    with _JOBS_LOCK:
        if job_id in _JOBS:
            return _JOBS[job_id]
    path = os.path.join(EXPORTS_DIR, job_id, 'job.json')
    if os.path.isfile(path):
        with open(path, encoding='utf-8') as f:
            return json.load(f)
    return None


def list_jobs():
    out = []
    if os.path.isdir(EXPORTS_DIR):
        for name in sorted(os.listdir(EXPORTS_DIR), reverse=True):
            if not os.path.isdir(os.path.join(EXPORTS_DIR, name)):
                continue
            job = get_job(name)
            if job:
                out.append(job)
    return out
