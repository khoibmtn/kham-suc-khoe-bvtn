import { existsSync } from 'node:fs';
import path from 'node:path';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { closeDb, getSql } from '@/db/client';
import { docGoiTuThuMuc, parseGoi } from '@/lib/import/goi';
import { apDung, docTongThucTe, lapKeHoach, NapTuChoi } from '@/lib/import/nap';
import { khongDau } from '@/lib/text';
import { taoGoiThu, type Bien } from './helpers/goi-thu';

const URL_TEST = process.env.TEST_DATABASE_URL;
if (!URL_TEST) throw new Error('Thiếu TEST_DATABASE_URL (.env.local) — test import cần DB test riêng');
if (!/test/i.test(new URL(URL_TEST).pathname)) throw new Error('TEST_DATABASE_URL phải trỏ vào DB có chữ "test" (test sẽ TRUNCATE)');

const sql = () => getSql();

async function demDb() {
  const [r] = await sql()<Record<string, number>[]>`
    SELECT (SELECT count(*) FROM users)::int AS users, (SELECT count(*) FROM buoi_kham)::int AS buoi,
           (SELECT count(*) FROM ho_so)::int AS ho_so, (SELECT count(*) FROM import_batches)::int AS batches,
           (SELECT count(*) FROM nhat_ky)::int AS nhat_ky`;
  return r;
}

beforeAll(async () => {
  await sql()`SELECT 1 FROM import_batches LIMIT 1`; // phải đã chạy db:migrate trên DB test
});
beforeEach(async () => {
  await sql()`TRUNCATE nhat_ky, de_nghi_chuyen, ho_so, buoi_kham, import_batches, users, dang_nhap_that_bai RESTART IDENTITY CASCADE`;
});
afterAll(async () => {
  await closeDb();
});

function parseThu(bien: Bien = {}) {
  const g = taoGoiThu(bien);
  return { ...g, kq: parseGoi(g.files) };
}

describe('parseGoi — gói hợp lệ', () => {
  it('đọc đủ và đếm đúng', () => {
    const { kq } = parseThu();
    expect(kq.errors).toEqual([]);
    expect(kq.ok).toBe(true);
    expect(kq.goi!.buoi).toHaveLength(3);
    expect(kq.goi!.hoSo).toHaveLength(10);
    expect(kq.goi!.nguoiDung).toHaveLength(3);
    expect(kq.goi!.buoi[0].ngay_kham).toBe('2026-09-07');
    expect(kq.goi!.hoSo[0].cccd).toBe('031066014597');
    expect(kq.goi!.hoSo[0].canh_bao).toEqual(['NGHI_SAO_CHEP_XN', 'LECH_NGAY']);
  });

  it('docGoiTuThuMuc đọc từ thư mục', async () => {
    const { dir } = taoGoiThu();
    const kq = await docGoiTuThuMuc(dir);
    expect(kq.ok).toBe(true);
  });

  it('cột thừa chỉ là cảnh báo', () => {
    const { kq } = parseThu({ hoSo: (rows) => rows.map((r) => ({ ...r, cot_la: 'x' })) });
    expect(kq.ok).toBe(true);
    expect(kq.warnings.join('\n')).toContain('cot_la');
  });
});

describe('parseGoi — gói sai bị từ chối, DB không đổi', () => {
  const ca: [string, Bien, string][] = [
    ['sai schema', { manifest: (m) => { m.schema = 'nhapsl-import-9'; } }, 'manifest.schema'],
    ['sai sha256', { manifest: (m) => { m.sha256['ho_so.csv'] = '0'.repeat(64); } }, 'ho_so.csv: sha256'],
    ['thiếu cột bắt buộc', { hoSo: (rows) => rows.map((r) => { const c = { ...r }; delete c.cls_got; return c; }) }, 'thiếu cột bắt buộc: cls_got'],
    ['gioi_tinh sai', { hoSo: (rows) => rows.map((r, i) => (i === 2 ? { ...r, gioi_tinh: 'Nu' } : r)) }, 'gioi_tinh "Nu"'],
    ['cờ cls = 2', { hoSo: (rows) => rows.map((r, i) => (i === 1 ? { ...r, cls_ure: '2' } : r)) }, 'cls_ure "2"'],
    ['ma_buoi không tồn tại', { hoSo: (rows) => rows.map((r, i) => (i === 0 ? { ...r, ma_buoi: 'TN-20250101' } : r)) }, 'TN-20250101'],
    ['ma_ho_so trùng', { hoSo: (rows) => rows.map((r, i) => (i === 3 ? { ...r, ma_ho_so: 'H001' } : r)) }, 'ma_ho_so trùng'],
    ['tổng manifest lệch', { manifest: (m) => { m.tong_theo_don_vi.TN.cls_glucose += 1; } }, 'TN.cls_glucose: manifest 4, đếm 3'],
    ['so_dong lệch', { manifest: (m) => { m.so_dong['ho_so.csv'] = 99; } }, 'so_dong.ho_so.csv: manifest 99, đếm 10'],
    ['ngay_kham sai', { buoi: (rows) => rows.map((r, i) => (i === 0 ? { ...r, ngay_kham: '31/02/2026' } : r)) }, 'ngay_kham'],
  ];
  it.each(ca)('%s', async (_ten, bien, mongDoi) => {
    const { kq } = parseThu(bien);
    expect(kq.ok).toBe(false);
    expect(kq.goi).toBeNull();
    expect(kq.errors.join('\n')).toContain(mongDoi);
    expect(await demDb()).toEqual({ users: 0, buoi: 0, ho_so: 0, batches: 0, nhat_ky: 0 });
  });

  it('gom nhiều lỗi cùng lúc, không dừng ở lỗi đầu', () => {
    const { kq } = parseThu({
      hoSo: (rows) => rows.map((r, i) => (i < 3 ? { ...r, gioi_tinh: 'X' } : r)),
      manifest: (m) => { m.schema = 'sai'; },
    });
    expect(kq.errors.length).toBeGreaterThanOrEqual(1);
    const { kq: kq2 } = parseThu({ hoSo: (rows) => rows.map((r, i) => (i < 3 ? { ...r, gioi_tinh: 'X' } : r)) });
    expect(kq2.errors.filter((e) => e.includes('gioi_tinh'))).toHaveLength(3);
  });
});

describe('nạp vào DB', () => {
  it('chạy thử không ghi gì', async () => {
    const { kq } = parseThu();
    const kh = await lapKeHoach(sql(), kq.goi!);
    expect(kh.cheDo).toBe('lan_dau');
    expect(kh.tuChoi).toBeNull();
    expect(kh.buoiThem).toBe(3);
    expect(kh.hoSoThemTrongBuoi).toEqual({ TN: 5, LK: 3, VK: 0, tong: 8 });
    expect(kh.hoSoThemKhoChung).toBe(2);
    expect(kh.userThem).toEqual(['admin', 'ngan', 'trinh']);
    expect(kh.tongSauNap.TN).toEqual({ so_buoi: 2, so_doan: 7, ho_so_trong_buoi: 5 });
    expect(await demDb()).toEqual({ users: 0, buoi: 0, ho_so: 0, batches: 0, nhat_ky: 0 });
  });

  it('apply ghi đúng dữ liệu; apply lần 2 bị từ chối', async () => {
    const { kq } = parseThu();
    await apDung(sql(), kq.goi!, 'cli:test');
    expect(await demDb()).toEqual({ users: 3, buoi: 3, ho_so: 10, batches: 1, nhat_ky: 1 });

    const [b] = await sql()<{ ngay_kham: string; so_doan: Record<string, number | null>; nv_goi_y: string }[]>`
      SELECT ngay_kham, so_doan, nv_goi_y FROM buoi_kham WHERE ma_buoi = 'TN-20260907'`;
    expect(b.ngay_kham).toBe('2026-09-07');
    expect(b.so_doan.so_doan_nuoc_tieu).toBeNull();
    expect(b.so_doan.so_doan_tu_18).toBe(3);

    const [h] = await sql()`SELECT * FROM ho_so WHERE ma_ho_so = 'H001'`;
    expect(h.cccd).toBe('031066014597');
    expect(h.ma_kcb).toBe('001234');
    expect(h.nguon).toBe('cowork');
    expect(h.vi_tri).toBe('buoi');
    expect(h.ma_buoi_ban_dau).toBe('TN-20260907');
    expect(h.ho_ten_kd).toBe(khongDau('NGUYỄN VĂN THỦY'));
    expect(h.ho_ten_kd).toBe('nguyen van thuy');
    expect(h.ctm).toBe(1);
    expect(h.glucose).toBe(1);
    expect(h.sieu_am).toBe(1);
    expect(h.canh_bao).toEqual(['NGHI_SAO_CHEP_XN', 'LECH_NGAY']);
    expect(h.src.cls).toEqual({ ctm: 1, glucose: 1, ure: 0, creatinin: 0, got: 0, gpt: 0, tpt_nuoc_tieu: 0, sieu_am: 1 });
    expect(h.src.cccd).toBe('031066014597');
    expect(h.src.ho_ten).toBe('NGUYỄN VĂN THỦY');
    expect(h.src.nam_sinh).toBe(1951);
    expect(h.sua_nhan_than).toBe(false);

    const kho = await sql()`SELECT vi_tri, buoi_id, canh_bao FROM ho_so WHERE ma_ho_so = 'H009'`;
    expect(kho[0].vi_tri).toBe('kho_chung');
    expect(kho[0].buoi_id).toBeNull();
    const [ky] = await sql()`SELECT ky_so FROM ho_so WHERE ma_ho_so = 'H003'`;
    expect(ky.ky_so).toBeNull();

    const [u] = await sql()`SELECT password_hash, role FROM users WHERE username = 'ngan'`;
    expect(u.password_hash).toBeNull();
    expect(u.role).toBe('nhan_vien');

    const [bt] = await sql()`SELECT phien_ban, che_do, nap_boi, manifest->>'schema' AS schema FROM import_batches`;
    expect(bt).toMatchObject({ phien_ban: 'v0-test-1', che_do: 'lan_dau', nap_boi: 'cli:test', schema: 'nhapsl-import-1' });
    const [nk] = await sql()`SELECT hanh_dong, doi_tuong, doi_tuong_id, user_id FROM nhat_ky`;
    expect(nk).toMatchObject({ hanh_dong: 'import', doi_tuong: 'import', doi_tuong_id: 'v0-test-1', user_id: null });

    const t = await docTongThucTe(sql());
    expect(t.hoSoTrongBuoi).toEqual({ TN: 5, LK: 3 });
    expect(t.khoChung).toBe(2);

    // lần 2: cùng phiên bản → "đã nạp"; không đổi gì
    const truoc = await demDb();
    await expect(apDung(sql(), kq.goi!, 'cli:test')).rejects.toThrow(NapTuChoi);
    await expect(apDung(sql(), kq.goi!, 'cli:test')).rejects.toThrow(/cũ hơn hoặc đã được nạp/);
    expect(await demDb()).toEqual(truoc);

    // phiên bản mới hơn → báo thuộc GĐ7, không ghi
    const moi = parseThu({ phienBan: 'v1-test-2' });
    await expect(apDung(sql(), moi.kq.goi!, 'cli:test')).rejects.toThrow(/GĐ7/);
    // phiên bản cũ hơn
    const cu = parseThu({ phienBan: 'v0-test-0' });
    await expect(apDung(sql(), cu.kq.goi!, 'cli:test')).rejects.toThrow(/cũ hơn/);
    expect(await demDb()).toEqual(truoc);
  });

  it('giữ nguyên user đã có (kể cả mật khẩu)', async () => {
    await sql()`INSERT INTO users (username, ho_ten, role, password_hash) VALUES ('ngan', 'Tên Cũ', 'nhan_vien', 'HASH')`;
    const { kq } = parseThu();
    const kh = await apDung(sql(), kq.goi!, 'cli:test');
    expect(kh.userThem).toEqual(['admin', 'trinh']);
    const [u] = await sql()`SELECT ho_ten, password_hash FROM users WHERE username = 'ngan'`;
    expect(u).toMatchObject({ ho_ten: 'Tên Cũ', password_hash: 'HASH' });
    expect((await demDb()).users).toBe(3);
  });

  it('lỗi giữa chừng thì rollback toàn bộ', async () => {
    const { kq } = parseThu();
    // tên buổi vượt ràng buộc: chèn trước một buổi trùng (don_vi, ngay_kham) để ép lỗi UNIQUE sau khi đã chèn users
    await sql()`INSERT INTO buoi_kham (ma_buoi, don_vi, ten_don_vi, ngay_kham, so_doan_tong) VALUES ('X', 'TN', 'x', '2026-09-08', 1)`;
    await expect(apDung(sql(), kq.goi!, 'cli:test')).rejects.toThrow();
    const d = await demDb();
    expect(d).toMatchObject({ users: 0, buoi: 1, ho_so: 0, batches: 0, nhat_ky: 0 });
  });
});

const DIR_V0 = path.resolve(process.cwd(), 'data/import/v0-20261111-thu');
describe.skipIf(!existsSync(DIR_V0))('gói thử v0-20261111-thu', () => {
  it('parse được; "Khác" → giới tính trống kèm cảnh báo', async () => {
    const kq = await docGoiTuThuMuc(DIR_V0);
    expect(kq.errors).toEqual([]);
    expect(kq.ok).toBe(true);
    expect(kq.warnings.some((w) => w.includes('H2600165488') && w.includes('để trống'))).toBe(true);
    const h = kq.goi!.hoSo.find((x) => x.ma_ho_so === 'H2600165488');
    expect(h?.gioi_tinh).toBe('');
  });
});

const DIR_V1 = path.resolve(process.cwd(), 'data/import/v1-20261111-1400');
describe.skipIf(!existsSync(DIR_V1))('gói chính thức v1-20261111-1400 (docs/04 mục 2)', () => {
  it('nạp ra đúng các con số', async () => {
    const kq = await docGoiTuThuMuc(DIR_V1);
    expect(kq.errors).toEqual([]);
    expect(kq.ok).toBe(true);
    await apDung(sql(), kq.goi!, 'cli:test');
    const t = await docTongThucTe(sql());
    expect(t.buoi).toEqual({
      TN: { so_buoi: 25, so_doan: 4016 }, LK: { so_buoi: 31, so_doan: 7147 }, VK: { so_buoi: 4, so_doan: 840 },
    });
    expect(t.hoSoTrongBuoi).toEqual({ TN: 4016, LK: 7147, VK: 840 });
    expect(t.khoChung).toBe(419);
    expect(t.tong).toBe(12422);
    expect(t.users).toBe(9);
    // tổng CLS trong buổi (docs/04 mục 2)
    const tongCls: Record<string, number> = {};
    for (const dv of Object.keys(t.cls)) for (const [k, v] of Object.entries(t.cls[dv])) tongCls[k] = (tongCls[k] ?? 0) + (v as number);
    expect(tongCls).toEqual({
      cls_ctm: 628, cls_glucose: 3077, cls_ure: 1768, cls_creatinin: 1763,
      cls_got: 2050, cls_gpt: 2049, cls_tpt_nuoc_tieu: 222, cls_sieu_am: 6448,
    });
    for (const [dv, m] of Object.entries(kq.goi!.manifest.tong_theo_don_vi)) {
      for (const [k, v] of Object.entries(m)) {
        if (k.startsWith('cls_')) expect(t.cls[dv][k], `${dv}.${k}`).toBe(v);
      }
    }
    const [{ n }] = await sql()<{ n: number }[]>`SELECT count(*)::int AS n FROM ho_so WHERE gioi_tinh = ''`;
    expect(n).toBe(1);
    const [{ z }] = await sql()<{ z: number }[]>`SELECT count(*)::int AS z FROM ho_so WHERE length(cccd) = 12 AND cccd LIKE '0%'`;
    expect(z).toBeGreaterThan(0);
  });
});
