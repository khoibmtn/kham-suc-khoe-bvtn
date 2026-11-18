# Chạy offline trên máy Windows (từ 18/11/2026)

Chi tiết, lý do thiết kế và kết quả cài đặt: `docs/05-TRIEN-KHAI-WINDOWS-OFFLINE.md`.

| Tệp | Chạy bởi | Việc |
|---|---|---|
| `cai-dat.ps1` | Quản trị viên, một lần (chạy lại an toàn) | Giải nén PostgreSQL 18 (zip EDB, kiểm chữ ký số), clone repo, sinh mật khẩu/khoá phiên vào `khoa\app.env`, `initdb`, `npm ci`, đăng ký 2 tác vụ, tạo CSDL `ksk` + `ksk_test`, nạp dump Neon (chỉ khi CSDL trống), migrate, build, lối tắt Desktop |
| `giam-sat.ps1` | Tác vụ **KSK Ra soat Ung dung** (LOCAL SERVICE, khi bật máy + 5 phút) | Giữ PostgreSQL (127.0.0.1:5433) và `next start` (127.0.0.1:8028) luôn chạy; cờ `dieu-khien\tam-dung` dừng ứng dụng (CSDL vẫn chạy) |
| `bao-tri.ps1` | Tác vụ **KSK Ra soat Bao tri** (LOCAL SERVICE, khi bật máy + 5 phút, làm việc 7h–17h) | Sao lưu `pg_dump` mỗi giờ nếu dữ liệu đổi; tự cập nhật khi Mac `git push` (build + test trong `kiem-tra` → sao lưu → dừng → merge → migrate → build → chạy → kiểm → lỗi thì quay lại) |
| `chung.ps1` | Thư viện dùng chung | Cấu hình, log, git, npm, biến PG* |

Thư mục cài (mặc định `D:\vibe-coding\ksk-ra-soat`): `app\` (clone repo), `kiem-tra\` (worktree test), `pgsql\`, `pgdata\`,
`sao-luu\`, `nhat-ky\`, `khoa\` (bí mật, chỉ quản trị viên ghi), `dieu-khien\`, `npm-cache\`, `cau-hinh.psd1`.

Script phải lưu **UTF-8 có BOM + CRLF** (PowerShell 5.1 đọc UTF-8 không BOM thành ANSI → hỏng chữ tiếng Việt).
Sửa script xong: kiểm cú pháp trên Windows bằng `[System.Management.Automation.Language.Parser]::ParseFile` trước khi push
— commit mới được kiểm và cài bởi `bao-tri.ps1` **đang chạy** (bản cũ).
