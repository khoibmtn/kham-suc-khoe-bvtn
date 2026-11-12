import { requireAdmin } from '@/lib/auth/guard';
import { quetTuDuyet } from '@/lib/ra-soat/tu-duyet';
import { xuLyLoi } from '@/lib/ra-soat/loi';
import { dashboardAdmin } from '@/lib/ra-soat/dashboard';

export async function GET(): Promise<Response> {
  const auth = await requireAdmin();
  if (auth instanceof Response) return auth;
  try {
    await quetTuDuyet();
    return Response.json(await dashboardAdmin());
  } catch (e) {
    return xuLyLoi(e);
  }
}
