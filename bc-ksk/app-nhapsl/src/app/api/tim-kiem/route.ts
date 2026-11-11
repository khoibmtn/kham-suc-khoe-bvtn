import { z } from 'zod';
import { requireUser } from '@/lib/auth/guard';
import { LoiNghiepVu, xuLyLoi } from '@/lib/ra-soat/loi';
import { timKiem } from '@/lib/ra-soat/tim-kiem';

const querySchema = z.object({
  q: z.string().max(200).default(''),
  pham_vi: z.enum(['buoi', 'cua_toi', 'kho_chung', 'tat_ca']).default('cua_toi'),
  buoi: z.string().max(40).optional(),
});

export async function GET(req: Request): Promise<Response> {
  const auth = await requireUser();
  if (auth instanceof Response) return auth;
  try {
    const p = new URL(req.url).searchParams;
    const kq = querySchema.safeParse({
      q: p.get('q') ?? undefined,
      pham_vi: p.get('pham_vi') ?? undefined,
      buoi: p.get('buoi') ?? undefined,
    });
    if (!kq.success) throw new LoiNghiepVu(400, 'Phạm vi tìm kiếm hoặc từ khóa không hợp lệ');
    return Response.json(await timKiem(auth, kq.data));
  } catch (e) {
    return xuLyLoi(e);
  }
}
