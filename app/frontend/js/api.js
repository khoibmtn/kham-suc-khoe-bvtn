// api.js — gọi API backend (credentials: cookie session).
const Api = (() => {
  // Đợt 9 criterion 2: callback do app.js đăng ký — gọi khi BẤT KỲ response
  // 401 nào (trừ /api/login, vốn hiển thị lỗi ngay tại form) trả về, để
  // frontend tự chuyển về màn đăng nhập thay vì kẹt "Chưa đăng nhập" ở giữa
  // trang (vd sau khi server Render restart làm phiên cũ hết hiệu lực).
  let onUnauthorized = null;
  function setOnUnauthorized(fn) { onUnauthorized = fn; }

  async function req(method, path, body) {
    const opt = {
      method,
      headers: {},
      credentials: 'same-origin',
    };
    if (body !== undefined) {
      opt.headers['Content-Type'] = 'application/json';
      opt.body = JSON.stringify(body);
    }
    const res = await fetch(path, opt);
    let data = null;
    try { data = await res.json(); } catch (e) { /* no body */ }
    if (!res.ok) {
      const err = new Error((data && data.detail) || `Lỗi ${res.status}`);
      err.status = res.status;
      err.data = data;
      // /api/login trả 401 khi sai mật khẩu — đó là lỗi hiển thị NGAY TẠI
      // form đăng nhập (inline), KHÔNG phải phiên hết hạn -> không gọi
      // callback toàn cục (tránh vòng lặp về lại chính màn đăng nhập).
      if (res.status === 401 && path !== '/api/login' && onUnauthorized) {
        onUnauthorized();
      }
      throw err;
    }
    return data;
  }

  return {
    setOnUnauthorized,
    get: (path) => req('GET', path),
    post: (path, body) => req('POST', path, body || {}),
    patch: (path, body) => req('PATCH', path, body || {}),
    del: (path) => req('DELETE', path),

    login: (ten_dang_nhap, mat_khau) => req('POST', '/api/login', { ten_dang_nhap, mat_khau }),
    logout: () => req('POST', '/api/logout'),
    me: () => req('GET', '/api/me'),
    updateMe: (body) => req('PATCH', '/api/me', body),
    danhMuc: () => req('GET', '/api/danh-muc'),
    caiDatGet: () => req('GET', '/api/cai-dat'),
    caiDatPut: (body) => req('PUT', '/api/cai-dat', body),

    listHoSo: (params) => req('GET', '/api/ho-so?' + qs(params)),
    getHoSo: (ma) => req('GET', `/api/ho-so/${encodeURIComponent(ma)}`),
    patchHoSo: (ma, fields) => req('PATCH', `/api/ho-so/${encodeURIComponent(ma)}`, fields),
    hoanThanh: (ma, filterParams) => req('POST', `/api/ho-so/${encodeURIComponent(ma)}/hoan-thanh?` + qs(filterParams)),
    xacNhanSuy: (ma, field) => req('POST', `/api/ho-so/${encodeURIComponent(ma)}/xac-nhan-suy`, { field }),

    addBenh: (ma, body) => req('POST', `/api/ho-so/${encodeURIComponent(ma)}/benh`, body),
    patchBenh: (ma, id, body) => req('PATCH', `/api/ho-so/${encodeURIComponent(ma)}/benh/${id}`, body),
    delBenh: (ma, id) => req('DELETE', `/api/ho-so/${encodeURIComponent(ma)}/benh/${id}`),
    setBenhChinh: (ma, benh_id) => req('POST', `/api/ho-so/${encodeURIComponent(ma)}/benh/set-benh-chinh`, { benh_id }),

    searchIcd: (q) => req('GET', '/api/icd?q=' + encodeURIComponent(q)),

    phanCong: (body) => req('POST', '/api/phan-cong', body),
    listPhanCong: () => req('GET', '/api/phan-cong'),
    patchPhanCong: (id, body) => req('PATCH', `/api/phan-cong/${id}`, body),
    deletePhanCong: (id) => req('DELETE', `/api/phan-cong/${id}`),
    listNguoiDung: () => req('GET', '/api/nguoi-dung'),
    createNguoiDung: (body) => req('POST', '/api/nguoi-dung', body),
    patchNguoiDung: (id, body) => req('PATCH', `/api/nguoi-dung/${id}`, body),
    resetMatKhauNguoiDung: (id) => req('POST', `/api/nguoi-dung/${id}/reset-mat-khau`),
    kichHoatNguoiDung: (id, dang_hoat_dong) => req('POST', `/api/nguoi-dung/${id}/kich-hoat`, { dang_hoat_dong }),
    deleteNguoiDung: (id) => req('DELETE', `/api/nguoi-dung/${id}`),

    xuatFileCotMoRong: () => req('GET', '/api/xuat-file/cot-mo-rong'),
    xuatFilePreview: (body) => req('POST', '/api/xuat-file/preview', body),
    xuatFileStart: (body) => req('POST', '/api/xuat-file', body),
    xuatFileJobs: () => req('GET', '/api/xuat-file/jobs'),
    xuatFileJob: (id) => req('GET', `/api/xuat-file/jobs/${encodeURIComponent(id)}`),

    dashTongQuan: () => req('GET', '/api/dashboard/tong-quan'),
    dashTheoXa: () => req('GET', '/api/dashboard/theo-xa'),
    dashTheoCanBo: () => req('GET', '/api/dashboard/theo-can-bo'),
    dashChatLuong: () => req('GET', '/api/dashboard/chat-luong'),
    dashChuyenMon: () => req('GET', '/api/dashboard/chuyen-mon'),

    sinhHieuList: (params) => req('GET', '/api/sinh-hieu/danh-sach?' + qs(params)),
    sinhHieuPatch: (ma, fields) => req('PATCH', `/api/sinh-hieu/${encodeURIComponent(ma)}`, fields),
    sinhHieuImportExcel: async (file) => {
      const fd = new FormData();
      fd.append('file', file);
      const res = await fetch('/api/sinh-hieu/import-excel', { method: 'POST', body: fd, credentials: 'same-origin' });
      const data = await res.json();
      if (!res.ok) {
        const err = new Error((data && data.detail) || `Lỗi ${res.status}`);
        err.data = data;
        if (res.status === 401 && onUnauthorized) onUnauthorized();
        throw err;
      }
      return data;
    },
    qs,
  };

  function qs(params) {
    if (!params) return '';
    const sp = new URLSearchParams();
    Object.entries(params).forEach(([k, v]) => {
      if (v === undefined || v === null || v === '') return;
      if (Array.isArray(v)) v.forEach((x) => x !== '' && sp.append(k, x));
      else sp.append(k, v);
    });
    return sp.toString();
  }
})();
