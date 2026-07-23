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
        renderQd1613Banner();
        renderFlagsSummary();
        if (code === 'phan_loai_sk' || /_pl$/.test(code)) renderQd1613Banner();
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
    root.appendChild(header);

    // Chẩn đoán gốc — ghim đầu, chỉ đọc (§3.4 quy tắc 2)
    const goc = document.createElement('div');
    goc.className = 'chan-doan-goc sticky';
    goc.innerHTML = `<div class="label">Chẩn đoán gốc (chỉ đọc)</div>
      <div class="content">${escapeHtml(current.chan_doan_goc || '(trống)')}</div>`;
    root.appendChild(goc);

    const banner = document.createElement('div');
    banner.id = 'qd1613-banner';
    root.appendChild(banner);

    const flagsBox = document.createElement('div');
    flagsBox.id = 'flags-summary';
    root.appendChild(flagsBox);

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
    const flags = current.co_qc_chi_tiet || [];
    box.innerHTML = '';
    if (!flags.length) { box.textContent = 'Không còn cờ cảnh báo.'; return; }
    flags.forEach((f) => {
      const chip = document.createElement('span');
      chip.className = 'flag-chip flag-' + f.muc;
      chip.title = f.y_nghia;
      chip.textContent = (f.muc === 'do' ? '🔴 ' : f.muc === 'cam' ? '🟠 ' : '🟡 ') + f.ten;
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
        tr.appendChild(td(b.co_quan || ''));
        tr.appendChild(td(b.muc_do_nang == null ? '' : b.muc_do_nang));
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
    let chosen = null;
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
            chosen = it; icdInput.value = it.label; suggBox.hidden = true;
            toast('Đã chọn: ' + it.label);
            // Đợt 11 criterion 6: tự chọn cơ quan theo chương ICD của mã
            // vừa chọn (nếu map được) — coQuanSel vẫn là select bình
            // thường, user đổi tay tự do sau đó (criterion 7).
            const organ = icdMaToCoQuan(it.ma);
            if (organ && Array.from(coQuanSel.options).some((o) => o.value === organ)) {
              coQuanSel.value = organ;
            }
          });
          suggBox.appendChild(row);
        });
        suggBox.hidden = items.length === 0;
      }, 50);
    });
    const coQuanSel = document.createElement('select');
    (danhMuc.co_quan_benh_chinh || []).forEach((c) => {
      const o = document.createElement('option'); o.value = c.ma; o.textContent = c.ten; coQuanSel.appendChild(o);
    });
    const addBtn = document.createElement('button');
    addBtn.textContent = '+ Thêm bệnh';
    addBtn.addEventListener('click', async () => {
      if (!chosen) { toast('Chưa chọn mã ICD'); return; }
      const row = await Api.addBenh(current.ma_ho_so, {
        ma_icd: chosen.ma, co_quan: coQuanSel.value, chuoi_goc: icdInput.value,
      });
      current.benh = current.benh || [];
      current.benh.push(row);
      // Xóa flag "Còn chẩn đoán chưa ánh xạ" nếu có ma_icd
      if (row.ma_icd) {
        current.co_qc_list = current.co_qc_list || [];
        current.co_qc_list = current.co_qc_list.filter((f) => f !== 'CON_CHAN_DOAN_CHUA_ANH_XA');
      }
      drawRows();
      icdInput.value = ''; chosen = null;
      toast('Đã lưu');
    });
    icdInputWrap.appendChild(icdInput);
    icdInputWrap.appendChild(suggBox);
    addForm.appendChild(icdInputWrap);
    addForm.appendChild(coQuanSel);
    addForm.appendChild(addBtn);
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
