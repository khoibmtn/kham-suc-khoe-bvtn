'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  HANH_DONG_NHAN,
  type NhatKyAdmin,
  type UserQuanLy,
} from '@/lib/api-types';
import { apiRequest } from '@/lib/client/api';
import {
  DOI_TUONG_NHAT_KY_NHAN,
  formatDateTimeSeconds,
  formatNumber,
  getDoiTuongNhan,
  getLinkDoiTuongNhatKy,
  getTruongNhan,
} from '@/lib/client/format';

type NhatKyResponse = {
  dong: NhatKyAdmin[];
  tong: number;
  trang: number;
  kich_thuoc: number;
};

const DOI_TUONG_OPTIONS: Array<{ value: string; label: string }> = [
  { value: 'ho_so', label: 'Hồ sơ' },
  { value: 'buoi_kham', label: 'Buổi khám' },
  { value: 'user', label: 'Người dùng' },
  { value: 'auth', label: 'Đăng nhập' },
  { value: 'import', label: 'Nạp dữ liệu' },
  { value: 'de_nghi_chuyen', label: 'Đề nghị chuyển' },
  { value: 'export', label: 'Xuất dữ liệu' },
];

export function AdminNhatKyView() {
  const [users, setUsers] = useState<UserQuanLy[]>([]);

  const [userFilter, setUserFilter] = useState<string>('');
  const [hanhDongFilter, setHanhDongFilter] = useState<string>('');
  const [doiTuongFilter, setDoiTuongFilter] = useState<string>('');
  const [tuNgayFilter, setTuNgayFilter] = useState<string>('');
  const [denNgayFilter, setDenNgayFilter] = useState<string>('');
  const [trang, setTrang] = useState<number>(1);

  const [dongList, setDongList] = useState<NhatKyAdmin[]>([]);
  const [tong, setTong] = useState<number>(0);
  const [kichThuoc, setKichThuoc] = useState<number>(100);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string>('');

  useEffect(() => {
    let cancelled = false;
    apiRequest<{ users: UserQuanLy[] }>('/api/users').then((res) => {
      if (!cancelled && res.ok && Array.isArray(res.data.users)) {
        setUsers(res.data.users);
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const buildQueryUrl = useCallback(
    (pageNum: number) => {
      const params = new URLSearchParams();
      if (userFilter) params.set('user', userFilter);
      if (hanhDongFilter) params.set('hanh_dong', hanhDongFilter);
      if (doiTuongFilter) params.set('doi_tuong', doiTuongFilter);
      if (tuNgayFilter) params.set('tu', tuNgayFilter);
      if (denNgayFilter) params.set('den', denNgayFilter);
      params.set('trang', String(pageNum));
      return `/api/nhat-ky?${params.toString()}`;
    },
    [denNgayFilter, doiTuongFilter, hanhDongFilter, tuNgayFilter, userFilter],
  );

  const reloadNhatKy = useCallback(async () => {
    setLoading(true);
    setError('');
    const res = await apiRequest<NhatKyResponse>(buildQueryUrl(trang));
    setLoading(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    setDongList(res.data.dong ?? []);
    setTong(res.data.tong ?? 0);
    setKichThuoc(res.data.kich_thuoc ?? 100);
  }, [buildQueryUrl, trang]);

  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();

    apiRequest<NhatKyResponse>(buildQueryUrl(trang), {
      signal: controller.signal,
    }).then((res) => {
      if (cancelled || controller.signal.aborted) return;
      setLoading(false);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setError('');
      setDongList(res.data.dong ?? []);
      setTong(res.data.tong ?? 0);
      setKichThuoc(res.data.kich_thuoc ?? 100);
    });

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [buildQueryUrl, trang]);

  const hasActiveFilter = Boolean(
    userFilter ||
      hanhDongFilter ||
      doiTuongFilter ||
      tuNgayFilter ||
      denNgayFilter,
  );

  const tongTrang = useMemo(
    () => Math.max(1, Math.ceil(tong / Math.max(1, kichThuoc))),
    [kichThuoc, tong],
  );

  function handleResetFilters() {
    setLoading(true);
    setError('');
    setUserFilter('');
    setHanhDongFilter('');
    setDoiTuongFilter('');
    setTuNgayFilter('');
    setDenNgayFilter('');
    setTrang(1);
  }

  return (
    <div className="page-container">
      <div className="page-header-row">
        <div>
          <h1 className="page-title">Nhật ký hoạt động toàn hệ thống</h1>
          <p className="page-subtitle">
            Tra cứu lịch sử thao tác rà soát, chỉnh sửa, phân công, đăng nhập và
            xuất dữ liệu.
          </p>
        </div>
        <div className="page-header-actions">
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={() => void reloadNhatKy()}
            disabled={loading}
          >
            {loading ? 'Đang tải…' : 'Tải lại'}
          </button>
          <Link href="/admin" className="btn btn-secondary btn-sm">
            ← Về Tổng quan
          </Link>
        </div>
      </div>

      <div className="filter-bar">
        <div className="filter-group">
          <label htmlFor="nk-user" className="filter-label">
            Người dùng:
          </label>
          <select
            id="nk-user"
            className="form-select filter-select-sm"
            value={userFilter}
            onChange={(e) => {
              setLoading(true);
              setError('');
              setUserFilter(e.target.value);
              setTrang(1);
            }}
          >
            <option value="">Tất cả người dùng</option>
            {users.map((u) => (
              <option key={u.id} value={String(u.id)}>
                {u.ho_ten} ({u.username})
              </option>
            ))}
          </select>
        </div>

        <div className="filter-group">
          <label htmlFor="nk-hanh-dong" className="filter-label">
            Hành động:
          </label>
          <select
            id="nk-hanh-dong"
            className="form-select filter-select-sm"
            value={hanhDongFilter}
            onChange={(e) => {
              setLoading(true);
              setError('');
              setHanhDongFilter(e.target.value);
              setTrang(1);
            }}
          >
            <option value="">Tất cả hành động</option>
            {Object.entries(HANH_DONG_NHAN).map(([code, label]) => (
              <option key={code} value={code}>
                {label}
              </option>
            ))}
          </select>
        </div>

        <div className="filter-group">
          <label htmlFor="nk-doi-tuong" className="filter-label">
            Đối tượng:
          </label>
          <select
            id="nk-doi-tuong"
            className="form-select filter-select-sm"
            value={doiTuongFilter}
            onChange={(e) => {
              setLoading(true);
              setError('');
              setDoiTuongFilter(e.target.value);
              setTrang(1);
            }}
          >
            <option value="">Tất cả đối tượng</option>
            {DOI_TUONG_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>

        <div className="filter-group">
          <label htmlFor="nk-tu-ngay" className="filter-label">
            Từ ngày:
          </label>
          <input
            id="nk-tu-ngay"
            type="date"
            className="form-input form-input-sm filter-date-input"
            value={tuNgayFilter}
            onChange={(e) => {
              setLoading(true);
              setError('');
              setTuNgayFilter(e.target.value);
              setTrang(1);
            }}
          />
          <label htmlFor="nk-den-ngay" className="filter-label">
            Đến ngày:
          </label>
          <input
            id="nk-den-ngay"
            type="date"
            className="form-input form-input-sm filter-date-input"
            value={denNgayFilter}
            onChange={(e) => {
              setLoading(true);
              setError('');
              setDenNgayFilter(e.target.value);
              setTrang(1);
            }}
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

      {/* Thanh phân trang + tổng số dòng trên đầu */}
      <div className="pagination-bar" aria-label="Phân trang nhật ký">
        <div className="pagination-info">
          Tổng số: <strong className="num">{formatNumber(tong)}</strong> dòng
          {tong > 0 && (
            <span className="text-muted ml-2">
              (hiển thị tối đa {formatNumber(kichThuoc)} dòng/trang)
            </span>
          )}
        </div>
        <div className="pagination-controls">
          <span className="pagination-page-label num">
            Trang {formatNumber(trang)}/{formatNumber(tongTrang)}
          </span>
          <button
            type="button"
            className="btn btn-secondary btn-xs"
            disabled={loading || trang <= 1}
            onClick={() => {
              setLoading(true);
              setError('');
              setTrang((p) => Math.max(1, p - 1));
            }}
          >
            ← Trước
          </button>
          <button
            type="button"
            className="btn btn-secondary btn-xs"
            disabled={loading || trang >= tongTrang}
            onClick={() => {
              setLoading(true);
              setError('');
              setTrang((p) => Math.min(tongTrang, p + 1));
            }}
          >
            Sau →
          </button>
        </div>
      </div>

      {error && (
        <div className="state-box state-error" role="alert">
          <p className="state-title">Không tải được nhật ký: {error}</p>
          <button
            type="button"
            className="btn btn-primary btn-sm"
            onClick={() => void reloadNhatKy()}
          >
            Thử tải lại
          </button>
        </div>
      )}

      {!error && loading && dongList.length === 0 && (
        <div className="state-box" role="status">
          <p className="state-title">Đang tải nhật ký hoạt động…</p>
        </div>
      )}

      {!error && !loading && dongList.length === 0 && (
        <div className="state-box" role="status">
          <p className="state-title">
            Không có dòng nhật ký nào khớp với bộ lọc đang chọn.
          </p>
          {hasActiveFilter && (
            <button
              type="button"
              className="btn btn-secondary btn-sm mt-2"
              onClick={handleResetFilters}
            >
              Xóa lọc
            </button>
          )}
        </div>
      )}

      {!error && dongList.length > 0 && (
        <>
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Thời điểm</th>
                  <th>Người</th>
                  <th>Hành động</th>
                  <th>Đối tượng</th>
                  <th>Trường</th>
                  <th>Cũ → Mới</th>
                  <th>Ghi chú</th>
                </tr>
              </thead>
              <tbody>
                {dongList.map((row) => {
                  const actionLabel =
                    HANH_DONG_NHAN[row.hanh_dong] ?? row.hanh_dong;
                  const doiTuongLabel =
                    DOI_TUONG_NHAT_KY_NHAN[row.doi_tuong] ??
                    getDoiTuongNhan(row.doi_tuong);
                  const linkDoiTuong = getLinkDoiTuongNhatKy(row);
                  const truongLabel = getTruongNhan(row.truong);
                  const hasDiff =
                    row.gia_tri_cu !== null || row.gia_tri_moi !== null;

                  return (
                    <tr key={row.id}>
                      <td className="nowrap num">
                        {formatDateTimeSeconds(row.at)}
                      </td>
                      <td>
                        {row.user ? (
                          <span>
                            <strong>{row.user.ho_ten}</strong>{' '}
                            <span className="text-muted text-xs">
                              ({row.user.username})
                            </span>
                          </span>
                        ) : (
                          <span className="text-muted">Hệ thống</span>
                        )}
                      </td>
                      <td>
                        <span className="font-semibold">{actionLabel}</span>
                      </td>
                      <td>
                        <div className="nhatky-doituong-cell">
                          <span className="chip badge-neutral">
                            {doiTuongLabel}
                          </span>
                          {row.mo_ta_doi_tuong && (
                            linkDoiTuong ? (
                              <Link
                                href={linkDoiTuong}
                                className="row-primary-link font-semibold"
                              >
                                {row.mo_ta_doi_tuong}
                              </Link>
                            ) : (
                              <span>{row.mo_ta_doi_tuong}</span>
                            )
                          )}
                        </div>
                      </td>
                      <td>{truongLabel || <span className="text-muted">—</span>}</td>
                      <td>
                        {hasDiff ? (
                          <span className="history-values">
                            <span className="val-old">
                              {row.gia_tri_cu ?? '(trống)'}
                            </span>{' '}
                            →{' '}
                            <span className="val-new">
                              {row.gia_tri_moi ?? '(trống)'}
                            </span>
                          </span>
                        ) : (
                          <span className="text-muted">—</span>
                        )}
                      </td>
                      <td>
                        {row.ghi_chu ? (
                          <span>{row.ghi_chu}</span>
                        ) : (
                          <span className="text-muted">—</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="pagination-bar mt-2" aria-label="Phân trang cuối bảng">
            <div className="pagination-info">
              Tổng số: <strong className="num">{formatNumber(tong)}</strong>{' '}
              dòng
            </div>
            <div className="pagination-controls">
              <span className="pagination-page-label num">
                Trang {formatNumber(trang)}/{formatNumber(tongTrang)}
              </span>
              <button
                type="button"
                className="btn btn-secondary btn-xs"
                disabled={loading || trang <= 1}
                onClick={() => setTrang((p) => Math.max(1, p - 1))}
              >
                ← Trước
              </button>
              <button
                type="button"
                className="btn btn-secondary btn-xs"
                disabled={loading || trang >= tongTrang}
                onClick={() => setTrang((p) => Math.min(tongTrang, p + 1))}
              >
                Sau →
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
