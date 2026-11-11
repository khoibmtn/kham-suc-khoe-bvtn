import { createHash } from 'node:crypto';
import ExcelJS from 'exceljs';
import { parse } from 'csv-parse/sync';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { closeDb, getSql } from '@/db/client';
import type { AuthUser } from '@/lib/auth/guard';
import { COT_BUOI, COT_HO_SO, COT_NHAT_KY, taoGoiCowork } from '@/lib/bao-cao/cowork';
import { layDuLieuBaoCao, tongHopTheoDonVi } from '@/lib/bao-cao/du-lieu';
import { taoBaoCaoXlsx } from '@/lib/bao-cao/xlsx';
import { CLS, DON_VI } from '@/lib/cls';
import { parseGoi } from '@/lib/import/goi';
import { apDung } from '@/lib/import/nap';
import { layBuoiCoQuyen } from '@/lib/ra-soat/buoi';
import { nhanVeHoSo } from '@/lib/ra-soat/chuyen';
import { suaHoSo, xacNhanHoSo } from '@/lib/ra-soat/ho-so';
import { phanCong } from '@/lib/ra-soat/phan-cong';
import { themHoSo } from '@/lib/ra-soat/them-ho-so';
import { taoGoiThu } from './helpers/goi-thu';

const URL_TEST = process.env.TEST_DATABASE_URL;
if (!URL_TEST) throw new Error('Thiếu TEST_DATABASE_URL');
if (!/test/i.test(new URL(URL_TEST).pathname)) throw new Error('TEST_DATABASE_URL phải trỏ vào DB có chữ "test"');

const sql = () => getSql();
let admin: AuthUser, ngan: AuthUser, trinh: AuthUser;
const B7 = 'TN-20260907';
const B8 = 'TN-20260908';

async function layUser(username: string): Promise<AuthUser> {
  const [r] = await sql()<AuthUser[]>`SELECT id, username, ho_ten, role, session_version FROM users WHERE username = ${username}`;
  return r;
}
async function hs(ma: string) {
  const [r] = await sql()<{ id: number; version: number }[]>`SELECT id, version FROM ho_so WHERE ma_ho_so = ${ma}`;
  return r;
}
async function xacNhan(u: AuthUser, ma: string) {
  const h = await hs(ma);
  await xacNhanHoSo(u, h.id, h.version, true);
}

beforeAll(async () => { await sql()`SELECT 1 FROM import_batches LIMIT 1`; });
beforeEach(async () => {
  await sql()`TRUNCATE nhat_ky, de_nghi_chuyen, ho_so, buoi_kham, import_batches, users, dang_nhap_that_bai RESTART IDENTITY CASCADE`;
  await apDung(sql(), parseGoi(taoGoiThu().files).goi!, 'cli:test');
  admin = await layUser('admin'); ngan = await layUser('ngan'); trinh = await layUser('trinh');
  await phanCong(admin, [(await layBuoiCoQuyen(sql(), admin, B7)).id], ngan.id);
  await phanCong(admin, [(await layBuoiCoQuyen(sql(), admin, B8)).id], trinh.id);
  // H001,H002,H003 ở B7 (ngan); H004,H005 ở B8 (trinh); H006-8 ở LK (chưa phân công)
  await xacNhan(ngan, 'H001'); await xacNhan(ngan, 'H002');
  await xacNhan(trinh, 'H004');
  // sửa CLS H001 theo giấy (+ cột tên có dấu phẩy/nháy)
  const h1 = await hs('H001');
  await suaHoSo(ngan, h1.id, { version: (await hs('H001')).version, cls: { ctm: 0, glucose: 1, ure: 1, creatinin: 1, got: 1, gpt: 1, tpt_nuoc_tieu: 1, sieu_am: 1 }, ghi_chu: 'Ghi chú, có "nháy"\nxuống dòng' });
  // thêm tay vào B7
  await themHoSo(ngan, B7, { ho_ten: 'THÊM TAY, MỚI', gioi_tinh: 'Nam', nam_sinh: 1960, cccd: '001060000123', cls: { ctm: 1, glucose: 0, ure: 0, creatinin: 0, got: 0, gpt: 0, tpt_nuoc_tieu: 0, sieu_am: 0 }, ly_do_tao_moi: 'thử' });
  // H009 từ kho chung → B8 (nhận từ kho chung) rồi xác nhận
  const h9 = await hs('H009');
  await nhanVeHoSo(trinh, h9.id, { version: h9.version, buoi: B8 });
  await xacNhan(trinh, 'H009');
});
afterAll(async () => { await closeDb(); });

async function docXlsx(buf: Buffer) {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buf as unknown as ArrayBuffer);
  return wb;
}
const meta = { xuatLuc: new Date('2026-11-11T07:30:00Z'), phamVi: 'Thử' };
const DV_SHEET = { TN: 'Thuy Nguyen', LK: 'Luu Kiem', VK: 'Viet Khe' } as const;

function bang(ws: ExcelJS.Worksheet): (string | number | null)[][] {
  const out: (string | number | null)[][] = [];
  for (let r = 5; r <= ws.rowCount; r++) {
    const row = ws.getRow(r);
    const vals: (string | number | null)[] = [];
    for (let c = 1; c <= ws.columnCount; c++) vals.push((row.getCell(c).value as string | number | null) ?? null);
    out.push(vals);
  }
  return out;
}

describe('bao_cao.xlsx', () => {
  for (const chiDaXacNhan of [true, false]) {
    it(`bất biến Tong hop = sheet chi tiết = Theo buoi (chiDaXacNhan=${chiDaXacNhan})`, async () => {
      const du = await layDuLieuBaoCao(sql(), { chiDaXacNhan });
      const wb = await docXlsx(await taoBaoCaoXlsx(du, meta));
      expect(wb.worksheets.map((w) => w.name)).toEqual(['Tong hop', 'Theo buoi', 'Thuy Nguyen', 'Luu Kiem', 'Viet Khe']);
      const th = bang(wb.getWorksheet('Tong hop')!);
      expect(th).toHaveLength(4);
      expect(th.map((r) => r[0])).toEqual([DON_VI.TN, DON_VI.LK, DON_VI.VK, 'Cộng']);
      // cột: 0 đơn vị,1 so_doan,2 tổng,3..10 CLS,11 có,12 không,13 thừa/thiếu
      for (let i = 0; i < 3; i++) {
        const dv = (['TN', 'LK', 'VK'] as const)[i];
        const ct = bang(wb.getWorksheet(DV_SHEET[dv])!);
        expect(ct).toHaveLength(th[i][2] as number);
        CLS.forEach((c, k) => {
          expect(ct.filter((r) => r[8 + k] === 'x').length).toBe(th[i][3 + k]);
        });
        expect(ct.filter((r) => r[16] === 'Có').length).toBe(th[i][11]);
        expect(ct.filter((r) => r[16] === 'Không').length).toBe(th[i][12]);
        expect(th[i][13]).toBe((th[i][2] as number) - (th[i][1] as number));
        if (chiDaXacNhan) expect(ct.every((r) => r[17] === 'Có')).toBe(true);
      }
      for (let c = 1; c <= 13; c++) expect(th[3][c]).toBe((th[0][c] as number) + (th[1][c] as number) + (th[2][c] as number));
      // Theo buoi: cộng theo đơn vị = Tong hop
      const tb = bang(wb.getWorksheet('Theo buoi')!);
      const cuoi = tb[tb.length - 1];
      expect(cuoi[0]).toBe('Cộng');
      const dong = tb.slice(0, -1);
      expect(dong).toHaveLength(3);
      for (const [i, dvTen] of [DON_VI.TN, DON_VI.LK, DON_VI.VK].entries()) {
        for (let c = 1; c <= 13; c++) {
          const tong = dong.filter((r) => r[1] === dvTen).reduce((s, r) => s + (r[4 + c] as number), 0);
          expect(tong).toBe(th[i][c]);
        }
      }
      // định dạng
      const ws = wb.getWorksheet('Tong hop')!;
      expect(ws.getCell('A1').font?.name).toBe('Times New Roman');
      expect(ws.getCell('A4').font?.bold).toBe(true);
      expect(ws.views[0]).toMatchObject({ state: 'frozen', ySplit: 4 });
      expect(ws.getCell('A2').value).toContain('Phạm vi: Thử');
    });
  }

  it('tất cả hồ sơ ≥ chỉ đã xác nhận; CCCD giữ chuỗi có số 0 đầu; nguồn hồ sơ', async () => {
    const daXn = await layDuLieuBaoCao(sql(), { chiDaXacNhan: true });
    const tatCa = await layDuLieuBaoCao(sql(), { chiDaXacNhan: false });
    expect(tatCa.hoSo.length).toBeGreaterThan(daXn.hoSo.length);
    expect(daXn.hoSo.length).toBe(daXn.buoi.reduce((s, b) => s + b.chi_so.tong, 0));
    const wb = await docXlsx(await taoBaoCaoXlsx(tatCa, meta));
    const tn = bang(wb.getWorksheet('Thuy Nguyen')!);
    const tay = tn.find((r) => r[3] === 'THÊM TAY, MỚI')!;
    expect(tay[6]).toBe('001060000123');
    expect(tay[20]).toBe('Thêm tay');
    expect(tn.some((r) => r[20] === 'Nhận từ kho chung')).toBe(true);
    expect(tn.some((r) => r[20] === 'HIS')).toBe(true);
  });

  it('nhân viên chỉ thấy buổi mình phụ trách', async () => {
    const du = await layDuLieuBaoCao(sql(), { chiCuaUserId: ngan.id, chiDaXacNhan: false });
    expect(du.buoi.map((b) => b.ma_buoi)).toEqual([B7]);
    expect(du.hoSo.every((h) => h.ngay_kham === '2026-09-07')).toBe(true);
    const lk = await layDuLieuBaoCao(sql(), { donVi: 'LK', chiDaXacNhan: false });
    expect(lk.buoi.every((b) => b.don_vi === 'LK')).toBe(true);
    const { cong } = tongHopTheoDonVi(du.buoi);
    expect(cong.tong).toBe(du.hoSo.length);
  });
});

describe('gói Cowork', () => {
  it('đủ 5 file, CSV có BOM + đúng cột, manifest sha256 khớp, da_sua_theo_giay đúng', async () => {
    const f = await taoGoiCowork();
    expect(Object.keys(f).sort()).toEqual(['bao_cao.xlsx', 'buoi_kham.csv', 'ho_so.csv', 'manifest.json', 'nhat_ky.csv']);
    for (const t of ['ho_so.csv', 'buoi_kham.csv', 'nhat_ky.csv']) {
      expect([...f[t].subarray(0, 3)]).toEqual([0xef, 0xbb, 0xbf]);
    }
    const doc = (t: string) => parse(f[t].toString('utf8').replace(/^﻿/, ''), { columns: true, skip_empty_lines: true, relax_column_count: false }) as Record<string, string>[];
    const header = (t: string) => f[t].toString('utf8').replace(/^﻿/, '').split('\r\n')[0].split(',');

    expect(COT_HO_SO).toHaveLength(42);
    expect(header('ho_so.csv')).toEqual([...COT_HO_SO]);
    expect(header('buoi_kham.csv')).toEqual([...COT_BUOI]);
    expect(header('nhat_ky.csv')).toEqual([...COT_NHAT_KY]);

    const rows = doc('ho_so.csv');
    const [{ n }] = await sql()<{ n: number }[]>`SELECT count(*)::int AS n FROM ho_so`;
    expect(rows).toHaveLength(n);
    const h1 = rows.find((r) => r.ma_ho_so === 'H001')!;
    expect(h1.cccd).toBe('031066014597');
    expect(h1.da_sua_theo_giay).toBe('1');
    expect(h1.cls_ctm).toBe('0');
    expect(h1.nguon_cls_ctm).toBe('1');
    expect(h1.canh_bao).toBe('NGHI_SAO_CHEP_XN|LECH_NGAY');
    expect(h1.ghi_chu).toBe('Ghi chú, có "nháy"\nxuống dòng');
    expect(h1.ngay_kham).toBe('07/09/2026');
    expect(h1.xac_nhan_boi).toBe('ngan');
    expect(h1.xac_nhan_luc).toMatch(/^\d{4}-\d\d-\d\d \d\d:\d\d:\d\d$/);
    expect(h1.tao_boi).toBe('cowork');
    expect(rows.find((r) => r.ma_ho_so === 'H002')!.da_sua_theo_giay).toBe('0');
    const tay = rows.find((r) => r.ho_ten === 'THÊM TAY, MỚI')!;
    expect(tay.nguon).toBe('them_tay');
    expect(tay.da_sua_theo_giay).toBe('0');
    expect(tay.nguon_cls_ctm).toBe('');
    expect(tay.tao_boi).toBe('ngan');
    expect(tay.cccd).toBe('001060000123');
    const h10 = rows.find((r) => r.ma_ho_so === 'H0010')!;
    expect(h10.vi_tri).toBe('kho_chung');
    expect(h10.ngay_kham).toBe('');
    expect(h10.don_vi).toBe('TN'); // don_vi_goi_y

    const b = doc('buoi_kham.csv');
    expect(b).toHaveLength(3);
    const b7 = b.find((r) => r.ma_buoi === B7)!;
    expect(b7.phu_trach).toBe('ngan');
    expect(b7.ngay_kham).toBe('07/09/2026');
    expect(b7.trang_thai).toBe('dang_ra_soat');
    expect(Number(b7.bo_sung)).toBe(1);

    const nk = doc('nhat_ky.csv');
    expect(nk.length).toBeGreaterThan(5);
    expect(nk.some((r) => r.hanh_dong === 'sua_cls' && r.username === 'ngan')).toBe(true);

    const m = JSON.parse(f['manifest.json'].toString('utf8'));
    expect(m.schema).toBe('nhapsl-export-1');
    expect(m.phien_ban_nhap).toBeTruthy();
    expect(m.so_dong).toEqual({ 'ho_so.csv': n, 'buoi_kham.csv': 3, 'nhat_ky.csv': nk.length });
    for (const t of ['ho_so.csv', 'buoi_kham.csv', 'nhat_ky.csv', 'bao_cao.xlsx']) {
      expect(m.sha256[t]).toBe(createHash('sha256').update(f[t]).digest('hex'));
    }
    expect(m.tong_theo_don_vi.TN.so_buoi).toBe(2);
    expect(m.tong_theo_don_vi.TN.so_doan).toBe(7);
    expect(m.tong_theo_don_vi.TN.da_xac_nhan).toBe(5);
    const wb = await docXlsx(f['bao_cao.xlsx']);
    const th = bang(wb.getWorksheet('Tong hop')!);
    expect(th[0][2]).toBe(m.tong_theo_don_vi.TN.da_xac_nhan);
  });
});
