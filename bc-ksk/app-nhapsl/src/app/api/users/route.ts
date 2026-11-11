import { requireAdmin } from '@/lib/auth/guard';
import { docBody, xuLyLoi } from '@/lib/ra-soat/loi';
import { danhSachUser, taoUser } from '@/lib/ra-soat/users';
import { taoUserSchema } from '@/lib/ra-soat/schemas';

export async function GET(): Promise<Response> {
  const auth = await requireAdmin();
  if (auth instanceof Response) return auth;
  try {
    return Response.json({ users: await danhSachUser() });
  } catch (e) {
    return xuLyLoi(e);
  }
}

export async function POST(req: Request): Promise<Response> {
  const auth = await requireAdmin();
  if (auth instanceof Response) return auth;
  try {
    return Response.json({ user: await taoUser(auth, await docBody(req, taoUserSchema)) });
  } catch (e) {
    return xuLyLoi(e);
  }
}
