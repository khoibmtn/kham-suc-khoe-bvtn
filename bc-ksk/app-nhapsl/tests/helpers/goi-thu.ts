// Sinh gói nhập nhỏ (3 buổi, 10 hồ sơ) vào thư mục tạm, manifest đúng sha256 và tổng.
// Dùng lại ở GĐ7 (nạp lại) bằng cách truyền `bien` để đổi dữ liệu / phiên bản.
import { createHash } from 'node:crypto';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

export type Row = Record<string, string>;
const CLS_COT = ['cls_ctm', 'cls_glucose', 'cls_ure', 'cls_creatinin', 'cls_got', 'cls_gpt', 'cls_tpt_nuoc_tieu', 'cls_sieu_am'];

export type Bien = {
  phienBan?: string;
  buoi?: (rows: Row[]) => Row[];
  hoSo?: (rows: Row[]) => Row[];
  nguoiDung?: (rows: Row[]) => Row[];
  /** Sửa manifest SAU khi đã tính xong (kể cả sha256). */
  manifest?: (m: any) => void; // eslint-disable-line @typescript-eslint/no-explicit-any
};

export function buoiMacDinh(): Row[] {
  const b = (ma: string, dv: string, ten: string, ngay: string, tong: string, nv: string): Row => ({
    ma_buoi: ma, don_vi: dv, ten_don_vi: ten, ngay_kham: ngay, diem_kham: 'TYT Thử', doan_kham: 'Đoàn 1',
    nv_goi_y: nv, so_doan_tong: tong, so_doan_duoi_6: '0', so_doan_6_18: '1', so_doan_tu_18: '3',
    so_doan_xn_mau: '2', so_doan_nuoc_tieu: '', so_doan_sieu_am: '1', so_doan_co_kl: '2', so_doan_cho_kl: '1',
  });
  return [
    b('TN-20260907', 'TN', 'Phường Thủy Nguyên', '07/09/2026', '4', 'ngan'),
    b('TN-20260908', 'TN', 'Phường Thủy Nguyên', '08/09/2026', '3', 'trinh'),
    b('LK-20261014', 'LK', 'Phường Lưu Kiếm', '14/10/2026', '2', ''),
  ];
}

export function hoSoMacDinh(): Row[] {
  const h = (i: number, vt: string, mb: string, ten: string, gt: string, cls: string, extra: Row = {}): Row => ({
    ma_ho_so: `H00${i}`, vi_tri_ban_dau: vt, ma_buoi: mb, don_vi_goi_y: vt === 'kho_chung' ? 'TN' : '',
    ma_kcb: `00${i}234`, ho_ten: ten, gioi_tinh: gt, nam_sinh: String(1950 + i), cccd: `0310660145${String(i).padStart(2, '0')}`,
    so_the_bhyt: '', so_dt: '', dia_chi_chi_tiet: '', dia_chi_the: 'Phường Thủy Nguyên--Thành phố Hải Phòng',
    ngay_gio_dang_ky_his: '07/09/2026 07:30',
    ...Object.fromEntries(CLS_COT.map((c, k) => [c, cls[k]])),
    cls_ghi_chu: '', co_tt_ksk: '1', so_ksk: '', ky_so: i % 3 === 0 ? '' : String(i % 2), ket_luan_phan_loai: '',
    canh_bao: '', ghi_chu_cowork: '', ...extra,
  });
  return [
    h(1, 'buoi', 'TN-20260907', 'NGUYỄN VĂN THỦY', 'Nam', '11000001', { cccd: '031066014597', canh_bao: 'NGHI_SAO_CHEP_XN|LECH_NGAY' }),
    h(2, 'buoi', 'TN-20260907', 'TRẦN THỊ ĐÀO', 'Nữ', '11111101'),
    h(3, 'buoi', 'TN-20260907', 'LÊ VĂN A', 'Nam', '00000000'),
    h(4, 'buoi', 'TN-20260908', 'PHẠM THỊ B', 'Nữ', '10000000'),
    h(5, 'buoi', 'TN-20260908', 'HOÀNG VĂN C', 'Nam', '11100001'),
    h(6, 'buoi', 'LK-20261014', 'ĐỖ THỊ D', 'Nữ', '00000001'),
    h(7, 'buoi', 'LK-20261014', 'VŨ VĂN E', 'Nam', '11111111'),
    h(8, 'buoi', 'LK-20261014', 'BÙI THỊ G', 'Nữ', '01000000'),
    h(9, 'kho_chung', '', 'ĐINH VĂN H', 'Nam', '00000000', { canh_bao: 'CO_KQ_CLS_HIS' }),
    h(10, 'kho_chung', '', 'MAI THỊ K', 'Nữ', '11000000'),
  ];
}

export function nguoiDungMacDinh(): Row[] {
  return [
    { username: 'admin', ho_ten: 'Bùi Minh Khôi', vai_tro: 'admin' },
    { username: 'ngan', ho_ten: 'Ngân', vai_tro: 'nhan_vien' },
    { username: 'trinh', ho_ten: 'Trinh', vai_tro: 'nhan_vien' },
  ];
}

function csv(rows: Row[]): Buffer {
  const cot = Object.keys(rows[0] ?? {});
  const o = (v: string) => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
  const text = [cot.join(','), ...rows.map((r) => cot.map((c) => o(r[c] ?? '')).join(','))].join('\n') + '\n';
  return Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from(text, 'utf8')]);
}

export function taoManifest(buoi: Row[], hoSo: Row[], nguoiDung: Row[], phienBan: string, sha: Record<string, string>) {
  const dvBuoi = new Map(buoi.map((b) => [b.ma_buoi, b.don_vi]));
  const tong: Record<string, Record<string, number>> = {};
  const lay = (dv: string) => (tong[dv] ??= Object.fromEntries(['so_buoi', 'so_doan', 'ho_so_trong_buoi', ...CLS_COT].map((k) => [k, 0])));
  for (const b of buoi) { lay(b.don_vi).so_buoi++; tong[b.don_vi].so_doan += Number(b.so_doan_tong); }
  for (const r of hoSo.filter((x) => x.vi_tri_ban_dau === 'buoi')) {
    const dv = dvBuoi.get(r.ma_buoi);
    if (!dv) continue;
    lay(dv).ho_so_trong_buoi++;
    for (const c of CLS_COT) if (r[c] === '1') tong[dv][c]++;
  }
  const trong = hoSo.filter((x) => x.vi_tri_ban_dau === 'buoi').length;
  return {
    schema: 'nhapsl-import-1', phien_ban: phienBan, tao_luc: '2026-11-11 10:00:00', tao_boi: 'test', mo_ta: 'gói thử',
    so_dong: {
      'buoi_kham.csv': buoi.length, 'ho_so.csv': hoSo.length, ho_so_trong_buoi: trong,
      ho_so_kho_chung: hoSo.filter((x) => x.vi_tri_ban_dau === 'kho_chung').length, 'nguoi_dung.csv': nguoiDung.length,
    },
    tong_theo_don_vi: tong,
    sha256: sha,
  };
}

export type GoiThu = { dir: string; files: Record<string, Buffer>; manifest: any }; // eslint-disable-line @typescript-eslint/no-explicit-any

export function taoGoiThu(bien: Bien = {}): GoiThu {
  const buoi = (bien.buoi ?? ((x) => x))(buoiMacDinh());
  const hoSo = (bien.hoSo ?? ((x) => x))(hoSoMacDinh());
  const nguoiDung = (bien.nguoiDung ?? ((x) => x))(nguoiDungMacDinh());
  const files: Record<string, Buffer> = {
    'buoi_kham.csv': csv(buoi), 'ho_so.csv': csv(hoSo), 'nguoi_dung.csv': csv(nguoiDung),
  };
  const sha = Object.fromEntries(Object.entries(files).map(([k, v]) => [k, createHash('sha256').update(v).digest('hex')]));
  const manifest = taoManifest(buoi, hoSo, nguoiDung, bien.phienBan ?? 'v0-test-1', sha);
  bien.manifest?.(manifest);
  files['manifest.json'] = Buffer.from(JSON.stringify(manifest, null, 2), 'utf8');
  const dir = mkdtempSync(path.join(tmpdir(), 'nhapsl-goi-'));
  for (const [k, v] of Object.entries(files)) writeFileSync(path.join(dir, k), v);
  return { dir, files, manifest };
}
