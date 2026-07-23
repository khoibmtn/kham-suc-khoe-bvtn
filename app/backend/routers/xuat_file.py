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

from urllib.parse import quote

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import FileResponse, Response
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


@router.post('/xuat-file/xlsx-don-thuan')
def xuat_xlsx_don_thuan(body: PreviewBody, admin=Depends(auth.require_admin)):
    """Xuất .xlsx ĐƠN THUẦN (1 sheet 'Trên 18', không macro/dropdown) và trả
    file tải về NGAY — không job nền/đĩa nên chạy được CẢ trên bản đám mây
    lẫn local. KHÔNG nộp Bộ được (thiếu validation/VBA); dùng để rà soát,
    đối chiếu nhanh."""
    conn = db.get_connection()
    try:
        try:
            data, count = export_xlsm.build_plain_xlsx(
                conn, body.pham_vi, body.gia_tri, body.include_errors)
        except ValueError as e:
            raise HTTPException(400, str(e))
    finally:
        conn.close()
    import datetime
    fn = f'KSK_DonThuan_{count}ca_{datetime.datetime.now():%Y%m%d_%H%M}.xlsx'
    return Response(
        content=data,
        media_type=('application/vnd.openxmlformats-officedocument'
                    '.spreadsheetml.sheet'),
        headers={'Content-Disposition': f"attachment; filename*=UTF-8''{quote(fn)}"})


@router.post('/xuat-file')
def start_export(body: StartBody, admin=Depends(auth.require_admin)):
    # Job xuất .xlsm chạy NỀN bằng subprocess + ghi job.json ra đĩa
    # (data/exports/) — không khả thi trên serverless (mỗi request là 1
    # container riêng, không có tiến trình nền/đĩa bền). Khóa theo biến
    # VERCEL (chỉ có trên bản đám mây), KHÔNG khóa theo TURSO_URL: máy local
    # vẫn có thể set TURSO_URL để NỐI DB online rồi xuất .xlsm chính thức.
    if os.getenv('VERCEL'):
        raise HTTPException(
            409, 'Xuất file .xlsm chưa hỗ trợ trên bản chạy đám mây — hãy '
                 'chạy app trên máy cá nhân (xem hướng dẫn câu lệnh ở trang '
                 'này), hoặc dùng nút "Tải .xlsx đơn thuần" ngay tại đây.')
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
