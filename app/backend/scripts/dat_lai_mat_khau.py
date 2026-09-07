# -*- coding: utf-8 -*-
"""
dat_lai_mat_khau.py — đặt lại mật khẩu 1 tài khoản khi quên mật khẩu (không
thể "lấy lại" mật khẩu cũ vì lưu dạng băm 1 chiều pbkdf2 — chỉ đặt được
mật khẩu MỚI).

Chạy trên MÁY CHỦ (nơi có app/data/ksk.db thật đang chạy server), từ thư
mục app/:

    .venv\\Scripts\\python.exe backend\\scripts\\dat_lai_mat_khau.py admin MatKhauMoi123

(Windows CMD — dùng \\; nếu chạy trên Mac/Linux thì .venv/bin/python và /).

Tham số 1: ten_dang_nhap (vd admin). Tham số 2: mật khẩu MỚI muốn đặt.
KHÔNG cần dừng server — chỉ UPDATE 1 dòng trong DB, có hiệu lực ngay từ lần
đăng nhập tiếp theo (không cần khởi động lại app).

Khuyến nghị: sau khi đăng nhập lại được bằng mật khẩu mới, vào "Tài khoản"
đổi sang mật khẩu riêng của mình ngay.
"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
import db  # noqa: E402
import auth  # noqa: E402


def main():
    if len(sys.argv) != 3:
        print('Cách dùng: python dat_lai_mat_khau.py <ten_dang_nhap> <mat_khau_moi>')
        sys.exit(1)
    ten_dang_nhap, mat_khau_moi = sys.argv[1], sys.argv[2]
    if len(mat_khau_moi) < 6:
        print('Mật khẩu mới nên có ít nhất 6 ký tự.')
        sys.exit(1)

    conn = db.get_connection()
    try:
        row = conn.execute(
            'SELECT id, ho_ten, vai_tro FROM nguoi_dung WHERE ten_dang_nhap=?',
            (ten_dang_nhap,)).fetchone()
        if not row:
            print(f'Không tìm thấy tài khoản "{ten_dang_nhap}".')
            sys.exit(1)
        conn.execute('UPDATE nguoi_dung SET mat_khau_hash=? WHERE id=?',
                     (auth.hash_password(mat_khau_moi), row['id']))
        conn.commit()
        print(f'Đã đặt lại mật khẩu cho "{ten_dang_nhap}" '
              f'({row["ho_ten"]}, vai trò {row["vai_tro"]}). '
              'Đăng nhập lại ngay bằng mật khẩu mới vừa đặt.')
    finally:
        conn.close()


if __name__ == '__main__':
    main()
