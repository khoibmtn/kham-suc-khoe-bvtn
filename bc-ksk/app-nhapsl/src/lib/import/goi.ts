// Đọc và kiểm hợp lệ gói nhập `nhapsl-import-1` (docs/02-DAC-TA-DU-LIEU.md mục 1–6).
// Thuần hàm: không đụng DB. Dùng lại cho CLI (`npm run import`) và trang Admin (GĐ7, file upload).
import { createHash } from 'node:crypto';
import { parse } from 'csv-parse/sync';
import { CLS } from '@/lib/cls';

export const SCHEMA_GOI = 'nhapsl-import-1';
export const TEN_FILE = ['manifest.json', 'buoi_kham.csv', 'ho_so.csv', 'nguoi_dung.csv'] as const;
export const DON_VI_HOP_LE = ['TN', 'LK', 'VK'] as const;
export type DonViGoi = (typeof DON_VI_HOP_LE)[number];

const COT_BUOI_BAT_BUOC = ['ma_buoi', 'don_vi', 'ten_don_vi', 'ngay_kham', 'so_doan_tong'];
const COT_SO_DOAN = [
  'so_doan_duoi_6', 'so_doan_6_18', 'so_doan_tu_18', 'so_doan_xn_mau',
  'so_doan_nuoc_tieu', 'so_doan_sieu_am', 'so_doan_co_kl', 'so_doan_cho_kl',
];
const COT_BUOI_TUY_CHON = ['diem_kham', 'doan_kham', 'nv_goi_y', ...COT_SO_DOAN];

const COT_CLS = CLS.map((c) => c.csv);
const COT_HO_SO_BAT_BUOC = [
  'ma_ho_so', 'vi_tri_ban_dau', 'ma_buoi', 'ho_ten', 'gioi_tinh', 'nam_sinh', ...COT_CLS, 'co_tt_ksk',
];
const COT_HO_SO_TUY_CHON = [
  'don_vi_goi_y', 'ma_kcb', 'cccd', 'so_the_bhyt', 'so_dt', 'dia_chi_chi_tiet', 'dia_chi_the',
  'ngay_gio_dang_ky_his', 'cls_ghi_chu', 'so_ksk', 'ky_so', 'ket_luan_phan_loai', 'canh_bao', 'ghi_chu_cowork',
];

const COT_USER_BAT_BUOC = ['username', 'ho_ten', 'vai_tro'];

export type Manifest = {
  schema: string;
  phien_ban: string;
  tao_luc?: string;
  tao_boi?: string;
  mo_ta?: string;
  so_dong: Record<string, number>;
  tong_theo_don_vi: Record<string, Record<string, number>>;
  sha256: Record<string, string>;
};

export type BuoiGoi = {
  ma_buoi: string;
  don_vi: DonViGoi;
  ten_don_vi: string;
  ngay_kham: string; // yyyy-mm-dd
  diem_kham: string;
  doan_kham: string;
  nv_goi_y: string;
  so_doan_tong: number;
  so_doan: Record<string, number | null>;
};

export type ClsGoi = Record<(typeof CLS)[number]['key'], 0 | 1>;

export type HoSoGoi = {
  ma_ho_so: string;
  vi_tri_ban_dau: 'buoi' | 'kho_chung';
  ma_buoi: string;
  don_vi_goi_y: string;
  ma_kcb: string;
  ho_ten: string;
  gioi_tinh: 'Nam' | 'Nữ' | ''; // '' khi gói ghi "Khác" hoặc trống — nhân viên sửa theo giấy
  nam_sinh: number;
  cccd: string;
  so_the_bhyt: string;
  so_dt: string;
  dia_chi_chi_tiet: string;
  dia_chi_the: string;
  ngay_gio_dang_ky_his: string;
  cls: ClsGoi;
  cls_ghi_chu: string;
  co_tt_ksk: 0 | 1;
  so_ksk: string;
  ky_so: 0 | 1 | null;
  ket_luan_phan_loai: string;
  canh_bao: string[];
  ghi_chu_cowork: string;
};

export type NguoiDungGoi = { username: string; ho_ten: string; vai_tro: 'admin' | 'nhan_vien' };

export type Goi = {
  manifest: Manifest;
  buoi: BuoiGoi[];
  hoSo: HoSoGoi[];
  nguoiDung: NguoiDungGoi[];
};

export type KetQuaGoi = {
  ok: boolean;
  errors: string[];
  warnings: string[];
  goi: Goi | null;
};

type Row = Record<string, string>;
const GIOI_HAN_LOI = 500;

class Gom {
  errors: string[] = [];
  warnings: string[] = [];
  boQua = 0;
  loi(m: string) {
    if (this.errors.length < GIOI_HAN_LOI) this.errors.push(m);
    else this.boQua++;
  }
  canhBao(m: string) {
    this.warnings.push(m);
  }
  ketThuc(): { errors: string[]; warnings: string[] } {
    const errors = [...this.errors];
    if (this.boQua > 0) errors.push(`… và ${this.boQua} lỗi khác (không liệt kê hết)`);
    return { errors, warnings: this.warnings };
  }
}

const aBuffer = (v: Buffer | string) => (typeof v === 'string' ? Buffer.from(v, 'utf8') : v);
const sha256 = (b: Buffer) => createHash('sha256').update(b).digest('hex');

/** dd/mm/yyyy → yyyy-mm-dd (null nếu không phải ngày hợp lệ). Không dùng Date để khỏi lệch múi giờ. */
export function ngayViet(s: string): string | null {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(s);
  if (!m) return null;
  const d = Number(m[1]), mo = Number(m[2]), y = Number(m[3]);
  if (mo < 1 || mo > 12 || d < 1) return null;
  const ngayTrongThang = new Date(Date.UTC(y, mo, 0)).getUTCDate();
  if (d > ngayTrongThang) return null;
  return `${m[3]}-${m[2]}-${m[1]}`;
}

function docCsv(ten: string, buf: Buffer, g: Gom): { cot: string[]; dong: Row[] } | null {
  let cot: string[] = [];
  try {
    const dong = parse(buf, {
      bom: true,
      columns: (h: string[]) => {
        cot = h.map((x) => x.trim());
        return cot;
      },
      relax_column_count: false,
      skip_empty_lines: true,
      cast: false,
    }) as Row[];
    return { cot, dong };
  } catch (e) {
    g.loi(`${ten}: không đọc được CSV (${(e as Error).message})`);
    return null;
  }
}

function kiemCot(ten: string, cot: string[], batBuoc: string[], tuyChon: string[], g: Gom): boolean {
  const co = new Set(cot);
  const thieu = batBuoc.filter((c) => !co.has(c));
  if (thieu.length) g.loi(`${ten}: thiếu cột bắt buộc: ${thieu.join(', ')}`);
  const biet = new Set([...batBuoc, ...tuyChon]);
  const thua = cot.filter((c) => !biet.has(c));
  if (thua.length) g.canhBao(`${ten}: có cột thừa (bỏ qua): ${thua.join(', ')}`);
  return thieu.length === 0;
}

const rong = (r: Row, c: string) => (r[c] ?? '').trim();

export function parseGoi(files: Record<string, Buffer | string>): KetQuaGoi {
  const g = new Gom();
  const xong = (goi: Goi | null): KetQuaGoi => {
    const { errors, warnings } = g.ketThuc();
    const ok = errors.length === 0;
    return { ok, errors, warnings, goi: ok ? goi : null };
  };

  // --- 0. Có đủ 4 file
  const buf: Record<string, Buffer> = {};
  for (const ten of TEN_FILE) {
    if (files[ten] === undefined) g.loi(`Thiếu file ${ten} trong gói`);
    else buf[ten] = aBuffer(files[ten]);
  }
  if (g.errors.length) return xong(null);

  // --- 1. Manifest
  let manifest: Manifest;
  try {
    manifest = JSON.parse(buf['manifest.json'].toString('utf8').replace(/^﻿/, '')) as Manifest;
  } catch (e) {
    g.loi(`manifest.json: không phải JSON hợp lệ (${(e as Error).message})`);
    return xong(null);
  }
  if (manifest.schema !== SCHEMA_GOI) {
    g.loi(`manifest.schema: cần "${SCHEMA_GOI}", gói có "${String(manifest.schema)}"`);
  }
  if (typeof manifest.phien_ban !== 'string' || !manifest.phien_ban.trim()) g.loi('manifest.phien_ban: trống');
  for (const k of ['so_dong', 'tong_theo_don_vi', 'sha256'] as const) {
    if (!manifest[k] || typeof manifest[k] !== 'object') g.loi(`manifest.${k}: thiếu hoặc sai kiểu`);
  }
  if (g.errors.length) return xong(null);

  // --- 2. sha256 trên bytes gốc
  for (const ten of ['buoi_kham.csv', 'ho_so.csv', 'nguoi_dung.csv']) {
    const mong = manifest.sha256[ten];
    if (!mong) g.loi(`manifest.sha256: thiếu mã băm của ${ten}`);
    else if (mong.toLowerCase() !== sha256(buf[ten])) g.loi(`${ten}: sha256 không khớp manifest (file bị sửa hoặc sai phiên bản)`);
  }

  // --- 3. Đọc CSV
  const csvBuoi = docCsv('buoi_kham.csv', buf['buoi_kham.csv'], g);
  const csvHoSo = docCsv('ho_so.csv', buf['ho_so.csv'], g);
  const csvUser = docCsv('nguoi_dung.csv', buf['nguoi_dung.csv'], g);
  if (!csvBuoi || !csvHoSo || !csvUser) return xong(null);

  const cotOk = [
    kiemCot('buoi_kham.csv', csvBuoi.cot, COT_BUOI_BAT_BUOC, COT_BUOI_TUY_CHON, g),
    kiemCot('ho_so.csv', csvHoSo.cot, COT_HO_SO_BAT_BUOC, COT_HO_SO_TUY_CHON, g),
    kiemCot('nguoi_dung.csv', csvUser.cot, COT_USER_BAT_BUOC, [], g),
  ];
  if (cotOk.includes(false)) return xong(null);

  // --- 4. Buổi khám
  const buoi: BuoiGoi[] = [];
  const maBuoi = new Map<string, BuoiGoi>();
  const khoaNgay = new Set<string>();
  csvBuoi.dong.forEach((r, i) => {
    const vt = `buoi_kham.csv dòng ${i + 2}`;
    const ma = rong(r, 'ma_buoi');
    if (!ma) { g.loi(`${vt}: ma_buoi trống`); return; }
    const nhan = `buoi_kham.csv ${ma}`;
    let hopLe = true;
    if (maBuoi.has(ma)) { g.loi(`${nhan}: ma_buoi trùng`); hopLe = false; }
    const dv = rong(r, 'don_vi');
    if (!(DON_VI_HOP_LE as readonly string[]).includes(dv)) { g.loi(`${nhan}: don_vi "${dv}" không thuộc TN/LK/VK`); hopLe = false; }
    const ngay = ngayViet(rong(r, 'ngay_kham'));
    if (!ngay) { g.loi(`${nhan}: ngay_kham "${r.ngay_kham}" không phải dd/mm/yyyy hợp lệ`); hopLe = false; }
    const tong = rong(r, 'so_doan_tong');
    if (!/^\d+$/.test(tong)) { g.loi(`${nhan}: so_doan_tong "${tong}" không phải số nguyên`); hopLe = false; }
    if (!rong(r, 'ten_don_vi')) { g.loi(`${nhan}: ten_don_vi trống`); hopLe = false; }
    const soDoan: Record<string, number | null> = {};
    for (const c of COT_SO_DOAN) {
      if (!(c in r)) continue;
      const v = rong(r, c);
      if (v === '') soDoan[c] = null;
      else if (/^\d+$/.test(v)) soDoan[c] = Number(v);
      else { g.loi(`${nhan}: ${c} "${v}" không phải số nguyên`); hopLe = false; }
    }
    if (hopLe && ngay) {
      const khoa = `${dv}|${ngay}`;
      if (khoaNgay.has(khoa)) { g.loi(`${nhan}: trùng (don_vi, ngay_kham) với buổi khác`); return; }
      khoaNgay.add(khoa);
    }
    if (!hopLe) { maBuoi.set(ma, null as unknown as BuoiGoi); return; }
    const b: BuoiGoi = {
      ma_buoi: ma, don_vi: dv as DonViGoi, ten_don_vi: rong(r, 'ten_don_vi'), ngay_kham: ngay!,
      diem_kham: rong(r, 'diem_kham'), doan_kham: rong(r, 'doan_kham'), nv_goi_y: rong(r, 'nv_goi_y'),
      so_doan_tong: Number(tong), so_doan: soDoan,
    };
    buoi.push(b);
    maBuoi.set(ma, b);
  });

  // --- 5. Người dùng
  const nguoiDung: NguoiDungGoi[] = [];
  const dsUser = new Set<string>();
  csvUser.dong.forEach((r, i) => {
    const vt = `nguoi_dung.csv dòng ${i + 2}`;
    const u = rong(r, 'username');
    if (!u) { g.loi(`${vt}: username trống`); return; }
    if (dsUser.has(u)) { g.loi(`${vt}: username "${u}" trùng`); return; }
    dsUser.add(u);
    if (!rong(r, 'ho_ten')) g.loi(`${vt}: ho_ten trống (${u})`);
    const vr = rong(r, 'vai_tro');
    if (vr !== 'admin' && vr !== 'nhan_vien') { g.loi(`${vt}: vai_tro "${vr}" không thuộc admin/nhan_vien (${u})`); return; }
    nguoiDung.push({ username: u, ho_ten: rong(r, 'ho_ten'), vai_tro: vr });
  });
  for (const b of buoi) {
    if (b.nv_goi_y && !dsUser.has(b.nv_goi_y)) g.canhBao(`buoi_kham.csv ${b.ma_buoi}: nv_goi_y "${b.nv_goi_y}" không có trong nguoi_dung.csv`);
  }

  // --- 6. Hồ sơ
  const hoSo: HoSoGoi[] = [];
  const dsMa = new Set<string>();
  csvHoSo.dong.forEach((r, i) => {
    const vt = `ho_so.csv dòng ${i + 2}`;
    const ma = rong(r, 'ma_ho_so');
    if (!ma) { g.loi(`${vt}: ma_ho_so trống`); return; }
    const nhan = `ho_so.csv ${ma}`;
    if (dsMa.has(ma)) { g.loi(`${nhan} (dòng ${i + 2}): ma_ho_so trùng`); return; }
    dsMa.add(ma);
    let hopLe = true;
    const vitri = rong(r, 'vi_tri_ban_dau');
    if (vitri !== 'buoi' && vitri !== 'kho_chung') { g.loi(`${nhan}: vi_tri_ban_dau "${vitri}" không thuộc buoi/kho_chung`); hopLe = false; }
    const mb = rong(r, 'ma_buoi');
    if (vitri === 'buoi') {
      if (!mb) { g.loi(`${nhan}: ma_buoi trống nhưng vi_tri_ban_dau=buoi`); hopLe = false; }
      else if (!maBuoi.has(mb)) { g.loi(`${nhan}: ma_buoi "${mb}" không có trong buoi_kham.csv`); hopLe = false; }
    }
    if (!rong(r, 'ho_ten')) { g.loi(`${nhan}: ho_ten trống`); hopLe = false; }
    let gt = rong(r, 'gioi_tinh');
    if (gt === 'Khác' || gt === '') {
      // Quyết định 11/11/2026: không từ chối gói, để trống cho nhân viên sửa theo hồ sơ giấy.
      g.canhBao(`${nhan}: gioi_tinh "${gt}" → để trống, nhân viên sửa theo giấy`);
      gt = '';
    } else if (gt !== 'Nam' && gt !== 'Nữ') { g.loi(`${nhan}: gioi_tinh "${gt}" không thuộc Nam/Nữ/Khác/trống`); hopLe = false; }
    const ns = rong(r, 'nam_sinh');
    if (!/^\d{4}$/.test(ns)) { g.loi(`${nhan}: nam_sinh "${ns}" không phải 4 chữ số`); hopLe = false; }
    const cls = {} as Record<string, 0 | 1>;
    for (const c of CLS) {
      const v = rong(r, c.csv);
      if (v !== '0' && v !== '1') { g.loi(`${nhan}: ${c.csv} "${v}" phải là 0 hoặc 1`); hopLe = false; }
      else cls[c.key] = Number(v) as 0 | 1;
    }
    const tt = rong(r, 'co_tt_ksk');
    if (tt !== '0' && tt !== '1') { g.loi(`${nhan}: co_tt_ksk "${tt}" phải là 0 hoặc 1`); hopLe = false; }
    const ks = 'ky_so' in r ? rong(r, 'ky_so') : '';
    if (ks !== '' && ks !== '0' && ks !== '1') { g.loi(`${nhan}: ky_so "${ks}" phải là rỗng, 0 hoặc 1`); hopLe = false; }
    const dvg = rong(r, 'don_vi_goi_y');
    if (dvg !== '' && !(DON_VI_HOP_LE as readonly string[]).includes(dvg)) g.canhBao(`${nhan}: don_vi_goi_y "${dvg}" không thuộc TN/LK/VK (bỏ qua)`);
    if (!hopLe) return;
    const t = (c: string) => (r[c] ?? '').trim();
    hoSo.push({
      ma_ho_so: ma,
      vi_tri_ban_dau: vitri as 'buoi' | 'kho_chung',
      ma_buoi: mb, // kho_chung có thể mang ma_buoi gợi ý; app chỉ gắn buổi khi vi_tri=buoi
      don_vi_goi_y: dvg,
      ma_kcb: t('ma_kcb'),
      ho_ten: t('ho_ten'),
      gioi_tinh: gt as 'Nam' | 'Nữ' | '',
      nam_sinh: Number(ns),
      cccd: t('cccd'),
      so_the_bhyt: t('so_the_bhyt'),
      so_dt: t('so_dt'),
      dia_chi_chi_tiet: t('dia_chi_chi_tiet'),
      dia_chi_the: t('dia_chi_the'),
      ngay_gio_dang_ky_his: t('ngay_gio_dang_ky_his'),
      cls: cls as ClsGoi,
      cls_ghi_chu: t('cls_ghi_chu'),
      co_tt_ksk: Number(tt) as 0 | 1,
      so_ksk: t('so_ksk'),
      ky_so: ks === '' ? null : (Number(ks) as 0 | 1),
      ket_luan_phan_loai: t('ket_luan_phan_loai'),
      canh_bao: t('canh_bao').split('|').map((x) => x.trim()).filter(Boolean),
      ghi_chu_cowork: t('ghi_chu_cowork'),
    });
  });

  // --- 7. Đếm lại và so với manifest
  const soSanh = (nhan: string, mong: unknown, dem: number) => {
    if (typeof mong !== 'number') g.loi(`${nhan}: manifest thiếu hoặc không phải số (đếm ${dem})`);
    else if (mong !== dem) g.loi(`${nhan}: manifest ${mong}, đếm ${dem}`);
  };
  const trongBuoi = csvHoSo.dong.filter((r) => rong(r, 'vi_tri_ban_dau') === 'buoi');
  const khoChung = csvHoSo.dong.filter((r) => rong(r, 'vi_tri_ban_dau') === 'kho_chung');
  soSanh('so_dong.buoi_kham.csv', manifest.so_dong['buoi_kham.csv'], csvBuoi.dong.length);
  soSanh('so_dong.ho_so.csv', manifest.so_dong['ho_so.csv'], csvHoSo.dong.length);
  soSanh('so_dong.ho_so_trong_buoi', manifest.so_dong['ho_so_trong_buoi'], trongBuoi.length);
  soSanh('so_dong.ho_so_kho_chung', manifest.so_dong['ho_so_kho_chung'], khoChung.length);
  soSanh('so_dong.nguoi_dung.csv', manifest.so_dong['nguoi_dung.csv'], csvUser.dong.length);

  const donViCuaBuoi = new Map<string, string>();
  for (const b of buoi) donViCuaBuoi.set(b.ma_buoi, b.don_vi);
  const dem: Record<string, Record<string, number>> = {};
  const khoiTao = (dv: string) => (dem[dv] ??= Object.fromEntries(['so_buoi', 'so_doan', 'ho_so_trong_buoi', ...COT_CLS].map((k) => [k, 0])));
  for (const dv of DON_VI_HOP_LE) khoiTao(dv);
  for (const dv of Object.keys(manifest.tong_theo_don_vi)) khoiTao(dv);
  for (const b of buoi) { khoiTao(b.don_vi).so_buoi++; dem[b.don_vi].so_doan += b.so_doan_tong; }
  for (const r of trongBuoi) {
    const dv = donViCuaBuoi.get(rong(r, 'ma_buoi'));
    if (!dv) continue; // đã báo lỗi ma_buoi ở trên
    const d = dem[dv];
    d.ho_so_trong_buoi++;
    for (const c of COT_CLS) if (rong(r, c) === '1') d[c]++;
  }
  for (const dv of Object.keys(dem)) {
    const m = manifest.tong_theo_don_vi[dv];
    if (!m) {
      if (dem[dv].so_buoi > 0) g.loi(`tong_theo_don_vi.${dv}: manifest không có đơn vị này nhưng gói có ${dem[dv].so_buoi} buổi`);
      continue;
    }
    for (const k of Object.keys(dem[dv])) soSanh(`${dv}.${k}`, m[k], dem[dv][k]);
  }

  return xong({ manifest, buoi, hoSo, nguoiDung });
}

