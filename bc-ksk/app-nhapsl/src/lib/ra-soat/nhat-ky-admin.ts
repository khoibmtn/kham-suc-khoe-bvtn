import { z } from 'zod';
import type { NhatKyAdmin } from '@/lib/api-types';
import { getSql } from '@/db/client';
import { LoiNghiepVu } from './loi';
import { iso } from './quyen';

export const KICH_THUOC_NHAT_KY = 100;

const ngay = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Ngày phải có dạng yyyy-mm-dd');
export const nhatKyQuerySchema = z.object({
  user: z.string().regex(/^\d{1,9}$/, 'Người dùng không hợp lệ').optional(),
  hanh_dong: z.string().max(100).optional(),
  doi_tuong: z.string().max(100).optional(),
  tu: ngay.optional(),
  den: ngay.optional(),
  trang: z.string().regex(/^\d{1,6}$/, 'Trang không hợp lệ').optional(),
});
export type NhatKyQuery = z.infer<typeof nhatKyQuerySchema>;

/** Đọc query string (rỗng = bỏ qua) rồi kiểm bằng zod → 400 tiếng Việt. */
export function docNhatKyQuery(sp: URLSearchParams): NhatKyQuery {
  const raw: Record<string, string> = {};
  for (const k of ['user', 'hanh_dong', 'doi_tuong', 'tu', 'den', 'trang']) {
    const v = sp.get(k)?.trim();
    if (v) raw[k] = v;
  }
  const kq = nhatKyQuerySchema.safeParse(raw);
  if (!kq.success) throw new LoiNghiepVu(400, kq.error.issues[0].message);
  return kq.data;
}

type Row = {
  id: string | number; at: Date; user_id: number | null; username: string | null; ho_ten: string | null;
  hanh_dong: string; truong: string | null; gia_tri_cu: string | null; gia_tri_moi: string | null; ghi_chu: string | null;
  doi_tuong: string; doi_tuong_id: string | null; mo_ta: string | null;
};

export async function nhatKyAdmin(q: NhatKyQuery): Promise<{ dong: NhatKyAdmin[]; tong: number; trang: number; kich_thuoc: number }> {
  const sql = getSql();
  const trang = Math.max(1, Number(q.trang ?? 1));
  const dieuKien = [sql`TRUE`];
  if (q.user) dieuKien.push(sql`n.user_id = ${Number(q.user)}`);
  if (q.hanh_dong) dieuKien.push(sql`n.hanh_dong = ${q.hanh_dong}`);
  if (q.doi_tuong) dieuKien.push(sql`n.doi_tuong = ${q.doi_tuong}`);
  // Ngày theo giờ Việt Nam; `den` gồm cả ngày đó.
  if (q.tu) dieuKien.push(sql`n.at >= (${q.tu}::date)::timestamp AT TIME ZONE 'Asia/Ho_Chi_Minh'`);
  if (q.den) dieuKien.push(sql`n.at < ((${q.den}::date + 1)::timestamp AT TIME ZONE 'Asia/Ho_Chi_Minh')`);
  const where = dieuKien.reduce((a, f) => sql`${a} AND ${f}`);

  const [rows, [dem]] = await Promise.all([
    sql<Row[]>`
      SELECT n.id, n.at, n.user_id, u.username, u.ho_ten, n.hanh_dong, n.truong, n.gia_tri_cu, n.gia_tri_moi, n.ghi_chu,
             n.doi_tuong, n.doi_tuong_id,
             CASE n.doi_tuong
               WHEN 'buoi_kham' THEN COALESCE(bk.ma_buoi, n.doi_tuong_id)
               WHEN 'ho_so' THEN CASE WHEN hs.id IS NULL THEN n.doi_tuong_id
                                      ELSE 'Hồ sơ #' || hs.id || ' (' || COALESCE(hs.ma_ho_so, 'thêm tay') || ')' END
               WHEN 'user' THEN COALESCE(uo.username, n.doi_tuong_id)
               ELSE n.doi_tuong_id
             END AS mo_ta
      FROM nhat_ky n
      LEFT JOIN users u ON u.id = n.user_id
      CROSS JOIN LATERAL (SELECT CASE WHEN n.doi_tuong_id ~ '^[0-9]{1,9}$' THEN n.doi_tuong_id::int END AS oid) x
      LEFT JOIN buoi_kham bk ON n.doi_tuong = 'buoi_kham' AND bk.id = x.oid
      LEFT JOIN ho_so hs ON n.doi_tuong = 'ho_so' AND hs.id = x.oid
      LEFT JOIN users uo ON n.doi_tuong = 'user' AND uo.id = x.oid
      WHERE ${where}
      ORDER BY n.at DESC, n.id DESC
      LIMIT ${KICH_THUOC_NHAT_KY} OFFSET ${(trang - 1) * KICH_THUOC_NHAT_KY}`,
    sql<{ n: number }[]>`SELECT count(*)::int AS n FROM nhat_ky n WHERE ${where}`,
  ]);

  return {
    dong: rows.map((r) => ({
      id: Number(r.id),
      at: iso(r.at) ?? '',
      user: r.user_id === null || r.username === null ? null : { id: r.user_id, username: r.username, ho_ten: r.ho_ten ?? '' },
      hanh_dong: r.hanh_dong,
      truong: r.truong,
      gia_tri_cu: r.gia_tri_cu,
      gia_tri_moi: r.gia_tri_moi,
      ghi_chu: r.ghi_chu,
      doi_tuong: r.doi_tuong,
      doi_tuong_id: r.doi_tuong_id,
      mo_ta_doi_tuong: r.mo_ta ?? r.doi_tuong_id ?? '',
    })),
    tong: dem.n,
    trang,
    kich_thuoc: KICH_THUOC_NHAT_KY,
  };
}
