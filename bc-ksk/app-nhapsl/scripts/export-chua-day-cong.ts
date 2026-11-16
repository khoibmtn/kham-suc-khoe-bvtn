// npm run export:chua-day-cong — xuất danh sách hồ sơ ĐÃ XÁC NHẬN trong buổi nhưng CHƯA có trong DS đẩy cổng
// (co_tt_ksk = 0), gồm cả hồ sơ thêm tay. Chỉ ĐỌC CSDL. Ghi 1 file Excel vào handoff/export/<YYYYMMDD-HHMM>-chua-day-cong/.
// Không in họ tên/CCCD ra console — chỉ in số đếm.
import './_env';
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import ExcelJS from 'exceljs';
import { closeDb, getSql } from '@/db/client';
import { CLS, DON_VI, type DonVi } from '@/lib/cls';

const n = (x: number) => String(x).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
const THU_TU: DonVi[] = ['TN', 'LK', 'VK'];

type Dong = {
  id: number; don_vi: DonVi; ngay: string; ngay_iso: string; ma_buoi: string; diem_kham: string;
  nguon: 'cowork' | 'them_tay'; nhan_tu_kho_chung: boolean; ma_kcb: string; ho_ten: string; gioi_tinh: string;
  nam_sinh: number; cccd: string; so_the_bhyt: string; so_dt: string; dia_chi_chi_tiet: string; dia_chi_the: string;
  so_ksk: string; ket_luan_phan_loai: string; ghi_chu: string; canh_bao_so: string[] | null;
  nguoi_xac_nhan: string | null; cccd_da_day_o: string | null; so_cccd_trong_ds: number;
} & Record<string, unknown>;

function nguonNhan(d: Dong): string {
  if (d.nguon === 'them_tay') return 'Thêm tay (không có trong DS google sheet và HIS)';
  if (d.nhan_tu_kho_chung) return 'HIS – nhận từ kho chung';
  return 'HIS';
}

function kiemTra(d: Dong): string {
  const v: string[] = [];
  if (!d.cccd) v.push('Thiếu CCCD');
  else if (!/^\d{12}$/.test(d.cccd)) v.push('CCCD không đủ 12 số');
  if (d.so_cccd_trong_ds > 1) v.push('CCCD trùng trong danh sách này');
  if (d.cccd_da_day_o) v.push(`CCCD đã có trong DS đẩy cổng (${d.cccd_da_day_o})`);
  for (const c of d.canh_bao_so ?? []) v.push(c);
  return v.join('; ');
}

const COT = [
  { header: 'STT', key: 'stt', width: 6 },
  { header: 'Đơn vị', key: 'don_vi', width: 20 },
  { header: 'Ngày khám', key: 'ngay', width: 12 },
  { header: 'Mã buổi', key: 'ma_buoi', width: 14 },
  { header: 'Điểm khám', key: 'diem_kham', width: 22 },
  { header: 'Nguồn hồ sơ', key: 'nguon', width: 24 },
  { header: 'Mã KCB', key: 'ma_kcb', width: 13 },
  { header: 'Họ tên', key: 'ho_ten', width: 26 },
  { header: 'Giới', key: 'gioi_tinh', width: 6 },
  { header: 'Năm sinh', key: 'nam_sinh', width: 9 },
  { header: 'CCCD', key: 'cccd', width: 15 },
  { header: 'Số thẻ BHYT', key: 'so_the_bhyt', width: 17 },
  { header: 'SĐT', key: 'so_dt', width: 12 },
  { header: 'Địa chỉ chi tiết', key: 'dia_chi_chi_tiet', width: 26 },
  { header: 'Địa chỉ thẻ', key: 'dia_chi_the', width: 30 },
  ...CLS.map((c) => ({ header: c.ngan, key: c.col as string, width: 6 })),
  { header: 'Số KSK', key: 'so_ksk', width: 10 },
  { header: 'Phân loại', key: 'ket_luan_phan_loai', width: 9 },
  { header: 'Ghi chú rà soát', key: 'ghi_chu', width: 30 },
  { header: 'Cần kiểm tra trước khi đẩy', key: 'kiem_tra', width: 40 },
  { header: 'Người xác nhận', key: 'nguoi_xac_nhan', width: 20 },
];

function themSheetDanhSach(wb: ExcelJS.Workbook, ten: string, ds: Dong[]) {
  const ws = wb.addWorksheet(ten, { views: [{ state: 'frozen', ySplit: 1 }] });
  ws.columns = COT;
  ds.forEach((d, i) => {
    ws.addRow({
      stt: i + 1, don_vi: DON_VI[d.don_vi], ngay: d.ngay, ma_buoi: d.ma_buoi, diem_kham: d.diem_kham, nguon: nguonNhan(d),
      ma_kcb: d.ma_kcb, ho_ten: d.ho_ten, gioi_tinh: d.gioi_tinh, nam_sinh: d.nam_sinh, cccd: d.cccd,
      so_the_bhyt: d.so_the_bhyt, so_dt: d.so_dt, dia_chi_chi_tiet: d.dia_chi_chi_tiet, dia_chi_the: d.dia_chi_the,
      ...Object.fromEntries(CLS.map((c) => [c.col, Number(d[c.col]) === 1 ? 1 : ''])),
      so_ksk: d.so_ksk, ket_luan_phan_loai: d.ket_luan_phan_loai, ghi_chu: d.ghi_chu, kiem_tra: kiemTra(d),
      nguoi_xac_nhan: d.nguoi_xac_nhan ?? '',
    });
  });
  // Mã KCB, CCCD, BHYT, SĐT là chuỗi — giữ số 0 đầu.
  for (const k of ['ma_kcb', 'cccd', 'so_the_bhyt', 'so_dt']) ws.getColumn(k).numFmt = '@';
  const h = ws.getRow(1);
  h.font = { bold: true }; h.alignment = { vertical: 'middle', wrapText: true }; h.height = 30;
  h.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE8EEF6' } };
  ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: COT.length } };
}

async function main() {
  const sql = getSql();
  const cls = CLS.map((c) => `h.${c.col}`).join(', ');
  const rows = await sql.unsafe<Dong[]>(
    `WITH ds AS (
       SELECT h.*, b.don_vi, b.ngay_kham, b.ma_buoi, b.diem_kham
       FROM ho_so h JOIN buoi_kham b ON b.id = h.buoi_id
       WHERE h.vi_tri = 'buoi' AND h.da_xac_nhan AND h.co_tt_ksk = 0
     )
     SELECT ds.id, ds.don_vi, to_char(ds.ngay_kham, 'DD/MM/YYYY') AS ngay, ds.ngay_kham::text AS ngay_iso, ds.ma_buoi, ds.diem_kham,
            ds.nguon, ds.nhan_tu_kho_chung, ds.ma_kcb, ds.ho_ten, ds.gioi_tinh, ds.nam_sinh, ds.cccd, ds.so_the_bhyt, ds.so_dt,
            ds.dia_chi_chi_tiet, ds.dia_chi_the, ${cls.replace(/h\./g, 'ds.')}, ds.so_ksk, ds.ket_luan_phan_loai, ds.ghi_chu,
            ds.canh_bao_so, xn.ho_ten AS nguoi_xac_nhan,
            (SELECT string_agg(DISTINCT b2.ma_buoi, ', ') FROM ho_so h2 JOIN buoi_kham b2 ON b2.id = h2.buoi_id
              WHERE ds.cccd <> '' AND h2.cccd = ds.cccd AND h2.co_tt_ksk = 1 AND h2.vi_tri = 'buoi') AS cccd_da_day_o,
            (CASE WHEN ds.cccd = '' THEN 1 ELSE count(*) OVER (PARTITION BY NULLIF(ds.cccd, '')) END)::int AS so_cccd_trong_ds
     FROM ds LEFT JOIN users xn ON xn.id = ds.xac_nhan_by
     ORDER BY CASE ds.don_vi WHEN 'TN' THEN 0 WHEN 'LK' THEN 1 ELSE 2 END, ds.ngay_kham, ds.ma_kcb, ds.id`,
  );
  // Đối chiếu tổng với số trên trang thống kê.
  const [tk] = await sql<{ xn: number; co: number; chua_xn: number }[]>`
    SELECT (count(*) FILTER (WHERE da_xac_nhan))::int AS xn,
           (count(*) FILTER (WHERE da_xac_nhan AND co_tt_ksk = 1))::int AS co,
           (count(*) FILTER (WHERE NOT da_xac_nhan))::int AS chua_xn
    FROM ho_so WHERE vi_tri = 'buoi'`;

  const wb = new ExcelJS.Workbook();
  wb.creator = 'App rà soát KSK 2026';
  const tom = wb.addWorksheet('Tổng hợp');
  tom.columns = [
    { header: 'Đơn vị', key: 'dv', width: 22 }, { header: 'Ngày khám', key: 'ngay', width: 12 },
    { header: 'Mã buổi', key: 'mb', width: 14 }, { header: 'Từ HIS', key: 'his', width: 9 },
    { header: 'Thêm tay', key: 'tay', width: 10 }, { header: 'Cộng', key: 'cong', width: 9 },
    { header: 'Cần kiểm tra', key: 'kt', width: 13 },
  ];
  const tongDv: Record<string, { his: number; tay: number; kt: number }> = {};
  for (const dv of THU_TU) {
    const theoBuoi = new Map<string, Dong[]>();
    for (const d of rows.filter((r) => r.don_vi === dv)) {
      const k = `${d.ngay_iso}|${d.ma_buoi}`;
      if (!theoBuoi.has(k)) theoBuoi.set(k, []);
      theoBuoi.get(k)!.push(d);
    }
    const t = { his: 0, tay: 0, kt: 0 };
    for (const ds of theoBuoi.values()) {
      const his = ds.filter((d) => d.nguon === 'cowork').length, tay = ds.length - his, kt = ds.filter((d) => kiemTra(d)).length;
      t.his += his; t.tay += tay; t.kt += kt;
      tom.addRow({ dv: DON_VI[dv], ngay: ds[0].ngay, mb: ds[0].ma_buoi, his, tay, cong: ds.length, kt });
    }
    const r = tom.addRow({ dv: `Cộng ${DON_VI[dv]}`, his: t.his, tay: t.tay, cong: t.his + t.tay, kt: t.kt });
    r.font = { bold: true };
    r.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF2F2F2' } };
    tongDv[dv] = t;
  }
  const all = THU_TU.reduce((s, dv) => ({ his: s.his + tongDv[dv].his, tay: s.tay + tongDv[dv].tay, kt: s.kt + tongDv[dv].kt }), { his: 0, tay: 0, kt: 0 });
  const rc = tom.addRow({ dv: 'TỔNG CỘNG', his: all.his, tay: all.tay, cong: all.his + all.tay, kt: all.kt });
  rc.font = { bold: true };
  tom.addRow({});
  tom.addRow({ dv: `Đối chiếu: ${n(tk.xn)} hồ sơ đã xác nhận − ${n(tk.co)} có trong DS đẩy cổng = ${n(tk.xn - tk.co)} hồ sơ chưa đẩy.` });
  tom.addRow({ dv: `Hồ sơ trong buổi chưa xác nhận: ${n(tk.chua_xn)}.` });
  tom.getRow(1).font = { bold: true };
  tom.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE8EEF6' } };
  tom.views = [{ state: 'frozen', ySplit: 1 }];

  themSheetDanhSach(wb, 'Tất cả', rows);
  for (const dv of THU_TU) themSheetDanhSach(wb, DON_VI[dv], rows.filter((r) => r.don_vi === dv));

  const now = new Date(Date.now() + 7 * 3600e3).toISOString(); // giờ Việt Nam
  const stamp = `${now.slice(0, 10).replace(/-/g, '')}-${now.slice(11, 16).replace(':', '')}`;
  const dir = path.join('handoff', 'export', `${stamp}-chua-day-cong`);
  mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `DS-chua-day-cong-${stamp}.xlsx`);
  await wb.xlsx.writeFile(file);

  console.log(`Đã xuất ${n(rows.length)} hồ sơ → ${file}`);
  for (const dv of THU_TU) console.log(`  ${dv}: HIS ${n(tongDv[dv].his)}, thêm tay ${n(tongDv[dv].tay)}, cần kiểm tra ${n(tongDv[dv].kt)}`);
  console.log(`Đối chiếu: xác nhận ${n(tk.xn)} − có DS đẩy cổng ${n(tk.co)} = ${n(tk.xn - tk.co)}; chưa xác nhận ${n(tk.chua_xn)}`);
}
main()
  .catch((e) => { console.error(e instanceof Error ? e.message : String(e)); process.exit(1); })
  .finally(closeDb);
