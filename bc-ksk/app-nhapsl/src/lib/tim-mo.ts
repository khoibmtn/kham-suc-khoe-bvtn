// Ordered fuzzy search shared by the review screen (client-side filter + highlight) and
// /api/tim-kiem (SQL mirror in src/lib/ra-soat/tim-kiem.ts). Owner request 12/11/2026:
//   typing "ng anh" matches any text of the form *ng*anh* (tokens in order, anything between),
//   searched in the name and the note; matched letters are highlighted.
//
// Token classes (after normalisation):
//   - SO:   only digits, length >= 4  → nam_sinh equals it (4 digits) OR cccd / ma_kcb / so_dt /
//                                        so_the_bhyt contains it. Order-independent.
//   - MA:   letters AND digits (e.g. "gd4313") → so_the_bhyt or ma_kcb contains it, OR it matches as
//                                        a CHU token. Order-independent.
//   - CHU:  everything else (letters, short numbers, punctuation) → all CHU tokens must appear IN ORDER
//                                        as substrings of  ho_ten ␁ ghi_chu  (never spanning the separator).

const COMBINING = /[̀-ͯ]/g;

/** Per-character normalisation that KEEPS LENGTH (index i of output ↔ index i of NFC input). */
export function chuanHoa(s: string): string {
  const nfc = (s ?? '').normalize('NFC');
  let out = '';
  for (const ch of nfc) {
    let b = ch.normalize('NFD').replace(COMBINING, '');
    if (b === 'đ' || b === 'Đ') b = 'd';
    b = b.toLowerCase();
    // Guarantee 1:1 length so highlight ranges map back onto the original text.
    out += b.length === ch.length ? b : ch.toLowerCase().length === ch.length ? ch.toLowerCase() : ch;
  }
  return out;
}

export type LoaiTu = 'SO' | 'MA' | 'CHU';
export type TuKhoa = { tu: string; loai: LoaiTu };

export function tachTuKhoa(q: string): TuKhoa[] {
  return chuanHoa(q)
    .split(/\s+/)
    .filter(Boolean)
    .map((tu) => ({
      tu,
      loai: /^\d{4,}$/.test(tu) ? 'SO' : /^(?=.*\d)(?=.*[a-z])[a-z0-9]+$/.test(tu) ? 'MA' : 'CHU',
    }));
}

/** At least one token; the query is usable for searching. */
export function coTheTim(q: string): boolean {
  return tachTuKhoa(q).length > 0 && chuanHoa(q).replace(/\s/g, '').length >= 2;
}

export type Khoang = [start: number, end: number];

/**
 * Find CHU tokens in order inside `fields` (joined by an unbreakable separator).
 * Returns per-field highlight ranges (indices into the ORIGINAL field strings), or null if no match.
 * Greedy leftmost search is complete for "ordered substrings" matching.
 */
export function timTheoThuTu(tokens: string[], fields: string[]): Khoang[][] | null {
  const SEP = '\u0001';
  const norm = fields.map((f) => chuanHoa(f ?? ''));
  const hay = norm.join(SEP);
  const starts: number[] = [];
  let acc = 0;
  for (const n of norm) {
    starts.push(acc);
    acc += n.length + 1;
  }
  const out: Khoang[][] = fields.map(() => []);
  let pos = 0;
  for (const t of tokens) {
    const i = hay.indexOf(t, pos);
    if (i < 0) return null;
    let fi = starts.length - 1;
    while (fi > 0 && starts[fi] > i) fi--;
    out[fi].push([i - starts[fi], i - starts[fi] + t.length]);
    pos = i + t.length;
  }
  return out;
}

export type HoSoTim = {
  ho_ten: string;
  ghi_chu: string;
  nam_sinh: number | string;
  cccd: string;
  ma_kcb: string;
  so_dt?: string;
  so_the_bhyt?: string;
};

export type KetQuaKhop = {
  khop: boolean;
  /** Highlight ranges (original string indices) per displayed field. */
  danhDau: { ho_ten: Khoang[]; ghi_chu: Khoang[]; cccd: Khoang[]; ma_kcb: Khoang[]; nam_sinh: Khoang[] };
};

const rong = (): KetQuaKhop['danhDau'] => ({ ho_ten: [], ghi_chu: [], cccd: [], ma_kcb: [], nam_sinh: [] });

function themChua(ranges: Khoang[], text: string, tu: string): boolean {
  const i = chuanHoa(text ?? '').indexOf(tu);
  if (i < 0) return false;
  ranges.push([i, i + tu.length]);
  return true;
}

/** Full match of a query against one record (client-side mirror of the SQL in /api/tim-kiem). */
export function khopHoSo(tokens: TuKhoa[], h: HoSoTim): KetQuaKhop {
  const dd = rong();
  if (tokens.length === 0) return { khop: true, danhDau: dd };
  const chu: string[] = [];
  for (const t of tokens) {
    if (t.loai === 'SO') {
      const ns = String(h.nam_sinh ?? '');
      let ok = false;
      if (t.tu.length === 4 && ns === t.tu) {
        dd.nam_sinh.push([0, ns.length]);
        ok = true;
      }
      ok = themChua(dd.cccd, h.cccd, t.tu) || ok;
      ok = themChua(dd.ma_kcb, h.ma_kcb, t.tu) || ok;
      ok = chuanHoa(h.so_dt ?? '').includes(t.tu) || ok;
      ok = chuanHoa(h.so_the_bhyt ?? '').includes(t.tu) || ok;
      if (!ok) return { khop: false, danhDau: rong() };
    } else if (t.loai === 'MA') {
      const okMa = themChua(dd.ma_kcb, h.ma_kcb, t.tu) || chuanHoa(h.so_the_bhyt ?? '').includes(t.tu);
      if (!okMa) chu.push(t.tu); // fall back to name/note ordered match
    } else {
      chu.push(t.tu);
    }
  }
  if (chu.length > 0) {
    const r = timTheoThuTu(chu, [h.ho_ten, h.ghi_chu]);
    if (!r) return { khop: false, danhDau: rong() };
    dd.ho_ten.push(...r[0]);
    dd.ghi_chu.push(...r[1]);
  }
  return { khop: true, danhDau: dd };
}

/** Split `text` into plain / highlighted segments for rendering (<mark> on `true`). */
export function chiaDoan(text: string, ranges: Khoang[]): { t: string; mark: boolean }[] {
  const s = (text ?? '').normalize('NFC');
  if (!ranges.length) return [{ t: s, mark: false }];
  const sorted = [...ranges].sort((a, b) => a[0] - b[0]);
  const merged: Khoang[] = [];
  for (const r of sorted) {
    const last = merged[merged.length - 1];
    if (last && r[0] <= last[1]) last[1] = Math.max(last[1], r[1]);
    else merged.push([r[0], r[1]]);
  }
  const out: { t: string; mark: boolean }[] = [];
  let p = 0;
  for (const [a, b] of merged) {
    if (a > p) out.push({ t: s.slice(p, a), mark: false });
    out.push({ t: s.slice(a, b), mark: true });
    p = b;
  }
  if (p < s.length) out.push({ t: s.slice(p), mark: false });
  return out;
}
