import { cookies } from 'next/headers';
import { getSql } from '@/db/client';
import {
  SESSION_COOKIE_NAME,
  verifySessionToken,
  type UserRole,
} from './session';

export type AuthUser = {
  id: number;
  username: string;
  ho_ten: string;
  role: UserRole;
  session_version: number;
};

type DbUserRow = {
  id: number;
  username: string;
  ho_ten: string;
  role: UserRole;
  active: boolean;
  session_version: number;
  last_seen_at: Date | string | null;
};

const LAST_SEEN_INTERVAL_MS = 60_000;

export async function getCurrentUser(): Promise<AuthUser | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  if (!token) return null;

  const payload = await verifySessionToken(token);
  if (!payload) return null;

  const sql = getSql();
  const rows = await sql<DbUserRow[]>`
    SELECT id, username, ho_ten, role, active, session_version, last_seen_at
    FROM users
    WHERE id = ${payload.uid}
    LIMIT 1
  `;

  const row = rows[0];
  if (!row || !row.active || row.session_version !== payload.sv) {
    return null;
  }

  const lastSeenMs = row.last_seen_at ? new Date(row.last_seen_at).getTime() : 0;
  if (!lastSeenMs || Date.now() - lastSeenMs >= LAST_SEEN_INTERVAL_MS) {
    await sql`
      UPDATE users
      SET last_seen_at = now()
      WHERE id = ${row.id}
        AND (last_seen_at IS NULL OR last_seen_at < now() - interval '1 minute')
    `;
  }

  return {
    id: row.id,
    username: row.username,
    ho_ten: row.ho_ten,
    role: row.role,
    session_version: row.session_version,
  };
}

export async function requireUser(): Promise<AuthUser | Response> {
  const user = await getCurrentUser();
  if (!user) {
    return Response.json(
      { error: 'Chưa đăng nhập hoặc phiên làm việc đã hết hạn' },
      { status: 401 },
    );
  }
  return user;
}

export async function requireAdmin(): Promise<AuthUser | Response> {
  const auth = await requireUser();
  if (auth instanceof Response) return auth;
  if (auth.role !== 'admin') {
    return Response.json(
      { error: 'Chỉ quản trị viên mới có quyền thực hiện thao tác này' },
      { status: 403 },
    );
  }
  return auth;
}
