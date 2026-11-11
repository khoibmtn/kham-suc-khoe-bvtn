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
  dang_nhap: 'Đăng nhập',
  dang_xuat: 'Đăng xuất',
  doi_mat_khau: 'Đổi mật khẩu',
};
