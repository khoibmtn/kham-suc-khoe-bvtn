# -*- coding: utf-8 -*-
"""
cai_dat.py — Đợt 3 criterion 1: cài đặt ngưỡng sinh hiệu.

GET /api/cai-dat  — mọi user đã đăng nhập.
PUT /api/cai-dat  — chỉ admin.
"""
import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
import db  # noqa: E402
import auth  # noqa: E402
from services import sinh_hieu_valid  # noqa: E402

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

router = APIRouter(prefix='/api', tags=['cai_dat'])

_REQUIRED_KEYS = ('mach', 'can_nang', 'chieu_cao', 'ha_tam_thu', 'ha_tam_truong')


@router.get('/cai-dat')
def get_cai_dat(user=Depends(auth.get_current_user)):
    conn = db.get_connection()
    try:
        nguong = sinh_hieu_valid.load_nguong(conn)
    finally:
        conn.close()
    return {'nguong_sinh_hieu': nguong}


class CaiDatBody(BaseModel):
    nguong_sinh_hieu: dict


def _validate_shape(nguong):
    """Kiểm tra hình dạng: đủ 5 khoá, mỗi khoá {min,max} là số, min < max
    (criterion 1 "validates shape (numbers, min<max) then saves")."""
    if not isinstance(nguong, dict):
        raise HTTPException(400, 'nguong_sinh_hieu phải là object')
    missing = [k for k in _REQUIRED_KEYS if k not in nguong]
    if missing:
        raise HTTPException(400, f'Thiếu ngưỡng bắt buộc: {", ".join(missing)}')
    for key, v in nguong.items():
        if not isinstance(v, dict) or 'min' not in v or 'max' not in v:
            raise HTTPException(400, f"Ngưỡng '{key}' phải có dạng {{min, max}}")
        try:
            mn = float(v['min'])
            mx = float(v['max'])
        except (TypeError, ValueError):
            raise HTTPException(400, f"Ngưỡng '{key}': min/max phải là số")
        if mn >= mx:
            raise HTTPException(400, f"Ngưỡng '{key}': min phải nhỏ hơn max")


@router.put('/cai-dat')
def put_cai_dat(body: CaiDatBody, admin=Depends(auth.require_admin)):
    nguong = body.nguong_sinh_hieu
    _validate_shape(nguong)
    conn = db.get_connection()
    try:
        conn.execute(
            'INSERT INTO cai_dat(khoa, gia_tri) VALUES (?,?) '
            'ON CONFLICT(khoa) DO UPDATE SET gia_tri=excluded.gia_tri',
            ('nguong_sinh_hieu', json.dumps(nguong, ensure_ascii=False)))
        conn.commit()
    finally:
        conn.close()
    return {'nguong_sinh_hieu': nguong}
