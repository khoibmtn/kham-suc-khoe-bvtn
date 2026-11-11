# CLAUDE.md — App rà soát hồ sơ giấy KSK toàn dân 2026 (app-nhapsl)

Thư mục dự án: `/Users/buiminhkhoi/Documents/Antigravity/kham-suc-khoe/bc-ksk/app-nhapsl`

## Bối cảnh
- Trung tâm Y tế Thủy Nguyên (Hải Phòng) khám sức khỏe toàn dân cho người dân phường Thủy Nguyên, phường Lưu Kiếm, xã Việt Khê từ 07/9 đến 20/10/2026, tổng **12.003 người** theo sổ đoàn (60 buổi khám).
- Dữ liệu điện tử lệch với sổ đoàn (nhập nhầm ngày, thừa/thiếu, kết quả cận lâm sàng sao chép). Nhân viên cần **đối chiếu từng hồ sơ giấy** với danh sách điện tử, sửa theo giấy, ghi vết ai sửa gì.
- **Phân vai rõ ràng:**
  - **Cowork (Claude phía anh Khôi)** đọc dữ liệu gốc (HIS, phần mềm KSK, danh sách xét nghiệm), đối chiếu và **xuất danh sách cần rà soát** thành gói file theo đặc tả `nhapsl-import-1` (`docs/02-DAC-TA-DU-LIEU.md`). Có thể xuất nhiều phiên bản (v0 thử, v1 chính thức…).
  - **App** chỉ nạp gói đó, cho nhân viên rà soát, rồi xuất kết quả. **App không đọc file HIS/LIS/TT KSK gốc và không tự tính lại danh sách.**
- App dùng **2 ngày**, chỉ người có tài khoản (admin tạo) mới vào được. Người dùng: 8 nhân viên + 1 admin (BS Bùi Minh Khôi).

## Đọc theo thứ tự trước khi code
1. `docs/01-YEU-CAU.md` — yêu cầu nghiệp vụ (nguyên văn + diễn giải).
2. `docs/02-DAC-TA-DU-LIEU.md` — **hợp đồng dữ liệu nhập** (gói Cowork xuất) và **dữ liệu xuất** (cho Cowork đọc lại, báo cáo Excel). Đây là phần quan trọng nhất.
3. `docs/03-THIET-KE.md` — kiến trúc Vercel, mô hình dữ liệu, quy tắc nạp lại, API, bảo mật.
4. `docs/04-KE-HOACH-VA-NGHIEM-THU.md` — thứ tự build, số kiểm tra, kịch bản nghiệm thu, triển khai và gỡ bỏ.

## Quy tắc bắt buộc
- **Không bao giờ đưa thư mục `data/` hay `handoff/` vào git hoặc bản deploy** (có CCCD, họ tên người dân). `.gitignore` và `.vercelignore` đã chặn; không được gỡ. Dữ liệu chỉ vào CSDL qua lệnh import.
- Mọi trang và API (trừ trang đăng nhập) bắt buộc đăng nhập. Không có đăng ký tự do. Không log họ tên/CCCD ra console hay log Vercel.
- Giao diện 100% tiếng Việt có dấu. Ngày `dd/mm/yyyy`, số có dấu chấm ngăn nghìn (12.003).
- Không tự bịa dữ liệu. Trường nguồn để trống thì hiển thị trống, cho phép nhập tay.
- Mọi thao tác ghi đều ghi nhật ký (ai, lúc nào, hành động, trường, cũ → mới). Không xóa cứng hồ sơ.
- Thao tác không hoàn tác được (nạp lại dữ liệu, mở khóa danh sách, khóa user) phải có hộp thoại xác nhận.
- Tìm kiếm tiếng Việt không phân biệt dấu, hoa thường; "Thuỷ" = "Thủy".
- Chỉ có **8 cận lâm sàng**: CTM, Glucose, Urê, Creatinin, GOT, GPT, TPT nước tiểu, Siêu âm ổ bụng. Không thêm kỹ thuật khác.

## Lệnh (Claude Code tạo và giữ cập nhật)
- `npm install` · `npm run dev`
- `npm run db:migrate` — tạo/cập nhật schema trên Postgres (`DATABASE_URL`)
- `npm run import -- data/import/<phien_ban> [--dry-run]` — nạp gói dữ liệu Cowork (mặc định chạy thử, phải thêm `--apply` mới ghi)
- `npm run users:create` — tạo tài khoản từ `nguoi_dung.csv` của gói, sinh mật khẩu ngẫu nhiên, in ra **một lần** để admin phát cho nhân viên
- `npm run export:cowork` — xuất kết quả rà soát về `handoff/export/<YYYYMMDD-HHMM>/`
- `npm test`
- Production: https://ksk-ra-soat-2026.vercel.app (project Vercel `ksk-ra-soat-2026`, Neon `ksk-ra-soat-db` Singapore)
- Chạy lệnh quản trị với CSDL production: `vercel env pull .env.vercel.production --environment=production --yes` rồi `node scripts/prod-env.mjs <lệnh>` (vd `node scripts/prod-env.mjs npm run export:cowork`) — không in khóa ra màn hình
- Deploy: `vercel build --prod` → kiểm `.vercel/output` không có CSV/XLSX → `vercel deploy --prebuilt --prod` (xem `docs/04` mục 5)
- Đăng nhập: chọn tên từ danh sách, mật khẩu mặc định `123456` (anh Khôi chốt 11/11/2026, chấp nhận rủi ro vì app dùng 2 ngày)

## Giao tiếp với Cowork
- Gói dữ liệu Cowork đặt ở `data/import/<phien_ban>/`.
- Kết quả xuất cho Cowork: `handoff/export/<YYYYMMDD-HHMM>/`.
- Hỏi đáp, báo tiến độ: file `handoff/kenh-cowork/YYYYMMDD-HHMM-tieu-de.md`.
