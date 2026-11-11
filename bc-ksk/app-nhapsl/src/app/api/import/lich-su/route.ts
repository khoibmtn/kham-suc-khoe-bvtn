import { requireAdmin } from '@/lib/auth/guard';
import { lichSuNap } from '@/lib/import/api';
import { xuLyLoi } from '@/lib/ra-soat/loi';


export async function GET(): Promise<Response> {
  const auth = await requireAdmin();
  if (auth instanceof Response) return auth;
  try {
    return Response.json(await lichSuNap(), { headers: { 'Cache-Control': 'no-store' } });
  } catch (e) {
    return xuLyLoi(e);
  }
}
