// xuatfile.js — Pipeline 2: màn hình "Xuất file" (§7 SPEC, admin only).
// Chọn phạm vi -> xem trước số cờ đỏ -> chọn tuỳ chọn -> bắt đầu job nền ->
// polling tiến độ theo xã -> tải file .xlsm + file kê.

const ExportView = (() => {
  let panel, danhMuc;
  let pollTimer = null;
  let cotMoRongList = [];

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
        </div>
        <div id="xf-scope-value">
          <select id="xf-val-xa" multiple hidden size="6">${xaOptions}</select>
          <select id="xf-val-can-bo" multiple hidden size="6"></select>
          <select id="xf-val-trang-thai" multiple hidden size="4">${ttOptions}</select>
          <textarea id="xf-val-chon-tay" hidden placeholder="Mỗi mã hồ sơ 1 dòng, hoặc cách nhau bởi dấu phẩy&#10;vd: 31006-2026-00001"></textarea>
        </div>
      </div>

      <div class="xf-block">
        <button id="xf-preview-btn" type="button">Xem trước</button>
        <div id="xf-preview-box"></div>
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

      <div class="xf-block">
        <button id="xf-start-btn" type="button">Bắt đầu xuất</button>
      </div>

      <div id="xf-job-progress"></div>

      <h3>Các lần xuất gần đây</h3>
      <div id="xf-job-history"></div>
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

    panel.querySelector('#xf-preview-btn').addEventListener('click', doPreview);
    panel.querySelector('#xf-start-btn').addEventListener('click', doStart);

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
  }

  async function doPreview() {
    const box = panel.querySelector('#xf-preview-box');
    box.textContent = 'Đang tính ...';
    try {
      const scope = currentScope();
      const include_errors = panel.querySelector('#xf-include-errors').checked;
      const res = await Api.xuatFilePreview({ ...scope, include_errors });
      box.innerHTML = `
        <div class="xf-preview-stats">
          Tổng trong phạm vi: <b>${res.tong}</b> &nbsp;|&nbsp;
          Còn cờ 🔴: <b class="xf-red">${res.do_flag_count}</b> &nbsp;|&nbsp;
          Sẽ xuất: <b class="xf-ok">${res.se_xuat}</b> &nbsp;|&nbsp;
          Sẽ loại trừ: <b>${res.se_loai_tru}</b>
        </div>`;
    } catch (err) {
      box.innerHTML = `<div class="xf-error">${err.message}</div>`;
    }
  }

  async function doStart() {
    const scope = currentScope();
    const include_errors = panel.querySelector('#xf-include-errors').checked;
    const extEnabled = panel.querySelector('#xf-extended-enabled').checked;
    const columns = extEnabled
      ? Array.from(panel.querySelectorAll('.ext-col-check:checked')).map((c) => c.value)
      : [];
    const startBtn = panel.querySelector('#xf-start-btn');
    startBtn.disabled = true;
    try {
      const job = await Api.xuatFileStart({
        ...scope, include_errors, extended: { enabled: extEnabled, columns },
      });
      renderJob(job);
      startPolling(job.id);
    } catch (err) {
      panel.querySelector('#xf-job-progress').innerHTML = `<div class="xf-error">${err.message}</div>`;
    } finally {
      startBtn.disabled = false;
    }
  }

  function startPolling(jobId) {
    if (pollTimer) clearInterval(pollTimer);
    pollTimer = setInterval(async () => {
      try {
        const job = await Api.xuatFileJob(jobId);
        renderJob(job);
        if (job.status === 'done' || job.status === 'error') {
          clearInterval(pollTimer);
          pollTimer = null;
          refreshJobList();
        }
      } catch (e) {
        clearInterval(pollTimer);
        pollTimer = null;
      }
    }, 2000);
  }

  function statusLabel(s) {
    return { queued: 'Chờ xử lý', running: 'Đang chạy', done: 'Xong', error: 'Có lỗi',
              cho: 'Chờ', dang_chay: 'Đang xử lý...', xong: 'Xong', loi: 'Lỗi' }[s] || s;
  }

  function renderJob(job) {
    const box = panel.querySelector('#xf-job-progress');
    const xaLines = (job.xa_progress || []).map((p) => `
      <div class="xf-xa-line xf-xa-${p.status}">
        <span class="xf-xa-name">${p.xa}</span>
        <span class="xf-xa-status">${statusLabel(p.status)}</span>
        <span class="xf-xa-count">${p.so_ca || 0} ca</span>
      </div>`).join('');
    const files = (job.files || []).map((f) => `
      <li><a href="/api/xuat-file/download?path=${encodeURIComponent(f.duong_dan)}" target="_blank">${f.ten}</a></li>
    `).join('');
    const logLines = (job.log || []).slice(-30).join('\n');
    box.innerHTML = `
      <h3>Job ${job.id} — ${statusLabel(job.status)}</h3>
      <div class="xf-job-stats">Sẽ xuất ${job.se_xuat}/${job.tong_pham_vi} (cờ đỏ ${job.do_flag_count}, loại trừ ${job.se_loai_tru})</div>
      <div class="xf-xa-list">${xaLines}</div>
      ${files ? `<div class="xf-files"><b>File đã tạo:</b><ul>${files}</ul></div>` : ''}
      <pre class="xf-log">${logLines}</pre>
    `;
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

  return { init, show };
})();
