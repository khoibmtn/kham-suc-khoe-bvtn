// Web Push (web-push@3.6.7). Thiếu VAPID_* ⇒ mọi hàm gửi là no-op im lặng. KHÔNG log endpoint/payload.
import { after } from 'next/server';
import * as webpush from 'web-push';
import { getSql } from '@/db/client';
import type { AuthUser } from '@/lib/auth/guard';
import { LoiNghiepVu } from '@/lib/ra-soat/loi';

export type PushPayload = { title: string; body: string; url: string; tag: string };

export function cauHinhVapid(): { publicKey: string; privateKey: string; subject: string } | null {
  const publicKey = process.env.VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  const subject = process.env.VAPID_SUBJECT;
  return publicKey && privateKey && subject ? { publicKey, privateKey, subject } : null;
}

/** Chạy việc nền sau phản hồi (after()); ngoài request scope (script/test) thì chạy thẳng, nuốt lỗi. */
export function chayNen(fn: () => Promise<unknown>): void {
  const chay = () => fn().catch(() => undefined);
  try {
    after(chay);
  } catch {
    void chay();
  }
}

/** Gửi tới mọi thiết bị của các user; trả về số thiết bị gửi thành công. Không bao giờ ném lỗi. */
export async function guiPush(userIds: number[], payload: PushPayload): Promise<number> {
  const cfg = cauHinhVapid();
  if (!cfg || userIds.length === 0) return 0;
  try {
    const sql = getSql();
    const subs = await sql<{ id: number; endpoint: string; p256dh: string; auth: string }[]>`
      SELECT id, endpoint, p256dh, auth FROM push_dang_ky WHERE user_id = ANY(${[...new Set(userIds)]}::int[])`;
    const json = JSON.stringify(payload);
    let ok = 0;
    await Promise.all(subs.map(async (s) => {
      try {
        await webpush.sendNotification(
          { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, json,
          { timeout: 5000, TTL: 3600, vapidDetails: { subject: cfg.subject, publicKey: cfg.publicKey, privateKey: cfg.privateKey } },
        );
        ok++;
        await sql`UPDATE push_dang_ky SET last_ok_at = now() WHERE id = ${s.id}`;
      } catch (e) {
        const code = (e as { statusCode?: number }).statusCode;
        if (code === 404 || code === 410) await sql`DELETE FROM push_dang_ky WHERE id = ${s.id}`.catch(() => undefined);
      }
    }));
    return ok;
  } catch {
    return 0;
  }
}

// ---- Dựng nội dung (không chứa họ tên bệnh nhân, CCCD, năm sinh, lý do, ghi chú) ----
export function payloadDeNghiMoi(p: { id: number; nguoiDeNghi: string; tuBuoi: string; denBuoi: string; loai?: 'xin_ve' | 'gui_di' }): PushPayload {
  if (p.loai === 'gui_di') {
    return {
      title: 'Đề nghị nhận hồ sơ',
      body: `${p.nguoiDeNghi} muốn gửi 1 hồ sơ từ ${p.tuBuoi} sang buổi ${p.denBuoi} của bạn`,
      url: '/kho?tab=de_nghi',
      tag: `de-nghi-${p.id}`,
    };
  }
  return {
    title: 'Đề nghị chuyển hồ sơ',
    body: `${p.nguoiDeNghi} xin chuyển 1 hồ sơ từ ${p.tuBuoi} về ${p.denBuoi}`,
    url: '/kho?tab=de_nghi',
    tag: `de-nghi-${p.id}`,
  };
}

export function payloadDaXuLy(p: { id: number; dongY: boolean; tuDong: boolean; denBuoi: string }): PushPayload {
  return {
    title: `${p.dongY ? 'Đề nghị chuyển đã được đồng ý' : 'Đề nghị chuyển bị từ chối'}${p.tuDong ? ' (tự động)' : ''}`,
    body: p.dongY ? `Hồ sơ đã về buổi ${p.denBuoi}` : 'Lý do từ chối xem trong app',
    url: '/kho?tab=de_nghi',
    tag: `de-nghi-${p.id}`,
  };
}

/** Đề nghị mới → người giữ hồ sơ + mọi admin hoạt động, trừ người đề nghị. */
export async function thongBaoDeNghiMoi(id: number): Promise<void> {
  if (!cauHinhVapid()) return;
  const sql = getSql();
  const [d] = await sql<{ tu_user_id: number; nd_ho_ten: string; tu_ma: string | null; den_ma: string; giu: number | null; loai: 'xin_ve' | 'gui_di'; den_giu: number | null }[]>`
    SELECT d.loai, db.phu_trach_user_id AS den_giu, d.tu_user_id, nd.ho_ten AS nd_ho_ten, tb.ma_buoi AS tu_ma, db.ma_buoi AS den_ma, tb.phu_trach_user_id AS giu
    FROM de_nghi_chuyen d
    JOIN users nd ON nd.id = d.tu_user_id
    JOIN ho_so h ON h.id = d.ho_so_id
    LEFT JOIN buoi_kham tb ON tb.id = h.buoi_id AND h.vi_tri = 'buoi'
    JOIN buoi_kham db ON db.id = d.den_buoi_id
    WHERE d.id = ${id}`;
  if (!d) return;
  const admins = await sql<{ id: number }[]>`SELECT id FROM users WHERE role = 'admin' AND active`;
  const nguoiNhan = new Set<number>(admins.map((a) => a.id));
  // xin_ve → người giữ hồ sơ hiện tại; gui_di → người phụ trách buổi đích.
  const duyet = d.loai === 'gui_di' ? d.den_giu : d.giu;
  if (duyet !== null) nguoiNhan.add(duyet);
  nguoiNhan.delete(d.tu_user_id);
  await guiPush([...nguoiNhan], payloadDeNghiMoi({ id, nguoiDeNghi: d.nd_ho_ten, tuBuoi: d.tu_ma ?? '', denBuoi: d.den_ma, loai: d.loai }));
}

/** Đề nghị đã xử lý (tay hoặc tự động) → người đề nghị. */
export async function thongBaoDaXuLy(id: number, boQuaNguoiXuLy?: number): Promise<void> {
  if (!cauHinhVapid()) return;
  const sql = getSql();
  const [d] = await sql<{ tu_user_id: number; trang_thai: string; tu_dong: boolean; den_ma: string }[]>`
    SELECT d.tu_user_id, d.trang_thai, d.tu_dong, db.ma_buoi AS den_ma
    FROM de_nghi_chuyen d JOIN buoi_kham db ON db.id = d.den_buoi_id WHERE d.id = ${id}`;
  if (!d || d.trang_thai === 'cho_xu_ly' || d.tu_user_id === boQuaNguoiXuLy) return;
  await guiPush([d.tu_user_id], payloadDaXuLy({ id, dongY: d.trang_thai === 'dong_y', tuDong: d.tu_dong, denBuoi: d.den_ma }));
}

// ---- Đăng ký / hủy thiết bị (chỉ tác động hàng của chính mình) ----
export async function dangKyPush(user: AuthUser, b: { endpoint: string; keys: { p256dh: string; auth: string }; thiet_bi?: string }): Promise<{ ok: true }> {
  await getSql()`
    INSERT INTO push_dang_ky (user_id, endpoint, p256dh, auth, thiet_bi)
    VALUES (${user.id}, ${b.endpoint}, ${b.keys.p256dh}, ${b.keys.auth}, ${b.thiet_bi ?? ''})
    ON CONFLICT (endpoint) DO UPDATE SET user_id = EXCLUDED.user_id, p256dh = EXCLUDED.p256dh, auth = EXCLUDED.auth, thiet_bi = EXCLUDED.thiet_bi`;
  return { ok: true };
}

export async function huyPush(user: AuthUser, b: { endpoint: string }): Promise<{ ok: true }> {
  await getSql()`DELETE FROM push_dang_ky WHERE endpoint = ${b.endpoint} AND user_id = ${user.id}`;
  return { ok: true };
}

export async function guiThu(user: AuthUser): Promise<{ gui: number }> {
  if (!user.id) throw new LoiNghiepVu(401, 'Chưa đăng nhập');
  return { gui: await guiPush([user.id], { title: 'Thông báo thử', body: 'Thiết bị này đã nhận được thông báo', url: '/', tag: 'thu' }) };
}
