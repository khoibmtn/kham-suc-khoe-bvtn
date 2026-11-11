// Gói xuất cho Cowork (docs/02 mục 7, schema nhapsl-export-1).
import { createHash } from 'node:crypto';
import { getSql } from '@/db/client';
import type { AuthUser } from '@/lib/auth/guard';
import type { HoSoDong } from '@/lib/api-types';
import { CLS, CLS_KEYS, DON_VI, type DonVi } from '@/lib/cls';
import { khacGoc } from '@/lib/loc-ho-so';
import { truyVanBuoi } from '@/lib/ra-soat/buoi';
import { taoCsv } from './csv';
import { layDuLieuBaoCao } from './du-lieu';
import { ngayVN } from './thoi-gian';
import { taoBaoCaoXlsx } from './xlsx';

export const COT_HO_SO = [
  'ma_ho_so', 'nguon', 'trang_thai_nguon', 'vi_tri', 'ma_buoi', 'don_vi', 'ngay_kham', 'kho_cua_user', 'ma_kcb', 'ho_ten',
  'gioi_tinh', 'nam_sinh', 'cccd', 'dia_chi_chi_tiet',
  'cls_ctm', 'cls_glucose', 'cls_ure', 'cls_creatinin', 'cls_got', 'cls_gpt', 'cls_tpt_nuoc_tieu', 'cls_sieu_am',
  'nguon_cls_ctm', 'nguon_cls_glucose', 'nguon_cls_ure', 'nguon_cls_creatinin', 'nguon_cls_got', 'nguon_cls_gpt',
  'nguon_cls_tpt_nuoc_tieu', 'nguon_cls_sieu_am',
  'co_tt_ksk', 'canh_bao', 'ma_buoi_ban_dau', 'da_xac_nhan', 'xac_nhan_boi', 'xac_nhan_luc', 'da_sua_theo_giay', 'ghi_chu',
  'tao_boi', 'tao_luc', 'sua_boi', 'sua_luc',
] as const;

export const COT_BUOI = [
  'ma_buoi', 'don_vi', 'ngay_kham', 'diem_kham', 'phu_trach', 'so_doan_tong', 'ho_so_hien_co', 'da_xac_nhan', 'thua', 'thieu',
  'bo_sung', 'trang_thai', 'xac_nhan_boi', 'xac_nhan_luc', 'giai_trinh',
] as const;

export const COT_NHAT_KY = [
  'thoi_diem', 'username', 'hanh_dong', 'doi_tuong', 'ma_doi_tuong', 'truong', 'gia_tri_cu', 'gia_tri_moi', 'ghi_chu',
] as const;

const TS = (c: string) => `to_char(${c} AT TIME ZONE 'Asia/Ho_Chi_Minh', 'YYYY-MM-DD HH24:MI:SS')`;
const sha256 = (b: Buffer) => createHash('sha256').update(b).digest('hex');
const bit = (v: unknown) => (v === true || v === 1 ? 1 : 0);

type HsRow = Record<string, unknown> & {
  ma_ho_so: string | null; nguon: string; trang_thai_nguon: string; vi_tri: string; ma_buoi: string | null; don_vi: string | null;
  ngay_kham: string | null; kho_username: string | null; ma_kcb: string; ho_ten: string; gioi_tinh: string; nam_sinh: number;
  cccd: string; dia_chi_chi_tiet: string; src: HoSoDong['src']; co_tt_ksk: number; canh_bao: string[] | null;
  ma_buoi_ban_dau: string; da_xac_nhan: boolean; xn_username: string | null; xac_nhan_luc: string | null; ghi_chu: string;
  tao_username: string | null; tao_luc: string; sua_username: string | null; sua_luc: string | null;
};

const ADMIN_GIA: AuthUser = { id: 0, username: 'cowork', ho_ten: 'Cowork', role: 'admin', session_version: 0 };

export async function taoGoiCowork(): Promise<Record<string, Buffer>> {
  const sql = getSql();
  const xuatLuc = new Date();

  // --- ho_so.csv
  const hs = await sql.unsafe<HsRow[]>(
    `SELECT h.*, b.ma_buoi, COALESCE(b.don_vi, NULLIF(h.don_vi_goi_y, '')) AS don_vi, b.ngay_kham,
            ku.username AS kho_username, xn.username AS xn_username, cu.username AS tao_username, uu.username AS sua_username,
            ${TS('h.xac_nhan_at')} AS xac_nhan_luc, ${TS('h.created_at')} AS tao_luc,
            CASE WHEN h.updated_by IS NOT NULL THEN ${TS('h.updated_at')} END AS sua_luc
     FROM ho_so h
     LEFT JOIN buoi_kham b ON b.id = h.buoi_id
     LEFT JOIN users ku ON ku.id = h.kho_user_id
     LEFT JOIN users xn ON xn.id = h.xac_nhan_by
     LEFT JOIN users cu ON cu.id = h.created_by
     LEFT JOIN users uu ON uu.id = h.updated_by
     ORDER BY h.id`,
  );
  const hsRows = hs.map((r) => {
    const cls = Object.fromEntries(CLS_KEYS.map((k) => [k, r[k] === 1 ? 1 : 0])) as HoSoDong['cls'];
    const da_sua = khacGoc({
      src: r.src, cls, ma_kcb: r.ma_kcb, ho_ten: r.ho_ten, gioi_tinh: r.gioi_tinh, nam_sinh: r.nam_sinh, cccd: r.cccd,
      dia_chi_chi_tiet: r.dia_chi_chi_tiet,
    } as unknown as HoSoDong);
    return [
      r.ma_ho_so ?? '', r.nguon, r.trang_thai_nguon, r.vi_tri, r.ma_buoi ?? '', r.don_vi ?? '', r.ngay_kham ? ngayVN(r.ngay_kham) : '',
      r.kho_username ?? '', r.ma_kcb, r.ho_ten, r.gioi_tinh, r.nam_sinh, r.cccd, r.dia_chi_chi_tiet,
      ...CLS_KEYS.map((k) => cls[k]),
      ...CLS_KEYS.map((k) => (r.src ? r.src.cls[k] : '')),
      r.co_tt_ksk, (r.canh_bao ?? []).join('|'), r.ma_buoi_ban_dau, bit(r.da_xac_nhan), r.xn_username ?? '', r.xac_nhan_luc ?? '',
      da_sua ? 1 : 0, r.ghi_chu, r.tao_username ?? (r.nguon === 'cowork' ? 'cowork' : ''), r.tao_luc, r.sua_username ?? '', r.sua_luc ?? '',
    ];
  });
  const hoSoCsv = taoCsv(COT_HO_SO, hsRows);

  // --- buoi_kham.csv (chỉ số như dashboard: dùng chung truyVanBuoi)
  const buoi = await truyVanBuoi(sql, ADMIN_GIA);
  const buoiCsv = taoCsv(COT_BUOI, buoi.map((b) => [
    b.ma_buoi, b.don_vi, ngayVN(b.ngay_kham), b.diem_kham, b.phu_trach?.username ?? '', b.so_doan_tong, b.hien_co, b.da_xac_nhan,
    b.thua, b.thieu, b.bo_sung, b.trang_thai, b.xac_nhan_by?.username ?? '', b.xac_nhan_at ? fmtIso(b.xac_nhan_at) : '', b.giai_trinh ?? '',
  ]));

  // --- nhat_ky.csv
  const nk = await sql.unsafe<Record<string, string | null>[]>(
    `SELECT ${TS('n.at')} AS thoi_diem, u.username, n.hanh_dong, n.doi_tuong, n.doi_tuong_id, n.truong, n.gia_tri_cu, n.gia_tri_moi, n.ghi_chu
     FROM nhat_ky n LEFT JOIN users u ON u.id = n.user_id ORDER BY n.id`,
  );
  const nhatKyCsv = taoCsv(COT_NHAT_KY, nk.map((r) => [
    r.thoi_diem, r.username ?? '', r.hanh_dong, r.doi_tuong, r.doi_tuong_id ?? '', r.truong ?? '', r.gia_tri_cu ?? '', r.gia_tri_moi ?? '', r.ghi_chu ?? '',
  ]));

  // --- bao_cao.xlsx (mặc định: admin, chỉ hồ sơ đã xác nhận)
  const du = await layDuLieuBaoCao(sql, { chiDaXacNhan: true });
  const xlsx = await taoBaoCaoXlsx(du, { xuatLuc, phamVi: 'Toàn bộ 3 đơn vị' });

  // --- manifest.json
  const [batch] = await sql<{ phien_ban: string }[]>`SELECT phien_ban FROM import_batches ORDER BY id DESC LIMIT 1`;
  const tong = await sql<{ don_vi: string; so_buoi: number }[]>`SELECT don_vi, count(*)::int AS so_buoi FROM buoi_kham GROUP BY don_vi`;
  const soDoan = await sql<{ don_vi: string; so_doan: number }[]>`SELECT don_vi, sum(so_doan_tong)::int AS so_doan FROM buoi_kham GROUP BY don_vi`;
  const hc = await sql.unsafe<Record<string, number | string>[]>(
    `SELECT b.don_vi, count(h.id)::int AS hien_co, (count(h.id) FILTER (WHERE h.da_xac_nhan))::int AS da_xac_nhan,
            (count(h.id) FILTER (WHERE h.da_xac_nhan AND h.co_tt_ksk = 1))::int AS co_tt_ksk_da_xac_nhan,
            ${CLS.map((c) => `(count(h.id) FILTER (WHERE h.da_xac_nhan AND h.${c.col} = 1))::int AS cls_${c.key}`).join(', ')}
     FROM buoi_kham b JOIN ho_so h ON h.buoi_id = b.id AND h.vi_tri = 'buoi' GROUP BY b.don_vi`,
  );
  const tongTheoDonVi: Record<string, Record<string, number>> = {};
  for (const dv of Object.keys(DON_VI) as DonVi[]) {
    const a = tong.find((x) => x.don_vi === dv);
    const h = hc.find((x) => x.don_vi === dv);
    tongTheoDonVi[dv] = {
      so_buoi: Number(a?.so_buoi ?? 0), so_doan: soDoan.find((x) => x.don_vi === dv)?.so_doan ?? 0,
      hien_co: Number(h?.hien_co ?? 0), da_xac_nhan: Number(h?.da_xac_nhan ?? 0),
      co_tt_ksk_da_xac_nhan: Number(h?.co_tt_ksk_da_xac_nhan ?? 0),
      ...Object.fromEntries(CLS.map((c) => [`cls_${c.key}`, Number(h?.[`cls_${c.key}`] ?? 0)])),
    };
  }
  const files: Record<string, Buffer> = {
    'ho_so.csv': hoSoCsv, 'buoi_kham.csv': buoiCsv, 'nhat_ky.csv': nhatKyCsv, 'bao_cao.xlsx': xlsx,
  };
  const manifest = {
    schema: 'nhapsl-export-1',
    xuat_luc: new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Ho_Chi_Minh', dateStyle: 'short', timeStyle: 'medium' }).format(xuatLuc),
    phien_ban_nhap: batch?.phien_ban ?? null,
    so_dong: { 'ho_so.csv': hsRows.length, 'buoi_kham.csv': buoi.length, 'nhat_ky.csv': nk.length },
    tong_theo_don_vi: tongTheoDonVi,
    sha256: Object.fromEntries(Object.entries(files).map(([k, v]) => [k, sha256(v)])),
  };
  return { 'manifest.json': Buffer.from(JSON.stringify(manifest, null, 2) + '\n', 'utf8'), ...files };
}

function fmtIso(iso: string): string {
  const d = new Date(iso);
  return new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Ho_Chi_Minh', dateStyle: 'short', timeStyle: 'medium' }).format(d);
}
