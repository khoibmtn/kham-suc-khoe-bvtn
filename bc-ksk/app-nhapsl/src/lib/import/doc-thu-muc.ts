// CLI/test-only: read a package directory from disk. Kept out of goi.ts so web routes
// (which receive uploaded files) never import node:fs and Next does not trace the project tree.
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { parseGoi, TEN_FILE, type KetQuaGoi } from './goi';

/** Đọc 4 file của một thư mục gói thành Buffer rồi gọi parseGoi. */
export async function docGoiTuThuMuc(dir: string): Promise<KetQuaGoi> {
  const files: Record<string, Buffer> = {};
  const loi: string[] = [];
  for (const ten of TEN_FILE) {
    try {
      files[ten] = await readFile(path.join(dir, ten));
    } catch {
      loi.push(`Không đọc được ${path.join(dir, ten)}`);
    }
  }
  if (loi.length) return { ok: false, errors: loi, warnings: [], goi: null };
  return parseGoi(files);
}
