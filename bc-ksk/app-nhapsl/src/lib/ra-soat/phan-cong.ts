import type postgres from 'postgres';
import type { AuthUser } from '@/lib/auth/guard';
import { getSql } from '@/db/client';
import { ghiNhatKy, type NhatKyEntry } from '@/lib/nhat-ky';
import { LoiNghiepVu } from './loi';

type Sql = postgres.Sql;
type BuoiPC = { id: number; ma_buoi: string; phu_trach_user_id: number | null; pt_username: string | null; nv_goi_y: string };

const luu = (sql: Sql, user: AuthUser, b: BuoiPC, userId: number | null, username: string, ghiChu?: string): Promise<unknown>[] => [
  sql`UPDATE buoi_kham SET phu_trach_user_id = ${userId} WHERE id = ${b.id}`,
  ghiNhatKy({
    userId: user.id, hanhDong: 'phan_cong', doiTuong: 'buoi_kham', doiTuongId: b.id, truong: 'phu_trach',
    giaTriCu: b.pt_username ?? '', giaTriMoi: username, ghiChu: ghiChu ?? null,
  } satisfies NhatKyEntry, sql),
];

/** Gán (hoặc bỏ gán khi userId = null) hàng loạt. Trả số buổi trong yêu cầu. */
export async function phanCong(user: AuthUser, buoiIds: number[], userId: number | null): Promise<{ so_buoi: number }> {
  const ids = [...new Set(buoiIds)];
  return getSql().begin(async (tx) => {
    const sql = tx as unknown as Sql;
    let username = '';
    if (userId !== null) {
      const [u] = await sql<{ username: string; active: boolean }[]>`SELECT username, active FROM users WHERE id = ${userId}`;
      if (!u) throw new LoiNghiepVu(400, 'Người được phân công không tồn tại');
      if (!u.active) throw new LoiNghiepVu(400, 'Người được phân công đang bị khóa');
      username = u.username;
    }
    const rows = await sql<BuoiPC[]>`
      SELECT b.id, b.ma_buoi, b.phu_trach_user_id, p.username AS pt_username, b.nv_goi_y
      FROM buoi_kham b LEFT JOIN users p ON p.id = b.phu_trach_user_id
      WHERE b.id IN ${sql(ids)} ORDER BY b.id FOR UPDATE OF b`;
    if (rows.length !== ids.length) throw new LoiNghiepVu(400, 'Có buổi khám không tồn tại');
    for (const b of rows) {
      if (b.phu_trach_user_id === userId) continue;
      await Promise.all(luu(sql, user, b, userId, username));
    }
    return { so_buoi: rows.length };
  });
}

/** Gán theo cột nv_goi_y (khớp users.username, không phân biệt hoa thường). */
export async function phanCongTheoGoiY(user: AuthUser, ghiDe: boolean): Promise<{ da_gan: number; bo_qua: string[] }> {
  return getSql().begin(async (tx) => {
    const sql = tx as unknown as Sql;
    const users = await sql<{ id: number; username: string }[]>`SELECT id, username FROM users WHERE active`;
    const theoTen = new Map(users.map((u) => [u.username.toLowerCase(), u]));
    const buoi = await sql<BuoiPC[]>`
      SELECT b.id, b.ma_buoi, b.phu_trach_user_id, p.username AS pt_username, b.nv_goi_y
      FROM buoi_kham b LEFT JOIN users p ON p.id = b.phu_trach_user_id
      ORDER BY b.id FOR UPDATE OF b`;
    let daGan = 0;
    const boQua: string[] = [];
    for (const b of buoi) {
      const goiY = b.nv_goi_y.trim().toLowerCase();
      if (!goiY) continue;
      if (!ghiDe && b.phu_trach_user_id !== null) continue;
      const u = theoTen.get(goiY);
      if (!u) { boQua.push(b.ma_buoi); continue; }
      if (b.phu_trach_user_id === u.id) continue;
      await Promise.all(luu(sql, user, b, u.id, u.username, 'theo gợi ý sổ đoàn'));
      daGan += 1;
    }
    return { da_gan: daGan, bo_qua: boQua };
  });
}
