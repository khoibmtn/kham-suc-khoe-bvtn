import type postgres from 'postgres';
import type { AuthUser } from '@/lib/auth/guard';
import type { DeNghiChuyen, UserNgan } from '@/lib/api-types';
import { getSql } from '@/db/client';
import { ghiNhatKy } from '@/lib/nhat-ky';
import { LoiNghiepVu } from './loi';
import { LOI_KHONG_QUYEN_BUOI, coQuyenBuoi, iso, laAdmin } from './quyen';
import { diChuyenTrongTx, giaiBuoi } from './chuyen';
import { docTuDuyet } from './cai-dat';
import { quetTuDuyet } from './tu-duyet';
import { chayNen, thongBaoDaXuLy, thongBaoDeNghiMoi } from '@/lib/push';

type Sql = postgres.Sql;
type Frag = postgres.PendingQuery<postgres.Row[]>;

type Row = {
  id: number; ly_do: string; trang_thai: DeNghiChuyen['trang_thai']; created_at: Date; xu_ly_at: Date | null; xu_ly_ghi_chu: string; tu_dong: boolean; tu_dong_loi: string;
  hs_id: number; ho_ten: string; nam_sinh: number; cccd: string; ma_kcb: string;
  tb_ma: string | null; tpt_id: number | null; tpt_username: string | null; tpt_ho_ten: string | null;
  den_buoi_id: number; db_ma: string;
  nd_id: number; nd_username: string; nd_ho_ten: string;
  xl_id: number | null; xl_username: string | null; xl_ho_ten: string | null;
};

const un = (id: number | null, u: string | null, h: string | null): UserNgan | null => (id === null || u === null ? null : { id, username: u, ho_ten: h ?? '' });

async function truyVanDeNghi(sql: Sql, where: Frag): Promise<DeNghiChuyen[]> {
  const rows = await sql<Row[]>`
    SELECT d.id, d.ly_do, d.trang_thai, d.created_at, d.xu_ly_at, d.xu_ly_ghi_chu, d.tu_dong, d.tu_dong_loi,
           h.id AS hs_id, h.ho_ten, h.nam_sinh, h.cccd, h.ma_kcb,
           tb.ma_buoi AS tb_ma, tpt.id AS tpt_id, tpt.username AS tpt_username, tpt.ho_ten AS tpt_ho_ten,
           d.den_buoi_id, db.ma_buoi AS db_ma,
           nd.id AS nd_id, nd.username AS nd_username, nd.ho_ten AS nd_ho_ten,
           xl.id AS xl_id, xl.username AS xl_username, xl.ho_ten AS xl_ho_ten
    FROM de_nghi_chuyen d
    JOIN ho_so h ON h.id = d.ho_so_id
    LEFT JOIN buoi_kham tb ON tb.id = h.buoi_id AND h.vi_tri = 'buoi'
    LEFT JOIN users tpt ON tpt.id = tb.phu_trach_user_id
    JOIN buoi_kham db ON db.id = d.den_buoi_id
    JOIN users nd ON nd.id = d.tu_user_id
    LEFT JOIN users xl ON xl.id = d.xu_ly_by
    WHERE ${where}
    ORDER BY (d.trang_thai <> 'cho_xu_ly'), d.id DESC`;
  const cd = await docTuDuyet(sql);
  return rows.map((r) => ({
    id: r.id,
    ho_so: { id: r.hs_id, ho_ten: r.ho_ten, nam_sinh: r.nam_sinh, cccd: r.cccd, ma_kcb: r.ma_kcb },
    tu_buoi: r.tb_ma === null ? null : { ma_buoi: r.tb_ma, phu_trach: un(r.tpt_id, r.tpt_username, r.tpt_ho_ten) },
    den_buoi: { id: r.den_buoi_id, ma_buoi: r.db_ma },
    nguoi_de_nghi: { id: r.nd_id, username: r.nd_username, ho_ten: r.nd_ho_ten },
    ly_do: r.ly_do,
    trang_thai: r.trang_thai,
    created_at: iso(r.created_at) ?? '',
    xu_ly_by: un(r.xl_id, r.xl_username, r.xl_ho_ten),
    xu_ly_at: iso(r.xu_ly_at),
    xu_ly_ghi_chu: r.xu_ly_ghi_chu,
    tu_dong: r.tu_dong,
    tu_dong_loi: r.tu_dong_loi,
    han_tu_duyet:
      r.trang_thai === 'cho_xu_ly' && cd.che_do === 'sau_phut' && r.tu_dong_loi === ''
        ? new Date(r.created_at.getTime() + cd.sau_phut * 60_000).toISOString()
        : null,
  }));
}

async function layMot(sql: Sql, id: number): Promise<DeNghiChuyen> {
  const [d] = await truyVanDeNghi(sql, sql`d.id = ${id}`);
  if (!d) throw new LoiNghiepVu(404, 'Không tìm thấy đề nghị');
  return d;
}

export const GHI_CHU_CUNG_NGUOI = 'Tự động duyệt: hồ sơ đang ở buổi của chính người đề nghị';

export async function taoDeNghi(user: AuthUser, body: { ho_so_id: number; den_buoi: number | string; ly_do?: string }): Promise<{ de_nghi: DeNghiChuyen }> {
  const lyDo = (body.ly_do ?? '').trim();
  if (!lyDo) throw new LoiNghiepVu(400, 'Cần ghi lý do đề nghị chuyển');
  const tao = (await getSql().begin(async (tx) => {
    const sql = tx as unknown as Sql;
    const [h] = await sql<{ id: number; vi_tri: string; buoi_id: number | null }[]>`
      SELECT id, vi_tri, buoi_id FROM ho_so WHERE id = ${body.ho_so_id} FOR UPDATE`;
    if (!h) throw new LoiNghiepVu(404, 'Không tìm thấy hồ sơ');
    if (h.vi_tri !== 'buoi' || h.buoi_id === null) throw new LoiNghiepVu(400, 'Chỉ đề nghị chuyển hồ sơ đang nằm trong một buổi khám');
    const [bNguon] = await sql<{ phu_trach_user_id: number | null }[]>`SELECT phu_trach_user_id FROM buoi_kham WHERE id = ${h.buoi_id}`;
    // Owner 13/11/2026: the requester already has write access on the source session (their own session, or admin)
    // → no one else needs to approve: move right away and record the request as auto-approved.
    const tuDuyetNgay = coQuyenBuoi(user, bNguon.phu_trach_user_id);
    const denId = await giaiBuoi(sql, body.den_buoi);
    if (denId === h.buoi_id) throw new LoiNghiepVu(400, 'Hồ sơ đã ở buổi khám đó');
    const [bDen] = await sql<{ phu_trach_user_id: number | null }[]>`SELECT phu_trach_user_id FROM buoi_kham WHERE id = ${denId}`;
    if (!coQuyenBuoi(user, bDen.phu_trach_user_id)) throw new LoiNghiepVu(403, LOI_KHONG_QUYEN_BUOI);
    const [cho] = await sql`SELECT 1 FROM de_nghi_chuyen WHERE ho_so_id = ${h.id} AND trang_thai = 'cho_xu_ly' LIMIT 1`;
    if (cho) throw new LoiNghiepVu(400, 'Hồ sơ này đã có đề nghị chuyển đang chờ xử lý');
    if (tuDuyetNgay) {
      // Lỗi 400/423 (hồ sơ đã xác nhận, buổi đã chốt…) ném ra → rollback, báo thẳng cho người thao tác.
      await diChuyenTrongTx(sql, user, { id: h.id, version: null, dich: { loai: 'buoi', buoi: denId }, lyDo, che: 'chuyen' });
    }
    const [moi] = tuDuyetNgay
      ? await sql<{ id: number }[]>`
          INSERT INTO de_nghi_chuyen (ho_so_id, tu_user_id, den_buoi_id, ly_do, trang_thai, tu_dong, xu_ly_by, xu_ly_at, xu_ly_ghi_chu)
          VALUES (${h.id}, ${user.id}, ${denId}, ${lyDo}, 'dong_y', true, ${user.id}, now(), ${GHI_CHU_CUNG_NGUOI}) RETURNING id`
      : await sql<{ id: number }[]>`
          INSERT INTO de_nghi_chuyen (ho_so_id, tu_user_id, den_buoi_id, ly_do) VALUES (${h.id}, ${user.id}, ${denId}, ${lyDo}) RETURNING id`;
    await ghiNhatKy({
      userId: user.id, hanhDong: 'de_nghi_chuyen', doiTuong: 'de_nghi_chuyen', doiTuongId: moi.id,
      truong: 'ho_so_id', giaTriMoi: h.id, ghiChu: lyDo,
    }, sql);
    if (tuDuyetNgay) {
      await ghiNhatKy({
        userId: user.id, hanhDong: 'xu_ly_de_nghi', doiTuong: 'de_nghi_chuyen', doiTuongId: moi.id,
        truong: 'trang_thai', giaTriCu: 'cho_xu_ly', giaTriMoi: 'dong_y', ghiChu: `[Tự động] ${GHI_CHU_CUNG_NGUOI}`,
      }, sql);
    }
    return { de_nghi: await layMot(sql, moi.id) };
  })) as { de_nghi: DeNghiChuyen };
  // Sau commit: quét tự duyệt (bắt buộc) rồi trả bản mới nhất; chỉ báo "đề nghị mới" nếu vẫn đang chờ.
  await quetTuDuyet({ batBuoc: true });
  const moiNhat = await layMot(getSql(), tao.de_nghi.id);
  if (moiNhat.trang_thai === 'cho_xu_ly') chayNen(() => thongBaoDeNghiMoi(moiNhat.id));
  return { de_nghi: moiNhat };
}

export async function danhSachDeNghi(user: AuthUser, trangThai?: string | null): Promise<{ de_nghi: DeNghiChuyen[] }> {
  await quetTuDuyet();
  const sql = getSql();
  if (trangThai && !['cho_xu_ly', 'dong_y', 'tu_choi'].includes(trangThai)) throw new LoiNghiepVu(400, 'Trạng thái không hợp lệ');
  const tt = trangThai ? sql`d.trang_thai = ${trangThai}` : sql`TRUE`;
  const quyen = laAdmin(user) ? sql`TRUE` : sql`(d.tu_user_id = ${user.id} OR tb.phu_trach_user_id = ${user.id})`;
  return { de_nghi: await truyVanDeNghi(sql, sql`${tt} AND ${quyen}`) };
}

export async function xuLyDeNghi(user: AuthUser, id: number, body: { dong_y: boolean; ghi_chu?: string }): Promise<{ de_nghi: DeNghiChuyen }> {
  const ghiChu = (body.ghi_chu ?? '').trim();
  const kq = (await getSql().begin(async (tx) => {
    const sql = tx as unknown as Sql;
    const [d] = await sql<{ id: number; ho_so_id: number; den_buoi_id: number; ly_do: string; trang_thai: string }[]>`
      SELECT id, ho_so_id, den_buoi_id, ly_do, trang_thai FROM de_nghi_chuyen WHERE id = ${id} FOR UPDATE`;
    if (!d) throw new LoiNghiepVu(404, 'Không tìm thấy đề nghị');
    if (d.trang_thai !== 'cho_xu_ly') throw new LoiNghiepVu(400, 'Đề nghị này đã được xử lý');
    const [h] = await sql<{ vi_tri: string; buoi_id: number | null }[]>`SELECT vi_tri, buoi_id FROM ho_so WHERE id = ${d.ho_so_id}`;
    let phuTrach: number | null = null;
    if (h.vi_tri === 'buoi' && h.buoi_id !== null) {
      const [b] = await sql<{ phu_trach_user_id: number | null }[]>`SELECT phu_trach_user_id FROM buoi_kham WHERE id = ${h.buoi_id}`;
      phuTrach = b.phu_trach_user_id;
    }
    const laNguoiGiu = h.vi_tri === 'buoi' && phuTrach === user.id;
    if (!laAdmin(user) && !laNguoiGiu) throw new LoiNghiepVu(403, 'Chỉ người đang giữ hồ sơ hoặc quản trị viên được xử lý đề nghị');

    if (body.dong_y) {
      if (h.vi_tri !== 'buoi') throw new LoiNghiepVu(400, 'Hồ sơ không còn nằm trong buổi khám nào');
      // Lỗi 400/423 ném ra → rollback, đề nghị vẫn chờ xử lý.
      await diChuyenTrongTx(sql, user, { id: d.ho_so_id, version: null, dich: { loai: 'buoi', buoi: d.den_buoi_id }, lyDo: d.ly_do, che: 'chuyen' });
    }
    const moi = body.dong_y ? 'dong_y' : 'tu_choi';
    await sql`UPDATE de_nghi_chuyen SET trang_thai = ${moi}, xu_ly_by = ${user.id}, xu_ly_at = now(), xu_ly_ghi_chu = ${ghiChu} WHERE id = ${id}`;
    await ghiNhatKy({
      userId: user.id, hanhDong: 'xu_ly_de_nghi', doiTuong: 'de_nghi_chuyen', doiTuongId: id,
      truong: 'trang_thai', giaTriCu: 'cho_xu_ly', giaTriMoi: moi, ghiChu: ghiChu || null,
    }, sql);
    return { de_nghi: await layMot(sql, id) };
  })) as { de_nghi: DeNghiChuyen };
  chayNen(() => thongBaoDaXuLy(id, user.id));
  return kq;
}
