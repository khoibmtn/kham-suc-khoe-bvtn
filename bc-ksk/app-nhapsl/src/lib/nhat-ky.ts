import type postgres from 'postgres';
import { getSql } from '@/db/client';

export type NhatKyEntry = {
  userId: number | null;
  hanhDong: string;          // e.g. 'dang_nhap', 'sua_cls', 'xac_nhan', 'import'
  doiTuong: string;          // 'ho_so' | 'buoi_kham' | 'user' | 'import' | 'auth'
  doiTuongId?: string | number | null;
  truong?: string | null;
  giaTriCu?: string | number | null;
  giaTriMoi?: string | number | null;
  ghiChu?: string | null;
};

const s = (v: string | number | null | undefined) => (v === undefined || v === null ? null : String(v));

/** Append audit-log rows. Pass `tx` to write inside an existing transaction. */
export async function ghiNhatKy(entries: NhatKyEntry | NhatKyEntry[], tx?: postgres.Sql | postgres.TransactionSql): Promise<void> {
  const list = Array.isArray(entries) ? entries : [entries];
  if (list.length === 0) return;
  const sql = (tx ?? getSql()) as postgres.Sql;
  const rows = list.map((e) => ({
    user_id: e.userId,
    hanh_dong: e.hanhDong,
    doi_tuong: e.doiTuong,
    doi_tuong_id: s(e.doiTuongId),
    truong: e.truong ?? null,
    gia_tri_cu: s(e.giaTriCu),
    gia_tri_moi: s(e.giaTriMoi),
    ghi_chu: e.ghiChu ?? null,
  }));
  await sql`INSERT INTO nhat_ky ${sql(rows)}`;
}
