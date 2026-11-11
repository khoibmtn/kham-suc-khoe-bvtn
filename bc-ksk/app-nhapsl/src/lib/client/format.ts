import type { TrangThaiBuoi } from '@/lib/api-types';
import { CLS, DON_VI } from '@/lib/cls';

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
  so_doan_tong: 'Sổ đoàn',
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
