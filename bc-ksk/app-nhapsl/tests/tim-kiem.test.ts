import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { closeDb, getSql } from '@/db/client';
import type { AuthUser } from '@/lib/auth/guard';
import { parseGoi } from '@/lib/import/goi';
import { apDung } from '@/lib/import/nap';
import { layBuoiCoQuyen } from '@/lib/ra-soat/buoi';
import { LoiNghiepVu } from '@/lib/ra-soat/loi';
import { phanCong } from '@/lib/ra-soat/phan-cong';
import { phanTichTuKhoa, timKiem, type BoLoc, type PhamViTimKiem } from '@/lib/ra-soat/tim-kiem';
import { khongDau } from '@/lib/text';
import { khopHoSo, tachTuKhoa } from '@/lib/tim-mo';
import { taoGoiThu } from './helpers/goi-thu';

const URL_TEST = process.env.TEST_DATABASE_URL;
if (!URL_TEST) throw new Error('Thiếu TEST_DATABASE_URL (.env.local)');
if (!/test/i.test(new URL(URL_TEST).pathname)) throw new Error('TEST_DATABASE_URL phải trỏ vào DB có chữ "test"');

const sql = () => getSql();
let admin: AuthUser, ngan: AuthUser, trinh: AuthUser;

async function layUser(username: string): Promise<AuthUser> {
  const [r] = await sql()<AuthUser[]>`SELECT id, username, ho_ten, role, session_version FROM users WHERE username = ${username}`;
  return r;
}
async function loi(p: Promise<unknown>): Promise<LoiNghiepVu> {
  try { await p; } catch (e) { if (e instanceof LoiNghiepVu) return e; throw e; }
  throw new Error('Mong đợi LoiNghiepVu nhưng không có lỗi');
}
const tim = (u: AuthUser, q: string, pham_vi: PhamViTimKiem = 'tat_ca', buoi?: string, loc?: BoLoc) => timKiem(u, { q, pham_vi, buoi, loc });
const maHs = (kq: { ket_qua: { ma_ho_so: string | null }[] }) => kq.ket_qua.map((r) => r.ma_ho_so);

// H001 THỦY (U+1EE6 Y) 1960 | H002 NGUYỄN THỊ ĐÀO | H003 NGUYỄN VĂN AN CCCD 0 đầu | H004 NGUYỄN THỊ MAI (trinh)
// H006 THUỶ (U + U+1EF6) 1960 (LK) | H007 VŨ VĂN THỦY 1961 | H009/H010 kho chung
const SUA: Record<string, Record<string, string>> = {
  H001: { ho_ten: 'NGUYỄN VĂN THỦY', nam_sinh: '1960', so_dt: '0912398765', so_the_bhyt: 'GD4313100012345' },
  H002: { ho_ten: 'NGUYỄN THỊ ĐÀO', nam_sinh: '1952' },
  H003: { ho_ten: 'NGUYỄN VĂN AN', nam_sinh: '1975', cccd: '001203004567' },
  H004: { ho_ten: 'NGUYỄN THỊ MAI', nam_sinh: '1962' },
  H006: { ho_ten: 'ĐỖ THỊ THUỶ', nam_sinh: '1960' },
  H007: { ho_ten: 'VŨ VĂN THỦY', nam_sinh: '1961' },
};

beforeAll(async () => { await sql()`SELECT 1 FROM import_batches LIMIT 1`; });
beforeEach(async () => {
  await sql()`TRUNCATE nhat_ky, de_nghi_chuyen, ho_so, buoi_kham, import_batches, users, dang_nhap_that_bai RESTART IDENTITY CASCADE`;
  const kq = parseGoi(taoGoiThu({ hoSo: (rows) => rows.map((r) => ({ ...r, ...(SUA[r.ma_ho_so] ?? {}) })) }).files);
  await apDung(sql(), kq.goi!, 'cli:test');
  admin = await layUser('admin'); ngan = await layUser('ngan'); trinh = await layUser('trinh');
  await phanCong(admin, [(await layBuoiCoQuyen(sql(), admin, 'TN-20260907')).id], ngan.id);
  await phanCong(admin, [(await layBuoiCoQuyen(sql(), admin, 'TN-20260908')).id], trinh.id);
});
afterAll(async () => { await closeDb(); });

describe('phanTichTuKhoa (thuần, theo tim-mo)', () => {
  it('phân loại token SO / MA / CHU', () => {
    expect(phanTichTuKhoa('  Nguyễn  Thị ')).toEqual([{ loai: 'CHU', tu: 'nguyen' }, { loai: 'CHU', tu: 'thi' }]);
    expect(phanTichTuKhoa('1960 4597 031066014597 12')).toEqual([
      { loai: 'SO', tu: '1960' }, { loai: 'SO', tu: '4597' }, { loai: 'SO', tu: '031066014597' }, { loai: 'CHU', tu: '12' },
    ]);
    expect(phanTichTuKhoa('GD4313')).toEqual([{ loai: 'MA', tu: 'gd4313' }]);
  });
  it('giữ nguyên ký tự lạ (sẽ được escape khi vào regex); số ngắn là CHU', () => {
    expect(phanTichTuKhoa("o'brien 7")).toEqual([{ loai: 'CHU', tu: "o'brien" }, { loai: 'CHU', tu: '7' }]);
  });
  it('khongDau: hai cách đặt dấu Thủy/Thuỷ cho cùng "thuy"', () => {
    expect(khongDau('THỦY')).toBe('thuy');
    expect(khongDau('THUỶ')).toBe('thuy');
    expect(khongDau('Thủy')).toBe('thuy');
    expect(khongDau('Đào')).toBe('dao');
  });
});

describe('khớp từ khóa', () => {
  it('"nguyen thi" → mọi kết quả có nguyen rồi thi theo thứ tự', async () => {
    const kq = await tim(admin, 'nguyen thi');
    expect(maHs(kq)).toEqual(['H002', 'H004']);
    for (const r of kq.ket_qua) {
      const w = khongDau(r.ho_ten);
      expect(w.indexOf('thi', w.indexOf('nguyen') + 6)).toBeGreaterThan(-1);
    }
    expect(kq.tong).toBe(2);
    expect(kq.gioi_han).toBe(200);
  });
  it('có dấu / hoa thường cũng khớp', async () => {
    expect(maHs(await tim(admin, 'NGUYỄN thị'))).toEqual(['H002', 'H004']);
  });
  it('"thuy 1960" khớp cả Thủy và Thuỷ, không khớp 1961', async () => {
    expect(maHs(await tim(admin, 'thuy 1960')).sort()).toEqual(['H001', 'H006']);
    expect(maHs(await tim(admin, 'Thủy'))).toEqual(['H001', 'H006', 'H007'].sort());
  });
  it('"ng van an" → chỉ H003', async () => {
    expect(maHs(await tim(admin, 'ng van an'))).toEqual(['H003']);
  });
  it('[đổi ngữ nghĩa] khớp chuỗi con theo thứ tự, không còn chỉ đầu từ', async () => {
    expect(maHs(await tim(admin, 'guyen'))).toEqual(['H001', 'H002', 'H003', 'H004']);
    expect(maHs(await tim(admin, 'thi nguyen'))).toEqual([]); // đảo thứ tự → không khớp
    expect(maHs(await tim(admin, 'ng an'))).toEqual(['H001', 'H003', 'H005']); // THỦY·VĂN, VĂN AN, HOÀNG VĂN
  });
  it('4 số cuối CCCD; CCCD có số 0 đầu', async () => {
    expect(maHs(await tim(admin, '4597'))).toEqual(['H001']);
    expect(maHs(await tim(admin, '4567'))).toEqual(['H003']);
    expect(maHs(await tim(admin, '001203'))).toEqual(['H003']);
  });
  it('mã KCB, SĐT, thẻ BHYT (một phần)', async () => {
    expect(maHs(await tim(admin, '002234'))).toEqual(['H002']);
    expect(maHs(await tim(admin, '398765'))).toEqual(['H001']);
    expect(maHs(await tim(admin, '0912'))).toEqual(['H001']);
    expect(maHs(await tim(admin, 'gd4313'))).toEqual(['H001']);
    expect(maHs(await tim(admin, 'GD43131000'))).toEqual(['H001']);
    expect(maHs(await tim(admin, 'gd9999'))).toEqual([]);
  });
  it('nhiều từ khóa AND', async () => {
    expect(maHs(await tim(admin, 'nguyen thuy 4597'))).toEqual(['H001']);
    expect(maHs(await tim(admin, 'nguyen thuy 1975'))).toEqual([]);
    expect(maHs(await tim(admin, 'van gd4313'))).toEqual(['H001']);
  });
  it('ký tự đặc biệt không làm hỏng truy vấn', async () => {
    expect(maHs(await tim(admin, "nguyen'; DROP TABLE ho_so;--"))).toEqual([]);
  });
  it('từ khóa không hợp lệ → 400', async () => {
    for (const q of ['', ' a ', '%', '  ', '\u0001']) expect((await loi(tim(admin, q))).status).toBe(400);
  });
  it('kết quả có đủ trường hồ sơ + buoi + kho_cua', async () => {
    const [r] = (await tim(admin, '4597')).ket_qua;
    expect(r.vi_tri).toBe('buoi');
    expect(r.buoi).toMatchObject({ ma_buoi: 'TN-20260907', don_vi: 'TN', ngay_kham: '2026-09-07', phu_trach: { username: 'ngan' } });
    expect(r.kho_cua).toBeNull();
    expect(r.cls).toBeDefined();
    expect(r.canh_bao).toContain('LECH_NGAY');
  });
});

describe('phạm vi + quyền', () => {
  it('buoi: nhân viên không phụ trách → 403; không tồn tại → 404; thiếu tham số → 400', async () => {
    expect((await loi(tim(ngan, 'van', 'buoi', 'TN-20260908'))).status).toBe(403);
    expect((await loi(tim(ngan, 'van', 'buoi', 'TN-20990101'))).status).toBe(404);
    expect((await loi(tim(ngan, 'van', 'buoi', '999999'))).status).toBe(404);
    expect((await loi(tim(ngan, 'van', 'buoi'))).status).toBe(400);
  });
  it('buoi: chỉ hồ sơ của buổi, không giới hạn (gioi_han=null), theo id hoặc mã', async () => {
    const b = await layBuoiCoQuyen(sql(), admin, 'TN-20260907');
    const a = await tim(ngan, 'van', 'buoi', 'TN-20260907');
    expect(maHs(a)).toEqual(['H001', 'H003']);
    expect(a.gioi_han).toBeNull();
    expect(a.tong).toBe(2);
    expect(maHs(await tim(admin, 'van', 'buoi', String(b.id)))).toEqual(['H001', 'H003']);
  });
  it('cua_toi: nhân viên chỉ thấy buổi mình; admin thấy mọi buổi, không có kho chung', async () => {
    expect(maHs(await tim(ngan, 'van', 'cua_toi'))).toEqual(['H001', 'H003']);
    expect(maHs(await tim(trinh, 'van', 'cua_toi'))).toEqual(['H005']);
    expect(maHs(await tim(admin, 'van', 'cua_toi'))).toEqual(['H001', 'H003', 'H005', 'H007', 'H008'].filter((x) => x !== 'H008'));
  });
  it('cua_toi gồm kho cá nhân của mình; kho cá nhân người khác chỉ admin thấy', async () => {
    await sql()`UPDATE ho_so SET vi_tri = 'kho_ca_nhan', buoi_id = NULL, kho_user_id = ${ngan.id} WHERE ma_ho_so = 'H005'`;
    const n = await tim(ngan, 'hoang', 'cua_toi');
    expect(maHs(n)).toEqual(['H005']);
    expect(n.ket_qua[0]).toMatchObject({ vi_tri: 'kho_ca_nhan', buoi: null, co_quyen_sua: true, kho_cua: { username: 'ngan' } });
    expect(maHs(await tim(trinh, 'hoang', 'cua_toi'))).toEqual([]);
    const t = await tim(trinh, 'hoang', 'tat_ca');
    expect(t.ket_qua[0].co_quyen_sua).toBe(false);
    expect((await tim(admin, 'hoang', 'cua_toi')).ket_qua[0].co_quyen_sua).toBe(true);
  });
  it('kho_chung: chỉ kho chung; chỉ admin có quyền sửa', async () => {
    expect(maHs(await tim(ngan, 'van', 'kho_chung'))).toEqual(['H009']);
    expect((await tim(ngan, 'dinh', 'kho_chung')).ket_qua[0].co_quyen_sua).toBe(false);
    const a = await tim(admin, 'dinh', 'kho_chung');
    expect(a.ket_qua[0]).toMatchObject({ vi_tri: 'kho_chung', buoi: null, kho_cua: null, co_quyen_sua: true });
  });
  it('tat_ca: nhân viên thấy hồ sơ người khác nhưng co_quyen_sua=false; hồ sơ mình true', async () => {
    const kq = await tim(ngan, 'nguyen');
    const m = new Map(kq.ket_qua.map((r) => [r.ma_ho_so, r.co_quyen_sua]));
    expect(m.get('H001')).toBe(true);   // buổi của ngan
    expect(m.get('H003')).toBe(true);
    expect(m.get('H004')).toBe(false);  // buổi của trinh
    expect(m.get('H002')).toBe(true);
    const lk = await tim(ngan, 'thuy', 'tat_ca');
    expect(lk.ket_qua.find((r) => r.ma_ho_so === 'H006')?.co_quyen_sua).toBe(false); // buổi chưa phân công
  });
  it('buổi đã xác nhận (khóa) → co_quyen_sua=false kể cả admin', async () => {
    await sql()`UPDATE buoi_kham SET trang_thai = 'da_xac_nhan' WHERE ma_buoi = 'TN-20260907'`;
    const r = (await tim(admin, '4597')).ket_qua[0];
    expect(r.co_quyen_sua).toBe(false);
    expect((await tim(ngan, '4597')).ket_qua[0].co_quyen_sua).toBe(false);
  });
  it('tat_ca loại hồ sơ vi_tri=an', async () => {
    await sql()`UPDATE ho_so SET vi_tri = 'an', buoi_id = NULL, kho_user_id = NULL WHERE ma_ho_so = 'H0010'`;
    expect(maHs(await tim(admin, 'mai'))).toEqual(['H004']);
    expect(maHs(await tim(admin, '', 'tat_ca', undefined, { vi_tri: 'da_loai' }))).not.toContain('H0010');
  });
  it('sắp xếp: TN, LK trước; hồ sơ không thuộc buổi xếp sau', async () => {
    const kq = await tim(admin, 'van');
    expect(maHs(kq)).toEqual(['H001', 'H003', 'H005', 'H007', 'H009']);
    expect(kq.ket_qua.map((r) => r.vi_tri)).toEqual(['buoi', 'buoi', 'buoi', 'buoi', 'kho_chung']);
  });
});

describe('giới hạn', () => {
  it('tat_ca giới hạn 200 nhưng tong là tổng khớp; buoi không giới hạn', async () => {
    await sql()`INSERT INTO ho_so (ma_ho_so, nguon, ma_kcb, ho_ten, ho_ten_kd, gioi_tinh, nam_sinh, vi_tri, buoi_id, don_vi_goi_y)
      SELECT 'X' || g, 'cowork', 'K' || g, 'TEST NHIEU ' || g, 'test nhieu ' || g, 'Nam', 1990, 'kho_chung', NULL, 'TN'
      FROM generate_series(1, 250) g`;
    const kq = await tim(admin, 'nhieu');
    expect(kq.ket_qua).toHaveLength(200);
    expect(kq.tong).toBe(250);
    expect(kq.gioi_han).toBe(200);
    expect((await tim(admin, 'nhieu', 'kho_chung')).tong).toBe(250);
  });
});

// ---- Phase 9: tìm mờ trong SQL phải giống hệt khopHoSo() của tim-mo.ts ----
describe('tìm mờ: SQL == khopHoSo (JS)', () => {
  const THEM: [string, string, number, string, string][] = [
    ['NGUYỄN HOÀNG ANH', '', 1980, '031180004139', 'GD4313111111'],
    ['ĐẶNG THỊ LẠNH', 'Khám ngày 15/09, nhập nhầm', 1960, '', ''],
    ['PHẠM THỊ NGÂN', 'nhập nhầm ngày', 1962, '', ''],
    ['TRẦN VĂN BÌNH', '', 1970, '', ''],
    ['LÊ THỊ THỦY', 'sao chép kết quả', 1960, '', ''],
    ['ĐỖ THỊ THUỶ', '', 1960, '', ''],
    ['VŨ ANH NGỌC', '', 1985, '', ''],
    ['NGUYỄN THỊ HẰNG', 'ghi nhầm năm sinh', 1990, '', ''],
    ['ĐINH THỊ ANH NGUYỆT', 'anh em ruột', 1975, '', 'HC4797000111'],
    ['HOÀNG ANH', 'thiếu cccd', 2001, '', ''],
    ['TẠ THỊ THANH', 'Nguyễn nhập hộ', 1955, '', ''],
    ['ƯƠNG VĂN SƠN', '', 1948, '', ''],
    ['BÙI THỊ THƠM', 'khám 15/09/2026', 1966, '', ''],
    ['THÁI THANH THẢO', '', 1999, '', ''],
    ['ÂU DƯƠNG ĐẠT', 'GD43 trùng', 1977, '', ''],
    ['NGUYỄN THỊ NGÀ', '', 1960, '', ''],
    ['NGUYỄN THỊ MINH'.normalize('NFD'), 'nhập nhầm'.normalize('NFD'), 1961, '', ''], // chuỗi dạng NFD
    ["O'BRIEN (A) [B]", 'a.b*c+d', 1990, '', ''],
  ];
  const QUERIES = [
    'ng anh', 'anh ng', 'thuy 1960', '1960 thuy', 'nham', 'ngan nham', '4139', 'gd43', 'dang lanh', '15/09', 'th th',
    'gd4313 anh', 'zz9 anh', 'hc4797 anh', 'đ a', 'nguyen 1960 ng', "o'brien", 'a.b*c', '(a) [b]', 'nguyen nhap', 'thi nguyen',
    'guyen', '15/09/2026', '1960', 'ng 1960',
  ];

  beforeEach(async () => {
    for (const [i, [ten, ghiChu, ns, cccd, bhyt]] of THEM.entries()) {
      await sql()`INSERT INTO ho_so (ma_ho_so, nguon, ma_kcb, ho_ten, ho_ten_kd, gioi_tinh, nam_sinh, cccd, so_the_bhyt, ghi_chu, vi_tri, don_vi_goi_y)
        VALUES (${'M' + i}, 'cowork', ${'KCB' + i}, ${ten}, ${khongDau(ten)}, 'Nam', ${ns}, ${cccd}, ${bhyt}, ${ghiChu}, 'kho_chung', 'TN')`;
    }
  });

  it('đủ dữ liệu mẫu (≥ 15 hồ sơ thêm)', () => { expect(THEM.length).toBeGreaterThanOrEqual(15); });

  it.each(QUERIES)('truy vấn %j: tập id SQL == tập id lọc bằng khopHoSo', async (q) => {
    const rows = await sql()<{ id: number; ho_ten: string; ghi_chu: string; nam_sinh: number; cccd: string; ma_kcb: string; so_dt: string; so_the_bhyt: string }[]>`
      SELECT id, ho_ten, ghi_chu, nam_sinh, cccd, ma_kcb, so_dt, so_the_bhyt FROM ho_so WHERE vi_tri <> 'an'`;
    const tk = tachTuKhoa(q);
    const mong = rows.filter((r) => khopHoSo(tk, r).khop).map((r) => r.id).sort((a, b) => a - b);
    const co = (await tim(admin, q)).ket_qua.map((r) => r.id).sort((a, b) => a - b);
    expect(co).toEqual(mong);
  });

  it('các truy vấn tiêu biểu có kết quả (không so sánh rỗng với rỗng)', async () => {
    for (const q of ['ng anh', 'ngan nham', 'dang lanh', '15/09', 'th th', 'nguyen nhap', "o'brien", 'gd4313 anh'])
      expect((await tim(admin, q)).tong, q).toBeGreaterThan(0);
    expect((await tim(admin, 'anh ng')).tong).toBeGreaterThan(0); // "ANH NGỌC"
  });

  it('phạm vi buổi dùng cùng logic', async () => {
    expect(maHs(await tim(ngan, 'ng van', 'buoi', 'TN-20260907'))).toEqual(['H001', 'H003']);
    expect(maHs(await tim(ngan, 'van ng', 'buoi', 'TN-20260907'))).toEqual([]);
  });

  it('token MA không khớp thẻ/mã KCB thì rơi vào họ tên/ghi chú theo đúng thứ tự', async () => {
    expect((await tim(admin, 'gd43 dat')).tong).toBe(0); // gd43 chỉ ở ghi chú, đứng sau họ tên
    expect((await tim(admin, 'dat gd43')).tong).toBeGreaterThan(0); // ÂU DƯƠNG ĐẠT, ghi chú "GD43 trùng"
  });
});

// ---- Phase 9: bộ lọc ----
describe('bộ lọc tìm kiếm', () => {
  const ids = async (loc: BoLoc, q = '') => maHs(await tim(admin, q, 'tat_ca', undefined, loc)).sort();

  it('q rỗng không bộ lọc → 400; q rỗng + bộ lọc → OK', async () => {
    expect((await loi(tim(admin, ''))).status).toBe(400);
    expect((await loi(tim(admin, '', 'tat_ca', undefined, {}))).status).toBe(400);
    expect((await tim(admin, '', 'tat_ca', undefined, { don_vi: 'TN' })).tong).toBe(7);
  });
  it('don_vi: buổi theo đơn vị buổi, kho theo don_vi_goi_y', async () => {
    expect(await ids({ don_vi: 'LK' })).toEqual(['H006', 'H007', 'H008']);
    expect(await ids({ don_vi: 'TN' })).toEqual(['H001', 'H002', 'H003', 'H004', 'H005', 'H009', 'H0010'].sort());
    expect(await ids({ don_vi: 'VK' })).toEqual([]);
  });
  it('ngay', async () => {
    expect(await ids({ ngay: '2026-09-08' })).toEqual(['H004', 'H005']);
  });
  it('cls_<key>=co/khong (kết hợp AND)', async () => {
    expect(await ids({ cls: { ctm: 'co', sieu_am: 'co' } })).toEqual(['H001', 'H002', 'H005', 'H007']);
    expect(await ids({ cls: { ctm: 'khong' }, don_vi: 'LK' })).toEqual(['H006', 'H008']);
  });
  it('xac_nhan', async () => {
    const h = (await sql()<{ id: number; version: number }[]>`SELECT id, version FROM ho_so WHERE ma_ho_so = 'H001'`)[0];
    const { xacNhanHoSo } = await import('@/lib/ra-soat/ho-so');
    await xacNhanHoSo(admin, h.id, h.version, true);
    expect(await ids({ xac_nhan: 'da' })).toEqual(['H001']);
    expect((await ids({ xac_nhan: 'chua' })).includes('H001')).toBe(false);
  });
  it('phu_trach', async () => {
    expect(await ids({ phu_trach: ngan.id })).toEqual(['H001', 'H002', 'H003']);
  });
  it('co_ghi_chu', async () => {
    await sql()`UPDATE ho_so SET ghi_chu = 'nhập nhầm' WHERE ma_ho_so = 'H002'`;
    await sql()`UPDATE ho_so SET ghi_chu = '   ' WHERE ma_ho_so = 'H003'`;
    expect(await ids({ co_ghi_chu: true })).toEqual(['H002']);
    expect((await ids({ co_ghi_chu: false })).includes('H002')).toBe(false);
    expect((await ids({ co_ghi_chu: false })).includes('H003')).toBe(true);
  });
  it('tt_ksk', async () => {
    await sql()`UPDATE ho_so SET co_tt_ksk = 0 WHERE ma_ho_so = 'H003'`;
    expect(await ids({ tt_ksk: 'khong' })).toEqual(['H003']);
    expect((await ids({ tt_ksk: 'co' })).includes('H003')).toBe(false);
  });
  it('nguon: his / them_tay / kho_chung', async () => {
    await sql()`UPDATE ho_so SET nguon = 'them_tay', ma_ho_so = NULL WHERE ma_ho_so = 'H004'`;
    await sql()`UPDATE ho_so SET nhan_tu_kho_chung = TRUE WHERE ma_ho_so = 'H005'`;
    const tt = await sql()<{ id: number }[]>`SELECT id FROM ho_so WHERE nguon = 'them_tay'`;
    const r = await tim(admin, '', 'tat_ca', undefined, { nguon: 'them_tay' });
    expect(r.ket_qua.map((x) => x.id)).toEqual(tt.map((x) => x.id));
    expect(await ids({ nguon: 'kho_chung' })).toEqual(['H005']);
    const his = await ids({ nguon: 'his' });
    expect(his).not.toContain('H005');
    expect(his).toContain('H001');
    expect(his).toHaveLength(8); // 10 hồ sơ − 1 thêm tay − 1 nhận từ kho chung
  });
  it('vi_tri: buoi / kho_ca_nhan / kho_chung / da_loai', async () => {
    await sql()`UPDATE ho_so SET vi_tri = 'kho_ca_nhan', buoi_id = NULL, kho_user_id = ${ngan.id} WHERE ma_ho_so = 'H003'`;
    expect(await ids({ vi_tri: 'kho_ca_nhan' })).toEqual(['H003']);
    expect(await ids({ vi_tri: 'kho_chung' })).toEqual(['H009', 'H0010'].sort());
    expect(await ids({ vi_tri: 'da_loai' })).toEqual(['H003', 'H009', 'H0010'].sort());
    expect(await ids({ vi_tri: 'buoi' })).toHaveLength(7);
  });
  it('q + bộ lọc; quyền co_quyen_sua giữ nguyên; vi_tri=an vẫn bị loại', async () => {
    expect(await ids({ don_vi: 'TN' }, 'van')).toEqual(['H001', 'H003', 'H005', 'H009'].sort());
    const kq = await tim(ngan, '', 'tat_ca', undefined, { don_vi: 'TN' });
    expect(kq.ket_qua.find((r) => r.ma_ho_so === 'H001')?.co_quyen_sua).toBe(true);
    expect(kq.ket_qua.find((r) => r.ma_ho_so === 'H004')?.co_quyen_sua).toBe(false);
    await sql()`UPDATE ho_so SET vi_tri = 'an', buoi_id = NULL, kho_user_id = NULL WHERE ma_ho_so = 'H0010'`;
    expect(await ids({ vi_tri: 'da_loai' })).toEqual(['H009']);
    expect(await ids({ don_vi: 'TN' })).not.toContain('H0010');
  });
});
