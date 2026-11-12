import { requireUser } from '@/lib/auth/guard';

export async function GET(): Promise<Response> {
  const auth = await requireUser();
  if (auth instanceof Response) return auth;
  return Response.json(
    { version: process.env.NEXT_PUBLIC_APP_VERSION ?? '' },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}
