'use client';

import {
  useCallback,
  useEffect,
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
} from '@/lib/api-types';
import { CANH_BAO_NHAN, CLS, NHAN } from '@/lib/cls';
import { apiRequest } from '@/lib/client/api';
import {
  formatDate,
  formatHisTimestamp,
  formatNumber,
  getCanhBaoTooltip,
} from '@/lib/client/format';
import { notifyPoolChanged } from './app-shell';
import { useToast } from './toast';

export type PhamViTimKiemTrang = 'cua_toi' | 'kho_chung' | 'tat_ca';

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
  const initialUrlQ = searchParams.get('q') ?? '';

  const [query, setQuery] = useState<string>(initialUrlQ);
  const [phamVi, setPhamVi] = useState<PhamViTimKiemTrang>('cua_toi');
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

  const trimmedQuery = query.trim();

  const handleChangeQuery = useCallback((val: string) => {
    setQuery(val);
    if (val.trim().length < 2) {
      setKetQua([]);
      setTong(0);
      setGioiHan(200);
      setLoading(false);
      setError('');
      setHasSearched(false);
    }
  }, []);

  useEffect(() => {
    if (trimmedQuery.length < 2) {
      return;
    }

    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setLoading(true);
      setError('');

      const url = `/api/tim-kiem?q=${encodeURIComponent(trimmedQuery)}&pham_vi=${encodeURIComponent(phamVi)}`;
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
    }, 300);

    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [trimmedQuery, phamVi, reloadTick]);

  const handleRetry = useCallback(() => {
    setReloadTick((prev) => prev + 1);
  }, []);

  const vuotGioiHan = gioiHan !== null && tong > gioiHan;

  return (
    <div className="page-container">
      <div className="page-header-row">
        <div>
          <h1 className="page-title">Tìm kiếm hồ sơ khám sức khỏe</h1>
          <p className="page-subtitle">
            Tra cứu tiếng Việt không phân biệt dấu theo họ tên, năm sinh, CCCD, mã KCB, số điện thoại, số thẻ BHYT
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
            placeholder="Tìm họ tên, năm sinh, CCCD, mã KCB, SĐT, thẻ BHYT…"
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
              Xóa
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

      {trimmedQuery.length < 2 && (
        <div className="state-box" role="status">
          <p className="state-title">Gõ ít nhất 2 ký tự để bắt đầu tìm kiếm</p>
          <p className="state-desc">
            Ví dụ: gõ &quot;nguyen thi&quot;, &quot;thuy 1960&quot;, 4 số cuối CCCD, mã KCB, số điện thoại hoặc số thẻ BHYT. Nhiều từ khóa sẽ kết hợp đồng thời (AND).
          </p>
        </div>
      )}

      {trimmedQuery.length >= 2 && loading && (
        <div className="state-box" role="status">
          <p className="state-title">Đang tìm kiếm hồ sơ…</p>
          <p className="state-desc">
            Từ khóa: &quot;{trimmedQuery}&quot;
          </p>
        </div>
      )}

      {trimmedQuery.length >= 2 && !loading && error && (
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

      {trimmedQuery.length >= 2 &&
        !loading &&
        !error &&
        hasSearched &&
        ketQua.length === 0 && (
          <div className="state-box" role="status">
            <p className="state-title">
              Không tìm thấy hồ sơ khớp từ khóa &quot;{trimmedQuery}&quot;
            </p>
            <p className="state-desc">
              Không tìm thấy kết quả phù hợp — thử bỏ bớt từ khóa hoặc chọn Toàn bộ app.
            </p>
            {phamVi !== 'tat_ca' && (
              <div className="state-actions">
                <button
                  type="button"
                  className="btn btn-primary btn-sm"
                  onClick={() => setPhamVi('tat_ca')}
                >
                  Chuyển sang Toàn bộ app
                </button>
              </div>
            )}
          </div>
        )}

      {trimmedQuery.length >= 2 && !loading && !error && ketQua.length > 0 && (
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
                gõ thêm từ khóa để thu hẹp
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
                  const hisTimeShort = formatHisTimestamp(h.ngay_gio_dang_ky_his);
                  const viTriLabel = formatViTriKetQua(h);
                  const canOpenSession =
                    h.co_quyen_sua && h.vi_tri === 'buoi' && h.buoi !== null;
                  const isOtherUserSession =
                    !h.co_quyen_sua && h.vi_tri === 'buoi' && h.buoi !== null;

                  return (
                    <tr
                      key={h.id}
                      className={h.da_xac_nhan ? 'hoso-row-confirmed' : ''}
                    >
                      <td className="num-col col-stt">{idx + 1}</td>
                      <td className="col-hoten">
                        <div className="hoten-main-line">
                          <strong className="hoten-text">{h.ho_ten}</strong>
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
                        {h.nam_sinh || '—'}
                      </td>
                      <td className="col-cccd num">{h.cccd || '—'}</td>
                      <td className="col-makcb num">{h.ma_kcb || '—'}</td>

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
