import { requireUser } from '@/lib/auth/guard';
import { docBody, docId, xuLyLoi } from '@/lib/ra-soat/loi';
import { xuLyDeNghi } from '@/lib/ra-soat/de-nghi';
import { xuLyDeNghiSchema } from '@/lib/ra-soat/schemas';

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const auth = await requireUser();
  if (auth instanceof Response) return auth;
  try {
    const id = docId((await params).id);
    return Response.json(await xuLyDeNghi(auth, id, await docBody(req, xuLyDeNghiSchema)));
  } catch (e) {
    return xuLyLoi(e);
  }
}
