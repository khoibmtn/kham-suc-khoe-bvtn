# -*- coding: utf-8 -*-
"""
fuzzy.py — tìm fuzzy họ tên (§3.3 SPEC).

- Bỏ dấu tiếng Việt (đ/Đ xử lý riêng vì NFD không tách được).
- Khớp một phần từ bằng substring (điểm 100) trước, sau đó rapidfuzz
  partial_ratio (ngưỡng mặc định 75), sắp điểm giảm dần.
- Dùng cho tối đa vài nghìn dòng ứng viên (đã lọc trước bằng SQL) nên
  quét tuyến tính bằng Python là đủ nhanh cho 13.326 hồ sơ.
"""
import unicodedata

try:
    from rapidfuzz import fuzz
    _HAS_RAPIDFUZZ = True
except ImportError:  # pragma: no cover - rapidfuzz có trong requirements.txt
    import difflib
    _HAS_RAPIDFUZZ = False


def strip_diacritics(s):
    """'NGUYỄN VĂN A' -> 'nguyen van a'."""
    if not s:
        return ''
    s = s.replace('đ', 'd').replace('Đ', 'D')
    nfkd = unicodedata.normalize('NFD', s)
    stripped = ''.join(c for c in nfkd if unicodedata.category(c) != 'Mn')
    return stripped.lower()


def _ratio(a, b):
    if _HAS_RAPIDFUZZ:
        return fuzz.partial_ratio(a, b)
    return difflib.SequenceMatcher(None, a, b).ratio() * 100


def match_score(query_stripped, candidate_raw):
    """Điểm khớp 0-100. Substring (khớp một phần từ) luôn cho điểm 100."""
    cand_stripped = strip_diacritics(candidate_raw)
    if not query_stripped:
        return 0.0
    if query_stripped in cand_stripped:
        return 100.0
    return _ratio(query_stripped, cand_stripped)


def rank_by_name(rows, query, name_key='ho_ten', threshold=75, limit=50):
    """rows: list[dict-like] có khoá `name_key`. Trả về list đã lọc + sắp
    theo điểm giảm dần, tối đa `limit` phần tử."""
    q = strip_diacritics(query)
    if not q:
        return list(rows)[:limit]
    scored = []
    for r in rows:
        try:
            name = r[name_key] or ''
        except (KeyError, IndexError):
            name = ''
        score = match_score(q, name)
        if score >= threshold:
            scored.append((score, r))
    scored.sort(key=lambda x: -x[0])
    return [r for _, r in scored[:limit]]
