// Kịch bản H (docs/04 mục 3) và các quy tắc nạp lại của docs/03 mục 4.
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { closeDb, getSql } from '@/db/client';
import type { AuthUser } from '@/lib/auth/guard';
import { keHoachSangApi, lichSuNap, xuLyUpload } from '@/lib/import/api';
import { parseGoi } from '@/lib/import/goi';
import { NapTuChoi, apDung, lapKeHoach } from '@/lib/import/nap';
import { layBuoiCoQuyen } from '@/lib/ra-soat/buoi';
import { chuyenHoSo } from '@/lib/ra-soat/chuyen';
import { suaHoSo, xacNhanHoSo } from '@/lib/ra-soat/ho-so';
import { LoiNghiepVu } from '@/lib/ra-soat/loi';
import { phanCong } from '@/lib/ra-soat/phan-cong';
import { themHoSo } from '@/lib/ra-soat/them-ho-so';
import { xacNhanBuoi } from '@/lib/ra-soat/xac-nhan-buoi';
import { hoSoMacDinh, taoGoiThu, type Bien, type Row } from './helpers/goi-thu';

const URL_TEST = process.env.TEST_DATABASE_URL;
if (!URL_TEST) throw new Error('Thiếu TEST_DATABASE_URL (.env.local)');
if (!/test/i.test(new URL(URL_TEST).pathname)) throw new Error('TEST_DATABASE_URL phải trỏ vào DB có chữ "test"');

const sql = () => getSql();
let admin: AuthUser, ngan: AuthUser;

async function layUser(username: string): Promise<AuthUser> {
  const [r] = await sql()<AuthUser[]>`SELECT id, username, ho_ten, role, session_version FROM users WHERE username = ${username}`;
  return r;
}
const goi = (bien: Bien = {}) => {
  const g = taoGoiThu(bien);
  const kq = parseGoi(g.files);
  if (!kq.ok) throw new Error(kq.errors.join('\n'));
  return { ...g, goi: kq.goi! };
};
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const hs = async (ma: string): Promise<any> => (await sql()`SELECT * FROM ho_so WHERE ma_ho_so = ${ma}`)[0];
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const buoi = async (ma: string): Promise<any> => (await sql()`SELECT * FROM buoi_kham WHERE ma_buoi = ${ma}`)[0];
const sua = (r: Row[], ma: string, doi: Row) => r.map((x) => (x.ma_ho_so === ma ? { ...x, ...doi } : x));

async function chup() {
  const a = await sql()`SELECT md5(string_agg(t::text, '|' ORDER BY id)) AS m, count(*)::int AS n FROM ho_so t`;
  const b = await sql()`SELECT md5(string_agg(t::text, '|' ORDER BY id)) AS m, count(*)::int AS n FROM buoi_kham t`;
  return { ho_so: a[0], buoi: b[0] };
}
const KHONG_DOI = {
  buoi_cap_nhat: 0, ho_so_them_moi: 0, ho_so_cap_nhat: 0, ho_so_cap_nhat_tham_chieu: 0, ho_so_giu_do_da_cham: 0,
  ho_so_chuyen_vi_tri: 0, ho_so_go_khoi_nguon_an: 0, ho_so_go_khoi_nguon_giu: 0, khong_vao_buoi_khoa: 0,
};
const dem = async () => (await sql()<{ n: number }[]>`SELECT (SELECT count(*) FROM ho_so)::int + (SELECT count(*) FROM buoi_kham)::int + (SELECT count(*) FROM import_batches)::int + (SELECT count(*) FROM nhat_ky)::int AS n`)[0].n;

beforeAll(async () => { await sql()`SELECT 1 FROM import_batches LIMIT 1`; });
beforeEach(async () => {
  await sql()`TRUNCATE nhat_ky, de_nghi_chuyen, ho_so, buoi_kham, import_batches, users, dang_nhap_that_bai RESTART IDENTITY CASCADE`;
  await apDung(sql(), goi().goi, 'cli:test'); // v0-test-1
  admin = await layUser('admin'); ngan = await layUser('ngan');
});
afterAll(async () => { await closeDb(); });

const v0b = (bien: Bien = {}) => goi({ phienBan: 'v0-test-2', ...bien });

describe('kịch bản H', () => {
  it('H.1 đổi cls_glucose: chưa chạm → đổi; đã sửa CLS → giữ + src mới + NGUON_DOI_SAU_RA_SOAT', async () => {
    const y = await hs('H005'); // '11100001': glucose = 1
    await suaHoSo(admin, y.id, { version: y.version, cls: { ctm: 0 } });
    const g = v0b({ hoSo: (r) => sua(sua(r, 'H004', { cls_glucose: '1' }), 'H005', { cls_glucose: '0' }) });
    const kh = await apDung(sql(), g.goi, 'cli:test');
    expect(kh.cheDo).toBe('nap_lai');
    const X = await hs('H004');
    expect(X.glucose).toBe(1);
    expect(X.src.cls.glucose).toBe(1);
    expect(X.canh_bao).not.toContain('NGUON_DOI_SAU_RA_SOAT');
    const Y = await hs('H005');
    expect(Y.glucose).toBe(1); // giá trị người rà soát
    expect(Y.ctm).toBe(0); // người rà soát sửa
    expect(Y.src.cls.glucose).toBe(0); // nguồn mới
    expect(Y.canh_bao).toContain('NGUON_DOI_SAU_RA_SOAT');
    expect(Y.sua_cls).toBe(true);
    expect(kh.napLai).toMatchObject({ ho_so_cap_nhat: 1, ho_so_giu_do_da_cham: 1 });
    expect(Y.version).toBeGreaterThan(y.version);
  });

  it('H.2 đổi ma_buoi: chưa chạm → chuyển buổi; đã chuyển vào kho cá nhân → giữ', async () => {
    const w = await hs('H002');
    await chuyenHoSo(ngan, w.id, { version: w.version, den: 'kho_ca_nhan' }).catch(async () => chuyenHoSo(admin, w.id, { version: w.version, den: 'kho_ca_nhan' }));
    expect((await hs('H002')).vi_tri).toBe('kho_ca_nhan');
    const g = v0b({ hoSo: (r) => sua(sua(r, 'H001', { ma_buoi: 'TN-20260908' }), 'H002', { ma_buoi: 'TN-20260908' }) });
    const kh = await apDung(sql(), g.goi, 'cli:test');
    const Z = await hs('H001');
    const b8 = await buoi('TN-20260908');
    expect(Z.vi_tri).toBe('buoi');
    expect(Z.buoi_id).toBe(b8.id);
    expect(Z.ma_buoi_ban_dau).toBe('TN-20260908');
    const W = await hs('H002');
    expect(W.vi_tri).toBe('kho_ca_nhan');
    expect(W.buoi_id).toBeNull();
    expect(kh.napLai!.ho_so_chuyen_vi_tri).toBe(1);
  });

  it('H.3 bỏ P (chưa chạm) và Q (đã xác nhận)', async () => {
    const q = await hs('H006');
    await xacNhanHoSo(admin, q.id, q.version, true);
    const g = v0b({ hoSo: (r) => r.filter((x) => x.ma_ho_so !== 'H003' && x.ma_ho_so !== 'H006') });
    const kh = await apDung(sql(), g.goi, 'cli:test');
    const P = await hs('H003');
    expect(P).toMatchObject({ vi_tri: 'an', buoi_id: null, trang_thai_nguon: 'da_go_khoi_goi' });
    const Q = await hs('H006');
    expect(Q).toMatchObject({ vi_tri: 'buoi', da_xac_nhan: true, trang_thai_nguon: 'da_go_khoi_goi' });
    expect(Q.buoi_id).toBe(q.buoi_id);
    expect(Q.canh_bao).toContain('DA_GO_KHOI_NGUON');
    expect(P.canh_bao).not.toContain('DA_GO_KHOI_NGUON');
    expect(kh.napLai).toMatchObject({ ho_so_go_khoi_nguon_an: 1, ho_so_go_khoi_nguon_giu: 1 });
    // hồ sơ trở lại gói: bỏ cờ gỡ, P quay về buổi theo gói (chưa chạm)
    await apDung(sql(), goi({ phienBan: 'v0-test-3' }).goi, 'cli:test');
    const P2 = await hs('H003');
    expect(P2).toMatchObject({ vi_tri: 'buoi', trang_thai_nguon: 'co_trong_goi' });
    const Q2 = await hs('H006');
    expect(Q2.canh_bao).not.toContain('DA_GO_KHOI_NGUON');
    expect(Q2.trang_thai_nguon).toBe('co_trong_goi');
  });

  it('H.4 hồ sơ mới vào kho chung', async () => {
    const g = v0b({
      hoSo: (r) => [...r, { ...hoSoMacDinh()[8], ma_ho_so: 'H011', ma_kcb: '011234', cccd: '031066014511' }],
    });
    const kh = await apDung(sql(), g.goi, 'cli:test');
    const R = await hs('H011');
    expect(R).toMatchObject({ vi_tri: 'kho_chung', buoi_id: null, nguon: 'cowork', da_xac_nhan: false });
    expect(kh.napLai!.ho_so_them_moi).toBe(1);
    expect(kh.hoSoThemKhoChung).toBe(1);
  });

  it('H.5 nạp lại chính v0 (force) → 0 thay đổi, DB không đổi', async () => {
    const truoc = await chup();
    const gv0 = goi();
    const kh0 = await lapKeHoach(sql(), gv0.goi); // không force: bị từ chối
    expect(kh0.tuChoi).toMatch(/cũ hơn hoặc đã được nạp/);
    const kh = await apDung(sql(), gv0.goi, 'cli:test', { force: true });
    expect(kh.tuChoi).toBeNull();
    expect(kh.napLai).toMatchObject(KHONG_DOI);
    expect(kh.napLai!.buoi_them).toEqual([]);
    expect(kh.napLai!.ho_so_khong_doi).toBe(10);
    expect(kh.napLai!.da_xac_nhan_nguon_doi).toEqual([]);
    expect(kh.napLai!.them_tay_trung_goi).toEqual([]);
    expect(kh.napLai!.tong_truoc).toEqual(kh.napLai!.tong_sau);
    expect(await chup()).toEqual(truoc);
    // dòng lịch sử có hậu tố, phiên bản gốc nằm trong tom_tat
    const ls = (await lichSuNap()).lan_nap;
    expect(ls.map((x) => x.phien_ban).sort()).toEqual(['v0-test-1', 'v0-test-1#force-1']);
    expect(ls[0].che_do).toBe('nap_lai');
  });

  it('H.6 gói sai sha256 / tổng manifest lệch → từ chối, không ghi gì', async () => {
    const truoc = { db: await chup(), n: await dem() };
    for (const bien of [
      { phienBan: 'v0-test-9', manifest: (m: any) => { m.sha256['ho_so.csv'] = '0'.repeat(64); } }, // eslint-disable-line @typescript-eslint/no-explicit-any
      { phienBan: 'v0-test-9', manifest: (m: any) => { m.tong_theo_don_vi.TN.cls_ctm += 1; } }, // eslint-disable-line @typescript-eslint/no-explicit-any
    ] as Bien[]) {
      const g = taoGoiThu(bien);
      const form = new FormData();
      for (const [k, v] of Object.entries(g.files)) form.append(k, new Blob([new Uint8Array(v)]), k);
      for (const ghi of [false, true]) {
        const kq = await xuLyUpload(form, ghi, 'admin');
        expect(kq.ok).toBe(false);
        expect(kq.ke_hoach).toBeNull();
        expect(kq.errors.length).toBeGreaterThan(0);
      }
    }
    expect({ db: await chup(), n: await dem() }).toEqual(truoc);
  });
});

describe('quy tắc nạp lại khác', () => {
  it('nhân thân đã sửa giữ nguyên (chỉ src đổi); tham chiếu luôn cập nhật', async () => {
    const h = await hs('H007');
    await suaHoSo(admin, h.id, { version: h.version, ho_ten: 'NGUYỄN SỬA TAY' });
    const g = v0b({ hoSo: (r) => sua(sua(r, 'H007', { ho_ten: 'VŨ VĂN MỚI', co_tt_ksk: '0', cls_ghi_chu: 'ghi chú mới' }), 'H008', { co_tt_ksk: '0' }) });
    const kh = await apDung(sql(), g.goi, 'cli:test');
    const a = await hs('H007');
    expect(a.ho_ten).toBe('NGUYỄN SỬA TAY');
    expect(a.ho_ten_kd).toBe('nguyen sua tay');
    expect(a.src.ho_ten).toBe('VŨ VĂN MỚI');
    expect(a.co_tt_ksk).toBe(0);
    expect(a.cls_ghi_chu).toBe('ghi chú mới');
    expect(a.canh_bao).not.toContain('NGUON_DOI_SAU_RA_SOAT'); // nhân thân đã chạm: chỉ cập nhật src, không cảnh báo
    expect((await hs('H008')).co_tt_ksk).toBe(0);
    expect(kh.napLai).toMatchObject({ ho_so_giu_do_da_cham: 1, ho_so_cap_nhat: 0, ho_so_cap_nhat_tham_chieu: 1 });
  });

  it('hồ sơ đã xác nhận mà nguồn đổi → cảnh báo + liệt kê, vẫn xác nhận', async () => {
    const h = await hs('H008'); // '01000000'
    await xacNhanHoSo(admin, h.id, h.version, true);
    const g = v0b({ hoSo: (r) => sua(r, 'H008', { cls_ure: '1' }) });
    const kh = await apDung(sql(), g.goi, 'cli:test');
    const a = await hs('H008');
    expect(a.da_xac_nhan).toBe(true);
    expect(a.ure).toBe(1); // cờ chưa chạm → ghi đè theo bảng
    expect(a.canh_bao).toContain('NGUON_DOI_SAU_RA_SOAT');
    expect(kh.napLai!.da_xac_nhan_nguon_doi).toEqual([{ id: h.id, ma_ho_so: 'H008', ma_buoi: 'LK-20261014', truong: ['cls_ure'] }]);
    const [{ n }] = await sql()<{ n: number }[]>`SELECT count(*)::int AS n FROM nhat_ky WHERE hanh_dong = 'import_cap_nhat'`;
    expect(n).toBe(1);
    // nạp lại cùng gói (force) → cảnh báo vẫn còn, không đổi gì
    const truoc = await chup();
    const kh2 = await apDung(sql(), g.goi, 'cli:test', { force: true });
    expect(kh2.napLai).toMatchObject(KHONG_DOI);
    expect(await chup()).toEqual(truoc);
  });

  it('đích là buổi đã khóa → kho chung kèm ghi chú; hồ sơ trong buổi khóa chỉ cập nhật tham chiếu/src', async () => {
    for (const ma of ['H006', 'H007', 'H008']) { const h = await hs(ma); await xacNhanHoSo(admin, h.id, h.version, true); }
    await xacNhanBuoi(admin, 'LK-20261014', 'lệch sổ đoàn thử');
    expect((await buoi('LK-20261014')).trang_thai).toBe('da_xac_nhan');
    const g = v0b({
      hoSo: (r) => sua(sua(sua(r, 'H004', { ma_buoi: 'LK-20261014' }), 'H006', { cls_ctm: '1', co_tt_ksk: '0' }), 'H0010', { ma_buoi: 'LK-20261014', vi_tri_ban_dau: 'buoi' }),
    });
    const kh = await apDung(sql(), g.goi, 'cli:test');
    const a = await hs('H004');
    expect(a.vi_tri).toBe('kho_chung');
    expect(a.chuyen_ly_do).toContain('LK-20261014');
    expect(kh.napLai!.khong_vao_buoi_khoa).toBe(1); // H004; H010 đang ở kho chung nên không "chuyển" gì
    expect((await hs('H0010')).vi_tri).toBe('kho_chung');
    const k = await hs('H006');
    expect(k.vi_tri).toBe('buoi');
    expect(k.ctm).toBe(0); // giá trị hiện hành giữ
    expect(k.src.cls.ctm).toBe(1); // src mới
    expect(k.co_tt_ksk).toBe(0); // tham chiếu cập nhật
    expect(k.canh_bao).toContain('NGUON_DOI_SAU_RA_SOAT');
    expect((await buoi('LK-20261014')).trang_thai).toBe('da_xac_nhan');
  });

  it('buổi mới thêm, buổi có đổi mô tả cập nhật, buổi mất chỉ cảnh báo, phân công giữ', async () => {
    const tn7 = await layBuoiCoQuyen(sql(), admin, 'TN-20260907');
    await phanCong(admin, [tn7.id], ngan.id);
    const mat = 'LK-20261014';
    const g = v0b({
      buoi: (r) => [
        ...r.filter((b) => b.ma_buoi !== mat).map((b) => (b.ma_buoi === 'TN-20260907' ? { ...b, diem_kham: 'TYT Mới', so_doan_tong: '9', so_doan_6_18: '5' } : b)),
        { ...r[2], ma_buoi: 'LK-20261015', ngay_kham: '15/10/2026', so_doan_tong: '2' },
      ],
      hoSo: (r) => r.filter((x) => x.ma_buoi !== mat).concat([{ ...hoSoMacDinh()[7], ma_ho_so: 'H012', ma_buoi: 'LK-20261015', ma_kcb: '012', cccd: '031066014512' }]),
    });
    const kh = await apDung(sql(), g.goi, 'cli:test');
    expect(kh.napLai).toMatchObject({ buoi_them: ['LK-20261015'], buoi_cap_nhat: 1, buoi_khong_con_trong_goi: [mat] });
    const b = await buoi('TN-20260907');
    expect(b).toMatchObject({ diem_kham: 'TYT Mới', so_doan_tong: 9, phu_trach_user_id: ngan.id });
    expect(b.so_doan.so_doan_6_18).toBe(5);
    expect((await buoi(mat)).id).toBeTruthy(); // buổi mất vẫn còn
    const moi = await buoi('LK-20261015');
    const r = await hs('H012');
    expect(r).toMatchObject({ vi_tri: 'buoi', buoi_id: moi.id });
    expect(kh.napLai!.tong_sau.LK.so_buoi).toBe(2);
    expect(kh.napLai!.tong_truoc.LK.so_buoi).toBe(1);
    // hồ sơ buổi bị mất: chưa chạm → ẩn
    expect((await hs('H006')).vi_tri).toBe('an');
  });

  it('thêm tay trùng CCCD / mã KCB với hồ sơ mới trong gói → liệt kê, không động vào hồ sơ thêm tay', async () => {
    const b = await layBuoiCoQuyen(sql(), admin, 'TN-20260907');
    const t = await themHoSo(admin, b.ma_buoi, {
      ho_ten: 'THÊM TAY A', gioi_tinh: 'Nam', nam_sinh: 1960, cccd: '031066014599', ma_kcb: '',
      cls: { ctm: 0, glucose: 0, ure: 0, creatinin: 0, got: 0, gpt: 0, tpt_nuoc_tieu: 0, sieu_am: 0 },
    });
    const t2 = await themHoSo(admin, b.ma_buoi, {
      ho_ten: 'THÊM TAY B', gioi_tinh: 'Nữ', nam_sinh: 1961, cccd: '', ma_kcb: 'KCB777',
      cls: { ctm: 0, glucose: 0, ure: 0, creatinin: 0, got: 0, gpt: 0, tpt_nuoc_tieu: 0, sieu_am: 0 },
    });
    const truoc = (await sql()`SELECT * FROM ho_so WHERE id = ANY(${[t.ho_so.id, t2.ho_so.id]})`).map((x) => JSON.stringify(x));
    const g = v0b({
      hoSo: (r) => [...r,
        { ...hoSoMacDinh()[8], ma_ho_so: 'H013', ma_kcb: '013', cccd: '031066014599' },
        { ...hoSoMacDinh()[9], ma_ho_so: 'H014', ma_kcb: 'KCB777', cccd: '031066014514' }],
    });
    const kh = await apDung(sql(), g.goi, 'cli:test');
    expect(kh.napLai!.them_tay_trung_goi).toEqual([
      { ho_so_id: t.ho_so.id, ma_ho_so_goi: 'H013', theo: 'cccd' },
      { ho_so_id: t2.ho_so.id, ma_ho_so_goi: 'H014', theo: 'ma_kcb' },
    ]);
    const sau = (await sql()`SELECT * FROM ho_so WHERE id = ANY(${[t.ho_so.id, t2.ho_so.id]})`).map((x) => JSON.stringify(x));
    expect(sau).toEqual(truoc);
  });

  it('phiên bản cũ hơn / bằng bị từ chối trừ force; user mới thêm, user cũ giữ', async () => {
    const truoc = await dem();
    await expect(apDung(sql(), goi({ phienBan: 'v0-test-0' }).goi, 'cli:test')).rejects.toThrow(NapTuChoi);
    await expect(apDung(sql(), goi().goi, 'cli:test')).rejects.toThrow(/cũ hơn hoặc đã được nạp/);
    expect(await dem()).toBe(truoc);
    await sql()`UPDATE users SET password_hash = 'HASH', ho_ten = 'Tên khác' WHERE username = 'ngan'`;
    const g = v0b({ nguoiDung: (r) => [...r, { username: 'moi', ho_ten: 'Người Mới', vai_tro: 'nhan_vien' }] });
    const kh = await apDung(sql(), g.goi, 'cli:test');
    expect(kh.userThem).toEqual(['moi']);
    const [u] = await sql()`SELECT ho_ten, password_hash FROM users WHERE username = 'ngan'`;
    expect(u).toMatchObject({ ho_ten: 'Tên khác', password_hash: 'HASH' });
    const [m] = await sql()`SELECT password_hash FROM users WHERE username = 'moi'`;
    expect(m.password_hash).toBeNull();
  });

  it('lỗi ghi giữa chừng → rollback hoàn toàn', async () => {
    // hồ sơ thêm tay mang ma_ho_so 'H011' → INSERT hồ sơ mới H011 vi phạm UNIQUE sau khi đã ghi users/buổi
    await sql()`INSERT INTO ho_so (nguon, ma_ho_so, ho_ten, ho_ten_kd, gioi_tinh, nam_sinh, vi_tri) VALUES ('them_tay', 'H011', 'x', 'x', 'Nam', 1970, 'kho_chung')`;
    const truoc = { db: await chup(), n: await dem(), u: (await sql()`SELECT count(*)::int AS n FROM users`)[0].n };
    const g = v0b({
      nguoiDung: (r) => [...r, { username: 'moi', ho_ten: 'Người Mới', vai_tro: 'nhan_vien' }],
      buoi: (r) => r.map((b) => (b.ma_buoi === 'TN-20260907' ? { ...b, diem_kham: 'ĐỔI' } : b)),
      hoSo: (r) => [...sua(r, 'H004', { cls_glucose: '1' }), { ...hoSoMacDinh()[8], ma_ho_so: 'H011', ma_kcb: '011', cccd: '031066014511' }],
    });
    await expect(apDung(sql(), g.goi, 'cli:test')).rejects.toThrow();
    expect({ db: await chup(), n: await dem(), u: (await sql()`SELECT count(*)::int AS n FROM users`)[0].n }).toEqual(truoc);
  });

  it('nạp lại cùng gói sau khi đã có nhiều trạng thái chạm → idempotent', async () => {
    const a = await hs('H005');
    await suaHoSo(admin, a.id, { version: a.version, cls: { ctm: 0 }, ho_ten: 'ĐÃ SỬA' });
    const c = await hs('H006');
    await xacNhanHoSo(admin, c.id, c.version, true);
    const g = v0b({ hoSo: (r) => sua(sua(r.filter((x) => x.ma_ho_so !== 'H003'), 'H005', { cls_glucose: '0', ho_ten: 'KHÁC' }), 'H006', { cls_ure: '1' }) });
    await apDung(sql(), g.goi, 'cli:test');
    const truoc = await chup();
    const kh = await apDung(sql(), g.goi, 'cli:test', { force: true });
    expect(kh.napLai).toMatchObject(KHONG_DOI);
    expect(await chup()).toEqual(truoc);
  });
});

describe('API tải gói', () => {
  const formTu = (files: Record<string, Buffer>, bo: string[] = [], extra: Record<string, string> = {}) => {
    const f = new FormData();
    for (const [k, v] of Object.entries(files)) if (!bo.includes(k)) f.append(k, new Blob([new Uint8Array(v)]), k);
    for (const [k, v] of Object.entries(extra)) f.append(k, v);
    return f;
  };

  it('thiếu file → LoiNghiepVu 400', async () => {
    const g = taoGoiThu({ phienBan: 'v0-test-2' });
    const e = await xuLyUpload(formTu(g.files, ['ho_so.csv']), false, 'admin').catch((x) => x);
    expect(e).toBeInstanceOf(LoiNghiepVu);
    expect(e.status).toBe(400);
    expect(e.message).toContain('ho_so.csv');
  });

  it('thử không ghi; ghi một lần; ghi lại cùng phiên bản bị từ chối kèm kế hoạch; force', async () => {
    const g = taoGoiThu({ phienBan: 'v0-test-2', hoSo: (r) => sua(r, 'H004', { cls_glucose: '1' }) });
    const truoc = await dem();
    const thu = await xuLyUpload(formTu(g.files), false, 'admin');
    expect(thu.ok).toBe(true);
    expect(thu.ke_hoach).toMatchObject({ phien_ban: 'v0-test-2', che_do: 'nap_lai', tu_choi: null });
    expect(thu.ke_hoach!.nap_lai).toMatchObject({ ho_so_cap_nhat: 1 });
    expect(await dem()).toBe(truoc);

    const ghi = await xuLyUpload(formTu(g.files), true, 'admin');
    expect(ghi.ok).toBe(true);
    expect((await hs('H004')).glucose).toBe(1);
    const [bt] = await sql()`SELECT nap_boi, che_do FROM import_batches WHERE phien_ban = 'v0-test-2'`;
    expect(bt).toMatchObject({ nap_boi: 'admin', che_do: 'nap_lai' });

    const lai = await xuLyUpload(formTu(g.files), true, 'admin');
    expect(lai.ok).toBe(false);
    expect(lai.ke_hoach!.tu_choi).toMatch(/cũ hơn hoặc đã được nạp/);
    const f = await xuLyUpload(formTu(g.files, [], { force: '1' }), false, 'admin');
    expect(f.ke_hoach!.tu_choi).toBeNull();
    expect(f.ke_hoach!.nap_lai).toMatchObject(KHONG_DOI);
    expect(keHoachSangApi(await lapKeHoach(sql(), parseGoi(g.files).goi!, { force: true })).tong_sau_nap.TN.so_buoi).toBe(2);
  });

  it('lich-su: mới nhất trước', async () => {
    await apDung(sql(), goi({ phienBan: 'v0-test-2' }).goi, 'admin');
    const { lan_nap } = await lichSuNap();
    expect(lan_nap.map((x) => x.phien_ban)).toEqual(['v0-test-2', 'v0-test-1']);
    expect(lan_nap[0]).toMatchObject({ che_do: 'nap_lai', nap_boi: 'admin' });
  });
});
