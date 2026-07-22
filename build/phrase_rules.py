# -*- coding: utf-8 -*-
"""
phrase_rules.py — Xử lý ở mức CỤM TỪ, chạy TRƯỚC khi tách chuỗi chẩn đoán.

Giải quyết 2 vấn đề ngược nhau mà anh Khôi chỉ ra ở sheet LUUY:

  (A) TÁCH NHẦM — dấu phẩy nằm giữa một chẩn đoán duy nhất, tách ra thì vế sau
      vô nghĩa:
        "ĐTĐ tuyp II, BC TK"          -> ĐTĐ type 2 có biến chứng thần kinh
        "TVĐ Đ CSTL, chèn ép rễ TK"   -> thoát vị đĩa đệm chèn ép rễ thần kinh
        "Thoái hóa khớp gối, tràn dịch" -> thoái hóa + tràn dịch KHỚP GỐI
        "Mất đốt 3 ngón 3,4 và đốt 2,3 ngón V, bàn tay P" -> 1 chẩn đoán

  (B) DÍNH LIỀN — thiếu dấu phân cách, 2 bệnh của 2 cơ quan bị nhập làm một:
        "Cắt túi maatjMR 27"                    -> cắt túi mật | mất răng 27
        "gan nhiễm mowxCan lệch xương cẳng tay" -> gan nhiễm mỡ | can lệch xương
        "MT sẹo R16S3"                          -> sẹo mắt trái | răng 16 sâu ngà

Ngoài ra tách THỊ LỰC ra khỏi chuỗi chẩn đoán để ghi vào đúng cột của mẫu BYT.
"""
import re

# ---------------------------------------------------------------- (A) GỘP
# Thay cả cụm bằng MỘT chẩn đoán chuẩn, dùng '¶' để chặn tách về sau.
GOP = [
    # ĐTĐ + biến chứng thần kinh (có thể cách nhau nhiều chẩn đoán khác)
    (r'(đái tháo đường|đtđ|đt)\s*(typ|tuýp|tuyp|type)?\s*(ii|2)?'
     r'(?=[^\n]{0,90}?\bb\s*[/.]?\s*c\s*tk\b)',
     'Đái tháo đường type 2 có biến chứng thần kinh¶'),
    (r'[,;/]\s*b\s*[/.]?\s*c\s*tk\b', ''),          # xóa vế 'BC TK' còn lại

    # thoát vị đĩa đệm + chèn ép rễ thần kinh
    (r'(tvđ\s*đ|tv\s*đ\s*đ|thoát vị đĩa đệm)[^,;/]{0,20}[,;/]\s*'
     r'chèn ép\s*(rễ)?\s*(tk|thần kinh)',
     'Thoát vị đĩa đệm có chèn ép rễ thần kinh¶'),

    # thoái hóa khớp gối + tràn dịch
    (r'thoái hóa khớp gối\s*[,;/]\s*tràn dịch',
     'Thoái hóa khớp gối¶ Tràn dịch khớp gối¶'),

    # "viêm, gan B" -> viêm gan virus B
    (r'\bviêm\s*[,;/]\s*gan\s*b\b', 'Viêm gan virus B¶'),

    # "Sâu, vỡ nhiều răng hàm"
    (r'sâu\s*[,;/]\s*vỡ nhiều răng', 'Sâu nhiều răng¶ Vỡ nhiều răng¶'),

    # "TH, TVCSTL" -> thoái hóa + thoát vị CSTL
    (r'\bth\s*[,;/]\s*tv\s*cstl\b',
     'Thoái hóa cột sống thắt lưng¶ Thoát vị đĩa đệm cột sống thắt lưng¶'),

    # "Gù vẹo biến dạng CS, lồng ngực"
    (r'gù vẹo biến dạng cs\s*[,;/]\s*lồng ngực',
     'Gù vẹo biến dạng cột sống và lồng ngực¶'),

    # "Gãy cũ xương đòn P, Bánh Chè P" -> 2 lần gãy
    (r'g[ãẫ]y cũ xương đòn\s*([pt])\s*[,;/]\s*bánh chè\s*([pt])',
     r'Gãy cũ xương đòn \1¶ Gãy cũ xương bánh chè \2¶'),

    # mất/cụt đốt ngón: bảo vệ toàn bộ cụm (dấu phẩy liệt kê đốt & ngón)
    (r'(mất|cụt|đứt)\s*đ[óô]?t\s*[\d,\s]*ngón[^/;]*?(bàn\s*(tay|chân)\s*[pt]?|'
     r'tay\s*(trái|phải|[pt])|chân\s*(trái|phải|[pt]))',
     lambda m: m.group(0).replace(',', '·') + '¶'),
    (r'mất\s*[\d,\s]+bàn tay\s*(trái|phải|[pt])',
     lambda m: 'Mất ngón ' + m.group(0)[4:].replace(',', '·') + '¶'),
    (r'đứt cũ gân[^/;]*?ngón\s*[iv\d]+\s*(bàn\s*)?tay\s*(trái|phải|[pt])',
     lambda m: m.group(0).replace(',', '·') + '¶'),

    # "cứng ngón 3,4,5 bàn tay P" — bảo vệ danh sách ngón
    (r'cứng\s*(khớp\s*)?ngón\s*[\d,\s]+(bàn\s*)?tay\s*(trái|phải|[pt])',
     lambda m: m.group(0).replace(',', '·') + '¶'),
]

# ---------------------------------------------------------------- (B) TÁCH
# Chèn dấu phân cách vào chỗ 2 chẩn đoán bị dính liền.
TACH = [
    # ...chữ thường + MR/R + số răng  ->  chèn dấu phẩy trước MR
    (r'(?<=[a-zà-ỹ])\s*(MR|NR)\s*(\d{2})', r', Mất răng \2'),
    (r'(?<=[a-zà-ỹ])\s*R(\d{2})S(\d)', r', Răng \1 sâu ngà'),
    (r'(?<=[a-zà-ỹ])\s*R(\d{2})T(\d)', r', Răng \1 viêm tủy'),
    # 'gan nhiễm mowxCan lệch xương' — chữ thường dính ngay chữ HOA của từ mới.
    # CẢNH BÁO: KHÔNG dùng dải [A-ZÀ-Ỹ] cho chữ hoa tiếng Việt — các khối
    # Unicode xen kẽ nhau nên dải đó chứa cả chữ THƯỜNG ('ư' U+01B0 nằm giữa
    # 'À' U+00C0 và 'Ỹ' U+1EF8), khiến "xương" bị cắt thành "x" + "ương".
    # Phải liệt kê tường minh.
    (r'(?<=[' + 'a-z' + 'àáâãèéêìíòóôõùúăđĩũơưạảấầẩẫậắằẳẵặẹẻẽềểễệỉịọỏốồổỗộ'
     r'ớờởỡợụủứừửữựỳỵỷỹý' + r'])'
     r'(?=[' + 'A-Z' + 'ÀÁÂÃÈÉÊÌÍÒÓÔÕÙÚĂĐĨŨƠƯẠẢẤẦẨẪẬẮẰẲẴẶẸẺẼỀỂỄỆỈỊỌỎỐỒỔỖỘ'
     r'ỚỜỞỠỢỤỦỨỪỬỮỰỲỴỶỸÝ' + r'][' + 'a-z'
     r'àáâãèéêìíòóôõùúăđĩũơưạảấầẩẫậắằẳẵặẹẻẽềểễệỉịọỏốồổỗộớờởỡợụủứừửữựỳỵỷỹý'
     r']{3,})', ', '),
]

# ---------------------------------------------------------------- Chuẩn hóa
# Ký hiệu răng viết dính: MR16172627 -> MR 16,17,26,27
def tach_so_rang(s):
    def rep(m):
        kw, so = m.group(1), m.group(2)
        return kw + ' ' + ','.join(so[i:i + 2] for i in range(0, len(so), 2))
    return re.sub(r'\b(MR|NR|mất răng|Mất răng)\s*((?:[1-4][1-8]){3,})\b', rep, s)


# ---------------------------------------------------------------- THỊ LỰC
# "MP 4/10, MT5/10" | "2M: 8/10" | "MP 4/10 MT 5/10"
TL_PHAI = re.compile(r'\b(?:mp|mắt phải)\s*:?\s*(\d{1,2}\s*/\s*10)', re.I)
TL_TRAI = re.compile(r'\b(?:mt|mắt trái)\s*:?\s*(\d{1,2}\s*/\s*10)', re.I)
TL_HAI  = re.compile(r'\b(?:2\s*m|2\s*mắt|hai mắt)\s*:?\s*(\d{1,2}\s*/\s*10)', re.I)
TL_TRON = re.compile(r'\b(?:mắt)\s*:?\s*(\d{1,2}\s*/\s*10)', re.I)


def tach_thi_luc(raw):
    """
    -> (mp, mt, ghi_chu). Giá trị dạng 'x/10' đúng danh mục DM_KQmat của mẫu BYT.
    KHÔNG xóa khỏi chuỗi chẩn đoán (vẫn giữ để truy vết), chỉ trích ra.
    """
    if not raw:
        return '', '', ''
    s = str(raw)
    chuan = lambda v: re.sub(r'\s+', '', v)
    mp = mt = ''
    ghi = ''
    m = TL_HAI.search(s)
    if m:
        mp = mt = chuan(m.group(1))
    m = TL_PHAI.search(s)
    if m:
        mp = chuan(m.group(1))
    m = TL_TRAI.search(s)
    if m:
        mt = chuan(m.group(1))
    if not mp and not mt:
        m = TL_TRON.search(s)
        if m:
            # 'mắt 3/10' — không rõ bên nào; anh Khôi chốt ghi vào MẮT TRÁI
            # nhưng đây là suy đoán -> phải gắn cờ để app nhắc rà soát.
            mt = chuan(m.group(1))
            ghi = (f'Thị lực "{m.group(0).strip()}" không ghi rõ bên mắt — '
                   f'đã tạm ghi vào MẮT TRÁI, CẦN RÀ SOÁT')
    return mp, mt, ghi


# ---------------------------------------------------------------- API
def tien_xu_ly(raw):
    """
    Áp toàn bộ luật cụm từ lên chuỗi chẩn đoán thô.
    -> (chuỗi đã xử lý, danh sách ghi chú)
    """
    if not raw:
        return '', []
    s = str(raw)
    notes = []
    goc = s

    # Bỏ trị số thị lực khỏi chuỗi chẩn đoán — đã trích sang cột riêng rồi,
    # để lại sẽ sinh mẩu rác kiểu "MT5/10)".
    s = re.sub(r'\(?\s*(?:mp|mt|2\s*m|mắt(?:\s*(?:phải|trái))?|hai mắt)'
               r'\s*:?\s*\d{1,2}\s*/\s*10\s*[,;]?\s*\)?', ' ', s, flags=re.I)
    s = re.sub(r'\s{2,}', ' ', s).strip(' ,;/')

    s = tach_so_rang(s)
    for pat, rep in TACH:
        s = re.sub(pat, rep, s)
    for pat, rep in GOP:
        s2 = re.sub(pat, rep, s, flags=re.IGNORECASE)
        if s2 != s:
            s = s2
    if s != goc:
        notes.append('Đã áp luật cụm từ (gộp/tách chẩn đoán dính liền)')
    return s, notes


def hoan_nguyen(atom):
    """Trả lại dấu phẩy đã được bảo vệ trong cụm liệt kê đốt/ngón."""
    return atom.replace('·', ',').replace('¶', '').strip(' ,;')
