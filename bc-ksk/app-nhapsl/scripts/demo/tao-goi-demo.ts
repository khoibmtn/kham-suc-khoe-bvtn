// Sinh gói nhapsl-import-1 với DỮ LIỆU GIẢ (CCCD bắt đầu 0990, mã KCB 99000…) để chụp ảnh hướng dẫn.
// Dùng: npx tsx scripts/demo/tao-goi-demo.ts [/tmp/goi-demo-ksk]
// Gói ghi ra NGOÀI repo. Không đọc bất kỳ dữ liệu thật nào.
import { createHash } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { taoManifest, type Row } from '../../tests/helpers/goi-thu';

const OUT = process.argv[2] ?? '/tmp/goi-demo-ksk';
const CLS = ['cls_ctm', 'cls_glucose', 'cls_ure', 'cls_creatinin', 'cls_got', 'cls_gpt', 'cls_tpt_nuoc_tieu', 'cls_sieu_am'];

let seed = 20260911;
const rnd = () => {
  seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
const pick = <T,>(a: T[]): T => a[Math.floor(rnd() * a.length)];

const HO = ['NGUYỄN', 'TRẦN', 'LÊ', 'PHẠM', 'HOÀNG', 'VŨ', 'ĐẶNG', 'BÙI', 'ĐỖ', 'HỒ', 'NGÔ', 'DƯƠNG', 'LÝ', 'PHAN', 'ĐINH'];
const DEM_NAM = ['VĂN', 'HỮU', 'ĐỨC', 'QUANG', 'MINH', 'XUÂN', 'THANH'];
const DEM_NU = ['THỊ', 'THỊ', 'THỊ', 'NGỌC', 'THANH', 'HỒNG'];
const TEN_NAM = ['HÙNG', 'DŨNG', 'THẮNG', 'TUẤN', 'HẢI', 'LONG', 'SƠN', 'BÌNH', 'CƯỜNG', 'HIỆP', 'KHÁNH', 'NAM', 'QUÝ', 'THÀNH'];
const TEN_NU = ['HOA', 'LAN', 'HƯƠNG', 'MAI', 'HẰNG', 'NGA', 'THU', 'LIÊN', 'YẾN', 'OANH', 'TÂM', 'HÀ', 'PHƯỢNG', 'VÂN'];

const usedCccd = new Set<string>();
let seq = 0;
function cccdMoi(): string {
  for (;;) {
    const c = '0990' + String(Math.floor(rnd() * 1e8)).padStart(8, '0');
    if (!usedCccd.has(c)) { usedCccd.add(c); return c; }
  }
}

type Buoi = { ma: string; dv: 'TN' | 'LK' | 'VK'; ten: string; ngay: string; diem: string; doan: string; nv: string; soDoan: number; soHoSo: number; diaChi: string[] };
const BUOI: Buoi[] = [
  { ma: 'TN-20260907', dv: 'TN', ten: 'Phường Thủy Nguyên', ngay: '07/09/2026', diem: 'TYT Hoa Động', doan: 'Đoàn 1', nv: 'ngan', soDoan: 36, soHoSo: 38, diaChi: ['Tổ dân phố Hoa Động 1', 'Tổ dân phố Hoa Động 2', 'Tổ dân phố Hoa Động 3'] },
  { ma: 'TN-20260908', dv: 'TN', ten: 'Phường Thủy Nguyên', ngay: '08/09/2026', diem: 'Điểm Y tế Đông Sơn', doan: 'Đoàn 2', nv: 'ngan', soDoan: 33, soHoSo: 30, diaChi: ['Tổ dân phố Đông Sơn 1', 'Tổ dân phố Đông Sơn 2'] },
  { ma: 'LK-20260914', dv: 'LK', ten: 'Phường Lưu Kiếm', ngay: '14/09/2026', diem: 'TYT Lưu Kiếm', doan: 'Đoàn 1', nv: 'ngan', soDoan: 27, soHoSo: 25, diaChi: ['Thôn Lưu Kiếm 1', 'Thôn Lưu Kiếm 2'] },
  { ma: 'LK-20260915', dv: 'LK', ten: 'Phường Lưu Kiếm', ngay: '15/09/2026', diem: 'Điểm Y tế Kiền Bái', doan: 'Đoàn 2', nv: 'trinh', soDoan: 40, soHoSo: 42, diaChi: ['Thôn Kiền Bái 1', 'Thôn Kiền Bái 2'] },
  { ma: 'LK-20260916', dv: 'LK', ten: 'Phường Lưu Kiếm', ngay: '16/09/2026', diem: 'TYT Phả Lễ', doan: 'Đoàn 3', nv: 'le', soDoan: 30, soHoSo: 30, diaChi: ['Thôn Phả Lễ 1', 'Thôn Phả Lễ 2'] },
  { ma: 'VK-20261016', dv: 'VK', ten: 'Xã Việt Khê', ngay: '16/10/2026', diem: 'TYT Việt Khê', doan: 'Đoàn 1', nv: 'giang', soDoan: 28, soHoSo: 26, diaChi: ['Thôn Việt Khê 1', 'Thôn Việt Khê 2'] },
];

const P_CLS = [0.8, 0.85, 0.5, 0.5, 0.6, 0.6, 0.35, 0.65];
function clsNgauNhien(): string {
  return P_CLS.map((p) => (rnd() < p ? '1' : '0')).join('');
}

function hoSo(vt: 'buoi' | 'kho_chung', b: Buoi | null, dvGoiY: string, extra: Row = {}): Row {
  seq++;
  const nu = rnd() < 0.55;
  const tuoi = 18 + Math.floor(rnd() * 62);
  const ten = `${pick(HO)} ${pick(nu ? DEM_NU : DEM_NAM)} ${pick(nu ? TEN_NU : TEN_NAM)}`;
  const maKcb = `99000${String(seq).padStart(5, '0')}`;
  const cls = clsNgauNhien();
  const ngayDk = b ? b.ngay : '10/10/2026';
  return {
    ma_ho_so: `H${maKcb}`, vi_tri_ban_dau: vt, ma_buoi: b?.ma ?? '', don_vi_goi_y: vt === 'kho_chung' ? dvGoiY : '',
    ma_kcb: maKcb, ho_ten: ten, gioi_tinh: nu ? 'Nữ' : 'Nam', nam_sinh: String(2026 - tuoi), cccd: cccdMoi(),
    so_the_bhyt: '', so_dt: '', dia_chi_chi_tiet: b ? pick(b.diaChi) : '',
    dia_chi_the: `${b ? b.ten : 'Phường Thủy Nguyên'}--Thành phố Hải Phòng`,
    ngay_gio_dang_ky_his: `${ngayDk} 0${7 + Math.floor(rnd() * 3)}:${String(Math.floor(rnd() * 60)).padStart(2, '0')}`,
    ...Object.fromEntries(CLS.map((c, k) => [c, cls[k]])),
    cls_ghi_chu: '', co_tt_ksk: '1', so_ksk: '', ky_so: rnd() < 0.5 ? '1' : '0', ket_luan_phan_loai: '',
    canh_bao: '', ghi_chu_cowork: '', ...extra,
  };
}

const rows: Row[] = [];
const meta: Record<string, unknown> = { khoChung: [] as unknown[] };
for (const b of BUOI) {
  const ds: Row[] = [];
  for (let i = 0; i < b.soHoSo; i++) ds.push(hoSo('buoi', b, ''));
  rows.push(...ds);
}

// --- Dòng "đạo cụ" ở buổi đầu của Ngân (TN-20260907): đủ loại cảnh báo, tên cố định để chụp ---
const dau = rows.filter((r) => r.ma_buoi === 'TN-20260907');
const gan = (i: number, ten: string, extra: Row) => Object.assign(dau[i], { ho_ten: ten, gioi_tinh: /THỊ/.test(ten) ? 'Nữ' : 'Nam' }, extra);
gan(0, 'NGUYỄN VĂN HÙNG', { cls_ctm: '1', cls_glucose: '1', cls_ure: '1', cls_creatinin: '1', cls_got: '1', cls_gpt: '1', cls_tpt_nuoc_tieu: '0', cls_sieu_am: '1', co_tt_ksk: '1' });
gan(1, 'TRẦN THỊ HOA', {
  cls_ctm: '1', cls_glucose: '1', cls_ure: '0', cls_creatinin: '0', cls_got: '1', cls_gpt: '1', cls_tpt_nuoc_tieu: '0', cls_sieu_am: '1',
  canh_bao: 'CLS_LECH_NGUON', cls_ghi_chu: 'Sổ KQ HIS có, phần mềm KSK không: SA; Phần mềm KSK có, sổ KQ HIS không (không tính): URE',
});
gan(2, 'PHẠM VĂN BÌNH', { canh_bao: 'NGHI_SAO_CHEP_XN', cls_ctm: '1', cls_glucose: '1', cls_ure: '1', cls_creatinin: '1', cls_got: '1', cls_gpt: '1', cls_tpt_nuoc_tieu: '1', cls_sieu_am: '0' });
gan(3, 'LÊ THỊ LAN', { canh_bao: 'KHONG_CO_TT_KSK', co_tt_ksk: '0' });
gan(4, 'ĐỖ VĂN THẮNG', { canh_bao: 'KHONG_BANG_CHUNG', cls_ctm: '0', cls_glucose: '0', cls_ure: '0', cls_creatinin: '0', cls_got: '0', cls_gpt: '0', cls_tpt_nuoc_tieu: '0', cls_sieu_am: '0', co_tt_ksk: '0' });
gan(5, 'BÙI THỊ MAI', { canh_bao: 'CO_KQ_CLS_HIS|LECH_NGAY' });
meta.hung = dau[0].cccd; meta.hoa = dau[1].cccd;
// Bản sao kết quả XN của "PHẠM VĂN BÌNH" cho một hồ sơ khác để cảnh báo hợp lý
Object.assign(dau[6], { canh_bao: 'NGHI_SAO_CHEP_XN', cls_ctm: '1', cls_glucose: '1', cls_ure: '1', cls_creatinin: '1', cls_got: '1', cls_gpt: '1', cls_tpt_nuoc_tieu: '1', cls_sieu_am: '0' });

// --- Kho chung: 12 hồ sơ ---
const khoChungTen = ['TRẦN VĂN QUÝ', 'NGUYỄN THỊ YẾN', 'VŨ ĐỨC KHÁNH', 'LÝ THỊ OANH', 'HOÀNG VĂN NAM', 'PHAN THỊ TÂM', 'ĐẶNG QUANG HẢI', 'NGÔ THỊ HÀ', 'DƯƠNG VĂN LONG', 'ĐINH THỊ VÂN', 'HỒ MINH TUẤN', 'LÊ THỊ PHƯỢNG'];
khoChungTen.forEach((ten, i) => {
  const dv = (['TN', 'LK', 'VK'] as const)[i % 3];
  const r = hoSo('kho_chung', null, dv, {
    ho_ten: ten, gioi_tinh: /THỊ/.test(ten) ? 'Nữ' : 'Nam', canh_bao: i % 2 === 0 ? 'CO_KQ_CLS_HIS' : 'NGOAI_DS_SO_BO',
    ghi_chu_cowork: 'Ứng viên từ HIS, chưa xếp vào buổi nào',
    dia_chi_the: `${{ TN: 'Phường Thủy Nguyên', LK: 'Phường Lưu Kiếm', VK: 'Xã Việt Khê' }[dv]}--Thành phố Hải Phòng`,
  });
  rows.push(r);
  (meta.khoChung as unknown[]).push({ ma_ho_so: r.ma_ho_so, ho_ten: ten, cccd: r.cccd, dv, gioi_tinh: r.gioi_tinh, nam_sinh: r.nam_sinh });
});

const buoiRows: Row[] = BUOI.map((b) => ({
  ma_buoi: b.ma, don_vi: b.dv, ten_don_vi: b.ten, ngay_kham: b.ngay, diem_kham: b.diem, doan_kham: b.doan,
  nv_goi_y: b.nv, so_doan_tong: String(b.soDoan), so_doan_duoi_6: '0', so_doan_6_18: '2', so_doan_tu_18: String(b.soDoan - 2),
  so_doan_xn_mau: String(Math.round(b.soDoan * 0.8)), so_doan_nuoc_tieu: '', so_doan_sieu_am: String(Math.round(b.soDoan * 0.6)),
  so_doan_co_kl: String(Math.round(b.soDoan * 0.7)), so_doan_cho_kl: String(b.soDoan - Math.round(b.soDoan * 0.7)),
}));
const nguoiDung: Row[] = [
  { username: 'admin', ho_ten: 'Bùi Minh Khôi', vai_tro: 'admin' },
  { username: 'ngan', ho_ten: 'Ngân', vai_tro: 'nhan_vien' },
  { username: 'trinh', ho_ten: 'Trinh', vai_tro: 'nhan_vien' },
  { username: 'le', ho_ten: 'Lê', vai_tro: 'nhan_vien' },
  { username: 'giang', ho_ten: 'Giang', vai_tro: 'nhan_vien' },
  { username: 'san', ho_ten: 'San', vai_tro: 'nhan_vien' },
  { username: 'diep', ho_ten: 'Diệp', vai_tro: 'nhan_vien' },
  { username: 'lien', ho_ten: 'Liên', vai_tro: 'nhan_vien' },
  { username: 'hoa', ho_ten: 'Hoa', vai_tro: 'nhan_vien' },
];

function csv(rs: Row[]): Buffer {
  const cot = Object.keys(rs[0]);
  const o = (v: string) => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
  const text = [cot.join(','), ...rs.map((r) => cot.map((c) => o(r[c] ?? '')).join(','))].join('\n') + '\n';
  return Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from(text, 'utf8')]);
}
const files: Record<string, Buffer> = { 'buoi_kham.csv': csv(buoiRows), 'ho_so.csv': csv(rows), 'nguoi_dung.csv': csv(nguoiDung) };
const sha = Object.fromEntries(Object.entries(files).map(([k, v]) => [k, createHash('sha256').update(v).digest('hex')]));
const manifest = taoManifest(buoiRows, rows, nguoiDung, 'v0-demo-1', sha);
manifest.tao_boi = 'demo'; manifest.mo_ta = 'Gói DỮ LIỆU GIẢ để chụp ảnh hướng dẫn';
files['manifest.json'] = Buffer.from(JSON.stringify(manifest, null, 2), 'utf8');
mkdirSync(OUT, { recursive: true });
for (const [k, v] of Object.entries(files)) writeFileSync(path.join(OUT, k), v);
writeFileSync(`${OUT}-meta.json`, JSON.stringify(meta, null, 2));
console.log(`Đã tạo gói demo tại ${OUT}: ${buoiRows.length} buổi, ${rows.length} hồ sơ`);
