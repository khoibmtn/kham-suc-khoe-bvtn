# Chuyển server sang máy Windows (truy cập qua Internet)

> ✅ **Đã chuyển xong (2026-07-25).** Server đang chạy trên PC Windows,
> nhân viên đang dùng qua tunnel. Phần dưới đây giữ lại làm tài liệu tham
> khảo (setup lại nếu đổi máy) + mục **H** (mới) là quy trình vận hành
> hằng ngày kể từ khi đã chuyển — bao gồm **tự động cập nhật code** và
> **tự động sao lưu dữ liệu**.

Mô hình: **MacBook code → `git push` → máy Windows chạy `update.bat` (git pull) → restart**.
Máy Windows là server chạy-liên-tục + giữ **DB sống** (`app/data/ksk.db`). Dữ liệu
đi 1 lần qua copy file; code đi qua git. `git pull` KHÔNG bao giờ đè DB (đã `.gitignore`).

---

## A. Cài đặt máy Windows (làm 1 lần)

1. **Python 3.11+** — tải ở python.org, khi cài **tick “Add Python to PATH”**.
2. **Git for Windows** — git-scm.com.
3. **cloudflared** — tải `cloudflared-windows-amd64.exe` ở
   https://github.com/cloudflare/cloudflared/releases → đổi tên thành
   `cloudflared.exe` → đặt trong thư mục `app\` (cạnh `tunnel.bat`), hoặc thêm vào PATH.
4. **Clone repo:**
   ```
   git clone <URL-repo-GitHub> kham-suc-khoe
   ```
5. **Chống ngủ:** Settings → Power → “Screen/Sleep” = Never (khi cắm điện).
   Nên đặt máy không tự khoá/ngủ, luôn cắm điện.

## B. Chép DB sống từ Mac sang (làm lúc CHUYỂN ĐỔI, xem mục D)

Trên Mac, tạo bản sao nhất quán (an toàn kể cả khi app đang chạy):
```bash
sqlite3 ~/Documents/Antigravity/kham-suc-khoe/app/data/ksk.db ".backup /tmp/ksk_migrate.db"
```
Chép `/tmp/ksk_migrate.db` sang Windows, đặt vào `app\data\ksk.db`
(tạo thư mục `app\data\` nếu chưa có).

## C. Khởi động trên Windows

- Cửa sổ 1 — server: chạy `app\run.bat` (lần đầu tự tạo venv + cài thư viện).
- Cửa sổ 2 — internet: chạy `app\tunnel.bat` → chép URL `https://xxxx.trycloudflare.com`
  gửi cho nhân viên.

## D. Chuyển đổi (cutover) — làm lúc ÍT người dùng

1. Báo nhân viên tạm nghỉ vài phút.
2. **Tắt app trên Mac** (Ctrl+C ở cửa sổ server Mac) — để không còn ai ghi vào DB Mac.
3. Chạy lệnh `.backup` (mục B) → chép DB sang Windows.
4. `run.bat` + `tunnel.bat` trên Windows.
5. Gửi URL mới cho nhân viên. Từ nay chỉ dùng máy Windows.

> ⚠️ Chỉ chạy MỘT máy tại một thời điểm. Chạy 2 nơi cùng lúc = 2 DB tách nhau, lệch dữ liệu.

## E. Vòng lặp hằng ngày (thủ công — bản thay thế: mục H, tự động)

- **Trên Mac:** sửa code → `git push`.
- **Trên Windows:** chạy `app\update.bat` (git pull + cài lại thư viện).
  - Sửa **giao diện (frontend)**: các máy nhân viên **tự tải lại** trong ≤30s
    (cơ chế auto-reload) — không cần làm gì thêm.
  - Sửa **backend (Python)**: Ctrl+C ở cửa sổ `run.bat` rồi chạy lại `run.bat`.

## F. URL cố định (khuyến nghị, tùy chọn)

Quick tunnel đổi URL mỗi lần chạy lại. Muốn URL **không đổi**, dùng **named tunnel**
(cần 1 tên miền trỏ vào Cloudflare — có thể dùng tên miền rẻ):
```
cloudflared tunnel login
cloudflared tunnel create ksk
cloudflared tunnel route dns ksk ksk.<ten-mien-cua-ban>
```
Tạo `config.yml`: `tunnel: ksk` + `ingress: - hostname: ksk.<ten-mien>  service: http://localhost:8000` + `- service: http_status:404`.
Chạy: `cloudflared tunnel run ksk` → URL `https://ksk.<ten-mien>` cố định, sống qua mọi lần restart.

## G. Sao lưu DB thủ công (bổ sung, không bắt buộc nếu đã bật mục H)

Thỉnh thoảng copy `app\data\ksk.db` sang ổ khác / USB (đề phòng hỏng CẢ Ổ
ĐĨA — mục H chỉ backup vào ổ đĩa hiện tại, không thay thế cho việc này).

## H. Tự động hoá (khuyến nghị — đã bật sẵn giá trị mặc định)

Từ commit thêm `auto_update.bat` + trang **Cài đặt** (admin), có 2 cơ chế tự
động chạy song song với `run.bat` + `tunnel.bat`:

### H.1 Tự động cập nhật code khi Mac `git push`
Mở **cửa sổ thứ 3** trên máy Windows, chạy:
```
app\auto_update.bat
```
Cứ mỗi N phút (mặc định 5, chỉnh ở app → **Cài đặt** → *Tự động cập nhật
code*) nó tự `git pull`. Nếu commit mới chỉ đổi **giao diện** (JS/CSS/HTML) —
không làm gì thêm, trình duyệt nhân viên tự tải lại trong ≤30s (cơ chế sẵn
có). Nếu đổi **backend** (`app/backend/**`, `requirements.txt`) — tự đóng
tiến trình server cũ (cổng 8000) và mở tiến trình mới trong 1 cửa sổ tên
**"KSK Server"** (cửa sổ `run.bat` cũ lúc này có thể đóng tay, không còn
phục vụ gì). Tắt cơ chế này (tạm dừng git pull tự động) bằng cách bỏ tick
"Bật" ở mục *Tự động cập nhật code* trong Cài đặt, hoặc đóng cửa sổ
`auto_update.bat`.

### H.2 Tự động sao lưu dữ liệu định kỳ
Chạy **NGAY TRONG tiến trình server** (`run.bat`/`auto_update.bat` khởi
động server) — không cần cửa sổ riêng. Mặc định: mỗi **10 phút**, giữ
**100 bản** gần nhất, lưu ở `app\data\backups\auto\ksk_YYYYMMDD_HHMMSS.db`.
Chỉnh số phút / số bản giữ lại / bật-tắt ở app → **Cài đặt** → *Tự động sao
lưu dữ liệu* — có hiệu lực trong vòng chưa tới 1 phút, **không cần khởi động
lại server**. Trang Cài đặt cũng hiện "Lần sao lưu tự động gần nhất".

> Cả 2 mục trên đọc cấu hình từ CÙNG 1 nơi (bảng `cai_dat` trong DB), nên
> chỉnh 1 lần ở trang Cài đặt là áp dụng cho cả `auto_update.bat` (đọc lại
> mỗi vòng lặp) lẫn luồng backup nền trong server (đọc lại mỗi 30 giây).
