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


def _thu_muc(sub='auto'):
    d = os.path.join(config.BACKUP_DIR, sub)
    os.makedirs(d, exist_ok=True)
    return d


def backup_now(sub='auto'):
    """Sao lưu ngay lập tức (DB SỐNG -> file mới trong thư mục `sub`), trả về
    đường dẫn file mới tạo. `sub='manual'` dùng cho nút bấm tay ở trang Xuất
    file — KHÔNG bị dọn bớt (chỉ `_prune()` áp cho thư mục 'auto')."""
    ts = datetime.datetime.now().strftime('%Y%m%d_%H%M%S')
    dest = os.path.join(_thu_muc(sub), f'ksk_{ts}.db')
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
    d = _thu_muc('auto')
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
                    # `last` cập nhật NGAY sau backup_now() (trước _prune) —
                    # phản hồi anh Khôi: bug cũ ở _prune() (gọi nhầm hàm
                    # không tồn tại) ném lỗi trước dòng `last = ...`, khiến
                    # `last` KHÔNG BAO GIỜ cập nhật -> mỗi vòng poll (30s)
                    # đều tưởng "đã quá hạn" -> sao lưu dồn dập mỗi 30s suốt
                    # ngày dù cài đặt là 30 phút, ĐỒNG THỜI _prune() luôn lỗi
                    # nên không dọn bản cũ -> đầy ổ cứng rất nhanh. Cập nhật
                    # `last` NGAY để lỗi ở bước dọn dẹp (nếu có, dù đã sửa)
                    # không bao giờ làm hỏng lại nhịp sao lưu.
                    backup_now()
                    last = time.time()
                    _prune(cfg.get('backup_giu_so_ban', 100))
        except Exception:
            pass  # lỗi 1 vòng không được làm chết luồng nền
        time.sleep(_POLL_GIAY)


def start():
    threading.Thread(target=_loop, daemon=True, name='auto_backup').start()


# ---- Đợt 16 (phản hồi anh Khôi): backup thủ công + liệt kê + khôi phục ----
# Quét TOÀN BỘ *.db dưới BACKUP_DIR (mọi thư mục con: auto/, manual/,
# before_restore/, và các bản .db rời rạc ở gốc như sao lưu hằng ngày) —
# admin thấy hết mọi bản có sẵn, không phân biệt nguồn gốc.
def list_backups():
    """Trả list {ten, duong_dan (TƯƠNG ĐỐI trong BACKUP_DIR — dùng lại khi
    gọi restore_backup), kich_thuoc (byte), thoi_gian (ISO)} — sắp mới nhất
    trước."""
    out = []
    for root, _dirs, files in os.walk(config.BACKUP_DIR):
        for f in files:
            if not f.endswith('.db'):
                continue
            full = os.path.join(root, f)
            try:
                st = os.stat(full)
            except OSError:
                continue
            rel = os.path.relpath(full, config.BACKUP_DIR)
            out.append({
                'ten': f, 'duong_dan': rel, 'kich_thuoc': st.st_size,
                'thoi_gian': datetime.datetime.fromtimestamp(
                    st.st_mtime).isoformat(timespec='seconds'),
            })
    out.sort(key=lambda x: x['thoi_gian'], reverse=True)
    return out


def restore_backup(duong_dan_tuong_doi):
    """Khôi phục DB SỐNG từ 1 bản backup đã liệt kê (đường dẫn TƯƠNG ĐỐI
    trong BACKUP_DIR — validate chống path traversal, chỉ chấp nhận file
    nằm trong BACKUP_DIR). LUÔN tạo 1 bản AN TOÀN của DB hiện tại (thư mục
    before_restore/) TRƯỚC KHI ghi đè — để hoàn tác được nếu chọn nhầm bản.
    Dùng sqlite3 backup API (không copy file thô) — an toàn hơn khi có
    request khác đang mở DB cùng lúc (đặt busy_timeout chờ khoá thay vì lỗi
    ngay). Trả đường dẫn bản an toàn vừa tạo."""
    full = os.path.realpath(os.path.join(config.BACKUP_DIR, duong_dan_tuong_doi))
    root = os.path.realpath(config.BACKUP_DIR)
    if not (full == root or full.startswith(root + os.sep)):
        raise ValueError('Đường dẫn backup không hợp lệ')
    if not os.path.isfile(full):
        raise ValueError('Không tìm thấy file backup')

    safety_path = backup_now(sub='before_restore')

    src = sqlite3.connect(full)
    try:
        dst = sqlite3.connect(config.DB_PATH)
        try:
            dst.execute('PRAGMA busy_timeout=15000')
            src.backup(dst)
        finally:
            dst.close()
    finally:
        src.close()
    return safety_path
