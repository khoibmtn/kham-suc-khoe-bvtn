# -*- coding: utf-8 -*-
"""
dashboard.py — Pipeline 3: Dashboard (§8 SPEC). CHỈ GET — không sửa dữ liệu
nghiệp vụ (criterion P3.7). Xem toàn bộ cho mọi người dùng đã đăng nhập,
dữ liệu KHÔNG bị giới hạn theo phạm vi rà soát (SPEC không nêu hạn chế —
quyết định mặc định trong PLAN.md/CRITERIA.md giao cho instructions P3).

PERF (Đợt 12): mỗi query đi 1 round-trip tới Turso primary (remote-only,
Tokyo) ~70-90ms. Bản cũ chạy ~250 query TUẦN TỰ (vòng lặp N+1 theo xã/nhân
viên/cờ) -> 20-25s -> Vercel 504. Bản này gộp về ~16 query bằng GROUP BY +
SUM(CASE WHEN...) / COUNT(DISTINCT CASE WHEN...) — GIỮ NGUYÊN 100% hình dạng
JSON trả về để frontend (dashboard.js) không phải đổi.
"""
import os
import sys
from datetime import date, timedelta

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
import db  # noqa: E402
import auth  # noqa: E402
from services import qc  # noqa: E402
from routers.ho_so import XA_LIST  # noqa: E402

from fastapi import APIRouter, Depends

router = APIRouter(prefix='/api/dashboard', tags=['dashboard'])

# Cơ quan bệnh chính -> tên hiển thị (dùng lại đúng bảng của services/qc.py,
# đã import từ build/build_xlsm.py TEN_CQ — không định nghĩa lại).
TEN_CQ = qc.TEN_CQ

# (mã nhóm, tên hiển thị, điều kiện SQL trên biểu thức mã ICD đã chuẩn hoá
# — dùng placeholder {e} thay cho _ma_tran_expr() để tránh lặp lại chuỗi).
MAN_TINH_DINH_NGHIA = [
    ('THA', 'Tăng huyết áp', "{e} = 'I10'"),
    ('DTD', 'Đái tháo đường', "({e} LIKE 'E11%' OR {e} LIKE 'E14%')"),
    ('COPD', 'Bệnh phổi tắc nghẽn mãn tính', "{e} = 'J44.9'"),
    ('THOAI_HOA_KHOP', 'Thoái hóa khớp', "{e} IN ('M19.9','M17.9')"),
    ('GAN_NHIEM_MO', 'Gan nhiễm mỡ', "{e} = 'K76.0'"),
]

TONG_HO_SO_MAU = 13326  # §8.5: % tính trên tổng số liệu nền cố định

# 4 cột cờ "đã rà soát xong" (checkbox panel chi tiết) + biểu thức "đủ 4 mục".
RS_XONG_COLS = ('rs_hanh_chinh', 'rs_sinh_ton', 'rs_the_luc', 'rs_canh_bao_khac')
RS_XONG_SQL = ' AND '.join(f'{c}=1' for c in RS_XONG_COLS)


def _ma_tran_expr():
    """Biểu thức mã ICD đã bỏ hậu tố †/* — ưu tiên dm_icd.ma_tran (đã tra
    sẵn lúc nạp), nếu bảng bệnh giữ mã không có trong dm_icd thì tự bỏ †/*
    (đúng bẫy §10 dagger/asterisk)."""
    return ("COALESCE(d.ma_tran, REPLACE(REPLACE(b.ma_icd,'†',''),'*',''))")


@router.get('/tong-quan')
def tong_quan(user=Depends(auth.get_current_user)):
    """7 chỉ số §8.1. 'Tổng số cờ 🔴 còn lại' = SỐ HỒ SƠ có ít nhất 1 cờ đỏ
    (nhất quán với services/qc.red_flag_where(), cũng dùng ở P2 export
    preview) — KHÔNG phải tổng lượt xuất hiện cờ.

    PERF: gộp TOÀN BỘ chỉ số về 1 query duy nhất (SUM CASE WHEN)."""
    conn = db.get_connection()
    try:
        red_sql, red_args = qc.red_flag_where()
        row = conn.execute(
            f"""
            SELECT
              COUNT(*) AS tong,
              SUM(CASE WHEN trang_thai='hoan_thanh' THEN 1 ELSE 0 END) AS da,
              SUM(CASE WHEN trang_thai='dang_ra_soat' THEN 1 ELSE 0 END) AS dang,
              SUM(CASE WHEN trang_thai='chua_ra_soat' THEN 1 ELSE 0 END) AS chua,
              SUM(CASE WHEN trang_thai='can_doi_chieu_giay' THEN 1 ELSE 0 END) AS cdc,
              SUM(CASE WHEN da_xuat_file=1 THEN 1 ELSE 0 END) AS da_xuat,
              SUM(CASE WHEN {red_sql} THEN 1 ELSE 0 END) AS co_do,
              SUM(CASE WHEN rs_hanh_chinh=1 THEN 1 ELSE 0 END) AS rs_hc,
              SUM(CASE WHEN rs_sinh_ton=1 THEN 1 ELSE 0 END) AS rs_st,
              SUM(CASE WHEN rs_the_luc=1 THEN 1 ELSE 0 END) AS rs_tl,
              SUM(CASE WHEN rs_canh_bao_khac=1 THEN 1 ELSE 0 END) AS rs_cbk,
              SUM(CASE WHEN {RS_XONG_SQL} THEN 1 ELSE 0 END) AS rs_tat_ca
            FROM ho_so
            """,
            red_args).fetchone()
    finally:
        conn.close()
    tong = row['tong'] or 0
    da = row['da'] or 0
    rs_tat_ca = row['rs_tat_ca'] or 0
    return {
        'tong_ho_so': tong,
        'da_ra_soat': {'so_luong': da, 'ty_le': round(da / tong * 100, 1) if tong else 0},
        'dang_ra_soat': row['dang'] or 0,
        'chua_ra_soat': row['chua'] or 0,
        'can_doi_chieu_giay': row['cdc'] or 0,
        'da_xuat_file': row['da_xuat'] or 0,
        'tong_co_do': row['co_do'] or 0,
        'ra_soat_xong': {
            'hanh_chinh': row['rs_hc'] or 0, 'sinh_ton': row['rs_st'] or 0,
            'the_luc': row['rs_tl'] or 0, 'canh_bao_khac': row['rs_cbk'] or 0,
            'tat_ca': rs_tat_ca,
            'ty_le_tat_ca': round(rs_tat_ca / tong * 100, 1) if tong else 0,
        },
    }


@router.get('/theo-xa')
def theo_xa(user=Depends(auth.get_current_user)):
    """§8.2: mỗi xã tổng/xong/đang/chưa/cờ đỏ/%, sắp % TĂNG DẦN (xã chậm
    nhất lên đầu).

    PERF: 1 query GROUP BY maxa_cu_tru thay cho ~7 query × mỗi xã."""
    conn = db.get_connection()
    try:
        red_sql, red_args = qc.red_flag_where()
        rows = conn.execute(
            f"""
            SELECT maxa_cu_tru AS xa,
              COUNT(*) AS tong,
              SUM(CASE WHEN trang_thai='hoan_thanh' THEN 1 ELSE 0 END) AS xong,
              SUM(CASE WHEN trang_thai='dang_ra_soat' THEN 1 ELSE 0 END) AS dang,
              SUM(CASE WHEN trang_thai='chua_ra_soat' THEN 1 ELSE 0 END) AS chua,
              SUM(CASE WHEN trang_thai='can_doi_chieu_giay' THEN 1 ELSE 0 END) AS cdc,
              SUM(CASE WHEN {red_sql} THEN 1 ELSE 0 END) AS co_do,
              SUM(CASE WHEN {RS_XONG_SQL} THEN 1 ELSE 0 END) AS rs_xong
            FROM ho_so GROUP BY maxa_cu_tru
            """,
            red_args).fetchall()
    finally:
        conn.close()
    by_xa = {r['xa']: r for r in rows}
    out = []
    for xa in XA_LIST:
        r = by_xa.get(xa)
        tong = (r['tong'] if r else 0) or 0
        xong = (r['xong'] if r else 0) or 0
        out.append({
            'xa': xa, 'tong': tong, 'xong': xong,
            'dang': (r['dang'] if r else 0) or 0,
            'chua': (r['chua'] if r else 0) or 0,
            'can_doi_chieu_giay': (r['cdc'] if r else 0) or 0,
            'co_do': (r['co_do'] if r else 0) or 0,
            'ty_le': round(xong / tong * 100, 1) if tong else 0,
            'rs_xong': (r['rs_xong'] if r else 0) or 0,
        })
    out.sort(key=lambda r: r['ty_le'])
    return out


@router.get('/theo-can-bo')
def theo_can_bo(user=Depends(auth.get_current_user)):
    """§8.3: giao/hoàn thành/%/lượt sửa/hoạt động gần nhất/năng suất 7
    ngày. Chỉ tính nhân viên đang hoạt động (dang_hoat_dong=1).

    PERF: 5 query (danh sách user + 2 aggregate ho_so/nhat_ky + ngày hôm nay
    + đếm nhật ký theo ngày) thay cho ~12 query × mỗi nhân viên."""
    conn = db.get_connection()
    try:
        users = conn.execute(
            'SELECT id, ho_ten, vai_tro FROM nguoi_dung '
            'WHERE dang_hoat_dong=1 ORDER BY ho_ten').fetchall()

        # Aggregate hồ sơ theo người rà soát (giao/hoàn thành/rs xong đủ 4 mục)
        hs_by = {}
        for r in conn.execute(
                f"""
                SELECT nguoi_ra_soat_id AS uid,
                  COUNT(*) AS giao,
                  SUM(CASE WHEN trang_thai='hoan_thanh' THEN 1 ELSE 0 END) AS hoan_thanh,
                  SUM(CASE WHEN {RS_XONG_SQL} THEN 1 ELSE 0 END) AS rs_xong
                FROM ho_so WHERE nguoi_ra_soat_id IS NOT NULL
                GROUP BY nguoi_ra_soat_id
                """):
            hs_by[r['uid']] = r

        # Aggregate nhật ký theo người dùng: SỐ HỒ SƠ đã tham gia sửa (đếm
        # theo HỒ SƠ - distinct, KHÔNG theo lượt sửa - phản hồi anh Khôi Đợt
        # 12) + số lượt sửa (giữ để tham khảo) + hoạt động gần nhất.
        nk_by = {}
        for r in conn.execute(
                'SELECT nguoi_dung_id AS uid, '
                'COUNT(DISTINCT ma_ho_so) AS so_ho_so, '
                'COUNT(*) AS so_luot, '
                'MAX(thoi_diem) AS gan_nhat FROM nhat_ky GROUP BY nguoi_dung_id'):
            nk_by[r['uid']] = r

        # 7 ngày gần nhất: lấy ngày hôm nay theo giờ server (1 query) rồi tính
        # 6 ngày trước bằng Python -> tránh 7 query date('now',...) riêng lẻ.
        today_str = conn.execute("SELECT date('now','localtime')").fetchone()[0]
        y, m, d = (int(x) for x in today_str.split('-'))
        today = date(y, m, d)
        seven_days = [(today - timedelta(days=i)).isoformat() for i in range(6, -1, -1)]

        # Năng suất 7 ngày: đếm SỐ HỒ SƠ (distinct) người đó tham gia sửa mỗi
        # ngày — KHÔNG đếm lượt sửa (Đợt 12). 1 query, pivot ở Python.
        day_by = {}  # uid -> {ngay: so_ho_so}
        for r in conn.execute(
                "SELECT nguoi_dung_id AS uid, date(thoi_diem) AS ngay, "
                "COUNT(DISTINCT ma_ho_so) AS c FROM nhat_ky "
                "WHERE date(thoi_diem) >= date('now','localtime','-6 day') "
                "GROUP BY nguoi_dung_id, date(thoi_diem)"):
            day_by.setdefault(r['uid'], {})[r['ngay']] = r['c']
    finally:
        conn.close()

    out = []
    for u in users:
        uid = u['id']
        hs = hs_by.get(uid)
        nk = nk_by.get(uid)
        giao = (hs['giao'] if hs else 0) or 0
        hoan_thanh = (hs['hoan_thanh'] if hs else 0) or 0
        days = day_by.get(uid, {})
        series = [{'ngay': dstr, 'so_luot': days.get(dstr, 0)} for dstr in seven_days]
        out.append({
            'nguoi_dung_id': uid, 'ho_ten': u['ho_ten'], 'vai_tro': u['vai_tro'],
            'giao': giao, 'hoan_thanh': hoan_thanh,
            'ty_le': round(hoan_thanh / giao * 100, 1) if giao else 0,
            'rs_xong': (hs['rs_xong'] if hs else 0) or 0,
            'so_ho_so_tham_gia': (nk['so_ho_so'] if nk else 0) or 0,
            'so_luot_sua': (nk['so_luot'] if nk else 0) or 0,
            'hoat_dong_gan_nhat': nk['gan_nhat'] if nk else None,
            'nang_suat_7_ngay': series,
        })
    return out


@router.get('/chat-luong')
def chat_luong(user=Depends(auth.get_current_user)):
    """§8.4: cột số ca theo mã cờ (hiện tại vs ban đầu) + đường cờ đỏ theo
    ngày. Baseline lấy từ baseline_thongke (cố định từ lúc nạp).

    PERF: 3 query (baseline + 1 query đếm TẤT CẢ cờ bằng SUM CASE WHEN +
    snapshot) thay cho ~1 query × mỗi mã cờ."""
    conn = db.get_connection()
    try:
        baseline = {r['ma']: r['gia_tri'] for r in conn.execute(
            "SELECT ma, gia_tri FROM baseline_thongke WHERE nhom='co_qc'")}

        flags = list(qc.FLAG_META.items())
        sel = ', '.join(
            f"SUM(CASE WHEN (';'||co_qc||';') LIKE ? THEN 1 ELSE 0 END) AS f{i}"
            for i in range(len(flags)))
        like_args = [f'%;{ma};%' for ma, _ in flags]
        row = conn.execute(f'SELECT {sel} FROM ho_so', like_args).fetchone()
        co_hien_tai = []
        for i, (ma, meta) in enumerate(flags):
            co_hien_tai.append({
                'ma': ma, 'ten': meta['ten'], 'muc': meta['muc'],
                'hien_tai': row[f'f{i}'] or 0, 'ban_dau': baseline.get(ma, 0),
            })
        red_series = [dict(r) for r in conn.execute(
            'SELECT ngay, so_co_do FROM snapshot_ngay ORDER BY ngay')]
    finally:
        conn.close()
    return {'co_qc': co_hien_tai, 'co_do_theo_ngay': red_series}


@router.get('/chuyen-mon')
def chuyen_mon(user=Depends(auth.get_current_user)):
    """§8.5: 5 mục thống kê chuyên môn + baseline top cơ quan bệnh chính
    (§8.6/criterion P3.6) để dashboard so sánh baseline vs hiện tại.

    PERF: 6 query (PL theo xã gộp GROUP BY 2 chiều + top20 + baseline +
    cơ quan + mạn tính gộp COUNT DISTINCT CASE WHEN + glucose gộp) thay cho
    ~56 query (vòng lặp xã×5 + mạn tính×5 + glucose×3)."""
    conn = db.get_connection()
    try:
        # 1) PL sức khỏe I-V theo xã — 1 query GROUP BY (xã, phân loại), pivot.
        pl_map = {}  # xa -> {pl: so_luong}
        for r in conn.execute(
                'SELECT maxa_cu_tru AS xa, phan_loai_sk AS pl, COUNT(*) AS c '
                'FROM ho_so WHERE phan_loai_sk BETWEEN 1 AND 5 '
                'GROUP BY maxa_cu_tru, phan_loai_sk'):
            pl_map.setdefault(r['xa'], {})[r['pl']] = r['c']
        pl_theo_xa = []
        for xa in XA_LIST:
            row = {'xa': xa}
            m = pl_map.get(xa, {})
            for i in range(1, 6):
                row[f'pl_{i}'] = m.get(i, 0)
            pl_theo_xa.append(row)

        # 2) top 20 ICD (loại bỏ ma_icd rỗng)
        top20_icd = [dict(r) for r in conn.execute(
            "SELECT ma_icd AS ma, MAX(ten_icd) AS ten, COUNT(*) AS so_ca "
            "FROM benh WHERE ma_icd IS NOT NULL AND ma_icd<>'' "
            "GROUP BY ma_icd ORDER BY so_ca DESC LIMIT 20")]

        # 3) số ca theo cơ quan bệnh chính (+ baseline để so sánh — criterion 6)
        baseline_cq = {r['ma']: r['gia_tri'] for r in conn.execute(
            "SELECT ma, gia_tri FROM baseline_thongke WHERE nhom='co_quan_benh_chinh'")}
        co_quan = [dict(r) for r in conn.execute(
            "SELECT co_quan_benh_chinh AS ma, COUNT(*) AS so_ca FROM ho_so "
            "WHERE co_quan_benh_chinh IS NOT NULL AND co_quan_benh_chinh<>'' "
            "GROUP BY co_quan_benh_chinh ORDER BY so_ca DESC")]
        for r in co_quan:
            r['ten'] = TEN_CQ.get(r['ma'], r['ma'])
            r['ban_dau'] = baseline_cq.get(r['ma'], 0)

        # 4) tỷ lệ bệnh mạn tính chính — 1 query, mỗi nhóm là 1 COUNT(DISTINCT
        # CASE WHEN <đk> THEN ma_ho_so END) (giữ đúng ngữ nghĩa "số HỒ SƠ có
        # ≥1 bệnh khớp" như bản cũ COUNT(DISTINCT) + WHERE riêng từng nhóm).
        expr = _ma_tran_expr()
        sel_parts = []
        for idx, (ma, ten, tpl) in enumerate(MAN_TINH_DINH_NGHIA):
            cond = tpl.format(e=expr)
            sel_parts.append(
                f'COUNT(DISTINCT CASE WHEN {cond} THEN b.ma_ho_so END) AS m{idx}')
        mt_row = conn.execute(
            f'SELECT {", ".join(sel_parts)} FROM benh b '
            f'LEFT JOIN dm_icd d ON b.ma_icd = d.ma').fetchone()
        man_tinh = []
        for idx, (ma, ten, tpl) in enumerate(MAN_TINH_DINH_NGHIA):
            c = mt_row[f'm{idx}'] or 0
            man_tinh.append({
                'ma': ma, 'ten': ten, 'so_ca': c,
                'ty_le': round(c / TONG_HO_SO_MAU * 100, 2),
            })

        # 5) phân bố glucose mao mạch (đói >=7.0 / sau ăn >=11.1 = cao) — 1 query
        g = conn.execute(
            "SELECT "
            "SUM(CASE WHEN glu_gia_tri IS NULL THEN 1 ELSE 0 END) AS khong_do, "
            "SUM(CASE WHEN glu_gia_tri IS NOT NULL AND ("
            "(glu_thoi_diem='Đói' AND glu_gia_tri>=7.0) OR "
            "(glu_thoi_diem='Sau ăn' AND glu_gia_tri>=11.1)) THEN 1 ELSE 0 END) AS cao, "
            "SUM(CASE WHEN glu_gia_tri IS NOT NULL THEN 1 ELSE 0 END) AS co_gt "
            "FROM ho_so").fetchone()
        khong_do = g['khong_do'] or 0
        cao = g['cao'] or 0
        binh_thuong = (g['co_gt'] or 0) - cao
        glucose = {'khong_do': khong_do, 'binh_thuong': binh_thuong, 'cao': cao}
    finally:
        conn.close()
    return {
        'pl_theo_xa': pl_theo_xa,
        'top20_icd': top20_icd,
        'co_quan_benh_chinh': co_quan,
        'man_tinh': man_tinh,
        'glucose': glucose,
    }
