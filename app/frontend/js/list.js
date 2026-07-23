// list.js — màn hình DANH SÁCH: bộ lọc §3.2, bảng kết quả, phân trang, di
// chuyển bàn phím ↑↓/Enter, tô màu dòng theo cờ (§4).
// Đợt 2 (tiêu chí 6, 8): bộ lọc gọn dùng Multiselect (checkbox-dropdown) cho
// Xã/phường, Cờ cảnh báo, Phân loại SK, Trạng thái, Cơ quan bệnh chính; ngày
// khám tách 2 ô có nhãn rõ; đếm kết quả "Hiển thị a–b / X kết quả".
// Đợt 7: chọn số dòng/trang (mặc định 20), cột STT liên tục toàn danh sách,
// cột "Mã hồ sơ" trở lại (cuối bảng), ô tìm kiếm gọn (bỏ CCCD/Mã hồ sơ) +
// checkbox "Chỉ tìm họ tên" (mặc định TẮT = tìm toàn cột + highlight), ESC
// trong ô tìm/ngày xóa-tại-chỗ (không kích hoạt Esc-đóng-chi-tiết toàn cục).

const ListView = (() => {
  let root, danhMuc, user, onOpen;
  let filters = {};
  let items = [];
  let selectedIdx = -1;
  let page = 1;
  let pageSize = 20;
  let total = 0;
  let debounceTimer = null;
  let lastQStripped = ''; // dùng để highlight (chỉ khi tìm toàn cột)
  const msRefs = {}; // tham chiếu Multiselect + input ngày để "Xóa hết bộ lọc"
  let coQcCounts = null; // {mã cờ: số hồ sơ} — nạp sau, để hiện count + ẩn cờ rỗng

  // Tùy chọn cho dropdown "Cờ cảnh báo": khi đã có coQcCounts thì gắn số lượng
  // vào nhãn + BỎ cờ 0 hồ sơ (giữ lại cờ đang được chọn dù = 0 để không mất
  // lựa chọn hiện tại). Chưa có count -> hiện toàn bộ như cũ.
  function coQcOptions() {
    let flags = danhMuc.co_qc;
    if (coQcCounts) {
      flags = flags.filter((f) => (coQcCounts[f.ma] || 0) > 0
        || (filters.co_qc || []).includes(f.ma));
    }
    return flags.map((f) => {
      const n = coQcCounts ? (coQcCounts[f.ma] || 0) : null;
      return {
        ma: f.ma,
        ten: f.ten + (n === null ? '' : ` (${n.toLocaleString('vi-VN')})`),
        title: f.y_nghia,
        icon: f.muc === 'do' ? '🔴' : f.muc === 'cam' ? '🟠' : '🟡',
      };
    });
  }

  // Dựng lại multiselect Cờ cảnh báo tại chỗ (sau khi count về) — thay phần tử
  // cũ, giữ nguyên lựa chọn hiện tại.
  function rebuildCoQc() {
    if (!msRefs.coQc || !msRefs.coQc.el) return;
    const ms = Multiselect.create({
      options: coQcOptions(),
      selected: filters.co_qc,
      onChange: (vals) => { filters.co_qc = vals; page = 1; reload(); },
    });
    msRefs.coQc.el.replaceWith(ms.el);
    msRefs.coQc = ms;
  }

  function defaultFilters() {
    return {
      xa: [], trang_thai: [], co_qc: [], phan_loai_sk: [], co_quan_benh_chinh: [],
      ngay_tu: '', ngay_den: '', q: '', q_hoten_only: true,
      nguoi_ra_soat_id: '',
    };
  }

  function init(container, dm, u, opts) {
    root = container;
    danhMuc = dm;
    user = u;
    onOpen = opts.onOpen;
    filters = defaultFilters();
    buildLayout();
    reload();
    // Nạp số lượng hồ sơ theo từng cờ (không chặn giao diện) -> gắn count vào
    // dropdown + ẩn cờ 0 hồ sơ. Chỉ nạp 1 lần cho mỗi phiên mở danh sách.
    if (coQcCounts) {
      rebuildCoQc();
    } else {
      Api.coQcThongKe().then((counts) => {
        coQcCounts = counts;
        rebuildCoQc();
      }).catch(() => { /* lỗi mạng tạm — giữ danh sách đầy đủ như cũ */ });
    }
  }

  function fieldBox(label, buildInput, extraClass) {
    const box = document.createElement('div');
    box.className = 'filter-field' + (extraClass ? ' ' + extraClass : '');
    const lbl = document.createElement('div');
    lbl.className = 'filter-label';
    lbl.textContent = label;
    box.appendChild(lbl);
    box.appendChild(buildInput());
    return box;
  }

  // ESC trong ô text lọc: xóa sạch + reset kết quả, KHÔNG để nổi bọt lên phím
  // tắt toàn cục Esc-đóng-chi-tiết (keyboard.js) — criterion 7.
  function wireEscClear(inp, onClear) {
    inp.addEventListener('keydown', (e) => {
      if (e.key !== 'Escape') return;
      e.preventDefault();
      e.stopPropagation();
      inp.value = '';
      onClear();
      page = 1;
      reload();
    });
  }

  function searchPlaceholder() {
    return filters.q_hoten_only
      ? 'vd: nguyen van, thanh...'
      : 'Tìm mọi cột: tên, CCCD, xã, mã, bệnh...';
  }

  const ADV_FILTERS_KEY = 'ksk_adv_filters';

  function buildLayout() {
    root.innerHTML = '';

    // Đợt 8 tiêu chí 1: #list-view chia 3 vùng — filterFrame (TRÊN, cố định),
    // tableWrap (GIỮA, cuộn), footer (DƯỚI, cố định: summary + pager).
    const filterFrame = document.createElement('div');
    filterFrame.className = 'filter-frame';

    const bar = document.createElement('div');
    bar.className = 'filter-bar';

    // ---- Hàng 1: tìm kiếm theo văn bản ----
    const rowText = document.createElement('div');
    rowText.className = 'filter-row filter-row-text';

    rowText.appendChild(fieldBox('Tìm kiếm', () => {
      const wrap = document.createElement('div');
      wrap.className = 'search-with-toggle';

      const inp = document.createElement('input'); inp.type = 'text'; inp.id = 'search-box';
      inp.placeholder = searchPlaceholder();
      msRefs.hoTenInput = inp;
      inp.addEventListener('input', () => {
        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(() => { filters.q = inp.value; page = 1; reload(); }, 200);
      });
      wireEscClear(inp, () => { filters.q = ''; });
      wrap.appendChild(inp);

      const lbl = document.createElement('label');
      lbl.className = 'search-toggle-label';
      const cb = document.createElement('input');
      cb.type = 'checkbox';
      cb.id = 'search-hoten-only';
      cb.checked = filters.q_hoten_only;
      cb.addEventListener('change', () => {
        filters.q_hoten_only = cb.checked;
        inp.placeholder = searchPlaceholder();
        page = 1;
        reload();
      });
      msRefs.hotenOnlyCb = cb;
      lbl.appendChild(cb);
      lbl.appendChild(document.createTextNode(' Chỉ tìm họ tên'));
      wrap.appendChild(lbl);

      return wrap;
    }, 'filter-field-grow'));

    bar.appendChild(rowText);

    // Chỉ báo "Đang tìm kiếm…" (dấu ... động) ngay dưới ô tìm — hiện khi đang
    // query để user biết app đang chạy (phản hồi anh Khôi).
    const statusEl = document.createElement('div');
    statusEl.id = 'search-status';
    statusEl.className = 'search-status';
    statusEl.hidden = true;
    statusEl.innerHTML = '<span class="spinner"></span>Đang tìm kiếm<span class="dots"></span>';
    bar.appendChild(statusEl);

    // ---- Hàng 2 (mặc định hiện, tiêu chí 2): Xã/phường + Cờ cảnh báo ----
    const rowBasic = document.createElement('div');
    rowBasic.className = 'filter-row filter-row-select';

    rowBasic.appendChild(fieldBox('Xã/phường', () => {
      const ms = Multiselect.create({
        options: danhMuc.xa.map((x) => ({ ma: x.ma, ten: x.ten })),
        selected: filters.xa,
        onChange: (vals) => { filters.xa = vals; page = 1; reload(); },
      });
      msRefs.xa = ms;
      return ms.el;
    }));

    rowBasic.appendChild(fieldBox('Cờ cảnh báo', () => {
      const ms = Multiselect.create({
        options: coQcOptions(),
        selected: filters.co_qc,
        onChange: (vals) => { filters.co_qc = vals; page = 1; reload(); },
      });
      msRefs.coQc = ms;
      return ms.el;
    }));

    bar.appendChild(rowBasic);

    // ---- Hàng 3: ngày khám (mặc định hiện) ----
    const rowDate = document.createElement('div');
    rowDate.className = 'filter-row filter-row-date';

    const tu = document.createElement('input'); tu.type = 'date';
    const den = document.createElement('input'); den.type = 'date';
    msRefs.tuInput = tu; msRefs.denInput = den;
    [tu, den].forEach((inp) => inp.addEventListener('change', () => {
      filters.ngay_tu = tu.value; filters.ngay_den = den.value; page = 1; reload();
    }));
    wireEscClear(tu, () => { filters.ngay_tu = ''; });
    wireEscClear(den, () => { filters.ngay_den = ''; });
    rowDate.appendChild(fieldBox('Từ ngày', () => tu));
    rowDate.appendChild(fieldBox('Đến ngày', () => den));

    // (Bỏ khối "Chọn nhanh" — badge làm vỡ bố cục; dùng 2 ô ngày + "Xóa hết
    //  bộ lọc" là đủ. Phản hồi anh Khôi.)

    bar.appendChild(rowDate);

    // ---- Section "Bộ lọc nâng cao" (tiêu chí 3): thu gọn được, mặc định
    // ĐÓNG, chứa Phân loại SK / Trạng thái / Cơ quan bệnh chính / Nhân viên
    // rà soát (chỉ admin). Trạng thái mở/đóng nhớ ở localStorage. ----
    const advPanel = document.createElement('div');
    advPanel.className = 'filter-row filter-row-select';
    advPanel.id = 'filter-adv-panel';

    advPanel.appendChild(fieldBox('Phân loại SK', () => {
      const ms = Multiselect.create({
        options: danhMuc.phan_loai_sk.map((p) => ({ ma: p.ma, ten: p.ten })),
        selected: filters.phan_loai_sk,
        onChange: (vals) => { filters.phan_loai_sk = vals; page = 1; reload(); },
      });
      msRefs.pl = ms;
      return ms.el;
    }));

    advPanel.appendChild(fieldBox('Trạng thái', () => {
      const ms = Multiselect.create({
        options: danhMuc.trang_thai.map((t) => ({ ma: t.ma, ten: t.ten })),
        selected: filters.trang_thai,
        onChange: (vals) => { filters.trang_thai = vals; page = 1; reload(); },
      });
      msRefs.trangThai = ms;
      return ms.el;
    }));

    advPanel.appendChild(fieldBox('Cơ quan bệnh chính', () => {
      const ms = Multiselect.create({
        options: danhMuc.co_quan_benh_chinh.map((c) => ({ ma: c.ma, ten: c.ten })),
        selected: filters.co_quan_benh_chinh,
        onChange: (vals) => { filters.co_quan_benh_chinh = vals; page = 1; reload(); },
      });
      msRefs.coQuan = ms;
      return ms.el;
    }));

    // Đợt 10 criterion 2: LUÔN hiện dropdown "Nhân viên rà soát" — user
    // thường chỉ thấy 2 lựa chọn (Tất cả / chính mình) để tự lọc "chỉ hồ sơ
    // của tôi" vs "tất cả (của tôi + chưa giao)"; admin giữ danh sách đầy đủ.
    advPanel.appendChild(fieldBox('Nhân viên rà soát', () => {
      const sel = document.createElement('select');
      sel.className = 'filter-select';
      const optAll = document.createElement('option'); optAll.value = ''; optAll.textContent = '(Tất cả)';
      sel.appendChild(optAll);
      if (user.vai_tro === 'admin') {
        (danhMuc.nguoi_dung || []).forEach((n) => {
          const o = document.createElement('option'); o.value = n.ma; o.textContent = n.ten; sel.appendChild(o);
        });
      } else {
        const o = document.createElement('option');
        o.value = String(user.id); o.textContent = user.ho_ten;
        sel.appendChild(o);
      }
      msRefs.nguoiRaSoatSel = sel;
      sel.addEventListener('change', () => { filters.nguoi_ra_soat_id = sel.value; page = 1; reload(); });
      return sel;
    }));

    const advOpen = localStorage.getItem(ADV_FILTERS_KEY) === '1';
    advPanel.hidden = !advOpen;

    const advToggleBtn = document.createElement('button');
    advToggleBtn.type = 'button'; advToggleBtn.id = 'btn-adv-toggle';
    advToggleBtn.className = 'filter-adv-toggle';
    advToggleBtn.textContent = (advOpen ? '▾ ' : '▸ ') + 'Bộ lọc nâng cao';
    advToggleBtn.addEventListener('click', () => {
      const willOpen = advPanel.hidden; // đang ẩn -> sắp mở
      advPanel.hidden = !willOpen;
      advToggleBtn.textContent = (willOpen ? '▾ ' : '▸ ') + 'Bộ lọc nâng cao';
      localStorage.setItem(ADV_FILTERS_KEY, willOpen ? '1' : '0');
    });

    bar.appendChild(advToggleBtn);
    bar.appendChild(advPanel);

    // ---- Hàng hành động: Xóa hết bộ lọc — LUÔN ở frame cố định, KHÔNG nằm
    // trong section nâng cao ẩn (tiêu chí 3) ----
    const rowActions = document.createElement('div');
    rowActions.className = 'filter-row filter-row-actions';
    const clearAllBtn = document.createElement('button');
    clearAllBtn.type = 'button'; clearAllBtn.id = 'btn-xoa-loc';
    clearAllBtn.textContent = 'Xóa hết bộ lọc';
    clearAllBtn.addEventListener('click', clearAllFilters);
    rowActions.appendChild(clearAllBtn);
    bar.appendChild(rowActions);

    filterFrame.appendChild(bar);
    root.appendChild(filterFrame);

    // ---- Vùng GIỮA: bảng danh sách (cuộn dọc — tiêu chí 1) ----
    const tableWrap = document.createElement('div');
    tableWrap.className = 'table-wrap';
    const table = document.createElement('table');
    table.id = 'ho-so-table';
    // Đợt 7 criterion 2/3: STT liên tục ở ĐẦU bảng, "Mã hồ sơ" trở lại CUỐI.
    table.innerHTML = `<thead><tr>
        <th>STT</th><th>Họ tên</th><th>Năm sinh</th><th>Giới</th><th>CCCD</th>
        <th>Xã</th><th>Ngày khám</th><th>Phân loại SK</th><th>Bệnh chính</th>
        <th>Số cờ</th><th>Trạng thái</th><th>Mã hồ sơ</th></tr></thead><tbody></tbody>`;
    tableWrap.appendChild(table);
    root.appendChild(tableWrap);

    // ---- Vùng DƯỚI: footer cố định — đếm kết quả + số dòng/trang + pager
    // (tiêu chí 1, tiêu chí 6 Đợt 7 criterion 1) ----
    const footer = document.createElement('div');
    footer.className = 'list-footer';

    const summaryRow = document.createElement('div');
    summaryRow.className = 'list-summary-row';

    const summary = document.createElement('div');
    summary.id = 'list-summary';
    summary.className = 'list-summary';
    summaryRow.appendChild(summary);

    const pageSizeBox = document.createElement('div');
    pageSizeBox.className = 'page-size-box';
    const pageSizeLbl = document.createElement('label');
    pageSizeLbl.textContent = 'Số dòng/trang: ';
    pageSizeLbl.htmlFor = 'page-size-sel';
    const pageSizeSel = document.createElement('select');
    pageSizeSel.id = 'page-size-sel';
    pageSizeSel.className = 'filter-select page-size-select';
    [10, 20, 50, 100, 200].forEach((n) => {
      const o = document.createElement('option'); o.value = n; o.textContent = n;
      if (n === pageSize) o.selected = true;
      pageSizeSel.appendChild(o);
    });
    pageSizeSel.addEventListener('change', () => {
      pageSize = Number(pageSizeSel.value);
      page = 1;
      reload();
    });
    pageSizeLbl.appendChild(pageSizeSel);
    pageSizeBox.appendChild(pageSizeLbl);
    summaryRow.appendChild(pageSizeBox);

    footer.appendChild(summaryRow);

    const pager = document.createElement('div');
    pager.className = 'pager';
    pager.id = 'pager';
    footer.appendChild(pager);

    root.appendChild(footer);
  }

  const TABLE_COLSPAN = 12;

  function clearAllFilters() {
    filters = defaultFilters();
    if (msRefs.xa) msRefs.xa.setSelected([]);
    if (msRefs.coQc) msRefs.coQc.setSelected([]);
    if (msRefs.pl) msRefs.pl.setSelected([]);
    if (msRefs.trangThai) msRefs.trangThai.setSelected([]);
    if (msRefs.coQuan) msRefs.coQuan.setSelected([]);
    if (msRefs.nguoiRaSoatSel) msRefs.nguoiRaSoatSel.value = '';
    if (msRefs.hoTenInput) { msRefs.hoTenInput.value = ''; msRefs.hoTenInput.placeholder = searchPlaceholder(); }
    if (msRefs.hotenOnlyCb) msRefs.hotenOnlyCb.checked = true; // giữ "Chỉ tìm họ tên"
    if (msRefs.tuInput) msRefs.tuInput.value = '';
    if (msRefs.denInput) msRefs.denInput.value = '';
    page = 1;
    reload();
  }

  function currentFilterParams() {
    return {
      xa: filters.xa, ngay_tu: filters.ngay_tu, ngay_den: filters.ngay_den,
      q: filters.q, q_hoten_only: filters.q_hoten_only ? 'true' : '',
      trang_thai: filters.trang_thai, nguoi_ra_soat_id: filters.nguoi_ra_soat_id,
      co_qc: filters.co_qc, phan_loai_sk: filters.phan_loai_sk,
      co_quan_benh_chinh: filters.co_quan_benh_chinh,
    };
  }

  let _reloadSeq = 0;
  async function reload() {
    const seq = ++_reloadSeq;
    // Chỉ báo "Đang tải…" để không tưởng nhầm là không có kết quả trong lúc
    // chờ mạng (Vercel↔Turso ~1s). + chống race: gõ nhanh -> chỉ hiện kết quả
    // của request MỚI NHẤT.
    const tbodyL = document.querySelector('#ho-so-table tbody');
    if (tbodyL) tbodyL.innerHTML = `<tr><td colspan="${TABLE_COLSPAN}" class="list-loading">Đang tải…</td></tr>`;
    const sumL = document.getElementById('list-summary');
    if (sumL) sumL.textContent = 'Đang tải…';
    const statusEl = document.getElementById('search-status');
    if (statusEl) statusEl.hidden = false;   // hiện "Đang tìm kiếm…" (dấu động)
    const params = Object.assign({ page, page_size: pageSize }, currentFilterParams());
    let data;
    try {
      data = await Api.listHoSo(params);
    } catch (e) {
      if (seq === _reloadSeq) {
        if (statusEl) statusEl.hidden = true;
        if (tbodyL) tbodyL.innerHTML = `<tr><td colspan="${TABLE_COLSPAN}" class="list-empty">Lỗi tải dữ liệu — thử lại</td></tr>`;
      }
      return;
    }
    if (seq !== _reloadSeq) return; // đã có request mới hơn -> bỏ kết quả cũ
    if (statusEl) statusEl.hidden = true;
    items = data.items;
    total = data.total;
    page = data.page;
    pageSize = data.page_size;
    selectedIdx = items.length ? 0 : -1;
    // highlight chỉ khi tìm TOÀN CỘT (checkbox tắt) và có từ khóa
    lastQStripped = (!filters.q_hoten_only && filters.q && filters.q.trim())
      ? Fuzzy.stripDiacriticsAligned(filters.q.trim())
      : '';
    renderTable();
    renderPager();
    renderSummary();
  }

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
    }[c]));
  }

  // Đợt 7 criterion 6: highlight đoạn khớp không dấu trong MỌI ô — escape
  // HTML TRƯỚC (chống XSS), khớp không dấu nhưng bôi đúng ký tự gốc (map
  // index dùng strip 1-ký-tự-gốc↔1-ký-tự-không-dấu — xem Fuzzy.stripDiacriticsAligned).
  function highlightCell(value) {
    const original = String(value == null ? '' : value);
    if (!lastQStripped) return esc(original);
    const aligned = Fuzzy.stripDiacriticsAligned(original);
    const idx = aligned.indexOf(lastQStripped);
    if (idx < 0) return esc(original);
    const chars = Array.from(original);
    const before = chars.slice(0, idx).join('');
    const mid = chars.slice(idx, idx + lastQStripped.length).join('');
    const after = chars.slice(idx + lastQStripped.length).join('');
    return esc(before) + '<mark>' + esc(mid) + '</mark>' + esc(after);
  }

  function renderTable() {
    const tbody = document.querySelector('#ho-so-table tbody');
    tbody.innerHTML = '';
    if (!items.length) {
      tbody.innerHTML = `<tr><td colspan="${TABLE_COLSPAN}" class="list-empty">Không có hồ sơ phù hợp bộ lọc</td></tr>`;
      return;
    }
    items.forEach((it, idx) => {
      const stt = (page - 1) * pageSize + idx + 1;
      const tr = document.createElement('tr');
      tr.dataset.idx = idx;
      if (it.muc_co === 'do') tr.classList.add('row-do');
      else if (it.muc_co === 'vang') tr.classList.add('row-vang');
      if (idx === selectedIdx) tr.classList.add('selected');
      tr.innerHTML = `<td>${stt}</td>
        <td>${highlightCell(it.ho_ten)}</td>
        <td>${highlightCell(it.nam_sinh)}</td><td>${highlightCell(it.gioi_tinh)}</td>
        <td>${highlightCell(it.so_cccd)}</td>
        <td>${highlightCell(it.maxa_cu_tru)}</td><td>${highlightCell(it.ngay_vao)}</td>
        <td>${highlightCell(it.phan_loai_sk)}</td><td>${highlightCell(it.ket_luan_benh)}</td>
        <td>${esc(it.so_loi)}</td><td>${highlightCell(it.trang_thai_nhan)}</td>
        <td>${highlightCell(it.ma_ho_so)}</td>`;
      tr.addEventListener('click', () => { selectedIdx = idx; renderTable(); openSelected(); });
      tbody.appendChild(tr);
    });
  }

  function renderSummary() {
    const box = document.getElementById('list-summary');
    if (!box) return;
    if (total === 0) { box.textContent = 'Hiển thị 0–0 / 0 kết quả'; return; }
    const a = (page - 1) * pageSize + 1;
    const b = Math.min(page * pageSize, total);
    box.textContent = `Hiển thị ${a}–${b} / ${total} kết quả`;
  }

  function renderPager() {
    const pager = document.getElementById('pager');
    const totalPages = Math.max(1, Math.ceil(total / pageSize));
    pager.innerHTML = '';
    const info = document.createElement('span');
    info.textContent = `Trang ${page}/${totalPages}`;
    pager.appendChild(info);
    const prev = document.createElement('button'); prev.textContent = '‹ Trước';
    prev.disabled = page <= 1;
    prev.addEventListener('click', () => { page--; reload(); });
    const next = document.createElement('button'); next.textContent = 'Sau ›';
    next.disabled = page >= totalPages;
    next.addEventListener('click', () => { page++; reload(); });
    pager.appendChild(prev); pager.appendChild(next);
  }

  function moveSelection(delta) {
    if (!items.length) return;
    selectedIdx = Math.min(Math.max(selectedIdx + delta, 0), items.length - 1);
    renderTable();
    const row = document.querySelector(`#ho-so-table tr[data-idx="${selectedIdx}"]`);
    if (row) row.scrollIntoView({ block: 'nearest' });
  }

  function openSelected() {
    if (selectedIdx >= 0 && items[selectedIdx]) onOpen(items[selectedIdx].ma_ho_so);
  }

  function focusSearch() {
    const s = document.getElementById('search-box');
    if (s) s.focus();
  }

  function currentSelectedMa() {
    return selectedIdx >= 0 && items[selectedIdx] ? items[selectedIdx].ma_ho_so : null;
  }

  return {
    init, reload, moveSelection, openSelected, focusSearch,
    currentSelectedMa, currentFilterParams,
    isEmptyFilterFocus: () => document.activeElement && document.activeElement.closest('.filter-bar'),
  };
})();
