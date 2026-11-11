import { requireAdmin } from '@/lib/auth/guard';
import { docBody, xuLyLoi } from '@/lib/ra-soat/loi';
import { phanCongTheoGoiY } from '@/lib/ra-soat/phan-cong';
import { theoGoiYSchema } from '@/lib/ra-soat/schemas';

export async function POST(req: Request): Promise<Response> {
  const auth = await requireAdmin();
  if (auth instanceof Response) return auth;
  try {
    // Body có thể trống → ghi_de = false
    const text = await req.text();
    const b = text.trim() ? await docBody(new Request(req.url, { method: 'POST', body: text }), theoGoiYSchema) : {};
    return Response.json(await phanCongTheoGoiY(auth, (b as { ghi_de?: boolean }).ghi_de === true));
  } catch (e) {
    return xuLyLoi(e);
  }
}
