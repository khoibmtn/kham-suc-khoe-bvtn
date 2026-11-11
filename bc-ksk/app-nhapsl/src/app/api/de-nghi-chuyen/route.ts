import { requireUser } from '@/lib/auth/guard';
import { docBody, xuLyLoi } from '@/lib/ra-soat/loi';
import { danhSachDeNghi, taoDeNghi } from '@/lib/ra-soat/de-nghi';
import { deNghiSchema } from '@/lib/ra-soat/schemas';

export async function GET(req: Request): Promise<Response> {
  const auth = await requireUser();
  if (auth instanceof Response) return auth;
  try {
    return Response.json(await danhSachDeNghi(auth, new URL(req.url).searchParams.get('trang_thai')));
  } catch (e) {
    return xuLyLoi(e);
  }
}

export async function POST(req: Request): Promise<Response> {
  const auth = await requireUser();
  if (auth instanceof Response) return auth;
  try {
    return Response.json(await taoDeNghi(auth, await docBody(req, deNghiSchema)));
  } catch (e) {
    return xuLyLoi(e);
  }
}
