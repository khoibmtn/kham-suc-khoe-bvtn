# -*- coding: utf-8 -*-
"""
danh_sach.py — "Danh sách tùy chỉnh" (collection nhiều-nhiều với ho_so),
khuôn mẫu khoa_phong.py. 2 bảng danh_sach/danh_sach_ho_so ĐÃ CÓ SẴN trong
schema.sql (xem ghi chú db.py:_migrate_snapshot_danh_dau_xuat — đợt trước đã
chụp snapshot danh_dau_xuat vào 1 danh sách mẫu). Dùng CHUNG cho mọi nhân
viên đã đăng nhập (không cần admin) — đây là công cụ làm việc hàng ngày
(gom case để xử lý/xuất file), không phải danh mục quản trị hệ thống.

GET    /api/danh-sach                    — liệt kê mọi danh sách + số lượng.
POST   /api/danh-sach                    — tạo danh sách mới, 409 nếu trùng tên.
DELETE /api/danh-sach/{id}                — xóa danh sách (không xóa hồ sơ).
POST   /api/danh-sach/{id}/them-ho-so     — thêm nhiều hồ sơ vào danh sách.
POST   /api/danh-sach/{id}/go-ho-so       — gỡ nhiều hồ sơ khỏi danh sách.
"""
import os
import sys
from typing import List

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
import db  # noqa: E402
import auth  # noqa: E402

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

router = APIRouter(prefix='/api', tags=['danh_sach'])


def _require_quyen_ghi(conn, danh_sach_id, user):
    """Chặn hành động GHI (xóa danh sách/thêm-bớt case) cho mọi người TRỪ
    người đã TẠO ra danh sách đó hoặc admin — xem/lọc theo danh sách (GET)
    KHÔNG bị giới hạn bởi hàm này, chỉ áp dụng cho DELETE/POST ghi dữ liệu.
    Trả về row {id, nguoi_tao_id} để nơi gọi tái dùng, tránh query lại."""
    row = conn.execute(
        'SELECT id, nguoi_tao_id FROM danh_sach WHERE id=?', (danh_sach_id,)).fetchone()
    if not row:
        raise HTTPException(404, 'Không tìm thấy danh sách')
    if user['vai_tro'] != 'admin' and row['nguoi_tao_id'] != user['id']:
        raise HTTPException(403, 'Chỉ người tạo danh sách này hoặc admin mới có quyền thao tác')
    return row


@router.get('/danh-sach')
def list_danh_sach(user=Depends(auth.get_current_user)):
    """Trả mọi danh sách (kể cả rỗng), kèm so_luong = đếm hồ sơ trong đó.
    Mở cho MỌI nhân viên xem/lọc như cũ (KHÔNG lọc theo chủ sở hữu) — chỉ
    thêm nguoi_tao_id vào response để frontend tự quyết định ẩn/disable nút
    ghi cho danh sách không phải của mình."""
    conn = db.get_connection()
    try:
        rows = conn.execute(
            'SELECT ds.id AS id, ds.ten AS ten, ds.nguoi_tao_id AS nguoi_tao_id, '
            'ds.thoi_diem_tao AS thoi_diem_tao, '
            'COUNT(dsh.id) AS so_luong '
            'FROM danh_sach ds LEFT JOIN danh_sach_ho_so dsh '
            'ON dsh.danh_sach_id = ds.id '
            'GROUP BY ds.id, ds.ten, ds.nguoi_tao_id, ds.thoi_diem_tao '
            'ORDER BY ds.ten').fetchall()
    finally:
        conn.close()
    return [dict(r) for r in rows]


class DanhSachBody(BaseModel):
    ten: str


@router.post('/danh-sach')
def create_danh_sach(body: DanhSachBody, user=Depends(auth.get_current_user)):
    ten = body.ten.strip()
    if not ten:
        raise HTTPException(400, 'Tên danh sách không được để trống')
    conn = db.get_connection()
    try:
        exists = conn.execute('SELECT 1 FROM danh_sach WHERE ten=?', (ten,)).fetchone()
        if exists:
            raise HTTPException(409, 'Tên danh sách đã tồn tại')
        cur = conn.execute(
            'INSERT INTO danh_sach(ten, nguoi_tao_id) VALUES (?, ?)',
            (ten, user['id']))
        conn.commit()
        new_id = cur.lastrowid
        row = conn.execute('SELECT thoi_diem_tao FROM danh_sach WHERE id=?',
                           (new_id,)).fetchone()
    finally:
        conn.close()
    return {'id': new_id, 'ten': ten, 'thoi_diem_tao': row['thoi_diem_tao'],
            'so_luong': 0}


@router.delete('/danh-sach/{id}')
def delete_danh_sach(id: int, user=Depends(auth.get_current_user)):
    """Xóa danh sách — CHỈ xóa liên kết (danh_sach_ho_so), KHÔNG đụng ho_so.
    db.py:_get_connection_local đã bật PRAGMA foreign_keys=ON nên
    ON DELETE CASCADE của danh_sach_ho_so.danh_sach_id tự dọn khi xóa
    danh_sach — vẫn tự DELETE tường minh trước (idempotent, vô hại nếu
    cascade đã xóa) để không phụ thuộc hoàn toàn vào cascade cho trường hợp
    chạy serverless (Turso, xem db.py:_get_connection_serverless — chưa xác
    nhận foreign_keys có bật)."""
    conn = db.get_connection()
    try:
        _require_quyen_ghi(conn, id, user)
        conn.execute('DELETE FROM danh_sach_ho_so WHERE danh_sach_id=?', (id,))
        conn.execute('DELETE FROM danh_sach WHERE id=?', (id,))
        conn.commit()
    finally:
        conn.close()
    return {'ok': True}


class HoSoListBody(BaseModel):
    ma_ho_so_list: List[str]


@router.post('/danh-sach/{id}/them-ho-so')
def them_ho_so_vao_danh_sach(id: int, body: HoSoListBody,
                              user=Depends(auth.get_current_user)):
    if not body.ma_ho_so_list:
        raise HTTPException(400, 'Danh sách mã hồ sơ không được để trống')
    conn = db.get_connection()
    try:
        _require_quyen_ghi(conn, id, user)
        # Lọc chỉ mã THẬT SỰ tồn tại trong ho_so trước khi insert — tránh lỗi
        # FK (danh_sach_ho_so.ma_ho_so REFERENCES ho_so) cho mã sai/đã xóa.
        placeholders = ','.join('?' * len(body.ma_ho_so_list))
        valid_rows = conn.execute(
            f'SELECT ma_ho_so FROM ho_so WHERE ma_ho_so IN ({placeholders})',
            body.ma_ho_so_list).fetchall()
        valid_ma = [r['ma_ho_so'] for r in valid_rows]
        so_luong_them = 0
        if valid_ma:
            before = conn.execute(
                'SELECT COUNT(*) FROM danh_sach_ho_so WHERE danh_sach_id=?',
                (id,)).fetchone()[0]
            conn.executemany(
                'INSERT OR IGNORE INTO danh_sach_ho_so(danh_sach_id, ma_ho_so) '
                'VALUES (?, ?)', [(id, ma) for ma in valid_ma])
            conn.commit()
            after = conn.execute(
                'SELECT COUNT(*) FROM danh_sach_ho_so WHERE danh_sach_id=?',
                (id,)).fetchone()[0]
            so_luong_them = after - before
    finally:
        conn.close()
    return {'ok': True, 'so_luong_them': so_luong_them}


@router.post('/danh-sach/{id}/go-ho-so')
def go_ho_so_khoi_danh_sach(id: int, body: HoSoListBody,
                             user=Depends(auth.get_current_user)):
    if not body.ma_ho_so_list:
        raise HTTPException(400, 'Danh sách mã hồ sơ không được để trống')
    conn = db.get_connection()
    try:
        _require_quyen_ghi(conn, id, user)
        placeholders = ','.join('?' * len(body.ma_ho_so_list))
        cur = conn.execute(
            f'DELETE FROM danh_sach_ho_so WHERE danh_sach_id=? '
            f'AND ma_ho_so IN ({placeholders})',
            [id] + body.ma_ho_so_list)
        conn.commit()
        so_luong_go = cur.rowcount if (cur.rowcount is not None and cur.rowcount >= 0) else 0
    finally:
        conn.close()
    return {'ok': True, 'so_luong_go': so_luong_go}
