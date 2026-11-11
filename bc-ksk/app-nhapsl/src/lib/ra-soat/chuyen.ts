import type postgres from 'postgres';
import type { AuthUser } from '@/lib/auth/guard';
import type { BuoiTomTat, ChuyenBody, KetQuaTimKiem } from '@/lib/api-types';
import { getSql } from '@/db/client';
import { ghiNhatKy } from '@/lib/nhat-ky';
import { LoiNghiepVu } from './loi';
import { LOI_BUOI_KHOA, LOI_KHONG_QUYEN_BUOI, coQuyenBuoi, laAdmin } from './quyen';
import { dongBoTrangThaiBuoi, truyVanBuoi } from './buoi';
import { dieuKienTatCaTuKhoa, layKetQuaTheoId, tuKhoaTuyChon, truyVanKetQua } from './tim-kiem';

type Sql = postgres.Sql;

export type KetQuaChuyen = { ho_so: KetQuaTimKiem; buoi_cu: BuoiTomTat | null; buoi_moi: BuoiTomTat | null };

type Dich = { loai: 'kho_ca_nhan' } | { loai: 'kho_chung' } | { loai: 'buoi'; buoi: number | string };

type HsKhoa = {
  id: number; version: number; vi_tri: 'buoi' | 'kho_ca_nhan' | 'kho_chung' | 'an'; buoi_id: number | null;
  kho_user_id: number | null; da_xac_nhan: boolean; nhan_tu_kho_chung: boolean; ku_username: string | null;
};
type BuoiKhoa = { id: number; ma_buoi: string; phu_trach_user_id: number | null; trang_thai: string };

const INT_MAX = 2_147_483_647;

/** id hoặc ma_buoi → id buổi (không khóa). */
export async function giaiBuoi(sql: Sql, ref: number | string): Promise<number> {
  const s = String(ref).trim();
  let rows: { id: number }[];
  if (/^\d+$/.test(s)) {
    const n = Number(s);
    if (n < 1 || n > INT_MAX) throw new LoiNghiepVu(404, 'Không tìm thấy buổi khám');
    rows = await sql<{ id: number }[]>`SELECT id FROM buoi_kham WHERE id = ${n}`;
  } else {
    rows = await sql<{ id: number }[]>`SELECT id FROM buoi_kham WHERE ma_buoi = ${s}`;
  }
  if (!rows[0]) throw new LoiNghiepVu(404, 'Không tìm thấy buổi khám');
  return rows[0].id;
}

/**
 * Lõi chuyển/nhận về, chạy TRONG transaction của người gọi. Khóa hồ sơ rồi các buổi liên quan theo id tăng dần.
 * `version = null` bỏ kiểm khóa lạc quan (đồng ý đề nghị chuyển).
 */
export async function diChuyenTrongTx(
  sql: Sql,
  user: AuthUser,
  p: { id: number; version: number | null; dich: Dich; lyDo: string; che: 'chuyen' | 'nhan_ve' },
): Promise<{ buoiCuId: number | null; buoiMoiId: number | null }> {
  if (p.che === 'chuyen' && p.dich.loai === 'buoi' && p.lyDo.trim() === '') {
    throw new LoiNghiepVu(400, 'Chuyển sang buổi khám khác cần ghi lý do');
  }
  const [h] = await sql<HsKhoa[]>`
    SELECT h.id, h.version, h.vi_tri, h.buoi_id, h.kho_user_id, h.da_xac_nhan, h.nhan_tu_kho_chung, ku.username AS ku_username
    FROM ho_so h LEFT JOIN users ku ON ku.id = h.kho_user_id
    WHERE h.id = ${p.id} FOR UPDATE OF h`;
  if (!h) throw new LoiNghiepVu(404, 'Không tìm thấy hồ sơ');
  if (h.vi_tri === 'an') throw new LoiNghiepVu(400, 'Hồ sơ đã bị ẩn, không chuyển được');

  const dichBuoiId = p.dich.loai === 'buoi' ? await giaiBuoi(sql, p.dich.buoi) : null;
  const ids = [...new Set([h.buoi_id, dichBuoiId].filter((x): x is number => x !== null))].sort((a, b) => a - b);
  const buoiRows = ids.length === 0 ? [] : await sql<BuoiKhoa[]>`
    SELECT id, ma_buoi, phu_trach_user_id, trang_thai FROM buoi_kham WHERE id = ANY(${ids}::int[]) ORDER BY id FOR UPDATE`;
  const buoiTheoId = new Map(buoiRows.map((b) => [b.id, b]));
  const bNguon = h.buoi_id !== null ? buoiTheoId.get(h.buoi_id) ?? null : null;
  const bDich = dichBuoiId !== null ? buoiTheoId.get(dichBuoiId) ?? null : null;

  // Quyền nguồn
  if (p.che === 'nhan_ve') {
    if (h.vi_tri === 'buoi') throw new LoiNghiepVu(400, 'Hồ sơ đang ở một buổi khám, dùng chức năng chuyển');
    if (h.vi_tri === 'kho_ca_nhan' && !laAdmin(user) && h.kho_user_id !== user.id) {
      throw new LoiNghiepVu(403, 'Hồ sơ này thuộc kho cá nhân của người khác');
    }
  } else if (h.vi_tri === 'buoi') {
    if (!bNguon || !coQuyenBuoi(user, bNguon.phu_trach_user_id)) throw new LoiNghiepVu(403, LOI_KHONG_QUYEN_BUOI);
  } else if (h.vi_tri === 'kho_ca_nhan') {
    if (!laAdmin(user) && h.kho_user_id !== user.id) throw new LoiNghiepVu(403, 'Hồ sơ này không thuộc kho của bạn');
  } else if (!laAdmin(user)) {
    throw new LoiNghiepVu(403, 'Hồ sơ ở kho chung, hãy dùng "Nhận về"');
  }
  // Quyền đích (nhận về: phải phụ trách buổi đích)
  if (p.che === 'nhan_ve' && (!bDich || !coQuyenBuoi(user, bDich.phu_trach_user_id))) {
    throw new LoiNghiepVu(403, LOI_KHONG_QUYEN_BUOI);
  }
  // Khóa danh sách
  if ((bNguon && bNguon.trang_thai === 'da_xac_nhan') || (bDich && bDich.trang_thai === 'da_xac_nhan')) {
    throw new LoiNghiepVu(423, LOI_BUOI_KHOA);
  }
  if (h.da_xac_nhan) throw new LoiNghiepVu(400, 'Bỏ xác nhận trước khi chuyển');

  // Vị trí đích
  let viTriMoi: 'buoi' | 'kho_ca_nhan' | 'kho_chung';
  let buoiIdMoi: number | null = null;
  let khoUserMoi: number | null = null;
  let nhanMoi = h.nhan_tu_kho_chung;
  let nhanDich: string;
  if (p.dich.loai === 'buoi') {
    viTriMoi = 'buoi'; buoiIdMoi = dichBuoiId; nhanDich = bDich?.ma_buoi ?? '';
    if (h.vi_tri === 'kho_chung') nhanMoi = true;
  } else if (p.dich.loai === 'kho_ca_nhan') {
    viTriMoi = 'kho_ca_nhan'; khoUserMoi = user.id; nhanDich = `kho_ca_nhan:${user.username}`;
  } else {
    viTriMoi = 'kho_chung'; nhanDich = 'kho_chung'; nhanMoi = false;
  }
  const nhanNguon =
    h.vi_tri === 'buoi' ? bNguon?.ma_buoi ?? ''
    : h.vi_tri === 'kho_ca_nhan' ? `kho_ca_nhan:${h.ku_username ?? ''}`
    : 'kho_chung';
  if (viTriMoi === h.vi_tri && buoiIdMoi === h.buoi_id && khoUserMoi === h.kho_user_id) {
    throw new LoiNghiepVu(400, 'Hồ sơ đã ở vị trí này');
  }

  if (p.version !== null && h.version !== p.version) {
    throw new LoiNghiepVu(409, 'Hồ sơ vừa được người khác sửa, tải lại', { ho_so: await layKetQuaTheoId(sql, user, p.id) });
  }

  await sql`UPDATE ho_so SET vi_tri = ${viTriMoi}, buoi_id = ${buoiIdMoi}, kho_user_id = ${khoUserMoi},
      da_di_chuyen = TRUE, chuyen_tu = ${nhanNguon}, chuyen_boi = ${user.id}, chuyen_luc = now(), chuyen_ly_do = ${p.lyDo},
      nhan_tu_kho_chung = ${nhanMoi}, version = ${h.version + 1}, updated_by = ${user.id}, updated_at = now()
    WHERE id = ${p.id}`;
  await ghiNhatKy({
    userId: user.id, hanhDong: p.che, doiTuong: 'ho_so', doiTuongId: p.id,
    truong: 'vi_tri', giaTriCu: nhanNguon, giaTriMoi: nhanDich, ghiChu: p.lyDo || null,
  }, sql);
  for (const b of new Set([h.buoi_id, buoiIdMoi])) if (b !== null) await dongBoTrangThaiBuoi(sql, b);
  return { buoiCuId: h.buoi_id, buoiMoiId: buoiIdMoi };
}

async function dongGoi(sql: Sql, user: AuthUser, id: number, r: { buoiCuId: number | null; buoiMoiId: number | null }): Promise<KetQuaChuyen> {
  const buoi = async (b: number | null) => (b === null ? null : (await truyVanBuoi(sql, user, { id: b }))[0] ?? null);
  return { ho_so: await layKetQuaTheoId(sql, user, id), buoi_cu: await buoi(r.buoiCuId), buoi_moi: await buoi(r.buoiMoiId) };
}

export async function chuyenHoSo(user: AuthUser, id: number, body: ChuyenBody): Promise<KetQuaChuyen> {
  if (body.den === 'buoi' && (body.buoi === undefined || body.buoi === '')) throw new LoiNghiepVu(400, 'Thiếu buổi khám đích');
  return (await getSql().begin(async (tx) => {
    const sql = tx as unknown as Sql;
    const dich: Dich = body.den === 'buoi' ? { loai: 'buoi', buoi: body.buoi as number | string } : { loai: body.den };
    const r = await diChuyenTrongTx(sql, user, { id, version: body.version, dich, lyDo: (body.ly_do ?? '').trim(), che: 'chuyen' });
    return dongGoi(sql, user, id, r);
  })) as KetQuaChuyen;
}

export async function nhanVeHoSo(user: AuthUser, id: number, body: { version: number; buoi: number | string }): Promise<KetQuaChuyen> {
  return (await getSql().begin(async (tx) => {
    const sql = tx as unknown as Sql;
    const r = await diChuyenTrongTx(sql, user, { id, version: body.version, dich: { loai: 'buoi', buoi: body.buoi }, lyDo: '', che: 'nhan_ve' });
    return dongGoi(sql, user, id, r);
  })) as KetQuaChuyen;
}

export async function khoCaNhan(user: AuthUser, userId?: number): Promise<{ ho_so: KetQuaTimKiem[] }> {
  const sql = getSql();
  const chu = userId ?? user.id;
  if (chu !== user.id && !laAdmin(user)) throw new LoiNghiepVu(403, 'Chỉ quản trị viên xem được kho cá nhân của người khác');
  const { ket_qua } = await truyVanKetQua(sql, user, sql`h.vi_tri = 'kho_ca_nhan' AND h.kho_user_id = ${chu}`, null);
  return { ho_so: ket_qua };
}

export async function khoChung(user: AuthUser, p: { don_vi?: string | null; q?: string | null }): Promise<{ ho_so: KetQuaTimKiem[]; tong: number }> {
  const sql = getSql();
  if (p.don_vi && !['TN', 'LK', 'VK'].includes(p.don_vi)) throw new LoiNghiepVu(400, 'Đơn vị không hợp lệ (TN, LK hoặc VK)');
  const tuKhoa = tuKhoaTuyChon(p.q ?? '');
  const donVi = p.don_vi ? sql`AND h.don_vi_goi_y = ${p.don_vi}` : sql``;
  const { ket_qua, tong } = await truyVanKetQua(sql, user, sql`h.vi_tri = 'kho_chung' ${donVi} AND ${dieuKienTatCaTuKhoa(sql, tuKhoa)}`, null);
  return { ho_so: ket_qua, tong };
}
