# Chạy KSK NCT trên PC Windows trong mạng nội bộ (LAN)

Mô hình: **1 máy Windows (desktop) chạy server** ← các máy nhân viên trong cùng
mạng vào bằng trình duyệt qua địa chỉ IP. Dữ liệu nằm trên chính máy desktop,
KHÔNG ra internet. Anh code trên MacBook → `git push` → desktop `git pull` →
khởi động lại → mọi máy dùng bản mới.

---

## A. CÀI 1 LẦN trên máy Desktop Windows

### 1. Cài phần mềm nền
- **Python 3.12** (python.org) — khi cài **TICK "Add Python to PATH"**.
- **Git for Windows** (git-scm.com) — để `git pull` cập nhật code.

### 2. Lấy mã nguồn
Mở **Command Prompt** (cmd), chạy:
```
cd %USERPROFILE%\Documents
git clone https://github.com/khoibmtn/kham-suc-khoe-bvtn.git
```
(Repo đang Public nên clone được ngay. Nếu chuyển Private, đăng nhập Git khi được hỏi.)

### 3. Chép DỮ LIỆU sang (1 lần — dữ liệu KHÔNG nằm trong git)
File `app/data/ksk.db` chứa dữ liệu bệnh nhân, được .gitignore nên KHÔNG tải về
theo git. Chép thủ công từ MacBook sang:
- Trên MacBook, file ở: `~/Documents/Antigravity/kham-suc-khoe/app/data/ksk.db`
- Chép qua **USB** hoặc **thư mục chia sẻ mạng** vào máy desktop tại:
  `...\kham-suc-khoe-bvtn\app\data\ksk.db`
  (tạo thư mục `app\data\` nếu chưa có).

### 4. Chạy thử
```
cd %USERPROFILE%\Documents\kham-suc-khoe-bvtn\app
run.bat
```
Lần đầu sẽ tự tạo môi trường + cài thư viện (~2–3 phút). Xong nó in ra dòng:
```
http://192.168.x.x:8000
```
→ đó là địa chỉ các máy khác dùng.

### 5. Mở tường lửa (nếu máy khác không vào được)
Windows Firewall thường hỏi khi chạy lần đầu → chọn **Allow / Cho phép**.
Nếu bị chặn, mở PowerShell (Admin) chạy:
```
netsh advfirewall firewall add rule name="KSK NCT 8000" dir=in action=allow protocol=TCP localport=8000
```

---

## B. HẰNG NGÀY — nhân viên sử dụng
1. Bật máy desktop, mở `app\run.bat` (nháy đúp). Để cửa sổ đó chạy suốt buổi.
2. Máy nhân viên mở trình duyệt (Chrome/Edge/Cốc Cốc) vào `http://192.168.x.x:8000`
   (đúng IP máy desktop). Đăng nhập bằng tài khoản của mình.
3. Cuối ngày tắt: bấm **Ctrl+C** trong cửa sổ run.bat (hoặc đóng cửa sổ).

> 💡 Muốn server **tự chạy khi bật máy**: nhấn `Win+R` → gõ `shell:startup` →
> tạo shortcut trỏ tới `app\run.bat` vào thư mục đó.

> 💾 **Sao lưu tự động:** mỗi lần khởi động, app tự chép DB sang
> `app\data\backups\YYYY-MM-DD.db` (giữ 30 bản gần nhất). Thỉnh thoảng nên copy
> cả thư mục `app\data\` ra ổ ngoài/USB để an toàn hơn.

---

## C. LUỒNG CẬP NHẬT CODE (MacBook → Desktop)

```
┌──────────── MacBook (nơi code) ────────────┐      ┌──── Desktop Windows (server) ────┐
│  sửa code với Claude Code                   │      │                                   │
│  → git add / commit / push origin main  ────┼─────►│  chạy update.bat  (git pull)      │
│                                             │      │  → Ctrl+C tắt run.bat cũ          │
│                                             │      │  → chạy lại run.bat (bản mới)     │
└─────────────────────────────────────────────┘      └───────────────────────────────────┘
```

**Trên MacBook** (sau khi Claude Code sửa xong):
```bash
cd ~/Documents/Antigravity/kham-suc-khoe
git push origin main      # Claude Code thường tự làm bước này
```

**Trên Desktop Windows** khi muốn lấy bản mới:
```
cd %USERPROFILE%\Documents\kham-suc-khoe-bvtn\app
update.bat            # git pull + cập nhật thư viện
REM  rồi tắt run.bat cũ (Ctrl+C) và chạy lại run.bat
```

Điểm quan trọng: **`git pull` chỉ cập nhật CODE, KHÔNG đụng dữ liệu.**
`app\data\ksk.db` (dữ liệu nhân viên nhập) luôn giữ nguyên trên desktop — vì nó
được .gitignore. Dữ liệu và code hoàn toàn tách biệt, cập nhật code không mất
dữ liệu.

---

## D. Xuất file .xlsm nộp Bộ
Chạy ngay trên máy desktop (đã có sẵn dữ liệu): đăng nhập admin → màn **Xuất
file**. Máy desktop RAM thoải mái nên xuất 8 xã bình thường.

## E. Lưu ý bảo mật
- Server chỉ truy cập được trong mạng nội bộ (không mở ra internet) → an toàn cho
  dữ liệu y tế (hợp Nghị định 13/2023).
- Vẫn bảo vệ bằng đăng nhập tài khoản. Nhắc nhân viên không chia sẻ mật khẩu.
- Định kỳ copy thư mục `app\data\` ra nơi khác để phòng hỏng máy.
