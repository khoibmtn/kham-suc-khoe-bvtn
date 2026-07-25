# -*- coding: utf-8 -*-
"""
services/batch_sinh_hieu.py — rà soát TOÀN BỘ DB theo Chỉ số sinh tồn, chỉ
NÂNG/ĐIỀN CHỖ TRỐNG (không bao giờ hạ / xoá / ghi đè dữ liệu sẵn có hoặc do
nhân viên tự chỉnh tay):

  0) Điền BMI + Phân loại thể lực còn TRỐNG khi đã có đủ chiều cao + cân
     nặng — dữ liệu nạp ban đầu (import_data.py) KHÔNG tự tính 2 giá trị
     này (chỉ tính khi ai đó sửa tay qua form chi tiết/màn Sinh hiệu). CHỈ
     điền khi đang TRỐNG — không đụng giá trị đã có.
  1) Phân loại CSST (Mạch + Huyết áp theo băng tuổi, QĐ1613 mục 45/46) ->
     NÂNG cơ quan Tuần hoàn (noi_khoa_tuan_hoan_pl) nếu đang thấp hơn.
  2) Tự thêm bệnh chính theo sinh hiệu (HA cao->I10, mạch nhanh->R00.0,
     mạch chậm->R00.1) khi hồ sơ CHƯA có bệnh chính; gỡ cờ đỏ
     'CO_PHAN_LOAI_NHUNG_KHONG_CO_CHAN_DOAN'.
  3) NÂNG Phân loại sức khỏe chung (phan_loai_sk) lên bằng cơ quan nặng nhất
     (bất biến QĐ1613 §6.1) — chỉ nâng, KHÔNG hạ.

Idempotent: chạy lại không đổi gì thêm. Dùng chung bởi:
  - scripts/batch_sinh_hieu.py (CLI, chạy tay/cron)
  - routers/cai_dat.py POST /api/admin/ra-soat-sinh-hieu (nút bấm trong app,
    Cài đặt -> admin có thể chạy từ XA qua tunnel, không cần CMD trên máy
    server)."""
import re

from services import qc, the_luc
from routers.benh import chan_doan_tu_sinh_hieu


def _tuoi(row):
    t = row['tuoi']
    if t not in (None, ''):
        try:
            t = int(t)
            if t > 0:
                return t
        except (ValueError, TypeError):
            pass
    m = re.search(r'(\d{4})$', str(row['ngay_sinh'] or ''))
    if m:
        nam = int(m.group(1))
        if nam > 1900:
            import datetime
            return datetime.date.today().year - nam
    return None


def _mach_bpm(s):
    try:
        return float(str(s or '').replace(',', '.'))
    except ValueError:
        return None


def classify_mach(bpm):
    if bpm is None or bpm <= 0:
        return None
    if bpm < 55:
        return 4
    if bpm <= 59:
        return 3
    if bpm <= 75:
        return 1
    if bpm <= 85:
        return 2
    if bpm <= 95:
        return 3
    return 4


def _cls_sys(sys_val, tuoi):
    if tuoi is not None and tuoi < 30:      # 45.1 (<30t)
        if sys_val < 100:
            return 4
        if sys_val <= 125:
            return 1
        if sys_val <= 135:
            return 2
        if sys_val <= 140:
            return 3
        return 4
    if sys_val < 140:                        # 45.2 (>=30t)
        return 1
    if sys_val <= 150:
        return 3
    return 4


def _cls_dia(dia, tuoi):
    if tuoi is not None and tuoi < 30:       # 45.1
        if dia < 60:
            return 4
        if dia <= 64:
            return 2
        if dia <= 85:
            return 1
        if dia <= 89:
            return 2
        if dia <= 95:
            return 3
        return 4
    if dia < 90:                             # 45.2
        return 1
    if dia <= 95:
        return 3
    return 4


def _parse_ha(s):
    m = re.search(r'(\d{2,3})\s*[/\-]\s*(\d{2,3})', s or '')
    return (int(m.group(1)), int(m.group(2))) if m else (None, None)


def classify_huyet_ap(ha, tuoi):
    sys_val, dia = _parse_ha(ha)
    if sys_val is None:
        return None, sys_val, dia
    return max(_cls_sys(sys_val, tuoi), _cls_dia(dia, tuoi)), sys_val, dia


def _resolve_icd(conn, ma_icd):
    row = conn.execute('SELECT ma, ten FROM dm_icd WHERE ma=?', (ma_icd,)).fetchone()
    return (row['ma'], row['ten']) if row else (None, None)


def chay(conn, apply, nguoi_dung_id):
    """Chạy 1 lượt rà soát. `conn` do caller mở/đóng. `nguoi_dung_id` gắn vào
    nhat_ky (CLI dùng tài khoản 'admin'; endpoint dùng admin đang đăng nhập).
    Trả dict đếm — {'apply', 'tong_quet', 'dien_bmi', 'dien_pl_the_luc',
    'nang_tuan_hoan', 'them_benh_chinh', 'them_benh_chinh_theo_ma', 'go_co',
    'nang_suc_khoe_chung'}."""
    try:
        conn.execute('PRAGMA busy_timeout=15000')
    except Exception:
        pass

    def log(ma, field, cu, moi):
        conn.execute(
            'INSERT INTO nhat_ky(ma_ho_so, nguoi_dung_id, ten_truong, '
            'gia_tri_cu, gia_tri_moi) VALUES (?,?,?,?,?)',
            (ma, nguoi_dung_id, field, '' if cu is None else str(cu),
             '' if moi is None else str(moi)))

    rows = conn.execute(
        "SELECT * FROM ho_so WHERE (mach IS NOT NULL AND mach<>'') "
        "OR (huyet_ap IS NOT NULL AND huyet_ap<>'') "
        "OR (chieu_cao IS NOT NULL AND chieu_cao<>'' "
        "    AND can_nang IS NOT NULL AND can_nang<>'')").fetchall()

    n_bmi = n_plth = n_th = n_dx = n_sk = n_flag = 0
    dx_dem = {'I10': 0, 'R00.0': 0, 'R00.1': 0}
    done = 0
    for r in rows:
        if apply and done and done % 300 == 0:
            conn.commit()
        done += 1
        ma = r['ma_ho_so']
        tuoi = _tuoi(r)
        mach = _mach_bpm(r['mach'])
        l_mach = classify_mach(mach)
        l_ha, sys_val, dia = classify_huyet_ap(r['huyet_ap'], tuoi)

        # 0) Điền BMI + Phân loại thể lực còn TRỐNG.
        if r['chieu_cao'] not in (None, '') and r['can_nang'] not in (None, ''):
            if r['chi_so_bmi'] in (None, ''):
                bmi_moi = the_luc.bmi(r['chieu_cao'], r['can_nang'])
                if bmi_moi is not None:
                    if apply:
                        conn.execute('UPDATE ho_so SET chi_so_bmi=? '
                                     'WHERE ma_ho_so=?', (bmi_moi, ma))
                        log(ma, 'chi_so_bmi', None, bmi_moi)
                    n_bmi += 1
            if r['kham_the_luc_pl'] in (None, ''):
                goi_y = the_luc.goi_y_the_luc(r['chieu_cao'], r['can_nang'], r['gioi_tinh'])
                if goi_y:
                    if apply:
                        conn.execute('UPDATE ho_so SET kham_the_luc_pl=? '
                                     'WHERE ma_ho_so=?', (goi_y['pl'], ma))
                        log(ma, 'kham_the_luc_pl', None, goi_y['pl'])
                    n_plth += 1

        # 1) NÂNG Tuần hoàn theo CSST
        csst = max(l_mach or 0, l_ha or 0)
        cur_th = r['noi_khoa_tuan_hoan_pl']
        cur_th_i = int(cur_th) if cur_th not in (None, '') else 0
        if csst > 0 and csst > cur_th_i:
            if apply:
                conn.execute('UPDATE ho_so SET noi_khoa_tuan_hoan_pl=? '
                             'WHERE ma_ho_so=?', (csst, ma))
                log(ma, 'noi_khoa_tuan_hoan_pl', cur_th, csst)
            n_th += 1

        # 2) Tự thêm bệnh chính theo sinh hiệu khi CHƯA có bệnh chính
        if not r['ma_benh_chinh']:
            muon = chan_doan_tu_sinh_hieu(sys_val, dia, mach)
            if muon:
                co_san = {b['ma_icd']: b['id'] for b in conn.execute(
                    'SELECT id, ma_icd FROM benh WHERE ma_ho_so=?', (ma,)).fetchall()}
                id_theo_ma = {}
                added_here = []
                for mi in muon:
                    if mi in co_san:
                        id_theo_ma[mi] = co_san[mi]
                        continue
                    micd, ten = _resolve_icd(conn, mi)
                    if not micd:
                        continue
                    if apply:
                        stt = conn.execute(
                            'SELECT COALESCE(MAX(stt_benh),0)+1 FROM benh '
                            'WHERE ma_ho_so=?', (ma,)).fetchone()[0]
                        cur = conn.execute(
                            'INSERT INTO benh(ma_ho_so, stt_benh, la_benh_chinh, '
                            'ma_icd, ten_icd, co_quan, muc_do_nang, chuoi_goc, '
                            'nguon_anh_xa, dien_giai_bs, can_ra_soat) '
                            'VALUES (?,?,0,?,?,?,?,?,?,?,0)',
                            (ma, stt, micd, ten, 'TH', None,
                             'Tự gán theo chỉ số sinh tồn (batch)',
                             'sinh_hieu_tu_dong', None))
                        id_theo_ma[mi] = cur.lastrowid
                        log(ma, f'benh:add:{cur.lastrowid}', None,
                            f'{micd} — {ten} (batch sinh hiệu)')
                    added_here.append(mi)
                    dx_dem[mi] = dx_dem.get(mi, 0) + 1

                if added_here:
                    main_ma = muon[0]
                    n_dx += 1
                    if 'CO_PHAN_LOAI_NHUNG_KHONG_CO_CHAN_DOAN' in qc.flags_of(r['co_qc']):
                        n_flag += 1
                    if apply and main_ma in id_theo_ma:
                        mid = id_theo_ma[main_ma]
                        mrow = conn.execute('SELECT * FROM benh WHERE id=?',
                                            (mid,)).fetchone()
                        conn.execute('UPDATE benh SET la_benh_chinh=0 '
                                     'WHERE ma_ho_so=?', (ma,))
                        conn.execute('UPDATE benh SET la_benh_chinh=1 WHERE id=?',
                                     (mid,))
                        conn.execute(
                            'UPDATE ho_so SET ma_benh_chinh=?, ket_luan_benh=?, '
                            'co_quan_benh_chinh=? WHERE ma_ho_so=?',
                            (mrow['ma_icd'], mrow['ten_icd'], mrow['co_quan'], ma))
                        log(ma, 'ma_benh_chinh', '', mrow['ma_icd'])
                        old_qc = conn.execute(
                            'SELECT co_qc FROM ho_so WHERE ma_ho_so=?',
                            (ma,)).fetchone()['co_qc']
                        if 'CO_PHAN_LOAI_NHUNG_KHONG_CO_CHAN_DOAN' in qc.flags_of(old_qc):
                            new_qc = qc.remove_flags(
                                conn, ma, ['CO_PHAN_LOAI_NHUNG_KHONG_CO_CHAN_DOAN'])
                            log(ma, 'co_qc', old_qc or '', new_qc or '')

        # 3) NÂNG Phân loại sức khỏe chung lên = cơ quan nặng nhất (chỉ nâng)
        fresh = dict(r)
        fresh['noi_khoa_tuan_hoan_pl'] = max(cur_th_i, csst) if csst > 0 else cur_th
        inv = qc.check_invariant(fresh)
        gmax = inv['gia_tri_max']
        pl = fresh['phan_loai_sk']
        pl_i = int(pl) if pl not in (None, '') else 0
        if gmax is not None and gmax > pl_i:
            if apply:
                conn.execute('UPDATE ho_so SET phan_loai_sk=? WHERE ma_ho_so=?',
                             (gmax, ma))
                log(ma, 'phan_loai_sk', pl, gmax)
            n_sk += 1

    if apply:
        conn.commit()

    # 4) Đồng bộ cờ VI_PHAM_BAT_BIEN_QD1613 trên TOÀN BỘ hồ sơ (không chỉ tập
    # `rows` ở trên — mismatch cơ quan/phân loại có thể xảy ra ở hồ sơ CHƯA
    # có sinh hiệu, vd chỉ khám mục D "Khám theo cơ quan", nên phải quét
    # riêng toàn bảng). Chỉ SELECT cột cần dùng cho check_invariant() +
    # co_qc/so_loi, tránh SELECT * cho 13000+ dòng.
    cot_pl = ', '.join(col for _, col in qc.ORGAN_PL_FIELDS)
    n_vipham_them = n_vipham_go = 0
    done2 = 0
    for r in conn.execute(
            f'SELECT ma_ho_so, co_qc, so_loi, phan_loai_sk, {cot_pl} FROM ho_so'):
        if apply and done2 and done2 % 500 == 0:
            conn.commit()
        done2 += 1
        inv = qc.check_invariant(r)
        dang_co = 'VI_PHAM_BAT_BIEN_QD1613' in qc.flags_of(r['co_qc'])
        if inv['vi_pham'] and not dang_co:
            if apply:
                new_qc = qc.add_flag(conn, r['ma_ho_so'], 'VI_PHAM_BAT_BIEN_QD1613')
                log(r['ma_ho_so'], 'co_qc', r['co_qc'] or '', new_qc or '')
            n_vipham_them += 1
        elif (not inv['vi_pham']) and dang_co:
            if apply:
                new_qc = qc.remove_flags(conn, r['ma_ho_so'], ['VI_PHAM_BAT_BIEN_QD1613'])
                log(r['ma_ho_so'], 'co_qc', r['co_qc'] or '', new_qc or '')
            n_vipham_go += 1

    if apply:
        conn.commit()

    return {
        'apply': apply, 'tong_quet': len(rows),
        'dien_bmi': n_bmi, 'dien_pl_the_luc': n_plth,
        'nang_tuan_hoan': n_th,
        'them_benh_chinh': n_dx, 'them_benh_chinh_theo_ma': dx_dem,
        'go_co': n_flag, 'nang_suc_khoe_chung': n_sk,
        'them_co_vi_pham': n_vipham_them, 'go_co_vi_pham': n_vipham_go,
    }
