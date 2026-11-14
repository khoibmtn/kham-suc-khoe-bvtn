import { z } from 'zod';
import { requireUser } from '@/lib/auth/guard';
import { CLS_KEYS } from '@/lib/cls';
import { LoiNghiepVu, xuLyLoi } from '@/lib/ra-soat/loi';
import { timKiem, type BoLoc } from '@/lib/ra-soat/tim-kiem';

const querySchema = z.object({
  q: z.string().max(200).default(''),
  pham_vi: z.enum(['buoi', 'cua_toi', 'kho_chung', 'tat_ca']).default('cua_toi'),
  buoi: z.string().max(40).optional(),
  trang: z.coerce.number().int().min(1).max(100000).optional(),
  co_trang: z.coerce.number().int().min(10).max(200).optional(),
});

const ngayHopLe = (s: string) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = new Date(s + 'T00:00:00Z');
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
};

const locSchema = z.object({
  don_vi: z.enum(['TN', 'LK', 'VK']).optional(),
  ngay: z.string().refine(ngayHopLe).optional(),
  xac_nhan: z.enum(['da', 'chua']).optional(),
  phu_trach: z.string().regex(/^\d{1,9}$/).transform(Number).optional(),
  co_ghi_chu: z.enum(['1', '0']).optional(),
  tt_ksk: z.enum(['co', 'khong']).optional(),
  nguon: z.enum(['his', 'them_tay', 'kho_chung']).optional(),
  vi_tri: z.enum(['buoi', 'kho_ca_nhan', 'kho_chung', 'da_loai']).optional(),
  nghi_nham_so: z.enum(['1', '0']).optional(),
});
const clsSchema = z.enum(['co', 'khong']);

const TEN_LOC: Record<string, string> = {
  don_vi: 'đơn vị', ngay: 'ngày khám', xac_nhan: 'xác nhận', phu_trach: 'người phụ trách',
  co_ghi_chu: 'ghi chú', tt_ksk: 'thông tin KSK', nguon: 'nguồn', vi_tri: 'vị trí', nghi_nham_so: 'nghi nhầm số',
};

function docBoLoc(p: URLSearchParams): BoLoc {
  const tho: Record<string, string | undefined> = {};
  for (const k of Object.keys(TEN_LOC)) tho[k] = p.get(k) || undefined;
  const kq = locSchema.safeParse(tho);
  if (!kq.success) {
    const k = String(kq.error.issues[0]?.path[0] ?? '');
    throw new LoiNghiepVu(400, `Bộ lọc "${TEN_LOC[k] ?? k}" có giá trị không hợp lệ`);
  }
  const d = kq.data;
  const cls: NonNullable<BoLoc['cls']> = {};
  for (const key of CLS_KEYS) {
    const v = p.get('cls_' + key);
    if (!v) continue;
    const r = clsSchema.safeParse(v);
    if (!r.success) throw new LoiNghiepVu(400, `Bộ lọc cận lâm sàng "${key}" có giá trị không hợp lệ (co hoặc khong)`);
    cls[key] = r.data;
  }
  return {
    don_vi: d.don_vi, ngay: d.ngay, xac_nhan: d.xac_nhan, phu_trach: d.phu_trach,
    co_ghi_chu: d.co_ghi_chu === undefined ? undefined : d.co_ghi_chu === '1',
    tt_ksk: d.tt_ksk, nguon: d.nguon, vi_tri: d.vi_tri,
    nghi_nham_so: d.nghi_nham_so === undefined ? undefined : d.nghi_nham_so === '1',
    cls: Object.keys(cls).length ? cls : undefined,
  };
}

export async function GET(req: Request): Promise<Response> {
  const auth = await requireUser();
  if (auth instanceof Response) return auth;
  try {
    const p = new URL(req.url).searchParams;
    const kq = querySchema.safeParse({
      q: p.get('q') ?? undefined,
      pham_vi: p.get('pham_vi') ?? undefined,
      buoi: p.get('buoi') ?? undefined,
      trang: p.get('trang') ?? undefined,
      co_trang: p.get('co_trang') ?? undefined,
    });
    if (!kq.success) throw new LoiNghiepVu(400, 'Phạm vi tìm kiếm hoặc từ khóa không hợp lệ');
    return Response.json(await timKiem(auth, { ...kq.data, loc: docBoLoc(p) }));
  } catch (e) {
    return xuLyLoi(e);
  }
}
