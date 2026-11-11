// Định dạng thời điểm theo giờ Việt Nam (UTC+7, không có giờ mùa hè).
const VN_MS = 7 * 3600_000;
const p2 = (n: number) => String(n).padStart(2, '0');

function phan(d: Date) {
  const v = new Date(d.getTime() + VN_MS);
  return { y: v.getUTCFullYear(), m: p2(v.getUTCMonth() + 1), d: p2(v.getUTCDate()), H: p2(v.getUTCHours()), M: p2(v.getUTCMinutes()), S: p2(v.getUTCSeconds()) };
}

/** dd/mm/yyyy HH:mm */
export function ddmmyyyyHHmm(d: Date | string | null): string {
  if (!d) return '';
  const t = phan(new Date(d));
  return `${t.d}/${t.m}/${t.y} ${t.H}:${t.M}`;
}

/** yyyymmdd-HHMM (tên file / thư mục) */
export function dauThoiGian(d: Date): string {
  const t = phan(d);
  return `${t.y}${t.m}${t.d}-${t.H}${t.M}`;
}

/** 'yyyy-mm-dd' → 'dd/mm/yyyy' */
export function ngayVN(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : iso;
}
