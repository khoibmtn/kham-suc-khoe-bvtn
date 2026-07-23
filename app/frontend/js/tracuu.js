// tracuu.js — Tab "Tra cứu" với 2 tab con:
//   1) Mã bệnh ICD-10: nhúng iframe app tra cứu chính thức (TT06 + QĐ1849) —
//      https://icd-10-vietnam.vercel.app — không nhân bản dữ liệu, luôn cập nhật.
//   2) Phân loại sức khỏe: toàn văn QĐ 1613/BYT (frontend/qd1613.txt) render
//      thành bảng + ô tìm kiếm lọc/tô sáng client-side (không cần backend).
const TraCuuView = (() => {
  const ICD_URL = 'https://icd-10-vietnam.vercel.app/';
  let panel;
  let built = false;
  let qd1613Loaded = false;

  function init(panelEl) { panel = panelEl; }

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"]/g, (c) => (
      { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  }
  // Bỏ dấu tiếng Việt để tìm kiếm không phân biệt dấu.
  function kd(s) {
    return s.normalize('NFD').replace(/[̀-ͯ]/g, '')
      .replace(/đ/g, 'd').replace(/Đ/g, 'D').toLowerCase();
  }

  function show() {
    if (!built) { build(); built = true; }
  }

  function build() {
    panel.innerHTML = `
      <div class="tc-tabs">
        <button class="tc-tab active" data-tc="icd">Mã bệnh ICD-10</button>
        <button class="tc-tab" data-tc="pl">Phân loại sức khỏe</button>
        <a class="tc-open" href="${ICD_URL}" target="_blank" rel="noopener">Mở ICD-10 ở tab mới ↗</a>
      </div>
      <div id="tc-icd" class="tc-body">
        <iframe class="tc-iframe" src="${ICD_URL}" title="Tra cứu ICD-10"
          loading="lazy" referrerpolicy="no-referrer"></iframe>
      </div>
      <div id="tc-pl" class="tc-body" hidden>
        <div class="tc-pl-toolbar">
          <input id="tc-pl-search" type="text" placeholder="Tìm trong QĐ 1613 (vd: thị lực, huyết áp, loại IV)...">
          <span id="tc-pl-count" class="tc-pl-count"></span>
        </div>
        <div id="tc-pl-content" class="tc-pl-content">Đang tải QĐ 1613...</div>
      </div>`;

    panel.querySelectorAll('.tc-tab').forEach((btn) => {
      btn.addEventListener('click', () => switchTab(btn.dataset.tc));
    });
  }

  function switchTab(which) {
    panel.querySelectorAll('.tc-tab').forEach((b) => b.classList.toggle('active', b.dataset.tc === which));
    panel.querySelector('#tc-icd').hidden = which !== 'icd';
    panel.querySelector('#tc-pl').hidden = which !== 'pl';
    if (which === 'pl' && !qd1613Loaded) loadQd1613();
  }

  async function loadQd1613() {
    qd1613Loaded = true;
    const box = panel.querySelector('#tc-pl-content');
    try {
      const res = await fetch('/qd1613.txt');
      const text = await res.text();
      box.innerHTML = renderDoc(text);
      wireSearch();
    } catch (e) {
      qd1613Loaded = false;
      box.textContent = 'Không tải được QĐ 1613. Thử lại sau.';
    }
  }

  // Chuyển văn bản thô -> HTML: dòng có TAB gộp thành <table>; các dòng còn lại
  // là <p> (dòng NGẮN/IN HOA/đánh số La Mã -> tiêu đề). Mỗi khối là 1 .tc-blk
  // để lọc theo từ khóa.
  function renderDoc(text) {
    const lines = text.replace(/\r/g, '').split('\n');
    const out = [];
    let tbl = null; // buffer các dòng bảng liên tiếp
    const flush = () => {
      if (!tbl) return;
      const rows = tbl.map((cells) =>
        '<tr>' + cells.map((c) => `<td>${esc(c)}</td>`).join('') + '</tr>').join('');
      out.push(`<div class="tc-blk"><table class="tc-doc-table">${rows}</table></div>`);
      tbl = null;
    };
    for (const raw of lines) {
      const line = raw.replace(/\s+$/, '');
      if (!line.trim()) { flush(); continue; }
      if (line.includes('\t')) {
        (tbl = tbl || []).push(line.split('\t'));
        continue;
      }
      flush();
      const t = line.trim();
      const isHead = /^[IVX]+\s*[-.]/.test(t) || /^\d+(\.\d+)*[.)]/.test(t)
        || (t.length < 60 && t === t.toUpperCase() && /[A-ZĐÀ-Ỹ]/.test(t));
      out.push(`<div class="tc-blk"><${isHead ? 'h4' : 'p'} class="tc-${isHead ? 'head' : 'para'}">${esc(t)}</${isHead ? 'h4' : 'p'}></div>`);
    }
    flush();
    return out.join('');
  }

  function wireSearch() {
    const input = panel.querySelector('#tc-pl-search');
    const countEl = panel.querySelector('#tc-pl-count');
    const blks = Array.from(panel.querySelectorAll('#tc-pl-content .tc-blk'));
    // Lưu HTML gốc mỗi khối để tô sáng/khôi phục.
    const orig = blks.map((b) => b.innerHTML);
    let timer = null;
    input.addEventListener('input', () => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        const q = input.value.trim();
        if (!q) {
          blks.forEach((b, i) => { b.hidden = false; b.innerHTML = orig[i]; });
          countEl.textContent = '';
          return;
        }
        const qk = kd(q);
        let hits = 0;
        blks.forEach((b, i) => {
          const match = kd(b.textContent).includes(qk);
          b.hidden = !match;
          if (match) {
            hits += 1;
            // tô sáng: thay trên text nodes bằng cách bọc <mark> theo regex an toàn
            b.innerHTML = highlight(orig[i], q);
          } else {
            b.innerHTML = orig[i];
          }
        });
        countEl.textContent = `${hits} mục khớp`;
      }, 120);
    });
  }

  // Tô sáng từ khóa trong HTML đã escape (chỉ so trên phần text, tránh phá thẻ).
  function highlight(html, q) {
    const re = new RegExp('(' + q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + ')', 'gi');
    return html.replace(/>([^<]+)</g, (m, txt) =>
      '>' + txt.replace(re, '<mark>$1</mark>') + '<');
  }

  return { init, show };
})();
