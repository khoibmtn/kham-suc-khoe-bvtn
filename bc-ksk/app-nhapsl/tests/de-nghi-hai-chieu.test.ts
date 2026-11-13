import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { closeDb, getSql } from '@/db/client';
import type { AuthUser } from '@/lib/auth/guard';
import { parseGoi } from '@/lib/import/goi';
import { apDung } from '@/lib/import/nap';
import { layBuoiCoQuyen } from '@/lib/ra-soat/buoi';
import { ghiTuDuyet } from '@/lib/ra-soat/cai-dat';
import { chuyenHoSo } from '@/lib/ra-soat/chuyen';
import { dashboardToi } from '@/lib/ra-soat/dashboard';
import { danhSachDeNghi, taoDeNghi, xuLyDeNghi } from '@/lib/ra-soat/de-nghi';
import { xacNhanHoSo } from '@/lib/ra-soat/ho-so';
import { LoiNghiepVu } from '@/lib/ra-soat/loi';
import { phanCong } from '@/lib/ra-soat/phan-cong';
import { deNghiSchema } from '@/lib/ra-soat/schemas';
import { datLaiThrottleTuDuyet, quetTuDuyet } from '@/lib/ra-soat/tu-duyet';
import { payloadDeNghiMoi } from '@/lib/push';
import { taoGoiThu } from './helpers/goi-thu';

const URL_TEST = process.env.TEST_DATABASE_URL;
if (!URL_TEST) throw new Error('Thiếu TEST_DATABASE_URL (.env.local)');
if (!/test/i.test(new URL(URL_TEST).pathname)) throw new Error('TEST_DATABASE_URL phải trỏ vào DB có chữ "test"');

const sql = () => getSql();
let admin: AuthUser, ngan: AuthUser, trinh: AuthUser, khac: AuthUser;
const B7 = 'TN-20260907'; // ngan: H001-H003
const B8 = 'TN-20260908'; // trinh: H004-H005
const LK = 'LK-20261014'; // chưa phân công

async function layUser(username: string): Promise<AuthUser> {
  const [r] = await sql()<AuthUser[]>`SELECT id, username, ho_ten, role, session_version FROM users WHERE username = ${username}`;
  return r;
}
async function loi(p: Promise<unknown>): Promise<LoiNghiepVu> {
  try { await p; } catch (e) { if (e instanceof LoiNghiepVu) return e; throw e; }
  throw new Error('Mong đợi LoiNghiepVu nhưng không có lỗi');
}
async function hs(ma: string) {
  const [r] = await sql()<{ id: number; version: number }[]>`SELECT id, version FROM ho_so WHERE ma_ho_so = ${ma}`;
  return r;
}
const buoiTT = (key: string) => layBuoiCoQuyen(sql(), admin, key);
const viTri = async (ma: string) =>
  (await sql()<{ ma_buoi: string | null; vi_tri: string }[]>`
    SELECT b.ma_buoi, h.vi_tri FROM ho_so h LEFT JOIN buoi_kham b ON b.id = h.buoi_id WHERE h.ma_ho_so = ${ma}`)[0];
/** ngan gửi hồ sơ `ma` (đang ở B7 của ngan) sang buổi `den`. */
async function guiDi(ma: string, den = B8, u = ngan) {
  const h = await hs(ma);
  return (await taoDeNghi(u, { ho_so_id: h.id, den_buoi: den, ly_do: 'Khám nhầm buổi', loai: 'gui_di' })).de_nghi;
}

beforeAll(async () => { await sql()`SELECT loai FROM de_nghi_chuyen LIMIT 1`; });
beforeEach(async () => {
  await sql()`TRUNCATE nhat_ky, de_nghi_chuyen, ho_so, buoi_kham, import_batches, users, dang_nhap_that_bai, cai_dat, push_dang_ky RESTART IDENTITY CASCADE`;
  await apDung(sql(), parseGoi(taoGoiThu().files).goi!, 'cli:test');
  await sql()`INSERT INTO users (username, ho_ten, role) VALUES ('khac', 'Người Khác', 'nhan_vien')`;
  admin = await layUser('admin'); ngan = await layUser('ngan'); trinh = await layUser('trinh'); khac = await layUser('khac');
  await phanCong(admin, [(await buoiTT(B7)).id], ngan.id);
  await phanCong(admin, [(await buoiTT(B8)).id], trinh.id);
  datLaiThrottleTuDuyet();
});
afterAll(async () => { await closeDb(); });

describe('gui_di — tạo và duyệt', () => {
  it('người phụ trách buổi nguồn gửi sang buổi người khác → chờ; chỉ người nhận duyệt; hồ sơ về buổi đích, nhật ký ghi người duyệt', async () => {
    const d = await guiDi('H001');
    expect(d).toMatchObject({ loai: 'gui_di', trang_thai: 'cho_xu_ly', tu_dong: false });
    expect(d.nguoi_duyet).toMatchObject({ username: 'trinh' });
    expect(d.den_buoi).toMatchObject({ ma_buoi: B8, phu_trach: { username: 'trinh' } });
    expect(d.tu_buoi).toMatchObject({ ma_buoi: B7, phu_trach: { username: 'ngan' } });
    expect(await viTri('H001')).toEqual({ ma_buoi: B7, vi_tri: 'buoi' });

    expect((await loi(xuLyDeNghi(ngan, d.id, { dong_y: true }))).status).toBe(403); // người gửi không tự duyệt
    expect((await loi(xuLyDeNghi(khac, d.id, { dong_y: true }))).status).toBe(403);

    const kq = await xuLyDeNghi(trinh, d.id, { dong_y: true, ghi_chu: 'OK' });
    expect(kq.de_nghi).toMatchObject({ trang_thai: 'dong_y', xu_ly_ghi_chu: 'OK', tu_dong: false });
    expect(kq.de_nghi.xu_ly_by?.username).toBe('trinh');
    expect(await viTri('H001')).toEqual({ ma_buoi: B8, vi_tri: 'buoi' });
    expect((await buoiTT(B8)).hien_co).toBe(3);
    expect((await buoiTT(B7)).hien_co).toBe(2);
    const [h] = await sql()<{ chuyen_boi: number }[]>`SELECT chuyen_boi FROM ho_so WHERE ma_ho_so = 'H001'`;
    expect(h.chuyen_boi).toBe(trinh.id);
    const nk = await sql()<{ user_id: number | null; hanh_dong: string; gia_tri_cu: string; gia_tri_moi: string }[]>`
      SELECT user_id, hanh_dong, gia_tri_cu, gia_tri_moi FROM nhat_ky WHERE hanh_dong IN ('chuyen', 'xu_ly_de_nghi') ORDER BY id`;
    expect(nk).toHaveLength(2);
    for (const x of nk) expect(x.user_id).toBe(trinh.id);
    expect(nk[0]).toMatchObject({ hanh_dong: 'chuyen', gia_tri_cu: B7, gia_tri_moi: B8 });
  });

  it('người không phụ trách buổi chứa hồ sơ không gửi đi được → 403; nhân viên gửi sang buổi mình thì được chuyển ngay', async () => {
    const h = await hs('H001'); // ở B7 của ngan
    const e = await loi(taoDeNghi(trinh, { ho_so_id: h.id, den_buoi: B8, ly_do: 'x', loai: 'gui_di' }));
    expect(e.status).toBe(403);
    await phanCong(admin, [(await buoiTT(B8)).id], ngan.id); // ngan giữ cả hai
    const d = await guiDi('H001');
    expect(d).toMatchObject({ loai: 'gui_di', trang_thai: 'dong_y', tu_dong: true });
    expect((await viTri('H001')).ma_buoi).toBe(B8);
  });

  it('admin gửi (ghi được cả hai buổi) → chuyển ngay; admin duyệt được đề nghị của nhân viên', async () => {
    const d1 = await guiDi('H001', B8, admin);
    expect(d1).toMatchObject({ loai: 'gui_di', trang_thai: 'dong_y', tu_dong: true });
    const d2 = await guiDi('H002');
    expect(d2.trang_thai).toBe('cho_xu_ly');
    const kq = await xuLyDeNghi(admin, d2.id, { dong_y: true });
    expect(kq.de_nghi.trang_thai).toBe('dong_y');
    expect((await viTri('H002')).ma_buoi).toBe(B8);
  });

  it('buổi đích chưa có người phụ trách: nguoi_duyet null, chỉ admin duyệt', async () => {
    const d = await guiDi('H001', LK);
    expect(d.nguoi_duyet).toBeNull();
    expect(d.den_buoi.phu_trach).toBeNull();
    expect((await loi(xuLyDeNghi(ngan, d.id, { dong_y: true }))).status).toBe(403);
    expect((await xuLyDeNghi(admin, d.id, { dong_y: true })).de_nghi.trang_thai).toBe('dong_y');
    expect((await viTri('H001')).ma_buoi).toBe(LK);
  });

  it('từ chối → hồ sơ giữ nguyên; đã xử lý thì xử lý lại 400; gửi lại được', async () => {
    const d = await guiDi('H001');
    const kq = await xuLyDeNghi(trinh, d.id, { dong_y: false, ghi_chu: 'Không phải của tôi' });
    expect(kq.de_nghi).toMatchObject({ trang_thai: 'tu_choi', xu_ly_ghi_chu: 'Không phải của tôi' });
    expect((await viTri('H001')).ma_buoi).toBe(B7);
    expect((await loi(xuLyDeNghi(trinh, d.id, { dong_y: true }))).status).toBe(400);
    expect((await guiDi('H001')).trang_thai).toBe('cho_xu_ly');
  });

  it('kiểm tra khi tạo: trùng đang chờ / cùng buổi / lý do / hồ sơ đã xác nhận / buổi khóa', async () => {
    const h = await hs('H001');
    expect((await loi(taoDeNghi(ngan, { ho_so_id: h.id, den_buoi: B8, ly_do: '  ', loai: 'gui_di' }))).status).toBe(400);
    expect((await loi(taoDeNghi(ngan, { ho_so_id: h.id, den_buoi: B7, ly_do: 'x', loai: 'gui_di' }))).status).toBe(400);
    await guiDi('H001');
    expect((await loi(taoDeNghi(ngan, { ho_so_id: h.id, den_buoi: B8, ly_do: 'lại', loai: 'gui_di' }))).status).toBe(400);

    const h2 = await hs('H002');
    await xacNhanHoSo(ngan, h2.id, h2.version, true);
    expect((await loi(taoDeNghi(ngan, { ho_so_id: h2.id, den_buoi: B8, ly_do: 'x', loai: 'gui_di' }))).status).toBe(400);

    await sql()`UPDATE buoi_kham SET trang_thai = 'da_xac_nhan' WHERE ma_buoi = ${B8}`;
    const h3 = await hs('H003');
    expect((await loi(taoDeNghi(ngan, { ho_so_id: h3.id, den_buoi: B8, ly_do: 'x', loai: 'gui_di' }))).status).toBe(423);
  });

  it('kiểm tra khi duyệt: hồ sơ đã xác nhận → 400, buổi khóa → 423, đề nghị vẫn chờ', async () => {
    const d = await guiDi('H001');
    const h = await hs('H001');
    await xacNhanHoSo(ngan, h.id, h.version, true);
    expect((await loi(xuLyDeNghi(trinh, d.id, { dong_y: true }))).status).toBe(400);
    const [c] = await sql()<{ version: number }[]>`SELECT version FROM ho_so WHERE id = ${h.id}`;
    await xacNhanHoSo(ngan, h.id, c.version, false);
    await sql()`UPDATE buoi_kham SET trang_thai = 'da_xac_nhan' WHERE ma_buoi = ${B8}`;
    expect((await loi(xuLyDeNghi(trinh, d.id, { dong_y: true }))).status).toBe(423);
    expect((await danhSachDeNghi(admin, 'cho_xu_ly')).de_nghi).toHaveLength(1);
    expect((await viTri('H001')).ma_buoi).toBe(B7);
  });

  it('schema: loai mặc định xin_ve, từ chối giá trị lạ', () => {
    const base = { ho_so_id: 1, den_buoi: B8, ly_do: 'x' };
    expect(deNghiSchema.parse(base).loai).toBe('xin_ve');
    expect(deNghiSchema.parse({ ...base, loai: 'gui_di' }).loai).toBe('gui_di');
    expect(deNghiSchema.safeParse({ ...base, loai: 'khac' }).success).toBe(false);
  });
});

describe('gui_di — tự duyệt', () => {
  it('sau N phút: người thực hiện là người phụ trách buổi đích; nhật ký user_id NULL + [Tự động]', async () => {
    await ghiTuDuyet(admin, { che_do: 'sau_phut', sau_phut: 5 });
    const d = await guiDi('H001');
    expect(d.trang_thai).toBe('cho_xu_ly');
    expect(await quetTuDuyet({ batBuoc: true })).toEqual({ da_duyet: 0, loi: 0 });
    await sql()`UPDATE de_nghi_chuyen SET created_at = now() - interval '6 minutes' WHERE id = ${d.id}`;
    expect(await quetTuDuyet({ batBuoc: true })).toEqual({ da_duyet: 1, loi: 0 });
    const [moi] = (await danhSachDeNghi(admin)).de_nghi;
    expect(moi).toMatchObject({ loai: 'gui_di', trang_thai: 'dong_y', tu_dong: true, xu_ly_ghi_chu: 'Tự động duyệt sau 5 phút' });
    expect(moi.xu_ly_by?.username).toBe('trinh');
    expect((await viTri('H001')).ma_buoi).toBe(B8);
    const nk = await sql()<{ user_id: number | null; ghi_chu: string }[]>`
      SELECT user_id, ghi_chu FROM nhat_ky WHERE hanh_dong IN ('chuyen', 'xu_ly_de_nghi') ORDER BY id`;
    expect(nk).toHaveLength(2);
    for (const x of nk) { expect(x.user_id).toBeNull(); expect(x.ghi_chu.startsWith('[Tự động]')).toBe(true); }
  });

  it('chế độ ngay + buổi đích không người phụ trách → admin hoạt động id nhỏ nhất thực hiện', async () => {
    await ghiTuDuyet(admin, { che_do: 'ngay', sau_phut: 5 });
    const d = await guiDi('H001', LK);
    expect(d).toMatchObject({ trang_thai: 'dong_y', tu_dong: true });
    expect(d.xu_ly_by?.username).toBe('admin');
    expect((await viTri('H001')).ma_buoi).toBe(LK);
  });

  it('xin_ve vẫn do người giữ hồ sơ thực hiện khi tự duyệt (không đổi)', async () => {
    await ghiTuDuyet(admin, { che_do: 'ngay', sau_phut: 5 });
    const h = await hs('H001');
    const { de_nghi } = await taoDeNghi(trinh, { ho_so_id: h.id, den_buoi: B8, ly_do: 'Cần' });
    expect(de_nghi).toMatchObject({ loai: 'xin_ve', trang_thai: 'dong_y', tu_dong: true });
    expect(de_nghi.xu_ly_by?.username).toBe('ngan');
  });
});

describe('phạm vi xem và đếm "gửi đến tôi"', () => {
  it('danhSachDeNghi: người gửi, người nhận (đích), người giữ (xin_ve), admin thấy; người khác không', async () => {
    const gd = await guiDi('H001'); // ngan → B8 (trinh)
    const h4 = await hs('H004');
    const xv = (await taoDeNghi(ngan, { ho_so_id: h4.id, den_buoi: B7, ly_do: 'Cần' })).de_nghi; // ngan xin H004 của trinh
    const ids = async (u: AuthUser) => (await danhSachDeNghi(u)).de_nghi.map((x) => x.id).sort();
    expect(await ids(ngan)).toEqual([gd.id, xv.id].sort());
    expect(await ids(trinh)).toEqual([gd.id, xv.id].sort()); // nhận gui_di + giữ hồ sơ của xin_ve
    expect(await ids(admin)).toEqual([gd.id, xv.id].sort());
    expect(await ids(khac)).toEqual([]);
    expect((await danhSachDeNghi(trinh)).de_nghi.find((x) => x.id === xv.id)).toMatchObject({ loai: 'xin_ve', nguoi_duyet: { username: 'trinh' } });
  });

  it('gui_di không hiện cho người phụ trách buổi nguồn khác với người gửi (không thuộc phạm vi)', async () => {
    // admin gửi giúp hồ sơ B7 sang LK (chưa phân công): ngan (giữ nguồn, không phải người gửi) không thuộc phạm vi gui_di
    const h = await hs('H001');
    await sql()`UPDATE buoi_kham SET phu_trach_user_id = ${khac.id} WHERE ma_buoi = ${LK}`;
    const d = (await taoDeNghi(ngan, { ho_so_id: h.id, den_buoi: LK, ly_do: 'x', loai: 'gui_di' })).de_nghi;
    expect((await danhSachDeNghi(khac)).de_nghi.map((x) => x.id)).toEqual([d.id]);
    expect((await danhSachDeNghi(trinh)).de_nghi).toHaveLength(0);
  });

  it('dashboardToi.de_nghi_cho_toi: đếm theo quy tắc "gửi đến tôi", không đếm việc do chính mình tạo', async () => {
    await guiDi('H001'); // gui_di ngan → trinh
    const h4 = await hs('H004');
    await taoDeNghi(ngan, { ho_so_id: h4.id, den_buoi: B7, ly_do: 'Cần' }); // xin_ve: trinh giữ
    expect((await dashboardToi(trinh)).de_nghi_cho_toi).toBe(2);
    expect((await dashboardToi(ngan)).de_nghi_cho_toi).toBe(0);
    expect((await dashboardToi(khac)).de_nghi_cho_toi).toBe(0);
    expect((await dashboardToi(admin)).de_nghi_cho_toi).toBe(2);
    // admin tạo một đề nghị chờ thì không tính cho chính admin
    await sql()`UPDATE buoi_kham SET phu_trach_user_id = ${khac.id} WHERE ma_buoi = ${LK}`;
    const h2 = await hs('H002');
    await sql()`UPDATE ho_so SET buoi_id = (SELECT id FROM buoi_kham WHERE ma_buoi = ${LK}) WHERE id = ${h2.id}`;
    await taoDeNghi(khac, { ho_so_id: h2.id, den_buoi: B8, ly_do: 'x', loai: 'gui_di' });
    expect((await dashboardToi(trinh)).de_nghi_cho_toi).toBe(3);
    expect((await dashboardToi(admin)).de_nghi_cho_toi).toBe(3);
  });
});

describe('chuyển thẳng sang buổi', () => {
  it('nhân viên sang buổi người khác → 403 đúng thông điệp; buổi của mình được; admin được', async () => {
    const h = await hs('H001');
    const e = await loi(chuyenHoSo(ngan, h.id, { version: h.version, den: 'buoi', buoi: B8, ly_do: 'x' }));
    expect(e.status).toBe(403);
    expect(e.message).toBe('Buổi đích của người khác: hãy gửi đề nghị để người đó chấp nhận');
    expect((await viTri('H001')).ma_buoi).toBe(B7);
    // buổi chưa phân công cũng là "của người khác" với nhân viên
    expect((await loi(chuyenHoSo(ngan, h.id, { version: h.version, den: 'buoi', buoi: LK, ly_do: 'x' }))).status).toBe(403);
    // buổi của chính mình
    await phanCong(admin, [(await buoiTT(LK)).id], ngan.id);
    const r = await chuyenHoSo(ngan, h.id, { version: h.version, den: 'buoi', buoi: LK, ly_do: 'Đúng buổi' });
    expect(r.ho_so.buoi!.ma_buoi).toBe(LK);
    // admin chuyển thẳng sang buổi của người khác
    const r2 = await chuyenHoSo(admin, h.id, { version: r.ho_so.version, den: 'buoi', buoi: B8, ly_do: 'Admin chỉnh' });
    expect(r2.ho_so.buoi!.ma_buoi).toBe(B8);
  });
});

describe('push gui_di', () => {
  it('payload đúng chữ hợp đồng, không lộ họ tên bệnh nhân / CCCD / lý do; xin_ve không đổi', async () => {
    const d = await guiDi('H001');
    const [bn] = await sql()<{ ho_ten: string; cccd: string }[]>`SELECT ho_ten, cccd FROM ho_so WHERE ma_ho_so = 'H001'`;
    const p = payloadDeNghiMoi({ id: d.id, nguoiDeNghi: ngan.ho_ten, tuBuoi: B7, denBuoi: B8, loai: 'gui_di' });
    expect(p).toEqual({
      title: 'Đề nghị nhận hồ sơ',
      body: `${ngan.ho_ten} muốn gửi 1 hồ sơ từ ${B7} sang buổi ${B8} của bạn`,
      url: '/kho?tab=de_nghi',
      tag: `de-nghi-${d.id}`,
    });
    const txt = JSON.stringify(p);
    expect(txt).not.toContain(bn.ho_ten);
    if (bn.cccd) expect(txt).not.toContain(bn.cccd);
    expect(txt).not.toContain('Khám nhầm buổi');
    expect(payloadDeNghiMoi({ id: 1, nguoiDeNghi: 'A', tuBuoi: B7, denBuoi: B8 }).title).toBe('Đề nghị chuyển hồ sơ');
  });
});
