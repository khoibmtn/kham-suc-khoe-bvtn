// combobox.js — Đợt 4B criterion 4: combobox tự lọc DÙNG CHUNG cho MỌI
// trường dropdown-danh-mục (giới tính, dân tộc, tỉnh, nghề nghiệp, xã, đối
// tượng, nguồn chi trả, loại hình KCB, nhóm máu, thị lực 4 ô Mắt...) — thay
// hẳn <datalist> cũ (widgets.js renderDropdown trước đây) để có ↑↓/Enter/
// lọc-không-dấu nhất quán với ICD autocomplete (widgets.js renderIcd, §5).
//
// Giá trị lưu/hiển thị LUÔN là `ten` của mục trong danh mục (giữ đúng hành
// vi renderDropdown cũ — không đổi định dạng dữ liệu đã lưu trên server).
// Tái dùng Widgets.autosaveTracker/fieldWrap (widgets.js expose) để không
// lặp lại logic autosave/flash xanh-đỏ.
const Combobox = (() => {
  // Bỏ dấu tiếng Việt + hạ chữ thường để lọc khớp CHUỖI CON không phân biệt
  // dấu (vd gõ '5' khớp '5/10', gõ 'ha noi' khớp 'Hà Nội').
  function stripAccent(s) {
    return String(s == null ? '' : s)
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/đ/g, 'd')
      .replace(/Đ/g, 'D')
      .toLowerCase();
  }

  function renderField(def, value, ctx) {
    const holder = document.createElement('div');
    holder.className = 'combobox-input';

    const el = document.createElement('input');
    el.id = 'f_' + def.code;
    el.type = 'text';
    el.autocomplete = 'off';
    el.setAttribute('role', 'combobox');
    el.setAttribute('aria-expanded', 'false');
    el.setAttribute('aria-autocomplete', 'list');
    el.setAttribute('aria-haspopup', 'listbox');
    el.value = value == null ? '' : value;

    const allOptions = (ctx.catalogs && ctx.catalogs[def.catalog]) || [];

    const list = document.createElement('div');
    list.className = 'icd-suggestions combo-suggestions';
    list.setAttribute('role', 'listbox');
    list.hidden = true;

    const save = Widgets.autosaveTracker(def, value, ctx, el);

    let filtered = allOptions;
    let activeIdx = -1;
    let open = false;

    function scrollActiveIntoView() {
      const activeEl = list.children[activeIdx];
      if (activeEl) activeEl.scrollIntoView({ block: 'nearest' });
    }

    function renderList() {
      list.innerHTML = '';
      filtered.forEach((o, idx) => {
        const row = document.createElement('div');
        row.className = 'icd-item' + (idx === activeIdx ? ' active' : '');
        row.setAttribute('role', 'option');
        row.textContent = o.ten;
        row.addEventListener('mousedown', (e) => {
          e.preventDefault(); // giữ focus trên input, không để blur chạy trước click
          pick(o);
        });
        list.appendChild(row);
      });
      list.hidden = !open || filtered.length === 0;
    }

    // Mở menu hiện TOÀN BỘ danh mục (bộ lọc reset mỗi lần mở — §4), highlight
    // mục đang khớp giá trị hiện tại nếu có.
    function openMenu() {
      open = true;
      el.setAttribute('aria-expanded', 'true');
      filtered = allOptions;
      activeIdx = filtered.findIndex((o) => o.ten === el.value);
      renderList();
      scrollActiveIntoView();
    }

    function closeMenu() {
      open = false;
      el.setAttribute('aria-expanded', 'false');
      list.hidden = true;
    }

    function applyFilter() {
      const q = stripAccent(el.value.trim());
      filtered = q ? allOptions.filter((o) => stripAccent(o.ten).includes(q)) : allOptions;
      activeIdx = filtered.length ? 0 : -1;
      open = true;
      renderList();
    }

    function pick(o) {
      el.value = o.ten;
      closeMenu();
      save(o.ten);
    }

    // Không có kết quả khớp (hoặc Enter/Tab rời ô mà chưa chọn) — coi như Ô
    // CHƯA NHẬP: khôi phục giá trị đã lưu gần nhất, KHÔNG lưu rác (§4).
    function revertNoMatch() {
      el.value = save.getLast();
      closeMenu();
    }

    // Đợt 10 criterion 3: ô để TRỐNG lúc blur/Enter/Tab/Esc là XÓA CÓ CHỦ Ý
    // — lưu null (gỡ giá trị khỏi hồ sơ), KHÔNG revert về giá trị cũ. save('')
    // đi qua autosaveTracker (widgets.js): '' -> null trước khi PATCH.
    function commitClear() {
      el.value = '';
      closeMenu();
      save('');
    }

    el.addEventListener('focus', openMenu);

    el.addEventListener('input', applyFilter);

    el.addEventListener('keydown', (e) => {
      if (e.ctrlKey || e.altKey || e.metaKey) return;
      if (e.key === 'ArrowDown') {
        e.preventDefault(); e.stopPropagation();
        if (!open) { openMenu(); return; }
        activeIdx = Math.min(activeIdx + 1, filtered.length - 1);
        renderList();
        scrollActiveIntoView();
      } else if (e.key === 'ArrowUp') {
        e.preventDefault(); e.stopPropagation();
        if (!open) { openMenu(); return; }
        activeIdx = Math.max(activeIdx - 1, 0);
        renderList();
        scrollActiveIntoView();
      } else if (e.key === 'Enter') {
        e.preventDefault(); e.stopPropagation();
        if (el.value.trim() === '') {
          // Đợt 10 criterion 3: Enter trên ô TRỐNG = xóa có chủ ý.
          commitClear();
        } else if (open && filtered.length) {
          // Enter chọn mục highlight; nếu chưa highlight gì (activeIdx=-1,
          // vd vừa mở menu chưa gõ gì và giá trị cũ không khớp mục nào) thì
          // chọn KẾT QUẢ ĐẦU TIÊN của danh sách đã lọc (§4).
          pick(filtered[activeIdx >= 0 ? activeIdx : 0]);
        } else {
          revertNoMatch();
        }
        FocusFlow.advance(el);
      } else if (e.key === 'Escape') {
        // Đợt 10 criterion 3: ưu tiên XÓA — nếu ô đang có giá trị (đang gõ
        // dở HOẶC đã có giá trị lưu), Esc xóa trắng + lưu null + đóng menu.
        // Chỉ khi KHÔNG có gì để xóa mới để Esc nổi bọt lên đóng panel chi
        // tiết như bình thường (không stopPropagation).
        const hasValue = el.value.trim() !== '' || !!save.getLast();
        if (hasValue) {
          e.preventDefault();
          e.stopPropagation();
          commitClear();
        }
      }
    });

    el.addEventListener('blur', () => {
      // Trễ 150ms để mousedown trên 1 mục (đã preventDefault ở trên) kịp
      // chạy trước khi menu bị ẩn — cùng pattern với renderIcd sẵn có.
      setTimeout(() => {
        if (!open) return;
        const q = el.value.trim();
        if (q === '') { commitClear(); return; } // Đợt 10 criterion 3: trống -> xóa có chủ ý
        const matched = allOptions.find((o) => o.ten === q);
        if (!matched) revertNoMatch(); // Tab/click ra ngoài không khớp -> khôi phục, không lưu rác
        else closeMenu();
      }, 150);
    });

    holder.appendChild(el);
    holder.appendChild(list);
    return Widgets.fieldWrap(def, holder, ctx);
  }

  return { renderField, stripAccent };
})();
