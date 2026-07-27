# -*- coding: utf-8 -*-
"""
git_update.py — "Cập nhật ngay" (phản hồi anh Khôi: cần nút kéo git thủ công
thay vì chờ vòng lặp app/auto_update.bat hoặc gõ lệnh cmd trên máy chủ).

Làm ĐÚNG logic auto_update.bat (git fetch -> so HEAD -> pull nếu có bản mới
-> nếu code BACKEND đổi thì khởi động lại server) nhưng gọi được từ nút bấm
trong app, chạy NGAY thay vì đợi tới vòng lặp tiếp theo. Cùng ghi
`.auto_update_last_head` để 2 cơ chế (nút bấm + auto_update.bat) không giẫm
lên nhau — dù bên nào chạy trước, bên sau đọc HEAD hiện tại vẫn thấy đúng
trạng thái, không bỏ sót việc cần khởi động lại.
"""
import os
import subprocess
import sys

import config

MARKER = os.path.join(config.APP_DIR, '.auto_update_last_head')
_BACKEND_PREFIXES = ('app/backend', 'app/requirements.txt')


def _run(args, cwd):
    return subprocess.run(args, cwd=cwd, capture_output=True, text=True,
                          encoding='utf-8', errors='replace')


def _rev_parse(ref, cwd):
    r = _run(['git', 'rev-parse', ref], cwd)
    if r.returncode != 0:
        raise RuntimeError((r.stderr or r.stdout or f'git rev-parse {ref} lỗi').strip())
    return r.stdout.strip()


def _spawn_restart(app_dir):
    """Windows-only: chờ 2s (để response HTTP của request này kịp gửi xong),
    tắt CHÍNH tiến trình đang chạy hàm này (nó đang giữ cổng 8000— run.bat/
    auto_update.bat luôn khởi động uvicorn không --reload, không nhiều
    worker, nên PID hiện tại CHẮC CHẮN là PID nghe cổng 8000, khỏi cần dò
    qua netstat/findstr), rồi mở lại uvicorn ở cửa sổ mới. DETACHED_PROCESS +
    CREATE_NEW_PROCESS_GROUP để tiến trình con sống sót khi tiến trình cha
    (server đang bị chính nó tắt) kết thúc.

    BẢN CŨ dùng 1 vòng `for /f ... in ('netstat ...') do taskkill ... & start
    ...` — do cú pháp batch coi TOÀN BỘ phần sau `do` là thân vòng lặp, nếu
    netstat không trả về dòng nào đúng lúc kiểm tra (race 2s) thì CẢ taskkill
    LẪN start đều không chạy — server cũ không tắt, server mới không mở,
    "Cập nhật ngay" âm thầm không có tác dụng gì (bug thật, đã gặp trên máy
    chủ). Dùng thẳng PID hiện tại loại bỏ hẳn việc dò netstat nên không còn
    vòng lặp có thể chạy 0 lần.

    BẢN TIẾP sau đó (bỏ vòng lặp) vẫn lỗi: gọi
    `Popen(['cmd', '/c', cmd], ...)` với `cmd` là 1 chuỗi CHỨA sẵn dấu ngoặc
    kép (`start "KSK Server" cmd /k "..."`) — trên Windows, khi args là 1
    LIST, Python tự chạy list2cmdline() để dựng dòng lệnh, và nó ESCAPE các
    dấu " có sẵn trong chuỗi thành \" (đúng quy tắc argv của C runtime,
    nhưng cmd.exe KHÔNG hiểu \" là 1 dấu " thoát — nó chỉ thấy dấu " trần
    và bật/tắt chế độ trong-ngoặc bất kể có \ đứng trước hay không) — dấu
    ngoặc bị lệch cấu trúc, khiến `start` nhận nhầm tham số đầu và báo lỗi
    hộp thoại "Windows cannot find '\"KSK Server\"'" (bug thật, đã gặp trên
    máy chủ). Truyền `cmd` dưới dạng CHUỖI (không phải list) kèm
    `shell=True` để Python tự bọc ĐÚNG 1 LỚP `comspec /c "<cmd>"`, không
    escape lại các dấu " đã có sẵn.

    Phản hồi anh Khôi: `taskkill /PID` chỉ tắt tiến trình python.exe BÊN
    TRONG cửa sổ — cửa sổ cmd cha (mở bằng `cmd /k`, cờ `/k` = "giữ cửa sổ
    mở sau khi lệnh kết thúc") vẫn còn đó, trông như "cửa sổ ma" (đứng hình,
    không còn tiến trình gì chạy). Trước khi mở cửa sổ MỚI, đóng HẲN mọi
    cửa sổ cũ có TIÊU ĐỀ "KSK Server" (tiêu đề này CHỈ được đặt bởi chính
    `start "KSK Server" cmd /k ...` — cửa sổ `run.bat` chạy tay lần đầu
    KHÔNG mang tiêu đề này nên không bao giờ bị đóng nhầm). `/T` đóng cả
    cây tiến trình (cmd.exe + con) — dọn sạch dù có nhiều cửa sổ ma đã tồn
    đọng từ trước khi có sửa lỗi này."""
    py = os.path.join(app_dir, '.venv', 'Scripts', 'python.exe')
    pid = os.getpid()
    cmd = (
        'timeout /t 2 /nobreak >nul & '
        f'taskkill /F /PID {pid} & '
        'taskkill /F /T /FI "WINDOWTITLE eq KSK Server" & '
        f'start "KSK Server" cmd /k "cd /d {app_dir} && '
        f'{py} -m uvicorn main:app --app-dir backend --host 0.0.0.0 --port 8000"'
    )
    subprocess.Popen(
        cmd, shell=True, cwd=app_dir,
        creationflags=subprocess.DETACHED_PROCESS | subprocess.CREATE_NEW_PROCESS_GROUP)


def pull_now():
    """Trả dict mô tả kết quả — router chuyển ValueError/RuntimeError thành
    lỗi HTTP. KHÔNG ném lỗi khi git fetch/pull thất bại vì lý do mạng —
    trả ok=False kèm thông báo để frontend hiển thị, không phải lỗi hệ
    thống."""
    cwd = config.PROJECT_ROOT
    try:
        old = _rev_parse('HEAD', cwd)
    except RuntimeError as e:
        return {'ok': False, 'loi': f'Không phải thư mục Git hoặc lỗi đọc HEAD: {e}'}

    fetch = _run(['git', 'fetch', 'origin', 'main'], cwd)
    if fetch.returncode != 0:
        return {'ok': False, 'loi': (fetch.stderr or fetch.stdout or 'git fetch lỗi').strip()}

    try:
        remote = _rev_parse('origin/main', cwd)
    except RuntimeError as e:
        return {'ok': False, 'loi': str(e)}

    if old == remote:
        return {'ok': True, 'da_moi_nhat': True, 'head': old[:8]}

    pull = _run(['git', 'pull', 'origin', 'main'], cwd)
    if pull.returncode != 0:
        return {'ok': False,
                'loi': (pull.stderr or pull.stdout or 'git pull lỗi — có thể do '
                        'xung đột với thay đổi local chưa commit').strip()}

    new = _rev_parse('HEAD', cwd)
    diff = _run(['git', 'diff', '--name-only', old, new], cwd)
    changed = [l.strip() for l in diff.stdout.splitlines() if l.strip()]
    can_khoi_dong_lai = any(f.startswith(_BACKEND_PREFIXES) for f in changed)

    try:
        with open(MARKER, 'w', encoding='utf-8') as f:
            f.write(new)
    except OSError:
        pass

    result = {
        'ok': True, 'da_moi_nhat': False,
        'head_cu': old[:8], 'head_moi': new[:8],
        'so_file_doi': len(changed), 'can_khoi_dong_lai': can_khoi_dong_lai,
        'da_khoi_dong_lai': False,
    }
    if can_khoi_dong_lai:
        if os.name == 'nt':
            _spawn_restart(config.APP_DIR)
            result['da_khoi_dong_lai'] = True
        else:
            result['ghi_chu'] = ('Máy này không phải Windows — code backend đã '
                                  'đổi, cần tự khởi động lại server thủ công.')
    return result
