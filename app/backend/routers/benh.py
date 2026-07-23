# -*- coding: utf-8 -*-
"""
benh.py — CRUD bảng bệnh (§3.4.6) + đổi bệnh chính bằng radio một-lựa-chọn.

Tên bệnh luôn lưu NGUYÊN VĂN từ dm_icd (§9, bẫy §10) — không tự soạn.
"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
import db  # noqa: E402
import auth  # noqa: E402
from services import qc  # noqa: E402
from routers.ho_so import _load_ho_so_or_404  # noqa: E402

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from typing import Optional

router = APIRouter(prefix='/api', tags=['benh'])


class BenhBody(BaseModel):
    ma_icd: Optional[str] = None
    co_quan: Optional[str] = None
    muc_do_nang: Optional[int] = None
    chuoi_goc: Optional[str] = None
    dien_giai_bs: Optional[str] = None


def _log(conn, ma_ho_so, user_id, ten_truong, cu, moi):
    conn.execute(
        'INSERT INTO nhat_ky(ma_ho_so, nguoi_dung_id, ten_truong, gia_tri_cu, '
        'gia_tri_moi) VALUES (?,?,?,?,?)',
        (ma_ho_so, user_id, ten_truong, '' if cu is None else str(cu),
         '' if moi is None else str(moi)))


def _resolve_icd(conn, ma_icd):
    """Tra tên chính thức nguyên văn từ dm_icd theo mã (chấp nhận cả mã trần)."""
    if not ma_icd:
        return None, None
    row = conn.execute('SELECT ma, ten FROM dm_icd WHERE ma = ?',
                        (ma_icd,)).fetchone()
    if not row:
        row = conn.execute('SELECT ma, ten FROM dm_icd WHERE ma_tran = ? LIMIT 1',
                            (ma_icd,)).fetchone()
    if not row:
        raise HTTPException(400, f'Mã ICD không hợp lệ: {ma_icd}')
    return row['ma'], row['ten']


@router.post('/ho-so/{ma_ho_so}/benh')
def add_benh(ma_ho_so: str, body: BenhBody, user=Depends(auth.get_current_user)):
    conn = db.get_connection()
    try:
        _load_ho_so_or_404(conn, ma_ho_so, user)
        ma, ten = _resolve_icd(conn, body.ma_icd)
        stt = conn.execute('SELECT COALESCE(MAX(stt_benh),0)+1 FROM benh '
                            'WHERE ma_ho_so=?', (ma_ho_so,)).fetchone()[0]
        cur = conn.execute(
            'INSERT INTO benh(ma_ho_so, stt_benh, la_benh_chinh, ma_icd, '
            'ten_icd, co_quan, muc_do_nang, chuoi_goc, nguon_anh_xa, '
            'dien_giai_bs, can_ra_soat) VALUES (?,?,0,?,?,?,?,?,?,?,0)',
            (ma_ho_so, stt, ma, ten, body.co_quan, body.muc_do_nang,
             body.chuoi_goc, 'nhap_tay', body.dien_giai_bs))
        new_id = cur.lastrowid
        _log(conn, ma_ho_so, user['id'], f'benh:add:{new_id}', None,
             f'{ma} — {ten}')

        # Phản hồi anh Khôi (Phase 1/Đợt 12): thêm 1 mã ICD hợp lệ = đã bổ sung
        # ánh xạ chẩn đoán -> tự gỡ cờ 'Còn chẩn đoán chưa ánh xạ' Ở BACKEND
        # (bản Phase 1 chỉ gỡ client-side nên reload lại hiện cờ). Chỉ gỡ khi
        # có mã ICD thật (ma) + cờ đang tồn tại; ghi nhật ký co_qc để truy vết.
        hs = conn.execute('SELECT co_qc FROM ho_so WHERE ma_ho_so=?',
                          (ma_ho_so,)).fetchone()
        old_co_qc = hs['co_qc'] if hs else None
        if ma and 'CON_CHAN_DOAN_CHUA_ANH_XA' in qc.flags_of(old_co_qc):
            new_co_qc = qc.remove_flags(conn, ma_ho_so,
                                        ['CON_CHAN_DOAN_CHUA_ANH_XA'])
            _log(conn, ma_ho_so, user['id'], 'co_qc', old_co_qc or '',
                 new_co_qc or '')

        conn.commit()
        row = conn.execute('SELECT * FROM benh WHERE id=?', (new_id,)).fetchone()
        hs2 = conn.execute('SELECT co_qc, so_loi FROM ho_so WHERE ma_ho_so=?',
                           (ma_ho_so,)).fetchone()
    finally:
        conn.close()
    # Trả dòng bệnh + meta cờ hiện tại của hồ sơ (để frontend cập nhật chip
    # cảnh báo ngay, không cần tải lại toàn hồ sơ). Thêm khóa _co_qc/_so_loi
    # (tiền tố _ để không lẫn với cột của bảng benh).
    out = dict(row)
    out['_co_qc'] = qc.flags_of(hs2['co_qc']) if hs2 else []
    out['_so_loi'] = hs2['so_loi'] if hs2 else None
    return out


@router.patch('/ho-so/{ma_ho_so}/benh/{benh_id}')
def patch_benh(ma_ho_so: str, benh_id: int, body: BenhBody,
                user=Depends(auth.get_current_user)):
    conn = db.get_connection()
    try:
        _load_ho_so_or_404(conn, ma_ho_so, user)
        old = conn.execute('SELECT * FROM benh WHERE id=? AND ma_ho_so=?',
                            (benh_id, ma_ho_so)).fetchone()
        if not old:
            raise HTTPException(404, 'Không tìm thấy dòng bệnh')

        changes = body.model_dump(exclude_unset=True)
        set_clauses, args = [], []
        if 'ma_icd' in changes:
            ma, ten = _resolve_icd(conn, changes['ma_icd'])
            if old['ma_icd'] != ma:
                _log(conn, ma_ho_so, user['id'], f'benh:{benh_id}:ma_icd',
                     old['ma_icd'], ma)
            set_clauses += ['ma_icd = ?', 'ten_icd = ?']
            args += [ma, ten]
        for f in ('co_quan', 'muc_do_nang', 'chuoi_goc', 'dien_giai_bs'):
            if f in changes and changes[f] != old[f]:
                _log(conn, ma_ho_so, user['id'], f'benh:{benh_id}:{f}',
                     old[f], changes[f])
                set_clauses.append(f'{f} = ?')
                args.append(changes[f])

        if set_clauses:
            args.append(benh_id)
            conn.execute(f'UPDATE benh SET {", ".join(set_clauses)} WHERE id = ?',
                         args)
            conn.commit()
        row = conn.execute('SELECT * FROM benh WHERE id=?', (benh_id,)).fetchone()
    finally:
        conn.close()
    return dict(row)


@router.delete('/ho-so/{ma_ho_so}/benh/{benh_id}')
def delete_benh(ma_ho_so: str, benh_id: int, user=Depends(auth.get_current_user)):
    conn = db.get_connection()
    try:
        _load_ho_so_or_404(conn, ma_ho_so, user)
        old = conn.execute('SELECT * FROM benh WHERE id=? AND ma_ho_so=?',
                            (benh_id, ma_ho_so)).fetchone()
        if not old:
            raise HTTPException(404, 'Không tìm thấy dòng bệnh')
        _log(conn, ma_ho_so, user['id'], f'benh:delete:{benh_id}',
             f"{old['ma_icd']} — {old['ten_icd']}", None)
        conn.execute('DELETE FROM benh WHERE id=?', (benh_id,))
        conn.commit()
    finally:
        conn.close()
    return {'ok': True}


class SetBenhChinhBody(BaseModel):
    benh_id: int


@router.post('/ho-so/{ma_ho_so}/benh/set-benh-chinh')
def set_benh_chinh(ma_ho_so: str, body: SetBenhChinhBody,
                    user=Depends(auth.get_current_user)):
    conn = db.get_connection()
    try:
        ho_so_row = _load_ho_so_or_404(conn, ma_ho_so, user)
        target = conn.execute('SELECT * FROM benh WHERE id=? AND ma_ho_so=?',
                               (body.benh_id, ma_ho_so)).fetchone()
        if not target:
            raise HTTPException(404, 'Không tìm thấy dòng bệnh')

        conn.execute('UPDATE benh SET la_benh_chinh=0 WHERE ma_ho_so=?', (ma_ho_so,))
        conn.execute('UPDATE benh SET la_benh_chinh=1 WHERE id=?', (body.benh_id,))

        old_ma_bc = ho_so_row['ma_benh_chinh']
        old_ket_luan = ho_so_row['ket_luan_benh']
        old_co_quan = ho_so_row['co_quan_benh_chinh']
        conn.execute(
            'UPDATE ho_so SET ma_benh_chinh=?, ket_luan_benh=?, '
            'co_quan_benh_chinh=? WHERE ma_ho_so=?',
            (target['ma_icd'], target['ten_icd'], target['co_quan'], ma_ho_so))

        for field, old_v, new_v in (
                ('ma_benh_chinh', old_ma_bc, target['ma_icd']),
                ('ket_luan_benh', old_ket_luan, target['ten_icd']),
                ('co_quan_benh_chinh', old_co_quan, target['co_quan'])):
            if old_v != new_v:
                _log(conn, ma_ho_so, user['id'], field, old_v, new_v)

        # bệnh IV-V nay đã có chẩn đoán chính -> gỡ cờ liên quan nếu còn
        if ho_so_row['phan_loai_sk'] in (4, 5):
            qc.remove_flags(conn, ma_ho_so,
                             ['CO_PHAN_LOAI_NHUNG_KHONG_CO_CHAN_DOAN'])
        conn.commit()

        new_row = conn.execute('SELECT * FROM ho_so WHERE ma_ho_so=?',
                                (ma_ho_so,)).fetchone()
    finally:
        conn.close()
    return {'ok': True, 'ma_benh_chinh': new_row['ma_benh_chinh'],
            'ket_luan_benh': new_row['ket_luan_benh'],
            'co_quan_benh_chinh': new_row['co_quan_benh_chinh'],
            'qd1613': qc.check_invariant(new_row)}
