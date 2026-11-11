import { requireAdmin } from '@/lib/auth/guard';
import { docId, xuLyLoi } from '@/lib/ra-soat/loi';
import { datLaiMatKhau } from '@/lib/ra-soat/users';

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const auth = await requireAdmin();
  if (auth instanceof Response) return auth;
  try {
    await datLaiMatKhau(auth, docId((await params).id));
    return Response.json({ ok: true });
  } catch (e) {
    return xuLyLoi(e);
  }
}
