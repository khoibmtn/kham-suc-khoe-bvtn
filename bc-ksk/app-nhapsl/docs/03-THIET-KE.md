# 03 — THIẾT KẾ KỸ THUẬT

## 1. Kiến trúc (đã chốt: triển khai Vercel, dùng 2 ngày)

| Thành phần | Lựa chọn |
|---|---|
| Khung | Next.js (App Router) + TypeScript, deploy Vercel, vùng chạy hàm `sin1` (Singapore) |
| CSDL | Postgres serverless — **Neon qua Vercel Marketplace**, vùng Singapore. ORM: Drizzle. Bật extension `unaccent`, `pg_trgm` |
| Xác thực | Bảng `users` riêng, mật khẩu băm bcrypt, phiên bằng cookie httpOnly + Secure + SameSite=Lax ký bằng `SESSION_SECRET` (jose/iron-session). Không dùng nhà cung cấp đăng nhập bên ngoài |
| Bảo vệ | `middleware.ts` chặn mọi route trừ `/dang-nhap` và `/api/auth/login`; giới hạn 10 lần đăng nhập sai/15 phút/username; header `X-Robots-Tag: noindex, nofollow`; `robots.txt` Disallow all |
| Bảng | TanStack Table + ảo hóa dòng |
| Excel | ExcelJS trong Route Handler (runtime Node.js, `maxDuration` 60s) |
| Nạp dữ liệu | Script Node chạy từ máy anh Khôi, kết nối thẳng `DATABASE_URL` (không qua giới hạn 4,5 MB body của Vercel). Trang Admin nạp qua giao diện: tải từng file, server đọc theo lô |
| Kiểm thử | Vitest (logic nạp lại, chỉ số), Playwright (luồng chính) |

Biến môi trường: `DATABASE_URL`, `SESSION_SECRET` (≥ 32 ký tự ngẫu nhiên), `APP_TIMEZONE=Asia/Ho_Chi_Minh`.

Không commit/deploy `data/`, `handoff/`, `db/` (đã có `.gitignore`, `.vercelignore`).

## 2. Mô hình dữ liệu (Postgres)

```
users(id, username UNIQUE, ho_ten, role CHECK IN ('admin','nhan_vien'), password_hash,
      active BOOL, created_at, last_seen_at)

import_batches(id, phien_ban UNIQUE, manifest JSONB, tom_tat JSONB, che_do ('lan_dau'|'nap_lai'),
               nap_boi, nap_luc)

buoi_kham(id, ma_buoi UNIQUE, don_vi, ten_don_vi, ngay_kham DATE, diem_kham, doan_kham, nv_goi_y,
          so_doan_tong, so_doan JSONB,                 -- các cột so_doan_* khác
          phu_trach_user_id NULL,
          trang_thai CHECK IN ('chua_ra_soat','dang_ra_soat','da_xac_nhan'),
          xac_nhan_by, xac_nhan_at, giai_trinh, nguon ('cowork'|'admin_them'))

ho_so(id, ma_ho_so UNIQUE NULL,                       -- NULL với hồ sơ thêm tay
      nguon CHECK IN ('cowork','them_tay'),
      trang_thai_nguon CHECK IN ('co_trong_goi','da_go_khoi_goi'),
      version INT,                                    -- khóa lạc quan
      -- giá trị hiện hành (hiển thị, sửa được)
      ma_kcb, ho_ten, ho_ten_kd,                      -- ho_ten_kd = bỏ dấu, chữ thường
      gioi_tinh, nam_sinh, cccd, so_the_bhyt, so_dt, dia_chi_chi_tiet,
      ctm, glucose, ure, creatinin, got, gpt, tpt_nuoc_tieu, sieu_am,   -- SMALLINT 0/1
      -- giá trị theo gói nhập mới nhất (chỉ import sửa)
      src JSONB,         -- {ma_kcb, ho_ten, gioi_tinh, nam_sinh, cccd, dia_chi_chi_tiet, cls:{…8}}
      dia_chi_the, ngay_gio_dang_ky_his, cls_ghi_chu, co_tt_ksk, so_ksk, ky_so,
      ket_luan_phan_loai, canh_bao TEXT[], ghi_chu_cowork, don_vi_goi_y,
      -- cờ "người rà soát đã chạm" (quyết định nạp lại có được ghi đè hay không)
      sua_nhan_than BOOL, sua_cls BOOL, da_di_chuyen BOOL,
      -- vị trí
      vi_tri CHECK IN ('buoi','kho_ca_nhan','kho_chung','an'),
      buoi_id NULL, kho_user_id NULL, ma_buoi_ban_dau,
      -- xác nhận
      da_xac_nhan BOOL, xac_nhan_by, xac_nhan_at,
      ghi_chu, created_by, created_at, updated_by, updated_at)
  CHECK vị trí nhất quán: buoi ⇔ buoi_id NOT NULL; kho_ca_nhan ⇔ kho_user_id NOT NULL; kho_chung/an ⇔ cả hai NULL
  INDEX: (buoi_id), (vi_tri), (ma_kcb), (cccd), (nam_sinh), GIN trigram (ho_ten_kd), (ma_ho_so)

nhat_ky(id, at, user_id, hanh_dong, doi_tuong, doi_tuong_id, truong, gia_tri_cu, gia_tri_moi, ghi_chu)
de_nghi_chuyen(id, ho_so_id, tu_user_id, den_buoi_id, ly_do, trang_thai, xu_ly_by, xu_ly_at)
```

## 3. Quy tắc nghiệp vụ (kiểm ở server)
1. Nhân viên chỉ ghi được hồ sơ ở buổi mình phụ trách hoặc trong kho cá nhân của mình; với kho chung chỉ được "nhận về". Admin làm được mọi thứ.
2. Hồ sơ đã xác nhận không chuyển được (phải bỏ xác nhận trước).
3. Buổi `da_xac_nhan`: mọi ghi vào hồ sơ thuộc buổi, chuyển vào/ra bị từ chối (HTTP 423). Admin mở khóa (bắt buộc lý do).
4. Trạng thái buổi: `chua_ra_soat` khi chưa có hồ sơ xác nhận; `dang_ra_soat` khi có ≥ 1; `da_xac_nhan` khi người phụ trách bấm xác nhận danh sách.
5. Xác nhận danh sách: mọi hồ sơ `vi_tri='buoi'` của buổi phải đã xác nhận; nếu số hồ sơ ≠ `so_doan_tong` bắt buộc giải trình.
6. Sửa hồ sơ gửi kèm `version`; lệch → HTTP 409, giao diện báo "Hồ sơ vừa được người khác sửa, tải lại".
7. Sửa trường nhân thân → `sua_nhan_than = true`; sửa ô CLS → `sua_cls = true`; chuyển chỗ (kho, buổi khác, nhận về) → `da_di_chuyen = true`; tích xác nhận không đổi các cờ này.
8. Thêm hồ sơ: kiểm trùng toàn app (CCCD; hoặc mã KCB; hoặc `ho_ten_kd` + `nam_sinh`). Có trùng → hiện hồ sơ trùng đang ở đâu, gợi ý nhận về; muốn tạo mới phải ghi lý do. Hồ sơ thêm tay: `nguon='them_tay'`, `ma_ho_so` NULL, `src` NULL, tự xác nhận.

## 4. Nạp dữ liệu và nạp lại (cốt lõi — có test riêng)
Bước chung: đọc gói → kiểm `schema`, sha256, cột bắt buộc, giá trị hợp lệ, tổng trong manifest → **chạy thử** sinh tóm tắt → người nạp xác nhận → ghi trong **một transaction** → lưu `import_batches` + nhật ký `import`.

**Lần đầu** (chưa có `import_batches`): tạo buổi, hồ sơ (`vi_tri` = `vi_tri_ban_dau`, `ma_buoi_ban_dau` = `ma_buoi`), giá trị hiện hành = giá trị trong gói, `src` = giá trị trong gói.

**Nạp lại** (phiên bản mới hơn):
- Buổi: khớp `ma_buoi`. Có → cập nhật mô tả, sổ đoàn (giữ phân công, trạng thái). Mới → thêm. Buổi cũ không còn trong gói → giữ nguyên, ghi cảnh báo trong tóm tắt (không xóa).
- Hồ sơ khớp `ma_ho_so`:

| Trường | Hồ sơ chưa chạm (cờ tương ứng = false) | Hồ sơ đã chạm |
|---|---|---|
| Nhân thân | ghi đè bằng giá trị mới | giữ giá trị người rà soát; chỉ cập nhật `src` |
| 8 cờ CLS | ghi đè | giữ; cập nhật `src.cls`; nếu khác → thêm cảnh báo `NGUON_DOI_SAU_RA_SOAT` |
| Tham chiếu (`co_tt_ksk`, `canh_bao`, `cls_ghi_chu`, `ky_so`, `dia_chi_the`, …) | luôn ghi đè | luôn ghi đè |
| Vị trí | nếu `da_di_chuyen = false` và hồ sơ chưa xác nhận → theo `vi_tri_ban_dau`/`ma_buoi` mới (không chuyển vào buổi đã khóa; khi đó để kho chung và ghi chú) | giữ nguyên |
| `da_xac_nhan` | giữ | giữ; nếu nhân thân/CLS nguồn đổi → thêm cảnh báo để người rà soát xem lại (không tự bỏ xác nhận) |

- Hồ sơ mới (mã chưa có) → thêm theo `vi_tri_ban_dau`.
- Hồ sơ có trong CSDL nhưng không có trong gói mới (`nguon='cowork'`): nếu chưa xác nhận và chưa chạm → `vi_tri='an'`, `trang_thai_nguon='da_go_khoi_goi'`; nếu đã xác nhận hoặc đã chạm → giữ nguyên chỗ, `trang_thai_nguon='da_go_khoi_goi'`, thêm cảnh báo `DA_GO_KHOI_NGUON`.
- Hồ sơ thêm tay: không bao giờ bị nạp lại động tới. Nếu hồ sơ thêm tay trùng (CCCD hoặc mã KCB) với hồ sơ mới trong gói → tóm tắt liệt kê để admin xử lý tay (gộp: giữ hồ sơ thêm tay, đưa hồ sơ gói vào `an`).
- Tóm tắt chạy thử phải in: số buổi thêm/cập nhật; số hồ sơ thêm mới / cập nhật / giữ do đã chạm / chuyển vị trí / gỡ khỏi nguồn; danh sách hồ sơ đã xác nhận có nguồn thay đổi; so sánh tổng theo đơn vị trước–sau.

## 5. Chỉ số (thống nhất cho dashboard và báo cáo)
Cho tập buổi B: `so_doan` = Σ so_doan_tong; `hien_co` = số hồ sơ `vi_tri='buoi'` thuộc B; `da_xac_nhan`; `chua_xac_nhan` = hien_co − da_xac_nhan; theo từng buổi `thua` = max(0, hien_co − so_doan), `thieu` = max(0, so_doan − hien_co), tổng nhiều buổi cộng từng buổi (không bù trừ) và hiện thêm chênh lệch ròng; `bo_sung` = hồ sơ thêm tay + hồ sơ nhận từ kho chung vào B; `tien_do_%` = da_xac_nhan / hien_co × 100.
Báo cáo: "Tổng số người khám" = số hồ sơ đã xác nhận; "Số người được chỉ định CLS x" = số hồ sơ đã xác nhận có cờ x = 1 (giá trị hiện hành); "Số hồ sơ có trong TT KSK" = số hồ sơ đã xác nhận có `co_tt_ksk = 1`.

## 6. API (Route Handlers, tiền tố `/api`)
- Auth: `POST /auth/login`, `POST /auth/logout`, `POST /auth/doi-mat-khau`, `GET /auth/me`
- `GET /buoi?don_vi=&user=&trang_thai=` · `GET /buoi/:id/ho-so?q=&xac_nhan=&ctm=&…&canh_bao=&nguon=&da_sua=`
- `POST /buoi/:id/xac-nhan` · `POST /buoi/:id/mo-khoa` (admin) · `PATCH /buoi/:id` · `POST /buoi` (admin)
- `PATCH /ho-so/:id` · `POST /ho-so/:id/xac-nhan` · `POST /ho-so/:id/bo-xac-nhan` · `POST /ho-so/:id/chuyen` · `POST /ho-so/:id/nhan-ve` · `GET /ho-so/:id/lich-su` · `POST /buoi/:id/ho-so` (thêm)
- `GET /tim-kiem?q=&pham_vi=buoi|cua_toi|kho_chung|tat_ca` · `GET /kho-ca-nhan` · `GET /kho-chung`
- `POST /de-nghi-chuyen` · `POST /de-nghi-chuyen/:id/xu-ly`
- `GET /dashboard/toi` · `GET /dashboard/admin`
- Admin: `/users` (CRUD, đặt lại mật khẩu), `POST /phan-cong`, `POST /phan-cong/theo-goi-y`, `POST /import/thu`, `POST /import/ghi`, `GET /import/lich-su`
- `GET /export/bao-cao.xlsx?chi_da_xac_nhan=1&don_vi=` · `GET /export/cowork.zip`

## 7. Màn hình
1. Đăng nhập. 2. Dashboard của tôi. 3. Rà soát danh sách: chọn Đơn vị → Ngày; thanh chỉ số `Sổ đoàn | Trong danh sách | Đã xác nhận x/y | Thừa | Thiếu`; ô tìm; bộ lọc (trạng thái, 8 CLS 3 trạng thái, cảnh báo, nguồn, đã sửa); bảng; khung chi tiết bên phải (sửa nhân thân, lịch sử, chuyển); Thêm hồ sơ; Xác nhận danh sách. 4. Kho chờ cá nhân. 5. Kho chờ chung. 6. Tìm toàn app. 7. Admin: tổng quan, phân công, buổi khám, người dùng, nạp dữ liệu, xuất, nhật ký, đề nghị chuyển.

Bảng hồ sơ: 8 ô CLS vuông lớn, nhãn CTM · GLU · URE · CRE · GOT · GPT · NT · SA, rê chuột hiện tên đầy đủ + `cls_ghi_chu`; ô khác `src` viền cam; dòng đã xác nhận nền xanh nhạt; cảnh báo dạng nhãn nhỏ. Phím tắt: ↑/↓ chọn dòng, Space xác nhận, 1–8 bật/tắt CLS.
