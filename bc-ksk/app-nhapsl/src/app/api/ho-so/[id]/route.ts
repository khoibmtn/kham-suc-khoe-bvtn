import { requireUser } from '@/lib/auth/guard';
import { docBody, docId, xuLyLoi } from '@/lib/ra-soat/loi';
import { suaHoSo } from '@/lib/ra-soat/ho-so';
import { hoSoSuaSchema } from '@/lib/ra-soat/schemas';

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const auth = await requireUser();
  if (auth instanceof Response) return auth;
  try {
    const id = docId((await params).id);
    const body = await docBody(req, hoSoSuaSchema);
    return Response.json({ ho_so: await suaHoSo(auth, id, body) });
  } catch (e) {
    return xuLyLoi(e);
  }
}
