// Vietnamese-insensitive normalisation shared by import, search and duplicate checks.
// "Thuỷ" and "Thủy" both → "thuy"; "Đ" → "d".
export function khongDau(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}
