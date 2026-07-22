# -*- coding: utf-8 -*-
"""
api/index.py — điểm vào Vercel (Vercel Python nhận diện serverless function
trong thư mục api/). Nạp app FastAPI thật ở app/backend/main.py mà KHÔNG di
chuyển code (giữ nguyên import nội bộ). Mọi request được vercel.json rewrite
về đây; FastAPI tự định tuyến cả /api/* lẫn tĩnh (frontend).
"""
import importlib.util
import os
import sys

_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))  # gốc repo
_BACKEND = os.path.join(_ROOT, 'app', 'backend')
if _BACKEND not in sys.path:
    sys.path.insert(0, _BACKEND)

_spec = importlib.util.spec_from_file_location(
    'ksk_backend_main', os.path.join(_BACKEND, 'main.py'))
_backend_main = importlib.util.module_from_spec(_spec)
sys.modules['ksk_backend_main'] = _backend_main
_spec.loader.exec_module(_backend_main)

app = _backend_main.app  # Vercel/ASGI cần biến tên `app`
