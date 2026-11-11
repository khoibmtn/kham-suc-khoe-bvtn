import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { closeDb, getSql } from '@/db/client';
import type { AuthUser } from '@/lib/auth/guard';
import { parseGoi } from '@/lib/import/goi';
import { apDung } from '@/lib/import/nap';
import { danhSachBuoi, layBuoiCoQuyen } from '@/lib/ra-soat/buoi';
import { chuyenHoSo, khoCaNhan, khoChung, nhanVeHoSo } from '@/lib/ra-soat/chuyen';
import { danhSachDeNghi, taoDeNghi, xuLyDeNghi } from '@/lib/ra-soat/de-nghi';
import { lichSuHoSo, suaHoSo, xacNhanHoSo } from '@/lib/ra-soat/ho-so';
import { LoiNghiepVu } from '@/lib/ra-soat/loi';
import { phanCong } from '@/lib/ra-soat/phan-cong';
import { kiemTrung, themHoSo } from '@/lib/ra-soat/them-ho-so';
import { moKhoaBuoi, xacNhanBuoi } from '@/lib/ra-soat/xac-nhan-buoi';
import { themHoSoSchema } from '@/lib/ra-soat/schemas';
import { taoGoiThu } from './helpers/goi-thu';

const URL_TEST = process.env.TEST_DATABASE_URL;
if (!URL_TEST) throw new Error('Thiếu TEST_DATABASE_URL (.env.local)');
if (!/test/i.test(new URL(URL_TEST).pathname)) throw new Error('TEST_DATABASE_URL phải trỏ vào DB có chữ "test"');

const sql = () => getSql();
let admin: AuthUser, ngan: AuthUser, trinh: AuthUser;
const B7 = 'TN-20260907'; // ngan, tổng 4, 3 hồ sơ (H001-H003)
const B8 = 'TN-20260908'; // trinh, tổng 3, 2 hồ sơ (H004-H005)

async function layUser(username: string): Promise<AuthUser> {
  const [r] = await sql()<AuthUser[]>`SELECT id, username, ho_ten, role, session_version FROM users WHERE username = ${username}`;
  return r;
}
async function loi(p: Promise<unknown>): Promise<LoiNghiepVu> {
  try { await p; } catch (e) { if (e instanceof LoiNghiepVu) return e; throw e; }
  throw new Error('Mong đợi LoiNghiepVu nhưng không có lỗi');
}
/** id + version hiện tại của hồ sơ theo mã. */
async function hs(ma: string) {
  const [r] = await sql()<{ id: number; version: number }[]>`SELECT id, version FROM ho_so WHERE ma_ho_so = ${ma}`;
  return r;
}
const buoiTT = (key: string, u = admin) => layBuoiCoQuyen(sql(), u, key);
const demHoSo = async () => (await sql()<{ n: number }[]>`SELECT count(*)::int AS n FROM ho_so`)[0].n;

beforeAll(async () => { await sql()`SELECT 1 FROM import_batches LIMIT 1`; });
beforeEach(async () => {
  await sql()`TRUNCATE nhat_ky, de_nghi_chuyen, ho_so, buoi_kham, import_batches, users, dang_nhap_that_bai RESTART IDENTITY CASCADE`;
  await apDung(sql(), parseGoi(taoGoiThu().files).goi!, 'cli:test');
  admin = await layUser('admin'); ngan = await layUser('ngan'); trinh = await layUser('trinh');
  await phanCong(admin, [(await buoiTT(B7)).id], ngan.id);
  await phanCong(admin, [(await buoiTT(B8)).id], trinh.id);
});
afterAll(async () => { await closeDb(); });

describe('kịch bản D — kho cá nhân / kho chung / nhận về', () => {
  it('vào kho cá nhân: hien_co buổi giảm 1, kho cá nhân tăng 1, ghi vết nguồn; nhận về lại', async () => {
    const h = await hs('H003');
    const r = await chuyenHoSo(ngan, h.id, { version: h.version, den: 'kho_ca_nhan' });
    expect(r.buoi_cu!.hien_co).toBe(2);
    expect(r.buoi_moi).toBeNull();
    expect(r.ho_so.vi_tri).toBe('kho_ca_nhan');
    expect(r.ho_so.kho_cua?.username).toBe('ngan');
    expect(r.ho_so.chuyen).toMatchObject({ tu: B7, ly_do: '' });
    expect(r.ho_so.chuyen!.boi?.username).toBe('ngan');
    expect((await khoCaNhan(ngan)).ho_so).toHaveLength(1);
    expect((await khoCaNhan(trinh)).ho_so).toHaveLength(0);
    expect((await khoCaNhan(admin, ngan.id)).ho_so).toHaveLength(1);
    expect((await loi(khoCaNhan(trinh, ngan.id))).status).toBe(403);
    const ls = await lichSuHoSo(ngan, h.id);
    expect(ls.find((x) => x.hanh_dong === 'chuyen')).toMatchObject({ truong: 'vi_tri', gia_tri_cu: B7, gia_tri_moi: 'kho_ca_nhan:ngan' });

    const v = r.ho_so.version;
    const back = await nhanVeHoSo(ngan, h.id, { version: v, buoi: B7 });
    expect(back.buoi_moi!.hien_co).toBe(3);
    expect(back.ho_so.vi_tri).toBe('buoi');
    expect(back.ho_so.nhan_tu_kho_chung).toBe(false);
    expect((await khoCaNhan(ngan)).ho_so).toHaveLength(0);
  });

  it('vào kho chung rồi user khác nhận về: bo_sung +1, giữ cờ khi chuyển tiếp', async () => {
    const h = await hs('H003');
    const r = await chuyenHoSo(ngan, h.id, { version: h.version, den: 'kho_chung' });
    expect(r.buoi_cu!.hien_co).toBe(2);
    const kc = await khoChung(trinh, {});
    expect(kc.tong).toBe(3); // H009, H010 + H003
    expect(kc.ho_so.find((x) => x.id === h.id)!.chuyen).toMatchObject({ tu: B7 });
    expect((await loi(nhanVeHoSo(ngan, h.id, { version: r.ho_so.version, buoi: B8 }))).status).toBe(403);

    const nv = await nhanVeHoSo(trinh, h.id, { version: r.ho_so.version, buoi: B8 });
    expect(nv.buoi_moi!.hien_co).toBe(3);
    expect(nv.buoi_moi!.bo_sung).toBe(1);
    expect(nv.ho_so.nhan_tu_kho_chung).toBe(true);
    expect(nv.ho_so.chuyen!.tu).toBe('kho_chung');

    // chuyển tiếp sang buổi khác: vẫn là hồ sơ bổ sung
    const tiep = await chuyenHoSo(trinh, h.id, { version: nv.ho_so.version, den: 'buoi', buoi: B7, ly_do: 'Thuộc buổi 07/09' });
    expect(tiep.ho_so.nhan_tu_kho_chung).toBe(true);
    expect(tiep.buoi_moi!.bo_sung).toBe(1);
    expect(tiep.buoi_cu!.bo_sung).toBe(0);
    // trả lại kho chung → cờ false
    const tra = await chuyenHoSo(ngan, h.id, { version: tiep.ho_so.version, den: 'kho_chung' });
    expect(tra.ho_so.nhan_tu_kho_chung).toBe(false);
  });

  it('kho chung lọc theo đơn vị gợi ý và tìm kiếm', async () => {
    expect((await khoChung(ngan, { don_vi: 'TN' })).tong).toBe(2);
    expect((await khoChung(ngan, { don_vi: 'LK' })).tong).toBe(0);
    expect((await khoChung(ngan, { q: 'dinh van' })).ho_so).toHaveLength(1);
    expect((await khoChung(ngan, { q: 'mai thi' })).ho_so).toHaveLength(1);
    expect((await loi(khoChung(ngan, { q: 'a' }))).status).toBe(400);
    expect((await loi(khoChung(ngan, { don_vi: 'XX' }))).status).toBe(400);
  });

  it('nhận về từ kho chung vào buổi mình không phụ trách → 403', async () => {
    const h = await hs('H009');
    expect((await loi(nhanVeHoSo(ngan, h.id, { version: h.version, buoi: B8 }))).status).toBe(403);
    expect((await loi(nhanVeHoSo(ngan, h.id, { version: h.version + 5, buoi: B7 }))).status).toBe(409);
  });

  it('buổi: tat_ca=1 cho nhân viên thấy hết, co_quyen_sua như cũ', async () => {
    expect(await danhSachBuoi(sql(), ngan, {})).toHaveLength(1);
    const tc = await danhSachBuoi(sql(), ngan, { tat_ca: true });
    expect(tc).toHaveLength(3);
    expect(tc.find((b) => b.ma_buoi === B8)!.co_quyen_sua).toBe(false);
    expect(tc.find((b) => b.ma_buoi === B7)!.co_quyen_sua).toBe(true);
  });
});

describe('kịch bản E — chuyển: chặn và quyền', () => {
  it('sang buổi người khác thiếu lý do → 400; có lý do → được', async () => {
    const h = await hs('H001');
    expect((await loi(chuyenHoSo(ngan, h.id, { version: h.version, den: 'buoi', buoi: B8 }))).status).toBe(400);
    expect((await loi(chuyenHoSo(ngan, h.id, { version: h.version, den: 'buoi', buoi: B8, ly_do: '  ' }))).status).toBe(400);
    const r = await chuyenHoSo(ngan, h.id, { version: h.version, den: 'buoi', buoi: B8, ly_do: 'Khám nhầm buổi' });
    expect(r.ho_so.buoi!.ma_buoi).toBe(B8);
    expect(r.ho_so.chuyen).toMatchObject({ tu: B7, ly_do: 'Khám nhầm buổi' });
    expect(r.buoi_cu!.hien_co).toBe(2);
    expect(r.buoi_moi!.hien_co).toBe(3);
    expect(r.ho_so.co_quyen_sua).toBe(false);
    const [row] = await sql()<{ da_di_chuyen: boolean; nhan_tu_kho_chung: boolean }[]>`SELECT da_di_chuyen, nhan_tu_kho_chung FROM ho_so WHERE id = ${h.id}`;
    expect(row).toEqual({ da_di_chuyen: true, nhan_tu_kho_chung: false });
  });

  it('hồ sơ đã xác nhận → 400', async () => {
    const h = await hs('H001');
    await xacNhanHoSo(ngan, h.id, h.version, true);
    const [cur] = await sql()<{ version: number }[]>`SELECT version FROM ho_so WHERE id = ${h.id}`;
    const e = await loi(chuyenHoSo(ngan, h.id, { version: cur.version, den: 'kho_chung' }));
    expect(e.status).toBe(400);
    expect(e.message).toContain('Bỏ xác nhận');
  });

  it('buổi nguồn hoặc đích khóa → 423', async () => {
    const h = await hs('H001');
    await sql()`UPDATE buoi_kham SET trang_thai = 'da_xac_nhan' WHERE ma_buoi = ${B8}`;
    expect((await loi(chuyenHoSo(ngan, h.id, { version: h.version, den: 'buoi', buoi: B8, ly_do: 'x' }))).status).toBe(423);
    await sql()`UPDATE buoi_kham SET trang_thai = 'da_xac_nhan' WHERE ma_buoi = ${B7}`;
    expect((await loi(chuyenHoSo(ngan, h.id, { version: h.version, den: 'kho_chung' }))).status).toBe(423);
  });

  it('không có quyền nguồn → 403; nhận kho cá nhân người khác → 403', async () => {
    const h4 = await hs('H004');
    expect((await loi(chuyenHoSo(ngan, h4.id, { version: h4.version, den: 'kho_chung' }))).status).toBe(403);
    const h = await hs('H001');
    const r = await chuyenHoSo(ngan, h.id, { version: h.version, den: 'kho_ca_nhan' });
    expect((await loi(nhanVeHoSo(trinh, h.id, { version: r.ho_so.version, buoi: B8 }))).status).toBe(403);
    expect((await loi(chuyenHoSo(trinh, h.id, { version: r.ho_so.version, den: 'kho_chung' }))).status).toBe(403);
    // admin được nhận từ kho cá nhân người khác
    const ok = await nhanVeHoSo(admin, h.id, { version: r.ho_so.version, buoi: B8 });
    expect(ok.ho_so.buoi!.ma_buoi).toBe(B8);
  });

  it('chuyển về đúng chỗ cũ → 400', async () => {
    const h = await hs('H009');
    expect((await loi(chuyenHoSo(admin, h.id, { version: h.version, den: 'kho_chung' }))).status).toBe(400);
  });
});

describe('kịch bản F — thêm hồ sơ, kiểm trùng', () => {
  const cls0 = { ctm: 0, glucose: 0, ure: 0, creatinin: 0, got: 0, gpt: 0, tpt_nuoc_tieu: 0, sieu_am: 0 } as const;

  it('trùng CCCD với hồ sơ kho chung → 409 có trung; nhận về không sinh hồ sơ mới', async () => {
    const truoc = await demHoSo();
    const body = { ho_ten: 'Người Khác Tên', gioi_tinh: 'Nam' as const, nam_sinh: 1980, cccd: '031066014509', cls: { ...cls0 } };
    const kt = await kiemTrung(ngan, { cccd: '031066014509' });
    expect(kt.trung).toHaveLength(1);
    expect(kt.trung[0].vi_tri).toBe('kho_chung');
    const e = await loi(themHoSo(ngan, B7, body));
    expect(e.status).toBe(409);
    expect((e.body!.trung as unknown[]).length).toBe(1);
    expect(await demHoSo()).toBe(truoc);
    const trungId = kt.trung[0].id;
    const nv = await nhanVeHoSo(ngan, trungId, { version: kt.trung[0].version, buoi: B7 });
    expect(nv.buoi_moi!.bo_sung).toBe(1);
    expect(await demHoSo()).toBe(truoc);
    // có lý do tạo mới thì được tạo
    const kq = await themHoSo(ngan, B7, { ...body, ly_do_tao_moi: 'Hai người khác nhau' });
    expect(kq.ho_so.nguon).toBe('them_tay');
    expect(await demHoSo()).toBe(truoc + 1);
  });

  it('trùng họ tên không dấu + năm sinh → 409; khác năm sinh thì không', async () => {
    expect((await kiemTrung(ngan, { ho_ten: 'dinh van h', nam_sinh: 1959 })).trung).toHaveLength(1);
    expect((await kiemTrung(ngan, { ho_ten: 'dinh van h', nam_sinh: 1960 })).trung).toHaveLength(0);
    expect((await kiemTrung(ngan, { ho_ten: 'dinh van h' })).trung).toHaveLength(0);
    expect((await kiemTrung(ngan, {})).trung).toHaveLength(0);
    expect((await kiemTrung(ngan, { ma_kcb: '009234' })).trung).toHaveLength(1);
  });

  it('người mới không mã KCB: tạo được, tự xác nhận, nguon them_tay, bo_sung +1, buổi thành đang rà soát', async () => {
    const kq = await themHoSo(ngan, B7, { ho_ten: 'Lương Văn Mới', gioi_tinh: 'Nam', nam_sinh: 1990, cls: { ...cls0, ctm: 1 }, ghi_chu: 'đi khám thêm' });
    expect(kq.ho_so).toMatchObject({ nguon: 'them_tay', ma_ho_so: null, ma_kcb: '', da_xac_nhan: true, version: 1, src: null });
    expect(kq.ho_so.xac_nhan_by?.username).toBe('ngan');
    expect(kq.ho_so.cls.ctm).toBe(1);
    expect(kq.buoi.hien_co).toBe(4);
    expect(kq.buoi.bo_sung).toBe(1);
    expect(kq.buoi.trang_thai).toBe('dang_ra_soat');
    const [r] = await sql()<{ ho_ten_kd: string }[]>`SELECT ho_ten_kd FROM ho_so WHERE id = ${kq.ho_so.id}`;
    expect(r.ho_ten_kd).toBe('luong van moi');
    expect((await lichSuHoSo(ngan, kq.ho_so.id)).map((x) => x.hanh_dong)).toContain('them_ho_so');
  });

  it('thêm vào buổi người khác → 403; buổi khóa → 423; dữ liệu sai bị schema chặn', async () => {
    const body = { ho_ten: 'Lương Văn Mới', gioi_tinh: 'Nam' as const, nam_sinh: 1990, cls: { ...cls0 } };
    expect((await loi(themHoSo(ngan, B8, body))).status).toBe(403);
    await sql()`UPDATE buoi_kham SET trang_thai = 'da_xac_nhan' WHERE ma_buoi = ${B7}`;
    expect((await loi(themHoSo(ngan, B7, body))).status).toBe(423);
    expect(themHoSoSchema.safeParse({ ...body, cccd: '123' }).success).toBe(false);
    expect(themHoSoSchema.safeParse({ ...body, nam_sinh: 1800 }).success).toBe(false);
    expect(themHoSoSchema.safeParse({ ...body, gioi_tinh: 'X' }).success).toBe(false);
    expect(themHoSoSchema.safeParse({ ...body, cls: { ...cls0, ctm: 2 } }).success).toBe(false);
    expect(themHoSoSchema.safeParse({ ...body, cls: { ctm: 1 } }).success).toBe(false);
    expect(themHoSoSchema.safeParse({ ...body, cccd: '' }).success).toBe(true);
  });
});

describe('xác nhận / mở khóa danh sách', () => {
  async function xacNhanHet(u: AuthUser, key: string) {
    const b = await buoiTT(key, u);
    for (const id of (await sql()<{ id: number }[]>`SELECT id FROM ho_so WHERE buoi_id = ${b.id} ORDER BY id`).map((x) => x.id)) {
      const [c] = await sql()<{ version: number }[]>`SELECT version FROM ho_so WHERE id = ${id}`;
      await xacNhanHoSo(u, id, c.version, true);
    }
  }

  it('còn hồ sơ chưa xác nhận → 400; lệch DS google sheet không giải trình → 400; có giải trình → khóa; PATCH → 423', async () => {
    const e1 = await loi(xacNhanBuoi(ngan, B7));
    expect(e1.status).toBe(400);
    expect(e1.message).toBe('Còn 3 hồ sơ chưa xác nhận');
    await xacNhanHet(ngan, B7); // 3 hồ sơ, so_doan_tong = 4
    expect((await loi(xacNhanBuoi(ngan, B7))).status).toBe(400);
    expect((await loi(xacNhanBuoi(ngan, B7, '   '))).status).toBe(400);
    expect((await loi(xacNhanBuoi(trinh, B7, 'x'))).status).toBe(403);
    const { buoi } = await xacNhanBuoi(ngan, B7, 'Người dân không đến khám');
    expect(buoi).toMatchObject({ trang_thai: 'da_xac_nhan', giai_trinh: 'Người dân không đến khám', co_quyen_sua: false });
    expect(buoi.xac_nhan_by?.username).toBe('ngan');
    expect(buoi.xac_nhan_at).not.toBeNull();
    const h = await hs('H001');
    expect((await loi(suaHoSo(ngan, h.id, { version: h.version, cls: { ctm: 0 } }))).status).toBe(423);
    expect((await loi(xacNhanBuoi(ngan, B7, 'lần 2'))).status).toBe(400);
  });

  it('khớp số đoàn thì không cần giải trình; 0 hồ sơ vẫn xác nhận được khi có giải trình', async () => {
    await sql()`UPDATE buoi_kham SET so_doan_tong = 3 WHERE ma_buoi = ${B7}`;
    await xacNhanHet(ngan, B7);
    expect((await xacNhanBuoi(ngan, B7)).buoi.trang_thai).toBe('da_xac_nhan');
    // buổi LK: 3 hồ sơ, 0 người phụ trách → admin; chuyển hết ra kho chung rồi xác nhận với giải trình
    const lk = await buoiTT('LK-20261014');
    for (const x of await sql()<{ id: number; version: number }[]>`SELECT id, version FROM ho_so WHERE buoi_id = ${lk.id}`) {
      await chuyenHoSo(admin, x.id, { version: x.version, den: 'kho_chung' });
    }
    expect((await loi(xacNhanBuoi(admin, 'LK-20261014'))).status).toBe(400);
    expect((await xacNhanBuoi(admin, 'LK-20261014', 'Không có ai khám')).buoi.hien_co).toBe(0);
  });

  it('mở khóa: nhân viên 403; admin thiếu lý do 400; có lý do → sửa lại được, nhật ký đủ', async () => {
    await xacNhanHet(ngan, B7);
    await xacNhanBuoi(ngan, B7, 'Thiếu 1 người');
    expect((await loi(moKhoaBuoi(ngan, B7, 'x'))).status).toBe(403);
    expect((await loi(moKhoaBuoi(admin, B7))).status).toBe(400);
    expect((await loi(moKhoaBuoi(admin, B7, '  '))).status).toBe(400);
    const { buoi } = await moKhoaBuoi(admin, B7, 'Phát hiện nhập sai');
    expect(buoi.trang_thai).toBe('dang_ra_soat');
    expect(buoi.giai_trinh).toBeNull();
    expect(buoi.co_quyen_sua).toBe(true);
    const h = await hs('H001');
    expect((await suaHoSo(ngan, h.id, { version: h.version, cls: { ctm: 0 } })).cls.ctm).toBe(0);
    expect((await loi(moKhoaBuoi(admin, B7, 'lại'))).status).toBe(400);
    const nk = await sql()<{ hanh_dong: string; ghi_chu: string | null }[]>`
      SELECT hanh_dong, ghi_chu FROM nhat_ky WHERE doi_tuong = 'buoi_kham' AND hanh_dong IN ('xac_nhan_buoi','mo_khoa_buoi') ORDER BY id`;
    expect(nk.map((x) => x.hanh_dong)).toEqual(['xac_nhan_buoi', 'mo_khoa_buoi', 'mo_khoa_buoi']);
    expect(nk[1].ghi_chu).toBe('Phát hiện nhập sai');
  });
});

describe('đề nghị chuyển', () => {
  it('người giữ đồng ý → hồ sơ về buổi người đề nghị; người khác không xử lý được', async () => {
    const h = await hs('H004'); // ở buổi của trinh
    expect((await loi(taoDeNghi(ngan, { ho_so_id: h.id, den_buoi: B7 }))).status).toBe(400); // thiếu lý do
    const { de_nghi } = await taoDeNghi(ngan, { ho_so_id: h.id, den_buoi: B7, ly_do: 'Khám nhầm buổi' });
    expect(de_nghi).toMatchObject({ trang_thai: 'cho_xu_ly', ly_do: 'Khám nhầm buổi' });
    expect(de_nghi.tu_buoi).toMatchObject({ ma_buoi: B8 });
    expect(de_nghi.tu_buoi!.phu_trach?.username).toBe('trinh');
    expect(de_nghi.den_buoi.ma_buoi).toBe(B7);
    expect(de_nghi.nguoi_de_nghi.username).toBe('ngan');

    expect((await loi(taoDeNghi(ngan, { ho_so_id: h.id, den_buoi: B7, ly_do: 'lại' }))).status).toBe(400); // trùng đang chờ
    expect((await loi(taoDeNghi(trinh, { ho_so_id: h.id, den_buoi: B8, ly_do: 'x' }))).status).toBe(400); // hồ sơ của chính mình
    expect((await loi(xuLyDeNghi(ngan, de_nghi.id, { dong_y: true }))).status).toBe(403);

    expect((await danhSachDeNghi(trinh, 'cho_xu_ly')).de_nghi).toHaveLength(1);
    expect((await danhSachDeNghi(ngan, 'cho_xu_ly')).de_nghi).toHaveLength(1);
    expect((await danhSachDeNghi(admin)).de_nghi).toHaveLength(1);

    const kq = await xuLyDeNghi(trinh, de_nghi.id, { dong_y: true, ghi_chu: 'OK' });
    expect(kq.de_nghi).toMatchObject({ trang_thai: 'dong_y', xu_ly_ghi_chu: 'OK' });
    expect(kq.de_nghi.xu_ly_by?.username).toBe('trinh');
    const [r] = await sql()<{ buoi_id: number }[]>`SELECT buoi_id FROM ho_so WHERE id = ${h.id}`;
    expect(r.buoi_id).toBe((await buoiTT(B7)).id);
    expect((await buoiTT(B7)).hien_co).toBe(4);
    expect((await buoiTT(B8)).hien_co).toBe(1);
    expect((await loi(xuLyDeNghi(trinh, de_nghi.id, { dong_y: false }))).status).toBe(400); // đã xử lý
    expect((await danhSachDeNghi(trinh, 'cho_xu_ly')).de_nghi).toHaveLength(0);
    const ls = await lichSuHoSo(admin, h.id);
    expect(ls.find((x) => x.hanh_dong === 'chuyen')).toMatchObject({ gia_tri_cu: B8, gia_tri_moi: B7, ghi_chu: 'Khám nhầm buổi' });
  });

  it('từ chối → giữ nguyên; sau đó đề nghị lại được; đích không phải buổi mình → 403', async () => {
    const h = await hs('H005');
    expect((await loi(taoDeNghi(ngan, { ho_so_id: h.id, den_buoi: 'LK-20261014', ly_do: 'x' }))).status).toBe(403);
    const { de_nghi } = await taoDeNghi(ngan, { ho_so_id: h.id, den_buoi: B7, ly_do: 'Cần' });
    const kq = await xuLyDeNghi(admin, de_nghi.id, { dong_y: false, ghi_chu: 'Không đúng' });
    expect(kq.de_nghi).toMatchObject({ trang_thai: 'tu_choi', xu_ly_ghi_chu: 'Không đúng' });
    const [r] = await sql()<{ buoi_id: number }[]>`SELECT buoi_id FROM ho_so WHERE id = ${h.id}`;
    expect(r.buoi_id).toBe((await buoiTT(B8)).id);
    expect((await taoDeNghi(ngan, { ho_so_id: h.id, den_buoi: B7, ly_do: 'Xin lại' })).de_nghi.trang_thai).toBe('cho_xu_ly');
  });

  it('đồng ý nhưng hồ sơ đã xác nhận / buổi khóa → lỗi, đề nghị vẫn chờ', async () => {
    const h = await hs('H004');
    const { de_nghi } = await taoDeNghi(ngan, { ho_so_id: h.id, den_buoi: B7, ly_do: 'Cần' });
    await xacNhanHoSo(trinh, h.id, h.version, true);
    expect((await loi(xuLyDeNghi(trinh, de_nghi.id, { dong_y: true }))).status).toBe(400);
    expect((await danhSachDeNghi(trinh, 'cho_xu_ly')).de_nghi).toHaveLength(1);
    const [c] = await sql()<{ version: number }[]>`SELECT version FROM ho_so WHERE id = ${h.id}`;
    await xacNhanHoSo(trinh, h.id, c.version, false);
    await sql()`UPDATE buoi_kham SET trang_thai = 'da_xac_nhan' WHERE ma_buoi = ${B7}`;
    expect((await loi(xuLyDeNghi(trinh, de_nghi.id, { dong_y: true }))).status).toBe(423);
    expect((await danhSachDeNghi(trinh, 'cho_xu_ly')).de_nghi).toHaveLength(1);
  });
});
