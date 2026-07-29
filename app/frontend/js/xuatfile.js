// xuatfile.js — Pipeline 2: màn hình "Xuất file" (§7 SPEC, admin only).
// Chọn phạm vi -> xem trước số cờ đỏ -> chọn tuỳ chọn -> bắt đầu job nền ->
// polling tiến độ theo xã -> tải file .xlsm + file kê.

const ExportView = (() => {
  let panel, danhMuc;
  let pollTimer = null;
  let cotMoRongList = [];
  const autoDownloaded = new Set();

  function init(panelEl, dm) {
    panel = panelEl;
    danhMuc = dm;
  }

  async function show() {
    if (!cotMoRongList.length) {
      try { cotMoRongList = await Api.xuatFileCotMoRong(); } catch (e) { cotMoRongList = []; }
    }
    render();
    wire();
    refreshJobList();
    refreshBackupList();
  }

  function render() {
    const xaOptions = (danhMuc.xa || []).map((x) => `<option value="${x.ma}">${x.ten}</option>`).join('');
    const ttOptions = (danhMuc.trang_thai || []).map((x) => `<option value="${x.ma}">${x.ten}</option>`).join('');
    const cotOptions = cotMoRongList.map((c) => `
      <label class="ext-col"><input type="checkbox" class="ext-col-check" value="${c.ma}"> ${c.ten} (${c.ma})</label>
    `).join('');

    panel.innerHTML = `
      <h2>Xuất file .xlsm nộp Bộ Y tế</h2>

      <div class="xf-block">
        <div class="xf-label">1. Chọn phạm vi</div>
        <div class="xf-scope-radios">
          <label><input type="radio" name="xf-pham-vi" value="toan_bo" checked> Toàn bộ</label>
          <label><input type="radio" name="xf-pham-vi" value="xa"> Theo xã/phường</label>
          <label><input type="radio" name="xf-pham-vi" value="can_bo"> Theo nhân viên</label>
          <label><input type="radio" name="xf-pham-vi" value="trang_thai"> Theo trạng thái</label>
          <label><input type="radio" name="xf-pham-vi" value="chon_tay"> Chọn tay (danh sách mã hồ sơ)</label>
          <label><input type="radio" name="xf-pham-vi" value="danh_sach"> Theo danh sách</label>
        </div>
        <div id="xf-scope-value">
          <select id="xf-val-xa" multiple hidden size="6">${xaOptions}</select>
          <select id="xf-val-can-bo" multiple hidden size="6"></select>
          <select id="xf-val-trang-thai" multiple hidden size="4">${ttOptions}</select>
          <textarea id="xf-val-chon-tay" hidden placeholder="Mỗi mã hồ sơ 1 dòng, hoặc cách nhau bởi dấu phẩy&#10;vd: 31006-2026-00001"></textarea>
          <select id="xf-val-danh-sach" multiple hidden size="6"></select>
        </div>
      </div>

      <div class="xf-block">
        <button id="xf-preview-btn" type="button">Xem trước</button>
        <div id="xf-preview-box"></div>
      </div>

      <div class="xf-block">
        <label class="xf-toggle"><input type="checkbox" id="xf-chi-rs-xong">
          Chỉ xuất hồ sơ đã rà soát xong (đủ 4 mục ở panel chi tiết) — mặc định TẮT</label>
      </div>

      <div class="xf-block">
        <label class="xf-toggle"><input type="checkbox" id="xf-include-errors">
          Xuất kèm cả hồ sơ lỗi (còn cờ 🔴) — mặc định TẮT</label>
      </div>

      <div class="xf-block">
        <label class="xf-toggle"><input type="checkbox" id="xf-extended-enabled">
          Thêm cột mở rộng (từ cột 104) — mặc định TẮT</label>
        <div id="xf-extended-warning" class="xf-warning" hidden>
          ⚠ File có cột mở rộng — KHÔNG nộp Bộ được
        </div>
        <div id="xf-extended-cols" class="xf-ext-cols" hidden>${cotOptions}</div>
      </div>

      <div class="xf-block xf-btn-row">
        <button id="xf-start-btn" type="button">Bắt đầu xuất .xlsm (nộp Bộ)</button>
        <button id="xf-edit-btn" type="button">Tải .xlsx (kèm mã định danh)</button>
        <span id="xf-edit-status" class="xf-plain-status"></span>
      </div>

      <div class="xf-block xf-roundtrip-block">
        <div class="xf-label">Nhập lại file đã chỉnh sửa</div>
        <p class="xf-hint">Dùng file vừa tải ở nút phía trên — sửa/bổ sung dữ liệu
          (GIỮ NGUYÊN cột mã định danh), rồi chọn file bên dưới để nhập lại.</p>

        <div class="xf-ds-import">
          <label class="xf-ds-filelbl">Nhập lại file đã sửa:
            <input type="file" id="xf-ds-file" accept=".xlsx">
          </label>
          <span class="xf-hint">Ô để trống = bỏ qua (không xóa dữ liệu cũ).</span>
          <div id="xf-ds-result" class="xf-ds-result"></div>
        </div>
      </div>

      <div class="xf-block xf-roundtrip-block">
        <div class="xf-label">Ghi chú rà soát</div>
        <p class="xf-hint">Tải lên file đã xuất từ nút &ldquo;Xuất Excel&rdquo;
          (khối &ldquo;Nhập lại file đã chỉnh sửa&rdquo; ở trên) — hệ thống tự
          ghi tóm tắt các thay đổi (Bổ sung/Ghi đè) vào trường &ldquo;Ghi chú
          rà soát (hệ thống)&rdquo; của từng hồ sơ tương ứng.</p>

        <div class="xf-ds-import">
          <label class="xf-ds-filelbl">Chọn file đối soát đã xuất:
            <input type="file" id="xf-gcrs-file" accept=".xlsx">
          </label>
          <div id="xf-gcrs-result" class="xf-ds-result"></div>
        </div>
      </div>

      <div class="xf-block xf-cmd-block">
        <div class="xf-label">✅ Xuất .xlsm chuẩn Bộ — đã sẵn sàng</div>
        <p class="xf-hint">Hệ thống đang chạy trực tiếp trên máy chủ nội bộ nên
          nút <b>&ldquo;Bắt đầu xuất .xlsm (nộp Bộ)&rdquo;</b> ở trên tạo ngay
          file .xlsm chuẩn Bộ (kèm dropdown &amp; VBA từ template chính thức),
          phản ánh ĐÚNG dữ liệu nhân viên vừa rà soát. Chọn phạm vi → bấm nút
          xanh → tải file trong mục &ldquo;Các lần xuất gần đây&rdquo; bên dưới.
          Không cần chạy lệnh Terminal hay kết nối gì thêm.</p>
      </div>

      <div id="xf-job-progress"></div>

      <h3>Các lần xuất gần đây</h3>
      <div id="xf-job-history"></div>

      <div class="xf-block xf-backup-block">
        <div class="xf-label">Sao lưu &amp; khôi phục dữ liệu (local)</div>
        <p class="xf-hint">Ngoài sao lưu tự động (chỉnh ở trang Cài đặt), có
          thể sao lưu NGAY LẬP TỨC ở đây. Khôi phục sẽ GHI ĐÈ dữ liệu hiện tại
          của TOÀN BỘ hệ thống (ảnh hưởng mọi người đang dùng) — hệ thống LUÔN
          tự tạo 1 bản an toàn của dữ liệu hiện tại trước khi ghi đè, để hoàn
          tác được nếu chọn nhầm.</p>
        <button id="xf-backup-create-btn" type="button">Tạo bản sao lưu ngay</button>
        <span id="xf-backup-create-status" class="xf-plain-status"></span>
        <table class="dash-table xf-backup-table">
          <thead><tr><th>Tên file</th><th>Thời gian</th><th>Kích thước</th><th></th></tr></thead>
          <tbody id="xf-backup-list-body"><tr><td colspan="4">Đang tải...</td></tr></tbody>
        </table>
      </div>
    `;
  }

  function currentScope() {
    const pham_vi = panel.querySelector('input[name="xf-pham-vi"]:checked').value;
    let gia_tri = [];
    if (pham_vi === 'xa') {
      gia_tri = Array.from(panel.querySelector('#xf-val-xa').selectedOptions).map((o) => o.value);
    } else if (pham_vi === 'can_bo') {
      gia_tri = Array.from(panel.querySelector('#xf-val-can-bo').selectedOptions).map((o) => o.value);
    } else if (pham_vi === 'trang_thai') {
      gia_tri = Array.from(panel.querySelector('#xf-val-trang-thai').selectedOptions).map((o) => o.value);
    } else if (pham_vi === 'chon_tay') {
      gia_tri = panel.querySelector('#xf-val-chon-tay').value
        .split(/[\n,]/).map((s) => s.trim()).filter(Boolean);
    } else if (pham_vi === 'danh_sach') {
      gia_tri = Array.from(panel.querySelector('#xf-val-danh-sach').selectedOptions).map((o) => o.value);
    }
    return { pham_vi, gia_tri };
  }

  function wire() {
    panel.querySelectorAll('input[name="xf-pham-vi"]').forEach((r) => {
      r.addEventListener('change', updateScopeVisibility);
    });
    updateScopeVisibility();

    Api.listNguoiDung().then((users) => {
      const sel = panel.querySelector('#xf-val-can-bo');
      users.filter((u) => u.vai_tro === 'ra_soat').forEach((u) => {
        const o = document.createElement('option'); o.value = u.id; o.textContent = u.ho_ten;
        sel.appendChild(o);
      });
    }).catch(() => {});

    // Scope "Theo danh sách" — nạp "Danh sách tùy chỉnh", đúng khuôn
    // Api.listNguoiDung() nạp #xf-val-can-bo ở trên.
    Api.listDanhSach().then((list) => {
      const sel = panel.querySelector('#xf-val-danh-sach');
      list.forEach((ds) => {
        const o = document.createElement('option');
        o.value = String(ds.id); o.textContent = `${ds.ten} (${ds.so_luong})`;
        sel.appendChild(o);
      });
    }).catch(() => {});

    panel.querySelector('#xf-preview-btn').addEventListener('click', doPreview);
    panel.querySelector('#xf-start-btn').addEventListener('click', doStart);
    panel.querySelector('#xf-edit-btn').addEventListener('click', doExportChinhSua);
    panel.querySelector('#xf-ds-file').addEventListener('change', doDoiSoatPreview);
    panel.querySelector('#xf-gcrs-file').addEventListener('change', doGhiChuRaSoatPreview);
    panel.querySelector('#xf-backup-create-btn').addEventListener('click', doBackupCreate);

    const extToggle = panel.querySelector('#xf-extended-enabled');
    extToggle.addEventListener('change', () => {
      panel.querySelector('#xf-extended-warning').hidden = !extToggle.checked;
      panel.querySelector('#xf-extended-cols').hidden = !extToggle.checked;
    });
  }

  function updateScopeVisibility() {
    const pham_vi = panel.querySelector('input[name="xf-pham-vi"]:checked').value;
    panel.querySelector('#xf-val-xa').hidden = pham_vi !== 'xa';
    panel.querySelector('#xf-val-can-bo').hidden = pham_vi !== 'can_bo';
    panel.querySelector('#xf-val-trang-thai').hidden = pham_vi !== 'trang_thai';
    panel.querySelector('#xf-val-chon-tay').hidden = pham_vi !== 'chon_tay';
    panel.querySelector('#xf-val-danh-sach').hidden = pham_vi !== 'danh_sach';
  }

  function xfLoadingHtml(text) {
    return `<div class="xf-loading"><span class="spinner"></span> ${esc(text)}</div>`;
  }

  async function doPreview() {
    const box = panel.querySelector('#xf-preview-box');
    const btn = panel.querySelector('#xf-preview-btn');
    box.innerHTML = xfLoadingHtml('Đang tính...');
    btn.disabled = true;
    try {
      const scope = currentScope();
      const res = await Api.xuatFilePreview({ ...scope, ...currentOptions() });
      box.innerHTML = `
        <div class="xf-preview-stats">
          Tổng trong phạm vi: <b>${res.tong}</b> &nbsp;|&nbsp;
          Còn cờ 🔴: <b class="xf-red">${res.do_flag_count}</b> &nbsp;|&nbsp;
          Sẽ xuất: <b class="xf-ok">${res.se_xuat}</b> &nbsp;|&nbsp;
          Sẽ loại trừ: <b>${res.se_loai_tru}</b>
        </div>`;
    } catch (err) {
      box.innerHTML = `<div class="xf-error">${esc(err.message)}</div>`;
    } finally {
      btn.disabled = false;
    }
  }

  function currentOptions() {
    return {
      include_errors: panel.querySelector('#xf-include-errors').checked,
      chi_rs_xong: panel.querySelector('#xf-chi-rs-xong').checked,
    };
  }

  async function doStart() {
    const scope = currentScope();
    const extEnabled = panel.querySelector('#xf-extended-enabled').checked;
    const columns = extEnabled
      ? Array.from(panel.querySelectorAll('.ext-col-check:checked')).map((c) => c.value)
      : [];
    const startBtn = panel.querySelector('#xf-start-btn');
    const progressBox = panel.querySelector('#xf-job-progress');
    // Phản hồi anh Khôi: bấm nút KHÔNG có hiệu ứng gì trong lúc server đang
    // đọc/tính toán phạm vi (có thể mất vài giây với "Toàn bộ" ~13000 hồ sơ)
    // trước khi job thật sự bắt đầu chạy nền — dễ tưởng nhầm là bị treo/lỗi.
    // Hiện spinner + đổi nhãn nút NGAY khi bấm, trước khi chờ phản hồi.
    startBtn.disabled = true;
    const nhanCu = startBtn.textContent;
    startBtn.textContent = '⏳ Đang chuẩn bị...';
    progressBox.innerHTML = xfLoadingHtml('Đang đọc dữ liệu & chuẩn bị job xuất file — với phạm vi lớn có thể mất vài giây...');
    try {
      const job = await Api.xuatFileStart({
        ...scope, ...currentOptions(), extended: { enabled: extEnabled, columns },
      });
      renderJob(job, { autoDownload: true });
      startPolling(job.id);
      startBtn.textContent = nhanCu;
    } catch (err) {
      progressBox.innerHTML = `<div class="xf-error xf-error-big">❌ Lỗi khi bắt đầu xuất file: ${esc(err.message)}</div>`;
      startBtn.textContent = nhanCu;
    } finally {
      startBtn.disabled = false;
      // Phản hồi anh Khôi: nút quay lại bình thường KHÔNG có nghĩa là không
      // có gì xảy ra — khung tiến độ/lỗi nằm NGAY BÊN DƯỚI, tự cuộn tới đó
      // để không ai tưởng nhầm là "bấm không phản hồi" rồi bỏ qua.
      progressBox.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  }

  async function doExportChinhSua() {
    const scope = currentScope();
    const btn = panel.querySelector('#xf-edit-btn');
    const status = panel.querySelector('#xf-edit-status');
    btn.disabled = true;
    status.textContent = ' Đang tạo file ...';
    status.className = 'xf-plain-status';
    try {
      const { blob, name } = await Api.xuatFileXlsxChinhSua({ ...scope, ...currentOptions() });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = name;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 4000);
      status.textContent = ` Đã tải: ${name}`;
      status.className = 'xf-plain-status ok';
    } catch (err) {
      status.textContent = ' ' + err.message;
      status.className = 'xf-plain-status error';
    } finally {
      btn.disabled = false;
    }
  }

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"]/g, (c) => (
      { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  }

  // Chọn file -> XEM TRƯỚC đối soát (không ghi, dùng TẤT CẢ cột phát hiện
  // được lần đầu). Giữ file để bấm "Cập nhật xem trước" / "Áp dụng".
  async function doDoiSoatPreview(e) {
    const file = e.target.files[0];
    const box = panel.querySelector('#xf-ds-result');
    if (!file) { box.innerHTML = ''; return; }
    box.innerHTML = '<div class="xf-hint">Đang đọc file & đối soát ...</div>';
    try {
      const r = await Api.nhapDoiSoat(file, false, false);
      renderDoiSoat(r, file, null, null);
    } catch (err) {
      // Đợt 16 (phản hồi anh Khôi): file có ≥2 sheet -> server KHÔNG tự
      // đoán nữa (trước đây đoán nhầm sheet gây đối soát sai, vd ghi đè
      // Ngày sinh thật thành 01/01 ước lượng) — bắt buộc hỏi user chọn.
      if (err.status === 409 && err.data && err.data.detail && err.data.detail.sheet_list) {
        renderChonSheet(err.data.detail.sheet_list, file, box);
        return;
      }
      box.innerHTML = `<div class="xf-error">${esc(err.message)}</div>`;
    }
  }

  function renderChonSheet(sheetList, file, box) {
    box.innerHTML = `
      <div class="xf-ds-warn">⚠ File có ${sheetList.length} sheet — chọn đúng sheet chứa
        dữ liệu cần đối soát (chọn nhầm có thể đối soát nhầm dữ liệu):</div>
      <div class="xf-ds-cot">
        ${sheetList.map((s, i) => `
          <label class="xf-ds-cot-item" style="display:block;margin-bottom:4px">
            <input type="radio" name="xf-ds-sheet" value="${esc(s)}" ${i === 0 ? 'checked' : ''}> ${esc(s)}
          </label>`).join('')}
      </div>
      <button type="button" id="xf-ds-sheet-continue">Tiếp tục</button>
    `;
    panel.querySelector('#xf-ds-sheet-continue').addEventListener('click', async () => {
      const chosen = panel.querySelector('input[name="xf-ds-sheet"]:checked');
      if (!chosen) return;
      box.innerHTML = '<div class="xf-hint">Đang đọc file & đối soát ...</div>';
      try {
        const r = await Api.nhapDoiSoat(file, false, false, null, chosen.value);
        renderDoiSoat(r, file, null, chosen.value);
      } catch (err) {
        box.innerHTML = `<div class="xf-error">${esc(err.message)}</div>`;
      }
    });
  }

  // Đợt 16 (phản hồi anh Khôi): liệt kê CỘT PHÁT HIỆN ĐƯỢC trong file, cho
  // user chọn cột nào muốn cập nhật (mặc định chọn hết) — bỏ chọn cột nào
  // thì cột đó bị XEM NHƯ KHÔNG CÓ trong file (kể cả có giá trị khác DB).
  // Đổi chọn cột -> tự động ĐỐI SOÁT LẠI (gọi lại server, không tính tay ở
  // client) để tổng số bổ sung/ghi đè luôn chính xác cho MỌI dòng, không chỉ
  // 100 dòng mẫu hiển thị. `selected`: Set tên field đang chọn, null = lần
  // đầu (chưa ai bấm gì) -> dùng nguyên r.cot_phat_hien (tất cả).
  function renderDoiSoat(r, file, selected, sheetChon) {
    const box = panel.querySelector('#xf-ds-result');
    const cotList = r.cot_phat_hien || [];
    if (!selected) selected = new Set(cotList.map((c) => c.field));

    const cotBox = cotList.length ? `
      <div class="xf-ds-cot">
        <div class="xf-ds-cot-title">Cột phát hiện được trong file — chọn cột muốn cập nhật:</div>
        <div class="xf-ds-cot-actions">
          <button type="button" id="xf-ds-cot-all">Chọn tất cả</button>
          <button type="button" id="xf-ds-cot-none">Bỏ chọn tất cả</button>
        </div>
        <div class="xf-ds-cot-list">
          ${cotList.map((c) => `
            <label class="xf-ds-cot-item">
              <input type="checkbox" class="xf-ds-cot-cb" value="${esc(c.field)}" ${selected.has(c.field) ? 'checked' : ''}>
              ${esc(c.nhan)}
            </label>`).join('')}
        </div>
      </div>` : '';

    // Đợt 19 (phản hồi anh Khôi): checkbox chọn/bỏ TỪNG DÒNG (mặc định
    // checked) — dòng bị bỏ tick sẽ KHÔNG được ghi khi bấm "Áp dụng thay
    // đổi" (xem doDoiSoatApply). Badge "Danh sách" tái dùng .ds-tag/
    // .ds-tag-empty đã có ở list.js/app.css — KHÔNG nhầm với .xf-ds-tag
    // (nhãn "Bổ sung"/"Ghi đè" ở trên).
    // Đợt 20 (phản hồi anh Khôi): dạng THẺ (mỗi hồ sơ 1 khối <div>) đổi sang
    // dạng BẢNG — mỗi thay đổi 1 <tr>, 4 ô đầu (checkbox/mã/họ tên/danh
    // sách) dùng rowspan gộp theo hồ sơ để không lặp lại N lần.
    const rowsHtml = (r.chi_tiet || []).slice(0, 100).map((row) => {
      const dsBadges = (row._danh_sach && row._danh_sach.length)
        ? row._danh_sach.map((ten) => `<span class="ds-tag">${esc(ten)}</span>`).join('')
        : '<span class="ds-tag-empty">–</span>';
      const n = row.changes.length;
      const chTd = (c) => `
          <td class="xf-ds-${c.loai}"><span class="xf-ds-tag">${c.loai === 'bo_sung' ? 'Bổ sung' : 'Ghi đè'}</span></td>
          <td>${esc(c.nhan)}</td>
          <td>${c.loai === 'ghi_de' ? `<span class="xf-ds-old">${esc(c.cu) || '(trống)'}</span>` : ''}</td>
          <td><span class="xf-ds-new">${esc(c.moi)}</span></td>`;
      const firstRow = `<tr>
          <td rowspan="${n}"><input type="checkbox" class="xf-ds-row-cb" value="${esc(row.ma_ho_so)}" checked></td>
          <td rowspan="${n}">${esc(row.ma_ho_so)}</td>
          <td rowspan="${n}">${esc(row.ho_ten)}</td>
          <td rowspan="${n}">${dsBadges}</td>${chTd(row.changes[0])}
        </tr>`;
      const restRows = row.changes.slice(1).map((c) => `<tr>${chTd(c)}</tr>`).join('');
      return firstRow + restRows;
    }).join('');
    const rows = rowsHtml ? `
      <table class="xf-ds-table">
        <thead><tr>
          <th></th><th>Mã hồ sơ</th><th>Họ tên</th><th>Danh sách</th>
          <th>Loại</th><th>Trường</th><th>Giá trị cũ</th><th>Giá trị mới</th>
        </tr></thead>
        <tbody>${rowsHtml}</tbody>
      </table>` : '';
    const coThayDoi = (r.so_bo_sung + r.so_ghi_de) > 0;
    const khongKhopBox = r.so_khong_khop
      ? `<div class="xf-ds-warn">⚠ ${r.so_khong_khop} dòng KHÔNG khớp mã định danh — sẽ bỏ qua${r.khong_khop.length ? ' (vd: ' + esc(r.khong_khop.slice(0, 3).join(', ')) + ')' : ''}.</div>`
      : '';
    box.innerHTML = `
      ${cotBox}
      <div class="xf-ds-summary">
        Khớp <b>${r.so_khop}</b> dòng · Bổ sung <b class="xf-ok">${r.so_bo_sung}</b> ô ·
        Ghi đè <b class="xf-red">${r.so_ghi_de}</b> ô${r.so_khong_khop ? ` · Không khớp <b>${r.so_khong_khop}</b>` : ''}
      </div>
      ${khongKhopBox}
      ${coThayDoi ? `
        <div class="xf-ds-detail">${rows}${r.chi_tiet.length > 100 ? '<div class="xf-hint">... (chỉ hiện 100 hồ sơ đầu — bấm "Xuất Excel" bên dưới để xem đầy đủ)</div>' : ''}</div>
        <div class="xf-ds-apply">
          ${r.so_ghi_de ? `<label class="xf-toggle"><input type="checkbox" id="xf-ds-ghide"> Cho phép <b>ghi đè ${r.so_ghi_de} ô đã có dữ liệu</b> (thao tác ghi đè được ghi nhật ký)</label>` : ''}
          <button id="xf-ds-apply-btn" type="button">Áp dụng thay đổi</button>
          <span id="xf-ds-apply-status" class="xf-plain-status"></span>
          <button id="xf-ds-xuat-excel-btn" type="button">Xuất Excel</button>
          <span id="xf-ds-xuat-excel-status" class="xf-plain-status"></span>
        </div>`
        : (cotList.length ? '<div class="xf-hint">Không có thay đổi nào để áp dụng (với các cột đang chọn).</div>' : '')}
    `;
    if (coThayDoi) {
      panel.querySelector('#xf-ds-apply-btn').addEventListener('click',
        () => doDoiSoatApply(file, layCotDangChon(), sheetChon));
      panel.querySelector('#xf-ds-xuat-excel-btn').addEventListener('click',
        () => doXuatDoiSoatExcel(file, layCotDangChon(), sheetChon));
    }

    function layCotDangChon() {
      return Array.from(panel.querySelectorAll('.xf-ds-cot-cb:checked')).map((cb) => cb.value);
    }
    async function doiSoatLai() {
      const cotMoi = new Set(layCotDangChon());
      box.innerHTML = '<div class="xf-hint">Đang đối soát lại theo cột đã chọn ...</div>';
      try {
        const r2 = await Api.nhapDoiSoat(file, false, false, Array.from(cotMoi), sheetChon);
        renderDoiSoat(r2, file, cotMoi, sheetChon);
      } catch (err) {
        box.innerHTML = `<div class="xf-error">${esc(err.message)}</div>`;
      }
    }
    if (cotList.length) {
      panel.querySelectorAll('.xf-ds-cot-cb').forEach((cb) => cb.addEventListener('change', doiSoatLai));
      panel.querySelector('#xf-ds-cot-all').addEventListener('click', () => {
        panel.querySelectorAll('.xf-ds-cot-cb').forEach((cb) => { cb.checked = true; });
        doiSoatLai();
      });
      panel.querySelector('#xf-ds-cot-none').addEventListener('click', () => {
        panel.querySelectorAll('.xf-ds-cot-cb').forEach((cb) => { cb.checked = false; });
        doiSoatLai();
      });
    }
  }

  async function doDoiSoatApply(file, cot, sheetChon) {
    const btn = panel.querySelector('#xf-ds-apply-btn');
    const status = panel.querySelector('#xf-ds-apply-status');
    const ghideEl = panel.querySelector('#xf-ds-ghide');
    const choGhiDe = !!(ghideEl && ghideEl.checked);
    // Dòng bị bỏ tick ở checkbox đầu dòng (mặc định checked) -> loại khỏi
    // lần áp dụng này (Đợt 19, phản hồi anh Khôi).
    const maLoaiTru = Array.from(panel.querySelectorAll('.xf-ds-row-cb:not(:checked)')).map((cb) => cb.value);
    if (!cot || !cot.length) {
      status.textContent = ' Chưa chọn cột nào để cập nhật.';
      status.className = 'xf-plain-status error';
      return;
    }
    if (!confirm(`Áp dụng thay đổi cho ${cot.length} cột đã chọn${maLoaiTru.length ? `, bỏ qua ${maLoaiTru.length} dòng đã bỏ tick` : ''}?\n\n- Bổ sung dữ liệu mới cho các ô đang trống.\n- ${choGhiDe ? 'CÓ ghi đè các ô đã có dữ liệu (khác giá trị).' : 'KHÔNG ghi đè ô đã có dữ liệu.'}\n\nThao tác được ghi nhật ký.`)) return;
    btn.disabled = true;
    status.textContent = ' Đang ghi ...';
    status.className = 'xf-plain-status';
    try {
      const r = await Api.nhapDoiSoat(file, true, choGhiDe, cot, sheetChon, maLoaiTru);
      status.textContent = ` Đã ghi: ${r.da_ghi_bo_sung} bổ sung, ${r.da_ghi_ghi_de} ghi đè.`
        + (r.loi_validate && r.loi_validate.length ? ` (${r.loi_validate.length} ô bị bỏ do sai ngưỡng/định dạng)` : '');
      status.className = 'xf-plain-status ok';
      btn.textContent = 'Đã áp dụng ✓';
    } catch (err) {
      status.textContent = ' ' + err.message;
      status.className = 'xf-plain-status error';
      btn.disabled = false;
    }
  }

  // Đợt 20 (phản hồi anh Khôi): xuất TOÀN BỘ danh sách thay đổi ra .xlsx để
  // kiểm tra kỹ hơn (khác "Áp dụng thay đổi" — KHÔNG ghi gì vào DB, chỉ
  // đọc, nên KHÔNG cần confirm()). Hoạt động độc lập với nút "Áp dụng".
  async function doXuatDoiSoatExcel(file, cot, sheetChon) {
    const btn = panel.querySelector('#xf-ds-xuat-excel-btn');
    const status = panel.querySelector('#xf-ds-xuat-excel-status');
    const maLoaiTru = Array.from(panel.querySelectorAll('.xf-ds-row-cb:not(:checked)')).map((cb) => cb.value);
    btn.disabled = true;
    status.textContent = ' Đang tạo file...';
    status.className = 'xf-plain-status';
    try {
      const { blob, name } = await Api.xuatDoiSoatXlsx(file, cot, sheetChon, maLoaiTru);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = name;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 4000);
      status.textContent = ` Đã tải: ${name}`;
      status.className = 'xf-plain-status ok';
    } catch (err) {
      status.textContent = ' ' + err.message;
      status.className = 'xf-plain-status error';
    } finally {
      btn.disabled = false;
    }
  }

  // ---- Ghi chú rà soát: nhập lại file "Đối soát" (nút "Xuất Excel" ở khối
  // trên) -> ghép các dòng thay đổi của TỪNG hồ sơ thành 1 đoạn ghi chú,
  // APPEND vào "Ghi chú rà soát (hệ thống)". Chọn file -> xem trước ngay
  // (ap_dung=false, mẫu doDoiSoatPreview) -> bấm "Áp dụng" -> ghi thật. ----
  async function doGhiChuRaSoatPreview(e) {
    const file = e.target.files[0];
    const box = panel.querySelector('#xf-gcrs-result');
    if (!file) { box.innerHTML = ''; return; }
    box.innerHTML = '<div class="xf-hint">Đang đọc file...</div>';
    try {
      const r = await Api.ghiChuRaSoat(file, false);
      renderGhiChuRaSoat(r, file);
    } catch (err) {
      box.innerHTML = `<div class="xf-error">${esc(err.message)}</div>`;
    }
  }

  function renderGhiChuRaSoat(r, file) {
    const box = panel.querySelector('#xf-gcrs-result');
    const soKhop = r.tong_ma_ho_so - r.so_khong_khop;
    const khongKhopBox = r.so_khong_khop
      ? `<div class="xf-ds-warn">⚠ ${r.so_khong_khop} mã hồ sơ KHÔNG khớp CSDL — sẽ bỏ qua${r.khong_khop.length ? ' (vd: ' + esc(r.khong_khop.slice(0, 3).join(', ')) + ')' : ''}.</div>`
      : '';
    const rowsHtml = (r.chi_tiet || []).slice(0, 100).map((c) => `
      <div class="xf-ds-row">
        <div class="xf-ds-ma">${esc(c.ma_ho_so)} — ${esc(c.ho_ten)}
          <span class="xf-ds-tag" style="background:#dbeafe;color:#1d4ed8">${c.so_dong_thay_doi} thay đổi</span></div>
        <pre class="pl-muc-dk">${esc(c.noi_dung_them)}</pre>
      </div>`).join('');
    const chiTietBox = rowsHtml ? `
      <div class="xf-ds-detail">${rowsHtml}${(r.chi_tiet || []).length > 100 ? '<div class="xf-hint">... (chỉ hiện 100 hồ sơ đầu)</div>' : ''}</div>` : '';
    box.innerHTML = `
      <div class="xf-ds-summary">
        Tổng mã hồ sơ trong file: <b>${r.tong_ma_ho_so}</b> · Khớp CSDL: <b class="xf-ok">${soKhop}</b>
        ${r.so_khong_khop ? ` · Không khớp: <b class="xf-red">${r.so_khong_khop}</b>` : ''}<br>
        Sẽ ghi: <b class="xf-ok">${r.so_luong_ghi}</b> hồ sơ
        ${r.bo_qua_trung ? ` · Bỏ qua (đã có ghi chú trùng): <b>${r.bo_qua_trung}</b>` : ''}
      </div>
      ${khongKhopBox}
      ${chiTietBox}
      ${r.so_luong_ghi > 0 ? `
        <div class="xf-ds-apply">
          <button id="xf-gcrs-apply-btn" type="button">Áp dụng — ghi vào Ghi chú rà soát</button>
          <span id="xf-gcrs-apply-status" class="xf-plain-status"></span>
        </div>` : (r.tong_ma_ho_so ? '<div class="xf-hint">Không có hồ sơ nào cần ghi (đã trùng hết hoặc không khớp CSDL).</div>' : '')}
    `;
    if (r.so_luong_ghi > 0) {
      panel.querySelector('#xf-gcrs-apply-btn').addEventListener('click', () => doGhiChuRaSoatApply(file, r.so_luong_ghi));
    }
  }

  async function doGhiChuRaSoatApply(file, soLuongGhi) {
    const btn = panel.querySelector('#xf-gcrs-apply-btn');
    const status = panel.querySelector('#xf-gcrs-apply-status');
    if (!confirm(`Ghi tóm tắt thay đổi vào "Ghi chú rà soát (hệ thống)" cho ${soLuongGhi} hồ sơ?\n\nThao tác GHÉP THÊM vào ghi chú hiện có (không xóa nội dung cũ), được ghi nhật ký.`)) return;
    btn.disabled = true;
    status.textContent = ' Đang ghi...';
    status.className = 'xf-plain-status';
    try {
      const r = await Api.ghiChuRaSoat(file, true);
      status.textContent = ` Đã ghi ${r.so_luong_ghi} hồ sơ, bỏ qua ${r.bo_qua_trung} trùng${r.so_khong_khop ? `, ${r.so_khong_khop} không khớp` : ''}.`;
      status.className = 'xf-plain-status ok';
      btn.textContent = 'Đã áp dụng ✓';
    } catch (err) {
      status.textContent = ' ' + err.message;
      status.className = 'xf-plain-status error';
      btn.disabled = false;
    }
  }

  function startPolling(jobId) {
    if (pollTimer) clearInterval(pollTimer);
    pollTimer = setInterval(async () => {
      try {
        const job = await Api.xuatFileJob(jobId);
        renderJob(job, { autoDownload: true });
        if (job.status === 'done' || job.status === 'error') {
          clearInterval(pollTimer);
          pollTimer = null;
          refreshJobList();
        }
      } catch (e) {
        clearInterval(pollTimer);
        pollTimer = null;
      }
    }, 1500);
  }

  function statusLabel(s) {
    return { queued: 'Chờ xử lý', running: 'Đang chạy', done: 'Xong', error: 'Có lỗi' }[s] || s;
  }

  function triggerDownload(path, ten) {
    const a = document.createElement('a');
    a.href = `/api/xuat-file/download?path=${encodeURIComponent(path)}`;
    a.download = ten || '';
    document.body.appendChild(a);
    a.click();
    a.remove();
  }

  // Đợt 18 (phản hồi anh Khôi): gộp 1 file .xlsm duy nhất (không tách theo
  // xã), UI tối giản — chỉ icon + % trong lúc chạy, xong thì TỰ ĐỘNG tải
  // file (trình duyệt tự hỏi nơi lưu như tải 1 file bình thường), không hiện
  // bảng chi tiết từng xã/log dài như trước. `autoDownload` chỉ bật khi gọi
  // từ doStart/polling (job MỚI chạy) — xem lại lịch sử ("Xem") không tự tải
  // lại file cũ.
  function renderJob(job, opts) {
    opts = opts || {};
    const box = panel.querySelector('#xf-job-progress');
    // Phòng trường hợp server đang chạy CODE CŨ chưa kịp khởi động lại (vẫn
    // tách nhiều file .xlsm theo xã) trong khi trình duyệt đã tải JS mới —
    // tải HẾT mọi file .xlsm trả về, không chỉ file đầu tiên (tránh chỉ
    // nhận được 1 phường/xã).
    const xlsmList = (job.files || []).filter((f) => f.loai === 'xlsm');
    const ke = (job.files || []).find((f) => f.loai === 'file_ke');

    if (opts.autoDownload && job.status === 'done' && xlsmList.length && !autoDownloaded.has(job.id)) {
      autoDownloaded.add(job.id);
      xlsmList.forEach((f, i) => setTimeout(() => triggerDownload(f.duong_dan, f.ten), i * 400));
    }

    let body;
    if (job.status === 'queued' || job.status === 'running') {
      const pct = job.progress_percent || 0;
      body = `
        <div class="xf-loading"><span class="spinner"></span> Đang xuất... <b>${pct}%</b></div>
        <div class="xf-progress-bar"><div class="xf-progress-fill" style="width:${pct}%"></div></div>
        <div class="xf-hint">% là ước tính theo thời gian, không phải số dòng thực đã ghi.</div>
      `;
    } else if (job.status === 'error') {
      const logLines = (job.log || []).slice(-15).join('\n');
      body = `
        <div class="xf-error xf-error-big">❌ Xuất file THẤT BẠI — báo lại nội dung lỗi dưới đây để được hỗ trợ.</div>
        ${job.error ? `<div class="xf-xa-loi-detail">${esc(job.error)}</div>` : ''}
        <pre class="xf-log">${esc(logLines)}</pre>
      `;
    } else {
      const xlsmLinks = xlsmList.map((f) => `<a href="/api/xuat-file/download?path=${encodeURIComponent(f.duong_dan)}">${esc(f.ten)}</a>`).join(', ');
      body = `
        <div class="xf-done">✅ Đã xuất xong — ${job.se_xuat} ca${xlsmList.length > 1 ? ` trong ${xlsmList.length} file (server chưa cập nhật bản mới nhất — hãy khởi động lại server)` : ' trong 1 file'}.
          ${xlsmList.length ? `File đang tải xuống (nếu trình duyệt không tự tải, bấm: ${xlsmLinks}).` : ''}</div>
        ${ke ? `<div class="xf-hint">File kê danh sách (không phải file nộp Bộ):
          <a href="/api/xuat-file/download?path=${encodeURIComponent(ke.duong_dan)}" target="_blank">${esc(ke.ten)}</a></div>` : ''}
      `;
    }
    box.innerHTML = `<h3>Job ${esc(job.id)} — ${statusLabel(job.status)}</h3>${body}`;
  }

  async function refreshJobList() {
    const box = panel.querySelector('#xf-job-history');
    if (!box) return;
    try {
      const jobs = await Api.xuatFileJobs();
      box.innerHTML = jobs.slice(0, 10).map((j) => `
        <div class="xf-job-hist-item">
          <span>${j.id}</span> — <span>${statusLabel(j.status)}</span> —
          sẽ xuất ${j.se_xuat}/${j.tong_pham_vi}
          <button type="button" class="xf-job-view" data-id="${j.id}">Xem</button>
        </div>`).join('');
      box.querySelectorAll('.xf-job-view').forEach((btn) => {
        btn.addEventListener('click', async () => {
          const job = await Api.xuatFileJob(btn.dataset.id);
          renderJob(job);
          if (job.status === 'running' || job.status === 'queued') startPolling(job.id);
        });
      });
    } catch (e) { /* ignore */ }
  }

  // ---- Đợt 16 (phản hồi anh Khôi): sao lưu thủ công + liệt kê + khôi phục ----
  function fmtKichThuoc(bytes) {
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(0) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  }
  function fmtThoiGianBackup(iso) {
    const d = new Date(iso);
    return isNaN(d) ? iso : d.toLocaleString('vi-VN');
  }

  async function refreshBackupList() {
    const tbody = panel.querySelector('#xf-backup-list-body');
    if (!tbody) return;
    try {
      const list = await Api.backupDanhSach();
      tbody.innerHTML = list.length ? list.map((b) => `
        <tr>
          <td>${esc(b.ten)}</td>
          <td>${esc(fmtThoiGianBackup(b.thoi_gian))}</td>
          <td>${fmtKichThuoc(b.kich_thuoc)}</td>
          <td><button type="button" class="xf-backup-restore-btn" data-path="${esc(b.duong_dan)}" data-ten="${esc(b.ten)}">Khôi phục</button></td>
        </tr>`).join('') : '<tr><td colspan="4">Chưa có bản sao lưu nào.</td></tr>';
      tbody.querySelectorAll('.xf-backup-restore-btn').forEach((btn) => {
        btn.addEventListener('click', () => doBackupRestore(btn.dataset.path, btn.dataset.ten, btn));
      });
    } catch (e) {
      tbody.innerHTML = `<tr><td colspan="4" class="xf-error">Lỗi tải danh sách: ${esc(e.message)}</td></tr>`;
    }
  }

  async function doBackupCreate() {
    const btn = panel.querySelector('#xf-backup-create-btn');
    const status = panel.querySelector('#xf-backup-create-status');
    btn.disabled = true;
    status.textContent = ' Đang sao lưu...';
    status.className = 'xf-plain-status';
    try {
      const r = await Api.backupTaoThuCong();
      status.textContent = ` Đã tạo: ${r.duong_dan}`;
      status.className = 'xf-plain-status ok';
      refreshBackupList();
    } catch (err) {
      status.textContent = ' ' + err.message;
      status.className = 'xf-plain-status error';
    } finally {
      btn.disabled = false;
    }
  }

  async function doBackupRestore(duongDan, ten, btn) {
    // Xác nhận 2 LẦN vì đây là thao tác GHI ĐÈ TOÀN BỘ dữ liệu hệ thống,
    // ảnh hưởng mọi người đang dùng — không thể chỉ 1 cú click là xong.
    if (!confirm(`⚠ KHÔI PHỤC "${ten}"?\n\nThao tác này sẽ GHI ĐÈ TOÀN BỘ dữ liệu hiện tại của hệ thống bằng bản sao lưu này — ảnh hưởng MỌI người đang dùng ngay lập tức.\n\nHệ thống sẽ tự tạo 1 bản an toàn của dữ liệu hiện tại trước khi ghi đè.\n\nBấm OK để tiếp tục.`)) return;
    if (!confirm(`Xác nhận LẦN CUỐI: khôi phục về "${ten}"? Không thể huỷ giữa chừng.`)) return;
    btn.disabled = true;
    btn.textContent = 'Đang khôi phục...';
    try {
      const r = await Api.backupKhoiPhuc(duongDan);
      alert(`Đã khôi phục xong. Bản an toàn của dữ liệu TRƯỚC khi khôi phục: ${r.ban_an_toan_truoc_khoi_phuc}`);
      refreshBackupList();
    } catch (err) {
      alert('Lỗi khôi phục: ' + err.message);
      btn.disabled = false;
      btn.textContent = 'Khôi phục';
    }
  }

  return { init, show };
})();
