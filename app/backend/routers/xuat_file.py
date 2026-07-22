# -*- coding: utf-8 -*-
"""
xuat_file.py — Pipeline 2: xuất file .xlsm nộp Bộ Y tế (§7 SPEC), admin-only.

Job chạy NỀN (thread) trong services/export_xlsm.py — mỗi xã lại là một
tiến trình con riêng (services/export_worker.py) để tránh tích luỹ bộ nhớ
openpyxl (bẫy §10). Endpoint khởi tạo job rồi trả job_id ngay; frontend
polling GET /api/xuat-file/jobs/{id} để theo dõi tiến độ.
"""
import os
import sys
from typing import List, Optional

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
import db  # noqa: E402
import auth  # noqa: E402
from services import export_xlsm  # noqa: E402

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import FileResponse
from pydantic import BaseModel

router = APIRouter(prefix='/api', tags=['xuat_file'])


class ExtendedOpt(BaseModel):
    enabled: bool = False
    columns: List[str] = []


class PreviewBody(BaseModel):
    pham_vi: str
    gia_tri: List[str] = []
    include_errors: bool = False


class StartBody(PreviewBody):
    extended: Optional[ExtendedOpt] = None


@router.get('/xuat-file/cot-mo-rong')
def cot_mo_rong(admin=Depends(auth.require_admin)):
    """Danh mục cột mở rộng cho user tick chọn (§7.2)."""
    return [{'ma': c, 'ten': t} for c, t in export_xlsm.EXTENDED_COLUMNS]


@router.post('/xuat-file/preview')
def preview(body: PreviewBody, admin=Depends(auth.require_admin)):
    conn = db.get_connection()
    try:
        try:
            result = export_xlsm.preview(conn, body.pham_vi, body.gia_tri,
                                          body.include_errors)
        except ValueError as e:
            raise HTTPException(400, str(e))
    finally:
        conn.close()
    return result


def _job_public(job):
    return {k: v for k, v in job.items() if k != 'job_dir'}


@router.post('/xuat-file')
def start_export(body: StartBody, admin=Depends(auth.require_admin)):
    extended = body.extended.model_dump() if body.extended else {'enabled': False, 'columns': []}
    try:
        job = export_xlsm.create_job(body.pham_vi, body.gia_tri,
                                      body.include_errors, extended, admin['id'])
    except ValueError as e:
        raise HTTPException(400, str(e))
    return _job_public(job)


@router.get('/xuat-file/jobs')
def list_jobs(admin=Depends(auth.require_admin)):
    return [_job_public(j) for j in export_xlsm.list_jobs()]


@router.get('/xuat-file/jobs/{job_id}')
def get_job(job_id: str, admin=Depends(auth.require_admin)):
    job = export_xlsm.get_job(job_id)
    if not job:
        raise HTTPException(404, 'Không tìm thấy job')
    return _job_public(job)


@router.get('/xuat-file/download')
def download(path: str = Query(...), admin=Depends(auth.require_admin)):
    """Chỉ cho tải file bên trong app/data/exports/ — chặn path traversal."""
    exports_dir = os.path.realpath(export_xlsm.EXPORTS_DIR)
    real = os.path.realpath(path)
    if not (real == exports_dir or real.startswith(exports_dir + os.sep)):
        raise HTTPException(403, 'Đường dẫn không hợp lệ')
    if not os.path.isfile(real):
        raise HTTPException(404, 'Không tìm thấy file')
    return FileResponse(real, filename=os.path.basename(real))
