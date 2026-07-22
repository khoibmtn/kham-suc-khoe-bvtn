// list.js — màn hình DANH SÁCH: 9 (10 với admin) bộ lọc §3.2, bảng kết quả,
// phân trang, di chuyển bàn phím ↑↓/Enter, tô màu dòng theo cờ (§4).
// Đợt 2 (tiêu chí 6, 8): bộ lọc gọn dùng Multiselect (checkbox-dropdown) cho
// Xã/phường, Cờ cảnh báo, Phân loại SK, Trạng thái, Cơ quan bệnh chính; ngày
// khám tách 2 ô có nhãn rõ; đếm kết quả "Hiển thị a–b / X kết quả".

const ListView = (() => {
  let root, danhMuc, user, onOpen;
  let filters = {};
  let items = [];
  let selectedIdx = -1;
  let page = 1;
  const pageSize = 50;
  let total = 0;
  let debounceTimer = null;
  const msRefs = {}; // tham chiếu Multiselect + input ngày để "Xóa hết bộ lọc"

  function defaultFilters() {
    return {
      xa: [], trang_thai: [], co_qc: [], phan_loai_sk: [], co_quan_benh_chinh: [],
      ngay_tu: '', ngay_den: '', ho_ten: '', so_cccd: '', ma_ho_so: '',
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

  function buildLayout() {
    root.innerHTML = '';
    const bar = document.createElement('div');
    bar.className = 'filter-bar';

    // ---- Hàng 1: tìm kiếm theo văn bản ----
    const rowText = document.createElement('div');
    rowText.className = 'filter-row filter-row-text';

    rowText.appendChild(fieldBox('Họ tên (gõ gần đúng)', () => {
      const inp = document.createElement('input'); inp.type = 'text'; inp.id = 'search-box';
      inp.placeholder = 'vd: nguyen van, thanh...';
      msRefs.hoTenInput = inp;
      inp.addEventListener('input', () => {
        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(() => { filters.ho_ten = inp.value; page = 1; reload(); }, 200);
      });
      return inp;
    }, 'filter-field-grow'));

    rowText.appendChild(fieldBox('Số CCCD', () => {
      const inp = document.createElement('input'); inp.type = 'text';
      msRefs.cccdInput = inp;
      inp.addEventListener('input', () => { filters.so_cccd = inp.value; page = 1; reload(); });
      return inp;
    }));

    rowText.appendChild(fieldBox('Mã hồ sơ', () => {
      const inp = document.createElement('input'); inp.type = 'text';
      msRefs.maHoSoInput = inp;
      inp.addEventListener('input', () => { filters.ma_ho_so = inp.value; page = 1; reload(); });
      return inp;
    }));

    bar.appendChild(rowText);

    // ---- Hàng 2: dropdown đa chọn ----
    const rowSelect = document.createElement('div');
    rowSelect.className = 'filter-row filter-row-select';

    rowSelect.appendChild(fieldBox('Xã/phường', () => {
      const ms = Multiselect.create({
        options: danhMuc.xa.map((x) => ({ ma: x.ma, ten: x.ten })),
        selected: filters.xa,
        onChange: (vals) => { filters.xa = vals; page = 1; reload(); },
      });
      msRefs.xa = ms;
      return ms.el;
    }));

    rowSelect.appendChild(fieldBox('Cờ cảnh báo', () => {
      const ms = Multiselect.create({
        options: danhMuc.co_qc.map((f) => ({
          ma: f.ma, ten: f.ten, title: f.y_nghia,
          icon: f.muc === 'do' ? '🔴' : f.muc === 'cam' ? '🟠' : '🟡',
        })),
        selected: filters.co_qc,
        onChange: (vals) => { filters.co_qc = vals; page = 1; reload(); },
      });
      msRefs.coQc = ms;
      return ms.el;
    }));

    rowSelect.appendChild(fieldBox('Phân loại SK', () => {
      const ms = Multiselect.create({
        options: danhMuc.phan_loai_sk.map((p) => ({ ma: p.ma, ten: p.ten })),
        selected: filters.phan_loai_sk,
        onChange: (vals) => { filters.phan_loai_sk = vals; page = 1; reload(); },
      });
      msRefs.pl = ms;
      return ms.el;
    }));

    rowSelect.appendChild(fieldBox('Trạng thái', () => {
      const ms = Multiselect.create({
        options: danhMuc.trang_thai.map((t) => ({ ma: t.ma, ten: t.ten })),
        selected: filters.trang_thai,
        onChange: (vals) => { filters.trang_thai = vals; page = 1; reload(); },
      });
      msRefs.trangThai = ms;
      return ms.el;
    }));

    rowSelect.appendChild(fieldBox('Cơ quan bệnh chính', () => {
      const ms = Multiselect.create({
        options: danhMuc.co_quan_benh_chinh.map((c) => ({ ma: c.ma, ten: c.ten })),
        selected: filters.co_quan_benh_chinh,
        onChange: (vals) => { filters.co_quan_benh_chinh = vals; page = 1; reload(); },
      });
      msRefs.coQuan = ms;
      return ms.el;
    }));

    if (user.vai_tro === 'admin') {
      rowSelect.appendChild(fieldBox('Cán bộ rà soát', () => {
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
    }

    bar.appendChild(rowSelect);

    // ---- Hàng 3: ngày khám ----
    const rowDate = document.createElement('div');
    rowDate.className = 'filter-row filter-row-date';

    const tu = document.createElement('input'); tu.type = 'date';
    const den = document.createElement('input'); den.type = 'date';
    msRefs.tuInput = tu; msRefs.denInput = den;
    [tu, den].forEach((inp) => inp.addEventListener('change', () => {
      filters.ngay_tu = tu.value; filters.ngay_den = den.value; page = 1; reload();
    }));
    rowDate.appendChild(fieldBox('Từ ngày', () => tu));
    rowDate.appendChild(fieldBox('Đến ngày', () => den));

    const presetsBox = document.createElement('div');
    presetsBox.className = 'date-presets';
    const mkChip = (label, fn, extraClass) => {
      const b = document.createElement('button'); b.type = 'button';
      b.className = 'date-chip' + (extraClass ? ' ' + extraClass : '');
      b.textContent = label;
      b.addEventListener('click', () => { fn(); page = 1; reload(); });
      return b;
    };
    presetsBox.appendChild(mkChip('Hôm nay', () => {
      const t = new Date().toISOString().slice(0, 10);
      tu.value = t; den.value = t; filters.ngay_tu = t; filters.ngay_den = t;
    }));
    presetsBox.appendChild(mkChip('Tuần này', () => {
      const now = new Date();
      const day = (now.getDay() + 6) % 7; // thứ 2 = 0
      const monday = new Date(now); monday.setDate(now.getDate() - day);
      const sunday = new Date(monday); sunday.setDate(monday.getDate() + 6);
      tu.value = monday.toISOString().slice(0, 10); den.value = sunday.toISOString().slice(0, 10);
      filters.ngay_tu = tu.value; filters.ngay_den = den.value;
    }));
    presetsBox.appendChild(mkChip('Cả đợt', () => {
      tu.value = ''; den.value = ''; filters.ngay_tu = ''; filters.ngay_den = '';
    }));
    presetsBox.appendChild(mkChip('✕ Xóa lọc ngày', () => {
      tu.value = ''; den.value = ''; filters.ngay_tu = ''; filters.ngay_den = '';
    }, 'clear'));
    rowDate.appendChild(fieldBox('Chọn nhanh', () => presetsBox));

    bar.appendChild(rowDate);

    // ---- Hàng 4: hành động ----
    const rowActions = document.createElement('div');
    rowActions.className = 'filter-row filter-row-actions';
    const clearAllBtn = document.createElement('button');
    clearAllBtn.type = 'button'; clearAllBtn.id = 'btn-xoa-loc';
    clearAllBtn.textContent = 'Xóa hết bộ lọc';
    clearAllBtn.addEventListener('click', clearAllFilters);
    rowActions.appendChild(clearAllBtn);
    bar.appendChild(rowActions);

    root.appendChild(bar);

    // ---- Đếm kết quả (tiêu chí 6) ----
    const summary = document.createElement('div');
    summary.id = 'list-summary';
    summary.className = 'list-summary';
    root.appendChild(summary);

    const tableWrap = document.createElement('div');
    tableWrap.className = 'table-wrap';
    const table = document.createElement('table');
    table.id = 'ho-so-table';
    // Đợt 6 criterion 2: bỏ cột "Mã hồ sơ" (vẫn là khoá nội bộ để mở chi
    // tiết/lọc — chỉ ẩn khỏi bảng); thêm cột CCCD ngay SAU cột Giới.
    table.innerHTML = `<thead><tr>
        <th>Họ tên</th><th>Năm sinh</th><th>Giới</th><th>CCCD</th>
        <th>Xã</th><th>Ngày khám</th><th>Phân loại SK</th><th>Bệnh chính</th>
        <th>Số cờ</th><th>Trạng thái</th></tr></thead><tbody></tbody>`;
    tableWrap.appendChild(table);
    root.appendChild(tableWrap);

    const pager = document.createElement('div');
    pager.className = 'pager';
    pager.id = 'pager';
    root.appendChild(pager);
  }

  function clearAllFilters() {
    filters = defaultFilters();
    if (msRefs.xa) msRefs.xa.setSelected([]);
    if (msRefs.coQc) msRefs.coQc.setSelected([]);
    if (msRefs.pl) msRefs.pl.setSelected([]);
    if (msRefs.trangThai) msRefs.trangThai.setSelected([]);
    if (msRefs.coQuan) msRefs.coQuan.setSelected([]);
    if (msRefs.nguoiRaSoatSel) msRefs.nguoiRaSoatSel.value = '';
    if (msRefs.hoTenInput) msRefs.hoTenInput.value = '';
    if (msRefs.cccdInput) msRefs.cccdInput.value = '';
    if (msRefs.maHoSoInput) msRefs.maHoSoInput.value = '';
    if (msRefs.tuInput) msRefs.tuInput.value = '';
    if (msRefs.denInput) msRefs.denInput.value = '';
    page = 1;
    reload();
  }

  function currentFilterParams() {
    return {
      xa: filters.xa, ngay_tu: filters.ngay_tu, ngay_den: filters.ngay_den,
      ho_ten: filters.ho_ten, so_cccd: filters.so_cccd, ma_ho_so: filters.ma_ho_so,
      trang_thai: filters.trang_thai, nguoi_ra_soat_id: filters.nguoi_ra_soat_id,
      co_qc: filters.co_qc, phan_loai_sk: filters.phan_loai_sk,
      co_quan_benh_chinh: filters.co_quan_benh_chinh,
    };
  }

  async function reload() {
    const params = Object.assign({ page, page_size: pageSize }, currentFilterParams());
    const data = await Api.listHoSo(params);
    items = data.items;
    total = data.total;
    selectedIdx = items.length ? 0 : -1;
    renderTable();
    renderPager();
    renderSummary();
  }

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
    }[c]));
  }

  function renderTable() {
    const tbody = document.querySelector('#ho-so-table tbody');
    tbody.innerHTML = '';
    items.forEach((it, idx) => {
      const tr = document.createElement('tr');
      tr.dataset.idx = idx;
      if (it.muc_co === 'do') tr.classList.add('row-do');
      else if (it.muc_co === 'vang') tr.classList.add('row-vang');
      if (idx === selectedIdx) tr.classList.add('selected');
      tr.innerHTML = `<td>${esc(it.ho_ten)}</td>
        <td>${esc(it.nam_sinh)}</td><td>${esc(it.gioi_tinh)}</td>
        <td>${esc(it.so_cccd)}</td>
        <td>${esc(it.maxa_cu_tru)}</td><td>${esc(it.ngay_vao)}</td>
        <td>${esc(it.phan_loai_sk)}</td><td>${esc(it.ket_luan_benh)}</td>
        <td>${esc(it.so_loi)}</td><td>${esc(it.trang_thai_nhan)}</td>`;
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
