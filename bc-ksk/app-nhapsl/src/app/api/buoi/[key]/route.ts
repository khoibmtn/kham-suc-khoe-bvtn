import { getSql } from '@/db/client';
import { requireAdmin, requireUser } from '@/lib/auth/guard';
import { docBody, xuLyLoi } from '@/lib/ra-soat/loi';
import { layBuoiCoQuyen } from '@/lib/ra-soat/buoi';
import { suaBuoi } from '@/lib/ra-soat/buoi-admin';
import { suaBuoiSchema } from '@/lib/ra-soat/schemas';

type Ctx = { params: Promise<{ key: string }> };

export async function GET(_req: Request, { params }: Ctx): Promise<Response> {
  const auth = await requireUser();
  if (auth instanceof Response) return auth;
  try {
    const { key } = await params;
    return Response.json({ buoi: await layBuoiCoQuyen(getSql(), auth, key) });
  } catch (e) {
    return xuLyLoi(e);
  }
}

export async function PATCH(req: Request, { params }: Ctx): Promise<Response> {
  const auth = await requireAdmin();
  if (auth instanceof Response) return auth;
  try {
    const { key } = await params;
    return Response.json({ buoi: await suaBuoi(auth, key, await docBody(req, suaBuoiSchema)) });
  } catch (e) {
    return xuLyLoi(e);
  }
}
