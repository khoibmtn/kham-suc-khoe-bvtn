import type postgres from 'postgres';
import type { AuthUser } from '@/lib/auth/guard';
import type { BuoiTomTat } from '@/lib/api-types';
import { getSql } from '@/db/client';
import { DON_VI } from '@/lib/cls';
import { ghiNhatKy, type NhatKyEntry } from '@/lib/nhat-ky';
import { LoiNghiepVu } from './loi';
import { layBuoiTheoKey, truyVanBuoi } from './buoi';

type Sql = postgres.Sql;

export async function suaBuoi(admin: AuthUser, key: string, b: { diem_kham?: string; doan_kham?: string; so_doan_tong?: number }): Promise<BuoiTomTat> {
  const buoi = await layBuoiTheoKey(getSql(), admin, key);
  return getSql().begin(async (tx) => {
    const sql = tx as unknown as Sql;
    const [cu] = await sql<{ diem_kham: string; doan_kham: string; so_doan_tong: number }[]>`
      SELECT diem_kham, doan_kham, so_doan_tong FROM buoi_kham WHERE id = ${buoi.id} FOR UPDATE`;
    const upd: Record<string, string | number> = {};
    const nk: NhatKyEntry[] = [];
    for (const t of ['diem_kham', 'doan_kham', 'so_doan_tong'] as const) {
      const moi = b[t];
      if (moi === undefined || moi === cu[t]) continue;
      upd[t] = moi;
      nk.push({ userId: admin.id, hanhDong: 'sua_buoi', doiTuong: 'buoi_kham', doiTuongId: buoi.id, truong: t, giaTriCu: cu[t], giaTriMoi: moi });
    }
    if (nk.length > 0) {
      await sql`UPDATE buoi_kham SET ${sql(upd)} WHERE id = ${buoi.id}`;
      await ghiNhatKy(nk, sql);
    }
    return (await truyVanBuoi(sql, admin, { id: buoi.id }))[0];
  });
}

export async function themBuoi(admin: AuthUser, b: { don_vi: 'TN' | 'LK' | 'VK'; ngay_kham: string; diem_kham?: string; doan_kham?: string; so_doan_tong: number }): Promise<BuoiTomTat> {
  const maBuoi = `${b.don_vi}-${b.ngay_kham.replaceAll('-', '')}`;
  return getSql().begin(async (tx) => {
    const sql = tx as unknown as Sql;
    const [r] = await sql<{ id: number }[]>`
      INSERT INTO buoi_kham (ma_buoi, don_vi, ten_don_vi, ngay_kham, diem_kham, doan_kham, so_doan_tong, nguon)
      VALUES (${maBuoi}, ${b.don_vi}, ${DON_VI[b.don_vi]}, ${b.ngay_kham}, ${b.diem_kham ?? ''}, ${b.doan_kham ?? ''}, ${b.so_doan_tong}, 'admin_them')
      ON CONFLICT DO NOTHING RETURNING id`;
    if (!r) throw new LoiNghiepVu(400, `Buổi khám ${maBuoi} đã tồn tại`);
    await ghiNhatKy({ userId: admin.id, hanhDong: 'them_buoi', doiTuong: 'buoi_kham', doiTuongId: r.id, ghiChu: maBuoi }, sql);
    return (await truyVanBuoi(sql, admin, { id: r.id }))[0];
  });
}
