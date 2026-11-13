import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { closeDb, getSql } from '@/db/client';
import type { AuthUser } from '@/lib/auth/guard';
import { parseGoi } from '@/lib/import/goi';
import { apDung } from '@/lib/import/nap';
import { danhSachBuoi, layBuoiCoQuyen } from '@/lib/ra-soat/buoi';
import { themBuoi, suaBuoi } from '@/lib/ra-soat/buoi-admin';
import { hoSoCuaBuoi, lichSuHoSo, suaHoSo, xacNhanHoSo } from '@/lib/ra-soat/ho-so';
import { LoiNghiepVu } from '@/lib/ra-soat/loi';
import { phanCong, phanCongTheoGoiY } from '@/lib/ra-soat/phan-cong';
import { datLaiMatKhau, suaUser, taoUser } from '@/lib/ra-soat/users';
import { khongDau } from '@/lib/text';
import { taoGoiThu } from './helpers/goi-thu';

const URL_TEST = process.env.TEST_DATABASE_URL;
if (!URL_TEST) throw new Error('Thiếu TEST_DATABASE_URL (.env.local)');
if (!/test/i.test(new URL(URL_TEST).pathname)) throw new Error('TEST_DATABASE_URL phải trỏ vào DB có chữ "test"');

const sql = () => getSql();
let admin: AuthUser, ngan: AuthUser, trinh: AuthUser;

const toAuth = (r: { id: number; username: string; ho_ten: string; role: 'admin' | 'nhan_vien'; session_version: number }): AuthUser => r;
async function layUser(username: string): Promise<AuthUser> {
  const [r] = await sql()<{ id: number; username: string; ho_ten: string; role: 'admin' | 'nhan_vien'; session_version: number }[]>`
    SELECT id, username, ho_ten, role, session_version FROM users WHERE username = ${username}`;
  return toAuth(r);
}
async function loi(p: Promise<unknown>): Promise<LoiNghiepVu> {
  try { await p; } catch (e) { if (e instanceof LoiNghiepVu) return e; throw e; }
  throw new Error('Mong đợi LoiNghiepVu nhưng không có lỗi');
}

beforeAll(async () => { await sql()`SELECT 1 FROM import_batches LIMIT 1`; });
beforeEach(async () => {
  await sql()`TRUNCATE nhat_ky, de_nghi_chuyen, ho_so, buoi_kham, import_batches, users, dang_nhap_that_bai RESTART IDENTITY CASCADE`;
  const kq = parseGoi(taoGoiThu().files);
  await apDung(sql(), kq.goi!, 'cli:test');
  admin = await layUser('admin'); ngan = await layUser('ngan'); trinh = await layUser('trinh');
  // ngan: TN-20260907 ; trinh: TN-20260908
  const tn7 = (await layBuoiTheoKeyAdmin('TN-20260907')).id;
  const tn8 = (await layBuoiTheoKeyAdmin('TN-20260908')).id;
  await phanCong(admin, [tn7], ngan.id);
  await phanCong(admin, [tn8], trinh.id);
});
afterAll(async () => { await closeDb(); });

const layBuoiTheoKeyAdmin = (key: string) => layBuoiCoQuyen(sql(), admin, key);

async function hoSoBuoi(key: string, user = admin) {
  const b = await layBuoiCoQuyen(sql(), user, key);
  return { b, hs: await hoSoCuaBuoi(sql(), b.id) };
}

describe('quyền xem/sửa', () => {
  it('nhân viên xem buổi người khác → 403', async () => {
    const e = await loi(layBuoiCoQuyen(sql(), ngan, 'TN-20260908'));
    expect(e.status).toBe(403);
  });
  it('nhân viên sửa hồ sơ buổi người khác → 403', async () => {
    const { hs } = await hoSoBuoi('TN-20260908', trinh);
    const e = await loi(suaHoSo(ngan, hs[0].id, { version: hs[0].version, ho_ten: 'X' }));
    expect(e.status).toBe(403);
  });
  it('danh sách của nhân viên chỉ gồm buổi mình; admin thấy cả 3', async () => {
    expect((await danhSachBuoi(sql(), ngan, {})).map((b) => b.ma_buoi)).toEqual(['TN-20260907']);
    expect(await danhSachBuoi(sql(), admin, {})).toHaveLength(3);
    expect((await danhSachBuoi(sql(), admin, { phu_trach: 'none' })).map((b) => b.ma_buoi)).toEqual(['LK-20261014']);
    expect((await danhSachBuoi(sql(), admin, {})).map((b) => b.don_vi)).toEqual(['TN', 'TN', 'LK']);
  });
});

describe('sửa hồ sơ', () => {
  it('sửa CLS → cờ sua_cls, version+1, nhật ký cũ/mới', async () => {
    const { hs } = await hoSoBuoi('TN-20260907', ngan);
    const h = hs[0]; // CLS 11000001 → ctm=1
    const kq = await suaHoSo(ngan, h.id, { version: h.version, cls: { ctm: 0, sieu_am: 1 } });
    expect(kq.cls.ctm).toBe(0);
    expect(kq.sua_cls).toBe(true);
    expect(kq.sua_nhan_than).toBe(false);
    expect(kq.version).toBe(h.version + 1);
    const ls = await lichSuHoSo(ngan, h.id);
    const nk = ls.find((x) => x.hanh_dong === 'sua_cls' && x.truong === 'ctm');
    expect(nk).toMatchObject({ gia_tri_cu: '1', gia_tri_moi: '0' });
    expect(nk!.user?.username).toBe('ngan');
  });
  it('sửa nhân thân → cờ + ho_ten_kd; không đổi gì → giữ version', async () => {
    const { hs } = await hoSoBuoi('TN-20260907', ngan);
    const h = hs[0];
    const same = await suaHoSo(ngan, h.id, { version: h.version, ho_ten: h.ho_ten, cls: { ctm: h.cls.ctm } });
    expect(same.version).toBe(h.version);
    const kq = await suaHoSo(ngan, h.id, { version: h.version, ho_ten: 'Nguyễn Văn Thuỷ', ghi_chu: 'ghi chú' });
    expect(kq.sua_nhan_than).toBe(true);
    const [r] = await sql()<{ ho_ten_kd: string }[]>`SELECT ho_ten_kd FROM ho_so WHERE id = ${h.id}`;
    expect(r.ho_ten_kd).toBe(khongDau('Nguyễn Văn Thuỷ'));
    const ls = await lichSuHoSo(admin, h.id);
    expect(ls.map((x) => x.hanh_dong)).toEqual(expect.arrayContaining(['sua_nhan_than', 'sua_ghi_chu']));
    const times = ls.map((x) => x.at);
    expect([...times].sort()).toEqual(times);
  });
  it('version cũ → 409 kèm bản hiện tại', async () => {
    const { hs } = await hoSoBuoi('TN-20260907', ngan);
    const h = hs[0];
    await suaHoSo(ngan, h.id, { version: h.version, cls: { ctm: 0 } });
    const e = await loi(suaHoSo(ngan, h.id, { version: h.version, cls: { ctm: 1 } }));
    expect(e.status).toBe(409);
    expect((e.body!.ho_so as { version: number }).version).toBe(h.version + 1);
  });
  it('buổi da_xac_nhan → 423', async () => {
    const { hs } = await hoSoBuoi('TN-20260907', ngan);
    await sql()`UPDATE buoi_kham SET trang_thai = 'da_xac_nhan' WHERE ma_buoi = 'TN-20260907'`;
    expect((await loi(suaHoSo(ngan, hs[0].id, { version: hs[0].version, cls: { ctm: 0 } }))).status).toBe(423);
    expect((await loi(xacNhanHoSo(ngan, hs[0].id, hs[0].version, true))).status).toBe(423);
    const b = await layBuoiCoQuyen(sql(), ngan, 'TN-20260907');
    expect(b.co_quyen_sua).toBe(false);
  });
});

describe('validate', () => {
  it('CCCD / năm sinh / giới tính sai bị schema từ chối (400)', async () => {
    const { hoSoSuaSchema } = await import('@/lib/ra-soat/schemas');
    const { docBody } = await import('@/lib/ra-soat/loi');
    const th = (b: unknown) => docBody(new Request('http://x', { method: 'POST', body: JSON.stringify(b) }), hoSoSuaSchema);
    for (const b of [
      { version: 1, cccd: 'x'.repeat(31) }, { version: 1, so_dt: 'x'.repeat(31) }, { version: 1, bo_qua_canh_bao_so: 'có' }, { version: 1, nam_sinh: 1899 },
      { version: 1, nam_sinh: 2027 }, { version: 1, gioi_tinh: 'Khác' }, { version: 1, ho_ten: '  ' },
      { version: 1, cls: { ctm: 2 } }, { version: 1, cls: { abc: 1 } },
    ]) {
      expect((await loi(th(b))).status).toBe(400);
    }
    await expect(th({ version: 1, cccd: '', nam_sinh: 1900, gioi_tinh: 'Nữ', cls: { ctm: 1 } })).resolves.toBeTruthy();
    await expect(th({ version: 1, cccd: '123456789' })).resolves.toBeTruthy();
    await expect(th({ version: 1, cccd: '031066014597' })).resolves.toBeTruthy();
  });
});

describe('xác nhận và trạng thái buổi', () => {
  it('xác nhận → dang_ra_soat; bỏ hết → chua_ra_soat; không đổi cờ', async () => {
    const { hs } = await hoSoBuoi('TN-20260907', ngan);
    const r1 = await xacNhanHoSo(ngan, hs[0].id, hs[0].version, true);
    expect(r1.ho_so.da_xac_nhan).toBe(true);
    expect(r1.ho_so.xac_nhan_by?.username).toBe('ngan');
    expect(r1.ho_so.sua_cls || r1.ho_so.sua_nhan_than).toBe(false);
    expect(r1.buoi.trang_thai).toBe('dang_ra_soat');
    expect(r1.buoi.da_xac_nhan).toBe(1);
    expect(r1.buoi.tien_do).toBe(33.3);
    const r2 = await xacNhanHoSo(ngan, hs[1].id, hs[1].version, true);
    expect(r2.buoi.da_xac_nhan).toBe(2);
    const r3 = await xacNhanHoSo(ngan, hs[0].id, r1.ho_so.version, false);
    expect(r3.buoi.trang_thai).toBe('dang_ra_soat');
    const r4 = await xacNhanHoSo(ngan, hs[1].id, r2.ho_so.version, false);
    expect(r4.buoi.trang_thai).toBe('chua_ra_soat');
    expect(r4.ho_so.xac_nhan_by).toBeNull();
    const ls = await lichSuHoSo(ngan, hs[0].id);
    expect(ls.map((x) => x.hanh_dong)).toEqual(['xac_nhan', 'bo_xac_nhan']);
  });
});

describe('chỉ số buổi', () => {
  it('thừa / thiếu / tiến độ', async () => {
    // TN-20260907: sổ đoàn 4, có 3 hồ sơ → thiếu 1; TN-20260908: sổ đoàn 3, có 2 → thiếu 1; LK: sổ đoàn 2, có 3 → thừa 1
    const ds = await danhSachBuoi(sql(), admin, {});
    const m = Object.fromEntries(ds.map((b) => [b.ma_buoi, b]));
    expect(m['TN-20260907']).toMatchObject({ hien_co: 3, thieu: 1, thua: 0, da_xac_nhan: 0, tien_do: 0, chua_xac_nhan: 3 });
    expect(m['LK-20261014']).toMatchObject({ hien_co: 3, thua: 1, thieu: 0 });
    expect(m['TN-20260907'].phu_trach?.username).toBe('ngan');
    expect(m['TN-20260907'].co_quyen_sua).toBe(true);
    const lk = await layBuoiCoQuyen(sql(), admin, String(m['LK-20261014'].id));
    expect(lk.ma_buoi).toBe('LK-20261014');
  });
});

describe('phân công', () => {
  it('theo gợi ý không ghi đè; ghi_de ghi đè; bo_qua với gợi ý lạ', async () => {
    await sql()`UPDATE buoi_kham SET phu_trach_user_id = NULL`;
    await sql()`UPDATE buoi_kham SET nv_goi_y = 'ghost' WHERE ma_buoi = 'LK-20261014'`;
    await phanCong(admin, [(await layBuoiTheoKeyAdmin('TN-20260908')).id], ngan.id); // đã gán ngan, gợi ý là trinh
    const kq = await phanCongTheoGoiY(admin, false);
    expect(kq).toEqual({ da_gan: 1, bo_qua: ['LK-20261014'] }); // chỉ TN-20260907 (ngan)
    const m = Object.fromEntries((await danhSachBuoi(sql(), admin, {})).map((b) => [b.ma_buoi, b.phu_trach?.username ?? null]));
    expect(m).toEqual({ 'TN-20260907': 'ngan', 'TN-20260908': 'ngan', 'LK-20261014': null });
    const kq2 = await phanCongTheoGoiY(admin, true);
    expect(kq2.da_gan).toBe(1);
    expect((await layBuoiTheoKeyAdmin('TN-20260908')).phu_trach?.username).toBe('trinh');
    const [{ n }] = await sql()<{ n: number }[]>`SELECT count(*)::int AS n FROM nhat_ky WHERE hanh_dong = 'phan_cong' AND doi_tuong = 'buoi_kham'`;
    expect(n).toBeGreaterThanOrEqual(4);
  });
  it('gán hàng loạt / bỏ gán; user bị khóa hoặc không tồn tại → 400', async () => {
    const ds = await danhSachBuoi(sql(), admin, {});
    const r = await phanCong(admin, ds.map((b) => b.id), trinh.id);
    expect(r.so_buoi).toBe(3);
    expect((await danhSachBuoi(sql(), trinh, {})).length).toBe(3);
    await phanCong(admin, ds.map((b) => b.id), null);
    expect((await danhSachBuoi(sql(), admin, { phu_trach: 'none' })).length).toBe(3);
    expect((await loi(phanCong(admin, [ds[0].id], 9999))).status).toBe(400);
    await suaUser(admin, ngan.id, { active: false });
    expect((await loi(phanCong(admin, [ds[0].id], ngan.id))).status).toBe(400);
    expect((await loi(phanCong(admin, [999999], null))).status).toBe(400);
  });
});

describe('quản lý user', () => {
  it('tạo, trùng → 400, sửa/khóa tăng session_version, đặt lại mật khẩu', async () => {
    const u = await taoUser(admin, { username: 'moi.nv', ho_ten: 'Nhân viên mới', role: 'nhan_vien' });
    expect(u).toMatchObject({ username: 'moi.nv', active: true, so_buoi: 0 });
    expect((await loi(taoUser(admin, { username: 'moi.nv', ho_ten: 'X', role: 'nhan_vien' }))).status).toBe(400);
    const sv = async () => (await layUser('moi.nv')).session_version;
    const s0 = await sv();
    await suaUser(admin, u.id, { ho_ten: 'Đổi tên' });
    expect(await sv()).toBe(s0);
    await suaUser(admin, u.id, { active: false });
    expect(await sv()).toBe(s0 + 1);
    await suaUser(admin, u.id, { role: 'admin' });
    expect(await sv()).toBe(s0 + 2);
    await datLaiMatKhau(admin, u.id);
    expect(await sv()).toBe(s0 + 3);
    expect((await loi(datLaiMatKhau(admin, 9999))).status).toBe(404);
    const [{ n }] = await sql()<{ n: number }[]>`SELECT count(*)::int AS n FROM nhat_ky WHERE hanh_dong IN ('tao_user','sua_user','dat_lai_mat_khau')`;
    expect(n).toBeGreaterThanOrEqual(5);
  });
  it('admin không tự khóa / hạ quyền mình', async () => {
    expect((await loi(suaUser(admin, admin.id, { active: false }))).status).toBe(400);
    expect((await loi(suaUser(admin, admin.id, { role: 'nhan_vien' }))).status).toBe(400);
  });
});

describe('buoi admin', () => {
  it('thêm buổi: ma_buoi, trùng → 400; sửa có nhật ký', async () => {
    const b = await themBuoi(admin, { don_vi: 'VK', ngay_kham: '2026-10-05', so_doan_tong: 50 });
    expect(b).toMatchObject({ ma_buoi: 'VK-20261005', ten_don_vi: 'Xã Việt Khê', hien_co: 0, thieu: 50 });
    expect((await loi(themBuoi(admin, { don_vi: 'VK', ngay_kham: '2026-10-05', so_doan_tong: 1 }))).status).toBe(400);
    const s = await suaBuoi(admin, 'VK-20261005', { diem_kham: 'TYT Việt Khê', so_doan_tong: 60 });
    expect(s).toMatchObject({ diem_kham: 'TYT Việt Khê', so_doan_tong: 60 });
    const [{ n }] = await sql()<{ n: number }[]>`SELECT count(*)::int AS n FROM nhat_ky WHERE hanh_dong IN ('them_buoi','sua_buoi')`;
    expect(n).toBe(3);
  });
});
