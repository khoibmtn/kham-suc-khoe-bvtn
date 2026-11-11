import type postgres from 'postgres';
import type { AuthUser } from '@/lib/auth/guard';
import type { BuoiTomTat, ClsMap, HoSoDong, HoSoSrc, HoSoSuaBody, NhatKyDong, UserNgan } from '@/lib/api-types';
import { CLS_KEYS } from '@/lib/cls';
import { ghiNhatKy, type NhatKyEntry } from '@/lib/nhat-ky';
import { khongDau } from '@/lib/text';
import { getSql } from '@/db/client';
import { LoiNghiepVu } from './loi';
import { LOI_BUOI_KHOA, LOI_KHONG_QUYEN_BUOI, iso, laAdmin } from './quyen';
import { truyVanBuoi } from './buoi';

type Sql = postgres.Sql;

const COT_HO_SO = `h.id, h.version, h.ma_ho_so, h.nguon, h.ma_kcb, h.ho_ten, h.gioi_tinh, h.nam_sinh, h.cccd,
  h.dia_chi_chi_tiet, h.ctm, h.glucose, h.ure, h.creatinin, h.got, h.gpt, h.tpt_nuoc_tieu, h.sieu_am, h.src,
  h.dia_chi_the, h.ngay_gio_dang_ky_his, h.cls_ghi_chu, h.co_tt_ksk, h.canh_bao, h.ghi_chu, h.ghi_chu_cowork,
  h.sua_nhan_than, h.sua_cls, h.nhan_tu_kho_chung, h.da_xac_nhan, h.xac_nhan_at, h.updated_at,
  h.xac_nhan_by, xn.username AS xn_username, xn.ho_ten AS xn_ho_ten`;

type Row = Record<string, unknown> & {
  id: number; version: number; ma_ho_so: string | null; nguon: 'cowork' | 'them_tay'; ma_kcb: string; ho_ten: string;
  gioi_tinh: 'Nam' | 'Nữ' | ''; nam_sinh: number; cccd: string; dia_chi_chi_tiet: string; src: HoSoSrc | null;
  dia_chi_the: string; ngay_gio_dang_ky_his: string; cls_ghi_chu: string; co_tt_ksk: 0 | 1; canh_bao: string[];
  ghi_chu: string; ghi_chu_cowork: string; sua_nhan_than: boolean; sua_cls: boolean; nhan_tu_kho_chung: boolean;
  da_xac_nhan: boolean; xac_nhan_by: number | null; xn_username: string | null; xn_ho_ten: string | null;
  xac_nhan_at: Date | null; updated_at: Date;
};

export function mapHoSo(r: Row): HoSoDong {
  const xnBy: UserNgan | null =
    r.xac_nhan_by !== null && r.xn_username !== null ? { id: r.xac_nhan_by, username: r.xn_username, ho_ten: r.xn_ho_ten ?? '' } : null;
  const cls = Object.fromEntries(CLS_KEYS.map((k) => [k, r[k] === 1 ? 1 : 0])) as ClsMap;
  return {
    id: r.id, version: r.version, ma_ho_so: r.ma_ho_so, nguon: r.nguon,
    ma_kcb: r.ma_kcb, ho_ten: r.ho_ten, gioi_tinh: r.gioi_tinh, nam_sinh: r.nam_sinh, cccd: r.cccd,
    dia_chi_chi_tiet: r.dia_chi_chi_tiet, cls, src: r.src ?? null,
    dia_chi_the: r.dia_chi_the, ngay_gio_dang_ky_his: r.ngay_gio_dang_ky_his, cls_ghi_chu: r.cls_ghi_chu,
    co_tt_ksk: r.co_tt_ksk, canh_bao: r.canh_bao ?? [], ghi_chu: r.ghi_chu, ghi_chu_cowork: r.ghi_chu_cowork,
    sua_nhan_than: r.sua_nhan_than, sua_cls: r.sua_cls, nhan_tu_kho_chung: r.nhan_tu_kho_chung,
    da_xac_nhan: r.da_xac_nhan, xac_nhan_by: xnBy, xac_nhan_at: iso(r.xac_nhan_at), updated_at: iso(r.updated_at) ?? '',
  };
}

/** Toàn bộ hồ sơ trong buổi: 1 truy vấn + JOIN user xác nhận. */
export async function hoSoCuaBuoi(sql: Sql, buoiId: number): Promise<HoSoDong[]> {
  const rows = await sql.unsafe<Row[]>(
    `SELECT ${COT_HO_SO} FROM ho_so h LEFT JOIN users xn ON xn.id = h.xac_nhan_by
     WHERE h.buoi_id = $1 AND h.vi_tri = 'buoi' ORDER BY h.id`,
    [buoiId],
  );
  return rows.map(mapHoSo);
}

async function layHoSoDong(sql: Sql, id: number): Promise<HoSoDong> {
  const rows = await sql.unsafe<Row[]>(
    `SELECT ${COT_HO_SO} FROM ho_so h LEFT JOIN users xn ON xn.id = h.xac_nhan_by WHERE h.id = $1`,
    [id],
  );
  if (!rows[0]) throw new LoiNghiepVu(404, 'Không tìm thấy hồ sơ');
  return mapHoSo(rows[0]);
}

type Khoa = {
  id: number; version: number; vi_tri: string; buoi_id: number | null; kho_user_id: number | null;
  ma_kcb: string; ho_ten: string; gioi_tinh: string; nam_sinh: number; cccd: string; dia_chi_chi_tiet: string;
  ghi_chu: string; da_xac_nhan: boolean; sua_nhan_than: boolean; sua_cls: boolean;
  ctm: number; glucose: number; ure: number; creatinin: number; got: number; gpt: number; tpt_nuoc_tieu: number; sieu_am: number;
};

/** Khóa hồ sơ (+ buổi) FOR UPDATE, kiểm quyền → 403, buổi khóa → 423, version lệch → 409. */
async function khoaVaKiem(tx: Sql, user: AuthUser, id: number, version: number | null, ghi: boolean): Promise<{ h: Khoa; buoiId: number | null }> {
  const [h] = await tx<Khoa[]>`SELECT id, version, vi_tri, buoi_id, kho_user_id, ma_kcb, ho_ten, gioi_tinh, nam_sinh, cccd,
      dia_chi_chi_tiet, ghi_chu, da_xac_nhan, sua_nhan_than, sua_cls,
      ctm, glucose, ure, creatinin, got, gpt, tpt_nuoc_tieu, sieu_am
    FROM ho_so WHERE id = ${id} FOR UPDATE`;
  if (!h) throw new LoiNghiepVu(404, 'Không tìm thấy hồ sơ');
  let khoa = false;
  if (h.vi_tri === 'buoi' && h.buoi_id !== null) {
    const [b] = await tx<{ phu_trach_user_id: number | null; trang_thai: string }[]>`
      SELECT phu_trach_user_id, trang_thai FROM buoi_kham WHERE id = ${h.buoi_id} FOR UPDATE`;
    if (!laAdmin(user) && b.phu_trach_user_id !== user.id) throw new LoiNghiepVu(403, LOI_KHONG_QUYEN_BUOI);
    khoa = b.trang_thai === 'da_xac_nhan';
  } else if (h.vi_tri === 'kho_ca_nhan') {
    if (!laAdmin(user) && h.kho_user_id !== user.id) throw new LoiNghiepVu(403, 'Hồ sơ này không thuộc kho của bạn');
  } else if (!laAdmin(user)) {
    throw new LoiNghiepVu(403, 'Bạn không có quyền với hồ sơ này');
  }
  if (ghi && khoa) throw new LoiNghiepVu(423, LOI_BUOI_KHOA);
  if (version !== null && h.version !== version) {
    throw new LoiNghiepVu(409, 'Hồ sơ vừa được người khác sửa, tải lại', { ho_so: await layHoSoDong(tx, id) });
  }
  return { h, buoiId: h.buoi_id };
}

const TRUONG_NHAN_THAN = ['ma_kcb', 'ho_ten', 'gioi_tinh', 'nam_sinh', 'cccd', 'dia_chi_chi_tiet'] as const;

export async function suaHoSo(user: AuthUser, id: number, body: HoSoSuaBody): Promise<HoSoDong> {
  return (await getSql().begin(async (tx) => {
    const { h } = await khoaVaKiem(tx as unknown as Sql, user, id, body.version, true);
    const sql = tx as unknown as Sql;
    const upd: Record<string, string | number | boolean> = {};
    const nk: NhatKyEntry[] = [];
    const log = (hanhDong: string, truong: string, cu: unknown, moi: unknown) =>
      nk.push({ userId: user.id, hanhDong, doiTuong: 'ho_so', doiTuongId: id, truong, giaTriCu: cu as string | number, giaTriMoi: moi as string | number });

    let doiNhanThan = false;
    for (const t of TRUONG_NHAN_THAN) {
      const moi = body[t];
      if (moi === undefined || moi === h[t]) continue;
      upd[t] = moi;
      log('sua_nhan_than', t, h[t], moi);
      doiNhanThan = true;
    }
    if (body.ho_ten !== undefined && body.ho_ten !== h.ho_ten) upd.ho_ten_kd = khongDau(body.ho_ten);
    let doiCls = false;
    for (const k of CLS_KEYS) {
      const moi = body.cls?.[k];
      if (moi === undefined || moi === h[k]) continue;
      upd[k] = moi;
      log('sua_cls', k, h[k], moi);
      doiCls = true;
    }
    if (body.ghi_chu !== undefined && body.ghi_chu !== h.ghi_chu) {
      upd.ghi_chu = body.ghi_chu;
      log('sua_ghi_chu', 'ghi_chu', h.ghi_chu, body.ghi_chu);
    }
    if (Object.keys(upd).length === 0) return layHoSoDong(sql, id);

    if (doiNhanThan) upd.sua_nhan_than = true;
    if (doiCls) upd.sua_cls = true;
    upd.version = h.version + 1;
    upd.updated_by = user.id;
    await sql`UPDATE ho_so SET ${sql(upd)}, updated_at = now() WHERE id = ${id}`;
    await ghiNhatKy(nk, sql);
    return layHoSoDong(sql, id);
  })) as HoSoDong;
}

export async function xacNhanHoSo(user: AuthUser, id: number, version: number, xacNhan: boolean): Promise<{ ho_so: HoSoDong; buoi: BuoiTomTat }> {
  return (await getSql().begin(async (tx) => {
    const sql = tx as unknown as Sql;
    const { h, buoiId } = await khoaVaKiem(sql, user, id, version, true);
    if (buoiId === null) throw new LoiNghiepVu(400, 'Chỉ xác nhận được hồ sơ thuộc một buổi khám');
    if (h.da_xac_nhan !== xacNhan) {
      await sql`UPDATE ho_so SET da_xac_nhan = ${xacNhan},
          xac_nhan_by = ${xacNhan ? user.id : null}, xac_nhan_at = ${xacNhan ? sql`now()` : null},
          version = ${h.version + 1}, updated_by = ${user.id}, updated_at = now()
        WHERE id = ${id}`;
      await ghiNhatKy({
        userId: user.id, hanhDong: xacNhan ? 'xac_nhan' : 'bo_xac_nhan', doiTuong: 'ho_so', doiTuongId: id,
        truong: 'da_xac_nhan', giaTriCu: h.da_xac_nhan ? '1' : '0', giaTriMoi: xacNhan ? '1' : '0',
      }, sql);
      // Buổi chưa chốt: đồng bộ trạng thái theo số hồ sơ đã xác nhận.
      await sql`UPDATE buoi_kham b SET trang_thai = CASE WHEN EXISTS (
            SELECT 1 FROM ho_so x WHERE x.buoi_id = b.id AND x.vi_tri = 'buoi' AND x.da_xac_nhan)
          THEN 'dang_ra_soat' ELSE 'chua_ra_soat' END
        WHERE b.id = ${buoiId} AND b.trang_thai <> 'da_xac_nhan'`;
    }
    const [buoi] = await truyVanBuoi(sql, user, { id: buoiId });
    return { ho_so: await layHoSoDong(sql, id), buoi };
  })) as { ho_so: HoSoDong; buoi: BuoiTomTat };
}

export async function lichSuHoSo(user: AuthUser, id: number): Promise<NhatKyDong[]> {
  const sql = getSql();
  // Kiểm quyền xem (không khóa, không kiểm version)
  const [h] = await sql<{ vi_tri: string; buoi_id: number | null; kho_user_id: number | null }[]>`
    SELECT vi_tri, buoi_id, kho_user_id FROM ho_so WHERE id = ${id}`;
  if (!h) throw new LoiNghiepVu(404, 'Không tìm thấy hồ sơ');
  if (!laAdmin(user)) {
    let ok = false;
    if (h.vi_tri === 'buoi' && h.buoi_id !== null) {
      const [b] = await sql<{ phu_trach_user_id: number | null }[]>`SELECT phu_trach_user_id FROM buoi_kham WHERE id = ${h.buoi_id}`;
      ok = b?.phu_trach_user_id === user.id;
    } else if (h.vi_tri === 'kho_ca_nhan') ok = h.kho_user_id === user.id;
    if (!ok) throw new LoiNghiepVu(403, LOI_KHONG_QUYEN_BUOI);
  }
  const rows = await sql<{
    at: Date; user_id: number | null; username: string | null; ho_ten: string | null;
    hanh_dong: string; truong: string | null; gia_tri_cu: string | null; gia_tri_moi: string | null; ghi_chu: string | null;
  }[]>`
    SELECT n.at, n.user_id, u.username, u.ho_ten, n.hanh_dong, n.truong, n.gia_tri_cu, n.gia_tri_moi, n.ghi_chu
    FROM nhat_ky n LEFT JOIN users u ON u.id = n.user_id
    WHERE n.doi_tuong = 'ho_so' AND n.doi_tuong_id = ${String(id)}
    ORDER BY n.at, n.id`;
  return rows.map((r) => ({
    at: iso(r.at) ?? '',
    user: r.user_id !== null && r.username !== null ? { id: r.user_id, username: r.username, ho_ten: r.ho_ten ?? '' } : null,
    hanh_dong: r.hanh_dong, truong: r.truong, gia_tri_cu: r.gia_tri_cu, gia_tri_moi: r.gia_tri_moi, ghi_chu: r.ghi_chu,
  }));
}
