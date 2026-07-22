# -*- coding: utf-8 -*-
"""
doi_ten_xa_phuong.py — script IDEMPOTENT đổi tên đơn vị hành chính theo sắp
xếp 2025 (PLAN4.md Workstream A, mục 1).

Thực tế: sau sắp xếp 2025, chỉ "Việt Khê" còn là Xã, các đơn vị còn lại đều
là Phường. DB hiện có 3 tên sai (còn ghi 'Xã'): Xã Lê Ích Mộc, Xã Lưu Kiếm,
Xã Nam Triệu — cần đổi thành Phường Lê Ích Mộc, Phường Lưu Kiếm, Phường Nam
Triệu. Xã Việt Khê giữ nguyên.

Việc script làm:
  1. UPDATE ho_so.maxa_cu_tru theo mapping config.XA_DOI_TEN.
  2. UPDATE phan_cong.pham_vi_gia_tri (pham_vi_loai='xa') — giá trị có thể là
     danh sách tên ngăn cách dấu phẩy (vd 'Xã Nam Triệu,Xã Việt Khê') nên
     thay thế an toàn theo TỪNG PHẦN tách bằng dấu phẩy, không substring
     thay thế trên toàn chuỗi (tránh làm hỏng tên khác vô tình chứa chuỗi
     con trùng).
  3. In bảng đối chiếu trước/sau GROUP BY maxa_cu_tru + kiểm tra đúng 8 tên
     mới với số lượng kỳ vọng — thoát mã khác 0 nếu sai lệch.

IDEMPOTENT: chạy lại nhiều lần không đổi kết quả (mapping chỉ khớp tên CŨ;
chạy lần 2 không còn tên cũ để khớp nên không có gì thay đổi).

Chạy: app/.venv/bin/python backend/scripts/doi_ten_xa_phuong.py
(hoặc từ trong app/: .venv/bin/python backend/scripts/doi_ten_xa_phuong.py)
"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
import config  # noqa: E402
import db  # noqa: E402

EXPECTED = {
    'Phường Thủy Nguyên': 2246,
    'Phường Lê Ích Mộc': 1873,
    'Phường Lưu Kiếm': 1749,
    'Phường Bạch Đằng': 1666,
    'Phường Thiên Hương': 1580,
    'Phường Hòa Bình': 1528,
    'Xã Việt Khê': 1366,
    'Phường Nam Triệu': 1318,
}


def snapshot_ho_so(conn):
    rows = conn.execute(
        'SELECT maxa_cu_tru, COUNT(*) c FROM ho_so GROUP BY maxa_cu_tru '
        'ORDER BY c DESC').fetchall()
    return {r['maxa_cu_tru']: r['c'] for r in rows}


def update_ho_so(conn):
    """Bước 1: UPDATE ho_so.maxa_cu_tru theo mapping."""
    n_total = 0
    for cu, moi in config.XA_DOI_TEN.items():
        n = conn.execute('UPDATE ho_so SET maxa_cu_tru=? WHERE maxa_cu_tru=?',
                          (moi, cu)).rowcount
        n_total += n
        print(f'[1] ho_so: {cu!r} -> {moi!r}: {n} dòng')
    conn.commit()
    return n_total


def update_phan_cong(conn):
    """Bước 2: UPDATE phan_cong.pham_vi_gia_tri (pham_vi_loai='xa') — thay
    thế AN TOÀN theo từng phần tách dấu phẩy (không substring trên cả
    chuỗi)."""
    rows = conn.execute(
        "SELECT id, pham_vi_gia_tri FROM phan_cong WHERE pham_vi_loai='xa'").fetchall()
    n_changed = 0
    for r in rows:
        parts = [p.strip() for p in r['pham_vi_gia_tri'].split(',')]
        new_parts = [config.XA_DOI_TEN.get(p, p) for p in parts]
        new_val = ','.join(new_parts)
        if new_val != r['pham_vi_gia_tri']:
            conn.execute('UPDATE phan_cong SET pham_vi_gia_tri=? WHERE id=?',
                          (new_val, r['id']))
            print(f"[2] phan_cong id={r['id']}: {r['pham_vi_gia_tri']!r} -> {new_val!r}")
            n_changed += 1
    conn.commit()
    print(f'[2] Đổi {n_changed}/{len(rows)} dòng phan_cong (pham_vi_loai=xa)')
    return n_changed


def print_table(before, after):
    keys = sorted(set(before) | set(after) | set(EXPECTED),
                   key=lambda k: -after.get(k, before.get(k, 0)))
    print()
    print(f'{"Xã/Phường":25s} {"Trước":>8s} {"Sau":>8s} {"Kỳ vọng":>8s} {"OK?":>5s}')
    print('-' * 60)
    all_ok = True
    for k in keys:
        b = before.get(k, 0)
        a = after.get(k, 0)
        exp = EXPECTED.get(k)
        ok = (exp is None) or (a == exp)
        all_ok = all_ok and ok
        print(f'{k:25s} {b:>8d} {a:>8d} {"" if exp is None else exp:>8} '
              f'{"OK" if ok else "SAI":>5s}')
    print('-' * 60)
    # Kiểm tra thêm: đúng 8 tên, không còn tên cũ nào sót lại.
    ten_cu_con_sot = [k for k in after if k in config.XA_DOI_TEN]
    if ten_cu_con_sot:
        print(f'*** CÒN SÓT TÊN CŨ: {ten_cu_con_sot} ***')
        all_ok = False
    if set(after) != set(EXPECTED):
        print(f'*** SỐ LƯỢNG TÊN KHÔNG KHỚP: có {sorted(after)}, '
              f'kỳ vọng {sorted(EXPECTED)} ***')
        all_ok = False
    return all_ok


def main():
    conn = db.get_connection()
    try:
        print(f'Đang đổi tên xã/phường trên: {config.DB_PATH}')
        before = snapshot_ho_so(conn)

        update_ho_so(conn)
        update_phan_cong(conn)

        after = snapshot_ho_so(conn)
        all_ok = print_table(before, after)
    finally:
        conn.close()

    if not all_ok:
        print('\n*** THẤT BẠI: có chỉ số không khớp kỳ vọng — xem bảng trên. ***')
        sys.exit(1)
    print('\nOK: mọi chỉ số khớp kỳ vọng (PLAN4.md Workstream A).')


if __name__ == '__main__':
    main()
