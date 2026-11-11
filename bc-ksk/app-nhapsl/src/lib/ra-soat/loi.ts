import type { ZodType } from 'zod';

/** Lỗi nghiệp vụ có mã HTTP; `body` được trộn vào JSON trả về (vd. bản hiện tại khi 409). */
export class LoiNghiepVu extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly body?: Record<string, unknown>,
  ) {
    super(message);
    this.name = 'LoiNghiepVu';
  }
}

/** Chuyển lỗi bất kỳ thành Response. Không log dữ liệu cá nhân. */
export function xuLyLoi(e: unknown): Response {
  if (e instanceof LoiNghiepVu) {
    return Response.json({ error: e.message, ...(e.body ?? {}) }, { status: e.status });
  }
  console.error('Lỗi máy chủ (ra-soat):', e instanceof Error ? e.name : typeof e);
  return Response.json({ error: 'Lỗi máy chủ' }, { status: 500 });
}

/** Đọc JSON body và kiểm bằng zod; sai → LoiNghiepVu 400 tiếng Việt. */
export async function docBody<T>(req: Request, schema: ZodType<T>): Promise<T> {
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    throw new LoiNghiepVu(400, 'Dữ liệu gửi lên không phải JSON hợp lệ');
  }
  const kq = schema.safeParse(raw);
  if (kq.success) return kq.data;
  const is = kq.error.issues[0];
  const truong = is.path.join('.');
  if (is.code === 'invalid_type') {
    throw new LoiNghiepVu(400, truong ? `Trường "${truong}" có kiểu dữ liệu không hợp lệ` : 'Dữ liệu gửi lên không hợp lệ');
  }
  if (is.code === 'unrecognized_keys') {
    throw new LoiNghiepVu(400, `Trường không được phép: ${(is as unknown as { keys: string[] }).keys.join(', ')}`);
  }
  throw new LoiNghiepVu(400, is.message || 'Dữ liệu gửi lên không hợp lệ');
}

/** Tham số đường dẫn số nguyên dương. */
export function docId(s: string, ten = 'id'): number {
  if (!/^\d{1,9}$/.test(s) || Number(s) < 1) throw new LoiNghiepVu(400, `Tham số ${ten} không hợp lệ`);
  return Number(s);
}
