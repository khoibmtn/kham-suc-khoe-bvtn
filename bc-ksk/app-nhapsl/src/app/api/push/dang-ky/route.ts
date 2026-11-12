import { requireUser } from '@/lib/auth/guard';
import { docBody, xuLyLoi } from '@/lib/ra-soat/loi';
import { pushDangKySchema } from '@/lib/ra-soat/schemas';
import { dangKyPush } from '@/lib/push';

export async function POST(req: Request): Promise<Response> {
  const auth = await requireUser();
  if (auth instanceof Response) return auth;
  try {
    return Response.json(await dangKyPush(auth, await docBody(req, pushDangKySchema)));
  } catch (e) {
    return xuLyLoi(e);
  }
}
