import { requireUser } from '@/lib/auth/guard';

export async function GET(): Promise<Response> {
  const auth = await requireUser();
  if (auth instanceof Response) return auth;

  return Response.json({
    id: auth.id,
    username: auth.username,
    ho_ten: auth.ho_ten,
    role: auth.role,
  });
}
