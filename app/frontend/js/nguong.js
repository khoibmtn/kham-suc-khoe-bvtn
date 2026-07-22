// nguong.js — Đợt 3 criterion 8: kiểm ngưỡng sinh hiệu phía CLIENT, logic
// khớp 1:1 với backend services/sinh_hieu_valid.py (mach/chieu_cao/can_nang
// numeric range; huyet_ap tự tách "12080" -> "120/80" khi có đúng 1 cách hợp
// lệ). Dùng để tiền kiểm khi blur (tránh round-trip lỗi 422 không cần thiết)
// ở CẢ widgets.js (nhóm C màn chi tiết) lẫn sinhhieu.js (grid nhập nhanh).
// Server vẫn là nguồn chân lý cuối — lỗi 422 từ server vẫn được xử lý riêng
// (belt & braces) ở nơi gọi Api.patchHoSo/Api.sinhHieuPatch.
//
// Ngưỡng được AppShell nạp 1 lần sau đăng nhập (GET /api/cai-dat) và cache ở
// đây qua setNguong(); nếu chưa có cache (vd lỗi mạng lúc boot) mọi check()
// trả hợp lệ (không chặn nhập liệu — server vẫn kiểm lại).

const NguongCheck = (() => {
  let nguong = null;

  function setNguong(n) { nguong = n || null; }
  function getNguong() { return nguong; }

  function fmtNum(n) {
    return String(Number(n));
  }

  function checkHuyetAp(rawValue) {
    const raw = rawValue;
    const s = String(raw == null ? '' : raw).trim();
    if (!s) return { ok: true, value: raw };
    if (!nguong || !nguong.ha_tam_thu || !nguong.ha_tam_truong) return { ok: true, value: raw };
    const ha = nguong.ha_tam_thu;
    const hd = nguong.ha_tam_truong;

    function validPair(sv, dv) {
      return sv >= ha.min && sv <= ha.max && dv >= hd.min && dv <= hd.max && sv > dv;
    }

    for (const sep of ['/', '-']) {
      if (s.includes(sep)) {
        const parts = s.split(sep).map((p) => p.trim());
        if (parts.length !== 2 || !parts.every((p) => /^\d+$/.test(p))) {
          return {
            ok: false,
            ly_do: `Huyết áp '${raw}' không đúng định dạng — cần dạng tâm_thu/tâm_trương, ví dụ 120/80`,
          };
        }
        const sv = parseInt(parts[0], 10);
        const dv = parseInt(parts[1], 10);
        if (!validPair(sv, dv)) {
          return {
            ok: false,
            ly_do: `Huyết áp ${sv}/${dv} ngoài ngưỡng cho phép (tâm thu `
              + `${fmtNum(ha.min)}–${fmtNum(ha.max)}, tâm trương `
              + `${fmtNum(hd.min)}–${fmtNum(hd.max)}, tâm thu phải lớn hơn tâm trương)`,
          };
        }
        return { ok: true, value: `${sv}/${dv}` };
      }
    }

    if (/^\d+$/.test(s)) {
      const maxCut = Math.min(4, s.length); // tâm thu tối đa 3 chữ số -> cut in {2,3}
      const validSplits = [];
      for (let cut = 2; cut < maxCut; cut++) {
        const sysStr = s.slice(0, cut);
        const diaStr = s.slice(cut);
        if (!diaStr) continue;
        const sv = parseInt(sysStr, 10);
        const dv = parseInt(diaStr, 10);
        if (validPair(sv, dv)) validSplits.push([sv, dv]);
      }
      if (validSplits.length === 1) {
        const [sv, dv] = validSplits[0];
        return { ok: true, value: `${sv}/${dv}` };
      }
      if (validSplits.length === 0) {
        return {
          ok: false,
          ly_do: `Không tách được huyết áp '${raw}' thành tâm thu/tâm trương hợp lệ `
            + `trong ngưỡng cho phép (tâm thu ${fmtNum(ha.min)}–${fmtNum(ha.max)}, `
            + `tâm trương ${fmtNum(hd.min)}–${fmtNum(hd.max)})`,
        };
      }
      const cach = validSplits.map(([a, b]) => `${a}/${b}`).join(', ');
      return {
        ok: false,
        ly_do: `Huyết áp '${raw}' tách được nhiều cách hợp lệ (${cach}) — vui lòng `
          + "nhập rõ dạng 'tâm_thu/tâm_trương'",
      };
    }

    return { ok: false, ly_do: `Huyết áp '${raw}' không đúng định dạng` };
  }

  // Đợt 6 criterion 1: chuẩn hoá dấu thập phân — khớp 1:1
  // backend/services/sinh_hieu_valid.py:normalize_so(). Trim; đổi DUY NHẤT
  // 1 dấu phẩy (không kèm dấu chấm) thành dấu chấm; validate dạng số
  // nguyên/thập phân không dấu. Trả { ok, value } — value chỉ có khi ok.
  function normalizeSo(rawValue) {
    if (rawValue == null) return { ok: true, value: rawValue };
    const s = String(rawValue).trim();
    if (s === '') return { ok: true, value: '' };
    let t = s;
    if ((t.match(/,/g) || []).length === 1 && !t.includes('.')) {
      t = t.replace(',', '.');
    }
    if (/^\d+(\.\d+)?$/.test(t)) return { ok: true, value: t };
    return { ok: false };
  }

  function check(field, rawValue) {
    if (rawValue === '' || rawValue == null) return { ok: true, value: rawValue };
    if (!nguong) return { ok: true, value: rawValue };

    if (field === 'huyet_ap') return checkHuyetAp(rawValue);

    if (field === 'mach') {
      const v = Number(String(rawValue).trim());
      if (Number.isNaN(v)) return { ok: false, ly_do: `Mạch '${rawValue}' không hợp lệ — phải là số` };
      const r = nguong.mach;
      if (r && (v < r.min || v > r.max)) {
        return { ok: false, ly_do: `Mạch ${fmtNum(v)} ngoài ngưỡng cho phép (${fmtNum(r.min)}–${fmtNum(r.max)})` };
      }
      return { ok: true, value: rawValue };
    }

    if (field === 'chieu_cao' || field === 'can_nang') {
      const ten = field === 'chieu_cao' ? 'Chiều cao' : 'Cân nặng';
      const v = Number(String(rawValue).trim());
      if (Number.isNaN(v)) return { ok: false, ly_do: `${ten} '${rawValue}' không hợp lệ — phải là số` };
      const r = nguong[field];
      if (r && (v < r.min || v > r.max)) {
        return { ok: false, ly_do: `${ten} ${fmtNum(v)} ngoài ngưỡng cho phép (${fmtNum(r.min)}–${fmtNum(r.max)})` };
      }
      return { ok: true, value: v };
    }

    return { ok: true, value: rawValue };
  }

  return { setNguong, getNguong, check, normalizeSo };
})();
