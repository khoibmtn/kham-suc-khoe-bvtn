# Chạy online miễn phí — Render.com + Cloudflare R2 (kiểu Vercel)

Kiến trúc: **Render free** chạy app (connect GitHub, push là tự deploy — y như
Vercel) + **Cloudflare R2 free** giữ dữ liệu SQLite (vai trò như Firestore).
Litestream tự khôi phục DB khi server khởi động và sao lưu mỗi 10 giây khi có
thay đổi. Code app không đổi một dòng.

> ⚠️ Dữ liệu bệnh nhân sẽ nằm trên cloud (R2) và app có địa chỉ công khai
> (bảo vệ bằng đăng nhập của app). Anh đã xác nhận tự chịu trách nhiệm về
> bảo mật. Khuyến nghị tối thiểu: đổi mật khẩu admin/raso1 NGAY sau deploy.

## Bước 1 — Cloudflare R2 (5 phút, 1 lần)

1. https://dash.cloudflare.com → **R2 Object Storage** → *Create bucket*,
   tên: `ksk-nct` (region Automatic).
2. **R2 → Manage API Tokens → Create API Token**: quyền *Object Read & Write*,
   giới hạn vào bucket `ksk-nct`. Lưu lại: `Access Key ID`, `Secret Access Key`,
   và `Endpoint` dạng `https://<account_id>.r2.cloudflarestorage.com`.

## Bước 2 — Đưa dữ liệu lên R2 lần đầu (từ máy Mac)

```bash
brew install benbjohnson/litestream/litestream   # 1 lần

cd ~/Documents/Antigravity/kham-suc-khoe
cat > .env.r2 <<'EOF'                            # file này đã được gitignore
export R2_BUCKET=ksk-nct
export R2_ENDPOINT=https://<account_id>.r2.cloudflarestorage.com
export R2_ACCESS_KEY_ID=...
export R2_SECRET_ACCESS_KEY=...
EOF

source .env.r2
litestream replicate -config deploy/litestream.local.yml
# đợi ~30 giây cho dòng "snapshot written" rồi Ctrl+C là xong seed.
# (Mẹo: cứ để lệnh này chạy khi làm việc local — thành backup liên tục luôn.)
```

## Bước 3 — Render.com (5 phút, 1 lần)

1. https://render.com → đăng nhập bằng GitHub → **New + → Blueprint** →
   chọn repo `khoibmtn/kham-suc-khoe-bvtn` (đã có sẵn `render.yaml`).
2. Render hỏi 4 biến môi trường → dán 4 giá trị R2 ở Bước 1.
3. Deploy ~5 phút → có địa chỉ `https://ksk-nct.onrender.com`.
4. Từ nay **push GitHub = tự deploy** (autoDeploy đã bật trong render.yaml).
5. Đăng nhập admin → **đổi mật khẩu ngay** (menu Người dùng / Tài khoản).

## Giới hạn gói free cần biết

| Giới hạn | Ảnh hưởng | Cách xử lý |
|---|---|---|
| Ngủ sau ~15 phút không ai dùng | Lần mở đầu tiên chờ ~50 giây (DB tự khôi phục từ R2) | Chấp nhận, hoặc dùng dịch vụ ping miễn phí |
| RAM 512MB | Rà soát/dashboard/sinh hiệu chạy thoải mái; **xuất .xlsm 8 xã có thể thiếu RAM** | Xuất file trên máy Mac (xem dưới) |
| Server restart bất kỳ lúc nào | Mất phiên đăng nhập (đăng nhập lại); dữ liệu KHÔNG mất (Litestream) | — |

## Xuất file nộp Bộ trên máy Mac (khi cần)

```bash
cd ~/Documents/Antigravity/kham-suc-khoe && source .env.r2
# kéo bản DB MỚI NHẤT từ R2 về (ghi đè bản local):
litestream restore -o app/data/ksk.db -config deploy/litestream.local.yml app/data/ksk.db
./app/run.sh          # mở http://127.0.0.1:8000 -> màn hình Xuất file
```

## Phương án dự phòng: Hugging Face Spaces (cũng free, RAM 16GB)

Nếu sau này cần xuất .xlsm ngay trên server: tạo Space kiểu **Docker** trỏ vào
repo này (thêm `app_port: 8000` vào README metadata của Space), đặt 4 biến
R2_* trong Settings → Secrets. RAM 16GB free thừa sức xuất 8 xã. Nhược điểm:
auto-deploy từ GitHub phải qua 1 GitHub Action mirror (làm sau nếu cần).
