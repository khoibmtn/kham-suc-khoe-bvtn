# -*- coding: utf-8 -*-
"""
phan_cong_khoa.py — admin giao SỐ LƯỢNG hồ sơ mục tiêu cho từng khoa/phòng
(criterion 4/5), TÁCH RIÊNG hoàn toàn khỏi phan_cong (giao hồ sơ cụ thể cho
từng nhân viên theo xã/khoảng mã/danh sách). Bảng phan_cong_khoa chỉ ghi
nhận số lượng mục tiêu — KHÔNG gán trực tiếp ma_ho_so cụ thể cho khoa.
"""
import os
import sys
from typing import Optional

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
import db  # noqa: E402
import auth  # noqa: E402

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

router = APIRouter(prefix='/api', tags=['phan_cong_khoa'])


class PhanCongKhoaBody(BaseModel):
    khoa_phong_id: int
    so_luong_muc_tieu: int
    ghi_chu: Optional[str] = None


@router.get('/phan-cong-khoa')
def list_phan_cong_khoa(admin=Depends(auth.require_admin)):
    conn = db.get_connection()
    try:
        rows = conn.execute(
            'SELECT pck.*, kp.ten AS ten_khoa FROM phan_cong_khoa pck '
            'JOIN khoa_phong kp ON kp.id = pck.khoa_phong_id '
            'ORDER BY pck.ngay_giao DESC').fetchall()
    finally:
        conn.close()
    return [dict(r) for r in rows]


@router.post('/phan-cong-khoa')
def create_phan_cong_khoa(body: PhanCongKhoaBody, admin=Depends(auth.require_admin)):
    if body.so_luong_muc_tieu < 0:
        raise HTTPException(400, 'Số lượng mục tiêu phải >= 0')
    conn = db.get_connection()
    try:
        khoa = conn.execute('SELECT id FROM khoa_phong WHERE id=? AND dang_hoat_dong=1',
                            (body.khoa_phong_id,)).fetchone()
        if not khoa:
            raise HTTPException(404, 'Không tìm thấy khoa/phòng')
        cur = conn.execute(
            'INSERT INTO phan_cong_khoa(khoa_phong_id, so_luong_muc_tieu, ghi_chu) '
            'VALUES (?,?,?)',
            (body.khoa_phong_id, body.so_luong_muc_tieu, body.ghi_chu))
        conn.commit()
        new_id = cur.lastrowid
        row = conn.execute(
            'SELECT pck.*, kp.ten AS ten_khoa FROM phan_cong_khoa pck '
            'JOIN khoa_phong kp ON kp.id = pck.khoa_phong_id WHERE pck.id=?',
            (new_id,)).fetchone()
    finally:
        conn.close()
    return dict(row)


class PhanCongKhoaPatchBody(BaseModel):
    so_luong_muc_tieu: Optional[int] = None
    ghi_chu: Optional[str] = None


@router.patch('/phan-cong-khoa/{id}')
def patch_phan_cong_khoa(id: int, body: PhanCongKhoaPatchBody,
                          admin=Depends(auth.require_admin)):
    conn = db.get_connection()
    try:
        row = conn.execute('SELECT id FROM phan_cong_khoa WHERE id=?', (id,)).fetchone()
        if not row:
            raise HTTPException(404, 'Không tìm thấy phân công')
        if body.so_luong_muc_tieu is not None:
            if body.so_luong_muc_tieu < 0:
                raise HTTPException(400, 'Số lượng mục tiêu phải >= 0')
            conn.execute('UPDATE phan_cong_khoa SET so_luong_muc_tieu=? WHERE id=?',
                         (body.so_luong_muc_tieu, id))
        if body.ghi_chu is not None:
            conn.execute('UPDATE phan_cong_khoa SET ghi_chu=? WHERE id=?',
                         (body.ghi_chu, id))
        conn.commit()
        row = conn.execute(
            'SELECT pck.*, kp.ten AS ten_khoa FROM phan_cong_khoa pck '
            'JOIN khoa_phong kp ON kp.id = pck.khoa_phong_id WHERE pck.id=?',
            (id,)).fetchone()
    finally:
        conn.close()
    return dict(row)


@router.delete('/phan-cong-khoa/{id}')
def delete_phan_cong_khoa(id: int, admin=Depends(auth.require_admin)):
    conn = db.get_connection()
    try:
        row = conn.execute('SELECT id FROM phan_cong_khoa WHERE id=?', (id,)).fetchone()
        if not row:
            raise HTTPException(404, 'Không tìm thấy phân công')
        conn.execute('DELETE FROM phan_cong_khoa WHERE id=?', (id,))
        conn.commit()
    finally:
        conn.close()
    return {'ok': True}
