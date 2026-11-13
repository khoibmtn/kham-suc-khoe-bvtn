import { z } from 'zod';
import { CLS_KEYS, type ClsKey } from '@/lib/cls';

const cls01 = z.union([z.literal(0), z.literal(1)], { error: 'Giá trị cận lâm sàng phải là 0 hoặc 1' });
const version = z.number().int().min(1, 'Phiên bản hồ sơ không hợp lệ');

export const hoSoSuaSchema = z.strictObject({
  version,
  ma_kcb: z.string().trim().max(50, 'Mã KCB quá dài').optional(),
  ho_ten: z.string().trim().min(1, 'Họ tên không được để trống').max(200, 'Họ tên quá dài').optional(),
  gioi_tinh: z.enum(['Nam', 'Nữ'], { error: 'Giới tính phải là Nam hoặc Nữ' }).optional(),
  nam_sinh: z.number().int('Năm sinh không hợp lệ').min(1900, 'Năm sinh phải từ 1900 đến 2026').max(2026, 'Năm sinh phải từ 1900 đến 2026').optional(),
  cccd: z.string().trim().max(30, 'CCCD quá dài').optional(), // định dạng kiểm ở máy chủ bằng kiem-so.ts (400 + van_de_so)
  so_dt: z.string().trim().max(30, 'SĐT quá dài').optional(),
  bo_qua_canh_bao_so: z.boolean({ error: 'bo_qua_canh_bao_so phải là true hoặc false' }).optional(),
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

// ---- Giai đoạn 4 ----
const lyDo = z.string().trim().max(1000, 'Lý do quá dài');
const buoiRef = z.union([z.number().int().min(1, 'Buổi khám không hợp lệ'), z.string().trim().min(1, 'Buổi khám không hợp lệ').max(40)]);

export const chuyenSchema = z.strictObject({
  version,
  den: z.enum(['kho_ca_nhan', 'kho_chung', 'buoi'], { error: 'Nơi đến phải là kho cá nhân, kho chung hoặc buổi khám' }),
  buoi: buoiRef.optional(),
  ly_do: lyDo.optional(),
});

export const nhanVeSchema = z.strictObject({ version, buoi: buoiRef });

export const kiemTrungSchema = z.strictObject({
  ma_kcb: z.string().trim().max(50).optional(),
  cccd: z.string().trim().max(20).optional(),
  ho_ten: z.string().trim().max(200).optional(),
  nam_sinh: z.number().int().min(1900).max(2026).optional(),
});

export const themHoSoSchema = z.strictObject({
  ma_kcb: z.string().trim().max(50, 'Mã KCB quá dài').optional(),
  ho_ten: z.string().trim().min(1, 'Họ tên không được để trống').max(200, 'Họ tên quá dài'),
  gioi_tinh: z.enum(['Nam', 'Nữ'], { error: 'Giới tính phải là Nam hoặc Nữ' }),
  nam_sinh: z.number().int('Năm sinh không hợp lệ').min(1900, 'Năm sinh phải từ 1900 đến 2026').max(2026, 'Năm sinh phải từ 1900 đến 2026'),
  cccd: z.string().trim().max(30, 'CCCD quá dài').optional(), // định dạng kiểm ở máy chủ bằng kiem-so.ts (400 + van_de_so)
  so_dt: z.string().trim().max(30, 'SĐT quá dài').optional(),
  bo_qua_canh_bao_so: z.boolean({ error: 'bo_qua_canh_bao_so phải là true hoặc false' }).optional(),
  dia_chi_chi_tiet: z.string().trim().max(500, 'Địa chỉ quá dài').optional(),
  cls: z.strictObject(Object.fromEntries(CLS_KEYS.map((k) => [k, cls01])) as Record<ClsKey, typeof cls01>),
  ghi_chu: z.string().trim().max(2000, 'Ghi chú quá dài').optional(),
  ly_do_tao_moi: lyDo.optional(),
});

export const xacNhanBuoiSchema = z.strictObject({ giai_trinh: z.string().trim().max(2000, 'Giải trình quá dài').optional() });
export const moKhoaSchema = z.strictObject({ ly_do: lyDo.optional() });

export const deNghiSchema = z.strictObject({
  ho_so_id: z.number().int().min(1, 'Hồ sơ không hợp lệ'),
  den_buoi: buoiRef,
  ly_do: lyDo.optional(),
  loai: z.enum(['xin_ve', 'gui_di'], { error: 'Loại đề nghị không hợp lệ' }).default('xin_ve'),
});

export const xuLyDeNghiSchema = z.strictObject({
  dong_y: z.boolean({ error: 'Thiếu quyết định đồng ý hoặc từ chối' }),
  ghi_chu: z.string().trim().max(1000, 'Ghi chú quá dài').optional(),
});

export const tuDuyetSchema = z.strictObject({
  che_do: z.enum(['tat', 'ngay', 'sau_phut'], { error: 'Chế độ tự duyệt không hợp lệ' }),
  sau_phut: z.number({ error: 'Số phút không hợp lệ' }).int('Số phút phải là số nguyên').min(1, 'Số phút từ 1 đến 120').max(120, 'Số phút từ 1 đến 120').optional(),
});

export const pushDangKySchema = z.strictObject({
  endpoint: z.string().trim().max(2000, 'Endpoint quá dài').url('Endpoint không hợp lệ').startsWith('https://', 'Endpoint phải là https'),
  keys: z.strictObject({
    p256dh: z.string().trim().min(1, 'Thiếu khóa p256dh').max(500, 'Khóa quá dài'),
    auth: z.string().trim().min(1, 'Thiếu khóa auth').max(500, 'Khóa quá dài'),
  }),
  thiet_bi: z.string().trim().max(200, 'Tên thiết bị quá dài').optional(),
});

export const pushHuySchema = z.strictObject({
  endpoint: z.string().trim().min(1, 'Thiếu endpoint').max(2000, 'Endpoint quá dài'),
});
