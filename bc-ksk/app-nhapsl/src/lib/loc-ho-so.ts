// Pure client/server-side filter for records of one exam session (docs/01 mục 4.4).
// Free-text search is NOT done here — it goes through GET /api/tim-kiem (single matching
// implementation on the server); pass the matching ids as `idsKhopTimKiem`.
import type { HoSoDong } from './api-types';
import { CLS_KEYS, type ClsKey } from './cls';

export type BaTrangThai = 'tat_ca' | 'co' | 'khong';

export type BoLoc = {
  xac_nhan: 'tat_ca' | 'da' | 'chua';
  cls: Record<ClsKey, BaTrangThai>;
  tt_ksk: BaTrangThai;
  nguon: 'tat_ca' | 'his' | 'them_tay' | 'kho_chung'; // his = from package, not received from shared pool
  da_sua: BaTrangThai;                                 // co = differs from package values
  canh_bao: string;                                    // '' = all; otherwise a warning code
};

export const BO_LOC_MAC_DINH: BoLoc = {
  xac_nhan: 'tat_ca',
  cls: Object.fromEntries(CLS_KEYS.map((k) => [k, 'tat_ca'])) as Record<ClsKey, BaTrangThai>,
  tt_ksk: 'tat_ca',
  nguon: 'tat_ca',
  da_sua: 'tat_ca',
  canh_bao: '',
};

/** Identity fields that count as "edited per paper" when they differ from the package. */
const TRUONG_NHAN_THAN = ['ma_kcb', 'ho_ten', 'gioi_tinh', 'nam_sinh', 'cccd', 'dia_chi_chi_tiet'] as const;

/** True when any identity field or CLS flag differs from the latest package value (src). Manual records → false. */
export function khacGoc(h: HoSoDong): boolean {
  if (!h.src) return false;
  for (const f of TRUONG_NHAN_THAN) if (String(h[f]) !== String(h.src[f])) return true;
  for (const k of CLS_KEYS) if (h.cls[k] !== h.src.cls[k]) return true;
  return false;
}

export function soBoLocDangBat(b: BoLoc): number {
  let n = 0;
  if (b.xac_nhan !== 'tat_ca') n++;
  for (const k of CLS_KEYS) if (b.cls[k] !== 'tat_ca') n++;
  if (b.tt_ksk !== 'tat_ca') n++;
  if (b.nguon !== 'tat_ca') n++;
  if (b.da_sua !== 'tat_ca') n++;
  if (b.canh_bao) n++;
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
  return true;
}

/** Apply filters (+ optional search-result ids, null = no search active). Keeps original order. */
export function locHoSo(list: HoSoDong[], b: BoLoc, idsKhopTimKiem: Set<number> | null): HoSoDong[] {
  return list.filter((h) => (idsKhopTimKiem === null || idsKhopTimKiem.has(h.id)) && khopBoLoc(h, b));
}
