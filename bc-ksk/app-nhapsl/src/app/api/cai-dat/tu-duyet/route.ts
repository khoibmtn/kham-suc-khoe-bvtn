import { requireAdmin, requireUser } from '@/lib/auth/guard';
import { docBody, xuLyLoi } from '@/lib/ra-soat/loi';
import { docTuDuyet, ghiTuDuyet } from '@/lib/ra-soat/cai-dat';
import { tuDuyetSchema } from '@/lib/ra-soat/schemas';

export async function GET(): Promise<Response> {
  const auth = await requireUser();
  if (auth instanceof Response) return auth;
  try {
    return Response.json({ tu_duyet: await docTuDuyet() });
  } catch (e) {
    return xuLyLoi(e);
  }
}

export async function PUT(req: Request): Promise<Response> {
  const auth = await requireAdmin();
  if (auth instanceof Response) return auth;
  try {
    return Response.json(await ghiTuDuyet(auth, await docBody(req, tuDuyetSchema)));
  } catch (e) {
    return xuLyLoi(e);
  }
}
