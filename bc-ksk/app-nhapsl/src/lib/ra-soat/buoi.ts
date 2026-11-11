import type postgres from 'postgres';
import type { AuthUser } from '@/lib/auth/guard';
import type { BuoiTomTat, TrangThaiBuoi, UserNgan } from '@/lib/api-types';
import { LoiNghiepVu } from './loi';
import { coQuyenBuoi, iso, laAdmin, yeuCauQuyenBuoi } from './quyen';

type Sql = postgres.Sql;

export type LocBuoi = {
  id?: number;
  maBuoi?: string;
  donVi?: string;
  /** user_id | 'none' */
  phuTrach?: number | 'none';
  trangThai?: string;
  /** Nhân viên: chỉ buổi do mình phụ trách. */
  chiCuaUserId?: number;
};

type Row = {
  id: number; ma_buoi: string; don_vi: 'TN' | 'LK' | 'VK'; ten_don_vi: string; ngay_kham: string;
  diem_kham: string; doan_kham: string; nv_goi_y: string; so_doan_tong: number;
  phu_trach_user_id: number | null; trang_thai: TrangThaiBuoi; xac_nhan_at: Date | null; giai_trinh: string | null;
  pt_username: string | null; pt_ho_ten: string | null;
  xn_id: number | null; xn_username: string | null; xn_ho_ten: string | null;
  hien_co: number; da_xac_nhan: number; bo_sung: number;
};

const userNgan = (id: number | null, username: string | null, hoTen: string | null): UserNgan | null =>
  id === null || username === null ? null : { id, username, ho_ten: hoTen ?? '' };

function mapBuoi(r: Row, user: AuthUser): BuoiTomTat {
  const thua = Math.max(0, r.hien_co - r.so_doan_tong);
  const thieu = Math.max(0, r.so_doan_tong - r.hien_co);
  return {
    id: r.id,
    ma_buoi: r.ma_buoi,
    don_vi: r.don_vi,
    ten_don_vi: r.ten_don_vi,
    ngay_kham: r.ngay_kham,
    diem_kham: r.diem_kham,
    doan_kham: r.doan_kham,
    nv_goi_y: r.nv_goi_y,
    so_doan_tong: r.so_doan_tong,
    phu_trach: userNgan(r.phu_trach_user_id, r.pt_username, r.pt_ho_ten),
    trang_thai: r.trang_thai,
    xac_nhan_by: userNgan(r.xn_id, r.xn_username, r.xn_ho_ten),
    xac_nhan_at: iso(r.xac_nhan_at),
    giai_trinh: r.giai_trinh,
    hien_co: r.hien_co,
    da_xac_nhan: r.da_xac_nhan,
    chua_xac_nhan: r.hien_co - r.da_xac_nhan,
    thua,
    thieu,
    bo_sung: r.bo_sung,
    tien_do: r.hien_co === 0 ? 0 : Math.round((r.da_xac_nhan / r.hien_co) * 1000) / 10,
    co_quyen_sua: coQuyenBuoi(user, r.phu_trach_user_id) && r.trang_thai !== 'da_xac_nhan',
  };
}

/** MỘT câu SQL gộp (LEFT JOIN + count FILTER) cho cả danh sách lẫn một buổi. */
export async function truyVanBuoi(sql: Sql, user: AuthUser, loc: LocBuoi = {}): Promise<BuoiTomTat[]> {
  const w = (cond: boolean, frag: postgres.PendingQuery<postgres.Row[]>) => (cond ? frag : sql``);
  const rows = await sql<Row[]>`
    SELECT b.id, b.ma_buoi, b.don_vi, b.ten_don_vi, b.ngay_kham, b.diem_kham, b.doan_kham, b.nv_goi_y,
           b.so_doan_tong, b.phu_trach_user_id, b.trang_thai, b.xac_nhan_at, b.giai_trinh,
           pt.username AS pt_username, pt.ho_ten AS pt_ho_ten,
           xn.id AS xn_id, xn.username AS xn_username, xn.ho_ten AS xn_ho_ten,
           count(h.id)::int AS hien_co,
           (count(h.id) FILTER (WHERE h.da_xac_nhan))::int AS da_xac_nhan,
           (count(h.id) FILTER (WHERE h.nguon = 'them_tay' OR h.nhan_tu_kho_chung))::int AS bo_sung
    FROM buoi_kham b
    LEFT JOIN users pt ON pt.id = b.phu_trach_user_id
    LEFT JOIN users xn ON xn.id = b.xac_nhan_by
    LEFT JOIN ho_so h ON h.buoi_id = b.id AND h.vi_tri = 'buoi'
    WHERE TRUE
      ${w(loc.id !== undefined, sql`AND b.id = ${loc.id ?? 0}`)}
      ${w(loc.maBuoi !== undefined, sql`AND b.ma_buoi = ${loc.maBuoi ?? ''}`)}
      ${w(loc.donVi !== undefined, sql`AND b.don_vi = ${loc.donVi ?? ''}`)}
      ${w(loc.trangThai !== undefined, sql`AND b.trang_thai = ${loc.trangThai ?? ''}`)}
      ${w(loc.phuTrach === 'none', sql`AND b.phu_trach_user_id IS NULL`)}
      ${w(typeof loc.phuTrach === 'number', sql`AND b.phu_trach_user_id = ${typeof loc.phuTrach === 'number' ? loc.phuTrach : 0}`)}
      ${w(loc.chiCuaUserId !== undefined, sql`AND b.phu_trach_user_id = ${loc.chiCuaUserId ?? 0}`)}
    GROUP BY b.id, pt.id, xn.id
    ORDER BY CASE b.don_vi WHEN 'TN' THEN 0 WHEN 'LK' THEN 1 ELSE 2 END, b.ngay_kham, b.id`;
  return rows.map((r) => mapBuoi(r, user));
}

/** key toàn số → id, ngược lại → ma_buoi. Chưa kiểm quyền. */
export async function layBuoiTheoKey(sql: Sql, user: AuthUser, key: string): Promise<BuoiTomTat> {
  const loc: LocBuoi = /^\d+$/.test(key) ? { id: Number(key) } : { maBuoi: key };
  if (loc.id !== undefined && loc.id > 2_147_483_647) throw new LoiNghiepVu(404, 'Không tìm thấy buổi khám');
  const [b] = await truyVanBuoi(sql, user, loc);
  if (!b) throw new LoiNghiepVu(404, 'Không tìm thấy buổi khám');
  return b;
}

/** Như layBuoiTheoKey nhưng nhân viên không phụ trách → 403. */
export async function layBuoiCoQuyen(sql: Sql, user: AuthUser, key: string): Promise<BuoiTomTat> {
  const b = await layBuoiTheoKey(sql, user, key);
  yeuCauQuyenBuoi(user, b.phu_trach?.id ?? null);
  return b;
}

export async function danhSachBuoi(
  sql: Sql,
  user: AuthUser,
  q: { don_vi?: string | null; phu_trach?: string | null; trang_thai?: string | null },
): Promise<BuoiTomTat[]> {
  const loc: LocBuoi = {};
  if (q.don_vi) {
    if (!['TN', 'LK', 'VK'].includes(q.don_vi)) throw new LoiNghiepVu(400, 'Đơn vị không hợp lệ (TN, LK hoặc VK)');
    loc.donVi = q.don_vi;
  }
  if (q.trang_thai) {
    if (!['chua_ra_soat', 'dang_ra_soat', 'da_xac_nhan'].includes(q.trang_thai)) throw new LoiNghiepVu(400, 'Trạng thái không hợp lệ');
    loc.trangThai = q.trang_thai;
  }
  if (!laAdmin(user)) {
    loc.chiCuaUserId = user.id;
  } else if (q.phu_trach) {
    if (q.phu_trach === 'none') loc.phuTrach = 'none';
    else if (/^\d{1,9}$/.test(q.phu_trach)) loc.phuTrach = Number(q.phu_trach);
    else throw new LoiNghiepVu(400, 'Người phụ trách không hợp lệ');
  }
  return truyVanBuoi(sql, user, loc);
}
