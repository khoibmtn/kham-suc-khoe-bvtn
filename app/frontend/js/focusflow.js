// focusflow.js — Đợt 4B criterion 3: tiện ích tính "ô nhập liệu kế tiếp"
// trong màn CHI TIẾT theo thứ tự HIỂN THỊ (DOM order) — dùng bởi widgets.js
// (Enter trong 1 ô -> sang ô kế) và combobox.js. KHÔNG cache danh sách ô vì
// detail.js render lại toàn bộ #detail-panel mỗi khi mở hồ sơ/đổi nhóm —
// luôn truy vấn DOM sống tại thời điểm gọi để tránh trỏ vào node đã gỡ bỏ.
//
// Bỏ qua: ô readonly/disabled/ẩn (input[hidden], display:none, kích thước 0
// — vd input[type=date] ẩn của bộ chọn lịch trong renderDate), khung "Chẩn
// đoán gốc" (chỉ đọc, .chan-doan-goc), và mọi <button>. Nhóm radio 1-5 tính
// là MỘT điểm dừng duy nhất (fieldset .radio5[tabindex] — 5 input[type=radio]
// con KHÔNG lặp lại; widgets.js tự xử lý phím số 1-5/Enter nội bộ trong đó).
const FocusFlow = (() => {
  const SELECTOR = [
    'input:not([type=hidden]):not([type=radio]):not([disabled]):not([readonly])',
    'select:not([disabled])',
    'textarea:not([disabled]):not([readonly])',
    '[role=combobox]',
    '.radio5[tabindex]',
  ].join(',');

  function isVisible(el) {
    if (el.hidden) return false;
    const style = window.getComputedStyle(el);
    if (style.display === 'none' || style.visibility === 'hidden') return false;
    const rect = el.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
  }

  function collect(container) {
    if (!container) return [];
    return Array.from(container.querySelectorAll(SELECTOR)).filter((el) => {
      if (el.closest('.chan-doan-goc')) return false;
      return isVisible(el);
    });
  }

  function defaultContainer() {
    return document.getElementById('detail-panel');
  }

  // Trả về phần tử nhập liệu kế tiếp SAU `el` theo DOM order, hoặc null nếu
  // `el` là ô cuối cùng / không (còn) nằm trong danh sách hiện tại.
  function next(el, container) {
    const list = collect(container || defaultContainer());
    const idx = list.indexOf(el);
    if (idx === -1 || idx === list.length - 1) return null;
    return list[idx + 1];
  }

  // Focus ô kế tiếp (nếu có) — preventScroll:false + scrollIntoView({block:
  // 'nearest'}) để không giật màn hình khi ô kế đã nằm trong khung nhìn.
  function advance(el, container) {
    const n = next(el, container);
    if (!n) return null;
    n.focus({ preventScroll: false });
    if ((n.tagName === 'INPUT' && n.type !== 'checkbox') || n.tagName === 'TEXTAREA') {
      if (typeof n.select === 'function') n.select();
    }
    n.scrollIntoView({ block: 'nearest' });
    return n;
  }

  return { collect, next, advance };
})();
