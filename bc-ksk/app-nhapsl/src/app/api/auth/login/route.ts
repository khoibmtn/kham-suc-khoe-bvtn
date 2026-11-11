import { cookies } from 'next/headers';
import { z } from 'zod';
import { getSql } from '@/db/client';
import { ghiNhatKy } from '@/lib/nhat-ky';
import { verifyPassword } from '@/lib/auth/password';
import {
  SESSION_COOKIE_NAME,
  getSessionCookieOptions,
  signSessionToken,
  type UserRole,
} from '@/lib/auth/session';

const LoginBodySchema = z.object({
  username: z.string(),
  password: z.string(),
});

const MAX_FAILED_ATTEMPTS = 10;
const GENERIC_AUTH_ERROR = 'Sai tên đăng nhập hoặc mật khẩu';
// Băm giả để tránh chênh lệch thời gian phản hồi khi user không tồn tại
const DUMMY_PASSWORD_HASH =
  '$2b$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy';

type LoginUserRow = {
  id: number;
  username: string;
  ho_ten: string;
  role: UserRole;
  password_hash: string | null;
  active: boolean;
  session_version: number;
};

export async function POST(request: Request): Promise<Response> {
  let rawBody: unknown;
  try {
    rawBody = await request.json();
  } catch {
    return Response.json({ error: 'Dữ liệu gửi lên không hợp lệ' }, { status: 400 });
  }

  const parsed = LoginBodySchema.safeParse(rawBody);
  if (!parsed.success) {
    return Response.json(
      { error: 'Vui lòng nhập tên đăng nhập và mật khẩu' },
      { status: 400 },
    );
  }

  const username = parsed.data.username.trim().toLowerCase();
  const password = parsed.data.password;

  if (!username || !password || username.length > 100 || password.length > 200) {
    return Response.json(
      { error: 'Vui lòng nhập tên đăng nhập và mật khẩu' },
      { status: 400 },
    );
  }

  const sql = getSql();

  const [{ cnt }] = await sql<{ cnt: number }[]>`
    SELECT count(*)::int AS cnt
    FROM dang_nhap_that_bai
    WHERE username = ${username}
      AND at > now() - interval '15 minutes'
  `;

  if (cnt >= MAX_FAILED_ATTEMPTS) {
    return Response.json(
      { error: 'Đăng nhập sai quá nhiều lần, thử lại sau 15 phút' },
      { status: 429 },
    );
  }

  const rows = await sql<LoginUserRow[]>`
    SELECT id, username, ho_ten, role, password_hash, active, session_version
    FROM users
    WHERE username = ${username}
    LIMIT 1
  `;
  const user = rows[0];

  const hashToCheck = user?.password_hash ?? DUMMY_PASSWORD_HASH;
  const passwordMatches = await verifyPassword(password, hashToCheck);

  if (!user || !user.active || !user.password_hash || !passwordMatches) {
    await sql`INSERT INTO dang_nhap_that_bai (username) VALUES (${username})`;
    await ghiNhatKy({
      userId: null,
      hanhDong: 'dang_nhap_that_bai',
      doiTuong: 'auth',
      ghiChu: username,
    });
    return Response.json({ error: GENERIC_AUTH_ERROR }, { status: 401 });
  }

  await sql`UPDATE users SET last_seen_at = now() WHERE id = ${user.id}`;
  await ghiNhatKy({
    userId: user.id,
    hanhDong: 'dang_nhap',
    doiTuong: 'auth',
    doiTuongId: user.id,
    ghiChu: user.username,
  });

  const token = await signSessionToken({
    uid: user.id,
    sv: user.session_version,
    role: user.role,
  });

  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE_NAME, token, getSessionCookieOptions());

  return Response.json({
    id: user.id,
    username: user.username,
    ho_ten: user.ho_ten,
    role: user.role,
  });
}
