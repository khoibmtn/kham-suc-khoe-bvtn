'use client';

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
} from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import type {
  BuoiTomTat,
  DeNghiChuyen,
  KetQuaTimKiem,
  UserNgan,
} from '@/lib/api-types';
import {
  CANH_BAO_NHAN,
  CLS,
  CLS_KEYS,
  DON_VI,
  NHAN,
  type ClsKey,
  type DonVi,
} from '@/lib/cls';
import type { BaTrangThai } from '@/lib/loc-ho-so';
import { coTheTim, khopHoSo, tachTuKhoa } from '@/lib/tim-mo';
import { apiRequest } from '@/lib/client/api';
import {
  formatDate,
  formatHisTimestamp,
  formatNumber,
  getCanhBaoTooltip,
} from '@/lib/client/format';
import { notifyPoolChanged } from './app-shell';
import { nhanTrangThaiCls, xoayTrangThaiBa } from './ra-soat-bo-loc';
import { ToVang } from './to-vang';
import { useToast } from './toast';

export type PhamViTimKiemTrang = 'cua_toi' | 'kho_chung' | 'tat_ca';

export type BoLocTimKiem = {
  don_vi: '' | DonVi;
  ngay: string;
  cls: Record<ClsKey, BaTrangThai>;
  xac_nhan: 'tat_ca' | 'da' | 'chua';
  phu_trach: string;
  co_ghi_chu: 'tat_ca' | '1' | '0';
  tt_ksk: BaTrangThai;
  nguon: 'tat_ca' | 'his' | 'them_tay' | 'kho_chung';
  vi_tri: 'tat_ca' | 'buoi' | 'kho_ca_nhan' | 'kho_chung' | 'da_loai';
};

export function cloneBoLocTimKiemMacDinh(): BoLocTimKiem {
  return {
    don_vi: '',
    ngay: '',
    cls: Object.fromEntries(CLS_KEYS.map((k) => [k, 'tat_ca'])) as Record<
      ClsKey,
      BaTrangThai
    >,
    xac_nhan: 'tat_ca',
    phu_trach: '',
    co_ghi_chu: 'tat_ca',
    tt_ksk: 'tat_ca',
    nguon: 'tat_ca',
    vi_tri: 'tat_ca',
  };
}

export function demSoBoLocTimKiem(b: BoLocTimKiem): number {
  let n = 0;
  if (b.don_vi) n++;
  if (b.ngay) n++;
  for (const k of CLS_KEYS) {
    if (b.cls[k] !== 'tat_ca') n++;
  }
  if (b.xac_nhan !== 'tat_ca') n++;
  if (b.phu_trach) n++;
  if (b.co_ghi_chu !== 'tat_ca') n++;
  if (b.tt_ksk !== 'tat_ca') n++;
  if (b.nguon !== 'tat_ca') n++;
  if (b.vi_tri !== 'tat_ca') n++;
  return n;
}

export function docBoLocTimKiemTuUrl(params: {
  get: (key: string) => string | null;
}): {
  q: string;
  phamVi: PhamViTimKiemTrang;
  boLoc: BoLocTimKiem;
} {
  const q = params.get('q') ?? '';
  const rawPv = params.get('pham_vi');
  const phamVi: PhamViTimKiemTrang =
    rawPv === 'kho_chung' || rawPv === 'tat_ca' || rawPv === 'cua_toi'
      ? rawPv
      : 'cua_toi';

  const boLoc = cloneBoLocTimKiemMacDinh();
  const dv = params.get('don_vi');
  if (dv === 'TN' || dv === 'LK' || dv === 'VK') {
    boLoc.don_vi = dv;
  }

  const ngay = params.get('ngay');
  if (ngay && /^\d{4}-\d{2}-\d{2}$/.test(ngay)) {
    boLoc.ngay = ngay;
  }

  for (const k of CLS_KEYS) {
    const v = params.get(`cls_${k}`);
    if (v === 'co' || v === 'khong') {
      boLoc.cls[k] = v;
    }
  }

  const xn = params.get('xac_nhan');
  if (xn === 'da' || xn === 'chua') {
    boLoc.xac_nhan = xn;
  }

  const pt = params.get('phu_trach');
  if (pt && /^\d{1,9}$/.test(pt)) {
    boLoc.phu_trach = pt;
  }

  const gc = params.get('co_ghi_chu');
  if (gc === '1' || gc === '0') {
    boLoc.co_ghi_chu = gc;
  }

  const ttksk = params.get('tt_ksk');
  if (ttksk === 'co' || ttksk === 'khong') {
    boLoc.tt_ksk = ttksk;
  }

  const nguon = params.get('nguon');
  if (nguon === 'his' || nguon === 'them_tay' || nguon === 'kho_chung') {
    boLoc.nguon = nguon;
  }

  const vt = params.get('vi_tri');
  if (
    vt === 'buoi' ||
    vt === 'kho_ca_nhan' ||
    vt === 'kho_chung' ||
    vt === 'da_loai'
  ) {
    boLoc.vi_tri = vt;
  }

  return { q, phamVi, boLoc };
}

export function taoUrlSearchParamsTimKiem(
  q: string,
  phamVi: PhamViTimKiemTrang,
  boLoc: BoLocTimKiem,
  forApi = false,
): URLSearchParams {
  const p = new URLSearchParams();
  const trimmed = q.trim();
  if (forApi) {
    if (coTheTim(trimmed)) {
      p.set('q', trimmed);
    }
    p.set('pham_vi', phamVi);
  } else {
    if (trimmed) {
      p.set('q', trimmed);
    }
    if (phamVi !== 'cua_toi') {
      p.set('pham_vi', phamVi);
    }
  }

  if (boLoc.don_vi) p.set('don_vi', boLoc.don_vi);
  if (boLoc.ngay) p.set('ngay', boLoc.ngay);
  for (const k of CLS_KEYS) {
    const st = boLoc.cls[k];
    if (st === 'co' || st === 'khong') {
      p.set(`cls_${k}`, st);
    }
  }
  if (boLoc.xac_nhan !== 'tat_ca') p.set('xac_nhan', boLoc.xac_nhan);
  if (boLoc.phu_trach) p.set('phu_trach', boLoc.phu_trach);
  if (boLoc.co_ghi_chu !== 'tat_ca') p.set('co_ghi_chu', boLoc.co_ghi_chu);
  if (boLoc.tt_ksk !== 'tat_ca') p.set('tt_ksk', boLoc.tt_ksk);
  if (boLoc.nguon !== 'tat_ca') p.set('nguon', boLoc.nguon);
  if (boLoc.vi_tri !== 'tat_ca') p.set('vi_tri', boLoc.vi_tri);

  return p;
}

export type NgayKhamOption = {
  ngay: string;
  label: string;
};

export function taoDanhSachNgayKhamOption(
  buoiList: BuoiTomTat[],
  donVi: '' | DonVi = '',
): NgayKhamOption[] {
  const filtered = donVi
    ? buoiList.filter((b) => b.don_vi === donVi)
    : buoiList;
  const byDate = new Map<string, BuoiTomTat[]>();
  for (const b of filtered) {
    if (!b.ngay_kham) continue;
    const arr = byDate.get(b.ngay_kham) ?? [];
    arr.push(b);
    byDate.set(b.ngay_kham, arr);
  }
  const sortedDates = [...byDate.keys()].sort();
  return sortedDates.map((ngay) => {
    const ds = byDate.get(ngay)!;
    if (ds.length === 1) {
      const b = ds[0];
      return {
        ngay,
        label: `${formatDate(ngay)} · ${b.ten_don_vi || b.don_vi} · ${b.diem_kham || '—'}`,
      };
    }
    const donViLabel = ds.map((b) => b.ten_don_vi || b.don_vi).join(', ');
    const diemLabel = ds.map((b) => b.diem_kham || '—').join(', ');
    return {
      ngay,
      label: `${formatDate(ngay)} · ${donViLabel} · ${diemLabel}`,
    };
  });
}

export function taoDanhSachPhuTrachOption(buoiList: BuoiTomTat[]): UserNgan[] {
  const map = new Map<number, UserNgan>();
  for (const b of buoiList) {
    if (b.phu_trach) {
      map.set(b.phu_trach.id, b.phu_trach);
    }
  }
  return [...map.values()].sort((a, b) =>
    a.ho_ten.localeCompare(b.ho_ten, 'vi'),
  );
}

export function formatViTriKetQua(item: KetQuaTimKiem): string {
  if (item.vi_tri === 'buoi' && item.buoi) {
    const phuTrachTen = item.buoi.phu_trach
      ? item.buoi.phu_trach.ho_ten
      : 'Chưa phân công';
    return `${item.buoi.don_vi} · ${formatDate(item.buoi.ngay_kham)} · ${phuTrachTen}`;
  }
  if (item.vi_tri === 'kho_chung') {
    return item.don_vi_goi_y
      ? `Kho chờ chung (gợi ý: ${item.don_vi_goi_y})`
      : 'Kho chờ chung';
  }
  if (item.vi_tri === 'kho_ca_nhan') {
    return item.kho_cua ? `Kho của ${item.kho_cua.ho_ten}` : 'Kho cá nhân';
  }
  return 'Đã ẩn';
}

type DeNghiChuyenModalProps = {
  hoSo: KetQuaTimKiem;
  onClose: () => void;
  onSuccess: () => void;
};

function DeNghiChuyenTuTimKiemModal({
  hoSo,
  onClose,
  onSuccess,
}: DeNghiChuyenModalProps) {
  const { showToast } = useToast();
  const [buoiList, setBuoiList] = useState<BuoiTomTat[]>([]);
  const [loadingBuoi, setLoadingBuoi] = useState(true);
  const [selectedBuoiDich, setSelectedBuoiDich] = useState('');
  const [lyDo, setLyDo] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    apiRequest<{ buoi: BuoiTomTat[] }>('/api/buoi').then((res) => {
      if (cancelled) return;
      setLoadingBuoi(false);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      const editable = (res.data.buoi ?? []).filter(
        (b) =>
          b.co_quyen_sua &&
          b.trang_thai !== 'da_xac_nhan' &&
          b.ma_buoi !== hoSo.buoi?.ma_buoi,
      );
      setBuoiList(editable);
      if (editable.length > 0) {
        setSelectedBuoiDich(editable[0].ma_buoi);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [hoSo.buoi?.ma_buoi]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');
    if (!selectedBuoiDich) {
      setError('Vui lòng chọn buổi khám đích của bạn.');
      return;
    }
    const trimmedLyDo = lyDo.trim();
    if (!trimmedLyDo) {
      setError('Vui lòng nhập lý do đề nghị chuyển.');
      return;
    }

    setSubmitting(true);
    const res = await apiRequest<{ de_nghi: DeNghiChuyen }>(
      '/api/de-nghi-chuyen',
      {
        method: 'POST',
        body: JSON.stringify({
          ho_so_id: hoSo.id,
          den_buoi: selectedBuoiDich,
          ly_do: trimmedLyDo,
        }),
      },
    );
    setSubmitting(false);

    if (!res.ok) {
      setError(res.error);
      return;
    }

    notifyPoolChanged();
    showToast('Đã gửi đề nghị chuyển hồ sơ về buổi của bạn.', 'success');
    onSuccess();
  }

  return (
    <div
      className="modal-backdrop"
      role="dialog"
      aria-modal="true"
      aria-labelledby="modal-denghi-timkiem-title"
    >
      <div className="modal-card">
        <div className="modal-header">
          <h2 id="modal-denghi-timkiem-title" className="modal-title">
            Đề nghị chuyển hồ sơ về buổi của tôi
          </h2>
        </div>
        <form onSubmit={handleSubmit}>
          <div className="modal-body">
            <p className="modal-desc">
              Hồ sơ: <strong>{hoSo.ho_ten}</strong> (ID #{hoSo.id} · Năm sinh{' '}
              {hoSo.nam_sinh ?? '—'})
            </p>
            <p className="modal-consequence">
              Đang ở: <strong>{formatViTriKetQua(hoSo)}</strong>. Đề nghị sẽ
              được gửi tới người phụ trách buổi hiện tại (hoặc quản trị viên) để
              xác nhận chuyển sang buổi của bạn.
            </p>

            {error && (
              <div className="alert-error mb-3" role="alert">
                {error}
              </div>
            )}

            {loadingBuoi ? (
              <p className="text-muted">Đang tải danh sách buổi của bạn…</p>
            ) : buoiList.length === 0 ? (
              <div className="alert-error" role="alert">
                Bạn hiện không có buổi khám nào đang mở để nhận hồ sơ về.
              </div>
            ) : (
              <>
                <div className="form-group">
                  <label htmlFor="denghi-buoi-dich" className="form-label">
                    Chọn buổi khám nhận về (của tôi){' '}
                    <span className="text-danger">*</span>
                  </label>
                  <select
                    id="denghi-buoi-dich"
                    className="form-select"
                    value={selectedBuoiDich}
                    onChange={(e) => setSelectedBuoiDich(e.target.value)}
                    disabled={submitting}
                  >
                    {buoiList.map((b) => (
                      <option key={b.ma_buoi} value={b.ma_buoi}>
                        {b.ten_don_vi} · {formatDate(b.ngay_kham)} (
                        {b.diem_kham || '—'})
                      </option>
                    ))}
                  </select>
                </div>

                <div className="form-group mb-0">
                  <label htmlFor="denghi-ly-do" className="form-label">
                    Lý do đề nghị chuyển <span className="text-danger">*</span>
                  </label>
                  <input
                    id="denghi-ly-do"
                    type="text"
                    className="form-input"
                    placeholder="Ví dụ: Có hồ sơ giấy khám tại buổi của tôi…"
                    value={lyDo}
                    onChange={(e) => setLyDo(e.target.value)}
                    disabled={submitting}
                    autoFocus
                  />
                </div>
              </>
            )}
          </div>
          <div className="modal-footer">
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={onClose}
              disabled={submitting}
            >
              Hủy
            </button>
            <button
              type="submit"
              className="btn btn-primary btn-sm"
              disabled={submitting || loadingBuoi || buoiList.length === 0}
            >
              {submitting ? 'Đang gửi…' : 'Gửi đề nghị chuyển'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export function TimKiemView() {
  const searchParams = useSearchParams();
  const initialParsed = useMemo(
    () => docBoLocTimKiemTuUrl(searchParams),
    // Chỉ đọc trạng thái khởi tạo từ URL khi mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  const [query, setQuery] = useState<string>(initialParsed.q);
  const [phamVi, setPhamVi] = useState<PhamViTimKiemTrang>(
    initialParsed.phamVi,
  );
  const [boLoc, setBoLoc] = useState<BoLocTimKiem>(initialParsed.boLoc);
  const [filterCollapsed, setFilterCollapsed] = useState<boolean>(false);

  const [tatCaBuoi, setTatCaBuoi] = useState<BuoiTomTat[]>([]);
  const [ketQua, setKetQua] = useState<KetQuaTimKiem[]>([]);
  const [tong, setTong] = useState<number>(0);
  const [gioiHan, setGioiHan] = useState<number | null>(200);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string>('');
  const [hasSearched, setHasSearched] = useState<boolean>(false);
  const [reloadTick, setReloadTick] = useState<number>(0);
  const [deNghiTarget, setDeNghiTarget] = useState<KetQuaTimKiem | null>(null);

  const searchInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    searchInputRef.current?.focus();
  }, []);

  // Tải danh sách buổi khám để lấy các ngày khám có thật và danh sách nhân viên phụ trách
  useEffect(() => {
    let cancelled = false;
    apiRequest<{ buoi: BuoiTomTat[] }>('/api/buoi?tat_ca=1').then((res) => {
      if (cancelled || !res.ok) return;
      setTatCaBuoi(res.data.buoi ?? []);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const ngayKhamOptions = useMemo(
    () => taoDanhSachNgayKhamOption(tatCaBuoi, boLoc.don_vi),
    [tatCaBuoi, boLoc.don_vi],
  );

  const phuTrachOptions = useMemo(
    () => taoDanhSachPhuTrachOption(tatCaBuoi),
    [tatCaBuoi],
  );

  const trimmedQuery = query.trim();
  const coTuKhoa = coTheTim(trimmedQuery);
  const soBoLoc = useMemo(() => demSoBoLocTimKiem(boLoc), [boLoc]);
  const duDieuKienTim = coTuKhoa || soBoLoc > 0;
  const tongBoLocDangBat = soBoLoc + (coTuKhoa ? 1 : 0);

  // Đồng bộ từ khóa + phạm vi + bộ lọc lên URL query (tải lại trang vẫn giữ)
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const urlParams = taoUrlSearchParamsTimKiem(query, phamVi, boLoc, false);
    const qs = urlParams.toString();
    const nextUrl = qs
      ? `${window.location.pathname}?${qs}`
      : window.location.pathname;
    const currentUrl = `${window.location.pathname}${window.location.search}`;
    if (nextUrl !== currentUrl) {
      window.history.replaceState(null, '', nextUrl);
    }
  }, [query, phamVi, boLoc]);

  const apiQueryString = useMemo(
    () => taoUrlSearchParamsTimKiem(query, phamVi, boLoc, true).toString(),
    [query, phamVi, boLoc],
  );

  const resetKetQua = useCallback(() => {
    setKetQua([]);
    setTong(0);
    setGioiHan(200);
    setLoading(false);
    setError('');
    setHasSearched(false);
  }, []);

  const handleChangeQuery = useCallback(
    (val: string) => {
      setQuery(val);
      if (!coTheTim(val.trim()) && soBoLoc === 0) {
        resetKetQua();
      }
    },
    [resetKetQua, soBoLoc],
  );

  const handleChangeBoLoc = useCallback(
    (next: BoLocTimKiem) => {
      setBoLoc(next);
      if (!coTuKhoa && demSoBoLocTimKiem(next) === 0) {
        resetKetQua();
      }
    },
    [coTuKhoa, resetKetQua],
  );

  const handleChangeDonVi = useCallback(
    (nextDonVi: '' | DonVi) => {
      let nextNgay = boLoc.ngay;
      if (nextDonVi && nextNgay && tatCaBuoi.length > 0) {
        const existsInUnit = tatCaBuoi.some(
          (b) => b.don_vi === nextDonVi && b.ngay_kham === nextNgay,
        );
        if (!existsInUnit) {
          nextNgay = '';
        }
      }
      handleChangeBoLoc({
        ...boLoc,
        don_vi: nextDonVi,
        ngay: nextNgay,
      });
    },
    [boLoc, handleChangeBoLoc, tatCaBuoi],
  );

  const handleCycleCls = useCallback(
    (key: ClsKey) => {
      const nextState = xoayTrangThaiBa(boLoc.cls[key]);
      handleChangeBoLoc({
        ...boLoc,
        cls: {
          ...boLoc.cls,
          [key]: nextState,
        },
      });
    },
    [boLoc, handleChangeBoLoc],
  );

  const handleResetFilters = useCallback(() => {
    const empty = cloneBoLocTimKiemMacDinh();
    setBoLoc(empty);
    if (!coTuKhoa) {
      resetKetQua();
    }
  }, [coTuKhoa, resetKetQua]);

  useEffect(() => {
    if (!duDieuKienTim) {
      return;
    }

    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setLoading(true);
      setError('');

      const url = `/api/tim-kiem?${apiQueryString}`;
      const res = await apiRequest<{
        ket_qua: KetQuaTimKiem[];
        tong: number;
        gioi_han: number | null;
      }>(url, { signal: controller.signal });

      if (controller.signal.aborted) return;
      setLoading(false);
      setHasSearched(true);

      if (!res.ok) {
        setKetQua([]);
        setTong(0);
        setError(res.error);
        return;
      }

      setError('');
      setKetQua(res.data.ket_qua ?? []);
      setTong(res.data.tong ?? 0);
      setGioiHan(res.data.gioi_han ?? null);
    }, 220);

    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [duDieuKienTim, apiQueryString, reloadTick]);

  const handleRetry = useCallback(() => {
    setReloadTick((prev) => prev + 1);
  }, []);

  const tokensKhop = useMemo(
    () => (coTuKhoa ? tachTuKhoa(trimmedQuery) : []),
    [coTuKhoa, trimmedQuery],
  );

  const vuotGioiHan = gioiHan !== null && tong > gioiHan;

  return (
    <div className="page-container">
      <div className="page-header-row">
        <div>
          <h1 className="page-title">Tìm kiếm hồ sơ khám sức khỏe</h1>
          <p className="page-subtitle">
            Tìm mờ theo thứ tự chữ cái trong họ tên và ghi chú, hoặc tra cứu theo
            năm sinh, CCCD, mã KCB, SĐT, thẻ BHYT kết hợp bộ lọc chi tiết
          </p>
        </div>
      </div>

      <div className="timkiem-control-bar">
        <div className="timkiem-input-wrap">
          <label htmlFor="timkiem-q-input" className="sr-only">
            Từ khóa tìm kiếm hồ sơ
          </label>
          <input
            ref={searchInputRef}
            id="timkiem-q-input"
            type="search"
            autoFocus
            className="form-input timkiem-input"
            placeholder="Tìm họ tên, ghi chú, năm sinh, CCCD, mã KCB, SĐT, thẻ BHYT…"
            value={query}
            onChange={(e) => handleChangeQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Escape' && query) {
                e.preventDefault();
                handleChangeQuery('');
              }
            }}
          />
          {query && (
            <button
              type="button"
              className="btn btn-secondary btn-xs"
              onClick={() => {
                handleChangeQuery('');
                searchInputRef.current?.focus();
              }}
            >
              Xóa từ khóa
            </button>
          )}
        </div>

        <div className="timkiem-scope-wrap">
          <span className="rasoat-filter-label">Phạm vi:</span>
          <div
            className="seg-group"
            role="group"
            aria-label="Phạm vi tìm kiếm"
          >
            <button
              type="button"
              className={`seg-btn ${phamVi === 'cua_toi' ? 'active' : ''}`}
              aria-pressed={phamVi === 'cua_toi'}
              onClick={() => setPhamVi('cua_toi')}
            >
              Buổi của tôi
            </button>
            <button
              type="button"
              className={`seg-btn ${phamVi === 'kho_chung' ? 'active' : ''}`}
              aria-pressed={phamVi === 'kho_chung'}
              onClick={() => setPhamVi('kho_chung')}
            >
              Kho chờ chung
            </button>
            <button
              type="button"
              className={`seg-btn ${phamVi === 'tat_ca' ? 'active' : ''}`}
              aria-pressed={phamVi === 'tat_ca'}
              onClick={() => setPhamVi('tat_ca')}
            >
              Toàn bộ app
            </button>
          </div>
        </div>
      </div>

      <div
        className="rasoat-filter-panel timkiem-filter-panel"
        aria-label="Bộ lọc tìm kiếm hồ sơ"
      >
        {!filterCollapsed && (
          <div className="rasoat-filter-rows">
            <div className="rasoat-filter-row">
              <div className="rasoat-filter-item">
                <label
                  htmlFor="timkiem-loc-don-vi"
                  className="rasoat-filter-label"
                >
                  Xã/phường:
                </label>
                <select
                  id="timkiem-loc-don-vi"
                  className="form-select rasoat-filter-select"
                  value={boLoc.don_vi}
                  onChange={(e) =>
                    handleChangeDonVi(e.target.value as '' | DonVi)
                  }
                >
                  <option value="">Tất cả</option>
                  {(Object.keys(DON_VI) as DonVi[]).map((code) => (
                    <option key={code} value={code}>
                      {DON_VI[code]} ({code})
                    </option>
                  ))}
                </select>
              </div>

              <div className="rasoat-filter-item">
                <label
                  htmlFor="timkiem-loc-ngay"
                  className="rasoat-filter-label"
                >
                  Ngày khám:
                </label>
                <select
                  id="timkiem-loc-ngay"
                  className="form-select rasoat-filter-select rasoat-filter-select-wide"
                  value={boLoc.ngay}
                  onChange={(e) =>
                    handleChangeBoLoc({ ...boLoc, ngay: e.target.value })
                  }
                >
                  <option value="">Tất cả</option>
                  {boLoc.ngay &&
                    !ngayKhamOptions.some((o) => o.ngay === boLoc.ngay) && (
                      <option value={boLoc.ngay}>
                        {formatDate(boLoc.ngay)}
                      </option>
                    )}
                  {ngayKhamOptions.map((opt) => (
                    <option key={opt.ngay} value={opt.ngay}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>

              <div className="rasoat-filter-item">
                <label
                  htmlFor="timkiem-loc-phu-trach"
                  className="rasoat-filter-label"
                >
                  Nhân viên rà soát:
                </label>
                <select
                  id="timkiem-loc-phu-trach"
                  className="form-select rasoat-filter-select"
                  value={boLoc.phu_trach}
                  onChange={(e) =>
                    handleChangeBoLoc({ ...boLoc, phu_trach: e.target.value })
                  }
                >
                  <option value="">Tất cả</option>
                  {boLoc.phu_trach &&
                    !phuTrachOptions.some(
                      (u) => String(u.id) === boLoc.phu_trach,
                    ) && (
                      <option value={boLoc.phu_trach}>
                        NV #{boLoc.phu_trach}
                      </option>
                    )}
                  {phuTrachOptions.map((u) => (
                    <option key={u.id} value={String(u.id)}>
                      {u.ho_ten} ({u.username})
                    </option>
                  ))}
                </select>
              </div>

              <div className="rasoat-filter-item">
                <label
                  htmlFor="timkiem-loc-xac-nhan"
                  className="rasoat-filter-label"
                >
                  Xác nhận:
                </label>
                <select
                  id="timkiem-loc-xac-nhan"
                  className="form-select rasoat-filter-select"
                  value={boLoc.xac_nhan}
                  onChange={(e) =>
                    handleChangeBoLoc({
                      ...boLoc,
                      xac_nhan: e.target.value as BoLocTimKiem['xac_nhan'],
                    })
                  }
                >
                  <option value="tat_ca">Tất cả</option>
                  <option value="da">Đã xác nhận</option>
                  <option value="chua">Chưa xác nhận</option>
                </select>
              </div>

              <div className="rasoat-filter-item">
                <label
                  htmlFor="timkiem-loc-vi-tri"
                  className="rasoat-filter-label"
                >
                  Vị trí:
                </label>
                <select
                  id="timkiem-loc-vi-tri"
                  className="form-select rasoat-filter-select"
                  value={boLoc.vi_tri}
                  onChange={(e) =>
                    handleChangeBoLoc({
                      ...boLoc,
                      vi_tri: e.target.value as BoLocTimKiem['vi_tri'],
                    })
                  }
                >
                  <option value="tat_ca">Tất cả</option>
                  <option value="buoi">Trong danh sách</option>
                  <option value="kho_ca_nhan">Kho cá nhân</option>
                  <option value="kho_chung">Kho chờ chung</option>
                  <option value="da_loai">Đã loại khỏi danh sách</option>
                </select>
              </div>
            </div>

            <div className="rasoat-filter-row">
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

              <div className="rasoat-filter-item">
                <label
                  htmlFor="timkiem-loc-ghi-chu"
                  className="rasoat-filter-label"
                >
                  Ghi chú:
                </label>
                <select
                  id="timkiem-loc-ghi-chu"
                  className="form-select rasoat-filter-select"
                  value={boLoc.co_ghi_chu}
                  onChange={(e) =>
                    handleChangeBoLoc({
                      ...boLoc,
                      co_ghi_chu: e.target.value as BoLocTimKiem['co_ghi_chu'],
                    })
                  }
                >
                  <option value="tat_ca">Tất cả</option>
                  <option value="1">Có ghi chú</option>
                  <option value="0">Không</option>
                </select>
              </div>

              <div className="rasoat-filter-item">
                <label
                  htmlFor="timkiem-loc-tt-ksk"
                  className="rasoat-filter-label"
                >
                  {NHAN.TT_KSK}:
                </label>
                <select
                  id="timkiem-loc-tt-ksk"
                  className="form-select rasoat-filter-select"
                  value={boLoc.tt_ksk}
                  onChange={(e) =>
                    handleChangeBoLoc({
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
                <label
                  htmlFor="timkiem-loc-nguon"
                  className="rasoat-filter-label"
                >
                  Nguồn:
                </label>
                <select
                  id="timkiem-loc-nguon"
                  className="form-select rasoat-filter-select"
                  value={boLoc.nguon}
                  onChange={(e) =>
                    handleChangeBoLoc({
                      ...boLoc,
                      nguon: e.target.value as BoLocTimKiem['nguon'],
                    })
                  }
                >
                  <option value="tat_ca">Tất cả</option>
                  <option value="his">HIS</option>
                  <option value="them_tay">Thêm tay</option>
                  <option value="kho_chung">Nhận từ kho chung</option>
                </select>
              </div>
            </div>
          </div>
        )}

        <div className="rasoat-filter-status-bar" aria-live="polite">
          <div className="rasoat-filter-status-left">
            <span
              className={
                tongBoLocDangBat > 0
                  ? 'rasoat-active-filter-count active'
                  : 'rasoat-active-filter-count'
              }
            >
              Đang bật: <strong className="num">{formatNumber(soBoLoc)}</strong>{' '}
              bộ lọc
              {coTuKhoa ? ` + từ khóa "${trimmedQuery}"` : ''}
            </span>
            {loading && <span className="text-muted">· Đang tìm kiếm…</span>}
          </div>

          <div className="rasoat-filter-status-right">
            <button
              type="button"
              className="btn btn-secondary btn-xs"
              onClick={handleResetFilters}
              disabled={soBoLoc === 0}
            >
              Xóa bộ lọc
            </button>
            <button
              type="button"
              className="btn btn-secondary btn-xs"
              aria-expanded={!filterCollapsed}
              onClick={() => setFilterCollapsed((prev) => !prev)}
            >
              {filterCollapsed ? 'Mở bộ lọc' : 'Thu gọn bộ lọc'}
            </button>
          </div>
        </div>
      </div>

      {!duDieuKienTim && (
        <div className="state-box" role="status">
          <p className="state-title">
            Gõ ít nhất 2 ký tự hoặc chọn bộ lọc để bắt đầu tìm kiếm
          </p>
          <p className="state-desc">
            Ví dụ: gõ &quot;ng anh&quot; (khớp Nguyễn Hoàng Anh), từ trong ghi
            chú, &quot;thuy 1960&quot;, 4 số cuối CCCD, mã KCB, hoặc chọn bộ lọc
            Xã/phường, Ngày khám, Cận lâm sàng…
          </p>
        </div>
      )}

      {duDieuKienTim && loading && (
        <div className="state-box" role="status">
          <p className="state-title">Đang tìm kiếm hồ sơ…</p>
          <p className="state-desc">
            {coTuKhoa
              ? `Từ khóa: "${trimmedQuery}"${soBoLoc > 0 ? ` · ${soBoLoc} bộ lọc` : ''}`
              : `Đang lọc theo ${soBoLoc} bộ lọc`}
          </p>
        </div>
      )}

      {duDieuKienTim && !loading && error && (
        <div className="state-box state-error" role="alert">
          <p className="state-title">Không thực hiện được tìm kiếm</p>
          <p className="state-desc">{error}</p>
          <div className="state-actions">
            <button
              type="button"
              className="btn btn-primary btn-sm"
              onClick={handleRetry}
            >
              Thử lại
            </button>
          </div>
        </div>
      )}

      {duDieuKienTim &&
        !loading &&
        !error &&
        hasSearched &&
        ketQua.length === 0 && (
          <div className="state-box" role="status">
            <p className="state-title">
              {coTuKhoa
                ? `Không tìm thấy hồ sơ khớp từ khóa "${trimmedQuery}"`
                : 'Không tìm thấy hồ sơ khớp bộ lọc'}
            </p>
            <p className="state-desc">
              Không tìm thấy kết quả phù hợp — thử bỏ bớt điều kiện lọc, từ khóa
              hoặc chọn Toàn bộ app.
            </p>
            <div className="state-actions">
              {phamVi !== 'tat_ca' && (
                <button
                  type="button"
                  className="btn btn-primary btn-sm"
                  onClick={() => setPhamVi('tat_ca')}
                >
                  Chuyển sang Toàn bộ app
                </button>
              )}
              {soBoLoc > 0 && (
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  onClick={handleResetFilters}
                >
                  Xóa bộ lọc
                </button>
              )}
            </div>
          </div>
        )}

      {duDieuKienTim && !loading && !error && ketQua.length > 0 && (
        <>
          <div
            className={`timkiem-summary-bar ${vuotGioiHan ? 'timkiem-limit-warning' : ''}`}
            role="status"
            aria-live="polite"
          >
            {vuotGioiHan ? (
              <span>
                Hiển thị{' '}
                <strong className="num">{formatNumber(ketQua.length)}</strong> /{' '}
                <strong className="num">{formatNumber(tong)}</strong> kết quả —
                gõ thêm từ khóa hoặc thêm bộ lọc để thu hẹp
              </span>
            ) : (
              <span>
                Tìm thấy <strong className="num">{formatNumber(tong)}</strong>{' '}
                kết quả
              </span>
            )}
          </div>

          <div className="table-wrap">
            <table className="data-table rasoat-table timkiem-table">
              <thead>
                <tr>
                  <th className="num-col col-stt">STT</th>
                  <th className="col-hoten">Họ tên</th>
                  <th className="col-gt">GT</th>
                  <th className="num-col col-namsinh">Năm sinh</th>
                  <th className="col-cccd">CCCD</th>
                  <th className="col-makcb">Mã KCB</th>
                  <th className="col-ghichu">Ghi chú</th>
                  {CLS.map((c) => (
                    <th key={c.key} className="col-cls" title={c.ten}>
                      <div className="cls-th-label">{c.ngan}</div>
                    </th>
                  ))}
                  <th className="col-confirm">Đã xác nhận</th>
                  <th className="col-vitri">Vị trí</th>
                  <th className="col-thaotac">Thao tác</th>
                </tr>
              </thead>
              <tbody>
                {ketQua.map((h, idx) => {
                  const hisTimeShort = formatHisTimestamp(
                    h.ngay_gio_dang_ky_his,
                  );
                  const viTriLabel = formatViTriKetQua(h);
                  const canOpenSession =
                    h.co_quyen_sua && h.vi_tri === 'buoi' && h.buoi !== null;
                  const isOtherUserSession =
                    !h.co_quyen_sua && h.vi_tri === 'buoi' && h.buoi !== null;
                  const danhDau =
                    tokensKhop.length > 0
                      ? khopHoSo(tokensKhop, h).danhDau
                      : undefined;

                  return (
                    <tr
                      key={h.id}
                      className={h.da_xac_nhan ? 'hoso-row-confirmed' : ''}
                    >
                      <td className="num-col col-stt">{idx + 1}</td>
                      <td className="col-hoten">
                        <div className="hoten-main-line">
                          <strong className="hoten-text">
                            <ToVang
                              text={h.ho_ten}
                              ranges={danhDau?.ho_ten}
                            />
                          </strong>
                          {h.sua_nhan_than && (
                            <span
                              className="chip chip-edited"
                              title="Đã sửa thông tin nhân thân theo hồ sơ giấy"
                            >
                              Đã sửa
                            </span>
                          )}
                          {h.nguon === 'them_tay' && (
                            <span className="chip chip-manual">Thêm tay</span>
                          )}
                        </div>
                        <div className="hoten-sub-line">
                          <span>
                            ĐK HIS {hisTimeShort || '—'} · {NHAN.TT_KSK}:{' '}
                            {h.co_tt_ksk === 1 ? 'Có' : 'Không'}
                          </span>
                          {h.canh_bao &&
                            h.canh_bao.length > 0 &&
                            h.canh_bao.map((code) => (
                              <span
                                key={code}
                                className="chip chip-warning"
                                title={getCanhBaoTooltip(code, h.cls_ghi_chu)}
                              >
                                {CANH_BAO_NHAN[code] ?? code}
                              </span>
                            ))}
                        </div>
                      </td>
                      <td className="col-gt">{h.gioi_tinh || 'Chưa rõ'}</td>
                      <td className="num-col col-namsinh">
                        {h.nam_sinh ? (
                          <ToVang
                            text={String(h.nam_sinh)}
                            ranges={danhDau?.nam_sinh}
                          />
                        ) : (
                          '—'
                        )}
                      </td>
                      <td className="col-cccd num">
                        {h.cccd ? (
                          <ToVang text={h.cccd} ranges={danhDau?.cccd} />
                        ) : (
                          '—'
                        )}
                      </td>
                      <td className="col-makcb num">
                        {h.ma_kcb ? (
                          <ToVang text={h.ma_kcb} ranges={danhDau?.ma_kcb} />
                        ) : (
                          '—'
                        )}
                      </td>
                      <td
                        className="col-ghichu"
                        title={h.ghi_chu || undefined}
                      >
                        {h.ghi_chu ? (
                          <div className="ghichu-clamp">
                            <ToVang
                              text={h.ghi_chu}
                              ranges={danhDau?.ghi_chu}
                            />
                          </div>
                        ) : (
                          '—'
                        )}
                      </td>

                      {CLS.map((c) => {
                        const val = h.cls[c.key] === 1 ? 1 : 0;
                        const srcVal = h.src ? h.src.cls[c.key] : val;
                        const isDiff = h.src !== null && srcVal !== val;
                        return (
                          <td key={c.key} className="col-cls">
                            <span
                              className={[
                                'cls-ro-cell',
                                val === 1 ? 'cls-ro-on' : 'cls-ro-off',
                                isDiff ? 'cls-btn-diff' : '',
                              ]
                                .filter(Boolean)
                                .join(' ')}
                              title={`${c.ten}: ${val === 1 ? 'Có làm (1)' : 'Không làm (0)'}`}
                              aria-label={`${c.ten}: ${val === 1 ? 'Có' : 'Không'}`}
                            >
                              {val === 1 ? c.ngan : '—'}
                            </span>
                          </td>
                        );
                      })}

                      <td className="col-confirm">
                        {h.da_xac_nhan ? (
                          <span className="badge badge-success">
                            ✓ Đã xác nhận
                          </span>
                        ) : (
                          <span className="badge badge-neutral">
                            Chưa xác nhận
                          </span>
                        )}
                      </td>

                      <td className="col-vitri">{viTriLabel}</td>

                      <td className="col-thaotac">
                        {canOpenSession && h.buoi ? (
                          <Link
                            href={`/ra-soat/${encodeURIComponent(h.buoi.ma_buoi)}?chon=${h.id}`}
                            className="btn btn-primary btn-xs"
                          >
                            Mở trong danh sách
                          </Link>
                        ) : isOtherUserSession ? (
                          <div className="timkiem-actions-cell">
                            <span className="badge badge-neutral">Chỉ xem</span>
                            <button
                              type="button"
                              className="btn btn-secondary btn-xs"
                              onClick={() => setDeNghiTarget(h)}
                            >
                              Đề nghị chuyển về buổi của tôi
                            </button>
                          </div>
                        ) : h.vi_tri === 'kho_chung' ||
                          (h.vi_tri === 'kho_ca_nhan' && h.co_quyen_sua) ? (
                          <Link
                            href={
                              h.vi_tri === 'kho_chung'
                                ? '/kho?tab=kho_chung'
                                : '/kho?tab=kho_ca_nhan'
                            }
                            className="btn btn-secondary btn-xs"
                          >
                            Mở Kho chờ
                          </Link>
                        ) : (
                          <span className="badge badge-neutral">Chỉ xem</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}

      {deNghiTarget && (
        <DeNghiChuyenTuTimKiemModal
          hoSo={deNghiTarget}
          onClose={() => setDeNghiTarget(null)}
          onSuccess={() => setDeNghiTarget(null)}
        />
      )}
    </div>
  );
}
