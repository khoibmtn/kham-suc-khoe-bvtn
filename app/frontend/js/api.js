// api.js — gọi API backend (credentials: cookie session).
const Api = (() => {
  // Đợt 9 criterion 2: callback do app.js đăng ký — gọi khi BẤT KỲ response
  // 401 nào (trừ /api/login, vốn hiển thị lỗi ngay tại form) trả về, để
  // frontend tự chuyển về màn đăng nhập thay vì kẹt "Chưa đăng nhập" ở giữa
  // trang (vd sau khi server Render restart làm phiên cũ hết hiệu lực).
  let onUnauthorized = null;
  function setOnUnauthorized(fn) { onUnauthorized = fn; }

  // FastAPI trả `detail` dạng CHUỖI cho HTTPException thường, nhưng dạng
  // MẢNG các object {loc, msg, type} khi Pydantic tự chặn request KHÔNG
  // khớp schema (422) — trước đây `new Error(detail)` với detail là mảng
  // 1 phần tử bị ép kiểu thành chuỗi "[object Object]" (JS Array.toString
  // nối các phần tử bằng dấu phẩy, phần tử object -> "[object Object]"),
  // hiện KHÔNG rõ nghĩa gì với người dùng. Ghép lại thành câu đọc được.
  function formatErrorDetail(data) {
    const d = data && data.detail;
    if (!d) return null;
    if (typeof d === 'string') return d;
    if (Array.isArray(d)) {
      return d.map((x) => (x && typeof x === 'object')
        ? `${(x.loc || []).slice(1).join('.')}: ${x.msg || JSON.stringify(x)}`
        : String(x)).join('; ');
    }
    if (typeof d === 'object') return JSON.stringify(d);
    return String(d);
  }

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
      const err = new Error(formatErrorDetail(data) || `Lỗi ${res.status}`);
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
    // Box điều kiện (Bộ lọc nâng cao, list.js) — lưu {show_extra, field_order}
    // theo tài khoản đang đăng nhập (tái dùng PATCH /api/me).
    capNhatBoLocNangCao: (tuyChon) => req('PATCH', '/api/me', { bo_loc_nang_cao_tuy_chon: tuyChon }),
    danhMuc: () => req('GET', '/api/danh-muc'),
    coQcThongKe: () => req('GET', '/api/co-qc-thong-ke'),
    caiDatGet: () => req('GET', '/api/cai-dat'),
    caiDatPut: (body) => req('PUT', '/api/cai-dat', body),
    raSoatSinhHieu: (apply) => req('POST', `/api/admin/ra-soat-sinh-hieu?apply=${apply ? 'true' : 'false'}`),
    capNhatNgay: () => req('POST', '/api/admin/cap-nhat-ngay'),

    listHoSo: (params) => req('GET', '/api/ho-so?' + qs(params)),
    // Checkbox đầu bảng "chọn tất cả khớp bộ lọc" (list.js) — trả TOÀN BỘ
    // ma_ho_so khớp bộ lọc hiện tại (mọi trang, không phân trang).
    listMaHoSo: (params) => req('GET', '/api/ho-so/ma-list?' + qs(params)),
    getHoSo: (ma) => req('GET', `/api/ho-so/${encodeURIComponent(ma)}`),
    patchHoSo: (ma, fields) => req('PATCH', `/api/ho-so/${encodeURIComponent(ma)}`, fields),
    hoanThanh: (ma, filterParams) => req('POST', `/api/ho-so/${encodeURIComponent(ma)}/hoan-thanh?` + qs(filterParams)),
    xacNhanSuy: (ma, field) => req('POST', `/api/ho-so/${encodeURIComponent(ma)}/xac-nhan-suy`, { field }),
    // Đợt 12: gỡ THỦ CÔNG một cờ cảnh báo (nhân viên xác định không phải lỗi).
    goCoThuCong: (ma, flag) => req('POST', `/api/ho-so/${encodeURIComponent(ma)}/go-co`, { flag }),

    addBenh: (ma, body) => req('POST', `/api/ho-so/${encodeURIComponent(ma)}/benh`, body),
    patchBenh: (ma, id, body) => req('PATCH', `/api/ho-so/${encodeURIComponent(ma)}/benh/${id}`, body),
    delBenh: (ma, id) => req('DELETE', `/api/ho-so/${encodeURIComponent(ma)}/benh/${id}`),
    setBenhChinh: (ma, benh_id) => req('POST', `/api/ho-so/${encodeURIComponent(ma)}/benh/set-benh-chinh`, { benh_id }),
    tuChanDoanSinhTon: (ma) => req('POST', `/api/ho-so/${encodeURIComponent(ma)}/tu-chan-doan-sinh-ton`, {}),

    searchIcd: (q) => req('GET', '/api/icd?q=' + encodeURIComponent(q)),
    // Đợt 11: nạp toàn bộ danh mục ICD 1 lần (client-side cache) — dùng để
    // lọc cục bộ trong ô gõ ICD thay vì gọi /api/icd mỗi lần gõ phím.
    getAllIcd: () => req('GET', '/api/icd/all'),

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

    listKhoaPhong: () => req('GET', '/api/khoa-phong'),
    createKhoaPhong: (body) => req('POST', '/api/khoa-phong', body),
    patchKhoaPhong: (id, body) => req('PATCH', `/api/khoa-phong/${id}`, body),

    // "Danh sách tùy chỉnh" (collection nhiều-nhiều với ho_so, list.js) —
    // action bar chọn tạm: thêm/gỡ hồ sơ khỏi danh sách, tạo/xóa danh sách.
    listDanhSach: () => req('GET', '/api/danh-sach'),
    createDanhSach: (body) => req('POST', '/api/danh-sach', body),
    deleteDanhSach: (id) => req('DELETE', `/api/danh-sach/${id}`),
    themHoSoVaoDanhSach: (id, maHoSoList) => req('POST', `/api/danh-sach/${id}/them-ho-so`, { ma_ho_so_list: maHoSoList }),
    goHoSoKhoiDanhSach: (id, maHoSoList) => req('POST', `/api/danh-sach/${id}/go-ho-so`, { ma_ho_so_list: maHoSoList }),

    listDanhMucQuanLy: () => req('GET', '/api/danh-muc-quan-ly'),
    createDanhMucQuanLy: (body) => req('POST', '/api/danh-muc-quan-ly', body),
    deleteDanhMucQuanLy: (id) => req('DELETE', `/api/danh-muc-quan-ly/${id}`),

    listPhanCongKhoa: () => req('GET', '/api/phan-cong-khoa'),
    phanCongKhoa: (body) => req('POST', '/api/phan-cong-khoa', body),
    patchPhanCongKhoa: (id, body) => req('PATCH', `/api/phan-cong-khoa/${id}`, body),
    deletePhanCongKhoa: (id) => req('DELETE', `/api/phan-cong-khoa/${id}`),

    xuatFileCotMoRong: () => req('GET', '/api/xuat-file/cot-mo-rong'),
    xuatFilePreview: (body) => req('POST', '/api/xuat-file/preview', body),
    xuatFileStart: (body) => req('POST', '/api/xuat-file', body),
    // Xuất .xlsx KÈM cột mã định danh để sửa rồi nhập lại (BLOB).
    xuatFileXlsxChinhSua: async (body) => {
      const res = await fetch('/api/xuat-file/xlsx-chinh-sua', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin', body: JSON.stringify(body),
      });
      if (!res.ok) {
        let detail = `Lỗi ${res.status}`;
        try { const d = await res.json(); if (d && d.detail) detail = d.detail; } catch (e) { /* */ }
        if (res.status === 401 && onUnauthorized) onUnauthorized();
        throw new Error(detail);
      }
      const blob = await res.blob();
      const cd = res.headers.get('Content-Disposition') || '';
      const m = /filename\*=UTF-8''([^;]+)/i.exec(cd);
      return { blob, name: m ? decodeURIComponent(m[1]) : 'KSK_ChinhSua.xlsx' };
    },
    // Nhập lại file đã sửa để đối soát. apDung=false -> xem trước. cot: mảng
    // tên field muốn cập nhật (rỗng/undefined -> tất cả cột phát hiện được).
    // maLoaiTru: mảng mã hồ sơ bị bỏ tick ở checkbox từng dòng — chỉ có tác
    // dụng khi apDung=true; các lời gọi xem trước không cần truyền.
    nhapDoiSoat: async (fileObj, apDung, choGhiDe, cot, sheet, maLoaiTru) => {
      const fd = new FormData();
      fd.append('file', fileObj);
      fd.append('ap_dung', apDung ? 'true' : 'false');
      fd.append('cho_ghi_de', choGhiDe ? 'true' : 'false');
      if (cot && cot.length) fd.append('cot', cot.join(','));
      if (sheet) fd.append('sheet', sheet);
      if (maLoaiTru && maLoaiTru.length) fd.append('ma_loai_tru', maLoaiTru.join(','));
      const res = await fetch('/api/xuat-file/nhap-doi-soat', {
        method: 'POST', body: fd, credentials: 'same-origin',
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        if (res.status === 401 && onUnauthorized) onUnauthorized();
        // 409 (cần chọn sheet) trả detail dạng OBJECT, không phải chuỗi —
        // đính kèm nguyên data để caller tự đọc detail.sheet_list.
        const detail = data && data.detail;
        const msg = typeof detail === 'string' ? detail : (detail && detail.thong_bao) || `Lỗi ${res.status}`;
        const err = new Error(msg);
        err.status = res.status;
        err.data = data;
        throw err;
      }
      return data;
    },
    xuatFileJobs: () => req('GET', '/api/xuat-file/jobs'),
    xuatFileJob: (id) => req('GET', `/api/xuat-file/jobs/${encodeURIComponent(id)}`),

    backupDanhSach: () => req('GET', '/api/backup/danh-sach'),
    backupTaoThuCong: () => req('POST', '/api/backup/tao-thu-cong'),
    backupKhoiPhuc: (duong_dan) => req('POST', '/api/backup/khoi-phuc', { duong_dan }),

    dashTongQuan: () => req('GET', '/api/dashboard/tong-quan'),
    dashTheoXa: () => req('GET', '/api/dashboard/theo-xa'),
    dashTheoKhoaPhong: () => req('GET', '/api/dashboard/theo-khoa-phong'),
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
