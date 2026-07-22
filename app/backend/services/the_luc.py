# -*- coding: utf-8 -*-
"""
the_luc.py — BMI + gợi ý phân loại thể lực (Phase 4, §6.4 SPEC).

Nguồn: build/qd1613_fulltext.txt (QĐ 1613/BYT-QĐ), mục "II- TIÊU CHUẨN PHÂN
LOẠI SỨC KHỎE, 1. Thể lực" (dòng ~17-31 của file text).

QĐ1613 chấm điểm "Thể lực" (chỉ tiêu TLC ở Phụ lục 2) dựa trên ĐỦ 3 chỉ
tiêu: chiều cao, cân nặng, VÒNG NGỰC — theo 2 bảng tách giới tính (nam/nữ)
và tách đối tượng (1.1 học sinh / 1.2 lao động). App KHÔNG thu thập vòng
ngực (§6.4 chỉ định màn hình nhập nhanh "chỉ 6 ô/người": chiều cao, cân
nặng, mạch, huyết áp, thị lực, thính lực — không có vòng ngực), nên
`goi_y_the_luc()` CHỈ dùng được 2/3 chỉ tiêu (chiều cao, cân nặng) từ bảng
"1.2. Lao động ở các nghề, công việc" (dùng bảng lao động thay vì bảng học
sinh vì đối tượng KSK là người trưởng thành/cao tuổi).

Quy tắc gộp nhiều chỉ tiêu — mượn nguyên tắc chung nêu ở Phụ lục 2 QĐ1613
("Có 1 chỉ tiêu ở loại 4 thì xếp loại 4", tương tự cho các loại khác): lấy
LOẠI XẤU NHẤT (số La Mã lớn nhất / số nguyên lớn nhất) trong các chỉ tiêu
đang có.

Vì thiếu vòng ngực, kết quả `goi_y_the_luc()` trả về LUÔN là "gợi ý sơ bộ".

Đợt 5 (2026-07-22): cơ chế "gợi ý + nút xác nhận tay" ở trên bị THAY THẾ bằng
tự động ghi `kham_the_luc_pl` mỗi khi chiều cao/cân nặng đổi VÀ đủ dữ liệu để
tính — xem `tinh_va_ap_pl()` bên dưới, gọi từ routers/ho_so.py:patch_ho_so()
và routers/sinh_hieu.py:patch_sinh_hieu() ngay sau khi các trường sinh hiệu
đã được áp dụng. `goi_y_the_luc()` vẫn giữ nguyên (không tự ghi DB) — dùng làm
lõi tính toán cho `tinh_va_ap_pl()`.
"""


def bmi(chieu_cao_cm, can_nang_kg):
    """BMI = cân nặng(kg) / (chiều cao(m))^2, làm tròn 2 chữ số.

    Trả None nếu thiếu 1 trong 2 giá trị hoặc giá trị không hợp lệ (§4 tiêu
    chí P4.3: "chỉ khi đủ 2 giá trị")."""
    if chieu_cao_cm in (None, '') or can_nang_kg in (None, ''):
        return None
    try:
        h = float(chieu_cao_cm)
        w = float(can_nang_kg)
    except (TypeError, ValueError):
        return None
    if h <= 0 or w <= 0:
        return None
    return round(w / ((h / 100) ** 2), 2)


# Bảng QĐ1613 II.1.2 "1.2. Lao động ở các nghề, công việc" — (loại, chiều
# cao tối thiểu cm, cân nặng tối thiểu kg). Loại 5 = dưới ngưỡng loại 4.
# NAM: 1≥160/50 · 2:158-162/47-49 · 3:154-157/45-46 · 4:150-153/41-44 · 5:<150/<40
# (nguồn ghi "1603" ở dòng đầu — lỗi OCR rõ ràng của "160", vì các dòng sau
# đều là số 3 chữ số hợp lý; xử lý là 160).
_BANG_NAM = [(1, 160, 50), (2, 158, 47), (3, 154, 45), (4, 150, 41)]
# NỮ: 1≥155/45 · 2:151-154/43-44 · 3:147-150/40-42 · 4:143-146/38-39 · 5:<143/<38
_BANG_NU = [(1, 155, 45), (2, 151, 43), (3, 147, 40), (4, 143, 38)]


def _loai_theo_nguong(value, bang, idx):
    """idx=1: cột chiều cao-min, idx=2: cột cân nặng-min. Loại nhỏ nhất mà
    value còn đạt ngưỡng tối thiểu; nếu dưới cả ngưỡng loại 4 -> loại 5."""
    for loai, cc_min, cn_min in bang:
        nguong = cc_min if idx == 1 else cn_min
        if value >= nguong:
            return loai
    return 5


def goi_y_the_luc(chieu_cao_cm, can_nang_kg, gioi_tinh):
    """Trả {'pl': int 1..5, 'nguon': str, 'giai_thich': str} hoặc None nếu
    thiếu chiều cao/cân nặng. KHÔNG tự ghi kham_the_luc_pl — chỉ là gợi ý,
    caller (router) phải gọi endpoint xác nhận riêng để ghi (§6.4 criterion 4)."""
    if chieu_cao_cm in (None, '') or can_nang_kg in (None, ''):
        return None
    try:
        h = float(chieu_cao_cm)
        w = float(can_nang_kg)
    except (TypeError, ValueError):
        return None
    if h <= 0 or w <= 0:
        return None

    la_nu = (gioi_tinh or '').strip().lower() in ('nữ', 'nu', 'f', 'female')
    bang = _BANG_NU if la_nu else _BANG_NAM
    loai_cc = _loai_theo_nguong(h, bang, 1)
    loai_cn = _loai_theo_nguong(w, bang, 2)
    pl = max(loai_cc, loai_cn)
    ten_loai = {1: 'I', 2: 'II', 3: 'III', 4: 'IV', 5: 'V'}
    return {
        'pl': pl,
        'nguon': 'QĐ1613 mục II.1.2 (bảng "Lao động ở các nghề, công việc"'
                  f' — {"nữ" if la_nu else "nam"}), chỉ 2/3 chỉ tiêu (thiếu'
                  ' vòng ngực)',
        'giai_thich': (
            f'Chiều cao {h:g}cm → loại {ten_loai[loai_cc]}; '
            f'cân nặng {w:g}kg → loại {ten_loai[loai_cn]}; '
            f'lấy loại xấu nhất → gợi ý loại {ten_loai[pl]}. '
            'Thiếu số đo vòng ngực nên đây chỉ là GỢI Ý SƠ BỘ — '
            'nhân viên phải xác nhận trước khi ghi kết luận.'
        ),
    }


def tinh_va_ap_pl(conn, ma_ho_so, user_id):
    """Đợt 5 criterion 1/2/3 — tự tính + ghi đè `kham_the_luc_pl`.

    Đọc lại chiều cao/cân nặng/giới tính HIỆN TẠI trong DB (đã áp dụng thay
    đổi của request), gọi `goi_y_the_luc()`; nếu KHÔNG đủ dữ liệu để tính
    (thiếu chiều cao hoặc cân nặng) -> KHÔNG đụng tới `kham_the_luc_pl` đã có
    (criterion 3: xóa sinh hiệu không tự xóa PL) -> trả None. Nếu đủ dữ liệu,
    so với giá trị đang lưu — KHÁC thì UPDATE + ghi nhat_ky (ghi đè cả khi
    trước đó là giá trị nhân viên tự chỉnh tay — đúng criterion 3), rồi trả về
    phân loại (int, có thể là giá trị KHÔNG đổi nếu đã đúng từ trước).

    Caller tự so sánh với giá trị cũ (đọc trước khi gọi hàm này) để biết có
    "tự đổi" thật hay không, phục vụ quyết định đưa vào response 'updated'."""
    row = conn.execute(
        'SELECT chieu_cao, can_nang, gioi_tinh, kham_the_luc_pl FROM ho_so '
        'WHERE ma_ho_so=?', (ma_ho_so,)).fetchone()
    if not row:
        return None
    goi_y = goi_y_the_luc(row['chieu_cao'], row['can_nang'], row['gioi_tinh'])
    # Không còn đủ dữ liệu (xóa chiều cao/cân nặng) -> XÓA luôn PL đã tự tính
    # (phản hồi 2026-07-22 lần 6, thay quy tắc "giữ như cũ" của Đợt 5).
    pl_moi = goi_y['pl'] if goi_y else None
    pl_cu = row['kham_the_luc_pl']
    if pl_cu != pl_moi:
        conn.execute('UPDATE ho_so SET kham_the_luc_pl=? WHERE ma_ho_so=?',
                     (pl_moi, ma_ho_so))
        conn.execute(
            'INSERT INTO nhat_ky(ma_ho_so, nguoi_dung_id, ten_truong, '
            'gia_tri_cu, gia_tri_moi) VALUES (?,?,?,?,?)',
            (ma_ho_so, user_id, 'kham_the_luc_pl',
             '' if pl_cu is None else str(pl_cu),
             '' if pl_moi is None else str(pl_moi)))
        conn.commit()
    return pl_moi
