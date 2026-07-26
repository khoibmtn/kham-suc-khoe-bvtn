# -*- coding: utf-8 -*-
"""
services/csst.py — Phân loại Chỉ số sinh tồn (CSST: Mạch + Huyết áp theo băng
tuổi, QĐ1613 mục 45/46). Tách riêng từ services/batch_sinh_hieu.py để
routers/benh.py (đường thời gian thực) và services/batch_sinh_hieu.py (rà
soát toàn DB) dùng CHUNG một bộ ngưỡng, tránh lệch nhau.

KHÔNG import routers.benh hay services.batch_sinh_hieu (tránh vòng import) —
module này chỉ chứa hàm thuần, không phụ thuộc DB.
"""
import re


def tuoi(row):
    t = row['tuoi']
    if t not in (None, ''):
        try:
            t = int(t)
            if t > 0:
                return t
        except (ValueError, TypeError):
            pass
    m = re.search(r'(\d{4})$', str(row['ngay_sinh'] or ''))
    if m:
        nam = int(m.group(1))
        if nam > 1900:
            import datetime
            return datetime.date.today().year - nam
    return None


def classify_mach(bpm):
    if bpm is None or bpm <= 0:
        return None
    if bpm < 55:
        return 4
    if bpm <= 59:
        return 3
    if bpm <= 75:
        return 1
    if bpm <= 85:
        return 2
    if bpm <= 95:
        return 3
    return 4


def _cls_sys(sys_val, tuoi):
    if tuoi is not None and tuoi < 30:      # 45.1 (<30t)
        if sys_val < 100:
            return 4
        if sys_val <= 125:
            return 1
        if sys_val <= 135:
            return 2
        if sys_val <= 140:
            return 3
        return 4
    if sys_val < 140:                        # 45.2 (>=30t)
        return 1
    if sys_val <= 150:
        return 3
    return 4


def _cls_dia(dia, tuoi):
    if tuoi is not None and tuoi < 30:       # 45.1
        if dia < 60:
            return 4
        if dia <= 64:
            return 2
        if dia <= 85:
            return 1
        if dia <= 89:
            return 2
        if dia <= 95:
            return 3
        return 4
    if dia < 90:                             # 45.2
        return 1
    if dia <= 95:
        return 3
    return 4


def _parse_ha(s):
    m = re.search(r'(\d{2,3})\s*[/\-]\s*(\d{2,3})', s or '')
    return (int(m.group(1)), int(m.group(2))) if m else (None, None)


def classify_huyet_ap(ha, tuoi):
    sys_val, dia = _parse_ha(ha)
    if sys_val is None:
        return None, sys_val, dia
    return max(_cls_sys(sys_val, tuoi), _cls_dia(dia, tuoi)), sys_val, dia


def ly_do_tang_csst(l_mach, mach_text, l_ha, sys_val, dia_val):
    """Chuỗi lý do CSST Loại II+ để chèn vào 'Khám Tuần hoàn' — vd
    'Mạch 92 l/ph; HA 154/90 mmHg'. Trả None nếu KHÔNG chỉ số nào đạt
    Loại II+. l_mach/l_ha ĐỘC LẬP nhau — cả 2 cùng >=2 thì ghi CẢ 2."""
    ly_do = []
    if l_mach is not None and l_mach >= 2 and mach_text:
        ly_do.append(f'Mạch {mach_text} l/ph')
    if l_ha is not None and l_ha >= 2 and sys_val is not None and dia_val is not None:
        ly_do.append(f'HA {sys_val}/{dia_val} mmHg')
    return '; '.join(ly_do) if ly_do else None


def ap_dung_ly_do_tuan_hoan(hien_tai, ly_do_moi):
    """'Bình thường'/trống -> THAY THẾ; khác -> NỐI THÊM bằng '; '.
    Idempotent: bỏ qua nếu ly_do_moi đã có sẵn NGUYÊN VĂN trong chuỗi
    hiện tại."""
    if not ly_do_moi:
        return hien_tai
    cur = (hien_tai or '').strip()
    if not cur or cur == 'Bình thường':
        return ly_do_moi
    if ly_do_moi in cur:
        return cur
    return f'{cur}; {ly_do_moi}'
