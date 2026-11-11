import { requireUser } from '@/lib/auth/guard';
import { xuLyLoi } from '@/lib/ra-soat/loi';
import { khoChung } from '@/lib/ra-soat/chuyen';

export async function GET(req: Request): Promise<Response> {
  const auth = await requireUser();
  if (auth instanceof Response) return auth;
  try {
    const p = new URL(req.url).searchParams;
    return Response.json(await khoChung(auth, { don_vi: p.get('don_vi'), q: (p.get('q') ?? '').slice(0, 200) }));
  } catch (e) {
    return xuLyLoi(e);
  }
}
