# -*- coding: utf-8 -*-
"""
ngay_thang_valid.py — validation 3 trường ngày tháng dd/mm/yyyy (ngay_sinh,
ngay_vao, ngaycap_cccd) dùng CHUNG cho PATCH hồ sơ (routers/ho_so.py) và cờ
QC rà soát dữ liệu cũ (services/qc.py:sync_ngay_thang_flag) — phản hồi anh
Khôi: widget nhập ngày (frontend/js/widgets.js:renderDate) trước đây không
validate gì, nhân viên có thể lưu "01/01/144" (thiếu số), "30/02/2000" (ngày
không tồn tại), năm phi lý như "6195". Cần chặn ở tầng backend (phòng thủ 2
lớp, không chỉ tin frontend).

Cùng shape (changes, loi) như sinh_hieu_valid.validate_changes()/
normalize_numeric_changes(): loi = [{'field', 'ly_do'}]. KHÁC sinh_hieu_valid
ở chỗ hàm này KHÔNG chuẩn hoá giá trị (không có "dạng chuẩn" nào khác của 1
ngày hợp lệ dd/mm/yyyy) — chỉ trả lỗi, `changes` trả về nguyên vẹn.
"""
import datetime
import re

# 3 trường ngày tháng cần validate — khớp đúng 3 ô dùng renderDate() ở
# frontend/js/widgets.js.
DATE_FIELDS = ('ngay_sinh', 'ngay_vao', 'ngaycap_cccd')

_NHAN_TRUONG = {
    'ngay_sinh': 'Ngày sinh',
    'ngay_vao': 'Ngày vào',
    'ngaycap_cccd': 'Ngày cấp CCCD',
}

# dd/mm/yyyy — cho phép ngày/tháng 1-2 chữ số, năm 1-4 chữ số (rộng rãi ở
# tầng regex; giá trị NGOÀI khoảng hợp lệ hay KHÔNG tồn tại trong lịch bị bắt
# ở bước sau bằng datetime.date, không tự viết bảng số ngày/tháng tay).
_DATE_RE = re.compile(r'^(\d{1,2})/(\d{1,2})/(\d{1,4})$')

NAM_MIN = 1900


def _kiem_tra_1_ngay(raw):
    """Kiểm tra 1 giá trị ngày thô. Trả lý do lỗi (str) nếu KHÔNG hợp lệ,
    None nếu hợp lệ. Trống/None LUÔN hợp lệ (cho phép xoá — criterion 14)."""
    if raw in (None, ''):
        return None
    s = str(raw).strip()
    if s == '':
        return None
    m = _DATE_RE.match(s)
    if not m:
        return f'"{s}" không đúng định dạng dd/mm/yyyy'
    ngay, thang, nam = int(m.group(1)), int(m.group(2)), int(m.group(3))
    # Criterion 19: KHÔNG hardcode năm hiện tại — luôn tính động.
    nam_hien_tai = datetime.date.today().year
    if not (NAM_MIN <= nam <= nam_hien_tai):
        return (f'"{s}" có năm {nam} ngoài khoảng hợp lệ '
                f'({NAM_MIN}–{nam_hien_tai})')
    # Criterion 16: bắt ngày không tồn tại trong lịch (vd 30/02, 29/02 năm
    # không nhuận) bằng chính datetime.date — KHÔNG tự viết bảng số ngày/
    # tháng tay.
    try:
        datetime.date(nam, thang, ngay)
    except ValueError:
        return f'"{s}" không phải là ngày tồn tại trong lịch'
    return None


def validate_date_changes(changes_in):
    """changes_in: dict ui_field -> giá trị thô (có thể lẫn trường khác
    ngoài DATE_FIELDS — các trường đó không bị đụng tới).

    Trả (changes: changes_in nguyên vẹn — hàm này chỉ kiểm tra, không chuẩn
    hoá, loi: list[{'field','ly_do'}] — rỗng nếu tất cả hợp lệ/không có mặt
    trường ngày nào)."""
    loi = []
    for field in DATE_FIELDS:
        if field not in changes_in:
            continue
        ly_do = _kiem_tra_1_ngay(changes_in[field])
        if ly_do:
            loi.append({
                'field': field,
                'ly_do': f'{_NHAN_TRUONG[field]} {ly_do}',
            })
    return changes_in, loi
