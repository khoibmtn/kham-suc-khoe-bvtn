import type { ThongTinChuyen, TrangThaiBuoi } from '@/lib/api-types';
import { CANH_BAO_MO_TA, CANH_BAO_NHAN, CLS, DON_VI, NHAN } from '@/lib/cls';

/**
 * Định dạng số nguyên có dấu chấm ngăn nghìn theo chuẩn vi-VN (ví dụ: 12.003).
 */
export function formatNumber(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(Number(value))) {
    return '0';
  }
  return Number(value).toLocaleString('vi-VN');
}

/**
 * Định dạng phần trăm 1 chữ số thập phân với dấu phẩy (ví dụ: 12,5%).
 */
export function formatPercent(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(Number(value))) {
    return '0,0%';
  }
  return `${Number(value).toLocaleString('vi-VN', {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  })}%`;
}

/**
 * Định dạng ngày 'yyyy-mm-dd' hoặc ISO sang 'dd/mm/yyyy'.
 */
export function formatDate(value: string | null | undefined): string {
  if (!value) return '—';
  const trimmed = value.trim();
  if (!trimmed) return '—';

  // Trường hợp 'yyyy-mm-dd'
  const ymdMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(trimmed);
  if (ymdMatch) {
    return `${ymdMatch[3]}/${ymdMatch[2]}/${ymdMatch[1]}`;
  }

  // Trường hợp đã là 'dd/mm/yyyy'
  if (/^\d{2}\/\d{2}\/\d{4}$/.test(trimmed)) {
    return trimmed;
  }

  const date = new Date(trimmed);
  if (Number.isNaN(date.getTime())) {
    return trimmed;
  }

  const formatter = new Intl.DateTimeFormat('vi-VN', {
    timeZone: 'Asia/Ho_Chi_Minh',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
  return formatter.format(date);
}

/**
 * Định dạng thời điểm ISO hoặc chuỗi sang 'dd/mm/yyyy HH:mm'.
 */
export function formatDateTime(value: string | null | undefined): string {
  if (!value) return '—';
  const trimmed = value.trim();
  if (!trimmed) return '—';

  // Nếu đã ở dạng 'dd/mm/yyyy HH:mm'
  if (/^\d{2}\/\d{2}\/\d{4}\s+\d{2}:\d{2}/.test(trimmed)) {
    return trimmed.slice(0, 16);
  }

  // Nếu ở dạng 'yyyy-mm-dd HH:mm(:ss)'
  const sqlMatch = /^(\d{4})-(\d{2})-(\d{2})[T\s](\d{2}):(\d{2})/.exec(trimmed);
  if (sqlMatch && !trimmed.endsWith('Z') && !/[+-]\d{2}:?\d{2}$/.test(trimmed)) {
    return `${sqlMatch[3]}/${sqlMatch[2]}/${sqlMatch[1]} ${sqlMatch[4]}:${sqlMatch[5]}`;
  }

  const date = new Date(trimmed);
  if (Number.isNaN(date.getTime())) {
    return trimmed;
  }

  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Ho_Chi_Minh',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(date);

  const map: Record<string, string> = {};
  for (const part of parts) {
    map[part.type] = part.value;
  }
  return `${map.day}/${map.month}/${map.year} ${map.hour}:${map.minute}`;
}

/**
 * Định dạng thời điểm ISO hoặc chuỗi sang 'dd/mm/yyyy HH:mm:ss' (dùng cho bảng Nhật ký).
 */
export function formatDateTimeSeconds(value: string | null | undefined): string {
  if (!value) return '—';
  const trimmed = value.trim();
  if (!trimmed) return '—';

  if (/^\d{2}\/\d{2}\/\d{4}\s+\d{2}:\d{2}:\d{2}/.test(trimmed)) {
    return trimmed.slice(0, 19);
  }

  const sqlMatch =
    /^(\d{4})-(\d{2})-(\d{2})[T\s](\d{2}):(\d{2})(?::(\d{2}))?/.exec(trimmed);
  if (sqlMatch && !trimmed.endsWith('Z') && !/[+-]\d{2}:?\d{2}$/.test(trimmed)) {
    const sec = sqlMatch[6] ?? '00';
    return `${sqlMatch[3]}/${sqlMatch[2]}/${sqlMatch[1]} ${sqlMatch[4]}:${sqlMatch[5]}:${sec}`;
  }

  const date = new Date(trimmed);
  if (Number.isNaN(date.getTime())) {
    return trimmed;
  }

  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Ho_Chi_Minh',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).formatToParts(date);

  const map: Record<string, string> = {};
  for (const part of parts) {
    map[part.type] = part.value;
  }
  return `${map.day}/${map.month}/${map.year} ${map.hour}:${map.minute}:${map.second}`;
}

/**
 * Định dạng hoạt động gần nhất 'dd/mm HH:mm', trả về 'chưa đăng nhập' nếu null/rỗng.
 */
export function formatShortDateTime(value: string | null | undefined): string {
  if (!value) return 'chưa đăng nhập';
  const trimmed = value.trim();
  if (!trimmed) return 'chưa đăng nhập';

  const dmyMatch = /^(\d{2})\/(\d{2})(?:\/\d{4})?\s+(\d{2}:\d{2})/.exec(trimmed);
  if (dmyMatch) {
    return `${dmyMatch[1]}/${dmyMatch[2]} ${dmyMatch[3]}`;
  }

  const sqlMatch = /^(\d{4})-(\d{2})-(\d{2})[T\s](\d{2}):(\d{2})/.exec(trimmed);
  if (sqlMatch && !trimmed.endsWith('Z') && !/[+-]\d{2}:?\d{2}$/.test(trimmed)) {
    return `${sqlMatch[3]}/${sqlMatch[2]} ${sqlMatch[4]}:${sqlMatch[5]}`;
  }

  const date = new Date(trimmed);
  if (Number.isNaN(date.getTime())) {
    return trimmed;
  }

  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Ho_Chi_Minh',
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(date);

  const map: Record<string, string> = {};
  for (const part of parts) {
    map[part.type] = part.value;
  }
  return `${map.day}/${map.month} ${map.hour}:${map.minute}`;
}

/**
 * Định dạng chênh lệch có dấu (+N / -N / 0) với dấu chấm ngăn nghìn.
 */
export function formatChenhLech(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(Number(value))) {
    return '0';
  }
  const n = Number(value);
  if (n > 0) return `+${formatNumber(n)}`;
  if (n < 0) return `-${formatNumber(Math.abs(n))}`;
  return '0';
}

/**
 * Rút gọn ngày giờ ĐK HIS để hiển thị gọn trên dòng phụ:
 * Ví dụ '14/09/2026 09:15' -> '14/09 09:15', '2026-09-14 09:15' -> '14/09 09:15'.
 */
export function formatHisTimestamp(value: string | null | undefined): string {
  if (!value) return '';
  const trimmed = value.trim();
  if (!trimmed) return '';

  const dmyMatch = /^(\d{2})\/(\d{2})\/\d{4}\s+(\d{2}:\d{2})/.exec(trimmed);
  if (dmyMatch) {
    return `${dmyMatch[1]}/${dmyMatch[2]} ${dmyMatch[3]}`;
  }

  const ymdMatch = /^(\d{4})-(\d{2})-(\d{2})\s+(\d{2}:\d{2})/.exec(trimmed);
  if (ymdMatch) {
    return `${ymdMatch[3]}/${ymdMatch[2]} ${ymdMatch[4]}`;
  }

  return trimmed;
}

export const TRANG_THAI_BUOI_NHAN: Record<TrangThaiBuoi, string> = {
  chua_ra_soat: 'Chưa rà soát',
  dang_ra_soat: 'Đang rà soát',
  da_xac_nhan: 'Đã xác nhận',
};

const clsLabelMap: Record<string, string> = {};
for (const c of CLS) {
  clsLabelMap[c.key] = c.nhan;
  clsLabelMap[c.col] = c.nhan;
  clsLabelMap[c.csv] = c.nhan;
}

export const TRUONG_NHAN: Record<string, string> = {
  ...clsLabelMap,
  ma_kcb: 'Mã KCB',
  ho_ten: 'Họ tên',
  gioi_tinh: 'Giới tính',
  nam_sinh: 'Năm sinh',
  cccd: 'CCCD',
  dia_chi_chi_tiet: 'Địa chỉ chi tiết',
  ghi_chu: 'Ghi chú',
  da_xac_nhan: 'Xác nhận hồ sơ giấy',
  phu_trach_user_id: 'Người phụ trách',
  diem_kham: 'Điểm khám',
  doan_kham: 'Đoàn khám',
  so_doan_tong: NHAN.SO_DOAN,
  co_tt_ksk: NHAN.TT_KSK,
  vi_tri: 'Vị trí',
  giai_trinh: 'Giải trình',
  ho_so_id: 'Hồ sơ',
  role: 'Vai trò',
  active: 'Trạng thái tài khoản',
  trang_thai: 'Trạng thái buổi',
};

export function getTruongNhan(truong: string | null | undefined): string {
  if (!truong) return '';
  return TRUONG_NHAN[truong] ?? truong;
}

export function getTenDonVi(donVi: string): string {
  if (donVi in DON_VI) {
    return DON_VI[donVi as keyof typeof DON_VI];
  }
  return donVi;
}

/**
 * Tooltip/mô tả đầy đủ cho mã cảnh báo.
 * Riêng CLS_LECH_NGUON nối thêm cls_ghi_chu của hồ sơ nếu có.
 */
export function getCanhBaoTooltip(
  code: string,
  clsGhiChu?: string | null,
): string {
  const moTa = CANH_BAO_MO_TA[code] ?? CANH_BAO_NHAN[code] ?? code;
  if (code === 'CLS_LECH_NGUON' && clsGhiChu && clsGhiChu.trim()) {
    return `${moTa} (${clsGhiChu.trim()})`;
  }
  return moTa;
}

export function formatMaViTri(raw: string | null | undefined): string {
  if (!raw) return '—';
  const trimmed = raw.trim();
  if (!trimmed) return '—';
  if (trimmed === 'kho_chung') return 'Kho chờ chung';
  if (trimmed.startsWith('kho_ca_nhan:')) {
    const u = trimmed.slice('kho_ca_nhan:'.length);
    return u ? `Kho cá nhân (${u})` : 'Kho cá nhân';
  }
  if (trimmed === 'kho_ca_nhan') return 'Kho cá nhân';
  return `Buổi ${trimmed}`;
}

export function formatNguonGocChuyen(
  chuyen: ThongTinChuyen | undefined,
  donViGoiY?: string,
): string {
  if (!chuyen || (!chuyen.tu && !chuyen.boi && !chuyen.luc && !chuyen.ly_do)) {
    return donViGoiY
      ? `Gói dữ liệu gốc (gợi ý: ${donViGoiY})`
      : 'Gói dữ liệu gốc';
  }
  const parts: string[] = [];
  if (chuyen.tu) {
    parts.push(`Từ: ${formatMaViTri(chuyen.tu)}`);
  }
  if (chuyen.boi) {
    parts.push(`Người chuyển: ${chuyen.boi.ho_ten}`);
  }
  if (chuyen.luc) {
    parts.push(`Lúc: ${formatDateTime(chuyen.luc)}`);
  }
  if (chuyen.ly_do && chuyen.ly_do.trim()) {
    parts.push(`Lý do: ${chuyen.ly_do.trim()}`);
  }
  return parts.join(' · ');
}

export const DOI_TUONG_NHAT_KY_NHAN: Record<string, string> = {
  ho_so: 'Hồ sơ',
  buoi_kham: 'Buổi khám',
  user: 'Người dùng',
  auth: 'Đăng nhập',
  import: 'Nạp dữ liệu',
  de_nghi_chuyen: 'Đề nghị chuyển',
  export: 'Xuất dữ liệu',
};

export function getDoiTuongNhan(doiTuong: string | null | undefined): string {
  if (!doiTuong) return '—';
  return DOI_TUONG_NHAT_KY_NHAN[doiTuong] ?? doiTuong;
}

const MA_BUOI_REGEX = /\b((?:TN|LK|VK)-\d{8})\b/;

export function getLinkDoiTuongNhatKy(row: {
  doi_tuong: string;
  doi_tuong_id: string | null;
  mo_ta_doi_tuong: string;
  gia_tri_cu?: string | null;
  gia_tri_moi?: string | null;
  ghi_chu?: string | null;
}): string | null {
  const candidates = [
    row.mo_ta_doi_tuong,
    row.gia_tri_moi ?? '',
    row.gia_tri_cu ?? '',
    row.ghi_chu ?? '',
  ];
  let maBuoi: string | null = null;
  for (const text of candidates) {
    const m = MA_BUOI_REGEX.exec(text);
    if (m) {
      maBuoi = m[1];
      break;
    }
  }
  if (!maBuoi) return null;

  if (row.doi_tuong === 'buoi_kham') {
    return `/ra-soat/${encodeURIComponent(maBuoi)}`;
  }

  if (row.doi_tuong === 'ho_so') {
    const idTrimmed = row.doi_tuong_id?.trim();
    if (idTrimmed && /^\d+$/.test(idTrimmed)) {
      return `/ra-soat/${encodeURIComponent(maBuoi)}?chon=${encodeURIComponent(idTrimmed)}`;
    }
    return `/ra-soat/${encodeURIComponent(maBuoi)}`;
  }

  return null;
}
