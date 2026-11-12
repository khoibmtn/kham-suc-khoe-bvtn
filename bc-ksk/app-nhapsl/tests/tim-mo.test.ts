import { describe, expect, it } from 'vitest';
import { chiaDoan, chuanHoa, coTheTim, khopHoSo, tachTuKhoa, timTheoThuTu } from '@/lib/tim-mo';

const hs = (ho_ten: string, extra: Partial<Parameters<typeof khopHoSo>[1]> = {}) => ({
  ho_ten, ghi_chu: '', nam_sinh: 1960, cccd: '031160004139', ma_kcb: '2600144013', so_dt: '0912345678', so_the_bhyt: 'GD4313123456', ...extra,
});
const khop = (q: string, h: ReturnType<typeof hs>) => khopHoSo(tachTuKhoa(q), h).khop;

describe('tìm mờ theo thứ tự', () => {
  it('chuẩn hóa giữ nguyên độ dài, Thủy = Thuỷ, Đ → d', () => {
    expect(chuanHoa('Thủy')).toBe('thuy');
    expect(chuanHoa('Thuỷ')).toBe('thuy');
    expect(chuanHoa('ĐỖ VĂN ĐỨC').length).toBe('ĐỖ VĂN ĐỨC'.length);
  });
  it('"ng anh" khớp *ng*anh* (theo thứ tự), không khớp khi đảo thứ tự', () => {
    expect(khop('ng anh', hs('NGUYỄN HOÀNG ANH'))).toBe(true);
    expect(khop('ng anh', hs('ĐẶNG THỊ LANH'))).toBe(true);   // "dang thi lanh" → ng … anh
    expect(khop('anh ng', hs('NGUYỄN HOÀNG ANH'))).toBe(false);
    expect(khop('ng anh', hs('TRẦN VĂN BÌNH'))).toBe(false);
  });
  it('tìm cả trong ghi chú, highlight đúng vị trí trong chuỗi gốc có dấu', () => {
    const h = hs('PHẠM THỊ NGÂN', { ghi_chu: 'Khám ngày 15/09, nhập nhầm' });
    const r = khopHoSo(tachTuKhoa('ngan nham'), h);
    expect(r.khop).toBe(true);
    expect(r.danhDau.ho_ten).toEqual([[9, 13]]);
    const seg = chiaDoan(h.ghi_chu, r.danhDau.ghi_chu).filter((s) => s.mark).map((s) => s.t);
    expect(seg).toEqual(['nhầm']);
  });
  it('năm sinh / số CCCD / mã thẻ không phụ thuộc thứ tự', () => {
    expect(khop('thuy 1960', hs('LÊ THỊ THỦY'))).toBe(true);
    expect(khop('1960 thuy', hs('LÊ THỊ THUỶ'))).toBe(true);
    expect(khop('4139', hs('A'))).toBe(true);
    expect(khop('gd4313', hs('A'))).toBe(true);
    expect(khop('1961 thuy', hs('LÊ THỊ THỦY'))).toBe(false);
  });
  it('không vượt qua ranh giới họ tên | ghi chú', () => {
    expect(timTheoThuTu(['anhk'], ['NGUYỄN ANH', 'khám lại'])).toBeNull();
  });
  it('coTheTim', () => {
    expect(coTheTim('a')).toBe(false);
    expect(coTheTim('ng')).toBe(true);
  });
});
