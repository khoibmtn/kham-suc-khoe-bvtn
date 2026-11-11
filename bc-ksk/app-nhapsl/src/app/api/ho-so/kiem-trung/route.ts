import { requireUser } from '@/lib/auth/guard';
import { docBody, xuLyLoi } from '@/lib/ra-soat/loi';
import { kiemTrung } from '@/lib/ra-soat/them-ho-so';
import { kiemTrungSchema } from '@/lib/ra-soat/schemas';

export async function POST(req: Request): Promise<Response> {
  const auth = await requireUser();
  if (auth instanceof Response) return auth;
  try {
    return Response.json(await kiemTrung(auth, await docBody(req, kiemTrungSchema)));
  } catch (e) {
    return xuLyLoi(e);
  }
}
