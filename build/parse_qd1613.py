#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
parse_qd1613.py — Parse Quyết định 1613/BYT (.doc) -> JSON có cấu trúc cho
trang "Tra cứu phân loại sức khỏe".

Vì sao HTML: `.doc -> HTML` (textutil) GIỮ nguyên bảng; loại sức khỏe = CỘT
chứa 'x' (cột 2->Loại I ... cột 6->Loại V), phần chữ ở cột 1. Bản .txt làm mất
cột nên KHÔNG dùng để suy loại.

Cấu trúc nguồn:
- II.1 Thể lực: 2 bảng số (học sinh / lao động) × NAM/NỮ × 5 loại × 3 chỉ số.
- II.2 Bệnh tật: tiêu chí đánh số LIÊN TỤC, nhóm theo cơ quan (mốc số lấy từ
  header cơ quan trong bản text). Mỗi tiêu chí có các mục -> 1 hoặc nhiều loại.

Chạy:  python3 build/parse_qd1613.py
Ra:    app/frontend/qd1613.json
"""
import json
import os
import re
import subprocess
import sys
import tempfile

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DOC = os.path.join(ROOT, 'doc', 'Quyet dinh 1613 PL suc khoe.doc')
OUT = os.path.join(ROOT, 'app', 'frontend', 'qd1613.json')

LOAI_TEN = {1: 'Rất khỏe', 2: 'Khỏe', 3: 'Trung bình', 4: 'Yếu', 5: 'Rất yếu'}


def textutil(src, fmt):
    fd, path = tempfile.mkstemp(suffix='.' + fmt)
    os.close(fd)
    subprocess.run(['textutil', '-convert', fmt, src, '-output', path],
                   check=True)
    with open(path, encoding='utf-8') as f:
        data = f.read()
    os.remove(path)
    return data


def cell_texts(row_html):
    cs = re.findall(r'<td[^>]*>(.*?)</td>', row_html, re.S)
    return [re.sub(r'<[^>]+>', '', c).replace('&nbsp;', ' ')
            .replace('\t', ' ').strip() for c in cs]


def x_levels(cells):
    """Chỉ số loại (1..5) tại các cột có 'x' (cột 2->1 ... cột 6->5)."""
    return [j - 1 for j, t in enumerate(cells) if t.lower() == 'x' and 2 <= j <= 6]


def parse_organ_map(html):
    """{số tiêu chí bắt đầu: (tên cơ quan, tên tiêu chí đầu)} — từ bản HTML đã
    bỏ tag (giữ dấu cách giữa 'TÊN', 'SỐ' và 'Tên tiêu chí đầu'). Dùng gán cơ
    quan cho từng tiêu chí + lấy tên tiêu chí đầu (số bị dính vào ô cơ quan gộp
    nên header HTML của nó không có số riêng)."""
    p = re.sub(r'<[^>]+>', ' ', html)
    p = re.sub(r'&nbsp;|\t', ' ', p)
    p = re.sub(r'[ ]+', ' ', p)
    KNOWN = ['MẮT', 'TAI MŨI HỌNG', 'RĂNG HÀM MẶT', 'TÂM THẦN - THẦN KINH',
             'TUẦN HOÀN', 'HÔ HẤP', 'TIÊU HOÁ', 'TIẾT NIỆU - SINH DỤC',
             'HỆ VẬN ĐỘNG', 'HOA LIỄU', 'NỘI TIẾT - CHUYỂN HÓA', 'U CÁC LOẠI']
    out = {}
    for name in KNOWN:
        m = re.search(re.escape(name) + r'\s*(\d{1,3})\s+(.{1,55}?)(?=\s+\d+[.\-)]|\s{2,}|$)', p)
        if not m:
            continue
        num = int(m.group(1))
        title = m.group(2).strip(' :.-').strip()
        out[num] = (name, title)
    return out


def organ_of(so, organ_starts):
    """Tên cơ quan cho tiêu chí `so` theo dải [start_i, start_{i+1})."""
    cur = None
    for start in sorted(organ_starts):
        if so >= start:
            cur = organ_starts[start]
        else:
            break
    return cur


def parse_the_luc(rows):
    """2 bảng thể lực (học sinh, lao động). Nhận diện: hàng có col0 in 1..5 và
    >=7 ô, ngay sau cặp header 'Loại sức khỏe | NAM | NỮ' + dòng chỉ số. Trả 2
    nhóm; mỗi nhóm {nam:[...], nu:[...]} theo loại."""
    groups = []          # [[rows loại 1..5], ...]
    cur = None
    for r in rows:
        c = cell_texts(r)
        joined = ' '.join(c)
        if 'Loại sức khỏe' in joined and 'NAM' in joined:
            cur = []
            groups.append(cur)
            continue
        if cur is not None and len(c) >= 7 and re.fullmatch(r'[1-5]', c[0] or ''):
            cur.append(c)
        # dừng nhóm khi gặp bảng bệnh tật
        if 'Bệnh tật' in joined and 'Phân loại' in joined:
            break

    def to_rows(g):
        nam, nu = [], []
        for c in g:
            loai = int(c[0])
            nam.append({'loai': loai, 'chieu_cao': c[1], 'can_nang': c[2], 'vong_nguc': c[3]})
            nu.append({'loai': loai, 'chieu_cao': c[4], 'can_nang': c[5], 'vong_nguc': c[6]})
        return {'nam': nam, 'nu': nu}

    the_luc = {}
    if len(groups) >= 1:
        the_luc['hoc_sinh'] = to_rows(groups[0])
    if len(groups) >= 2:
        the_luc['lao_dong'] = to_rows(groups[1])
    return the_luc


def parse_benh_tat(rows, organ_map):
    organ_starts = {num: name for num, (name, _t) in organ_map.items()}
    first_titles = {num: t for num, (_n, t) in organ_map.items()}

    started = False
    crit_by_so = {}      # so -> dict tiêu chí (gộp trùng)
    order = []           # thứ tự xuất hiện của `so`
    cur = None

    def get_crit(so, title=None):
        if so not in crit_by_so:
            crit_by_so[so] = {
                'co_quan': organ_of(so, organ_starts) or '(khác)',
                'so': so,
                'ten': title or first_titles.get(so) or '',
                'muc': [],
            }
            order.append(so)
        elif title and not crit_by_so[so]['ten']:
            crit_by_so[so]['ten'] = title
        return crit_by_so[so]

    for r in rows:
        c = cell_texts(r)
        if not c:
            continue
        joined = ' '.join(t for t in c if t)
        if not started:
            if 'Bệnh tật' in joined and 'Phân loại' in joined:
                started = True
            continue
        lv = x_levels(c)
        # Phần chữ = mọi ô không rỗng & không phải 'x' (điều kiện nằm ở cột 0
        # HOẶC cột 1 tùy hàng — vd hàng thị lực để ở cột 0, đa số ở cột 1).
        parts = [t for t in c if t and t.lower() != 'x']

        # Header tiêu chí: ô chữ ĐẦU là số nguyên thuần -> số + tên tiêu chí.
        if parts and re.fullmatch(r'\d{1,3}', parts[0]):
            cur = get_crit(int(parts[0]), ' '.join(parts[1:]).strip())
            continue
        text = ' '.join(parts).strip()
        if not text:
            continue
        # Suy số tiêu chí từ nhãn "N.M" đầu mục (dấu CHẤM giữa số tiêu chí và
        # số mục) — bắt tiêu chí đầu mỗi cơ quan có số dính ô cơ quan gộp. KHÔNG
        # dùng dấu '-' vì trùng dải giá trị (vd "9-10/10", "7 - 9/10").
        m = re.match(r'(\d{1,3})\.\d', text)
        if m:
            so = int(m.group(1))
            if cur is None or cur['so'] != so:
                cur = get_crit(so)
        if cur is None:
            cur = get_crit(1)  # phòng hờ: mục đầu (Thị lực) trước header
        cur['muc'].append({'dk': text, 'loai': lv})

    # dedup mục trùng theo (dk) trong mỗi tiêu chí; bỏ tiêu chí rỗng
    result = []
    for so in order:
        crit = crit_by_so[so]
        seen, muc = set(), []
        for m in crit['muc']:
            key = m['dk']
            if key in seen:
                continue
            seen.add(key)
            muc.append(m)
        crit['muc'] = muc
        if muc:
            result.append(crit)
    result.sort(key=lambda k: k['so'])
    return result


def main():
    if not os.path.exists(DOC):
        print('Không thấy file .doc:', DOC)
        sys.exit(1)
    html = textutil(DOC, 'html')
    rows = re.findall(r'<tr[^>]*>(.*?)</tr>', html, re.S)

    organ_map = parse_organ_map(html)
    the_luc = parse_the_luc(rows)
    benh_tat = parse_benh_tat(rows, organ_map)

    data = {
        'meta': {
            'nguon': 'Quyết định 1613/BYT-QĐ — Tiêu chuẩn phân loại sức khỏe '
                     '(hiệu lực 15/08/1997)',
            'loai_ten': LOAI_TEN,
        },
        'the_luc': the_luc,
        'benh_tat': benh_tat,
    }
    with open(OUT, 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False, indent=1)

    # Thống kê nhanh
    organs = sorted({c['co_quan'] for c in benh_tat})
    nmuc = sum(len(c['muc']) for c in benh_tat)
    bad = [(c['so'], m['dk']) for c in benh_tat for m in c['muc']
           if any(l < 1 or l > 5 for l in m['loai'])]
    print(f'-> {OUT}')
    print(f'   Cơ quan : {len(organs)}  ({", ".join(organs)})')
    print(f'   Tiêu chí: {len(benh_tat)}  | Mục: {nmuc}')
    print(f'   Thể lực : nhóm={list(the_luc.keys())}')
    print(f'   Loại sai (ngoài 1..5): {len(bad)}')


if __name__ == '__main__':
    main()
