// API contract for phase 2 (PLAN2.md). Shared by route handlers and client pages.
// All JSON is snake_case. Dates: ngay_kham 'yyyy-mm-dd'; timestamps ISO strings.
// Errors: { error: string (Vietnamese) } with HTTP 400/401/403/404/409/423.
import type { ClsKey } from './cls';

export type ClsMap = Record<ClsKey, 0 | 1>;
export type TrangThaiBuoi = 'chua_ra_soat' | 'dang_ra_soat' | 'da_xac_nhan';

export type UserNgan = { id: number; username: string; ho_ten: string };

/** One exam session with metrics (docs/03 mục 5). */
export type BuoiTomTat = {
  id: number;
  ma_buoi: string;              // 'TN-20260907'
  don_vi: 'TN' | 'LK' | 'VK';
  ten_don_vi: string;
  ngay_kham: string;            // 'yyyy-mm-dd'
  diem_kham: string;
  doan_kham: string;
  nv_goi_y: string;
  so_doan_tong: number;
  phu_trach: UserNgan | null;
  trang_thai: TrangThaiBuoi;
  xac_nhan_by: UserNgan | null;
  xac_nhan_at: string | null;
  giai_trinh: string | null;
  hien_co: number;              // ho_so vi_tri='buoi' in this session
  da_xac_nhan: number;
  chua_xac_nhan: number;        // hien_co - da_xac_nhan
  thua: number;                 // max(0, hien_co - so_doan_tong)
  thieu: number;                // max(0, so_doan_tong - hien_co)
  bo_sung: number;              // nguon='them_tay' OR nhan_tu_kho_chung, in this session
  tien_do: number;              // da_xac_nhan / hien_co * 100, 0 when hien_co = 0 (1 decimal)
  /** Current user may edit records of this session (admin or assignee, and not locked). */
  co_quyen_sua: boolean;
};

/** Values as in the latest imported package (null for manually added records). */
export type HoSoSrc = {
  ma_kcb: string; ho_ten: string; gioi_tinh: string; nam_sinh: number;
  cccd: string; dia_chi_chi_tiet: string; cls: ClsMap;
};

export type HoSoDong = {
  id: number;
  version: number;              // optimistic lock — send back on every write
  ma_ho_so: string | null;
  nguon: 'cowork' | 'them_tay';
  ma_kcb: string;
  ho_ten: string;
  gioi_tinh: 'Nam' | 'Nữ' | '';
  nam_sinh: number;
  cccd: string;
  so_dt: string;                // Phase 12: '' when stored value is '0' or empty
  canh_bao_so: string[];        // Phase 12: messages from kiem-so.ts (e.g. 'Mã KCB có dạng số CCCD')
  dia_chi_chi_tiet: string;
  cls: ClsMap;
  src: HoSoSrc | null;
  // secondary (reference) info
  dia_chi_the: string;
  ngay_gio_dang_ky_his: string; // 'dd/mm/yyyy HH:MM' or ''
  cls_ghi_chu: string;
  co_tt_ksk: 0 | 1;
  canh_bao: string[];           // codes; labels in CANH_BAO_NHAN (src/lib/cls.ts)
  ghi_chu: string;
  ghi_chu_cowork: string;
  sua_nhan_than: boolean;
  sua_cls: boolean;
  nhan_tu_kho_chung: boolean;
  da_xac_nhan: boolean;
  xac_nhan_by: UserNgan | null;
  xac_nhan_at: string | null;
  updated_at: string;
};

// ---- Requests / responses ----
// GET  /api/buoi?don_vi=TN&phu_trach=<user_id|'none'>&trang_thai=…   → { buoi: BuoiTomTat[] }
//      staff: only sessions assigned to them; admin: all (filters optional). Sorted by don_vi (TN,LK,VK), ngay_kham.
//      ?tat_ca=1 (phase 4): ALL sessions for any user (target picker for 'chuyển sang buổi khác'); co_quyen_sua as usual.
// GET  /api/buoi/:key            (key = numeric id or ma_buoi)        → { buoi: BuoiTomTat }   staff not assignee → 403
// GET  /api/buoi/:key/ho-so                                            → { buoi: BuoiTomTat, ho_so: HoSoDong[] } (ORDER BY id)
// PATCH /api/ho-so/:id   body HoSoSuaBody                              → { ho_so: HoSoDong }
// POST /api/ho-so/:id/xac-nhan     body { version }                    → { ho_so: HoSoDong, buoi: BuoiTomTat }
// POST /api/ho-so/:id/bo-xac-nhan  body { version }                    → { ho_so: HoSoDong, buoi: BuoiTomTat }
// GET  /api/ho-so/:id/lich-su                                          → { lich_su: NhatKyDong[] }
//   409 body: { error: 'Hồ sơ vừa được người khác sửa, tải lại', ho_so: HoSoDong }  (current server copy)
//   423 body: { error: 'Danh sách đã xác nhận (khóa), không sửa được' }
// Admin only:
// GET  /api/users                                                     → { users: UserQuanLy[] }
// POST /api/users          body { username, ho_ten, role }            → { user: UserQuanLy }  (password = 123456)
// PATCH /api/users/:id     body { ho_ten?, role?, active? }           → { user: UserQuanLy }
// POST /api/users/:id/dat-lai-mat-khau                                → { ok: true }  (password = 123456)
// POST /api/phan-cong      body { buoi_ids: number[], user_id: number | null } → { so_buoi: number }
// POST /api/phan-cong/theo-goi-y  body { ghi_de?: boolean }           → { da_gan: number, bo_qua: string[] }
//      ghi_de=false (default): only sessions without assignee. Unknown nv_goi_y → listed in bo_qua.
// PATCH /api/buoi/:key     body { diem_kham?, doan_kham?, so_doan_tong? } → { buoi: BuoiTomTat }
// POST /api/buoi           body { don_vi, ngay_kham, diem_kham?, doan_kham?, so_doan_tong } → { buoi: BuoiTomTat }

// ---- Phase 3: search (PLAN3.md) ----
// GET /api/tim-kiem?q=<text>&pham_vi=buoi|cua_toi|kho_chung|tat_ca[&buoi=<id|ma_buoi>]
//   q: free text, split on whitespace, every token must match (AND). Vietnamese-insensitive.
//   pham_vi=buoi requires `buoi` (staff: must be assignee → else 403). cua_toi = sessions assigned to me
//   (admin: all sessions). kho_chung = shared pool. tat_ca = whole app (staff may search; results are read-only).
//   q shorter than 2 chars after trim → 400. ORDER BY don_vi (TN,LK,VK), ngay_kham, id.
//   Limit: pham_vi=buoi → no limit (whole session); other scopes → 200.
//   → { ket_qua: KetQuaTimKiem[], tong: number, gioi_han: number | null }   (tong = total matches before the limit)
// Token matching (after khongDau + lowercase; tokens AND-ed):
//   letters only      → a word of ho_ten_kd starts with the token ("ng van an", "thuy" matches Thủy/Thuỷ)
//   exactly 4 digits  → nam_sinh = token OR cccd/ma_kcb/so_dt/so_the_bhyt contains token
//   ≥ 5 digits        → cccd/ma_kcb/so_dt/so_the_bhyt contains token
//   1–3 digits        → ignored (too broad)
//   letters + digits  → so_the_bhyt or ma_kcb contains token (case-insensitive)
export type KetQuaTimKiem = HoSoDong & {
  vi_tri: 'buoi' | 'kho_ca_nhan' | 'kho_chung' | 'an';
  buoi: { id: number; ma_buoi: string; don_vi: 'TN' | 'LK' | 'VK'; ngay_kham: string; phu_trach: UserNgan | null } | null;
  kho_cua: UserNgan | null;     // owner when vi_tri = 'kho_ca_nhan'
  don_vi_goi_y: string;
  co_quyen_sua: boolean;        // same rule as BuoiTomTat.co_quyen_sua for the record's location
  chuyen?: ThongTinChuyen;      // phase 4: last move info (present on pool endpoints)
};

// ---- Phase 4: move / pools / add / list confirmation (PLAN4.md) ----
// Where a record was moved from (set on every move; shown in pools).
export type ThongTinChuyen = { tu: string; boi: UserNgan | null; luc: string | null; ly_do: string } | null;
//   KetQuaTimKiem gains: chuyen: ThongTinChuyen
//
// POST /api/ho-so/:id/chuyen   body ChuyenBody → { ho_so: KetQuaTimKiem, buoi_cu: BuoiTomTat | null, buoi_moi: BuoiTomTat | null }
//   Source must be writable by user (own session / own personal pool / admin). Confirmed record → 400
//   'Bỏ xác nhận trước khi chuyển'. Source or target session locked → 423. den='buoi' requires ly_do (400) and any
//   session (may belong to someone else). den='kho_ca_nhan' = the CURRENT user's pool. Sets da_di_chuyen=true,
//   chuyen_* fields; audit 'chuyen' truong='vi_tri' cũ→mới (e.g. 'TN-20260907' → 'kho_chung'), ghi_chu=ly_do.
// POST /api/ho-so/:id/nhan-ve  body { version, buoi } → same response shape
//   From kho_chung (any user) or own kho_ca_nhan (admin: any) into a session the user is in charge of (admin: any),
//   not locked. From kho_chung → nhan_tu_kho_chung=true. Audit 'nhan_ve'.
// GET  /api/kho-ca-nhan[?user=<id> admin only]          → { ho_so: KetQuaTimKiem[] }
// GET  /api/kho-chung?don_vi=&q=                         → { ho_so: KetQuaTimKiem[], tong: number }
//   q optional (same token rules as /api/tim-kiem); don_vi filters on don_vi_goi_y. No limit (pool ≈ 400).
// POST /api/ho-so/kiem-trung   body { ma_kcb?, cccd?, ho_ten?, nam_sinh? } → { trung: KetQuaTimKiem[] }
//   Duplicate if same non-empty cccd, OR same non-empty ma_kcb, OR same khongDau(ho_ten) + nam_sinh. Excludes vi_tri='an'.
// POST /api/buoi/:key/ho-so    body ThemHoSoBody → { ho_so: HoSoDong, buoi: BuoiTomTat }
//   Needs write access to the session (not locked). If duplicates exist and !ly_do_tao_moi → 409
//   { error: 'Có hồ sơ trùng', trung: KetQuaTimKiem[] }. Creates nguon='them_tay', ma_ho_so NULL, src NULL,
//   da_xac_nhan=true (by user, now), audit 'them_ho_so' (ghi_chu = ly_do_tao_moi when given).
// POST /api/buoi/:key/xac-nhan body { giai_trinh? } → { buoi: BuoiTomTat }
//   Assignee or admin. Every vi_tri='buoi' record confirmed, else 400 'Còn N hồ sơ chưa xác nhận'. hien_co ≠
//   so_doan_tong → giai_trinh required (400). Sets trang_thai='da_xac_nhan', xac_nhan_by/at, giai_trinh. Audit.
// POST /api/buoi/:key/mo-khoa  body { ly_do } (admin) → { buoi } ; ly_do required; trang_thai recomputed. Audit.
// POST /api/de-nghi-chuyen     body { ho_so_id, den_buoi, ly_do } → { de_nghi: DeNghiChuyen }
//   Any user, for a record they can NOT write (in someone else's session); den_buoi must be the requester's
//   session (admin: any). Duplicate pending request for the same record → 400.
// GET  /api/de-nghi-chuyen?trang_thai=cho_xu_ly          → { de_nghi: DeNghiChuyen[] }
//   Returns requests I made + requests about records currently in sessions I'm in charge of; admin: all.
// POST /api/de-nghi-chuyen/:id/xu-ly body { dong_y: boolean, ghi_chu? } → { de_nghi: DeNghiChuyen }
//   Current holder (assignee of the record's session) or admin. dong_y → performs the move (same rules as chuyen,
//   reason = request ly_do); record confirmed or sessions locked → 400/423 and request stays pending.

export type ChuyenBody = {
  version: number;
  den: 'kho_ca_nhan' | 'kho_chung' | 'buoi';
  buoi?: number | string;       // id or ma_buoi when den='buoi'
  ly_do?: string;
};

export type ThemHoSoBody = {
  ma_kcb?: string;
  ho_ten: string;
  gioi_tinh: 'Nam' | 'Nữ';
  nam_sinh: number;
  cccd?: string;                // '' or 9/12 digits
  dia_chi_chi_tiet?: string;
  cls: ClsMap;
  ghi_chu?: string;
  ly_do_tao_moi?: string;       // required when duplicates exist
  so_dt?: string;               // Phase 12
  bo_qua_canh_bao_so?: boolean; // Phase 12: save despite 'canh_bao' level number problems
};

export type DeNghiChuyen = {
  id: number;
  ho_so: { id: number; ho_ten: string; nam_sinh: number; cccd: string; ma_kcb: string };
  tu_buoi: { ma_buoi: string; phu_trach: UserNgan | null } | null;   // where the record is now
  den_buoi: { id: number; ma_buoi: string; phu_trach: UserNgan | null };   // Phase 11: phu_trach
  nguoi_de_nghi: UserNgan;
  ly_do: string;
  trang_thai: 'cho_xu_ly' | 'dong_y' | 'tu_choi';
  created_at: string;
  xu_ly_by: UserNgan | null;
  xu_ly_at: string | null;
  xu_ly_ghi_chu: string;
} & DeNghiChuyenTuDuyet   // Phase 10: tu_dong, tu_dong_loi, han_tu_duyet
  & DeNghiChuyenHaiChieu;   // Phase 11: loai, nguoi_duyet

export type HoSoSuaBody = {
  version: number;
  ma_kcb?: string;
  ho_ten?: string;
  gioi_tinh?: 'Nam' | 'Nữ';
  nam_sinh?: number;
  cccd?: string;                // '' or 9 or 12 digits
  dia_chi_chi_tiet?: string;
  ghi_chu?: string;
  cls?: Partial<ClsMap>;
  so_dt?: string;               // Phase 12
  bo_qua_canh_bao_so?: boolean; // Phase 12
};

export type NhatKyDong = {
  at: string;
  user: UserNgan | null;        // null = system / import
  hanh_dong: string;
  truong: string | null;
  gia_tri_cu: string | null;
  gia_tri_moi: string | null;
  ghi_chu: string | null;
};

export type UserQuanLy = {
  id: number;
  username: string;
  ho_ten: string;
  role: 'admin' | 'nhan_vien';
  active: boolean;
  last_seen_at: string | null;
  so_buoi: number;              // sessions assigned
};

export const HANH_DONG_NHAN: Record<string, string> = {
  import: 'Nạp dữ liệu',
  sua_nhan_than: 'Sửa thông tin',
  sua_cls: 'Sửa cận lâm sàng',
  sua_ghi_chu: 'Sửa ghi chú',
  xac_nhan: 'Xác nhận có hồ sơ giấy',
  bo_xac_nhan: 'Bỏ xác nhận',
  phan_cong: 'Phân công',
  sua_buoi: 'Sửa buổi khám',
  them_buoi: 'Thêm buổi khám',
  tao_user: 'Tạo tài khoản',
  sua_user: 'Sửa tài khoản',
  dat_lai_mat_khau: 'Đặt lại mật khẩu',
  cap_mat_khau: 'Cấp mật khẩu',
  chuyen: 'Chuyển hồ sơ',
  nhan_ve: 'Nhận hồ sơ về',
  them_ho_so: 'Thêm hồ sơ',
  xac_nhan_buoi: 'Xác nhận rà soát xong danh sách',
  mo_khoa_buoi: 'Mở khóa danh sách',
  de_nghi_chuyen: 'Đề nghị chuyển',
  xu_ly_de_nghi: 'Xử lý đề nghị chuyển',
  cai_dat: 'Đổi cài đặt',
  xuat_bao_cao: 'Xuất báo cáo Excel',
  xuat_cowork: 'Xuất dữ liệu cho Cowork',
  dang_nhap: 'Đăng nhập',
  dang_xuat: 'Đăng xuất',
  doi_mat_khau: 'Đổi mật khẩu',
};

// ---- Phase 5: dashboards (PLAN5.md) ----
// Metrics follow docs/03 mục 5. thua/thieu summed PER SESSION (no netting); chenh_lech = Σ hien_co − Σ so_doan.
export type TheTongHop = {
  so_buoi: number;
  so_buoi_da_xac_nhan: number;
  so_buoi_chua_xac_nhan: number;
  so_doan: number;              // Σ so_doan_tong ("DS google sheet")
  hien_co: number;
  da_xac_nhan: number;
  chua_xac_nhan: number;
  thua: number;
  thieu: number;
  chenh_lech: number;
  bo_sung: number;
  kho_ca_nhan: number;          // records in personal pool(s)
  tien_do: number;              // da_xac_nhan / hien_co * 100 (1 decimal)
};
// GET /api/dashboard/toi → { the: TheTongHop, buoi: BuoiTomTat[], kho_ca_nhan: KetQuaTimKiem[], de_nghi_cho_toi: number }
//   staff: own sessions + own pool; admin: same shape over ALL sessions and all personal pools.

export type DongTheoUser = TheTongHop & { user: UserNgan; active: boolean; last_seen_at: string | null; lan_hoat_dong_cuoi: string | null };
export type ClsDem = Record<ClsKey, number>;
export type DongTheoDonVi = {
  don_vi: 'TN' | 'LK' | 'VK' | 'TONG';
  ten: string;                  // 'Phường Thủy Nguyên' … 'Cộng'
  so_buoi: number;
  so_doan: number;
  hien_co: number;
  da_xac_nhan: number;
  thua: number;
  thieu: number;
  chenh_lech: number;
  co_tt_ksk: number;            // confirmed records with co_tt_ksk=1 ("DS đẩy cổng")
  cls: ClsDem;                  // confirmed records with flag=1 (current values)
};
// GET /api/dashboard/admin (admin) →
//   { theo_user: DongTheoUser[] (nhan_vien first by ho_ten, then admin; users with 0 sessions included),
//     theo_don_vi: DongTheoDonVi[] (TN, LK, VK, TONG), kho_chung: number, de_nghi_cho: number, the: TheTongHop }
//   lan_hoat_dong_cuoi = max(nhat_ky.at) of that user (any action).

// GET /api/nhat-ky?user=<id>&hanh_dong=&tu=yyyy-mm-dd&den=yyyy-mm-dd&doi_tuong=&trang=1 (admin)
//   → { dong: NhatKyAdmin[], tong: number, trang: number, kich_thuoc: 100 }  ORDER BY at DESC, id DESC
export type NhatKyAdmin = NhatKyDong & { id: number; doi_tuong: string; doi_tuong_id: string | null; mo_ta_doi_tuong: string };
//   mo_ta_doi_tuong: human label, e.g. 'TN-20260907' for buoi_kham, 'Hồ sơ #7148 (H2600128319)' for ho_so, username for user.

// ---- Phase 6: exports (PLAN5.md) ----
// GET /api/export/bao-cao.xlsx?chi_da_xac_nhan=1|0&don_vi=TN|LK|VK
//   staff: only their own sessions; admin: all. Default chi_da_xac_nhan=1. Content-Disposition attachment
//   filename 'bao-cao-ksk-<yyyymmdd-HHMM>.xlsx'. Audit 'xuat_bao_cao'.
// GET /api/export/cowork.zip (admin) → zip with manifest.json, ho_so.csv, buoi_kham.csv, nhat_ky.csv, bao_cao.xlsx
//   (docs/02 mục 7). Audit 'xuat_cowork'.

// ---- Phase 7: reload a newer package + admin upload (PLAN6.md, docs/03 mục 4) ----
export type TongDonVi = Record<'TN' | 'LK' | 'VK', { so_buoi: number; so_doan: number; ho_so_trong_buoi: number }>;
export type TomTatNapLai = {
  buoi_them: string[];                   // ma_buoi
  buoi_cap_nhat: number;                 // existing sessions whose description/so_doan changed
  buoi_khong_con_trong_goi: string[];    // kept, warning only
  ho_so_them_moi: number;                // new ma_ho_so (by vi_tri_ban_dau)
  ho_so_cap_nhat: number;                // untouched records whose identity/CLS/location got overwritten
  ho_so_cap_nhat_tham_chieu: number;     // only reference fields (co_tt_ksk, canh_bao, …) changed
  ho_so_giu_do_da_cham: number;          // touched records whose source changed → kept reviewer values, src updated
  ho_so_chuyen_vi_tri: number;           // untouched, unconfirmed records moved to a new session / pool
  ho_so_go_khoi_nguon_an: number;        // missing from new package, untouched & unconfirmed → vi_tri 'an'
  ho_so_go_khoi_nguon_giu: number;       // missing but confirmed/touched → kept + DA_GO_KHOI_NGUON
  ho_so_khong_doi: number;
  da_xac_nhan_nguon_doi: { id: number; ma_ho_so: string; ma_buoi: string; truong: string[] }[];
  them_tay_trung_goi: { ho_so_id: number; ma_ho_so_goi: string; theo: 'cccd' | 'ma_kcb' }[];
  khong_vao_buoi_khoa: number;           // would move into a locked session → put into kho_chung with note
  tong_truoc: TongDonVi;
  tong_sau: TongDonVi;
};
export type KeHoachNap = {
  phien_ban: string;
  che_do: 'lan_dau' | 'nap_lai';
  tu_choi: string | null;                // non-null → nothing will be / was written
  buoi_them: number;
  ho_so_them_tong: number;
  user_them: string[];
  tong_sau_nap: TongDonVi;
  nap_lai: TomTatNapLai | null;          // only when che_do='nap_lai'
};
// POST /api/import/thu   multipart/form-data: files 'manifest.json','buoi_kham.csv','ho_so.csv','nguoi_dung.csv'
//                        (+ field force=1 optional)  (admin) → { ok, errors: string[], warnings: string[], ke_hoach: KeHoachNap | null }
// POST /api/import/ghi   same body → same shape; writes in ONE transaction only when ok && !tu_choi.
// GET  /api/import/lich-su (admin) → { lan_nap: { phien_ban, che_do, nap_boi, nap_luc, tom_tat: unknown }[] } newest first

// ---- Phase 9 (owner feedback 12/11/2026): fuzzy ordered search, search filters, app version ----
// Matching semantics: src/lib/tim-mo.ts (tachTuKhoa / khopHoSo) — the SQL in /api/tim-kiem MUST mirror it:
//   CHU tokens in ORDER as substrings of  ho_ten_kd ␁ khongdau(ghi_chu)  (never spanning the separator);
//   SO tokens (≥4 digits): nam_sinh = tok (4 digits) OR cccd/ma_kcb/so_dt/so_the_bhyt contains tok;
//   MA tokens (letters+digits): so_the_bhyt/ma_kcb contains tok (case-insensitive) OR treated as a CHU token.
// GET /api/tim-kiem  — extra optional query params (AND-ed):
//   don_vi=TN|LK|VK            ngay=yyyy-mm-dd (ngay_kham of the record's session)
//   cls_<key>=co|khong         (key ∈ ctm, glucose, ure, creatinin, got, gpt, tpt_nuoc_tieu, sieu_am; current values)
//   xac_nhan=da|chua           phu_trach=<user_id>  (assignee of the record's session)
//   co_ghi_chu=1|0             tt_ksk=co|khong      nguon=his|them_tay|kho_chung (kho_chung = nhan_tu_kho_chung)
//   vi_tri=buoi|kho_ca_nhan|kho_chung|da_loai   (da_loai = kho_ca_nhan OR kho_chung, i.e. removed from a list)
//   q becomes OPTIONAL when at least one filter is set (else still ≥ 2 chars → 400).
//   Limit stays 200 (pham_vi=buoi: none); `tong` = total. Results ordered don_vi, ngay_kham, id.
//   Filter option lists come from GET /api/buoi?tat_ca=1 (dates, units, assignees).
// GET /api/app-version (any logged-in user) → { version: string }  — equals process.env.NEXT_PUBLIC_APP_VERSION
//   baked at build time (next.config.ts sets it to the build timestamp). Client compares with its own baked
//   value every 60 s; different → "Có bản cập nhật mới, trang sẽ tự tải lại sau 03:00 · Cập nhật ngay".
// GET /api/dashboard/admin: theo_user omits admins with no assigned session and no confirmed record;
//   rows sorted by progress (da_xac_nhan / hien_co) descending, ties by name.

// ---- Phase 10 (owner request 12/11/2026): mobile/PWA, sound + push for transfer requests, auto-approve ----
// Migration 0004_tu_duyet_push.sql:
//   CREATE TABLE cai_dat (khoa TEXT PRIMARY KEY, gia_tri JSONB NOT NULL,
//                         updated_by INT REFERENCES users(id), updated_at TIMESTAMPTZ NOT NULL DEFAULT now());
//   ALTER TABLE de_nghi_chuyen ADD COLUMN tu_dong BOOLEAN NOT NULL DEFAULT false,
//                              ADD COLUMN tu_dong_loi TEXT NOT NULL DEFAULT '';
//   CREATE TABLE push_dang_ky (id SERIAL PRIMARY KEY, user_id INT NOT NULL REFERENCES users(id),
//     endpoint TEXT NOT NULL UNIQUE, p256dh TEXT NOT NULL, auth TEXT NOT NULL, thiet_bi TEXT NOT NULL DEFAULT '',
//     created_at TIMESTAMPTZ NOT NULL DEFAULT now(), last_ok_at TIMESTAMPTZ);
//
// Auto-approve (setting key 'tu_duyet'; default when absent: { che_do: 'tat', sau_phut: 5 }):
//   'tat'      → never.
//   'ngay'     → right after a request is created (same request, after commit).
//   'sau_phut' → when a pending request is older than sau_phut minutes.
//   Executed by a sweep `quetTuDuyet()` run from GET /api/de-nghi-chuyen, GET /api/dashboard/* and after
//   POST /api/de-nghi-chuyen and PUT /api/cai-dat/tu-duyet (throttled ≥ 15 s per server instance, except the
//   explicit calls after create/settings change). Each request in its own tx, `FOR UPDATE SKIP LOCKED`.
//   Performs exactly what "Đồng ý" does (same move rules). On a business error (record confirmed, session
//   locked, record no longer in a session…) the request STAYS pending with tu_dong_loi = error message and is
//   never retried automatically (a person handles it). Success: trang_thai='dong_y', tu_dong=true,
//   xu_ly_by = the holder (assignee of the record's session; if none: lowest-id active admin),
//   xu_ly_ghi_chu = 'Tự động duyệt' | 'Tự động duyệt sau N phút'. Audit rows written by the auto-approval have
//   user_id = NULL (hệ thống) and ghi_chu starting with '[Tự động]'.
export type CheDoTuDuyet = 'tat' | 'ngay' | 'sau_phut';
export type CaiDatTuDuyet = {
  che_do: CheDoTuDuyet;
  sau_phut: number;               // integer 1..120
  updated_by: UserNgan | null;
  updated_at: string | null;
};
// GET /api/cai-dat/tu-duyet (any logged-in user) → { tu_duyet: CaiDatTuDuyet }
// PUT /api/cai-dat/tu-duyet (admin) body { che_do, sau_phut } → { tu_duyet: CaiDatTuDuyet }; 400 on bad input;
//   audit hanh_dong 'cai_dat', doi_tuong 'cai_dat', truong 'tu_duyet', old → new JSON. Runs a sweep right after.
//
// DeNghiChuyen gains (all list/detail responses):
//   tu_dong: boolean;          tu_dong_loi: string ('' = none)
//   han_tu_duyet: string | null  — ISO time it will be auto-approved (pending + mode 'sau_phut' + no tu_dong_loi),
//                                   else null.
export type DeNghiChuyenTuDuyet = { tu_dong: boolean; tu_dong_loi: string; han_tu_duyet: string | null };
//
// Web Push (library web-push@3.6.7; env VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT — all missing ⇒
// push is disabled and every send is a silent no-op):
// GET  /api/push/khoa (logged-in) → { public_key: string | null }
// POST /api/push/dang-ky body { endpoint, keys: { p256dh, auth }, thiet_bi? } → { ok: true }
//   upsert by endpoint (endpoint must be https; a re-login on the same device moves it to the current user).
// POST /api/push/huy body { endpoint } → { ok: true }   (only own rows)
// POST /api/push/thu → { gui: number }  — test notification to all my devices; number of devices sent OK.
// Push payload (JSON, what public/sw.js receives): { title, body, url, tag }
//   NEVER include patient name, CCCD, birth year, ly_do or ghi_chu (shown on lock screens).
//   New request → holder of the record's session + every admin, minus the requester:
//     title 'Đề nghị chuyển hồ sơ', body '<Họ tên người đề nghị> xin chuyển 1 hồ sơ từ <ma_buoi nguồn> về <ma_buoi đích>',
//     url '/kho?tab=de_nghi', tag 'de-nghi-<id>'.
//   Processed (manual or auto) → requester: title 'Đề nghị chuyển đã được đồng ý' | '… bị từ chối'
//     (+ ' (tự động)' when tu_dong), body 'Hồ sơ đã về buổi <ma_buoi đích>' | 'Lý do từ chối xem trong app',
//     url '/kho?tab=de_nghi', tag 'de-nghi-<id>'.
//   Sends happen after the DB commit, never delay/fail the API response (next/server `after()`), 5 s timeout,
//   404/410 from the push service ⇒ delete that subscription. Never log endpoints or payloads.
// Public (no login) paths added to src/proxy.ts: /manifest.webmanifest, /sw.js, /icons/*.

// ---- Phase 11 (owner request 13/11/2026): two-way transfer requests, approved by the receiving account ----
// "tài khoản đến có thể trực tiếp chấp nhận yêu cầu gửi hồ sơ đi hay nhận hồ sơ về mà không cần admin nữa
//  (admin vẫn có quyền phê duyệt toàn bộ)"
// Migration 0005_de_nghi_gui_di.sql:
//   ALTER TABLE de_nghi_chuyen ADD COLUMN loai TEXT NOT NULL DEFAULT 'xin_ve' CHECK (loai IN ('xin_ve','gui_di'));
// Two kinds of request (both stored in de_nghi_chuyen, same lifecycle, same auto-approve setting/sweep):
//   'xin_ve' (existing) — "xin nhận hồ sơ về": record is in SOMEONE ELSE's session, den_buoi is the requester's.
//        Approver: assignee of the record's CURRENT session, or any admin.
//   'gui_di' (new)      — "gửi hồ sơ sang buổi của người khác": record is in the REQUESTER's session (requester has
//        write access on it), den_buoi belongs to another assignee. Approver: assignee of den_buoi, or any admin.
//        Unassigned den_buoi → only admins can approve.
//   Either kind: when the requester can already write BOTH the source and the destination session (own sessions,
//   or admin) → moved immediately, stored as dong_y + tu_dong (Phase 10 behaviour kept).
// POST /api/de-nghi-chuyen body { ho_so_id, den_buoi, ly_do, loai? = 'xin_ve' }
//   gui_di validation: record vi_tri='buoi' in a session the requester can write (else 403); den_buoi ≠ current
//   session; record must not be confirmed and neither session locked (400/423, checked at creation AND approval);
//   duplicate pending request for the same record → 400.
// POST /api/de-nghi-chuyen/:id/xu-ly — permission per kind as above (403 otherwise). Approving a gui_di moves the
//   record into den_buoi; audit rows: user_id = approver, chuyen_boi = approver.
// GET /api/de-nghi-chuyen — visible: requests I made + xin_ve about records currently in my sessions + gui_di whose
//   den_buoi is mine; admin: all.
// DeNghiChuyen gains: loai; den_buoi.phu_trach: UserNgan | null; nguoi_duyet: UserNgan | null (the non-admin
//   account expected to decide: xin_ve → tu_buoi.phu_trach, gui_di → den_buoi.phu_trach).
// UI rule "addressed to me" (banner, popup, sound, badge): pending AND not created by me AND
//   (admin OR nguoi_duyet.id === me).
// Push "new request": nguoi_duyet + all admins, minus requester. gui_di text:
//   title 'Đề nghị nhận hồ sơ', body '<Họ tên người gửi> muốn gửi 1 hồ sơ từ <nguồn> sang buổi <đích> của bạn'.
// Dashboard de_nghi_cho_toi counts with the same "addressed to me" rule.
export type LoaiDeNghi = 'xin_ve' | 'gui_di';
export type DeNghiChuyenHaiChieu = {
  loai: LoaiDeNghi;
  nguoi_duyet: UserNgan | null;
};
// POST /api/ho-so/:id/chuyen with den='buoi': a NON-admin may now only move directly into a session they are
//   assigned to; another person's session → 403 'Buổi đích của người khác: hãy gửi đề nghị để người đó chấp nhận'
//   (UI sends POST /api/de-nghi-chuyen loai='gui_di' instead). Admin unchanged (direct move anywhere).

// ---- Phase 12 (owner request 13/11/2026): mix-up control for CCCD / mã KCB / SĐT ----
// Rules: src/lib/kiem-so.ts (kiemTraSo / vanDeKhiSua / chiSo / coSdt) — single source for UI and server.
// Migration 0006_canh_bao_so.sql: ALTER TABLE ho_so ADD COLUMN canh_bao_so TEXT[] NOT NULL DEFAULT '{}';
//   = tomTatSo(kiemTraSo(record)) — derived, recomputed on every write of the record (sua, them, import/reload)
//   and by `npm run kiem-so` (backfill all records; idempotent; no audit rows since it is derived data).
// HoSoDong and KetQuaTimKiem gain:  so_dt: string ('' when the stored value is '0' or empty);
//                                    canh_bao_so: string[]  (messages, e.g. 'Mã KCB có dạng số CCCD').
// HoSoSuaBody / ThemHoSoBody gain:   so_dt?: string; bo_qua_canh_bao_so?: boolean
// Writes (PATCH /api/ho-so/:id, POST /api/buoi/:key/ho-so):
//   - cccd / ma_kcb / so_dt are normalised with chiSo() (spaces, dots, dashes removed) before checks/storage.
//   - problems = vanDeKhiSua(new values, changed fields) + (when cccd/ma_kcb changes) duplicate check:
//       another non-hidden record with the same cccd (or ma_kcb) and a different khongDau(ho_ten)
//       → { truong, muc: 'canh_bao', ma: 'TRUNG_HO_SO', thong_diep: 'CCCD trùng hồ sơ #<id> (<don_vi> · dd/mm)' }
//       (never put the other person's name in the message).
//   - any 'loi'  → 400 { error: '<first message>', van_de_so: VanDeSo[] }
//   - else any 'canh_bao' and !bo_qua_canh_bao_so → 422 { error: 'Số có thể bị nhập nhầm', van_de_so: VanDeSo[] }
//   - saved with bo_qua_canh_bao_so → audit ghi_chu gets '[Vẫn lưu dù cảnh báo: <messages>]'.
//   - Editing so_dt counts as a personal-info edit (sua_nhan_than) and survives package reloads like other
//     personal fields.
// GET /api/tim-kiem: extra filter nghi_nham_so=1|0 (cardinality(canh_bao_so) > 0 / = 0).
// Re-export so the UI can import the problem type from the contract file.
export type { VanDeSo } from './kiem-so';
