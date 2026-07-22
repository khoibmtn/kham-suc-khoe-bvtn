# Nghiên cứu: chuyển KSK NCT sang chạy trên Vercel

> Kết luận ngắn: **CÓ THỂ, nhưng là một cuộc viết lại lớn tầng dữ liệu + mất
> vĩnh viễn chức năng Xuất .xlsm trên máy chủ.** Vercel là nền tảng ÍT phù hợp
> nhất với app này. Dưới đây là phân tích trung thực + con đường cụ thể nếu anh
> vẫn muốn làm.

## 1. Vì sao app hiện tại KHÔNG chạy thẳng trên Vercel

Vercel = **serverless functions**: mỗi request bật một hàm ngắn rồi tắt.
Hệ quả với app của mình:

| Đặc điểm app hiện tại | Vercel | Xử lý |
|---|---|---|
| SQLite ghi ra **file trên đĩa** | Đĩa serverless **tạm thời, mất sau mỗi request** | PHẢI đổi sang DB đám mây |
| **Xuất .xlsm** (mở template 1,3MB + subprocess mỗi xã, chạy vài phút, ghi file) | Timeout 10–60s, **không có subprocess, không đĩa bền** | Không chạy được — phải xuất ở nơi khác |
| Backup/snapshot theo ngày, litestream | Không có tiến trình chạy nền | Bỏ / thay bằng Vercel Cron |
| Import `build/` (275 rule ICD, concepts.json 316KB) lúc khởi động | Nạp lại mỗi lần "cold start" → chậm, dễ vượt giới hạn | Chỉ nạp khi cần (lazy) |
| Phiên đăng nhập cookie ký số | ✅ Hợp serverless (không cần trạng thái) | Giữ nguyên |

## 2. Kiến trúc Vercel khả thi

```
Trình duyệt ─► Vercel (FastAPI chạy serverless qua ASGI handler)
                   │
                   └─► Turso (libSQL) — DB đám mây TƯƠNG THÍCH SQLite
```

- **DB: dùng Turso (libSQL).** Đây là lựa chọn tốt nhất vì **libSQL = SQLite**,
  nên phần lớn câu SQL (kể cả FTS5 tra ICD) giữ được, không phải chuyển sang
  Postgres. Free tier rộng (9GB, ~1 tỉ lượt đọc/tháng). Truy cập qua HTTP nên
  hợp serverless.
  - Thay `sqlite3.connect(file)` bằng client libSQL (`libsql-client`), đổi cách
    lấy kết nối trong `backend/db.py` và MỌI chỗ `conn.execute(...)` ở các
    router (đây là phần nặng nhất — chạm gần như toàn bộ backend).
- **FastAPI trên Vercel:** thêm `api/index.py` xuất `app` (ASGI) + `vercel.json`
  định tuyến mọi request về đó. Frontend tĩnh phục vụ qua Vercel luôn.
- **Xuất .xlsm:** KHÔNG chạy trên Vercel. Vẫn xuất **trên máy cá nhân** như hiện
  tại (kéo DB từ Turso về rồi `run.sh` → màn Xuất file). Đây là mất mát cố hữu.

## 3. Khối lượng công việc (ước lượng thật)

| Việc | Mức độ |
|---|---|
| Đổi tầng dữ liệu `db.py` + toàn bộ `conn.execute` sang libSQL (có thể phải async) | **Lớn** — chạm mọi router |
| Viết `api/index.py` + `vercel.json` + đóng gói frontend | Vừa |
| Chuyển 13.326 hồ sơ + danh mục vào Turso (script migrate 1 lần) | Vừa |
| Tách chức năng Xuất .xlsm ra khỏi luồng serverless | Vừa |
| Xử lý cold-start nặng (lazy import `build/`) | Vừa |
| Kiểm thử lại toàn bộ trên môi trường serverless | Lớn |

→ Tương đương **vài đợt làm việc lớn**, và kết quả vẫn **thiếu chức năng xuất
file** trên máy chủ.

## 4. Khuyến nghị thẳng thắn

1. **Trước mắt dùng LAN** (đã dựng xong — xem `DEPLOY_LAN.md`): ổn định, nhanh,
   đủ chức năng kể cả xuất file, dữ liệu không rời cơ quan. Phù hợp nhất cho một
   đợt khám đang diễn ra.
2. **Nếu bắt buộc cần truy cập từ xa qua internet:** con đường tốn ít công và ổn
   hơn Vercel là một **VPS nhỏ** (hoặc Render trả phí ~$7) chạy y nguyên app này
   (SQLite + đĩa bền) — không phải viết lại gì. Vercel chỉ nên chọn nếu anh thực
   sự muốn hệ serverless và chấp nhận viết lại + mất chức năng xuất trên máy chủ.
3. Khi anh quyết theo Vercel, báo tôi — tôi sẽ lập plan chi tiết theo mục 2–3 ở
   trên rồi giao subagent thực hiện từng phần, migrate dữ liệu sang Turso, và
   giữ chức năng xuất file chạy ở máy cá nhân.
