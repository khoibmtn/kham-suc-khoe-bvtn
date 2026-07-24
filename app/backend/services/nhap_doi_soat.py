# -*- coding: utf-8 -*-
"""
nhap_doi_soat.py — Nhập lại file .xlsx đã chỉnh sửa (xuất từ nút "Xuất để chỉnh
sửa & nhập lại"), đối soát với DB:

- Match từng dòng theo cột MÃ ĐỊNH DANH (ma_ho_so) — KHÔNG theo họ tên/CCCD
  (các trường này có thể bị sửa nên không tin cậy để định danh).
- So sánh từng trường sửa được (patchable) của bảng ho_so:
    * BỔ SUNG: DB đang trống -> file có giá trị.
    * GHI ĐÈ : DB có giá trị -> file khác giá trị.
    * Ô trong file để TRỐNG -> BỎ QUA (không bao giờ xóa dữ liệu cũ).
- 2 chế độ: xem trước (apply=False, không ghi gì) / áp dụng (apply=True; bổ sung
  luôn được ghi, ghi đè chỉ ghi khi cho_ghi_de=True).
- Khi ghi: chuẩn hoá số + kiểm ngưỡng sinh hiệu, ghi nhat_ky, tính lại BMI /
  phân loại thể lực / cờ CCCD — hệt PATCH thủ công.
"""
import io
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from services import export_xlsm, sinh_hieu_valid, qc, the_luc  # noqa: E402

# Trường KHÔNG cho nhập lại (khóa/định danh/quản lý rà soát/tự tính).
MANAGED = {
    'ma_ho_so', 'tt', 'nguoi_ra_soat_id', 'trang_thai', 'co_qc', 'so_loi',
    'thoi_diem_hoan_thanh', 'da_xuat_file', 'lan_xuat_cuoi', 'chan_doan_goc',
    'ho_ten_kd', 'search_blob_kd', 'chi_so_bmi',
    'rs_hanh_chinh', 'rs_sinh_ton', 'rs_the_luc', 'rs_canh_bao_khac',
}


def _patchable(conn):
    cols = [r['name'] for r in conn.execute('PRAGMA table_info(ho_so)')]
    return set(cols) - MANAGED


def _norm(v):
    if v is None:
        return ''
    if isinstance(v, float) and v.is_integer():
        v = int(v)
    return str(v).strip()


def _recompute_bmi(cao, can):
    try:
        cao_f, can_f = float(cao), float(can)
        if cao_f > 0:
            return round(can_f / ((cao_f / 100) ** 2), 2)
    except (TypeError, ValueError):
        pass
    return None


def _read_sheet(file_bytes):
    import openpyxl
    wb = openpyxl.load_workbook(io.BytesIO(file_bytes), read_only=True,
                                data_only=True)
    ws = wb['Trên 18'] if 'Trên 18' in wb.sheetnames else wb[wb.sheetnames[0]]
    rows = [list(r) for r in ws.iter_rows(values_only=True)]
    wb.close()
    return rows


def doi_soat(conn, file_bytes, apply=False, cho_ghi_de=False, user_id=None):
    rows = _read_sheet(file_bytes)
    if len(rows) < 4:
        raise ValueError('File không đúng định dạng (cần 3 dòng tiêu đề + dữ liệu).')

    label_row, code_row = rows[0], rows[1]
    code_by_col = {ci: str(c).strip() for ci, c in enumerate(code_row) if c not in (None, '')}
    label_by_col = {ci: (str(label_row[ci]).strip() if ci < len(label_row) and label_row[ci] else code_by_col[ci])
                    for ci in code_by_col}
    id_col = next((ci for ci, c in code_by_col.items() if c == export_xlsm.ID_COL_CODE), None)
    if id_col is None:
        raise ValueError('File thiếu cột MÃ ĐỊNH DANH — hãy xuất bằng nút '
                         '"Xuất để chỉnh sửa & nhập lại".')

    patch = _patchable(conn)
    col_field = {ci: c.lower() for ci, c in code_by_col.items()
                 if ci != id_col and c.lower() in patch}
    if not col_field:
        raise ValueError('Không có cột dữ liệu nào hợp lệ để nhập.')

    nguong = sinh_hieu_valid.load_nguong(conn)

    tong = so_khop = so_khong_khop = so_bo_sung = so_ghi_de = 0
    da_ghi_bo_sung = da_ghi_ghi_de = 0
    khong_khop = []          # danh sách ma_ho_so không tìm thấy
    chi_tiet = []            # mẫu preview (giới hạn)
    loi_validate = []        # lỗi ngưỡng khi áp dụng
    SAMPLE = 200

    for r in rows[3:]:
        if not r or id_col >= len(r):
            continue
        ma = _norm(r[id_col])
        if not ma:
            continue
        tong += 1
        db_row = conn.execute('SELECT * FROM ho_so WHERE ma_ho_so=?', (ma,)).fetchone()
        if not db_row:
            so_khong_khop += 1
            if len(khong_khop) < 50:
                khong_khop.append(ma)
            continue
        so_khop += 1

        changes = []         # {field, nhan, cu, moi, loai}
        for ci, field in col_field.items():
            if ci >= len(r):
                continue
            up = r[ci]
            up_s = _norm(up)
            if up_s == '':
                continue                       # ô trống -> bỏ qua (không xóa)
            db_s = _norm(db_row[field] if field in db_row.keys() else None)
            if up_s == db_s:
                continue
            loai = 'bo_sung' if db_s == '' else 'ghi_de'
            changes.append({'field': field, 'nhan': label_by_col.get(ci, field),
                            'cu': db_s, 'moi': up_s, 'loai': loai})
        if not changes:
            continue
        so_bo_sung += sum(1 for c in changes if c['loai'] == 'bo_sung')
        so_ghi_de += sum(1 for c in changes if c['loai'] == 'ghi_de')
        if len(chi_tiet) < SAMPLE:
            chi_tiet.append({'ma_ho_so': ma, 'ho_ten': _norm(db_row['ho_ten']),
                             'changes': changes})

        if apply:
            da_bs, da_gd = _apply_row(conn, ma, db_row, changes, cho_ghi_de,
                                      nguong, user_id, loi_validate)
            da_ghi_bo_sung += da_bs
            da_ghi_ghi_de += da_gd

    if apply:
        conn.commit()

    return {
        'apply': apply,
        'tong_dong': tong,
        'so_khop': so_khop,
        'so_khong_khop': so_khong_khop,
        'khong_khop': khong_khop,
        'so_bo_sung': so_bo_sung,
        'so_ghi_de': so_ghi_de,
        'da_ghi_bo_sung': da_ghi_bo_sung,
        'da_ghi_ghi_de': da_ghi_ghi_de,
        'loi_validate': loi_validate[:50],
        'chi_tiet': chi_tiet,
    }


def _apply_row(conn, ma, db_row, changes, cho_ghi_de, nguong, user_id, loi_out):
    """Ghi các thay đổi được phép của 1 hồ sơ. Trả (số bổ sung, số ghi đè)."""
    apply_changes = [c for c in changes
                     if c['loai'] == 'bo_sung' or (c['loai'] == 'ghi_de' and cho_ghi_de)]
    if not apply_changes:
        return 0, 0
    field_moi = {c['field']: c['moi'] for c in apply_changes}

    # Chuẩn hoá số + kiểm ngưỡng sinh hiệu (giống PATCH). Lỗi -> loại field đó.
    field_moi, loi1 = sinh_hieu_valid.normalize_numeric_changes(field_moi)
    field_moi, loi2 = sinh_hieu_valid.validate_changes(field_moi, nguong)
    for e in (loi1 or []) + (loi2 or []):
        loi_out.append({'ma_ho_so': ma, 'ly_do': e.get('ly_do', str(e))})
    if not field_moi:
        return 0, 0

    old_cccd = db_row['so_cccd'] if 'so_cccd' in db_row.keys() else None
    # BMI tự tính khi chiều cao/cân nặng đổi
    if 'chieu_cao' in field_moi or 'can_nang' in field_moi:
        cao = field_moi.get('chieu_cao', db_row['chieu_cao'])
        can = field_moi.get('can_nang', db_row['can_nang'])
        field_moi['chi_so_bmi'] = _recompute_bmi(cao, can)

    set_clauses, args, applied = [], [], []
    for field, moi in field_moi.items():
        old = db_row[field] if field in db_row.keys() else None
        set_clauses.append(f'{field} = ?')
        args.append(moi)
        conn.execute(
            'INSERT INTO nhat_ky(ma_ho_so, nguoi_dung_id, ten_truong, '
            'gia_tri_cu, gia_tri_moi) VALUES (?,?,?,?,?)',
            (ma, user_id, field, '' if old is None else str(old),
             '' if moi is None else str(moi)))
        applied.append(field)
    if set_clauses:
        args.append(ma)
        conn.execute(f'UPDATE ho_so SET {", ".join(set_clauses)} WHERE ma_ho_so=?', args)

    if 'so_cccd' in field_moi:
        qc.recompute_cccd_flags(conn, ma, old_cccd, field_moi['so_cccd'], user_id)
    if 'chieu_cao' in field_moi or 'can_nang' in field_moi:
        the_luc.tinh_va_ap_pl(conn, ma, user_id)

    # đếm theo phân loại gốc (áp dụng)
    fields_applied = set(applied)
    bs = sum(1 for c in apply_changes if c['loai'] == 'bo_sung' and c['field'] in fields_applied)
    gd = sum(1 for c in apply_changes if c['loai'] == 'ghi_de' and c['field'] in fields_applied)
    return bs, gd
