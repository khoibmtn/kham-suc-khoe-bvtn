import { requireUser } from '@/lib/auth/guard';
import { docId, xuLyLoi } from '@/lib/ra-soat/loi';
import { lichSuHoSo } from '@/lib/ra-soat/ho-so';

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const auth = await requireUser();
  if (auth instanceof Response) return auth;
  try {
    return Response.json({ lich_su: await lichSuHoSo(auth, docId((await params).id)) });
  } catch (e) {
    return xuLyLoi(e);
  }
}
