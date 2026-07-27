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
from services import ngay_thang_valid  # noqa: E402

# tên cột phân loại (lowercase, khớp schema.sql) theo đúng thứ tự ưu tiên §6.1
ORGAN_PL_FIELDS = [(code, ORGAN_COLS[code][1].lower()) for code in ORGANS]

# Phản hồi anh Khôi: bất biến QĐ1613 (Phân loại sức khỏe chung = mức nặng
# nhất) phải tính CẢ Thể lực, không chỉ 14 cơ quan khám mục D — Thể lực là
# 1 chỉ tiêu riêng (không phải "cơ quan" nên KHÔNG có trong ORGAN_COLS của
# build/classify.py, cũng KHÔNG có mã BYT ở TEN_CQ) nhưng vẫn quyết định
# phân loại chung y hệt các cơ quan khác. Thiếu chỉ tiêu này -> banner "vi
# phạm bất biến" báo SAI khi Thể lực mới là mức nặng nhất thật sự (vd Tuần
# hoàn=I nhưng Thể lực=IV, phan_loai_sk=IV đúng -> hệ thống lại chọn nhầm
# Tuần hoàn làm "mức nặng nhất" rồi báo vi phạm 1≠4).
ORGAN_PL_FIELDS = ORGAN_PL_FIELDS + [('THELUC', 'kham_the_luc_pl')]
_TEN_CQ_BO_SUNG = {'THELUC': 'Thể lực'}  # không gộp vào TEN_CQ (build_xlsm.py) —
# dict đó là tên cơ quan CHÍNH THỨC dùng khi xuất .xlsm nộp Bộ, Thể lực
# không phải 1 trong 14 cơ quan đó.

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
    # Phản hồi anh Khôi: banner "Vi phạm bất biến QĐ1613" (check_invariant())
    # trước đây CHỈ tính động lúc hiển thị, KHÔNG lưu thành cờ trong co_qc ->
    # không xuất hiện trong dải chip cảnh báo, không lọc/thống kê được như
    # các cờ khác. Giờ đồng bộ thành cờ thật qua sync_vi_pham_flag() (gọi ở
    # mọi endpoint ghi có tính check_invariant() trên trạng thái CUỐI CÙNG).
    'VI_PHAM_BAT_BIEN_QD1613': {
        'muc': 'do',
        'ten': 'Vi phạm bất biến QĐ1613',
        'y_nghia': 'Phân loại sức khỏe chung khác mức nặng nhất trong các '
                    'cơ quan/thể lực. Bấm "Lấy theo mức nặng nhất" hoặc sửa '
                    'lại phân loại cho khớp.',
    },
    # Phản hồi anh Khôi: widget nhập ngày trước đây không validate gì, dữ
    # liệu CŨ có thể đã lưu ngày sai (vd '01/01/144', '30/02/2000'). Validate
    # MỚI (services/ngay_thang_valid.py) chỉ chặn lưu SAI THÊM từ nay — cờ
    # này đánh dấu hồ sơ ĐÃ có sẵn ngày sai để nhân viên tự đối chiếu/sửa,
    # KHÔNG tự động sửa/xoá giá trị.
    'NGAY_THANG_KHONG_HOP_LE': {
        'muc': 'cam',
        'ten': 'Ngày tháng không hợp lệ',
        'y_nghia': 'Ngày sinh/ngày vào/ngày cấp CCCD sai định dạng hoặc '
                    'không tồn tại trong lịch (vd 30/02, năm phi lý). Đối '
                    'chiếu giấy tờ gốc rồi sửa lại cho đúng.',
    },
}
RED_FLAGS = {k for k, v in FLAG_META.items() if v['muc'] == 'do'}

# Trường "suy" (§5) -> cờ liên quan sẽ được gỡ khi nhân viên xác nhận (§3.4.5)
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


def recompute_cccd_flags(conn, ma_ho_so, old_cccd, new_cccd, user_id):
    """Tính lại cờ CCCD khi sửa so_cccd (phản hồi anh Khôi). THIEU_CCCD cho
    chính bản này; CCCD_TRUNG là cờ QUAN HỆ nên cập nhật cả NHÓM cccd CŨ (bản
    kia có thể hết trùng) lẫn nhóm MỚI. Ghi nhat_ky co_qc cho MỌI bản bị đổi
    cờ. Trả co_qc mới của ma_ho_so. (Giả định so_cccd trong DB ĐÃ được cập nhật
    sang new_cccd trước khi gọi.)"""
    def _log(ma, before, after):
        if after is not None and after != before:
            conn.execute(
                'INSERT INTO nhat_ky(ma_ho_so, nguoi_dung_id, ten_truong, '
                'gia_tri_cu, gia_tri_moi) VALUES (?,?,?,?,?)',
                (ma, user_id, 'co_qc', before or '', after or ''))

    # 1) THIEU_CCCD cho bản hiện tại
    b = conn.execute('SELECT co_qc FROM ho_so WHERE ma_ho_so=?', (ma_ho_so,)).fetchone()['co_qc']
    a = remove_flags(conn, ma_ho_so, ['THIEU_CCCD']) if new_cccd \
        else add_flag(conn, ma_ho_so, 'THIEU_CCCD')
    _log(ma_ho_so, b, a)

    # 2) CCCD_TRUNG cho các NHÓM cccd cũ + mới (bỏ rỗng)
    for cccd in {c for c in (old_cccd, new_cccd) if c}:
        rows = conn.execute(
            'SELECT ma_ho_so, co_qc FROM ho_so WHERE so_cccd=?', (cccd,)).fetchall()
        is_dup = len(rows) > 1
        for r in rows:
            aa = add_flag(conn, r['ma_ho_so'], 'CCCD_TRUNG') if is_dup \
                else remove_flags(conn, r['ma_ho_so'], ['CCCD_TRUNG'])
            _log(r['ma_ho_so'], r['co_qc'], aa)

    # bản hiện tại giờ rỗng CCCD -> chắc chắn không thể CCCD_TRUNG
    if not new_cccd:
        b2 = conn.execute('SELECT co_qc FROM ho_so WHERE ma_ho_so=?', (ma_ho_so,)).fetchone()['co_qc']
        _log(ma_ho_so, b2, remove_flags(conn, ma_ho_so, ['CCCD_TRUNG']))

    conn.commit()
    return conn.execute('SELECT co_qc FROM ho_so WHERE ma_ho_so=?', (ma_ho_so,)).fetchone()['co_qc']


def check_invariant(row):
    """row: dict-like (sqlite3.Row hoặc dict) có đủ 14 cột *_pl + kham_the_luc_pl
    (Thể lực) + phan_loai_sk.

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
        'ten_co_quan_max': (TEN_CQ.get(best_code) or _TEN_CQ_BO_SUNG.get(best_code))
                            if best_code else None,
        'gia_tri_max': best_val,
    }


def sync_vi_pham_flag(conn, ma_ho_so, inv):
    """Đồng bộ cờ VI_PHAM_BAT_BIEN_QD1613 theo kết quả check_invariant() MỚI
    NHẤT của hồ sơ (trạng thái ĐÃ ghi xong, không phải trạng thái giả định) —
    add nếu inv['vi_pham']=True mà chưa có cờ, remove nếu False mà đang có.
    Gọi ở CUỐI mọi endpoint có ghi dữ liệu ảnh hưởng phan_loai_sk/*_pl (PATCH
    hồ sơ, thêm/sửa/đặt bệnh chính, batch rà soát). KHÔNG tự commit — caller
    tự commit theo transaction của mình. Trả True nếu có đổi, False nếu không."""
    row = conn.execute('SELECT co_qc FROM ho_so WHERE ma_ho_so=?',
                        (ma_ho_so,)).fetchone()
    if not row:
        return False
    dang_co = 'VI_PHAM_BAT_BIEN_QD1613' in flags_of(row['co_qc'])
    if inv['vi_pham'] and not dang_co:
        add_flag(conn, ma_ho_so, 'VI_PHAM_BAT_BIEN_QD1613')
        return True
    if not inv['vi_pham'] and dang_co:
        remove_flags(conn, ma_ho_so, ['VI_PHAM_BAT_BIEN_QD1613'])
        return True
    return False


def _co_ngay_thang_sai(row):
    """True nếu hồ sơ có ÍT NHẤT 1 trong 3 trường ngày (ngay_sinh/ngay_vao/
    ngaycap_cccd) sai định dạng hoặc không tồn tại trong lịch. row: dict-like
    (sqlite3.Row hoặc dict) có (một phần hoặc đủ) 3 cột đó. TÁI SỬ DỤNG
    ngay_thang_valid.validate_date_changes() — KHÔNG viết lại logic parse
    ngày lần 2."""
    changes = {f: row[f] for f in ngay_thang_valid.DATE_FIELDS if f in row.keys()}
    _, loi = ngay_thang_valid.validate_date_changes(changes)
    return bool(loi)


def sync_ngay_thang_flag(conn, ma_ho_so, row):
    """Đồng bộ cờ NGAY_THANG_KHONG_HOP_LE theo trạng thái MỚI NHẤT của hồ sơ
    — ĐÚNG khuôn sync_vi_pham_flag() ở trên: add nếu phát hiện ≥1 trường
    ngày sai mà chưa có cờ, remove nếu hết sai mà đang có cờ. row: dict-like
    ĐÃ có đủ 3 trường ngày + co_qc (thường là bản ghi vừa refetch sau khi
    ghi). KHÔNG tự commit — caller tự commit theo transaction của mình. Trả
    True nếu có đổi, False nếu không."""
    sai = _co_ngay_thang_sai(row)
    dang_co = 'NGAY_THANG_KHONG_HOP_LE' in flags_of(row['co_qc'])
    if sai and not dang_co:
        add_flag(conn, ma_ho_so, 'NGAY_THANG_KHONG_HOP_LE')
        return True
    if not sai and dang_co:
        remove_flags(conn, ma_ho_so, ['NGAY_THANG_KHONG_HOP_LE'])
        return True
    return False
