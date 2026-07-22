# -*- coding: utf-8 -*-
"""
qc.py — bất biến QĐ1613 (§6.1) + tiện ích cờ QC (§4).

Không viết lại pipeline chuẩn hoá: tái dùng ORGAN_COLS/ORGANS của
build/classify.py (đã có đúng thứ tự ưu tiên cơ quan TH→…→RHM) và TEN_CQ của
build/build_xlsm.py.
"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
import config  # noqa: E402

config.ensure_build_on_path()
from classify import ORGAN_COLS, ORGANS  # noqa: E402
from build_xlsm import TEN_CQ  # noqa: E402

# tên cột phân loại (lowercase, khớp schema.sql) theo đúng thứ tự ưu tiên §6.1
ORGAN_PL_FIELDS = [(code, ORGAN_COLS[code][1].lower()) for code in ORGANS]

# ----------------------------------------------------------------------
# Mức độ cờ (§4) — 🔴 đỏ chặn xuất file, 🟠 cam cần đối chiếu, 🟡 vàng nhắc nhở
FLAG_META = {
    'NGAY_SINH_UOC_LUONG': {
        'muc': 'vang',
        'ten': 'Ngày sinh ước lượng',
        'y_nghia': 'Nguồn chỉ có năm sinh, ngày/tháng là quy ước 01/01. '
                    'Bổ sung ngày thật nếu có.',
    },
    'THIEU_CCCD': {
        'muc': 'do',
        'ten': 'Thiếu CCCD',
        'y_nghia': 'Không có số định danh. Chặn xuất file nếu chưa bổ sung.',
    },
    'CCCD_TRUNG': {
        'muc': 'do',
        'ten': 'CCCD trùng',
        'y_nghia': 'Số CCCD dùng cho nhiều bản ghi. Có thể là trùng thật '
                    '(2 người 1 số) hoặc 1 người khám 2 lần — phải phân biệt.',
    },
    'CO_PHAN_LOAI_NHUNG_KHONG_CO_CHAN_DOAN': {
        'muc': 'do',
        'ten': 'Có phân loại nhưng không có chẩn đoán',
        'y_nghia': 'Xếp loại IV-V nhưng không ghi chẩn đoán nào. Phải đối '
                    'chiếu sổ giấy.',
    },
    'CON_CHAN_DOAN_CHUA_ANH_XA': {
        'muc': 'cam',
        'ten': 'Còn chẩn đoán chưa ánh xạ',
        'y_nghia': 'Còn mẩu chữ chưa gán được ICD. Hiện chuỗi gốc, chọn ICD.',
    },
    'NGUON_DANH_DAU_NHIEU_PHAN_LOAI': {
        'muc': 'cam',
        'ten': 'Nguồn đánh dấu nhiều phân loại',
        'y_nghia': 'File gốc tích nhiều ô phân loại. Đang lấy mức nặng '
                    'nhất, cần xác nhận.',
    },
    'THI_LUC_CHUA_RO_BEN_MAT': {
        'muc': 'cam',
        'ten': 'Thị lực chưa rõ bên mắt',
        'y_nghia': "Ghi 'mắt 3/10' không rõ bên. Đang tạm ghi mắt trái.",
    },
    'ICD_MAY_TU_SUA_LOI_GO': {
        'muc': 'cam',
        'ten': 'ICD máy tự sửa lỗi gõ',
        'y_nghia': 'Máy đoán lỗi gõ và tự sửa. Hiện khái niệm neo + độ giống.',
    },
    'ICD_KHONG_DAC_HIEU': {
        'muc': 'vang',
        'ten': 'ICD không đặc hiệu',
        'y_nghia': 'Chỉ biết cơ quan, mã chung chung. Gợi ý chọn mã cụ thể hơn.',
    },
    'NAM_SINH_SAI_NGUON': {
        'muc': 'cam',
        'ten': 'Năm sinh sai nguồn',
        'y_nghia': 'Năm sinh vô lý, đã suy từ tuổi.',
    },
    'THIEU_SINH_HIEU': {
        'muc': 'vang',
        'ten': 'Thiếu sinh hiệu',
        'y_nghia': 'Chiều cao/cân nặng/mạch/HA/thị lực/thính lực chưa có.',
    },
}
RED_FLAGS = {k for k, v in FLAG_META.items() if v['muc'] == 'do'}

# Trường "suy" (§5) -> cờ liên quan sẽ được gỡ khi cán bộ xác nhận (§3.4.5)
FIELD_TO_FLAGS = {
    'ngay_sinh': ['NGAY_SINH_UOC_LUONG', 'NAM_SINH_SAI_NGUON'],
    'so_cccd': ['THIEU_CCCD'],
    'khong_kinh_mat_trai': ['THI_LUC_CHUA_RO_BEN_MAT'],
    'khong_kinh_mat_phai': ['THI_LUC_CHUA_RO_BEN_MAT'],
    'phan_loai_sk': ['NGUON_DANH_DAU_NHIEU_PHAN_LOAI'],
    'chieu_cao': ['THIEU_SINH_HIEU'],
    'can_nang': ['THIEU_SINH_HIEU'],
    'mach': ['THIEU_SINH_HIEU'],
    'huyet_ap': ['THIEU_SINH_HIEU'],
    'ma_dan_toc': [],
    'matinh_cu_tru': [],
    'ma_nghe_nghiep': [],
    'doi_tuong': [],
    'nguon_chi_tra': [],
    'ma_loai_kcb': [],
    'ly_do_vv': [],
}


def flags_of(co_qc):
    return [f for f in (co_qc or '').split(';') if f]


def red_flag_where():
    """(where_sql, args) — hồ sơ có ÍT NHẤT 1 cờ 🔴 trong RED_FLAGS.

    Dùng chung bởi export_xlsm.preview() (P2) và dashboard.py (P3) để đảm
    bảo "số hồ sơ còn cờ đỏ" luôn được định nghĩa & đếm nhất quán ở mọi màn
    hình (đếm SỐ HỒ SƠ có ≥1 cờ đỏ, không phải tổng lượt xuất hiện cờ)."""
    parts, args = [], []
    for f in sorted(RED_FLAGS):
        parts.append("(';'||co_qc||';') LIKE ?")
        args.append(f'%;{f};%')
    return '(' + ' OR '.join(parts) + ')', args


def row_severity(co_qc):
    """'do' | 'vang' | None — dùng tô màu dòng trong bảng kết quả."""
    flags = flags_of(co_qc)
    if any(f in RED_FLAGS for f in flags):
        return 'do'
    if flags:
        return 'vang'
    return None


def add_flag(conn, ma_ho_so, flag):
    row = conn.execute('SELECT co_qc FROM ho_so WHERE ma_ho_so=?',
                        (ma_ho_so,)).fetchone()
    if not row:
        return None
    flags = flags_of(row['co_qc'])
    if flag not in flags:
        flags.append(flag)
    new_co_qc = ';'.join(flags)
    conn.execute('UPDATE ho_so SET co_qc=?, so_loi=? WHERE ma_ho_so=?',
                 (new_co_qc, len(flags), ma_ho_so))
    return new_co_qc


def remove_flags(conn, ma_ho_so, flags_to_remove):
    """Gỡ (các) cờ khỏi co_qc + giảm so_loi. Trả về co_qc mới."""
    row = conn.execute('SELECT co_qc FROM ho_so WHERE ma_ho_so=?',
                        (ma_ho_so,)).fetchone()
    if not row:
        return None
    remaining = [f for f in flags_of(row['co_qc']) if f not in flags_to_remove]
    new_co_qc = ';'.join(remaining)
    conn.execute('UPDATE ho_so SET co_qc=?, so_loi=? WHERE ma_ho_so=?',
                 (new_co_qc, len(remaining), ma_ho_so))
    return new_co_qc


def check_invariant(row):
    """row: dict-like (sqlite3.Row hoặc dict) có đủ 14 cột *_pl + phan_loai_sk.

    Trả {'vi_pham': bool, 'co_quan_max': mã|None, 'ten_co_quan_max': str|None,
    'gia_tri_max': int|None} — cùng ngữ nghĩa với truy vấn SQL §8.6 (NULL
    không tính là vi phạm khi không có cơ quan nào có phân loại).
    """
    best_code, best_val = None, None
    for code, col in ORGAN_PL_FIELDS:
        v = row[col] if col in row.keys() else None
        if v is None:
            continue
        if best_val is None or v > best_val:
            best_val = v
            best_code = code
    pl_sk = row['phan_loai_sk'] if 'phan_loai_sk' in row.keys() else None
    vi_pham = bool(best_val is not None and pl_sk is not None and best_val != pl_sk)
    return {
        'vi_pham': vi_pham,
        'co_quan_max': best_code,
        'ten_co_quan_max': TEN_CQ.get(best_code) if best_code else None,
        'gia_tri_max': best_val,
    }
