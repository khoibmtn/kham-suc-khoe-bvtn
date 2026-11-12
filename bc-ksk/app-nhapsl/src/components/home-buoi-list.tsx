'use client';

import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type {
  BuoiTomTat,
  KetQuaTimKiem,
  TheTongHop,
  TrangThaiBuoi,
  UserQuanLy,
} from '@/lib/api-types';
import { DON_VI, NHAN } from '@/lib/cls';
import { khongDau } from '@/lib/text';
import { apiRequest, downloadFile } from '@/lib/client/api';
import {
  docTuyChonAmBao,
  NHAC_THONG_BAO_STORAGE_KEY,
} from '@/lib/client/am-bao';
import {
  formatChenhLech,
  formatDate,
  formatNumber,
  formatPercent,
  TRANG_THAI_BUOI_NHAN,
} from '@/lib/client/format';
import { openThongBaoAmBaoModal, type ShellUser } from './app-shell';
import {
  DuaVaoKhoChungTuKhoModal,
  KhoTable,
  NhanVeBuoiModal,
} from './kho-view';
import { useToast } from './toast';

export type DashboardToiData = {
  the: TheTongHop;
  buoi: BuoiTomTat[];
  kho_ca_nhan: KetQuaTimKiem[];
  de_nghi_cho_toi: number;
};

type HomeBuoiListProps = {
  user: ShellUser;
  initialBuoi?: BuoiTomTat[] | null;
  initialDashboard?: DashboardToiData | null;
};

export type BoLocBuoi = {
  donVi: string;
  trangThai: string;
  phuTrach: string;
  tuNgay: string;
  denNgay: string;
  timNhanh: string;
};

export function locDanhSachBuoi(
  list: BuoiTomTat[],
  filter: BoLocBuoi,
): BuoiTomTat[] {
  const qRaw = filter.timNhanh.trim().toLowerCase();
  const qKd = khongDau(filter.timNhanh);

  return list.filter((b) => {
    if (filter.donVi && b.don_vi !== filter.donVi) return false;
    if (filter.trangThai && b.trang_thai !== filter.trangThai) return false;
    if (filter.phuTrach) {
      if (filter.phuTrach === 'none') {
        if (b.phu_trach !== null) return false;
      } else if (String(b.phu_trach?.id ?? '') !== filter.phuTrach) {
        return false;
      }
    }
    if (filter.tuNgay && b.ngay_kham < filter.tuNgay) return false;
    if (filter.denNgay && b.ngay_kham > filter.denNgay) return false;

    if (qRaw) {
      const ngayStr = formatDate(b.ngay_kham).toLowerCase();
      const maBuoiStr = b.ma_buoi.toLowerCase();
      const diemKd = khongDau(b.diem_kham ?? '');
      const doanKd = khongDau(b.doan_kham ?? '');
      const tenDonViKd = khongDau(b.ten_don_vi ?? '');
      const phuTrachKd = khongDau(b.phu_trach?.ho_ten ?? '');

      const matchRaw =
        ngayStr.includes(qRaw) ||
        b.ngay_kham.includes(qRaw) ||
        maBuoiStr.includes(qRaw);
      const matchKd =
        qKd.length > 0 &&
        (diemKd.includes(qKd) ||
          doanKd.includes(qKd) ||
          tenDonViKd.includes(qKd) ||
          phuTrachKd.includes(qKd));

      if (!matchRaw && !matchKd) return false;
    }

    return true;
  });
}

export function tinhTheTongHopTuBuoi(
  list: BuoiTomTat[],
  khoCaNhanCount = 0,
): TheTongHop {
  let soDoan = 0;
  let hienCo = 0;
  let daXacNhan = 0;
  let thua = 0;
  let thieu = 0;
  let boSung = 0;
  let soBuoiDaXacNhan = 0;

  for (const b of list) {
    soDoan += b.so_doan_tong;
    hienCo += b.hien_co;
    daXacNhan += b.da_xac_nhan;
    thua += b.thua;
    thieu += b.thieu;
    boSung += b.bo_sung;
    if (b.trang_thai === 'da_xac_nhan') {
      soBuoiDaXacNhan += 1;
    }
  }

  const tienDo = hienCo > 0 ? Math.round((daXacNhan / hienCo) * 1000) / 10 : 0;
  return {
    so_buoi: list.length,
    so_buoi_da_xac_nhan: soBuoiDaXacNhan,
    so_buoi_chua_xac_nhan: list.length - soBuoiDaXacNhan,
    so_doan: soDoan,
    hien_co: hienCo,
    da_xac_nhan: daXacNhan,
    chua_xac_nhan: Math.max(0, hienCo - daXacNhan),
    thua,
    thieu,
    chenh_lech: hienCo - soDoan,
    bo_sung: boSung,
    kho_ca_nhan: khoCaNhanCount,
    tien_do: tienDo,
  };
}

function renderTrangThaiBadge(trangThai: TrangThaiBuoi) {
  const label = TRANG_THAI_BUOI_NHAN[trangThai] ?? trangThai;
  if (trangThai === 'da_xac_nhan') {
    return <span className="badge badge-success">✓ {label}</span>;
  }
  if (trangThai === 'dang_ra_soat') {
    return <span className="badge badge-warning">● {label}</span>;
  }
  return <span className="badge badge-neutral">○ {label}</span>;
}

export function HomeBuoiList({
  user,
  initialBuoi = null,
  initialDashboard = null,
}: HomeBuoiListProps) {
  const router = useRouter();
  const { showToast } = useToast();
  const isAdmin = user.role === 'admin';

  const [buoiList, setBuoiList] = useState<BuoiTomTat[]>(
    initialDashboard?.buoi ?? initialBuoi ?? [],
  );
  const [theData, setTheData] = useState<TheTongHop | null>(
    initialDashboard?.the ?? null,
  );
  const [khoCaNhan, setKhoCaNhan] = useState<KetQuaTimKiem[]>(
    initialDashboard?.kho_ca_nhan ?? [],
  );
  const [deNghiChoToi, setDeNghiChoToi] = useState<number>(
    initialDashboard?.de_nghi_cho_toi ?? 0,
  );
  const [loading, setLoading] = useState<boolean>(
    initialDashboard === null && initialBuoi === null,
  );
  const [error, setError] = useState<string>('');

  const [donViFilter, setDonViFilter] = useState<string>('');
  const [trangThaiFilter, setTrangThaiFilter] = useState<string>('');
  const [phuTrachFilter, setPhuTrachFilter] = useState<string>('');
  const [tuNgayFilter, setTuNgayFilter] = useState<string>('');
  const [denNgayFilter, setDenNgayFilter] = useState<string>('');
  const [timNhanhFilter, setTimNhanhFilter] = useState<string>('');

  const [hoSoJumpQuery, setHoSoJumpQuery] = useState<string>('');
  const [users, setUsers] = useState<UserQuanLy[]>([]);
  const [hienNhacThongBao, setHienNhacThongBao] = useState<boolean>(false);

  // Xuất báo cáo Excel (nhân viên)
  const [chiDaXacNhan, setChiDaXacNhan] = useState<'1' | '0'>('1');
  const [exportingExcel, setExportingExcel] = useState<boolean>(false);
  const [exportError, setExportError] = useState<string>('');

  // Hộp thoại thao tác nhanh kho của tôi
  const [nhanVeTarget, setNhanVeTarget] = useState<KetQuaTimKiem | null>(null);
  const [moveToChungTarget, setMoveToChungTarget] =
    useState<KetQuaTimKiem | null>(null);

  // Kiểm tra hiển thị lời nhắc nhẹ lần đầu về thông báo & âm báo
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const t = window.setTimeout(() => {
      try {
        const daDong = window.localStorage.getItem(NHAC_THONG_BAO_STORAGE_KEY);
        if (daDong === '1') return;
        const pushGranted =
          'Notification' in window && Notification.permission === 'granted';
        const amBaoOn = docTuyChonAmBao();
        if (!pushGranted || !amBaoOn) {
          setHienNhacThongBao(true);
        }
      } catch {
        // ignore
      }
    }, 0);
    return () => window.clearTimeout(t);
  }, []);

  function handleDongNhacThongBao() {
    setHienNhacThongBao(false);
    try {
      window.localStorage.setItem(NHAC_THONG_BAO_STORAGE_KEY, '1');
    } catch {
      // ignore
    }
  }

  const reloadBuoi = useCallback(async () => {
    setLoading(true);
    setError('');
    const res = await apiRequest<DashboardToiData>('/api/dashboard/toi');
    if (!res.ok) {
      setError(res.error);
      setLoading(false);
      return;
    }
    setBuoiList(res.data.buoi ?? []);
    setTheData(res.data.the ?? null);
    setKhoCaNhan(res.data.kho_ca_nhan ?? []);
    setDeNghiChoToi(res.data.de_nghi_cho_toi ?? 0);
    setLoading(false);
  }, []);

  useEffect(() => {
    if (initialDashboard !== null) {
      return;
    }
    let cancelled = false;
    apiRequest<DashboardToiData>('/api/dashboard/toi').then((res) => {
      if (cancelled) return;
      if (!res.ok) {
        if (initialBuoi === null) {
          setError(res.error);
        }
        setLoading(false);
        return;
      }
      setError('');
      setBuoiList(res.data.buoi ?? []);
      setTheData(res.data.the ?? null);
      setKhoCaNhan(res.data.kho_ca_nhan ?? []);
      setDeNghiChoToi(res.data.de_nghi_cho_toi ?? 0);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [initialBuoi, initialDashboard]);

  useEffect(() => {
    const handlePoolChanged = () => {
      void reloadBuoi();
    };
    window.addEventListener('nhapsl:pool-changed', handlePoolChanged);
    return () => {
      window.removeEventListener('nhapsl:pool-changed', handlePoolChanged);
    };
  }, [reloadBuoi]);

  useEffect(() => {
    if (!isAdmin) return;
    let cancelled = false;
    apiRequest<{ users: UserQuanLy[] }>('/api/users').then((res) => {
      if (!cancelled && res.ok && Array.isArray(res.data.users)) {
        setUsers(res.data.users);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [isAdmin]);

  const filteredBuoi = useMemo(
    () =>
      locDanhSachBuoi(buoiList, {
        donVi: donViFilter,
        trangThai: trangThaiFilter,
        phuTrach: phuTrachFilter,
        tuNgay: tuNgayFilter,
        denNgay: denNgayFilter,
        timNhanh: timNhanhFilter,
      }),
    [
      buoiList,
      donViFilter,
      trangThaiFilter,
      phuTrachFilter,
      tuNgayFilter,
      denNgayFilter,
      timNhanhFilter,
    ],
  );

  const hasActiveFilter = Boolean(
    donViFilter ||
      trangThaiFilter ||
      phuTrachFilter ||
      tuNgayFilter ||
      denNgayFilter ||
      timNhanhFilter.trim(),
  );

  const effectiveThe = useMemo<TheTongHop>(() => {
    if (hasActiveFilter) {
      return tinhTheTongHopTuBuoi(
        filteredBuoi,
        theData?.kho_ca_nhan ?? khoCaNhan.length,
      );
    }
    if (theData) return theData;
    return tinhTheTongHopTuBuoi(buoiList, khoCaNhan.length);
  }, [buoiList, filteredBuoi, hasActiveFilter, khoCaNhan.length, theData]);

  function handleResetFilters() {
    setDonViFilter('');
    setTrangThaiFilter('');
    setPhuTrachFilter('');
    setTuNgayFilter('');
    setDenNgayFilter('');
    setTimNhanhFilter('');
  }

  function handleJumpTimHoSo(e: FormEvent) {
    e.preventDefault();
    const q = hoSoJumpQuery.trim();
    if (q) {
      router.push(`/tim-kiem?q=${encodeURIComponent(q)}`);
    } else {
      router.push('/tim-kiem');
    }
  }

  async function handleExportExcelMine() {
    setExportError('');
    setExportingExcel(true);
    const res = await downloadFile(
      `/api/export/bao-cao.xlsx?chi_da_xac_nhan=${chiDaXacNhan}`,
      'bao-cao-ksk-phan-cua-toi.xlsx',
    );
    setExportingExcel(false);
    if (!res.ok) {
      setExportError(res.error);
      showToast(`Lỗi xuất báo cáo Excel: ${res.error}`, 'error');
      return;
    }
    showToast(`Đã tải xuống báo cáo ${res.filename}`, 'success');
  }

  const progressWidth = Math.min(100, Math.max(0, effectiveThe.tien_do));

  return (
    <div className="page-container">
      {hienNhacThongBao && (
        <div className="home-notif-reminder" role="region" aria-label="Lời nhắc thông báo">
          <div className="home-notif-reminder-text">
            <strong>Bật âm báo và thông báo để không bỏ lỡ đề nghị chuyển</strong>
            <span className="text-muted text-xs">
              Nhận tiếng chuông hoặc thông báo trên điện thoại ngay khi đồng nghiệp xin chuyển hồ sơ.
            </span>
          </div>
          <div className="home-notif-reminder-actions">
            <button
              type="button"
              className="btn btn-primary btn-xs"
              onClick={() => openThongBaoAmBaoModal()}
            >
              Cài đặt thông báo
            </button>
            <button
              type="button"
              className="btn btn-secondary btn-xs"
              onClick={handleDongNhacThongBao}
            >
              Đóng
            </button>
          </div>
        </div>
      )}

      <div className="page-header-row">
        <div>
          <h1 className="page-title">
            {isAdmin
              ? 'Danh sách buổi khám toàn hệ thống'
              : 'Bảng theo dõi tiến độ & Danh sách buổi khám của tôi'}
          </h1>
          <p className="page-subtitle">
            {isAdmin
              ? 'Bấm vào một dòng buổi khám để mở màn hình rà soát hồ sơ giấy.'
              : 'Theo dõi tiến độ rà soát, xử lý kho cá nhân và bấm vào dòng buổi khám để kiểm hồ sơ giấy.'}
          </p>
        </div>
        <div className="page-header-actions">
          <Link
            href="/kho?tab=de_nghi"
            className={`badge ${deNghiChoToi > 0 ? 'badge-warning' : 'badge-neutral'}`}
            title="Xem danh sách đề nghị chuyển hồ sơ trong Kho chờ"
          >
            <span className="num">{formatNumber(deNghiChoToi)}</span>&nbsp;đề
            nghị chuyển đang chờ bạn →
          </Link>

          <form onSubmit={handleJumpTimHoSo} className="home-jump-search-form">
            <label htmlFor="home-jump-tim-ho-so" className="sr-only">
              Tìm hồ sơ nhanh
            </label>
            <input
              id="home-jump-tim-ho-so"
              type="search"
              className="form-input form-input-sm home-jump-search-input"
              placeholder="Tìm hồ sơ… (họ tên, năm sinh, CCCD)"
              value={hoSoJumpQuery}
              onChange={(e) => setHoSoJumpQuery(e.target.value)}
            />
            <button type="submit" className="btn btn-secondary btn-sm">
              Tìm hồ sơ
            </button>
          </form>

          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={() => void reloadBuoi()}
            disabled={loading}
          >
            {loading ? 'Đang tải…' : 'Tải lại'}
          </button>

          {isAdmin && (
            <Link href="/admin" className="btn btn-primary btn-sm">
              Xem tổng quan
            </Link>
          )}

          <Link
            href="/ra-soat"
            className={`btn btn-sm ${isAdmin ? 'btn-secondary' : 'btn-primary'}`}
          >
            Chọn nhanh Đơn vị / Ngày →
          </Link>
        </div>
      </div>

      {/* Thẻ tổng hợp tiến độ */}
      <section
        className="summary-strip summary-strip-dashboard"
        aria-label="Chỉ số tổng hợp"
      >
        <div className="summary-card">
          <span className="summary-label">
            {isAdmin ? 'Số buổi khám' : 'Số buổi phụ trách'}
            {hasActiveFilter ? ' (đang lọc)' : ''}
          </span>
          <strong className="summary-value num">
            {formatNumber(effectiveThe.so_buoi)}
          </strong>
          <span className="summary-sub">
            {NHAN.SO_DOAN}:{' '}
            <strong className="num">{formatNumber(effectiveThe.so_doan)}</strong>
          </span>
        </div>

        <div className="summary-card">
          <span className="summary-label">Buổi đã xác nhận / chưa</span>
          <strong className="summary-value num">
            {formatNumber(effectiveThe.so_buoi_da_xac_nhan)} /{' '}
            {formatNumber(effectiveThe.so_buoi_chua_xac_nhan)}
          </strong>
          <span className="summary-sub">
            Đã xác nhận: {formatNumber(effectiveThe.so_buoi_da_xac_nhan)} · Chưa:{' '}
            {formatNumber(effectiveThe.so_buoi_chua_xac_nhan)}
          </span>
        </div>

        <div className="summary-card">
          <span className="summary-label">Tổng hồ sơ trong DS</span>
          <strong className="summary-value num">
            {formatNumber(effectiveThe.hien_co)}
          </strong>
          <span className="summary-sub">
            {NHAN.SO_DOAN}: {formatNumber(effectiveThe.so_doan)} người
          </span>
        </div>

        <div className="summary-card">
          <span className="summary-label">Đã xác nhận</span>
          <strong className="summary-value num text-success">
            {formatNumber(effectiveThe.da_xac_nhan)}
          </strong>
          <span className="summary-sub">Đã kiểm – có hồ sơ giấy</span>
        </div>

        <div className="summary-card">
          <span className="summary-label">Chưa rà soát</span>
          <strong className="summary-value num">
            {formatNumber(effectiveThe.chua_xac_nhan)}
          </strong>
          <span className="summary-sub">Chưa xác nhận trong DS</span>
        </div>

        <div className="summary-card">
          <span className="summary-label">Thừa / Thiếu (cộng theo buổi)</span>
          <strong className="summary-value num">
            +{formatNumber(effectiveThe.thua)} / -{formatNumber(effectiveThe.thieu)}
          </strong>
          <span className="summary-sub">
            Thừa: {formatNumber(effectiveThe.thua)} · Thiếu:{' '}
            {formatNumber(effectiveThe.thieu)} · Lệch ròng:{' '}
            <span className="num">
              {formatChenhLech(effectiveThe.chenh_lech)}
            </span>
          </span>
        </div>

        <div className="summary-card">
          <span className="summary-label">Bổ sung</span>
          <strong className="summary-value num">
            {formatNumber(effectiveThe.bo_sung)}
          </strong>
          <span className="summary-sub">Thêm tay + nhận từ kho chung</span>
        </div>

        <div className="summary-card">
          <span className="summary-label">Trong kho của tôi</span>
          <strong className="summary-value num">
            {formatNumber(effectiveThe.kho_ca_nhan)}
          </strong>
          <span className="summary-sub">
            <Link href="/kho">Mở trang Kho chờ →</Link>
          </span>
        </div>

        <div className="summary-card summary-card-progress">
          <span className="summary-label">Tiến độ %</span>
          <div className="progress-card-row">
            <strong className="summary-value num">
              {formatPercent(effectiveThe.tien_do)}
            </strong>
            <span className="summary-sub num">
              ({formatNumber(effectiveThe.da_xac_nhan)}/
              {formatNumber(effectiveThe.hien_co)})
            </span>
          </div>
          <div
            className="progress-track"
            role="progressbar"
            aria-valuenow={Math.round(effectiveThe.tien_do)}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label={`Tiến độ rà soát ${formatPercent(effectiveThe.tien_do)}`}
          >
            <div
              className="progress-fill"
              style={{ width: `${progressWidth}%` }}
            />
          </div>
        </div>
      </section>

      {/* Thanh xuất báo cáo Excel cho nhân viên */}
      {!isAdmin && (
        <section
          className="export-inline-bar"
          aria-label="Xuất báo cáo Excel phần của tôi"
        >
          <div className="export-inline-left">
            <strong>Báo cáo kết quả rà soát của bạn:</strong>
            <span className="text-muted">
              Xuất file Excel thống kê và danh sách chi tiết các buổi khám bạn
              phụ trách.
            </span>
          </div>
          <div className="export-inline-right">
            <label htmlFor="staff-export-scope" className="filter-label">
              Phạm vi hồ sơ:
            </label>
            <select
              id="staff-export-scope"
              className="form-select filter-select-sm"
              value={chiDaXacNhan}
              onChange={(e) => setChiDaXacNhan(e.target.value as '1' | '0')}
              disabled={exportingExcel}
            >
              <option value="1">Chỉ hồ sơ đã xác nhận (mặc định)</option>
              <option value="0">Tất cả hồ sơ trong danh sách</option>
            </select>
            <button
              type="button"
              className="btn btn-primary btn-sm"
              onClick={() => void handleExportExcelMine()}
              disabled={exportingExcel}
            >
              {exportingExcel
                ? 'Đang tạo file…'
                : 'Xuất báo cáo Excel (phần của tôi)'}
            </button>
          </div>
          {exportError && (
            <div className="alert alert-error w-full mb-0" role="alert">
              Lỗi xuất báo cáo: {exportError}
            </div>
          )}
        </section>
      )}

      {/* Khối Hồ sơ trong kho của tôi (nếu có) */}
      {!isAdmin && khoCaNhan.length > 0 && (
        <section
          className="panel-card mb-3"
          aria-label="Hồ sơ trong kho của tôi"
        >
          <div className="panel-header-inline">
            <div>
              <h2 className="panel-title">
                Hồ sơ trong kho của tôi ({formatNumber(khoCaNhan.length)})
              </h2>
              <p className="text-muted text-xs">
                Các hồ sơ bạn đang tạm gác để kiểm tra lại. Có thể nhận về buổi
                khám của bạn hoặc đưa sang kho chờ chung.
              </p>
            </div>
            <Link href="/kho" className="btn btn-secondary btn-xs">
              Mở trang Kho chờ →
            </Link>
          </div>
          <KhoTable
            items={khoCaNhan}
            showMoveToKhoChung={true}
            onSelectNhanVe={(h) => setNhanVeTarget(h)}
            onSelectMoveToKhoChung={(h) => setMoveToChungTarget(h)}
          />
        </section>
      )}

      <div className="filter-bar">
        <div className="filter-group">
          <label htmlFor="filter-don-vi" className="filter-label">
            Đơn vị:
          </label>
          <select
            id="filter-don-vi"
            className="form-select"
            value={donViFilter}
            onChange={(e) => setDonViFilter(e.target.value)}
          >
            <option value="">Tất cả đơn vị</option>
            {(Object.keys(DON_VI) as Array<keyof typeof DON_VI>).map((code) => (
              <option key={code} value={code}>
                {DON_VI[code]} ({code})
              </option>
            ))}
          </select>
        </div>

        <div className="filter-group">
          <label htmlFor="filter-trang-thai" className="filter-label">
            Trạng thái:
          </label>
          <select
            id="filter-trang-thai"
            className="form-select"
            value={trangThaiFilter}
            onChange={(e) => setTrangThaiFilter(e.target.value)}
          >
            <option value="">Tất cả trạng thái</option>
            <option value="chua_ra_soat">Chưa rà soát</option>
            <option value="dang_ra_soat">Đang rà soát</option>
            <option value="da_xac_nhan">Đã xác nhận</option>
          </select>
        </div>

        {isAdmin && (
          <div className="filter-group">
            <label htmlFor="filter-phu-trach" className="filter-label">
              Phụ trách:
            </label>
            <select
              id="filter-phu-trach"
              className="form-select"
              value={phuTrachFilter}
              onChange={(e) => setPhuTrachFilter(e.target.value)}
            >
              <option value="">Tất cả người phụ trách</option>
              <option value="none">Chưa phân công</option>
              {users.map((u) => (
                <option key={u.id} value={String(u.id)}>
                  {u.ho_ten} ({u.username})
                </option>
              ))}
            </select>
          </div>
        )}

        <div className="filter-group">
          <label htmlFor="filter-tu-ngay" className="filter-label">
            Từ ngày:
          </label>
          <input
            id="filter-tu-ngay"
            type="date"
            className="form-input form-input-sm input-date-compact"
            value={tuNgayFilter}
            onChange={(e) => setTuNgayFilter(e.target.value)}
          />
          <label htmlFor="filter-den-ngay" className="filter-label">
            Đến:
          </label>
          <input
            id="filter-den-ngay"
            type="date"
            className="form-input form-input-sm input-date-compact"
            value={denNgayFilter}
            onChange={(e) => setDenNgayFilter(e.target.value)}
          />
        </div>

        <div className="filter-group">
          <label htmlFor="filter-tim-nhanh-buoi" className="filter-label">
            Tìm nhanh:
          </label>
          <input
            id="filter-tim-nhanh-buoi"
            type="search"
            className="form-input form-input-sm input-quick-buoi"
            placeholder="Ngày (14/09), điểm khám, đoàn…"
            value={timNhanhFilter}
            onChange={(e) => setTimNhanhFilter(e.target.value)}
          />
        </div>

        {hasActiveFilter && (
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={handleResetFilters}
          >
            Xóa lọc
          </button>
        )}
      </div>

      {error && (
        <div className="state-box state-error" role="alert">
          <p className="state-title">Lỗi tải danh sách buổi khám: {error}</p>
          <p className="state-desc">
            Vui lòng kiểm tra kết nối mạng và bấm nút thử lại bên dưới.
          </p>
          <button
            type="button"
            className="btn btn-primary btn-sm"
            onClick={() => void reloadBuoi()}
          >
            Thử tải lại
          </button>
        </div>
      )}

      {!error && loading && buoiList.length === 0 && (
        <div className="state-box" role="status">
          <p className="state-title">Đang tải danh sách buổi khám…</p>
        </div>
      )}

      {!error && !loading && filteredBuoi.length === 0 && (
        <div className="state-box">
          {hasActiveFilter ? (
            <>
              <p className="state-title">
                Không có buổi khám nào khớp với bộ lọc đang chọn.
              </p>
              <p className="state-desc">
                Đang hiển thị 0 / {formatNumber(buoiList.length)} buổi khám. Hãy
                nới điều kiện lọc hoặc bấm Xóa lọc.
              </p>
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={handleResetFilters}
              >
                Xóa lọc
              </button>
            </>
          ) : (
            <>
              <p className="state-title">
                Bạn chưa được phân công buổi nào. Liên hệ admin (BS Khôi).
              </p>
              {isAdmin && (
                <p className="state-desc">
                  Vào mục <Link href="/admin/phan-cong">Phân công</Link> để gán
                  buổi khám cho nhân viên.
                </p>
              )}
            </>
          )}
        </div>
      )}

      {filteredBuoi.length > 0 && (
        <>
          {/* Danh sách buổi khám dạng THẺ trên điện thoại */}
          <div className="mobile-only-cards buoi-card-list">
            {filteredBuoi.map((b) => (
              <Link
                key={b.id}
                href={`/ra-soat/${b.ma_buoi}`}
                className="mobile-data-card buoi-mobile-card"
              >
                <div className="mobile-data-card-head">
                  <div>
                    <span className="font-bold">{formatDate(b.ngay_kham)}</span>{' '}
                    <span className="font-semibold text-primary">
                      · {b.ten_don_vi.replace(/^(Phường|Xã) /, '')}
                    </span>
                    <div className="text-muted text-xs">{b.ma_buoi}</div>
                  </div>
                  {renderTrangThaiBadge(b.trang_thai)}
                </div>

                <div className="buoi-mobile-card-place">
                  {b.diem_kham || '—'}
                  {b.doan_kham ? ` · ${b.doan_kham}` : ''}
                </div>

                {isAdmin && (
                  <div className="text-muted text-xs">
                    Phụ trách:{' '}
                    <strong>{b.phu_trach ? b.phu_trach.ho_ten : 'Chưa phân công'}</strong>
                  </div>
                )}

                <div className="mobile-data-card-metrics num">
                  <span>
                    {NHAN.SO_DOAN}: <strong>{formatNumber(b.so_doan_tong)}</strong>
                  </span>
                  <span>
                    Trong DS: <strong>{formatNumber(b.hien_co)}</strong>
                  </span>
                  <span>
                    Đã XN:{' '}
                    <strong className="text-success">{formatNumber(b.da_xac_nhan)}</strong>
                  </span>
                  <span>
                    Chưa: <strong>{formatNumber(b.chua_xac_nhan)}</strong>
                  </span>
                  {(b.thua > 0 || b.thieu > 0) && (
                    <span>
                      Thừa/Thiếu: +{formatNumber(b.thua)} / −{formatNumber(b.thieu)}
                    </span>
                  )}
                </div>

                <div className="buoi-mobile-card-progress">
                  <div className="progress-track progress-track-sm">
                    <div
                      className="progress-fill"
                      style={{
                        width: `${Math.min(100, Math.max(0, b.tien_do))}%`,
                      }}
                    />
                  </div>
                  <span className="font-semibold num text-xs">
                    {formatPercent(b.tien_do)}
                  </span>
                </div>
              </Link>
            ))}
          </div>

          {/* Bảng đầy đủ trên máy tính */}
          <div className="table-wrap desktop-only-table">
            <table className="data-table buoi-table">
              <thead>
                <tr>
                  <th>Đơn vị</th>
                  <th>Ngày</th>
                  <th>Điểm khám</th>
                  {isAdmin && <th>Người phụ trách</th>}
                  <th className="num-col">{NHAN.SO_DOAN}</th>
                  <th className="num-col">Trong DS</th>
                  <th className="num-col">Đã xác nhận</th>
                  <th className="num-col">Chưa xác nhận</th>
                  <th className="num-col">Thừa</th>
                  <th className="num-col">Thiếu</th>
                  <th className="num-col">Bổ sung</th>
                  <th>Trạng thái</th>
                  <th className="num-col">Tiến độ %</th>
                </tr>
              </thead>
              <tbody>
                {filteredBuoi.map((b) => (
                  <tr
                    key={b.id}
                    className="clickable-row"
                    onClick={() => router.push(`/ra-soat/${b.ma_buoi}`)}
                    tabIndex={0}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        router.push(`/ra-soat/${b.ma_buoi}`);
                      }
                    }}
                  >
                    <td className="col-text" title={b.ten_don_vi}>
                      <span className="font-semibold">
                        {b.ten_don_vi.replace(/^(Phường|Xã) /, '')}
                      </span>
                    </td>
                    <td className="nowrap">
                      <Link
                        href={`/ra-soat/${b.ma_buoi}`}
                        onClick={(e) => e.stopPropagation()}
                        className="row-primary-link font-semibold"
                      >
                        {formatDate(b.ngay_kham)}
                      </Link>
                    </td>
                    <td className="col-text">
                      <div>{b.diem_kham || '—'}</div>
                      {b.doan_kham && (
                        <div className="sub-text">{b.doan_kham}</div>
                      )}
                    </td>
                    {isAdmin && (
                      <td className="col-text">
                        {b.phu_trach ? (
                          <span title={b.phu_trach.username}>{b.phu_trach.ho_ten}</span>
                        ) : (
                          <span className="badge badge-warning">
                            Chưa phân công
                          </span>
                        )}
                      </td>
                    )}
                    <td className="num-col">{formatNumber(b.so_doan_tong)}</td>
                    <td className="num-col">{formatNumber(b.hien_co)}</td>
                    <td className="num-col font-semibold text-success">
                      {formatNumber(b.da_xac_nhan)}
                    </td>
                    <td className="num-col">
                      {b.chua_xac_nhan > 0 ? (
                        <span className="font-semibold">
                          {formatNumber(b.chua_xac_nhan)}
                        </span>
                      ) : (
                        <span className="text-muted">0</span>
                      )}
                    </td>
                    <td className="num-col">
                      {b.thua > 0 ? (
                        <span
                          className="badge badge-warning"
                          title={`Thừa ${b.thua} hồ sơ so với ${NHAN.SO_DOAN}`}
                        >
                          +{formatNumber(b.thua)}
                        </span>
                      ) : (
                        <span className="text-muted">0</span>
                      )}
                    </td>
                    <td className="num-col">
                      {b.thieu > 0 ? (
                        <span
                          className="badge badge-warning"
                          title={`Thiếu ${b.thieu} hồ sơ so với ${NHAN.SO_DOAN}`}
                        >
                          −{formatNumber(b.thieu)}
                        </span>
                      ) : (
                        <span className="text-muted">0</span>
                      )}
                    </td>
                    <td className="num-col">
                      {b.bo_sung > 0 ? (
                        <span className="font-semibold">
                          {formatNumber(b.bo_sung)}
                        </span>
                      ) : (
                        <span className="text-muted">0</span>
                      )}
                    </td>
                    <td className="nowrap">{renderTrangThaiBadge(b.trang_thai)}</td>
                    <td className="num-col">
                      <div className="table-progress-cell">
                        <div
                          className="progress-track progress-track-sm"
                          aria-hidden="true"
                        >
                          <div
                            className="progress-fill"
                            style={{
                              width: `${Math.min(100, Math.max(0, b.tien_do))}%`,
                            }}
                          />
                        </div>
                        <span className="font-semibold num">
                          {formatPercent(b.tien_do)}
                        </span>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {nhanVeTarget && (
        <NhanVeBuoiModal
          hoSo={nhanVeTarget}
          onClose={() => setNhanVeTarget(null)}
          onSuccess={() => {
            setNhanVeTarget(null);
            void reloadBuoi();
          }}
        />
      )}

      {moveToChungTarget && (
        <DuaVaoKhoChungTuKhoModal
          hoSo={moveToChungTarget}
          onClose={() => setMoveToChungTarget(null)}
          onSuccess={() => {
            setMoveToChungTarget(null);
            void reloadBuoi();
          }}
        />
      )}
    </div>
  );
}
