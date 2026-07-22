# -*- coding: utf-8 -*-
"""nguoi_dung.py — admin quản lý tài khoản nhân viên rà soát (Đợt 2 §1-3)."""
import os
import sys
from typing import Optional

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
import db  # noqa: E402
import auth  # noqa: E402

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

router = APIRouter(prefix='/api', tags=['nguoi_dung'])

MAT_KHAU_MAC_DINH = 'ksk@2026'


@router.get('/nguoi-dung')
def list_nguoi_dung(admin=Depends(auth.require_admin)):
    conn = db.get_connection()
    try:
        rows = conn.execute(
            'SELECT id, ten_dang_nhap, ho_ten, vai_tro, dang_hoat_dong '
            'FROM nguoi_dung ORDER BY ho_ten').fetchall()
    finally:
        conn.close()
    return [dict(r) for r in rows]


class NguoiDungBody(BaseModel):
    ten_dang_nhap: str
    ho_ten: str
    mat_khau: str
    vai_tro: Optional[str] = 'ra_soat'  # màn "Người dùng" (criterion 1) chỉ tạo ra_soat


@router.post('/nguoi-dung')
def create_nguoi_dung(body: NguoiDungBody, admin=Depends(auth.require_admin)):
    ten_dang_nhap = body.ten_dang_nhap.strip()
    ho_ten = body.ho_ten.strip()
    vai_tro = body.vai_tro or 'ra_soat'
    if vai_tro not in ('admin', 'ra_soat'):
        raise HTTPException(400, "vai_tro phải là 'admin' hoặc 'ra_soat'")
    if not ten_dang_nhap or not ho_ten or not body.mat_khau:
        raise HTTPException(400, 'Thiếu họ tên/tên đăng nhập/mật khẩu')
    conn = db.get_connection()
    try:
        exists = conn.execute('SELECT 1 FROM nguoi_dung WHERE ten_dang_nhap=?',
                               (ten_dang_nhap,)).fetchone()
        if exists:
            raise HTTPException(409, 'Tên đăng nhập đã tồn tại')
        cur = conn.execute(
            'INSERT INTO nguoi_dung(ten_dang_nhap, ho_ten, vai_tro, '
            'mat_khau_hash) VALUES (?,?,?,?)',
            (ten_dang_nhap, ho_ten, vai_tro, auth.hash_password(body.mat_khau)))
        conn.commit()
        new_id = cur.lastrowid
    finally:
        conn.close()
    return {'id': new_id, 'ten_dang_nhap': ten_dang_nhap,
            'ho_ten': ho_ten, 'vai_tro': vai_tro}


class UpdateHoTenBody(BaseModel):
    ho_ten: str


@router.patch('/nguoi-dung/{nguoi_dung_id}')
def update_nguoi_dung(nguoi_dung_id: int, body: UpdateHoTenBody,
                       admin=Depends(auth.require_admin)):
    ho_ten = body.ho_ten.strip()
    if not ho_ten:
        raise HTTPException(400, 'Họ tên không được để trống')
    conn = db.get_connection()
    try:
        row = conn.execute('SELECT id FROM nguoi_dung WHERE id=?',
                            (nguoi_dung_id,)).fetchone()
        if not row:
            raise HTTPException(404, 'Không tìm thấy tài khoản')
        conn.execute('UPDATE nguoi_dung SET ho_ten=? WHERE id=?',
                     (ho_ten, nguoi_dung_id))
        conn.commit()
    finally:
        conn.close()
    return {'ok': True, 'id': nguoi_dung_id, 'ho_ten': ho_ten}


@router.post('/nguoi-dung/{nguoi_dung_id}/reset-mat-khau')
def reset_mat_khau(nguoi_dung_id: int, admin=Depends(auth.require_admin)):
    """Đặt lại mật khẩu mặc định (criterion 1) — trả lại mật khẩu mới rõ ràng
    để admin đọc cho nhân viên (không gửi email/SMS trong phạm vi app này)."""
    conn = db.get_connection()
    try:
        row = conn.execute('SELECT id FROM nguoi_dung WHERE id=?',
                            (nguoi_dung_id,)).fetchone()
        if not row:
            raise HTTPException(404, 'Không tìm thấy tài khoản')
        conn.execute('UPDATE nguoi_dung SET mat_khau_hash=? WHERE id=?',
                     (auth.hash_password(MAT_KHAU_MAC_DINH), nguoi_dung_id))
        conn.commit()
    finally:
        conn.close()
    return {'ok': True, 'id': nguoi_dung_id, 'mat_khau_moi': MAT_KHAU_MAC_DINH}


class KichHoatBody(BaseModel):
    dang_hoat_dong: int


@router.post('/nguoi-dung/{nguoi_dung_id}/kich-hoat')
def kich_hoat(nguoi_dung_id: int, body: KichHoatBody,
              admin=Depends(auth.require_admin)):
    if body.dang_hoat_dong not in (0, 1):
        raise HTTPException(400, 'dang_hoat_dong phải là 0 hoặc 1')
    if nguoi_dung_id == admin['id'] and body.dang_hoat_dong == 0:
        raise HTTPException(400, 'Không thể tự vô hiệu hóa tài khoản của chính mình')
    conn = db.get_connection()
    try:
        row = conn.execute('SELECT id FROM nguoi_dung WHERE id=?',
                            (nguoi_dung_id,)).fetchone()
        if not row:
            raise HTTPException(404, 'Không tìm thấy tài khoản')
        conn.execute('UPDATE nguoi_dung SET dang_hoat_dong=? WHERE id=?',
                     (body.dang_hoat_dong, nguoi_dung_id))
        conn.commit()
    finally:
        conn.close()
    return {'ok': True, 'id': nguoi_dung_id, 'dang_hoat_dong': body.dang_hoat_dong}


@router.delete('/nguoi-dung/{nguoi_dung_id}')
def delete_nguoi_dung(nguoi_dung_id: int, admin=Depends(auth.require_admin)):
    if nguoi_dung_id == admin['id']:
        raise HTTPException(400, 'Không thể tự xóa tài khoản của chính mình')
    conn = db.get_connection()
    try:
        row = conn.execute('SELECT id FROM nguoi_dung WHERE id=?',
                            (nguoi_dung_id,)).fetchone()
        if not row:
            raise HTTPException(404, 'Không tìm thấy tài khoản')
        n_nk = conn.execute('SELECT COUNT(*) FROM nhat_ky WHERE nguoi_dung_id=?',
                             (nguoi_dung_id,)).fetchone()[0]
        n_pc = conn.execute('SELECT COUNT(*) FROM phan_cong WHERE nguoi_dung_id=?',
                             (nguoi_dung_id,)).fetchone()[0]
        n_hs = conn.execute('SELECT COUNT(*) FROM ho_so WHERE nguoi_ra_soat_id=?',
                             (nguoi_dung_id,)).fetchone()[0]
        if n_nk or n_pc or n_hs:
            raise HTTPException(
                409, 'Tài khoản đã có dấu vết sử dụng (nhật ký/phân công/hồ sơ đã '
                     'giao) — không thể xóa. Hãy dùng chức năng "Vô hiệu hóa" thay thế.')
        conn.execute('DELETE FROM nguoi_dung WHERE id=?', (nguoi_dung_id,))
        conn.commit()
    finally:
        conn.close()
    return {'ok': True}
