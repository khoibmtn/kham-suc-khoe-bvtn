// CSV cho Cowork: UTF-8 có BOM, RFC 4180, xuống dòng \r\n.
const BOM = '﻿';

export function thoatO(v: unknown): string {
  const s = v === null || v === undefined ? '' : String(v);
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function taoCsv(header: readonly string[], rows: Iterable<readonly unknown[]>): Buffer {
  const out: string[] = [header.map(thoatO).join(',')];
  for (const r of rows) out.push(r.map(thoatO).join(','));
  return Buffer.from(BOM + out.join('\r\n') + '\r\n', 'utf8');
}
