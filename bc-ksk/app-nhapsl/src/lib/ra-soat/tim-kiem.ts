import type postgres from 'postgres';
import type { AuthUser } from '@/lib/auth/guard';
import type { KetQuaTimKiem, UserNgan } from '@/lib/api-types';
import { getSql } from '@/db/client';
import { CLS_KEYS, type ClsKey } from '@/lib/cls';
import { coTheTim, tachTuKhoa, type TuKhoa as TuKhoaMo } from '@/lib/tim-mo';
import { LoiNghiepVu } from './loi';
import { layBuoiCoQuyen } from './buoi';
import { COT_HO_SO, mapHoSo, type Row } from './ho-so';
import { iso, laAdmin } from './quyen';

type Sql = postgres.Sql;
type Frag = postgres.PendingQuery<postgres.Row[]>;

export type PhamViTimKiem = 'buoi' | 'cua_toi' | 'kho_chung' | 'tat_ca';
export const GIOI_HAN_TIM_KIEM = 200;
export const LOI_TU_KHOA = 'Nhập ít nhất 2 ký tự (họ tên, năm sinh, ≥4 số CCCD…) hoặc chọn bộ lọc';

export type TuKhoa = TuKhoaMo;

/** Thuần: tách + phân loại theo `tim-mo.ts` (SO / MA / CHU). Ký tự điều khiển \u0001 bị loại. */
export function phanTichTuKhoa(q: string): TuKhoa[] {
  return tachTuKhoa(q.replace(/\u0001/g, ' '));
}

/** Bộ lọc bổ sung của GET /api/tim-kiem (AND với từ khóa). */
export type BoLoc = {
  don_vi?: 'TN' | 'LK' | 'VK';
  ngay?: string;
  cls?: Partial<Record<ClsKey, 'co' | 'khong'>>;
  xac_nhan?: 'da' | 'chua';
  phu_trach?: number;
  co_ghi_chu?: boolean;
  tt_ksk?: 'co' | 'khong';
  nguon?: 'his' | 'them_tay' | 'kho_chung';
  vi_tri?: 'buoi' | 'kho_ca_nhan' | 'kho_chung' | 'da_loai';
  nghi_nham_so?: boolean;        // Phase 12: true = có canh_bao_so; false = không có
};

export function coBoLoc(l: BoLoc | undefined): boolean {
  if (!l) return false;
  return Object.entries(l).some(([k, v]) => (k === 'cls' ? Object.keys((v as object) ?? {}).length > 0 : v !== undefined));
}

/** Điều kiện SQL cho bộ lọc (alias h, b). Mọi giá trị đi qua tham số; khóa cột lấy từ danh sách trắng. */
export function dieuKienBoLoc(sql: Sql, l: BoLoc): Frag {
  const dk: Frag[] = [];
  if (l.don_vi) dk.push(sql`COALESCE(b.don_vi, h.don_vi_goi_y) = ${l.don_vi}`);
  if (l.ngay) dk.push(sql`b.ngay_kham = ${l.ngay}::date`);
  for (const k of CLS_KEYS) {
    const v = l.cls?.[k];
    if (v) dk.push(sql`h.${sql(k)} = ${v === 'co' ? 1 : 0}`);
  }
  if (l.xac_nhan) dk.push(l.xac_nhan === 'da' ? sql`h.da_xac_nhan` : sql`NOT h.da_xac_nhan`);
  if (l.phu_trach !== undefined) dk.push(sql`b.phu_trach_user_id = ${l.phu_trach}`);
  // Owner 14/11/2026: "Có ghi chú" includes the automatic "Xem lại số" note (canh_bao_so), which disappears once fixed.
  if (l.co_ghi_chu !== undefined) {
    dk.push(l.co_ghi_chu
      ? sql`(btrim(h.ghi_chu) <> '' OR cardinality(h.canh_bao_so) > 0)`
      : sql`(btrim(h.ghi_chu) = '' AND cardinality(h.canh_bao_so) = 0)`);
  }
  if (l.tt_ksk) dk.push(sql`h.co_tt_ksk = ${l.tt_ksk === 'co' ? 1 : 0}`);
  if (l.nguon === 'his') dk.push(sql`(h.nguon = 'cowork' AND NOT h.nhan_tu_kho_chung)`);
  else if (l.nguon === 'them_tay') dk.push(sql`h.nguon = 'them_tay'`);
  else if (l.nguon === 'kho_chung') dk.push(sql`h.nhan_tu_kho_chung`);
  if (l.nghi_nham_so !== undefined) dk.push(l.nghi_nham_so ? sql`cardinality(h.canh_bao_so) > 0` : sql`cardinality(h.canh_bao_so) = 0`);
  if (l.vi_tri === 'da_loai') dk.push(sql`h.vi_tri IN ('kho_ca_nhan', 'kho_chung')`);
  else if (l.vi_tri) dk.push(sql`h.vi_tri = ${l.vi_tri}`);
  return dk.reduce<Frag>((a, f) => sql`${a} AND ${f}`, sql`TRUE`);
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

const escapeRegex = (t: string) => t.replace(/[.*+?^${}()|[\]\\\/-]/g, '\\$&');
const kd = (sql: Sql, col: string): Frag => sql`lower(unaccent(${sql.unsafe(col)}))`;
const VAN_BAN_CHU = (sql: Sql): Frag => sql`(h.ho_ten_kd || chr(1) || lower(unaccent(normalize(h.ghi_chu, NFC))))`;
export const TOI_DA_TOKEN_MA = 6;

/** Các token CHU theo thứ tự: tìm tuần tự trong họ tên ␁ ghi chú (token không vắt qua dấu phân cách). */
function dieuKienChu(sql: Sql, tokens: string[]): Frag {
  if (tokens.length === 0) return sql`TRUE`;
  return sql`${VAN_BAN_CHU(sql)} ~ ${tokens.map(escapeRegex).join('.*')}`;
}

function dieuKienSo(sql: Sql, tu: string): Frag {
  const chua = '%' + tu + '%';
  const namSinh = tu.length === 4 ? sql`h.nam_sinh = ${Number(tu)} OR ` : sql``;
  return sql`(${namSinh}${kd(sql, 'h.cccd')} LIKE ${chua} OR ${kd(sql, 'h.ma_kcb')} LIKE ${chua} OR ${kd(sql, 'h.so_dt')} LIKE ${chua} OR ${kd(sql, 'h.so_the_bhyt')} LIKE ${chua})`;
}

function dieuKienMa(sql: Sql, tu: string): Frag {
  const chua = '%' + tu + '%';
  return sql`(${kd(sql, 'h.so_the_bhyt')} LIKE ${chua} OR ${kd(sql, 'h.ma_kcb')} LIKE ${chua})`;
}

/**
 * Điều kiện cho cả câu hỏi — phản chiếu `khopHoSo` của tim-mo.ts:
 *  SO: từng token; MA: khớp thẻ/mã KCB, nếu không thì nhập vào dãy CHU (theo đúng vị trí ban đầu);
 *  CHU: cùng một regex có thứ tự. Token MA "rơi" vào dãy CHU tùy từng hồ sơ nên mở rộng theo tập con (≤ 2^6).
 */
export function dieuKienTatCaTuKhoa(sql: Sql, tuKhoa: TuKhoa[]): Frag {
  const ma = tuKhoa.filter((t) => t.loai === 'MA');
  if (ma.length > TOI_DA_TOKEN_MA) throw new LoiNghiepVu(400, 'Quá nhiều mã trong một lần tìm');
  const dkSo = tuKhoa.filter((t) => t.loai === 'SO').map((t) => dieuKienSo(sql, t.tu));
  const chung = dkSo.reduce<Frag>((a, f) => sql`${a} AND ${f}`, sql`TRUE`);
  if (ma.length === 0) return sql`${chung} AND ${dieuKienChu(sql, tuKhoa.filter((t) => t.loai === 'CHU').map((t) => t.tu))}`;

  const nhanh: Frag[] = [];
  for (let mask = 0; mask < 1 << ma.length; mask++) {
    const roi = new Set(ma.filter((_, i) => mask & (1 << i)).map((t) => t));
    const dkMa = ma.map((t) => (roi.has(t) ? sql`NOT ${dieuKienMa(sql, t.tu)}` : dieuKienMa(sql, t.tu)));
    const chuoi = tuKhoa.filter((t) => t.loai === 'CHU' || roi.has(t)).map((t) => t.tu);
    const dk = [...dkMa, dieuKienChu(sql, chuoi)].reduce<Frag>((a, f) => sql`${a} AND ${f}`, sql`TRUE`);
    nhanh.push(sql`(${dk})`);
  }
  const hoac = nhanh.reduce<Frag>((a, f, i) => (i === 0 ? f : sql`${a} OR ${f}`), sql`FALSE`);
  return sql`${chung} AND (${hoac})`;
}

export async function layKetQuaTheoId(sql: Sql, user: AuthUser, id: number): Promise<KetQuaTimKiem> {
  const { ket_qua } = await truyVanKetQua(sql, user, sql`h.id = ${id}`, null);
  if (!ket_qua[0]) throw new LoiNghiepVu(404, 'Không tìm thấy hồ sơ');
  return ket_qua[0];
}

export async function timKiem(
  user: AuthUser,
  p: { q: string; pham_vi: PhamViTimKiem; buoi?: string | null; loc?: BoLoc; trang?: number; co_trang?: number },
  sqlIn?: Sql,
): Promise<{ ket_qua: KetQuaTimKiem[]; tong: number; gioi_han: number | null; trang: number }> {
  const sql = sqlIn ?? getSql();
  const q = p.q.trim();
  const coLoc = coBoLoc(p.loc);
  // q không dùng được (rỗng / quá ngắn): chỉ chấp nhận khi có ít nhất một bộ lọc.
  const tuKhoa = coTheTim(q) ? phanTichTuKhoa(q) : [];
  if (tuKhoa.length === 0 && !coLoc) throw new LoiNghiepVu(400, LOI_TU_KHOA);

  let phamVi: Frag;
  // Paging (owner 14/11/2026): page size co_trang (≤ GIOI_HAN_TIM_KIEM), 1-based page `trang`.
  let gioiHan: number | null = Math.min(Math.max(p.co_trang ?? GIOI_HAN_TIM_KIEM, 1), GIOI_HAN_TIM_KIEM);
  const trang = Math.max(1, Math.floor(p.trang ?? 1));
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
  const dkLoc = p.loc && coLoc ? dieuKienBoLoc(sql, p.loc) : sql`TRUE`;
  const where = sql`${phamVi} AND ${dieuKien} AND ${dkLoc}`;
  const boQua = gioiHan === null ? 0 : (trang - 1) * gioiHan;
  const kq = await truyVanKetQua(sql, user, where, gioiHan, boQua);
  if (kq.ket_qua.length === 0 && boQua > 0) {
    // Page past the end: still report the real total so the UI can jump back.
    const [{ n }] = await sql<{ n: number }[]>`
      SELECT count(*)::int AS n FROM ho_so h LEFT JOIN buoi_kham b ON b.id = h.buoi_id WHERE ${where}`;
    kq.tong = n;
  }
  return { ...kq, trang: gioiHan === null ? 1 : trang };
}

/** Thuần: q rỗng → []; q có nhưng không token hợp lệ → 400. Dùng cho kho chung (q tùy chọn). */
export function tuKhoaTuyChon(q: string): TuKhoa[] {
  const t = q.trim();
  if (t === '') return [];
  const tk = coTheTim(t) ? phanTichTuKhoa(t) : [];
  if (tk.length === 0) throw new LoiNghiepVu(400, LOI_TU_KHOA);
  return tk;
}

/** Truy vấn dùng chung: điều kiện `where` (alias h, b) → KetQuaTimKiem + tổng khớp (trước giới hạn). */
export async function truyVanKetQua(
  sql: Sql,
  user: AuthUser,
  where: Frag,
  gioiHan: number | null,
  boQua = 0,
): Promise<{ ket_qua: KetQuaTimKiem[]; tong: number; gioi_han: number | null }> {
  const gioiHanSql = gioiHan === null ? sql`` : boQua > 0 ? sql`LIMIT ${gioiHan} OFFSET ${boQua}` : sql`LIMIT ${gioiHan}`;
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
