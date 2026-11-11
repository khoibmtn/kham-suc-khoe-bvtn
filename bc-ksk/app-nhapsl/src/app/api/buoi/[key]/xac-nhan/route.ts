import { requireUser } from '@/lib/auth/guard';
import { docBody, xuLyLoi } from '@/lib/ra-soat/loi';
import { xacNhanBuoi } from '@/lib/ra-soat/xac-nhan-buoi';
import { xacNhanBuoiSchema } from '@/lib/ra-soat/schemas';

export async function POST(req: Request, { params }: { params: Promise<{ key: string }> }): Promise<Response> {
  const auth = await requireUser();
  if (auth instanceof Response) return auth;
  try {
    const { key } = await params;
    const b = await docBody(req, xacNhanBuoiSchema);
    return Response.json(await xacNhanBuoi(auth, key, b.giai_trinh));
  } catch (e) {
    return xuLyLoi(e);
  }
}
