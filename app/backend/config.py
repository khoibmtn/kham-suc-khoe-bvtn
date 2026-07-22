# -*- coding: utf-8 -*-
"""
config.py — đường dẫn dùng chung cho toàn bộ backend.

Toàn bộ code ứng dụng nằm trong app/. Các đường dẫn dưới đây trỏ RA NGOÀI
app/ chỉ để ĐỌC dữ liệu nguồn (output/, doc/) và TÁI DÙNG pipeline (build/)
— không sửa các thư mục đó (§9 SPEC).
"""
import os
import sys

# app/backend/config.py -> app/backend -> app -> kham-suc-khoe (project root)
APP_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PROJECT_ROOT = os.path.dirname(APP_DIR)

BUILD_DIR = os.path.join(PROJECT_ROOT, 'build')
OUTPUT_DIR = os.path.join(PROJECT_ROOT, 'output')
DOC_DIR = os.path.join(PROJECT_ROOT, 'doc')

# Nguồn nạp chính (§1.1 SPEC)
SRC_QUANLY_XLSX = os.path.join(OUTPUT_DIR, 'KSK_DuLieuQuanLy_TOANBO.xlsx')
# File mẫu Bộ Y tế — vừa là danh mục (§1.2), vừa là template xuất file (P2)
CATALOG_XLSM = os.path.join(DOC_DIR, 'Import_KSK_Tren 18.xlsm')

# CSDL SQLite của ứng dụng
DATA_DIR = os.path.join(APP_DIR, 'data')
DB_PATH = os.path.join(DATA_DIR, 'ksk.db')
BACKUP_DIR = os.path.join(DATA_DIR, 'backups')
SCHEMA_SQL = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'schema.sql')

FRONTEND_DIR = os.path.join(APP_DIR, 'frontend')

# Đợt 4 — đổi tên đơn vị hành chính sau sắp xếp 2025: chỉ "Việt Khê" còn là
# Xã, các đơn vị còn lại đều là Phường. Dict dùng chung cho
# backend/scripts/doi_ten_xa_phuong.py (migration DB hiện có) VÀ
# backend/import_data.py (áp ngay khi nạp dữ liệu mới — không hồi sinh tên
# cũ khi re-import).
XA_DOI_TEN = {
    'Xã Lê Ích Mộc': 'Phường Lê Ích Mộc',
    'Xã Lưu Kiếm': 'Phường Lưu Kiếm',
    'Xã Nam Triệu': 'Phường Nam Triệu',
}


def ensure_build_on_path():
    """Cho phép `import classify, tien_su, mapper, build_import, build_xlsm`
    trực tiếp từ build/ — KHÔNG viết lại pipeline chuẩn hóa (§9 SPEC)."""
    if BUILD_DIR not in sys.path:
        sys.path.insert(0, BUILD_DIR)


def ensure_dirs():
    os.makedirs(DATA_DIR, exist_ok=True)
    os.makedirs(BACKUP_DIR, exist_ok=True)
