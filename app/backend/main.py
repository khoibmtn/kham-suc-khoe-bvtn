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
from starlette.types import Scope

from routers import (ho_so, benh, icd, phan_cong, nguoi_dung, xuat_file,  # noqa: E402
                      dashboard, sinh_hieu, cai_dat, khoa_phong, phan_cong_khoa,
                      danh_sach)


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


def _sao_luu_hang_ngay():
    """Sao lưu DB sang data/backups/YYYY-MM-DD.db mỗi ngày (bỏ qua nếu đã có
    bản của hôm nay), giữ 30 bản gần nhất. Quan trọng khi chạy 1 máy LAN —
    phòng hỏng đĩa / lỡ tay. Chạy lúc khởi động server."""
    import shutil
    import datetime
    import glob
    if not os.path.isfile(config.DB_PATH):
        return
    bdir = os.path.join(config.DATA_DIR, 'backups')
    os.makedirs(bdir, exist_ok=True)
    dest = os.path.join(bdir, datetime.date.today().isoformat() + '.db')
    if not os.path.exists(dest):
        try:
            shutil.copy2(config.DB_PATH, dest)
        except OSError:
            return
    cu = sorted(glob.glob(os.path.join(bdir, '*.db')))
    for old in cu[:-30]:            # giữ 30 bản mới nhất
        try:
            os.remove(old)
        except OSError:
            pass


@asynccontextmanager
async def lifespan(app_: FastAPI):
    serverless = bool(os.getenv('TURSO_URL'))
    # Giai đoạn 1 PLAN_VERCEL.md criterion 4: bỏ sao lưu file (Turso lo bền)
    # khi chạy serverless; giữ nguyên hành vi local.
    # SERVERLESS: KHÔNG chạy init_schema/snapshot lúc khởi động. Vercel spawn
    # NHIỀU instance dưới tải cao (25 người) -> mỗi cold-start mà chạy schema
    # DDL + GHI snapshot vào Turso => ghi dồn, chậm, góp phần 504. Turso đã có
    # sẵn schema (chạy 1 lần lúc thiết lập); schema đổi thì áp thủ công trên
    # Turso. Local giữ nguyên hành vi cũ (init + snapshot + sao lưu).
    if not serverless:
        _sao_luu_hang_ngay()
        try:
            conn = db.get_connection()
            try:
                db.init_schema(conn)
                if conn.execute('SELECT COUNT(*) FROM ho_so').fetchone()[0] > 0:
                    _snapshot_hom_nay(conn)
            finally:
                conn.close()
        except Exception:
            raise
        # Sao lưu định kỳ theo phút (chỉnh ở trang Cài đặt) — luồng nền riêng,
        # khác _sao_luu_hang_ngay() ở trên (1 bản/ngày lúc khởi động).
        from services import auto_backup
        auto_backup.start()
    yield


app = FastAPI(title='KSK NCT — Quản lý & rà soát', version='0.4.0-phase4', lifespan=lifespan)


# ------------------------------------------------------------------
# BẢO TRÌ trên Vercel (Đợt 13): dưới tải 25 người, serverless+Turso mở kết
# nối mới mỗi request -> cạn kết nối -> 500/504. Đã chuyển tạm sang bản chạy
# local + tunnel. Chặn MỌI truy cập vào bản Vercel (nhận diện bằng biến
# VERCEL Vercel tự đặt) để 25 người KHÔNG ghi dữ liệu ở 2 nơi lệch nhau. Bản
# LOCAL (không có biến VERCEL) hoạt động BÌNH THƯỜNG. Gỡ bảo trì = revert
# commit này.
from fastapi.responses import HTMLResponse  # noqa: E402

_BAO_TRI_HTML = """<!doctype html><html lang="vi"><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>KSK NCT — Đang bảo trì</title>
<body style="font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif;
background:#f3f5f7;color:#1a1a1a;display:flex;align-items:center;
justify-content:center;height:100vh;margin:0">
<div style="background:#fff;max-width:520px;padding:32px;border-radius:10px;
box-shadow:0 2px 16px rgba(0,0,0,.1);text-align:center">
<h2 style="margin-top:0">Hệ thống đang chuyển địa chỉ</h2>
<p style="color:#475569;line-height:1.6">Địa chỉ này (Vercel) đã <b>tạm dừng</b>
để tránh nhập liệu ở hai nơi. Vui lòng dùng <b>ĐỊA CHỈ MỚI</b> do quản trị
(anh Khôi) cung cấp.</p>
<p style="color:#c0392b"><b>KHÔNG nhập liệu tại đây</b> — dữ liệu sẽ không được
lưu.</p>
</div></body></html>"""


@app.middleware('http')
async def _chan_vercel_bao_tri(request, call_next):
    if os.getenv('VERCEL'):
        return HTMLResponse(_BAO_TRI_HTML, status_code=503)
    return await call_next(request)


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
app.include_router(khoa_phong.router)
app.include_router(phan_cong_khoa.router)
app.include_router(danh_sach.router)


_APP_VER_CACHE = {'val': None, 'at': 0.0}


@app.get('/api/app-version')
def app_version():
    """Phiên bản frontend = mtime MỚI NHẤT của mọi file tĩnh (.js/.css/.html).
    Client poll endpoint này; khi số đổi (do deploy/sửa frontend) thì tự tải
    lại trang -> ép mọi máy đang mở dùng bản mới mà không cần bấm tay. Cache
    10s để không quét thư mục mỗi request."""
    import time
    now = time.time()
    if _APP_VER_CACHE['val'] is not None and now - _APP_VER_CACHE['at'] < 10:
        return {'version': _APP_VER_CACHE['val']}
    latest = 0.0
    for root, _dirs, files in os.walk(config.FRONTEND_DIR):
        for f in files:
            if f.endswith(('.js', '.css', '.html')):
                try:
                    latest = max(latest, os.path.getmtime(os.path.join(root, f)))
                except OSError:
                    pass
    ver = int(latest)
    _APP_VER_CACHE['val'] = ver
    _APP_VER_CACHE['at'] = now
    return {'version': ver}


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


class NoCacheStaticFiles(StaticFiles):
    """Đợt 10 criterion 1: gắn Cache-Control: no-cache cho MỌI tài sản tĩnh
    (index.html, /js/*.js, /app.css...) để mỗi lần deploy trình duyệt luôn
    revalidate thay vì dùng bản cache cũ (gốc rễ "lỗi ma" sau deploy). Chỉ
    ảnh hưởng mount tĩnh này — /api/* dùng router riêng, không đi qua đây."""

    async def get_response(self, path: str, scope: Scope):
        resp = await super().get_response(path, scope)
        resp.headers['Cache-Control'] = 'no-cache, must-revalidate'
        resp.headers['Pragma'] = 'no-cache'
        return resp


# Stub tĩnh cho frontend — sẽ có index.html/app.js/app.css thật ở Phase 1.
if os.path.isdir(config.FRONTEND_DIR):
    app.mount('/', NoCacheStaticFiles(directory=config.FRONTEND_DIR, html=True),
              name='frontend')
