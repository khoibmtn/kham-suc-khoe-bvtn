# -*- coding: utf-8 -*-
"""
phan_cong.py — admin giao hồ sơ cho cán bộ theo xã / khoảng mã / danh sách
chọn tay (§3.1). Ghi vào `phan_cong` VÀ cập nhật `ho_so.nguoi_ra_soat_id`
cho các bản ghi khớp phạm vi.

Định dạng `pham_vi_gia_tri` theo `pham_vi_loai`:
  - 'xa'        : các tên xã/phường ngăn cách bởi dấu phẩy
                  (vd 'Phường Nam Triệu,Xã Việt Khê')
  - 'khoang_ma' : 'MA_TU..MA_DEN' (vd '31006-2026-00001..31006-2026-00100')
  - 'danh_sach' : các mã hồ sơ ngăn cách bởi dấu phẩy
"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
import db  # noqa: E402
import auth  # noqa: E402

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from typing import Optional

router = APIRouter(prefix='/api', tags=['phan_cong'])


class PhanCongBody(BaseModel):
    nguoi_dung_id: int
    pham_vi_loai: str
    pham_vi_gia_tri: str
    ghi_chu: Optional[str] = None


def _matching_where(pham_vi_loai, pham_vi_gia_tri):
    if pham_vi_loai == 'xa':
        vals = [v.strip() for v in pham_vi_gia_tri.split(',') if v.strip()]
        if not vals:
            raise HTTPException(400, 'Thiếu tên xã/phường')
        return f"maxa_cu_tru IN ({','.join('?' * len(vals))})", vals
    if pham_vi_loai == 'khoang_ma':
        if '..' not in pham_vi_gia_tri:
            raise HTTPException(400, "Định dạng khoảng mã phải là 'MA_TU..MA_DEN'")
        tu, den = pham_vi_gia_tri.split('..', 1)
        return 'ma_ho_so BETWEEN ? AND ?', [tu.strip(), den.strip()]
    if pham_vi_loai == 'danh_sach':
        vals = [v.strip() for v in pham_vi_gia_tri.split(',') if v.strip()]
        if not vals:
            raise HTTPException(400, 'Danh sách mã hồ sơ rỗng')
        return f"ma_ho_so IN ({','.join('?' * len(vals))})", vals
    raise HTTPException(400, "pham_vi_loai phải là 'xa' | 'khoang_ma' | 'danh_sach'")


@router.post('/phan-cong')
def phan_cong(body: PhanCongBody, admin=Depends(auth.require_admin)):
    if body.pham_vi_loai not in ('xa', 'khoang_ma', 'danh_sach'):
        raise HTTPException(400, "pham_vi_loai phải là 'xa' | 'khoang_ma' | 'danh_sach'")

    conn = db.get_connection()
    try:
        target = conn.execute('SELECT id FROM nguoi_dung WHERE id=? AND '
                               'dang_hoat_dong=1', (body.nguoi_dung_id,)).fetchone()
        if not target:
            raise HTTPException(404, 'Không tìm thấy cán bộ')

        where_sql, args = _matching_where(body.pham_vi_loai, body.pham_vi_gia_tri)

        cur = conn.execute(
            'INSERT INTO phan_cong(nguoi_dung_id, pham_vi_loai, pham_vi_gia_tri, '
            'ghi_chu) VALUES (?,?,?,?)',
            (body.nguoi_dung_id, body.pham_vi_loai, body.pham_vi_gia_tri, body.ghi_chu))
        phan_cong_id = cur.lastrowid

        n = conn.execute(
            f'UPDATE ho_so SET nguoi_ra_soat_id=? WHERE {where_sql}',
            [body.nguoi_dung_id] + args).rowcount
        conn.commit()
    finally:
        conn.close()
    return {'ok': True, 'phan_cong_id': phan_cong_id, 'so_ho_so_gan': n}


@router.get('/phan-cong')
def list_phan_cong(admin=Depends(auth.require_admin)):
    conn = db.get_connection()
    try:
        rows = conn.execute(
            'SELECT pc.*, nd.ho_ten AS ten_can_bo FROM phan_cong pc '
            'JOIN nguoi_dung nd ON nd.id = pc.nguoi_dung_id '
            'ORDER BY pc.ngay_giao DESC').fetchall()
    finally:
        conn.close()
    return [dict(r) for r in rows]
