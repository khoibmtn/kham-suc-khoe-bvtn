# -*- coding: utf-8 -*-
"""
mapper.py — Bộ ánh xạ HỢP NHẤT: chuỗi chẩn đoán thô -> danh sách bệnh có mã ICD.

THỨ TỰ ƯU TIÊN (cao xuống thấp):
  1. TỪ ĐIỂN ANH KHÔI DIỄN GIẢI  — nguồn có thẩm quyền cao nhất.
     - cột N trống  -> BỎ QUA khái niệm (anh Khôi chốt: thiếu dữ kiện hoặc
       đã được diễn giải ở mục khác)
     - có nghĩa     -> đưa "nghĩa đầy đủ" qua bộ rule để lấy mã ICD;
                        CƠ QUAN lấy theo cột F của anh Khôi (không dùng cơ quan
                        do rule suy ra, vì cột F đã được thẩm định)
  2. RULE regex     — từ điển máy
  3. KHỚP MỜ        — bắt lỗi gõ
  4. THEO CƠ QUAN   — mã "không đặc hiệu"
  5. Không xác định -> gắn cờ rà soát

Mỗi bệnh trả về đều kèm 'nguon' để app quản lý biết dòng nào cần user rà lại.
"""
import sys, os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from normalize import process_cell, concept_key, basic_clean
import icd_map
from icd_map import map_concept, ORGAN_FALLBACK
import user_dict
import phrase_rules

# mức tin cậy để app hiển thị
TIN_CAY = {
    'tu_dien_khoi': 'Cao — anh Khôi đã diễn giải',
    'rule':         'Cao — khớp từ điển máy',
    'fuzzy':        'Trung bình — máy tự sửa lỗi gõ, nên rà soát',
    'organ_fallback': 'Thấp — chỉ biết cơ quan, mã không đặc hiệu',
    'unmapped':     'CHƯA XÁC ĐỊNH — cần rà soát thủ công',
}
CAN_RA_SOAT = {'fuzzy', 'organ_fallback', 'unmapped'}


import re

# Ghi chú anh Khôi viết cho em, không phải một phần chẩn đoán -> bóc bỏ
_CHU_THICH = re.compile(
    r'\((?:[^()]*?(?:đang để|phân loại|mã số|theo hồ sơ|thừa chữ|bỏ)[^()]*?)\)',
    re.IGNORECASE)


def _benh_tu_nghia(nghia, co_quan_khoi):
    """
    'Nghĩa đầy đủ' của anh Khôi -> list [(icd, ten_icd, co_quan)].

    Có trường hợp một mẩu thực chất là 2 bệnh của 2 CƠ QUAN khác nhau
    (anh Khôi nêu ở LUUY: "Cắt túi mật, mất răng 27" — cột F mới ghi 1 cơ quan).
    Khi đó phải tách. Nhưng KHÔNG tách bừa: chỉ tách khi các vế ánh xạ được
    bằng rule VÀ thuộc từ 2 cơ quan trở lên — nếu không, những chẩn đoán vốn
    có dấu phẩy bên trong ("Mất đốt 3 ngón 3,4 và đốt 2,3 ngón V bàn tay P")
    sẽ bị xé vụn.
    """
    nghia = _CHU_THICH.sub('', str(nghia)).strip(' ,;')
    if not nghia:
        return []

    # thử tách theo dấu phẩy
    phan = [p.strip() for p in re.split(r'[,;]', nghia) if p.strip()]
    if len(phan) > 1:
        ket = []
        for p in phan:
            ck = concept_key(p)
            m = icd_map._map_rule_only(ck) if ck else None
            ket.append(m)
        if all(ket) and len({m['co_quan'] for m in ket}) > 1:
            ra, da = [], set()
            for m in ket:
                if m['icd'] not in da:
                    da.add(m['icd'])
                    ra.append((m['icd'], m['ten_icd'], m['co_quan']))
            return ra

    # mặc định: coi là MỘT chẩn đoán, cơ quan lấy theo cột F của anh Khôi
    ck = concept_key(nghia)
    m = icd_map._map_rule_only(ck) if ck else None
    if m:
        return [(m['icd'], m['ten_icd'], co_quan_khoi or m['co_quan'])]
    if co_quan_khoi and co_quan_khoi in ORGAN_FALLBACK:
        c, t = ORGAN_FALLBACK[co_quan_khoi]
        return [(c, t, co_quan_khoi)]
    return []


def phan_tich(raw):
    """
    raw: chuỗi 'BỆNH CỤ THỂ, CHI TIẾT' từ tong-hop.xlsx
    -> (findings, thi_luc, ghi_chu)
       findings : list dict {atom, concept, icd, ten_icd, co_quan, nguon, tin_cay}
       thi_luc  : dict {mp, mt}
       ghi_chu  : list cảnh báo cho app
    """
    ghi_chu = []
    if not raw:
        return [], {'mp': '', 'mt': ''}, ghi_chu

    # --- thị lực: trích trước, ghi vào cột riêng của mẫu BYT ---
    mp, mt, tl_note = phrase_rules.tach_thi_luc(raw)
    if tl_note:
        ghi_chu.append(tl_note)

    # --- luật cụm từ (gộp/tách) rồi mới tách atom ---
    s, notes = phrase_rules.tien_xu_ly(raw)
    ghi_chu += notes

    findings = []
    da_co = set()
    for atom in process_cell(s):
        atom = phrase_rules.hoan_nguyen(atom)
        ck = concept_key(atom)
        if not ck:
            continue

        ud = user_dict.tra(ck)
        if ud:
            if ud['bo_qua']:
                continue                       # anh Khôi chốt: bỏ qua
            benh = _benh_tu_nghia(ud['nghia'], ud['co_quan'])
            if not benh:
                ghi_chu.append(f'Chưa gán được mã ICD cho "{ud["nghia"]}"')
                continue
            for icd, ten, cq in benh:
                key = (icd, cq)
                if key in da_co:
                    continue
                da_co.add(key)
                findings.append({
                    'atom': atom, 'concept': ck, 'icd': icd, 'ten_icd': ten,
                    'co_quan': cq, 'nguon': 'tu_dien_khoi',
                    'nghia_khoi': ud['nghia'],
                    'tin_cay': TIN_CAY['tu_dien_khoi'], 'can_ra_soat': False})
            continue
        else:
            m = map_concept(ck)
            if m['nguon'] == 'unmapped':
                ghi_chu.append(f'Chưa ánh xạ được ICD: "{atom}"')
                continue
            f = {'atom': atom, 'concept': ck, 'icd': m['icd'],
                 'ten_icd': m['ten_icd'], 'co_quan': m['co_quan'],
                 'nguon': m['nguon'], 'nghia_khoi': ''}
            if m['nguon'] == 'fuzzy':
                f['neo'] = m.get('neo', '')
                f['do_giong'] = m.get('do_giong', '')

        f['tin_cay'] = TIN_CAY[f['nguon']]
        f['can_ra_soat'] = f['nguon'] in CAN_RA_SOAT

        # khử trùng lặp trong cùng 1 ca (cùng mã ICD + cùng cơ quan)
        key = (f['icd'], f['co_quan'])
        if key in da_co:
            continue
        da_co.add(key)
        findings.append(f)

    return findings, {'mp': mp, 'mt': mt}, ghi_chu
