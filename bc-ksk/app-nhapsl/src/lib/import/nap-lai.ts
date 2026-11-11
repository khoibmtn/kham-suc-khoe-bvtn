// Nạp lại gói phiên bản mới (docs/03-THIET-KE.md mục 4). MỘT hàm so khớp (`tinhNapLai`) dùng chung cho
// chạy thử (chỉ đọc) và ghi (`apDungNapLai` ghi đúng những gì `tinhNapLai` đã tính, trong cùng transaction).
//
// Quy ước đã chốt ở chỗ docs chưa nói rõ:
//  - "Đã chạm" nhân thân = sua_nhan_than; CLS = sua_cls; vị trí = da_di_chuyen hoặc da_xac_nhan.
//  - Hồ sơ đang ở buổi đã khóa (da_xac_nhan) coi như đã chạm cả nhân thân lẫn CLS và vị trí: chỉ cập nhật
//    src + trường tham chiếu + cảnh báo, không đổi giá trị hiện hành/vị trí.
//  - Cảnh báo NGUON_DOI_SAU_RA_SOAT được thêm khi (a) hồ sơ bị chặn CLS mà nguồn vừa đổi một ô CLS và giá trị mới
//    khác giá trị hiện hành, hoặc (b) hồ sơ đã xác nhận mà nhân thân/CLS nguồn đổi so với gói trước. Mã này (do app
//    thêm) được GIỮ ở lần nạp sau nếu hồ sơ vẫn đã xác nhận hoặc vẫn còn ô CLS lệch nguồn; ngược lại bỏ.
//    DA_GO_KHOI_NGUON bị bỏ khi hồ sơ xuất hiện lại trong gói. Mã trong gói (canh_bao) ghi đè phần còn lại.
//  - Nguồn "đổi" = so `src` đã lưu (gói trước) với gói mới, không phải so với giá trị người rà soát.
import type postgres from 'postgres';
import type { TomTatNapLai, TongDonVi } from '@/lib/api-types';
import { CLS } from '@/lib/cls';
import { ghiNhatKy } from '@/lib/nhat-ky';
import { khongDau } from '@/lib/text';
import type { BuoiGoi, HoSoGoi, NguoiDungGoi, Goi } from './goi';
import { KHOA_NHAN_THAN, NapTuChoi, hangBuoi, hangHoSoMoi, srcCuaGoi, type Src } from './hang';

type Sql = postgres.Sql | postgres.TransactionSql;
const DON_VI = ['TN', 'LK', 'VK'] as const;
type DV = (typeof DON_VI)[number];
const LO_GHI = 500;
const LO_THEM = 1000;
export const MA_NGUON_DOI = 'NGUON_DOI_SAU_RA_SOAT';
export const MA_GO_KHOI = 'DA_GO_KHOI_NGUON';
const MA_APP = [MA_NGUON_DOI, MA_GO_KHOI];

type Dich = { kieu: 'giu' } | { kieu: 'buoi'; ma: string } | { kieu: 'kho_chung' } | { kieu: 'an' };
type Cot = Record<string, unknown>;

type HsDb = {
  id: number; ma_ho_so: string; version: number; ho_ten_kd: string; src: Src | null;
  ky_so: number | null; canh_bao: string[]; sua_nhan_than: boolean; sua_cls: boolean; da_di_chuyen: boolean;
  vi_tri: 'buoi' | 'kho_ca_nhan' | 'kho_chung' | 'an'; buoi_id: number | null; kho_user_id: number | null;
  da_xac_nhan: boolean; trang_thai_nguon: 'co_trong_goi' | 'da_go_khoi_goi';
} & Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

type BuoiDb = {
  id: number; ma_buoi: string; don_vi: DV; ngay_kham: string; ten_don_vi: string; diem_kham: string; doan_kham: string;
  nv_goi_y: string; so_doan_tong: number; so_doan: Record<string, number | null>; trang_thai: string; nguon: string;
};

export type CapNhatHoSo = {
  id: number;
  tgt: Cot;                       // giá trị đích của mọi cột sẽ ghi (trừ vị trí)
  viTri: 'buoi' | 'kho_ca_nhan' | 'kho_chung' | 'an';
  buoiMa: string | null;          // buổi đích khi chuyển vào buổi (mã, vì buổi mới chưa có id)
  buoiIdGiu: number | null;
  khoUserGiu: number | null;
  chuyen: { tu: string; lyDo: string } | null;
  buoiCuId: number | null;
};

export type HoSoMoi = { g: HoSoGoi; viTri: 'buoi' | 'kho_chung'; ma: string | null; lyDo: string };

export type ChiTietNapLai = {
  tuChoi: string | null;
  tomTat: TomTatNapLai;
  themTrongBuoi: Record<DV, number> & { tong: number };
  themKhoChung: number;
  userMoi: NguoiDungGoi[];
  buoiMoi: BuoiGoi[];
  buoiCapNhat: { id: number; b: BuoiGoi }[];
  hoSoMoi: HoSoMoi[];
  hoSoCapNhat: CapNhatHoSo[];
  /** Buổi cần đồng bộ trạng thái tự động sau khi ghi (id đã có; buổi mới dùng ma). */
  buoiAnhHuong: Set<number>;
  buoiMoiAnhHuong: Set<string>;
};

const COT_THAM_CHIEU = [
  'so_the_bhyt', 'so_dt', 'dia_chi_the', 'ngay_gio_dang_ky_his', 'cls_ghi_chu', 'co_tt_ksk', 'so_ksk', 'ky_so',
  'ket_luan_phan_loai', 'ghi_chu_cowork', 'don_vi_goi_y',
] as const;
const COT_CLS = CLS.map((c) => c.col);
const COT_DOC = [
  'id', 'ma_ho_so', 'version', 'ho_ten_kd', ...KHOA_NHAN_THAN, ...COT_CLS, 'src', ...COT_THAM_CHIEU, 'canh_bao',
  'sua_nhan_than', 'sua_cls', 'da_di_chuyen', 'vi_tri', 'buoi_id', 'kho_user_id', 'ma_buoi_ban_dau', 'da_xac_nhan',
  'trang_thai_nguon',
].join(', ');

function bang(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (a === null || b === null || a === undefined || b === undefined) return a === b;
  if (Array.isArray(a) || Array.isArray(b)) {
    return Array.isArray(a) && Array.isArray(b) && a.length === b.length && a.every((x, i) => bang(x, b[i]));
  }
  if (typeof a === 'object' && typeof b === 'object') {
    const ka = Object.keys(a as object), kb = Object.keys(b as object);
    return ka.length === kb.length && ka.every((k) => bang((a as Cot)[k], (b as Cot)[k]));
  }
  return false;
}

const khongTong = (): TongDonVi => ({
  TN: { so_buoi: 0, so_doan: 0, ho_so_trong_buoi: 0 },
  LK: { so_buoi: 0, so_doan: 0, ho_so_trong_buoi: 0 },
  VK: { so_buoi: 0, so_doan: 0, ho_so_trong_buoi: 0 },
});

/** Bản ghi gói → giá trị đích của các cột có thể ghi (chưa tính cờ chạm). */
function giaTriGoi(g: HoSoGoi): Cot {
  const c: Cot = {
    ma_kcb: g.ma_kcb, ho_ten: g.ho_ten, ho_ten_kd: khongDau(g.ho_ten), gioi_tinh: g.gioi_tinh, nam_sinh: g.nam_sinh,
    cccd: g.cccd, dia_chi_chi_tiet: g.dia_chi_chi_tiet,
  };
  for (const k of CLS) c[k.col] = g.cls[k.key];
  return c;
}

export async function tinhNapLai(sql: Sql, goi: Goi, opts: { khoa?: boolean } = {}): Promise<ChiTietNapLai> {
  const khoa = opts.khoa ? ' FOR UPDATE' : '';
  // Khóa theo thứ tự ho_so (theo id) rồi buoi_kham — cùng thứ tự với các thao tác nghiệp vụ khác.
  const hsCowork = await sql.unsafe<HsDb[]>(`SELECT ${COT_DOC} FROM ho_so WHERE nguon = 'cowork' ORDER BY id${khoa}`);
  const themTay = await sql<{ id: number; cccd: string; ma_kcb: string; vi_tri: string; buoi_id: number | null }[]>`
    SELECT id, cccd, ma_kcb, vi_tri, buoi_id FROM ho_so WHERE nguon = 'them_tay'`;
  const buoiDb = await sql.unsafe<BuoiDb[]>(
    `SELECT id, ma_buoi, don_vi, ngay_kham, ten_don_vi, diem_kham, doan_kham, nv_goi_y, so_doan_tong, so_doan, trang_thai, nguon
       FROM buoi_kham ORDER BY id${khoa}`);
  const usersCo = new Set((await sql<{ username: string }[]>`SELECT username FROM users`).map((r) => r.username));

  const buoiTheoMa = new Map(buoiDb.map((b) => [b.ma_buoi, b]));
  const buoiTheoId = new Map(buoiDb.map((b) => [b.id, b]));
  const maTrongGoi = new Set(goi.buoi.map((b) => b.ma_buoi));

  // --- Buổi
  const buoiMoi: BuoiGoi[] = [];
  const buoiCapNhat: { id: number; b: BuoiGoi }[] = [];
  const khoaNgay = new Map(buoiDb.map((b) => [`${b.don_vi}|${b.ngay_kham}`, b.ma_buoi]));
  let tuChoi: string | null = null;
  for (const b of goi.buoi) {
    const cu = buoiTheoMa.get(b.ma_buoi);
    if (!cu) {
      const trung = khoaNgay.get(`${b.don_vi}|${b.ngay_kham}`);
      if (trung) tuChoi = `Buổi mới "${b.ma_buoi}" trùng đơn vị và ngày khám với buổi "${trung}" đã có; không nạp`;
      buoiMoi.push(b);
    } else if (
      cu.ten_don_vi !== b.ten_don_vi || cu.diem_kham !== b.diem_kham || cu.doan_kham !== b.doan_kham ||
      cu.nv_goi_y !== b.nv_goi_y || cu.so_doan_tong !== b.so_doan_tong || !bang(cu.so_doan, b.so_doan)
    ) {
      buoiCapNhat.push({ id: cu.id, b });
    }
  }
  const buoiKhongCon = buoiDb.filter((b) => b.nguon === 'cowork' && !maTrongGoi.has(b.ma_buoi)).map((b) => b.ma_buoi);

  // Buổi sau nạp (mã → thông tin để định vị hồ sơ)
  const buoiCuoi = new Map<string, { id: number | null; donVi: DV; khoa: boolean; soDoan: number }>();
  for (const b of buoiDb) buoiCuoi.set(b.ma_buoi, { id: b.id, donVi: b.don_vi, khoa: b.trang_thai === 'da_xac_nhan', soDoan: b.so_doan_tong });
  for (const b of goi.buoi) {
    const c = buoiCuoi.get(b.ma_buoi);
    if (c) c.soDoan = b.so_doan_tong;
    else buoiCuoi.set(b.ma_buoi, { id: null, donVi: b.don_vi, khoa: false, soDoan: b.so_doan_tong });
  }

  // --- Hồ sơ
  const goiTheoMa = new Map(goi.hoSo.map((h) => [h.ma_ho_so, h]));
  const dbTheoMa = new Map(hsCowork.map((h) => [h.ma_ho_so, h]));
  const tt: TomTatNapLai = {
    buoi_them: buoiMoi.map((b) => b.ma_buoi),
    buoi_cap_nhat: buoiCapNhat.length,
    buoi_khong_con_trong_goi: buoiKhongCon,
    ho_so_them_moi: 0, ho_so_cap_nhat: 0, ho_so_cap_nhat_tham_chieu: 0, ho_so_giu_do_da_cham: 0,
    ho_so_chuyen_vi_tri: 0, ho_so_go_khoi_nguon_an: 0, ho_so_go_khoi_nguon_giu: 0, ho_so_khong_doi: 0,
    da_xac_nhan_nguon_doi: [], them_tay_trung_goi: [], khong_vao_buoi_khoa: 0,
    tong_truoc: khongTong(), tong_sau: khongTong(),
  };

  const hoSoCapNhat: CapNhatHoSo[] = [];
  const dichTheoId = new Map<number, Dich>();
  const buoiAnhHuong = new Set<number>();
  const buoiMoiAnhHuong = new Set<string>();
  const nhanViTri = (h: HsDb): string =>
    h.vi_tri === 'buoi' ? buoiTheoId.get(h.buoi_id!)?.ma_buoi ?? '' : h.vi_tri;

  for (const h of hsCowork) {
    const g = goiTheoMa.get(h.ma_ho_so);
    const cuaBuoi = h.vi_tri === 'buoi' && h.buoi_id !== null ? buoiTheoId.get(h.buoi_id) : undefined;
    const trongBuoiKhoa = cuaBuoi?.trang_thai === 'da_xac_nhan';
    const cur = h as Cot;

    if (!g) {
      // Có trong CSDL, không có trong gói mới.
      if (h.trang_thai_nguon === 'da_go_khoi_goi') { tt.ho_so_khong_doi++; continue; }
      const chuaCham = !h.da_xac_nhan && !h.sua_nhan_than && !h.sua_cls && !h.da_di_chuyen;
      const tgt: Cot = { trang_thai_nguon: 'da_go_khoi_goi' };
      let dich: Dich = { kieu: 'giu' };
      let chuyen: CapNhatHoSo['chuyen'] = null;
      if (chuaCham) {
        dich = { kieu: 'an' };
        chuyen = { tu: nhanViTri(h), lyDo: `Gỡ khỏi nguồn (nạp ${goi.manifest.phien_ban})` };
        tt.ho_so_go_khoi_nguon_an++;
        if (h.buoi_id !== null) buoiAnhHuong.add(h.buoi_id);
      } else {
        tgt.canh_bao = h.canh_bao.includes(MA_GO_KHOI) ? h.canh_bao : [...h.canh_bao, MA_GO_KHOI];
        tt.ho_so_go_khoi_nguon_giu++;
      }
      dichTheoId.set(h.id, dich);
      hoSoCapNhat.push(taoCapNhat(h, { ...cur2(h), ...tgt }, dich, chuyen));
      continue;
    }

    // --- Có trong cả hai
    const chanNhanThan = h.sua_nhan_than || trongBuoiKhoa;
    const chanCls = h.sua_cls || trongBuoiKhoa;
    const srcCu = h.src;
    const srcMoi = srcCuaGoi(g);
    const moiGoi = giaTriGoi(g);

    const truongDoi: string[] = [];
    for (const k of KHOA_NHAN_THAN) if (!bang(srcCu?.[k], srcMoi[k])) truongDoi.push(k);
    for (const c of CLS) if (!bang(srcCu?.cls?.[c.key], g.cls[c.key])) truongDoi.push(c.csv);

    const xungDotNhanThan = chanNhanThan && KHOA_NHAN_THAN.some((k) => !bang(srcCu?.[k], srcMoi[k]) && !bang(srcMoi[k], cur[k]));
    const xungDotCls = chanCls && CLS.some((c) => !bang(srcCu?.cls?.[c.key], g.cls[c.key]) && g.cls[c.key] !== cur[c.col]);
    const conLechCls = chanCls && CLS.some((c) => g.cls[c.key] !== cur[c.col]);
    const giu = xungDotNhanThan || xungDotCls;

    // Giá trị đích
    const tgt: Cot = { ...cur2(h) };
    for (const k of KHOA_NHAN_THAN) if (!chanNhanThan) tgt[k] = moiGoi[k];
    if (!chanNhanThan) tgt.ho_ten_kd = moiGoi.ho_ten_kd;
    for (const c of COT_CLS) if (!chanCls) tgt[c] = moiGoi[c];
    for (const k of COT_THAM_CHIEU) tgt[k] = (g as unknown as Cot)[k] ?? (k === 'ky_so' ? null : '');
    tgt.src = srcMoi;
    tgt.ma_buoi_ban_dau = g.ma_buoi;
    tgt.trang_thai_nguon = 'co_trong_goi';

    const canhBaoGoi = g.canh_bao.filter((x) => !MA_APP.includes(x));
    const themNguonDoi = xungDotCls || (h.da_xac_nhan && truongDoi.length > 0);
    const giuNguonDoi = h.canh_bao.includes(MA_NGUON_DOI) && (h.da_xac_nhan || conLechCls);
    tgt.canh_bao = themNguonDoi || giuNguonDoi ? [...new Set([...canhBaoGoi, MA_NGUON_DOI])] : [...new Set(canhBaoGoi)];

    if (h.da_xac_nhan && truongDoi.length > 0) {
      const b = h.buoi_id !== null ? buoiTheoId.get(h.buoi_id) : undefined;
      tt.da_xac_nhan_nguon_doi.push({ id: h.id, ma_ho_so: h.ma_ho_so, ma_buoi: b?.ma_buoi ?? h.ma_buoi_ban_dau, truong: truongDoi });
    }

    // Vị trí
    let dich: Dich = { kieu: 'giu' };
    let chuyen: CapNhatHoSo['chuyen'] = null;
    if (!h.da_di_chuyen && !h.da_xac_nhan && !trongBuoiKhoa) {
      if (g.vi_tri_ban_dau === 'kho_chung') {
        if (h.vi_tri !== 'kho_chung') {
          dich = { kieu: 'kho_chung' };
          chuyen = { tu: nhanViTri(h), lyDo: `Nạp ${goi.manifest.phien_ban}: gói đưa về kho chung` };
        }
      } else {
        const bd = buoiCuoi.get(g.ma_buoi)!;
        const dangODo = h.vi_tri === 'buoi' && bd.id !== null && h.buoi_id === bd.id;
        if (!dangODo) {
          if (bd.khoa) {
            if (h.vi_tri !== 'kho_chung') {
              dich = { kieu: 'kho_chung' };
              chuyen = { tu: nhanViTri(h), lyDo: `Không vào được buổi đã khóa ${g.ma_buoi}` };
              tt.khong_vao_buoi_khoa++;
            }
          } else {
            dich = { kieu: 'buoi', ma: g.ma_buoi };
            chuyen = { tu: nhanViTri(h), lyDo: `Nạp ${goi.manifest.phien_ban}: gói đổi buổi sang ${g.ma_buoi}` };
          }
        }
      }
    }
    dichTheoId.set(h.id, dich);
    const cn = taoCapNhat(h, tgt, dich, chuyen);

    // Phân loại để tóm tắt
    const doiGiaTri = [...KHOA_NHAN_THAN, 'ho_ten_kd', ...COT_CLS].some((k) => !bang(cur[k], tgt[k]));
    const doiKhac = [...COT_THAM_CHIEU, 'canh_bao', 'src', 'ma_buoi_ban_dau', 'trang_thai_nguon'].some((k) => !bang(cur[k], tgt[k]));
    const chuyenViTri = dich.kieu !== 'giu';
    if (doiGiaTri) tt.ho_so_cap_nhat++;
    if (giu) tt.ho_so_giu_do_da_cham++;
    if (chuyenViTri) tt.ho_so_chuyen_vi_tri++;
    if (!doiGiaTri && !giu && !chuyenViTri && doiKhac) tt.ho_so_cap_nhat_tham_chieu++;
    if (!doiGiaTri && !giu && !chuyenViTri && !doiKhac) tt.ho_so_khong_doi++;
    if (doiGiaTri || doiKhac || chuyenViTri) {
      hoSoCapNhat.push(cn);
      if (h.buoi_id !== null && chuyenViTri) buoiAnhHuong.add(h.buoi_id);
      if (dich.kieu === 'buoi') {
        const id = buoiCuoi.get(dich.ma)!.id;
        if (id !== null) buoiAnhHuong.add(id); else buoiMoiAnhHuong.add(dich.ma);
      }
    }
  }

  // --- Hồ sơ mới
  const hoSoMoi: HoSoMoi[] = [];
  const themTrongBuoi = { TN: 0, LK: 0, VK: 0, tong: 0 };
  let themKhoChung = 0;
  const idTayTheoCccd = new Map<string, number>();
  const idTayTheoKcb = new Map<string, number>();
  for (const t of themTay) {
    if (t.cccd && !idTayTheoCccd.has(t.cccd)) idTayTheoCccd.set(t.cccd, t.id);
    if (t.ma_kcb && !idTayTheoKcb.has(t.ma_kcb)) idTayTheoKcb.set(t.ma_kcb, t.id);
  }
  for (const g of goi.hoSo) {
    if (dbTheoMa.has(g.ma_ho_so)) continue;
    let viTri: 'buoi' | 'kho_chung' = g.vi_tri_ban_dau;
    let lyDo = '';
    if (viTri === 'buoi' && buoiCuoi.get(g.ma_buoi)!.khoa) {
      viTri = 'kho_chung';
      lyDo = `Không vào được buổi đã khóa ${g.ma_buoi}`;
      tt.khong_vao_buoi_khoa++;
    }
    hoSoMoi.push({ g, viTri, ma: viTri === 'buoi' ? g.ma_buoi : null, lyDo });
    if (viTri === 'buoi') {
      themTrongBuoi[buoiCuoi.get(g.ma_buoi)!.donVi]++;
      themTrongBuoi.tong++;
      const id = buoiCuoi.get(g.ma_buoi)!.id;
      if (id !== null) buoiAnhHuong.add(id); else buoiMoiAnhHuong.add(g.ma_buoi);
    } else themKhoChung++;
    const tc = g.cccd ? idTayTheoCccd.get(g.cccd) : undefined;
    const tk = g.ma_kcb ? idTayTheoKcb.get(g.ma_kcb) : undefined;
    if (tc !== undefined) tt.them_tay_trung_goi.push({ ho_so_id: tc, ma_ho_so_goi: g.ma_ho_so, theo: 'cccd' });
    else if (tk !== undefined) tt.them_tay_trung_goi.push({ ho_so_id: tk, ma_ho_so_goi: g.ma_ho_so, theo: 'ma_kcb' });
  }
  tt.ho_so_them_moi = hoSoMoi.length;

  // --- Tổng trước/sau theo đơn vị
  for (const b of buoiDb) { tt.tong_truoc[b.don_vi].so_buoi++; tt.tong_truoc[b.don_vi].so_doan += b.so_doan_tong; }
  for (const b of buoiCuoi.values()) { tt.tong_sau[b.donVi].so_buoi++; tt.tong_sau[b.donVi].so_doan += b.soDoan; }
  const donViTheoId = (id: number | null): DV | null => (id === null ? null : buoiTheoId.get(id)?.don_vi ?? null);
  for (const h of hsCowork) {
    if (h.vi_tri === 'buoi') { const d = donViTheoId(h.buoi_id); if (d) tt.tong_truoc[d].ho_so_trong_buoi++; }
    const dich = dichTheoId.get(h.id) ?? { kieu: 'giu' as const };
    if (dich.kieu === 'giu') { if (h.vi_tri === 'buoi') { const d = donViTheoId(h.buoi_id); if (d) tt.tong_sau[d].ho_so_trong_buoi++; } }
    else if (dich.kieu === 'buoi') tt.tong_sau[buoiCuoi.get(dich.ma)!.donVi].ho_so_trong_buoi++;
  }
  for (const t of themTay) {
    if (t.vi_tri === 'buoi') {
      const d = donViTheoId(t.buoi_id);
      if (d) { tt.tong_truoc[d].ho_so_trong_buoi++; tt.tong_sau[d].ho_so_trong_buoi++; }
    }
  }
  for (const d of DON_VI) tt.tong_sau[d].ho_so_trong_buoi += themTrongBuoi[d];

  return {
    tuChoi, tomTat: tt, themTrongBuoi, themKhoChung,
    userMoi: goi.nguoiDung.filter((u) => !usersCo.has(u.username)),
    buoiMoi, buoiCapNhat, hoSoMoi, hoSoCapNhat, buoiAnhHuong, buoiMoiAnhHuong,
  };
}

/** Các cột hiện có của hồ sơ (chỉ những cột nạp lại có thể ghi). */
function cur2(h: HsDb): Cot {
  const c: Cot = {};
  for (const k of [...KHOA_NHAN_THAN, 'ho_ten_kd', ...COT_CLS, ...COT_THAM_CHIEU, 'src', 'canh_bao', 'ma_buoi_ban_dau', 'trang_thai_nguon']) c[k] = h[k];
  return c;
}

function taoCapNhat(h: HsDb, tgt: Cot, dich: Dich, chuyen: CapNhatHoSo['chuyen']): CapNhatHoSo {
  let viTri = h.vi_tri;
  let buoiMa: string | null = null;
  if (dich.kieu === 'buoi') { viTri = 'buoi'; buoiMa = dich.ma; }
  else if (dich.kieu === 'kho_chung') viTri = 'kho_chung';
  else if (dich.kieu === 'an') viTri = 'an';
  return { id: h.id, tgt, viTri, buoiMa, buoiIdGiu: h.buoi_id, khoUserGiu: h.kho_user_id, chuyen, buoiCuId: h.buoi_id };
}

/** Chạy thử: chỉ đọc. */
export async function keHoachNapLai(sql: Sql, goi: Goi): Promise<ChiTietNapLai> {
  return tinhNapLai(sql, goi);
}

const COT_BANG_GHI = [
  ...KHOA_NHAN_THAN, 'ho_ten_kd', ...COT_CLS, 'src', ...COT_THAM_CHIEU, 'canh_bao', 'ma_buoi_ban_dau', 'trang_thai_nguon',
];

/** Ghi kết quả so khớp trong transaction của người gọi (đã khóa bảng import_batches). */
export async function apDungNapLai(
  tx: postgres.TransactionSql,
  goi: Goi,
  napBoi: string,
  chiTiet?: ChiTietNapLai,
  opts: { force?: boolean } = {},
): Promise<TomTatNapLai> {
  const ct = chiTiet ?? (await tinhNapLai(tx, goi, { khoa: true }));
  if (ct.tuChoi) throw new NapTuChoi(ct.tuChoi);

  // 1. users — chỉ thêm, không đổi người cũ
  if (ct.userMoi.length) {
    await tx`INSERT INTO users ${tx(ct.userMoi.map((u) => ({ username: u.username, ho_ten: u.ho_ten, role: u.vai_tro })))}
             ON CONFLICT (username) DO NOTHING`;
  }

  // 2. buổi: thêm mới, cập nhật mô tả/sổ đoàn (giữ phân công, trạng thái, xác nhận)
  const idTheoMa = new Map<string, number>();
  for (const b of await tx<{ id: number; ma_buoi: string }[]>`SELECT id, ma_buoi FROM buoi_kham`) idTheoMa.set(b.ma_buoi, b.id);
  for (let i = 0; i < ct.buoiMoi.length; i += LO_THEM) {
    const rows = ct.buoiMoi.slice(i, i + LO_THEM).map((b) => hangBuoi(tx, b));
    for (const r of await tx<{ id: number; ma_buoi: string }[]>`INSERT INTO buoi_kham ${tx(rows)} RETURNING id, ma_buoi`) idTheoMa.set(r.ma_buoi, r.id);
  }
  for (const { id, b } of ct.buoiCapNhat) {
    await tx`UPDATE buoi_kham SET ten_don_vi = ${b.ten_don_vi}, diem_kham = ${b.diem_kham}, doan_kham = ${b.doan_kham},
        nv_goi_y = ${b.nv_goi_y}, so_doan_tong = ${b.so_doan_tong}, so_doan = ${tx.json(b.so_doan)} WHERE id = ${id}`;
  }

  // 3. hồ sơ mới
  for (let i = 0; i < ct.hoSoMoi.length; i += LO_THEM) {
    const rows = ct.hoSoMoi.slice(i, i + LO_THEM).map((m) =>
      hangHoSoMoi(tx, m.g, {
        vi_tri: m.viTri,
        buoi_id: m.ma ? idTheoMa.get(m.ma)! : null,
        chuyen_tu: m.lyDo ? m.g.ma_buoi : '',
        chuyen_ly_do: m.lyDo,
      }));
    await tx`INSERT INTO ho_so ${tx(rows)}`;
  }

  // 4. hồ sơ có đổi: UPDATE theo lô từ một mảng JSON
  for (let i = 0; i < ct.hoSoCapNhat.length; i += LO_GHI) {
    const rows = ct.hoSoCapNhat.slice(i, i + LO_GHI).map((c) => {
      const r: Cot = { id: c.id };
      for (const k of COT_BANG_GHI) r[k] = c.tgt[k];
      r.vi_tri = c.viTri;
      r.buoi_id = c.viTri === 'buoi' ? (c.buoiMa ? idTheoMa.get(c.buoiMa)! : c.buoiIdGiu) : null;
      r.kho_user_id = c.viTri === 'kho_ca_nhan' ? c.khoUserGiu : null;
      r.ch = c.chuyen !== null;
      r.chuyen_tu = c.chuyen?.tu ?? '';
      r.chuyen_ly_do = c.chuyen?.lyDo ?? '';
      return r;
    });
    await tx`
      UPDATE ho_so h SET
        ma_kcb = v.ma_kcb, ho_ten = v.ho_ten, ho_ten_kd = v.ho_ten_kd, gioi_tinh = v.gioi_tinh, nam_sinh = v.nam_sinh,
        cccd = v.cccd, dia_chi_chi_tiet = v.dia_chi_chi_tiet,
        ctm = v.ctm, glucose = v.glucose, ure = v.ure, creatinin = v.creatinin, got = v.got, gpt = v.gpt,
        tpt_nuoc_tieu = v.tpt_nuoc_tieu, sieu_am = v.sieu_am,
        src = v.src, so_the_bhyt = v.so_the_bhyt, so_dt = v.so_dt, dia_chi_the = v.dia_chi_the,
        ngay_gio_dang_ky_his = v.ngay_gio_dang_ky_his, cls_ghi_chu = v.cls_ghi_chu, co_tt_ksk = v.co_tt_ksk,
        so_ksk = v.so_ksk, ky_so = v.ky_so, ket_luan_phan_loai = v.ket_luan_phan_loai, canh_bao = v.canh_bao,
        ghi_chu_cowork = v.ghi_chu_cowork, don_vi_goi_y = v.don_vi_goi_y,
        vi_tri = v.vi_tri, buoi_id = v.buoi_id, kho_user_id = v.kho_user_id, ma_buoi_ban_dau = v.ma_buoi_ban_dau,
        trang_thai_nguon = v.trang_thai_nguon,
        chuyen_tu = CASE WHEN v.ch THEN v.chuyen_tu ELSE h.chuyen_tu END,
        chuyen_ly_do = CASE WHEN v.ch THEN v.chuyen_ly_do ELSE h.chuyen_ly_do END,
        chuyen_boi = CASE WHEN v.ch THEN NULL ELSE h.chuyen_boi END,
        chuyen_luc = CASE WHEN v.ch THEN now() ELSE h.chuyen_luc END,
        version = h.version + 1, updated_by = NULL, updated_at = now()
      FROM jsonb_to_recordset(${tx.json(rows as never)}) AS v(
        id int, ma_kcb text, ho_ten text, ho_ten_kd text, gioi_tinh text, nam_sinh int, cccd text, dia_chi_chi_tiet text,
        ctm smallint, glucose smallint, ure smallint, creatinin smallint, got smallint, gpt smallint,
        tpt_nuoc_tieu smallint, sieu_am smallint, src jsonb, so_the_bhyt text, so_dt text, dia_chi_the text,
        ngay_gio_dang_ky_his text, cls_ghi_chu text, co_tt_ksk smallint, so_ksk text, ky_so smallint,
        ket_luan_phan_loai text, canh_bao text[], ghi_chu_cowork text, don_vi_goi_y text,
        vi_tri text, buoi_id int, kho_user_id int, ma_buoi_ban_dau text, trang_thai_nguon text,
        ch boolean, chuyen_tu text, chuyen_ly_do text)
      WHERE h.id = v.id`;
  }

  // 5. đồng bộ trạng thái tự động của các buổi bị ảnh hưởng (không đụng buổi đã xác nhận)
  const ids = new Set(ct.buoiAnhHuong);
  for (const ma of ct.buoiMoiAnhHuong) ids.add(idTheoMa.get(ma)!);
  for (const id of ids) {
    await tx`UPDATE buoi_kham b SET trang_thai = CASE WHEN EXISTS (
          SELECT 1 FROM ho_so x WHERE x.buoi_id = b.id AND x.vi_tri = 'buoi' AND x.da_xac_nhan)
        THEN 'dang_ra_soat' ELSE 'chua_ra_soat' END
      WHERE b.id = ${id} AND b.trang_thai <> 'da_xac_nhan'`;
  }

  // 6. import_batches (+ nhật ký). `force` trùng phien_ban (UNIQUE): thêm dòng mới với hậu tố "#force-<n>"
  // để giữ lịch sử; phiên bản gốc nằm trong tom_tat.phien_ban.
  const pv = goi.manifest.phien_ban;
  const [{ n }] = await tx<{ n: number }[]>`
    SELECT count(*)::int AS n FROM import_batches WHERE phien_ban = ${pv} OR left(phien_ban, ${pv.length + 7}) = ${pv + '#force-'}`;
  const tenLan = n === 0 ? pv : `${pv}#force-${n}`;
  const tomTat = { che_do: 'nap_lai', phien_ban: pv, force: Boolean(opts.force), nap_lai: ct.tomTat };
  await tx`INSERT INTO import_batches (phien_ban, manifest, tom_tat, che_do, nap_boi)
           VALUES (${tenLan}, ${tx.json(goi.manifest as never)}, ${tx.json(tomTat as never)}, 'nap_lai', ${napBoi})`;
  const t = ct.tomTat;
  await ghiNhatKy([
    {
      userId: null, hanhDong: 'import', doiTuong: 'import', doiTuongId: tenLan,
      ghiChu: `Nạp lại bởi ${napBoi}: buổi +${t.buoi_them.length}/~${t.buoi_cap_nhat}, hồ sơ +${t.ho_so_them_moi} ~${t.ho_so_cap_nhat} ` +
        `tham chiếu ${t.ho_so_cap_nhat_tham_chieu} giữ ${t.ho_so_giu_do_da_cham} chuyển ${t.ho_so_chuyen_vi_tri} ` +
        `ẩn ${t.ho_so_go_khoi_nguon_an} gỡ-giữ ${t.ho_so_go_khoi_nguon_giu} không đổi ${t.ho_so_khong_doi}`,
    },
    ...t.da_xac_nhan_nguon_doi.map((x) => ({
      userId: null, hanhDong: 'import_cap_nhat', doiTuong: 'ho_so', doiTuongId: x.id, truong: x.truong.join(','),
      ghiChu: `Hồ sơ đã xác nhận có nguồn đổi khi nạp ${tenLan}; cần rà soát lại`,
    })),
  ], tx);
  return ct.tomTat;
}
