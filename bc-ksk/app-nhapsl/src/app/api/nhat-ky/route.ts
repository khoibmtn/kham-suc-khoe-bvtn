import { requireAdmin } from '@/lib/auth/guard';
import { xuLyLoi } from '@/lib/ra-soat/loi';
import { docNhatKyQuery, nhatKyAdmin } from '@/lib/ra-soat/nhat-ky-admin';

export async function GET(req: Request): Promise<Response> {
  const auth = await requireAdmin();
  if (auth instanceof Response) return auth;
  try {
    return Response.json(await nhatKyAdmin(docNhatKyQuery(new URL(req.url).searchParams)));
  } catch (e) {
    return xuLyLoi(e);
  }
}
