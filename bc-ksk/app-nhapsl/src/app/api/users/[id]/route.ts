import { requireAdmin } from '@/lib/auth/guard';
import { docBody, docId, xuLyLoi } from '@/lib/ra-soat/loi';
import { suaUser } from '@/lib/ra-soat/users';
import { suaUserSchema } from '@/lib/ra-soat/schemas';

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const auth = await requireAdmin();
  if (auth instanceof Response) return auth;
  try {
    const id = docId((await params).id);
    return Response.json({ user: await suaUser(auth, id, await docBody(req, suaUserSchema)) });
  } catch (e) {
    return xuLyLoi(e);
  }
}
