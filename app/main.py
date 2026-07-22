# -*- coding: utf-8 -*-
"""
app/main.py — điểm vào Vercel (Giai đoạn 1 PLAN_VERCEL.md criterion 2).

Vercel (theo vercel.json ở gốc repo, xem `functions`/`rewrites`) trỏ vào
CHÍNH FILE NÀY và cần tìm thấy biến ASGI `app`. File thật sự (routers,
db.py, config.py...) vẫn nằm nguyên trong backend/ — không di chuyển gì cả,
tránh phải sửa lại toàn bộ import nội bộ (§9 SPEC — không viết lại những gì
đã chạy đúng).

Cục bộ (local dev qua ./run.sh) KHÔNG dùng file này — run.sh gọi thẳng
`uvicorn main:app --app-dir backend`. File này CHỈ phục vụ Vercel.
"""
import importlib.util
import os
import sys

_BACKEND_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'backend')
if _BACKEND_DIR not in sys.path:
    sys.path.insert(0, _BACKEND_DIR)

# Nạp backend/main.py bằng importlib (thay vì `from main import app`) để
# KHÔNG va tên module với chính file này (Vercel có thể nạp file entrypoint
# dưới tên module 'main' tuỳ runtime — dùng tên module riêng ('ksk_backend_main')
# tránh đụng độ sys.modules trong mọi trường hợp). backend/main.py tự chèn
# chính nó vào sys.path ở dòng đầu (`sys.path.insert(0, dirname(__file__))`)
# nên các import bare bên trong nó ('import config', 'import db',
# 'from routers import ...') vẫn hoạt động y hệt lúc chạy local
# (`uvicorn main:app --app-dir backend`) — không phải sửa gì trong backend/.
_spec = importlib.util.spec_from_file_location(
    'ksk_backend_main', os.path.join(_BACKEND_DIR, 'main.py'))
_backend_main = importlib.util.module_from_spec(_spec)
sys.modules['ksk_backend_main'] = _backend_main
_spec.loader.exec_module(_backend_main)

app = _backend_main.app  # noqa: F401 — Vercel/ASGI cần đúng tên biến `app`
