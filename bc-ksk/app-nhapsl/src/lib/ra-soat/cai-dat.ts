import type postgres from 'postgres';
import type { AuthUser } from '@/lib/auth/guard';
import type { CaiDatTuDuyet, CheDoTuDuyet } from '@/lib/api-types';
import { getSql } from '@/db/client';
import { ghiNhatKy } from '@/lib/nhat-ky';
import { LoiNghiepVu } from './loi';
import { iso, laAdmin } from './quyen';
import { quetTuDuyet } from './tu-duyet';

type Sql = postgres.Sql;

const KHOA = 'tu_duyet';
const CHE_DO: readonly CheDoTuDuyet[] = ['tat', 'ngay', 'sau_phut'];
export const MAC_DINH_TU_DUYET = { che_do: 'tat' as CheDoTuDuyet, sau_phut: 5 };

const hopLeSauPhut = (n: unknown): n is number => typeof n === 'number' && Number.isInteger(n) && n >= 1 && n <= 120;

/** Đọc cài đặt tự duyệt; thiếu/hỏng → mặc định { tat, 5 }. */
export async function docTuDuyet(sql: Sql = getSql()): Promise<CaiDatTuDuyet> {
  const [r] = await sql<{ gia_tri: unknown; updated_at: Date; id: number | null; username: string | null; ho_ten: string | null }[]>`
    SELECT c.gia_tri, c.updated_at, u.id, u.username, u.ho_ten
    FROM cai_dat c LEFT JOIN users u ON u.id = c.updated_by
    WHERE c.khoa = ${KHOA}`;
  if (!r) return { ...MAC_DINH_TU_DUYET, updated_by: null, updated_at: null };
  const v = (r.gia_tri ?? {}) as { che_do?: unknown; sau_phut?: unknown };
  return {
    che_do: CHE_DO.includes(v.che_do as CheDoTuDuyet) ? (v.che_do as CheDoTuDuyet) : MAC_DINH_TU_DUYET.che_do,
    sau_phut: hopLeSauPhut(v.sau_phut) ? v.sau_phut : MAC_DINH_TU_DUYET.sau_phut,
    updated_by: r.id === null || r.username === null ? null : { id: r.id, username: r.username, ho_ten: r.ho_ten ?? '' },
    updated_at: iso(r.updated_at),
  };
}

/** Admin đổi cài đặt tự duyệt, ghi nhật ký, rồi quét ngay (bắt buộc). `sau_phut` bỏ trống = giữ giá trị cũ. */
export async function ghiTuDuyet(user: AuthUser, body: { che_do: string; sau_phut?: number }): Promise<{ tu_duyet: CaiDatTuDuyet }> {
  if (!laAdmin(user)) throw new LoiNghiepVu(403, 'Chỉ quản trị viên mới có quyền thực hiện thao tác này');
  if (!CHE_DO.includes(body.che_do as CheDoTuDuyet)) throw new LoiNghiepVu(400, 'Chế độ tự duyệt không hợp lệ');
  if (body.sau_phut !== undefined && !hopLeSauPhut(body.sau_phut)) throw new LoiNghiepVu(400, 'Số phút từ 1 đến 120');
  await getSql().begin(async (tx) => {
    const sql = tx as unknown as Sql;
    const cu = await docTuDuyet(sql);
    const moi = { che_do: body.che_do as CheDoTuDuyet, sau_phut: body.sau_phut ?? cu.sau_phut };
    await sql`
      INSERT INTO cai_dat (khoa, gia_tri, updated_by, updated_at) VALUES (${KHOA}, ${sql.json(moi)}, ${user.id}, now())
      ON CONFLICT (khoa) DO UPDATE SET gia_tri = EXCLUDED.gia_tri, updated_by = EXCLUDED.updated_by, updated_at = EXCLUDED.updated_at`;
    await ghiNhatKy({
      userId: user.id, hanhDong: 'cai_dat', doiTuong: 'cai_dat', doiTuongId: KHOA, truong: 'tu_duyet',
      giaTriCu: JSON.stringify({ che_do: cu.che_do, sau_phut: cu.sau_phut }), giaTriMoi: JSON.stringify(moi),
    }, sql);
  });
  await quetTuDuyet({ batBuoc: true });
  return { tu_duyet: await docTuDuyet() };
}
