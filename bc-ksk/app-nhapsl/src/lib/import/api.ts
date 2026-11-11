// Cầu nối API tải gói (admin): FormData → parseGoi → lapKeHoach/apDung. Tách khỏi route để test gọi trực tiếp.
import type { KeHoachNap } from '@/lib/api-types';
import { getSql } from '@/db/client';
import { LoiNghiepVu } from '@/lib/ra-soat/loi';
import { TEN_FILE, parseGoi } from './goi';
import { NapTuChoi, apDung, lapKeHoach, type KeHoach } from './nap';

export type KetQuaUpload = { ok: boolean; errors: string[]; warnings: string[]; ke_hoach: KeHoachNap | null };

/** KeHoach (camelCase, nội bộ) → KeHoachNap (snake_case, hợp đồng API). */
export function keHoachSangApi(kh: KeHoach): KeHoachNap {
  return {
    phien_ban: kh.phienBan,
    che_do: kh.cheDo,
    tu_choi: kh.tuChoi,
    buoi_them: kh.buoiThem,
    ho_so_them_tong: kh.hoSoThemTong,
    user_them: kh.userThem,
    tong_sau_nap: kh.tongSauNap,
    nap_lai: kh.napLai,
  };
}

async function docFiles(form: FormData): Promise<Record<string, Buffer>> {
  const files: Record<string, Buffer> = {};
  const thieu: string[] = [];
  for (const ten of TEN_FILE) {
    const v = form.get(ten) as unknown;
    if (v && typeof v === 'object' && typeof (v as Blob).arrayBuffer === 'function') {
      files[ten] = Buffer.from(await (v as Blob).arrayBuffer());
    } else thieu.push(ten);
  }
  if (thieu.length) throw new LoiNghiepVu(400, `Thiếu file: ${thieu.join(', ')}`);
  return files;
}

/** Chạy thử (ghi=false) hoặc ghi (ghi=true, chỉ khi gói hợp lệ và không bị từ chối). Thiếu file → LoiNghiepVu 400. */
export async function xuLyUpload(form: FormData, ghi: boolean, napBoi: string): Promise<KetQuaUpload> {
  const files = await docFiles(form);
  const force = form.get('force') === '1';
  const kq = parseGoi(files);
  if (!kq.ok || !kq.goi) return { ok: false, errors: kq.errors, warnings: kq.warnings, ke_hoach: null };
  const sql = getSql();
  if (!ghi) {
    const kh = await lapKeHoach(sql, kq.goi, { force });
    return { ok: true, errors: [], warnings: kq.warnings, ke_hoach: keHoachSangApi(kh) };
  }
  try {
    const kh = await apDung(sql, kq.goi, napBoi, { force });
    return { ok: true, errors: [], warnings: kq.warnings, ke_hoach: keHoachSangApi(kh) };
  } catch (e) {
    if (e instanceof NapTuChoi) {
      // Tính lại kế hoạch (chỉ đọc) để giao diện hiện đủ số liệu cùng lý do từ chối.
      const kh = await lapKeHoach(sql, kq.goi, { force });
      const api = keHoachSangApi({ ...kh, tuChoi: e.message });
      return { ok: false, errors: [e.message], warnings: kq.warnings, ke_hoach: api };
    }
    throw e;
  }
}

export async function lichSuNap(): Promise<{ lan_nap: { phien_ban: string; che_do: string; nap_boi: string; nap_luc: string; tom_tat: unknown }[] }> {
  const rows = await getSql()<{ phien_ban: string; che_do: string; nap_boi: string; nap_luc: Date; tom_tat: unknown }[]>`
    SELECT phien_ban, che_do, nap_boi, nap_luc, tom_tat FROM import_batches ORDER BY nap_luc DESC, id DESC`;
  return { lan_nap: rows.map((r) => ({ ...r, nap_luc: new Date(r.nap_luc).toISOString() })) };
}
