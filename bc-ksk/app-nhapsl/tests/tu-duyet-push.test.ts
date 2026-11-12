import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { closeDb, getSql } from '@/db/client';
import type { AuthUser } from '@/lib/auth/guard';
import { parseGoi } from '@/lib/import/goi';
import { apDung } from '@/lib/import/nap';
import { layBuoiCoQuyen } from '@/lib/ra-soat/buoi';
import { docTuDuyet, ghiTuDuyet } from '@/lib/ra-soat/cai-dat';
import { danhSachDeNghi, taoDeNghi, xuLyDeNghi } from '@/lib/ra-soat/de-nghi';
import { xacNhanHoSo } from '@/lib/ra-soat/ho-so';
import { LoiNghiepVu } from '@/lib/ra-soat/loi';
import { phanCong } from '@/lib/ra-soat/phan-cong';
import { datLaiThrottleTuDuyet, quetTuDuyet } from '@/lib/ra-soat/tu-duyet';
import { tuDuyetSchema } from '@/lib/ra-soat/schemas';
import { dangKyPush, guiPush, guiThu, huyPush, payloadDaXuLy, payloadDeNghiMoi } from '@/lib/push';
import { taoGoiThu } from './helpers/goi-thu';

const URL_TEST = process.env.TEST_DATABASE_URL;
if (!URL_TEST) throw new Error('Thiếu TEST_DATABASE_URL (.env.local)');
if (!/test/i.test(new URL(URL_TEST).pathname)) throw new Error('TEST_DATABASE_URL phải trỏ vào DB có chữ "test"');

const sql = () => getSql();
let admin: AuthUser, ngan: AuthUser, trinh: AuthUser;
const B7 = 'TN-20260907'; // ngan
const B8 = 'TN-20260908'; // trinh

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
/** trinh (không phụ trách B7) xin chuyển hồ sơ `ma` của B7 về B8. */
async function taoDeNghiH(ma: string) {
  const h = await hs(ma);
  return (await taoDeNghi(trinh, { ho_so_id: h.id, den_buoi: B8, ly_do: 'Khám nhầm buổi' })).de_nghi;
}
const viTri = async (ma: string) =>
  (await sql()<{ ma_buoi: string | null; vi_tri: string }[]>`
    SELECT b.ma_buoi, h.vi_tri FROM ho_so h LEFT JOIN buoi_kham b ON b.id = h.buoi_id WHERE h.ma_ho_so = ${ma}`)[0];

beforeAll(async () => { await sql()`SELECT 1 FROM push_dang_ky LIMIT 1`; });
beforeEach(async () => {
  await sql()`TRUNCATE nhat_ky, de_nghi_chuyen, ho_so, buoi_kham, import_batches, users, dang_nhap_that_bai, cai_dat, push_dang_ky RESTART IDENTITY CASCADE`;
  await apDung(sql(), parseGoi(taoGoiThu().files).goi!, 'cli:test');
  admin = await layUser('admin'); ngan = await layUser('ngan'); trinh = await layUser('trinh');
  await phanCong(admin, [(await buoiTT(B7)).id], ngan.id);
  await phanCong(admin, [(await buoiTT(B8)).id], trinh.id);
  datLaiThrottleTuDuyet();
});
afterAll(async () => { await closeDb(); });

describe('cài đặt tự duyệt', () => {
  it('mặc định tắt/5 phút; admin ghi được, nhật ký cai_dat; quyền và validate', async () => {
    expect(await docTuDuyet()).toMatchObject({ che_do: 'tat', sau_phut: 5, updated_by: null, updated_at: null });
    const r = await ghiTuDuyet(admin, { che_do: 'sau_phut', sau_phut: 10 });
    expect(r.tu_duyet).toMatchObject({ che_do: 'sau_phut', sau_phut: 10, updated_by: { username: 'admin' } });
    expect(r.tu_duyet.updated_at).not.toBeNull();
    expect(await docTuDuyet()).toMatchObject({ che_do: 'sau_phut', sau_phut: 10 });
    const [nk] = await sql()<{ hanh_dong: string; doi_tuong: string; truong: string; gia_tri_cu: string; gia_tri_moi: string }[]>`
      SELECT hanh_dong, doi_tuong, truong, gia_tri_cu, gia_tri_moi FROM nhat_ky WHERE hanh_dong = 'cai_dat'`;
    expect(nk).toMatchObject({ doi_tuong: 'cai_dat', truong: 'tu_duyet' });
    expect(JSON.parse(nk.gia_tri_cu)).toEqual({ che_do: 'tat', sau_phut: 5 });
    expect(JSON.parse(nk.gia_tri_moi)).toEqual({ che_do: 'sau_phut', sau_phut: 10 });
    // chỉ đổi chế độ → giữ số phút cũ
    expect((await ghiTuDuyet(admin, { che_do: 'tat' })).tu_duyet.sau_phut).toBe(10);

    expect((await loi(ghiTuDuyet(ngan, { che_do: 'ngay', sau_phut: 5 }))).status).toBe(403);
    expect((await loi(ghiTuDuyet(admin, { che_do: 'luon', sau_phut: 5 }))).status).toBe(400);
    expect((await loi(ghiTuDuyet(admin, { che_do: 'ngay', sau_phut: 0 }))).status).toBe(400);
    expect((await loi(ghiTuDuyet(admin, { che_do: 'ngay', sau_phut: 121 }))).status).toBe(400);
    expect((await loi(ghiTuDuyet(admin, { che_do: 'ngay', sau_phut: 2.5 }))).status).toBe(400);
  });

  it('schema zod: từ chối chế độ lạ, số phút ngoài 1..120, trường thừa', () => {
    expect(tuDuyetSchema.safeParse({ che_do: 'ngay', sau_phut: 5 }).success).toBe(true);
    expect(tuDuyetSchema.safeParse({ che_do: 'x', sau_phut: 5 }).success).toBe(false);
    expect(tuDuyetSchema.safeParse({ che_do: 'ngay', sau_phut: 0 }).success).toBe(false);
    expect(tuDuyetSchema.safeParse({ che_do: 'ngay', sau_phut: 121 }).success).toBe(false);
    expect(tuDuyetSchema.safeParse({ che_do: 'ngay', sau_phut: '5' }).success).toBe(false);
    expect(tuDuyetSchema.safeParse({ che_do: 'ngay', sau_phut: 5, khac: 1 }).success).toBe(false);
  });
});

describe('tự duyệt đề nghị chuyển', () => {
  it('chế độ tắt: không làm gì, han_tu_duyet null', async () => {
    const d = await taoDeNghiH('H001');
    expect(d).toMatchObject({ trang_thai: 'cho_xu_ly', tu_dong: false, tu_dong_loi: '', han_tu_duyet: null });
    expect(await quetTuDuyet({ batBuoc: true })).toEqual({ da_duyet: 0, loi: 0 });
    expect((await viTri('H001')).ma_buoi).toBe(B7);
  });

  it('han_tu_duyet = created_at + sau_phut khi chờ ở chế độ sau_phut; null khi tắt/ngay/đã xử lý', async () => {
    await ghiTuDuyet(admin, { che_do: 'sau_phut', sau_phut: 7 });
    const d = await taoDeNghiH('H001');
    expect(d.trang_thai).toBe('cho_xu_ly');
    expect(new Date(d.han_tu_duyet!).getTime() - new Date(d.created_at).getTime()).toBe(7 * 60_000);
    const ds = (await danhSachDeNghi(admin, 'cho_xu_ly')).de_nghi;
    expect(ds[0].han_tu_duyet).toBe(d.han_tu_duyet);
    await ghiTuDuyet(admin, { che_do: 'tat' });
    expect((await danhSachDeNghi(admin)).de_nghi[0].han_tu_duyet).toBeNull();
    await ghiTuDuyet(admin, { che_do: 'sau_phut', sau_phut: 7 });
    await xuLyDeNghi(ngan, d.id, { dong_y: false });
    expect((await danhSachDeNghi(admin)).de_nghi[0].han_tu_duyet).toBeNull();
  });

  it('ngay: tạo xong là dong_y, tu_dong=true, hồ sơ về buổi đích, nhật ký user_id NULL + [Tự động]', async () => {
    await ghiTuDuyet(admin, { che_do: 'ngay', sau_phut: 5 });
    const d = await taoDeNghiH('H001');
    expect(d).toMatchObject({ trang_thai: 'dong_y', tu_dong: true, tu_dong_loi: '', han_tu_duyet: null, xu_ly_ghi_chu: 'Tự động duyệt' });
    expect(d.xu_ly_by).toMatchObject({ username: 'ngan' }); // người giữ hồ sơ
    expect((await viTri('H001')).ma_buoi).toBe(B8);
    const nk = await sql()<{ user_id: number | null; hanh_dong: string; ghi_chu: string }[]>`
      SELECT user_id, hanh_dong, ghi_chu FROM nhat_ky WHERE hanh_dong IN ('chuyen', 'xu_ly_de_nghi') ORDER BY id`;
    expect(nk.map((x) => x.hanh_dong)).toEqual(['chuyen', 'xu_ly_de_nghi']);
    for (const x of nk) { expect(x.user_id).toBeNull(); expect(x.ghi_chu.startsWith('[Tự động]')).toBe(true); }
  });

  it('đường chuyển/xử lý tay không đổi: nhật ký vẫn ghi người thao tác, không có tiền tố', async () => {
    const d = await taoDeNghiH('H001');
    await xuLyDeNghi(ngan, d.id, { dong_y: true, ghi_chu: 'ok' });
    const nk = await sql()<{ user_id: number | null; ghi_chu: string | null }[]>`
      SELECT user_id, ghi_chu FROM nhat_ky WHERE hanh_dong IN ('chuyen', 'xu_ly_de_nghi')`;
    expect(nk).toHaveLength(2);
    for (const x of nk) { expect(x.user_id).toBe(ngan.id); expect((x.ghi_chu ?? '').startsWith('[Tự động]')).toBe(false); }
    expect((await danhSachDeNghi(admin)).de_nghi[0]).toMatchObject({ tu_dong: false, tu_dong_loi: '' });
  });

  it('sau_phut: chưa quá hạn không duyệt; lùi created_at quá hạn rồi quét bắt buộc thì duyệt', async () => {
    await ghiTuDuyet(admin, { che_do: 'sau_phut', sau_phut: 5 });
    const d = await taoDeNghiH('H001');
    expect(await quetTuDuyet({ batBuoc: true })).toEqual({ da_duyet: 0, loi: 0 });
    expect((await viTri('H001')).ma_buoi).toBe(B7);
    await sql()`UPDATE de_nghi_chuyen SET created_at = now() - interval '6 minutes' WHERE id = ${d.id}`;
    expect(await quetTuDuyet({ batBuoc: true })).toEqual({ da_duyet: 1, loi: 0 });
    const [moi] = (await danhSachDeNghi(admin)).de_nghi;
    expect(moi).toMatchObject({ trang_thai: 'dong_y', tu_dong: true, xu_ly_ghi_chu: 'Tự động duyệt sau 5 phút' });
    expect((await viTri('H001')).ma_buoi).toBe(B8);
  });

  it('quét không bắt buộc bị throttle 15 giây', async () => {
    await ghiTuDuyet(admin, { che_do: 'sau_phut', sau_phut: 5 });
    const d = await taoDeNghiH('H001'); // quét bắt buộc đã đặt mốc throttle
    await sql()`UPDATE de_nghi_chuyen SET created_at = now() - interval '6 minutes' WHERE id = ${d.id}`;
    expect(await quetTuDuyet()).toEqual({ da_duyet: 0, loi: 0 });
    datLaiThrottleTuDuyet();
    expect(await quetTuDuyet()).toEqual({ da_duyet: 1, loi: 0 });
  });

  it('lỗi nghiệp vụ (hồ sơ đã xác nhận): ghi tu_dong_loi, vẫn chờ xử lý, quét lại không đổi, hồ sơ nguyên vị trí', async () => {
    const d = await taoDeNghiH('H001');
    const h = await hs('H001');
    await xacNhanHoSo(ngan, h.id, h.version, true);
    await ghiTuDuyet(admin, { che_do: 'ngay', sau_phut: 5 });
    let [x] = (await danhSachDeNghi(admin)).de_nghi;
    expect(x).toMatchObject({ id: d.id, trang_thai: 'cho_xu_ly', tu_dong: false, han_tu_duyet: null });
    expect(x.tu_dong_loi).not.toBe('');
    const loiCu = x.tu_dong_loi;
    expect((await viTri('H001')).ma_buoi).toBe(B7);
    const nkTruoc = (await sql()<{ n: number }[]>`SELECT count(*)::int AS n FROM nhat_ky`)[0].n;
    expect(await quetTuDuyet({ batBuoc: true })).toEqual({ da_duyet: 0, loi: 0 });
    [x] = (await danhSachDeNghi(admin)).de_nghi;
    expect(x).toMatchObject({ trang_thai: 'cho_xu_ly', tu_dong_loi: loiCu });
    expect((await sql()<{ n: number }[]>`SELECT count(*)::int AS n FROM nhat_ky`)[0].n).toBe(nkTruoc);
    // người vẫn xử lý tay được (từ chối)
    expect((await xuLyDeNghi(ngan, d.id, { dong_y: false })).de_nghi.trang_thai).toBe('tu_choi');
  });
});

describe('web push', () => {
  const vapidCu = { ...process.env };
  const tatVapid = () => { delete process.env.VAPID_PUBLIC_KEY; delete process.env.VAPID_PRIVATE_KEY; delete process.env.VAPID_SUBJECT; };
  const khoiPhuc = () => { for (const k of ['VAPID_PUBLIC_KEY', 'VAPID_PRIVATE_KEY', 'VAPID_SUBJECT']) { if (vapidCu[k] === undefined) delete process.env[k]; else process.env[k] = vapidCu[k]; } };
  const sub = (n: string) => ({ endpoint: `https://push.example.test/${n}`, keys: { p256dh: 'p', auth: 'a' }, thiet_bi: 'Test' });

  it('thiếu VAPID: guiPush và guiThu là no-op (0), không lỗi', async () => {
    tatVapid();
    try {
      await dangKyPush(ngan, sub('a'));
      expect(await guiPush([ngan.id], { title: 't', body: 'b', url: '/', tag: 'x' })).toBe(0);
      expect(await guiThu(ngan)).toEqual({ gui: 0 });
      expect((await sql()<{ last_ok_at: Date | null }[]>`SELECT last_ok_at FROM push_dang_ky`)[0].last_ok_at).toBeNull();
    } finally { khoiPhuc(); }
  });

  it('payload đề nghị mới / đã xử lý đúng nội dung hợp đồng và KHÔNG chứa họ tên bệnh nhân, CCCD, lý do', async () => {
    const d = await taoDeNghiH('H001');
    const [bn] = await sql()<{ ho_ten: string; cccd: string }[]>`SELECT ho_ten, cccd FROM ho_so WHERE ma_ho_so = 'H001'`;
    const ps = [
      payloadDeNghiMoi({ id: d.id, nguoiDeNghi: trinh.ho_ten, tuBuoi: B7, denBuoi: B8 }),
      payloadDaXuLy({ id: d.id, dongY: true, tuDong: false, denBuoi: B8 }),
      payloadDaXuLy({ id: d.id, dongY: true, tuDong: true, denBuoi: B8 }),
      payloadDaXuLy({ id: d.id, dongY: false, tuDong: false, denBuoi: B8 }),
      payloadDaXuLy({ id: d.id, dongY: false, tuDong: true, denBuoi: B8 }),
    ];
    expect(ps[0]).toEqual({ title: 'Đề nghị chuyển hồ sơ', body: `${trinh.ho_ten} xin chuyển 1 hồ sơ từ ${B7} về ${B8}`, url: '/kho?tab=de_nghi', tag: `de-nghi-${d.id}` });
    expect(ps[1]).toMatchObject({ title: 'Đề nghị chuyển đã được đồng ý', body: `Hồ sơ đã về buổi ${B8}` });
    expect(ps[2].title).toBe('Đề nghị chuyển đã được đồng ý (tự động)');
    expect(ps[3]).toMatchObject({ title: 'Đề nghị chuyển bị từ chối', body: 'Lý do từ chối xem trong app' });
    expect(ps[4].title).toBe('Đề nghị chuyển bị từ chối (tự động)');
    const txt = JSON.stringify(ps);
    expect(txt).not.toContain(bn.ho_ten);
    if (bn.cccd) expect(txt).not.toContain(bn.cccd);
    expect(txt).not.toContain('Khám nhầm buổi');
  });

  it('đăng ký là upsert theo endpoint (đăng nhập lại chuyển sang user hiện tại); hủy chỉ xóa hàng của mình', async () => {
    await dangKyPush(ngan, sub('a'));
    await dangKyPush(trinh, sub('b'));
    await dangKyPush(trinh, sub('a')); // cùng thiết bị, đổi người
    let rows = await sql()<{ endpoint: string; user_id: number }[]>`SELECT endpoint, user_id FROM push_dang_ky ORDER BY endpoint`;
    expect(rows.map((r) => r.user_id)).toEqual([trinh.id, trinh.id]);
    await huyPush(ngan, { endpoint: sub('a').endpoint }); // không phải của ngan → không xóa
    expect(await sql()`SELECT 1 FROM push_dang_ky`).toHaveLength(2);
    await huyPush(trinh, { endpoint: sub('a').endpoint });
    rows = await sql()<{ endpoint: string; user_id: number }[]>`SELECT endpoint, user_id FROM push_dang_ky`;
    expect(rows).toHaveLength(1);
    expect(rows[0].endpoint).toBe(sub('b').endpoint);
  });
});

describe('đề nghị trên hồ sơ ở buổi của chính mình (13/11/2026)', () => {
  it('người phụ trách cả hai buổi → chuyển ngay, đề nghị dong_y + tu_dong, dù tự duyệt đang tắt', async () => {
    await phanCong(admin, [(await buoiTT(B8)).id], ngan.id); // ngan giữ cả B7 và B8
    const h = await hs('H001'); // ở B7 của ngan
    const { de_nghi } = await taoDeNghi(ngan, { ho_so_id: h.id, den_buoi: B8, ly_do: 'Nhập nhầm ngày' });
    expect(de_nghi).toMatchObject({ trang_thai: 'dong_y', tu_dong: true, tu_dong_loi: '', han_tu_duyet: null });
    expect(de_nghi.xu_ly_by?.username).toBe('ngan');
    expect(await viTri('H001')).toEqual({ ma_buoi: B8, vi_tri: 'buoi' });
    const nk = await sql()<{ hanh_dong: string; user_id: number | null }[]>`
      SELECT hanh_dong, user_id FROM nhat_ky WHERE hanh_dong IN ('chuyen','de_nghi_chuyen','xu_ly_de_nghi') ORDER BY id`;
    expect(nk.map((x) => x.hanh_dong).sort()).toEqual(['chuyen', 'de_nghi_chuyen', 'xu_ly_de_nghi']);
    expect(nk.every((x) => x.user_id === ngan.id)).toBe(true);
  });
  it('hồ sơ của người khác vẫn tạo đề nghị chờ xử lý như cũ', async () => {
    const d = await taoDeNghiH('H001'); // trinh xin hồ sơ ở B7 của ngan
    expect(d.trang_thai).toBe('cho_xu_ly');
    expect(await viTri('H001')).toEqual({ ma_buoi: B7, vi_tri: 'buoi' });
  });
});
