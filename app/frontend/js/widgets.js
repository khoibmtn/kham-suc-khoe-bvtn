// widgets.js — dựng widget cho từng loại trường (§3.4.4, §5).
// Mỗi renderField trả về 1 <div class="field"> chứa label + input, tự
// autosave onBlur/onChange (KHÔNG có nút Lưu — §3.4.3).

const Widgets = (() => {
  function fieldWrap(def, inner, ctx) {
    const wrap = document.createElement('div');
    wrap.className = 'field field-' + def.widget;
    wrap.dataset.code = def.code;

    const label = document.createElement('label');
    label.textContent = def.label;
    label.htmlFor = 'f_' + def.code;
    wrap.appendChild(label);
    wrap.appendChild(inner);

    // §3.4.4 quy tắc 5: mọi trường "suy" (§5 cột Nguồn) phải phân biệt được
    // với dữ liệu gốc — viền vàng nhạt. Trường nào còn CỜ QC gắn với nó
    // (ctx.isInferred) thì thêm ⚠ + nút xác nhận (đổi viền xanh khi xác nhận).
    if (def.nguon === 'suy') wrap.classList.add('suy-field');

    if (ctx.isInferred && ctx.isInferred(def.code)) {
      wrap.classList.add('suy');
      const warn = document.createElement('span');
      warn.className = 'suy-warn';
      warn.textContent = '⚠';
      warn.title = ctx.suyReason ? ctx.suyReason(def.code) : 'Trường do máy suy luận';
      const confirmBtn = document.createElement('button');
      confirmBtn.type = 'button';
      confirmBtn.className = 'suy-confirm';
      confirmBtn.textContent = 'Xác nhận';
      confirmBtn.title = 'Xác nhận dữ liệu đúng — gỡ cảnh báo';
      confirmBtn.addEventListener('click', async () => {
        await ctx.onConfirmSuy(def.code);
        wrap.classList.remove('suy');
        wrap.classList.add('suy-confirmed');
        warn.remove();
        confirmBtn.remove();
      });
      wrap.appendChild(warn);
      wrap.appendChild(confirmBtn);
    }
    return wrap;
  }

  // Chỉ chặn nổi bọt (stopPropagation) cho các phím điều hướng THUẦN (không
  // Ctrl/Alt) mà widget tự xử lý nội bộ (mũi tên, Enter) — để phím tắt toàn
  // cục (Ctrl+S, Ctrl+K, Alt+1..9, Esc, F2 — criterion 5) vẫn hoạt động khi
  // đang focus trong 1 ô nhập liệu của form chi tiết.
  function stopIfPlainNav(e) {
    if (!e.ctrlKey && !e.altKey && !e.metaKey &&
        (e.key === 'ArrowUp' || e.key === 'ArrowDown' || e.key === 'Enter')) {
      e.stopPropagation();
    }
  }

  // Đợt 3 criterion 10: phản hồi trạng thái lưu ngay trên ô nhập — thành
  // công chớp nền xanh .saved (tự gỡ sau ~1.5s, app.css có transition mượt),
  // lỗi (kể cả 422 ngưỡng sinh hiệu từ server — belt & braces) tô đỏ .invalid
  // + tooltip lý do + toast. Dùng CHUNG cho mọi loại widget (text/number/
  // checkbox/dropdown/date/icd/radio5).
  function flashSaved(el) {
    if (!el) return;
    el.classList.remove('invalid');
    el.removeAttribute('title');
    el.classList.add('saved');
    clearTimeout(el._savedTimer);
    el._savedTimer = setTimeout(() => el.classList.remove('saved'), 1500);
  }

  function flashInvalid(el, msg) {
    if (!el) return;
    el.classList.remove('saved');
    el.classList.add('invalid');
    if (msg) el.title = msg;
  }

  // Gọi ctx.onSave rồi tự chớp .saved/.invalid theo kết quả — dùng cho các
  // widget lưu ngay khi đổi (checkbox/radio5/icd) không qua autosaveTracker.
  function fireSave(el, ctx, code, value) {
    let p;
    try { p = ctx.onSave(code, value); } catch (err) { p = Promise.reject(err); }
    Promise.resolve(p).then(() => flashSaved(el)).catch((err) => {
      const msg = (err && err.message) || 'Lỗi lưu dữ liệu';
      flashInvalid(el, msg);
      if (ctx.toast) ctx.toast('Lỗi: ' + msg);
    });
  }

  // Theo dõi giá trị đã lưu gần nhất (không phải giá trị lúc mở form) —
  // tránh bug: sửa A->B (lưu), rồi sửa lại B->A trong cùng lần mở chi tiết
  // sẽ so sánh nhầm với giá trị gốc A và bỏ qua lần lưu thứ 2 cần thiết.
  function autosaveTracker(def, initialValue, ctx, el) {
    let lastGood = initialValue == null ? '' : String(initialValue);
    const save = (rawNewVal) => {
      const nv = rawNewVal == null ? '' : String(rawNewVal);
      if (nv === lastGood) return;
      const prevGood = lastGood;
      lastGood = nv;
      let p;
      try { p = ctx.onSave(def.code, nv === '' ? null : rawNewVal); } catch (err) { p = Promise.reject(err); }
      Promise.resolve(p).then(() => flashSaved(el)).catch((err) => {
        lastGood = prevGood; // lưu thất bại -> giá trị "đã lưu gần nhất" vẫn là giá trị cũ
        const msg = (err && err.message) || 'Lỗi lưu dữ liệu';
        flashInvalid(el, msg);
        if (ctx.toast) ctx.toast('Lỗi: ' + msg);
      });
    };
    // Đợt 4B criterion 3: expose "giá trị đã lưu gần nhất" để keydown Esc
    // (textLike/renderDate) và combobox.js khôi phục khi hủy sửa dở dang.
    save.getLast = () => lastGood;
    return save;
  }

  // Đợt 3 criterion 8: 4 trường sinh hiệu nhóm C tiền kiểm ngưỡng phía
  // client trước khi autosave (NguongCheck khớp logic backend
  // services/sinh_hieu_valid.py) — huyết áp gõ liền số tự tách "12080"->
  // "120/80" ngay khi blur, ghi giá trị chuẩn hoá vào ô TRƯỚC khi lưu.
  const VITAL_NGUONG_CODES = new Set(['chieu_cao', 'can_nang', 'mach', 'huyet_ap']);

  function textLike(def, value, ctx, tag = 'input', extra = {}) {
    const el = document.createElement(tag);
    el.id = 'f_' + def.code;
    if (tag === 'input') el.type = extra.type || 'text';
    el.value = value == null ? '' : value;
    // Criterion 10: các trường tên (vd ho_ten) tự IN HOA khi gõ (feedback tức
    // thời qua CSS text-transform) VÀ khi lưu (giá trị thật gửi lên server
    // phải hoa để đồng bộ, kể cả khi user copy/paste chữ thường).
    if (def.uppercase) el.classList.add('input-uppercase');
    Object.entries(extra.attrs || {}).forEach(([k, v]) => el.setAttribute(k, v));
    const save = autosaveTracker(def, value, ctx, el);
    el.addEventListener('blur', () => {
      let v = el.value;
      if (def.uppercase && v) {
        v = v.toLocaleUpperCase('vi');
        el.value = v;
      }
      // Đợt 6 criterion 1: MỌI trường số (NUMERIC_FIELD_CODES — vượt ra
      // ngoài 4 trường có ngưỡng) chuẩn hoá dấu phẩy thập phân -> dấu chấm
      // TRƯỚC khi kiểm ngưỡng/lưu; sai định dạng (không phải số) -> đỏ +
      // tooltip 'Phải là số', KHÔNG lưu, focus ở lại (Enter không nhảy ô).
      if (NUMERIC_FIELD_CODES.has(def.code) && v !== '') {
        const norm = NguongCheck.normalizeSo(v);
        if (!norm.ok) {
          flashInvalid(el, 'Phải là số');
          if (ctx.toast) ctx.toast('Lỗi: Phải là số');
          return;
        }
        if (norm.value !== v) {
          v = norm.value;
          el.value = v;
        }
      }
      if (VITAL_NGUONG_CODES.has(def.code)) {
        if (v !== '') {
          const chk = NguongCheck.check(def.code, v);
          if (!chk.ok) {
            flashInvalid(el, chk.ly_do);
            if (ctx.toast) ctx.toast('Lỗi: ' + chk.ly_do);
            return; // KHÔNG autosave giá trị sai — giữ nguyên giá trị cũ trong DB
          }
          if (chk.value !== undefined && String(chk.value) !== v) {
            v = String(chk.value);
            el.value = v; // vd huyết áp "12080" -> "120/80" trước khi lưu
          }
        }
        // Đợt 4B: gỡ .invalid ngay cả khi v rỗng (user XÓA giá trị sai để sửa)
        // — nếu không, class đỏ cũ còn sót lại (chỉ được flashSaved() gỡ SAU
        // khi PATCH async resolve) khiến Enter-handler bên dưới tưởng nhầm ô
        // vẫn đang lỗi và chặn nhảy ô dù người dùng đã xóa sạch giá trị sai.
        el.classList.remove('invalid');
        el.removeAttribute('title');
      } else if (NUMERIC_FIELD_CODES.has(def.code)) {
        // glu_gia_tri/tai_* — không có ngưỡng, chỉ chuẩn hoá định dạng ở
        // trên; gỡ .invalid còn sót (vd user xoá giá trị sai để sửa lại).
        el.classList.remove('invalid');
        el.removeAttribute('title');
      }
      save(v);
    });
    el.addEventListener('keydown', stopIfPlainNav);
    // Đợt 4B criterion 3: Enter trong ô 1 dòng = blur (kích hoạt autosave ở
    // trên) rồi sang ô kế theo FocusFlow; textarea Enter = xuống dòng (không
    // nhảy ô, Tab để sang ô kế — không gắn listener này). 4 trường sinh hiệu
    // nhóm C: nếu NguongCheck thất bại thì el đã có class 'invalid' NGAY
    // (đồng bộ, trong chính blur handler ở trên) trước khi el.blur() trả về
    // -> focus Ở LẠI đúng theo spec, KHÔNG sang ô kế.
    // Esc = khôi phục giá trị đã lưu gần nhất; nếu giá trị không đổi (không
    // có gì để hủy) thì để Esc nổi bọt lên đóng panel chi tiết như cũ.
    if (tag !== 'textarea') {
      el.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          el.blur();
          // Đợt 6: NUMERIC_FIELD_CODES cũng phải giữ focus khi lỗi định
          // dạng (glu_gia_tri/tai_* không có ngưỡng nhưng vẫn cần chặn
          // Enter nhảy ô — cùng chuẩn luồng Enter Đợt 4 như VITAL_NGUONG_CODES).
          if ((VITAL_NGUONG_CODES.has(def.code) || NUMERIC_FIELD_CODES.has(def.code))
              && el.classList.contains('invalid')) {
            el.focus({ preventScroll: false });
            el.select();
          } else {
            FocusFlow.advance(el);
          }
        } else if (e.key === 'Escape') {
          const last = save.getLast();
          if (el.value !== last) {
            e.preventDefault();
            e.stopPropagation();
            el.value = last;
            el.classList.remove('invalid');
            el.removeAttribute('title');
          }
          // el.value === last -> không có gì để hủy, để Esc nổi bọt đóng panel.
        }
      });
    } else {
      el.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && el.value !== save.getLast()) {
          e.preventDefault();
          e.stopPropagation();
          el.value = save.getLast();
        }
      });
    }
    return fieldWrap(def, el, ctx);
  }

  function renderText(def, value, ctx) { return textLike(def, value, ctx, 'input'); }

  function renderNumber(def, value, ctx) {
    // Đợt 6 criterion 1: type="text" + inputmode="decimal" (KHÔNG
    // type="number") — input[type=number] chặn ký tự ',' ở nhiều trình
    // duyệt/locale, cản trở người dùng gõ số thập phân kiểu Việt Nam trước
    // khi blur tự chuẩn hoá. Bàn phím số vẫn hiện trên di động nhờ inputmode.
    return textLike(def, value, ctx, 'input', { type: 'text', attrs: { inputmode: 'decimal' } });
  }

  function renderTextarea(def, value, ctx) { return textLike(def, value, ctx, 'textarea'); }

  function renderReadonly(def, value, ctx) {
    const el = document.createElement('input');
    el.id = 'f_' + def.code;
    el.type = 'text';
    el.value = value == null ? '' : value;
    el.readOnly = true;
    el.className = 'readonly';
    return fieldWrap(def, el, ctx);
  }

  function renderCheckbox(def, value, ctx) {
    const el = document.createElement('input');
    el.id = 'f_' + def.code;
    el.type = 'checkbox';
    el.checked = value === 'Có';
    el.addEventListener('change', () => {
      fireSave(el, ctx, def.code, el.checked ? 'Có' : 'Không');
    });
    el.addEventListener('keydown', stopIfPlainNav);
    // Đợt 4B criterion 6: Space bật/tắt (hành vi mặc định trình duyệt, không
    // cần code thêm) — Enter sang ô kế (chặn hành vi submit form mặc định).
    el.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        FocusFlow.advance(el);
      }
    });
    return fieldWrap(def, el, ctx);
  }

  function renderRadio5(def, value, ctx) {
    const fs = document.createElement('div');
    fs.className = 'radio5';
    fs.tabIndex = 0;
    fs.id = 'f_' + def.code;
    const radios = {};
    for (let i = 1; i <= 5; i++) {
      // Đợt 3 criterion 9: label bọc input + span (KHÔNG dùng text node trần)
      // để CSS ép inline-flex cùng dòng ổn định — xem .radio5 label trong
      // app.css (trước đó `.field.field-radio5 label{display:inline}` đè mất
      // display:flex của `.radio5 label`, khiến nhãn rơi xuống dòng dưới).
      const lbl = document.createElement('label');
      const r = document.createElement('input');
      r.type = 'radio';
      r.name = 'r_' + def.code;
      r.value = i;
      r.checked = Number(value) === i;
      r.addEventListener('change', () => fireSave(fs, ctx, def.code, i));
      radios[i] = r;
      const span = document.createElement('span');
      span.textContent = RADIO5_LABELS[i];
      lbl.appendChild(r);
      lbl.appendChild(span);
      fs.appendChild(lbl);
    }
    fs.addEventListener('keydown', (e) => {
      if (e.ctrlKey || e.altKey || e.metaKey) return;
      if (e.key >= '1' && e.key <= '5') {
        e.stopPropagation();
        const i = Number(e.key);
        radios[i].checked = true;
        fireSave(fs, ctx, def.code, i);
      } else if (e.key === 'Enter') {
        // Đợt 4B criterion 6: Enter khi đang focus nhóm radio5 -> sang ô/
        // nhóm kế tiếp (phím số 1-5 chọn + mũi tên điều hướng giữ nguyên).
        e.preventDefault();
        e.stopPropagation();
        FocusFlow.advance(fs);
      }
    });
    return fieldWrap(def, fs, ctx);
  }

  function renderDate(def, value, ctx) {
    const holder = document.createElement('div');
    holder.className = 'date-input';
    const el = document.createElement('input');
    el.id = 'f_' + def.code;
    el.type = 'text';
    el.placeholder = 'dd/mm/yyyy';
    el.maxLength = 10;
    el.value = value == null ? '' : value;
    const save = autosaveTracker(def, value, ctx, el);

    el.addEventListener('input', () => {
      let digits = el.value.replace(/\D/g, '').slice(0, 8);
      let out = digits;
      if (digits.length > 4) out = `${digits.slice(0, 2)}/${digits.slice(2, 4)}/${digits.slice(4)}`;
      else if (digits.length > 2) out = `${digits.slice(0, 2)}/${digits.slice(2)}`;
      el.value = out;
    });
    el.addEventListener('blur', () => save(el.value));
    el.addEventListener('keydown', stopIfPlainNav);
    // Đợt 4B criterion 3: Enter = blur (autosave) + sang ô kế (ngày sinh/
    // ngày vào/ngày cấp CCCD không thuộc 4 trường ngưỡng sinh hiệu nên không
    // có nhánh "invalid giữ focus" — luôn tiến tới nếu có ô kế). Esc = khôi
    // phục giá trị đã lưu gần nhất (nếu có gì để hủy, không thì nổi bọt lên
    // đóng panel như cũ).
    el.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        el.blur();
        FocusFlow.advance(el);
      } else if (e.key === 'Escape' && el.value !== save.getLast()) {
        e.preventDefault();
        e.stopPropagation();
        el.value = save.getLast();
      }
    });

    const pickerBtn = document.createElement('button');
    pickerBtn.type = 'button';
    pickerBtn.className = 'date-picker-btn';
    pickerBtn.textContent = '📅';
    pickerBtn.title = 'Chọn từ lịch';
    const picker = document.createElement('input');
    picker.type = 'date';
    picker.className = 'date-picker-native';
    picker.addEventListener('change', () => {
      if (!picker.value) return;
      const [y, m, d] = picker.value.split('-');
      el.value = `${d}/${m}/${y}`;
      save(el.value);
    });
    pickerBtn.addEventListener('click', () => picker.showPicker ? picker.showPicker() : picker.click());

    holder.appendChild(el);
    holder.appendChild(pickerBtn);
    holder.appendChild(picker);
    return fieldWrap(def, holder, ctx);
  }

  function renderIcd(def, value, ctx) {
    const holder = document.createElement('div');
    holder.className = 'icd-input';
    const el = document.createElement('input');
    el.id = 'f_' + def.code;
    el.type = 'text';
    el.autocomplete = 'off';
    el.value = value == null ? '' : value;
    el.placeholder = 'Gõ để tìm ICD...';
    // Chỉ lưu khi chọn từ gợi ý (đảm bảo LUÔN là tên nguyên văn từ dm_icd —
    // §5, §9, bẫy §10 "tự soạn tên bệnh"). Gõ tự do không khớp gợi ý sẽ bị
    // hoàn tác về giá trị đã lưu gần nhất khi rời ô, KHÔNG gửi PATCH.
    let lastSaved = value == null ? '' : String(value);

    const list = document.createElement('div');
    list.className = 'icd-suggestions';
    list.hidden = true;

    let debounceTimer = null;
    let items = [];
    let activeIdx = -1;

    function renderList() {
      list.innerHTML = '';
      items.forEach((it, idx) => {
        const row = document.createElement('div');
        row.className = 'icd-item' + (idx === activeIdx ? ' active' : '');
        row.textContent = it.label;
        row.addEventListener('mousedown', (e) => {
          e.preventDefault();
          choose(it);
        });
        list.appendChild(row);
      });
      list.hidden = items.length === 0;
    }

    function choose(it) {
      el.value = it.ten;
      list.hidden = true;
      if (it.ten !== lastSaved) {
        lastSaved = it.ten;
        fireSave(el, ctx, def.code, it.ten);
      }
    }

    el.addEventListener('input', () => {
      clearTimeout(debounceTimer);
      const q = el.value.trim();
      if (!q) { items = []; renderList(); return; }
      debounceTimer = setTimeout(async () => {
        try {
          items = await ctx.icdSearch(q);
          activeIdx = -1;
          renderList();
        } catch (e) { /* bỏ qua lỗi mạng tạm thời */ }
      }, 200);
    });
    el.addEventListener('keydown', (e) => {
      if (e.ctrlKey || e.altKey || e.metaKey) return;
      if (!list.hidden) {
        if (e.key === 'ArrowDown') { e.preventDefault(); e.stopPropagation(); activeIdx = Math.min(activeIdx + 1, items.length - 1); renderList(); return; }
        if (e.key === 'ArrowUp') { e.preventDefault(); e.stopPropagation(); activeIdx = Math.max(activeIdx - 1, 0); renderList(); return; }
        if (e.key === 'Escape') { e.stopPropagation(); list.hidden = true; return; }
      }
      // Đợt 4B criterion 5: Enter chọn mục highlight (mặc định mục ĐẦU nếu
      // chưa highlight gì) rồi sang ô kế; không có gợi ý nào đang mở (chưa
      // gõ hoặc không khớp) -> coi như CHƯA nhập, khôi phục giá trị đã lưu
      // gần nhất (blur handler bên dưới cũng làm việc này, gọi luôn ở đây để
      // FocusFlow.advance có giá trị đúng ngay khi tính danh sách ô kế).
      if (e.key === 'Enter') {
        e.preventDefault(); e.stopPropagation();
        if (!list.hidden && items.length) {
          choose(items[activeIdx >= 0 ? activeIdx : 0]);
        } else if (el.value !== lastSaved) {
          el.value = lastSaved;
        }
        FocusFlow.advance(el);
      }
    });
    el.addEventListener('blur', () => {
      setTimeout(() => { list.hidden = true; }, 150);
      if (el.value !== lastSaved) el.value = lastSaved; // hoàn tác gõ tự do chưa chọn
    });

    holder.appendChild(el);
    holder.appendChild(list);
    return fieldWrap(def, holder, ctx);
  }

  function renderField(def, value, ctx) {
    switch (def.widget) {
      case 'checkbox': return renderCheckbox(def, value, ctx);
      // Đợt 4B criterion 4: mọi dropdown-danh-mục dùng combobox tự lọc
      // (combobox.js) thay <datalist> cũ.
      case 'dropdown': return Combobox.renderField(def, value, ctx);
      case 'icd': return renderIcd(def, value, ctx);
      case 'radio5': return renderRadio5(def, value, ctx);
      case 'date': return renderDate(def, value, ctx);
      case 'number': return renderNumber(def, value, ctx);
      case 'textarea': return renderTextarea(def, value, ctx);
      case 'readonly': return renderReadonly(def, value, ctx);
      default: return renderText(def, value, ctx);
    }
  }

  // fieldWrap/flashSaved/flashInvalid/autosaveTracker expose cho combobox.js
  // tái dùng (Đợt 4B criterion 4) — tránh lặp lại logic autosave/flash.
  return { renderField, fieldWrap, flashSaved, flashInvalid, autosaveTracker };
})();
