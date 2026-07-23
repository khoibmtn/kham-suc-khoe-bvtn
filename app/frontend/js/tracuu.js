// tracuu.js — Tab "Tra cứu" với 2 tab con:
//   1) Mã bệnh ICD-10: iframe app chính thức (TT06 + QĐ1849).
//   2) Phân loại sức khỏe (QĐ 1613/BYT) đọc app/frontend/qd1613.json:
//        - Bệnh tật: duyệt theo CƠ QUAN + tìm kiếm không dấu + lọc theo Loại,
//          mỗi mục có badge Loại I–V tô màu.
//        - Thể lực: nhập giới+số đo -> tự suy Loại (mức xấu nhất) + bảng chuẩn.
const TraCuuView = (() => {
  const ICD_URL = 'https://icd-10-vietnam.vercel.app/';
  const LA_MA = ['I', 'II', 'III', 'IV', 'V'];
  const LOAI_MAU = ['#15803d', '#65a30d', '#ca8a04', '#ea580c', '#c0392b'];

  let panel, built = false;
  let qd = null;                 // dữ liệu qd1613.json
  let plSub = 'benh';            // 'benh' | 'theluc'
  let fOrgan = '';               // lọc cơ quan ('' = tất cả)
  let fLoai = new Set();         // lọc loại (rỗng = tất cả)
  let fQuery = '';

  function init(panelEl) { panel = panelEl; }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"]/g, (c) => (
      { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  }
  function kd(s) {
    return s.normalize('NFD').replace(/[̀-ͯ]/g, '')
      .replace(/đ/g, 'd').replace(/Đ/g, 'D').toLowerCase();
  }
  function badge(loai) {
    return `<span class="pl-badge" style="background:${LOAI_MAU[loai - 1]}">Loại ${LA_MA[loai - 1]}</span>`;
  }

  function show() { if (!built) { build(); built = true; } }

  function build() {
    panel.innerHTML = `
      <div class="tc-tabs">
        <button class="tc-tab active" data-tc="icd">Mã bệnh ICD-10</button>
        <button class="tc-tab" data-tc="pl">Phân loại sức khỏe</button>
        <a class="tc-open" href="${ICD_URL}" target="_blank" rel="noopener">Mở ICD-10 ở tab mới ↗</a>
      </div>
      <div id="tc-icd" class="tc-body">
        <iframe class="tc-iframe" src="${ICD_URL}" title="Tra cứu ICD-10" loading="lazy" referrerpolicy="no-referrer"></iframe>
      </div>
      <div id="tc-pl" class="tc-body" hidden>
        <div class="pl-loading">Đang tải QĐ 1613...</div>
      </div>`;
    panel.querySelectorAll('.tc-tab').forEach((b) =>
      b.addEventListener('click', () => switchTab(b.dataset.tc)));
  }

  function switchTab(which) {
    panel.querySelectorAll('.tc-tab').forEach((b) => b.classList.toggle('active', b.dataset.tc === which));
    panel.querySelector('#tc-icd').hidden = which !== 'icd';
    panel.querySelector('#tc-pl').hidden = which !== 'pl';
    if (which === 'pl' && !qd) loadQd();
  }

  async function loadQd() {
    try {
      qd = await (await fetch('/qd1613.json')).json();
      renderPl();
    } catch (e) {
      panel.querySelector('#tc-pl').innerHTML = '<div class="pl-loading">Không tải được dữ liệu QĐ 1613.</div>';
    }
  }

  // ---- khung Phân loại sức khỏe: sub-tab Bệnh tật / Thể lực ----
  function renderPl() {
    const box = panel.querySelector('#tc-pl');
    box.innerHTML = `
      <div class="pl-subtabs">
        <button class="pl-subtab ${plSub === 'benh' ? 'active' : ''}" data-pl="benh">Bệnh tật theo cơ quan</button>
        <button class="pl-subtab ${plSub === 'theluc' ? 'active' : ''}" data-pl="theluc">Thể lực (chiều cao/cân nặng)</button>
        <span class="pl-nguon">${esc(qd.meta.nguon)}</span>
      </div>
      <div id="pl-benh" ${plSub === 'benh' ? '' : 'hidden'}></div>
      <div id="pl-theluc" ${plSub === 'theluc' ? '' : 'hidden'}></div>`;
    box.querySelectorAll('.pl-subtab').forEach((b) =>
      b.addEventListener('click', () => { plSub = b.dataset.pl; renderPl(); }));
    if (plSub === 'benh') renderBenh(); else renderTheLuc();
  }

  // ---- Bệnh tật ----
  function organs() {
    const seen = [];
    qd.benh_tat.forEach((c) => { if (!seen.includes(c.co_quan)) seen.push(c.co_quan); });
    return seen;
  }

  function renderBenh() {
    const wrap = panel.querySelector('#pl-benh');
    const organChips = ['', ...organs()].map((o) => `
      <button class="pl-chip ${fOrgan === o ? 'active' : ''}" data-organ="${esc(o)}">${o ? esc(o) : 'Tất cả cơ quan'}</button>`).join('');
    const loaiChips = LA_MA.map((r, i) => `
      <button class="pl-chip pl-chip-loai ${fLoai.has(i + 1) ? 'active' : ''}" data-loai="${i + 1}"
        style="${fLoai.has(i + 1) ? `background:${LOAI_MAU[i]};color:#fff;border-color:${LOAI_MAU[i]}` : ''}">Loại ${r}</button>`).join('');
    wrap.innerHTML = `
      <div class="pl-toolbar">
        <input id="pl-search" type="text" placeholder="Tìm bệnh/triệu chứng (vd: thị lực, huyết áp, sâu răng, điếc)..." value="${esc(fQuery)}">
        <span id="pl-count" class="pl-count"></span>
      </div>
      <div class="pl-chips">${organChips}</div>
      <div class="pl-chips pl-chips-loai"><span class="pl-chips-label">Lọc theo loại:</span>${loaiChips}</div>
      <div id="pl-list" class="pl-list"></div>`;

    wrap.querySelectorAll('[data-organ]').forEach((b) =>
      b.addEventListener('click', () => { fOrgan = b.dataset.organ; renderBenh(); }));
    wrap.querySelectorAll('[data-loai]').forEach((b) =>
      b.addEventListener('click', () => {
        const l = +b.dataset.loai; fLoai.has(l) ? fLoai.delete(l) : fLoai.add(l); renderBenh();
      }));
    const inp = wrap.querySelector('#pl-search');
    let t = null;
    inp.addEventListener('input', () => {
      clearTimeout(t);
      t = setTimeout(() => { fQuery = inp.value.trim(); drawList(); }, 120);
    });
    // giữ vị trí con trỏ khi re-render: focus lại nếu đang gõ
    if (fQuery) { inp.focus(); inp.setSelectionRange(inp.value.length, inp.value.length); }
    drawList();
  }

  function drawList() {
    const list = panel.querySelector('#pl-list');
    // token-AND không dấu: mọi từ khóa phải xuất hiện (không cần đúng thứ tự) —
    // "sâu răng" khớp "răng sâu".
    const toks = fQuery ? kd(fQuery).split(/\s+/).filter(Boolean) : [];
    let nCard = 0, nMuc = 0;
    const html = qd.benh_tat.filter((c) => !fOrgan || c.co_quan === fOrgan).map((c) => {
      // lọc mục theo loại + từ khóa
      const muc = c.muc.filter((m) => {
        if (fLoai.size && !m.loai.some((l) => fLoai.has(l))) return false;
        if (toks.length) {
          const hay = kd(c.ten + ' ' + m.dk);
          if (!toks.every((t) => hay.includes(t))) return false;
        }
        return true;
      });
      if (!muc.length) return '';
      nCard += 1; nMuc += muc.length;
      const rows = muc.map((m) => `
        <div class="pl-muc">
          <div class="pl-muc-badges">${m.loai.length ? m.loai.map(badge).join('') : '<span class="pl-badge pl-badge-ref">theo tham chiếu</span>'}</div>
          <div class="pl-muc-dk">${esc(m.dk)}</div>
        </div>`).join('');
      return `
        <div class="pl-card">
          <div class="pl-card-head"><span class="pl-card-co">${esc(c.co_quan)}</span>
            <span class="pl-card-so">${c.so}.</span> ${esc(c.ten)}</div>
          ${rows}
        </div>`;
    }).join('');
    list.innerHTML = html || '<div class="pl-empty">Không có mục nào khớp bộ lọc.</div>';
    const cnt = panel.querySelector('#pl-count');
    if (cnt) cnt.textContent = `${nCard} tiêu chí · ${nMuc} mục`;
  }

  // ---- Thể lực: tra cứu + tính nhanh ----
  function parseRange(s) {
    // "160 trở lên" -> [160, inf]; "156-159" -> [156,159]; "Dưới 149" -> [-inf,148]
    const nums = (s.match(/\d+(?:[.,]\d+)?/g) || []).map((x) => parseFloat(x.replace(',', '.')));
    if (/trở lên/i.test(s)) return [nums[0], Infinity];
    if (/dưới/i.test(s)) return [-Infinity, nums[0] - 0.0001];
    if (nums.length >= 2) return [Math.min(nums[0], nums[1]), Math.max(nums[0], nums[1])];
    if (nums.length === 1) return [nums[0], nums[0]];
    return [-Infinity, Infinity];
  }
  function classifyMeasure(value, rows, key) {
    for (const r of rows) {
      const [lo, hi] = parseRange(r[key] || '');
      if (value >= lo && value <= hi) return r.loai;
    }
    return null;
  }

  function renderTheLuc() {
    const wrap = panel.querySelector('#pl-theluc');
    const groups = [['hoc_sinh', 'Học sinh ĐH/THCN/dạy nghề'], ['lao_dong', 'Lao động các nghề']];
    const tables = groups.filter(([k]) => qd.the_luc[k]).map(([k, ten]) => tblHtml(k, ten)).join('');
    wrap.innerHTML = `
      <div class="pl-tl-calc">
        <div class="pl-tl-title">Tính nhanh loại thể lực</div>
        <div class="pl-tl-form">
          <label>Giới <select id="tl-gioi"><option value="nam">Nam</option><option value="nu">Nữ</option></select></label>
          <label>Nhóm <select id="tl-nhom">
            ${groups.filter(([k]) => qd.the_luc[k]).map(([k, ten]) => `<option value="${k}">${ten}</option>`).join('')}
          </select></label>
          <label>Chiều cao (cm) <input id="tl-cc" type="number" step="0.1"></label>
          <label>Cân nặng (kg) <input id="tl-cn" type="number" step="0.1"></label>
          <label>Vòng ngực (cm) <input id="tl-vn" type="number" step="0.1"></label>
        </div>
        <div id="tl-ket-qua" class="pl-tl-kq"></div>
        <div class="pl-tl-note">Loại thể lực = mức <b>xấu nhất</b> trong các chỉ số (đúng nguyên tắc QĐ1613).</div>
      </div>
      ${tables}`;
    const ids = ['tl-gioi', 'tl-nhom', 'tl-cc', 'tl-cn', 'tl-vn'];
    ids.forEach((id) => wrap.querySelector('#' + id).addEventListener('input', calcTheLuc));
  }

  function tblHtml(key, ten) {
    const g = qd.the_luc[key];
    const row = (arr, gioi) => arr.map((r) => `
      <tr data-key="${key}" data-gioi="${gioi}" data-loai="${r.loai}">
        <td>${badge(r.loai)}</td><td>${esc(r.chieu_cao)}</td><td>${esc(r.can_nang)}</td><td>${esc(r.vong_nguc)}</td></tr>`).join('');
    return `
      <div class="pl-tl-tblwrap">
        <h4>${esc(ten)}</h4>
        <div class="pl-tl-2col">
          <table class="pl-tl-tbl"><thead><tr><th>Nam — Loại</th><th>Cao (cm)</th><th>Nặng (kg)</th><th>Vòng ngực</th></tr></thead><tbody>${row(g.nam, 'nam')}</tbody></table>
          <table class="pl-tl-tbl"><thead><tr><th>Nữ — Loại</th><th>Cao (cm)</th><th>Nặng (kg)</th><th>Vòng ngực</th></tr></thead><tbody>${row(g.nu, 'nu')}</tbody></table>
        </div>
      </div>`;
  }

  function calcTheLuc() {
    const wrap = panel.querySelector('#pl-theluc');
    const gioi = wrap.querySelector('#tl-gioi').value;
    const nhom = wrap.querySelector('#tl-nhom').value;
    const cc = parseFloat(wrap.querySelector('#tl-cc').value);
    const cn = parseFloat(wrap.querySelector('#tl-cn').value);
    const vn = parseFloat(wrap.querySelector('#tl-vn').value);
    const rows = qd.the_luc[nhom][gioi];
    const parts = [];
    let worst = null;
    const add = (label, val, key) => {
      if (!isFinite(val)) return;
      const l = classifyMeasure(val, rows, key);
      if (l == null) return;
      parts.push(`${label}: Loại ${LA_MA[l - 1]}`);
      worst = worst == null ? l : Math.max(worst, l);
    };
    add('Chiều cao', cc, 'chieu_cao');
    add('Cân nặng', cn, 'can_nang');
    add('Vòng ngực', vn, 'vong_nguc');
    const kq = wrap.querySelector('#tl-ket-qua');
    // tô sáng hàng loại kết quả trong bảng đúng nhóm/giới
    wrap.querySelectorAll('.pl-tl-tbl tr[data-loai]').forEach((tr) => tr.classList.remove('hl'));
    if (worst == null) { kq.innerHTML = '<span class="pl-tl-hint">Nhập số đo để xem loại.</span>'; return; }
    kq.innerHTML = `<div class="pl-tl-result">Kết luận thể lực: ${badge(worst)}</div>
      <div class="pl-tl-detail">${parts.join(' · ')}</div>`;
    wrap.querySelectorAll(`.pl-tl-tbl tr[data-key="${nhom}"][data-gioi="${gioi}"][data-loai="${worst}"]`).forEach((tr) => tr.classList.add('hl'));
  }

  return { init, show };
})();
