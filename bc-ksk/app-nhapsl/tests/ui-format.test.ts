import { describe, expect, it } from 'vitest';
import { NHAN } from '@/lib/cls';
import { parseContentDispositionFilename } from '@/lib/client/api';
import {
  formatChenhLech,
  formatDate,
  formatDateTime,
  formatDateTimeSeconds,
  formatHisTimestamp,
  formatMaViTri,
  formatNguonGocChuyen,
  formatNumber,
  formatPercent,
  formatShortDateTime,
  getCanhBaoTooltip,
  getDoiTuongNhan,
  getLinkDoiTuongNhatKy,
  getTenDonVi,
  getTruongNhan,
  TRANG_THAI_BUOI_NHAN,
} from '@/lib/client/format';
import { tinhTheTongHopTuBuoi } from '@/components/home-buoi-list';
import {
  TOAST_ACTION_DURATION_MS,
  TOAST_DURATION_MS,
} from '@/components/toast';

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

  it('formats phase 5-6 timestamps, net difference, audit log links, and toast durations', () => {
    expect(formatDateTimeSeconds('2026-11-11 08:05:09')).toBe(
      '11/11/2026 08:05:09',
    );
    expect(formatShortDateTime(null)).toBe('chưa đăng nhập');
    expect(formatShortDateTime('')).toBe('chưa đăng nhập');
    expect(formatShortDateTime('2026-11-11 14:30:00')).toBe('11/11 14:30');

    expect(formatChenhLech(68)).toBe('+68');
    expect(formatChenhLech(-12)).toBe('-12');
    expect(formatChenhLech(0)).toBe('0');

    expect(getDoiTuongNhan('ho_so')).toBe('Hồ sơ');
    expect(getDoiTuongNhan('buoi_kham')).toBe('Buổi khám');
    expect(getDoiTuongNhan('auth')).toBe('Đăng nhập');

    expect(
      getLinkDoiTuongNhatKy({
        doi_tuong: 'buoi_kham',
        doi_tuong_id: '1',
        mo_ta_doi_tuong: 'TN-20260907',
      }),
    ).toBe('/ra-soat/TN-20260907');

    expect(
      getLinkDoiTuongNhatKy({
        doi_tuong: 'ho_so',
        doi_tuong_id: '7148',
        mo_ta_doi_tuong: 'Hồ sơ #7148 (H2600128319)',
        gia_tri_moi: 'TN-20260907',
      }),
    ).toBe('/ra-soat/TN-20260907?chon=7148');

    expect(
      parseContentDispositionFilename(
        'attachment; filename="bao-cao-ksk-20261111-1530.xlsx"',
        'fallback.xlsx',
      ),
    ).toBe('bao-cao-ksk-20261111-1530.xlsx');

    expect(TOAST_DURATION_MS).toBe(4000);
    expect(TOAST_ACTION_DURATION_MS).toBeGreaterThanOrEqual(10000);

    const the = tinhTheTongHopTuBuoi(
      [
        {
          id: 1,
          ma_buoi: 'TN-20260907',
          don_vi: 'TN',
          ten_don_vi: 'Phường Thủy Nguyên',
          ngay_kham: '2026-09-07',
          diem_kham: '',
          doan_kham: '',
          nv_goi_y: 'ngan',
          so_doan_tong: 81,
          phu_trach: null,
          trang_thai: 'chua_ra_soat',
          xac_nhan_by: null,
          xac_nhan_at: null,
          giai_trinh: null,
          hien_co: 78,
          da_xac_nhan: 10,
          chua_xac_nhan: 68,
          thua: 0,
          thieu: 3,
          bo_sung: 2,
          tien_do: 12.8,
          co_quyen_sua: true,
        },
      ],
      4,
    );
    expect(the.so_buoi).toBe(1);
    expect(the.so_doan).toBe(81);
    expect(the.hien_co).toBe(78);
    expect(the.da_xac_nhan).toBe(10);
    expect(the.chua_xac_nhan).toBe(68);
    expect(the.thieu).toBe(3);
    expect(the.chenh_lech).toBe(-3);
    expect(the.bo_sung).toBe(2);
    expect(the.kho_ca_nhan).toBe(4);
  });
});
