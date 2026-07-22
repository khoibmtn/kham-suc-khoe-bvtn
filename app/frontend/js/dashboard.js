// dashboard.js — Pipeline 3: Dashboard (§8 SPEC). GET-only, biểu đồ vẽ
// bằng SVG/div thuần (không thư viện ngoài). Refresh thủ công + tự refresh
// mỗi khi vào tab "Dashboard".

const DashboardView = (() => {
  let panel;
  let danhMuc;

  function init(panelEl, dm) {
    panel = panelEl;
    danhMuc = dm;
  }

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => (
      { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  async function show() {
    panel.innerHTML = '<div class="dash-loading">Đang tải dashboard...</div>';
    await refresh();
  }

  async function refresh() {
    panel.innerHTML = `
      <div class="dash-header">
        <h2>Dashboard</h2>
        <button id="dash-refresh-btn" type="button">Làm mới</button>
      </div>
      <div id="dash-body"><div class="dash-loading">Đang tải...</div></div>
    `;
    panel.querySelector('#dash-refresh-btn').addEventListener('click', refresh);
    const body = panel.querySelector('#dash-body');
    try {
      const [tongQuan, theoXa, theoCanBo, chatLuong, chuyenMon] = await Promise.all([
        Api.dashTongQuan(), Api.dashTheoXa(), Api.dashTheoCanBo(),
        Api.dashChatLuong(), Api.dashChuyenMon(),
      ]);
      body.innerHTML = [
        renderTongQuan(tongQuan),
        renderTheoXa(theoXa),
        renderTheoCanBo(theoCanBo),
        renderChatLuong(chatLuong),
        renderChuyenMon(chuyenMon),
      ].join('');
      wireAfterRender(body);
    } catch (err) {
      body.innerHTML = `<div class="xf-error">Lỗi tải dashboard: ${esc(err.message)}</div>`;
    }
  }

  // ---------------- 8.1 Thẻ tổng quan ----------------
  function renderTongQuan(d) {
    const cards = [
      ['Tổng hồ sơ', d.tong_ho_so, ''],
      ['Đã rà soát', `${d.da_ra_soat.so_luong} (${d.da_ra_soat.ty_le}%)`, 'ok'],
      ['Đang rà soát', d.dang_ra_soat, ''],
      ['Chưa rà soát', d.chua_ra_soat, ''],
      ['Cần đối chiếu giấy', d.can_doi_chieu_giay, 'warn'],
      ['Đã xuất file', d.da_xuat_file, ''],
      ['Tổng số cờ 🔴 còn lại', d.tong_co_do, 'do'],
    ];
    return `
      <section class="dash-section">
        <div class="dash-cards">
          ${cards.map(([label, val, cls]) => `
            <div class="dash-card dash-card-${cls || 'default'}">
              <div class="dash-card-val">${esc(val)}</div>
              <div class="dash-card-label">${esc(label)}</div>
            </div>`).join('')}
        </div>
      </section>`;
  }

  // ---------------- 8.2 Tiến độ theo xã ----------------
  function renderTheoXa(rows) {
    const maxTong = Math.max(1, ...rows.map((r) => r.tong));
    const bars = rows.map((r) => {
      const w = (v) => (r.tong ? (v / r.tong * 100) : 0);
      return `
        <div class="dash-xa-row">
          <div class="dash-xa-name">${esc(r.xa)}</div>
          <div class="dash-stack" style="width:${(r.tong / maxTong * 100).toFixed(1)}%">
            <div class="dash-stack-seg seg-xong" style="width:${w(r.xong)}%" title="Xong: ${r.xong}"></div>
            <div class="dash-stack-seg seg-dang" style="width:${w(r.dang)}%" title="Đang: ${r.dang}"></div>
            <div class="dash-stack-seg seg-cdc" style="width:${w(r.can_doi_chieu_giay)}%" title="Cần đối chiếu: ${r.can_doi_chieu_giay}"></div>
            <div class="dash-stack-seg seg-chua" style="width:${w(r.chua)}%" title="Chưa: ${r.chua}"></div>
          </div>
          <div class="dash-xa-pct">${r.ty_le}%</div>
        </div>`;
    }).join('');
    const tableRows = rows.map((r) => `
      <tr>
        <td>${esc(r.xa)}</td><td>${r.tong}</td><td>${r.xong}</td><td>${r.dang}</td>
        <td>${r.chua}</td><td>${r.can_doi_chieu_giay}</td>
        <td class="xf-red">${r.co_do}</td><td>${r.ty_le}%</td>
      </tr>`).join('');
    return `
      <section class="dash-section">
        <h3>Tiến độ theo xã/phường (sắp % tăng dần)</h3>
        <div class="dash-legend">
          <span class="leg"><i class="sw seg-xong"></i>Xong</span>
          <span class="leg"><i class="sw seg-dang"></i>Đang</span>
          <span class="leg"><i class="sw seg-cdc"></i>Cần đối chiếu</span>
          <span class="leg"><i class="sw seg-chua"></i>Chưa</span>
        </div>
        <div class="dash-xa-chart">${bars}</div>
        <table class="dash-table">
          <thead><tr><th>Xã</th><th>Tổng</th><th>Xong</th><th>Đang</th><th>Chưa</th>
            <th>Cần đối chiếu</th><th>Cờ đỏ</th><th>%</th></tr></thead>
          <tbody>${tableRows}</tbody>
        </table>
      </section>`;
  }

  // ---------------- 8.3 Tiến độ theo cán bộ ----------------
  function sparklineSvg(series, w = 140, h = 32) {
    const vals = series.map((s) => s.so_luot);
    const max = Math.max(1, ...vals);
    const step = w / Math.max(1, vals.length - 1);
    const pts = vals.map((v, i) => `${(i * step).toFixed(1)},${(h - (v / max) * (h - 4) - 2).toFixed(1)}`).join(' ');
    const dots = vals.map((v, i) => {
      const x = (i * step).toFixed(1);
      const y = (h - (v / max) * (h - 4) - 2).toFixed(1);
      return `<circle cx="${x}" cy="${y}" r="2" class="spark-dot"><title>${series[i].ngay}: ${v}</title></circle>`;
    }).join('');
    return `<svg class="sparkline" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
      <polyline points="${pts}" fill="none" stroke="#2563eb" stroke-width="1.5"/>${dots}</svg>`;
  }

  function renderTheoCanBo(rows) {
    const trs = rows.map((r) => `
      <tr>
        <td>${esc(r.ho_ten)} <span class="dash-role">(${r.vai_tro === 'admin' ? 'Quản trị' : 'Cán bộ'})</span></td>
        <td>${r.giao}</td><td>${r.hoan_thanh}</td><td>${r.ty_le}%</td>
        <td>${r.so_luot_sua}</td>
        <td>${r.hoat_dong_gan_nhat ? esc(r.hoat_dong_gan_nhat) : '—'}</td>
        <td>${sparklineSvg(r.nang_suat_7_ngay)}</td>
      </tr>`).join('');
    return `
      <section class="dash-section">
        <h3>Tiến độ theo cán bộ</h3>
        <table class="dash-table">
          <thead><tr><th>Cán bộ</th><th>Giao</th><th>Hoàn thành</th><th>%</th>
            <th>Lượt sửa</th><th>Hoạt động gần nhất</th><th>Năng suất 7 ngày</th></tr></thead>
          <tbody>${trs || '<tr><td colspan="7">Chưa có cán bộ</td></tr>'}</tbody>
        </table>
      </section>`;
  }

  // ---------------- 8.4 Chất lượng dữ liệu ----------------
  function renderChatLuong(d) {
    const maxV = Math.max(1, ...d.co_qc.map((f) => Math.max(f.hien_tai, f.ban_dau)));
    const bars = d.co_qc.map((f) => `
      <div class="dash-flag-row">
        <div class="dash-flag-name flag-chip flag-${f.muc}">${esc(f.ten)}</div>
        <div class="dash-flag-bars">
          <div class="dash-hbar dash-hbar-old" style="width:${(f.ban_dau / maxV * 100).toFixed(1)}%">
            <span>${f.ban_dau}</span>
          </div>
          <div class="dash-hbar dash-hbar-new" style="width:${(f.hien_tai / maxV * 100).toFixed(1)}%">
            <span>${f.hien_tai}</span>
          </div>
        </div>
      </div>`).join('');

    const series = d.co_do_theo_ngay;
    let lineChart = '<div class="dash-empty">Chưa có dữ liệu snapshot theo ngày</div>';
    if (series.length) {
      const w = 480, h = 120, pad = 24;
      const maxY = Math.max(1, ...series.map((s) => s.so_co_do));
      const stepX = series.length > 1 ? (w - pad * 2) / (series.length - 1) : 0;
      const pts = series.map((s, i) => {
        const x = pad + i * stepX;
        const y = h - pad - (s.so_co_do / maxY) * (h - pad * 2);
        return `${x.toFixed(1)},${y.toFixed(1)}`;
      }).join(' ');
      const dots = series.map((s, i) => {
        const x = pad + i * stepX;
        const y = h - pad - (s.so_co_do / maxY) * (h - pad * 2);
        return `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="3" fill="#c0392b">
          <title>${s.ngay}: ${s.so_co_do} cờ đỏ</title></circle>`;
      }).join('');
      lineChart = `<svg width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" class="dash-line-chart">
        <polyline points="${pts}" fill="none" stroke="#c0392b" stroke-width="2"/>${dots}
      </svg>`;
    }

    return `
      <section class="dash-section">
        <h3>Chất lượng dữ liệu</h3>
        <div class="dash-flag-legend">
          <span class="leg"><i class="sw dash-hbar-old"></i>Ban đầu (baseline)</span>
          <span class="leg"><i class="sw dash-hbar-new"></i>Hiện tại</span>
        </div>
        <div class="dash-flag-chart">${bars}</div>
        <h4>Số cờ đỏ theo ngày</h4>
        ${lineChart}
      </section>`;
  }

  // ---------------- 8.5 Thống kê chuyên môn ----------------
  function renderChuyenMon(d) {
    const plColors = ['#15803d', '#65a30d', '#ca8a04', '#ea580c', '#c0392b'];
    const plRows = d.pl_theo_xa.map((r) => {
      const tong = [1, 2, 3, 4, 5].reduce((s, i) => s + r[`pl_${i}`], 0) || 1;
      const segs = [1, 2, 3, 4, 5].map((i) => `
        <div class="dash-stack-seg" style="width:${(r[`pl_${i}`] / tong * 100).toFixed(1)}%;background:${plColors[i - 1]}"
             title="Loại ${['I', 'II', 'III', 'IV', 'V'][i - 1]}: ${r[`pl_${i}`]}"></div>`).join('');
      return `
        <div class="dash-xa-row">
          <div class="dash-xa-name">${esc(r.xa)}</div>
          <div class="dash-stack" style="width:70%">${segs}</div>
        </div>`;
    }).join('');

    const icdRows = d.top20_icd.map((r, i) => `
      <tr><td>${i + 1}</td><td>${esc(r.ma)}</td><td>${esc(r.ten)}</td><td>${r.so_ca}</td></tr>`).join('');

    const maxCq = Math.max(1, ...d.co_quan_benh_chinh.map((r) => r.so_ca));
    const cqBars = d.co_quan_benh_chinh.map((r) => `
      <div class="dash-xa-row">
        <div class="dash-xa-name">${esc(r.ten)}</div>
        <div class="dash-stack" style="width:70%">
          <div class="dash-stack-seg seg-xong" style="width:${(r.so_ca / maxCq * 100).toFixed(1)}%"
               title="${r.so_ca} (ban đầu ${r.ban_dau})"></div>
        </div>
        <div class="dash-xa-pct">${r.so_ca} <span class="dash-role">(ban đầu ${r.ban_dau})</span></div>
      </div>`).join('');

    const manTinhCards = d.man_tinh.map((m) => `
      <div class="dash-card dash-card-mantinh">
        <div class="dash-card-val">${m.so_ca}</div>
        <div class="dash-card-label">${esc(m.ten)}</div>
        <div class="dash-card-pct">${m.ty_le}%</div>
      </div>`).join('');

    const gl = d.glucose;
    const glTotal = gl.khong_do + gl.binh_thuong + gl.cao || 1;
    const glBucket = (label, val, cls) => `
      <div class="dash-gl-seg ${cls}" style="width:${(val / glTotal * 100).toFixed(1)}%">
        <span>${label}: ${val}</span>
      </div>`;

    return `
      <section class="dash-section">
        <h3>Thống kê chuyên môn</h3>

        <h4>Phân loại sức khỏe I-V theo xã</h4>
        <div class="dash-legend">
          ${['I', 'II', 'III', 'IV', 'V'].map((r, i) => `
            <span class="leg"><i class="sw" style="background:${plColors[i]}"></i>Loại ${r}</span>`).join('')}
        </div>
        <div class="dash-xa-chart">${plRows}</div>

        <h4>Top 20 bệnh theo mã ICD (bảng benh)</h4>
        <table class="dash-table">
          <thead><tr><th>#</th><th>Mã ICD</th><th>Tên bệnh</th><th>Số ca</th></tr></thead>
          <tbody>${icdRows}</tbody>
        </table>

        <h4>Số ca theo cơ quan bệnh chính (hiện tại vs baseline)</h4>
        <div class="dash-xa-chart">${cqBars}</div>

        <h4>Tỷ lệ mắc bệnh mạn tính chính (trên tổng ${13326} hồ sơ nền)</h4>
        <div class="dash-cards">${manTinhCards}</div>

        <h4>Phân bố glucose mao mạch (đói ≥7.0 · sau ăn ≥11.1 mmol/L = cao)</h4>
        <div class="dash-gl-bar">
          ${glBucket('Không đo', gl.khong_do, 'gl-none')}
          ${glBucket('Bình thường', gl.binh_thuong, 'gl-ok')}
          ${glBucket('Cao', gl.cao, 'gl-high')}
        </div>
      </section>`;
  }

  function wireAfterRender() { /* không cần thao tác thêm — GET-only, không sửa dữ liệu */ }

  return { init, show, refresh };
})();
