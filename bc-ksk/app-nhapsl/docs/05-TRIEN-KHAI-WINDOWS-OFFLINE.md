# 05 — CHẠY OFFLINE TRÊN MÁY WINDOWS (thay Vercel + Neon, từ 18/11/2026)

## 1. Vì sao, và cái gì đã đổi

- Anh Khôi chốt 18/11/2026: thôi chạy trên Internet. App chạy **cục bộ trên máy Windows của TTYT** (`DESKTOP-A7HNN82`,
  cùng máy với nvqs `D:\my-app`), chỉ mở được **trên chính máy đó** tại **http://127.0.0.1:8028**. Chưa cần tunnel.
- Toàn bộ dữ liệu đã chuyển từ Neon (`ksk-ra-soat-db`, PostgreSQL 18.6, Singapore) về PostgreSQL 18.7 chạy trên máy Windows.
- Project Vercel `ksk-ra-soat-2026` đã **xoá** (https://ksk-ra-soat-2026.vercel.app không còn). CSDL Neon **được giữ lại**
  theo yêu cầu của anh Khôi để đối chiếu; chưa xoá. Xoá sau: Vercel → Storage/Integrations → Neon `ksk-ra-soat-db`.
- Giữ nguyên PostgreSQL (không chuyển SQLite) vì code dùng `unaccent`, `pg_trgm`, JSONB, nhiều SQL thô của Postgres.
- Đổi code duy nhất: `src/lib/auth/session.ts` — biến `SESSION_COOKIE_SECURE=0` bỏ cờ `Secure` của cookie phiên (bản
  Windows chạy HTTP trên 127.0.0.1). Không đặt biến này thì hành vi như cũ.
- Thông báo đẩy (web push) **tắt** trên Windows (không đặt `VAPID_*` → các hàm gửi là no-op, đúng thiết kế `src/lib/push.ts`).

## 2. Kiến trúc trên máy Windows

```
D:\vibe-coding\ksk-ra-soat\
  cau-hinh.psd1          cổng 8028 (app), 5433 (PostgreSQL), đường dẫn node/npm/git
  app\                   git clone https://github.com/khoibmtn/kham-suc-khoe-bvtn (repo CÔNG KHAI, không cần khoá)
    bc-ksk\app-nhapsl\   ứng dụng (next start), script ở deploy\windows\
  kiem-tra\              git worktree (detached) để build + test commit mới trước khi cài
  pgsql\                 PostgreSQL 18.7 (zip chính thức EDB, chỉ bin/lib/share, chữ ký số EnterpriseDB đã kiểm)
  pgdata\                cụm CSDL: UTF8, builtin C.UTF-8 (giống Neon), timezone GMT (giống Neon), chỉ nghe 127.0.0.1
                           CSDL ksk (dữ liệu thật), ksk_test (cho npm test); vai trò ksk (chủ 2 CSDL), postgres (superuser)
  sao-luu\               tu-dong-gio-*.dump (giữ 48), tu-dong-truoc-cap-nhat-*.dump (giữ 10) — pg_dump -Fc
  nhat-ky\               giam-sat-yyyyMM.log, bao-tri-yyyyMM.log, ung-dung-*.out/err.log, postgres-khoi-dong.log
  khoa\                  app.env (DATABASE_URL, TEST_DATABASE_URL, SESSION_SECRET), pg-postgres.txt — chỉ quản trị viên ghi,
                           LOCAL SERVICE đọc; KHÔNG bao giờ in/log/commit
  dieu-khien\            cờ và trạng thái (tam-dung, tam-dung-cap-nhat, dang-cap-nhat.txt, commit-loi.txt, *.sha, van-tay…)
  tai-ve\                pg18.zip đã tải (xoá được)
```

Quyền thư mục: Administrators + SYSTEM toàn quyền, LOCAL SERVICE sửa (khoa: chỉ đọc). Tài khoản Windows thường (HP) chỉ
đọc được `nhat-ky\`. Explorer hỏi "You don't currently have permission… Continue" → **bấm Cancel** (Continue cấp vĩnh viễn
toàn quyền cho tài khoản thường trên cả CSDL).

Hai tác vụ Task Scheduler, tài khoản **LOCAL SERVICE**, khi bật máy + mỗi 5 phút, không chạy chồng, không cần ai đăng nhập:

| Tác vụ | Script | Việc |
|---|---|---|
| `KSK Ra soat Ung dung` | `deploy\windows\giam-sat.ps1` | `pg_ctl start` nếu PostgreSQL chưa chạy (xoá `postmaster.pid` mồ côi sau mất điện); `node node_modules\next\dist\bin\next start -H 127.0.0.1 -p 8028` với biến từ `khoa\app.env`; chết thì chạy lại |
| `KSK Ra soat Bao tri` | `deploy\windows\bao-tri.ps1` | 7h–17h: sao lưu theo giờ + tự cập nhật (mục 3). Ngoài giờ chỉ phục hồi cập nhật dở dang |

## 3. Quy trình sửa code (Mac) → tự cập nhật (Windows)

1. Trên Mac sửa code trong `bc-ksk/app-nhapsl`, chạy `npm test` (cần `TEST_DATABASE_URL`), commit, `git push` lên `main`.
2. Máy Windows, lượt bảo trì kế tiếp trong 7h–17h (≤ 5 phút):
   - commit không đụng `bc-ksk/app-nhapsl` (vd sửa app KSK Python ở `app/`) → chỉ fast-forward, không khởi động lại;
   - có đụng → worktree `kiem-tra`: `npm ci` (nếu lockfile đổi) → `db:migrate` + `build` + `npm test` trên **ksk_test** →
     đạt thì `pg_dump` trước cập nhật → cờ `tam-dung-cap-nhat` (app dừng, CSDL vẫn chạy) → `git reset --hard <commit mới>` →
     `npm ci` nếu lockfile đổi → `db:migrate` (CSDL thật) → `build` → gỡ cờ → kiểm `GET /dang-nhap` = 200 trong 180 giây.
   - Lỗi ở bất kỳ bước nào sau khi dừng → quay về commit cũ (build lại), commit lỗi ghi vào `dieu-khien\commit-loi.txt`
     (không thử lại). Test/build lỗi → giữ bản đang chạy, không dừng gì.
   - App dừng khoảng 1–3 phút mỗi lần cập nhật (build lại tại chỗ). Push ngoài 7h–17h → cài lúc 7h sáng hôm sau.
3. Migration phải **chỉ thêm** (không xoá/đổi tên cột) để quay về commit cũ vẫn chạy được trên CSDL đã migrate.
4. Sửa `deploy/windows/*.ps1`: lưu UTF-8 **có BOM** + CRLF (`deploy/windows/.gitattributes` giữ nguyên khi checkout), kiểm cú pháp
   trên Windows trước khi push. Commit mới do `bao-tri.ps1` **bản cũ** kiểm và cài.

Theo dõi: Desktop của HP có lối tắt `KSK ra soat - ung dung` (mở app) và `KSK ra soat - nhat ky` (thư mục log, chỉ đọc).
Log cập nhật: `nhat-ky\bao-tri-<yyyyMM>.log` ("ĐÃ CẬP NHẬT …", "KHÔNG qua kiểm tra", "Sao lưu theo giờ thành công …").

## 4. Vận hành (PowerShell quản trị trên Windows)

```powershell
Get-ScheduledTask "KSK Ra soat*" | Get-ScheduledTaskInfo           # trạng thái tác vụ
Get-Content D:\vibe-coding\ksk-ra-soat\nhat-ky\bao-tri-$(Get-Date -f yyyyMM).log -Tail 30
Disable-ScheduledTask "KSK Ra soat Bao tri"                         # tạm dừng tự cập nhật (Enable-ScheduledTask để bật lại)
New-Item D:\vibe-coding\ksk-ra-soat\dieu-khien\tam-dung -ItemType File   # dừng app (CSDL vẫn chạy); xoá tệp = chạy lại
```

Khôi phục một bản sao lưu (app phải đang dừng bằng cờ `tam-dung`; mật khẩu `ksk` nằm trong `khoa\app.env`):
`pgsql\bin\pg_restore -h 127.0.0.1 -p 5433 -U ksk -d ksk --clean --if-exists --no-owner --no-acl sao-luu\<tệp>.dump`.
Cài lại từ đầu trên máy khác: chép `deploy\windows\cai-dat.ps1` + `pg18.zip` + một bản `.dump`, chạy
`cai-dat.ps1 -FileDump <tệp.dump>` bằng PowerShell quản trị (xem đầu script).

Chạy lệnh quản trị Node (vd `npm run export:cowork`, `npm run kiem-so`) trên Windows: PowerShell quản trị, `cd` vào
`app\bc-ksk\app-nhapsl`, đặt `$env:DATABASE_URL` từ `khoa\app.env` (không in ra), chạy lệnh. Kết quả xuất ra
`handoff\export\…` trong thư mục app (không vào git).

## 5. Chuyển dữ liệu (18/11/2026)

- `pg_dump` 18.7 (Homebrew `postgresql@18` trên Mac) từ Neon, chỉ schema `public` (bỏ `neon_auth` — bảng Neon Auth trống,
  app không dùng), `-Fc --no-owner --no-acl` → `handoff/chuyen-offline/neon-public-<thời gian>.dump` (~1,3 MB, chỉ trên Mac +
  Windows, không vào git) cùng `dem-so.txt` (số dòng từng bảng để đối chiếu).
- Nạp trên Windows: `pg_restore --single-transaction --exit-on-error` với danh sách TOC bỏ mục `SCHEMA public`, rồi so
  `count(*)` từng bảng với `dem-so.txt`.
- Số liệu lúc chuyển: ho_so 12.466 · nhat_ky 16.090 · users 9 · buoi_kham 60 · de_nghi_chuyen 68 · _migrations 6.

## 6. Kết quả cài đặt và kiểm tra

(điền sau khi cài — xem mục 6 bản cuối)
