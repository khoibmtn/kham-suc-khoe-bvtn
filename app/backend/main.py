# -*- coding: utf-8 -*-
"""
main.py — FastAPI app: Phase 0 (/api/health) + Phase 1 (rà soát) + Phase 2
(xuất file) + Phase 3 (dashboard) + Phase 4 (sinh hiệu hàng loạt).
"""
import json
import os
import sys
from contextlib import asynccontextmanager

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import config  # noqa: E402
import db  # noqa: E402
import auth  # noqa: E402
from services import qc  # noqa: E402

from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles
from fastapi.responses import JSONResponse

from routers import (ho_so, benh, icd, phan_cong, nguoi_dung, xuat_file,  # noqa: E402
                      dashboard, sinh_hieu, cai_dat)


def _snapshot_hom_nay(conn):
    """§8.4 / CRITERIA.md "cờ đỏ theo ngày": ghi 1 dòng snapshot_ngay mỗi
    ngày (idempotent — INSERT OR IGNORE theo khoá ngay) lúc khởi động server,
    để dashboard vẽ đường "cờ đỏ giảm theo ngày" kể cả khi server chỉ chạy
    gián đoạn theo ca làm việc."""
    today = conn.execute("SELECT date('now','localtime')").fetchone()[0]
    exists = conn.execute('SELECT 1 FROM snapshot_ngay WHERE ngay=?', (today,)).fetchone()
    if exists:
        return
    red_sql, red_args = qc.red_flag_where()
    so_co_do = conn.execute(f'SELECT COUNT(*) FROM ho_so WHERE {red_sql}', red_args).fetchone()[0]
    so_da_ra_soat = conn.execute(
        "SELECT COUNT(*) FROM ho_so WHERE trang_thai='hoan_thanh'").fetchone()[0]
    chi_tiet = {}
    for ma in qc.FLAG_META:
        chi_tiet[ma] = conn.execute(
            "SELECT COUNT(*) FROM ho_so WHERE (';'||co_qc||';') LIKE ?",
            (f'%;{ma};%',)).fetchone()[0]
    conn.execute(
        'INSERT OR IGNORE INTO snapshot_ngay(ngay, so_co_do, so_da_ra_soat, chi_tiet_co) '
        'VALUES (?,?,?,?)', (today, so_co_do, so_da_ra_soat, json.dumps(chi_tiet, ensure_ascii=False)))
    conn.commit()


@asynccontextmanager
async def lifespan(app_: FastAPI):
    conn = db.get_connection()
    try:
        db.init_schema(conn)
        if conn.execute('SELECT COUNT(*) FROM ho_so').fetchone()[0] > 0:
            _snapshot_hom_nay(conn)
    finally:
        conn.close()
    yield


app = FastAPI(title='KSK NCT — Quản lý & rà soát', version='0.4.0-phase4', lifespan=lifespan)

app.include_router(auth.router)
app.include_router(ho_so.router)
app.include_router(benh.router)
app.include_router(icd.router)
app.include_router(phan_cong.router)
app.include_router(nguoi_dung.router)
app.include_router(xuat_file.router)
app.include_router(dashboard.router)
app.include_router(sinh_hieu.router)
app.include_router(cai_dat.router)


@app.get('/api/health')
def health():
    conn = db.get_connection()
    try:
        counts = db.table_counts(conn)
    finally:
        conn.close()
    return JSONResponse({
        'status': 'ok',
        'db_path': config.DB_PATH,
        'counts': counts,
    })


# Stub tĩnh cho frontend — sẽ có index.html/app.js/app.css thật ở Phase 1.
if os.path.isdir(config.FRONTEND_DIR):
    app.mount('/', StaticFiles(directory=config.FRONTEND_DIR, html=True),
              name='frontend')
