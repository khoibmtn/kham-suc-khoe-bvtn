# Chuyển server sang máy Windows (truy cập qua Internet)

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

## E. Vòng lặp hằng ngày (sau khi đã chuyển)

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

## G. Sao lưu DB định kỳ (nên có)

Thỉnh thoảng copy `app\data\ksk.db` sang ổ khác / USB, hoặc dùng
`app\backend`... (đã có thư mục `app\data\backups\`). Dữ liệu bệnh nhân chỉ nằm ở
máy Windows nên **phải backup** phòng hỏng ổ cứng.
