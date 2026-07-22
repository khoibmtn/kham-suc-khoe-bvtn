// keyboard.js — 9 phím tắt bắt buộc (§3.2 criterion 5).
const Keyboard = (() => {
  function isTypingTarget(el) {
    if (!el) return false;
    const tag = el.tagName;
    return tag === 'INPUT' || tag === 'TEXTAREA' || el.isContentEditable;
  }

  // Rời ô đang gõ TRƯỚC khi điều hướng đi nơi khác — kích hoạt autosave
  // onBlur (§3.4.3) để không mất dữ liệu vừa gõ khi Ctrl+S / Ctrl+↓/↑.
  function flushPendingEdit() {
    if (isTypingTarget(document.activeElement)) document.activeElement.blur();
  }

  function install() {
    document.addEventListener('keydown', (e) => {
      const cmdPaletteOpen = !document.getElementById('cmd-palette').hidden;
      if (cmdPaletteOpen) {
        if (e.key === 'Escape') { e.preventDefault(); AppShell.closeCommandPalette(); }
        return;
      }

      // Ctrl+K — bảng lệnh (luôn hoạt động, kể cả khi đang gõ)
      if (e.ctrlKey && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        AppShell.openCommandPalette();
        return;
      }

      // Đợt 2 tiêu chí 8: khi 1 dropdown đa chọn (checkbox-dropdown) đang mở,
      // nó tự xử lý ↑↓/Enter/Space/Esc nội bộ và stopPropagation — nhưng
      // chặn thêm ở đây (phòng vệ) để phím tắt toàn cục (↑↓ danh sách, Enter
      // mở hồ sơ, Esc đóng chi tiết) không vô tình nổi bọt lên trong lúc đó.
      if (typeof Multiselect !== 'undefined' && Multiselect.isOpen()) {
        return;
      }

      // Ctrl+S — hoàn thành + mở kế tiếp (preventDefault bắt buộc)
      if (e.ctrlKey && e.key.toLowerCase() === 's') {
        e.preventDefault();
        flushPendingEdit();
        AppShell.markHoanThanh();
        return;
      }

      // Ctrl+↓ / Ctrl+↑ — hồ sơ kế tiếp/trước khi đang mở chi tiết
      if (e.ctrlKey && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) {
        if (DetailView.isOpen()) {
          e.preventDefault();
          flushPendingEdit();
          ListView.moveSelection(e.key === 'ArrowDown' ? 1 : -1);
          ListView.openSelected();
        }
        return;
      }

      // Alt+1..9 — nhảy nhóm trường (chỉ khi đang mở chi tiết)
      if (e.altKey && /^[1-9]$/.test(e.key)) {
        if (DetailView.isOpen()) {
          e.preventDefault();
          DetailView.focusGroup(Number(e.key));
        }
        return;
      }

      // F2 — sửa ô đang focus / mở + focus ô đầu tiên
      if (e.key === 'F2') {
        e.preventDefault();
        if (!DetailView.isOpen()) { ListView.openSelected(); setTimeout(() => DetailView.focusEditCurrentField(), 50); }
        else DetailView.focusEditCurrentField();
        return;
      }

      // Esc — đóng chi tiết
      if (e.key === 'Escape') {
        flushPendingEdit();
        if (DetailView.isOpen()) { e.preventDefault(); AppShell.closeDetail(); }
        return;
      }

      // Các phím còn lại: bỏ qua nếu đang gõ trong 1 ô nhập liệu khác search-box
      const typing = isTypingTarget(document.activeElement);

      // '/' — nhảy vào ô tìm kiếm
      if (e.key === '/' && !typing) {
        e.preventDefault();
        ListView.focusSearch();
        return;
      }

      if (typing) return;

      // ↑ ↓ — di chuyển trong danh sách kết quả
      if (e.key === 'ArrowDown') { e.preventDefault(); ListView.moveSelection(1); return; }
      if (e.key === 'ArrowUp') { e.preventDefault(); ListView.moveSelection(-1); return; }

      // Enter — mở hồ sơ đang chọn
      if (e.key === 'Enter') { e.preventDefault(); ListView.openSelected(); return; }
    });
  }

  return { install };
})();
