import { requireUser } from '@/lib/auth/guard';
import { docBody, docId, xuLyLoi } from '@/lib/ra-soat/loi';
import { xacNhanHoSo } from '@/lib/ra-soat/ho-so';
import { versionSchema } from '@/lib/ra-soat/schemas';

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const auth = await requireUser();
  if (auth instanceof Response) return auth;
  try {
    const id = docId((await params).id);
    const { version } = await docBody(req, versionSchema);
    return Response.json(await xacNhanHoSo(auth, id, version, true));
  } catch (e) {
    return xuLyLoi(e);
  }
}
