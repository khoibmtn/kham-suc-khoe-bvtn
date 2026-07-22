# -*- coding: utf-8 -*-
"""
don_dep_du_lieu_test.py — script MỘT LẦN dọn dữ liệu test về baseline gốc
(PLAN2.md Nhóm 1, mục 5). CHỈ CHẠY MỘT LẦN sau đợt kiểm thử máy đầu tiên
(2026-07-22 — tạo bởi phiên kiểm thử API tự động lên các hồ sơ mẫu
00001..00004, 00614, 00700, 01236 + đợt xuất thử xã Nam Triệu).

KHÔNG chạy lại sau khi cán bộ đã bắt đầu rà soát thật — script này hoàn
nguyên MỌI trường ho_so theo gia_tri_cu SỚM NHẤT ghi trong nhat_ky, nên nếu
chạy lại sau khi có sửa đổi thật, nó sẽ xóa nhầm các sửa đổi đó.

Chạy: app/.venv/bin/python backend/scripts/don_dep_du_lieu_test.py
(hoặc từ trong app/: .venv/bin/python backend/scripts/don_dep_du_lieu_test.py)

Việc script làm (theo đúng thứ tự):
  1. Hoàn nguyên mọi trường ho_so THỰC (cột có trong schema) xuất hiện trong
     nhat_ky về gia_tri_cu của dòng nhat_ky ĐẦU TIÊN (MIN(id)) cho mỗi cặp
     (ma_ho_so, ten_truong) — trừ các trường TÍNH LẠI (chi_so_bmi, co_qc,
     so_loi) và trường xử lý riêng (da_xuat_file/lan_xuat_cuoi).
  2. Xóa (các) dòng bệnh test đã thêm (nhat_ky ten_truong='benh:add:<id>').
  3. Đồng bộ lại benh.la_benh_chinh cho hồ sơ có ma_benh_chinh vừa hoàn
     nguyên (khớp ma_icd).
  4. Reset da_xuat_file=0, lan_xuat_cuoi=NULL cho TOÀN BỘ ho_so (đợt xuất
     Nam Triệu là xuất thử).
  5. Tính lại chi_so_bmi + cờ THIEU_SINH_HIEU/THIEU_CCCD + so_loi cho các
     ho_so bị ảnh hưởng ở bước 1 (dùng lại services/qc.py, services/the_luc.py).
  6. Xóa các dòng nhat_ky thuộc về các thao tác test này (đã hoàn nguyên ở
     bước 1, benh:add:* ở bước 2, xac_nhan_suy:* liên quan).
  7. In bảng đối chiếu trước/sau + kiểm tra đúng 8 số liệu kỳ vọng
     (PLAN2.md §8.6) — thoát mã khác 0 nếu bất kỳ số nào sai lệch.
"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
import config  # noqa: E402
import db  # noqa: E402
from services import qc, the_luc  # noqa: E402

# Trường KHÔNG hoàn nguyên trực tiếp theo nhat_ky.gia_tri_cu — được TÍNH LẠI
# ở bước riêng (chi_so_bmi/co_qc/so_loi) hoặc RESET ĐỒNG LOẠT riêng
# (da_xuat_file/lan_xuat_cuoi), theo đúng PLAN2.md mục 5.
COMPUTED_FIELDS = {'chi_so_bmi', 'co_qc', 'so_loi'}
SEPARATE_RESET_FIELDS = {'da_xuat_file', 'lan_xuat_cuoi'}

EXPECTED = {
    'ho_so': 13326,
    'benh': 39645,
    'pl_1': 1, 'pl_2': 421, 'pl_3': 2012, 'pl_4': 5651, 'pl_5': 5241,
    'ma_benh_chinh_empty': 139,
    'so_cccd_empty': 1654,
    'qd1613_violations': 138,
    'thieu_sinh_hieu': 13326,
    'da_xuat_file_1': 0,
}


def _real_ho_so_cols(conn):
    """{ten_cot: kieu_sql} cho toàn bộ cột thật của bảng ho_so."""
    return {r['name']: r['type'] for r in conn.execute('PRAGMA table_info(ho_so)')}


def _coerce(raw, sql_type):
    """nhat_ky lưu mọi giá trị dạng TEXT, '' là quy ước cho NULL (đúng cách
    build_import.py nạp — không dùng chuỗi rỗng cho ô trống, luôn NULL —
    kiểm chứng thực tế trên DB: mọi cột trống đều là NULL, không có '')."""
    if raw is None or raw == '':
        return None
    if sql_type == 'REAL':
        try:
            return float(raw)
        except ValueError:
            return raw
    if sql_type == 'INTEGER':
        try:
            return int(float(raw))
        except ValueError:
            return raw
    return raw


def restore_fields(conn):
    """Bước 1: hoàn nguyên các trường ho_so thật theo gia_tri_cu ĐẦU TIÊN.

    Trả (affected: set[ma_ho_so], restored_ma_benh_chinh: dict[ma_ho_so->str|None],
    pairs: list[Row] — TOÀN BỘ cặp (ma_ho_so, ten_truong) xét tới, dùng lại ở
    bước xóa nhat_ky)."""
    cols = _real_ho_so_cols(conn)
    pairs = conn.execute(
        "SELECT ma_ho_so, ten_truong, MIN(id) AS first_id FROM nhat_ky "
        "WHERE ten_truong NOT LIKE 'benh:%' AND ten_truong NOT LIKE 'xac_nhan_suy:%' "
        'GROUP BY ma_ho_so, ten_truong').fetchall()

    affected = set()
    restored_ma_benh_chinh = {}
    n_restored = 0
    for p in pairs:
        field = p['ten_truong']
        if field not in cols or field in COMPUTED_FIELDS or field in SEPARATE_RESET_FIELDS:
            continue
        first = conn.execute('SELECT gia_tri_cu FROM nhat_ky WHERE id=?',
                              (p['first_id'],)).fetchone()
        val = _coerce(first['gia_tri_cu'], cols[field])
        conn.execute(f'UPDATE ho_so SET {field} = ? WHERE ma_ho_so = ?',
                     (val, p['ma_ho_so']))
        affected.add(p['ma_ho_so'])
        n_restored += 1
        if field == 'ma_benh_chinh':
            restored_ma_benh_chinh[p['ma_ho_so']] = val
        if field == 'trang_thai' and val != 'hoan_thanh':
            # hồ sơ không còn "hoàn thành" -> mốc thời điểm hoàn thành cũng
            # không còn ý nghĩa (trường này không tự có trong nhat_ky).
            conn.execute('UPDATE ho_so SET thoi_diem_hoan_thanh=NULL WHERE ma_ho_so=?',
                         (p['ma_ho_so'],))
    conn.commit()
    print(f'[1] Hoàn nguyên {n_restored} trường trên {len(affected)} hồ sơ: '
          f'{sorted(affected)}')
    return affected, restored_ma_benh_chinh, pairs


def delete_test_benh(conn):
    """Bước 2: xóa (các) dòng bệnh test đã thêm (nhat_ky 'benh:add:<id>')."""
    rows = conn.execute(
        "SELECT ma_ho_so, ten_truong FROM nhat_ky WHERE ten_truong LIKE 'benh:add:%'").fetchall()
    deleted = []
    for r in rows:
        try:
            benh_id = int(r['ten_truong'].rsplit(':', 1)[-1])
        except ValueError:
            continue
        if conn.execute('SELECT 1 FROM benh WHERE id=?', (benh_id,)).fetchone():
            conn.execute('DELETE FROM benh WHERE id=?', (benh_id,))
            deleted.append((r['ma_ho_so'], benh_id))
    conn.commit()
    print(f'[2] Xóa {len(deleted)} dòng bệnh test: {deleted}')
    return deleted


def sync_la_benh_chinh(conn, restored_ma_benh_chinh):
    """Bước 3: sau khi ho_so.ma_benh_chinh hoàn nguyên, đồng bộ lại cờ
    benh.la_benh_chinh cho đúng dòng bệnh khớp mã (set_benh_chinh() lúc test
    đã đổi la_benh_chinh sang dòng test, không tự phục hồi lúc xóa dòng đó)."""
    n = 0
    for ma_ho_so, ma_icd in restored_ma_benh_chinh.items():
        if ma_icd:
            conn.execute(
                'UPDATE benh SET la_benh_chinh = CASE WHEN ma_icd=? THEN 1 ELSE 0 END '
                'WHERE ma_ho_so=?', (ma_icd, ma_ho_so))
        else:
            conn.execute('UPDATE benh SET la_benh_chinh=0 WHERE ma_ho_so=?', (ma_ho_so,))
        n += 1
    conn.commit()
    print(f'[3] Đồng bộ la_benh_chinh cho {n} hồ sơ: {sorted(restored_ma_benh_chinh)}')


def reset_xuat_file(conn):
    """Bước 4: đợt xuất Nam Triệu là xuất thử — reset TOÀN BỘ."""
    n = conn.execute('UPDATE ho_so SET da_xuat_file=0, lan_xuat_cuoi=NULL').rowcount
    conn.commit()
    print(f'[4] Reset da_xuat_file=0, lan_xuat_cuoi=NULL cho {n} hồ sơ')


def recompute_qc(conn, affected):
    """Bước 5: tính lại chi_so_bmi + THIEU_SINH_HIEU + THIEU_CCCD + so_loi
    CHỈ cho các hồ sơ bị ảnh hưởng ở bước 1 (không đụng cờ của hồ sơ khác —
    các cờ khác như CCCD_TRUNG/ICD_KHONG_DAC_HIEU... cần logic nạp gốc, KHÔNG
    tái tạo được chỉ từ giá trị hiện tại của ho_so)."""
    for ma in sorted(affected):
        row = conn.execute('SELECT * FROM ho_so WHERE ma_ho_so=?', (ma,)).fetchone()
        if row is None:
            continue
        new_bmi = the_luc.bmi(row['chieu_cao'], row['can_nang'])
        if new_bmi != row['chi_so_bmi']:
            conn.execute('UPDATE ho_so SET chi_so_bmi=? WHERE ma_ho_so=?', (new_bmi, ma))

        du_sinh_hieu = all(
            row[c] not in (None, '') for c in ('chieu_cao', 'can_nang', 'mach', 'huyet_ap'))
        if du_sinh_hieu:
            qc.remove_flags(conn, ma, ['THIEU_SINH_HIEU'])
        else:
            qc.add_flag(conn, ma, 'THIEU_SINH_HIEU')

        if row['so_cccd']:
            qc.remove_flags(conn, ma, ['THIEU_CCCD'])
        else:
            qc.add_flag(conn, ma, 'THIEU_CCCD')
    conn.commit()
    print(f'[5] Tính lại chi_so_bmi/co_qc/so_loi cho {len(affected)} hồ sơ')


def cleanup_nhat_ky(conn, pairs):
    """Bước 6: xóa các dòng nhat_ky đã "dùng xong" (đã hoàn nguyên/xử lý)."""
    ids = set()
    for p in pairs:
        rows = conn.execute(
            'SELECT id FROM nhat_ky WHERE ma_ho_so=? AND ten_truong=?',
            (p['ma_ho_so'], p['ten_truong'])).fetchall()
        ids.update(r['id'] for r in rows)
    for pattern in ("benh:%", "xac_nhan_suy:%"):
        rows = conn.execute('SELECT id FROM nhat_ky WHERE ten_truong LIKE ?',
                             (pattern,)).fetchall()
        ids.update(r['id'] for r in rows)
    if ids:
        conn.executemany('DELETE FROM nhat_ky WHERE id=?', [(i,) for i in ids])
    conn.commit()
    con_lai = conn.execute('SELECT COUNT(*) FROM nhat_ky').fetchone()[0]
    print(f'[6] Xóa {len(ids)} dòng nhat_ky test. Còn lại trong bảng: {con_lai}')


def snapshot(conn):
    def cnt(sql, args=()):
        return conn.execute(sql, args).fetchone()[0]

    out = {
        'ho_so': cnt('SELECT COUNT(*) FROM ho_so'),
        'benh': cnt('SELECT COUNT(*) FROM benh'),
        'ma_benh_chinh_empty': cnt(
            "SELECT COUNT(*) FROM ho_so WHERE ma_benh_chinh IS NULL OR ma_benh_chinh=''"),
        'so_cccd_empty': cnt("SELECT COUNT(*) FROM ho_so WHERE so_cccd IS NULL OR so_cccd=''"),
        'thieu_sinh_hieu': cnt(
            "SELECT COUNT(*) FROM ho_so WHERE (';'||co_qc||';') LIKE '%;THIEU_SINH_HIEU;%'"),
        'da_xuat_file_1': cnt('SELECT COUNT(*) FROM ho_so WHERE da_xuat_file=1'),
    }
    for pl in range(1, 6):
        out[f'pl_{pl}'] = cnt('SELECT COUNT(*) FROM ho_so WHERE phan_loai_sk=?', (pl,))

    n_vi_pham = 0
    for r in conn.execute('SELECT * FROM ho_so'):
        if qc.check_invariant(r)['vi_pham']:
            n_vi_pham += 1
    out['qd1613_violations'] = n_vi_pham
    return out


def print_table(before, after):
    keys = ['ho_so', 'benh', 'pl_1', 'pl_2', 'pl_3', 'pl_4', 'pl_5',
            'ma_benh_chinh_empty', 'so_cccd_empty', 'qd1613_violations',
            'thieu_sinh_hieu', 'da_xuat_file_1']
    print()
    print(f'{"Chỉ số":30s} {"Trước":>10s} {"Sau":>10s} {"Kỳ vọng":>10s} {"OK?":>5s}')
    print('-' * 70)
    all_ok = True
    for k in keys:
        exp = EXPECTED.get(k)
        ok = (exp is None) or (after[k] == exp)
        all_ok = all_ok and ok
        print(f'{k:30s} {before[k]:>10d} {after[k]:>10d} '
              f'{"" if exp is None else exp:>10} {"OK" if ok else "SAI":>5s}')
    print('-' * 70)
    return all_ok


def main():
    conn = db.get_connection()
    try:
        print(f'Đang dọn dữ liệu test trên: {config.DB_PATH}')
        before = snapshot(conn)

        affected, restored_ma_benh_chinh, pairs = restore_fields(conn)
        delete_test_benh(conn)
        sync_la_benh_chinh(conn, restored_ma_benh_chinh)
        reset_xuat_file(conn)
        recompute_qc(conn, affected)
        cleanup_nhat_ky(conn, pairs)

        after = snapshot(conn)
        all_ok = print_table(before, after)
    finally:
        conn.close()

    if not all_ok:
        print('\n*** THẤT BẠI: có chỉ số không khớp kỳ vọng — xem bảng trên. ***')
        sys.exit(1)
    print('\nOK: mọi chỉ số khớp kỳ vọng (PLAN2.md §8.6).')


if __name__ == '__main__':
    main()
