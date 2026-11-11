import { cookies } from 'next/headers';
import { getCurrentUser } from '@/lib/auth/guard';
import { SESSION_COOKIE_NAME, getSessionCookieOptions } from '@/lib/auth/session';
import { ghiNhatKy } from '@/lib/nhat-ky';

export async function POST(): Promise<Response> {
  const user = await getCurrentUser();

  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE_NAME, '', getSessionCookieOptions(0));

  if (user) {
    await ghiNhatKy({
      userId: user.id,
      hanhDong: 'dang_xuat',
      doiTuong: 'auth',
      doiTuongId: user.id,
      ghiChu: user.username,
    });
  }

  return Response.json({ ok: true });
}
