import type { AuthUser } from '@/lib/auth/guard';
import { LoiNghiepVu } from './loi';

export const LOI_KHONG_QUYEN_BUOI = 'Bạn không phụ trách buổi khám này';
export const LOI_BUOI_KHOA = 'Danh sách đã xác nhận (khóa), không sửa được';

export const laAdmin = (u: AuthUser) => u.role === 'admin';

/** Có quyền xem/sửa buổi: admin hoặc người phụ trách. */
export function coQuyenBuoi(u: AuthUser, phuTrachUserId: number | null): boolean {
  return laAdmin(u) || (phuTrachUserId !== null && phuTrachUserId === u.id);
}

export function yeuCauQuyenBuoi(u: AuthUser, phuTrachUserId: number | null): void {
  if (!coQuyenBuoi(u, phuTrachUserId)) throw new LoiNghiepVu(403, LOI_KHONG_QUYEN_BUOI);
}

export const iso = (v: Date | string | null | undefined): string | null =>
  v === null || v === undefined ? null : v instanceof Date ? v.toISOString() : new Date(v).toISOString();
