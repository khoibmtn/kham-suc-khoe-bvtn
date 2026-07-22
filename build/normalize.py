# -*- coding: utf-8 -*-
"""
normalize.py — Chuẩn hóa & tách chuỗi chẩn đoán KSK NCT thành các atom bệnh độc lập.
Dùng chung cho pipeline mẫu (100 ca) và chạy toàn bộ.
"""
import re
import unicodedata

# ---------- 1. Chuẩn hóa Unicode & khoảng trắng ----------
def nfc(s):
    return unicodedata.normalize('NFC', str(s))

def basic_clean(s):
    s = nfc(s)
    s = s.replace(' ', ' ')
    s = re.sub(r'\s+', ' ', s)
    return s.strip(' .,;-\t')

# ---------- 2. Bảo vệ ký hiệu răng ----------
# Răng theo hệ FDI: 11-18, 21-28, 31-38, 41-48
TOOTH = r'(?:1[1-8]|2[1-8]|3[1-8]|4[1-8])'

def protect_dotted_teeth(s):
    """
    Ký hiệu răng FDI viết dạng chấm: 'MR2.7' = mất răng 27, 'MR 1.6' = răng 16.
    Chuyển về dạng liền để không bị nhầm là số thập phân.
    """
    return re.sub(r'\b(mất\s*r(?:ăng)?|mr|sâu\s*r(?:ăng)?|sr|r)\s*([1-4])\.([1-8])\b',
                  lambda m: f'{m.group(1)}{m.group(2)}{m.group(3)}', s,
                  flags=re.IGNORECASE)


def protect_teeth(s):
    """
    Gộp danh sách số răng thành 1 token để dấu phẩy giữa chúng không bị coi là
    dấu tách bệnh.  VD: 'Mất răng 17,37,46' -> 'Mất răng 17§37§46'
    """
    # dạng: <từ khóa răng> <số>[,/ <số>]*
    kw = r'(?:mất\s+r(?:ăng)?|mr|sâu\s+r(?:ăng)?|r|răng)'
    def repl(m):
        return m.group(0).replace(',', '§').replace('.', '§')
    pat = re.compile(kw + r'\s*\.?\s*' + TOOTH + r'(?:\s*[,.]\s*' + TOOTH + r')+',
                     flags=re.IGNORECASE)
    return pat.sub(repl, s)

def restore_teeth(s):
    return s.replace('§', ',')

# ---------- 3. Bảo vệ số thập phân & đơn vị ----------
def protect_decimals(s):
    # 6.7 mmol/l, độ 1.5 ...
    return re.sub(r'(?<=\d)\.(?=\d)', '¤', s)

def restore_decimals(s):
    return s.replace('¤', '.')

def protect_hc(s):
    """
    'H/c cushing' — H/c = hội chứng. Không bảo vệ thì dấu '/' xé thành
    'H' + 'c cushing', mất hoàn toàn chẩn đoán.
    """
    return re.sub(r'\b([Hh])\s*/\s*c\b', r'\1¢c', s)

def restore_hc(s):
    return re.sub(r'([Hh])¢c', r'\1ội chứng', s)


def protect_fractions(s):
    """
    Bảo vệ phân số khỏi bị coi là dấu tách: 'cắt 2/3 dạ dày', 'liệt 1/2 người',
    thị lực '6/10', '10/10'.  Nếu không bảo vệ, dấu '/' sẽ xé đôi cụm bệnh.
    """
    return re.sub(r'(?<=\d)\s*/\s*(?=\d)', '¥', s)

def restore_fractions(s):
    return s.replace('¥', '/')

# ---------- 4. Tách atom ----------
# Dấu '.' an toàn để tách vì số thập phân (¤) và cụm số răng (§) đã được bảo vệ.
# '¶' là dấu tách do phrase_rules chèn vào sau khi gộp/tách cụm từ.
SPLIT_PAT = re.compile(r'[,;/\n.¶]|(?<!\w)\+(?!\w)|\s-\s')

def split_atoms(s):
    s = basic_clean(s)
    if not s:
        return []
    s = protect_hc(s)
    s = protect_dotted_teeth(s)
    s = protect_decimals(s)
    s = protect_fractions(s)
    s = protect_teeth(s)
    parts = SPLIT_PAT.split(s)
    out = []
    for p in parts:
        p = restore_hc(restore_teeth(restore_fractions(restore_decimals(p))))
        # '·' = dấu phẩy đã được phrase_rules bảo vệ trong cụm liệt kê
        # đốt/ngón tay ("Mất đốt 3 ngón 3·4 và đốt 2·3 ngón V bàn tay P")
        p = p.replace('·', ',')
        p = basic_clean(p)
        if p and not re.fullmatch(r'[\W\d]+', p):
            out.append(p)
    return out

# ---------- 5. Từ điển viết tắt -> dạng đầy đủ ----------
# key: dạng đã lower + bỏ dấu cách thừa
ABBREV = {
    # Tuần hoàn
    'tha': 'Tăng huyết áp',
    'ts tha': 'Tiền sử tăng huyết áp',
    'tmct': 'Thiếu máu cơ tim',
    'tmctcb': 'Thiếu máu cơ tim cục bộ',
    'rl nhip': 'Rối loạn nhịp tim',
    'rl nhịp': 'Rối loạn nhịp tim',
    'rlnhịp': 'Rối loạn nhịp tim',
    'nhịp nhanh': 'Nhịp nhanh xoang',
    'nhịp chậm': 'Nhịp chậm xoang',
    'block nhánh p': 'Block nhánh phải',
    'block nhánh t': 'Block nhánh trái',
    'ngoại tâm thu': 'Ngoại tâm thu',
    'rlmm': 'Rối loạn chuyển hóa lipid máu',
    'rlcm lipid': 'Rối loạn chuyển hóa lipid máu',
    'suy tim': 'Suy tim',
    # Nội tiết
    'đtđ': 'Đái tháo đường',
    'dtd': 'Đái tháo đường',
    'đtđ typ2': 'Đái tháo đường type 2',
    'basedow': 'Bệnh Basedow',
    'bướu giáp': 'Bướu giáp',
    # Hô hấp
    'copd': 'Bệnh phổi tắc nghẽn mạn tính',
    'vpq': 'Viêm phế quản',
    'vpq mạn': 'Viêm phế quản mạn tính',
    'hpq': 'Hen phế quản',
    # Tiêu hóa
    'gnm': 'Gan nhiễm mỡ',
    'vdd': 'Viêm dạ dày',
    'vddtt': 'Viêm dạ dày tá tràng',
    'trxhtt': 'Trào ngược dạ dày thực quản',
    # Tiết niệu - sinh dục
    'tlt': 'Tuyến tiền liệt',
    'u xơ tlt': 'U xơ tuyến tiền liệt',
    'phì đại tlt': 'Phì đại tuyến tiền liệt',
    'tlt to': 'Phì đại tuyến tiền liệt',
    'nang thận t': 'Nang thận trái',
    'nang thận p': 'Nang thận phải',
    'sỏi thận t': 'Sỏi thận trái',
    'sỏi thận p': 'Sỏi thận phải',
    # Cơ xương khớp
    'thk': 'Thoái hóa khớp',
    'th khớp': 'Thoái hóa khớp',
    'thk gối': 'Thoái hóa khớp gối',
    'thcs': 'Thoái hóa cột sống',
    'thcstl': 'Thoái hóa cột sống thắt lưng',
    'thcsc': 'Thoái hóa cột sống cổ',
    'thoái hóa cstl': 'Thoái hóa cột sống thắt lưng',
    'thoái hóa csc': 'Thoái hóa cột sống cổ',
    'tvđđ': 'Thoát vị đĩa đệm',
    'lx': 'Loãng xương',
    'gai cs': 'Gai cột sống',
    # Mắt
    'tkx': 'Tật khúc xạ',
    '2m tkx': '2 mắt tật khúc xạ',
    '2m tật khúc xạ': '2 mắt tật khúc xạ',
    '2 mắt tkx': '2 mắt tật khúc xạ',
    'đục t3': 'Đục thể thủy tinh',
    '2m đục t3': '2 mắt đục thể thủy tinh',
    'đục ttt': 'Đục thể thủy tinh',
    'iol': 'Đã đặt thể thủy tinh nhân tạo',
    '2m iol': '2 mắt đã đặt thể thủy tinh nhân tạo',
    'mp': 'Mắt phải',
    'mt': 'Mắt trái',
    '2m': '2 mắt',
    'lão thị': 'Lão thị',
    'mộng': 'Mộng thịt',
    # TMH
    'nghe kém': 'Nghe kém',
    'vtg': 'Viêm tai giữa',
    'vmx': 'Viêm mũi xoang',
    'vh mạn': 'Viêm họng mạn tính',
    'vh cấp': 'Viêm họng cấp',
    'viêm họng mạn': 'Viêm họng mạn tính',
    'viêm họng cấp': 'Viêm họng cấp',
    # RHM
    'mr': 'Mất răng',
    'mất nhiều r': 'Mất nhiều răng',
    'mất nhiểu răng': 'Mất nhiều răng',
    'móm': 'Sai khớp cắn (móm)',
    'vql': 'Viêm quanh răng',
    'viêm lợi': 'Viêm lợi',
    # Thần kinh - Tâm thần
    'tbmmn': 'Tai biến mạch máu não',
    'ssdt': 'Sa sút trí tuệ',
    'rlts': 'Rối loạn tiền đình',
    'đtkv': 'Đau thần kinh vai gáy',
    'hc tiền đình': 'Hội chứng tiền đình',
    # Da liễu
    'sẩn ngứa': 'Sẩn ngứa',
    'viêm da cơ địa': 'Viêm da cơ địa',
    # Khác
    'bt': None,          # 'bình thường' -> không phải bệnh
    'bình thường': None,
    'không': None,
    'khỏe': None,
    'ko': None,
}

NOT_DISEASE = {'bt', 'bình thường', 'không', 'ko', 'khỏe', 'khoẻ', 'n/a', 'na',
               'không bệnh', 'không có', '0', 'k', '-'}

# Mẫu KHÔNG phải chẩn đoán: trị số thị lực (6/10, 10/10), số đơn lẻ, tần số tim
NOT_DISEASE_PAT = re.compile(
    r'^(?:\d{1,2}\s*/\s*10|\d+(?:[.,]\d+)?|tst\s*\d+.*|\d+\s*ck.*|'
    r'[ivx]+|độ\s*[ivx\d]+|\d+\s*mm\w*|\d+\s*mmol.*)$', re.IGNORECASE)

# Cụm số răng: 'MR16,17,26' / 'Mất răng 17,37' / 'R16S3'
TOOTH_LIST = re.compile(
    r'^(mất\s*r(?:ăng)?|mr)\s*\.?\s*' + TOOTH + r'(?:\s*[,.]\s*' + TOOTH + r')*$',
    flags=re.IGNORECASE)
TOOTH_CARIES = re.compile(
    r'^(sâu\s*r(?:ăng)?|sr|r)\s*\.?\s*' + TOOTH + r'(?:\s*s\s*\d)?$',
    flags=re.IGNORECASE)

def expand_abbrev(atom):
    """Trả về dạng đầy đủ nếu khớp từ điển viết tắt, ngược lại giữ nguyên."""
    key = basic_clean(atom).lower()
    key = re.sub(r'\s+', ' ', key)
    if key in NOT_DISEASE or NOT_DISEASE_PAT.match(key):
        return None
    if key in ABBREV:
        return ABBREV[key]
    # cụm số răng -> quy về khái niệm bệnh, giữ số răng trong ngoặc để truy vết
    m = TOOTH_LIST.match(key)
    if m:
        nums = re.findall(TOOTH, key)
        return 'Mất răng (' + ','.join(nums) + ')'
    m = TOOTH_CARIES.match(key)
    if m:
        nums = re.findall(TOOTH, key)
        return 'Sâu răng (' + ','.join(nums) + ')'
    return basic_clean(atom)

# ---------- 5b. Sửa lỗi chính tả / viết tắt phổ biến ----------
# Áp dụng bên trong canon_key (đã lower). Thứ tự có ý nghĩa.
TYPO = [
    (r'dạ\s*dầy', 'dạ dày'),
    (r'ngư[uớ]?ứa|ngưá', 'ngứa'),
    (r'parki[sn]?on|parkison', 'parkinson'),
    (r'\bmòm\b', 'mòn'),
    (r'nhi[êe]{1,2}m?[êe]?m\b|nhiêm\b', 'nhiễm'),
    (r'\bi0?2\b', 'iol'),           # lỗi gõ 0 thay O: IOL -> I02
    (r'\bio[c0]\b', 'iol'),
    (r'\bctc\b', 'cổ tử cung'),
    (r'\bađ\b|\bâđ\b', 'âm đạo'),
    (r'\bqr\b', 'quanh răng'),
    (r'\bbt\b(?=\s*(trái|phải|2 bên))', 'buồng trứng'),
    (r'\bha\s*cao\b|\bcao\s*ha\b', 'tăng huyết áp'),
    (r'\bpq\b', 'phế quản'),
    (r'\bgm\b', 'giác mạc'),
    (r'\btc\b', 'tử cung'),
    (r'\bttl\b|\btlt\b', 'tuyến tiền liệt'),
    (r'\bcs\s*tl\b|\bcstl\b', 'cột sống thắt lưng'),
    (r'\bcs\s*c\b|\bcsc\b', 'cột sống cổ'),
    (r'\btbmmn\b', 'tai biến mạch máu não'),
    (r'\bpt\b|\bphẫu thuật\b', 'mổ'),
    (r'\bpolip\b|\bpolyp\b|\bpôlyp\b', 'polyp'),
    (r'\bviêm\s*pq\b', 'viêm phế quản'),
    (r'\bđt\s*đ\b|\bđtđ\b|\bdtd\b', 'đái tháo đường'),
    (r'\bt3\b', 'thể thủy tinh'),
    (r'\bmắt\s*[tp]\b', 'mắt'),
    (r'\btai\s*[tp]\b', 'tai'),
]

# ---------- 6. Khóa gộp (canonical key) để đếm unique ----------
def canon_key(atom):
    """
    Khóa gộp các biến thể chính tả: bỏ dấu cách thừa, thống nhất hóa/hoá,
    y/i, lower.  Dùng để gom atom về cùng 1 mục trong từ điển ICD.
    """
    s = basic_clean(atom).lower()
    # LƯU Ý: phải dùng ranh giới từ — 'thoái' chứa chuỗi con 'hoá',
    # replace thô sẽ biến 'thoái hóa' thành 'thóai hóa'.
    for a, b in [('hoá', 'hóa'), ('thuỷ', 'thủy'), ('luỹ', 'lũy'),
                 ('khoẻ', 'khỏe'), ('nhiểu', 'nhiều'), ('thoá i', 'thoái')]:
        s = re.sub(r'(?<![\wàáâãèéêìíòóôõùúăđĩũơưăạảấầẩẫậắằẳẵặẹẻẽềềểễệỉịọỏốồổỗộớờởỡợụủứừửữựỳỵỷỹý])'
                   + a
                   + r'(?![\wàáâãèéêìíòóôõùúăđĩũơưăạảấầẩẫậắằẳẵặẹẻẽềềểễệỉịọỏốồổỗộớờởỡợụủứừửữựỳỵỷỹý])',
                   b, s)
    # sửa lỗi chính tả / viết tắt phổ biến trong dữ liệu nhập tay
    for a, b in TYPO:
        s = re.sub(a, b, s)
    s = re.sub(r'\s*-\s*', ' ', s)
    s = re.sub(r'\s+', ' ', s)
    # gộp số răng: mọi 'mất răng <số>' -> 'mất răng <n>'
    s = re.sub(r'\b(mất răng|mr)\s*\.?\s*' + TOOTH + r'\b', 'mất răng <r>', s)
    s = re.sub(r'\b(sâu răng|sr|r)\s*\.?\s*' + TOOTH + r'\b', 'sâu răng <r>', s)
    return s.strip()

# ---------- 6b. Khóa KHÁI NIỆM (concept) để tra ICD ----------
# Bỏ bên trái/phải, số răng, mức độ -> gom về đúng 1 khái niệm bệnh.
# Chi tiết bên/độ vẫn được giữ nguyên trong atom gốc để ghi vào ô kết quả khám.
LATERAL = re.compile(
    r'^(?:2\s*m|2\s*mắt|hai\s*mắt|mp|mt|mắt\s*(?:phải|trái)|'
    r'2\s*tai|hai\s*tai|tai\s*[ptr]|tai\s*(?:phải|trái)|'
    r'[tp]|trái|phải|2\s*bên|hai\s*bên|bên\s*[tp])\s+', re.IGNORECASE)
DEGREE = re.compile(
    r'\s*(?:độ|mức|giai\s*đoạn|gđ)\s*(?:[ivx]+|\d+)\s*$', re.IGNORECASE)
TYPE_N = re.compile(r'\b(?:tuýp|típ|typ|type)\s*(\d)\b', re.IGNORECASE)

# Tiền tố chỉ TÍNH CHẤT tiền sử, không phải danh tính bệnh -> bóc trước khi tra ICD.
# ('đã mổ' KHÔNG bóc vì mang nghĩa riêng: trạng thái sau phẫu thuật, mã Z...)
TIEN_SU_PREFIX = re.compile(
    r'^(?:tiền\s*sử|ts|t/s|theo\s*dõi|td|nghi\s*ngờ|chẩn\s*đoán|cđ)\s+',
    re.IGNORECASE)

# Mẩu CHỈ nêu vị trí giải phẫu / bên, KHÔNG có bệnh lý -> bỏ qua.
# (anh Khôi chốt: "bỏ qua vì không có thông tin về bệnh lý")
CHI_VI_TRI = re.compile(
    r'^(?:mắt|tai|mũi|họng|hàm(\s*(trên|dưới))?|răng|'
    r'bàn\s*(tay|chân)|cẳng\s*(tay|chân)|cánh\s*tay|ngón\s*(tay|chân)?|'
    r'khớp|chi|vai|gối|háng|cổ\s*(tay|chân)?|lưng|bụng|ngực|đầu|'
    r'thận|gan|phổi|tim|cột\s*sống)'
    r'(?:\s*(?:trái|phải|[tp]|2\s*bên|hai\s*bên|trên|dưới|\d+))*\s*$',
    re.IGNORECASE)

def concept_key(atom):
    """Khóa khái niệm bệnh dùng để tra từ điển ICD-10."""
    s = canon_key(atom)
    prev = None
    while prev != s:
        prev = s
        s = TIEN_SU_PREFIX.sub('', s).strip()
    # bỏ mọi cụm số răng trong ngoặc
    s = re.sub(r'\s*\((?:' + TOOTH + r')(?:\s*,\s*' + TOOTH + r')*\)', '', s)
    s = re.sub(r'\bmất răng <r>\b', 'mất răng', s)
    s = re.sub(r'\bsâu răng <r>\b', 'sâu răng', s)
    # bỏ tiền tố bên (có thể lặp)
    prev = None
    while prev != s:
        prev = s
        s = LATERAL.sub('', s).strip()
    # chuẩn hóa type
    s = TYPE_N.sub(r'type \1', s)
    # bỏ hậu tố mức độ
    s = DEGREE.sub('', s).strip()
    s = re.sub(r'\s+', ' ', s).strip(' .,-')
    # sau khi bóc tiền tố bên/độ có thể lộ ra trị số thị lực (vd 'mt 6/10' -> '6/10')
    if not s or s in NOT_DISEASE or NOT_DISEASE_PAT.match(s):
        return ''
    # mẩu chỉ nêu VỊ TRÍ / BÊN mà không có bệnh lý -> bỏ qua (anh Khôi chốt)
    if CHI_VI_TRI.match(s):
        return ''
    return s

# ---------- 7. Ghép mẩu cụt theo ngữ cảnh ----------
# Người nhập hay gõ 'Sỏi.nang thận 2 bên' = sỏi thận 2 bên + nang thận 2 bên.
# Mẩu 'Sỏi' đứng một mình vô nghĩa -> mượn cơ quan của mẩu liền sau.
CUT_NGUON = {
    'sỏi': [(r'thận', 'Sỏi thận'), (r'túi mật', 'Sỏi túi mật'),
            (r'mật', 'Sỏi đường mật'), (r'niệu quản', 'Sỏi niệu quản'),
            (r'bàng quang', 'Sỏi bàng quang')],
    'nang': [(r'thận', 'Nang thận'), (r'gan', 'Nang gan'),
             (r'buồng trứng', 'Nang buồng trứng')],
    'viêm': [(r'họng', 'Viêm họng'), (r'lợi', 'Viêm lợi'),
             (r'dạ dày', 'Viêm dạ dày')],
}

def _ghep_ngu_canh(atoms):
    out = []
    for i, a in enumerate(atoms):
        key = basic_clean(a).lower()
        rules = CUT_NGUON.get(key)
        if rules and i + 1 < len(atoms):
            sau = basic_clean(atoms[i + 1]).lower()
            thay = None
            for pat, full in rules:
                if re.search(pat, sau):
                    thay = full
                    break
            out.append(thay or a)
        else:
            out.append(a)
    return out


def process_cell(raw):
    """Chuỗi chẩn đoán thô -> list atom đã chuẩn hóa (đã bỏ mục không phải bệnh)."""
    out = []
    for a in split_atoms(raw):
        e = expand_abbrev(a)
        if e:
            out.append(e)
    return _ghep_ngu_canh(out)


if __name__ == '__main__':
    tests = [
        'THA,Thoái hóa Cột sống thắt lưng, 2 Mắt tật khúc xạ, Mất răng 17,37',
        'TS THA, Gan nhiễm mỡ , u máu gan, TMCT, Thoái hóa khớp gối',
        'TMCT. 2M lão thị',
        'thoái hóa cột sống thắt lưng, đau thần kinh vai gáy, MR16,17,26',
        'bt',
    ]
    for t in tests:
        print(repr(t))
        print('   ->', process_cell(t))
