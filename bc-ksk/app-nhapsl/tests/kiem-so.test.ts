import { describe, expect, it } from 'vitest';
import { kiemTraSo, vanDeKhiSua, coSdt, chiSo } from '@/lib/kiem-so';

const ma = (h: Parameters<typeof kiemTraSo>[0]) => kiemTraSo(h).map((v) => `${v.truong}:${v.muc}:${v.ma}`);

describe('kiemTraSo', () => {
  it('hồ sơ đúng: không có vấn đề', () => {
    expect(ma({ cccd: '031142006754', ma_kcb: '2600134941', so_dt: '0912345678', nam_sinh: 1942, gioi_tinh: 'Nữ' })).toEqual([]);
    expect(ma({ cccd: '', ma_kcb: '2600134941', so_dt: '0', nam_sinh: 1940, gioi_tinh: 'Nữ' })).toEqual([]);
    expect(ma({ cccd: '031123456', ma_kcb: '2600134941', nam_sinh: 1950, gioi_tinh: 'Nam' })).toEqual([]); // CMND 9 số
    expect(ma({ cccd: '031203001234', nam_sinh: 2003, gioi_tinh: 'Nam' })).toEqual([]);
  });
  it('mã KCB nhập nhầm số CCCD (ca trong ảnh) → lỗi', () => {
    const v = kiemTraSo({ cccd: '', ma_kcb: '031142006754', nam_sinh: 1942, gioi_tinh: 'Nữ' });
    expect(v).toEqual([{ truong: 'ma_kcb', muc: 'loi', ma: 'MA_KCB_LA_CCCD', thong_diep: 'Mã KCB có dạng số CCCD' }]);
  });
  it('các dạng nhầm lẫn khác', () => {
    expect(ma({ ma_kcb: '0912345678' })).toEqual(['ma_kcb:loi:MA_KCB_LA_SO_DT']);
    expect(ma({ ma_kcb: '12345' })).toEqual(['ma_kcb:canh_bao:MA_KCB_DANG']);
    expect(ma({ cccd: '2600134941' })).toEqual(['cccd:loi:CCCD_LA_MA_KCB']);
    expect(ma({ cccd: '0912345678' })).toEqual(['cccd:loi:CCCD_LA_SO_DT']);
    expect(ma({ cccd: '03114200675' })).toEqual(['cccd:loi:CCCD_DO_DAI']);
    expect(ma({ so_dt: '031142006754' })).toEqual(['so_dt:loi:SDT_LA_CCCD']);
    expect(ma({ so_dt: '2600134941' })).toEqual(['so_dt:loi:SDT_LA_MA_KCB']);
    expect(ma({ so_dt: '091234567' })).toEqual(['so_dt:canh_bao:SDT_DANG']);
    expect(ma({ so_dt: '02253123456' })).toEqual([]); // máy bàn Hải Phòng 11 số
  });
  it('CCCD lệch năm sinh / giới tính / mã tỉnh', () => {
    expect(ma({ cccd: '031142006754', nam_sinh: 1940, gioi_tinh: 'Nữ' })).toEqual(['cccd:canh_bao:CCCD_NAM_SINH']);
    expect(kiemTraSo({ cccd: '031142006754', nam_sinh: 1940 })[0].thong_diep).toBe('Số 5–6 của CCCD (42) ứng với năm sinh 1942, hồ sơ ghi 1940 — đối chiếu giấy tờ');
    expect(ma({ cccd: '031142006754', nam_sinh: 1942, gioi_tinh: 'Nam' })).toEqual(['cccd:canh_bao:CCCD_GIOI_TINH']);
    expect(ma({ cccd: '003142006754', nam_sinh: 1942, gioi_tinh: 'Nữ' })).toEqual(['cccd:canh_bao:CCCD_MA_TINH']);
    expect(ma({ cccd: '031742006754' })).toEqual(['cccd:canh_bao:CCCD_THE_KY']);
  });
  it('cùng một số ở hai ô → lỗi', () => {
    expect(ma({ cccd: '031142006754', so_dt: '031142006754', nam_sinh: 1942, gioi_tinh: 'Nữ' })).toEqual([
      'so_dt:loi:SDT_LA_CCCD', 'so_dt:loi:TRUNG_CCCD',
    ]);
  });
  it('vanDeKhiSua chỉ xét ô đang đổi; đổi năm sinh/giới tính thì xét lại CCCD', () => {
    const h = { cccd: '031142006754', ma_kcb: '12345', nam_sinh: 1940, gioi_tinh: 'Nữ' };
    expect(vanDeKhiSua(h, ['ghi_chu']).length).toBe(0);
    expect(vanDeKhiSua(h, ['ma_kcb']).map((v) => v.ma)).toEqual(['MA_KCB_DANG']);
    expect(vanDeKhiSua(h, ['nam_sinh']).map((v) => v.ma)).toEqual(['CCCD_NAM_SINH']);
  });
  it('tiện ích', () => {
    expect(chiSo(' 031 142.006-754 ')).toBe('031142006754');
    expect(coSdt('0')).toBe(false);
    expect(coSdt('')).toBe(false);
    expect(coSdt('0912345678')).toBe(true);
  });
});

import { BO_LOC_MAC_DINH, coGhiChu, khopBoLoc, soBoLocDangBat } from '@/lib/loc-ho-so';
describe('lọc Có ghi chú', () => {
  it('tính cả ghi chú tự động Xem lại số; khoảng trắng coi như trống', () => {
    expect(coGhiChu({ ghi_chu: ' ' })).toBe(false);
    expect(coGhiChu({ ghi_chu: '', canh_bao_so: ['CCCD phải đủ 12 số (đang có 13 số)'] })).toBe(true); // ghi chú tự động
    expect(coGhiChu({ ghi_chu: '', canh_bao_so: [] })).toBe(false);
    expect(coGhiChu({ ghi_chu: 'Khám ngày 15/09' })).toBe(true);
    const h = { da_xac_nhan: false, cls: Object.fromEntries(['ctm','glucose','ure','creatinin','got','gpt','tpt_nuoc_tieu','sieu_am'].map((k) => [k, 0])), co_tt_ksk: 1, nguon: 'cowork', nhan_tu_kho_chung: false, src: null, canh_bao: [], canh_bao_so: [], ghi_chu: 'x', cccd: '', ma_kcb: '2600000001', nam_sinh: 1960, gioi_tinh: 'Nam' } as never;
    const b = { ...BO_LOC_MAC_DINH, co_ghi_chu: 'co' as const };
    expect(soBoLocDangBat(b)).toBe(1);
    expect(khopBoLoc(h, b)).toBe(true);
    expect(khopBoLoc({ ...(h as object), ghi_chu: '' } as never, b)).toBe(false);
    expect(khopBoLoc({ ...(h as object), ghi_chu: '' } as never, { ...b, co_ghi_chu: 'khong' })).toBe(true);
  });
});
