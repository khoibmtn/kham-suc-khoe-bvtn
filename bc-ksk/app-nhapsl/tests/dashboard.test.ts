import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { closeDb, getSql } from '@/db/client';
import type { AuthUser } from '@/lib/auth/guard';
import type { BuoiTomTat, TheTongHop } from '@/lib/api-types';
import { CLS_KEYS } from '@/lib/cls';
import { parseGoi } from '@/lib/import/goi';
import { apDung } from '@/lib/import/nap';
import { layBuoiCoQuyen } from '@/lib/ra-soat/buoi';
import { chuyenHoSo, nhanVeHoSo } from '@/lib/ra-soat/chuyen';
import { dashboardAdmin, dashboardToi, tongHopTuBuoi } from '@/lib/ra-soat/dashboard';
import { taoDeNghi } from '@/lib/ra-soat/de-nghi';
import { xacNhanHoSo } from '@/lib/ra-soat/ho-so';
import { LoiNghiepVu } from '@/lib/ra-soat/loi';
import { docNhatKyQuery, nhatKyAdmin } from '@/lib/ra-soat/nhat-ky-admin';
import { phanCong } from '@/lib/ra-soat/phan-cong';
import { themHoSo } from '@/lib/ra-soat/them-ho-so';
import { xacNhanBuoi } from '@/lib/ra-soat/xac-nhan-buoi';
import { taoGoiThu } from './helpers/goi-thu';

const URL_TEST = process.env.TEST_DATABASE_URL;
if (!URL_TEST) throw new Error('Thiếu TEST_DATABASE_URL (.env.local)');
if (!/test/i.test(new URL(URL_TEST).pathname)) throw new Error('TEST_DATABASE_URL phải trỏ vào DB có chữ "test"');

const sql = () => getSql();
let admin: AuthUser, ngan: AuthUser, trinh: AuthUser;
const B7 = 'TN-20260907'; // ngan, tổng 4, H001-H003 (+ thêm tay)
const B8 = 'TN-20260908'; // trinh, tổng 3, H004-H005 (+ nhận từ kho chung)
const LK = 'LK-20261014'; // trinh, tổng 2, H006-H008 (xác nhận hết, có giải trình)

async function layUser(username: string): Promise<AuthUser> {
  const [r] = await sql()<AuthUser[]>`SELECT id, username, ho_ten, role, session_version FROM users WHERE username = ${username}`;
  return r;
}
async function hs(ma: string) {
  const [r] = await sql()<{ id: number; version: number }[]>`SELECT id, version FROM ho_so WHERE ma_ho_so = ${ma}`;
  return r;
}
async function xn(u: AuthUser, ma: string) {
  const h = await hs(ma);
  await xacNhanHoSo(u, h.id, h.version, true);
}

/** Dữ liệu: ngan xác nhận H001,H002; H003 vào kho cá nhân ngan; thêm tay 1 vào B7. trinh nhận H009 từ kho chung,
 *  xác nhận H004; LK trinh xác nhận hết + chốt; đề nghị chờ: ngan xin chuyển H004 sang B7. */
async function dungDuLieu() {
  await xn(ngan, 'H001'); await xn(ngan, 'H002');
  const h3 = await hs('H003');
  await chuyenHoSo(ngan, h3.id, { version: h3.version, den: 'kho_ca_nhan' });
  await themHoSo(ngan, B7, {
    ho_ten: 'Lương Văn Mới', gioi_tinh: 'Nam', nam_sinh: 1990,
    cls: { ctm: 1, glucose: 0, ure: 0, creatinin: 0, got: 0, gpt: 0, tpt_nuoc_tieu: 0, sieu_am: 0 },
  });
  const h9 = await hs('H009');
  await nhanVeHoSo(trinh, h9.id, { version: h9.version, buoi: B8 });
  await xn(trinh, 'H004');
  for (const ma of ['H006', 'H007', 'H008']) await xn(trinh, ma);
  await xacNhanBuoi(trinh, LK, 'Thừa 1 người khám bổ sung');
  const h4 = await hs('H004'); void h4;
  const h5 = await hs('H005');
  await taoDeNghi(ngan, { ho_so_id: h5.id, den_buoi: B7, ly_do: 'Khám nhầm buổi' });
}

beforeAll(async () => { await sql()`SELECT 1 FROM import_batches LIMIT 1`; });
beforeEach(async () => {
  await sql()`TRUNCATE nhat_ky, de_nghi_chuyen, ho_so, buoi_kham, import_batches, users, dang_nhap_that_bai RESTART IDENTITY CASCADE`;
  await apDung(sql(), parseGoi(taoGoiThu().files).goi!, 'cli:test');
  admin = await layUser('admin'); ngan = await layUser('ngan'); trinh = await layUser('trinh');
  const id = async (k: string) => (await layBuoiCoQuyen(sql(), admin, k)).id;
  await phanCong(admin, [await id(B7)], ngan.id);
  await phanCong(admin, [await id(B8), await id(LK)], trinh.id);
  await dungDuLieu();
});
afterAll(async () => { await closeDb(); });

/** Đối chiếu độc lập: tính thẳng từ bảng thô, không dùng truyVanBuoi. */
async function sqlThe(userId: number | null): Promise<TheTongHop> {
  const loc = userId === null ? sql()`TRUE` : sql()`b.phu_trach_user_id = ${userId}`;
  const [r] = await sql()<Record<string, number>[]>`
    WITH t AS (
      SELECT b.id, b.so_doan_tong AS so, b.trang_thai,
        (SELECT count(*) FROM ho_so h WHERE h.buoi_id = b.id AND h.vi_tri = 'buoi')::int AS hien,
        (SELECT count(*) FROM ho_so h WHERE h.buoi_id = b.id AND h.vi_tri = 'buoi' AND h.da_xac_nhan)::int AS dxn,
        (SELECT count(*) FROM ho_so h WHERE h.buoi_id = b.id AND h.vi_tri = 'buoi' AND (h.nguon = 'them_tay' OR h.nhan_tu_kho_chung))::int AS bs
      FROM buoi_kham b WHERE ${loc})
    SELECT count(*)::int AS so_buoi,
      (count(*) FILTER (WHERE trang_thai = 'da_xac_nhan'))::int AS so_buoi_da_xac_nhan,
      COALESCE(sum(so), 0)::int AS so_doan, COALESCE(sum(hien), 0)::int AS hien_co, COALESCE(sum(dxn), 0)::int AS da_xac_nhan,
      COALESCE(sum(GREATEST(hien - so, 0)), 0)::int AS thua, COALESCE(sum(GREATEST(so - hien, 0)), 0)::int AS thieu,
      COALESCE(sum(bs), 0)::int AS bo_sung FROM t`;
  const [k] = await sql()<{ n: number }[]>`
    SELECT count(*)::int AS n FROM ho_so WHERE vi_tri = 'kho_ca_nhan' AND ${userId === null ? sql()`TRUE` : sql()`kho_user_id = ${userId}`}`;
  return {
    so_buoi: r.so_buoi, so_buoi_da_xac_nhan: r.so_buoi_da_xac_nhan, so_buoi_chua_xac_nhan: r.so_buoi - r.so_buoi_da_xac_nhan,
    so_doan: r.so_doan, hien_co: r.hien_co, da_xac_nhan: r.da_xac_nhan, chua_xac_nhan: r.hien_co - r.da_xac_nhan,
    thua: r.thua, thieu: r.thieu, chenh_lech: r.hien_co - r.so_doan, bo_sung: r.bo_sung, kho_ca_nhan: k.n,
    tien_do: r.hien_co === 0 ? 0 : Math.round((r.da_xac_nhan * 1000) / r.hien_co) / 10,
  };
}

describe('tongHopTuBuoi (thuần)', () => {
  const b = (o: Partial<BuoiTomTat>) => ({ so_doan_tong: 0, hien_co: 0, da_xac_nhan: 0, thua: 0, thieu: 0, bo_sung: 0, trang_thai: 'chua_ra_soat', ...o }) as BuoiTomTat;
  it('thừa/thiếu cộng theo buổi, không bù trừ; rỗng → 0', () => {
    const t = tongHopTuBuoi([b({ so_doan_tong: 10, hien_co: 12, thua: 2, da_xac_nhan: 6 }), b({ so_doan_tong: 5, hien_co: 3, thieu: 2, da_xac_nhan: 3, trang_thai: 'da_xac_nhan' })], 4);
    expect(t).toMatchObject({ so_buoi: 2, so_buoi_da_xac_nhan: 1, so_buoi_chua_xac_nhan: 1, so_doan: 15, hien_co: 15, thua: 2, thieu: 2, chenh_lech: 0, kho_ca_nhan: 4, da_xac_nhan: 9, chua_xac_nhan: 6, tien_do: 60 });
    expect(tongHopTuBuoi([], 0)).toMatchObject({ so_buoi: 0, tien_do: 0, chenh_lech: 0 });
  });
});

describe('dashboardToi', () => {
  it('nhân viên: số khớp SQL độc lập, chỉ buổi + kho của mình', async () => {
    for (const u of [ngan, trinh]) {
      const d = await dashboardToi(u);
      expect(d.the).toEqual(await sqlThe(u.id));
      expect(d.buoi.every((x) => x.phu_trach?.id === u.id)).toBe(true);
      expect(d.kho_ca_nhan).toHaveLength(d.the.kho_ca_nhan);
    }
    const dn = await dashboardToi(ngan);
    expect(dn.the).toMatchObject({ so_buoi: 1, hien_co: 3, da_xac_nhan: 3, bo_sung: 1, kho_ca_nhan: 1, thua: 0, thieu: 1, chenh_lech: -1, tien_do: 100 });
    const dt = await dashboardToi(trinh);
    expect(dt.the).toMatchObject({ so_buoi: 2, so_buoi_da_xac_nhan: 1, so_doan: 5, hien_co: 6, thua: 1, bo_sung: 1, chenh_lech: 1 });
  });
  it('đề nghị chờ: chỉ người giữ hồ sơ thấy; admin thấy tất cả', async () => {
    expect((await dashboardToi(trinh)).de_nghi_cho_toi).toBe(1);
    expect((await dashboardToi(ngan)).de_nghi_cho_toi).toBe(0);
    expect((await dashboardToi(admin)).de_nghi_cho_toi).toBe(1);
  });
  it('admin: toàn bộ buổi và mọi kho cá nhân', async () => {
    const d = await dashboardToi(admin);
    expect(d.the).toEqual(await sqlThe(null));
    expect(d.buoi).toHaveLength(3);
    expect(d.kho_ca_nhan).toHaveLength(1);
  });
});

describe('dashboardAdmin', () => {
  it('theo user: mọi user, thứ tự nhân viên trước admin, khớp SQL', async () => {
    const d = await dashboardAdmin();
    expect(d.theo_user.map((x) => x.user.username)).toEqual(['ngan', 'trinh', 'admin']);
    for (const r of d.theo_user) {
      const { user, active, last_seen_at, lan_hoat_dong_cuoi, ...the } = r;
      void user; void active; void last_seen_at; void lan_hoat_dong_cuoi;
      expect(the).toEqual(await sqlThe(r.user.id));
    }
    const ad = d.theo_user.find((x) => x.user.username === 'admin')!;
    expect(ad.so_buoi).toBe(0); // user không có buổi vẫn có dòng
    expect(d.the).toEqual(await sqlThe(null));
  });
  it('lan_hoat_dong_cuoi = max(nhat_ky.at) của user', async () => {
    const d = await dashboardAdmin();
    for (const r of d.theo_user) {
      const [m] = await sql()<{ m: Date | null }[]>`SELECT max(at) AS m FROM nhat_ky WHERE user_id = ${r.user.id}`;
      expect(r.lan_hoat_dong_cuoi).toBe(m.m ? m.m.toISOString() : null);
    }
    expect(d.theo_user.find((x) => x.user.username === 'ngan')!.lan_hoat_dong_cuoi).not.toBeNull();
  });
  it('theo đơn vị: CLS và co_tt_ksk chỉ tính hồ sơ buổi đã xác nhận; dòng Cộng = tổng', async () => {
    const d = await dashboardAdmin();
    expect(d.theo_don_vi.map((x) => x.don_vi)).toEqual(['TN', 'LK', 'VK', 'TONG']);
    for (const dv of ['TN', 'LK', 'VK'] as const) {
      const row = d.theo_don_vi.find((x) => x.don_vi === dv)!;
      const [r] = await sql()<Record<string, number>[]>`
        SELECT (SELECT count(*) FROM buoi_kham WHERE don_vi = ${dv})::int AS so_buoi,
               (SELECT COALESCE(sum(so_doan_tong), 0) FROM buoi_kham WHERE don_vi = ${dv})::int AS so_doan,
               (SELECT count(*) FROM ho_so h JOIN buoi_kham b ON b.id = h.buoi_id WHERE b.don_vi = ${dv} AND h.vi_tri = 'buoi')::int AS hien_co,
               (SELECT count(*) FROM ho_so h JOIN buoi_kham b ON b.id = h.buoi_id WHERE b.don_vi = ${dv} AND h.vi_tri = 'buoi' AND h.da_xac_nhan)::int AS da_xac_nhan,
               (SELECT COALESCE(sum(GREATEST(x.hien - x.so, 0)), 0) FROM (SELECT b.so_doan_tong AS so, (SELECT count(*) FROM ho_so h WHERE h.buoi_id = b.id AND h.vi_tri = 'buoi') AS hien FROM buoi_kham b WHERE b.don_vi = ${dv}) x)::int AS thua,
               (SELECT COALESCE(sum(GREATEST(x.so - x.hien, 0)), 0) FROM (SELECT b.so_doan_tong AS so, (SELECT count(*) FROM ho_so h WHERE h.buoi_id = b.id AND h.vi_tri = 'buoi') AS hien FROM buoi_kham b WHERE b.don_vi = ${dv}) x)::int AS thieu,
               (SELECT count(*) FROM ho_so h JOIN buoi_kham b ON b.id = h.buoi_id WHERE b.don_vi = ${dv} AND h.vi_tri = 'buoi' AND h.da_xac_nhan AND h.co_tt_ksk = 1)::int AS co_tt_ksk`;
      expect({ so_buoi: row.so_buoi, so_doan: row.so_doan, hien_co: row.hien_co, da_xac_nhan: row.da_xac_nhan, thua: row.thua, thieu: row.thieu, co_tt_ksk: row.co_tt_ksk })
        .toEqual({ so_buoi: r.so_buoi, so_doan: r.so_doan, hien_co: r.hien_co, da_xac_nhan: r.da_xac_nhan, thua: r.thua, thieu: r.thieu, co_tt_ksk: r.co_tt_ksk });
      expect(row.chenh_lech).toBe(r.hien_co - r.so_doan);
      for (const k of CLS_KEYS) {
        const [c] = await sql()<{ n: number }[]>`
          SELECT count(*)::int AS n FROM ho_so h JOIN buoi_kham b ON b.id = h.buoi_id
          WHERE b.don_vi = ${dv} AND h.vi_tri = 'buoi' AND h.da_xac_nhan AND ${sql()(k)} = 1`;
        expect(row.cls[k], `${dv}.${k}`).toBe(c.n);
      }
    }
    const tong = d.theo_don_vi.find((x) => x.don_vi === 'TONG')!;
    const cong = (f: (x: (typeof d.theo_don_vi)[number]) => number) => d.theo_don_vi.filter((x) => x.don_vi !== 'TONG').reduce((s, x) => s + f(x), 0);
    expect(tong.ten).toBe('Cộng');
    for (const f of ['so_buoi', 'so_doan', 'hien_co', 'da_xac_nhan', 'thua', 'thieu', 'chenh_lech', 'co_tt_ksk'] as const) expect(tong[f], f).toBe(cong((x) => x[f]));
    for (const k of CLS_KEYS) expect(tong.cls[k], k).toBe(cong((x) => x.cls[k]));
    // hồ sơ chưa xác nhận / ở kho không được đếm: tổng đã xác nhận trong buổi < hiện có
    expect(tong.da_xac_nhan).toBeLessThan(tong.hien_co);
  });
  it('kho chung và đề nghị chờ', async () => {
    const d = await dashboardAdmin();
    const [k] = await sql()<{ n: number }[]>`SELECT count(*)::int AS n FROM ho_so WHERE vi_tri = 'kho_chung'`;
    const [c] = await sql()<{ n: number }[]>`SELECT count(*)::int AS n FROM de_nghi_chuyen WHERE trang_thai = 'cho_xu_ly'`;
    expect(d.kho_chung).toBe(k.n);
    expect(d.kho_chung).toBe(1); // H010 (H009 đã nhận)
    expect(d.de_nghi_cho).toBe(c.n);
    expect(d.de_nghi_cho).toBe(1);
  });
});

describe('nhật ký admin', () => {
  const q = (o: Record<string, string>) => docNhatKyQuery(new URLSearchParams(o));
  it('lọc theo user / hành động, sắp xếp mới → cũ, mô tả đối tượng không chứa họ tên', async () => {
    const tat = await nhatKyAdmin(q({}));
    expect(tat.kich_thuoc).toBe(100);
    const [n] = await sql()<{ n: number }[]>`SELECT count(*)::int AS n FROM nhat_ky`;
    expect(tat.tong).toBe(n.n);
    for (let i = 1; i < tat.dong.length; i++) expect(tat.dong[i - 1].id).toBeGreaterThan(tat.dong[i].id);

    const cuaNgan = await nhatKyAdmin(q({ user: String(ngan.id) }));
    expect(cuaNgan.dong.length).toBeGreaterThan(0);
    expect(cuaNgan.dong.every((x) => x.user?.id === ngan.id)).toBe(true);

    const xnh = await nhatKyAdmin(q({ hanh_dong: 'xac_nhan' }));
    expect(xnh.dong.length).toBeGreaterThan(0);
    expect(xnh.dong.every((x) => x.hanh_dong === 'xac_nhan')).toBe(true);

    const hoTen = await sql()<{ ho_ten: string }[]>`SELECT ho_ten FROM ho_so`;
    const mo = tat.dong.map((x) => x.mo_ta_doi_tuong);
    for (const { ho_ten } of hoTen) for (const m of mo) expect(m).not.toContain(ho_ten);
    const hsDong = tat.dong.find((x) => x.doi_tuong === 'ho_so')!;
    expect(hsDong.mo_ta_doi_tuong).toMatch(/^Hồ sơ #\d+ \((H\d+|thêm tay)\)$/);
    expect(tat.dong.some((x) => x.mo_ta_doi_tuong === 'Hồ sơ #' + 0)).toBe(false);
    const buoiDong = tat.dong.find((x) => x.doi_tuong === 'buoi_kham')!;
    expect(buoiDong.mo_ta_doi_tuong).toMatch(/^(TN|LK|VK)-\d{8}$/);
    const userDong = tat.dong.find((x) => x.doi_tuong === 'user');
    if (userDong) expect(userDong.mo_ta_doi_tuong).toMatch(/^[a-z0-9_.]+$/);
    const them = tat.dong.find((x) => x.hanh_dong === 'them_ho_so')!;
    expect(them.mo_ta_doi_tuong).toContain('thêm tay');
  });
  it('lọc ngày theo giờ Việt Nam (den gồm cả ngày đó)', async () => {
    await sql()`TRUNCATE nhat_ky RESTART IDENTITY`;
    await sql()`INSERT INTO nhat_ky (at, user_id, hanh_dong, doi_tuong) VALUES
      ('2026-09-06T16:59:00Z', ${ngan.id}, 'a', 'auth'),   -- 06/09 23:59 VN
      ('2026-09-06T17:00:00Z', ${ngan.id}, 'b', 'auth'),   -- 07/09 00:00 VN
      ('2026-09-07T16:59:59Z', ${ngan.id}, 'c', 'auth'),   -- 07/09 23:59 VN
      ('2026-09-07T17:00:00Z', ${ngan.id}, 'd', 'auth')`;  // 08/09 00:00 VN
    const hd = async (o: Record<string, string>) => (await nhatKyAdmin(q(o))).dong.map((x) => x.hanh_dong).sort();
    expect(await hd({ tu: '2026-09-07', den: '2026-09-07' })).toEqual(['b', 'c']);
    expect(await hd({ tu: '2026-09-07' })).toEqual(['b', 'c', 'd']);
    expect(await hd({ den: '2026-09-06' })).toEqual(['a']);
  });
  it('phân trang 100 dòng', async () => {
    await sql()`TRUNCATE nhat_ky RESTART IDENTITY`;
    await sql()`INSERT INTO nhat_ky (user_id, hanh_dong, doi_tuong) SELECT ${ngan.id}, 'x', 'auth' FROM generate_series(1, 250)`;
    const p1 = await nhatKyAdmin(q({}));
    const p3 = await nhatKyAdmin(q({ trang: '3' }));
    const p4 = await nhatKyAdmin(q({ trang: '4' }));
    expect([p1.dong.length, p3.dong.length, p4.dong.length]).toEqual([100, 50, 0]);
    expect(p1.tong).toBe(250);
    expect(p3.trang).toBe(3);
    expect(p1.dong[0].id).toBe(250);
    expect(p3.dong[49].id).toBe(1);
  });
  it('query sai → 400 tiếng Việt', () => {
    for (const o of <Record<string, string>[]>[{ tu: '07/09/2026' }, { user: 'abc' }, { trang: '-1' }]) {
      try { q(o); throw new Error('không lỗi'); } catch (e) { expect(e).toBeInstanceOf(LoiNghiepVu); expect((e as LoiNghiepVu).status).toBe(400); }
    }
  });
});
