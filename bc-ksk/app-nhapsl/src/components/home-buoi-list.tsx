'use client';

import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { BuoiTomTat, TrangThaiBuoi, UserQuanLy } from '@/lib/api-types';
import { DON_VI, NHAN } from '@/lib/cls';
import { khongDau } from '@/lib/text';
import { apiRequest } from '@/lib/client/api';
import {
  formatDate,
  formatNumber,
  formatPercent,
  TRANG_THAI_BUOI_NHAN,
} from '@/lib/client/format';
import type { ShellUser } from './app-shell';

type HomeBuoiListProps = {
  user: ShellUser;
  initialBuoi?: BuoiTomTat[] | null;
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

export function HomeBuoiList({ user, initialBuoi = null }: HomeBuoiListProps) {
  const router = useRouter();
  const isAdmin = user.role === 'admin';

  const [buoiList, setBuoiList] = useState<BuoiTomTat[]>(initialBuoi ?? []);
  const [loading, setLoading] = useState<boolean>(initialBuoi === null);
  const [error, setError] = useState<string>('');

  const [donViFilter, setDonViFilter] = useState<string>('');
  const [trangThaiFilter, setTrangThaiFilter] = useState<string>('');
  const [phuTrachFilter, setPhuTrachFilter] = useState<string>('');
  const [tuNgayFilter, setTuNgayFilter] = useState<string>('');
  const [denNgayFilter, setDenNgayFilter] = useState<string>('');
  const [timNhanhFilter, setTimNhanhFilter] = useState<string>('');

  const [hoSoJumpQuery, setHoSoJumpQuery] = useState<string>('');
  const [users, setUsers] = useState<UserQuanLy[]>([]);

  const reloadBuoi = useCallback(async () => {
    setLoading(true);
    setError('');
    const res = await apiRequest<{ buoi: BuoiTomTat[] }>('/api/buoi');
    if (!res.ok) {
      setError(res.error);
      setLoading(false);
      return;
    }
    setBuoiList(res.data.buoi ?? []);
    setLoading(false);
  }, []);

  useEffect(() => {
    if (initialBuoi !== null) {
      return;
    }
    let cancelled = false;
    apiRequest<{ buoi: BuoiTomTat[] }>('/api/buoi').then((res) => {
      if (cancelled) return;
      if (!res.ok) {
        setError(res.error);
        setLoading(false);
        return;
      }
      setError('');
      setBuoiList(res.data.buoi ?? []);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [initialBuoi]);

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

  const summary = useMemo(() => {
    let soDoan = 0;
    let hienCo = 0;
    let daXacNhan = 0;
    let thua = 0;
    let thieu = 0;
    let soBuoiDaXacNhan = 0;

    for (const b of filteredBuoi) {
      soDoan += b.so_doan_tong;
      hienCo += b.hien_co;
      daXacNhan += b.da_xac_nhan;
      thua += b.thua;
      thieu += b.thieu;
      if (b.trang_thai === 'da_xac_nhan') {
        soBuoiDaXacNhan += 1;
      }
    }

    const tienDo = hienCo > 0 ? (daXacNhan / hienCo) * 100 : 0;
    return {
      soBuoi: filteredBuoi.length,
      soBuoiDaXacNhan,
      soDoan,
      hienCo,
      daXacNhan,
      thua,
      thieu,
      tienDo,
    };
  }, [filteredBuoi]);

  const hasActiveFilter = Boolean(
    donViFilter ||
      trangThaiFilter ||
      phuTrachFilter ||
      tuNgayFilter ||
      denNgayFilter ||
      timNhanhFilter.trim(),
  );

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

  return (
    <div className="page-container">
      <div className="page-header-row">
        <div>
          <h1 className="page-title">
            {isAdmin ? 'Danh sách buổi khám toàn hệ thống' : 'Danh sách buổi khám của tôi'}
          </h1>
          <p className="page-subtitle">
            Bấm vào một dòng buổi khám để mở màn hình rà soát hồ sơ giấy.
          </p>
        </div>
        <div className="page-header-actions">
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
          <Link href="/ra-soat" className="btn btn-primary btn-sm">
            Chọn nhanh Đơn vị / Ngày →
          </Link>
        </div>
      </div>

      <section className="summary-strip" aria-label="Tổng hợp các buổi đang lọc">
        <div className="summary-card">
          <span className="summary-label">
            Số buổi khám{hasActiveFilter ? ' (đang lọc)' : ''}
          </span>
          <strong className="summary-value num">{formatNumber(summary.soBuoi)}</strong>
          <span className="summary-sub">
            Đã khóa: {formatNumber(summary.soBuoiDaXacNhan)} / Tổng: {formatNumber(buoiList.length)} buổi
          </span>
        </div>
        <div className="summary-card">
          <span className="summary-label">Tổng {NHAN.SO_DOAN}</span>
          <strong className="summary-value num">{formatNumber(summary.soDoan)}</strong>
          <span className="summary-sub">Người theo {NHAN.SO_DOAN}</span>
        </div>
        <div className="summary-card">
          <span className="summary-label">Tổng hồ sơ trong DS</span>
          <strong className="summary-value num">{formatNumber(summary.hienCo)}</strong>
          <span className="summary-sub">
            Thừa: {formatNumber(summary.thua)} · Thiếu: {formatNumber(summary.thieu)}
          </span>
        </div>
        <div className="summary-card">
          <span className="summary-label">Đã xác nhận có giấy</span>
          <strong className="summary-value num text-success">
            {formatNumber(summary.daXacNhan)}
          </strong>
          <span className="summary-sub">
            Chưa xác nhận: {formatNumber(Math.max(0, summary.hienCo - summary.daXacNhan))}
          </span>
        </div>
        <div className="summary-card">
          <span className="summary-label">Tiến độ rà soát</span>
          <strong className="summary-value num">{formatPercent(summary.tienDo)}</strong>
          <span className="summary-sub">
            {formatNumber(summary.daXacNhan)} / {formatNumber(summary.hienCo)} hồ sơ
          </span>
        </div>
      </section>

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
                Đang hiển thị 0 / {formatNumber(buoiList.length)} buổi khám. Hãy nới điều kiện lọc hoặc bấm Xóa lọc.
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
                  Vào mục <Link href="/admin/phan-cong">Phân công</Link> để gán buổi khám cho nhân viên.
                </p>
              )}
            </>
          )}
        </div>
      )}

      {filteredBuoi.length > 0 && (
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Đơn vị</th>
                <th>Ngày</th>
                <th>Điểm khám</th>
                {isAdmin && <th>Người phụ trách</th>}
                <th className="num-col">{NHAN.SO_DOAN}</th>
                <th className="num-col">Trong DS</th>
                <th className="num-col">Đã xác nhận</th>
                <th className="num-col">Thừa</th>
                <th className="num-col">Thiếu</th>
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
                  <td>
                    <span className="font-semibold">{b.ten_don_vi}</span>
                    <span className="text-muted text-xs ml-1">({b.don_vi})</span>
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
                  <td>
                    <div>{b.diem_kham || '—'}</div>
                    {b.doan_kham && (
                      <div className="sub-text">{b.doan_kham}</div>
                    )}
                  </td>
                  {isAdmin && (
                    <td>
                      {b.phu_trach ? (
                        <span>
                          {b.phu_trach.ho_ten}{' '}
                          <span className="text-muted">({b.phu_trach.username})</span>
                        </span>
                      ) : (
                        <span className="badge badge-warning">Chưa phân công</span>
                      )}
                    </td>
                  )}
                  <td className="num-col">{formatNumber(b.so_doan_tong)}</td>
                  <td className="num-col">{formatNumber(b.hien_co)}</td>
                  <td className="num-col font-semibold text-success">
                    {formatNumber(b.da_xac_nhan)}
                  </td>
                  <td className="num-col">
                    {b.thua > 0 ? (
                      <span className="badge badge-warning">
                        Thừa +{formatNumber(b.thua)}
                      </span>
                    ) : (
                      <span className="text-muted">0</span>
                    )}
                  </td>
                  <td className="num-col">
                    {b.thieu > 0 ? (
                      <span className="badge badge-warning">
                        Thiếu {formatNumber(b.thieu)}
                      </span>
                    ) : (
                      <span className="text-muted">0</span>
                    )}
                  </td>
                  <td className="nowrap">{renderTrangThaiBadge(b.trang_thai)}</td>
                  <td className="num-col font-semibold">{formatPercent(b.tien_do)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
