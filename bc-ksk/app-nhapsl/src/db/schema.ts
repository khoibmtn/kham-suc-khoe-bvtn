// Drizzle mirror of src/db/migrations/*.sql — SQL files are the source of truth for DDL
// (CHECK constraints, extensions, trigram index). Keep column names in sync when adding migrations.
import {
  pgTable, serial, bigserial, text, integer, smallint, boolean, timestamp, date, jsonb,
} from 'drizzle-orm/pg-core';

export const users = pgTable('users', {
  id: serial('id').primaryKey(),
  username: text('username').notNull().unique(),
  hoTen: text('ho_ten').notNull(),
  role: text('role').$type<'admin' | 'nhan_vien'>().notNull(),
  passwordHash: text('password_hash'),
  active: boolean('active').notNull().default(true),
  sessionVersion: integer('session_version').notNull().default(1),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  lastSeenAt: timestamp('last_seen_at', { withTimezone: true }),
});

export const dangNhapThatBai = pgTable('dang_nhap_that_bai', {
  id: bigserial('id', { mode: 'number' }).primaryKey(),
  username: text('username').notNull(),
  at: timestamp('at', { withTimezone: true }).notNull().defaultNow(),
});

export const importBatches = pgTable('import_batches', {
  id: serial('id').primaryKey(),
  phienBan: text('phien_ban').notNull().unique(),
  manifest: jsonb('manifest').notNull(),
  tomTat: jsonb('tom_tat').notNull(),
  cheDo: text('che_do').$type<'lan_dau' | 'nap_lai'>().notNull(),
  napBoi: text('nap_boi').notNull(),
  napLuc: timestamp('nap_luc', { withTimezone: true }).notNull().defaultNow(),
});

export type TrangThaiBuoi = 'chua_ra_soat' | 'dang_ra_soat' | 'da_xac_nhan';
export const buoiKham = pgTable('buoi_kham', {
  id: serial('id').primaryKey(),
  maBuoi: text('ma_buoi').notNull().unique(),
  donVi: text('don_vi').$type<'TN' | 'LK' | 'VK'>().notNull(),
  tenDonVi: text('ten_don_vi').notNull(),
  ngayKham: date('ngay_kham').notNull(), // 'yyyy-mm-dd'
  diemKham: text('diem_kham').notNull().default(''),
  doanKham: text('doan_kham').notNull().default(''),
  nvGoiY: text('nv_goi_y').notNull().default(''),
  soDoanTong: integer('so_doan_tong').notNull(),
  soDoan: jsonb('so_doan').$type<Record<string, number | null>>().notNull().default({}),
  phuTrachUserId: integer('phu_trach_user_id'),
  trangThai: text('trang_thai').$type<TrangThaiBuoi>().notNull().default('chua_ra_soat'),
  xacNhanBy: integer('xac_nhan_by'),
  xacNhanAt: timestamp('xac_nhan_at', { withTimezone: true }),
  giaiTrinh: text('giai_trinh'),
  nguon: text('nguon').$type<'cowork' | 'admin_them'>().notNull().default('cowork'),
});

export type ClsFlags = {
  ctm: number; glucose: number; ure: number; creatinin: number;
  got: number; gpt: number; tpt_nuoc_tieu: number; sieu_am: number;
};
export type HoSoSrc = {
  ma_kcb: string; ho_ten: string; gioi_tinh: string; nam_sinh: number;
  cccd: string; dia_chi_chi_tiet: string; cls: ClsFlags;
};
export type ViTri = 'buoi' | 'kho_ca_nhan' | 'kho_chung' | 'an';

export const hoSo = pgTable('ho_so', {
  id: serial('id').primaryKey(),
  maHoSo: text('ma_ho_so').unique(),
  nguon: text('nguon').$type<'cowork' | 'them_tay'>().notNull(),
  trangThaiNguon: text('trang_thai_nguon').$type<'co_trong_goi' | 'da_go_khoi_goi'>().notNull().default('co_trong_goi'),
  version: integer('version').notNull().default(1),

  maKcb: text('ma_kcb').notNull().default(''),
  hoTen: text('ho_ten').notNull(),
  hoTenKd: text('ho_ten_kd').notNull(),
  gioiTinh: text('gioi_tinh').$type<'Nam' | 'Nữ' | ''>().notNull(), // '' = chưa rõ, nhân viên sửa theo giấy
  namSinh: integer('nam_sinh').notNull(),
  cccd: text('cccd').notNull().default(''),
  soTheBhyt: text('so_the_bhyt').notNull().default(''),
  soDt: text('so_dt').notNull().default(''),
  diaChiChiTiet: text('dia_chi_chi_tiet').notNull().default(''),
  ctm: smallint('ctm').notNull().default(0),
  glucose: smallint('glucose').notNull().default(0),
  ure: smallint('ure').notNull().default(0),
  creatinin: smallint('creatinin').notNull().default(0),
  got: smallint('got').notNull().default(0),
  gpt: smallint('gpt').notNull().default(0),
  tptNuocTieu: smallint('tpt_nuoc_tieu').notNull().default(0),
  sieuAm: smallint('sieu_am').notNull().default(0),

  src: jsonb('src').$type<HoSoSrc | null>(),

  diaChiThe: text('dia_chi_the').notNull().default(''),
  ngayGioDangKyHis: text('ngay_gio_dang_ky_his').notNull().default(''),
  clsGhiChu: text('cls_ghi_chu').notNull().default(''),
  coTtKsk: smallint('co_tt_ksk').notNull().default(0),
  soKsk: text('so_ksk').notNull().default(''),
  kySo: smallint('ky_so'),
  ketLuanPhanLoai: text('ket_luan_phan_loai').notNull().default(''),
  canhBao: text('canh_bao').array().notNull().default([]),
  ghiChuCowork: text('ghi_chu_cowork').notNull().default(''),
  donViGoiY: text('don_vi_goi_y').notNull().default(''),

  suaNhanThan: boolean('sua_nhan_than').notNull().default(false),
  suaCls: boolean('sua_cls').notNull().default(false),
  daDiChuyen: boolean('da_di_chuyen').notNull().default(false),

  viTri: text('vi_tri').$type<ViTri>().notNull(),
  buoiId: integer('buoi_id'),
  khoUserId: integer('kho_user_id'),
  maBuoiBanDau: text('ma_buoi_ban_dau').notNull().default(''),
  nhanTuKhoChung: boolean('nhan_tu_kho_chung').notNull().default(false),

  daXacNhan: boolean('da_xac_nhan').notNull().default(false),
  xacNhanBy: integer('xac_nhan_by'),
  xacNhanAt: timestamp('xac_nhan_at', { withTimezone: true }),

  chuyenTu: text('chuyen_tu').notNull().default(''),
  chuyenBoi: integer('chuyen_boi'),
  chuyenLuc: timestamp('chuyen_luc', { withTimezone: true }),
  chuyenLyDo: text('chuyen_ly_do').notNull().default(''),
  ghiChu: text('ghi_chu').notNull().default(''),
  createdBy: integer('created_by'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedBy: integer('updated_by'),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const nhatKy = pgTable('nhat_ky', {
  id: bigserial('id', { mode: 'number' }).primaryKey(),
  at: timestamp('at', { withTimezone: true }).notNull().defaultNow(),
  userId: integer('user_id'),
  hanhDong: text('hanh_dong').notNull(),
  doiTuong: text('doi_tuong').notNull(),
  doiTuongId: text('doi_tuong_id'),
  truong: text('truong'),
  giaTriCu: text('gia_tri_cu'),
  giaTriMoi: text('gia_tri_moi'),
  ghiChu: text('ghi_chu'),
});

export const deNghiChuyen = pgTable('de_nghi_chuyen', {
  id: serial('id').primaryKey(),
  hoSoId: integer('ho_so_id').notNull(),
  tuUserId: integer('tu_user_id').notNull(),
  denBuoiId: integer('den_buoi_id').notNull(),
  lyDo: text('ly_do').notNull().default(''),
  trangThai: text('trang_thai').$type<'cho_xu_ly' | 'dong_y' | 'tu_choi'>().notNull().default('cho_xu_ly'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  xuLyBy: integer('xu_ly_by'),
  xuLyAt: timestamp('xu_ly_at', { withTimezone: true }),
  xuLyGhiChu: text('xu_ly_ghi_chu').notNull().default(''),
  tuDong: boolean('tu_dong').notNull().default(false),
  tuDongLoi: text('tu_dong_loi').notNull().default(''),
});

export const caiDat = pgTable('cai_dat', {
  khoa: text('khoa').primaryKey(),
  giaTri: jsonb('gia_tri').notNull(),
  updatedBy: integer('updated_by'),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const pushDangKy = pgTable('push_dang_ky', {
  id: serial('id').primaryKey(),
  userId: integer('user_id').notNull(),
  endpoint: text('endpoint').notNull().unique(),
  p256dh: text('p256dh').notNull(),
  auth: text('auth').notNull(),
  thietBi: text('thiet_bi').notNull().default(''),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  lastOkAt: timestamp('last_ok_at', { withTimezone: true }),
});
