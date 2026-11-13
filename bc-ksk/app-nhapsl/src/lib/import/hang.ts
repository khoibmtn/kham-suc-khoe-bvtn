// Dựng "hàng" ghi vào DB từ bản ghi gói — dùng chung cho nạp lần đầu và nạp lại (không viết hai lần).
import type postgres from 'postgres';
import { CLS } from '@/lib/cls';
import { tomTatSo, kiemTraSo } from '@/lib/kiem-so';
import { khongDau } from '@/lib/text';
import type { BuoiGoi, HoSoGoi } from './goi';

type Sql = postgres.Sql | postgres.TransactionSql;

export class NapTuChoi extends Error {}

export const KHOA_NHAN_THAN = ['ma_kcb', 'ho_ten', 'gioi_tinh', 'nam_sinh', 'cccd', 'dia_chi_chi_tiet'] as const;
export type KhoaNhanThan = (typeof KHOA_NHAN_THAN)[number];

export type Src = {
  ma_kcb: string; ho_ten: string; gioi_tinh: string; nam_sinh: number; cccd: string; dia_chi_chi_tiet: string;
  cls: Record<string, number>;
};

/** Giá trị theo gói, lưu ở cột `src` (so sánh khi nạp lại). */
export function srcCuaGoi(h: HoSoGoi): Src {
  return {
    ma_kcb: h.ma_kcb, ho_ten: h.ho_ten, gioi_tinh: h.gioi_tinh, nam_sinh: h.nam_sinh,
    cccd: h.cccd, dia_chi_chi_tiet: h.dia_chi_chi_tiet,
    cls: Object.fromEntries(CLS.map((c) => [c.key, h.cls[c.key]])),
  };
}

export function hangBuoi(tx: Sql, b: BuoiGoi) {
  return {
    ma_buoi: b.ma_buoi,
    don_vi: b.don_vi,
    ten_don_vi: b.ten_don_vi,
    ngay_kham: b.ngay_kham,
    diem_kham: b.diem_kham,
    doan_kham: b.doan_kham,
    nv_goi_y: b.nv_goi_y,
    so_doan_tong: b.so_doan_tong,
    so_doan: tx.json(b.so_doan),
  };
}

export type ViTriGhi = { vi_tri: 'buoi' | 'kho_chung'; buoi_id: number | null; chuyen_tu?: string; chuyen_ly_do?: string };

export function hangHoSoMoi(tx: Sql, h: HoSoGoi, vt: ViTriGhi) {
  const clsCot = Object.fromEntries(CLS.map((c) => [c.col, h.cls[c.key]]));
  return {
    ma_ho_so: h.ma_ho_so,
    nguon: 'cowork',
    ma_kcb: h.ma_kcb,
    ho_ten: h.ho_ten,
    ho_ten_kd: khongDau(h.ho_ten),
    gioi_tinh: h.gioi_tinh,
    nam_sinh: h.nam_sinh,
    cccd: h.cccd,
    so_the_bhyt: h.so_the_bhyt,
    so_dt: h.so_dt,
    dia_chi_chi_tiet: h.dia_chi_chi_tiet,
    ...clsCot,
    src: tx.json(srcCuaGoi(h)),
    dia_chi_the: h.dia_chi_the,
    ngay_gio_dang_ky_his: h.ngay_gio_dang_ky_his,
    cls_ghi_chu: h.cls_ghi_chu,
    co_tt_ksk: h.co_tt_ksk,
    so_ksk: h.so_ksk,
    ky_so: h.ky_so,
    ket_luan_phan_loai: h.ket_luan_phan_loai,
    canh_bao: h.canh_bao,
    canh_bao_so: tomTatSo(kiemTraSo(h)),
    ghi_chu_cowork: h.ghi_chu_cowork,
    don_vi_goi_y: h.don_vi_goi_y,
    vi_tri: vt.vi_tri,
    buoi_id: vt.buoi_id,
    ma_buoi_ban_dau: h.ma_buoi,
    chuyen_tu: vt.chuyen_tu ?? '',
    chuyen_ly_do: vt.chuyen_ly_do ?? '',
  };
}
