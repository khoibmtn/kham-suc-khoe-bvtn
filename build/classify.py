# -*- coding: utf-8 -*-
"""
classify.py — Phân loại sức khỏe theo từng cơ quan + xác định bệnh chính / bệnh kèm.

NGUYÊN TẮC (QĐ 1613/BYT-QĐ, mục III.3.3):
    Phân loại sức khỏe chung = MỨC NẶNG NHẤT trong 13 chỉ số cơ quan.

Do dữ liệu nguồn CHỈ có phân loại sức khỏe CHUNG (I-V) mà không có phân loại
từng cơ quan, ta làm ngược lại (back-inference):

  B1. Mỗi bệnh được gán 1 TRỌNG SỐ NẶNG (1-5) theo bảng SEVERITY.
  B2. Gom bệnh theo cơ quan, mỗi cơ quan lấy trọng số cao nhất của bệnh trong đó.
  B3. Cơ quan có trọng số cao nhất = CƠ QUAN NẶNG NHẤT
      -> gán đúng bằng phân loại sức khỏe CHUNG lấy từ file gốc (neo dữ liệu).
      -> bệnh nặng nhất của cơ quan đó = BỆNH CHÍNH.
  B4. Các cơ quan còn lại: quy đổi trọng số sang thang I-V nhưng KHÔNG vượt quá
      phân loại chung (bảo đảm max = phân loại chung, đúng QĐ 1613).
  B5. Cơ quan không có bệnh = loại I.
  B6. Toàn bộ bệnh còn lại (khác bệnh chính) = BỆNH KÈM THEO.
"""

# Trọng số nặng theo mã ICD. Không liệt kê -> lấy DEFAULT_SEVERITY.
SEVERITY = {
    # ---- Mức 5: bệnh nặng, ảnh hưởng chức năng rõ rệt ----
    'C18.9': 5, 'C22.9': 5, 'C16.9': 5, 'C50.9': 5, 'C73': 5, 'C80.9': 5,
    'I50.9': 5, 'N18.9': 5, 'K74.6': 5, 'I69.4': 5, 'F03': 5, 'H54.0': 5,
    'G20': 5, 'J44.9': 5, 'I25.2': 5, 'F20.9': 5, 'Z89.9': 5, 'E27.4': 5,

    # ---- Mức 4: bệnh mạn tính cần điều trị thường xuyên ----
    'I10': 4, 'E11.9': 4, 'E10.9': 4, 'E14.9': 4, 'I25.9': 4, 'I20.9': 4,
    'I48': 4, 'I34.0': 4, 'I35.1': 4, 'I36.1': 4, 'I44.3': 4, 'I44.7': 4,
    'H25.9': 4, 'H40.9': 4, 'H35.3': 4, 'H47.2': 4, 'H54.7': 4,
    'H91.1': 4, 'H91.9': 4, 'J45.9': 4, 'J42': 4, 'J43.9': 4, 'J18.9': 4,
    'E03.9': 4, 'E05.0': 4, 'K08.1': 4, 'M81.9': 4, 'M06.9': 4, 'M10.9': 4,
    'M51.2': 4, 'M50.2': 4, 'G40.9': 4, 'G51.0': 4, 'G62.9': 4, 'F32.9': 4,
    'K08.1': 3,
    'B18.1': 4, 'B18.2': 4, 'K73.9': 4, 'N26': 4, 'T92.1': 4, 'M21.9': 4,
    'N40': 4, 'B90.9': 4, 'J47': 4, 'E66.9': 4, 'Z95.5': 4, 'Z95.0': 4,
    # LƯU Ý: mất răng (K08.1) để mức 3 — theo QĐ 1613 mức độ phụ thuộc số răng
    # mất và sức nhai; để mức 4 sẽ lấn át bệnh nội khoa khi chọn bệnh chính.

    # ---- Mức 3: bệnh mạn tính mức trung bình ----
    'K76.0': 3, 'M19.9': 3, 'M17.9': 3, 'M19.0': 3, 'M47.8': 3, 'M41.9': 3,
    'M13.0': 3, 'M24.3': 3, 'N20.0': 3, 'N20.1': 3, 'N21.0': 3, 'N13.3': 3,
    'K80.2': 3, 'K80.5': 3, 'K81.1': 3, 'K29.7': 3, 'K21.9': 3, 'K52.9': 3,
    'K64.9': 3, 'K63.5': 3, 'K82.8': 3, 'E78.5': 3, 'R73.9': 3, 'E04.1': 3,
    'E04.9': 3, 'I45.1': 3, 'I44.7': 3, 'I49.3': 3, 'I49.1': 3, 'I49.4': 3,
    'I49.9': 3, 'I83.9': 3, 'I51.7': 3, 'H66.3': 3, 'H81.9': 3, 'H83.0': 3,
    'H26.4': 3, 'H17.9': 3, 'H43.3': 3, 'H02.4': 3, 'H50.9': 3, 'H04.5': 3,
    'J32.9': 3, 'J40': 3, 'N81.9': 3, 'D25.9': 3, 'N83.2': 3, 'N28.1': 3,
    'N39.0': 3, 'N32.8': 3, 'G47.9': 3, 'M54.3': 3, 'M54.2': 3, 'D18.0': 3,
    'K76.8': 3, 'K76.9': 3, 'L40.9': 3, 'L20.9': 3, 'F41.9': 3, 'D69.2': 3,
    'K40.9': 3, 'K07.6': 3, 'K04.0': 3, 'M25.5': 3, 'Q0': 3,

    # ---- Mức 2: bệnh nhẹ / tổn thương khu trú ----
    'H11.0': 2, 'H52.7': 2, 'H52.4': 2, 'H52.0': 2, 'H52.1': 2, 'H52.2': 2,
    'H52.5': 2, 'H01.0': 2, 'H10.9': 2, 'H04.1': 2, 'H02.0': 2, 'H61.2': 2,
    'J31.2': 2, 'J02.9': 2, 'J30.4': 2, 'J00': 2, 'J35.0': 2, 'J33.9': 2,
    'K02.9': 2, 'K05.1': 2, 'K05.3': 2, 'K03.6': 2, 'K03.0': 2, 'K07.2': 2,
    'L28.2': 2, 'L30.9': 2, 'L25.9': 2, 'L50.9': 2, 'L70.9': 2, 'L65.9': 2,
    'L80': 2, 'B36.0': 2, 'B35.1': 2, 'B35.9': 2, 'B02.9': 2, 'L90.5': 2,
    'N76.0': 2, 'N84.1': 2, 'N85.8': 2, 'D22.9': 2, 'D23.1': 2, 'D23.9': 2,
    'D17.9': 2, 'N28.8': 2, 'R00.0': 2, 'R00.1': 2, 'R42': 2, 'G44.2': 2,

    # ---- Mức 1: trạng thái sau điều trị, không phải bệnh đang hoạt động ----
    'Z96.1': 1, 'Z97.2': 1, 'Z90.4': 1, 'Z90.7': 1, 'Z90.8': 1, 'Z98.8': 1,
    'Z85.3': 1,
}
DEFAULT_SEVERITY = 3

# Trọng số -> phân loại I..V (dùng cho các cơ quan KHÔNG phải cơ quan nặng nhất)
SEVERITY_TO_CLASS = {1: 2, 2: 2, 3: 3, 4: 4, 5: 5}

# Ánh xạ cơ quan -> tên cột kết quả / cột phân loại trong file import BYT
ORGAN_COLS = {
    'TH':      ('NOI_KHOA_TUAN_HOAN',      'NOI_KHOA_TUAN_HOAN_PL'),
    'HH':      ('NOI_KHOA_HO_HAP',         'NOI_KHOA_HO_HAP_PL'),
    'TIEUHOA': ('NOI_KHOA_TIEU_HOA',       'NOI_KHOA_TIEU_HOA_PL'),
    'THAN':    ('NOI_KHOA_THAN_TN_SD',     'NOI_KHOA_THAN_TIETNIEU_PL'),
    'NOITIET': ('NOI_KHOA_NOI_TIET',       'NOI_KHOA_NOI_TIET_PL'),
    'CXK':     ('NOI_KHOA_CO_XUONG_KHOP',  'NOI_KHOA_CO_XUONG_KHOP_PL'),
    'TK':      ('NOI_KHOA_THAN_KINH',      'NOI_KHOA_THAN_KINH_PL'),
    'TT':      ('NOI_KHOA_TAM_THAN',       'NOI_KHOA_TAM_THAN_PL'),
    'NGOAI':   ('KET_QUA_KHAM_NGOAI_KHOA', 'KHAM_NGOAI_KHOA_PL'),
    'DALIEU':  ('KET_QUA_KHAM_DA_LIEU',    'KHAM_DA_LIEU_PL'),
    'SAN':     ('KET_QUA_KHAM_SAN_PHU_KHOA','KHAM_SAN_PHU_KHOA_PL'),
    'MAT':     ('BENH_KHAC_MAT',           'KHAM_MAT_PL'),
    'TMH':     ('BENH_KHAC_TAI_MUI_HONG',  'KHAM_TAI_MUI_HONG_PL'),
    'RHM':     ('BENH_KHAC_RANG_HAM_MAT',  'KHAM_RANG_HAM_MAT_PL'),
}
ORGANS = list(ORGAN_COLS.keys())

# Câu mô tả mặc định khi cơ quan không có bệnh
BINH_THUONG = 'Bình thường'


def severity_of(icd):
    return SEVERITY.get(icd, DEFAULT_SEVERITY)


def classify_person(findings, pl_chung):
    """
    findings: list dict {atom, concept, icd, ten_icd, co_quan, nguon}
              (atom = chuỗi gốc đã chuẩn hóa, dùng để ghi vào ô kết quả khám)
    pl_chung: int 1..5 — phân loại sức khỏe chung lấy từ tong-hop.xlsx
              (None nếu nguồn để trống -> sẽ tự suy ra từ trọng số)

    Trả về dict:
      organ_text[organ]  -> chuỗi kết quả khám của cơ quan
      organ_class[organ] -> phân loại I..V (int)
      benh_chinh         -> dict finding hoặc None
      benh_kem           -> list dict finding
      pl_chung           -> int (đã chốt)
      canh_bao           -> list cảnh báo cần rà soát
    """
    warn = []
    by_organ = {}
    for f in findings:
        if not f.get('co_quan'):
            continue
        by_organ.setdefault(f['co_quan'], []).append(f)

    # trọng số nặng nhất của từng cơ quan
    organ_sev = {}
    for o, fs in by_organ.items():
        for f in fs:
            f['_sev'] = severity_of(f['icd'])
        organ_sev[o] = max(f['_sev'] for f in fs)

    # chốt phân loại chung
    if pl_chung is None:
        pl_chung = max(SEVERITY_TO_CLASS[s] for s in organ_sev.values()) if organ_sev else 1
        warn.append('Nguồn thiếu phân loại sức khỏe — đã suy ra từ bệnh lý')

    # cơ quan nặng nhất
    organ_class = {o: 1 for o in ORGANS}
    benh_chinh, benh_kem = None, []

    if organ_sev:
        max_sev = max(organ_sev.values())
        worst = [o for o, s in organ_sev.items() if s == max_sev]
        # Nhiều cơ quan đồng hạng: ưu tiên theo thứ tự lâm sàng trong ORGANS
        # (nội khoa trước, chuyên khoa lẻ sau). KHÔNG ưu tiên cơ quan có nhiều
        # bệnh hơn — nếu không, răng-hàm-mặt (thường 3-4 chẩn đoán/ca) sẽ lấn át
        # các bệnh nội khoa nặng hơn khi chọn bệnh chính.
        worst.sort(key=lambda o: ORGANS.index(o))
        worst_organ = worst[0]

        for o, s in organ_sev.items():
            if o == worst_organ:
                organ_class[o] = pl_chung
            else:
                organ_class[o] = min(SEVERITY_TO_CLASS[s], pl_chung)

        # bệnh chính = bệnh nặng nhất của cơ quan nặng nhất
        cands = sorted(by_organ[worst_organ], key=lambda f: -f['_sev'])
        benh_chinh = cands[0]
        seen = {id(benh_chinh)}
        for o in ORGANS:
            for f in by_organ.get(o, []):
                if id(f) not in seen:
                    benh_kem.append(f)
                    seen.add(id(f))
    else:
        if pl_chung and pl_chung > 1:
            warn.append(f'Phân loại nguồn là {pl_chung} nhưng không có chẩn đoán nào')

    # kiểm tra ràng buộc QĐ 1613: max(cơ quan) phải = phân loại chung
    if organ_sev and max(organ_class.values()) != pl_chung:
        warn.append('Sai lệch ràng buộc max(cơ quan) ≠ phân loại chung')

    # chuỗi kết quả khám từng cơ quan
    organ_text = {}
    for o in ORGANS:
        fs = by_organ.get(o)
        organ_text[o] = '; '.join(dict.fromkeys(f['atom'] for f in fs)) if fs else BINH_THUONG

    return {
        'organ_text': organ_text,
        'organ_class': organ_class,
        'benh_chinh': benh_chinh,
        'benh_kem': benh_kem,
        'pl_chung': pl_chung,
        'canh_bao': warn,
    }
