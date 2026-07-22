# -*- coding: utf-8 -*-
"""
fuzzy.py — Tầng khớp MỜ cho các biến thể gõ sai chính tả.

Vì sao cần: dữ liệu nhập tay có hàng nghìn biến thể của cùng một chẩn đoán
("Gan nhiễm mữ", "gan nhiễm ỡ", "han nhiêm mỡ", "Gan nhễm mỡ", "Gan nhiêm xmowx
độ 2"...). Liệt kê từng lỗi vào từ điển là không bền vững. Thay vào đó:

  1. Quét corpus, lấy các khái niệm ĐÃ khớp rule làm "mỏ neo" (anchor),
     kèm tần suất — khái niệm càng phổ biến càng đáng tin để làm neo.
  2. Với khái niệm chưa khớp, so khớp mờ với các neo. Nếu đủ giống -> mượn
     ánh xạ ICD của neo đó.

An toàn: chỉ chấp nhận khi độ giống CAO và cùng "chữ cái đầu các từ" để tránh
gộp nhầm hai bệnh khác nhau (vd 'viêm gan' vs 'viêm gan B' phải giữ riêng ->
xử lý bằng ngưỡng và điều kiện độ dài).
"""
import re
import unicodedata
from difflib import SequenceMatcher

_ANCHORS = []          # [(concept, mapping, freq)]


def bo_dau(s):
    """Bỏ dấu tiếng Việt để so sánh — lỗi gõ hay sai ở dấu."""
    s = unicodedata.normalize('NFD', s)
    s = ''.join(c for c in s if unicodedata.category(c) != 'Mn')
    return s.replace('đ', 'd').replace('Đ', 'D').lower()


def build(concept_freq, map_fn):
    """
    concept_freq: {concept -> số lần xuất hiện} trên toàn corpus
    map_fn: hàm concept -> mapping dict (map_concept)
    """
    global _ANCHORS
    _ANCHORS = []
    for c, n in concept_freq.items():
        if n < FREQ_NEO_MIN:
            continue
        m = map_fn(c)
        if m and m['nguon'] == 'rule':
            _ANCHORS.append((c, bo_dau(c), m, n))
    # neo phổ biến xét trước
    _ANCHORS.sort(key=lambda x: -x[3])
    return len(_ANCHORS)


NGUONG = 0.90          # độ giống tối thiểu (siết từ 0.86 sau khi phát hiện
                       # 'viêm hạng mạn' bị khớp nhầm sang 'viêm xoang mạn')
CHENH_DAI = 3          # chênh lệch độ dài tối đa (ký tự)
FREQ_NEO_MIN = 2       # neo phải xuất hiện >= 2 lần — tránh lấy chính một lỗi
                       # gõ hiếm gặp làm chuẩn cho lỗi gõ khác


def tim(concept):
    """
    Trả (mapping, neo, độ_giống) nếu tìm được neo đủ giống, ngược lại None.
    """
    if not concept or len(concept) < 4:
        return None
    q = bo_dau(concept)
    tot, best = 0.0, None
    for c, cq, m, n in _ANCHORS:
        if abs(len(cq) - len(q)) > CHENH_DAI:
            continue
        # sàng nhanh: phải chung ký tự đầu để loại bớt trước khi tính tỉ số
        if cq[0] != q[0]:
            continue
        r = SequenceMatcher(None, q, cq).ratio()
        if r > tot:
            tot, best = r, (m, c)
        if r > 0.97:
            break
    if best and tot >= NGUONG:
        return {'icd': best[0]['icd'], 'ten_icd': best[0]['ten_icd'],
                'co_quan': best[0]['co_quan'], 'nguon': 'fuzzy',
                'neo': best[1], 'do_giong': round(tot, 3)}
    return None
