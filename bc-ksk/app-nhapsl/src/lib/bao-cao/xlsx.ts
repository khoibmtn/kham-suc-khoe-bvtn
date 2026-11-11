// Dựng bao_cao.xlsx (docs/01 mục 4.10a).
import ExcelJS from 'exceljs';
import { CLS, DON_VI, NHAN, type DonVi } from '@/lib/cls';
import { THU_TU_DON_VI, tongHopTheoDonVi, type ChiSo, type DuLieuBaoCao } from './du-lieu';
import { ddmmyyyyHHmm, ngayVN } from './thoi-gian';

export type MetaBaoCao = {
  xuatLuc: Date;
  /** Mô tả phạm vi, vd "Toàn bộ 3 đơn vị" / "Buổi do Ngân phụ trách". */
  phamVi: string;
};

const FONT = { name: 'Times New Roman', size: 12 } as const;
const SO = '#,##0';
const SO_DAU = '+#,##0;-#,##0;0';
const TEN_SHEET_DON_VI: Record<DonVi, string> = { TN: 'Thuy Nguyen', LK: 'Luu Kiem', VK: 'Viet Khe' };
const NHAN_TRANG_THAI = { chua_ra_soat: 'Chưa rà soát', dang_ra_soat: 'Đang rà soát', da_xac_nhan: 'Đã xác nhận' } as const;

type Cot = { tieu_de: string; dinh_dang?: string; chu?: boolean };

const COT_CHI_SO: Cot[] = [
  { tieu_de: NHAN.SO_DOAN, dinh_dang: SO },
  { tieu_de: 'Tổng số người khám', dinh_dang: SO },
  ...CLS.map((c) => ({ tieu_de: `Số người được chỉ định ${c.nhan}`, dinh_dang: SO })),
  { tieu_de: `Có trong ${NHAN.TT_KSK}`, dinh_dang: SO },
  { tieu_de: `Không có trong ${NHAN.TT_KSK}`, dinh_dang: SO },
  { tieu_de: `Thừa/thiếu so ${NHAN.SO_DOAN}`, dinh_dang: SO_DAU },
];

const giaTriChiSo = (c: ChiSo): number[] => [
  c.so_doan, c.tong, ...CLS.map((x) => c.cls[x.key]), c.co_ds_day_cong, c.khong_ds_day_cong, c.thua_thieu,
];

function dungSheet(wb: ExcelJS.Workbook, ten: string, cot: Cot[], meta: MetaBaoCao, chiDaXacNhan: boolean) {
  const ws = wb.addWorksheet(ten, { views: [{ state: 'frozen', xSplit: 0, ySplit: 4 }] });
  ws.getCell(1, 1).value = `BÁO CÁO RÀ SOÁT HỒ SƠ KHÁM SỨC KHỎE TOÀN DÂN 2026 — ${ten}`;
  ws.getCell(1, 1).font = { ...FONT, bold: true, size: 14 };
  ws.getCell(2, 1).value =
    `Xuất lúc ${ddmmyyyyHHmm(meta.xuatLuc)} · Phạm vi: ${meta.phamVi} · ${chiDaXacNhan ? 'Chỉ hồ sơ đã xác nhận' : 'Tất cả hồ sơ trong danh sách'}`;
  ws.getCell(2, 1).font = { ...FONT, italic: true };
  const hdr = ws.getRow(4);
  cot.forEach((c, i) => {
    const cell = hdr.getCell(i + 1);
    cell.value = c.tieu_de;
    cell.font = { ...FONT, bold: true };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE7E6E6' } };
    cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
    cell.border = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } };
  });
  return ws;
}

function themDong(ws: ExcelJS.Worksheet, cot: Cot[], values: (string | number | null)[], dam = false) {
  const row = ws.addRow(values);
  cot.forEach((c, i) => {
    const cell = row.getCell(i + 1);
    cell.font = { ...FONT, bold: dam };
    if (c.chu) { cell.numFmt = '@'; if (cell.value !== null && cell.value !== '') cell.value = String(cell.value); }
    else if (c.dinh_dang && typeof cell.value === 'number') cell.numFmt = c.dinh_dang;
  });
  return row;
}

function chinhDoRong(ws: ExcelJS.Worksheet, cot: Cot[]) {
  cot.forEach((c, i) => {
    let max = 6;
    for (let r = 4; r <= ws.rowCount; r++) {
      const v = ws.getRow(r).getCell(i + 1).value;
      if (v === null || v === undefined) continue;
      const s = typeof v === 'number' ? v.toLocaleString('en-US') : String(v);
      // Tiêu đề cột xuống dòng được: tính theo từ dài nhất + một nửa.
      const len = r === 4 ? Math.max(Math.max(...s.split(/\s+/).map((w) => w.length)), Math.ceil(s.length / 2)) : s.length;
      if (len > max) max = len;
    }
    ws.getColumn(i + 1).width = Math.min(45, max + 2);
  });
}

export async function taoBaoCaoXlsx(d: DuLieuBaoCao, meta: MetaBaoCao): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'app-nhapsl';
  wb.created = meta.xuatLuc;
  const { theoDonVi, cong } = tongHopTheoDonVi(d.buoi);

  // --- Tong hop
  {
    const cot: Cot[] = [{ tieu_de: 'Đơn vị', chu: true }, ...COT_CHI_SO];
    const ws = dungSheet(wb, 'Tong hop', cot, meta, d.chiDaXacNhan);
    for (const dv of THU_TU_DON_VI) themDong(ws, cot, [DON_VI[dv], ...giaTriChiSo(theoDonVi[dv])]);
    themDong(ws, cot, ['Cộng', ...giaTriChiSo(cong)], true);
    chinhDoRong(ws, cot);
  }
  // --- Theo buoi
  {
    const cot: Cot[] = [
      { tieu_de: 'Ngày khám', chu: true }, { tieu_de: 'Đơn vị', chu: true }, { tieu_de: 'Điểm khám', chu: true },
      { tieu_de: 'Người phụ trách', chu: true }, { tieu_de: 'Trạng thái danh sách', chu: true }, ...COT_CHI_SO,
    ];
    const ws = dungSheet(wb, 'Theo buoi', cot, meta, d.chiDaXacNhan);
    for (const b of d.buoi) {
      themDong(ws, cot, [ngayVN(b.ngay_kham), DON_VI[b.don_vi], b.diem_kham, b.phu_trach_ho_ten, NHAN_TRANG_THAI[b.trang_thai], ...giaTriChiSo(b.chi_so)]);
    }
    themDong(ws, cot, ['Cộng', '', '', '', '', ...giaTriChiSo(cong)], true);
    chinhDoRong(ws, cot);
  }
  // --- 3 sheet chi tiết
  const cotCT: Cot[] = [
    { tieu_de: 'STT', dinh_dang: '0' }, { tieu_de: 'Ngày khám', chu: true }, { tieu_de: 'Mã KCB', chu: true },
    { tieu_de: 'Họ tên', chu: true }, { tieu_de: 'Giới tính', chu: true }, { tieu_de: 'Năm sinh', dinh_dang: '0' },
    { tieu_de: 'CCCD', chu: true }, { tieu_de: 'Địa chỉ chi tiết', chu: true },
    ...CLS.map((c) => ({ tieu_de: c.nhan, chu: true })),
    { tieu_de: `Có trong ${NHAN.TT_KSK}`, chu: true }, { tieu_de: 'Đã xác nhận', chu: true },
    { tieu_de: 'Người xác nhận', chu: true }, { tieu_de: 'Thời điểm xác nhận', chu: true },
    { tieu_de: 'Nguồn hồ sơ', chu: true }, { tieu_de: 'Ghi chú', chu: true },
  ];
  for (const dv of THU_TU_DON_VI) {
    const ws = dungSheet(wb, TEN_SHEET_DON_VI[dv], cotCT, meta, d.chiDaXacNhan);
    let stt = 0;
    for (const h of d.hoSo) {
      if (h.don_vi !== dv) continue;
      stt++;
      const nguon = h.nguon === 'them_tay' ? 'Thêm tay' : h.nhan_tu_kho_chung ? 'Nhận từ kho chung' : 'HIS';
      themDong(ws, cotCT, [
        stt, ngayVN(h.ngay_kham), h.ma_kcb, h.ho_ten, h.gioi_tinh, h.nam_sinh, h.cccd, h.dia_chi_chi_tiet,
        ...CLS.map((c) => (h.cls[c.key] === 1 ? 'x' : '')),
        h.co_tt_ksk === 1 ? 'Có' : 'Không', h.da_xac_nhan ? 'Có' : 'Không', h.nguoi_xac_nhan, ddmmyyyyHHmm(h.xac_nhan_at),
        nguon, h.ghi_chu,
      ]);
    }
    chinhDoRong(ws, cotCT);
  }
  return Buffer.from(await wb.xlsx.writeBuffer());
}

export const TEN_SHEET = TEN_SHEET_DON_VI;
