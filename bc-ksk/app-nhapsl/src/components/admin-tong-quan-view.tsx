'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type {
  DongTheoDonVi,
  DongTheoUser,
  TheTongHop,
} from '@/lib/api-types';
import { CLS, DON_VI, NHAN, type DonVi } from '@/lib/cls';
import { apiRequest, downloadFile } from '@/lib/client/api';
import {
  formatChenhLech,
  formatNumber,
  formatPercent,
  formatShortDateTime,
} from '@/lib/client/format';
import { useToast } from './toast';

export type DashboardAdminData = {
  theo_user: DongTheoUser[];
  theo_don_vi: DongTheoDonVi[];
  kho_chung: number;
  de_nghi_cho: number;
  the: TheTongHop;
};

type AdminTongQuanViewProps = {
  initialData?: DashboardAdminData | null;
};

export function AdminTongQuanView({
  initialData = null,
}: AdminTongQuanViewProps) {
  const router = useRouter();
  const { showToast } = useToast();

  const [data, setData] = useState<DashboardAdminData | null>(initialData);
  const [loading, setLoading] = useState<boolean>(initialData === null);
  const [error, setError] = useState<string>('');

  // Tùy chọn Xuất báo cáo Excel
  const [chiDaXacNhan, setChiDaXacNhan] = useState<'1' | '0'>('1');
  const [donViExport, setDonViExport] = useState<string>('');
  const [exportingExcel, setExportingExcel] = useState<boolean>(false);
  const [exportingCowork, setExportingCowork] = useState<boolean>(false);
  const [exportError, setExportError] = useState<string>('');

  const reloadDashboard = useCallback(async () => {
    setLoading(true);
    setError('');
    const res = await apiRequest<DashboardAdminData>('/api/dashboard/admin');
    setLoading(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    setData(res.data);
  }, []);

  useEffect(() => {
    if (initialData !== null) return;
    let cancelled = false;
    apiRequest<DashboardAdminData>('/api/dashboard/admin').then((res) => {
      if (cancelled) return;
      setLoading(false);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setError('');
      setData(res.data);
    });
    return () => {
      cancelled = true;
    };
  }, [initialData]);

  useEffect(() => {
    const handlePoolChanged = () => {
      void reloadDashboard();
    };
    window.addEventListener('nhapsl:pool-changed', handlePoolChanged);
    return () => {
      window.removeEventListener('nhapsl:pool-changed', handlePoolChanged);
    };
  }, [reloadDashboard]);

  async function handleExportExcel() {
    setExportError('');
    setExportingExcel(true);
    const params = new URLSearchParams();
    params.set('chi_da_xac_nhan', chiDaXacNhan);
    if (donViExport) {
      params.set('don_vi', donViExport);
    }
    const res = await downloadFile(
      `/api/export/bao-cao.xlsx?${params.toString()}`,
      'bao-cao-ksk.xlsx',
    );
    setExportingExcel(false);
    if (!res.ok) {
      setExportError(res.error);
      showToast(`Lỗi xuất báo cáo Excel: ${res.error}`, 'error');
      return;
    }
    showToast(`Đã tải xuống báo cáo ${res.filename}`, 'success');
  }

  async function handleExportCowork() {
    setExportError('');
    setExportingCowork(true);
    const res = await downloadFile(
      '/api/export/cowork.zip',
      'cowork-export.zip',
    );
    setExportingCowork(false);
    if (!res.ok) {
      setExportError(res.error);
      showToast(`Lỗi xuất gói Cowork: ${res.error}`, 'error');
      return;
    }
    showToast(`Đã tải xuống gói Cowork ${res.filename}`, 'success');
  }

  const the = data?.the;
  const progressWidth = the ? Math.min(100, Math.max(0, the.tien_do)) : 0;

  return (
    <div className="page-container">
      <div className="page-header-row">
        <div>
          <h1 className="page-title">Tổng quan tiến độ rà soát toàn hệ thống</h1>
          <p className="page-subtitle">
            Theo dõi tiến độ theo từng nhân viên, thống kê theo đơn vị địa phương
            và xuất dữ liệu báo cáo.
          </p>
        </div>
        <div className="page-header-actions">
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={() => void reloadDashboard()}
            disabled={loading}
          >
            {loading ? 'Đang tải…' : 'Tải lại'}
          </button>
          <Link href="/" className="btn btn-secondary btn-sm">
            Danh sách 60 buổi khám →
          </Link>
          <Link href="/admin/nap-du-lieu" className="btn btn-secondary btn-sm">
            Nạp dữ liệu →
          </Link>
          <Link href="/admin/nhat-ky" className="btn btn-secondary btn-sm">
            Nhật ký hoạt động →
          </Link>
        </div>
      </div>

      {error && (
        <div className="state-box state-error" role="alert">
          <p className="state-title">Không tải được dữ liệu tổng quan: {error}</p>
          <p className="state-desc">
            Vui lòng kiểm tra kết nối mạng và thử tải lại.
          </p>
          <button
            type="button"
            className="btn btn-primary btn-sm"
            onClick={() => void reloadDashboard()}
          >
            Thử tải lại
          </button>
        </div>
      )}

      {!error && loading && !data && (
        <div className="state-box" role="status">
          <p className="state-title">Đang tải dữ liệu tổng quan toàn hệ thống…</p>
        </div>
      )}

      {data && the && (
        <>
          {/* Thẻ tổng hợp */}
          <section
            className="summary-strip summary-strip-dashboard"
            aria-label="Chỉ số tổng hợp toàn hệ thống"
          >
            <div className="summary-card">
              <span className="summary-label">Tổng số buổi khám</span>
              <strong className="summary-value num">
                {formatNumber(the.so_buoi)}
              </strong>
              <span className="summary-sub">
                Đã xác nhận: {formatNumber(the.so_buoi_da_xac_nhan)} · Chưa:{' '}
                {formatNumber(the.so_buoi_chua_xac_nhan)}
              </span>
            </div>

            <div className="summary-card">
              <span className="summary-label">Tổng {NHAN.SO_DOAN}</span>
              <strong className="summary-value num">
                {formatNumber(the.so_doan)}
              </strong>
              <span className="summary-sub">Người theo {NHAN.SO_DOAN}</span>
            </div>

            <div className="summary-card">
              <span className="summary-label">Tổng hồ sơ trong DS</span>
              <strong className="summary-value num">
                {formatNumber(the.hien_co)}
              </strong>
              <span className="summary-sub">
                Bổ sung: {formatNumber(the.bo_sung)} hồ sơ
              </span>
            </div>

            <div className="summary-card">
              <span className="summary-label">Đã xác nhận</span>
              <strong className="summary-value num text-success">
                {formatNumber(the.da_xac_nhan)}
              </strong>
              <span className="summary-sub">
                Chưa xác nhận: {formatNumber(the.chua_xac_nhan)}
              </span>
            </div>

            <div className="summary-card">
              <span className="summary-label">Thừa / Thiếu (cộng theo buổi)</span>
              <strong className="summary-value num">
                +{formatNumber(the.thua)} / -{formatNumber(the.thieu)}
              </strong>
              <span className="summary-sub">
                Thừa: {formatNumber(the.thua)} · Thiếu: {formatNumber(the.thieu)}{' '}
                · Chênh lệch:{' '}
                <span className="num">{formatChenhLech(the.chenh_lech)}</span>
              </span>
            </div>

            <div className="summary-card">
              <span className="summary-label">Kho chờ chung</span>
              <strong className="summary-value num">
                {formatNumber(data.kho_chung)}
              </strong>
              <span className="summary-sub">
                Kho cá nhân: {formatNumber(the.kho_ca_nhan)} ·{' '}
                <Link href="/kho?tab=kho_chung">Mở kho chung →</Link>
              </span>
            </div>

            <div className="summary-card">
              <span className="summary-label">Đề nghị chuyển đang chờ</span>
              <strong className="summary-value num">
                {formatNumber(data.de_nghi_cho)}
              </strong>
              <span className="summary-sub">
                <Link href="/kho?tab=de_nghi">Xử lý đề nghị →</Link>
              </span>
            </div>

            <div className="summary-card summary-card-progress">
              <span className="summary-label">Tiến độ % toàn đợt</span>
              <div className="progress-card-row">
                <strong className="summary-value num">
                  {formatPercent(the.tien_do)}
                </strong>
                <span className="summary-sub num">
                  ({formatNumber(the.da_xac_nhan)}/{formatNumber(the.hien_co)})
                </span>
              </div>
              <div
                className="progress-track"
                role="progressbar"
                aria-valuenow={Math.round(the.tien_do)}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-label={`Tiến độ toàn đợt ${formatPercent(the.tien_do)}`}
              >
                <div
                  className="progress-fill"
                  style={{ width: `${progressWidth}%` }}
                />
              </div>
            </div>
          </section>

          {/* Khối Xuất dữ liệu */}
          <section className="panel-card" aria-label="Xuất dữ liệu">
            <div className="panel-header-inline">
              <div>
                <h2 className="panel-title">Xuất dữ liệu &amp; Báo cáo</h2>
                <p className="text-muted text-xs">
                  Xuất báo cáo Excel hành chính dùng ngay hoặc xuất gói dữ liệu
                  đầy đủ (.zip) để gửi lại cho Cowork.
                </p>
              </div>
            </div>

            {exportError && (
              <div className="alert alert-error" role="alert">
                <strong>Lỗi xuất dữ liệu:</strong> {exportError}
              </div>
            )}

            <div className="export-admin-grid">
              <div className="export-admin-box">
                <h3 className="export-box-title">1. Xuất báo cáo Excel (.xlsx)</h3>
                <div className="export-controls-row">
                  <div className="filter-group">
                    <label
                      htmlFor="admin-export-xac-nhan"
                      className="filter-label"
                    >
                      Hồ sơ:
                    </label>
                    <select
                      id="admin-export-xac-nhan"
                      className="form-select filter-select-sm"
                      value={chiDaXacNhan}
                      onChange={(e) =>
                        setChiDaXacNhan(e.target.value as '1' | '0')
                      }
                      disabled={exportingExcel || exportingCowork}
                    >
                      <option value="1">Chỉ hồ sơ đã xác nhận (mặc định)</option>
                      <option value="0">Tất cả</option>
                    </select>
                  </div>

                  <div className="filter-group">
                    <label
                      htmlFor="admin-export-don-vi"
                      className="filter-label"
                    >
                      Đơn vị:
                    </label>
                    <select
                      id="admin-export-don-vi"
                      className="form-select filter-select-sm"
                      value={donViExport}
                      onChange={(e) => setDonViExport(e.target.value)}
                      disabled={exportingExcel || exportingCowork}
                    >
                      <option value="">Tất cả đơn vị</option>
                      {(Object.keys(DON_VI) as DonVi[]).map((code) => (
                        <option key={code} value={code}>
                          {DON_VI[code]} ({code})
                        </option>
                      ))}
                    </select>
                  </div>

                  <button
                    type="button"
                    className="btn btn-primary btn-sm"
                    onClick={() => void handleExportExcel()}
                    disabled={exportingExcel || exportingCowork}
                  >
                    {exportingExcel ? 'Đang tạo file…' : 'Xuất báo cáo Excel'}
                  </button>
                </div>
              </div>

              <div className="export-admin-box">
                <h3 className="export-box-title">
                  2. Xuất gói dữ liệu cho Cowork (.zip)
                </h3>
                <p className="text-muted text-xs mb-2">
                  Gồm 5 file: <code>manifest.json</code>, <code>ho_so.csv</code>,{' '}
                  <code>buoi_kham.csv</code>, <code>nhat_ky.csv</code>,{' '}
                  <code>bao_cao.xlsx</code>.
                </p>
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  onClick={() => void handleExportCowork()}
                  disabled={exportingExcel || exportingCowork}
                >
                  {exportingCowork
                    ? 'Đang tạo file…'
                    : 'Xuất gói cho Cowork (.zip)'}
                </button>
              </div>
            </div>
          </section>

          {/* Bảng theo nhân viên */}
          <section className="panel-card" aria-label="Tiến độ theo nhân viên">
            <div className="panel-header-inline">
              <div>
                <h2 className="panel-title">Tiến độ theo nhân viên</h2>
                <p className="text-muted text-xs">
                  Bấm vào một dòng nhân viên để mở trang Phân công lọc theo người
                  đó.
                </p>
              </div>
              <Link href="/admin/phan-cong" className="btn btn-secondary btn-xs">
                Quản lý phân công →
              </Link>
            </div>

            {data.theo_user.length === 0 ? (
              <div className="state-box">
                <p className="state-title">Chưa có tài khoản nhân viên nào.</p>
              </div>
            ) : (
              <div className="table-wrap">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Họ tên</th>
                      <th className="num-col">Số buổi</th>
                      <th className="num-col">Buổi đã xác nhận</th>
                      <th className="num-col">Tổng hồ sơ</th>
                      <th className="num-col">Đã xác nhận</th>
                      <th className="num-col">Bổ sung</th>
                      <th className="num-col">Chưa xác nhận</th>
                      <th className="num-col">Trong kho</th>
                      <th className="num-col">Tiến độ %</th>
                      <th>Hoạt động gần nhất</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.theo_user.map((row) => {
                      const rawActivity =
                        row.lan_hoat_dong_cuoi ?? row.last_seen_at;
                      const activityLabel = formatShortDateTime(rawActivity);
                      const targetUrl = `/admin/phan-cong?phu_trach=${row.user.id}`;

                      return (
                        <tr
                          key={row.user.id}
                          className={`clickable-row ${!row.active ? 'row-muted' : ''}`}
                          onClick={() => router.push(targetUrl)}
                          tabIndex={0}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' || e.key === ' ') {
                              e.preventDefault();
                              router.push(targetUrl);
                            }
                          }}
                        >
                          <td>
                            <Link
                              href={targetUrl}
                              onClick={(e) => e.stopPropagation()}
                              className="row-primary-link font-semibold"
                            >
                              {row.user.ho_ten}
                            </Link>{' '}
                            <span className="text-muted text-xs">
                              ({row.user.username})
                            </span>
                            {!row.active && (
                              <span className="badge badge-danger ml-1">
                                Đã khóa
                              </span>
                            )}
                          </td>
                          <td className="num-col">
                            {formatNumber(row.so_buoi)}
                          </td>
                          <td className="num-col">
                            {formatNumber(row.so_buoi_da_xac_nhan)}
                          </td>
                          <td className="num-col">
                            {formatNumber(row.hien_co)}
                          </td>
                          <td className="num-col font-semibold text-success">
                            {formatNumber(row.da_xac_nhan)}
                          </td>
                          <td className="num-col">
                            {formatNumber(row.bo_sung)}
                          </td>
                          <td className="num-col">
                            {row.chua_xac_nhan > 0 ? (
                              <span className="font-semibold">
                                {formatNumber(row.chua_xac_nhan)}
                              </span>
                            ) : (
                              <span className="text-muted">0</span>
                            )}
                          </td>
                          <td className="num-col">
                            {formatNumber(row.kho_ca_nhan)}
                          </td>
                          <td className="num-col">
                            <div className="table-progress-cell">
                              <div
                                className="progress-track progress-track-sm"
                                aria-hidden="true"
                              >
                                <div
                                  className="progress-fill"
                                  style={{
                                    width: `${Math.min(100, Math.max(0, row.tien_do))}%`,
                                  }}
                                />
                              </div>
                              <span className="font-semibold num">
                                {formatPercent(row.tien_do)}
                              </span>
                            </div>
                          </td>
                          <td className="nowrap num">
                            {activityLabel === 'chưa đăng nhập' ? (
                              <span className="text-muted">chưa đăng nhập</span>
                            ) : (
                              activityLabel
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          {/* Bảng theo đơn vị */}
          <section className="panel-card" aria-label="Thống kê theo đơn vị">
            <div className="panel-header-inline">
              <div>
                <h2 className="panel-title">Thống kê theo đơn vị</h2>
                <p className="text-muted text-xs">
                  CLS và {NHAN.TT_KSK} tính trên hồ sơ đã xác nhận.
                </p>
              </div>
            </div>

            <div className="table-wrap">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Đơn vị</th>
                    <th className="num-col">Số buổi</th>
                    <th className="num-col">{NHAN.SO_DOAN}</th>
                    <th className="num-col">Trong DS</th>
                    <th className="num-col">Đã xác nhận</th>
                    <th className="num-col">Thừa</th>
                    <th className="num-col">Thiếu</th>
                    <th className="num-col">Chênh lệch</th>
                    <th className="num-col">Có trong {NHAN.TT_KSK}</th>
                    {CLS.map((c) => (
                      <th
                        key={c.key}
                        className="num-col"
                        title={c.ten}
                      >
                        {c.ngan}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {data.theo_don_vi.map((row) => {
                    const isTotal = row.don_vi === 'TONG';
                    return (
                      <tr
                        key={row.don_vi}
                        className={isTotal ? 'row-total' : undefined}
                      >
                        <td>
                          <span
                            className={
                              isTotal ? 'font-bold' : 'font-semibold'
                            }
                          >
                            {row.ten}
                          </span>
                          {!isTotal && (
                            <span className="text-muted text-xs ml-1">
                              ({row.don_vi})
                            </span>
                          )}
                        </td>
                        <td className="num-col">{formatNumber(row.so_buoi)}</td>
                        <td className="num-col">{formatNumber(row.so_doan)}</td>
                        <td className="num-col">{formatNumber(row.hien_co)}</td>
                        <td className="num-col font-semibold text-success">
                          {formatNumber(row.da_xac_nhan)}
                        </td>
                        <td className="num-col">{formatNumber(row.thua)}</td>
                        <td className="num-col">{formatNumber(row.thieu)}</td>
                        <td className="num-col">
                          {formatChenhLech(row.chenh_lech)}
                        </td>
                        <td className="num-col">
                          {formatNumber(row.co_tt_ksk)}
                        </td>
                        {CLS.map((c) => (
                          <td
                            key={c.key}
                            className="num-col"
                            title={`${c.ten}: ${formatNumber(row.cls[c.key])}`}
                          >
                            {formatNumber(row.cls[c.key])}
                          </td>
                        ))}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <p className="table-footnote">
              Ghi chú: CLS và {NHAN.TT_KSK} tính trên hồ sơ đã xác nhận.
            </p>
          </section>
        </>
      )}
    </div>
  );
}
