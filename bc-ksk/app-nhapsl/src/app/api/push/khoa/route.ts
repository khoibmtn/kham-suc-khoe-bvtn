import { requireUser } from '@/lib/auth/guard';
import { cauHinhVapid } from '@/lib/push';

export async function GET(): Promise<Response> {
  const auth = await requireUser();
  if (auth instanceof Response) return auth;
  return Response.json({ public_key: cauHinhVapid()?.publicKey ?? null });
}
