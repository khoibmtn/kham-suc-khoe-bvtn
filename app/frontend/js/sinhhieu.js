// sinhhieu.js — Pipeline 4: nhập nhanh sinh hiệu hàng loạt (§6.4 SPEC).
// Lưới danh sách, autosave onBlur, BMI tự hiện, import Excel.
//
// Đợt 5: cột PL thể lực KHÔNG còn nút "Gợi ý PL"/popover xác nhận tay — server
// (routers/sinh_hieu.py:patch_sinh_hieu -> services/the_luc.py:tinh_va_ap_pl)
// tự tính và ghi kham_the_luc_pl ngay khi chiều cao/cân nặng đổi VÀ đủ dữ
// liệu; ô chỉ hiển thị giá trị hiện tại (badge) và chớp xanh khi server báo
// vừa tự đổi (xem plCellHtml()/saveCell()).
//
// Đợt 3 criterion 6: bộ lọc đồng bộ với Danh sách — Xã/phường dùng
// Multiselect checkbox "Tất cả" (component dùng chung multiselect.js), thêm
// ô "Họ tên (gõ gần đúng)" debounce 200ms (param ho_ten fuzzy — Đợt 3A),
// Trạng thái/Sinh hiệu restyled cùng bộ class .filter-* của list.js; grid
// CHỈ còn đúng 4 ô/người (chiều cao, cân nặng, mạch, huyết áp) — bỏ 2 cột
// Thị lực/Thính lực (backend không còn trả/nhận 2 trường này ở API này);
// nút "Tải file mẫu" tải kèm bộ lọc hiện tại (query string, cookie session
// tự gửi kèm khi điều hướng tải file — không cần fetch blob).
//
// Criterion 8/10: mỗi ô sinh hiệu tiền kiểm ngưỡng (NguongCheck, khớp logic
// backend) khi blur — huyết áp gõ liền số tự tách "12080"->"120/80"; ngoài
// ngưỡng -> KHÔNG lưu, ô .invalid (đỏ) + tooltip + toast; lưu thành công ->
// ô .saved (xanh, tự phai) — cả 2 đường: tiền kiểm client VÀ lỗi 422 server
// (belt & braces).

const SinhHieuView = (() => {
  let panel, danhMuc;
  let filters = { xa: [], trang_thai: '', sinh_hieu: '', ho_ten: '', ngay_tu: '', ngay_den: '' };
  let page = 1;
  const pageSize = 30;
  let total = 0;
  let items = [];
  let debounceTimer = null;
  const msRefs = {};

  function init(panelEl, dm) {
    panel = panelEl;
    danhMuc = dm;
  }

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => (
      { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  async function show() {
    render();
    await reload();
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

  // Đợt 7 criterion 9: ESC trong ô tìm/ngày -> xóa sạch + reset kết quả,
  // KHÔNG nổi bọt lên phím tắt toàn cục Esc-đóng-chi-tiết (khớp list.js A7).
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

  function render() {
    panel.innerHTML = '';

    const header = document.createElement('h2');
    header.textContent = 'Sinh hiệu — nhập nhanh hàng loạt';
    panel.appendChild(header);

    // ---- Bộ lọc (giống Danh sách — tiêu chí 6) ----
    const bar = document.createElement('div');
    bar.className = 'filter-bar';
    const row = document.createElement('div');
    row.className = 'filter-row';

    row.appendChild(fieldBox('Họ tên (gõ gần đúng)', () => {
      const inp = document.createElement('input');
      inp.type = 'text'; inp.id = 'sh-flt-ho-ten';
      inp.placeholder = 'vd: nguyen van, thanh...';
      inp.value = filters.ho_ten;
      msRefs.hoTenInput = inp;
      inp.addEventListener('input', () => {
        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(() => { filters.ho_ten = inp.value; page = 1; reload(); }, 200);
      });
      wireEscClear(inp, () => { filters.ho_ten = ''; });
      return inp;
    }, 'filter-field-grow'));

    row.appendChild(fieldBox('Từ ngày', () => {
      const inp = document.createElement('input');
      inp.type = 'date'; inp.id = 'sh-flt-ngay-tu';
      inp.value = filters.ngay_tu;
      inp.addEventListener('change', () => { filters.ngay_tu = inp.value; page = 1; reload(); });
      wireEscClear(inp, () => { filters.ngay_tu = ''; });
      msRefs.ngayTuInput = inp;
      return inp;
    }));

    row.appendChild(fieldBox('Đến ngày', () => {
      const inp = document.createElement('input');
      inp.type = 'date'; inp.id = 'sh-flt-ngay-den';
      inp.value = filters.ngay_den;
      inp.addEventListener('change', () => { filters.ngay_den = inp.value; page = 1; reload(); });
      wireEscClear(inp, () => { filters.ngay_den = ''; });
      msRefs.ngayDenInput = inp;
      return inp;
    }));

    row.appendChild(fieldBox('Xã/phường', () => {
      const ms = Multiselect.create({
        options: (danhMuc.xa || []).map((x) => ({ ma: x.ma, ten: x.ten })),
        selected: filters.xa,
        onChange: (vals) => { filters.xa = vals; page = 1; reload(); },
      });
      msRefs.xa = ms;
      return ms.el;
    }));

    row.appendChild(fieldBox('Trạng thái', () => {
      const sel = document.createElement('select');
      sel.className = 'filter-select';
      sel.id = 'sh-flt-tt';
      [
        ['', 'Tất cả'], ['chua_ra_soat', 'Chưa rà soát'], ['dang_ra_soat', 'Đang rà soát'],
        ['hoan_thanh', 'Hoàn thành'], ['can_doi_chieu_giay', 'Cần đối chiếu giấy'],
      ].forEach(([v, t]) => {
        const o = document.createElement('option'); o.value = v; o.textContent = t;
        if (v === filters.trang_thai) o.selected = true;
        sel.appendChild(o);
      });
      sel.addEventListener('change', () => { filters.trang_thai = sel.value; page = 1; reload(); });
      msRefs.trangThai = sel;
      return sel;
    }));

    row.appendChild(fieldBox('Sinh hiệu', () => {
      const sel = document.createElement('select');
      sel.className = 'filter-select';
      sel.id = 'sh-flt-sh';
      [['', 'Tất cả'], ['thieu', 'Thiếu (còn cờ)'], ['du', 'Đã đủ']].forEach(([v, t]) => {
        const o = document.createElement('option'); o.value = v; o.textContent = t;
        if (v === filters.sinh_hieu) o.selected = true;
        sel.appendChild(o);
      });
      sel.addEventListener('change', () => { filters.sinh_hieu = sel.value; page = 1; reload(); });
      msRefs.sinhHieu = sel;
      return sel;
    }));

    bar.appendChild(row);
    panel.appendChild(bar);

    const toastSpan = document.createElement('span');
    toastSpan.className = 'sh-toast';
    toastSpan.id = 'sh-toast';
    panel.appendChild(toastSpan);

    // ---- Import Excel + lưới nhập nhanh (chỉ 4 ô sinh hiệu — tiêu chí 6) ----
    const rest = document.createElement('div');
    rest.innerHTML = `
      <div class="sh-excel-box">
        <button id="sh-excel-toggle" type="button" class="sh-excel-toggle">▸ Nhập từ Excel</button>
        <div id="sh-excel-body" class="sh-excel-body" hidden>
          <button id="sh-template-btn" type="button">Tải file mẫu (.xlsx)</button>
          <input type="file" id="sh-import-file" accept=".xlsx">
          <button id="sh-import-btn" type="button">Nhập từ Excel</button>
          <div id="sh-import-report"></div>
        </div>
      </div>

      <div class="table-wrap sh-table-wrap">
        <table class="sh-grid">
          <thead>
            <tr>
              <th>Mã hồ sơ</th><th>Họ tên</th><th>Năm sinh</th><th>Giới</th><th>CCCD</th>
              <th>Xã</th><th>Ngày khám</th>
              <th>Chiều cao (cm)</th><th>Cân nặng (kg)</th><th>BMI</th>
              <th>Mạch</th><th>Huyết áp</th>
              <th>Phân loại thể lực</th><th></th>
            </tr>
          </thead>
          <tbody id="sh-tbody"></tbody>
        </table>
      </div>
      <div class="pager">
        <button id="sh-prev" type="button">‹ Trước</button>
        <span id="sh-page-info"></span>
        <button id="sh-next" type="button">Sau ›</button>
      </div>
    `;
    panel.appendChild(rest);

    wire();
  }

  const EXCEL_OPEN_KEY = 'ksk_sh_import_open';

  // Đợt 9 criterion 7: hộp Import Excel mặc định ĐÓNG (tránh bấm nhầm) —
  // nhớ trạng thái mở/đóng ở localStorage để không phải mở lại mỗi lần vào
  // trang.
  function wireExcelToggle() {
    const toggleBtn = panel.querySelector('#sh-excel-toggle');
    const body = panel.querySelector('#sh-excel-body');
    const setOpen = (open) => {
      body.hidden = !open;
      toggleBtn.textContent = (open ? '▾' : '▸') + ' Nhập từ Excel';
      localStorage.setItem(EXCEL_OPEN_KEY, open ? '1' : '0');
    };
    setOpen(localStorage.getItem(EXCEL_OPEN_KEY) === '1');
    toggleBtn.addEventListener('click', () => setOpen(body.hidden));
  }

  function wire() {
    panel.querySelector('#sh-prev').addEventListener('click', () => { if (page > 1) { page--; reload(); } });
    panel.querySelector('#sh-next').addEventListener('click', () => {
      if (page * pageSize < total) { page++; reload(); }
    });
    panel.querySelector('#sh-template-btn').addEventListener('click', downloadTemplate);
    panel.querySelector('#sh-import-btn').addEventListener('click', doImport);
    wireExcelToggle();
  }

  function toast(msg) {
    const t = panel.querySelector('#sh-toast');
    if (!t) return;
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(t._timer);
    t._timer = setTimeout(() => t.classList.remove('show'), 1600);
  }

  function currentFilterParams() {
    return {
      xa: filters.xa,
      trang_thai: filters.trang_thai ? [filters.trang_thai] : [],
      sinh_hieu: filters.sinh_hieu,
      ho_ten: filters.ho_ten,
      ngay_tu: filters.ngay_tu,
      ngay_den: filters.ngay_den,
    };
  }

  async function reload() {
    const tbody = panel.querySelector('#sh-tbody');
    tbody.innerHTML = '<tr><td colspan="14">Đang tải...</td></tr>';
    try {
      const res = await Api.sinhHieuList(Object.assign({ page, page_size: pageSize }, currentFilterParams()));
      items = res.items;
      total = res.total;
      renderRows();
      panel.querySelector('#sh-page-info').textContent =
        `Trang ${page} / ${Math.max(1, Math.ceil(total / pageSize))} — tổng ${total}`;
    } catch (err) {
      tbody.innerHTML = `<tr><td colspan="14" class="xf-error">${esc(err.message)}</td></tr>`;
    }
  }

  function bmiClass(bmi) {
    if (bmi == null) return '';
    if (bmi < 18.5) return 'bmi-thap';
    if (bmi < 25) return 'bmi-binhthuong';
    return 'bmi-cao';
  }

  function renderRows() {
    const tbody = panel.querySelector('#sh-tbody');
    if (!items.length) {
      tbody.innerHTML = '<tr><td colspan="14">Không có hồ sơ phù hợp bộ lọc</td></tr>';
      return;
    }
    tbody.innerHTML = items.map((it) => `
      <tr data-ma="${esc(it.ma_ho_so)}" class="${it.thieu_sinh_hieu ? 'row-vang' : ''}">
        <td class="sh-ma">${esc(it.ma_ho_so)}</td>
        <td>${esc(it.ho_ten)}</td>
        <td>${esc(it.nam_sinh)}</td>
        <td>${esc(it.gioi_tinh)}</td>
        <td>${esc(it.so_cccd)}</td>
        <td>${esc(it.maxa_cu_tru)}</td>
        <td>${esc(it.ngay_vao)}</td>
        <td><input class="sh-cell" data-field="chieu_cao" type="text" inputmode="decimal" value="${it.chieu_cao ?? ''}"></td>
        <td><input class="sh-cell" data-field="can_nang" type="text" inputmode="decimal" value="${it.can_nang ?? ''}"></td>
        <td class="sh-bmi ${bmiClass(it.chi_so_bmi)}">${it.chi_so_bmi ?? '—'}</td>
        <td><input class="sh-cell" data-field="mach" type="text" value="${esc(it.mach ?? '')}"></td>
        <td><input class="sh-cell" data-field="huyet_ap" type="text" value="${esc(it.huyet_ap ?? '')}"></td>
        <td class="sh-pl-cell">${plCellHtml(it.kham_the_luc_pl)}</td>
        <td class="sh-clear-td"><button class="sh-clear-btn" tabindex="-1"
            title="Xóa toàn bộ sinh hiệu của dòng này">✕</button></td>
      </tr>`).join('');

    tbody.querySelectorAll('.sh-cell').forEach((input) => {
      input.addEventListener('blur', onCellBlur);
      input.addEventListener('keydown', onCellKeydown);
    });
    // tabindex=-1 để Tab/Enter giữ nguyên luồng cao->cân->mạch->HA->hàng kế
    tbody.querySelectorAll('.sh-clear-btn').forEach((btn) => {
      btn.addEventListener('click', onClearRow);
    });
  }

  // Xóa cả dòng: 1 PATCH duy nhất set 4 trường về null — backend tự xóa BMI +
  // PL thể lực (hết đủ dữ liệu) + gắn lại cờ THIEU_SINH_HIEU + ghi nhat_ky.
  async function onClearRow(e) {
    const tr = e.target.closest('tr');
    const ma = tr.dataset.ma;
    const item = items.find((it) => it.ma_ho_so === ma);
    if (!item) return;
    try {
      const res = await Api.sinhHieuPatch(ma, {
        chieu_cao: null, can_nang: null, mach: null, huyet_ap: null,
      });
      ['chieu_cao', 'can_nang', 'mach', 'huyet_ap'].forEach((f) => { item[f] = null; });
      item.chi_so_bmi = res.chi_so_bmi;
      item.thieu_sinh_hieu = res.thieu_sinh_hieu;
      item.kham_the_luc_pl = res.kham_the_luc_pl;
      rowCells(tr).forEach((inp) => {
        inp.value = '';
        inp.classList.remove('invalid');
        inp.removeAttribute('title');
      });
      tr.querySelector('.sh-bmi').textContent = res.chi_so_bmi ?? '—';
      tr.querySelector('.sh-bmi').className = `sh-bmi ${bmiClass(res.chi_so_bmi)}`;
      tr.querySelector('.sh-pl-cell').innerHTML = plCellHtml(res.kham_the_luc_pl);
      tr.classList.toggle('row-vang', res.thieu_sinh_hieu);
      toast('Đã xóa sinh hiệu dòng ' + ma);
    } catch (err) {
      toast('Lỗi: ' + err.message);
    }
  }

  // Đợt 5 criterion 4: cột PL không còn nút "Gợi ý PL"/popover xác nhận —
  // chỉ hiển thị giá trị hiện tại (badge xanh sh-pl-confirmed, giống các badge
  // đã xác nhận khác) hoặc dấu gạch ngang khi chưa đủ dữ liệu để tự tính.
  function plCellHtml(pl) {
    return pl
      ? `<span class="sh-pl-confirmed">Loại ${pl}</span>`
      : '<span class="sh-pl-empty">—</span>';
  }

  // Đợt 4B criterion 8: 4 ô/hàng theo đúng thứ tự DOM chiều cao->cân nặng->
  // mạch->huyết áp (khớp cột bảng — xem renderRows).
  function rowCells(tr) {
    return Array.from(tr.querySelectorAll('.sh-cell'));
  }

  // Enter: lưu ô hiện tại (dùng CHUNG saveCell với blur — tránh double-PATCH,
  // xem guard _savingViaEnter bên dưới) rồi mới quyết định điều hướng — sai
  // ngưỡng thì Ở LẠI + đỏ (không sang ô/hàng kế); hợp lệ thì sang ô kế trong
  // hàng, hoặc nếu là ô CUỐI (huyết áp) thì sang thẳng ô chiều cao của hàng
  // KẾ TIẾP (Đợt 5 criterion 4: PL thể lực đã tự set từ response saveCell —
  // không còn bước "Gợi ý PL" trung gian như Đợt 4B). Tab giữ nguyên hành vi
  // tự nhiên của trình duyệt (DOM order đã đúng thứ tự hàng->hàng).
  async function onCellKeydown(e) {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    const input = e.target;
    if (input._savingViaEnter) return; // chặn double-fire khi giữ phím Enter
    input._savingViaEnter = true;
    try {
      const ok = await saveCell(input);
      if (!ok) {
        input.focus({ preventScroll: false });
        input.select();
        return;
      }
      const tr = input.closest('tr');
      const cells = rowCells(tr);
      const idx = cells.indexOf(input);
      if (idx < cells.length - 1) {
        const next = cells[idx + 1];
        next.focus({ preventScroll: false });
        next.select();
      } else {
        focusNextRowChieuCao(tr);
      }
    } finally {
      input._savingViaEnter = false;
    }
  }

  function focusNextRowChieuCao(tr) {
    const rows = Array.from(panel.querySelectorAll('#sh-tbody tr'));
    const idx = rows.indexOf(tr);
    const nextRow = rows[idx + 1];
    if (!nextRow) return; // hàng cuối trang -> dừng lại, không tự sang trang
    const target = nextRow.querySelector('.sh-cell[data-field="chieu_cao"]');
    if (target) {
      target.focus({ preventScroll: false });
      target.select();
      target.scrollIntoView({ block: 'nearest' });
    }
  }

  const VITAL_FIELDS = ['chieu_cao', 'can_nang', 'mach', 'huyet_ap'];

  function flashSavedCell(input) {
    input.classList.remove('invalid');
    input.removeAttribute('title');
    input.classList.add('saved');
    clearTimeout(input._savedTimer);
    input._savedTimer = setTimeout(() => input.classList.remove('saved'), 1500);
  }

  function flashInvalidCell(input, msg) {
    input.classList.remove('saved');
    input.classList.add('invalid');
    if (msg) input.title = msg;
  }

  // Đợt 4B criterion 8: lõi lưu 1 ô — tách khỏi sự kiện 'blur' để onCellKeydown
  // (Enter) có thể gọi TRỰC TIẾP và chờ (await) kết quả trước khi quyết định
  // điều hướng, tránh double-PATCH (criterion 7/9): khi Enter tự gọi hàm này
  // rồi chuyển focus bằng .focus(), trình duyệt vẫn tự bắn sự kiện 'blur' tự
  // nhiên trên ô cũ — cờ input._savingViaEnter (đặt bởi onCellKeydown) chặn
  // onCellBlur gọi lại saveCell lần 2 cho cùng 1 ô. Trả về true = hợp lệ (đã
  // lưu HOẶC không đổi gì), false = ngoài ngưỡng/lỗi lưu (không tiến ô kế).
  async function saveCell(input) {
    const tr = input.closest('tr');
    const ma = tr.dataset.ma;
    const field = input.dataset.field;
    const raw = input.value.trim();
    const item = items.find((x) => x.ma_ho_so === ma);
    if (!item) return true;
    const oldVal = item[field] == null ? '' : String(item[field]);

    // Đợt 6 criterion 1: chuẩn hoá dấu thập phân (','->'.') TRƯỚC kiểm
    // ngưỡng — áp cho chieu_cao/can_nang/mach (NUMERIC_FIELD_CODES,
    // fields.js); huyet_ap không phải định dạng thập phân nên bỏ qua bước
    // này. Sai định dạng (không phải số) -> đỏ + tooltip 'Phải là số',
    // KHÔNG lưu, focus ở lại (khớp Enter-handler onCellKeydown bên trên).
    let valueToSend = raw;
    if (NUMERIC_FIELD_CODES.has(field) && valueToSend !== '') {
      const norm = NguongCheck.normalizeSo(valueToSend);
      if (!norm.ok) {
        flashInvalidCell(input, 'Phải là số');
        toast('Lỗi: Phải là số');
        return false;
      }
      valueToSend = norm.value;
      input.value = valueToSend;
    }

    // Đợt 3 criterion 8: tiền kiểm ngưỡng phía client — huyết áp gõ liền số
    // tự tách thành tâm_thu/tâm_trương ngay khi blur trước khi so sánh/lưu.
    if (VITAL_FIELDS.includes(field) && valueToSend !== '') {
      const chk = NguongCheck.check(field, valueToSend);
      if (!chk.ok) {
        flashInvalidCell(input, chk.ly_do);
        toast('Lỗi: ' + chk.ly_do);
        return false; // KHÔNG lưu — giữ nguyên giá trị cũ trong DB
      }
      if (chk.value !== undefined) {
        valueToSend = String(chk.value);
        input.value = valueToSend;
      }
    }

    if (valueToSend === oldVal) {
      input.classList.remove('invalid');
      input.removeAttribute('title');
      return true; // không đổi -> không gọi API
    }

    const payload = {};
    payload[field] = valueToSend === '' ? null : valueToSend;
    input.classList.add('sh-saving');
    try {
      const res = await Api.sinhHieuPatch(ma, payload);
      const isNumeric = field === 'chieu_cao' || field === 'can_nang';
      item[field] = valueToSend === '' ? null : (isNumeric ? Number(valueToSend) : valueToSend);
      item.chi_so_bmi = res.chi_so_bmi;
      item.thieu_sinh_hieu = res.thieu_sinh_hieu;
      tr.querySelector('.sh-bmi').textContent = res.chi_so_bmi ?? '—';
      tr.querySelector('.sh-bmi').className = `sh-bmi ${bmiClass(res.chi_so_bmi)}`;
      tr.classList.toggle('row-vang', res.thieu_sinh_hieu);
      // Đợt 5 criterion 2/4: server tự tính lại PL thể lực khi chiều cao/cân
      // nặng đổi — đồng bộ cột PL với giá trị hiện tại luôn (res.kham_the_luc_pl),
      // chớp xanh riêng khi lần PATCH này THỰC SỰ tự đổi nó (res.updated có mặt).
      item.kham_the_luc_pl = res.kham_the_luc_pl;
      const plCell = tr.querySelector('.sh-pl-cell');
      if (plCell) {
        plCell.innerHTML = plCellHtml(res.kham_the_luc_pl);
        if (res.updated && 'kham_the_luc_pl' in res.updated) {
          Widgets.flashSaved(plCell.firstElementChild);
        }
      }
      flashSavedCell(input);
      toast('Đã lưu');
      return true;
    } catch (err) {
      // Belt & braces — server vẫn có thể trả 422 (ngưỡng đổi sau khi tiền
      // kiểm client, hoặc lý do khác) -> tô đỏ + toast + hoàn tác hiển thị.
      flashInvalidCell(input, err.message);
      toast('Lỗi: ' + err.message);
      input.value = oldVal;
      return false;
    } finally {
      input.classList.remove('sh-saving');
    }
  }

  async function onCellBlur(e) {
    const input = e.target;
    if (input._savingViaEnter) return; // Enter đang tự xử lý lưu — tránh double-PATCH
    await saveCell(input);
  }

  // Đợt 3 criterion 6: file mẫu tải kèm bộ lọc hiện tại đang áp dụng trên
  // lưới (cookie session tự gửi kèm khi điều hướng tải file same-origin).
  function downloadTemplate() {
    const q = Api.qs(currentFilterParams());
    window.open('/api/sinh-hieu/mau-excel' + (q ? '?' + q : ''), '_blank');
  }

  async function doImport() {
    const fileInput = panel.querySelector('#sh-import-file');
    const reportBox = panel.querySelector('#sh-import-report');
    if (!fileInput.files.length) {
      reportBox.innerHTML = '<div class="xf-error">Chưa chọn file</div>';
      return;
    }
    reportBox.innerHTML = 'Đang nhập...';
    try {
      const res = await Api.sinhHieuImportExcel(fileInput.files[0]);
      const khongKhopRows = (res.khong_khop || []).map((r) => `
        <tr><td>${r.dong}</td><td>${esc(r.ly_do)}</td></tr>`).join('');
      const loiNguongRows = (res.loi_nguong || []).map((r) => `
        <tr><td>${r.dong}</td><td>${esc(r.ma_ho_so)}</td><td>${esc(r.ly_do)}</td></tr>`).join('');
      reportBox.innerHTML = `
        <div class="sh-import-stats">
          Tổng ${res.tong_dong} dòng — Khớp mã hồ sơ: <b class="xf-ok">${res.khop_ma_ho_so}</b> —
          Khớp CCCD: <b class="xf-ok">${res.khop_cccd}</b> —
          Khớp tên+ngày: <b class="xf-ok">${res.khop_ten_ngay}</b> —
          Không khớp: <b class="xf-red">${res.so_khong_khop}</b> —
          Ngoài ngưỡng (bị từ chối): <b class="xf-red">${res.so_loi_nguong}</b>
        </div>
        ${res.khong_khop && res.khong_khop.length ? `
          <table class="dash-table">
            <thead><tr><th>Dòng</th><th>Lý do không khớp</th></tr></thead>
            <tbody>${khongKhopRows}</tbody>
          </table>` : ''}
        ${res.loi_nguong && res.loi_nguong.length ? `
          <table class="dash-table">
            <thead><tr><th>Dòng</th><th>Mã hồ sơ</th><th>Lý do ngoài ngưỡng</th></tr></thead>
            <tbody>${loiNguongRows}</tbody>
          </table>` : ''}
      `;
      fileInput.value = '';
      await reload();
    } catch (err) {
      reportBox.innerHTML = `<div class="xf-error">${esc(err.message)}</div>`;
    }
  }

  return { init, show };
})();
