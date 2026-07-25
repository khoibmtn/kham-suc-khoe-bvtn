# -*- coding: utf-8 -*-
"""
batch_sinh_hieu.py — CLI mỏng, gọi services/batch_sinh_hieu.chay() (logic đầy
đủ + tài liệu ở đó). Dùng khi chạy tay/cron trực tiếp trên máy server (không
qua HTTP). Từ 2026-07 cũng có nút bấm tương đương trong app -> Cài đặt ->
"Rà soát & tự động phân loại" (POST /api/admin/ra-soat-sinh-hieu), tiện hơn
khi cần chạy TỪ XA qua tunnel mà không cần mở CMD trên máy server.

Chạy:
  .venv/bin/python scripts/batch_sinh_hieu.py            # dry-run
  .venv/bin/python scripts/batch_sinh_hieu.py --apply    # ghi thật
"""
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
BACKEND = os.path.join(os.path.dirname(HERE), 'backend')
sys.path.insert(0, BACKEND)

import db  # noqa: E402
from services import batch_sinh_hieu  # noqa: E402


def main(apply):
    conn = db.get_connection()
    admin = conn.execute(
        "SELECT id FROM nguoi_dung WHERE ten_dang_nhap='admin'").fetchone()
    admin_id = admin['id'] if admin else None
    try:
        kq = batch_sinh_hieu.chay(conn, apply, admin_id)
    finally:
        conn.close()

    print(f"{'ĐÃ GHI' if kq['apply'] else 'DRY-RUN'} | hồ sơ quét: {kq['tong_quet']}")
    print(f"  Điền BMI còn trống    : {kq['dien_bmi']}")
    print(f"  Điền PL thể lực trống : {kq['dien_pl_the_luc']}")
    print(f"  Nâng Tuần hoàn (CSST) : {kq['nang_tuan_hoan']}")
    print(f"  Thêm bệnh chính       : {kq['them_benh_chinh']}  {kq['them_benh_chinh_theo_ma']}")
    print(f"  Gỡ cờ CO_PHAN_LOAI    : {kq['go_co']}")
    print(f"  Nâng Sức khỏe chung   : {kq['nang_suc_khoe_chung']}")


if __name__ == '__main__':
    main('--apply' in sys.argv)
