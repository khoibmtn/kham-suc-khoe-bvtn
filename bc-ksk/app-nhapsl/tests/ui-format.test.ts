import { describe, expect, it } from 'vitest';
import { NHAN } from '@/lib/cls';
import { parseContentDispositionFilename } from '@/lib/client/api';
import {
  formatChenhLech,
  formatDate,
  formatDateTime,
  formatDateTimeSeconds,
  formatFileSizeKB,
  formatFileSizeMB,
  formatHisTimestamp,
  formatMaViTri,
  formatNguonGocChuyen,
  formatNumber,
  formatPercent,
  formatShortDateTime,
  formatTomTatLichSuNap,
  formatXacNhanGhiGoi,
  getCanhBaoTooltip,
  getDoiTuongNhan,
  getLinkDoiTuongNhatKy,
  getTenDonVi,
  getTruongNhan,
  GIOI_HAN_GOI_WEB_BYTES,
  isTuChoiDoPhienBanCu,
  TEN_FILE_GOI_NAP,
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

  it('formats phase 7 import file sizes, confirmation text, and batch history summary', () => {
    expect(TEN_FILE_GOI_NAP).toEqual([
      'manifest.json',
      'buoi_kham.csv',
      'ho_so.csv',
      'nguoi_dung.csv',
    ]);
    expect(GIOI_HAN_GOI_WEB_BYTES).toBe(Math.round(4.3 * 1024 * 1024));
    expect(formatFileSizeKB(2048)).toBe('2,0 KB');
    expect(formatFileSizeMB(1024 * 1024)).toBe('1,00 MB');

    expect(
      isTuChoiDoPhienBanCu(
        'Phiên bản "v1-20261111-1400" cũ hơn hoặc đã được nạp',
      ),
    ).toBe(true);
    expect(isTuChoiDoPhienBanCu(null)).toBe(false);

    const confirmText = formatXacNhanGhiGoi({
      phien_ban: 'v2-20261112-0800',
      che_do: 'nap_lai',
      tu_choi: null,
      buoi_them: 0,
      ho_so_them_tong: 15,
      user_them: [],
      tong_sau_nap: {
        TN: { so_buoi: 25, so_doan: 5000, ho_so_trong_buoi: 5010 },
        LK: { so_buoi: 31, so_doan: 6000, ho_so_trong_buoi: 6000 },
        VK: { so_buoi: 4, so_doan: 1003, ho_so_trong_buoi: 1003 },
      },
      nap_lai: {
        buoi_them: [],
        buoi_cap_nhat: 1,
        buoi_khong_con_trong_goi: [],
        ho_so_them_moi: 15,
        ho_so_cap_nhat: 42,
        ho_so_cap_nhat_tham_chieu: 10,
        ho_so_giu_do_da_cham: 5,
        ho_so_chuyen_vi_tri: 2,
        ho_so_go_khoi_nguon_an: 3,
        ho_so_go_khoi_nguon_giu: 1,
        ho_so_khong_doi: 11900,
        da_xac_nhan_nguon_doi: [],
        them_tay_trung_goi: [],
        khong_vao_buoi_khoa: 0,
        tong_truoc: {
          TN: { so_buoi: 25, so_doan: 5000, ho_so_trong_buoi: 4995 },
          LK: { so_buoi: 31, so_doan: 6000, ho_so_trong_buoi: 6000 },
          VK: { so_buoi: 4, so_doan: 1003, ho_so_trong_buoi: 1003 },
        },
        tong_sau: {
          TN: { so_buoi: 25, so_doan: 5000, ho_so_trong_buoi: 5010 },
          LK: { so_buoi: 31, so_doan: 6000, ho_so_trong_buoi: 6000 },
          VK: { so_buoi: 4, so_doan: 1003, ho_so_trong_buoi: 1003 },
        },
      },
    });
    expect(confirmText).toBe(
      'Nạp phiên bản v2-20261112-0800 (nạp lại): thêm 15 hồ sơ, cập nhật 42, gỡ 4… Không hoàn tác được.',
    );

    expect(
      formatTomTatLichSuNap('lan_dau', {
        buoi_them: 60,
        ho_so_them: 12354,
        ho_so_them_kho_chung: 351,
        user_them: 9,
      }),
    ).toContain('Thêm 60 buổi · 12.354 hồ sơ');

    expect(
      formatTomTatLichSuNap('nap_lai', {
        ho_so_them_moi: 12,
        ho_so_cap_nhat: 34,
        ho_so_go_khoi_nguon_an: 2,
        ho_so_go_khoi_nguon_giu: 1,
      }),
    ).toContain('Thêm: 12 hồ sơ · Cập nhật: 34');
  });
});
