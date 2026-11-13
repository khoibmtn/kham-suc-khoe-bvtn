// Phase 12 — kiểm soát nhập nhầm CCCD / mã KCB / SĐT phía máy chủ (quy tắc: src/lib/kiem-so.ts).
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { closeDb, getSql } from '@/db/client';
import type { AuthUser } from '@/lib/auth/guard';
import type { VanDeSo } from '@/lib/api-types';
import { parseGoi } from '@/lib/import/goi';
import { apDung } from '@/lib/import/nap';
import { layBuoiCoQuyen } from '@/lib/ra-soat/buoi';
import { hoSoCuaBuoi, lichSuHoSo, suaHoSo } from '@/lib/ra-soat/ho-so';
import { tinhLaiCanhBaoSo } from '@/lib/ra-soat/kiem-so-ghi';
import { LoiNghiepVu } from '@/lib/ra-soat/loi';
import { phanCong } from '@/lib/ra-soat/phan-cong';
import { themHoSo } from '@/lib/ra-soat/them-ho-so';
import { timKiem } from '@/lib/ra-soat/tim-kiem';
import { taoGoiThu, type Bien, type Row } from './helpers/goi-thu';

const URL_TEST = process.env.TEST_DATABASE_URL;
if (!URL_TEST) throw new Error('Thiếu TEST_DATABASE_URL (.env.local)');
if (!/test/i.test(new URL(URL_TEST).pathname)) throw new Error('TEST_DATABASE_URL phải trỏ vào DB có chữ "test"');

const sql = () => getSql();
const B7 = 'TN-20260907';
const B8 = 'TN-20260908';
let admin: AuthUser, ngan: AuthUser, trinh: AuthUser;

async function layUser(username: string): Promise<AuthUser> {
  const [r] = await sql()<AuthUser[]>`SELECT id, username, ho_ten, role, session_version FROM users WHERE username = ${username}`;
  return r;
}
async function loi(p: Promise<unknown>): Promise<LoiNghiepVu> {
  try { await p; } catch (e) { if (e instanceof LoiNghiepVu) return e; throw e; }
  throw new Error('Mong đợi LoiNghiepVu nhưng không có lỗi');
}
const goi = (bien: Bien = {}) => {
  const g = taoGoiThu(bien);
  const kq = parseGoi(g.files);
  if (!kq.ok) throw new Error(kq.errors.join('\n'));
  return kq.goi!;
};
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const dong = async (ma: string): Promise<any> => (await sql()`SELECT * FROM ho_so WHERE ma_ho_so = ${ma}`)[0];
const sua = (r: Row[], ma: string, doi: Row) => r.map((x) => (x.ma_ho_so === ma ? { ...x, ...doi } : x));
const ma = (vs: VanDeSo[]) => vs.map((v) => `${v.truong}:${v.ma}`);
const cls0 = { ctm: 0, glucose: 0, ure: 0, creatinin: 0, got: 0, gpt: 0, tpt_nuoc_tieu: 0, sieu_am: 0 } as const;

beforeAll(async () => { await sql()`SELECT 1 FROM import_batches LIMIT 1`; });
beforeEach(async () => {
  await sql()`TRUNCATE nhat_ky, de_nghi_chuyen, ho_so, buoi_kham, import_batches, users, dang_nhap_that_bai RESTART IDENTITY CASCADE`;
  await apDung(sql(), goi(), 'cli:test');
  admin = await layUser('admin'); ngan = await layUser('ngan'); trinh = await layUser('trinh');
  await phanCong(admin, [(await layBuoiCoQuyen(sql(), admin, B7)).id], ngan.id);
  await phanCong(admin, [(await layBuoiCoQuyen(sql(), admin, B8)).id], trinh.id);
});
afterAll(async () => { await closeDb(); });

// Gói thử: H001 Nam sinh 1951 CCCD 031066014597 (CCCD ứng với 1966 → lệch năm sinh sẵn); H002 Nữ 1952; H003 Nam 1953.

describe('sửa hồ sơ — kiểm số', () => {
  it('mã KCB là số CCCD → 400 kèm van_de_so; không ghi gì', async () => {
    const h = await dong('H002');
    const e = await loi(suaHoSo(ngan, h.id, { version: h.version, ma_kcb: '031066014597' }));
    expect(e.status).toBe(400);
    expect(e.message).toBe('Mã KCB có dạng số CCCD');
    expect(ma(e.body!.van_de_so as VanDeSo[])).toContain('ma_kcb:MA_KCB_LA_CCCD');
    expect((await dong('H002')).ma_kcb).toBe(h.ma_kcb);
    expect((await dong('H002')).version).toBe(h.version);
  });

  it('CCCD sai độ dài / có chữ → 400 (quy tắc cũ giữ)', async () => {
    const h = await dong('H002');
    expect((await loi(suaHoSo(ngan, h.id, { version: h.version, cccd: '12345' }))).status).toBe(400);
    expect((await loi(suaHoSo(ngan, h.id, { version: h.version, cccd: '03106601459a' }))).status).toBe(400);
    // 9 số (CMND) và rỗng vẫn được
    await suaHoSo(ngan, h.id, { version: h.version, cccd: '' });
  });

  it('CCCD lệch năm sinh → 422; có bo_qua_canh_bao_so thì lưu, nhật ký ghi "Vẫn lưu dù cảnh báo", canh_bao_so cập nhật', async () => {
    const h = await dong('H002'); // Nữ 1952
    const e = await loi(suaHoSo(ngan, h.id, { version: h.version, cccd: '031166014505' })); // Nữ 1966
    expect(e.status).toBe(422);
    expect(e.message).toBe('Số có thể bị nhập nhầm');
    expect(ma(e.body!.van_de_so as VanDeSo[])).toEqual(['cccd:CCCD_NAM_SINH']);
    expect((await dong('H002')).cccd).toBe(h.cccd);

    const kq = await suaHoSo(ngan, h.id, { version: h.version, cccd: '031166014505', bo_qua_canh_bao_so: true });
    expect(kq.cccd).toBe('031166014505');
    expect(kq.sua_nhan_than).toBe(true);
    expect(kq.canh_bao_so).toEqual(['CCCD ứng với năm sinh 1966, hồ sơ ghi 1952', 'Mã KCB thường gồm 10 số, bắt đầu bằng 26']);
    const nk = (await lichSuHoSo(ngan, h.id)).find((x) => x.hanh_dong === 'sua_nhan_than' && x.truong === 'cccd');
    expect(nk?.ghi_chu).toBe('[Vẫn lưu dù cảnh báo: CCCD ứng với năm sinh 1966, hồ sơ ghi 1952]');
  });

  it('chuẩn hóa: bỏ khoảng trắng / dấu chấm / gạch ngang của CCCD, mã KCB, SĐT', async () => {
    const h = await dong('H002');
    const kq = await suaHoSo(ngan, h.id, {
      version: h.version, cccd: '031 166.014-505', ma_kcb: '2600 134941', so_dt: '0912.345 678', bo_qua_canh_bao_so: true,
    });
    expect(kq).toMatchObject({ cccd: '031166014505', ma_kcb: '2600134941', so_dt: '0912345678' });
  });

  it('sửa ô khác (ghi chú, CLS) trên hồ sơ đã có vấn đề số KHÔNG bị chặn', async () => {
    const h = await dong('H001'); // CCCD lệch năm sinh sẵn
    const h2 = h;
    expect(h2.canh_bao_so.length).toBeGreaterThan(0);
    const kq = await suaHoSo(ngan, h2.id, { version: h2.version, ghi_chu: 'đã đối chiếu', cls: { ctm: 0 } });
    expect(kq.ghi_chu).toBe('đã đối chiếu');
    expect(kq.canh_bao_so).toEqual(h2.canh_bao_so);
  });

  it('đổi năm sinh làm lệch CCCD → 422; đổi cho khớp thì lưu và canh_bao_so hết', async () => {
    const h = await dong('H001'); // 1951 vs CCCD 1966
    const ok = await suaHoSo(ngan, h.id, { version: h.version, nam_sinh: 1966 });
    expect(ok.canh_bao_so.filter((x) => x.startsWith('CCCD ứng với năm sinh'))).toEqual([]);
    const e = await loi(suaHoSo(ngan, h.id, { version: ok.version, nam_sinh: 1970 }));
    expect(e.status).toBe(422);
    expect(ma(e.body!.van_de_so as VanDeSo[])).toEqual(['cccd:CCCD_NAM_SINH']);
    expect((await dong('H001')).nam_sinh).toBe(1966);
  });

  it('đổi giới tính làm lệch CCCD → 422', async () => {
    const h = await dong('H001'); // CCCD là của Nam
    await suaHoSo(ngan, h.id, { version: h.version, nam_sinh: 1966 });
    const h2 = await dong('H001');
    const e = await loi(suaHoSo(ngan, h2.id, { version: h2.version, gioi_tinh: 'Nữ' }));
    expect(e.status).toBe(422);
    expect(ma(e.body!.van_de_so as VanDeSo[])).toEqual(['cccd:CCCD_GIOI_TINH']);
  });

  it('CCCD có lỗi sẵn không chặn việc sửa năm sinh khác (chỉ chặn điểm lệch do chính lần sửa)', async () => {
    const h = await dong('H002');
    await sql()`UPDATE ho_so SET cccd = '2600134941' WHERE id = ${h.id}`; // lỗi sẵn: có dạng mã KCB
    const kq = await suaHoSo(ngan, h.id, { version: h.version, nam_sinh: 1960 });
    expect(kq.nam_sinh).toBe(1960);
    expect(kq.canh_bao_so).toContain('CCCD có dạng mã KCB');
  });

  it('trùng CCCD với hồ sơ khác khác họ tên → 422, thông điệp nêu số hồ sơ nhưng không lộ họ tên', async () => {
    const a = await dong('H001'); // NGUYỄN VĂN THỦY
    const c = await dong('H003'); // LÊ VĂN A
    const e = await loi(suaHoSo(ngan, c.id, { version: c.version, cccd: a.cccd }));
    expect(e.status).toBe(422);
    const vs = e.body!.van_de_so as VanDeSo[];
    const trung = vs.find((v) => v.ma === 'TRUNG_HO_SO')!;
    expect(trung).toMatchObject({ truong: 'cccd', muc: 'canh_bao' });
    expect(trung.thong_diep).toBe(`CCCD trùng hồ sơ #${a.id} (TN · 07/09)`);
    expect(JSON.stringify(e.body)).not.toMatch(/NGUY|THỦY|Thủy|thuy/i);
    // cùng họ tên (không dấu) thì không phải trùng người khác
    const lai = await suaHoSo(ngan, c.id, { version: c.version, ho_ten: 'nguyen van thuy', cccd: a.cccd, bo_qua_canh_bao_so: true });
    expect(lai.cccd).toBe(a.cccd);
    const d = await dong('H002');
    const e2 = await loi(suaHoSo(ngan, d.id, { version: d.version, ma_kcb: a.ma_kcb, ho_ten: 'Ai Đó' }));
    expect(ma(e2.body!.van_de_so as VanDeSo[])).toContain('ma_kcb:TRUNG_HO_SO');
  });

  it('hồ sơ ẩn không tính là trùng', async () => {
    const a = await dong('H001');
    const c = await dong('H003');
    await sql()`UPDATE ho_so SET vi_tri = 'an', buoi_id = NULL WHERE id = ${a.id}`;
    const e = await loi(suaHoSo(ngan, c.id, { version: c.version, cccd: a.cccd }));
    expect(ma(e.body!.van_de_so as VanDeSo[])).toEqual(['cccd:CCCD_NAM_SINH']); // chỉ lệch năm sinh, không có TRUNG_HO_SO
  });
});

describe('SĐT', () => {
  it('sửa được, chuẩn hóa, tính là sửa nhân thân; "0" hiển thị rỗng; nhật ký có cũ/mới', async () => {
    const h = await dong('H002');
    await sql()`UPDATE ho_so SET so_dt = '0' WHERE id = ${h.id}`;
    const truoc = await hoSoCuaBuoi(sql(), (await layBuoiCoQuyen(sql(), ngan, B7)).id);
    expect(truoc.find((x) => x.id === h.id)!.so_dt).toBe('');
    const kq = await suaHoSo(ngan, h.id, { version: h.version, so_dt: '0912 345 678' });
    expect(kq.so_dt).toBe('0912345678');
    expect(kq.sua_nhan_than).toBe(true);
    const nk = (await lichSuHoSo(ngan, h.id)).find((x) => x.truong === 'so_dt');
    expect(nk).toMatchObject({ hanh_dong: 'sua_nhan_than', gia_tri_cu: '0', gia_tri_moi: '0912345678' });
  });

  it('"0" → "" không đổi gì (giữ version); SĐT có dạng mã KCB → 400; SĐT lạ → 422', async () => {
    const h = await dong('H002');
    await sql()`UPDATE ho_so SET so_dt = '0' WHERE id = ${h.id}`;
    expect((await suaHoSo(ngan, h.id, { version: h.version, so_dt: '' })).version).toBe(h.version);
    const e = await loi(suaHoSo(ngan, h.id, { version: h.version, so_dt: '2600134941' }));
    expect(e.status).toBe(400);
    expect(e.message).toBe('SĐT có dạng mã KCB');
    const e2 = await loi(suaHoSo(ngan, h.id, { version: h.version, so_dt: '0112345678' }));
    expect(e2.status).toBe(422);
    expect(ma(e2.body!.van_de_so as VanDeSo[])).toEqual(['so_dt:SDT_DANG']);
  });

  it('nạp lại gói: SĐT đã sửa được giữ; hồ sơ chưa chạm nhận SĐT mới; canh_bao_so tính lại', async () => {
    const x = await dong('H004');
    await suaHoSo(trinh, x.id, { version: x.version, so_dt: '0933333333' });
    const g = goi({
      phienBan: 'v0-test-2',
      hoSo: (r) => sua(sua(r, 'H004', { so_dt: '0911111111' }), 'H005', { so_dt: '0922222222', ma_kcb: '2600000005' }),
    });
    await apDung(sql(), g, 'cli:test');
    expect((await dong('H004')).so_dt).toBe('0933333333');
    const y = await dong('H005');
    expect(y.so_dt).toBe('0922222222');
    expect(y.ma_kcb).toBe('2600000005');
    expect(y.canh_bao_so).not.toContain('Mã KCB thường gồm 10 số, bắt đầu bằng 26');
  });
});

describe('nạp gói tính canh_bao_so; thêm tay', () => {
  it('nạp lần đầu: canh_bao_so = thông điệp kiểm số của từng hồ sơ', async () => {
    const h = await dong('H001'); // ma_kcb 001234 (không đúng dạng), CCCD lệch năm sinh
    expect(h.canh_bao_so).toEqual([
      'CCCD ứng với năm sinh 1966, hồ sơ ghi 1951',
      'Mã KCB thường gồm 10 số, bắt đầu bằng 26',
    ]);
  });

  it('thêm tay: mã KCB là CCCD → 400; CCCD lệch năm sinh → 422; bo_qua → lưu, ghi nhật ký, SĐT chuẩn hóa', async () => {
    const goc = { ho_ten: 'Lương Văn Mới', gioi_tinh: 'Nam' as const, nam_sinh: 1990, cls: { ...cls0 } };
    const e = await loi(themHoSo(ngan, B7, { ...goc, ma_kcb: '031066014599' }));
    expect(e.status).toBe(400);
    expect(ma(e.body!.van_de_so as VanDeSo[])).toContain('ma_kcb:MA_KCB_LA_CCCD');
    const e2 = await loi(themHoSo(ngan, B7, { ...goc, cccd: '031066014599' }));
    expect(e2.status).toBe(422);
    expect(ma(e2.body!.van_de_so as VanDeSo[])).toEqual(['cccd:CCCD_NAM_SINH']);
    const [{ n }] = await sql()<{ n: number }[]>`SELECT count(*)::int AS n FROM ho_so WHERE nguon = 'them_tay'`;
    expect(n).toBe(0);

    const kq = await themHoSo(ngan, B7, { ...goc, cccd: '031 066 014599', so_dt: '0912.345.678', bo_qua_canh_bao_so: true });
    expect(kq.ho_so).toMatchObject({ cccd: '031066014599', so_dt: '0912345678', nguon: 'them_tay' });
    expect(kq.ho_so.canh_bao_so).toEqual(['CCCD ứng với năm sinh 1966, hồ sơ ghi 1990']);
    const nk = (await lichSuHoSo(ngan, kq.ho_so.id)).find((x) => x.hanh_dong === 'them_ho_so');
    expect(nk?.ghi_chu).toBe('[Vẫn lưu dù cảnh báo: CCCD ứng với năm sinh 1966, hồ sơ ghi 1990]');
  });

  it('thêm tay đúng số: không cảnh báo, canh_bao_so rỗng', async () => {
    const kq = await themHoSo(ngan, B7, {
      ho_ten: 'Lương Văn Mới', gioi_tinh: 'Nam', nam_sinh: 1966, cccd: '031066014599', ma_kcb: '2600134941', so_dt: '0912345678', cls: { ...cls0 },
    });
    expect(kq.ho_so.canh_bao_so).toEqual([]);
  });
});

describe('kiem-so (tính lại hàng loạt) và bộ lọc nghi_nham_so', () => {
  it('idempotent: lần 1 cập nhật dòng thiếu, lần 2 không đổi gì; không ghi nhật ký, không tăng version', async () => {
    await sql()`UPDATE ho_so SET canh_bao_so = '{}'`;
    const nkTruoc = (await sql()<{ n: number }[]>`SELECT count(*)::int AS n FROM nhat_ky`)[0].n;
    const vTruoc = (await sql()`SELECT md5(string_agg(version::text, ',' ORDER BY id)) AS m FROM ho_so`)[0].m;
    const l1 = await tinhLaiCanhBaoSo(sql());
    expect(l1.tong).toBe(10);
    expect(l1.coVanDe).toBeGreaterThan(0);
    expect(l1.capNhat).toBe(l1.coVanDe);
    expect(l1.theoMa.MA_KCB_DANG).toBe(10);
    const l2 = await tinhLaiCanhBaoSo(sql());
    expect(l2.capNhat).toBe(0);
    expect(l2.coVanDe).toBe(l1.coVanDe);
    expect((await sql()<{ n: number }[]>`SELECT count(*)::int AS n FROM nhat_ky`)[0].n).toBe(nkTruoc);
    expect((await sql()`SELECT md5(string_agg(version::text, ',' ORDER BY id)) AS m FROM ho_so`)[0].m).toBe(vTruoc);
  });

  it('lọc nghi_nham_so=1 / 0 theo canh_bao_so', async () => {
    const x = await dong('H002');
    await sql()`UPDATE ho_so SET canh_bao_so = '{}' WHERE id = ${x.id}`;
    const co = await timKiem(admin, { q: '', pham_vi: 'tat_ca', loc: { nghi_nham_so: true } });
    const khong = await timKiem(admin, { q: '', pham_vi: 'tat_ca', loc: { nghi_nham_so: false } });
    expect(khong.ket_qua.map((h) => h.id)).toEqual([x.id]);
    expect(co.tong).toBe(9);
    expect(co.ket_qua.every((h) => h.canh_bao_so.length > 0)).toBe(true);
    expect(khong.ket_qua[0].so_dt).toBe('');
  });
});
