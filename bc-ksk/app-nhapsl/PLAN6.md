# PLAN6 — Giai đoạn 7 (nạp lại phiên bản mới) + 8 (deploy Vercel)

## GĐ7 — hợp đồng `src/lib/api-types.ts` mục "Phase 7"; quy tắc `docs/03-THIET-KE.md` mục 4 (BẮT BUỘC theo đúng bảng)
### T12 — Backend nạp lại (Sonnet)
1. `npm run import -- <gói mới>`: chạy thử in tóm tắt nạp lại (`TomTatNapLai`), `--apply` ghi trong một transaction; phiên bản cũ hơn/bằng → từ chối trừ `--force`.
2. Quy tắc hồ sơ chưa chạm / đã chạm / tham chiếu / vị trí / xác nhận / gỡ khỏi nguồn / thêm tay trùng — đúng bảng docs/03 mục 4; buổi khớp `ma_buoi` (cập nhật mô tả + DS google sheet, giữ phân công/trạng thái; buổi mới thêm; buổi mất chỉ cảnh báo).
3. Kịch bản H (docs/04) 1–6 là test vitest.
4. API upload `POST /api/import/thu|ghi`, `GET /api/import/lich-su` (admin), dùng chung `parseGoi` + `lapKeHoach/apDung`.
### T13 — Trang Admin "Nạp dữ liệu" (Antigravity)
5. `/admin/nap-du-lieu`: chọn 4 file (hoặc cả thư mục gói), Chạy thử → hiển thị lỗi/cảnh báo/tóm tắt; "Ghi dữ liệu" có hộp xác nhận nêu rõ hệ quả; lịch sử các lần nạp.

## GĐ8 — Vercel (docs/04 mục 5)
6. `vercel link`, Neon Postgres (Singapore), `DATABASE_URL`, `SESSION_SECRET`; `.vercelignore` chặn data/handoff; bản build không chứa CSV.
7. Migrate, nạp v1, tạo tài khoản trên DB production; Playwright/curl trên URL production: đăng nhập, mở một buổi, xác nhận, xuất báo cáo.
8. `docs/HUONG-DAN-SU-DUNG.md` 1 trang.
