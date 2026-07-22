# -*- coding: utf-8 -*-
"""
fuzzy.py — tìm họ tên gần đúng (§3.3 SPEC + phản hồi 2026-07-22 lần 7).

Nguyên tắc (phản hồi anh Khôi): khớp theo NGUYÊN VĂN chuỗi con sau khi bỏ
dấu — gõ "lợi" chỉ ra tên chứa *lợi* (LỢI, LỢI ANH...), KHÔNG ra các tên chỉ
giống ký tự kiểu "hợi/đới/đòi" (bệnh của partial_ratio đo độ giống letter).

- Bỏ dấu tiếng Việt (đ/Đ xử lý riêng vì NFD không tách được).
- Điểm xếp hạng: khớp NGUYÊN TỪ (query == 1 từ của tên) > khớp ĐẦU TỪ
  ("thanh" ra "THANH..."; "than" cũng ra "THANH") > chuỗi con giữa từ.
- Không khớp chuỗi con -> loại (không dùng điểm giống ký tự nữa).
- Dùng cho tối đa vài nghìn dòng ứng viên (đã lọc trước bằng SQL) nên quét
  tuyến tính bằng Python là đủ nhanh cho 13.326 hồ sơ.
"""
import unicodedata


def strip_diacritics(s):
    """'NGUYỄN VĂN A' -> 'nguyen van a'."""
    if not s:
        return ''
    s = s.replace('đ', 'd').replace('Đ', 'D')
    nfkd = unicodedata.normalize('NFD', s)
    stripped = ''.join(c for c in nfkd if unicodedata.category(c) != 'Mn')
    return stripped.lower()


def match_score(query_stripped, candidate_raw):
    """Điểm khớp: 0 = loại. Chỉ nhận khi query là CHUỖI CON nguyên văn của
    tên đã bỏ dấu; điểm cao hơn khi khớp trọn từ / đầu từ."""
    cand = strip_diacritics(candidate_raw)
    if not query_stripped or query_stripped not in cand:
        return 0
    words = cand.split()
    if query_stripped in words:
        return 300                      # khớp nguyên từ: "lợi" == từ "lợi"
    if any(w.startswith(query_stripped) for w in words):
        return 200                      # khớp đầu từ: "than" -> "thanh"
    return 100                          # chuỗi con bất kỳ (giữa từ / nhiều từ)


def rank_by_name(rows, query, name_key='ho_ten', threshold=None, limit=50):
    """rows: list[dict-like] có khoá `name_key`. Trả về list đã lọc + sắp
    theo điểm giảm dần (ổn định — giữ thứ tự gốc trong cùng mức điểm), tối đa
    `limit` phần tử. `threshold` giữ trong chữ ký để tương thích chỗ gọi cũ."""
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
        if score > 0:
            scored.append((score, r))
    scored.sort(key=lambda x: -x[0])
    return [r for _, r in scored[:limit]]
