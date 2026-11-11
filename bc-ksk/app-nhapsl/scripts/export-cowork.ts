import './_env';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { closeDb } from '../src/db/client';
import { ghiNhatKy } from '../src/lib/nhat-ky';
import { taoGoiCowork } from '../src/lib/bao-cao/cowork';
import { dauThoiGian } from '../src/lib/bao-cao/thoi-gian';

async function main() {
  const t0 = Date.now();
  const files = await taoGoiCowork();
  const dir = path.resolve('handoff', 'export', dauThoiGian(new Date()));
  mkdirSync(dir, { recursive: true });
  for (const [ten, buf] of Object.entries(files)) writeFileSync(path.join(dir, ten), buf);
  const manifest = JSON.parse(files['manifest.json'].toString('utf8')) as { so_dong: Record<string, number> };
  await ghiNhatKy({ userId: null, hanhDong: 'xuat_cowork', doiTuong: 'export', ghiChu: 'cli' });
  console.log(`Đã ghi ${Object.keys(files).length} file vào ${dir} (${((Date.now() - t0) / 1000).toFixed(1)} giây)`);
  for (const [k, n] of Object.entries(manifest.so_dong)) console.log(`  ${k}: ${n} dòng`);
}

main()
  .catch((e) => { console.error('Lỗi xuất Cowork:', e instanceof Error ? e.message : e); process.exitCode = 1; })
  .finally(() => closeDb());
