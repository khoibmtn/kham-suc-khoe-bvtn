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
  // Mã trường Box điều kiện KHÔNG có sẵn cột riêng trong bảng — server trả về
  // kèm mỗi item (xem ho_so.py list_ho_so `extra_fields`), hiện thêm cột động
  // trước "Mã hồ sơ" để nhìn thấy giá trị đang lọc (phản hồi anh Khôi).
  let extraFieldCodes = [];
  const msRefs = {}; // tham chiếu Multiselect + input ngày để "Xóa hết bộ lọc"
  let coQcCounts = null; // {mã cờ: số hồ sơ} — nạp sau, để hiện count + ẩn cờ rỗng

  // ===== "Danh sách tùy chỉnh" (collection) — checkbox dòng/đầu bảng đổi
  // thành "chọn tạm" ở FRONTEND, KHÔNG ghi DB ngay. selectedSet sống suốt
  // phiên làm việc: KHÔNG reset khi reload()/renderTable()/đổi bộ lọc (kể cả
  // đổi danh_sach_id) — CHỈ reset khi bấm "Bỏ chọn tất cả" hoặc F5. =====
  let selectedSet = new Set();
  // "Chọn tất cả khớp bộ lọc" (mọi trang) — true khi checkbox đầu bảng đã
  // tích và đã nạp ĐỦ ma_ho_so khớp bộ lọc hiện tại vào selectedSet.
  // allFilterSelectedSnapshot: JSON currentFilterParams() lúc set true gần
  // nhất — reload() so sánh để tự phát hiện bộ lọc đã đổi (criterion 13).
  // allFilterSelectedMaList: đúng danh sách mã đã nạp lúc đó — dùng để XOÁ
  // lại khỏi selectedSet khi bỏ tích đầu bảng (KHÔNG gọi lại API).
  let allFilterSelected = false;
  let allFilterSelectedSnapshot = null;
  let allFilterSelectedMaList = [];
  let danhSachList = []; // [{id, ten, nguoi_tao_id, thoi_diem_tao, so_luong}] —
                          // cache cho dropdown "Xem theo danh sách" (nạp lại sau tạo/xóa).
  let danhSachSelectEl = null;
  let danhSachDeleteBtnEl = null;
  let addListPopoverEl = null;    // popover "Thêm vào danh sách" đang mở (null = đóng)
  let addListPopoverBtnEl = null;

  // Chỉ người TẠO ra 1 danh sách hoặc admin mới có quyền GHI (xóa danh
  // sách/thêm-bớt case) — xem/lọc (GET, dropdown, cột "Danh sách") KHÔNG bị
  // giới hạn bởi hàm này. Phòng thủ: nguoi_tao_id null/undefined (không nên
  // xảy ra sau migration backend, nhưng phòng lỗi timing) -> chỉ admin.
  function coQuyenGhiDanhSach(ds) {
    if (!ds) return false;
    if (user && user.vai_tro === 'admin') return true;
    if (ds.nguoi_tao_id === null || ds.nguoi_tao_id === undefined) return false;
    return user && ds.nguoi_tao_id === user.id;
  }

  // Tùy chọn cho dropdown "Cờ cảnh báo": khi đã có coQcCounts thì gắn số lượng
  // vào nhãn + BỎ cờ 0 hồ sơ (giữ lại cờ đang được chọn dù = 0 để không mất
  // lựa chọn hiện tại). Chưa có count -> hiện toàn bộ như cũ.
  // coQcCounts nay có format {counts: {mã_cờ: N}, tong: X} — `tong` LUÔN LÀ
  // SỐ (kể cả 0, kể cả khi đang xem "Tất cả" = tổng toàn bảng) — mọi cờ hiện
  // ĐÚNG định dạng "tử_số/tổng" (vd "172/13.326"), không còn nhánh "(N)" rời.
  function coQcOptions() {
    let flags = danhMuc.co_qc;
    const counts = coQcCounts ? coQcCounts.counts : null;
    if (counts) {
      flags = flags.filter((f) => (counts[f.ma] || 0) > 0
        || (filters.co_qc || []).includes(f.ma));
    }
    return flags.map((f) => {
      const n = counts ? (counts[f.ma] || 0) : null;
      const suffix = n !== null
        ? ` ${n.toLocaleString('vi-VN')}/${(coQcCounts.tong || 0).toLocaleString('vi-VN')}`
        : '';
      return {
        ma: f.ma,
        ten: f.ten + suffix,
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

  // Nạp lại coQcCounts theo TOÀN BỘ bộ lọc hiện tại (currentFilterParams())
  // rồi dựng lại dropdown Cờ cảnh báo — dùng CHUNG cho mọi nơi cần đồng bộ số
  // liệu khi BẤT KỲ bộ lọc nào đổi (kích hoạt thống nhất qua snapshot-compare
  // trong reload(), xem coQcParamsSnapshot bên dưới — KHÔNG còn lời gọi rời
  // rạc ở từng handler). Có seq-guard chống race: nếu bộ lọc đổi liên tiếp
  // nhanh, chỉ kết quả của lần gọi MỚI NHẤT được áp dụng (tiêu chí 22 — không
  // giữ số liệu cũ đè lên số liệu mới).
  let coQcSeq = 0;
  // Snapshot RIÊNG cho cơ chế trigger refreshCoQcCounts() (KHÔNG tái dùng
  // allFilterSelectedSnapshot — biến đó phục vụ mục đích khác, "chọn tất cả
  // khớp bộ lọc") — reload() so sánh JSON currentFilterParams() mỗi lần chạy,
  // null ban đầu để lần reload() đầu tiên (init()) LUÔN kích hoạt 1 lần.
  let coQcParamsSnapshot = null;
  function refreshCoQcCounts() {
    const seq = ++coQcSeq;
    Api.coQcThongKe(currentFilterParams()).then((counts) => {
      if (seq !== coQcSeq) return; // có lần gọi mới hơn đã tới trước — bỏ qua
      coQcCounts = counts;
      rebuildCoQc();
    }).catch(() => { /* lỗi mạng tạm — giữ số liệu cũ */ });
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
  let advPickerBtnIdx = -1; // dòng điều kiện chứa nút ⚙ đang mở popover — dùng để
  // tìm lại nút MỚI sau renderAdvConditionsFull() (nút cũ bị huỷ khỏi DOM).

  const ADV_OP_LABELS = {
    '': '(chưa chọn)',
    trong: 'Trống',
    khong_trong: 'Không trống',
    toan_tu: 'Toán tử',
    chua: 'Chứa',
    khong_chua: 'Không chứa',
    bat_dau: 'Bắt đầu bằng',
    ket_thuc: 'Kết thúc bằng',
    thuoc: 'Thuộc',
    khong_thuoc: 'Không thuộc',
  };
  const ADV_SUB_OPS = ['>', '<', '=', '>=', '<='];
  const ADV_TEXT_VALUE_OPS = new Set(['chua', 'khong_chua', 'bat_dau', 'ket_thuc']);
  // Toán tử CHỈ áp dụng cho trường ảo 'danh_sach' (khớp backend _DK_DANH_SACH_OPS).
  const ADV_DANH_SACH_OPS = ['', 'trong', 'khong_trong', 'thuoc', 'khong_thuoc'];

  // "Danh sách" — trường ẢO trong Box điều kiện (KHÔNG phải cột `ho_so` thật,
  // KHÔNG có trong fields.js/FIELD_DEFS) — lọc theo id "Danh sách tùy chỉnh"
  // (Api.listDanhSach()). Mọi nơi tra cứu label/định nghĩa trường phải fallback
  // qua hằng số này khi không tìm thấy trong FIELD_BY_CODE (xem buildAdvConditionRow,
  // buildFieldPickerPopover).
  const ADV_VIRTUAL_FIELDS = {
    danh_sach: { code: 'danh_sach', label: 'Danh sách' },
  };
  // 'danh_sach' thêm vào tập "trường cơ bản" (KHÔNG sửa fields.js/ADV_BASIC_FIELD_CODES
  // gốc) — dùng hằng số cục bộ NÀY ở CẢ 3 nơi tham chiếu ADV_BASIC_FIELD_CODES bên
  // dưới (defaultAdvFieldOrder, visibleAdvFieldCodes, reorderAdvField) để tránh
  // hiện không nhất quán nếu chỉ sửa 1-2/3 chỗ.
  const ADV_BASIC_FIELD_CODES_LOCAL = ADV_BASIC_FIELD_CODES.concat(['danh_sach']);

  function newAdvConditionRow() {
    return { field: '', op: '', sub_op: '>', value: '' };
  }

  function defaultAdvFieldOrder() {
    const basic = ADV_BASIC_FIELD_CODES_LOCAL.slice();
    const rest = FIELD_DEFS.map((f) => f.code).filter((c) => !basic.includes(c));
    return basic.concat(rest);
  }

  // Nạp trạng thái đã lưu của tài khoản (user.bo_loc_nang_cao_tuy_chon, trả
  // về từ /api/me) — hợp lệ hoá + NỐI THÊM mã trường MỚI (vd fields.js vừa
  // bổ sung, HOẶC trường ẢO 'danh_sach' mới thêm ở đây) chưa có trong danh
  // sách đã lưu, tránh mất trường mới khi nạp — user ĐÃ có field_order lưu
  // sẵn TRƯỚC KHI có 'danh_sach' vẫn tự động được bổ sung.
  function loadAdvFieldSetting() {
    const saved = user && user.bo_loc_nang_cao_tuy_chon;
    const allCodes = FIELD_DEFS.map((f) => f.code).concat(Object.keys(ADV_VIRTUAL_FIELDS));
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
    const basicSet = new Set(ADV_BASIC_FIELD_CODES_LOCAL);
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
    const basicSet = new Set(ADV_BASIC_FIELD_CODES_LOCAL);
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
    // 'thuoc'/'khong_thuoc' (trường ảo 'danh_sach') CHỈ coi là đủ khi đã
    // chọn 1 danh sách cụ thể — tránh nút "+ Thêm điều kiện" hiện sai lúc.
    if (row.op === 'thuoc' || row.op === 'khong_thuoc') return String(row.value || '').trim() !== '';
    return true; // trong / khong_trong — không cần giá trị
  }

  function advConditionsPayload() {
    return advConditions.filter(advRowIsComplete).map((r) => {
      const out = { field: r.field, op: r.op };
      if (r.op === 'toan_tu') { out.sub_op = r.sub_op; out.value = r.value; }
      else if (ADV_TEXT_VALUE_OPS.has(r.op)) out.value = r.value;
      else if (r.op === 'thuoc' || r.op === 'khong_thuoc') out.value = r.value;
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
      // Fallback tra trường ẢO (vd 'danh_sach') khi không có trong FIELD_BY_CODE
      // (fields.js) — nếu không, dropdown sẽ ÂM THẦM bỏ qua trường ảo.
      const def = FIELD_BY_CODE[c] || ADV_VIRTUAL_FIELDS[c];
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
    pickerBtn.addEventListener('click', () => toggleFieldPicker(pickerBtn, idx));
    fieldWrap.appendChild(pickerBtn);

    line.appendChild(fieldWrap);

    // ----- Box 2: toán tử — chỉ hiện khi Box 1 đã chọn trường (tiêu chí 10) -----
    if (row.field) {
      const isDanhSach = row.field === 'danh_sach';
      const opSel = document.createElement('select');
      opSel.className = 'filter-select adv-cond-op';
      // Trường ảo 'danh_sach' CHỈ hỗ trợ 4 toán tử tập hợp (khớp backend
      // _parse_dieu_kien) — ẩn các toán tử không áp dụng (Toán tử/Chứa/...).
      const opKeys = isDanhSach ? ADV_DANH_SACH_OPS : Object.keys(ADV_OP_LABELS);
      opKeys.forEach((k) => {
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

      if (isDanhSach && (row.op === 'thuoc' || row.op === 'khong_thuoc')) {
        // Box giá trị cho trường ảo 'danh_sach' + toán tử tập hợp — <select>
        // liệt kê danh sách qua Api.listDanhSach() (KHÔNG phải input text).
        const valSel = document.createElement('select');
        valSel.className = 'filter-select adv-cond-value';
        valSel.disabled = true;
        valSel.innerHTML = '<option>Đang tải…</option>';
        line.appendChild(valSel);
        Api.listDanhSach().then((list) => {
          valSel.disabled = false;
          valSel.innerHTML = '';
          const optBlank = document.createElement('option');
          optBlank.value = ''; optBlank.textContent = '(chọn danh sách)';
          valSel.appendChild(optBlank);
          list.forEach((ds) => {
            const o = document.createElement('option');
            o.value = String(ds.id);
            o.textContent = `${ds.ten} (${ds.so_luong})`;
            if (String(ds.id) === String(row.value)) o.selected = true;
            valSel.appendChild(o);
          });
        }).catch(() => {
          valSel.innerHTML = '<option value="">(lỗi tải danh sách)</option>';
        });
        // Cập nhật bộ lọc NGAY khi đổi lựa chọn (không debounce — khác ô
        // text wireAdvValueInput() vốn debounce để gộp phím gõ liên tiếp).
        valSel.addEventListener('change', () => {
          row.value = valSel.value;
          renderAdvAddButton();
          onAdvConditionChanged();
        });
      } else if (row.op === 'toan_tu') {
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
    // advPickerBtnEl trỏ tới nút ⚙ CŨ — renderAdvConditionsFull() (gọi ngay
    // trước hàm này ở cả 2 nơi dùng) đã huỷ và dựng lại toàn bộ DOM dòng điều
    // kiện, nút cũ đã rời khỏi DOM (getBoundingClientRect() trả về (0,0) ->
    // popover nhảy về góc trên-trái). Tìm lại nút MỚI theo đúng vị trí dòng
    // (advPickerBtnIdx) thay vì dùng tham chiếu cũ.
    const idx = advPickerBtnIdx;
    closeFieldPicker();
    const btn = document.querySelectorAll('.adv-field-picker-btn')[idx];
    if (btn) toggleFieldPicker(btn, idx);
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
      // Fallback tra trường ẢO (vd 'danh_sach') — cùng lý do như Box 1.
      const def = FIELD_BY_CODE[code] || ADV_VIRTUAL_FIELDS[code];
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

  function toggleFieldPicker(btnEl, idx) {
    if (advPickerEl) { closeFieldPicker(); return; }
    advPickerBtnEl = btnEl;
    advPickerBtnIdx = idx;
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
      // "Xem theo danh sách" — id danh_sach đang chọn, '' = Tất cả.
      danh_sach_id: '',
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
    refreshDanhSachDropdown(); // nạp dropdown "Xem theo danh sách" (tiêu chí 40)
    // Số lượng hồ sơ theo từng cờ (dropdown "Cờ cảnh báo") nạp qua ĐÚNG 1 cơ
    // chế thống nhất bên trong reload() (snapshot-compare coQcParamsSnapshot,
    // xem reload()) — KHÔNG còn lời gọi Api.coQcThongKe() riêng ở đây (tiêu
    // chí 19: tránh bắn 2 request /api/co-qc-thong-ke cho 1 lần mở trang).
    // coQcParamsSnapshot khởi tạo null -> reload() dưới đây tự kích hoạt
    // refreshCoQcCounts() đúng 1 lần cho lần mở trang này.
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

    // "Danh sách tùy chỉnh" — dropdown lọc theo 1 danh sách cụ thể (tiêu chí
    // 40) + nút xóa danh sách đang chọn (tiêu chí 43).
    rowBasic.appendChild(fieldBox('Xem theo danh sách', () => buildDanhSachFilterBox()));

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

    // ---- Thanh hành động "N đã chọn" (chọn tạm, Danh sách tùy chỉnh) —
    // chèn GIỮA filter và bảng (tiêu chí 32), ẩn khi chưa chọn gì. ----
    const actionBar = document.createElement('div');
    actionBar.id = 'action-bar';
    actionBar.className = 'action-bar';
    actionBar.hidden = true;
    root.appendChild(actionBar);

    // ---- Vùng GIỮA: bảng danh sách (cuộn dọc — tiêu chí 1) ----
    const tableWrap = document.createElement('div');
    tableWrap.className = 'table-wrap';
    const table = document.createElement('table');
    table.id = 'ho-so-table';
    // Đợt 7 criterion 2/3: STT liên tục ở ĐẦU bảng, "Mã hồ sơ" trở lại CUỐI.
    // <thead> dựng ĐỘNG ở renderTableHead() (cột phụ theo Box điều kiện).
    table.innerHTML = '<thead></thead><tbody></tbody>';
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

  // +1 so với trước (13) vì thêm cột "Danh sách" ở cuối bảng (tiêu chí 46).
  function tableColspan() { return 14 + extraFieldCodes.length; }

  function toast(msg) {
    let t = document.getElementById('toast');
    if (!t) {
      t = document.createElement('div');
      t.id = 'toast';
      document.body.appendChild(t);
    }
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(t._timer);
    t._timer = setTimeout(() => t.classList.remove('show'), 1200);
  }

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
    // "Xem theo danh sách" cũng về "Tất cả" — KHÔNG đụng selectedSet (chọn
    // tạm sống độc lập với bộ lọc, tiêu chí 27).
    if (danhSachSelectEl) danhSachSelectEl.value = '';
    if (danhSachDeleteBtnEl) danhSachDeleteBtnEl.disabled = true;
    // Tiêu chí 24: "Xóa hết bộ lọc" cũng xóa sạch mọi dòng Box điều kiện,
    // về lại đúng 1 dòng trống.
    advConditions = [newAdvConditionRow()];
    renderAdvConditionsFull();
    page = 1;
    // reload() tự phát hiện currentFilterParams() vừa đổi (về rỗng hoàn
    // toàn) qua coQcParamsSnapshot và tự gọi refreshCoQcCounts() ĐÚNG 1 lần
    // — KHÔNG cần gọi rời ở đây nữa (tiêu chí 18/21, tránh bắn 2 request).
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
      // "Xem theo danh sách" (tiêu chí 42) — buildExcelUrl() tự kế thừa vì
      // tái dùng currentFilterParams().
      danh_sach_id: filters.danh_sach_id || '',
      // "Box điều kiện" (Bộ lọc nâng cao) — JSON các dòng điều kiện ĐÃ ĐỦ
      // điều kiện gửi lên (rỗng -> '' -> bị api.js:qs() bỏ qua, không gửi).
      dieu_kien: dk.length ? JSON.stringify(dk) : '',
      // Mã trường ĐANG CHỌN ở Box 1 của MỌI dòng (kể cả dòng toán tử còn
      // "(chưa chọn)") — chọn trường là hiện cột ngay, không cần đợi chọn
      // xong toán tử (phản hồi anh Khôi).
      truong_dang_chon: Array.from(new Set(advConditions.map((r) => r.field).filter(Boolean))),
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
    // Tính 1 LẦN, dùng chung cho cả 2 cơ chế snapshot-compare bên dưới +
    // dựng `params` gọi API danh sách (tránh gọi currentFilterParams() lặp
    // lại nhiều lần trong cùng 1 lượt reload()).
    const cfp = currentFilterParams();
    const cfpJson = JSON.stringify(cfp);

    // Criterion 13: bộ lọc hiện tại KHÁC snapshot lúc set allFilterSelected=
    // true gần nhất -> tự reset (KHÔNG đụng selectedSet — vẫn giữ số đã
    // chọn). Chỉ đổi TRANG (page/pageSize KHÔNG nằm trong currentFilterParams())
    // -> snapshot không đổi -> giữ nguyên allFilterSelected. Đặt Ở ĐẦU hàm
    // để bắt được MỌI điểm gọi reload() sau khi đổi filter, không cần sửa
    // từng nơi riêng lẻ.
    if (allFilterSelected && cfpJson !== allFilterSelectedSnapshot) {
      allFilterSelected = false;
    }

    // Dropdown "Cờ cảnh báo": bộ lọc hiện tại KHÁC snapshot lúc refresh gần
    // nhất -> BẤT KỲ bộ lọc nào đổi (Xã/phường, ngày, Phân loại SK, Trạng
    // thái, Cơ quan bệnh chính, Nhân viên, Tìm kiếm, Box điều kiện, "Xem
    // theo danh sách") đều tự kích hoạt refreshCoQcCounts() ĐÚNG 1 lần —
    // dùng snapshot RIÊNG (coQcParamsSnapshot, KHÔNG phải allFilterSelectedSnapshot).
    // page/pageSize KHÔNG nằm trong currentFilterParams() -> đổi trang/số
    // dòng-trang KHÔNG kích hoạt gọi lại (tiêu chí 16). Đặt Ở ĐẦU hàm (cùng
    // vị trí với criterion 13) để bắt được MỌI điểm gọi reload() sau khi đổi
    // filter mà KHÔNG cần sửa từng handler riêng lẻ (tiêu chí 18).
    if (cfpJson !== coQcParamsSnapshot) {
      coQcParamsSnapshot = cfpJson;
      refreshCoQcCounts();
    }

    const seq = ++_reloadSeq;
    // Chỉ báo "Đang tải…" để không tưởng nhầm là không có kết quả trong lúc
    // chờ mạng (Vercel↔Turso ~1s). + chống race: gõ nhanh -> chỉ hiện kết quả
    // của request MỚI NHẤT.
    const tbodyL = document.querySelector('#ho-so-table tbody');
    if (tbodyL) tbodyL.innerHTML = `<tr><td colspan="${tableColspan()}" class="list-loading">Đang tải…</td></tr>`;
    const sumL = document.getElementById('list-summary');
    if (sumL) sumL.textContent = 'Đang tải…';
    const statusEl = document.getElementById('search-status');
    if (statusEl) statusEl.hidden = false;   // hiện "Đang tìm kiếm…" (dấu động)
    const params = Object.assign({ page, page_size: pageSize }, cfp);
    let data;
    try {
      data = await Api.listHoSo(params);
    } catch (e) {
      if (seq === _reloadSeq) {
        if (statusEl) statusEl.hidden = true;
        if (tbodyL) tbodyL.innerHTML = `<tr><td colspan="${tableColspan()}" class="list-empty">Lỗi tải dữ liệu — thử lại</td></tr>`;
      }
      return;
    }
    if (seq !== _reloadSeq) return; // đã có request mới hơn -> bỏ kết quả cũ
    if (statusEl) statusEl.hidden = true;
    items = data.items;
    total = data.total;
    page = data.page;
    pageSize = data.page_size;
    extraFieldCodes = data.extra_fields || [];
    selectedIdx = items.length ? 0 : -1;
    // highlight chỉ khi tìm TOÀN CỘT (checkbox tắt) và có từ khóa
    lastQStripped = (!filters.q_hoten_only && filters.q && filters.q.trim())
      ? Fuzzy.stripDiacriticsAligned(filters.q.trim())
      : '';
    renderTableHead();
    renderTable();
    renderPager();
    renderSummary();
    // selectedSet SỐNG SUỐT PHIÊN (tiêu chí 26) — sau mỗi reload, đồng bộ lại
    // action bar + checkbox đầu bảng theo trạng thái chọn hiện tại (vd khi
    // đổi trang / đổi bộ lọc / sau khi thêm-vào-danh-sách reload()).
    renderActionBar();
  }

  // Box điều kiện (Bộ lọc nâng cao): lọc theo trường CHƯA có cột riêng trong
  // bảng (vd "Ghi chú nhân viên") -> server trả kèm `extra_fields`, tự thêm
  // cột động ngay TRƯỚC "Mã hồ sơ" để nhìn thấy giá trị đang lọc.
  function renderTableHead() {
    const thead = document.querySelector('#ho-so-table thead');
    if (!thead) return;
    const extraTh = extraFieldCodes.map((code) => {
      const def = FIELD_BY_CODE[code];
      return `<th>${esc(def ? def.label : code)}</th>`;
    }).join('');
    thead.innerHTML = `<tr>
        <th class="col-danhdauxuat" title="Chọn/bỏ chọn NGAY toàn bộ hồ sơ khớp BỘ LỌC HIỆN TẠI (mọi trang, chọn tạm — dùng thanh hành động bên dưới để đánh dấu xuất file/thêm vào danh sách)">
          <input type="checkbox" id="danhdauxuat-all-cb"></th>
        <th>STT</th><th>Họ tên</th><th>Ngày sinh</th><th>Giới</th><th>CCCD</th>
        <th>Xã</th><th>Ngày khám</th><th>Phân loại SK</th><th>Bệnh chính</th>
        <th>Số cờ</th><th>Trạng thái</th>${extraTh}<th>Mã hồ sơ</th><th class="col-danhsach">Danh sách</th></tr>`;
    const allCb = thead.querySelector('#danhdauxuat-all-cb');
    allCb.addEventListener('click', (e) => e.stopPropagation());
    allCb.checked = allFilterSelected;
    allCb.addEventListener('change', onToggleSelectAllPage);
  }

  // Ô check ở đầu cột — chọn NGAY toàn bộ hồ sơ khớp BỘ LỌC HIỆN TẠI (mọi
  // trang, không chỉ trang này). allFilterSelected===false -> gọi API mới
  // Api.listMaHoSo() lấy hết ma_ho_so khớp lọc rồi thêm vào selectedSet;
  // allFilterSelected===true -> bỏ tích, XOÁ lại đúng số mã đã thêm lúc đó
  // khỏi selectedSet (KHÔNG gọi lại API, KHÔNG đụng các mã do user tự chọn
  // thêm/bớt thủ công trước/sau đó — về mặt logic những mã đó cũng nằm
  // trong ma_list gốc vì đã khớp lọc, chỉ mã KHÔNG khớp lọc hiện tại mới có
  // thể bị người dùng chọn thêm riêng, trường hợp đó ngoài phạm vi nút này).
  async function onToggleSelectAllPage() {
    const cb = document.getElementById('danhdauxuat-all-cb');
    if (!allFilterSelected) {
      if (cb) cb.disabled = true; // chống double-click gọi API 2 lần
      try {
        const params = currentFilterParams();
        const res = await Api.listMaHoSo(params);
        const maList = res.ma_list || [];
        maList.forEach((ma) => selectedSet.add(ma));
        allFilterSelected = true;
        allFilterSelectedSnapshot = JSON.stringify(params);
        allFilterSelectedMaList = maList;
      } catch (err) {
        toast('Lỗi: ' + (err.message || 'không tải được danh sách hồ sơ khớp bộ lọc'));
      } finally {
        if (cb) cb.disabled = false;
      }
    } else {
      allFilterSelectedMaList.forEach((ma) => selectedSet.delete(ma));
      allFilterSelected = false;
      allFilterSelectedMaList = [];
    }
    renderTable();
    updateHeaderCheckbox();
    renderActionBar();
    renderSummary();
  }

  // Đồng bộ trạng thái checked của checkbox đầu bảng theo allFilterSelected
  // (KHÔNG còn dựa vào items.every(...) — checkbox này giờ phản ánh "đã chọn
  // hết theo bộ lọc", không phải "đã chọn hết trang này") — gọi ngay sau MỌI
  // thay đổi selectedSet không kèm reload() (tiêu chí 48: cập nhật NGAY,
  // không chờ reload()).
  function updateHeaderCheckbox() {
    const cb = document.getElementById('danhdauxuat-all-cb');
    if (cb) cb.checked = allFilterSelected;
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

  // Dựng 1 <tr> hoàn chỉnh (nội dung + mọi event listener) cho item ở vị trí
  // idx trong `items` — tách riêng khỏi renderTable() để renderRow() (đồng
  // bộ 1 dòng sau khi sửa panel chi tiết) có thể dựng lại ĐÚNG 1 dòng mà
  // không phải build lại toàn bảng. GIỮ NGUYÊN 100% logic/HTML so với trước.
  function buildRowEl(it, idx) {
    const stt = (page - 1) * pageSize + idx + 1;
    const tr = document.createElement('tr');
    tr.dataset.idx = idx;
    if (it.muc_co === 'do') tr.classList.add('row-do');
    else if (it.muc_co === 'vang') tr.classList.add('row-vang');
    if (idx === selectedIdx) tr.classList.add('selected');
    const extraTd = extraFieldCodes.map((code) => `<td>${highlightCell(it[code])}</td>`).join('');
    const dsText = (it._danh_sach && it._danh_sach.length)
      ? it._danh_sach.map((d) => `<span class="ds-tag">${esc(d.ten)}</span>`).join('')
      : '<span class="ds-tag-empty">–</span>';
    tr.innerHTML = `<td class="col-danhdauxuat"><input type="checkbox" class="danhdauxuat-cb" ${selectedSet.has(it.ma_ho_so) ? 'checked' : ''}></td>
      <td>${stt}</td>
      <td>${highlightCell(it.ho_ten)}</td>
      <td>${highlightCell(it.ngay_sinh)}</td><td>${highlightCell(it.gioi_tinh)}</td>
      <td>${highlightCell(it.so_cccd)}</td>
      <td>${highlightCell(it.maxa_cu_tru)}</td><td>${highlightCell(it.ngay_vao)}</td>
      <td>${highlightCell(it.phan_loai_sk)}</td><td>${highlightCell(it.ket_luan_benh)}</td>
      <td>${esc(it.so_loi)}</td><td>${highlightCell(it.trang_thai_nhan)}</td>
      ${extraTd}<td>${highlightCell(it.ma_ho_so)}</td><td class="col-danhsach">${dsText}</td>`;
    // Checkbox "chọn tạm" — CHỈ toggle ma_ho_so trong selectedSet (frontend
    // only, KHÔNG gọi Api.patchHoSo/mạng, KHÔNG confirm() — tiêu chí 28).
    // stopPropagation() để không kích hoạt tr.click (mở chi tiết).
    const cb = tr.querySelector('.danhdauxuat-cb');
    cb.addEventListener('click', (e) => e.stopPropagation());
    cb.addEventListener('change', (e) => {
      e.stopPropagation();
      if (cb.checked) {
        selectedSet.add(it.ma_ho_so);
      } else {
        selectedSet.delete(it.ma_ho_so);
        // Bỏ tích thủ công 1 dòng -> không còn "chọn hết theo bộ lọc"
        // (tiêu chí 19). Tích thủ công KHÔNG đổi allFilterSelected.
        allFilterSelected = false;
      }
      updateHeaderCheckbox();
      renderActionBar();
      renderSummary();
    });
    tr.addEventListener('click', () => { selectedIdx = idx; renderTable(); openSelected(); });
    return tr;
  }

  function renderTable() {
    const tbody = document.querySelector('#ho-so-table tbody');
    tbody.innerHTML = '';
    if (!items.length) {
      tbody.innerHTML = `<tr><td colspan="${tableColspan()}" class="list-empty">Không có hồ sơ phù hợp bộ lọc</td></tr>`;
      return;
    }
    items.forEach((it, idx) => {
      tbody.appendChild(buildRowEl(it, idx));
    });
  }

  // Dựng lại ĐÚNG 1 <tr data-idx="idx"> từ items[idx] hiện tại, thay thế
  // dòng cũ tại chỗ bằng replaceWith() — KHÔNG động tới các dòng khác,
  // KHÔNG innerHTML lại cả tbody, KHÔNG cuộn/đổi scrollTop (dùng cho
  // patchItem() đồng bộ 1 dòng sau khi sửa panel chi tiết).
  function renderRow(idx) {
    const it = items[idx];
    if (!it) return;
    const tbody = document.querySelector('#ho-so-table tbody');
    if (!tbody) return;
    const oldTr = tbody.querySelector(`tr[data-idx="${idx}"]`);
    const newTr = buildRowEl(it, idx);
    if (oldTr) oldTr.replaceWith(newTr);
  }

  // 'do' | 'vang' | null — TÁI TẠO ĐÚNG logic backend services/qc.py
  // row_severity(): có cờ 'do' -> 'do'; còn cờ (kể cả chỉ 'cam'/'vang') ->
  // 'vang'; không còn cờ nào -> null. Dùng danhMuc.co_qc (catalog cờ QC đã
  // nạp sẵn ở client) để tra `muc` từng mã cờ — KHÔNG gọi API.
  function computeMucCo(coQcList) {
    const list = coQcList || [];
    if (!list.length) return null;
    const metaBy = {};
    (danhMuc.co_qc || []).forEach((f) => { metaBy[f.ma] = f; });
    const hasDo = list.some((ma) => metaBy[ma] && metaBy[ma].muc === 'do');
    return hasDo ? 'do' : 'vang';
  }

  // Đồng bộ 1 hồ sơ vừa lưu (từ panel chi tiết) vào ĐÚNG dòng tương ứng
  // trong `items` (nếu hồ sơ đó đang hiển thị ở trang/bộ lọc hiện tại) —
  // KHÔNG gọi lại API danh sách, KHÔNG đổi trang/bộ lọc/scroll/selectedSet.
  // `patch` merge GENERIC (không whitelist field) — có thể chứa cả cột mở
  // rộng động (extraFieldCodes). Gọi từ detail.js sau mỗi lần autosave.
  function patchItem(ma_ho_so, patch) {
    const idx = items.findIndex((it) => it.ma_ho_so === ma_ho_so);
    if (idx === -1) return; // hồ sơ không nằm trong trang/bộ lọc hiện tại
    Object.assign(items[idx], patch);
    if (patch.co_qc_list !== undefined) {
      items[idx].muc_co = computeMucCo(patch.co_qc_list);
    }
    renderRow(idx);
  }

  function renderSummary() {
    const box = document.getElementById('list-summary');
    if (!box) return;
    let text;
    if (total === 0) {
      text = 'Hiển thị 0–0 / 0 kết quả';
    } else {
      const a = (page - 1) * pageSize + 1;
      const b = Math.min(page * pageSize, total);
      text = `Hiển thị ${a}–${b} / ${total} kết quả`;
    }
    // "N đã chọn" — CHỈ hiện khi có ít nhất 1 hồ sơ đang chọn tạm (tiêu chí
    // 47/49), cập nhật đồng thời với renderActionBar() ở mọi nơi selectedSet đổi.
    if (selectedSet.size > 0) text += ` — ${selectedSet.size} đã chọn`;
    box.textContent = text;
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

  // ===================================================================
  // "Danh sách tùy chỉnh" — thanh hành động (action bar), popover "Thêm vào
  // danh sách", dropdown "Xem theo danh sách" + nút xóa danh sách.
  // ===================================================================

  // ---- Thanh hành động: hiện khi selectedSet.size>0 (tiêu chí 32/33/49) ----
  function renderActionBar() {
    const bar = document.getElementById('action-bar');
    if (!bar) return;
    if (selectedSet.size === 0) {
      bar.hidden = true;
      bar.innerHTML = '';
      closeAddListPopover();
      return;
    }
    bar.hidden = false;
    bar.innerHTML = '';

    const countEl = document.createElement('span');
    countEl.className = 'action-bar-count';
    countEl.textContent = `${selectedSet.size} đã chọn`;
    bar.appendChild(countEl);

    const clearBtn = document.createElement('button');
    clearBtn.type = 'button';
    clearBtn.className = 'action-bar-clear';
    clearBtn.textContent = 'Bỏ chọn tất cả';
    clearBtn.addEventListener('click', () => {
      selectedSet.clear();
      allFilterSelected = false;
      renderTable();
      updateHeaderCheckbox();
      renderActionBar();
      renderSummary();
    });
    bar.appendChild(clearBtn);

    const addBtn = document.createElement('button');
    addBtn.type = 'button';
    addBtn.id = 'action-bar-add-btn';
    addBtn.textContent = 'Thêm vào danh sách ▾';
    addBtn.addEventListener('click', () => toggleAddToListPopover(addBtn));
    bar.appendChild(addBtn);

    // Chỉ hiện khi đang xem 1 danh sách cụ thể (tiêu chí 34) VÀ user có
    // quyền GHI với danh sách đó (chủ sở hữu/admin) — nếu không tìm thấy
    // trong danhSachList (vd vừa bị người khác xóa) thì coi như không có
    // quyền, không hiện nút (tiêu chí 15).
    const dsHienTai = filters.danh_sach_id
      ? danhSachList.find((d) => String(d.id) === String(filters.danh_sach_id))
      : null;
    if (filters.danh_sach_id && coQuyenGhiDanhSach(dsHienTai)) {
      const removeBtn = document.createElement('button');
      removeBtn.type = 'button';
      removeBtn.className = 'action-bar-remove';
      removeBtn.textContent = 'Gỡ khỏi danh sách này';
      removeBtn.addEventListener('click', onGoKhoiDanhSachHienTai);
      bar.appendChild(removeBtn);
    }
  }

  // ---- "Gỡ khỏi danh sách này" — chỉ hiện khi đang lọc theo 1 danh sách cụ
  // thể (tiêu chí 39): thành công thì XOÁ các mã vừa gỡ khỏi selectedSet. ----
  async function onGoKhoiDanhSachHienTai() {
    const dsId = filters.danh_sach_id;
    if (!dsId) return;
    const maList = Array.from(selectedSet);
    try {
      const res = await Api.goHoSoKhoiDanhSach(dsId, maList);
      maList.forEach((ma) => selectedSet.delete(ma));
      toast(`Đã gỡ ${res.so_luong_go} hồ sơ khỏi danh sách.`);
      refreshDanhSachDropdown(); // cập nhật ngay so_luong hiển thị ở dropdown
      reload();
    } catch (err) {
      toast('Lỗi: ' + (err.message || 'không thực hiện được'));
    }
  }

  // ---- Popover "Thêm vào danh sách ▾" — khuôn mẫu buildFieldPickerPopover/
  // toggleFieldPicker (đóng bằng ESC/click ra ngoài, định vị bằng positionPopover). ----
  function closeAddListPopover() {
    if (addListPopoverEl) { addListPopoverEl.remove(); addListPopoverEl = null; }
    document.removeEventListener('mousedown', onAddListPopoverOutsideClick, true);
  }

  function onAddListPopoverOutsideClick(e) {
    if (addListPopoverEl && !addListPopoverEl.contains(e.target) && e.target !== addListPopoverBtnEl) {
      closeAddListPopover();
    }
  }

  async function toggleAddToListPopover(btnEl) {
    if (addListPopoverEl) { closeAddListPopover(); return; }
    addListPopoverBtnEl = btnEl;
    const pop = document.createElement('div');
    pop.className = 'adv-field-picker-pop action-add-list-pop';
    pop.tabIndex = -1;
    pop.textContent = 'Đang tải…';
    pop.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); closeAddListPopover(); }
    });
    document.body.appendChild(pop);
    positionPopover(pop, btnEl);
    addListPopoverEl = pop;
    document.addEventListener('mousedown', onAddListPopoverOutsideClick, true);

    // Gọi Api.listDanhSach() MỖI LẦN MỞ — KHÔNG cache tĩnh (tiêu chí 35).
    let list;
    try {
      list = await Api.listDanhSach();
    } catch (err) {
      if (addListPopoverEl) pop.textContent = 'Lỗi tải danh sách: ' + (err.message || '');
      return;
    }
    if (addListPopoverEl !== pop) return; // đã đóng trong lúc chờ mạng
    danhSachList = list;
    populateDanhSachSelect();
    // CHỈ hiện danh sách mà user có quyền GHI (chủ sở hữu hoặc admin) —
    // tiêu chí 14: ẩn hẳn (không hiện dạng disable) các danh sách không có
    // quyền để tránh rối. Tạo mới (ô "Tên danh sách mới…") KHÔNG cần quyền,
    // luôn hiển thị riêng bên dưới list này.
    const listCoQuyen = list.filter((ds) => coQuyenGhiDanhSach(ds));
    renderAddListPopoverContent(pop, listCoQuyen);
  }

  function renderAddListPopoverContent(pop, list) {
    pop.innerHTML = '';
    const listEl = document.createElement('div');
    listEl.className = 'adv-field-picker-list';
    if (!list.length) {
      const empty = document.createElement('div');
      empty.className = 'action-add-list-empty';
      empty.textContent = '(Chưa có danh sách nào — tạo mới bên dưới)';
      listEl.appendChild(empty);
    }
    list.forEach((ds) => {
      const item = document.createElement('div');
      item.className = 'adv-field-picker-item';
      item.textContent = `${ds.ten} (${ds.so_luong})`;
      item.addEventListener('click', () => onChonThemVaoDanhSach(ds.id));
      listEl.appendChild(item);
    });
    pop.appendChild(listEl);

    // Ô nhập tên mới + "Tạo & thêm" (tiêu chí 37).
    const createWrap = document.createElement('div');
    createWrap.className = 'action-add-list-create';
    const inp = document.createElement('input');
    inp.type = 'text';
    inp.placeholder = 'Tên danh sách mới…';
    const errEl = document.createElement('div');
    errEl.className = 'action-add-list-err';
    errEl.hidden = true;
    const createBtn = document.createElement('button');
    createBtn.type = 'button';
    createBtn.textContent = 'Tạo & thêm';
    createBtn.addEventListener('click', async () => {
      const ten = inp.value.trim();
      errEl.hidden = true;
      if (!ten) {
        errEl.textContent = 'Tên danh sách không được để trống';
        errEl.hidden = false;
        return;
      }
      createBtn.disabled = true;
      try {
        const ds = await Api.createDanhSach({ ten });
        await refreshDanhSachDropdown();
        await onChonThemVaoDanhSach(ds.id);
      } catch (err) {
        // 409 (tên trùng) hiện lỗi TẠI CHỖ trong popover.
        errEl.textContent = err.message || 'Không tạo được danh sách';
        errEl.hidden = false;
      } finally {
        createBtn.disabled = false;
      }
    });
    createWrap.appendChild(inp);
    createWrap.appendChild(createBtn);
    createWrap.appendChild(errEl);
    pop.appendChild(createWrap);
  }

  async function onChonThemVaoDanhSach(id) {
    try {
      const res = await Api.themHoSoVaoDanhSach(id, Array.from(selectedSet));
      closeAddListPopover();
      toast(`Đã thêm ${res.so_luong_them} hồ sơ vào danh sách.`);
      // KHÔNG xóa selectedSet sau hành động (tiêu chí 36).
      refreshDanhSachDropdown(); // cập nhật ngay so_luong hiển thị ở dropdown
      reload();
    } catch (err) {
      toast('Lỗi: ' + (err.message || 'không thêm được'));
    }
  }

  // ---- Dropdown "Xem theo danh sách" + nút xóa danh sách đang chọn ----
  function buildDanhSachFilterBox() {
    const wrap = document.createElement('div');
    wrap.className = 'danh-sach-filter-wrap';

    const sel = document.createElement('select');
    sel.className = 'filter-select';
    sel.id = 'danh-sach-filter-sel';
    danhSachSelectEl = sel;
    sel.addEventListener('change', () => {
      filters.danh_sach_id = sel.value;
      updateDanhSachDeleteBtnState();
      page = 1;
      // reload() tự phát hiện danh_sach_id vừa đổi qua coQcParamsSnapshot và
      // tự gọi refreshCoQcCounts() (tử số + mẫu số cùng đổi theo) — KHÔNG
      // cần gọi rời ở đây nữa (tiêu chí 18, tránh bắn 2 request cho 1 lần đổi).
      reload();
    });
    wrap.appendChild(sel);

    const delBtn = document.createElement('button');
    delBtn.type = 'button';
    delBtn.id = 'danh-sach-delete-btn';
    delBtn.title = 'Xóa danh sách đang chọn (không xóa hồ sơ)';
    delBtn.textContent = '🗑';
    delBtn.disabled = !filters.danh_sach_id;
    delBtn.addEventListener('click', onXoaDanhSachHienTai);
    danhSachDeleteBtnEl = delBtn;
    wrap.appendChild(delBtn);

    populateDanhSachSelect();
    return wrap;
  }

  // Cập nhật trạng thái disable + title của nút xóa "🗑" theo 2 điều kiện:
  // (1) chưa chọn danh sách nào (như cũ), (2) đã chọn nhưng KHÔNG có quyền
  // ghi (không phải người tạo/admin) — tiêu chí 13, phân biệt rõ 2 lý do
  // disable bằng title khác nhau để user hiểu vì sao bị mờ.
  function updateDanhSachDeleteBtnState() {
    if (!danhSachDeleteBtnEl) return;
    if (!filters.danh_sach_id) {
      danhSachDeleteBtnEl.disabled = true;
      danhSachDeleteBtnEl.title = 'Xóa danh sách đang chọn (không xóa hồ sơ)';
      return;
    }
    const ds = danhSachList.find((d) => String(d.id) === String(filters.danh_sach_id));
    if (coQuyenGhiDanhSach(ds)) {
      danhSachDeleteBtnEl.disabled = false;
      danhSachDeleteBtnEl.title = 'Xóa danh sách đang chọn (không xóa hồ sơ)';
    } else {
      danhSachDeleteBtnEl.disabled = true;
      danhSachDeleteBtnEl.title = 'Chỉ người tạo danh sách này hoặc admin mới xóa được';
    }
  }

  // Dựng lại <option> của dropdown "Xem theo danh sách" từ danhSachList —
  // giữ lựa chọn hiện tại (filters.danh_sach_id) nếu danh sách đó còn tồn
  // tại (tiêu chí 41), về "Tất cả" nếu đã bị xóa.
  function populateDanhSachSelect() {
    if (!danhSachSelectEl) return;
    const cur = String(filters.danh_sach_id || '');
    danhSachSelectEl.innerHTML = '';
    const optAll = document.createElement('option');
    optAll.value = '';
    optAll.textContent = 'Tất cả';
    danhSachSelectEl.appendChild(optAll);
    let found = !cur;
    danhSachList.forEach((ds) => {
      const o = document.createElement('option');
      o.value = String(ds.id);
      o.textContent = `${ds.ten} (${ds.so_luong})`;
      if (String(ds.id) === cur) { o.selected = true; found = true; }
      danhSachSelectEl.appendChild(o);
    });
    if (!found) {
      // Danh sách đang chọn đã bị xóa ở đâu đó -> về "Tất cả".
      optAll.selected = true;
      filters.danh_sach_id = '';
    }
    updateDanhSachDeleteBtnState();
  }

  async function refreshDanhSachDropdown() {
    try {
      danhSachList = await Api.listDanhSach();
    } catch (err) {
      danhSachList = [];
    }
    populateDanhSachSelect();
  }

  async function onXoaDanhSachHienTai() {
    const id = filters.danh_sach_id;
    if (!id) return;
    const ds = danhSachList.find((d) => String(d.id) === String(id));
    const ten = ds ? ds.ten : '';
    if (!confirm(`Xóa danh sách "${ten}"? Thao tác này KHÔNG xóa hồ sơ, chỉ xóa danh sách.`)) return;
    try {
      await Api.deleteDanhSach(id);
      filters.danh_sach_id = '';
      await refreshDanhSachDropdown();
      page = 1;
      // Vừa xóa ĐÚNG danh sách đang scoped -> danh_sach_id vừa đổi về '' (các
      // bộ lọc KHÁC giữ nguyên) -> reload() tự phát hiện qua coQcParamsSnapshot
      // và tự gọi refreshCoQcCounts() phản ánh đúng phạm vi mới (KHÔNG cần
      // gọi rời ở đây nữa — tiêu chí 18/22).
      reload();
    } catch (err) {
      toast('Lỗi: ' + (err.message || 'không xóa được'));
    }
  }

  return {
    init, reload, moveSelection, openSelected, focusSearch,
    currentSelectedMa, currentFilterParams, patchItem,
    isEmptyFilterFocus: () => document.activeElement && document.activeElement.closest('.filter-bar'),
  };
})();
