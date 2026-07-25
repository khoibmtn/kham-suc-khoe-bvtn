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
    let nguong, tuDong, saoLuuGanNhat;
    try {
      const res = await Api.caiDatGet();
      nguong = res.nguong_sinh_hieu;
      tuDong = res.tu_dong || {};
      saoLuuGanNhat = res.sao_luu_gan_nhat;
      NguongCheck.setNguong(nguong);
    } catch (err) {
      panel.innerHTML = `<div class="xf-error">Lỗi tải cài đặt: ${esc(err.message)}</div>`;
      return;
    }
    render(nguong, tuDong, saoLuuGanNhat);
  }

  function fmtThoiGian(iso) {
    if (!iso) return 'chưa có';
    const d = new Date(iso);
    if (isNaN(d)) return iso;
    return d.toLocaleString('vi-VN');
  }

  function render(nguong, tuDong, saoLuuGanNhat) {
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

      <h2>Tự động hoá (máy chủ)</h2>
      <p class="cd-hint">Áp dụng cho máy đang chạy server (không phải máy code).
        Đổi số ở đây có hiệu lực trong vòng chưa tới 1 phút, không cần khởi động lại.</p>
      <form id="cd-tudong-form" class="cd-form">
        <div class="cd-row">
          <div class="cd-row-label">Tự động sao lưu dữ liệu</div>
          <label><input type="checkbox" id="cd-backup-bat" ${tuDong.backup_bat ? 'checked' : ''}> Bật</label>
          <label>Mỗi (phút)
            <input type="number" min="1" step="1" id="cd-backup-phut" value="${esc(tuDong.backup_phut)}" required>
          </label>
          <label>Giữ lại (số bản)
            <input type="number" min="1" step="1" id="cd-backup-giu" value="${esc(tuDong.backup_giu_so_ban)}" required>
          </label>
        </div>
        <p class="cd-hint">Lần sao lưu tự động gần nhất: <b>${esc(fmtThoiGian(saoLuuGanNhat))}</b>.
          File lưu ở <code>app/data/backups/auto/</code>.</p>

        <div class="cd-row">
          <div class="cd-row-label">Tự động cập nhật code (kéo bản mới từ Git)</div>
          <label><input type="checkbox" id="cd-capnhat-bat" ${tuDong.cap_nhat_bat ? 'checked' : ''}> Bật</label>
          <label>Mỗi (phút)
            <input type="number" min="1" step="1" id="cd-capnhat-phut" value="${esc(tuDong.cap_nhat_phut)}" required>
          </label>
        </div>
        <p class="cd-hint">Cần chạy sẵn <code>app\\auto_update.bat</code> ở máy chủ Windows
          (cửa sổ riêng) — số phút này chỉ điều khiển KHOẢNG CÁCH giữa các lần
          kiểm tra của cửa sổ đó, không tự bật nếu chưa chạy.</p>

        <div id="cd-tudong-result"></div>
        <button type="submit">Lưu</button>
      </form>

      <h2>Rà soát & tự động phân loại (toàn bộ hồ sơ)</h2>
      <p class="cd-hint">Chạy 1 lần: điền BMI/Phân loại thể lực còn TRỐNG (khi
        đã có chiều cao+cân nặng), nâng Tuần hoàn theo Mạch/Huyết áp, tự thêm
        bệnh chính khi HA cao/mạch bất thường mà chưa có chẩn đoán, nâng Phân
        loại sức khỏe chung lên mức nặng nhất. <b>Chỉ nâng/điền chỗ trống —
        không bao giờ xoá hay ghi đè giá trị đã có.</b> Bấm "Xem trước" để xem
        số lượng dự kiến trước khi Áp dụng.</p>
      <div class="cd-row">
        <button type="button" id="cd-rasoat-preview">Xem trước (dry-run)</button>
        <button type="button" id="cd-rasoat-apply" disabled>Áp dụng</button>
      </div>
      <div id="cd-rasoat-result"></div>
    `;
    panel.querySelector('#cd-form').addEventListener('submit', onSubmit);
    panel.querySelector('#cd-tudong-form').addEventListener('submit', onSubmitTuDong);
    panel.querySelector('#cd-rasoat-preview').addEventListener('click', () => onRaSoat(false));
    panel.querySelector('#cd-rasoat-apply').addEventListener('click', () => onRaSoat(true));
  }

  function fmtRaSoat(kq) {
    return `Quét: <b>${kq.tong_quet}</b> hồ sơ<br>`
      + `Điền BMI còn trống: <b>${kq.dien_bmi}</b><br>`
      + `Điền Phân loại thể lực còn trống: <b>${kq.dien_pl_the_luc}</b><br>`
      + `Nâng Tuần hoàn (theo Mạch/HA): <b>${kq.nang_tuan_hoan}</b><br>`
      + `Tự thêm bệnh chính: <b>${kq.them_benh_chinh}</b> `
      + `(I10: ${kq.them_benh_chinh_theo_ma['I10']}, `
      + `R00.0: ${kq.them_benh_chinh_theo_ma['R00.0']}, `
      + `R00.1: ${kq.them_benh_chinh_theo_ma['R00.1']})<br>`
      + `Gỡ cờ "Có phân loại nhưng không có chẩn đoán": <b>${kq.go_co}</b><br>`
      + `Nâng Phân loại sức khỏe chung: <b>${kq.nang_suc_khoe_chung}</b>`;
  }

  async function onRaSoat(apply) {
    const resultBox = panel.querySelector('#cd-rasoat-result');
    const previewBtn = panel.querySelector('#cd-rasoat-preview');
    const applyBtn = panel.querySelector('#cd-rasoat-apply');
    if (apply && !confirm('Áp dụng thay đổi cho TOÀN BỘ hồ sơ như số liệu '
      + 'vừa xem trước? Thao tác ghi thẳng vào dữ liệu (có ghi nhật ký).')) return;
    previewBtn.disabled = true;
    applyBtn.disabled = true;
    resultBox.className = '';
    resultBox.textContent = apply ? 'Đang áp dụng…' : 'Đang quét…';
    try {
      const kq = await Api.raSoatSinhHieu(apply);
      resultBox.innerHTML = (apply ? '✅ Đã áp dụng.<br>' : '👁 Xem trước (chưa ghi gì) —<br>')
        + fmtRaSoat(kq);
      resultBox.className = 'ok';
      applyBtn.disabled = apply; // sau khi áp dụng thật -> phải Xem trước lại mới cho áp dụng tiếp
    } catch (err) {
      resultBox.textContent = err.message;
      resultBox.className = 'error';
    } finally {
      previewBtn.disabled = false;
      if (!apply) applyBtn.disabled = false;
    }
  }

  async function onSubmitTuDong(e) {
    e.preventDefault();
    const resultBox = panel.querySelector('#cd-tudong-result');
    resultBox.textContent = '';
    resultBox.className = '';

    const tu_dong = {
      backup_bat: panel.querySelector('#cd-backup-bat').checked,
      backup_phut: Number(panel.querySelector('#cd-backup-phut').value),
      backup_giu_so_ban: Number(panel.querySelector('#cd-backup-giu').value),
      cap_nhat_bat: panel.querySelector('#cd-capnhat-bat').checked,
      cap_nhat_phut: Number(panel.querySelector('#cd-capnhat-phut').value),
    };
    for (const k of ['backup_phut', 'backup_giu_so_ban', 'cap_nhat_phut']) {
      if (!Number.isInteger(tu_dong[k]) || tu_dong[k] < 1) {
        resultBox.textContent = 'Các ô số phút / số bản phải là số nguyên >= 1';
        resultBox.className = 'error';
        return;
      }
    }
    try {
      await Api.caiDatPut({ tu_dong });
      resultBox.textContent = 'Đã lưu cài đặt tự động hoá.';
      resultBox.className = 'ok';
    } catch (err) {
      resultBox.textContent = err.message;
      resultBox.className = 'error';
    }
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
