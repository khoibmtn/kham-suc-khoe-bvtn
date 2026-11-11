import { getSql } from '@/db/client';
import { requireUser } from '@/lib/auth/guard';
import { docBody, xuLyLoi } from '@/lib/ra-soat/loi';
import { layBuoiCoQuyen } from '@/lib/ra-soat/buoi';
import { hoSoCuaBuoi } from '@/lib/ra-soat/ho-so';
import { themHoSo } from '@/lib/ra-soat/them-ho-so';
import { themHoSoSchema } from '@/lib/ra-soat/schemas';

export async function GET(_req: Request, { params }: { params: Promise<{ key: string }> }): Promise<Response> {
  const auth = await requireUser();
  if (auth instanceof Response) return auth;
  try {
    const { key } = await params;
    const sql = getSql();
    const buoi = await layBuoiCoQuyen(sql, auth, key);
    return Response.json({ buoi, ho_so: await hoSoCuaBuoi(sql, buoi.id) });
  } catch (e) {
    return xuLyLoi(e);
  }
}

export async function POST(req: Request, { params }: { params: Promise<{ key: string }> }): Promise<Response> {
  const auth = await requireUser();
  if (auth instanceof Response) return auth;
  try {
    const { key } = await params;
    return Response.json(await themHoSo(auth, key, await docBody(req, themHoSoSchema)));
  } catch (e) {
    return xuLyLoi(e);
  }
}
