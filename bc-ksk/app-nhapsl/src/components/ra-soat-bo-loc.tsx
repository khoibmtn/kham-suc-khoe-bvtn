'use client';

import { useMemo, useState } from 'react';
import type { HoSoDong } from '@/lib/api-types';
import { CANH_BAO_NHAN, CLS, CLS_KEYS, NHAN, type ClsKey } from '@/lib/cls';
import {
  BO_LOC_MAC_DINH,
  khacGoc,
  locHoSo,
  soBoLocDangBat,
  type BaTrangThai,
  type BoLoc,
} from '@/lib/loc-ho-so';
import { coTheTim } from '@/lib/tim-mo';
import { formatNumber } from '@/lib/client/format';

export type LuuBoLocSession = {
  boLoc: BoLoc;
  q: string;
  chiCoCanhBao: boolean;
};

export function locHoSoKetHopCanhBao(
  list: HoSoDong[],
  boLoc: BoLoc,
  idsKhopTimKiem: Set<number> | null,
  chiCoCanhBao: boolean,
): HoSoDong[] {
  const ketQua = locHoSo(list, boLoc, idsKhopTimKiem);
  if (!chiCoCanhBao) return ketQua;
  return ketQua.filter((h) => Array.isArray(h.canh_bao) && h.canh_bao.length > 0);
}

export function cloneBoLocMacDinh(): BoLoc {
  return {
    ...BO_LOC_MAC_DINH,
    cls: { ...BO_LOC_MAC_DINH.cls },
  };
}

export function xoayTrangThaiBa(current: BaTrangThai): BaTrangThai {
  if (current === 'tat_ca') return 'co';
  if (current === 'co') return 'khong';
  return 'tat_ca';
}

export function nhanTrangThaiCls(ngan: string, trangThai: BaTrangThai): string {
  if (trangThai === 'co') return `${ngan}: Có`;
  if (trangThai === 'khong') return `${ngan}: Không`;
  return `${ngan}: Tất cả`;
}

export type CanhBaoOption = {
  code: string;
  label: string;
  count: number;
};

export function thongKeCanhBao(
  list: HoSoDong[],
  currentCode = '',
): CanhBaoOption[] {
  const counts = new Map<string, number>();
  for (const h of list) {
    if (!Array.isArray(h.canh_bao)) continue;
    for (const c of h.canh_bao) {
      if (!c) continue;
      counts.set(c, (counts.get(c) ?? 0) + 1);
    }
  }

  const orderedCodes: string[] = [];
  for (const knownCode of Object.keys(CANH_BAO_NHAN)) {
    if ((counts.get(knownCode) ?? 0) > 0) {
      orderedCodes.push(knownCode);
    }
  }
  for (const code of counts.keys()) {
    if (!orderedCodes.includes(code)) {
      orderedCodes.push(code);
    }
  }
  if (currentCode && !orderedCodes.includes(currentCode)) {
    orderedCodes.push(currentCode);
  }

  return orderedCodes.map((code) => ({
    code,
    label: CANH_BAO_NHAN[code] ?? code,
    count: counts.get(code) ?? 0,
  }));
}

function isBaTrangThai(val: unknown): val is BaTrangThai {
  return val === 'tat_ca' || val === 'co' || val === 'khong';
}

export function chuanHoaBoLoc(raw: unknown): BoLoc {
  const base = cloneBoLocMacDinh();
  if (!raw || typeof raw !== 'object') return base;

  const obj = raw as Record<string, unknown>;
  if (
    obj.xac_nhan === 'tat_ca' ||
    obj.xac_nhan === 'da' ||
    obj.xac_nhan === 'chua'
  ) {
    base.xac_nhan = obj.xac_nhan;
  }

  if (obj.cls && typeof obj.cls === 'object') {
    const clsObj = obj.cls as Record<string, unknown>;
    for (const k of CLS_KEYS) {
      if (isBaTrangThai(clsObj[k])) {
        base.cls[k] = clsObj[k];
      }
    }
  }

  if (isBaTrangThai(obj.tt_ksk)) {
    base.tt_ksk = obj.tt_ksk;
  }

  if (
    obj.nguon === 'tat_ca' ||
    obj.nguon === 'his' ||
    obj.nguon === 'them_tay' ||
    obj.nguon === 'kho_chung'
  ) {
    base.nguon = obj.nguon;
  }

  if (isBaTrangThai(obj.da_sua)) {
    base.da_sua = obj.da_sua;
  }

  if (typeof obj.canh_bao === 'string') {
    base.canh_bao = obj.canh_bao;
  }

  return base;
}

export function khoaBoLocSession(maBuoi: string): string {
  return `loc:${maBuoi}`;
}

export function docBoLocSession(maBuoi: string): LuuBoLocSession {
  if (typeof window === 'undefined') {
    return { boLoc: cloneBoLocMacDinh(), q: '', chiCoCanhBao: false };
  }
  try {
    const raw = window.sessionStorage.getItem(khoaBoLocSession(maBuoi));
    if (!raw) {
      return { boLoc: cloneBoLocMacDinh(), q: '', chiCoCanhBao: false };
    }
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const boLoc = chuanHoaBoLoc(parsed.boLoc ?? parsed);
    const q = typeof parsed.q === 'string' ? parsed.q : '';
    const chiCoCanhBao = Boolean(parsed.chiCoCanhBao);
    return { boLoc, q, chiCoCanhBao };
  } catch {
    return { boLoc: cloneBoLocMacDinh(), q: '', chiCoCanhBao: false };
  }
}

export function ghiBoLocSession(
  maBuoi: string,
  boLoc: BoLoc,
  q: string,
  chiCoCanhBao = false,
): void {
  if (typeof window === 'undefined') return;
  try {
    window.sessionStorage.setItem(
      khoaBoLocSession(maBuoi),
      JSON.stringify({ boLoc, q, chiCoCanhBao }),
    );
  } catch {
    // Ignore sessionStorage quota/security errors
  }
}

type RaSoatBoLocProps = {
  hoSoList: HoSoDong[];
  soHienThi: number;
  boLoc: BoLoc;
  chiCoCanhBao: boolean;
  searchQuery: string;
  searching?: boolean;
  searchError?: string;
  onChangeBoLoc: (next: BoLoc) => void;
  onChangeChiCoCanhBao: (next: boolean) => void;
  onResetAll: () => void;
};

export function RaSoatBoLoc({
  hoSoList,
  soHienThi,
  boLoc,
  chiCoCanhBao,
  searchQuery,
  searching = false,
  searchError = '',
  onChangeBoLoc,
  onChangeChiCoCanhBao,
  onResetAll,
}: RaSoatBoLocProps) {
  // Detailed filter rows start collapsed (quick-filter chips stay visible) so a 768px-high
  // screen still shows enough table rows; they open automatically when filters are active.
  const [collapsed, setCollapsed] = useState(() => soBoLocDangBat(boLoc) === 0);

  const canhBaoOptions = useMemo(
    () => thongKeCanhBao(hoSoList, boLoc.canh_bao),
    [hoSoList, boLoc.canh_bao],
  );

  const quickCounts = useMemo(() => {
    let chua = 0;
    let da = 0;
    let coCanhBao = 0;
    let daSua = 0;
    let khongTtKsk = 0;
    let khongBangChung = 0;
    let nghiSaoChep = 0;

    for (const h of hoSoList) {
      if (h.da_xac_nhan) da++;
      else chua++;
      if (h.canh_bao && h.canh_bao.length > 0) coCanhBao++;
      if (khacGoc(h)) daSua++;
      if (h.co_tt_ksk === 0) khongTtKsk++;
      if (h.canh_bao?.includes('KHONG_BANG_CHUNG')) khongBangChung++;
      if (h.canh_bao?.includes('NGHI_SAO_CHEP_XN')) nghiSaoChep++;
    }

    return {
      chua,
      da,
      coCanhBao,
      daSua,
      khongTtKsk,
      khongBangChung,
      nghiSaoChep,
    };
  }, [hoSoList]);

  const soBoLoc = useMemo(
    () => soBoLocDangBat(boLoc) + (chiCoCanhBao ? 1 : 0),
    [boLoc, chiCoCanhBao],
  );
  const trimmedQ = searchQuery.trim();
  const coTimKiem = coTheTim(searchQuery);
  const tongBoLocDangBat = soBoLoc + (coTimKiem ? 1 : 0);

  function handleCycleCls(key: ClsKey) {
    const nextState = xoayTrangThaiBa(boLoc.cls[key]);
    onChangeBoLoc({
      ...boLoc,
      cls: {
        ...boLoc.cls,
        [key]: nextState,
      },
    });
  }

  return (
    <div className="rasoat-filter-panel" aria-label="Bộ lọc hồ sơ buổi khám">
      <div className="rasoat-quick-filter-row" role="group" aria-label="Bộ lọc nhanh một chạm">
        <span className="rasoat-filter-label">Lọc nhanh:</span>
        <button
          type="button"
          className={`quick-chip-btn ${boLoc.xac_nhan === 'chua' ? 'active' : ''}`}
          aria-pressed={boLoc.xac_nhan === 'chua'}
          onClick={() =>
            onChangeBoLoc({
              ...boLoc,
              xac_nhan: boLoc.xac_nhan === 'chua' ? 'tat_ca' : 'chua',
            })
          }
        >
          Chưa xác nhận ({formatNumber(quickCounts.chua)})
        </button>

        <button
          type="button"
          className={`quick-chip-btn ${boLoc.xac_nhan === 'da' ? 'active' : ''}`}
          aria-pressed={boLoc.xac_nhan === 'da'}
          onClick={() =>
            onChangeBoLoc({
              ...boLoc,
              xac_nhan: boLoc.xac_nhan === 'da' ? 'tat_ca' : 'da',
            })
          }
        >
          Đã xác nhận ({formatNumber(quickCounts.da)})
        </button>

        <button
          type="button"
          className={`quick-chip-btn ${chiCoCanhBao ? 'active' : ''}`}
          aria-pressed={chiCoCanhBao}
          onClick={() => onChangeChiCoCanhBao(!chiCoCanhBao)}
        >
          Có cảnh báo ({formatNumber(quickCounts.coCanhBao)})
        </button>

        <button
          type="button"
          className={`quick-chip-btn ${boLoc.da_sua === 'co' ? 'active' : ''}`}
          aria-pressed={boLoc.da_sua === 'co'}
          onClick={() =>
            onChangeBoLoc({
              ...boLoc,
              da_sua: boLoc.da_sua === 'co' ? 'tat_ca' : 'co',
            })
          }
        >
          Đã sửa so với gốc ({formatNumber(quickCounts.daSua)})
        </button>

        <button
          type="button"
          className={`quick-chip-btn ${boLoc.tt_ksk === 'khong' ? 'active' : ''}`}
          aria-pressed={boLoc.tt_ksk === 'khong'}
          onClick={() =>
            onChangeBoLoc({
              ...boLoc,
              tt_ksk: boLoc.tt_ksk === 'khong' ? 'tat_ca' : 'khong',
            })
          }
        >
          Không có trong {NHAN.TT_KSK} ({formatNumber(quickCounts.khongTtKsk)})
        </button>

        <button
          type="button"
          className={`quick-chip-btn ${boLoc.canh_bao === 'KHONG_BANG_CHUNG' ? 'active' : ''}`}
          aria-pressed={boLoc.canh_bao === 'KHONG_BANG_CHUNG'}
          onClick={() =>
            onChangeBoLoc({
              ...boLoc,
              canh_bao:
                boLoc.canh_bao === 'KHONG_BANG_CHUNG' ? '' : 'KHONG_BANG_CHUNG',
            })
          }
        >
          {CANH_BAO_NHAN.KHONG_BANG_CHUNG} ({formatNumber(quickCounts.khongBangChung)})
        </button>

        <button
          type="button"
          className={`quick-chip-btn ${boLoc.canh_bao === 'NGHI_SAO_CHEP_XN' ? 'active' : ''}`}
          aria-pressed={boLoc.canh_bao === 'NGHI_SAO_CHEP_XN'}
          onClick={() =>
            onChangeBoLoc({
              ...boLoc,
              canh_bao:
                boLoc.canh_bao === 'NGHI_SAO_CHEP_XN' ? '' : 'NGHI_SAO_CHEP_XN',
            })
          }
        >
          {CANH_BAO_NHAN.NGHI_SAO_CHEP_XN} ({formatNumber(quickCounts.nghiSaoChep)})
        </button>
      </div>

      {!collapsed && (
        <div className="rasoat-filter-rows">
          <div className="rasoat-filter-row">
            <div className="rasoat-filter-item">
              <span className="rasoat-filter-label">Trạng thái:</span>
              <div
                className="seg-group"
                role="group"
                aria-label="Lọc theo trạng thái xác nhận"
              >
                <button
                  type="button"
                  className={`seg-btn ${boLoc.xac_nhan === 'tat_ca' ? 'active' : ''}`}
                  aria-pressed={boLoc.xac_nhan === 'tat_ca'}
                  onClick={() => onChangeBoLoc({ ...boLoc, xac_nhan: 'tat_ca' })}
                >
                  Tất cả
                </button>
                <button
                  type="button"
                  className={`seg-btn ${boLoc.xac_nhan === 'da' ? 'active' : ''}`}
                  aria-pressed={boLoc.xac_nhan === 'da'}
                  onClick={() => onChangeBoLoc({ ...boLoc, xac_nhan: 'da' })}
                >
                  Đã xác nhận
                </button>
                <button
                  type="button"
                  className={`seg-btn ${boLoc.xac_nhan === 'chua' ? 'active' : ''}`}
                  aria-pressed={boLoc.xac_nhan === 'chua'}
                  onClick={() => onChangeBoLoc({ ...boLoc, xac_nhan: 'chua' })}
                >
                  Chưa xác nhận
                </button>
              </div>
            </div>

            <div className="rasoat-filter-item">
              <span className="rasoat-filter-label">CLS:</span>
              <div
                className="cls-filter-group"
                role="group"
                aria-label="Lọc theo 8 cận lâm sàng (bấm để xoay vòng Tất cả, Có, Không)"
              >
                {CLS.map((c) => {
                  const st = boLoc.cls[c.key];
                  const labelText = nhanTrangThaiCls(c.ngan, st);
                  const stateClass =
                    st === 'co'
                      ? 'cls-filter-yes'
                      : st === 'khong'
                        ? 'cls-filter-no'
                        : 'cls-filter-all';

                  return (
                    <button
                      key={c.key}
                      type="button"
                      className={`cls-filter-btn ${stateClass}`}
                      onClick={() => handleCycleCls(c.key)}
                      title={`${c.ten} (${c.ngan}): ${st === 'tat_ca' ? 'Tất cả' : st === 'co' ? 'Có làm' : 'Không làm'} — Bấm để đổi Tất cả → Có → Không`}
                      aria-label={`Lọc ${c.nhan} (${labelText})`}
                    >
                      {labelText}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          <div className="rasoat-filter-row">
            <div className="rasoat-filter-item">
              <label htmlFor="loc-tt-ksk" className="rasoat-filter-label">
                {NHAN.TT_KSK}:
              </label>
              <select
                id="loc-tt-ksk"
                className="form-select rasoat-filter-select"
                value={boLoc.tt_ksk}
                onChange={(e) =>
                  onChangeBoLoc({
                    ...boLoc,
                    tt_ksk: e.target.value as BaTrangThai,
                  })
                }
              >
                <option value="tat_ca">Tất cả</option>
                <option value="co">Có</option>
                <option value="khong">Không</option>
              </select>
            </div>

            <div className="rasoat-filter-item">
              <label htmlFor="loc-nguon" className="rasoat-filter-label">
                Nguồn:
              </label>
              <select
                id="loc-nguon"
                className="form-select rasoat-filter-select"
                value={boLoc.nguon}
                onChange={(e) =>
                  onChangeBoLoc({
                    ...boLoc,
                    nguon: e.target.value as BoLoc['nguon'],
                  })
                }
              >
                <option value="tat_ca">Tất cả</option>
                <option value="his">HIS</option>
                <option value="them_tay">Thêm tay</option>
                <option value="kho_chung">Nhận từ kho chung</option>
              </select>
            </div>

            <div className="rasoat-filter-item">
              <label htmlFor="loc-da-sua" className="rasoat-filter-label">
                Đã sửa so với gốc:
              </label>
              <select
                id="loc-da-sua"
                className="form-select rasoat-filter-select"
                value={boLoc.da_sua}
                onChange={(e) =>
                  onChangeBoLoc({
                    ...boLoc,
                    da_sua: e.target.value as BaTrangThai,
                  })
                }
              >
                <option value="tat_ca">Tất cả</option>
                <option value="co">Có</option>
                <option value="khong">Không</option>
              </select>
            </div>

            <div className="rasoat-filter-item">
              <label htmlFor="loc-canh-bao" className="rasoat-filter-label">
                Cảnh báo:
              </label>
              <select
                id="loc-canh-bao"
                className="form-select rasoat-filter-select rasoat-filter-select-wide"
                value={boLoc.canh_bao}
                onChange={(e) =>
                  onChangeBoLoc({
                    ...boLoc,
                    canh_bao: e.target.value,
                  })
                }
              >
                <option value="">Tất cả</option>
                {canhBaoOptions.map((opt) => (
                  <option key={opt.code} value={opt.code}>
                    {opt.label} ({formatNumber(opt.count)})
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>
      )}

      <div className="rasoat-filter-status-bar" aria-live="polite">
        <div className="rasoat-filter-status-left">
          <span>
            Đang hiển thị{' '}
            <strong className="num">{formatNumber(soHienThi)}</strong> /{' '}
            <strong className="num">{formatNumber(hoSoList.length)}</strong> hồ
            sơ
          </span>
          <span className="rasoat-meta-sep">·</span>
          <span
            className={
              tongBoLocDangBat > 0
                ? 'rasoat-active-filter-count active'
                : 'rasoat-active-filter-count'
            }
          >
            Đang bật: <strong className="num">{formatNumber(soBoLoc)}</strong>{' '}
            bộ lọc
            {coTimKiem ? ` + từ khóa "${trimmedQ}"` : ''}
          </span>
          {searching && (
            <span className="text-muted">· Đang tìm kiếm…</span>
          )}
          {searchError && (
            <span className="rasoat-search-error" role="status">
              · {searchError}
            </span>
          )}
        </div>

        <div className="rasoat-filter-status-right">
          <button
            type="button"
            className="btn btn-secondary btn-xs"
            onClick={onResetAll}
          >
            Xóa bộ lọc
          </button>
          <button
            type="button"
            className="btn btn-secondary btn-xs"
            aria-expanded={!collapsed}
            onClick={() => setCollapsed((prev) => !prev)}
          >
            {collapsed ? 'Bộ lọc chi tiết' : 'Thu gọn bộ lọc'}
          </button>
        </div>
      </div>
    </div>
  );
}
