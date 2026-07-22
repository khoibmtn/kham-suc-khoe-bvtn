# -*- coding: utf-8 -*-
"""
icd.py — tự động gợi ý ICD (§3.4.4, §5) trên dm_icd_fts.

Bẫy §10: mã dagger/asterisk ('E11.4†') phải tra được bằng mã trần ('E11.4').
Xử lý bằng LIKE trên dm_icd.ma_tran (đã bỏ hậu tố lúc nạp) TRƯỚC, sau đó bổ
sung kết quả từ FTS5 (khớp tên bệnh) nếu còn chỗ trống trong giới hạn.
"""
import os
import re
import sqlite3
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
import db  # noqa: E402
import auth  # noqa: E402

from fastapi import APIRouter, Depends

router = APIRouter(prefix='/api', tags=['icd'])


@router.get('/icd')
def search_icd(q: str = '', limit: int = 20,
               user=Depends(auth.get_current_user)):
    q = (q or '').strip()
    if not q:
        return []
    limit = max(1, min(limit, 50))
    conn = db.get_connection()
    try:
        results = {}  # ma -> ten, giữ thứ tự chèn (ưu tiên khớp mã trước)

        like_q = q.upper()
        for row in conn.execute(
                'SELECT ma, ten FROM dm_icd '
                'WHERE ma_tran LIKE ? OR ma LIKE ? '
                'ORDER BY length(ma) LIMIT ?',
                (f'{like_q}%', f'{like_q}%', limit)):
            results[row['ma']] = row['ten']

        if len(results) < limit:
            remaining = limit - len(results)
            # Chỉ tìm theo TÊN bệnh (cột `ten`), bỏ token quá ngắn (<2 ký tự)
            # — token 1 ký tự (vd '4' tách từ 'E11.4' vì dấu chấm không phải
            # ký tự từ) sẽ khớp bừa vào rất nhiều mã không liên quan.
            # AND các từ (mặc định FTS5 khi cách nhau bằng khoảng trắng) — để
            # 'tăng huyết áp' không bị lấn át bởi các mã chỉ khớp 1 từ 'huyết'.
            tokens = [t for t in re.findall(r'\w+', q, re.UNICODE) if len(t) >= 2]
            fts_q = ' '.join(f'ten:{t}*' for t in tokens) if tokens else None
            if fts_q:
                try:
                    for row in conn.execute(
                            'SELECT ma, ten FROM dm_icd_fts '
                            'WHERE dm_icd_fts MATCH ? LIMIT ?',
                            (fts_q, remaining)):
                        results.setdefault(row['ma'], row['ten'])
                except sqlite3.OperationalError:
                    pass  # câu truy vấn FTS5 không hợp lệ (ký tự đặc biệt) -> bỏ qua
    finally:
        conn.close()

    out = [{'ma': ma, 'ten': ten, 'label': f'{ma} — {ten}'}
           for ma, ten in results.items()]
    return out[:limit]
