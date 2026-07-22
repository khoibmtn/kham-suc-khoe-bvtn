# PLAN — Ứng dụng quản lý & rà soát KSK NCT (theo SPEC.md)

> Toàn bộ code ứng dụng nằm trong `app/`. KHÔNG sửa `build/`, `doc/`, `output/`.
> Nguồn nạp: `output/KSK_DuLieuQuanLy_TOANBO.xlsx` + danh mục từ `doc/Import_KSK_Tren 18.xlsm`.

## Kiến trúc

- **Backend:** Python 3 + FastAPI + SQLite (file `app/data/ksk.db`), uvicorn.
- **Frontend:** SPA vanilla JS (không build step, không CDN — chạy offline được),
  phục vụ tĩnh bởi FastAPI. Ưu tiên bàn phím tuyệt đối.
- **Tái dùng `build/`:** `sys.path` trỏ về `../build`; gọi `build_xlsm.write_xlsm`,
  `classify.py`, `mapper.py` — không viết lại pipeline.
- **Xuất .xlsm:** gọi subprocess theo xã (pattern `build_xlsm.py --xa`), copy
  template + `keep_vba=True`, `wb.close()` + `gc.collect()` sau mỗi file.

## Cấu trúc thư mục

```
app/
  PLAN.md, CRITERIA.md, README.md
  requirements.txt
  run.sh                      # khởi động: import nếu chưa có DB → uvicorn
  backend/
    main.py                   # FastAPI, mount static, routers
    config.py                 # đường dẫn ../output, ../doc, ../build, DB path
    db.py                     # kết nối SQLite, schema.sql, migrations nhẹ
    schema.sql                # DDL đúng §2 SPEC
    import_data.py            # nạp 4 sheet + danh mục, idempotent, tính cờ
    auth.py                   # đăng nhập session cookie, pbkdf2 hash
    services/
      fuzzy.py                # bỏ dấu + rapidfuzz/SequenceMatcher ≥0.75
      qc.py                   # tính lại cờ QC, bất biến QĐ1613
      the_luc.py              # BMI + gợi ý phân loại thể lực QĐ1613 II.1.2
    routers/
      ho_so.py                # list/filter/detail/PATCH (autosave + nhat_ky)
      benh.py                 # CRUD bảng bệnh, đổi bệnh chính
      phan_cong.py            # phân công xa/khoang_ma/danh_sach
      nguoi_dung.py           # admin quản lý cán bộ
      icd.py                  # autocomplete dm_icd_fts (index cả mã trần)
      xuat_file.py            # job xuất nền + file kê
      dashboard.py            # GET-only thống kê §8
      sinh_hieu.py            # nhập nhanh 6 ô + import Excel
  frontend/
    index.html  app.js  app.css
    (màn hình: đăng nhập, danh sách, chi tiết 103 trường 6 nhóm,
     xuất file, dashboard, sinh hiệu, phân công)
  data/                       # ksk.db + backups/ (gitignore-able)
```

## Thứ tự thực hiện (Verified Loop: Analyst ✅ → Implement → Verify → Correct)

| Phase | Nội dung | Nghiệm thu chính |
|---|---|---|
| P0 | Scaffold, schema §2, `import_data.py`, danh mục, cờ tự tính | 6 truy vấn §8.6 khớp: 13326 / 39645 / (1,421,2012,5651,5241) / 139 / 1654 / 138; CCCD_TRUNG 69 số-139 ca; THIEU_SINH_HIEU 13326 |
| P1 | Rà soát: auth, phân công, danh sách (9 bộ lọc, fuzzy, phím tắt), chi tiết 103 trường (6 nhóm, autosave onBlur → nhat_ky, widget theo §5, bất biến QĐ1613, trường suy viền vàng→xanh) | 10 tiêu chí P1 trong CRITERIA.md |
| P2 | Xuất file: 7 ràng buộc §7.1, màn hình phạm vi + cảnh báo cờ đỏ + cột mở rộng (mặc định tắt), file kê, cập nhật da_xuat_file | 10 tiêu chí P2 |
| P3 | Dashboard §8 (5 khối, GET-only, snapshot baseline lúc nạp) | 8 tiêu chí P3 |
| P4 | Sinh hiệu: nhập nhanh 6 ô/người, import Excel khớp CCCD→(họ tên+ngày), BMI tự tính, gợi ý thể lực phải xác nhận, gỡ cờ THIEU_SINH_HIEU | 7 tiêu chí P4 |

## Quyết định cho các điểm SPEC chưa nêu rõ

- **Đăng nhập:** session cookie + `hashlib.pbkdf2_hmac` (không thêm dependency);
  tài khoản `admin/admin123` tạo sẵn lần nạp đầu, bắt đổi mật khẩu thủ công.
- **Xuất file:** chạy **nền** (background job) + polling tiến độ, vì 8 xã ×
  subprocess không thể chờ đồng bộ.
- **Đường cờ đỏ theo ngày (§8.4):** bảng snapshot `snapshot_ngay` ghi mỗi ngày
  1 dòng (job lúc khởi động + khi có thay đổi ngày mới); baseline lưu lúc nạp.
- **Sao lưu:** copy `ksk.db` → `app/data/backups/YYYY-MM-DD.db` mỗi lần khởi
  động server, giữ 30 bản gần nhất.

## Bẫy phải né (từ SPEC §10)

- ICD index cả dạng gốc `E11.4†` lẫn mã trần `E11.4`.
- Tên bệnh luôn lấy **nguyên văn** từ `dmicdme` — không tự soạn.
- Xuất .xlsm: copy template, không tạo workbook mới; tách theo xã.
- `MA_HO_SO` là khóa — không dùng CCCD.
- Giữ nguyên `chan_doan_goc`, `benh.chuoi_goc` (chỉ đọc).
- Mọi thay đổi ghi `nhat_ky`.
