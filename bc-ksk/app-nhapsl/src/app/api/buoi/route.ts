import { getSql } from '@/db/client';
import { requireAdmin, requireUser } from '@/lib/auth/guard';
import { docBody, xuLyLoi } from '@/lib/ra-soat/loi';
import { danhSachBuoi } from '@/lib/ra-soat/buoi';
import { themBuoi } from '@/lib/ra-soat/buoi-admin';
import { themBuoiSchema } from '@/lib/ra-soat/schemas';

export async function GET(req: Request): Promise<Response> {
  const auth = await requireUser();
  if (auth instanceof Response) return auth;
  try {
    const p = new URL(req.url).searchParams;
    const buoi = await danhSachBuoi(getSql(), auth, { don_vi: p.get('don_vi'), phu_trach: p.get('phu_trach'), trang_thai: p.get('trang_thai') });
    return Response.json({ buoi });
  } catch (e) {
    return xuLyLoi(e);
  }
}

export async function POST(req: Request): Promise<Response> {
  const auth = await requireAdmin();
  if (auth instanceof Response) return auth;
  try {
    const buoi = await themBuoi(auth, await docBody(req, themBuoiSchema));
    return Response.json({ buoi });
  } catch (e) {
    return xuLyLoi(e);
  }
}
