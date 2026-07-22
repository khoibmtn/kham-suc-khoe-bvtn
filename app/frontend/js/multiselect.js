// multiselect.js — dropdown đa chọn kiểu checkbox tái sử dụng (Đợt 2, tiêu
// chí 8). Nút tóm tắt lựa chọn ("Tất cả" / tên đơn / "N mục đã chọn") mở
// panel checkbox có mục "Tất cả" (tick "Tất cả" -> xóa hết lựa chọn khác =
// không lọc). Click ra ngoài đóng panel. Bàn phím: Enter/Space mở, ↑↓ di
// chuyển, Space chọn/bỏ, Esc đóng — các phím này KHÔNG được nổi bọt lên phím
// tắt toàn cục (keyboard.js) khi panel đang mở; Multiselect.isOpen() cho
// keyboard.js biết trạng thái để bỏ qua ↑↓/Enter/Esc toàn cục lúc đó.

const Multiselect = (() => {
  let openCount = 0;
  function isOpen() { return openCount > 0; }

  function create({ options, selected, allLabel, onChange }) {
    allLabel = allLabel || 'Tất cả';
    let sel = new Set((selected || []).map(String));

    const wrap = document.createElement('div');
    wrap.className = 'ms-wrap';
    wrap.tabIndex = 0;

    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'ms-btn';
    wrap.appendChild(btn);

    const panel = document.createElement('div');
    panel.className = 'ms-panel';
    panel.hidden = true;
    wrap.appendChild(panel);

    let itemEls = []; // [{el, ma}] — index 0 luôn là mục "Tất cả"
    let activeIdx = -1;

    function summary() {
      if (sel.size === 0) return allLabel;
      if (sel.size === 1) {
        const ma = Array.from(sel)[0];
        const opt = options.find((o) => String(o.ma) === ma);
        return opt ? opt.ten : allLabel;
      }
      return `${sel.size} mục đã chọn`;
    }

    function renderBtn() { btn.textContent = summary(); }

    function renderPanel() {
      panel.innerHTML = '';
      itemEls = [];

      const allRow = document.createElement('label');
      allRow.className = 'ms-item ms-item-all';
      const allCb = document.createElement('input');
      allCb.type = 'checkbox';
      allCb.tabIndex = -1;
      allCb.checked = sel.size === 0;
      allRow.appendChild(allCb);
      allRow.appendChild(document.createTextNode(' ' + allLabel));
      allRow.addEventListener('mousedown', (e) => e.preventDefault());
      allRow.addEventListener('click', (e) => {
        e.preventDefault();
        sel.clear();
        commit();
        renderPanel();
      });
      panel.appendChild(allRow);
      itemEls.push({ el: allRow, ma: null });

      options.forEach((o) => {
        const ma = String(o.ma);
        const row = document.createElement('label');
        row.className = 'ms-item';
        const cb = document.createElement('input');
        cb.type = 'checkbox';
        cb.tabIndex = -1;
        cb.checked = sel.has(ma);
        row.appendChild(cb);
        if (o.icon) row.appendChild(document.createTextNode(' ' + o.icon));
        row.appendChild(document.createTextNode(' ' + o.ten));
        if (o.title) row.title = o.title;
        row.addEventListener('mousedown', (e) => e.preventDefault());
        row.addEventListener('click', (e) => {
          e.preventDefault();
          toggle(ma);
        });
        panel.appendChild(row);
        itemEls.push({ el: row, ma });
      });
      setActive(Math.max(0, Math.min(activeIdx, itemEls.length - 1)));
    }

    function toggle(ma) {
      if (sel.has(ma)) sel.delete(ma); else sel.add(ma);
      commit();
      renderPanel();
    }

    function commit() {
      renderBtn();
      onChange(Array.from(sel));
    }

    function setActive(idx) {
      activeIdx = idx;
      itemEls.forEach((it, i) => it.el.classList.toggle('active', i === idx));
      if (itemEls[idx]) itemEls[idx].el.scrollIntoView({ block: 'nearest' });
    }

    function open() {
      if (!panel.hidden) return;
      panel.hidden = false;
      wrap.classList.add('open');
      openCount++;
      setActive(0);
      document.addEventListener('mousedown', onDocMouseDown, true);
    }

    function close() {
      if (panel.hidden) return;
      panel.hidden = true;
      wrap.classList.remove('open');
      openCount = Math.max(0, openCount - 1);
      document.removeEventListener('mousedown', onDocMouseDown, true);
    }

    function onDocMouseDown(e) {
      if (!wrap.contains(e.target)) close();
    }

    btn.addEventListener('click', () => (panel.hidden ? open() : close()));

    wrap.addEventListener('keydown', (e) => {
      if (e.ctrlKey || e.altKey || e.metaKey) return;
      if (panel.hidden) {
        if (e.key === 'Enter' || e.key === ' ' || e.key === 'ArrowDown') {
          e.preventDefault(); e.stopPropagation();
          open();
        }
        return;
      }
      if (e.key === 'ArrowDown') {
        e.preventDefault(); e.stopPropagation();
        setActive(Math.min(activeIdx + 1, itemEls.length - 1));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault(); e.stopPropagation();
        setActive(Math.max(activeIdx - 1, 0));
      } else if (e.key === ' ' || e.key === 'Enter') {
        e.preventDefault(); e.stopPropagation();
        const it = itemEls[activeIdx];
        if (it) it.el.click();
      } else if (e.key === 'Escape') {
        e.preventDefault(); e.stopPropagation();
        close();
      } else if (e.key === 'Tab') {
        close();
      }
    });

    renderBtn();
    renderPanel();

    return {
      el: wrap,
      getSelected: () => Array.from(sel),
      setSelected: (arr) => {
        sel = new Set((arr || []).map(String));
        renderBtn();
        renderPanel();
      },
    };
  }

  return { create, isOpen };
})();
