import { SignJWT, jwtVerify } from 'jose';

export const SESSION_COOKIE_NAME = 'nhapsl_session';
export const SESSION_TTL_SECONDS = 12 * 60 * 60; // 12 giờ không hoạt động

export type UserRole = 'admin' | 'nhan_vien';

export type SessionPayload = {
  uid: number;
  sv: number;
  role: UserRole;
};

function getSecretKey(secretOverride?: string): Uint8Array {
  const secret = secretOverride ?? process.env.SESSION_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error('SESSION_SECRET chưa được cấu hình hợp lệ');
  }
  return new TextEncoder().encode(secret);
}

export async function signSessionToken(
  payload: SessionPayload,
  options?: { ttlSeconds?: number; secret?: string },
): Promise<string> {
  const ttl = options?.ttlSeconds ?? SESSION_TTL_SECONDS;
  const exp = Math.floor(Date.now() / 1000) + ttl;
  const key = getSecretKey(options?.secret);

  return new SignJWT({
    uid: payload.uid,
    sv: payload.sv,
    role: payload.role,
  })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(exp)
    .sign(key);
}

export async function verifySessionToken(
  token: string | undefined | null,
  options?: { secret?: string },
): Promise<SessionPayload | null> {
  if (!token) return null;
  try {
    const key = getSecretKey(options?.secret);
    const { payload } = await jwtVerify(token, key, {
      algorithms: ['HS256'],
    });

    const uid = payload.uid;
    const sv = payload.sv;
    const role = payload.role;

    if (
      typeof uid !== 'number' ||
      !Number.isInteger(uid) ||
      uid <= 0 ||
      typeof sv !== 'number' ||
      !Number.isInteger(sv) ||
      sv < 1 ||
      (role !== 'admin' && role !== 'nhan_vien')
    ) {
      return null;
    }

    return { uid, sv, role };
  } catch {
    return null;
  }
}

export function getSessionCookieOptions(maxAgeSeconds: number = SESSION_TTL_SECONDS) {
  return {
    httpOnly: true,
    sameSite: 'lax' as const,
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: maxAgeSeconds,
  };
}

/**
 * Chỉ cho phép đường dẫn nội bộ bắt đầu bằng một dấu '/', chống open-redirect.
 */
export function sanitizeNextPath(next: string | null | undefined): string {
  if (!next || typeof next !== 'string') return '/';
  const trimmed = next.trim();
  if (!trimmed.startsWith('/')) return '/';
  if (trimmed.startsWith('//')) return '/';
  if (trimmed.includes('\\')) return '/';
  if (/[\u0000-\u001F\u007F]/.test(trimmed)) return '/';

  try {
    const parsed = new URL(trimmed, 'http://localhost');
    if (parsed.origin !== 'http://localhost') return '/';
    if (parsed.pathname === '/dang-nhap' || parsed.pathname === '/api/auth/login') {
      return '/';
    }
    return `${parsed.pathname}${parsed.search}${parsed.hash}`;
  } catch {
    return '/';
  }
}
