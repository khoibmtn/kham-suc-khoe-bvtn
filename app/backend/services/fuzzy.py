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


def _token_score(token, words, cand):
    """Điểm 1 từ khóa với 1 tên: nguyên từ > đầu từ > chuỗi con; 0 = trượt."""
    if token in words:
        return 300                      # khớp nguyên từ: "lợi" == từ "lợi"
    if any(w.startswith(token) for w in words):
        return 200                      # khớp đầu từ: "than" -> "thanh"
    if token in cand:
        return 100                      # chuỗi con bất kỳ (giữa từ)
    return 0


def match_score(query_stripped, candidate_raw):
    """Điểm khớp: 0 = loại. Query nhiều từ = TỪNG TỪ đều phải khớp đâu đó
    trong tên (kiểu *phạm*hợp* — "phạm hợp" ra "PHẠM THỊ HỢP"), cộng dồn
    điểm; thưởng nhẹ khi các từ xuất hiện đúng thứ tự."""
    cand = strip_diacritics(candidate_raw)
    tokens = query_stripped.split()
    if not tokens or not cand:
        return 0
    words = cand.split()
    total = 0
    for t in tokens:
        s = _token_score(t, words, cand)
        if s == 0:
            return 0                    # thiếu 1 từ là loại
        total += s
    # thưởng khi các từ khóa xuất hiện theo đúng thứ tự trong tên
    pos, in_order = 0, True
    for t in tokens:
        i = cand.find(t, pos)
        if i < 0:
            in_order = False
            break
        pos = i + len(t)
    return total + (50 if in_order else 0)


# PLAN_PERF.md §2 — nhãn "Loại I".."Loại V" của phan_loai_sk, dùng để gộp
# vào search_blob_kd (cho phép gõ "loai iv"/"loai 4" tìm ra hồ sơ — chỉ "iv"
# thực sự phân biệt được nên gõ số ả rập KHÔNG khớp trực tiếp; giữ đơn giản
# theo đúng nhãn hiển thị ở danh_muc/phan_loai_sk).
_PHAN_LOAI_SK_NHAN = {1: 'loai i', 2: 'loai ii', 3: 'loai iii', 4: 'loai iv', 5: 'loai v'}


def _get(rec, key):
    """Đọc `rec[key]` an toàn cho cả Row (db.py/sqlite3.Row) lẫn dict thường
    — trả None nếu thiếu cột/khoá thay vì raise."""
    try:
        return rec[key]
    except (KeyError, IndexError, TypeError):
        return None


def build_search_cols(rec):
    """rec: Row hoặc dict có đủ các cột nguồn của bảng ho_so. Trả
    (ho_ten_kd, search_blob_kd) — cả 2 đã bỏ dấu + lowercase, dùng để ghi
    vào 2 cột cùng tên trên bảng ho_so (PLAN_PERF.md §2), cho phép tìm kiếm
    bằng `WHERE ho_ten_kd/search_blob_kd LIKE '%từ_khóa%'` — KHÔNG cần quét
    toàn bộ dòng bằng Python.

    search_blob_kd gộp: ho_ten, so_cccd, maxa_cu_tru, ma_ho_so, ket_luan_benh,
    ngay_sinh, ngay_vao, gioi_tinh, tên cơ quan bệnh chính (qc.TEN_CQ) và
    nhãn phân loại sức khỏe (vd 'loai iii')."""
    # import trễ để tránh vòng lặp import lúc module-load (services/qc.py
    # không import fuzzy nên an toàn, nhưng import trễ vẫn rẻ và tránh phụ
    # thuộc thứ tự import giữa các module trong services/).
    from services import qc  # noqa: E402

    ho_ten = _get(rec, 'ho_ten') or ''
    ho_ten_kd = strip_diacritics(ho_ten)

    co_quan_ten = ''
    cq_code = _get(rec, 'co_quan_benh_chinh')
    if cq_code:
        co_quan_ten = qc.TEN_CQ.get(cq_code, cq_code) or ''

    pl_nhan = ''
    pl = _get(rec, 'phan_loai_sk')
    if pl is not None:
        try:
            pl_nhan = _PHAN_LOAI_SK_NHAN.get(int(pl), '')
        except (TypeError, ValueError):
            pl_nhan = ''

    parts = [
        ho_ten, _get(rec, 'so_cccd'), _get(rec, 'maxa_cu_tru'),
        _get(rec, 'ma_ho_so'), _get(rec, 'ket_luan_benh'),
        _get(rec, 'ngay_sinh'), _get(rec, 'ngay_vao'), _get(rec, 'gioi_tinh'),
        co_quan_ten, pl_nhan,
        # Bổ sung các trường lâm sàng để "tìm toàn cột" phủ đủ (phản hồi anh
        # Khôi — vd tìm glucose 5.8): glucose, điện tim, siêu âm, chẩn đoán gốc,
        # mã/tên bệnh kèm, điện thoại, địa chỉ.
        _get(rec, 'glu_gia_tri'), _get(rec, 'glu_thoi_diem'),
        _get(rec, 'kq_dien_tim'), _get(rec, 'kq_sieu_am_o_bung'),
        _get(rec, 'cac_benh_tat_neu_co'), _get(rec, 'ma_benh_chinh'),
        _get(rec, 'ma_benh_kem'), _get(rec, 'ten_benh_kem'),
        _get(rec, 'dien_thoai'), _get(rec, 'dia_chi'),
    ]
    # Chuẩn hóa dấu phẩy -> chấm để tìm '5,8' cũng khớp glucose '5.8' (và ngược
    # lại). Tách ';' thành khoảng trắng để mã bệnh kèm 'I49.4;I45.9' -> mỗi mã
    # là 1 từ tìm được.
    blob = ' '.join(strip_diacritics(str(p)) for p in parts if p not in (None, ''))
    blob = blob.replace(',', '.').replace(';', ' ')
    return ho_ten_kd, blob


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
