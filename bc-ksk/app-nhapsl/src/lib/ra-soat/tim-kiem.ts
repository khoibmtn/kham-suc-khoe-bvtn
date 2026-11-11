import type postgres from 'postgres';
import type { AuthUser } from '@/lib/auth/guard';
import type { KetQuaTimKiem, UserNgan } from '@/lib/api-types';
import { getSql } from '@/db/client';
import { khongDau } from '@/lib/text';
import { LoiNghiepVu } from './loi';
import { layBuoiCoQuyen } from './buoi';
import { COT_HO_SO, mapHoSo, type Row } from './ho-so';
import { iso, laAdmin } from './quyen';

type Sql = postgres.Sql;
type Frag = postgres.PendingQuery<postgres.Row[]>;

export type PhamViTimKiem = 'buoi' | 'cua_toi' | 'kho_chung' | 'tat_ca';
export const GIOI_HAN_TIM_KIEM = 200;
export const LOI_TU_KHOA = 'Nhập ít nhất 2 ký tự (họ tên, năm sinh, ≥4 số CCCD…)';

export type TuKhoa =
  | { loai: 'chu'; gia_tri: string }      // chỉ chữ → đầu một từ của họ tên
  | { loai: 'so4'; gia_tri: string }      // đúng 4 số → năm sinh hoặc chứa trong CCCD/mã KCB/SĐT/thẻ
  | { loai: 'so'; gia_tri: string }       // ≥5 số → chứa trong CCCD/mã KCB/SĐT/thẻ
  | { loai: 'chu_so'; gia_tri: string };  // chữ + số → thẻ BHYT hoặc mã KCB

/** Thuần: bỏ dấu, tách khoảng trắng, loại ký tự lạ, phân loại; token 1–3 số bị bỏ. */
export function phanTichTuKhoa(q: string): TuKhoa[] {
  const kq: TuKhoa[] = [];
  for (const tho of khongDau(q).split(' ')) {
    const t = tho.replace(/[^a-z0-9]/g, '');
    if (!t) continue;
    if (/^[a-z]+$/.test(t)) kq.push({ loai: 'chu', gia_tri: t });
    else if (/^\d+$/.test(t)) {
      if (t.length === 4) kq.push({ loai: 'so4', gia_tri: t });
      else if (t.length >= 5) kq.push({ loai: 'so', gia_tri: t });
    } else kq.push({ loai: 'chu_so', gia_tri: t });
  }
  return kq;
}

type RowTK = Row & {
  vi_tri: KetQuaTimKiem['vi_tri']; don_vi_goi_y: string; kho_user_id: number | null; tong_khop: string | number;
  b_id: number | null; ma_buoi: string | null; b_don_vi: 'TN' | 'LK' | 'VK' | null; ngay_kham: string | null;
  b_trang_thai: string | null; b_phu_trach: number | null; pt_username: string | null; pt_ho_ten: string | null;
  ku_username: string | null; ku_ho_ten: string | null;
  chuyen_tu: string; chuyen_boi: number | null; chuyen_luc: Date | null; chuyen_ly_do: string;
  cb_username: string | null; cb_ho_ten: string | null;
};

const userNgan = (id: number | null, username: string | null, hoTen: string | null): UserNgan | null =>
  id === null || username === null ? null : { id, username, ho_ten: hoTen ?? '' };

function dieuKienTuKhoa(sql: Sql, t: TuKhoa): Frag {
  const chua = '%' + t.gia_tri + '%';
  switch (t.loai) {
    case 'chu':
      return sql`h.ho_ten_kd ~ ${'(^| )' + t.gia_tri}`;
    case 'so4':
      return sql`(h.nam_sinh = ${Number(t.gia_tri)} OR h.cccd LIKE ${chua} OR h.ma_kcb LIKE ${chua} OR h.so_dt LIKE ${chua} OR h.so_the_bhyt LIKE ${chua})`;
    case 'so':
      return sql`(h.cccd LIKE ${chua} OR h.ma_kcb LIKE ${chua} OR h.so_dt LIKE ${chua} OR h.so_the_bhyt LIKE ${chua})`;
    case 'chu_so':
      return sql`(lower(h.so_the_bhyt) LIKE ${chua} OR lower(h.ma_kcb) LIKE ${chua})`;
  }
}

export async function layKetQuaTheoId(sql: Sql, user: AuthUser, id: number): Promise<KetQuaTimKiem> {
  const { ket_qua } = await truyVanKetQua(sql, user, sql`h.id = ${id}`, null);
  if (!ket_qua[0]) throw new LoiNghiepVu(404, 'Không tìm thấy hồ sơ');
  return ket_qua[0];
}

export async function timKiem(
  user: AuthUser,
  p: { q: string; pham_vi: PhamViTimKiem; buoi?: string | null },
  sqlIn?: Sql,
): Promise<{ ket_qua: KetQuaTimKiem[]; tong: number; gioi_han: number | null }> {
  const sql = sqlIn ?? getSql();
  const q = p.q.trim();
  const tuKhoa = q.length < 2 ? [] : phanTichTuKhoa(q);
  if (tuKhoa.length === 0) throw new LoiNghiepVu(400, LOI_TU_KHOA);

  let phamVi: Frag;
  let gioiHan: number | null = GIOI_HAN_TIM_KIEM;
  switch (p.pham_vi) {
    case 'buoi': {
      if (!p.buoi) throw new LoiNghiepVu(400, 'Thiếu tham số buoi (id hoặc mã buổi khám)');
      const b = await layBuoiCoQuyen(sql, user, p.buoi);
      phamVi = sql`h.vi_tri = 'buoi' AND h.buoi_id = ${b.id}`;
      gioiHan = null;
      break;
    }
    case 'cua_toi':
      phamVi = laAdmin(user)
        ? sql`h.vi_tri IN ('buoi', 'kho_ca_nhan')`
        : sql`((h.vi_tri = 'buoi' AND b.phu_trach_user_id = ${user.id}) OR (h.vi_tri = 'kho_ca_nhan' AND h.kho_user_id = ${user.id}))`;
      break;
    case 'kho_chung':
      phamVi = sql`h.vi_tri = 'kho_chung'`;
      break;
    case 'tat_ca':
      phamVi = sql`h.vi_tri <> 'an'`;
      break;
  }

  const dieuKien = dieuKienTatCaTuKhoa(sql, tuKhoa);
  return truyVanKetQua(sql, user, sql`${phamVi} AND ${dieuKien}`, gioiHan);
}

export function dieuKienTatCaTuKhoa(sql: Sql, tuKhoa: TuKhoa[]): Frag {
  return tuKhoa.map((t) => dieuKienTuKhoa(sql, t)).reduce<Frag>((a, f) => sql`${a} AND ${f}`, sql`TRUE`);
}

/** Thuần: q rỗng → []; q có nhưng không token hợp lệ → 400. Dùng cho kho chung (q tùy chọn). */
export function tuKhoaTuyChon(q: string): TuKhoa[] {
  const t = q.trim();
  if (t === '') return [];
  const tk = t.length < 2 ? [] : phanTichTuKhoa(t);
  if (tk.length === 0) throw new LoiNghiepVu(400, LOI_TU_KHOA);
  return tk;
}

/** Truy vấn dùng chung: điều kiện `where` (alias h, b) → KetQuaTimKiem + tổng khớp (trước giới hạn). */
export async function truyVanKetQua(
  sql: Sql,
  user: AuthUser,
  where: Frag,
  gioiHan: number | null,
): Promise<{ ket_qua: KetQuaTimKiem[]; tong: number; gioi_han: number | null }> {
  const gioiHanSql = gioiHan === null ? sql`` : sql`LIMIT ${gioiHan}`;
  const rows = await sql<RowTK[]>`
    SELECT ${sql.unsafe(COT_HO_SO)}, h.vi_tri, h.don_vi_goi_y, h.kho_user_id,
           h.chuyen_tu, h.chuyen_boi, h.chuyen_luc, h.chuyen_ly_do, cb.username AS cb_username, cb.ho_ten AS cb_ho_ten,
           b.id AS b_id, b.ma_buoi, b.don_vi AS b_don_vi, b.ngay_kham, b.trang_thai AS b_trang_thai,
           b.phu_trach_user_id AS b_phu_trach, pt.username AS pt_username, pt.ho_ten AS pt_ho_ten,
           ku.username AS ku_username, ku.ho_ten AS ku_ho_ten,
           count(*) OVER() AS tong_khop
    FROM ho_so h
    LEFT JOIN users xn ON xn.id = h.xac_nhan_by
    LEFT JOIN buoi_kham b ON b.id = h.buoi_id
    LEFT JOIN users pt ON pt.id = b.phu_trach_user_id
    LEFT JOIN users ku ON ku.id = h.kho_user_id
    LEFT JOIN users cb ON cb.id = h.chuyen_boi
    WHERE ${where}
    ORDER BY (b.id IS NULL),
             CASE COALESCE(b.don_vi, h.don_vi_goi_y) WHEN 'TN' THEN 0 WHEN 'LK' THEN 1 WHEN 'VK' THEN 2 ELSE 3 END,
             b.ngay_kham, h.id
    ${gioiHanSql}`;

  const ketQua: KetQuaTimKiem[] = rows.map((r) => {
    let coQuyenSua = false;
    if (r.vi_tri === 'buoi') coQuyenSua = (laAdmin(user) || r.b_phu_trach === user.id) && r.b_trang_thai !== 'da_xac_nhan';
    else if (r.vi_tri === 'kho_ca_nhan') coQuyenSua = laAdmin(user) || r.kho_user_id === user.id;
    else coQuyenSua = laAdmin(user);
    return {
      ...mapHoSo(r),
      vi_tri: r.vi_tri,
      buoi: r.b_id !== null && r.ma_buoi !== null && r.b_don_vi !== null && r.ngay_kham !== null
        ? { id: r.b_id, ma_buoi: r.ma_buoi, don_vi: r.b_don_vi, ngay_kham: r.ngay_kham, phu_trach: userNgan(r.b_phu_trach, r.pt_username, r.pt_ho_ten) }
        : null,
      kho_cua: userNgan(r.kho_user_id, r.ku_username, r.ku_ho_ten),
      don_vi_goi_y: r.don_vi_goi_y,
      co_quyen_sua: coQuyenSua,
      chuyen: r.chuyen_tu
        ? { tu: r.chuyen_tu, boi: userNgan(r.chuyen_boi, r.cb_username, r.cb_ho_ten), luc: iso(r.chuyen_luc), ly_do: r.chuyen_ly_do }
        : null,
    };
  });
  // Không có dòng nào → tổng 0 (count OVER() chỉ có khi có dòng). Với phạm vi buổi: tong = số dòng.
  const tong = rows.length === 0 ? 0 : Number(rows[0].tong_khop);
  return { ket_qua: ketQua, tong, gioi_han: gioiHan };
}
