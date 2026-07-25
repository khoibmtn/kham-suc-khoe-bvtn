// detail.js — màn hình CHI TIẾT (§3.4): khung "Chẩn đoán gốc" ghim đầu,
// 6 nhóm gập được A-F, bảng bệnh, dải cảnh báo QĐ1613, autosave.

// Các trường "suy" có cờ QC thật sự để gỡ khi xác nhận (khớp
// backend services/qc.py FIELD_TO_FLAGS) — chỉ nhóm này có ⚠ + nút xác nhận.
//
// Đợt 3 criterion 7 (phản hồi): so_cccd, khong_kinh_mat_trai/phai,
// phan_loai_sk, chieu_cao, can_nang, mach, huyet_ap đã bị RÚT khỏi danh sách
// này — theo SPEC §5 cột Nguồn, các trường này là 'data' hoặc 'trống', KHÔNG
// phải 'suy' (xem fields.js FIELD_DEFS — đã đúng), nên KHÔNG được có ⚠/nút
// Xác nhận dù hồ sơ có đang mang cờ QC liên quan (THIEU_CCCD/THIEU_SINH_HIEU/
// THI_LUC_CHUA_RO_BEN_MAT/NGUON_DANH_DAU_NHIEU_PHAN_LOAI vẫn hiện trong dải
// cảnh báo QĐ1613/flags-summary bình thường, chỉ không gắn vào riêng ô nhập).
// Chỉ giữ lại đúng 8 trường Nguồn='suy' theo SPEC §5 có cờ QC ánh xạ được.
const CONFIRMABLE_SUY_FIELDS = new Set([
  'ngay_sinh', 'ma_dan_toc', 'matinh_cu_tru', 'ma_nghe_nghiep', 'doi_tuong',
  'nguon_chi_tra', 'ly_do_vv', 'ma_loai_kcb',
]);

// Đợt 11: bảng mã chương ICD-10 (chữ cái đầu + khoảng số) -> mã cơ quan
// (dùng chung vocabulary TEN_CQ/qc.TEN_CQ: TH, HH, TIEUHOA, THAN, NOITIET,
// CXK, TK, TT, NGOAI, DALIEU, SAN, MAT, TMH, RHM). Best-effort — không phủ
// hết mọi chương (vd A-D, Q, R, S-T, Z không map -> để trống, người dùng tự
// chọn cơ quan).
const ICD_CHUONG_CO_QUAN = [
  { letter: 'E', from: 0, to: 90, organ: 'NOITIET' },
  { letter: 'F', from: 0, to: 99, organ: 'TT' },
  { letter: 'G', from: 0, to: 99, organ: 'TK' },
  { letter: 'H', from: 0, to: 59, organ: 'MAT' },
  { letter: 'H', from: 60, to: 95, organ: 'TMH' },
  { letter: 'I', from: 0, to: 99, organ: 'TH' },
  { letter: 'J', from: 0, to: 99, organ: 'HH' },
  { letter: 'K', from: 0, to: 14, organ: 'RHM' },
  { letter: 'K', from: 20, to: 93, organ: 'TIEUHOA' },
  { letter: 'L', from: 0, to: 99, organ: 'DALIEU' },
  { letter: 'M', from: 0, to: 99, organ: 'CXK' },
  { letter: 'N', from: 0, to: 53, organ: 'THAN' },
  { letter: 'N', from: 60, to: 99, organ: 'SAN' },
  { letter: 'O', from: 0, to: 99, organ: 'SAN' },
];
function icdMaToCoQuan(ma) {
  const m = /^([A-Za-z])(\d{2})/.exec((ma || '').trim());
  if (!m) return null;
  const letter = m[1].toUpperCase();
  const num = parseInt(m[2], 10);
  const found = ICD_CHUONG_CO_QUAN.find(
    (r) => r.letter === letter && num >= r.from && num <= r.to);
  return found ? found.organ : null;
}

const DetailView = (() => {
  let root, danhMuc, user;
  let current = null; // dữ liệu hồ sơ hiện tại (từ GET)
  let openFlag = false;

  // Đợt 11 criterion 3: cache toàn bộ dm_icd nạp 1 lần/phiên (module-level,
  // KHÔNG re-fetch mỗi lần renderBenhTable/mở combobox — icdAllPromise nhớ
  // lại lời gọi mạng đã chạy, các lần sau dùng chung promise đó).
  let icdAllCache = null;
  let icdAllPromise = null;
  function preloadIcdAll() {
    if (!icdAllPromise) {
      icdAllPromise = Api.getAllIcd().then((list) => {
        icdAllCache = list || [];
        return icdAllCache;
      }).catch((e) => {
        icdAllPromise = null; // cho phép thử lại lần gọi kế tiếp nếu lỗi mạng
        throw e;
      });
    }
    return icdAllPromise;
  }

  // Đợt 11 criterion 4: lọc cục bộ trên icdAllCache, mô phỏng thứ tự ưu
  // tiên của search_icd() (icd.py:23-71) — khớp MÃ (ma_tran/ma) trước, xếp
  // theo độ dài mã tăng dần; nếu chưa đủ `limit`, bổ sung khớp TÊN bệnh
  // (mọi token >=2 ký tự đều phải xuất hiện trong `ten`, AND như FTS5).
  function filterIcdLocal(q, limit) {
    limit = limit || 20;
    const list = icdAllCache || [];
    const results = new Map(); // ma -> {ma, ten}
    const likeQ = q.toUpperCase();
    list
      .filter((it) => (it.ma_tran || '').toUpperCase().startsWith(likeQ)
        || (it.ma || '').toUpperCase().startsWith(likeQ))
      .sort((a, b) => (a.ma || '').length - (b.ma || '').length)
      .slice(0, limit)
      .forEach((it) => results.set(it.ma, it.ten));

    if (results.size < limit) {
      const tokens = (q.match(/[\p{L}\p{N}]+/gu) || []).filter((t) => t.length >= 2);
      if (tokens.length) {
        const lowerTokens = tokens.map((t) => t.toLowerCase());
        for (const it of list) {
          if (results.size >= limit) break;
          if (results.has(it.ma)) continue;
          const tenLower = (it.ten || '').toLowerCase();
          if (lowerTokens.every((t) => tenLower.includes(t))) {
            results.set(it.ma, it.ten);
          }
        }
      }
    }

    return Array.from(results.entries())
      .slice(0, limit)
      .map(([ma, ten]) => ({ ma, ten, label: `${ma} — ${ten}` }));
  }

  function init(container, dm, u) {
    root = container;
    danhMuc = dm;
    user = u;
    // Đợt 11 criterion 3: nạp danh mục ICD ngay khi app khởi động (không
    // chờ user mở màn hình chi tiết) — nhưng không chặn render UI (fire &
    // forget, lỗi bỏ qua vì input handler sẽ tự gọi lại nếu cần).
    preloadIcdAll().catch(() => {});
  }

  function isOpen() { return openFlag; }
  function currentMa() { return current ? current.ma_ho_so : null; }

  async function open(ma_ho_so) {
    current = await Api.getHoSo(ma_ho_so);
    openFlag = true;
    render();
    root.hidden = false;
  }

  function close() {
    openFlag = false;
    current = null;
    root.hidden = true;
    root.innerHTML = '';
  }

  function toast(msg) {
    let t = document.getElementById('toast');
    if (!t) {
      t = document.createElement('div');
      t.id = 'toast';
      document.body.appendChild(t);
    }
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(t._timer);
    t._timer = setTimeout(() => t.classList.remove('show'), 1200);
  }

  function ctxFor() {
    return {
      catalogs: danhMuc,
      toast, // Đợt 3 criterion 8/10: widgets.js gọi khi PATCH lỗi (422 ngưỡng...) để báo toast
      icdSearch: (q) => Api.searchIcd(q),
      // Chỉ hiện ⚠ + nút xác nhận khi trường có CỜ QC thật sự đang gắn trên
      // hồ sơ này (khớp backend services/qc.py FIELD_TO_FLAGS) — các trường
      // "suy" khác (không có cờ riêng) vẫn có viền vàng thụ động (suy-field)
      // nhưng không có luồng xác nhận/gỡ cờ.
      isInferred: (code) => {
        if (!CONFIRMABLE_SUY_FIELDS.has(code)) return false;
        const flags = suyFieldFlags(code);
        if (!flags.length) return false;
        return (current.co_qc_list || []).some((f) => flags.includes(f));
      },
      suyReason: (code) => {
        const related = (current.co_qc_chi_tiet || []).find((f) =>
          suyFieldFlags(code).includes(f.ma));
        return related ? related.y_nghia : 'Giá trị do máy suy luận/mặc định — vui lòng đối chiếu.';
      },
      onConfirmSuy: async (code) => {
        const res = await Api.xacNhanSuy(current.ma_ho_so, code);
        current.co_qc = res.co_qc.join(';');
        current.co_qc_list = res.co_qc;
        current.so_loi = res.so_loi;
        toast('Đã xác nhận');
        renderFlagsSummary();
      },
      onSave: async (code, value) => {
        // PLAN_PERF.md §4: gửi kèm `_base` = giá trị field này lúc mở/lưu
        // gần nhất (client-side) — backend so sánh với DB hiện tại để phát
        // hiện "người khác vừa sửa trễ" (last-write-wins, chỉ CẢNH BÁO,
        // không chặn lưu).
        const baseVal = current[code];
        const res = await Api.patchHoSo(current.ma_ho_so, {
          [code]: value, _base: { [code]: baseVal },
        });
        Object.assign(current, res.updated);
        current.qd1613 = res.qd1613;
        current.so_loi = res.so_loi;
        current.co_qc = res.co_qc.join(';');
        current.co_qc_list = res.co_qc;
        const xungDot = res.canh_bao_xung_dot && res.canh_bao_xung_dot[code];
        if (xungDot) {
          const def = FIELD_BY_CODE[code];
          const nhan = (def && def.label) || code;
          const nguoi = xungDot.nguoi_khac || 'người khác';
          toast(`Ô ${nhan} vừa được ${nguoi} sửa — giá trị của bạn đã ghi đè.`);
        } else {
          toast('Đã lưu');
        }
        if ('chi_so_bmi' in res.updated) {
          const bmiInput = document.getElementById('f_chi_so_bmi');
          if (bmiInput) bmiInput.value = res.updated.chi_so_bmi == null ? '' : res.updated.chi_so_bmi;
        }
        // Đợt 5 criterion 1/4: chiều cao/cân nặng đổi -> backend tự tính lại
        // + ghi đè kham_the_luc_pl, chỉ trả về trong `updated` khi THỰC SỰ tự
        // đổi — nhảy radio Phân loại thể lực sang giá trị mới + chớp xanh.
        // Bỏ qua khi chính field này vừa được người dùng bấm tay (fireSave
        // trong widgets.js đã tự flash nhóm radio đó rồi, tránh lặp).
        if ('kham_the_luc_pl' in res.updated && code !== 'kham_the_luc_pl') {
          const plWrap = document.getElementById('f_kham_the_luc_pl');
          if (plWrap) {
            const val = res.updated.kham_the_luc_pl;
            plWrap.querySelectorAll('input[type=radio]').forEach((r) => {
              r.checked = Number(r.value) === Number(val);
            });
            Widgets.flashSaved(plWrap);
          }
        }
        capNhatPhanLoaiSkTuUpdated(res, code);
        renderQd1613Banner();
        renderFlagsSummary();
        if (code === 'phan_loai_sk' || /_pl$/.test(code)) renderQd1613Banner();
        // Đợt 13: nhập Mạch/HA -> phân loại CSST + tự nâng Tuần hoàn (ghi=true)
        // + tự thêm chẩn đoán chính theo sinh hiệu (HA cao->I10, mạch nhanh->R00.0)
        if (code === 'mach' || code === 'huyet_ap') {
          capNhatCSST(true);
          autoChanDoanSinhTon();
        }
      },
    };
  }

  function suyFieldFlags(code) {
    // Chỉ còn ngay_sinh có cờ QC ánh xạ trong CONFIRMABLE_SUY_FIELDS hiện tại
    // (criterion 7) — các trường khác trong tập này (ma_dan_toc,
    // matinh_cu_tru, ma_nghe_nghiep, doi_tuong, nguon_chi_tra, ly_do_vv,
    // ma_loai_kcb) chưa có cờ QC riêng ở backend nên isInferred() luôn false
    // cho chúng (không có ⚠/Xác nhận) — vẫn có viền vàng thụ động qua
    // fields.js nguon='suy' (fieldWrap) để phân biệt với dữ liệu gốc.
    const map = {
      ngay_sinh: ['NGAY_SINH_UOC_LUONG', 'NAM_SINH_SAI_NGUON'],
    };
    return map[code] || [];
  }

  // Đợt 6 criterion 3: 2 dòng phụ nhỏ dưới tên BN — Dòng 1 năm sinh/giới/
  // CCCD, Dòng 2 địa chỉ cư trú · ngày khám. Đọc lại từ `current` mỗi lần
  // render() (kể cả khi mở hồ sơ khác qua Ctrl+↓↑ — open() luôn gọi render()
  // sau khi GET dữ liệu mới).
  function headerLine1(rec) {
    const namSinh = (rec.ngay_sinh || '').slice(-4) || '—';
    const gioi = rec.gioi_tinh || '—';
    const cccd = rec.so_cccd || '—';
    return `Năm sinh: ${namSinh} · ${gioi} · CCCD: ${cccd}`;
  }

  function headerLine2(rec) {
    const parts = [rec.matinh_cu_tru, rec.maxa_cu_tru, rec.dia_chi].filter((p) => p);
    const diaChi = parts.length ? parts.join(' / ') : '—';
    const kham = rec.ngay_vao || '—';
    return `${diaChi} · Khám: ${kham}`;
  }

  // Hàng 4 checkbox "Đã rà soát xong:" ngay trên nút Hoàn thành. Mỗi ô tự
  // lưu (PATCH cột rs_*), lỗi thì hoàn trạng thái + báo. Không đụng cờ QC.
  const RS_ITEMS = [
    ['rs_hanh_chinh', 'Thông tin hành chính'],
    ['rs_sinh_ton', 'Chỉ số sinh tồn'],
    ['rs_the_luc', 'Thể lực'],
    ['rs_canh_bao_khac', 'Tất cả cảnh báo khác'],
  ];

  function renderRaSoatXong() {
    const wrap = document.createElement('div');
    wrap.className = 'detail-rasoat';
    const lab = document.createElement('span');
    lab.className = 'detail-rasoat-label';
    lab.textContent = 'Đã rà soát xong:';
    wrap.appendChild(lab);
    RS_ITEMS.forEach(([code, label]) => {
      const item = document.createElement('label');
      item.className = 'detail-rasoat-item';
      const cb = document.createElement('input');
      cb.type = 'checkbox';
      cb.checked = !!Number(current[code]);
      cb.addEventListener('change', async () => {
        const target = cb.checked ? 1 : 0;
        cb.disabled = true;
        try {
          const res = await Api.patchHoSo(current.ma_ho_so, {
            [code]: target, _base: { [code]: current[code] },
          });
          Object.assign(current, res.updated);
          if (typeof res.so_loi !== 'undefined') current.so_loi = res.so_loi;
          if (res.co_qc) { current.co_qc = res.co_qc.join(';'); current.co_qc_list = res.co_qc; }
          toast('Đã lưu');
        } catch (e) {
          cb.checked = !cb.checked;
          toast('Lỗi: ' + (e.message || 'không lưu được'));
        } finally {
          cb.disabled = false;
        }
      });
      item.appendChild(cb);
      item.appendChild(document.createTextNode(' ' + label));
      wrap.appendChild(item);
    });
    return wrap;
  }

  function render() {
    root.innerHTML = '';

    // Khối GHIM ĐẦU (Đợt 13, phản hồi anh Khôi): giữ dính khi cuộn CẢ thông
    // tin bệnh nhân + chẩn đoán gốc + cờ cảnh báo (trước chỉ ghim chẩn đoán
    // gốc). position:sticky trên container này (xem .detail-sticky-top).
    const stickyTop = document.createElement('div');
    stickyTop.className = 'detail-sticky-top';
    root.appendChild(stickyTop);

    const header = document.createElement('div');
    header.className = 'detail-header';
    header.innerHTML = `<div class="detail-header-info">
        <div class="detail-header-name">${escapeHtml(current.ho_ten || '')}
          <span class="detail-header-mahoso">(${escapeHtml(current.ma_ho_so)})</span>
        </div>
        <div class="detail-header-sub">${escapeHtml(headerLine1(current))}</div>
        <div class="detail-header-sub">${escapeHtml(headerLine2(current))}</div>
      </div>`;
    const closeBtn = document.createElement('button');
    closeBtn.textContent = 'Đóng (Esc)';
    closeBtn.addEventListener('click', () => AppShell.closeDetail());
    header.appendChild(closeBtn);
    stickyTop.appendChild(header);

    // Chẩn đoán gốc — chỉ đọc (§3.4 quy tắc 2). Nằm trong khối ghim chung.
    const goc = document.createElement('div');
    goc.className = 'chan-doan-goc';
    goc.innerHTML = `<div class="label">Chẩn đoán gốc (chỉ đọc)</div>
      <div class="content">${escapeHtml(current.chan_doan_goc || '(trống)')}</div>`;
    stickyTop.appendChild(goc);

    const banner = document.createElement('div');
    banner.id = 'qd1613-banner';
    stickyTop.appendChild(banner);

    const flagsBox = document.createElement('div');
    flagsBox.id = 'flags-summary';
    stickyTop.appendChild(flagsBox);

    // Ghi chú phân loại theo Chỉ số sinh tồn (Mạch + Huyết áp) — Đợt 13.
    // Gắn vào NHÓM C (Thể lực & sinh hiệu) ngay dưới các ô — xem vòng lặp nhóm.
    const csstNote = document.createElement('div');
    csstNote.id = 'csst-note';

    const actions = document.createElement('div');
    actions.className = 'detail-actions';
    actions.appendChild(renderRaSoatXong());
    const doneBtn = document.createElement('button');
    doneBtn.textContent = 'Hoàn thành (Ctrl+S)';
    doneBtn.addEventListener('click', () => AppShell.markHoanThanh());
    actions.appendChild(doneBtn);
    root.appendChild(actions);

    const groupsContainer = document.createElement('div');
    groupsContainer.id = 'groups';
    FIELD_GROUPS.forEach((g, idx) => {
      const details = document.createElement('details');
      // Tiêu chí 9 — mọi nhóm A-F mặc định MỞ khi mở hồ sơ (vẫn gập được
      // thủ công; Alt+N vẫn nhảy tới và ép mở lại nếu user đã gập tay).
      details.open = true;
      details.id = 'group_' + g.key;
      details.dataset.groupIdx = idx + 1;
      const summary = document.createElement('summary');
      summary.textContent = g.ten + ` (Alt+${idx + 1})`;
      details.appendChild(summary);
      if (g.key === 'D') {
        // Tiêu chí 11 — nhóm D dạng card theo cơ quan (xem ORGAN_CARDS_D).
        details.appendChild(renderOrganCards());
      } else {
        const grid = document.createElement('div');
        grid.className = 'field-grid';
        fieldsOfGroup(g.key).forEach((def) => {
          grid.appendChild(Widgets.renderField(def, current[def.code], ctxFor()));
        });
        details.appendChild(grid);
      }
      // Đợt 13: dòng "Phân loại CSST" nằm ngay trong frame Thể lực & sinh hiệu.
      if (g.key === 'C') details.appendChild(csstNote);
      groupsContainer.appendChild(details);
    });
    root.appendChild(groupsContainer);

    // Bảng bệnh (Alt+7) — mặc định mở luôn (tiêu chí 9).
    const benhDetails = document.createElement('details');
    benhDetails.open = true;
    benhDetails.id = 'group_benh';
    benhDetails.dataset.groupIdx = '7';
    benhDetails.innerHTML = '<summary>Bảng bệnh (Alt+7)</summary>';
    benhDetails.appendChild(renderBenhTable());
    root.appendChild(benhDetails);

    renderQd1613Banner();
    renderFlagsSummary();
    capNhatCSST(true);    // mở hồ sơ: hiện ghi chú CSST + tự nâng Tuần hoàn
    autoChanDoanSinhTon(); // mở hồ sơ: tự thêm chẩn đoán chính theo sinh hiệu
  }

  // ---- Đợt 13 (phản hồi anh Khôi): tự thêm chẩn đoán chính theo sinh hiệu ----
  // Hồ sơ CHƯA có bệnh chính + HA cao (->I10) / mạch nhanh (->R00.0): backend
  // tự thêm bệnh chính rồi gỡ cờ "Có phân loại nhưng không có chẩn đoán".
  // Chạy cả khi mở hồ sơ và khi sửa Mạch/Huyết áp (xem onSave). Im lặng nếu lỗi.
  function refreshBenhTable() {
    const bd = document.getElementById('group_benh');
    if (!bd) return;
    bd.innerHTML = '<summary>Bảng bệnh (Alt+7)</summary>';
    bd.appendChild(renderBenhTable());
  }
  function syncBenhChinhFields() {
    const kl = document.getElementById('f_ket_luan_benh');
    if (kl && kl.querySelector('input')) kl.querySelector('input').value = current.ket_luan_benh || '';
    const mbc = document.getElementById('f_ma_benh_chinh');
    if (mbc) mbc.value = current.ma_benh_chinh || '';
    const cqbc = document.getElementById('f_co_quan_benh_chinh');
    if (cqbc) cqbc.value = current.co_quan_benh_chinh || '';
  }
  async function autoChanDoanSinhTon() {
    let res;
    try {
      res = await Api.tuChanDoanSinhTon(current.ma_ho_so);
    } catch (e) { return; }
    if (!res || !res.added || !res.added.length) return;
    current.benh = res.benh;
    current.ma_benh_chinh = res.ma_benh_chinh;
    current.ket_luan_benh = res.ket_luan_benh;
    current.co_quan_benh_chinh = res.co_quan_benh_chinh;
    current.qd1613 = res.qd1613;
    if (res.co_qc) {
      current.co_qc_list = res.co_qc;
      current.co_qc = res.co_qc.join(';');
      if (res.so_loi != null) current.so_loi = res.so_loi;
    }
    refreshBenhTable();
    syncBenhChinhFields();
    renderFlagsSummary();
    renderQd1613Banner();
    // Phản hồi anh Khôi: tự thêm chẩn đoán xong -> có thể kéo theo tự nâng
    // Phân loại sức khỏe chung (server đã tính) — nhảy radio nếu đổi.
    if (res.phan_loai_sk != null && Number(res.phan_loai_sk) !== Number(current.phan_loai_sk)) {
      current.phan_loai_sk = res.phan_loai_sk;
      const wrap = document.getElementById('f_phan_loai_sk');
      if (wrap) {
        wrap.querySelectorAll('input[type=radio]').forEach((r) => {
          r.checked = Number(r.value) === Number(res.phan_loai_sk);
        });
        if (window.Widgets && Widgets.flashSaved) Widgets.flashSaved(wrap);
      }
    }
    toast('Tự thêm chẩn đoán theo sinh hiệu: ' + res.added.map((a) => a.ma_icd).join(', '));
  }

  // ---- Đợt 13: tự phân loại theo Chỉ số sinh tồn (Mạch + Huyết áp) ----
  // Ngưỡng QĐ1613: Mạch mục 46.1; Huyết áp mục 45 theo BĂNG TUỔI (<30t = 45.1;
  // >=30t dùng bảng 45.2 — QĐ1613 KHÔNG có băng >50t nên lấy gần nhất). Lấy
  // LOẠI CAO NHẤT (xấu nhất) của Mạch & HA, rồi NÂNG Tuần hoàn nếu đang thấp hơn.
  function _tuoiHienTai() {
    if (current.tuoi != null && current.tuoi !== '') {
      const t = parseInt(current.tuoi, 10);
      if (!isNaN(t) && t > 0) return t;
    }
    const nam = parseInt(String(current.ngay_sinh || '').slice(-4), 10);
    if (!isNaN(nam) && nam > 1900) return new Date().getFullYear() - nam;
    return null;
  }
  function classifyMach(bpm) {
    if (!isFinite(bpm) || bpm <= 0) return null;
    if (bpm < 55) return 4;
    if (bpm <= 59) return 3;   // 55-59
    if (bpm <= 75) return 1;   // 60-75
    if (bpm <= 85) return 2;   // 76-85
    if (bpm <= 95) return 3;   // 86-95
    return 4;                  // >95
  }
  function _clsSys(sys, tuoi) {
    if (tuoi != null && tuoi < 30) {         // 45.1 (<30t)
      if (sys < 100) return 4;
      if (sys <= 125) return 1;
      if (sys <= 135) return 2;
      if (sys <= 140) return 3;
      return 4;
    }
    if (sys < 140) return 1;                 // 45.2 (>=30t)
    if (sys <= 150) return 3;
    return 4;
  }
  function _clsDia(dia, tuoi) {
    if (tuoi != null && tuoi < 30) {         // 45.1
      if (dia < 60) return 4;
      if (dia <= 64) return 2;
      if (dia <= 85) return 1;
      if (dia <= 89) return 2;
      if (dia <= 95) return 3;
      return 4;
    }
    if (dia < 90) return 1;                  // 45.2
    if (dia <= 95) return 3;
    return 4;
  }
  function classifyHuyetAp(ha, tuoi) {
    const m = String(ha || '').match(/(\d{2,3})\s*[/\-]\s*(\d{2,3})/);
    if (!m) return null;
    return Math.max(_clsSys(+m[1], tuoi), _clsDia(+m[2], tuoi));
  }
  // Phản hồi anh Khôi: backend tự NÂNG Phân loại sức khỏe chung sau MỌI
  // PATCH có thể đổi phân loại 1 cơ quan (trả kèm trong res.updated nếu có
  // đổi) — nhảy radio "Phân loại sức khỏe" + chớp xanh, GIỐNG hệt cách xử lý
  // kham_the_luc_pl ở trên. Bỏ qua khi chính field vừa sửa là phan_loai_sk
  // (đã tự flash ở widgets.js, tránh lặp).
  function capNhatPhanLoaiSkTuUpdated(res, code) {
    if (!res || !res.updated || !('phan_loai_sk' in res.updated) || code === 'phan_loai_sk') return;
    current.phan_loai_sk = res.updated.phan_loai_sk;
    const wrap = document.getElementById('f_phan_loai_sk');
    if (wrap) {
      wrap.querySelectorAll('input[type=radio]').forEach((r) => {
        r.checked = Number(r.value) === Number(res.updated.phan_loai_sk);
      });
      if (window.Widgets && Widgets.flashSaved) Widgets.flashSaved(wrap);
    }
  }

  function capNhatCSST(ghi) {
    const box = document.getElementById('csst-note');
    if (!box) return;
    const tuoi = _tuoiHienTai();
    const machBpm = parseFloat(String(current.mach || '').replace(',', '.'));
    const lMach = classifyMach(machBpm);
    const lHa = classifyHuyetAp(current.huyet_ap, tuoi);
    if (lMach == null && lHa == null) { box.innerHTML = ''; return; }
    const loai = Math.max(lMach || 0, lHa || 0);
    const LM = ['I', 'II', 'III', 'IV', 'V'][loai - 1];
    const parts = [];
    if (lMach === loai) parts.push(`Mạch ${machBpm} l/ph`);
    if (lHa === loai) parts.push(`HA ${escapeHtml(current.huyet_ap || '')}`);
    box.innerHTML = `<span class="csst-badge csst-${loai}">Phân loại CSST: Loại ${LM}</span>`
      + ` <span class="csst-detail">(${parts.join(' · ')})</span>`;
    if (!ghi) return;
    const curTH = (current.noi_khoa_tuan_hoan_pl == null || current.noi_khoa_tuan_hoan_pl === '')
      ? 0 : parseInt(current.noi_khoa_tuan_hoan_pl, 10);
    if (loai > curTH) {   // chỉ NÂNG, không hạ
      Api.patchHoSo(current.ma_ho_so, {
        noi_khoa_tuan_hoan_pl: loai,
        _base: { noi_khoa_tuan_hoan_pl: current.noi_khoa_tuan_hoan_pl },
      }).then((res) => {
        current.noi_khoa_tuan_hoan_pl = loai;
        const wrap = document.getElementById('f_noi_khoa_tuan_hoan_pl');
        if (wrap) {
          wrap.querySelectorAll('input[type=radio]').forEach((r) => {
            r.checked = Number(r.value) === loai;
          });
          if (window.Widgets && Widgets.flashSaved) Widgets.flashSaved(wrap);
        }
        if (res && res.qd1613) { current.qd1613 = res.qd1613; renderQd1613Banner(); }
        capNhatPhanLoaiSkTuUpdated(res, 'noi_khoa_tuan_hoan_pl');
        toast(`Tuần hoàn tự nâng Loại ${LM} theo sinh hiệu`);
      }).catch(() => {});
    }
  }

  function renderQd1613Banner() {
    const banner = document.getElementById('qd1613-banner');
    if (!banner) return;
    const qd = current.qd1613;
    if (qd && qd.vi_pham) {
      banner.className = 'qd1613-banner vi-pham';
      banner.innerHTML = `⚠ Vi phạm bất biến QĐ1613: cơ quan
        <strong>${qd.ten_co_quan_max}</strong> đang ở mức
        <strong>${qd.gia_tri_max}</strong> nhưng Phân loại sức khỏe chung đang
        là <strong>${current.phan_loai_sk || '(trống)'}</strong>.
        <button id="btn-lay-muc-nang-nhat">Lấy theo mức nặng nhất</button>`;
      document.getElementById('btn-lay-muc-nang-nhat').addEventListener('click', async () => {
        const res = await Api.patchHoSo(current.ma_ho_so, { phan_loai_sk: qd.gia_tri_max });
        Object.assign(current, res.updated);
        current.qd1613 = res.qd1613;
        const el = document.getElementById('f_phan_loai_sk');
        if (el) {
          el.querySelectorAll('input[type=radio]').forEach((r) => {
            r.checked = Number(r.value) === qd.gia_tri_max;
          });
        }
        toast('Đã lưu');
        renderQd1613Banner();
      });
    } else {
      banner.className = 'qd1613-banner';
      banner.innerHTML = '';
    }
  }

  function renderFlagsSummary() {
    const box = document.getElementById('flags-summary');
    if (!box) return;
    // Đợt 12: dựng chip TỪ co_qc_list (được MỌI luồng cập nhật: PATCH, xác
    // nhận suy, gỡ thủ công, thêm bệnh) + tra metadata từ danh mục -> chip
    // luôn đồng bộ (sửa lỗi cũ: chỉ đọc co_qc_chi_tiet nên chip không mất sau
    // khi gỡ cờ). Fallback co_qc_chi_tiet cho lần tải đầu nếu list trống.
    const metaBy = {};
    (danhMuc.co_qc || []).forEach((f) => { metaBy[f.ma] = f; });
    let flags = (current.co_qc_list || []).map((ma) => {
      const m = metaBy[ma] || {};
      return { ma, ten: m.ten || ma, muc: m.muc || null, y_nghia: m.y_nghia || '' };
    });
    if (!flags.length && current.co_qc_chi_tiet) flags = current.co_qc_chi_tiet;
    box.innerHTML = '';
    if (!flags.length) { box.textContent = 'Không còn cờ cảnh báo.'; return; }
    flags.forEach((f) => {
      const chip = document.createElement('span');
      chip.className = 'flag-chip flag-' + f.muc;
      chip.title = f.y_nghia;
      const label = document.createElement('span');
      label.textContent = (f.muc === 'do' ? '🔴 ' : f.muc === 'cam' ? '🟠 ' : '🟡 ') + f.ten;
      chip.appendChild(label);
      // Nút ✕ gỡ cờ thủ công — nhân viên đã kiểm tra, xác định KHÔNG phải lỗi.
      const x = document.createElement('button');
      x.type = 'button';
      x.className = 'flag-chip-x';
      x.textContent = '✕';
      x.title = 'Gỡ cảnh báo này (đã kiểm tra, không phải lỗi)';
      x.addEventListener('click', async (e) => {
        e.stopPropagation();
        if (!confirm(`Gỡ cảnh báo "${f.ten}"?\n\nChỉ gỡ khi bạn đã kiểm tra và xác`
          + ` định đây KHÔNG phải lỗi. Thao tác được ghi nhật ký.`)) return;
        try {
          const res = await Api.goCoThuCong(current.ma_ho_so, f.ma);
          current.co_qc_list = res.co_qc;
          current.co_qc = res.co_qc.join(';');
          current.so_loi = res.so_loi;
          renderFlagsSummary();
          toast('Đã gỡ cảnh báo');
        } catch (err) {
          toast('Lỗi gỡ cảnh báo: ' + err.message);
        }
      });
      chip.appendChild(x);
      box.appendChild(chip);
    });
  }

  // Tiêu chí 11 — mỗi cơ quan (ORGAN_CARDS_D, fields.js) render thành 1 card:
  // header = tên cơ quan, body = (các) ô kết quả khám rồi hàng radio phân
  // loại NGAY DƯỚI, dính nhau trong cùng card. Card tự xuống dòng theo grid
  // responsive nên kết quả/phân loại của 1 cơ quan không bao giờ tách rời.
  function renderOrganCards() {
    const wrap = document.createElement('div');
    wrap.className = 'organ-cards';
    ORGAN_CARDS_D.forEach((card) => {
      const cardEl = document.createElement('div');
      cardEl.className = 'organ-card';
      const head = document.createElement('div');
      head.className = 'organ-card-head';
      head.textContent = card.title;
      cardEl.appendChild(head);
      const body = document.createElement('div');
      body.className = 'organ-card-body';
      card.fields.forEach((code) => {
        const def = FIELD_BY_CODE[code];
        if (!def) return;
        body.appendChild(Widgets.renderField(def, current[def.code], ctxFor()));
      });
      cardEl.appendChild(body);
      wrap.appendChild(cardEl);
    });
    return wrap;
  }

  function renderBenhTable() {
    const wrap = document.createElement('div');
    wrap.className = 'benh-table-wrap';
    const table = document.createElement('table');
    table.className = 'benh-table';
    table.innerHTML = `<thead><tr><th>Chính</th><th>ICD</th><th>Cơ quan</th>
      <th>Mức độ</th><th>Chuỗi gốc</th><th>Nguồn ánh xạ</th><th></th></tr></thead>`;
    const tbody = document.createElement('tbody');
    table.appendChild(tbody);
    wrap.appendChild(table);

    function drawRows() {
      tbody.innerHTML = '';
      (current.benh || []).forEach((b) => {
        const tr = document.createElement('tr');
        const tdChinh = document.createElement('td');
        const radio = document.createElement('input');
        radio.type = 'radio'; radio.name = 'benh_chinh'; radio.checked = !!b.la_benh_chinh;
        radio.addEventListener('change', async () => {
          const res = await Api.setBenhChinh(current.ma_ho_so, b.id);
          current.ma_benh_chinh = res.ma_benh_chinh;
          current.ket_luan_benh = res.ket_luan_benh;
          current.co_quan_benh_chinh = res.co_quan_benh_chinh;
          current.qd1613 = res.qd1613;
          current.benh.forEach((x) => { x.la_benh_chinh = x.id === b.id ? 1 : 0; });
          const kl = document.getElementById('f_ket_luan_benh');
          if (kl) kl.querySelector('input').value = res.ket_luan_benh || '';
          const mbc = document.getElementById('f_ma_benh_chinh');
          if (mbc) mbc.value = res.ma_benh_chinh || '';
          const cqbc = document.getElementById('f_co_quan_benh_chinh');
          if (cqbc) cqbc.value = res.co_quan_benh_chinh || '';
          toast('Đã lưu');
          renderQd1613Banner();
        });
        tdChinh.appendChild(radio);
        tr.appendChild(tdChinh);
        tr.appendChild(td(`${b.ma_icd || ''} — ${b.ten_icd || ''}`));
        tr.appendChild(tdCoQuanSua(b));
        tr.appendChild(tdMucDoSua(b));
        tr.appendChild(td(b.chuoi_goc || ''));
        tr.appendChild(td(b.nguon_anh_xa || ''));
        const tdDel = document.createElement('td');
        const delBtn = document.createElement('button');
        delBtn.textContent = 'Xóa';
        delBtn.addEventListener('click', async () => {
          await Api.delBenh(current.ma_ho_so, b.id);
          current.benh = current.benh.filter((x) => x.id !== b.id);
          drawRows();
          toast('Đã lưu');
        });
        tdDel.appendChild(delBtn);
        tr.appendChild(tdDel);
        tbody.appendChild(tr);
      });
    }
    function td(text) { const t = document.createElement('td'); t.textContent = text; return t; }

    // Đợt 14 (phản hồi anh Khôi): "Cơ quan" tự động ánh xạ theo chương ICD
    // đôi khi sai (vd N82.x mã lấy chương N nhưng thực tế đôi khi thuộc
    // Sản phụ khoa chứ không phải Thận-TN-SD như bảng ánh xạ mặc định) —
    // trước đây KHÔNG sửa được sau khi đã thêm vào bảng bệnh (chỉ chọn được
    // lúc thêm mới). Giờ sửa TRỰC TIẾP trên dòng đã thêm, PATCH ngay khi đổi.
    function tdCoQuanSua(b) {
      const t = document.createElement('td');
      const sel = document.createElement('select');
      sel.className = 'benh-inline-select';
      const optBlank = document.createElement('option');
      optBlank.value = ''; optBlank.textContent = '—';
      sel.appendChild(optBlank);
      (danhMuc.co_quan_benh_chinh || []).forEach((c) => {
        const o = document.createElement('option'); o.value = c.ma; o.textContent = c.ten;
        if (c.ma === b.co_quan) o.selected = true;
        sel.appendChild(o);
      });
      sel.addEventListener('change', async () => {
        const giaTriCu = b.co_quan;
        try {
          const res = await Api.patchBenh(current.ma_ho_so, b.id, { co_quan: sel.value || null });
          b.co_quan = res.co_quan;
          // Dòng vừa sửa ĐANG LÀ bệnh chính -> backend trả kèm
          // _co_quan_benh_chinh, đồng bộ luôn ô "Cơ quan bệnh chính".
          if (res._co_quan_benh_chinh !== undefined) {
            current.co_quan_benh_chinh = res._co_quan_benh_chinh;
            const cqbc = document.getElementById('f_co_quan_benh_chinh');
            if (cqbc) cqbc.value = res._co_quan_benh_chinh || '';
          }
          toast('Đã lưu');
        } catch (err) {
          sel.value = giaTriCu || '';
          toast('Lỗi: ' + err.message);
        }
      });
      t.appendChild(sel);
      return t;
    }

    // "Mức độ" (1-5, QĐ1613) — cũng sửa trực tiếp được, tương tự Cơ quan.
    function tdMucDoSua(b) {
      const t = document.createElement('td');
      const sel = document.createElement('select');
      sel.className = 'benh-inline-select benh-inline-select-sm';
      [['', '—'], ['1', '1'], ['2', '2'], ['3', '3'], ['4', '4'], ['5', '5']].forEach(([v, label]) => {
        const o = document.createElement('option'); o.value = v; o.textContent = label;
        if (String(b.muc_do_nang == null ? '' : b.muc_do_nang) === v) o.selected = true;
        sel.appendChild(o);
      });
      sel.addEventListener('change', async () => {
        const giaTriCu = b.muc_do_nang;
        try {
          const val = sel.value === '' ? null : Number(sel.value);
          const res = await Api.patchBenh(current.ma_ho_so, b.id, { muc_do_nang: val });
          b.muc_do_nang = res.muc_do_nang;
          toast('Đã lưu');
        } catch (err) {
          sel.value = giaTriCu == null ? '' : String(giaTriCu);
          toast('Lỗi: ' + err.message);
        }
      });
      t.appendChild(sel);
      return t;
    }

    drawRows();

    const addForm = document.createElement('div');
    addForm.className = 'benh-add-form';

    // Wrapper để position:relative cho popup dưới input (không che lấn)
    const icdInputWrap = document.createElement('div');
    icdInputWrap.className = 'icd-input-wrap';

    const icdInput = document.createElement('input');
    icdInput.type = 'text'; icdInput.placeholder = 'Gõ để tìm ICD...';
    const suggBox = document.createElement('div'); suggBox.className = 'icd-suggestions';
    suggBox.hidden = true;
    let dTimer = null;
    // Đợt 11 criterion 3: đảm bảo cache sẵn sàng khi user mở ô ICD của bảng
    // bệnh này (idempotent — không gây thêm request nếu init() đã nạp xong).
    preloadIcdAll().catch(() => {});
    icdInput.addEventListener('input', () => {
      clearTimeout(dTimer);
      const q = icdInput.value.trim();
      if (!q) { suggBox.innerHTML = ''; suggBox.hidden = true; return; }
      // Đợt 11 criterion 5: lọc cục bộ (không gọi mạng) -> debounce chỉ còn
      // để gộp phím gõ liên tiếp trong 1 khung hình, không phải chờ round-trip.
      dTimer = setTimeout(() => {
        const items = icdAllCache ? filterIcdLocal(q, 20) : [];
        suggBox.innerHTML = '';
        items.forEach((it) => {
          const row = document.createElement('div');
          row.className = 'icd-item';
          row.textContent = it.label;
          row.addEventListener('mousedown', (e) => {
            e.preventDefault();
            suggBox.hidden = true;
            // Đợt 11 criterion 6: tự chọn cơ quan theo chương ICD của mã
            // vừa chọn (nếu map được) — coQuanSel vẫn là select bình
            // thường, user đổi tay tự do sau đó (criterion 7).
            const organ = icdMaToCoQuan(it.ma);
            if (organ && Array.from(coQuanSel.options).some((o) => o.value === organ)) {
              coQuanSel.value = organ;
            }
            // Đợt 14 (phản hồi anh Khôi): CLICK là tự thêm luôn, không cần
            // bấm "+ Thêm bệnh" — chuỗi gốc = nhãn gợi ý (mã + tên chính
            // thức), giữ nguyên hành vi ghi "chuoi_goc" cũ (trước đây lấy
            // từ icdInput.value lúc bấm nút, cũng chính là it.label).
            doAddBenh(it, coQuanSel.value, it.label);
          });
          suggBox.appendChild(row);
        });
        suggBox.hidden = items.length === 0;
        // Đợt 12: tự cuộn panel để popup gợi ý luôn nằm trong tầm nhìn,
        // không bắt user cuộn tay. block:'nearest' -> không giật khi đã
        // hiển thị sẵn (chỉ cuộn phần thiếu).
        if (!suggBox.hidden) {
          suggBox.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
        }
      }, 50);
    });
    icdInput.addEventListener('keydown', (e) => {
      // Đợt 12: Esc trong ô này chỉ xóa nội dung đang gõ + đóng gợi ý,
      // KHÔNG được nổi bọt lên global handler (keyboard.js) làm đóng cả
      // panel chi tiết — theo đúng pattern combobox ICD khác trong form
      // (xem widgets.js icd-suggestions Escape handler).
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        icdInput.value = '';
        suggBox.innerHTML = '';
        suggBox.hidden = true;
      }
    });
    const coQuanSel = document.createElement('select');
    (danhMuc.co_quan_benh_chinh || []).forEach((c) => {
      const o = document.createElement('option'); o.value = c.ma; o.textContent = c.ten; coQuanSel.appendChild(o);
    });
    // Đợt 14 (phản hồi anh Khôi): click 1 gợi ý ICD = tự thêm ngay, không cần
    // nút "+ Thêm bệnh" riêng nữa (bỏ nút). Nếu hồ sơ CHƯA có bệnh nào, mã
    // vừa thêm TỰ ĐỘNG thành bệnh chính (backend quyết định + đồng bộ ô Kết
    // luận/Mã bệnh chính/Cơ quan — xem _ma_benh_chinh/_ket_luan_benh trong
    // response, khớp field trả về của /tu-chan-doan-sinh-ton).
    async function doAddBenh(item, coQuan, chuoiGoc) {
      const res = await Api.addBenh(current.ma_ho_so, {
        ma_icd: item.ma, co_quan: coQuan, chuoi_goc: chuoiGoc,
      });
      const coQc = res._co_qc; const soLoi = res._so_loi;
      const maBenhChinh = res._ma_benh_chinh; const ketLuanBenh = res._ket_luan_benh;
      const coQuanBenhChinh = res._co_quan_benh_chinh; const qd1613 = res._qd1613;
      delete res._co_qc; delete res._so_loi; delete res._ma_benh_chinh;
      delete res._ket_luan_benh; delete res._co_quan_benh_chinh; delete res._qd1613;
      current.benh = current.benh || [];
      current.benh.push(res);
      if (coQc) {
        current.co_qc_list = coQc;
        current.co_qc = coQc.join(';');
        if (soLoi != null) current.so_loi = soLoi;
        renderFlagsSummary();
      }
      const vuaThanhBenhChinh = maBenhChinh && current.ma_benh_chinh !== maBenhChinh;
      if (vuaThanhBenhChinh) {
        current.ma_benh_chinh = maBenhChinh;
        current.ket_luan_benh = ketLuanBenh;
        current.co_quan_benh_chinh = coQuanBenhChinh;
        current.qd1613 = qd1613;
        syncBenhChinhFields();
        renderQd1613Banner();
      }
      drawRows();
      icdInput.value = '';
      toast(vuaThanhBenhChinh ? 'Đã thêm — đặt làm bệnh chính' : 'Đã lưu');
    }
    icdInputWrap.appendChild(icdInput);
    icdInputWrap.appendChild(suggBox);
    addForm.appendChild(icdInputWrap);
    addForm.appendChild(coQuanSel);
    wrap.appendChild(addForm);
    return wrap;
  }

  function focusGroup(n) {
    const el = n <= 6 ? document.getElementById('group_' + FIELD_GROUPS[n - 1].key)
      : document.getElementById('group_benh');
    if (!el) return;
    el.open = true;
    el.scrollIntoView({ block: 'start' });
    const firstInput = el.querySelector('input, textarea, select, [tabindex]');
    if (firstInput) firstInput.focus();
  }

  function focusEditCurrentField() {
    const active = document.activeElement;
    if (root.contains(active)) return; // đã đang ở 1 ô -> để nguyên
    const firstInput = root.querySelector('.field input, .field textarea, .field select');
    if (firstInput) firstInput.focus();
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
    }[c]));
  }

  return { init, open, close, isOpen, currentMa, focusGroup, focusEditCurrentField, toast };
})();
