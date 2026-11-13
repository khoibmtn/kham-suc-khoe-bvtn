import { describe, expect, it } from 'vitest';
import { NHAN } from '@/lib/cls';
import { parseContentDispositionFilename } from '@/lib/client/api';
import {
  formatChenhLech,
  formatDate,
  formatDateTime,
  formatDateTimeSeconds,
  formatDongXemLaiSo,
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
  laySoDtHoSo,
  phanLoaiCanhBaoSoTheoTruong,
  TEN_FILE_GOI_NAP,
  TRANG_THAI_BUOI_NHAN,
} from '@/lib/client/format';
import { tinhTheTongHopTuBuoi } from '@/components/home-buoi-list';
import {
  denToi,
  LOAI_DE_NGHI_NHAN,
  layLoaiDeNghi,
  layNguoiDuyetDeNghi,
  moTaDeNghiChuyenText,
  tenNguoiDuyetDeNghi,
} from '@/components/de-nghi-thong-bao';
import { MUC } from '@/components/huong-dan-noi-dung';
import {
  TOAST_ACTION_DURATION_MS,
  TOAST_DURATION_MS,
} from '@/components/toast';
import {
  formatDemNguocTuDuyet,
  formatPhutTuDuyetPopup,
  moTaCaiDatTuDuyet,
  parseAmBaoStorage,
  urlBase64ToUint8Array,
} from '@/lib/client/am-bao';

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

  it('Phase 10 / T20: âm báo, tự duyệt đếm ngược và hướng dẫn di động', () => {
    expect(parseAmBaoStorage(null)).toBe(true);
    expect(parseAmBaoStorage('')).toBe(true);
    expect(parseAmBaoStorage('1')).toBe(true);
    expect(parseAmBaoStorage('0')).toBe(false);
    expect(parseAmBaoStorage('false')).toBe(false);

    expect(moTaCaiDatTuDuyet(null)).toBe('Tự duyệt đang tắt');
    expect(moTaCaiDatTuDuyet({ che_do: 'tat', sau_phut: 5 })).toBe(
      'Tự duyệt đang tắt',
    );
    expect(moTaCaiDatTuDuyet({ che_do: 'ngay', sau_phut: 5 })).toBe(
      'Đang bật tự duyệt ngay khi có đề nghị',
    );
    expect(moTaCaiDatTuDuyet({ che_do: 'sau_phut', sau_phut: 5 })).toBe(
      'Đang bật tự duyệt sau 5 phút nếu người giữ chưa xử lý',
    );

    const now = Date.parse('2026-11-12T10:00:00Z');
    expect(formatDemNguocTuDuyet('2026-11-12T10:04:35Z', now)).toBe(
      'Tự duyệt sau 04:35',
    );
    expect(formatDemNguocTuDuyet('2026-11-12T09:59:00Z', now)).toBe(
      'Tự duyệt sau 00:00',
    );
    expect(formatDemNguocTuDuyet(null, now)).toBeNull();

    expect(formatPhutTuDuyetPopup('2026-11-12T10:04:35Z', null, now)).toBe(
      'Tự duyệt sau 5 phút',
    );
    expect(formatPhutTuDuyetPopup(null, 5, now)).toBe('Tự duyệt sau 5 phút');

    const bytes = urlBase64ToUint8Array('AQID');
    expect(Array.from(bytes)).toEqual([1, 2, 3]);

    const mucDienThoai = MUC.find(
      (m) => m.id === 'dien-thoai-thong-bao',
    );
    expect(mucDienThoai).toBeDefined();
    expect(mucDienThoai?.tieuDe).toBe('Dùng trên điện thoại & thông báo');
  });

  it('Phase 11 / T22: đề nghị chuyển hai chiều (denToi, fallback trường thiếu, nhãn loại, mô tả)', () => {
    expect(LOAI_DE_NGHI_NHAN.xin_ve).toBe('Xin nhận về');
    expect(LOAI_DE_NGHI_NHAN.gui_di).toBe('Gửi sang');

    // Fallback khi thiếu trường loai hoặc nguoi_duyet
    expect(layLoaiDeNghi({})).toBe('xin_ve');
    expect(layLoaiDeNghi({ loai: 'gui_di' })).toBe('gui_di');

    const ngan = { id: 2, username: 'ngan', ho_ten: 'Ngân' };
    const minh = { id: 3, username: 'minh', ho_ten: 'Minh' };

    const deNghiCuThieuTruong = {
      trang_thai: 'cho_xu_ly' as const,
      nguoi_de_nghi: ngan,
      ho_so: {
        id: 101,
        ho_ten: 'Nguyễn Văn A',
        nam_sinh: 1960,
        cccd: '',
        ma_kcb: 'KCB01',
      },
      tu_buoi: { ma_buoi: '20260401-S-TN', phu_trach: minh },
      den_buoi: { id: 20, ma_buoi: '20260402-S-TN', phu_trach: ngan },
    };

    expect(layNguoiDuyetDeNghi(deNghiCuThieuTruong)).toEqual(minh);
    expect(tenNguoiDuyetDeNghi(deNghiCuThieuTruong)).toBe('Minh');
    expect(denToi(deNghiCuThieuTruong, 3, false)).toBe(true); // Minh duyệt
    expect(denToi(deNghiCuThieuTruong, 2, false)).toBe(false); // Ngân tự tạo
    expect(denToi(deNghiCuThieuTruong, 1, true)).toBe(true); // Admin duyệt được tất cả
    expect(moTaDeNghiChuyenText(deNghiCuThieuTruong, 3, false)).toBe(
      'Ngân xin nhận hồ sơ Nguyễn Văn A (1960) từ buổi 20260401-S-TN về buổi 20260402-S-TN (của Ngân)',
    );

    // Đề nghị gửi đi (gui_di): Ngân gửi hồ sơ từ buổi A sang buổi B của Minh
    const deNghiGuiDi = {
      trang_thai: 'cho_xu_ly' as const,
      loai: 'gui_di' as const,
      nguoi_de_nghi: ngan,
      nguoi_duyet: minh,
      ho_so: {
        id: 102,
        ho_ten: 'Trần Thị B',
        nam_sinh: 1955,
        cccd: '',
        ma_kcb: 'KCB02',
      },
      tu_buoi: { ma_buoi: '20260401-S-TN', phu_trach: ngan },
      den_buoi: { id: 21, ma_buoi: '20260403-S-LK', phu_trach: minh },
    };

    expect(denToi(deNghiGuiDi, 3, false)).toBe(true); // Minh (người nhận) trực tiếp duyệt
    expect(denToi(deNghiGuiDi, 2, false)).toBe(false); // Ngân tự gửi
    expect(denToi(deNghiGuiDi, 1, true)).toBe(true); // Admin duyệt được
    expect(denToi({ ...deNghiGuiDi, trang_thai: 'dong_y' }, 3, false)).toBe(false);

    // Minh (người nhận) xem: "sang buổi B của bạn"
    expect(moTaDeNghiChuyenText(deNghiGuiDi, 3, false)).toBe(
      'Ngân muốn gửi hồ sơ Trần Thị B (1955) từ buổi 20260401-S-TN (của Ngân) sang buổi 20260403-S-LK của bạn',
    );
    // Admin xem: "sang buổi B của Minh"
    expect(moTaDeNghiChuyenText(deNghiGuiDi, 1, true)).toBe(
      'Ngân muốn gửi hồ sơ Trần Thị B (1955) từ buổi 20260401-S-TN (của Ngân) sang buổi 20260403-S-LK của Minh',
    );

    const mucTimKiem = MUC.find((m) => m.id === 'tim-toan-app');
    expect(mucTimKiem?.tieuDe).toContain('hai chiều');
  });

  it('Phase 12 / T24: phân loại cảnh báo số theo trường, dòng Xem lại và hướng dẫn kiểm số', () => {
    expect(getTruongNhan('so_dt')).toBe('SĐT');
    expect(laySoDtHoSo({ so_dt: '0' })).toBe('');
    expect(laySoDtHoSo({ so_dt: '0912.345.678' })).toBe('0912345678');

    const cb = [
      'Mã KCB có dạng số CCCD',
      'CCCD ứng với năm sinh 1959, hồ sơ ghi 1994',
      'SĐT di động phải 10 số, bắt đầu bằng 03/05/07/08/09',
    ];
    expect(phanLoaiCanhBaoSoTheoTruong(cb)).toEqual({
      ma_kcb: ['Mã KCB có dạng số CCCD'],
      cccd: ['CCCD ứng với năm sinh 1959, hồ sơ ghi 1994'],
      so_dt: ['SĐT di động phải 10 số, bắt đầu bằng 03/05/07/08/09'],
    });
    expect(formatDongXemLaiSo(cb)).toBe(
      '⚠ Xem lại: Mã KCB có dạng số CCCD; CCCD ứng với năm sinh 1959, hồ sơ ghi 1994; SĐT di động phải 10 số, bắt đầu bằng 03/05/07/08/09',
    );
    expect(formatDongXemLaiSo([])).toBe('');

    const mucKiemSo = MUC.find((m) => m.id === 'kiem-tra-so');
    expect(mucKiemSo).toBeDefined();
    expect(mucKiemSo?.tieuDe).toBe('Kiểm tra số CCCD, mã KCB, SĐT');
  });
});
