import type postgres from 'postgres';
import type { AuthUser } from '@/lib/auth/guard';
import type { BuoiTomTat, HoSoDong, KetQuaTimKiem, ThemHoSoBody } from '@/lib/api-types';
import { getSql } from '@/db/client';
import { CLS_KEYS } from '@/lib/cls';
import { ghiNhatKy } from '@/lib/nhat-ky';
import { chiSo, coSdt } from '@/lib/kiem-so';
import { khongDau } from '@/lib/text';
import { LoiNghiepVu } from './loi';
import { LOI_BUOI_KHOA } from './quyen';
import { dongBoTrangThaiBuoi, layBuoiCoQuyen, truyVanBuoi } from './buoi';
import { layHoSoDong } from './ho-so';
import { canhBaoSoCuaHoSo, ganCanhBao, ghiChuBoQua, sdtHieuLuc, vanDeLanSua } from './kiem-so-ghi';
import { truyVanKetQua } from './tim-kiem';

type Sql = postgres.Sql;
type Frag = postgres.PendingQuery<postgres.Row[]>;

export type DauVetTrung = { ma_kcb?: string; cccd?: string; ho_ten?: string; nam_sinh?: number };
export const GIOI_HAN_TRUNG = 50;

/** Trùng: cùng CCCD (không rỗng) HOẶC cùng mã KCB (không rỗng) HOẶC cùng họ tên không dấu + năm sinh. Loại hồ sơ ẩn. */
export async function timTrung(sql: Sql, user: AuthUser, d: DauVetTrung): Promise<KetQuaTimKiem[]> {
  const dk: Frag[] = [];
  const cccd = (d.cccd ?? '').trim();
  const maKcb = (d.ma_kcb ?? '').trim();
  const hoTenKd = khongDau(d.ho_ten ?? '');
  if (cccd) dk.push(sql`h.cccd = ${cccd}`);
  if (maKcb) dk.push(sql`h.ma_kcb = ${maKcb}`);
  if (hoTenKd && d.nam_sinh !== undefined) dk.push(sql`(h.ho_ten_kd = ${hoTenKd} AND h.nam_sinh = ${d.nam_sinh})`);
  if (dk.length === 0) return [];
  const hoac = dk.reduce<Frag>((a, f) => sql`${a} OR ${f}`, sql`FALSE`);
  const { ket_qua } = await truyVanKetQua(sql, user, sql`h.vi_tri <> 'an' AND (${hoac})`, GIOI_HAN_TRUNG);
  return ket_qua;
}

export async function kiemTrung(user: AuthUser, d: DauVetTrung): Promise<{ trung: KetQuaTimKiem[] }> {
  return { trung: await timTrung(getSql(), user, d) };
}

export async function themHoSo(user: AuthUser, key: string, body: ThemHoSoBody): Promise<{ ho_so: HoSoDong; buoi: BuoiTomTat }> {
  const buoi0 = await layBuoiCoQuyen(getSql(), user, key);
  return (await getSql().begin(async (tx) => {
    const sql = tx as unknown as Sql;
    const [b] = await sql<{ id: number; ma_buoi: string; don_vi: string; trang_thai: string }[]>`
      SELECT id, ma_buoi, don_vi, trang_thai FROM buoi_kham WHERE id = ${buoi0.id} FOR UPDATE`;
    if (b.trang_thai === 'da_xac_nhan') throw new LoiNghiepVu(423, LOI_BUOI_KHOA);

    const lyDo = (body.ly_do_tao_moi ?? '').trim();
    // Chuẩn hóa số; kiểm số: lỗi chắc chắn → 400 (trước cả kiểm trùng).
    const cccd = chiSo(body.cccd);
    const maKcb = chiSo(body.ma_kcb);
    const soDt = sdtHieuLuc(body.so_dt);
    const truongCoGiaTri = ['nam_sinh', 'gioi_tinh', ...(cccd ? ['cccd'] : []), ...(maKcb ? ['ma_kcb'] : []), ...(coSdt(soDt) ? ['so_dt'] : [])];
    const soKiem = { cccd, ma_kcb: maKcb, so_dt: soDt, nam_sinh: body.nam_sinh, gioi_tinh: body.gioi_tinh };
    const vs = vanDeLanSua(soKiem, truongCoGiaTri);
    if (vs.some((v) => v.muc === 'loi')) ganCanhBao(vs, false);

    const trung = await timTrung(sql, user, { ma_kcb: maKcb, cccd, ho_ten: body.ho_ten, nam_sinh: body.nam_sinh });
    if (trung.length > 0 && !lyDo) throw new LoiNghiepVu(409, 'Có hồ sơ trùng', { trung });
    // Trùng CCCD / mã KCB đã được luồng 409 + lý do tạo mới ở trên xử lý, nên không kiểm TRUNG_HO_SO lần nữa ở đây.
    const daBoQua = ganCanhBao(vs, body.bo_qua_canh_bao_so === true);

    const cls = Object.fromEntries(CLS_KEYS.map((k) => [k, body.cls[k]]));
    const [moi] = await sql<{ id: number }[]>`
      INSERT INTO ho_so ${sql({
        nguon: 'them_tay', ma_ho_so: null, version: 1,
        ma_kcb: maKcb, ho_ten: body.ho_ten.trim(), ho_ten_kd: khongDau(body.ho_ten),
        gioi_tinh: body.gioi_tinh, nam_sinh: body.nam_sinh, cccd, so_dt: soDt, canh_bao_so: canhBaoSoCuaHoSo(soKiem),
        dia_chi_chi_tiet: body.dia_chi_chi_tiet ?? '', ghi_chu: body.ghi_chu ?? '', ...cls,
        don_vi_goi_y: b.don_vi, vi_tri: 'buoi', buoi_id: b.id, ma_buoi_ban_dau: b.ma_buoi,
        da_xac_nhan: true, xac_nhan_by: user.id, created_by: user.id, updated_by: user.id,
        xac_nhan_at: new Date(),
      })}
      RETURNING id`;
    await ghiNhatKy({
      userId: user.id, hanhDong: 'them_ho_so', doiTuong: 'ho_so', doiTuongId: moi.id,
      truong: 'vi_tri', giaTriMoi: b.ma_buoi,
      ghiChu: [lyDo, ghiChuBoQua(daBoQua)].filter(Boolean).join(' ') || null,
    }, sql);
    await dongBoTrangThaiBuoi(sql, b.id);
    return { ho_so: await layHoSoDong(sql, moi.id), buoi: (await truyVanBuoi(sql, user, { id: b.id }))[0] };
  })) as { ho_so: HoSoDong; buoi: BuoiTomTat };
}
