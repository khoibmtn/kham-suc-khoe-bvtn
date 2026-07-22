// app.js — điểm vào: đăng nhập -> tải danh mục -> khởi tạo danh sách/chi
// tiết -> gắn bàn phím + bảng lệnh (Ctrl+K) + màn hình phân công (admin).

const AppShell = (() => {
  let user = null;
  let danhMuc = null;

  async function boot() {
    try {
      user = await Api.me();
      await afterLogin();
    } catch (e) {
      showLogin();
    }
    wireLoginForm();
  }

  function showLogin() {
    document.getElementById('login-screen').hidden = false;
    document.getElementById('app-shell').hidden = true;
  }

  function wireLoginForm() {
    const form = document.getElementById('login-form');
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const u = document.getElementById('login-user').value.trim();
      const p = document.getElementById('login-pass').value;
      const errBox = document.getElementById('login-error');
      errBox.textContent = '';
      try {
        user = await Api.login(u, p);
        document.getElementById('login-screen').hidden = true;
        await afterLogin();
      } catch (err) {
        errBox.textContent = err.message || 'Đăng nhập thất bại';
      }
    });
  }

  async function afterLogin() {
    danhMuc = await Api.danhMuc();
    document.getElementById('login-screen').hidden = true;
    document.getElementById('app-shell').hidden = false;
    document.getElementById('user-info').textContent =
      `${user.ho_ten} (${user.vai_tro === 'admin' ? 'Quản trị' : 'Nhân viên rà soát'})`;

    // Đợt 3 criterion 8: nạp ngưỡng sinh hiệu 1 lần sau đăng nhập (mọi vai
    // trò được đọc GET /api/cai-dat) — cache trong NguongCheck để widgets.js
    // / sinhhieu.js tiền kiểm phía client trước khi PATCH. Lỗi mạng lúc boot
    // -> bỏ qua tiền kiểm (server vẫn là nguồn chân lý cuối).
    try {
      const cd = await Api.caiDatGet();
      NguongCheck.setNguong(cd.nguong_sinh_hieu);
    } catch (e) { /* bỏ qua — tiền kiểm phía client sẽ tự tắt nếu chưa có cache */ }

    ListView.init(document.getElementById('list-view'), danhMuc, user, {
      onOpen: (ma) => openDetail(ma),
    });
    DetailView.init(document.getElementById('detail-panel'), danhMuc, user);
    DashboardView.init(document.getElementById('dashboard-panel'), danhMuc);
    SinhHieuView.init(document.getElementById('sinh-hieu-panel'), danhMuc);

    if (user.vai_tro === 'admin') {
      document.getElementById('nav-phan-cong').hidden = false;
      wirePhanCongPanel();
      document.getElementById('nav-xuat-file').hidden = false;
      ExportView.init(document.getElementById('xuat-file-panel'), danhMuc);
      document.getElementById('nav-nguoi-dung').hidden = false;
      NguoiDungView.init(document.getElementById('nguoi-dung-panel'));
      document.getElementById('nav-cai-dat').hidden = false;
      CaiDatView.init(document.getElementById('cai-dat-panel'));
    }
    wireNav();
    wireLogout();
    wireCommandPalette();
    wireTaiKhoanModal();
    setupSplitter();
    Keyboard.install();
  }

  // ---------------- Splitter kéo được (tiêu chí 7) ----------------
  function setupSplitter() {
    const mainArea = document.getElementById('main-area');
    const listView = document.getElementById('list-view');
    const detailPanel = document.getElementById('detail-panel');
    const splitter = document.getElementById('main-splitter');
    if (!mainArea || !listView || !detailPanel || !splitter) return;

    const DEFAULT_PCT = 45;
    const MIN_PCT = 20;
    const MAX_PCT = 75;
    let currentPct = DEFAULT_PCT;

    function applyPct(pct) {
      currentPct = Math.min(MAX_PCT, Math.max(MIN_PCT, pct));
      if (!detailPanel.hidden) {
        listView.style.flex = `0 0 ${currentPct}%`;
      }
    }

    function syncVisibility() {
      const hidden = detailPanel.hidden;
      splitter.hidden = hidden;
      // Khi chi tiết đóng, danh sách chiếm toàn bộ chiều rộng — không đụng
      // tới tỷ lệ đã lưu (currentPct) để khôi phục đúng khi mở lại.
      listView.style.flex = hidden ? '1 1 100%' : `0 0 ${currentPct}%`;
    }

    const saved = parseFloat(localStorage.getItem('ksk_split'));
    applyPct(Number.isFinite(saved) ? saved : DEFAULT_PCT);
    syncVisibility();

    new MutationObserver(syncVisibility)
      .observe(detailPanel, { attributes: true, attributeFilter: ['hidden'] });

    let dragging = false;
    splitter.addEventListener('mousedown', (e) => {
      if (detailPanel.hidden) return;
      dragging = true;
      splitter.classList.add('dragging');
      document.body.style.userSelect = 'none';
      e.preventDefault();
    });
    document.addEventListener('mousemove', (e) => {
      if (!dragging) return;
      const rect = mainArea.getBoundingClientRect();
      const pct = ((e.clientX - rect.left) / rect.width) * 100;
      applyPct(pct);
    });
    document.addEventListener('mouseup', () => {
      if (!dragging) return;
      dragging = false;
      splitter.classList.remove('dragging');
      document.body.style.userSelect = '';
      localStorage.setItem('ksk_split', String(currentPct));
    });
    splitter.addEventListener('dblclick', () => {
      applyPct(DEFAULT_PCT);
      localStorage.setItem('ksk_split', String(DEFAULT_PCT));
    });
  }

  function wireNav() {
    document.getElementById('nav-danh-sach').addEventListener('click', () => showScreen('danh-sach'));
    document.getElementById('nav-sinh-hieu').addEventListener('click', () => showScreen('sinh-hieu'));
    document.getElementById('nav-dashboard').addEventListener('click', () => showScreen('dashboard'));
    const pc = document.getElementById('nav-phan-cong');
    if (pc) pc.addEventListener('click', () => showScreen('phan-cong'));
    const xf = document.getElementById('nav-xuat-file');
    if (xf) xf.addEventListener('click', () => showScreen('xuat-file'));
    const nd = document.getElementById('nav-nguoi-dung');
    if (nd) nd.addEventListener('click', () => showScreen('nguoi-dung'));
    const cd = document.getElementById('nav-cai-dat');
    if (cd) cd.addEventListener('click', () => showScreen('cai-dat'));
  }

  const NAV_BTN_BY_SCREEN = {
    'danh-sach': 'nav-danh-sach', 'sinh-hieu': 'nav-sinh-hieu', dashboard: 'nav-dashboard',
    'phan-cong': 'nav-phan-cong', 'xuat-file': 'nav-xuat-file', 'nguoi-dung': 'nav-nguoi-dung',
    'cai-dat': 'nav-cai-dat',
  };
  const PANEL_BY_SCREEN = {
    'sinh-hieu': 'sinh-hieu-panel', dashboard: 'dashboard-panel',
    'phan-cong': 'phan-cong-panel', 'xuat-file': 'xuat-file-panel',
    'nguoi-dung': 'nguoi-dung-panel', 'cai-dat': 'cai-dat-panel',
  };

  function showScreen(name) {
    Object.entries(NAV_BTN_BY_SCREEN).forEach(([screen, btnId]) => {
      const btn = document.getElementById(btnId);
      if (btn) btn.classList.toggle('active', screen === name);
    });
    document.getElementById('main-area').hidden = name !== 'danh-sach';
    Object.entries(PANEL_BY_SCREEN).forEach(([screen, panelId]) => {
      document.getElementById(panelId).hidden = screen !== name;
    });
    if (name === 'phan-cong') refreshPhanCongList();
    if (name === 'xuat-file') ExportView.show();
    if (name === 'dashboard') DashboardView.show();
    if (name === 'sinh-hieu') SinhHieuView.show();
    if (name === 'nguoi-dung') NguoiDungView.show();
    if (name === 'cai-dat') CaiDatView.show();
  }

  function wireLogout() {
    document.getElementById('logout-btn').addEventListener('click', async () => {
      await Api.logout();
      location.reload();
    });
  }

  // ---------------- Tài khoản của tôi (mọi user) ----------------
  function wireTaiKhoanModal() {
    const modal = document.getElementById('tai-khoan-modal');
    const form = document.getElementById('tai-khoan-form');
    const resultBox = document.getElementById('tk-result');

    document.getElementById('tai-khoan-btn').addEventListener('click', () => {
      document.getElementById('tk-ho-ten').value = user.ho_ten;
      document.getElementById('tk-mat-khau-cu').value = '';
      document.getElementById('tk-mat-khau-moi').value = '';
      resultBox.textContent = '';
      resultBox.className = '';
      modal.hidden = false;
    });
    document.getElementById('tk-close-btn').addEventListener('click', () => { modal.hidden = true; });
    modal.addEventListener('click', (e) => { if (e.target.id === 'tai-khoan-modal') modal.hidden = true; });

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const body = {};
      const hoTenMoi = document.getElementById('tk-ho-ten').value.trim();
      if (hoTenMoi && hoTenMoi !== user.ho_ten) body.ho_ten = hoTenMoi;
      const matKhauCu = document.getElementById('tk-mat-khau-cu').value;
      const matKhauMoi = document.getElementById('tk-mat-khau-moi').value;
      if (matKhauMoi) {
        body.mat_khau_cu = matKhauCu;
        body.mat_khau_moi = matKhauMoi;
      }
      try {
        user = await Api.updateMe(body);
        document.getElementById('user-info').textContent =
          `${user.ho_ten} (${user.vai_tro === 'admin' ? 'Quản trị' : 'Nhân viên rà soát'})`;
        resultBox.textContent = 'Đã lưu.';
        resultBox.className = 'ok';
        document.getElementById('tk-mat-khau-cu').value = '';
        document.getElementById('tk-mat-khau-moi').value = '';
      } catch (err) {
        resultBox.textContent = err.message;
        resultBox.className = 'error';
      }
    });
  }

  async function openDetail(ma) {
    await DetailView.open(ma);
    document.getElementById('detail-panel').hidden = false;
  }

  function closeDetail() {
    DetailView.close();
  }

  async function markHoanThanh() {
    const ma = DetailView.currentMa() || ListView.currentSelectedMa();
    if (!ma) return;
    const res = await Api.hoanThanh(ma, ListView.currentFilterParams());
    DetailView.toast('Đã hoàn thành');
    await ListView.reload();
    if (res.next_ma_ho_so) {
      await openDetail(res.next_ma_ho_so);
    } else {
      closeDetail();
    }
  }

  // ---------------- Bảng lệnh Ctrl+K ----------------
  function commandList() {
    const cmds = [
      { label: 'Đi tới bộ lọc (/)', run: () => ListView.focusSearch() },
      { label: 'Đánh dấu hoàn thành + kế tiếp (Ctrl+S)', run: () => markHoanThanh() },
      { label: 'Đóng chi tiết (Esc)', run: () => closeDetail() },
      { label: 'Lọc theo cờ đỏ 🔴', run: () => alert('Dùng bộ checkbox "Cờ cảnh báo" trong bộ lọc để chọn cờ đỏ.') },
    ];
    for (let i = 1; i <= 6; i++) {
      cmds.push({ label: `Đi tới nhóm ${FIELD_GROUPS[i - 1].ten} (Alt+${i})`, run: () => DetailView.focusGroup(i) });
    }
    cmds.push({ label: 'Đi tới bảng bệnh (Alt+7)', run: () => DetailView.focusGroup(7) });
    if (user.vai_tro === 'admin') {
      cmds.push({ label: 'Mở màn hình Phân công', run: () => showScreen('phan-cong') });
    }
    return cmds;
  }

  function wireCommandPalette() {
    document.getElementById('cmd-palette').addEventListener('click', (e) => {
      if (e.target.id === 'cmd-palette') closeCommandPalette();
    });
  }

  function openCommandPalette() {
    const box = document.getElementById('cmd-palette');
    const list = document.getElementById('cmd-list');
    list.innerHTML = '';
    commandList().forEach((c) => {
      const li = document.createElement('li');
      li.textContent = c.label;
      li.addEventListener('click', () => { c.run(); closeCommandPalette(); });
      list.appendChild(li);
    });
    box.hidden = false;
  }

  function closeCommandPalette() {
    document.getElementById('cmd-palette').hidden = true;
  }

  // ---------------- Phân công (admin) ----------------
  function wirePhanCongPanel() {
    const panel = document.getElementById('phan-cong-panel');
    panel.innerHTML = `
      <h2>Phân công hồ sơ cho nhân viên</h2>
      <form id="phan-cong-form" class="phan-cong-form">
        <label>Nhân viên
          <select id="pc-nguoi-dung"></select>
        </label>
        <label>Loại phạm vi
          <select id="pc-loai">
            <option value="xa">Theo xã/phường</option>
            <option value="khoang_ma">Theo khoảng mã hồ sơ</option>
            <option value="danh_sach">Theo danh sách chọn tay</option>
          </select>
        </label>
        <label id="pc-gia-tri-label">Giá trị phạm vi
          <input type="text" id="pc-gia-tri" placeholder="vd: Phường Nam Triệu">
        </label>
        <button type="submit">Giao việc</button>
      </form>
      <div id="pc-result"></div>
      <h3>Đã giao</h3>
      <table class="phan-cong-table">
        <thead><tr><th>Nhân viên</th><th>Loại</th><th>Giá trị</th><th>Ngày giao</th></tr></thead>
        <tbody id="pc-list-body"></tbody>
      </table>
    `;
    Api.listNguoiDung().then((users) => {
      const sel = document.getElementById('pc-nguoi-dung');
      users.filter((u) => u.vai_tro === 'ra_soat').forEach((u) => {
        const o = document.createElement('option'); o.value = u.id; o.textContent = u.ho_ten;
        sel.appendChild(o);
      });
    });
    const loaiSel = document.getElementById('pc-loai');
    const giaTriInput = document.getElementById('pc-gia-tri');
    const giaTriLabel = document.getElementById('pc-gia-tri-label');
    loaiSel.addEventListener('change', () => {
      const placeholders = {
        xa: 'vd: Phường Nam Triệu,Xã Việt Khê',
        khoang_ma: 'vd: 31006-2026-00001..31006-2026-00100',
        danh_sach: 'vd: 31006-2026-00001,31006-2026-00002',
      };
      giaTriInput.placeholder = placeholders[loaiSel.value];
    });
    document.getElementById('phan-cong-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const resultBox = document.getElementById('pc-result');
      try {
        const res = await Api.phanCong({
          nguoi_dung_id: Number(document.getElementById('pc-nguoi-dung').value),
          pham_vi_loai: loaiSel.value,
          pham_vi_gia_tri: giaTriInput.value.trim(),
        });
        resultBox.textContent = `Đã gán ${res.so_ho_so_gan} hồ sơ.`;
        resultBox.className = 'ok';
        refreshPhanCongList();
      } catch (err) {
        resultBox.textContent = err.message;
        resultBox.className = 'error';
      }
    });
  }

  async function refreshPhanCongList() {
    const rows = await Api.listPhanCong();
    const tbody = document.getElementById('pc-list-body');
    if (!tbody) return;
    tbody.innerHTML = '';
    rows.forEach((r) => {
      const tr = document.createElement('tr');
      tr.innerHTML = `<td>${r.ten_can_bo}</td><td>${r.pham_vi_loai}</td>
        <td>${r.pham_vi_gia_tri}</td><td>${r.ngay_giao}</td>`;
      tbody.appendChild(tr);
    });
  }

  return {
    boot, closeDetail, markHoanThanh, openCommandPalette, closeCommandPalette,
    // Đợt 3 criterion 8: ngưỡng sinh hiệu cache sau đăng nhập — widgets.js /
    // sinhhieu.js gọi NguongCheck.check(...) trực tiếp, nhưng AppShell.getNguong()
    // vẫn được lộ ra cho code khác cần đọc ngưỡng thô (vd hiển thị placeholder).
    getNguong: () => NguongCheck.getNguong(),
  };
})();

document.addEventListener('DOMContentLoaded', () => AppShell.boot());
