// Lấy dữ liệu + tổng hợp cho báo cáo Excel (docs/01 mục 4.10a, docs/03 mục 5).
import type postgres from 'postgres';
import { CLS, CLS_KEYS, type ClsKey, type DonVi } from '@/lib/cls';

type Sql = postgres.Sql;
export const THU_TU_DON_VI: DonVi[] = ['TN', 'LK', 'VK'];

export type TuyChonBaoCao = {
  /** Nhân viên: chỉ buổi do user này phụ trách. Bỏ trống = tất cả (admin). */
  chiCuaUserId?: number | null;
  donVi?: DonVi | null;
  /** Mặc định true. */
  chiDaXacNhan?: boolean;
};

export type ChiSo = {
  so_doan: number;                    // DS google sheet
  tong: number;                       // tổng số người khám (số hồ sơ trong tập)
  cls: Record<ClsKey, number>;
  co_ds_day_cong: number;
  khong_ds_day_cong: number;
  thua_thieu: number;                 // tong - so_doan (có dấu)
};

export type BuoiBaoCao = {
  id: number; ma_buoi: string; don_vi: DonVi; ngay_kham: string; diem_kham: string;
  phu_trach_ho_ten: string; trang_thai: 'chua_ra_soat' | 'dang_ra_soat' | 'da_xac_nhan';
  chi_so: ChiSo;
};

export type HoSoBaoCao = {
  id: number; don_vi: DonVi; ngay_kham: string; ma_kcb: string; ho_ten: string; gioi_tinh: string; nam_sinh: number;
  cccd: string; dia_chi_chi_tiet: string; cls: Record<ClsKey, number>; co_tt_ksk: number; da_xac_nhan: boolean;
  nguoi_xac_nhan: string; xac_nhan_at: Date | null; nguon: 'cowork' | 'them_tay'; nhan_tu_kho_chung: boolean; ghi_chu: string;
};

export type DuLieuBaoCao = { buoi: BuoiBaoCao[]; hoSo: HoSoBaoCao[]; chiDaXacNhan: boolean };

const chiSoRong = (): ChiSo => ({
  so_doan: 0, tong: 0, cls: Object.fromEntries(CLS_KEYS.map((k) => [k, 0])) as Record<ClsKey, number>,
  co_ds_day_cong: 0, khong_ds_day_cong: 0, thua_thieu: 0,
});

export function congChiSo(list: ChiSo[]): ChiSo {
  const r = chiSoRong();
  for (const c of list) {
    r.so_doan += c.so_doan; r.tong += c.tong; r.co_ds_day_cong += c.co_ds_day_cong; r.khong_ds_day_cong += c.khong_ds_day_cong;
    for (const k of CLS_KEYS) r.cls[k] += c.cls[k];
  }
  r.thua_thieu = r.tong - r.so_doan;
  return r;
}

/** Tổng hợp theo đơn vị (luôn đủ 3 dòng) + dòng Cộng. */
export function tongHopTheoDonVi(buoi: BuoiBaoCao[]): { theoDonVi: Record<DonVi, ChiSo>; cong: ChiSo } {
  const theoDonVi = {} as Record<DonVi, ChiSo>;
  for (const dv of THU_TU_DON_VI) theoDonVi[dv] = congChiSo(buoi.filter((b) => b.don_vi === dv).map((b) => b.chi_so));
  return { theoDonVi, cong: congChiSo(THU_TU_DON_VI.map((dv) => theoDonVi[dv])) };
}

type BuoiRow = {
  id: number; ma_buoi: string; don_vi: DonVi; ngay_kham: string; diem_kham: string; so_doan_tong: number;
  trang_thai: BuoiBaoCao['trang_thai']; pt_ho_ten: string | null; tong: number; co_tt: number;
} & Record<string, unknown>;

type HoSoRow = Record<string, unknown> & {
  id: number; don_vi: DonVi; ngay_kham: string; ma_kcb: string; ho_ten: string; gioi_tinh: string; nam_sinh: number;
  cccd: string; dia_chi_chi_tiet: string; co_tt_ksk: number; da_xac_nhan: boolean; xn_ho_ten: string | null;
  xac_nhan_at: Date | null; nguon: 'cowork' | 'them_tay'; nhan_tu_kho_chung: boolean; ghi_chu: string;
};

export async function layDuLieuBaoCao(sql: Sql, tc: TuyChonBaoCao = {}): Promise<DuLieuBaoCao> {
  const chiDaXacNhan = tc.chiDaXacNhan ?? true;
  const params: (string | number)[] = [];
  const dk: string[] = [];
  if (tc.chiCuaUserId !== undefined && tc.chiCuaUserId !== null) { params.push(tc.chiCuaUserId); dk.push(`b.phu_trach_user_id = $${params.length}`); }
  if (tc.donVi) { params.push(tc.donVi); dk.push(`b.don_vi = $${params.length}`); }
  const where = dk.length ? `WHERE ${dk.join(' AND ')}` : '';
  const dkHs = chiDaXacNhan ? 'AND h.da_xac_nhan' : '';
  // Tên cột CLS lấy từ hằng số CLS (không từ đầu vào người dùng).
  const demCls = CLS.map((c) => `(count(h.id) FILTER (WHERE h.${c.col} = 1))::int AS c_${c.key}`).join(', ');

  const bRows = await sql.unsafe<BuoiRow[]>(
    `SELECT b.id, b.ma_buoi, b.don_vi, b.ngay_kham, b.diem_kham, b.so_doan_tong, b.trang_thai, pt.ho_ten AS pt_ho_ten,
            count(h.id)::int AS tong, (count(h.id) FILTER (WHERE h.co_tt_ksk = 1))::int AS co_tt, ${demCls}
     FROM buoi_kham b
     LEFT JOIN users pt ON pt.id = b.phu_trach_user_id
     LEFT JOIN ho_so h ON h.buoi_id = b.id AND h.vi_tri = 'buoi' ${dkHs}
     ${where}
     GROUP BY b.id, pt.id
     ORDER BY CASE b.don_vi WHEN 'TN' THEN 0 WHEN 'LK' THEN 1 ELSE 2 END, b.ngay_kham, b.id`,
    params,
  );
  const buoi: BuoiBaoCao[] = bRows.map((r) => ({
    id: r.id, ma_buoi: r.ma_buoi, don_vi: r.don_vi, ngay_kham: r.ngay_kham, diem_kham: r.diem_kham,
    phu_trach_ho_ten: r.pt_ho_ten ?? '', trang_thai: r.trang_thai,
    chi_so: {
      so_doan: r.so_doan_tong, tong: r.tong,
      cls: Object.fromEntries(CLS_KEYS.map((k) => [k, Number(r[`c_${k}`])])) as Record<ClsKey, number>,
      co_ds_day_cong: r.co_tt, khong_ds_day_cong: r.tong - r.co_tt, thua_thieu: r.tong - r.so_doan_tong,
    },
  }));

  const hRows = await sql.unsafe<HoSoRow[]>(
    `SELECT h.id, b.don_vi, b.ngay_kham, h.ma_kcb, h.ho_ten, h.gioi_tinh, h.nam_sinh, h.cccd, h.dia_chi_chi_tiet,
            ${CLS.map((c) => `h.${c.col}`).join(', ')}, h.co_tt_ksk, h.da_xac_nhan, xn.ho_ten AS xn_ho_ten, h.xac_nhan_at,
            h.nguon, h.nhan_tu_kho_chung, h.ghi_chu
     FROM ho_so h
     JOIN buoi_kham b ON b.id = h.buoi_id
     LEFT JOIN users xn ON xn.id = h.xac_nhan_by
     WHERE h.vi_tri = 'buoi' ${dkHs} ${dk.length ? `AND ${dk.join(' AND ')}` : ''}
     ORDER BY b.ngay_kham, h.id`,
    params,
  );
  const hoSo: HoSoBaoCao[] = hRows.map((r) => ({
    id: r.id, don_vi: r.don_vi, ngay_kham: r.ngay_kham, ma_kcb: r.ma_kcb, ho_ten: r.ho_ten, gioi_tinh: r.gioi_tinh,
    nam_sinh: r.nam_sinh, cccd: r.cccd, dia_chi_chi_tiet: r.dia_chi_chi_tiet,
    cls: Object.fromEntries(CLS_KEYS.map((k) => [k, Number(r[k])])) as Record<ClsKey, number>,
    co_tt_ksk: r.co_tt_ksk, da_xac_nhan: r.da_xac_nhan, nguoi_xac_nhan: r.xn_ho_ten ?? '', xac_nhan_at: r.xac_nhan_at,
    nguon: r.nguon, nhan_tu_kho_chung: r.nhan_tu_kho_chung, ghi_chu: r.ghi_chu,
  }));
  return { buoi, hoSo, chiDaXacNhan };
}
