import { z } from 'zod';
import { CLS_KEYS } from '@/lib/cls';

const cls01 = z.union([z.literal(0), z.literal(1)], { error: 'Giá trị cận lâm sàng phải là 0 hoặc 1' });
const version = z.number().int().min(1, 'Phiên bản hồ sơ không hợp lệ');

export const hoSoSuaSchema = z.strictObject({
  version,
  ma_kcb: z.string().trim().max(50, 'Mã KCB quá dài').optional(),
  ho_ten: z.string().trim().min(1, 'Họ tên không được để trống').max(200, 'Họ tên quá dài').optional(),
  gioi_tinh: z.enum(['Nam', 'Nữ'], { error: 'Giới tính phải là Nam hoặc Nữ' }).optional(),
  nam_sinh: z.number().int('Năm sinh không hợp lệ').min(1900, 'Năm sinh phải từ 1900 đến 2026').max(2026, 'Năm sinh phải từ 1900 đến 2026').optional(),
  cccd: z.string().trim().regex(/^(\d{9}|\d{12})?$/, 'CCCD phải để trống hoặc gồm 9 hoặc 12 chữ số').optional(),
  dia_chi_chi_tiet: z.string().trim().max(500, 'Địa chỉ quá dài').optional(),
  ghi_chu: z.string().trim().max(2000, 'Ghi chú quá dài').optional(),
  cls: z.strictObject(Object.fromEntries(CLS_KEYS.map((k) => [k, cls01.optional()]))).optional(),
});

export const versionSchema = z.strictObject({ version });

export const phanCongSchema = z.strictObject({
  buoi_ids: z.array(z.number().int().min(1)).min(1, 'Chưa chọn buổi khám').max(500, 'Chọn quá nhiều buổi'),
  user_id: z.number().int().min(1).nullable(),
});

export const theoGoiYSchema = z.strictObject({ ghi_de: z.boolean().optional() });

export const taoUserSchema = z.strictObject({
  username: z.string().trim().regex(/^[a-z0-9_.]{2,30}$/, 'Tên đăng nhập gồm 2–30 ký tự: chữ thường không dấu, số, dấu chấm hoặc gạch dưới'),
  ho_ten: z.string().trim().min(1, 'Họ tên không được để trống').max(100, 'Họ tên quá dài'),
  role: z.enum(['admin', 'nhan_vien'], { error: 'Vai trò không hợp lệ' }),
});

export const suaUserSchema = z.strictObject({
  ho_ten: z.string().trim().min(1, 'Họ tên không được để trống').max(100, 'Họ tên quá dài').optional(),
  role: z.enum(['admin', 'nhan_vien'], { error: 'Vai trò không hợp lệ' }).optional(),
  active: z.boolean().optional(),
});

const soKhongAm = z.number().int('Số đoàn phải là số nguyên').min(0, 'Số đoàn không được âm').max(1_000_000, 'Số đoàn quá lớn');

export const suaBuoiSchema = z.strictObject({
  diem_kham: z.string().trim().max(200, 'Điểm khám quá dài').optional(),
  doan_kham: z.string().trim().max(200, 'Đoàn khám quá dài').optional(),
  so_doan_tong: soKhongAm.optional(),
});

export const themBuoiSchema = z.strictObject({
  don_vi: z.enum(['TN', 'LK', 'VK'], { error: 'Đơn vị phải là TN, LK hoặc VK' }),
  ngay_kham: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Ngày khám phải có dạng yyyy-mm-dd').refine((s) => {
    const d = new Date(`${s}T00:00:00Z`);
    return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
  }, 'Ngày khám không hợp lệ'),
  diem_kham: z.string().trim().max(200, 'Điểm khám quá dài').optional(),
  doan_kham: z.string().trim().max(200, 'Đoàn khám quá dài').optional(),
  so_doan_tong: soKhongAm,
});
