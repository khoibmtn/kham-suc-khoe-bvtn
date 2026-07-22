// caidat.js — Đợt 3 criterion 8: màn "Cài đặt" (admin-only) chỉnh ngưỡng
// sinh hiệu hợp lệ (mạch, cân nặng, chiều cao, HA tâm thu/tâm trương) —
// PUT /api/cai-dat. Validate min<max cả client lẫn server (belt & braces).

const CaiDatView = (() => {
  let panel;

  const FIELDS = [
    { key: 'chieu_cao', label: 'Chiều cao', unit: 'cm' },
    { key: 'can_nang', label: 'Cân nặng', unit: 'kg' },
    { key: 'mach', label: 'Mạch', unit: 'lần/phút' },
    { key: 'ha_tam_thu', label: 'Huyết áp — tâm thu', unit: 'mmHg' },
    { key: 'ha_tam_truong', label: 'Huyết áp — tâm trương', unit: 'mmHg' },
  ];

  function init(panelEl) {
    panel = panelEl;
  }

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => (
      { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  async function show() {
    panel.innerHTML = '<div class="dash-loading">Đang tải cài đặt...</div>';
    let nguong;
    try {
      const res = await Api.caiDatGet();
      nguong = res.nguong_sinh_hieu;
      NguongCheck.setNguong(nguong);
    } catch (err) {
      panel.innerHTML = `<div class="xf-error">Lỗi tải cài đặt: ${esc(err.message)}</div>`;
      return;
    }
    render(nguong);
  }

  function render(nguong) {
    panel.innerHTML = `
      <h2>Cài đặt — Ngưỡng sinh hiệu hợp lệ</h2>
      <p class="cd-hint">
        Giá trị nhập ở màn Chi tiết và Sinh hiệu ngoài khoảng dưới đây sẽ bị
        từ chối lưu (báo lỗi rõ ràng, không âm thầm bỏ qua).
      </p>
      <form id="cd-form" class="cd-form">
        ${FIELDS.map((f) => `
          <div class="cd-row">
            <div class="cd-row-label">${esc(f.label)} <span class="cd-unit">(${esc(f.unit)})</span></div>
            <label>Tối thiểu
              <input type="number" step="any" id="cd-${f.key}-min" value="${esc(nguong[f.key].min)}" required>
            </label>
            <label>Tối đa
              <input type="number" step="any" id="cd-${f.key}-max" value="${esc(nguong[f.key].max)}" required>
            </label>
          </div>`).join('')}
        <div id="cd-result"></div>
        <button type="submit">Lưu</button>
      </form>
    `;
    panel.querySelector('#cd-form').addEventListener('submit', onSubmit);
  }

  async function onSubmit(e) {
    e.preventDefault();
    const resultBox = panel.querySelector('#cd-result');
    resultBox.textContent = '';
    resultBox.className = '';

    const nguong_sinh_hieu = {};
    for (const f of FIELDS) {
      const mn = Number(panel.querySelector(`#cd-${f.key}-min`).value);
      const mx = Number(panel.querySelector(`#cd-${f.key}-max`).value);
      if (Number.isNaN(mn) || Number.isNaN(mx)) {
        resultBox.textContent = `${f.label}: giá trị phải là số`;
        resultBox.className = 'error';
        return;
      }
      if (mn >= mx) {
        resultBox.textContent = `${f.label}: tối thiểu phải nhỏ hơn tối đa`;
        resultBox.className = 'error';
        return;
      }
      nguong_sinh_hieu[f.key] = { min: mn, max: mx };
    }

    try {
      const res = await Api.caiDatPut({ nguong_sinh_hieu });
      NguongCheck.setNguong(res.nguong_sinh_hieu);
      resultBox.textContent = 'Đã lưu cài đặt.';
      resultBox.className = 'ok';
    } catch (err) {
      resultBox.textContent = err.message;
      resultBox.className = 'error';
    }
  }

  return { init, show };
})();
