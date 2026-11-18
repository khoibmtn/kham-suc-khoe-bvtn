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

## 6. Kết quả cài đặt và kiểm tra (18/11/2026, Claude Code qua MacViewer)

- PostgreSQL 18.7: tải `postgresql-18.7-1-windows-x64-binaries.zip` từ get.enterprisedb.com (anh Khôi đồng ý tải); 6 tệp
  chạy chính có chữ ký số **Valid** (CN=EnterpriseDB Corporation); máy đã có VC++ runtime.
- `cai-dat.ps1` lần 1 dừng ở `initdb` (mã 0xC0000135): initdb chạy bằng quản trị viên tự chạy lại với token hạn chế
  (bỏ nhóm Administrators) nên không đọc được DLL/khoá trong thư mục chỉ cấp quyền cho Administrators/SYSTEM/LOCAL SERVICE.
  Sửa (`e5966c7`): `giam-sat.ps1` (LOCAL SERVICE) tự `initdb` ở lần chạy đầu. Lần 2 cài trọn 12 bước.
- Nạp dữ liệu: 10/10 bảng khớp `dem-so.txt`. Neon sau lúc dump không có thay đổi (đối chiếu lại trước khi xoá Vercel;
  thao tác ghi cuối trên Neon 07:09 18/11/2026).
- Đang chạy: `postgres.exe` nghe **chỉ** 127.0.0.1:5433, `node.exe` (next start) nghe **chỉ** 127.0.0.1:8028; 2 tác vụ chạy
  bằng LOCAL SERVICE; `/dang-nhap` 200; `/api/auth/ds-dang-nhap` trả 9 tài khoản. Mật khẩu người dùng giữ nguyên như trên Vercel
  (bảng `users` chuyển nguyên); khoá phiên mới nên mọi người phải đăng nhập lại.
- Vercel: `vercel project rm ksk-ra-soat-2026` → URL cũ trả 404 `DEPLOYMENT_NOT_FOUND`. Neon `ksk-ra-soat-db` còn
  (Vercel → Integrations, không gắn project nào).
- Kiểm thử trước khi cài (trên Mac, cụm PostgreSQL 18 tạm cùng cấu hình): khôi phục dump sạch, 246/246 test đạt, `next build`
  + `next start` production đọc đúng dữ liệu.
- Rà soát độc lập script bởi subagent: sửa 7 lỗi (pg_ctl treo do thừa kế pipe, cờ cập nhật dở bị xoá sớm, lỗi tạm thời bị coi
  là commit hỏng, sao lưu trước cập nhật lúc app còn chạy, chạy lại cai-dat đụng app đang chạy, mật khẩu role lệch/lộ).
- Tự cập nhật end-to-end ĐẠT (commit `b74b4f9`): 07:54:26 sao lưu theo giờ (1,27 MB) → 07:54:29 phát hiện commit → build + 246
  test trong `kiem-tra` xong 07:56:34 (lần đầu có `npm ci`) → 07:56:37 dừng app, sao lưu → 07:56:54 "ĐÃ CẬP NHẬT"; app ngừng
  phục vụ khoảng 18 giây.
- Đăng nhập bằng tài khoản thật trên Windows qua `http://127.0.0.1:8028` ĐẠT (anh Khôi xác nhận 18/11/2026) — cookie phiên
  chạy được trên HTTP nhờ `SESSION_COOKIE_SECURE=0`.
- Chưa thử: rút điện thật; commit hỏng bị chặn; commit chỉ đổi phần khác của repo (nhánh fast-forward không khởi động lại).

## 7. Bàn giao cho phiên Claude Code sau

- Mọi thao tác trên Windows làm qua skill `windows-qua-macviewer` (anh Khôi kết nối MacViewer). Mở PowerShell riêng trước
  khi gửi lệnh — máy này thường mở phần mềm HIS (BVST), gửi lệnh khi HIS đang được chọn là gõ nhầm vào HIS.
  Tài khoản Windows HP **không** phải quản trị: muốn đọc `khoa\`, `pgdata\`, `sao-luu\` phải mở PowerShell quản trị (UAC).
- Dữ liệu sống nằm ở **Windows**. Neon và bản dump trong `handoff/chuyen-offline/` (chỉ trên Mac) là ảnh chụp 18/11/2026.
  Muốn số liệu mới để làm báo cáo/Cowork: chạy lệnh export trên Windows, hoặc `pg_dump` bản mới từ Windows về.
- Dev trên Mac: `npm test` cần `TEST_DATABASE_URL` trỏ tới một CSDL **test** PostgreSQL (tên có chữ "test", có `unaccent`,
  `pg_trgm`). Hiện dùng Homebrew `postgresql@16` cổng 5432, CSDL `nhapsl_test` — 246/246 đạt (18/11/2026). Máy Windows chạy
  lại toàn bộ test trên PostgreSQL 18.7 (`ksk_test`) trước khi cài, nên lỗi riêng của bản 18 vẫn bị chặn ở đó.
  Mac có thêm Homebrew `postgresql@18` (cài 18/11/2026, đang tắt) — khi chạy `pg_ctl` trên Mac phải đặt `LC_ALL=en_US.UTF-8`.
- Chưa làm / để anh Khôi quyết: xoá Neon `ksk-ra-soat-db`; thư mục sao lưu ngoài (ổ khác/USB); truy cập từ máy khác trong
  LAN (hiện cố ý chỉ 127.0.0.1); xoá `D:\vibe-coding\ksk-ra-soat\tai-ve\` (zip PostgreSQL + dump, chỉ quản trị viên đọc được).
