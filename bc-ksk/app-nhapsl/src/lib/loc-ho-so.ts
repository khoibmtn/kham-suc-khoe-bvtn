// Pure client/server-side filter for records of one exam session (docs/01 mục 4.4).
// Free-text search is NOT done here — it goes through GET /api/tim-kiem (single matching
// implementation on the server); pass the matching ids as `idsKhopTimKiem`.
import type { HoSoDong } from './api-types';
import { CLS_KEYS, type ClsKey } from './cls';
import { chiSo, coSdt, kiemTraSo, tomTatSo } from './kiem-so';

export type BaTrangThai = 'tat_ca' | 'co' | 'khong';

export type BoLoc = {
  xac_nhan: 'tat_ca' | 'da' | 'chua';
  cls: Record<ClsKey, BaTrangThai>;
  tt_ksk: BaTrangThai;
  nguon: 'tat_ca' | 'his' | 'them_tay' | 'kho_chung'; // his = from package, not received from shared pool
  da_sua: BaTrangThai;                                 // co = differs from package values
  canh_bao: string;                                    // '' = all; otherwise a warning code
  nghi_nham_so?: BaTrangThai;                          // Phase 12: co = canh_bao_so non-empty
  co_ghi_chu?: BaTrangThai;                            // 13/11/2026: co = user note (ghi_chu) not blank
};

export const BO_LOC_MAC_DINH: BoLoc = {
  xac_nhan: 'tat_ca',
  cls: Object.fromEntries(CLS_KEYS.map((k) => [k, 'tat_ca'])) as Record<ClsKey, BaTrangThai>,
  tt_ksk: 'tat_ca',
  nguon: 'tat_ca',
  da_sua: 'tat_ca',
  canh_bao: '',
  nghi_nham_so: 'tat_ca',
  co_ghi_chu: 'tat_ca',
};

export function layCanhBaoSo(
  h: Pick<HoSoDong, 'cccd' | 'ma_kcb' | 'nam_sinh' | 'gioi_tinh'> & {
    so_dt?: string | null;
    canh_bao_so?: string[] | null;
  },
): string[] {
  if (Array.isArray(h.canh_bao_so)) {
    return h.canh_bao_so;
  }
  return tomTatSo(
    kiemTraSo({
      cccd: h.cccd,
      ma_kcb: h.ma_kcb,
      so_dt: coSdt(h.so_dt) ? chiSo(h.so_dt) : '',
      nam_sinh: h.nam_sinh,
      gioi_tinh: h.gioi_tinh,
    }),
  );
}

/** Identity fields that count as "edited per paper" when they differ from the package. */
const TRUONG_NHAN_THAN = ['ma_kcb', 'ho_ten', 'gioi_tinh', 'nam_sinh', 'cccd', 'dia_chi_chi_tiet'] as const;

/** True when any identity field or CLS flag differs from the latest package value (src). Manual records → false. */
export function khacGoc(h: HoSoDong): boolean {
  if (!h.src) return false;
  for (const f of TRUONG_NHAN_THAN) if (String(h[f]) !== String(h.src[f])) return true;
  for (const k of CLS_KEYS) if (h.cls[k] !== h.src.cls[k]) return true;
  return false;
}

/** The staff note has content (the auto "⚠ Xem lại số" line is not a note). */
export function coGhiChu(h: Pick<HoSoDong, 'ghi_chu'>): boolean {
  return (h.ghi_chu ?? '').trim() !== '';
}

export function soBoLocDangBat(b: BoLoc): number {
  let n = 0;
  if (b.xac_nhan !== 'tat_ca') n++;
  for (const k of CLS_KEYS) if (b.cls[k] !== 'tat_ca') n++;
  if (b.tt_ksk !== 'tat_ca') n++;
  if (b.nguon !== 'tat_ca') n++;
  if (b.da_sua !== 'tat_ca') n++;
  if (b.canh_bao) n++;
  if (b.nghi_nham_so && b.nghi_nham_so !== 'tat_ca') n++;
  if (b.co_ghi_chu && b.co_ghi_chu !== 'tat_ca') n++;
  return n;
}

const khop3 = (loc: BaTrangThai, v: boolean) => loc === 'tat_ca' || (loc === 'co') === v;

export function khopBoLoc(h: HoSoDong, b: BoLoc): boolean {
  if (b.xac_nhan === 'da' && !h.da_xac_nhan) return false;
  if (b.xac_nhan === 'chua' && h.da_xac_nhan) return false;
  for (const k of CLS_KEYS) if (!khop3(b.cls[k], h.cls[k] === 1)) return false;
  if (!khop3(b.tt_ksk, h.co_tt_ksk === 1)) return false;
  if (b.nguon === 'them_tay' && h.nguon !== 'them_tay') return false;
  if (b.nguon === 'kho_chung' && !h.nhan_tu_kho_chung) return false;
  if (b.nguon === 'his' && (h.nguon !== 'cowork' || h.nhan_tu_kho_chung)) return false;
  if (!khop3(b.da_sua, khacGoc(h))) return false;
  if (b.canh_bao && !h.canh_bao.includes(b.canh_bao)) return false;
  if (b.nghi_nham_so && b.nghi_nham_so !== 'tat_ca' && !khop3(b.nghi_nham_so, layCanhBaoSo(h).length > 0)) return false;
  if (b.co_ghi_chu && b.co_ghi_chu !== 'tat_ca' && !khop3(b.co_ghi_chu, coGhiChu(h))) return false;
  return true;
}

/** Apply filters (+ optional search-result ids, null = no search active). Keeps original order. */
export function locHoSo(list: HoSoDong[], b: BoLoc, idsKhopTimKiem: Set<number> | null): HoSoDong[] {
  return list.filter((h) => (idsKhopTimKiem === null || idsKhopTimKiem.has(h.id)) && khopBoLoc(h, b));
}
