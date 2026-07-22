# -*- coding: utf-8 -*-
"""
dashboard.py — Pipeline 3: Dashboard (§8 SPEC). CHỈ GET — không sửa dữ liệu
nghiệp vụ (criterion P3.7). Xem toàn bộ cho mọi người dùng đã đăng nhập,
dữ liệu KHÔNG bị giới hạn theo phạm vi rà soát (SPEC không nêu hạn chế —
quyết định mặc định trong PLAN.md/CRITERIA.md giao cho instructions P3).
"""
import os
import sys

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


def _ma_tran_expr():
    """Biểu thức mã ICD đã bỏ hậu tố †/* — ưu tiên dm_icd.ma_tran (đã tra
    sẵn lúc nạp), nếu bảng bệnh giữ mã không có trong dm_icd thì tự bỏ †/*
    (đúng bẫy §10 dagger/asterisk)."""
    return ("COALESCE(d.ma_tran, REPLACE(REPLACE(b.ma_icd,'†',''),'*',''))")


@router.get('/tong-quan')
def tong_quan(user=Depends(auth.get_current_user)):
    """7 chỉ số §8.1. 'Tổng số cờ 🔴 còn lại' = SỐ HỒ SƠ có ít nhất 1 cờ đỏ
    (nhất quán với services/qc.red_flag_where(), cũng dùng ở P2 export
    preview) — KHÔNG phải tổng lượt xuất hiện cờ."""
    conn = db.get_connection()
    try:
        tong = conn.execute('SELECT COUNT(*) FROM ho_so').fetchone()[0]
        da = conn.execute(
            "SELECT COUNT(*) FROM ho_so WHERE trang_thai='hoan_thanh'").fetchone()[0]
        dang = conn.execute(
            "SELECT COUNT(*) FROM ho_so WHERE trang_thai='dang_ra_soat'").fetchone()[0]
        chua = conn.execute(
            "SELECT COUNT(*) FROM ho_so WHERE trang_thai='chua_ra_soat'").fetchone()[0]
        can_doi_chieu = conn.execute(
            "SELECT COUNT(*) FROM ho_so WHERE trang_thai='can_doi_chieu_giay'").fetchone()[0]
        da_xuat = conn.execute(
            'SELECT COUNT(*) FROM ho_so WHERE da_xuat_file=1').fetchone()[0]
        red_sql, red_args = qc.red_flag_where()
        tong_co_do = conn.execute(
            f'SELECT COUNT(*) FROM ho_so WHERE {red_sql}', red_args).fetchone()[0]
    finally:
        conn.close()
    return {
        'tong_ho_so': tong,
        'da_ra_soat': {'so_luong': da, 'ty_le': round(da / tong * 100, 1) if tong else 0},
        'dang_ra_soat': dang,
        'chua_ra_soat': chua,
        'can_doi_chieu_giay': can_doi_chieu,
        'da_xuat_file': da_xuat,
        'tong_co_do': tong_co_do,
    }


@router.get('/theo-xa')
def theo_xa(user=Depends(auth.get_current_user)):
    """§8.2: mỗi xã tổng/xong/đang/chưa/cờ đỏ/%, sắp % TĂNG DẦN (xã chậm
    nhất lên đầu)."""
    conn = db.get_connection()
    try:
        red_sql, red_args = qc.red_flag_where()
        out = []
        for xa in XA_LIST:
            tong = conn.execute(
                'SELECT COUNT(*) FROM ho_so WHERE maxa_cu_tru=?', (xa,)).fetchone()[0]
            xong = conn.execute(
                "SELECT COUNT(*) FROM ho_so WHERE maxa_cu_tru=? AND trang_thai='hoan_thanh'",
                (xa,)).fetchone()[0]
            dang = conn.execute(
                "SELECT COUNT(*) FROM ho_so WHERE maxa_cu_tru=? AND trang_thai='dang_ra_soat'",
                (xa,)).fetchone()[0]
            chua = conn.execute(
                "SELECT COUNT(*) FROM ho_so WHERE maxa_cu_tru=? AND trang_thai='chua_ra_soat'",
                (xa,)).fetchone()[0]
            can_doi_chieu = conn.execute(
                "SELECT COUNT(*) FROM ho_so WHERE maxa_cu_tru=? AND trang_thai='can_doi_chieu_giay'",
                (xa,)).fetchone()[0]
            co_do = conn.execute(
                f'SELECT COUNT(*) FROM ho_so WHERE maxa_cu_tru=? AND {red_sql}',
                [xa] + red_args).fetchone()[0]
            pct = round(xong / tong * 100, 1) if tong else 0
            out.append({
                'xa': xa, 'tong': tong, 'xong': xong, 'dang': dang, 'chua': chua,
                'can_doi_chieu_giay': can_doi_chieu, 'co_do': co_do, 'ty_le': pct,
            })
    finally:
        conn.close()
    out.sort(key=lambda r: r['ty_le'])
    return out


@router.get('/theo-can-bo')
def theo_can_bo(user=Depends(auth.get_current_user)):
    """§8.3: giao/hoàn thành/%/lượt sửa/hoạt động gần nhất/năng suất 7
    ngày. Chỉ tính cán bộ đang hoạt động (dang_hoat_dong=1)."""
    conn = db.get_connection()
    try:
        users = conn.execute(
            'SELECT id, ho_ten, vai_tro FROM nguoi_dung '
            'WHERE dang_hoat_dong=1 ORDER BY ho_ten').fetchall()
        seven_days = [
            conn.execute("SELECT date('now','localtime',?)",
                         (f'-{i} day',)).fetchone()[0]
            for i in range(6, -1, -1)
        ]
        out = []
        for u in users:
            giao = conn.execute(
                'SELECT COUNT(*) FROM ho_so WHERE nguoi_ra_soat_id=?',
                (u['id'],)).fetchone()[0]
            hoan_thanh = conn.execute(
                "SELECT COUNT(*) FROM ho_so WHERE nguoi_ra_soat_id=? "
                "AND trang_thai='hoan_thanh'", (u['id'],)).fetchone()[0]
            so_luot_sua = conn.execute(
                'SELECT COUNT(*) FROM nhat_ky WHERE nguoi_dung_id=?',
                (u['id'],)).fetchone()[0]
            gan_nhat = conn.execute(
                'SELECT MAX(thoi_diem) FROM nhat_ky WHERE nguoi_dung_id=?',
                (u['id'],)).fetchone()[0]
            series = []
            for d in seven_days:
                c = conn.execute(
                    "SELECT COUNT(*) FROM nhat_ky WHERE nguoi_dung_id=? "
                    "AND date(thoi_diem)=?", (u['id'], d)).fetchone()[0]
                series.append({'ngay': d, 'so_luot': c})
            out.append({
                'nguoi_dung_id': u['id'], 'ho_ten': u['ho_ten'], 'vai_tro': u['vai_tro'],
                'giao': giao, 'hoan_thanh': hoan_thanh,
                'ty_le': round(hoan_thanh / giao * 100, 1) if giao else 0,
                'so_luot_sua': so_luot_sua, 'hoat_dong_gan_nhat': gan_nhat,
                'nang_suat_7_ngay': series,
            })
    finally:
        conn.close()
    return out


@router.get('/chat-luong')
def chat_luong(user=Depends(auth.get_current_user)):
    """§8.4: cột số ca theo mã cờ (hiện tại vs ban đầu) + đường cờ đỏ theo
    ngày. Baseline lấy từ baseline_thongke (cố định từ lúc nạp)."""
    conn = db.get_connection()
    try:
        baseline = {r['ma']: r['gia_tri'] for r in conn.execute(
            "SELECT ma, gia_tri FROM baseline_thongke WHERE nhom='co_qc'")}
        co_hien_tai = []
        for ma, meta in qc.FLAG_META.items():
            c = conn.execute(
                "SELECT COUNT(*) FROM ho_so WHERE (';'||co_qc||';') LIKE ?",
                (f'%;{ma};%',)).fetchone()[0]
            co_hien_tai.append({
                'ma': ma, 'ten': meta['ten'], 'muc': meta['muc'],
                'hien_tai': c, 'ban_dau': baseline.get(ma, 0),
            })
        red_series = [dict(r) for r in conn.execute(
            'SELECT ngay, so_co_do FROM snapshot_ngay ORDER BY ngay')]
    finally:
        conn.close()
    return {'co_qc': co_hien_tai, 'co_do_theo_ngay': red_series}


@router.get('/chuyen-mon')
def chuyen_mon(user=Depends(auth.get_current_user)):
    """§8.5: 5 mục thống kê chuyên môn + baseline top cơ quan bệnh chính
    (§8.6/criterion P3.6) để dashboard so sánh baseline vs hiện tại."""
    conn = db.get_connection()
    try:
        # 1) PL sức khỏe I-V theo xã
        pl_theo_xa = []
        for xa in XA_LIST:
            row = {'xa': xa}
            for i in range(1, 6):
                row[f'pl_{i}'] = conn.execute(
                    'SELECT COUNT(*) FROM ho_so WHERE maxa_cu_tru=? AND phan_loai_sk=?',
                    (xa, i)).fetchone()[0]
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

        # 4) tỷ lệ bệnh mạn tính chính
        man_tinh = []
        expr = _ma_tran_expr()
        for ma, ten, dieu_kien_tpl in MAN_TINH_DINH_NGHIA:
            where_icd = dieu_kien_tpl.format(e=expr)
            c = conn.execute(
                f'SELECT COUNT(DISTINCT b.ma_ho_so) FROM benh b '
                f'LEFT JOIN dm_icd d ON b.ma_icd = d.ma '
                f'WHERE {where_icd}'
            ).fetchone()[0]
            man_tinh.append({
                'ma': ma, 'ten': ten, 'so_ca': c,
                'ty_le': round(c / TONG_HO_SO_MAU * 100, 2),
            })

        # 5) phân bố glucose mao mạch (đói >=7.0 / sau ăn >=11.1 = cao)
        khong_do = conn.execute(
            'SELECT COUNT(*) FROM ho_so WHERE glu_gia_tri IS NULL').fetchone()[0]
        cao = conn.execute(
            "SELECT COUNT(*) FROM ho_so WHERE glu_gia_tri IS NOT NULL AND ("
            "(glu_thoi_diem='Đói' AND glu_gia_tri>=7.0) OR "
            "(glu_thoi_diem='Sau ăn' AND glu_gia_tri>=11.1))").fetchone()[0]
        binh_thuong = conn.execute(
            'SELECT COUNT(*) FROM ho_so WHERE glu_gia_tri IS NOT NULL'
        ).fetchone()[0] - cao
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
