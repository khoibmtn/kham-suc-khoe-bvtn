# -*- coding: utf-8 -*-
"""
doc_cai_dat_tu_dong.py — in cài đặt "tu_dong" (bật/tắt + khoảng phút của tự
động sao lưu & tự động cập nhật code) ra stdout dạng KHOA=GIA_TRI, mỗi dòng 1
khoá — để app\\auto_update.bat (Windows, không có JSON parser sẵn) đọc bằng
`for /f "tokens=1,2 delims==" %%a in (...)`.

Chạy:  .venv\\Scripts\\python.exe backend\\scripts\\doc_cai_dat_tu_dong.py
"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
import db  # noqa: E402
from services import auto_backup  # noqa: E402

conn = db.get_connection()
try:
    cfg = auto_backup.load_tu_dong(conn)
finally:
    conn.close()

for k, v in cfg.items():
    print(f'{k}={v}')
