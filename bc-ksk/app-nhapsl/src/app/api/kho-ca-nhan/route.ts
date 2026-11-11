import { requireUser } from '@/lib/auth/guard';
import { docId, xuLyLoi } from '@/lib/ra-soat/loi';
import { khoCaNhan } from '@/lib/ra-soat/chuyen';

export async function GET(req: Request): Promise<Response> {
  const auth = await requireUser();
  if (auth instanceof Response) return auth;
  try {
    const u = new URL(req.url).searchParams.get('user');
    return Response.json(await khoCaNhan(auth, u ? docId(u, 'user') : undefined));
  } catch (e) {
    return xuLyLoi(e);
  }
}
