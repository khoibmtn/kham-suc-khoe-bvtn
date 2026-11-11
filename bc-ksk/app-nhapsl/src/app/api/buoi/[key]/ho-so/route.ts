import { getSql } from '@/db/client';
import { requireUser } from '@/lib/auth/guard';
import { xuLyLoi } from '@/lib/ra-soat/loi';
import { layBuoiCoQuyen } from '@/lib/ra-soat/buoi';
import { hoSoCuaBuoi } from '@/lib/ra-soat/ho-so';

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
