import type postgres from 'postgres';
import type { AuthUser } from '@/lib/auth/guard';
import type { UserQuanLy } from '@/lib/api-types';
import { getSql } from '@/db/client';
import { hashPassword } from '@/lib/auth/password';
import { ghiNhatKy, type NhatKyEntry } from '@/lib/nhat-ky';
import { LoiNghiepVu } from './loi';
import { iso } from './quyen';

type Sql = postgres.Sql;
export const MAT_KHAU_MAC_DINH = '123456';

type Row = { id: number; username: string; ho_ten: string; role: 'admin' | 'nhan_vien'; active: boolean; last_seen_at: Date | null; so_buoi: number };
const map = (r: Row): UserQuanLy => ({
  id: r.id, username: r.username, ho_ten: r.ho_ten, role: r.role, active: r.active,
  last_seen_at: iso(r.last_seen_at), so_buoi: r.so_buoi,
});

async function layUser(sql: Sql, id: number): Promise<UserQuanLy | null> {
  const [r] = await sql<Row[]>`
    SELECT u.id, u.username, u.ho_ten, u.role, u.active, u.last_seen_at,
           (SELECT count(*)::int FROM buoi_kham b WHERE b.phu_trach_user_id = u.id) AS so_buoi
    FROM users u WHERE u.id = ${id}`;
  return r ? map(r) : null;
}

export async function danhSachUser(): Promise<UserQuanLy[]> {
  const rows = await getSql()<Row[]>`
    SELECT u.id, u.username, u.ho_ten, u.role, u.active, u.last_seen_at,
           (SELECT count(*)::int FROM buoi_kham b WHERE b.phu_trach_user_id = u.id) AS so_buoi
    FROM users u ORDER BY (u.role = 'admin') DESC, u.ho_ten, u.id`;
  return rows.map(map);
}

export async function taoUser(admin: AuthUser, b: { username: string; ho_ten: string; role: 'admin' | 'nhan_vien' }): Promise<UserQuanLy> {
  const hash = await hashPassword(MAT_KHAU_MAC_DINH);
  return getSql().begin(async (tx) => {
    const sql = tx as unknown as Sql;
    const [r] = await sql<{ id: number }[]>`
      INSERT INTO users (username, ho_ten, role, password_hash) VALUES (${b.username}, ${b.ho_ten}, ${b.role}, ${hash})
      ON CONFLICT (username) DO NOTHING RETURNING id`;
    if (!r) throw new LoiNghiepVu(400, 'Tên đăng nhập đã tồn tại');
    await ghiNhatKy({ userId: admin.id, hanhDong: 'tao_user', doiTuong: 'user', doiTuongId: r.id, ghiChu: `${b.username} (${b.role})` }, sql);
    return (await layUser(sql, r.id))!;
  });
}

export async function suaUser(admin: AuthUser, id: number, b: { ho_ten?: string; role?: 'admin' | 'nhan_vien'; active?: boolean }): Promise<UserQuanLy> {
  return getSql().begin(async (tx) => {
    const sql = tx as unknown as Sql;
    const [cu] = await sql<{ ho_ten: string; role: string; active: boolean }[]>`SELECT ho_ten, role, active FROM users WHERE id = ${id} FOR UPDATE`;
    if (!cu) throw new LoiNghiepVu(404, 'Không tìm thấy người dùng');
    if (id === admin.id) {
      if (b.active === false) throw new LoiNghiepVu(400, 'Bạn không thể tự khóa tài khoản của mình');
      if (b.role !== undefined && b.role !== 'admin') throw new LoiNghiepVu(400, 'Bạn không thể tự hạ quyền quản trị của mình');
    }
    const upd: Record<string, string | boolean> = {};
    const nk: NhatKyEntry[] = [];
    const log = (truong: string, c: unknown, m: unknown) =>
      nk.push({ userId: admin.id, hanhDong: 'sua_user', doiTuong: 'user', doiTuongId: id, truong, giaTriCu: String(c), giaTriMoi: String(m) });
    if (b.ho_ten !== undefined && b.ho_ten !== cu.ho_ten) { upd.ho_ten = b.ho_ten; log('ho_ten', cu.ho_ten, b.ho_ten); }
    let doiPhien = false;
    if (b.role !== undefined && b.role !== cu.role) { upd.role = b.role; log('role', cu.role, b.role); doiPhien = true; }
    if (b.active !== undefined && b.active !== cu.active) { upd.active = b.active; log('active', cu.active, b.active); if (!b.active) doiPhien = true; }
    if (nk.length > 0) {
      await sql`UPDATE users SET ${sql(upd)}${doiPhien ? sql`, session_version = session_version + 1` : sql``} WHERE id = ${id}`;
      await ghiNhatKy(nk, sql);
    }
    return (await layUser(sql, id))!;
  });
}

export async function datLaiMatKhau(admin: AuthUser, id: number): Promise<void> {
  const hash = await hashPassword(MAT_KHAU_MAC_DINH);
  await getSql().begin(async (tx) => {
    const sql = tx as unknown as Sql;
    const r = await sql`UPDATE users SET password_hash = ${hash}, session_version = session_version + 1 WHERE id = ${id} RETURNING id`;
    if (r.length === 0) throw new LoiNghiepVu(404, 'Không tìm thấy người dùng');
    await ghiNhatKy({ userId: admin.id, hanhDong: 'dat_lai_mat_khau', doiTuong: 'user', doiTuongId: id }, sql);
  });
}
