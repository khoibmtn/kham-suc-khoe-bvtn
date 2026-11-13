// Mix-up control for the three identifier numbers (owner request 13/11/2026):
//   CCCD (citizen ID), mã KCB (HIS visit code), SĐT (phone). Shared by the UI (live validation while typing,
//   "Xem lại số" note + filter) and the server (validation on write, stored canh_bao_so for filtering).
//
// Facts used (checked on the 12.422 imported records, aggregates only):
//   - mã KCB: always 10 digits starting with "26" (HIS code of 2026).
//   - CCCD: 12 digits = [3 province code][1 gender+century][2 birth year][6 serial]; legacy CMND = 9 digits.
//       gender+century digit: 0 = Nam 1900s, 1 = Nữ 1900s, 2 = Nam 2000s, 3 = Nữ 2000s.
//   - SĐT: mobile 10 digits 0[35789]xxxxxxxx; landline 11 digits 02xxxxxxxxx; "0" / "" = none.
//
// Severity:
//   'loi'      — certainly wrong (wrong length, looks like another kind of number, same number in two fields).
//                Writes changing that field are rejected.
//   'canh_bao' — probably wrong (CCCD disagrees with birth year / gender, unknown province code, unusual mã KCB
//                or phone). Writes need an explicit "vẫn lưu" confirmation.

export type TruongSo = 'cccd' | 'ma_kcb' | 'so_dt';
export type MucSo = 'loi' | 'canh_bao';
export type VanDeSo = { truong: TruongSo; muc: MucSo; ma: string; thong_diep: string };

export type HoSoKiemSo = {
  cccd?: string | null;
  ma_kcb?: string | null;
  so_dt?: string | null;
  nam_sinh?: number | string | null;
  gioi_tinh?: string | null;
};

export const NHAN_TRUONG_SO: Record<TruongSo, string> = { cccd: 'CCCD', ma_kcb: 'Mã KCB', so_dt: 'SĐT' };

/** Province codes printed on CCCD (3 first digits), 63 provinces (TT 07/2016/TT-BCA). */
const MA_TINH = new Set(
  ('001 002 004 006 008 010 011 012 014 015 017 019 020 022 024 025 026 027 030 031 033 034 035 036 037 038 ' +
    '040 042 044 045 046 048 049 051 052 054 056 058 060 062 064 066 067 068 070 072 074 075 077 079 080 082 ' +
    '083 084 086 087 089 091 092 093 094 095 096').split(' '),
);

/** Keep digits only for comparison (staff often type spaces or dots). */
export function chiSo(s: string | null | undefined): string {
  return (s ?? '').replace(/[\s.\-]/g, '');
}

/** "0" or "" = no phone number (import placeholder). */
export function coSdt(s: string | null | undefined): boolean {
  const v = chiSo(s);
  return v !== '' && v !== '0';
}

const LA_MA_KCB = /^26\d{8}$/;
const LA_CCCD = /^0\d{11}$/;
const LA_DI_DONG = /^0[35789]\d{8}$/;
const LA_CO_DINH = /^02\d{9}$/;

function kieuSo(v: string): TruongSo | null {
  if (LA_MA_KCB.test(v)) return 'ma_kcb';
  if (LA_CCCD.test(v)) return 'cccd';
  if (LA_DI_DONG.test(v) || LA_CO_DINH.test(v)) return 'so_dt';
  return null;
}

const DANG: Record<TruongSo, string> = { cccd: 'số CCCD', ma_kcb: 'mã KCB', so_dt: 'số điện thoại' };

function kiemCccd(v: string, h: HoSoKiemSo, out: VanDeSo[]): void {
  const push = (muc: MucSo, ma: string, thong_diep: string): void => { out.push({ truong: 'cccd', muc, ma, thong_diep }); };
  if (!/^\d+$/.test(v)) return push('loi', 'CCCD_KY_TU', 'CCCD chỉ gồm chữ số');
  const k = kieuSo(v);
  if (k && k !== 'cccd') return push('loi', 'CCCD_LA_' + k.toUpperCase(), `CCCD có dạng ${DANG[k]}`);
  if (v.length === 9) return; // legacy CMND: nothing more to check
  if (v.length !== 12) return push('loi', 'CCCD_DO_DAI', `CCCD phải đủ 12 số (đang có ${v.length} số)`);
  if (!MA_TINH.has(v.slice(0, 3))) push('canh_bao', 'CCCD_MA_TINH', `3 số đầu CCCD (${v.slice(0, 3)}) không phải mã tỉnh`);
  const d = Number(v[3]);
  if (d > 3) return push('canh_bao', 'CCCD_THE_KY', `Số thứ 4 của CCCD (${d}) không hợp lệ`);
  const namCccd = (d <= 1 ? 1900 : 2000) + Number(v.slice(4, 6));
  const ns = Number(h.nam_sinh);
  if (Number.isFinite(ns) && ns > 0 && ns !== namCccd) {
    push('canh_bao', 'CCCD_NAM_SINH', `CCCD ứng với năm sinh ${namCccd}, hồ sơ ghi ${ns}`);
  }
  const gtCccd = d % 2 === 0 ? 'Nam' : 'Nữ';
  if ((h.gioi_tinh === 'Nam' || h.gioi_tinh === 'Nữ') && h.gioi_tinh !== gtCccd) {
    push('canh_bao', 'CCCD_GIOI_TINH', `CCCD là của người ${gtCccd}, hồ sơ ghi ${h.gioi_tinh}`);
  }
}

function kiemMaKcb(v: string, out: VanDeSo[]): void {
  const push = (muc: MucSo, ma: string, thong_diep: string): void => { out.push({ truong: 'ma_kcb', muc, ma, thong_diep }); };
  if (!/^\d+$/.test(v)) return push('loi', 'MA_KCB_KY_TU', 'Mã KCB chỉ gồm chữ số');
  const k = kieuSo(v);
  if (k && k !== 'ma_kcb') return push('loi', 'MA_KCB_LA_' + k.toUpperCase(), `Mã KCB có dạng ${DANG[k]}`);
  if (!LA_MA_KCB.test(v)) push('canh_bao', 'MA_KCB_DANG', 'Mã KCB thường gồm 10 số, bắt đầu bằng 26');
}

function kiemSdt(v: string, out: VanDeSo[]): void {
  const push = (muc: MucSo, ma: string, thong_diep: string): void => { out.push({ truong: 'so_dt', muc, ma, thong_diep }); };
  if (!/^\d+$/.test(v)) return push('loi', 'SDT_KY_TU', 'SĐT chỉ gồm chữ số');
  const k = kieuSo(v);
  if (k && k !== 'so_dt') return push('loi', 'SDT_LA_' + k.toUpperCase(), `SĐT có dạng ${DANG[k]}`);
  if (!k) push('canh_bao', 'SDT_DANG', 'SĐT di động phải 10 số bắt đầu 03/05/07/08/09 (máy bàn 11 số bắt đầu 02)');
}

/** All problems of one record's numbers. Empty fields are not checked (CCCD may be blank; phone "0" = none). */
export function kiemTraSo(h: HoSoKiemSo): VanDeSo[] {
  const out: VanDeSo[] = [];
  const cccd = chiSo(h.cccd);
  const ma = chiSo(h.ma_kcb);
  const sdt = coSdt(h.so_dt) ? chiSo(h.so_dt) : '';
  if (cccd) kiemCccd(cccd, h, out);
  if (ma) kiemMaKcb(ma, out);
  if (sdt) kiemSdt(sdt, out);
  const cap: [TruongSo, string, TruongSo, string][] = [
    ['cccd', cccd, 'ma_kcb', ma],
    ['cccd', cccd, 'so_dt', sdt],
    ['ma_kcb', ma, 'so_dt', sdt],
  ];
  for (const [a, va, b, vb] of cap) {
    if (va && va === vb) {
      out.push({ truong: b, muc: 'loi', ma: 'TRUNG_' + a.toUpperCase(), thong_diep: `${NHAN_TRUONG_SO[b]} trùng với ${NHAN_TRUONG_SO[a]}` });
    }
  }
  return out;
}

/** Problems that a write changing `truong_doi` must respect (only fields being changed are enforced). */
export function vanDeKhiSua(h: HoSoKiemSo, truongDoi: Iterable<string>): VanDeSo[] {
  const doi = new Set(truongDoi);
  // nam_sinh / gioi_tinh changes re-validate CCCD consistency.
  if (doi.has('nam_sinh') || doi.has('gioi_tinh')) doi.add('cccd');
  return kiemTraSo(h).filter((v) => doi.has(v.truong));
}

/** Short text stored in ho_so.canh_bao_so and shown as the "Xem lại số" note: "Mã KCB có dạng số CCCD". */
export function tomTatSo(vs: VanDeSo[]): string[] {
  return vs.map((v) => v.thong_diep);
}
