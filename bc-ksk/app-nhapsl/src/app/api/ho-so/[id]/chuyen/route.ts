import { requireUser } from '@/lib/auth/guard';
import { docBody, docId, xuLyLoi } from '@/lib/ra-soat/loi';
import { chuyenHoSo } from '@/lib/ra-soat/chuyen';
import { chuyenSchema } from '@/lib/ra-soat/schemas';

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const auth = await requireUser();
  if (auth instanceof Response) return auth;
  try {
    const id = docId((await params).id);
    return Response.json(await chuyenHoSo(auth, id, await docBody(req, chuyenSchema)));
  } catch (e) {
    return xuLyLoi(e);
  }
}
