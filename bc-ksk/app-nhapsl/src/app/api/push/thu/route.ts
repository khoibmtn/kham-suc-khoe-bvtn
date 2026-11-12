import { requireUser } from '@/lib/auth/guard';
import { xuLyLoi } from '@/lib/ra-soat/loi';
import { guiThu } from '@/lib/push';

export async function POST(): Promise<Response> {
  const auth = await requireUser();
  if (auth instanceof Response) return auth;
  try {
    return Response.json(await guiThu(auth));
  } catch (e) {
    return xuLyLoi(e);
  }
}
