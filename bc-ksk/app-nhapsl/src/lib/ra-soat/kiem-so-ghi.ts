// Phase 12 — phần phía máy chủ của kiểm soát nhập nhầm số (quy tắc nằm ở src/lib/kiem-so.ts).
import type postgres from 'postgres';
import { chiSo, coSdt, kiemTraSo, tomTatSo, vanDeKhiSua, type HoSoKiemSo, type VanDeSo } from '@/lib/kiem-so';
import { khongDau } from '@/lib/text';
import { LoiNghiepVu } from './loi';

type Sql = postgres.Sql | postgres.TransactionSql;

export const LOI_SO_NHAM = 'Số có thể bị nhập nhầm';
const GIOI_HAN_TRUNG_HIEN = 3;

/** Giá trị lưu cho SĐT: chuẩn hóa; "0" (đánh dấu không có) coi như trống. */
export function sdtHieuLuc(s: string | null | undefined): string {
  return coSdt(s) ? chiSo(s) : '';
}

/** Giá trị cột canh_bao_so của một hồ sơ. */
export function canhBaoSoCuaHoSo(h: HoSoKiemSo): string[] {
  return tomTatSo(kiemTraSo(h));
}

/**
 * Hồ sơ KHÁC (không ẩn) cùng CCCD / cùng mã KCB nhưng họ tên khác (không dấu) → cảnh báo TRUNG_HO_SO.
 * Thông điệp chỉ nêu số hồ sơ, đơn vị, ngày — không nêu họ tên người kia.
 */
export async function kiemTrungSo(
  sql: Sql,
  d: { cccd?: string; ma_kcb?: string; ho_ten: string; loai_tru_id?: number },
): Promise<VanDeSo[]> {
  const kd = khongDau(d.ho_ten);
  const out: VanDeSo[] = [];
  const tim = async (cot: 'cccd' | 'ma_kcb', gia: string, truong: 'cccd' | 'ma_kcb', nhan: string) => {
    if (!gia) return;
    const rows = await sql.unsafe<{ id: number; vi_tri: string; don_vi: string | null; dd_mm: string | null }[]>(
      `SELECT h.id, h.vi_tri, COALESCE(b.don_vi, NULLIF(h.don_vi_goi_y, '')) AS don_vi, to_char(b.ngay_kham, 'DD/MM') AS dd_mm
         FROM ho_so h LEFT JOIN buoi_kham b ON b.id = h.buoi_id
        WHERE h.${cot} = $1 AND h.vi_tri <> 'an' AND h.ho_ten_kd <> $2 AND h.id <> $3
        ORDER BY h.id LIMIT ${GIOI_HAN_TRUNG_HIEN}`,
      [gia, kd, d.loai_tru_id ?? 0],
    );
    for (const r of rows) {
      const noi = r.dd_mm ? `${r.don_vi ?? ''} · ${r.dd_mm}` : r.vi_tri === 'kho_chung' ? 'kho chung' : r.vi_tri === 'kho_ca_nhan' ? 'kho cá nhân' : (r.don_vi ?? '');
      out.push({ truong, muc: 'canh_bao', ma: 'TRUNG_HO_SO', thong_diep: `${nhan} trùng hồ sơ #${r.id} (${noi})` });
    }
  };
  await tim('cccd', d.cccd ?? '', 'cccd', 'CCCD');
  await tim('ma_kcb', d.ma_kcb ?? '', 'ma_kcb', 'Mã KCB');
  return out;
}

/**
 * Áp hợp đồng ghi: có 'loi' → 400 {van_de_so}; còn 'canh_bao' mà chưa bo_qua → 422 {van_de_so}.
 * Trả về các thông điệp cảnh báo đã bỏ qua (để ghi nhật ký) — rỗng nếu không có.
 */
export function ganCanhBao(vs: VanDeSo[], boQua: boolean): string[] {
  const loi = vs.find((v) => v.muc === 'loi');
  if (loi) throw new LoiNghiepVu(400, loi.thong_diep, { van_de_so: vs });
  const cb = vs.filter((v) => v.muc === 'canh_bao');
  if (cb.length === 0) return [];
  if (!boQua) throw new LoiNghiepVu(422, LOI_SO_NHAM, { van_de_so: vs });
  return cb.map((v) => v.thong_diep);
}

export const ghiChuBoQua = (tb: string[]): string | null => (tb.length ? `[Vẫn lưu dù cảnh báo: ${tb.join('; ')}]` : null);

/**
 * Vấn đề của lần sửa: chỉ các trường đang đổi. Nếu CCCD không đổi thì chỉ xét những điểm lệch do đổi năm sinh /
 * giới tính (một lỗi CCCD có sẵn từ trước không được chặn việc sửa năm sinh để chữa chính nó).
 */
export function vanDeLanSua(h: HoSoKiemSo, truongDoi: string[]): VanDeSo[] {
  const cccdDoi = truongDoi.includes('cccd');
  return vanDeKhiSua(h, truongDoi).filter(
    (v) => v.truong !== 'cccd' || cccdDoi || v.ma === 'CCCD_NAM_SINH' || v.ma === 'CCCD_GIOI_TINH',
  );
}

export type KetQuaKiemLai = { tong: number; coVanDe: number; capNhat: number; theoMa: Record<string, number>; theoMuc: Record<string, number> };

const LO_KIEM = 2000;

/** Tính lại canh_bao_so cho mọi hồ sơ (kể cả ẩn). Chỉ UPDATE dòng thay đổi; không ghi nhật ký, không đổi version. */
export async function tinhLaiCanhBaoSo(sql: Sql): Promise<KetQuaKiemLai> {
  const kq: KetQuaKiemLai = { tong: 0, coVanDe: 0, capNhat: 0, theoMa: {}, theoMuc: {} };
  let last = 0;
  for (;;) {
    const rows = await sql<{
      id: number; cccd: string; ma_kcb: string; so_dt: string; nam_sinh: number; gioi_tinh: string; canh_bao_so: string[];
    }[]>`SELECT id, cccd, ma_kcb, so_dt, nam_sinh, gioi_tinh, canh_bao_so FROM ho_so WHERE id > ${last} ORDER BY id LIMIT ${LO_KIEM}`;
    if (rows.length === 0) break;
    last = rows[rows.length - 1].id;
    const doi: { id: number; cb: string[] }[] = [];
    for (const r of rows) {
      kq.tong++;
      const vs = kiemTraSo(r);
      if (vs.length) kq.coVanDe++;
      for (const v of vs) {
        kq.theoMa[v.ma] = (kq.theoMa[v.ma] ?? 0) + 1;
        kq.theoMuc[v.muc] = (kq.theoMuc[v.muc] ?? 0) + 1;
      }
      const moi = tomTatSo(vs);
      const cu = r.canh_bao_so ?? [];
      if (moi.length !== cu.length || moi.some((x, i) => x !== cu[i])) doi.push({ id: r.id, cb: moi });
    }
    if (doi.length) {
      await sql`UPDATE ho_so h SET canh_bao_so = v.cb
        FROM jsonb_to_recordset(${sql.json(doi as never)}) AS v(id int, cb text[])
        WHERE h.id = v.id`;
      kq.capNhat += doi.length;
    }
  }
  return kq;
}
