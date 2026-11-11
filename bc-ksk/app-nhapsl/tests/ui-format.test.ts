import { describe, expect, it } from 'vitest';
import { NHAN } from '@/lib/cls';
import {
  formatDate,
  formatDateTime,
  formatHisTimestamp,
  formatMaViTri,
  formatNguonGocChuyen,
  formatNumber,
  formatPercent,
  getCanhBaoTooltip,
  getTenDonVi,
  getTruongNhan,
  TRANG_THAI_BUOI_NHAN,
} from '@/lib/client/format';

describe('UI client format helpers', () => {
  it('formats Vietnamese numbers with dot thousands separator', () => {
    expect(formatNumber(12003)).toBe('12.003');
    expect(formatNumber(0)).toBe('0');
    expect(formatNumber(null)).toBe('0');
  });

  it('formats percentage with 1 decimal and comma separator', () => {
    expect(formatPercent(0)).toBe('0,0%');
    expect(formatPercent(12.5)).toBe('12,5%');
    expect(formatPercent(100)).toBe('100,0%');
  });

  it('formats yyyy-mm-dd to dd/mm/yyyy', () => {
    expect(formatDate('2026-09-07')).toBe('07/09/2026');
    expect(formatDate('07/09/2026')).toBe('07/09/2026');
    expect(formatDate('')).toBe('—');
  });

  it('formats timestamps and short HIS timestamp', () => {
    expect(formatDateTime('14/09/2026 09:15')).toBe('14/09/2026 09:15');
    expect(formatDateTime('2026-09-14 09:15:00')).toBe('14/09/2026 09:15');
    expect(formatHisTimestamp('14/09/2026 09:15')).toBe('14/09 09:15');
  });

  it('maps status, unit, and field labels accurately including NHAN constants', () => {
    expect(TRANG_THAI_BUOI_NHAN.chua_ra_soat).toBe('Chưa rà soát');
    expect(TRANG_THAI_BUOI_NHAN.dang_ra_soat).toBe('Đang rà soát');
    expect(TRANG_THAI_BUOI_NHAN.da_xac_nhan).toBe('Đã xác nhận');
    expect(getTenDonVi('TN')).toBe('Phường Thủy Nguyên');
    expect(getTruongNhan('sieu_am')).toBe('Siêu âm ổ bụng');
    expect(getTruongNhan('ho_ten')).toBe('Họ tên');
    expect(getTruongNhan('so_doan_tong')).toBe(NHAN.SO_DOAN);
    expect(getTruongNhan('co_tt_ksk')).toBe(NHAN.TT_KSK);
  });

  it('formats warning tooltips with cls_ghi_chu for CLS_LECH_NGUON and formats transfer origin', () => {
    expect(getCanhBaoTooltip('CLS_LECH_NGUON', 'Thiếu SA ở bảng TH')).toContain(
      '(Thiếu SA ở bảng TH)',
    );
    expect(formatMaViTri('TN-20260914')).toBe('Buổi TN-20260914');
    expect(
      formatNguonGocChuyen(
        {
          tu: 'TN-20260914',
          boi: { id: 2, username: 'ngan', ho_ten: 'Ngân' },
          luc: '2026-11-11T09:30:00Z',
          ly_do: 'Nhầm ngày',
        },
        'TN',
      ),
    ).toContain('Từ: Buổi TN-20260914 · Người chuyển: Ngân');
  });
});
