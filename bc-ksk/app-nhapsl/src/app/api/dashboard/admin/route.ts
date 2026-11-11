import { requireAdmin } from '@/lib/auth/guard';
import { xuLyLoi } from '@/lib/ra-soat/loi';
import { dashboardAdmin } from '@/lib/ra-soat/dashboard';

export async function GET(): Promise<Response> {
  const auth = await requireAdmin();
  if (auth instanceof Response) return auth;
  try {
    return Response.json(await dashboardAdmin());
  } catch (e) {
    return xuLyLoi(e);
  }
}
