# -*- coding: utf-8 -*-
"""
auth.py — đăng nhập theo session cookie (token ngẫu nhiên + dict phía server,
không thêm dependency ký/mã hoá — xem PLAN.md "Quyết định mặc định").

Mật khẩu lưu dạng 'pbkdf2$iter$salt_hex$hash_hex' (khớp import_data.py:_pbkdf2).
"""
import hashlib
import os
import secrets
import sys
from typing import Optional

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import db  # noqa: E402

from fastapi import APIRouter, Depends, HTTPException, Request, Response
from pydantic import BaseModel

router = APIRouter(prefix='/api', tags=['auth'])

COOKIE_NAME = 'ksk_session'
SESSION_MAX_AGE = 60 * 60 * 12  # 12 giờ

# token -> user_id (in-memory; mất khi restart server — chấp nhận được cho
# quy mô nội bộ này, tránh phải thêm dependency itsdangerous).
_SESSIONS = {}


def _pbkdf2_hash(password, salt=None, iterations=200_000):
    salt = salt or secrets.token_hex(16)
    h = hashlib.pbkdf2_hmac('sha256', password.encode('utf-8'),
                             bytes.fromhex(salt), iterations)
    return f'pbkdf2${iterations}${salt}${h.hex()}'


def _pbkdf2_verify(password, stored_hash):
    try:
        scheme, iterations, salt_hex, hash_hex = stored_hash.split('$')
    except (ValueError, AttributeError):
        return False
    if scheme != 'pbkdf2':
        return False
    h = hashlib.pbkdf2_hmac('sha256', password.encode('utf-8'),
                             bytes.fromhex(salt_hex), int(iterations))
    return secrets.compare_digest(h.hex(), hash_hex)


def hash_password(password):
    return _pbkdf2_hash(password)


class LoginBody(BaseModel):
    ten_dang_nhap: str
    mat_khau: str


def _user_public(row):
    return {
        'id': row['id'],
        'ten_dang_nhap': row['ten_dang_nhap'],
        'ho_ten': row['ho_ten'],
        'vai_tro': row['vai_tro'],
    }


@router.post('/login')
def login(body: LoginBody, response: Response):
    conn = db.get_connection()
    try:
        row = conn.execute(
            'SELECT * FROM nguoi_dung WHERE ten_dang_nhap=?',
            (body.ten_dang_nhap,)).fetchone()
    finally:
        conn.close()
    if not row or not _pbkdf2_verify(body.mat_khau, row['mat_khau_hash']):
        raise HTTPException(401, 'Sai tên đăng nhập hoặc mật khẩu')
    if not row['dang_hoat_dong']:
        raise HTTPException(
            403, 'Tài khoản đã bị vô hiệu hóa. Vui lòng liên hệ quản trị viên.')
    token = secrets.token_hex(24)
    _SESSIONS[token] = row['id']
    response.set_cookie(COOKIE_NAME, token, httponly=True, samesite='lax',
                         max_age=SESSION_MAX_AGE)
    return _user_public(row)


@router.post('/logout')
def logout(request: Request, response: Response):
    token = request.cookies.get(COOKIE_NAME)
    if token in _SESSIONS:
        del _SESSIONS[token]
    response.delete_cookie(COOKIE_NAME)
    return {'ok': True}


def get_current_user(request: Request):
    token = request.cookies.get(COOKIE_NAME)
    user_id = _SESSIONS.get(token) if token else None
    if not user_id:
        raise HTTPException(401, 'Chưa đăng nhập')
    conn = db.get_connection()
    try:
        row = conn.execute('SELECT * FROM nguoi_dung WHERE id=?',
                            (user_id,)).fetchone()
    finally:
        conn.close()
    if not row:
        raise HTTPException(401, 'Người dùng không tồn tại')
    if not row['dang_hoat_dong']:
        # Tài khoản bị vô hiệu hóa SAU KHI đã đăng nhập (§criterion 2) — session
        # đang mở phải chết ngay ở request kế tiếp, không chỉ chặn lúc /login.
        raise HTTPException(
            403, 'Tài khoản đã bị vô hiệu hóa. Vui lòng liên hệ quản trị viên.')
    return dict(row)


def require_admin(user=Depends(get_current_user)):
    if user['vai_tro'] != 'admin':
        raise HTTPException(403, 'Chỉ admin mới được thực hiện thao tác này')
    return user


@router.get('/me')
def me(user=Depends(get_current_user)):
    return _user_public(user)


class MeUpdateBody(BaseModel):
    ho_ten: Optional[str] = None
    mat_khau_cu: Optional[str] = None
    mat_khau_moi: Optional[str] = None


@router.patch('/me')
def update_me(body: MeUpdateBody, user=Depends(get_current_user)):
    """Màn "Tài khoản của tôi" (mọi user, criterion 3): đổi họ tên và/hoặc
    đổi mật khẩu (bắt nhập mật khẩu cũ). ten_dang_nhap và vai_tro KHÔNG đổi
    được qua endpoint này (không nhận field đó ở BaseModel)."""
    ho_ten_moi = (body.ho_ten or '').strip()
    conn = db.get_connection()
    try:
        if ho_ten_moi:
            conn.execute('UPDATE nguoi_dung SET ho_ten=? WHERE id=?',
                         (ho_ten_moi, user['id']))

        if body.mat_khau_moi:
            if not body.mat_khau_cu or not _pbkdf2_verify(
                    body.mat_khau_cu, user['mat_khau_hash']):
                raise HTTPException(400, 'Mật khẩu cũ không đúng')
            conn.execute('UPDATE nguoi_dung SET mat_khau_hash=? WHERE id=?',
                         (_pbkdf2_hash(body.mat_khau_moi), user['id']))

        conn.commit()
        row = conn.execute('SELECT * FROM nguoi_dung WHERE id=?',
                            (user['id'],)).fetchone()
    finally:
        conn.close()
    return _user_public(row)
