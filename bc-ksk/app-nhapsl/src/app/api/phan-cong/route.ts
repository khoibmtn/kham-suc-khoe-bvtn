import { requireAdmin } from '@/lib/auth/guard';
import { docBody, xuLyLoi } from '@/lib/ra-soat/loi';
import { phanCong } from '@/lib/ra-soat/phan-cong';
import { phanCongSchema } from '@/lib/ra-soat/schemas';

export async function POST(req: Request): Promise<Response> {
  const auth = await requireAdmin();
  if (auth instanceof Response) return auth;
  try {
    const b = await docBody(req, phanCongSchema);
    return Response.json(await phanCong(auth, b.buoi_ids, b.user_id));
  } catch (e) {
    return xuLyLoi(e);
  }
}
