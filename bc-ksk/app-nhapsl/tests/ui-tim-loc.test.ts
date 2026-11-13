import { describe, expect, it } from 'vitest';
import type { BuoiTomTat, HoSoDong, KetQuaTimKiem } from '@/lib/api-types';
import { layCanhBaoSo, locHoSo, soBoLocDangBat } from '@/lib/loc-ho-so';
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
import {
  cloneBoLocTimKiemMacDinh,
  demSoBoLocTimKiem,
  docBoLocTimKiemTuUrl,
  formatViTriKetQua,
  taoDanhSachNgayKhamOption,
  taoDanhSachPhuTrachOption,
  taoUrlSearchParamsTimKiem,
} from '@/components/tim-kiem-view';
import { timMoDanhSachHoSo } from '@/components/ra-soat-view';
import { coBanCapNhatMoi, formatDemNguocCapNhat } from '@/components/cap-nhat-phien-ban';
import { tinhTongTheoUser } from '@/components/admin-tong-quan-view';

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
    so_dt: '',
    canh_bao_so: [],
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

  it('tìm mờ phía trình duyệt ở màn rà soát khớp theo thứ tự, tìm trong ghi chú và trả vị trí tô vàng', () => {
    const ds = [
      taoHoSoMau({ id: 1, ho_ten: 'NGUYỄN HOÀNG ANH', ghi_chu: '' }),
      taoHoSoMau({ id: 2, ho_ten: 'TRẦN VĂN BÌNH', ghi_chu: 'Thiếu phiếu siêu âm bụng' }),
      taoHoSoMau({ id: 3, ho_ten: 'LÊ THỊ MAI', ghi_chu: '' }),
    ];

    const kqRong = timMoDanhSachHoSo(ds, 'a');
    expect(kqRong.idsKhop).toBeNull();

    const kqTen = timMoDanhSachHoSo(ds, 'ng anh');
    expect(kqTen.idsKhop ? Array.from(kqTen.idsKhop) : []).toEqual([1]);
    expect(kqTen.danhDauMap.get(1)?.ho_ten.length).toBeGreaterThan(0);

    const kqGhiChu = timMoDanhSachHoSo(ds, 'sieu am');
    expect(kqGhiChu.idsKhop ? Array.from(kqGhiChu.idsKhop) : []).toEqual([2]);
    expect(kqGhiChu.danhDauMap.get(2)?.ghi_chu.length).toBeGreaterThan(0);
  });

  it('đồng bộ bộ lọc trang /tim-kiem với URL query và tạo danh sách ngày khám / người phụ trách', () => {
    const boLoc = cloneBoLocTimKiemMacDinh();
    expect(demSoBoLocTimKiem(boLoc)).toBe(0);

    boLoc.don_vi = 'TN';
    boLoc.ngay = '2026-09-07';
    boLoc.xac_nhan = 'chua';
    boLoc.cls.sieu_am = 'khong';
    boLoc.co_ghi_chu = '1';
    expect(demSoBoLocTimKiem(boLoc)).toBe(5);

    const params = taoUrlSearchParamsTimKiem('ng anh', 'tat_ca', boLoc, true);
    expect(params.get('q')).toBe('ng anh');
    expect(params.get('don_vi')).toBe('TN');
    expect(params.get('ngay')).toBe('2026-09-07');
    expect(params.get('xac_nhan')).toBe('chua');
    expect(params.get('cls_sieu_am')).toBe('khong');
    expect(params.get('co_ghi_chu')).toBe('1');

    const parsed = docBoLocTimKiemTuUrl(params);
    expect(parsed.boLoc).toEqual(boLoc);

    const buoiList: BuoiTomTat[] = [
      {
        id: 1,
        ma_buoi: 'TN-20260907',
        don_vi: 'TN',
        ten_don_vi: 'Thủy Nguyên',
        ngay_kham: '2026-09-07',
        diem_kham: 'Trạm A',
        doan_kham: 'Đoàn 1',
        nv_goi_y: 'ngan',
        so_doan_tong: 50,
        hien_co: 50,
        da_xac_nhan: 10,
        chua_xac_nhan: 40,
        tien_do: 20,
        thua: 0,
        thieu: 0,
        bo_sung: 0,
        phu_trach: { id: 2, username: 'ngan', ho_ten: 'Ngân' },
        trang_thai: 'dang_ra_soat',
        xac_nhan_at: null,
        xac_nhan_by: null,
        giai_trinh: '',
        co_quyen_sua: true,
      },
    ];
    expect(taoDanhSachNgayKhamOption(buoiList, 'TN')).toEqual([
      { value: '2026-09-07', don_vi: 'TN', ngay: '2026-09-07', label: '07/09/2026' },
    ]);
    const tatCa = taoDanhSachNgayKhamOption(
      [
        { ...buoiList[0], don_vi: 'VK', ten_don_vi: 'Xã Việt Khê', ngay_kham: '2026-09-01' },
        { ...buoiList[0], don_vi: 'TN', ngay_kham: '2026-09-09' },
        ...buoiList,
      ],
      '',
    );
    // đơn vị trước (TN, LK, VK) rồi ngày tăng dần; không có nơi khám
    expect(tatCa.map((o) => o.value)).toEqual(['TN|2026-09-07', 'TN|2026-09-09', 'VK|2026-09-01']);
    expect(tatCa[2].label).toBe('Xã Việt Khê · 01/09/2026');
    expect(tatCa.every((o) => !o.label.includes('Trạm'))).toBe(true);
    expect(taoDanhSachPhuTrachOption(buoiList)).toEqual([
      { id: 2, username: 'ngan', ho_ten: 'Ngân' },
    ]);
  });

  it('kiểm tra phiên bản cập nhật và tính dòng Tổng cộng bảng Tiến độ theo nhân viên', () => {
    expect(coBanCapNhatMoi('', 'v2')).toBe(false);
    expect(coBanCapNhatMoi('v1', '')).toBe(false);
    expect(coBanCapNhatMoi('v1', 'v1')).toBe(false);
    expect(coBanCapNhatMoi('v1', 'v2')).toBe(true);
    expect(formatDemNguocCapNhat(179)).toBe('02:59');
    expect(formatDemNguocCapNhat(0)).toBe('00:00');

    const tong = tinhTongTheoUser([
      {
        user: { id: 2, username: 'ngan', ho_ten: 'Ngân' },
        active: true,
        so_buoi: 3,
        so_buoi_da_xac_nhan: 1,
        so_buoi_chua_xac_nhan: 2,
        so_doan: 100,
        hien_co: 100,
        da_xac_nhan: 40,
        chua_xac_nhan: 60,
        thua: 0,
        thieu: 0,
        chenh_lech: 0,
        bo_sung: 2,
        kho_ca_nhan: 2,
        tien_do: 40,
        last_seen_at: '2026-11-12T08:00:00Z',
        lan_hoat_dong_cuoi: '2026-11-12T08:00:00Z',
      },
      {
        user: { id: 3, username: 'diep', ho_ten: 'Diệp' },
        active: true,
        so_buoi: 2,
        so_buoi_da_xac_nhan: 1,
        so_buoi_chua_xac_nhan: 1,
        so_doan: 100,
        hien_co: 100,
        da_xac_nhan: 60,
        chua_xac_nhan: 40,
        thua: 0,
        thieu: 0,
        chenh_lech: 0,
        bo_sung: 1,
        kho_ca_nhan: 0,
        tien_do: 60,
        last_seen_at: '2026-11-12T09:30:00Z',
        lan_hoat_dong_cuoi: '2026-11-12T09:30:00Z',
      },
    ]);
    expect(tong.so_buoi).toBe(5);
    expect(tong.so_buoi_da_xac_nhan).toBe(2);
    expect(tong.hien_co).toBe(200);
    expect(tong.da_xac_nhan).toBe(100);
    expect(tong.chua_xac_nhan).toBe(100);
    expect(tong.bo_sung).toBe(3);
    expect(tong.tien_do).toBe(50);
    expect(tong.kho_ca_nhan).toBe(2);
    expect(tong.hoat_dong_gan_nhat).toBe('2026-11-12T09:30:00Z');
  });

  it('Phase 12 / T24: lọc nghi_nham_so ở màn rà soát và trang tìm kiếm, tự tính canh_bao_so khi thiếu', () => {
    const hOk = taoHoSoMau({
      id: 101,
      ma_kcb: '2602083219',
      cccd: '031160001234',
      nam_sinh: 1960,
      gioi_tinh: 'Nữ',
      canh_bao_so: [],
    });
    const hNham = taoHoSoMau({
      id: 102,
      ma_kcb: '031142006754',
      cccd: '031142006754',
      nam_sinh: 1942,
      gioi_tinh: 'Nữ',
      canh_bao_so: ['Mã KCB có dạng số CCCD'],
    });
    // Khi canh_bao_so chưa có từ backend -> tự tính qua kiemTraSo
    const hThieuTruong = {
      ...taoHoSoMau({
        id: 103,
        ma_kcb: '031142006754',
        cccd: '',
        nam_sinh: 1942,
        gioi_tinh: 'Nữ',
      }),
      canh_bao_so: undefined as unknown as string[],
    };
    expect(layCanhBaoSo(hThieuTruong)).toContain('Mã KCB có dạng số CCCD');

    const boLocCo = chuanHoaBoLoc({ nghi_nham_so: 'co' });
    expect(soBoLocDangBat(boLocCo)).toBe(1);
    expect(
      locHoSo([hOk, hNham, hThieuTruong], boLocCo, null).map((h) => h.id),
    ).toEqual([102, 103]);

    const boLocKhong = chuanHoaBoLoc({ nghi_nham_so: 'khong' });
    expect(
      locHoSo([hOk, hNham, hThieuTruong], boLocKhong, null).map((h) => h.id),
    ).toEqual([101]);

    // Đồng bộ URL trang Tìm kiếm
    const tkLoc = cloneBoLocTimKiemMacDinh();
    tkLoc.nghi_nham_so = '1';
    expect(demSoBoLocTimKiem(tkLoc)).toBe(1);
    const params = taoUrlSearchParamsTimKiem('', 'tat_ca', tkLoc, true);
    expect(params.get('nghi_nham_so')).toBe('1');
    const parsed = docBoLocTimKiemTuUrl(params);
    expect(parsed.boLoc.nghi_nham_so).toBe('1');
  });
});
