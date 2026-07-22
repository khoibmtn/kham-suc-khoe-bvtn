// fuzzy.js — tiện ích bỏ dấu tiếng Việt phía FRONTEND, dùng cho highlight
// (Đợt 7 criterion 6). Khớp NGUYÊN TẮC với backend/services/fuzzy.py:
// strip_diacritics — nhưng ở đây bỏ dấu TỪNG KÝ TỰ (giữ 1 ký tự gốc <-> 1 ký
// tự không dấu) để có thể map ngược vị trí khớp trong chuỗi KHÔNG dấu về
// đúng đoạn ký tự CÓ dấu trong chuỗi gốc khi chèn <mark>.

const Fuzzy = (() => {
  function stripDiacriticsChar(ch) {
    if (ch === 'đ') return 'd';
    if (ch === 'Đ') return 'D';
    const nfd = ch.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    return nfd || ch;
  }

  // Trả chuỗi không dấu, chữ thường, CÙNG SỐ KÝ TỰ (theo code point) với
  // chuỗi gốc — cho phép map index thẳng giữa 2 chuỗi.
  function stripDiacriticsAligned(s) {
    if (!s) return '';
    return Array.from(String(s)).map(stripDiacriticsChar).join('').toLowerCase();
  }

  return { stripDiacriticsAligned };
})();
