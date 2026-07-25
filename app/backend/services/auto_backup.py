# -*- coding: utf-8 -*-
"""
auto_backup.py — sao lưu DB định kỳ theo phút, khoảng cách CHỈNH ĐƯỢC ở màn
Cài đặt (cai_dat.khoa='tu_dong', khoá `backup_phut`/`backup_bat`/
`backup_giu_so_ban`). Khác `_sao_luu_hang_ngay` trong main.py (1 bản/NGÀY,
lúc khởi động) — đây là luồng NỀN chạy suốt vòng đời server, đọc lại cài đặt
mỗi vòng (đổi số phút trong UI có hiệu lực ngay, không cần khởi động lại).

Dùng sqlite3.Connection.backup() — API sao lưu CHÍNH THỨC của thư viện chuẩn
(an toàn khi DB đang được ghi, khác hẳn copy file thô), không phụ thuộc lệnh
`sqlite3` CLI (không chắc có sẵn trên Windows)."""
import datetime
import json
import os
import sqlite3
import threading
import time

import config

_POLL_GIAY = 30
_KHOA = 'tu_dong'
DEFAULTS = {
    'backup_bat': True, 'backup_phut': 10, 'backup_giu_so_ban': 100,
    'cap_nhat_bat': True, 'cap_nhat_phut': 5,
}


def load_tu_dong(conn):
    row = conn.execute('SELECT gia_tri FROM cai_dat WHERE khoa=?', (_KHOA,)).fetchone()
    out = dict(DEFAULTS)
    if row and row['gia_tri']:
        try:
            out.update(json.loads(row['gia_tri']))
        except (TypeError, ValueError):
            pass
    return out


def _thu_muc_auto():
    d = os.path.join(config.BACKUP_DIR, 'auto')
    os.makedirs(d, exist_ok=True)
    return d


def backup_now():
    """Sao lưu ngay lập tức, trả về đường dẫn file mới tạo."""
    ts = datetime.datetime.now().strftime('%Y%m%d_%H%M%S')
    dest = os.path.join(_thu_muc_auto(), f'ksk_{ts}.db')
    src = sqlite3.connect(config.DB_PATH)
    try:
        dst = sqlite3.connect(dest)
        try:
            src.backup(dst)
        finally:
            dst.close()
    finally:
        src.close()
    return dest


def _prune(giu_so_ban):
    d = _thu_muc_auto()
    files = sorted(
        (os.path.join(d, f) for f in os.listdir(d) if f.endswith('.db')),
        key=os.path.getmtime, reverse=True)
    for f in files[max(1, int(giu_so_ban)):]:
        try:
            os.remove(f)
        except OSError:
            pass


def lan_gan_nhat():
    """ISO timestamp bản sao lưu tự động gần nhất, None nếu chưa có."""
    d = os.path.join(config.BACKUP_DIR, 'auto')
    if not os.path.isdir(d):
        return None
    files = [os.path.join(d, f) for f in os.listdir(d) if f.endswith('.db')]
    if not files:
        return None
    newest = max(files, key=os.path.getmtime)
    return datetime.datetime.fromtimestamp(os.path.getmtime(newest)).isoformat(timespec='seconds')


def _loop():
    import db  # import trễ — tránh vòng lặp import khi module này nạp lúc khởi động
    last = 0.0
    while True:
        try:
            conn = db.get_connection()
            try:
                cfg = load_tu_dong(conn)
            finally:
                conn.close()
            if cfg.get('backup_bat', True):
                interval = max(1, int(cfg.get('backup_phut', 10))) * 60
                if time.time() - last >= interval:
                    backup_now()
                    _prune(cfg.get('backup_giu_so_ban', 100))
                    last = time.time()
        except Exception:
            pass  # lỗi 1 vòng không được làm chết luồng nền
        time.sleep(_POLL_GIAY)


def start():
    threading.Thread(target=_loop, daemon=True, name='auto_backup').start()
