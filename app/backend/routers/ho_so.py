# -*- coding: utf-8 -*-
"""
ho_so.py — danh sách (9 bộ lọc §3.2), chi tiết & PATCH autosave (§3.4),
hoàn thành + xác nhận suy (§3.4.5).
"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
import config  # noqa: E402
import db  # noqa: E402
import auth  # noqa: E402
from services import fuzzy, qc, sinh_hieu_valid, the_luc  # noqa: E402

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from pydantic import BaseModel, ConfigDict

router = APIRouter(prefix='/api', tags=['ho_so'])

XA_LIST = [
    'Phường Thủy Nguyên', 'Phường Lê Ích Mộc', 'Phường Lưu Kiếm', 'Phường Bạch Đằng',
    'Phường Thiên Hương', 'Phường Hòa Bình', 'Xã Việt Khê', 'Phường Nam Triệu',
]
TRANG_THAI_LIST = ['chua_ra_soat', 'dang_ra_soat', 'hoan_thanh',
                    'can_doi_chieu_giay']
TRANG_THAI_NHAN = {
    'chua_ra_soat': 'Chưa rà soát', 'dang_ra_soat': 'Đang rà soát',
    'hoan_thanh': 'Hoàn thành', 'can_doi_chieu_giay': 'Cần đối chiếu giấy',
}

LIST_COLUMNS = [
    'ma_ho_so', 'ho_ten', 'ngay_sinh', 'gioi_tinh', 'maxa_cu_tru', 'ngay_vao',
    'phan_loai_sk', 'ket_luan_benh', 'co_qc', 'so_loi', 'trang_thai',
    'nguoi_ra_soat_id',
]

# Trường có thể PATCH tự do (autosave) — loại các trường quản lý rà soát có
# luồng riêng (trang_thai qua /hoan-thanh, nguoi_ra_soat_id qua /phan-cong,
# co_qc/so_loi tính lại tự động) và chan_doan_goc (chỉ đọc — §3.4.2).
_MANAGED = {
    'ma_ho_so', 'tt', 'nguoi_ra_soat_id', 'trang_thai', 'co_qc', 'so_loi',
    'thoi_diem_hoan_thanh', 'da_xuat_file', 'lan_xuat_cuoi', 'chan_doan_goc',
}


def _patchable_fields(conn):
    cols = [r['name'] for r in conn.execute('PRAGMA table_info(ho_so)')]
    return set(cols) - _MANAGED


def _ymd(ddmmyyyy_col):
    """Biểu thức SQL chuyển cột TEXT dd/mm/yyyy -> yyyy-mm-dd để so sánh range."""
    return (f"(substr({ddmmyyyy_col},7,4)||'-'||substr({ddmmyyyy_col},4,2)"
            f"||'-'||substr({ddmmyyyy_col},1,2))")


def build_where(params, user):
    """Trả (where_sql, args, xa_list) dùng chung cho GET list & hoàn thành.
    Áp dụng phạm vi theo vai trò (Đợt 2 criterion 4 — "giao việc là TÙY
    CHỌN"): ra_soat thấy hồ sơ CHƯA giao (nguoi_ra_soat_id IS NULL) +
    hồ sơ giao cho chính mình; hồ sơ đã giao cho người khác thì KHÔNG thấy."""
    where = ['1=1']
    args = []

    if user['vai_tro'] != 'admin':
        # Đợt 10 criterion 2: user thường CÓ THỂ lọc "chỉ hồ sơ của tôi" bằng
        # cách truyền chính id của mình; truyền id NGƯỜI KHÁC bị bỏ qua (coi
        # như "Tất cả") để chống dò dữ liệu người khác qua tham số URL.
        raso_param = params.get('nguoi_ra_soat_id')
        if raso_param and str(raso_param) == str(user['id']):
            where.append('nguoi_ra_soat_id = ?')
            args.append(user['id'])
        else:
            where.append('(nguoi_ra_soat_id IS NULL OR nguoi_ra_soat_id = ?)')
            args.append(user['id'])
    elif params.get('nguoi_ra_soat_id'):
        where.append('nguoi_ra_soat_id = ?')
        args.append(int(params['nguoi_ra_soat_id']))

    xa = params.get('xa') or []
    if xa:
        where.append(f"maxa_cu_tru IN ({','.join('?' * len(xa))})")
        args.extend(xa)

    if params.get('ngay_tu'):
        where.append(f"{_ymd('ngay_vao')} >= ?")
        args.append(params['ngay_tu'])
    if params.get('ngay_den'):
        where.append(f"{_ymd('ngay_vao')} <= ?")
        args.append(params['ngay_den'])

    if params.get('so_cccd'):
        where.append('so_cccd LIKE ?')
        args.append(f"%{params['so_cccd']}%")

    if params.get('ma_ho_so'):
        where.append('ma_ho_so LIKE ?')
        args.append(f"%{params['ma_ho_so']}%")

    trang_thai = params.get('trang_thai') or []
    if trang_thai:
        where.append(f"trang_thai IN ({','.join('?' * len(trang_thai))})")
        args.extend(trang_thai)

    co_qc = params.get('co_qc') or []
    if co_qc:
        or_parts = []
        for f in co_qc:
            or_parts.append("(';'||co_qc||';') LIKE ?")
            args.append(f'%;{f};%')
        where.append('(' + ' OR '.join(or_parts) + ')')

    pl = params.get('phan_loai_sk') or []
    if pl:
        where.append(f"phan_loai_sk IN ({','.join('?' * len(pl))})")
        args.extend(int(x) for x in pl)

    cq = params.get('co_quan_benh_chinh') or []
    if cq:
        where.append(f"co_quan_benh_chinh IN ({','.join('?' * len(cq))})")
        args.extend(cq)

    return ' AND '.join(where), args


def _parse_list_params(request: Request):
    qp = request.query_params
    return {
        'xa': qp.getlist('xa'),
        'ngay_tu': qp.get('ngay_tu'),
        'ngay_den': qp.get('ngay_den'),
        'ho_ten': qp.get('ho_ten'),
        'q': qp.get('q'),
        'q_hoten_only': qp.get('q_hoten_only'),
        'so_cccd': qp.get('so_cccd'),
        'ma_ho_so': qp.get('ma_ho_so'),
        'trang_thai': qp.getlist('trang_thai'),
        'nguoi_ra_soat_id': qp.get('nguoi_ra_soat_id'),
        'co_qc': qp.getlist('co_qc'),
        'phan_loai_sk': qp.getlist('phan_loai_sk'),
        'co_quan_benh_chinh': qp.getlist('co_quan_benh_chinh'),
    }


@router.get('/danh-muc')
def danh_muc(user=Depends(auth.get_current_user)):
    """Danh mục dùng cho dropdown + bộ lọc (§1.2, §5, §6.2)."""
    conn = db.get_connection()
    try:
        out = {}
        for row in conn.execute(
                'SELECT loai, ma, ten, thu_tu FROM danh_muc ORDER BY loai, thu_tu'):
            out.setdefault(row['loai'], []).append(
                {'ma': row['ma'], 'ten': row['ten']})
    finally:
        conn.close()
    out['xa'] = [{'ma': x, 'ten': x} for x in XA_LIST]
    out['nhom_mau'] = [{'ma': x, 'ten': x} for x in ['A', 'B', 'AB', 'O']]
    out['co_quan_benh_chinh'] = [{'ma': k, 'ten': v} for k, v in qc.TEN_CQ.items()]
    out['trang_thai'] = [{'ma': k, 'ten': v} for k, v in TRANG_THAI_NHAN.items()]
    out['phan_loai_sk'] = [{'ma': i, 'ten': f'Loại {r}'}
                            for i, r in zip(range(1, 6), ['I', 'II', 'III', 'IV', 'V'])]
    out['co_qc'] = [{'ma': k, 'ten': v['ten'], 'muc': v['muc'],
                      'y_nghia': v['y_nghia']} for k, v in qc.FLAG_META.items()]
    if user['vai_tro'] == 'admin':
        conn = db.get_connection()
        try:
            out['nguoi_dung'] = [
                {'ma': r['id'], 'ten': r['ho_ten']} for r in
                conn.execute('SELECT id, ho_ten FROM nguoi_dung '
                              'WHERE dang_hoat_dong=1 ORDER BY ho_ten')]
        finally:
            conn.close()
    return out


@router.get('/ho-so')
def list_ho_so(request: Request, page: int = Query(1, ge=1),
                page_size: int = Query(20, ge=1, le=200),
                user=Depends(auth.get_current_user)):
    params = _parse_list_params(request)
    conn = db.get_connection()
    try:
        where_sql, args = build_where(params, user)

        # Đợt 7 criterion 4/5: `q` = từ khóa tìm kiếm; `q_hoten_only` = chỉ
        # tìm cột họ tên. `ho_ten` (tên cũ) vẫn hoạt động như bí danh của chế
        # độ q_hoten_only=true — tương thích ngược.
        legacy_ho_ten = (params.get('ho_ten') or '').strip()
        q_raw = (params.get('q') or legacy_ho_ten or '').strip()
        hoten_only = bool(legacy_ho_ten) or (
            (params.get('q_hoten_only') or '').strip().lower() in ('1', 'true', 'yes'))

        # PLAN_PERF.md §2 — SQL-paginated bằng cột ho_ten_kd/search_blob_kd
        # (đã tính sẵn, bỏ dấu + lowercase — services/fuzzy.build_search_cols)
        # thay cho quét TOÀN BỘ 13.326 dòng bằng Python (_global_search_rank
        # cũ, đã bỏ).
        if q_raw and hoten_only:
            q_kd = fuzzy.strip_diacritics(q_raw)
            where_q = f'{where_sql} AND ho_ten_kd LIKE ?'
            args_q = args + [f'%{q_kd}%']
            total = conn.execute(
                f'SELECT COUNT(*) FROM ho_so WHERE {where_q}', args_q).fetchone()[0]
            offset = (page - 1) * page_size
            page_rows = conn.execute(
                f'SELECT * FROM ho_so WHERE {where_q} '
                f'ORDER BY tt LIMIT ? OFFSET ?',
                args_q + [page_size, offset]).fetchall()
        elif q_raw:
            # tìm toàn cột (checkbox "Chỉ tìm họ tên" TẮT) — search_blob_kd
            # đã gộp mọi cột hiển thị; xếp hạng khớp HỌ TÊN lên trước.
            q_kd = fuzzy.strip_diacritics(q_raw)
            where_q = f'{where_sql} AND search_blob_kd LIKE ?'
            args_q = args + [f'%{q_kd}%']
            total = conn.execute(
                f'SELECT COUNT(*) FROM ho_so WHERE {where_q}', args_q).fetchone()[0]
            offset = (page - 1) * page_size
            page_rows = conn.execute(
                f'SELECT * FROM ho_so WHERE {where_q} '
                f'ORDER BY (CASE WHEN ho_ten_kd LIKE ? THEN 0 ELSE 1 END), tt '
                f'LIMIT ? OFFSET ?',
                args_q + [f'%{q_kd}%', page_size, offset]).fetchall()
        else:
            total = conn.execute(
                f'SELECT COUNT(*) FROM ho_so WHERE {where_sql}', args).fetchone()[0]
            offset = (page - 1) * page_size
            page_rows = conn.execute(
                f'SELECT * FROM ho_so WHERE {where_sql} '
                f'ORDER BY tt LIMIT ? OFFSET ?',
                args + [page_size, offset]).fetchall()

        items = []
        for r in page_rows:
            items.append({
                'ma_ho_so': r['ma_ho_so'],
                'ho_ten': r['ho_ten'],
                'nam_sinh': (r['ngay_sinh'] or '')[-4:] or None,
                'gioi_tinh': r['gioi_tinh'],
                'so_cccd': r['so_cccd'],
                'maxa_cu_tru': r['maxa_cu_tru'],
                'ngay_vao': r['ngay_vao'],
                'phan_loai_sk': r['phan_loai_sk'],
                'ket_luan_benh': r['ket_luan_benh'],
                'so_loi': r['so_loi'],
                'trang_thai': r['trang_thai'],
                'trang_thai_nhan': TRANG_THAI_NHAN.get(r['trang_thai'], r['trang_thai']),
                'nguoi_ra_soat_id': r['nguoi_ra_soat_id'],
                'muc_co': qc.row_severity(r['co_qc']),
            })
    finally:
        conn.close()
    return {'total': total, 'page': page, 'page_size': page_size, 'items': items}


def _load_ho_so_or_404(conn, ma_ho_so, user):
    row = conn.execute('SELECT * FROM ho_so WHERE ma_ho_so=?',
                        (ma_ho_so,)).fetchone()
    if not row:
        raise HTTPException(404, 'Không tìm thấy hồ sơ')
    # Đợt 2 criterion 4: hồ sơ CHƯA giao (nguoi_ra_soat_id IS NULL) mọi nhân viên
    # đều truy cập được; hồ sơ ĐÃ giao chỉ người được giao + admin.
    if (user['vai_tro'] != 'admin' and row['nguoi_ra_soat_id'] is not None
            and row['nguoi_ra_soat_id'] != user['id']):
        raise HTTPException(
            403, 'Hồ sơ đã được giao cho nhân viên khác — không thuộc phạm vi rà '
                 'soát của bạn')
    return row


@router.get('/ho-so/{ma_ho_so}')
def get_ho_so(ma_ho_so: str, user=Depends(auth.get_current_user)):
    conn = db.get_connection()
    try:
        row = _load_ho_so_or_404(conn, ma_ho_so, user)
        benh_rows = conn.execute(
            'SELECT * FROM benh WHERE ma_ho_so=? ORDER BY la_benh_chinh DESC, stt_benh',
            (ma_ho_so,)).fetchall()
        data = dict(row)
        data['benh'] = [dict(b) for b in benh_rows]
        data['qd1613'] = qc.check_invariant(row)
        data['co_qc_list'] = qc.flags_of(row['co_qc'])
        data['co_qc_chi_tiet'] = [
            {'ma': f, **qc.FLAG_META.get(f, {'muc': None, 'ten': f, 'y_nghia': ''})}
            for f in qc.flags_of(row['co_qc'])
        ]
        data['muc_co'] = qc.row_severity(row['co_qc'])
    finally:
        conn.close()
    return data


class PatchBody(BaseModel):
    model_config = ConfigDict(extra='allow')


def _recompute_bmi(fields):
    cao = fields.get('chieu_cao')
    can = fields.get('can_nang')
    if cao and can:
        try:
            cao_f, can_f = float(cao), float(can)
            if cao_f > 0:
                return round(can_f / ((cao_f / 100) ** 2), 2)
        except (TypeError, ValueError):
            return None
    return None


def _ten_nguoi_sua_gan_nhat(conn, ma_ho_so, field, exclude_user_id):
    """PLAN_PERF.md §4 — trả họ tên người ĐĂNG NHẬP KHÁC gần nhất từng sửa
    `field` của hồ sơ này (đọc nhat_ky), hoặc None nếu không tìm được (đã bị
    xoá tài khoản, hoặc không rõ ai)."""
    r = conn.execute(
        'SELECT nd.ho_ten FROM nhat_ky nk '
        'JOIN nguoi_dung nd ON nd.id = nk.nguoi_dung_id '
        'WHERE nk.ma_ho_so=? AND nk.ten_truong=? AND nk.nguoi_dung_id != ? '
        'ORDER BY nk.id DESC LIMIT 1',
        (ma_ho_so, field, exclude_user_id)).fetchone()
    return r['ho_ten'] if r else None


@router.patch('/ho-so/{ma_ho_so}')
def patch_ho_so(ma_ho_so: str, body: PatchBody,
                 user=Depends(auth.get_current_user)):
    changes = body.model_dump(exclude_unset=True)
    # PLAN_PERF.md §4 — `_base` (TUỲ CHỌN): map {field: giá_trị_client_đang_
    # thấy lúc mở/lưu gần nhất}, KHÔNG phải cột DB thật -> tách riêng trước
    # khi validate/ghi, không gửi thì hành vi y nguyên như trước (không cảnh
    # báo).
    base = changes.pop('_base', None)
    if not isinstance(base, dict):
        base = {}
    if not changes:
        return {'ok': True, 'updated': {}, 'canh_bao_xung_dot': {}}

    conn = db.get_connection()
    try:
        row = _load_ho_so_or_404(conn, ma_ho_so, user)
        allowed = _patchable_fields(conn)
        unknown = set(changes) - allowed
        if unknown:
            raise HTTPException(400, f'Trường không hợp lệ hoặc không cho '
                                      f'phép sửa qua PATCH: {sorted(unknown)}')

        # Đợt 6 criterion 1: chuẩn hoá dấu thập phân (','->'.') cho MỌI
        # trường số (NUMERIC_FIELDS — vượt ra ngoài 4 trường VITAL_FIELDS có
        # ngưỡng) TRƯỚC bất kỳ validate nào — vd glu_gia_tri '6,7' -> '6.7'.
        changes, loi_chuan_hoa = sinh_hieu_valid.normalize_numeric_changes(changes)
        if loi_chuan_hoa:
            raise HTTPException(422, '; '.join(x['ly_do'] for x in loi_chuan_hoa))

        # Ngưỡng sinh hiệu (Đợt 3 criterion 2): chieu_cao/can_nang/mach/
        # huyet_ap ngoài ngưỡng -> 422; huyet_ap được CHUẨN HOÁ trước khi
        # lưu (vd '12080' -> '120/80') — giá trị chuẩn hoá nằm trong
        # `changes` nên cũng có mặt trong `updated` ở response bên dưới.
        nguong = sinh_hieu_valid.load_nguong(conn)
        changes, loi_nguong = sinh_hieu_valid.validate_changes(changes, nguong)
        if loi_nguong:
            raise HTTPException(422, '; '.join(x['ly_do'] for x in loi_nguong))

        # Đợt 5 criterion 1/3: xác định TRƯỚC KHI ghi có cần tính lại PL thể
        # lực không — dựa trên bộ TRƯỜNG GỬI LÊN (không phải giá trị cuối có
        # đổi hay không); PATCH thủ công kham_the_luc_pl (không đụng chiều
        # cao/cân nặng) KHÔNG nằm trong tập này -> không tự kích hoạt tính lại.
        pl_can_tinh_lai = 'chieu_cao' in changes or 'can_nang' in changes
        pl_truoc = row['kham_the_luc_pl']

        # BMI tự tính khi chiều cao/cân nặng đổi (§5 chú thích 2)
        if 'chieu_cao' in changes or 'can_nang' in changes:
            merged = dict(row)
            merged.update(changes)
            changes['chi_so_bmi'] = _recompute_bmi(merged)

        updated = {}
        canh_bao_xung_dot = {}
        set_clauses = []
        args = []
        for field, new_val in changes.items():
            old_val = row[field] if field in row.keys() else None

            # PLAN_PERF.md §4 — phát hiện xung đột TRỄ: client gửi kèm `_base`
            # (giá trị nó thấy lúc mở/lưu gần nhất) cho field này -> nếu giá
            # trị HIỆN TẠI trong DB khác cả `_base` LẪN giá trị mới đang lưu,
            # nghĩa là NGƯỜI KHÁC đã sửa field này sau khi client tải hồ sơ.
            # Vẫn GHI (last-write-wins), chỉ báo cho UI biết qua response.
            if field in base:
                base_val = base[field]
                old_cmp = '' if old_val is None else str(old_val)
                base_cmp = '' if base_val is None else str(base_val)
                new_cmp = '' if new_val is None else str(new_val)
                if old_cmp != base_cmp and old_cmp != new_cmp:
                    canh_bao_xung_dot[field] = {
                        'nguoi_khac': _ten_nguoi_sua_gan_nhat(
                            conn, ma_ho_so, field, user['id']),
                        'gia_tri_db_truoc': old_val,
                    }

            if old_val == new_val:
                continue
            set_clauses.append(f'{field} = ?')
            args.append(new_val)
            conn.execute(
                'INSERT INTO nhat_ky(ma_ho_so, nguoi_dung_id, ten_truong, '
                'gia_tri_cu, gia_tri_moi) VALUES (?,?,?,?,?)',
                (ma_ho_so, user['id'], field,
                 '' if old_val is None else str(old_val),
                 '' if new_val is None else str(new_val)))
            updated[field] = new_val

        if set_clauses:
            args.append(ma_ho_so)
            conn.execute(f'UPDATE ho_so SET {", ".join(set_clauses)} '
                         f'WHERE ma_ho_so = ?', args)
            conn.commit()

        # THIEU_CCCD (§4) là cờ "còn thiếu dữ liệu", không phải cờ "suy" cần
        # xác nhận thủ công (§3.4.5) — tự gỡ ngay khi CCCD được bổ sung, tự
        # thêm lại nếu bị xoá trắng.
        if 'so_cccd' in changes:
            before = row['co_qc']
            if changes['so_cccd']:
                after = qc.remove_flags(conn, ma_ho_so, ['THIEU_CCCD'])
            else:
                after = qc.add_flag(conn, ma_ho_so, 'THIEU_CCCD')
            if after is not None and after != before:
                conn.execute(
                    'INSERT INTO nhat_ky(ma_ho_so, nguoi_dung_id, ten_truong, '
                    'gia_tri_cu, gia_tri_moi) VALUES (?,?,?,?,?)',
                    (ma_ho_so, user['id'], 'co_qc', before or '', after or ''))
                conn.commit()

        # Đợt 5 criterion 1/3: chiều cao/cân nặng vừa đổi + đủ dữ liệu -> tự
        # tính lại và GHI ĐÈ kham_the_luc_pl (kể cả đè giá trị nhân viên đã chỉnh
        # tay trước đó). Chỉ đưa vào `updated` (để UI nhảy radio) khi giá trị
        # THỰC SỰ khác với trước lúc PATCH này — tránh nhảy/chớp radio vô ích.
        if pl_can_tinh_lai:
            # pl_moi = None nghĩa là PL bị XÓA (hết đủ dữ liệu) — vẫn phải báo
            # về UI để bỏ chọn radio.
            pl_moi = the_luc.tinh_va_ap_pl(conn, ma_ho_so, user['id'])
            if pl_moi != pl_truoc:
                updated['kham_the_luc_pl'] = pl_moi

        new_row = conn.execute('SELECT * FROM ho_so WHERE ma_ho_so=?',
                                (ma_ho_so,)).fetchone()
        qd1613 = qc.check_invariant(new_row)
    finally:
        conn.close()

    return {'ok': True, 'updated': updated, 'qd1613': qd1613,
            'so_loi': new_row['so_loi'], 'co_qc': qc.flags_of(new_row['co_qc']),
            'canh_bao_xung_dot': canh_bao_xung_dot}


@router.post('/ho-so/{ma_ho_so}/hoan-thanh')
def hoan_thanh(ma_ho_so: str, request: Request,
               user=Depends(auth.get_current_user)):
    conn = db.get_connection()
    try:
        row = _load_ho_so_or_404(conn, ma_ho_so, user)
        old_trang_thai = row['trang_thai']
        conn.execute(
            "UPDATE ho_so SET trang_thai='hoan_thanh', "
            "thoi_diem_hoan_thanh=datetime('now','localtime') "
            'WHERE ma_ho_so=?', (ma_ho_so,))
        conn.execute(
            'INSERT INTO nhat_ky(ma_ho_so, nguoi_dung_id, ten_truong, '
            'gia_tri_cu, gia_tri_moi) VALUES (?,?,?,?,?)',
            (ma_ho_so, user['id'], 'trang_thai', old_trang_thai, 'hoan_thanh'))
        conn.commit()

        # hồ sơ kế tiếp theo đúng thứ tự bộ lọc hiện tại (Ctrl+S §3.2)
        params = _parse_list_params(request)
        where_sql, args = build_where(params, user)
        cur_tt = row['tt']
        next_row = conn.execute(
            f'SELECT ma_ho_so FROM ho_so WHERE {where_sql} AND '
            f'(tt > ? OR (tt IS NULL AND ma_ho_so > ?)) ORDER BY tt LIMIT 1',
            args + [cur_tt if cur_tt is not None else -1, ma_ho_so]).fetchone()
    finally:
        conn.close()
    return {'ok': True, 'next_ma_ho_so': next_row['ma_ho_so'] if next_row else None}


class XacNhanSuyBody(BaseModel):
    field: str


@router.post('/ho-so/{ma_ho_so}/xac-nhan-suy')
def xac_nhan_suy(ma_ho_so: str, body: XacNhanSuyBody,
                  user=Depends(auth.get_current_user)):
    field = body.field
    if field not in qc.FIELD_TO_FLAGS:
        raise HTTPException(400, f'Trường {field} không có cờ suy luận liên quan')
    conn = db.get_connection()
    try:
        row = _load_ho_so_or_404(conn, ma_ho_so, user)
        old_co_qc = row['co_qc']
        flags = qc.FIELD_TO_FLAGS[field]
        new_co_qc = qc.remove_flags(conn, ma_ho_so, flags)
        conn.execute(
            'INSERT INTO nhat_ky(ma_ho_so, nguoi_dung_id, ten_truong, '
            'gia_tri_cu, gia_tri_moi) VALUES (?,?,?,?,?)',
            (ma_ho_so, user['id'], f'xac_nhan_suy:{field}',
             old_co_qc or '', new_co_qc or ''))
        conn.commit()
        new_row = conn.execute('SELECT co_qc, so_loi FROM ho_so WHERE ma_ho_so=?',
                                (ma_ho_so,)).fetchone()
    finally:
        conn.close()
    return {'ok': True, 'co_qc': qc.flags_of(new_row['co_qc']),
            'so_loi': new_row['so_loi']}
