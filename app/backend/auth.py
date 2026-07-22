# -*- coding: utf-8 -*-
"""
auth.py — đăng nhập theo session cookie KÝ HMAC, KHÔNG TRẠNG THÁI PHÍA SERVER
(Đợt 9 criterion 1).

Trước đây: token ngẫu nhiên -> dict RAM (_SESSIONS) ánh xạ tới user_id. Trên
Render free, server khởi động lại thường xuyên (ngủ sau 15' không hoạt động +
mỗi lần deploy) -> dict bị xóa sạch -> cookie cũ còn nhưng server không nhận
ra -> 401 "Chưa đăng nhập" NGẪU NHIÊN dù người dùng chưa hề đăng xuất.

Bây giờ: cookie tự chứa toàn bộ thông tin cần thiết -> không cần tra dict.
  - Khóa bí mật `session_secret` sinh 1 lần bằng secrets.token_hex(32), lưu
    bền trong bảng cai_dat (khoa='session_secret') — bảng này nằm trong DB
    SQLite được Litestream sao lưu/khôi phục liên tục nên sống sót qua mọi
    lần restart/deploy (không như dict RAM).
  - Token = base64url(payload) + '.' + chữ ký HMAC-SHA256(payload, secret),
    payload = "{user_id}.{unix_timestamp_het_han}". Verify lại bằng
    hmac.compare_digest (chống timing attack) + kiểm tra hạn.
  - get_current_user verify chữ ký + hạn, rồi tra DB để chắc user vẫn tồn
    tại và đang hoạt động (dang_hoat_dong=1) — tài khoản bị khóa/xóa sau khi
    token đã phát hành sẽ bị chặn ngay ở request kế tiếp.

Mật khẩu lưu dạng 'pbkdf2$iter$salt_hex$hash_hex' (khớp import_data.py:_pbkdf2).
"""
import base64
import hashlib
import hmac
import os
import secrets
import sys
import time
from typing import Optional

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import db  # noqa: E402

from fastapi import APIRouter, Depends, HTTPException, Request, Response
from pydantic import BaseModel

router = APIRouter(prefix='/api', tags=['auth'])

COOKIE_NAME = 'ksk_session'
SESSION_MAX_AGE = 7 * 86400  # 7 ngày (criterion 1)

# Cache trong tiến trình sau lần đọc/tạo đầu tiên — an toàn để đọc lại DB mỗi
# khi cache rỗng (vd nhiều worker/process): INSERT dùng ON CONFLICT DO NOTHING
# nên chỉ 1 giá trị "thắng" và mọi worker cuối cùng đều đọc thấy cùng secret.
_secret_cache: Optional[str] = None


def _get_secret(conn=None):
    """SELECT gia_tri FROM cai_dat WHERE khoa='session_secret'; chưa có thì
    sinh secrets.token_hex(32) rồi INSERT, trả về."""
    global _secret_cache
    if _secret_cache:
        return _secret_cache
    own = conn is None
    if own:
        conn = db.get_connection()
    try:
        row = conn.execute(
            "SELECT gia_tri FROM cai_dat WHERE khoa='session_secret'").fetchone()
        if not row or not row['gia_tri']:
            new_secret = secrets.token_hex(32)
            conn.execute(
                'INSERT INTO cai_dat(khoa, gia_tri) VALUES (?,?) '
                'ON CONFLICT(khoa) DO NOTHING', ('session_secret', new_secret))
            conn.commit()
            row = conn.execute(
                "SELECT gia_tri FROM cai_dat WHERE khoa='session_secret'").fetchone()
        _secret_cache = row['gia_tri']
        return _secret_cache
    finally:
        if own:
            conn.close()


def _sign(payload_str, secret):
    return hmac.new(secret.encode('utf-8'), payload_str.encode('utf-8'),
                     hashlib.sha256).hexdigest()


def make_token(user_id, secret, max_age=SESSION_MAX_AGE):
    payload = f'{user_id}.{int(time.time()) + max_age}'
    b64 = base64.urlsafe_b64encode(payload.encode('utf-8')).decode('ascii').rstrip('=')
    return f'{b64}.{_sign(payload, secret)}'


def verify_token(token, secret):
    """Trả user_id (int) nếu chữ ký khớp + chưa hết hạn, None nếu không."""
    if not token or '.' not in token:
        return None
    b64_payload, _, sig = token.rpartition('.')
    if not b64_payload or not sig:
        return None
    padded = b64_payload + '=' * (-len(b64_payload) % 4)
    try:
        payload_str = base64.urlsafe_b64decode(padded.encode('ascii')).decode('utf-8')
    except Exception:
        return None
    expected_sig = _sign(payload_str, secret)
    if not hmac.compare_digest(expected_sig, sig):
        return None
    try:
        uid_str, exp_str = payload_str.split('.', 1)
        user_id = int(uid_str)
        exp = int(exp_str)
    except (ValueError, TypeError):
        return None
    if exp < int(time.time()):
        return None
    return user_id


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
def login(body: LoginBody, request: Request, response: Response):
    conn = db.get_connection()
    try:
        row = conn.execute(
            'SELECT * FROM nguoi_dung WHERE ten_dang_nhap=?',
            (body.ten_dang_nhap,)).fetchone()
        if not row or not _pbkdf2_verify(body.mat_khau, row['mat_khau_hash']):
            raise HTTPException(401, 'Sai tên đăng nhập hoặc mật khẩu')
        if not row['dang_hoat_dong']:
            raise HTTPException(
                403, 'Tài khoản đã bị vô hiệu hóa. Vui lòng liên hệ quản trị viên.')
        secret = _get_secret(conn)
    finally:
        conn.close()

    token = make_token(row['id'], secret)
    # Cookie 'secure' cần HTTPS để trình duyệt gửi lại — bật khi request tới
    # qua https (Render production), tắt khi http (test local cổng 8896) để
    # không phá luồng đăng nhập lúc dev.
    secure = request.url.scheme == 'https'
    response.set_cookie(COOKIE_NAME, token, httponly=True, samesite='lax',
                         secure=secure, max_age=SESSION_MAX_AGE, path='/')
    return _user_public(row)


@router.post('/logout')
def logout(response: Response):
    response.delete_cookie(COOKIE_NAME, path='/')
    return {'ok': True}


def get_current_user(request: Request):
    token = request.cookies.get(COOKIE_NAME)
    conn = db.get_connection()
    try:
        secret = _get_secret(conn)
        user_id = verify_token(token, secret) if token else None
        if not user_id:
            raise HTTPException(401, 'Chưa đăng nhập')
        row = conn.execute(
            'SELECT * FROM nguoi_dung WHERE id=? AND dang_hoat_dong=1',
            (user_id,)).fetchone()
    finally:
        conn.close()
    if not row:
        # Token còn hạn/chữ ký đúng nhưng user đã bị xóa/vô hiệu hóa SAU khi
        # phát hành token — chặn ngay ở request kế tiếp, gộp chung 401 với
        # "chưa đăng nhập" để frontend xử lý bằng đúng 1 luồng (criterion 2).
        raise HTTPException(401, 'Chưa đăng nhập')
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
