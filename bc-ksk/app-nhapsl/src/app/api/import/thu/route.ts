import { requireAdmin } from '@/lib/auth/guard';
import { xuLyUpload } from '@/lib/import/api';
import { LoiNghiepVu, xuLyLoi } from '@/lib/ra-soat/loi';

export const maxDuration = 60;

export async function POST(request: Request): Promise<Response> {
  const auth = await requireAdmin();
  if (auth instanceof Response) return auth;
  try {
    const form = await request.formData().catch(() => {
      throw new LoiNghiepVu(400, 'Cần gửi multipart/form-data gồm 4 file của gói');
    });
    return Response.json(await xuLyUpload(form, false, auth.username));
  } catch (e) {
    return xuLyLoi(e);
  }
}
