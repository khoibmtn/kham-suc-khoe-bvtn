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
  1b) NGOẠI LỆ CÓ CHỦ ĐÍCH với nguyên tắc "chỉ nâng/điền chỗ trống" ở trên:
     CSST Loại II+ (Mạch hoặc HA, ĐỘC LẬP nhau) -> cập nhật TEXT tự do
     "Khám Tuần hoàn" (noi_khoa_tuan_hoan) nêu lý do (vd "Mạch 92 l/ph") —
     THAY THẾ nếu đang là "Bình thường"/trống, NỐI THÊM (bằng '; ') nếu đang
     có nội dung khác — xem services/csst.ap_dung_ly_do_tuan_hoan(). Đây là
     field TEXT diễn giải của bác sĩ, không phải mã phân loại, nên được phép
     ghi đè/nối thêm thay vì chỉ điền khi trống.
  2) Tự thêm chẩn đoán theo sinh hiệu (HA cao->I10, mạch nhanh->R00.0, mạch
     chậm->R00.1) — CHẠY dù hồ sơ đã có bệnh chính khác. Chỉ ĐẶT làm bệnh
     chính khi Tuần hoàn (cơ quan của các mã này) đang là cơ quan NẶNG NHẤT
     trong hồ sơ (kể cả Thể lực) — không ghi đè bệnh chính của cơ quan nặng
     hơn. Gỡ cờ đỏ 'CO_PHAN_LOAI_NHUNG_KHONG_CO_CHAN_DOAN' khi vừa đặt.
  3) NÂNG Phân loại sức khỏe chung (phan_loai_sk) lên bằng cơ quan nặng nhất
     (bất biến QĐ1613 §6.1) — chỉ nâng, KHÔNG hạ.

Idempotent: chạy lại không đổi gì thêm. Dùng chung bởi:
  - scripts/batch_sinh_hieu.py (CLI, chạy tay/cron)
  - routers/cai_dat.py POST /api/admin/ra-soat-sinh-hieu (nút bấm trong app,
    Cài đặt -> admin có thể chạy từ XA qua tunnel, không cần CMD trên máy
    server)."""
from services import csst, qc, the_luc
from routers.benh import chan_doan_tu_sinh_hieu


def _mach_bpm(s):
    try:
        return float(str(s or '').replace(',', '.'))
    except ValueError:
        return None


def _resolve_icd(conn, ma_icd):
    row = conn.execute('SELECT ma, ten FROM dm_icd WHERE ma=?', (ma_icd,)).fetchone()
    return (row['ma'], row['ten']) if row else (None, None)


def chay(conn, apply, nguoi_dung_id):
    """Chạy 1 lượt rà soát. `conn` do caller mở/đóng. `nguoi_dung_id` gắn vào
    nhat_ky (CLI dùng tài khoản 'admin'; endpoint dùng admin đang đăng nhập).
    Trả dict đếm — {'apply', 'tong_quet', 'dien_bmi', 'dien_pl_the_luc',
    'nang_tuan_hoan', 'nang_ly_do_tuan_hoan', 'them_benh_chinh',
    'them_benh_chinh_theo_ma', 'go_co', 'nang_suc_khoe_chung'}."""
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

    n_bmi = n_plth = n_th = n_dx = n_dx_chinh = n_sk = n_flag = 0
    n_ly_do_tuan_hoan = 0
    dx_dem = {'I10': 0, 'R00.0': 0, 'R00.1': 0}
    done = 0
    for r in rows:
        if apply and done and done % 300 == 0:
            conn.commit()
        done += 1
        ma = r['ma_ho_so']
        tuoi = csst.tuoi(r)
        mach = _mach_bpm(r['mach'])
        l_mach = csst.classify_mach(mach)
        l_ha, sys_val, dia = csst.classify_huyet_ap(r['huyet_ap'], tuoi)

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
        # Đặt tên csst_loai (không phải `csst`) để KHÔNG che khuất module
        # `services.csst` import ở đầu file — Python coi biến gán ở BẤT KỲ
        # đâu trong hàm là local cho TOÀN hàm, nên đặt trùng tên sẽ vỡ các
        # lệnh gọi `csst.tuoi()/classify_mach()/...` phía trên (UnboundLocalError).
        csst_loai = max(l_mach or 0, l_ha or 0)
        cur_th = r['noi_khoa_tuan_hoan_pl']
        cur_th_i = int(cur_th) if cur_th not in (None, '') else 0
        if csst_loai > 0 and csst_loai > cur_th_i:
            if apply:
                conn.execute('UPDATE ho_so SET noi_khoa_tuan_hoan_pl=? '
                             'WHERE ma_ho_so=?', (csst_loai, ma))
                log(ma, 'noi_khoa_tuan_hoan_pl', cur_th, csst_loai)
            n_th += 1

        # 1b) NÂNG text "Khám Tuần hoàn" theo lý do CSST Loại II+ — NGOẠI LỆ
        # có chủ đích với nguyên tắc "chỉ nâng/điền chỗ trống" ở đầu file:
        # đây là field TEXT tự do, có thể THAY THẾ "Bình thường" hoặc NỐI
        # THÊM vào nội dung đã có (không chỉ điền khi trống) — xem
        # services/csst.ap_dung_ly_do_tuan_hoan() để biết logic thay thế/nối.
        ly_do = csst.ly_do_tang_csst(l_mach, r['mach'], l_ha, sys_val, dia)
        if ly_do:
            hien_tai = r['noi_khoa_tuan_hoan']
            moi = csst.ap_dung_ly_do_tuan_hoan(hien_tai, ly_do)
            if moi != hien_tai:
                if apply:
                    conn.execute('UPDATE ho_so SET noi_khoa_tuan_hoan=? '
                                 'WHERE ma_ho_so=?', (moi, ma))
                    log(ma, 'noi_khoa_tuan_hoan', hien_tai, moi)
                n_ly_do_tuan_hoan += 1

        # Trạng thái cơ quan SAU bước 1 (Tuần hoàn có thể đã nâng) — dùng
        # chung cho quyết định bệnh chính (bước 2) VÀ nâng phan_loai_sk (bước
        # 3), tính 1 lần duy nhất.
        fresh = dict(r)
        fresh['noi_khoa_tuan_hoan_pl'] = max(cur_th_i, csst_loai) if csst_loai > 0 else cur_th
        inv = qc.check_invariant(fresh)

        # 2) Tự thêm chẩn đoán theo sinh hiệu — CHẠY dù hồ sơ đã có bệnh
        # chính khác (phản hồi anh Khôi, đổi từ "chỉ khi chưa có bệnh
        # chính"). Chỉ ĐẶT làm bệnh chính khi Tuần hoàn đang là cơ quan nặng
        # nhất (kể cả Thể lực) — không ghi đè bệnh chính của cơ quan nặng hơn.
        muon = chan_doan_tu_sinh_hieu(sys_val, dia, mach)
        if muon:
            co_san_rows = {b['ma_icd']: b for b in conn.execute(
                'SELECT id, ma_icd, ten_icd, co_quan FROM benh WHERE ma_ho_so=?',
                (ma,)).fetchall()}
            id_theo_ma = {}
            info_theo_ma = {}   # mi -> (ma_icd, ten_icd, co_quan), kể cả chưa insert (dry-run)
            added_here = []
            for mi in muon:
                if mi in co_san_rows:
                    b = co_san_rows[mi]
                    id_theo_ma[mi] = b['id']
                    info_theo_ma[mi] = (b['ma_icd'], b['ten_icd'], b['co_quan'])
                    continue
                micd, ten = _resolve_icd(conn, mi)
                if not micd:
                    continue
                info_theo_ma[mi] = (micd, ten, 'TH')
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
                n_dx += 1

            main_ma = muon[0]
            if main_ma in info_theo_ma:
                main_icd, main_ten, main_coquan = info_theo_ma[main_ma]
                if inv['co_quan_max'] == 'TH' and r['ma_benh_chinh'] != main_icd:
                    n_dx_chinh += 1
                    if 'CO_PHAN_LOAI_NHUNG_KHONG_CO_CHAN_DOAN' in qc.flags_of(r['co_qc']):
                        n_flag += 1
                    if apply and main_ma in id_theo_ma:
                        mid = id_theo_ma[main_ma]
                        conn.execute('UPDATE benh SET la_benh_chinh=0 '
                                     'WHERE ma_ho_so=?', (ma,))
                        conn.execute('UPDATE benh SET la_benh_chinh=1 WHERE id=?',
                                     (mid,))
                        conn.execute(
                            'UPDATE ho_so SET ma_benh_chinh=?, ket_luan_benh=?, '
                            'co_quan_benh_chinh=? WHERE ma_ho_so=?',
                            (main_icd, main_ten, main_coquan, ma))
                        log(ma, 'ma_benh_chinh', r['ma_benh_chinh'] or '', main_icd)
                        old_qc = conn.execute(
                            'SELECT co_qc FROM ho_so WHERE ma_ho_so=?',
                            (ma,)).fetchone()['co_qc']
                        if 'CO_PHAN_LOAI_NHUNG_KHONG_CO_CHAN_DOAN' in qc.flags_of(old_qc):
                            new_qc = qc.remove_flags(
                                conn, ma, ['CO_PHAN_LOAI_NHUNG_KHONG_CO_CHAN_DOAN'])
                            log(ma, 'co_qc', old_qc or '', new_qc or '')

        # 3) NÂNG Phân loại sức khỏe chung lên = cơ quan nặng nhất (chỉ nâng)
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
        'nang_ly_do_tuan_hoan': n_ly_do_tuan_hoan,
        'them_benh_chinh': n_dx, 'them_benh_chinh_theo_ma': dx_dem,
        'dat_benh_chinh': n_dx_chinh,
        'go_co': n_flag, 'nang_suc_khoe_chung': n_sk,
        'them_co_vi_pham': n_vipham_them, 'go_co_vi_pham': n_vipham_go,
    }
