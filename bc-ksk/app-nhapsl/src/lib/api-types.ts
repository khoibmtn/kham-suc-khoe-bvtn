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
};

export type DeNghiChuyen = {
  id: number;
  ho_so: { id: number; ho_ten: string; nam_sinh: number; cccd: string; ma_kcb: string };
  tu_buoi: { ma_buoi: string; phu_trach: UserNgan | null } | null;   // where the record is now
  den_buoi: { id: number; ma_buoi: string };
  nguoi_de_nghi: UserNgan;
  ly_do: string;
  trang_thai: 'cho_xu_ly' | 'dong_y' | 'tu_choi';
  created_at: string;
  xu_ly_by: UserNgan | null;
  xu_ly_at: string | null;
  xu_ly_ghi_chu: string;
};

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
