import JSZip from 'jszip';
import { requireAdmin } from '@/lib/auth/guard';
import { ghiNhatKy } from '@/lib/nhat-ky';
import { taoGoiCowork } from '@/lib/bao-cao/cowork';
import { dauThoiGian } from '@/lib/bao-cao/thoi-gian';
import { xuLyLoi } from '@/lib/ra-soat/loi';

export const maxDuration = 60;

export async function GET(): Promise<Response> {
  const auth = await requireAdmin();
  if (auth instanceof Response) return auth;
  try {
    const files = await taoGoiCowork();
    const zip = new JSZip();
    for (const [ten, buf] of Object.entries(files)) zip.file(ten, buf);
    const out = await zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE' });
    await ghiNhatKy({ userId: auth.id, hanhDong: 'xuat_cowork', doiTuong: 'export', ghiChu: 'web' });
    return new Response(out as Uint8Array<ArrayBuffer>, {
      headers: {
        'Content-Type': 'application/zip',
        'Content-Disposition': `attachment; filename="cowork-${dauThoiGian(new Date())}.zip"`,
        'Cache-Control': 'no-store',
      },
    });
  } catch (e) {
    return xuLyLoi(e);
  }
}
