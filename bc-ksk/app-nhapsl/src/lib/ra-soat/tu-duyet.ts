import type postgres from 'postgres';
import type { AuthUser } from '@/lib/auth/guard';
import { getSql } from '@/db/client';
import { ghiNhatKy } from '@/lib/nhat-ky';
import { chayNen, thongBaoDaXuLy } from '@/lib/push';
import { LoiNghiepVu } from './loi';
import { diChuyenTrongTx } from './chuyen';
import { docTuDuyet } from './cai-dat';

type Sql = postgres.Sql;

const THROTTLE_MS = 15_000;
let lanQuetCuoi = 0;

/** Chỉ dùng cho test: bỏ throttle. */
export function datLaiThrottleTuDuyet(): void { lanQuetCuoi = 0; }

type UserRow = AuthUser & { active: boolean };

/** Người giữ hồ sơ (phụ trách buổi, còn hoạt động), không có → admin hoạt động có id nhỏ nhất. */
async function layNguoiGiu(sql: Sql, phuTrachId: number | null): Promise<AuthUser | null> {
  if (phuTrachId !== null) {
    const [u] = await sql<UserRow[]>`SELECT id, username, ho_ten, role, session_version, active FROM users WHERE id = ${phuTrachId}`;
    if (u && u.active) return { id: u.id, username: u.username, ho_ten: u.ho_ten, role: u.role, session_version: u.session_version };
  }
  const [a] = await sql<UserRow[]>`
    SELECT id, username, ho_ten, role, session_version, active FROM users WHERE role = 'admin' AND active ORDER BY id LIMIT 1`;
  return a ? { id: a.id, username: a.username, ho_ten: a.ho_ten, role: a.role, session_version: a.session_version } : null;
}

type KetQua = 'da_duyet' | 'loi' | 'bo_qua';

async function duyetMot(id: number, ghiChuXuLy: string): Promise<KetQua> {
  const loi: { msg: string | null } = { msg: null };
  const kq = await getSql().begin(async (tx): Promise<KetQua> => {
    const sql = tx as unknown as Sql;
    const [d] = await sql<{ id: number; ho_so_id: number; den_buoi_id: number; ly_do: string; loai: 'xin_ve' | 'gui_di' }[]>`
      SELECT id, ho_so_id, den_buoi_id, ly_do, loai FROM de_nghi_chuyen
      WHERE id = ${id} AND trang_thai = 'cho_xu_ly' AND tu_dong_loi = '' FOR UPDATE SKIP LOCKED`;
    if (!d) return 'bo_qua';
    try {
      const [h] = await sql<{ vi_tri: string; buoi_id: number | null }[]>`SELECT vi_tri, buoi_id FROM ho_so WHERE id = ${d.ho_so_id}`;
      if (!h || h.vi_tri !== 'buoi' || h.buoi_id === null) throw new LoiNghiepVu(400, 'Hồ sơ không còn nằm trong buổi khám nào');
      // xin_ve: người thực hiện = người giữ buổi hiện tại; gui_di: người phụ trách buổi đích (nguoi_duyet). Không có/không hoạt động → admin nhỏ nhất.
      const [b] = await sql<{ phu_trach_user_id: number | null }[]>`
        SELECT phu_trach_user_id FROM buoi_kham WHERE id = ${d.loai === 'gui_di' ? d.den_buoi_id : h.buoi_id}`;
      const giu = await layNguoiGiu(sql, b?.phu_trach_user_id ?? null);
      if (!giu) throw new LoiNghiepVu(400, 'Không có người giữ hồ sơ để tự duyệt');
      await diChuyenTrongTx(sql, giu, {
        id: d.ho_so_id, version: null, dich: { loai: 'buoi', buoi: d.den_buoi_id }, lyDo: d.ly_do, che: 'chuyen', boQuaQuyenNguon: d.loai === 'gui_di',
        ghiVet: { userId: null, tienTo: '[Tự động]' },
      });
      await sql`UPDATE de_nghi_chuyen SET trang_thai = 'dong_y', tu_dong = true, xu_ly_by = ${giu.id}, xu_ly_at = now(), xu_ly_ghi_chu = ${ghiChuXuLy} WHERE id = ${id}`;
      await ghiNhatKy({
        userId: null, hanhDong: 'xu_ly_de_nghi', doiTuong: 'de_nghi_chuyen', doiTuongId: id,
        truong: 'trang_thai', giaTriCu: 'cho_xu_ly', giaTriMoi: 'dong_y', ghiChu: `[Tự động] ${ghiChuXuLy}`,
      }, sql);
      return 'da_duyet';
    } catch (e) {
      if (e instanceof LoiNghiepVu) { loi.msg = e.message; throw e; }
      throw e;
    }
  }).catch((e: unknown) => {
    if (e instanceof LoiNghiepVu) return 'loi' as KetQua;
    throw e;
  });
  if (kq === 'loi' && loi.msg !== null) {
    // Giao dịch đã rollback; ghi lỗi để người xử lý tay, không thử lại.
    await getSql()`UPDATE de_nghi_chuyen SET tu_dong_loi = ${loi.msg} WHERE id = ${id} AND trang_thai = 'cho_xu_ly'`;
  }
  return kq;
}

/**
 * Quét các đề nghị chuyển đang chờ và tự duyệt theo cài đặt. Không bao giờ ném lỗi (chỉ log tên lỗi).
 * Không `batBuoc` → throttle 15 giây/instance.
 */
export async function quetTuDuyet(opts: { batBuoc?: boolean } = {}): Promise<{ da_duyet: number; loi: number }> {
  const kq = { da_duyet: 0, loi: 0 };
  try {
    const now = Date.now();
    if (!opts.batBuoc && now - lanQuetCuoi < THROTTLE_MS) return kq;
    lanQuetCuoi = now;
    const sql = getSql();
    const cd = await docTuDuyet(sql);
    if (cd.che_do === 'tat') return kq;
    const dsCho = cd.che_do === 'ngay'
      ? await sql<{ id: number }[]>`SELECT id FROM de_nghi_chuyen WHERE trang_thai = 'cho_xu_ly' AND tu_dong_loi = '' ORDER BY id`
      : await sql<{ id: number }[]>`
          SELECT id FROM de_nghi_chuyen
          WHERE trang_thai = 'cho_xu_ly' AND tu_dong_loi = '' AND created_at <= now() - make_interval(mins => ${cd.sau_phut})
          ORDER BY id`;
    const ghiChu = cd.che_do === 'ngay' ? 'Tự động duyệt' : `Tự động duyệt sau ${cd.sau_phut} phút`;
    for (const { id } of dsCho) {
      try {
        const r = await duyetMot(id, ghiChu);
        if (r === 'da_duyet') { kq.da_duyet++; chayNen(() => thongBaoDaXuLy(id)); }
        else if (r === 'loi') kq.loi++;
      } catch (e) {
        console.error('Lỗi tự duyệt đề nghị:', e instanceof Error ? e.name : typeof e);
      }
    }
  } catch (e) {
    console.error('Lỗi quét tự duyệt:', e instanceof Error ? e.name : typeof e);
  }
  return kq;
}
