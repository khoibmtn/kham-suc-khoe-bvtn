# -*- coding: utf-8 -*-
"""
sinh_hieu_valid.py — validation ngưỡng sinh hiệu dùng CHUNG cho PATCH sinh
hiệu (routers/sinh_hieu.py), PATCH hồ sơ (routers/ho_so.py) và import Excel
(routers/sinh_hieu.py:import_excel) — Đợt 3 criterion 2.

Ngưỡng lấy từ bảng cai_dat (khoa='nguong_sinh_hieu', criterion 1), có
fallback mặc định nếu bảng trống/hỏng.

Đợt 6 criterion 1: chuẩn hoá dấu thập phân (','->'.') cho MỌI trường số —
NUMERIC_FIELDS/normalize_numeric_changes() bên dưới. Áp dụng TRƯỚC bất kỳ
validate ngưỡng nào (VITAL_FIELDS chỉ là tập con có ràng buộc min/max).
"""
import json
import re

DEFAULT_NGUONG = {
    'mach': {'min': 10, 'max': 300},
    'can_nang': {'min': 20, 'max': 200},
    'chieu_cao': {'min': 100, 'max': 250},
    'ha_tam_thu': {'min': 60, 'max': 280},
    'ha_tam_truong': {'min': 20, 'max': 140},
}

# 4 trường sinh hiệu cốt lõi có ràng buộc ngưỡng (huyet_ap dùng CẢ 2 ngưỡng
# ha_tam_thu/ha_tam_truong bên trong chuan_hoa_huyet_ap()).
VITAL_FIELDS = ('chieu_cao', 'can_nang', 'mach', 'huyet_ap')

# Đợt 6 criterion 1: MỌI trường number cần chuẩn hoá dấu thập phân — nguồn
# CHÂN LÝ DUY NHẤT dùng chung PATCH /api/ho-so, PATCH /api/sinh-hieu và
# import Excel. Khớp 1:1 với NUMERIC_FIELD_CODES bên frontend/js/fields.js.
NUMERIC_FIELDS = (
    'chieu_cao', 'can_nang', 'glu_gia_tri', 'tai_trai_noi_thuong',
    'tai_trai_noi_tham', 'tai_phai_noi_thuong', 'tai_phai_noi_tham', 'mach',
)

# 3 trường lưu kiểu REAL trong schema (chieu_cao/can_nang/glu_gia_tri) — ép
# kiểu float sau khi chuẩn hoá thành công (mach/tai_* là TEXT, giữ chuỗi).
_FLOAT_CAST_FIELDS = {'chieu_cao', 'can_nang', 'glu_gia_tri'}

_SO_RE = re.compile(r'^\d+(\.\d+)?$')


def normalize_so(value):
    """Chuẩn hoá 1 giá trị số thô: trim, đổi DUY NHẤT 1 dấu phẩy thập phân
    thành dấu chấm (không đụng chuỗi đã có dấu chấm hoặc nhiều dấu phẩy —
    coi là lỗi định dạng), rồi validate dạng số nguyên/thập phân không dấu.

    Trả (gia_tri_chuan_hoa, hop_le: bool). Trống/None luôn hợp lệ (cho phép
    xoá trường). Giá trị không phải chuỗi (vd float từ openpyxl/JSON số) coi
    như đã hợp lệ, trả nguyên vẹn — không có dấu phẩy nào để chuẩn hoá."""
    if value in (None, ''):
        return value, True
    if not isinstance(value, str):
        return value, True
    s = value.strip()
    if s == '':
        return '', True
    if s.count(',') == 1 and '.' not in s:
        s = s.replace(',', '.')
    if _SO_RE.match(s):
        return s, True
    return None, False


def normalize_numeric_changes(changes_in):
    """Áp normalize_so() lên mọi trường thuộc NUMERIC_FIELDS có mặt trong
    changes_in (bỏ qua trường khác — đi qua nguyên vẹn qua `normalized`).

    Trả (normalized: dict cùng khoá với changes_in, loi: list[{'field',
    'ly_do'}] — rỗng nếu tất cả hợp lệ). Dùng CHUNG cho PATCH /api/ho-so,
    PATCH /api/sinh-hieu và import Excel (Đợt 6 criterion 1)."""
    normalized = dict(changes_in)
    loi = []
    for field in NUMERIC_FIELDS:
        if field not in changes_in:
            continue
        raw = changes_in[field]
        new_val, ok = normalize_so(raw)
        if not ok:
            loi.append({
                'field': field,
                'ly_do': f'Giá trị "{raw}" không phải là số hợp lệ',
            })
            continue
        if field in _FLOAT_CAST_FIELDS and new_val not in (None, ''):
            new_val = float(new_val)
        normalized[field] = new_val
    return normalized, loi


def load_nguong(conn):
    """Đọc ngưỡng từ bảng cai_dat; SEED mặc định vào DB nếu chưa có dòng nào
    (criterion 1 "seed default nguong_sinh_hieu JSON on first read if
    missing"). Trả dict luôn đủ 5 khoá (merge với default cho khoá thiếu)."""
    row = conn.execute(
        "SELECT gia_tri FROM cai_dat WHERE khoa='nguong_sinh_hieu'").fetchone()
    if row and row['gia_tri']:
        try:
            data = json.loads(row['gia_tri'])
            if isinstance(data, dict):
                merged = {k: dict(v) for k, v in DEFAULT_NGUONG.items()}
                for k, v in data.items():
                    if isinstance(v, dict) and 'min' in v and 'max' in v:
                        merged[k] = v
                return merged
        except (ValueError, TypeError):
            pass
    conn.execute(
        'INSERT OR IGNORE INTO cai_dat(khoa, gia_tri) VALUES (?,?)',
        ('nguong_sinh_hieu', json.dumps(DEFAULT_NGUONG, ensure_ascii=False)))
    conn.commit()
    return {k: dict(v) for k, v in DEFAULT_NGUONG.items()}


def _fmt_num(n):
    """500.0 -> '500'; 37.5 -> '37.5' (bỏ .0 thừa cho thông báo dễ đọc)."""
    f = float(n)
    if f == int(f):
        return str(int(f))
    return f'{f:g}'


def chuan_hoa_huyet_ap(raw, nguong):
    """Chuẩn hoá chuỗi huyết áp về dạng 'tâm_thu/tâm_trương'.

    Chấp nhận '120/80', '120 / 80', '120-80', hoặc chuỗi toàn số dạng
    '12080' (thử mọi cách tách 2 số sao cho tâm thu 2-3 chữ số, cả hai nằm
    trong ngưỡng và tâm thu > tâm trương; đúng 1 cách hợp lệ -> dùng cách đó;
    0 hoặc >1 cách hợp lệ -> không hợp lệ, lý do rõ ràng).

    Trả (chuoi_chuan_hoa|None, ly_do|None)."""
    if raw in (None, ''):
        return None, 'Huyết áp trống'
    s = str(raw).strip()
    if not s:
        return None, 'Huyết áp trống'

    ha = nguong.get('ha_tam_thu', DEFAULT_NGUONG['ha_tam_thu'])
    hd = nguong.get('ha_tam_truong', DEFAULT_NGUONG['ha_tam_truong'])

    def _valid_pair(sys_v, dia_v):
        return (ha['min'] <= sys_v <= ha['max']
                and hd['min'] <= dia_v <= hd['max']
                and sys_v > dia_v)

    for sep in ('/', '-'):
        if sep in s:
            parts = [p.strip() for p in s.split(sep)]
            if len(parts) != 2 or not all(p.isdigit() for p in parts):
                return None, (f"Huyết áp '{raw}' không đúng định dạng — cần "
                               "dạng tâm_thu/tâm_trương, ví dụ 120/80")
            sys_v, dia_v = int(parts[0]), int(parts[1])
            if not _valid_pair(sys_v, dia_v):
                return None, (
                    f'Huyết áp {sys_v}/{dia_v} ngoài ngưỡng cho phép '
                    f"(tâm thu {_fmt_num(ha['min'])}–{_fmt_num(ha['max'])}, "
                    f"tâm trương {_fmt_num(hd['min'])}–{_fmt_num(hd['max'])}, "
                    'tâm thu phải lớn hơn tâm trương)')
            return f'{sys_v}/{dia_v}', None

    if s.isdigit():
        valid_splits = []
        max_cut = min(4, len(s))  # tâm thu tối đa 3 chữ số -> cut in {2,3}
        for cut in range(2, max_cut):
            sys_str, dia_str = s[:cut], s[cut:]
            if not dia_str:
                continue
            sys_v, dia_v = int(sys_str), int(dia_str)
            if _valid_pair(sys_v, dia_v):
                valid_splits.append((sys_v, dia_v))
        if len(valid_splits) == 1:
            sys_v, dia_v = valid_splits[0]
            return f'{sys_v}/{dia_v}', None
        if len(valid_splits) == 0:
            return None, (
                f"Không tách được huyết áp '{raw}' thành tâm thu/tâm trương "
                f"hợp lệ trong ngưỡng cho phép (tâm thu "
                f"{_fmt_num(ha['min'])}–{_fmt_num(ha['max'])}, tâm trương "
                f"{_fmt_num(hd['min'])}–{_fmt_num(hd['max'])})")
        cach = ', '.join(f'{a}/{b}' for a, b in valid_splits)
        return None, (
            f"Huyết áp '{raw}' tách được nhiều cách hợp lệ ({cach}) — vui "
            "lòng nhập rõ dạng 'tâm_thu/tâm_trương'")

    return None, f"Huyết áp '{raw}' không đúng định dạng"


def check_truong(field, value, nguong):
    """Kiểm tra + chuẩn hoá 1 trường sinh hiệu.

    Trả (hop_le: bool, ly_do: str|None, gia_tri_chuan_hoa). Trường trống/None
    LUÔN hợp lệ (xoá trường được phép — criterion 2)."""
    if value in (None, ''):
        return True, None, value

    if field == 'huyet_ap':
        normalized, ly_do = chuan_hoa_huyet_ap(value, nguong)
        if normalized is None:
            return False, ly_do, None
        return True, None, normalized

    if field == 'mach':
        try:
            v = float(str(value).strip())
        except (TypeError, ValueError):
            return False, f"Mạch '{value}' không hợp lệ — phải là số", None
        r = nguong.get('mach', DEFAULT_NGUONG['mach'])
        if not (r['min'] <= v <= r['max']):
            return False, (f'Mạch {_fmt_num(v)} ngoài ngưỡng cho phép '
                            f"({_fmt_num(r['min'])}–{_fmt_num(r['max'])})"), None
        # giữ nguyên kiểu lưu TEXT như hiện tại — chỉ strip khoảng trắng
        return True, None, (value.strip() if isinstance(value, str) else value)

    if field in ('chieu_cao', 'can_nang'):
        ten = 'Chiều cao' if field == 'chieu_cao' else 'Cân nặng'
        try:
            v = float(value)
        except (TypeError, ValueError):
            return False, f"{ten} '{value}' không hợp lệ — phải là số", None
        r = nguong.get(field, DEFAULT_NGUONG[field])
        if not (r['min'] <= v <= r['max']):
            return False, (f'{ten} {_fmt_num(v)} ngoài ngưỡng cho phép '
                            f"({_fmt_num(r['min'])}–{_fmt_num(r['max'])})"), None
        return True, None, v

    return True, None, value


def validate_changes(changes_in, nguong):
    """changes_in: dict ui_field -> giá trị thô (có thể lẫn trường khác
    ngoài 4 trường sinh hiệu — các trường đó đi qua nguyên vẹn).

    Trả (normalized: dict cùng khoá với changes_in nhưng 4 trường sinh hiệu
    đã chuẩn hoá, loi: list[{'field','ly_do'}] — rỗng nếu tất cả hợp lệ)."""
    normalized = dict(changes_in)
    loi = []
    for field in VITAL_FIELDS:
        if field in changes_in:
            ok, ly_do, new_val = check_truong(field, changes_in[field], nguong)
            if not ok:
                loi.append({'field': field, 'ly_do': ly_do})
            else:
                normalized[field] = new_val
    return normalized, loi
