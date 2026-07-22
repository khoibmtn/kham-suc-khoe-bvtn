# Ứng dụng quản lý & rà soát KSK Người cao tuổi — TTYT Thủy Nguyên

Xây theo `../SPEC.md`. Toàn bộ code nằm trong `app/`, không đụng vào `build/`,
`doc/`, `output/` (chỉ đọc). Kế hoạch chi tiết: `PLAN.md` · Tiêu chí nghiệm thu
(45 tiêu chí, đã verify ALL PASS): `CRITERIA.md`.

## Chạy

```bash
./run.sh          # tự tạo venv + nạp dữ liệu (lần đầu ~1-2 phút) + mở server
# → http://127.0.0.1:8000
```

Tài khoản mẫu: `admin / admin123` (quản trị) · `raso1 / raso123` (cán bộ rà
soát, đang được phân công Phường Nam Triệu). **Đổi mật khẩu sau lần đăng nhập đầu**
(menu Người dùng của admin).

## Màn hình

| Màn hình | Ai thấy | Ghi chú |
|---|---|---|
| Danh sách rà soát | tất cả (theo phân công) | 9 bộ lọc, fuzzy họ tên, phím tắt `/` `↑↓` `Enter` `Esc` `Ctrl+↓↑` `Ctrl+S` `Ctrl+K` `F2` `Alt+1..9` |
| Chi tiết hồ sơ | theo phân công | 103 trường BYT, 6 nhóm gập, chẩn đoán gốc ghim chỉ đọc, tự lưu khi rời ô, kiểm bất biến QĐ 1613 |
| Sinh hiệu | theo phân công | nhập nhanh 6 ô/người, import Excel (khớp CCCD → họ tên+ngày), BMI tự tính, gợi ý PL thể lực phải xác nhận |
| Xuất file | admin | phạm vi 5 kiểu, chặn hồ sơ cờ 🔴 (mặc định), cột mở rộng (mặc định tắt), chạy nền theo xã, file kê kèm theo |
| Dashboard | tất cả | tiến độ xã/cán bộ, chất lượng dữ liệu (baseline vs hiện tại), thống kê chuyên môn |
| Phân công / Người dùng | admin | phân công theo xã / khoảng mã / danh sách |

## Dữ liệu

- SQLite: `data/ksk.db` (nạp từ `../output/KSK_DuLieuQuanLy_TOANBO.xlsx` +
  danh mục từ `../doc/Import_KSK_Tren 18.xlsm`). Nạp idempotent — chạy lại
  không ghi đè dữ liệu cán bộ đã sửa.
- File xuất: `data/exports/<timestamp>/` (file .xlsm theo xã + file kê .xlsx).
- Sao lưu: `data/backups/` (tự chép khi khởi động server).
- Mọi thay đổi đều ghi bảng `nhat_ky` (ai, lúc nào, trường gì, cũ → mới).

## Kiểm chứng sau nạp (SPEC §8.6)

```bash
./.venv/bin/python - <<'EOF'
import sqlite3
c = sqlite3.connect('data/ksk.db')
for q, exp in [
    ("SELECT COUNT(*) FROM ho_so", 13326),
    ("SELECT COUNT(*) FROM benh", 39645),
    ("SELECT COUNT(*) FROM ho_so WHERE so_cccd IS NULL OR so_cccd=''", 1654),
]:
    print(q, '→', c.execute(q).fetchone()[0], f'(kỳ vọng {exp})')
EOF
```

Lưu ý: DB hiện tại đã có vài thao tác demo (một số hồ sơ được nhập sinh hiệu,
1 đợt xuất thử Phường Nam Triệu) nên vài con số lệch nhẹ so với baseline — baseline
nguyên gốc lưu ở bảng `baseline_thongke`; nạp DB mới sạch sẽ ra đúng số SPEC.
