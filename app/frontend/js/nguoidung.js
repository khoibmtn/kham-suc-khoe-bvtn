// nguoidung.js — Đợt 2 criteria 1+2: màn "Người dùng" (admin quản lý tài
// khoản nhân viên rà soát) — tạo, sửa họ tên, đặt lại mật khẩu mặc định,
// vô hiệu hóa/kích hoạt, xóa (chỉ khi chưa có dấu vết).

const NguoiDungView = (() => {
  let panel;

  function init(panelEl) {
    panel = panelEl;
  }

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => (
      { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  async function show() {
    panel.innerHTML = '<div class="dash-loading">Đang tải danh sách người dùng...</div>';
    await render();
  }

  async function render() {
    let users = [];
    try {
      users = await Api.listNguoiDung();
    } catch (err) {
      panel.innerHTML = `<div class="xf-error">Lỗi tải danh sách người dùng: ${esc(err.message)}</div>`;
      return;
    }
    panel.innerHTML = `
      <h2>Người dùng</h2>
      <form id="nd-create-form" class="nd-create-form">
        <label>Họ tên
          <input type="text" id="nd-ho-ten" required>
        </label>
        <label>Tên đăng nhập
          <input type="text" id="nd-ten-dang-nhap" required>
        </label>
        <label>Mật khẩu
          <input type="text" id="nd-mat-khau" required>
        </label>
        <button type="submit">Tạo tài khoản</button>
      </form>
      <div id="nd-create-result"></div>
      <table class="nd-table">
        <thead><tr>
          <th>Họ tên</th><th>Tên đăng nhập</th><th>Vai trò</th>
          <th>Trạng thái</th><th>Thao tác</th>
        </tr></thead>
        <tbody id="nd-table-body"></tbody>
      </table>
    `;
    renderRows(users);
    wireCreateForm();
  }

  function renderRows(users) {
    const tbody = document.getElementById('nd-table-body');
    tbody.innerHTML = '';
    users.forEach((u) => {
      const tr = document.createElement('tr');
      const vaiTroNhan = u.vai_tro === 'admin' ? 'Quản trị' : 'Nhân viên rà soát';
      const trangThaiNhan = u.dang_hoat_dong ? 'Đang hoạt động' : 'Đã vô hiệu hóa';
      tr.innerHTML = `
        <td>${esc(u.ho_ten)}</td>
        <td>${esc(u.ten_dang_nhap)}</td>
        <td>${esc(vaiTroNhan)}</td>
        <td class="${u.dang_hoat_dong ? 'nd-active' : 'nd-inactive'}">${esc(trangThaiNhan)}</td>
        <td class="nd-actions"></td>
      `;
      const actions = tr.querySelector('.nd-actions');

      const btnSua = document.createElement('button');
      btnSua.type = 'button';
      btnSua.textContent = 'Sửa họ tên';
      btnSua.addEventListener('click', () => suaHoTen(u));
      actions.appendChild(btnSua);

      const btnReset = document.createElement('button');
      btnReset.type = 'button';
      btnReset.textContent = 'Đặt lại mật khẩu mặc định';
      btnReset.addEventListener('click', () => datLaiMatKhau(u));
      actions.appendChild(btnReset);

      const btnToggle = document.createElement('button');
      btnToggle.type = 'button';
      btnToggle.textContent = u.dang_hoat_dong ? 'Vô hiệu hóa' : 'Kích hoạt';
      btnToggle.addEventListener('click', () => toggleKichHoat(u));
      actions.appendChild(btnToggle);

      const btnXoa = document.createElement('button');
      btnXoa.type = 'button';
      btnXoa.textContent = 'Xóa';
      btnXoa.className = 'nd-danger';
      btnXoa.addEventListener('click', () => xoaNguoiDung(u));
      actions.appendChild(btnXoa);

      tbody.appendChild(tr);
    });
  }

  function wireCreateForm() {
    document.getElementById('nd-create-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const resultBox = document.getElementById('nd-create-result');
      const ho_ten = document.getElementById('nd-ho-ten').value.trim();
      const ten_dang_nhap = document.getElementById('nd-ten-dang-nhap').value.trim();
      const mat_khau = document.getElementById('nd-mat-khau').value;
      try {
        await Api.createNguoiDung({ ho_ten, ten_dang_nhap, mat_khau });
        resultBox.textContent = 'Đã tạo tài khoản.';
        resultBox.className = 'ok';
        await render();
      } catch (err) {
        resultBox.textContent = err.message;
        resultBox.className = 'error';
      }
    });
  }

  async function suaHoTen(u) {
    const hoTenMoi = prompt('Họ tên mới:', u.ho_ten);
    if (hoTenMoi === null) return;
    const trimmed = hoTenMoi.trim();
    if (!trimmed) { alert('Họ tên không được để trống'); return; }
    try {
      await Api.patchNguoiDung(u.id, { ho_ten: trimmed });
      await render();
    } catch (err) {
      alert(err.message);
    }
  }

  async function datLaiMatKhau(u) {
    if (!confirm(`Đặt lại mật khẩu mặc định cho "${u.ho_ten}"?`)) return;
    try {
      const res = await Api.resetMatKhauNguoiDung(u.id);
      alert(`Mật khẩu mới của "${u.ho_ten}": ${res.mat_khau_moi}`);
    } catch (err) {
      alert(err.message);
    }
  }

  async function toggleKichHoat(u) {
    const target = u.dang_hoat_dong ? 0 : 1;
    const msg = target
      ? `Kích hoạt lại tài khoản "${u.ho_ten}"?`
      : `Vô hiệu hóa tài khoản "${u.ho_ten}"? Tài khoản này sẽ không đăng nhập được nữa.`;
    if (!confirm(msg)) return;
    try {
      await Api.kichHoatNguoiDung(u.id, target);
      await render();
    } catch (err) {
      alert(err.message);
    }
  }

  async function xoaNguoiDung(u) {
    if (!confirm(`Xóa vĩnh viễn tài khoản "${u.ho_ten}"? Chỉ xóa được khi tài `
      + 'khoản chưa có dấu vết sử dụng (nhật ký/phân công/hồ sơ đã giao).')) return;
    try {
      await Api.deleteNguoiDung(u.id);
      await render();
    } catch (err) {
      alert(err.message);
    }
  }

  return { init, show };
})();
