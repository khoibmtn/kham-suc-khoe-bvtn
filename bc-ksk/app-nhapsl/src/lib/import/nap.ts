// Nạp gói `nhapsl-import-1` vào Postgres (docs/03-THIET-KE.md mục 4).
// Lần đầu: `napLanDau`. Nạp lại phiên bản mới hơn: `nap-lai.ts` (cùng một hàm so khớp cho chạy thử và ghi).
import type postgres from 'postgres';
import { CLS } from '@/lib/cls';
import { ghiNhatKy } from '@/lib/nhat-ky';
import type { TomTatNapLai } from '@/lib/api-types';
import type { Goi } from './goi';
import { NapTuChoi, hangBuoi, hangHoSoMoi } from './hang';
import { apDungNapLai, tinhNapLai, type ChiTietNapLai } from './nap-lai';

type Sql = postgres.Sql | postgres.TransactionSql;
const DON_VI = ['TN', 'LK', 'VK'] as const;
const LO = 1000;

export type TheoDonVi = Record<(typeof DON_VI)[number], number>;

export type KeHoach = {
  phienBan: string;
  cheDo: 'lan_dau' | 'nap_lai';
  /** Có giá trị = KHÔNG được nạp (lý do bằng tiếng Việt). */
  tuChoi: string | null;
  buoiThem: number;
  hoSoThemTrongBuoi: TheoDonVi & { tong: number };
  hoSoThemKhoChung: number;
  hoSoThemTong: number;
  userThem: string[];
  userGiu: string[];
  /** Tổng sẽ có sau khi nạp (lần đầu = đúng bằng gói). */
  tongSauNap: Record<(typeof DON_VI)[number], { so_buoi: number; so_doan: number; ho_so_trong_buoi: number }>;
  /** Chỉ có khi cheDo='nap_lai' và không bị từ chối: tóm tắt so khớp. */
  napLai: TomTatNapLai | null;
  /** Kết quả so khớp chi tiết (nội bộ, để apDung ghi đúng điều đã tính). */
  chiTiet?: ChiTietNapLai;
};

export { NapTuChoi };

const khong = (): TheoDonVi => ({ TN: 0, LK: 0, VK: 0 });

/**
 * Quyết định chế độ nạp từ trạng thái DB.
 * Nạp lại: phiên bản (so sánh chuỗi) lớn hơn mọi phiên bản đã nạp → cho phép; bằng/nhỏ hơn → từ chối trừ `force`.
 */
export async function quyetDinhCheDo(
  sql: Sql,
  phienBan: string,
  opts: { force?: boolean } = {},
): Promise<{ cheDo: 'lan_dau' | 'nap_lai'; tuChoi: string | null }> {
  const [{ max, n }] = await sql<{ max: string | null; n: number }[]>`
    SELECT max(phien_ban) AS max, count(*)::int AS n FROM import_batches`;
  if (n === 0) {
    const [{ buoi, hoso }] = await sql<{ buoi: number; hoso: number }[]>`
      SELECT (SELECT count(*) FROM buoi_kham)::int AS buoi, (SELECT count(*) FROM ho_so)::int AS hoso`;
    if (buoi > 0 || hoso > 0) {
      return { cheDo: 'lan_dau', tuChoi: `CSDL đã có ${buoi} buổi / ${hoso} hồ sơ nhưng chưa có lần nạp nào được ghi nhận; từ chối để tránh trùng dữ liệu` };
    }
    return { cheDo: 'lan_dau', tuChoi: null };
  }
  // Đã có ít nhất một lần nạp.
  if (phienBan <= max! && !opts.force) {
    return { cheDo: 'nap_lai', tuChoi: `Phiên bản "${phienBan}" cũ hơn hoặc đã được nạp (phiên bản lớn nhất đã nạp: "${max}")` };
  }
  return { cheDo: 'nap_lai', tuChoi: null };
}

export async function lapKeHoach(sql: Sql, goi: Goi, opts: { force?: boolean; khoa?: boolean } = {}): Promise<KeHoach> {
  const { cheDo, tuChoi } = await quyetDinhCheDo(sql, goi.manifest.phien_ban, opts);
  const coSan = new Set((await sql<{ username: string }[]>`SELECT username FROM users`).map((r) => r.username));
  const donViBuoi = new Map(goi.buoi.map((b) => [b.ma_buoi, b.don_vi]));
  const trongBuoi = { ...khong(), tong: 0 };
  let khoChung = 0;
  for (const h of goi.hoSo) {
    if (h.vi_tri_ban_dau === 'buoi') {
      trongBuoi[donViBuoi.get(h.ma_buoi)!]++;
      trongBuoi.tong++;
    } else khoChung++;
  }
  const tong = {} as KeHoach['tongSauNap'];
  for (const dv of DON_VI) tong[dv] = { so_buoi: 0, so_doan: 0, ho_so_trong_buoi: trongBuoi[dv] };
  for (const b of goi.buoi) { tong[b.don_vi].so_buoi++; tong[b.don_vi].so_doan += b.so_doan_tong; }
  const kh: KeHoach = {
    phienBan: goi.manifest.phien_ban,
    cheDo,
    tuChoi,
    napLai: null,
    buoiThem: goi.buoi.length,
    hoSoThemTrongBuoi: trongBuoi,
    hoSoThemKhoChung: khoChung,
    hoSoThemTong: goi.hoSo.length,
    userThem: goi.nguoiDung.filter((u) => !coSan.has(u.username)).map((u) => u.username),
    userGiu: goi.nguoiDung.filter((u) => coSan.has(u.username)).map((u) => u.username),
    tongSauNap: tong,
  };
  if (cheDo === 'nap_lai' && !tuChoi) {
    const ct = await tinhNapLai(sql, goi, { khoa: opts.khoa });
    if (ct.tuChoi) {
      kh.tuChoi = ct.tuChoi;
      return kh;
    }
    kh.napLai = ct.tomTat;
    kh.chiTiet = ct;
    kh.buoiThem = ct.tomTat.buoi_them.length;
    kh.hoSoThemTong = ct.tomTat.ho_so_them_moi;
    kh.hoSoThemTrongBuoi = ct.themTrongBuoi;
    kh.hoSoThemKhoChung = ct.themKhoChung;
    kh.userThem = ct.userMoi.map((u) => u.username);
    kh.userGiu = goi.nguoiDung.filter((u) => !kh.userThem.includes(u.username)).map((u) => u.username);
    kh.tongSauNap = ct.tomTat.tong_sau;
  }
  return kh;
}

/** Nạp (lần đầu hoặc nạp lại) trong MỘT transaction. Ném NapTuChoi (và rollback) nếu không đủ điều kiện. */
export async function apDung(sql: postgres.Sql, goi: Goi, napBoi: string, opts: { force?: boolean } = {}): Promise<KeHoach> {
  return sql.begin(async (tx) => {
    // Chặn hai tiến trình nạp song song.
    await tx`LOCK TABLE import_batches IN EXCLUSIVE MODE`;
    const kh = await lapKeHoach(tx, goi, { ...opts, khoa: true });
    if (kh.tuChoi) throw new NapTuChoi(kh.tuChoi);
    if (kh.cheDo === 'nap_lai') await apDungNapLai(tx, goi, napBoi, kh.chiTiet!, opts);
    else await napLanDau(tx, goi, kh, napBoi);
    return kh;
  }) as Promise<KeHoach>;
}

async function napLanDau(tx: postgres.TransactionSql, goi: Goi, kh: KeHoach, napBoi: string): Promise<void> {
  // 1. users — chỉ thêm người chưa có, giữ nguyên người đã có
  const userMoi = goi.nguoiDung.filter((u) => kh.userThem.includes(u.username));
  if (userMoi.length) {
    await tx`INSERT INTO users ${tx(userMoi.map((u) => ({ username: u.username, ho_ten: u.ho_ten, role: u.vai_tro })))}
             ON CONFLICT (username) DO NOTHING`;
  }

  // 2. buổi
  const rowsBuoi = goi.buoi.map((b) => hangBuoi(tx, b));
  const idBuoi = new Map<string, number>();
  for (let i = 0; i < rowsBuoi.length; i += LO) {
    const ids = await tx<{ id: number; ma_buoi: string }[]>`
      INSERT INTO buoi_kham ${tx(rowsBuoi.slice(i, i + LO))} RETURNING id, ma_buoi`;
    for (const r of ids) idBuoi.set(r.ma_buoi, r.id);
  }

  // 3. hồ sơ theo lô
  for (let i = 0; i < goi.hoSo.length; i += LO) {
    const rows = goi.hoSo.slice(i, i + LO).map((h) =>
      hangHoSoMoi(tx, h, {
        vi_tri: h.vi_tri_ban_dau,
        buoi_id: h.vi_tri_ban_dau === 'buoi' ? idBuoi.get(h.ma_buoi)! : null,
      }));
    await tx`INSERT INTO ho_so ${tx(rows)}`;
  }

  // 4. import_batches + nhật ký
  const tomTat = {
    che_do: 'lan_dau',
    buoi_them: kh.buoiThem,
    ho_so_them: kh.hoSoThemTong,
    ho_so_them_trong_buoi: kh.hoSoThemTrongBuoi,
    ho_so_them_kho_chung: kh.hoSoThemKhoChung,
    user_them: kh.userThem.length,
    user_giu: kh.userGiu.length,
    tong_sau_nap: kh.tongSauNap,
  };
  await tx`INSERT INTO import_batches (phien_ban, manifest, tom_tat, che_do, nap_boi)
           VALUES (${goi.manifest.phien_ban}, ${tx.json(goi.manifest as never)}, ${tx.json(tomTat)}, 'lan_dau', ${napBoi})`;
  await ghiNhatKy({
    userId: null,
    hanhDong: 'import',
    doiTuong: 'import',
    doiTuongId: goi.manifest.phien_ban,
    ghiChu: `Nạp lần đầu: ${kh.buoiThem} buổi, ${kh.hoSoThemTong} hồ sơ (${kh.hoSoThemTrongBuoi.tong} trong buổi, ${kh.hoSoThemKhoChung} kho chung), ${kh.userThem.length} user mới`,
  }, tx);
}

export type TongThucTe = {
  users: number;
  buoi: Record<string, { so_buoi: number; so_doan: number }>;
  hoSoTrongBuoi: Record<string, number>;
  khoChung: number;
  tong: number;
  cls: Record<string, Record<string, number>>;
  batches: number;
  nhatKyImport: number;
};

/** Đọc lại tổng từ DB sau khi ghi (cho CLI và test). */
export async function docTongThucTe(sql: Sql): Promise<TongThucTe> {
  const buoi = await sql<{ don_vi: string; so_buoi: number; so_doan: number }[]>`
    SELECT don_vi, count(*)::int AS so_buoi, coalesce(sum(so_doan_tong),0)::int AS so_doan FROM buoi_kham GROUP BY don_vi`;
  const clsSel = CLS.map((c) => `coalesce(sum(h.${c.col}),0)::int AS ${c.csv}`).join(', ');
  const hs = await sql.unsafe<({ don_vi: string; n: number } & Record<string, number>)[]>(
    `SELECT b.don_vi, count(*)::int AS n, ${clsSel}
       FROM ho_so h JOIN buoi_kham b ON b.id = h.buoi_id WHERE h.vi_tri = 'buoi' GROUP BY b.don_vi`);
  const [c] = await sql<{ kho: number; tong: number; users: number; batches: number; nk: number }[]>`
    SELECT (SELECT count(*) FROM ho_so WHERE vi_tri='kho_chung')::int AS kho,
           (SELECT count(*) FROM ho_so)::int AS tong,
           (SELECT count(*) FROM users)::int AS users,
           (SELECT count(*) FROM import_batches)::int AS batches,
           (SELECT count(*) FROM nhat_ky WHERE hanh_dong='import')::int AS nk`;
  const out: TongThucTe = {
    users: c.users, buoi: {}, hoSoTrongBuoi: {}, khoChung: c.kho, tong: c.tong, cls: {}, batches: c.batches, nhatKyImport: c.nk,
  };
  for (const b of buoi) out.buoi[b.don_vi] = { so_buoi: b.so_buoi, so_doan: b.so_doan };
  for (const r of hs) {
    out.hoSoTrongBuoi[r.don_vi] = r.n;
    out.cls[r.don_vi] = Object.fromEntries(CLS.map((x) => [x.csv, r[x.csv]]));
  }
  return out;
}
