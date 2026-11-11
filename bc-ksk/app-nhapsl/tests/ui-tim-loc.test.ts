import { describe, expect, it } from 'vitest';
import type { BuoiTomTat, HoSoDong, KetQuaTimKiem } from '@/lib/api-types';
import { locHoSo, soBoLocDangBat } from '@/lib/loc-ho-so';
import {
  chuanHoaBoLoc,
  cloneBoLocMacDinh,
  locHoSoKetHopCanhBao,
  nhanTrangThaiCls,
  thongKeCanhBao,
  xoayTrangThaiBa,
} from '@/components/ra-soat-bo-loc';
import { locDanhSachBuoi } from '@/components/home-buoi-list';
import { sapXepDanhSachBuoi } from '@/components/admin-phan-cong-view';
import { formatViTriKetQua } from '@/components/tim-kiem-view';

function taoHoSoMau(overrides: Partial<HoSoDong> = {}): HoSoDong {
  const clsMacDinh = {
    ctm: 0 as const,
    glucose: 1 as const,
    ure: 0 as const,
    creatinin: 0 as const,
    got: 0 as const,
    gpt: 0 as const,
    tpt_nuoc_tieu: 0 as const,
    sieu_am: 0 as const,
  };
  return {
    id: 1,
    version: 1,
    ma_ho_so: 'H001',
    nguon: 'cowork',
    ma_kcb: '001122',
    ho_ten: 'NGUYỄN THỊ AN',
    gioi_tinh: 'Nữ',
    nam_sinh: 1960,
    cccd: '031160001234',
    dia_chi_chi_tiet: 'TDP 1',
    cls: { ...clsMacDinh },
    src: {
      ma_kcb: '001122',
      ho_ten: 'NGUYỄN THỊ AN',
      gioi_tinh: 'Nữ',
      nam_sinh: 1960,
      cccd: '031160001234',
      dia_chi_chi_tiet: 'TDP 1',
      cls: { ...clsMacDinh },
    },
    dia_chi_the: 'Thủy Nguyên',
    ngay_gio_dang_ky_his: '07/09/2026 08:30',
    cls_ghi_chu: '',
    co_tt_ksk: 1,
    canh_bao: [],
    ghi_chu: '',
    ghi_chu_cowork: '',
    sua_nhan_than: false,
    sua_cls: false,
    nhan_tu_kho_chung: false,
    da_xac_nhan: false,
    xac_nhan_by: null,
    xac_nhan_at: null,
    updated_at: '2026-11-11T08:00:00Z',
    ...overrides,
  };
}

describe('UI tìm kiếm & bộ lọc helpers', () => {
  it('xoay vòng 3 trạng thái CLS Tất cả → Có → Không → Tất cả và hiển thị nhãn chữ rõ ràng', () => {
    expect(xoayTrangThaiBa('tat_ca')).toBe('co');
    expect(xoayTrangThaiBa('co')).toBe('khong');
    expect(xoayTrangThaiBa('khong')).toBe('tat_ca');

    expect(nhanTrangThaiCls('SA', 'tat_ca')).toBe('SA: Tất cả');
    expect(nhanTrangThaiCls('SA', 'co')).toBe('SA: Có');
    expect(nhanTrangThaiCls('SA', 'khong')).toBe('SA: Không');
  });

  it('thống kê cảnh báo chỉ lấy mã có trong danh sách kèm số lượng', () => {
    const ds = [
      taoHoSoMau({ id: 1, canh_bao: ['NGHI_SAO_CHEP_XN', 'LECH_NGAY'] }),
      taoHoSoMau({ id: 2, canh_bao: ['NGHI_SAO_CHEP_XN'] }),
      taoHoSoMau({ id: 3, canh_bao: [] }),
    ];
    const opts = thongKeCanhBao(ds);
    expect(opts).toEqual([
      { code: 'NGHI_SAO_CHEP_XN', label: 'Nghi sao chép XN', count: 2 },
      { code: 'LECH_NGAY', label: 'Ngày CLS khác ngày đăng ký', count: 1 },
    ]);
  });

  it('chuẩn hóa BoLoc từ sessionStorage an toàn và kết hợp locHoSo + locHoSoKetHopCanhBao', () => {
    const boLoc = chuanHoaBoLoc({
      xac_nhan: 'chua',
      cls: { sieu_am: 'khong' },
    });
    expect(boLoc.xac_nhan).toBe('chua');
    expect(boLoc.cls.sieu_am).toBe('khong');
    expect(boLoc.cls.ctm).toBe('tat_ca');
    expect(soBoLocDangBat(boLoc)).toBe(2);

    const ds = [
      taoHoSoMau({ id: 10, da_xac_nhan: false, canh_bao: ['KHONG_BANG_CHUNG'], cls: { ...cloneBoLocMacDinh().cls, ctm: 0, glucose: 0, ure: 0, creatinin: 0, got: 0, gpt: 0, tpt_nuoc_tieu: 0, sieu_am: 0 } }),
      taoHoSoMau({ id: 11, da_xac_nhan: true, canh_bao: [], cls: { ...cloneBoLocMacDinh().cls, ctm: 0, glucose: 0, ure: 0, creatinin: 0, got: 0, gpt: 0, tpt_nuoc_tieu: 0, sieu_am: 0 } }),
      taoHoSoMau({ id: 12, da_xac_nhan: false, canh_bao: [], cls: { ...cloneBoLocMacDinh().cls, ctm: 0, glucose: 0, ure: 0, creatinin: 0, got: 0, gpt: 0, tpt_nuoc_tieu: 0, sieu_am: 0 } }),
    ];
    const kq = locHoSo(ds, boLoc, null);
    expect(kq.map((x) => x.id)).toEqual([10, 12]);

    const kqCoCanhBao = locHoSoKetHopCanhBao(ds, boLoc, null, true);
    expect(kqCoCanhBao.map((x) => x.id)).toEqual([10]);
  });

  it('lọc và sắp xếp danh sách buổi khám trên trang chủ và trang phân công', () => {
    const mauBuoi = (overrides: Partial<BuoiTomTat>): BuoiTomTat => ({
      id: 1,
      ma_buoi: 'TN-20260914',
      don_vi: 'TN',
      ten_don_vi: 'Phường Thủy Nguyên',
      ngay_kham: '2026-09-14',
      diem_kham: 'Trạm y tế A',
      doan_kham: 'Đoàn 1',
      nv_goi_y: 'ngan',
      so_doan_tong: 80,
      hien_co: 78,
      da_xac_nhan: 10,
      chua_xac_nhan: 68,
      tien_do: 12.8,
      thua: 0,
      thieu: 2,
      bo_sung: 0,
      phu_trach: { id: 2, username: 'ngan', ho_ten: 'Ngân' },
      trang_thai: 'dang_ra_soat',
      xac_nhan_at: null,
      xac_nhan_by: null,
      giai_trinh: '',
      co_quyen_sua: true,
      ...overrides,
    });

    const list = [
      mauBuoi({ id: 1, ma_buoi: 'TN-20260914', don_vi: 'TN', ngay_kham: '2026-09-14', phu_trach: { id: 2, username: 'ngan', ho_ten: 'Ngân' } }),
      mauBuoi({ id: 2, ma_buoi: 'LK-20260907', don_vi: 'LK', ngay_kham: '2026-09-07', phu_trach: null, trang_thai: 'chua_ra_soat' }),
    ];

    expect(
      locDanhSachBuoi(list, {
        donVi: '',
        trangThai: '',
        phuTrach: '',
        tuNgay: '',
        denNgay: '',
        timNhanh: '14/09',
      }).map((b) => b.ma_buoi),
    ).toEqual(['TN-20260914']);

    expect(
      sapXepDanhSachBuoi(list, 'ngay_kham', 'asc').map((b) => b.ma_buoi),
    ).toEqual(['LK-20260907', 'TN-20260914']);
  });

  it('định dạng cột Vị trí trên trang /tim-kiem đúng quy cách', () => {
    const base = taoHoSoMau();
    const oBuoi: KetQuaTimKiem = {
      ...base,
      vi_tri: 'buoi',
      buoi: {
        id: 1,
        ma_buoi: 'TN-20260907',
        don_vi: 'TN',
        ngay_kham: '2026-09-07',
        phu_trach: { id: 2, username: 'ngan', ho_ten: 'Ngân' },
      },
      kho_cua: null,
      don_vi_goi_y: 'TN',
      chuyen: null,
      co_quyen_sua: true,
    };
    expect(formatViTriKetQua(oBuoi)).toBe('TN · 07/09/2026 · Ngân');

    const oKhoChung: KetQuaTimKiem = {
      ...base,
      vi_tri: 'kho_chung',
      buoi: null,
      kho_cua: null,
      don_vi_goi_y: 'LK',
      chuyen: null,
      co_quyen_sua: false,
    };
    expect(formatViTriKetQua(oKhoChung)).toBe('Kho chờ chung (gợi ý: LK)');

    const oKhoCaNhan: KetQuaTimKiem = {
      ...base,
      vi_tri: 'kho_ca_nhan',
      buoi: null,
      kho_cua: { id: 3, username: 'diep', ho_ten: 'Diệp' },
      don_vi_goi_y: 'LK',
      chuyen: null,
      co_quyen_sua: false,
    };
    expect(formatViTriKetQua(oKhoCaNhan)).toBe('Kho của Diệp');
  });
});
