# -*- coding: utf-8 -*-
"""db.py — kết nối SQLite dùng chung cho backend."""
import os
import sqlite3
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import config  # noqa: E402


def get_connection():
    config.ensure_dirs()
    conn = sqlite3.connect(config.DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute('PRAGMA foreign_keys = ON')
    return conn


def init_schema(conn=None):
    """Chạy schema.sql (idempotent nhờ IF NOT EXISTS)."""
    own = conn is None
    if own:
        conn = get_connection()
    with open(config.SCHEMA_SQL, encoding='utf-8') as f:
        conn.executescript(f.read())
    conn.commit()
    if own:
        conn.close()


def table_counts(conn):
    """Đếm nhanh số dòng mỗi bảng chính — dùng cho /api/health."""
    out = {}
    for t in ('nguoi_dung', 'ho_so', 'benh', 'dm_icd', 'nhat_ky',
              'phan_cong', 'danh_muc'):
        try:
            out[t] = conn.execute(f'SELECT COUNT(*) FROM {t}').fetchone()[0]
        except sqlite3.OperationalError:
            out[t] = None
    return out
