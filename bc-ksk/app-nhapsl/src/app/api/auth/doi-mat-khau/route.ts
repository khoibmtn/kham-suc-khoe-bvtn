import { cookies } from 'next/headers';
import { z } from 'zod';
import { getSql } from '@/db/client';
import { requireUser } from '@/lib/auth/guard';
import { hashPassword, verifyPassword } from '@/lib/auth/password';
import {
  SESSION_COOKIE_NAME,
  getSessionCookieOptions,
  signSessionToken,
} from '@/lib/auth/session';
import { ghiNhatKy } from '@/lib/nhat-ky';

const ChangePasswordSchema = z.object({
  mat_khau_cu: z.string(),
  mat_khau_moi: z.string(),
});

export async function POST(request: Request): Promise<Response> {
  const auth = await requireUser();
  if (auth instanceof Response) return auth;
  const user = auth;

  let rawBody: unknown;
  try {
    rawBody = await request.json();
  } catch {
    return Response.json({ error: 'Dữ liệu gửi lên không hợp lệ' }, { status: 400 });
  }

  const parsed = ChangePasswordSchema.safeParse(rawBody);
  if (!parsed.success) {
    return Response.json(
      { error: 'Vui lòng nhập đầy đủ mật khẩu cũ và mật khẩu mới' },
      { status: 400 },
    );
  }

  const { mat_khau_cu, mat_khau_moi } = parsed.data;
  if (!mat_khau_cu) {
    return Response.json({ error: 'Vui lòng nhập mật khẩu hiện tại' }, { status: 400 });
  }
  if (!mat_khau_moi || mat_khau_moi.length < 8) {
    return Response.json(
      { error: 'Mật khẩu mới phải có ít nhất 8 ký tự' },
      { status: 400 },
    );
  }
  if (mat_khau_moi.length > 128) {
    return Response.json(
      { error: 'Mật khẩu mới không được vượt quá 128 ký tự' },
      { status: 400 },
    );
  }

  const sql = getSql();
  const rows = await sql<{ password_hash: string | null }[]>`
    SELECT password_hash
    FROM users
    WHERE id = ${user.id} AND active = true
    LIMIT 1
  `;
  const row = rows[0];
  if (!row || !row.password_hash) {
    return Response.json({ error: 'Tài khoản không hợp lệ' }, { status: 400 });
  }

  const oldMatches = await verifyPassword(mat_khau_cu, row.password_hash);
  if (!oldMatches) {
    return Response.json({ error: 'Mật khẩu hiện tại không đúng' }, { status: 400 });
  }

  const newPasswordHash = await hashPassword(mat_khau_moi);

  const newSessionVersion = await sql.begin(async (tx) => {
    const q = tx as unknown as typeof sql;
    const updated = await q<{ session_version: number }[]>`
      UPDATE users
      SET password_hash = ${newPasswordHash},
          session_version = session_version + 1,
          last_seen_at = now()
      WHERE id = ${user.id}
      RETURNING session_version
    `;
    // KHÔNG ghi mật khẩu vào nhật ký
    await ghiNhatKy(
      {
        userId: user.id,
        hanhDong: 'doi_mat_khau',
        doiTuong: 'auth',
        doiTuongId: user.id,
        ghiChu: user.username,
      },
      tx,
    );
    return updated[0].session_version;
  });

  const newToken = await signSessionToken({
    uid: user.id,
    sv: newSessionVersion,
    role: user.role,
  });

  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE_NAME, newToken, getSessionCookieOptions());

  return Response.json({ ok: true });
}
