# PLAN1 — Giai đoạn 1 (docs/04 mục 1)

Phạm vi: khung Next.js, schema Postgres, lệnh `import` (lần đầu + chạy thử), `users:create`, đăng nhập, proxy (middleware), nhật ký.
Xong khi: nạp **`v1-20261111-1400`** (bản giao nhân viên) ra đúng số ở docs/04 mục 2: 60 buổi, 12.003 trong buổi (TN 4.016, LK 7.147, VK 840), 419 kho chung, tổng 12.422, CLS CTM 628 · Glucose 3.077 · Urê 1.768 · Creatinin 1.763 · GOT 2.050 · GPT 2.049 · NT 222 · SA 6.448. Giới tính "Khác"/trống → để trống (migration 0002).

## Đã có (orchestrator dựng, KHÔNG sửa trừ khi brief cho phép)
- Next.js 16.4 App Router + TS, `src/`. **Next 16 đổi `middleware.ts` → `src/proxy.ts`** (đọc `node_modules/next/dist/docs/01-app/01-getting-started/16-proxy.md`).
- `src/db/migrations/0001_init.sql` (nguồn gốc DDL) · `src/db/schema.ts` (Drizzle mirror) · `src/db/client.ts` (`getSql()` postgres.js, `getDb()` drizzle, `closeDb()`).
- `src/lib/text.ts` `khongDau()` · `src/lib/cls.ts` (8 CLS, đơn vị, nhãn cảnh báo) · `src/lib/nhat-ky.ts` `ghiNhatKy()`.
- `scripts/migrate.ts` (`npm run db:migrate`), `scripts/_env.ts` (nạp `.env.local`).
- DB local: `nhapsl_dev` (app), `nhapsl_test` (vitest), `nhapsl_import` (chạy tay import). URL trong `.env.local`.

## Tiêu chí nghiệm thu (yes/no)
### T1 — Import (subagent Sonnet) — brief `handoff/tasks/T1-import.md`
1. `npm run import -- data/import/v0-20261111-thu` (không cờ) = chạy thử: in tóm tắt, **không ghi** gì vào DB.
2. `--apply` ghi trong **một transaction**: 60 buổi (TN 25, LK 31, VK 4), Σ so_doan_tong 12.003 (TN 4.016, LK 7.147, VK 840).
3. 12.071 hồ sơ `vi_tri='buoi'` (TN 4.044, LK 7.179, VK 848) + 351 `kho_chung`, tổng 12.422.
4. Buổi mẫu: TN-20260907 81/78, TN-20260922 254/272, LK-20261015 323/333, VK-20261019 300/306 (sổ đoàn / hiện có).
5. Tổng 8 CLS trong buổi theo đơn vị khớp manifest (vd TN glucose 1.251, LK siêu âm 3.078, VK CTM 14).
6. 9 user trong bảng `users` (chưa có mật khẩu nếu users:create chưa chạy); không đổi user đã có.
7. Kiểm gói: sai `schema` / sai sha256 / thiếu cột bắt buộc / giá trị sai (gioi_tinh, cờ 0/1, ma_buoi không tồn tại, ma_ho_so trùng) / tổng manifest lệch → từ chối, in rõ lỗi, không ghi gì. Cột thừa → cảnh báo.
8. Đã nạp lần đầu rồi mà chạy lại → từ chối với thông báo "nạp lại thuộc GĐ7" (trừ khi phiên bản cũ hơn → từ chối vì cũ hơn). Ghi `import_batches` + 1 dòng `nhat_ky` hanh_dong='import'.
9. `src_*`: `src` JSONB = giá trị gói; `ho_ten_kd = khongDau(ho_ten)`; CCCD/mã KCB giữ số 0 đầu; `ngay_kham` đúng ngày (không lệch múi giờ).
10. `npm test` xanh (vitest, dùng `TEST_DATABASE_URL`), có test cho mục 7.
11. Không log họ tên/CCCD ra console (chỉ số đếm, mã buổi, mã hồ sơ).

### T2 — Xác thực (Antigravity) — brief `handoff/tasks/T2-auth.md`
12. `/dang-nhap` (tiếng Việt) đăng nhập username+mật khẩu; sai → thông báo chung; 10 lần sai/15 phút/username → khóa tạm, báo rõ.
13. Cookie phiên httpOnly, SameSite=Lax, Secure khi production, ký bằng `SESSION_SECRET` (jose HS256); hết hạn sau 12 giờ không hoạt động (gia hạn trượt).
14. `src/proxy.ts`: chưa đăng nhập → trang chuyển `/dang-nhap?next=…`, API trả 401 JSON; trừ `/dang-nhap`, `/api/auth/login`, `/robots.txt`, tài nguyên tĩnh. Mọi phản hồi có `X-Robots-Tag: noindex, nofollow`; `public/robots.txt` Disallow all.
15. API: `POST /api/auth/login`, `POST /api/auth/logout`, `GET /api/auth/me`, `POST /api/auth/doi-mat-khau` (≥ 8 ký tự, cần mật khẩu cũ). Helper `requireUser()` / `requireAdmin()` kiểm DB (active, session_version) cho route handler về sau.
16. User bị khóa (`active=false`) hoặc đã đổi/đặt lại mật khẩu (session_version tăng) → phiên cũ bị từ chối.
17. Ghi nhật ký: dang_nhap, dang_nhap_that_bai, dang_xuat, doi_mat_khau.
18. `npm run users:create -- data/import/v0-20261111-thu`: tạo user chưa có + cấp mật khẩu ngẫu nhiên cho user chưa có mật khẩu; in bảng username/mật khẩu **một lần**; không đổi mật khẩu user đã có; tùy chọn `--out <file>` ghi ra file (dùng cho `handoff/`).
19. Trang chủ `/` tối thiểu sau đăng nhập: chào họ tên, vai trò, nút Đổi mật khẩu, Đăng xuất (GĐ2 sẽ thay bằng dashboard).

### Chung
20. `npx tsc --noEmit` và `npm run lint` sạch; `npm run build` thành công.
21. `.gitignore`/`.vercelignore` vẫn chặn `data/`, `handoff/`, `db/`, `*.csv`, `*.xlsx`, `.env*`.
