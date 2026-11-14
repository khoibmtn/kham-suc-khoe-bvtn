import type postgres from 'postgres';
import type { AuthUser } from '@/lib/auth/guard';
import type { BuoiTomTat } from '@/lib/api-types';
import { getSql } from '@/db/client';
import { ghiNhatKy } from '@/lib/nhat-ky';
import { LoiNghiepVu } from './loi';
import { laAdmin } from './quyen';
import { layBuoiCoQuyen, layBuoiTheoKey, truyVanBuoi } from './buoi';

type Sql = postgres.Sql;

export async function xacNhanBuoi(user: AuthUser, key: string, giaiTrinh?: string): Promise<{ buoi: BuoiTomTat }> {
  const b0 = await layBuoiCoQuyen(getSql(), user, key);
  return (await getSql().begin(async (tx) => {
    const sql = tx as unknown as Sql;
    const [b] = await sql<{ trang_thai: string; so_doan_tong: number }[]>`
      SELECT trang_thai, so_doan_tong FROM buoi_kham WHERE id = ${b0.id} FOR UPDATE`;
    if (b.trang_thai === 'da_xac_nhan') throw new LoiNghiepVu(400, 'Danh sách này đã được xác nhận');
    const [c] = await sql<{ hien_co: number; chua: number }[]>`
      SELECT count(*)::int AS hien_co, (count(*) FILTER (WHERE NOT da_xac_nhan))::int AS chua
      FROM ho_so WHERE buoi_id = ${b0.id} AND vi_tri = 'buoi'`;
    if (c.chua > 0) throw new LoiNghiepVu(400, `Còn ${c.chua} hồ sơ chưa xác nhận`);
    const gt = (giaiTrinh ?? '').trim();
    if (c.hien_co !== b.so_doan_tong && !gt) {
      throw new LoiNghiepVu(400, `Số hồ sơ (${c.hien_co}) lệch DS google sheet (${b.so_doan_tong}), cần giải trình`);
    }
    await sql`UPDATE buoi_kham SET trang_thai = 'da_xac_nhan', xac_nhan_by = ${user.id}, xac_nhan_at = now(),
        giai_trinh = ${gt || null} WHERE id = ${b0.id}`;
    await ghiNhatKy({
      userId: user.id, hanhDong: 'xac_nhan_buoi', doiTuong: 'buoi_kham', doiTuongId: b0.id,
      truong: 'trang_thai', giaTriCu: b.trang_thai, giaTriMoi: 'da_xac_nhan', ghiChu: gt || null,
    }, sql);
    return { buoi: (await truyVanBuoi(sql, user, { id: b0.id }))[0] };
  })) as { buoi: BuoiTomTat };
}

export async function moKhoaBuoi(user: AuthUser, key: string, lyDo?: string): Promise<{ buoi: BuoiTomTat }> {
  // Owner 14/11/2026: the assignee may cancel their own list confirmation to fix records; admin: any session.
  const ly = (lyDo ?? '').trim();
  const b0 = await layBuoiTheoKey(getSql(), user, key);
  if (!laAdmin(user) && b0.phu_trach?.id !== user.id) {
    throw new LoiNghiepVu(403, 'Chỉ người phụ trách buổi hoặc quản trị viên được hủy xác nhận danh sách');
  }
  if (!ly) throw new LoiNghiepVu(400, 'Cần ghi lý do hủy xác nhận danh sách');
  return (await getSql().begin(async (tx) => {
    const sql = tx as unknown as Sql;
    const [b] = await sql<{ trang_thai: string; giai_trinh: string | null; phu_trach_user_id: number | null }[]>`
      SELECT trang_thai, giai_trinh, phu_trach_user_id FROM buoi_kham WHERE id = ${b0.id} FOR UPDATE`;
    if (!laAdmin(user) && b.phu_trach_user_id !== user.id) {
      throw new LoiNghiepVu(403, 'Chỉ người phụ trách buổi hoặc quản trị viên được hủy xác nhận danh sách');
    }
    if (b.trang_thai !== 'da_xac_nhan') throw new LoiNghiepVu(400, 'Danh sách này chưa được xác nhận nên không cần hủy xác nhận');
    const [{ co }] = await sql<{ co: boolean }[]>`
      SELECT EXISTS (SELECT 1 FROM ho_so WHERE buoi_id = ${b0.id} AND vi_tri = 'buoi' AND da_xac_nhan) AS co`;
    const moi = co ? 'dang_ra_soat' : 'chua_ra_soat';
    await sql`UPDATE buoi_kham SET trang_thai = ${moi}, xac_nhan_by = NULL, xac_nhan_at = NULL, giai_trinh = NULL WHERE id = ${b0.id}`;
    await ghiNhatKy([
      { userId: user.id, hanhDong: 'mo_khoa_buoi', doiTuong: 'buoi_kham', doiTuongId: b0.id, truong: 'trang_thai', giaTriCu: 'da_xac_nhan', giaTriMoi: moi, ghiChu: ly },
      ...(b.giai_trinh ? [{ userId: user.id, hanhDong: 'mo_khoa_buoi', doiTuong: 'buoi_kham', doiTuongId: b0.id, truong: 'giai_trinh', giaTriCu: b.giai_trinh, giaTriMoi: null, ghiChu: ly }] : []),
    ], sql);
    return { buoi: (await truyVanBuoi(sql, user, { id: b0.id }))[0] };
  })) as { buoi: BuoiTomTat };
}
