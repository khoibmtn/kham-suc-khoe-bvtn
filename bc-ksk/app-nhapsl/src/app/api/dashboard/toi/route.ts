import { requireUser } from '@/lib/auth/guard';
import { quetTuDuyet } from '@/lib/ra-soat/tu-duyet';
import { xuLyLoi } from '@/lib/ra-soat/loi';
import { dashboardToi } from '@/lib/ra-soat/dashboard';

export async function GET(): Promise<Response> {
  const auth = await requireUser();
  if (auth instanceof Response) return auth;
  try {
    await quetTuDuyet();
    return Response.json(await dashboardToi(auth));
  } catch (e) {
    return xuLyLoi(e);
  }
}
