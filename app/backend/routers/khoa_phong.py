# -*- coding: utf-8 -*-
"""
khoa_phong.py — danh mục khoa/phòng (criterion 3): xem, thêm, sửa tên/trạng
thái. KHÔNG xóa cứng — vô hiệu hóa (dang_hoat_dong=0) khi đã có nhân viên/
phân công gắn.

GET  /api/khoa-phong  — mọi user đã đăng nhập (dropdown ở trang Người dùng/
                         Phân công).
POST /api/khoa-phong   — admin, tạo mới, 409 nếu tên trùng.
PATCH /api/khoa-phong/{id} — admin, sửa tên và/hoặc dang_hoat_dong.
"""
import os
import sys
from typing import Optional

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
import db  # noqa: E402
import auth  # noqa: E402

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

router = APIRouter(prefix='/api', tags=['khoa_phong'])


@router.get('/khoa-phong')
def list_khoa_phong(user=Depends(auth.get_current_user)):
    conn = db.get_connection()
    try:
        rows = conn.execute(
            'SELECT id, ten, dang_hoat_dong FROM khoa_phong ORDER BY ten').fetchall()
    finally:
        conn.close()
    return [dict(r) for r in rows]


class KhoaPhongBody(BaseModel):
    ten: str


@router.post('/khoa-phong')
def create_khoa_phong(body: KhoaPhongBody, admin=Depends(auth.require_admin)):
    ten = body.ten.strip()
    if not ten:
        raise HTTPException(400, 'Tên khoa/phòng không được để trống')
    conn = db.get_connection()
    try:
        exists = conn.execute('SELECT 1 FROM khoa_phong WHERE ten=?', (ten,)).fetchone()
        if exists:
            raise HTTPException(409, 'Tên khoa/phòng đã tồn tại')
        cur = conn.execute('INSERT INTO khoa_phong(ten) VALUES (?)', (ten,))
        conn.commit()
        new_id = cur.lastrowid
    finally:
        conn.close()
    return {'id': new_id, 'ten': ten, 'dang_hoat_dong': 1}


class KhoaPhongPatchBody(BaseModel):
    ten: Optional[str] = None
    dang_hoat_dong: Optional[int] = None


@router.patch('/khoa-phong/{id}')
def patch_khoa_phong(id: int, body: KhoaPhongPatchBody, admin=Depends(auth.require_admin)):
    conn = db.get_connection()
    try:
        row = conn.execute('SELECT * FROM khoa_phong WHERE id=?', (id,)).fetchone()
        if not row:
            raise HTTPException(404, 'Không tìm thấy khoa/phòng')

        if body.ten is not None:
            ten = body.ten.strip()
            if not ten:
                raise HTTPException(400, 'Tên khoa/phòng không được để trống')
            trung = conn.execute('SELECT 1 FROM khoa_phong WHERE ten=? AND id<>?',
                                  (ten, id)).fetchone()
            if trung:
                raise HTTPException(409, 'Tên khoa/phòng đã tồn tại')
            conn.execute('UPDATE khoa_phong SET ten=? WHERE id=?', (ten, id))

        if body.dang_hoat_dong is not None:
            if body.dang_hoat_dong not in (0, 1):
                raise HTTPException(400, 'dang_hoat_dong phải là 0 hoặc 1')
            conn.execute('UPDATE khoa_phong SET dang_hoat_dong=? WHERE id=?',
                         (body.dang_hoat_dong, id))

        conn.commit()
        row = conn.execute('SELECT id, ten, dang_hoat_dong FROM khoa_phong '
                            'WHERE id=?', (id,)).fetchone()
    finally:
        conn.close()
    return dict(row)
