import { requireAdmin } from '@/lib/auth/guard';
import { docBody, xuLyLoi } from '@/lib/ra-soat/loi';
import { moKhoaBuoi } from '@/lib/ra-soat/xac-nhan-buoi';
import { moKhoaSchema } from '@/lib/ra-soat/schemas';

export async function POST(req: Request, { params }: { params: Promise<{ key: string }> }): Promise<Response> {
  const auth = await requireAdmin();
  if (auth instanceof Response) return auth;
  try {
    const { key } = await params;
    const b = await docBody(req, moKhoaSchema);
    return Response.json(await moKhoaBuoi(auth, key, b.ly_do));
  } catch (e) {
    return xuLyLoi(e);
  }
}
