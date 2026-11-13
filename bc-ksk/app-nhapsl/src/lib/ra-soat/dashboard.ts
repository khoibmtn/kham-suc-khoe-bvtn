import type { AuthUser } from '@/lib/auth/guard';
import type { BuoiTomTat, DongTheoDonVi, DongTheoUser, KetQuaTimKiem, TheTongHop } from '@/lib/api-types';
import { getSql } from '@/db/client';
import { CLS_KEYS, DON_VI, type ClsKey } from '@/lib/cls';
import { truyVanBuoi } from './buoi';
import { truyVanKetQua } from './tim-kiem';
import { iso, laAdmin } from './quyen';

const lamTron1 = (tu: number, mau: number) => (mau === 0 ? 0 : Math.round((tu / mau) * 1000) / 10);

/** Thuần: gộp các buổi (đã có chỉ số từng buổi) thành thẻ tổng. thừa/thiếu cộng theo buổi, không bù trừ. */
export function tongHopTuBuoi(buoi: BuoiTomTat[], khoCaNhan: number): TheTongHop {
  let so_doan = 0, hien_co = 0, da_xac_nhan = 0, thua = 0, thieu = 0, bo_sung = 0, daXN = 0;
  for (const b of buoi) {
    so_doan += b.so_doan_tong;
    hien_co += b.hien_co;
    da_xac_nhan += b.da_xac_nhan;
    thua += b.thua;
    thieu += b.thieu;
    bo_sung += b.bo_sung;
    if (b.trang_thai === 'da_xac_nhan') daXN++;
  }
  return {
    so_buoi: buoi.length,
    so_buoi_da_xac_nhan: daXN,
    so_buoi_chua_xac_nhan: buoi.length - daXN,
    so_doan,
    hien_co,
    da_xac_nhan,
    chua_xac_nhan: hien_co - da_xac_nhan,
    thua,
    thieu,
    chenh_lech: hien_co - so_doan,
    bo_sung,
    kho_ca_nhan: khoCaNhan,
    tien_do: lamTron1(da_xac_nhan, hien_co),
  };
}

const ADMIN_GIA: AuthUser = { id: 0, username: '', ho_ten: '', role: 'admin', session_version: 0 };

export async function dashboardToi(user: AuthUser): Promise<{
  the: TheTongHop; buoi: BuoiTomTat[]; kho_ca_nhan: KetQuaTimKiem[]; de_nghi_cho_toi: number;
}> {
  const sql = getSql();
  const admin = laAdmin(user);
  const [buoi, kho, [dn]] = await Promise.all([
    truyVanBuoi(sql, user, admin ? {} : { chiCuaUserId: user.id }),
    truyVanKetQua(sql, user, admin ? sql`h.vi_tri = 'kho_ca_nhan'` : sql`h.vi_tri = 'kho_ca_nhan' AND h.kho_user_id = ${user.id}`, null),
    sql<{ n: number }[]>`
      SELECT count(*)::int AS n
      FROM de_nghi_chuyen d
      JOIN ho_so h ON h.id = d.ho_so_id
      LEFT JOIN buoi_kham b ON b.id = h.buoi_id AND h.vi_tri = 'buoi'
      JOIN buoi_kham db ON db.id = d.den_buoi_id
      WHERE d.trang_thai = 'cho_xu_ly' AND d.tu_user_id <> ${user.id}
        ${admin ? sql`` : sql`AND ((d.loai = 'xin_ve' AND b.phu_trach_user_id = ${user.id}) OR (d.loai = 'gui_di' AND db.phu_trach_user_id = ${user.id}))`}`,
  ]);
  return { the: tongHopTuBuoi(buoi, kho.ket_qua.length), buoi, kho_ca_nhan: kho.ket_qua, de_nghi_cho_toi: dn.n };
}

type DongDonViSql = { don_vi: 'TN' | 'LK' | 'VK'; co_tt_ksk: number } & Record<ClsKey, number>;

export async function dashboardAdmin(): Promise<{
  theo_user: DongTheoUser[]; theo_don_vi: DongTheoDonVi[]; kho_chung: number; de_nghi_cho: number; the: TheTongHop;
}> {
  const sql = getSql();
  const clsSql = CLS_KEYS.map((k) => sql`(count(*) FILTER (WHERE h.${sql(k)} = 1))::int AS ${sql(k)}`)
    .reduce((a, f) => sql`${a}, ${f}`);
  const [buoi, users, khoUser, hoatDong, clsDv, [dem], hoSoUser] = await Promise.all([
    truyVanBuoi(sql, ADMIN_GIA, {}),
    sql<{ id: number; username: string; ho_ten: string; role: string; active: boolean; last_seen_at: Date | null }[]>`
      SELECT id, username, ho_ten, role, active, last_seen_at FROM users
      ORDER BY (role = 'admin'), ho_ten, id`,
    sql<{ kho_user_id: number; n: number }[]>`
      SELECT kho_user_id, count(*)::int AS n FROM ho_so WHERE vi_tri = 'kho_ca_nhan' AND kho_user_id IS NOT NULL GROUP BY kho_user_id`,
    sql<{ user_id: number; luc: Date }[]>`
      SELECT user_id, max(at) AS luc FROM nhat_ky WHERE user_id IS NOT NULL GROUP BY user_id`,
    sql<DongDonViSql[]>`
      SELECT b.don_vi, (count(*) FILTER (WHERE h.co_tt_ksk = 1))::int AS co_tt_ksk, ${clsSql}
      FROM ho_so h JOIN buoi_kham b ON b.id = h.buoi_id
      WHERE h.vi_tri = 'buoi' AND h.da_xac_nhan
      GROUP BY b.don_vi`,
    sql<{ kho_chung: number; kho_ca_nhan: number; de_nghi_cho: number }[]>`
      SELECT (SELECT count(*) FROM ho_so WHERE vi_tri = 'kho_chung')::int AS kho_chung,
             (SELECT count(*) FROM ho_so WHERE vi_tri = 'kho_ca_nhan')::int AS kho_ca_nhan,
             (SELECT count(*) FROM de_nghi_chuyen WHERE trang_thai = 'cho_xu_ly')::int AS de_nghi_cho`,
    // Người từng xác nhận hồ sơ — admin chỉ hiện trong bảng theo người khi có phụ trách buổi hoặc có xác nhận.
    sql<{ uid: number }[]>`
      SELECT DISTINCT xac_nhan_by AS uid FROM ho_so WHERE xac_nhan_by IS NOT NULL`,
  ]);
  const coHoSo = new Set(hoSoUser.map((r) => r.uid));

  const khoMap = new Map(khoUser.map((r) => [r.kho_user_id, r.n]));
  const hdMap = new Map(hoatDong.map((r) => [r.user_id, r.luc]));
  const coPhatSinh = (u: { id: number; role: string }) =>
    u.role !== 'admin' || buoi.some((b) => b.phu_trach?.id === u.id) || coHoSo.has(u.id);
  const theo_user: DongTheoUser[] = users.filter(coPhatSinh).map((u) => ({
    ...tongHopTuBuoi(buoi.filter((b) => b.phu_trach?.id === u.id), khoMap.get(u.id) ?? 0),
    user: { id: u.id, username: u.username, ho_ten: u.ho_ten },
    active: u.active,
    last_seen_at: iso(u.last_seen_at),
    lan_hoat_dong_cuoi: iso(hdMap.get(u.id) ?? null),
  }));
  // Owner 12/11/2026: sort by progress (confirmed / current) descending; ties by name (stable from SQL order).
  const tienDo = (r: DongTheoUser) => (r.hien_co === 0 ? 0 : r.da_xac_nhan / r.hien_co);
  theo_user.sort((a, b) => tienDo(b) - tienDo(a));

  const clsMap = new Map(clsDv.map((r) => [r.don_vi, r]));
  const dongDonVi = (dv: 'TN' | 'LK' | 'VK' | 'TONG', ten: string): DongTheoDonVi => {
    const bs = dv === 'TONG' ? buoi : buoi.filter((b) => b.don_vi === dv);
    const t = tongHopTuBuoi(bs, 0);
    const nguon = dv === 'TONG' ? clsDv : (clsMap.has(dv) ? [clsMap.get(dv)!] : []);
    const cls = Object.fromEntries(CLS_KEYS.map((k) => [k, nguon.reduce((s, r) => s + Number(r[k]), 0)])) as Record<ClsKey, number>;
    return {
      don_vi: dv, ten, so_buoi: t.so_buoi, so_doan: t.so_doan, hien_co: t.hien_co, da_xac_nhan: t.da_xac_nhan,
      thua: t.thua, thieu: t.thieu, chenh_lech: t.chenh_lech,
      co_tt_ksk: nguon.reduce((s, r) => s + Number(r.co_tt_ksk), 0),
      cls,
    };
  };
  const theo_don_vi = [
    dongDonVi('TN', DON_VI.TN), dongDonVi('LK', DON_VI.LK), dongDonVi('VK', DON_VI.VK), dongDonVi('TONG', 'Cộng'),
  ];

  return { theo_user, theo_don_vi, kho_chung: dem.kho_chung, de_nghi_cho: dem.de_nghi_cho, the: tongHopTuBuoi(buoi, dem.kho_ca_nhan) };
}
