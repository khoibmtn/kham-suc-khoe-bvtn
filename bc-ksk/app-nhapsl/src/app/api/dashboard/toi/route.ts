import { requireUser } from '@/lib/auth/guard';
import { xuLyLoi } from '@/lib/ra-soat/loi';
import { dashboardToi } from '@/lib/ra-soat/dashboard';

export async function GET(): Promise<Response> {
  const auth = await requireUser();
  if (auth instanceof Response) return auth;
  try {
    return Response.json(await dashboardToi(auth));
  } catch (e) {
    return xuLyLoi(e);
  }
}
