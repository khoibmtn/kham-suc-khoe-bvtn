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
from services import sinh_hieu_valid, auto_backup, batch_sinh_hieu, git_update  # noqa: E402

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from typing import Optional

router = APIRouter(prefix='/api', tags=['cai_dat'])

_REQUIRED_KEYS = ('mach', 'can_nang', 'chieu_cao', 'ha_tam_thu', 'ha_tam_truong')


@router.get('/cai-dat')
def get_cai_dat(user=Depends(auth.get_current_user)):
    conn = db.get_connection()
    try:
        nguong = sinh_hieu_valid.load_nguong(conn)
        tu_dong = auto_backup.load_tu_dong(conn)
    finally:
        conn.close()
    return {'nguong_sinh_hieu': nguong, 'tu_dong': tu_dong,
            'sao_luu_gan_nhat': auto_backup.lan_gan_nhat()}


class CaiDatBody(BaseModel):
    nguong_sinh_hieu: Optional[dict] = None
    tu_dong: Optional[dict] = None


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


_TU_DONG_BOOL_KEYS = ('backup_bat', 'cap_nhat_bat')
_TU_DONG_INT_KEYS = ('backup_phut', 'backup_giu_so_ban', 'cap_nhat_phut')


def _validate_tu_dong(tu_dong):
    if not isinstance(tu_dong, dict):
        raise HTTPException(400, 'tu_dong phải là object')
    out = dict(auto_backup.DEFAULTS)
    for k, v in tu_dong.items():
        if k in _TU_DONG_BOOL_KEYS:
            out[k] = bool(v)
        elif k in _TU_DONG_INT_KEYS:
            try:
                n = int(v)
            except (TypeError, ValueError):
                raise HTTPException(400, f"'{k}' phải là số nguyên")
            if n < 1:
                raise HTTPException(400, f"'{k}' phải >= 1")
            out[k] = n
        # bỏ qua khoá lạ (tương thích ngược khi mở rộng sau này)
    return out


@router.put('/cai-dat')
def put_cai_dat(body: CaiDatBody, admin=Depends(auth.require_admin)):
    conn = db.get_connection()
    try:
        out = {}
        if body.nguong_sinh_hieu is not None:
            _validate_shape(body.nguong_sinh_hieu)
            conn.execute(
                'INSERT INTO cai_dat(khoa, gia_tri) VALUES (?,?) '
                'ON CONFLICT(khoa) DO UPDATE SET gia_tri=excluded.gia_tri',
                ('nguong_sinh_hieu', json.dumps(body.nguong_sinh_hieu, ensure_ascii=False)))
            out['nguong_sinh_hieu'] = body.nguong_sinh_hieu
        if body.tu_dong is not None:
            tu_dong = _validate_tu_dong(body.tu_dong)
            conn.execute(
                'INSERT INTO cai_dat(khoa, gia_tri) VALUES (?,?) '
                'ON CONFLICT(khoa) DO UPDATE SET gia_tri=excluded.gia_tri',
                ('tu_dong', json.dumps(tu_dong, ensure_ascii=False)))
            out['tu_dong'] = tu_dong
        conn.commit()
    finally:
        conn.close()
    return out


@router.post('/admin/ra-soat-sinh-hieu')
def ra_soat_sinh_hieu(apply: bool = Query(False), admin=Depends(auth.require_admin)):
    """Chạy rà soát toàn DB theo sinh hiệu (điền BMI/PL thể lực còn trống,
    nâng Tuần hoàn theo CSST, tự thêm bệnh chính, nâng Sức khỏe chung) — cùng
    logic scripts/batch_sinh_hieu.py, gọi được TỪ XA qua nút bấm trong app
    (Cài đặt), không cần mở CMD trên máy chạy server. apply=false (mặc định)
    chỉ đếm (dry-run), không ghi gì; apply=true mới thực sự ghi."""
    conn = db.get_connection()
    try:
        return batch_sinh_hieu.chay(conn, apply, admin['id'])
    finally:
        conn.close()


@router.post('/admin/cap-nhat-ngay')
def cap_nhat_ngay(admin=Depends(auth.require_admin)):
    """Kéo bản mới từ Git NGAY (thay vì chờ vòng lặp auto_update.bat hoặc gõ
    lệnh cmd trên máy chủ) — bấm từ trang Cài đặt. Nếu code backend đổi, tự
    khởi động lại server (chỉ trên Windows — nơi server thật sự chạy);
    khởi động lại làm GIÁN ĐOẠN tạm thời cho MỌI người dùng đang thao tác."""
    return git_update.pull_now()
