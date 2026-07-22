# -*- coding: utf-8 -*-
"""
tien_su.py — Suy luận phần TIỀN SỬ BẢN THÂN (cột AA..AY) từ danh sách bệnh.

Quy tắc anh Khôi chốt:
  - AA (TSBT_BENH_TRONG_5_NAM_QUA) = "Có" nếu người bệnh đang có bệnh mạn tính.
  - AB..AX: đánh "Có" đúng theo nhóm bệnh mà người bệnh đang mắc.
  - AY (TSBT_MA_BENH): tên bệnh hiện tại NẶNG NHẤT = bệnh chính.
  - Các mục không có dữ liệu nguồn (rượu, ma túy, mất ý thức...) = "Không".
"""
import re

CO, KHONG = 'Có', 'Không'

# Mã ICD được coi là bệnh CẤP TÍNH / trạng thái sau điều trị -> không tính mạn tính
CAP_TINH = {
    'J02.9', 'J00', 'J04.0', 'K05.1',            # viêm họng/mũi cấp, viêm lợi
    'Z96.1', 'Z97.2', 'Z90.4', 'Z90.7', 'Z90.8', 'Z98.8', 'Z85.3',
    'Z95.5', 'Z95.0',
}

def _has(findings, codes=None, organs=None, pat=None):
    for f in findings:
        if codes and f['icd'] in codes:
            return True
        if organs and f['co_quan'] in organs:
            return True
        if pat and re.search(pat, f['concept'], re.I):
            return True
    return False


# (mã trường, hàm kiểm tra) — thứ tự đúng theo cột AB..AX
FIELDS = [
    ('TSBT_BENH_THAN_KINH',   lambda F: _has(F, organs={'TK'})),
    ('TSBT_BENH_MAT',         lambda F: _has(F, organs={'MAT'})),
    ('TSBT_BENH_TAI',         lambda F: _has(F, codes={'H91.9', 'H91.1', 'H66.3',
                                                       'H83.0', 'H81.9', 'H61.2',
                                                       'H93.9'})),
    ('TSBT_BENH_TIM',         lambda F: _has(F, organs={'TH'})
                                        and not _only(F, 'TH', {'I10'})),
    ('TSBT_PHAU_THUAT_TIM',   lambda F: _has(F, codes={'Z95.5', 'Z95.0'})),
    ('TSBT_TANG_HUYET_AP',    lambda F: _has(F, codes={'I10'})),
    ('TSBT_KHO_THO',          lambda F: _has(F, pat=r'khó thở')),
    ('TSBT_BENH_PHOI',        lambda F: _has(F, organs={'HH'})),
    ('TSBT_BENH_THAN',        lambda F: _has(F, codes={'N18.9', 'N26', 'N20.0',
                                                       'N28.1', 'N13.3', 'N28.8',
                                                       'N39.9'})),
    ('TSBT_NGHIEN_RUOU',      lambda F: False),
    ('TSBT_DAI_THAO_DUONG',   lambda F: _has(F, codes={'E10.9', 'E11.9', 'E14.9',
                                                       'R73.9'})),
    ('TSBT_BENH_TAM_THAN',    lambda F: _has(F, organs={'TT'})),
    ('TSBT_MAT_Y_THUC',       lambda F: False),
    ('TSBT_NGAT',             lambda F: _has(F, codes={'R42'})),
    ('TSBT_BENH_TIEU_HOA',    lambda F: _has(F, organs={'TIEUHOA'})),
    ('TSBT_ROI_LOAN_GIAC_NGU',lambda F: _has(F, codes={'G47.9'})),
    # LƯU Ý: KHÔNG bắt chuỗi con 'liệt' — nó nằm trong 'tuyến tiền liệt',
    # gây báo nhầm tiền sử tai biến cho bệnh nhân u xơ tuyến tiền liệt.
    ('TSBT_TAI_BIEN',         lambda F: _has(F, codes={'I69.4', 'G51.0'})
                                        or _has(F, pat=r'(?<!tiền )\bliệt\b|'
                                                       r'\byếu (nửa|tứ|1/2)')),
    ('TSBT_BENH_COT_SONG',    lambda F: _has(F, codes={'M47.8', 'M51.2', 'M50.2',
                                                       'M41.9'})),
    ('TSBT_RUOU_THUONG_XUYEN',lambda F: False),
    ('TSBT_MA_TUY',           lambda F: False),
]

# Nhóm bệnh KHÔNG nằm trong 19 mục trên -> gom vào "Bệnh khác"
ORGAN_KHAC = {'CXK', 'NOITIET', 'DALIEU', 'SAN', 'RHM', 'NGOAI', 'THAN'}


def _only(findings, organ, codes):
    """True nếu cơ quan `organ` CHỈ có đúng các mã trong `codes`."""
    fs = [f for f in findings if f['co_quan'] == organ]
    return bool(fs) and all(f['icd'] in codes for f in fs)


def _covered(f):
    """Bệnh này đã được thể hiện ở một trong 19 mục AB..AX chưa?"""
    for _, fn in FIELDS:
        if fn([f]):
            return True
    return False


def suy_luan(findings, benh_chinh, ten_chinh_thuc):
    """
    findings: list dict {atom, concept, icd, ten_icd, co_quan}
    benh_chinh: dict finding hoặc None
    ten_chinh_thuc: hàm (icd, fallback) -> tên nguyên văn danh mục BYT

    Trả dict {mã trường -> giá trị} cho cột Y, AA..AY.
    """
    man_tinh = [f for f in findings if f['icd'] not in CAP_TINH]
    co_benh = bool(man_tinh)

    out = {
        'TSGD_MAC_BENH': KHONG,          # cột Y — không có dữ liệu tiền sử gia đình
        'TSBT_BENH_TRONG_5_NAM_QUA': CO if co_benh else KHONG,
    }
    for name, fn in FIELDS:
        out[name] = CO if fn(man_tinh) else KHONG

    # --- Bệnh khác + ghi rõ tên ---
    khac = [f for f in man_tinh
            if f['co_quan'] in ORGAN_KHAC and not _covered(f)]
    out['TSBT_BENH_KHAC'] = CO if khac else KHONG
    # cột AW chỉ nhận 1 giá trị -> lấy bệnh nặng nhất trong nhóm khác
    if khac:
        khac_sorted = sorted(khac, key=lambda f: -f.get('_sev', 3))
        out['TSBT_MA_BENH_KHAC'] = ten_chinh_thuc(khac_sorted[0]['icd'],
                                                  khac_sorted[0]['ten_icd'])
    else:
        out['TSBT_MA_BENH_KHAC'] = ''

    # --- Đang điều trị + bệnh hiện tại nặng nhất ---
    out['TSBT_DANG_DIEU_TRI_BENH'] = CO if co_benh else KHONG
    # Không có dữ liệu tiền sử thai sản trong đợt khám -> khai "Không"
    out['TSBT_THAI_SAN'] = KHONG
    out['TSBT_MA_BENH'] = (ten_chinh_thuc(benh_chinh['icd'], benh_chinh['ten_icd'])
                           if benh_chinh else '')
    return out
