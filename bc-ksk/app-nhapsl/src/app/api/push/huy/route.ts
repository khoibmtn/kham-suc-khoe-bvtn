import { requireUser } from '@/lib/auth/guard';
import { docBody, xuLyLoi } from '@/lib/ra-soat/loi';
import { pushHuySchema } from '@/lib/ra-soat/schemas';
import { huyPush } from '@/lib/push';

export async function POST(req: Request): Promise<Response> {
  const auth = await requireUser();
  if (auth instanceof Response) return auth;
  try {
    return Response.json(await huyPush(auth, await docBody(req, pushHuySchema)));
  } catch (e) {
    return xuLyLoi(e);
  }
}
