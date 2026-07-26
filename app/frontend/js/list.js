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

  // ===== "Box điều kiện" — bộ lọc nâng cao dạng field + toán tử + giá trị,
  // nhiều dòng nối AND. advFieldOrder/advShowExtra (thứ tự + trạng thái
  // "hiện thêm trường") lưu THEO TÀI KHOẢN qua Api.capNhatBoLocNangCao
  // (PATCH /api/me); advConditions (các dòng điều kiện) CHỈ sống trong
  // phiên — ngoài phạm vi: không lưu preset nhiều bộ lọc. =====
  let advFieldOrder = null;
  let advShowExtra = false;
  let advConditions = [];
  let advCondRowsEl = null;
  let advCondAddWrapEl = null;
  let advDebounceTimer = null;
  let advPickerEl = null;   // popover chọn/sắp trường đang mở (null = đóng)
  let advPickerBtnEl = null;

  const ADV_OP_LABELS = {
    '': '(chưa chọn)',
    trong: 'Trống',
    khong_trong: 'Không trống',
    toan_tu: 'Toán tử',
    chua: 'Chứa',
    khong_chua: 'Không chứa',
    bat_dau: 'Bắt đầu bằng',
    ket_thuc: 'Kết thúc bằng',
  };
  const ADV_SUB_OPS = ['>', '<', '=', '>=', '<='];
  const ADV_TEXT_VALUE_OPS = new Set(['chua', 'khong_chua', 'bat_dau', 'ket_thuc']);

  function newAdvConditionRow() {
    return { field: '', op: '', sub_op: '>', value: '' };
  }

  function defaultAdvFieldOrder() {
    const basic = ADV_BASIC_FIELD_CODES.slice();
    const rest = FIELD_DEFS.map((f) => f.code).filter((c) => !basic.includes(c));
    return basic.concat(rest);
  }

  // Nạp trạng thái đã lưu của tài khoản (user.bo_loc_nang_cao_tuy_chon, trả
  // về từ /api/me) — hợp lệ hoá + NỐI THÊM mã trường MỚI (vd fields.js vừa
  // bổ sung) chưa có trong danh sách đã lưu, tránh mất trường mới khi nạp.
  function loadAdvFieldSetting() {
    const saved = user && user.bo_loc_nang_cao_tuy_chon;
    const allCodes = FIELD_DEFS.map((f) => f.code);
    if (saved && Array.isArray(saved.field_order) && saved.field_order.length) {
      const known = new Set(allCodes);
      const savedValid = saved.field_order.filter((c) => known.has(c));
      const savedSet = new Set(savedValid);
      const missing = allCodes.filter((c) => !savedSet.has(c));
      advFieldOrder = savedValid.concat(missing);
      advShowExtra = !!saved.show_extra;
    } else {
      advFieldOrder = defaultAdvFieldOrder();
      advShowExtra = false;
    }
  }

  function persistAdvFieldSetting() {
    Api.capNhatBoLocNangCao({ show_extra: advShowExtra, field_order: advFieldOrder })
      .catch(() => { /* lỗi mạng tạm — không chặn thao tác, thử lại ở lần đổi kế tiếp */ });
  }

  function visibleAdvFieldCodes() {
    if (advShowExtra) return advFieldOrder.slice();
    const basicSet = new Set(ADV_BASIC_FIELD_CODES);
    return advFieldOrder.filter((c) => basicSet.has(c));
  }

  // Kéo-thả sắp lại thứ tự TRONG PHẠM VI đang hiển thị (8 trường cơ bản khi
  // đang thu gọn, hoặc toàn bộ khi đã "hiện thêm trường") — giữ nguyên vị
  // trí tương đối của các mã đang ẨN trong advFieldOrder gốc.
  function reorderAdvField(fromCode, toCode) {
    if (fromCode === toCode) return;
    const visible = visibleAdvFieldCodes();
    const fromIdx = visible.indexOf(fromCode);
    const toIdx = visible.indexOf(toCode);
    if (fromIdx < 0 || toIdx < 0) return;
    visible.splice(toIdx, 0, visible.splice(fromIdx, 1)[0]);
    const basicSet = new Set(ADV_BASIC_FIELD_CODES);
    let vi = 0;
    advFieldOrder = advFieldOrder.map((c) => {
      if (advShowExtra || basicSet.has(c)) return visible[vi++];
      return c;
    });
    persistAdvFieldSetting();
  }

  function advRowIsComplete(row) {
    if (!row.field || !row.op) return false;
    if (row.op === 'toan_tu') return !!row.sub_op && String(row.value || '').trim() !== '';
    if (ADV_TEXT_VALUE_OPS.has(row.op)) return String(row.value || '').trim() !== '';
    return true; // trong / khong_trong — không cần giá trị
  }

  function advConditionsPayload() {
    return advConditions.filter(advRowIsComplete).map((r) => {
      const out = { field: r.field, op: r.op };
      if (r.op === 'toan_tu') { out.sub_op = r.sub_op; out.value = r.value; }
      else if (ADV_TEXT_VALUE_OPS.has(r.op)) out.value = r.value;
      return out;
    });
  }

  function onAdvConditionChanged() {
    page = 1;
    reload();
  }

  function renderAdvAddButton() {
    if (!advCondAddWrapEl) return;
    advCondAddWrapEl.innerHTML = '';
    const last = advConditions[advConditions.length - 1];
    if (!last || !advRowIsComplete(last)) return;
    const addBtn = document.createElement('button');
    addBtn.type = 'button';
    addBtn.className = 'adv-cond-add';
    addBtn.textContent = '+ Thêm điều kiện';
    addBtn.addEventListener('click', () => {
      advConditions.push(newAdvConditionRow());
      renderAdvConditionsFull();
    });
    advCondAddWrapEl.appendChild(addBtn);
  }

  function wireAdvValueInput(inp, row) {
    inp.addEventListener('input', () => {
      row.value = inp.value;
      clearTimeout(advDebounceTimer);
      advDebounceTimer = setTimeout(() => {
        // Chỉ cập nhật nút "+" (KHÔNG dựng lại toàn bộ dòng — tránh mất
        // focus ô đang gõ) rồi mới lọc lại kết quả.
        renderAdvAddButton();
        onAdvConditionChanged();
      }, 250);
    });
  }

  function buildAdvConditionRow(row, idx) {
    const line = document.createElement('div');
    line.className = 'adv-cond-row';

    // ----- Box 1: chọn trường -----
    const fieldWrap = document.createElement('div');
    fieldWrap.className = 'adv-cond-field-wrap';
    const sel = document.createElement('select');
    sel.className = 'filter-select adv-cond-field';
    const optBlank = document.createElement('option');
    optBlank.value = ''; optBlank.textContent = '(chọn trường)';
    sel.appendChild(optBlank);
    const codes = visibleAdvFieldCodes();
    if (row.field && !codes.includes(row.field)) codes.unshift(row.field); // giữ lựa chọn dù đang ẩn (đợt "thu gọn")
    codes.forEach((c) => {
      const def = FIELD_BY_CODE[c];
      if (!def) return;
      const o = document.createElement('option');
      o.value = c; o.textContent = def.label;
      if (c === row.field) o.selected = true;
      sel.appendChild(o);
    });
    sel.addEventListener('change', () => {
      row.field = sel.value;
      row.op = ''; row.value = ''; row.sub_op = '>';
      renderAdvConditionsFull();
      onAdvConditionChanged();
    });
    fieldWrap.appendChild(sel);

    const pickerBtn = document.createElement('button');
    pickerBtn.type = 'button';
    pickerBtn.className = 'adv-field-picker-btn';
    pickerBtn.title = 'Hiện thêm trường / sắp xếp lại danh sách trường';
    pickerBtn.textContent = '⚙';
    pickerBtn.addEventListener('click', () => toggleFieldPicker(pickerBtn));
    fieldWrap.appendChild(pickerBtn);

    line.appendChild(fieldWrap);

    // ----- Box 2: toán tử — chỉ hiện khi Box 1 đã chọn trường (tiêu chí 10) -----
    if (row.field) {
      const opSel = document.createElement('select');
      opSel.className = 'filter-select adv-cond-op';
      Object.keys(ADV_OP_LABELS).forEach((k) => {
        const o = document.createElement('option');
        o.value = k; o.textContent = ADV_OP_LABELS[k];
        if (k === row.op) o.selected = true;
        opSel.appendChild(o);
      });
      opSel.addEventListener('change', () => {
        row.op = opSel.value;
        row.value = '';
        renderAdvConditionsFull();
        onAdvConditionChanged();
      });
      line.appendChild(opSel);

      if (row.op === 'toan_tu') {
        const subSel = document.createElement('select');
        subSel.className = 'filter-select adv-cond-subop';
        ADV_SUB_OPS.forEach((s) => {
          const o = document.createElement('option');
          o.value = s; o.textContent = s;
          if (s === row.sub_op) o.selected = true;
          subSel.appendChild(o);
        });
        subSel.addEventListener('change', () => {
          row.sub_op = subSel.value;
          renderAdvAddButton();
          onAdvConditionChanged();
        });
        line.appendChild(subSel);

        const def = FIELD_BY_CODE[row.field];
        const valInp = document.createElement('input');
        valInp.type = def && def.widget === 'date' ? 'date' : 'text';
        valInp.className = 'adv-cond-value';
        valInp.value = row.value;
        valInp.placeholder = 'Giá trị';
        wireAdvValueInput(valInp, row);
        line.appendChild(valInp);
      } else if (ADV_TEXT_VALUE_OPS.has(row.op)) {
        const valInp = document.createElement('input');
        valInp.type = 'text';
        valInp.className = 'adv-cond-value';
        valInp.value = row.value;
        valInp.placeholder = 'vd: nguyễn nam';
        wireAdvValueInput(valInp, row);
        line.appendChild(valInp);
      }
    }

    // ----- Xóa dòng — mọi dòng TỪ DÒNG 2 trở đi (tiêu chí 20/21) -----
    if (idx > 0) {
      const delBtn = document.createElement('button');
      delBtn.type = 'button';
      delBtn.className = 'adv-cond-del';
      delBtn.title = 'Xóa điều kiện này';
      delBtn.textContent = '✕';
      delBtn.addEventListener('click', () => {
        advConditions.splice(idx, 1);
        renderAdvConditionsFull();
        onAdvConditionChanged();
      });
      line.appendChild(delBtn);
    }

    return line;
  }

  function renderAdvConditionsFull() {
    if (!advCondRowsEl) return;
    advCondRowsEl.innerHTML = '';
    advConditions.forEach((row, idx) => advCondRowsEl.appendChild(buildAdvConditionRow(row, idx)));
    renderAdvAddButton();
  }

  // ----- Popover "⚙" — toggle hiện thêm trường + kéo-thả sắp thứ tự -----
  function closeFieldPicker() {
    if (advPickerEl) { advPickerEl.remove(); advPickerEl = null; }
    document.removeEventListener('mousedown', onAdvPickerOutsideClick, true);
  }

  function onAdvPickerOutsideClick(e) {
    if (advPickerEl && !advPickerEl.contains(e.target) && e.target !== advPickerBtnEl) {
      closeFieldPicker();
    }
  }

  function reopenFieldPicker() {
    const btn = advPickerBtnEl;
    closeFieldPicker();
    if (btn) toggleFieldPicker(btn);
  }

  function positionPopover(pop, btnEl) {
    const r = btnEl.getBoundingClientRect();
    pop.style.position = 'fixed';
    pop.style.top = `${r.bottom + 4}px`;
    pop.style.left = `${Math.max(4, Math.min(r.left, window.innerWidth - 296))}px`;
  }

  function buildFieldPickerPopover() {
    const pop = document.createElement('div');
    pop.className = 'adv-field-picker-pop';
    pop.tabIndex = -1;
    pop.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); closeFieldPicker(); }
    });

    // Toggle DUY NHẤT hiện/ẩn trường mở rộng (tiêu chí 4/5) — mặc định TẮT.
    const toggleBtn = document.createElement('button');
    toggleBtn.type = 'button';
    toggleBtn.className = 'adv-field-picker-toggle';
    toggleBtn.textContent = advShowExtra ? '▾ Đang hiện tất cả trường — bấm để thu gọn'
                                          : '▸ Hiện thêm trường';
    toggleBtn.addEventListener('click', () => {
      advShowExtra = !advShowExtra;
      persistAdvFieldSetting();
      renderAdvConditionsFull();
      reopenFieldPicker();
    });
    pop.appendChild(toggleBtn);

    const list = document.createElement('div');
    list.className = 'adv-field-picker-list';
    let dragCode = null;
    visibleAdvFieldCodes().forEach((code) => {
      const def = FIELD_BY_CODE[code];
      if (!def) return;
      const item = document.createElement('div');
      item.className = 'adv-field-picker-item';
      item.draggable = true;
      item.textContent = '⠿ ' + def.label;
      item.dataset.code = code;
      item.addEventListener('dragstart', (e) => {
        dragCode = code;
        e.dataTransfer.effectAllowed = 'move';
        item.classList.add('dragging');
      });
      item.addEventListener('dragend', () => item.classList.remove('dragging'));
      item.addEventListener('dragover', (e) => { e.preventDefault(); });
      item.addEventListener('drop', (e) => {
        e.preventDefault();
        if (dragCode && dragCode !== code) {
          reorderAdvField(dragCode, code);
          renderAdvConditionsFull();
          reopenFieldPicker();
        }
      });
      list.appendChild(item);
    });
    pop.appendChild(list);
    return pop;
  }

  function toggleFieldPicker(btnEl) {
    if (advPickerEl) { closeFieldPicker(); return; }
    advPickerBtnEl = btnEl;
    advPickerEl = buildFieldPickerPopover();
    document.body.appendChild(advPickerEl);
    positionPopover(advPickerEl, btnEl);
    document.addEventListener('mousedown', onAdvPickerOutsideClick, true);
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
    loadAdvFieldSetting();
    advConditions = [newAdvConditionRow()];
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

    // Đợt 12 (phản hồi anh Khôi): MỌI người (kể cả nhân viên) thấy danh sách
    // đầy đủ; chọn 1 người -> lọc hồ sơ NGƯỜI ĐÓ ĐÃ THAM GIA SỬA (dấu vết
    // nhat_ky), không phải theo phân công.
    advPanel.appendChild(fieldBox('Nhân viên (đã tham gia sửa)', () => {
      const sel = document.createElement('select');
      sel.className = 'filter-select';
      const optAll = document.createElement('option'); optAll.value = ''; optAll.textContent = '(Tất cả)';
      sel.appendChild(optAll);
      (danhMuc.nguoi_dung || []).forEach((n) => {
        const o = document.createElement('option'); o.value = n.ma; o.textContent = n.ten; sel.appendChild(o);
      });
      msRefs.nguoiRaSoatSel = sel;
      sel.addEventListener('change', () => { filters.nguoi_ra_soat_id = sel.value; page = 1; reload(); });
      return sel;
    }));

    // ---- "Box điều kiện": chọn 1 trường bất kỳ (Box 1) + toán tử (Box 2),
    // nhiều dòng nối AND, kèm nút "⚙" mở popover hiện thêm trường/sắp thứ
    // tự (xem khối hàm phía trên: renderAdvConditionsFull, toggleFieldPicker). ----
    const advCondSection = document.createElement('div');
    advCondSection.className = 'adv-cond-section';
    const condLabel = document.createElement('div');
    condLabel.className = 'filter-label';
    condLabel.textContent = 'Điều kiện lọc (Box điều kiện)';
    advCondSection.appendChild(condLabel);
    advCondRowsEl = document.createElement('div');
    advCondRowsEl.id = 'adv-cond-rows';
    advCondSection.appendChild(advCondRowsEl);
    advCondAddWrapEl = document.createElement('div');
    advCondAddWrapEl.id = 'adv-cond-add-wrap';
    advCondSection.appendChild(advCondAddWrapEl);
    advPanel.appendChild(advCondSection);
    renderAdvConditionsFull();

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

    // Nút tải Excel TOÀN BỘ danh sách theo bộ lọc hiện tại (đầy đủ cột, mã hồ
    // sơ ở đầu) — không phụ thuộc phân trang. Dùng thẻ <a> tải trực tiếp
    // (cookie phiên tự gửi kèm với GET cùng origin).
    const excelBtn = document.createElement('button');
    excelBtn.type = 'button';
    excelBtn.id = 'list-excel-btn';
    excelBtn.className = 'list-excel-btn';
    excelBtn.textContent = '⬇ Tải Excel (danh sách đã lọc)';
    excelBtn.title = 'Tải toàn bộ kết quả đang lọc ra .xlsx (đầy đủ cột)';
    excelBtn.addEventListener('click', () => {
      const before = excelBtn.textContent;
      excelBtn.disabled = true;
      excelBtn.textContent = '⏳ Đang tạo file…';
      const iframe = document.createElement('iframe');
      iframe.style.display = 'none';
      iframe.src = buildExcelUrl();
      document.body.appendChild(iframe);
      setTimeout(() => {
        excelBtn.disabled = false;
        excelBtn.textContent = before;
        setTimeout(() => iframe.remove(), 60000);
      }, 1500);
    });
    summaryRow.appendChild(excelBtn);

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
    // Tiêu chí 24: "Xóa hết bộ lọc" cũng xóa sạch mọi dòng Box điều kiện,
    // về lại đúng 1 dòng trống.
    advConditions = [newAdvConditionRow()];
    renderAdvConditionsFull();
    page = 1;
    reload();
  }

  function currentFilterParams() {
    const dk = advConditionsPayload();
    return {
      xa: filters.xa, ngay_tu: filters.ngay_tu, ngay_den: filters.ngay_den,
      q: filters.q, q_hoten_only: filters.q_hoten_only ? 'true' : '',
      trang_thai: filters.trang_thai, nguoi_ra_soat_id: filters.nguoi_ra_soat_id,
      co_qc: filters.co_qc, phan_loai_sk: filters.phan_loai_sk,
      co_quan_benh_chinh: filters.co_quan_benh_chinh,
      // "Box điều kiện" (Bộ lọc nâng cao) — JSON các dòng điều kiện ĐÃ ĐỦ
      // điều kiện gửi lên (rỗng -> '' -> bị api.js:qs() bỏ qua, không gửi).
      dieu_kien: dk.length ? JSON.stringify(dk) : '',
    };
  }

  function buildExcelUrl() {
    const p = currentFilterParams();
    const usp = new URLSearchParams();
    Object.entries(p).forEach(([k, v]) => {
      if (Array.isArray(v)) {
        v.forEach((x) => { if (x !== '' && x != null) usp.append(k, x); });
      } else if (v !== '' && v != null) {
        usp.append(k, v);
      }
    });
    return '/api/ho-so/xuat-excel?' + usp.toString();
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
