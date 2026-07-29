// caidat.js — Đợt 3 criterion 8: màn "Cài đặt" (admin-only) chỉnh ngưỡng
// sinh hiệu hợp lệ (mạch, cân nặng, chiều cao, HA tâm thu/tâm trương) —
// PUT /api/cai-dat. Validate min<max cả client lẫn server (belt & braces).

const CaiDatView = (() => {
  let panel;
  let khoaPhongList = [];
  let danhMucQuanLy = {};
  let danhSachQuanLyList = [];

  // Danh mục mã CSKCB / mã GLN (criterion 5) — 2 khối UI giống hệt nhau về
  // hình dạng nên dùng chung 1 hàm render/xử lý, khác nhau qua cfg.
  const DANH_MUC_QUAN_LY_CONFIG = [
    { loai: 'ma_cskcb', prefix: 'mcs', tieuDe: 'Danh mục mã CSKCB',
      moTa: 'Dùng cho ô "Mã CSKCB" ở màn Chi tiết (gợi ý khi gõ). Mã theo '
        + 'quy định hiện hành đã được nạp sẵn.',
      placeholder: 'vd: 8934285050981' },
    { loai: 'ma_gtin_cskcb', prefix: 'mgl', tieuDe: 'Danh mục mã GLN 13 ký tự',
      moTa: 'Dùng cho ô "Mã GLN 13 ký tự" ở màn Chi tiết (gợi ý khi gõ). '
        + 'Danh mục này TRỐNG mặc định — thêm mã khi cần.',
      placeholder: 'vd: 8938502017218' },
  ];

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
      khoaPhongList = await Api.listKhoaPhong();
      danhMucQuanLy = await Api.listDanhMucQuanLy();
      danhSachQuanLyList = await Api.listDanhSach(true);
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

      <div class="cd-row">
        <div class="cd-row-label">Kéo bản mới ngay (không chờ, không cần gõ lệnh)</div>
        <button type="button" id="cd-capnhat-ngay">Cập nhật ngay</button>
      </div>
      <p class="cd-hint">Kiểm tra GitHub và kéo bản mới NGAY LẬP TỨC (không cần
        chờ vòng lặp <code>auto_update.bat</code> hoặc mở CMD). Nếu code
        <b>backend</b> đổi, server Windows tự khởi động lại (~5-10s) — ảnh
        hưởng tạm thời tới MỌI người đang thao tác. Nếu chỉ đổi giao diện
        (JS/CSS), trình duyệt tự tải lại, không cần khởi động lại gì.</p>
      <div id="cd-capnhat-result"></div>

      <h2>Rà soát & tự động phân loại (toàn bộ hồ sơ)</h2>
      <p class="cd-hint">Chạy 1 lần: điền BMI/Phân loại thể lực còn TRỐNG (khi
        đã có chiều cao+cân nặng), nâng Tuần hoàn theo Mạch/Huyết áp, tự thêm
        bệnh chính khi HA cao/mạch bất thường mà chưa có chẩn đoán, nâng Phân
        loại sức khỏe chung lên mức nặng nhất. <b>Chỉ nâng/điền chỗ trống —
        không bao giờ xoá hay ghi đè giá trị đã có.</b> Riêng bước cập nhật
        text "Khám Tuần hoàn" theo lý do CSST Loại II+ là NGOẠI LỆ: có thể
        THAY THẾ "Bình thường" hoặc NỐI THÊM vào nội dung tự do đã có (không
        chỉ điền khi trống). Bấm "Xem trước" để xem số lượng dự kiến trước
        khi Áp dụng.</p>
      <div class="cd-row">
        <button type="button" id="cd-rasoat-preview">Xem trước (dry-run)</button>
        <button type="button" id="cd-rasoat-apply" disabled>Áp dụng</button>
      </div>
      <div id="cd-rasoat-result"></div>

      <h2>Danh mục khoa/phòng</h2>
      <p class="cd-hint">Dùng để gán nhân viên và giao chỉ tiêu số lượng hồ sơ
        theo khoa/phòng (màn Phân công). Không xóa cứng — chỉ vô hiệu hóa.</p>
      <form id="cd-kp-create-form" class="cd-form">
        <div class="cd-row">
          <label>Tên khoa/phòng mới
            <input type="text" id="cd-kp-ten-moi" placeholder="vd: Khám bệnh" required>
          </label>
          <button type="submit">Thêm khoa/phòng</button>
        </div>
      </form>
      <div id="cd-kp-result"></div>
      <table class="nd-table" id="cd-kp-table">
        <thead><tr><th>Tên khoa/phòng</th><th>Trạng thái</th><th>Thao tác</th></tr></thead>
        <tbody id="cd-kp-table-body"></tbody>
      </table>

      <h2>Quản lý danh sách</h2>
      <p class="cd-hint">Tạo/sửa/xóa/ẩn "Danh sách tùy chỉnh" (gom case để xử lý/xuất
        file, xem ở trang Danh sách). Ẩn 1 danh sách sẽ KHÔNG xóa hồ sơ đã có trong
        đó — chỉ ẩn khỏi dropdown "Xem theo danh sách" và popup "Thêm vào danh
        sách" của MỌI người dùng; vẫn quản lý được ở đây và hiện lại bất kỳ lúc nào.</p>
      <form id="cd-ds-create-form" class="cd-form">
        <div class="cd-row">
          <label>Tên danh sách mới
            <input type="text" id="cd-ds-ten-moi" placeholder="vd: DS rà soát tháng 8" required>
          </label>
          <button type="submit">Tạo danh sách</button>
        </div>
      </form>
      <div id="cd-ds-result"></div>
      <table class="nd-table" id="cd-ds-table">
        <thead><tr><th>Tên</th><th>Người tạo</th><th>Số hồ sơ</th><th>Trạng thái</th><th>Thao tác</th></tr></thead>
        <tbody id="cd-ds-table-body"></tbody>
      </table>

      ${DANH_MUC_QUAN_LY_CONFIG.map(renderDanhMucQuanLySection).join('')}
    `;
    panel.querySelector('#cd-form').addEventListener('submit', onSubmit);
    panel.querySelector('#cd-tudong-form').addEventListener('submit', onSubmitTuDong);
    panel.querySelector('#cd-capnhat-ngay').addEventListener('click', onCapNhatNgay);
    panel.querySelector('#cd-rasoat-preview').addEventListener('click', () => onRaSoat(false));
    panel.querySelector('#cd-rasoat-apply').addEventListener('click', () => onRaSoat(true));
    panel.querySelector('#cd-kp-create-form').addEventListener('submit', onKhoaPhongCreate);
    renderKhoaPhongRows();
    panel.querySelector('#cd-ds-create-form').addEventListener('submit', onDanhSachQuanLyCreate);
    renderDanhSachQuanLyRows();
    DANH_MUC_QUAN_LY_CONFIG.forEach((cfg) => {
      panel.querySelector(`#cd-${cfg.prefix}-create-form`)
        .addEventListener('submit', (e) => onDanhMucQuanLyCreate(e, cfg));
      renderDanhMucQuanLyRows(cfg);
    });
  }

  // ---------------- Danh mục mã CSKCB / mã GLN (criterion 5) ----------------
  function renderDanhMucQuanLySection(cfg) {
    return `
      <h2>${esc(cfg.tieuDe)}</h2>
      <p class="cd-hint">${cfg.moTa}</p>
      <form id="cd-${cfg.prefix}-create-form" class="cd-form">
        <div class="cd-row">
          <label>Mã mới
            <input type="text" id="cd-${cfg.prefix}-ten-moi" placeholder="${esc(cfg.placeholder)}" required>
          </label>
          <button type="submit">Thêm mã</button>
        </div>
      </form>
      <div id="cd-${cfg.prefix}-result"></div>
      <table class="nd-table" id="cd-${cfg.prefix}-table">
        <thead><tr><th>Mã</th><th>Thao tác</th></tr></thead>
        <tbody id="cd-${cfg.prefix}-table-body"></tbody>
      </table>
    `;
  }

  function renderDanhMucQuanLyRows(cfg) {
    const tbody = panel.querySelector(`#cd-${cfg.prefix}-table-body`);
    if (!tbody) return;
    tbody.innerHTML = '';
    (danhMucQuanLy[cfg.loai] || []).forEach((row) => {
      const tr = document.createElement('tr');
      tr.innerHTML = `<td>${esc(row.ten)}</td><td class="nd-actions"></td>`;
      const actions = tr.querySelector('.nd-actions');

      const btnXoa = document.createElement('button');
      btnXoa.type = 'button';
      btnXoa.textContent = 'Xóa';
      btnXoa.addEventListener('click', () => onDanhMucQuanLyDelete(row, cfg));
      actions.appendChild(btnXoa);

      tbody.appendChild(tr);
    });
  }

  async function onDanhMucQuanLyCreate(e, cfg) {
    e.preventDefault();
    const resultBox = panel.querySelector(`#cd-${cfg.prefix}-result`);
    const input = panel.querySelector(`#cd-${cfg.prefix}-ten-moi`);
    const ten = input.value.trim();
    if (!ten) return;
    try {
      await Api.createDanhMucQuanLy({ loai: cfg.loai, ten });
      input.value = '';
      resultBox.textContent = 'Đã thêm mã.';
      resultBox.className = 'ok';
      danhMucQuanLy = await Api.listDanhMucQuanLy();
      renderDanhMucQuanLyRows(cfg);
    } catch (err) {
      resultBox.textContent = err.message;
      resultBox.className = 'error';
    }
  }

  async function onDanhMucQuanLyDelete(row, cfg) {
    if (!confirm(`Xóa mã "${row.ten}" khỏi danh mục?`)) return;
    try {
      await Api.deleteDanhMucQuanLy(row.id);
      danhMucQuanLy = await Api.listDanhMucQuanLy();
      renderDanhMucQuanLyRows(cfg);
    } catch (err) {
      alert(err.message);
    }
  }

  // ---------------- Danh mục khoa/phòng (criterion 3) ----------------
  function renderKhoaPhongRows() {
    const tbody = panel.querySelector('#cd-kp-table-body');
    if (!tbody) return;
    tbody.innerHTML = '';
    khoaPhongList.forEach((k) => {
      const tr = document.createElement('tr');
      const trangThaiNhan = k.dang_hoat_dong ? 'Đang hoạt động' : 'Đã vô hiệu hóa';
      tr.innerHTML = `
        <td>${esc(k.ten)}</td>
        <td class="${k.dang_hoat_dong ? 'nd-active' : 'nd-inactive'}">${esc(trangThaiNhan)}</td>
        <td class="nd-actions"></td>
      `;
      const actions = tr.querySelector('.nd-actions');

      const btnSua = document.createElement('button');
      btnSua.type = 'button';
      btnSua.textContent = 'Sửa tên';
      btnSua.addEventListener('click', () => onKhoaPhongSuaTen(k));
      actions.appendChild(btnSua);

      const btnToggle = document.createElement('button');
      btnToggle.type = 'button';
      btnToggle.textContent = k.dang_hoat_dong ? 'Vô hiệu hóa' : 'Kích hoạt';
      btnToggle.addEventListener('click', () => onKhoaPhongToggle(k));
      actions.appendChild(btnToggle);

      tbody.appendChild(tr);
    });
  }

  async function onKhoaPhongCreate(e) {
    e.preventDefault();
    const resultBox = panel.querySelector('#cd-kp-result');
    const input = panel.querySelector('#cd-kp-ten-moi');
    const ten = input.value.trim();
    if (!ten) return;
    try {
      await Api.createKhoaPhong({ ten });
      input.value = '';
      resultBox.textContent = 'Đã thêm khoa/phòng.';
      resultBox.className = 'ok';
      khoaPhongList = await Api.listKhoaPhong();
      renderKhoaPhongRows();
    } catch (err) {
      resultBox.textContent = err.message;
      resultBox.className = 'error';
    }
  }

  async function onKhoaPhongSuaTen(k) {
    const tenMoi = prompt('Tên khoa/phòng mới:', k.ten);
    if (tenMoi === null) return;
    const trimmed = tenMoi.trim();
    if (!trimmed) { alert('Tên khoa/phòng không được để trống'); return; }
    try {
      await Api.patchKhoaPhong(k.id, { ten: trimmed });
      khoaPhongList = await Api.listKhoaPhong();
      renderKhoaPhongRows();
    } catch (err) {
      alert(err.message);
    }
  }

  async function onKhoaPhongToggle(k) {
    const target = k.dang_hoat_dong ? 0 : 1;
    const msg = target
      ? `Kích hoạt lại khoa/phòng "${k.ten}"?`
      : `Vô hiệu hóa khoa/phòng "${k.ten}"? Khoa/phòng này sẽ không còn hiển thị `
        + 'ở các dropdown chọn khoa/phòng đang hoạt động.';
    if (!confirm(msg)) return;
    try {
      await Api.patchKhoaPhong(k.id, { dang_hoat_dong: target });
      khoaPhongList = await Api.listKhoaPhong();
      renderKhoaPhongRows();
    } catch (err) {
      alert(err.message);
    }
  }

  // ---------------- Quản lý danh sách (khối mới) ----------------
  function renderDanhSachQuanLyRows() {
    const tbody = panel.querySelector('#cd-ds-table-body');
    if (!tbody) return;
    tbody.innerHTML = '';
    danhSachQuanLyList.forEach((row) => {
      const tr = document.createElement('tr');
      const trangThaiNhan = row.an ? 'Đã ẩn' : 'Đang hiện';
      tr.innerHTML = `
        <td>${esc(row.ten)}</td>
        <td>${esc(row.nguoi_tao_ten || '—')}</td>
        <td>${esc(row.so_luong)}</td>
        <td class="${row.an ? 'nd-inactive' : 'nd-active'}">${esc(trangThaiNhan)}</td>
        <td class="nd-actions"></td>
      `;
      const actions = tr.querySelector('.nd-actions');

      const btnSua = document.createElement('button');
      btnSua.type = 'button';
      btnSua.textContent = 'Sửa tên';
      btnSua.addEventListener('click', () => onDanhSachQuanLySuaTen(row));
      actions.appendChild(btnSua);

      const btnToggle = document.createElement('button');
      btnToggle.type = 'button';
      btnToggle.textContent = row.an ? 'Hiện' : 'Ẩn';
      btnToggle.addEventListener('click', () => onDanhSachQuanLyToggleAn(row));
      actions.appendChild(btnToggle);

      const btnXoa = document.createElement('button');
      btnXoa.type = 'button';
      btnXoa.textContent = 'Xóa';
      btnXoa.addEventListener('click', () => onDanhSachQuanLyXoa(row));
      actions.appendChild(btnXoa);

      tbody.appendChild(tr);
    });
  }

  async function onDanhSachQuanLyCreate(e) {
    e.preventDefault();
    const resultBox = panel.querySelector('#cd-ds-result');
    const input = panel.querySelector('#cd-ds-ten-moi');
    const ten = input.value.trim();
    if (!ten) return;
    try {
      await Api.createDanhSach({ ten });
      input.value = '';
      resultBox.textContent = 'Đã tạo danh sách.';
      resultBox.className = 'ok';
      danhSachQuanLyList = await Api.listDanhSach(true);
      renderDanhSachQuanLyRows();
    } catch (err) {
      resultBox.textContent = err.message;
      resultBox.className = 'error';
    }
  }

  async function onDanhSachQuanLySuaTen(row) {
    const tenMoi = prompt('Tên danh sách mới:', row.ten);
    if (tenMoi === null) return;
    const trimmed = tenMoi.trim();
    if (!trimmed) { alert('Tên danh sách không được để trống'); return; }
    try {
      await Api.patchDanhSach(row.id, { ten: trimmed });
      danhSachQuanLyList = await Api.listDanhSach(true);
      renderDanhSachQuanLyRows();
    } catch (err) {
      alert(err.message);
    }
  }

  async function onDanhSachQuanLyToggleAn(row) {
    const target = row.an ? 0 : 1;
    const msg = target
      ? `Ẩn danh sách "${row.ten}"? Sẽ không còn hiển thị ở dropdown "Xem theo `
        + 'danh sách" và popup "Thêm vào danh sách" của mọi người dùng — hồ sơ '
        + 'đã có trong danh sách KHÔNG bị ảnh hưởng.'
      : `Hiện lại danh sách "${row.ten}"?`;
    if (!confirm(msg)) return;
    try {
      await Api.patchDanhSach(row.id, { an: target });
      danhSachQuanLyList = await Api.listDanhSach(true);
      renderDanhSachQuanLyRows();
    } catch (err) {
      alert(err.message);
    }
  }

  async function onDanhSachQuanLyXoa(row) {
    if (!confirm(`Xóa danh sách "${row.ten}"? Thao tác này KHÔNG xóa hồ sơ, `
      + 'chỉ xóa danh sách.')) return;
    try {
      await Api.deleteDanhSach(row.id);
      danhSachQuanLyList = await Api.listDanhSach(true);
      renderDanhSachQuanLyRows();
    } catch (err) {
      alert(err.message);
    }
  }

  function fmtRaSoat(kq) {
    return `Quét: <b>${kq.tong_quet}</b> hồ sơ<br>`
      + `Điền BMI còn trống: <b>${kq.dien_bmi}</b><br>`
      + `Điền Phân loại thể lực còn trống: <b>${kq.dien_pl_the_luc}</b><br>`
      + `Nâng Tuần hoàn (theo Mạch/HA): <b>${kq.nang_tuan_hoan}</b><br>`
      + `Nâng lý do "Khám Tuần hoàn" (text, CSST Loại II+): <b>${kq.nang_ly_do_tuan_hoan}</b><br>`
      + `Tự thêm chẩn đoán theo sinh hiệu (I10/R00.0/R00.1): <b>${kq.them_benh_chinh}</b> `
      + `(I10: ${kq.them_benh_chinh_theo_ma['I10']}, `
      + `R00.0: ${kq.them_benh_chinh_theo_ma['R00.0']}, `
      + `R00.1: ${kq.them_benh_chinh_theo_ma['R00.1']})<br>`
      + `— trong đó ĐẶT làm bệnh chính (Tuần hoàn đang nặng nhất): <b>${kq.dat_benh_chinh}</b><br>`
      + `Gỡ cờ "Có phân loại nhưng không có chẩn đoán": <b>${kq.go_co}</b><br>`
      + `Nâng Phân loại sức khỏe chung: <b>${kq.nang_suc_khoe_chung}</b><br>`
      + `Thêm cờ "Vi phạm bất biến QĐ1613" (quét TOÀN BỘ hồ sơ): <b>${kq.them_co_vi_pham}</b><br>`
      + `Gỡ cờ "Vi phạm bất biến QĐ1613" (đã hết vi phạm): <b>${kq.go_co_vi_pham}</b>`;
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

  async function onCapNhatNgay() {
    const resultBox = panel.querySelector('#cd-capnhat-result');
    const btn = panel.querySelector('#cd-capnhat-ngay');
    btn.disabled = true;
    resultBox.className = '';
    resultBox.textContent = 'Đang kiểm tra GitHub...';
    try {
      const r = await Api.capNhatNgay();
      if (!r.ok) {
        resultBox.textContent = `Lỗi: ${r.loi}`;
        resultBox.className = 'error';
      } else if (r.da_moi_nhat) {
        resultBox.textContent = `Đã là bản mới nhất (${r.head}).`;
        resultBox.className = 'ok';
      } else if (r.da_khoi_dong_lai) {
        resultBox.innerHTML = `✅ Đã cập nhật ${r.head_cu} → ${r.head_moi} `
          + `(${r.so_file_doi} file đổi). Code backend đổi — server đang `
          + `<b>khởi động lại</b> (~5-10s), trang này sẽ mất kết nối tạm `
          + `thời rồi phục hồi. Hãy tải lại trang sau ít phút.`;
        resultBox.className = 'ok';
      } else {
        resultBox.innerHTML = `✅ Đã cập nhật ${r.head_cu} → ${r.head_moi} `
          + `(${r.so_file_doi} file đổi) — chỉ giao diện, trình duyệt tự tải `
          + `lại, không cần khởi động lại.` + (r.ghi_chu ? `<br>${r.ghi_chu}` : '');
        resultBox.className = 'ok';
      }
    } catch (err) {
      resultBox.textContent = err.message;
      resultBox.className = 'error';
    } finally {
      btn.disabled = false;
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
