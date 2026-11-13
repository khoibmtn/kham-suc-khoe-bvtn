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
  CaiDatTuDuyet,
  ChuyenBody,
  DeNghiChuyen,
  DeNghiChuyenTuDuyet,
  KetQuaTimKiem,
  UserQuanLy,
} from '@/lib/api-types';
import type { AuthUser } from '@/lib/auth/guard';
import { CANH_BAO_NHAN, CLS, DON_VI, NHAN } from '@/lib/cls';
import { layCanhBaoSo } from '@/lib/loc-ho-so';
import { apiRequest } from '@/lib/client/api';
import { formatDemNguocTuDuyet, moTaCaiDatTuDuyet } from '@/lib/client/am-bao';
import {
  formatDate,
  formatDateTime,
  formatDongXemLaiSo,
  formatHisTimestamp,
  formatMaViTri,
  formatNguonGocChuyen,
  formatNumber,
  getCanhBaoTooltip,
  phanLoaiCanhBaoSoTheoTruong,
} from '@/lib/client/format';
import { notifyPoolChanged } from './app-shell';
import {
  denToi,
  LOAI_DE_NGHI_NHAN,
  layLoaiDeNghi,
  layNguoiDuyetDeNghi,
  MoTaDeNghiChuyen,
  tenNguoiDuyetDeNghi,
} from './de-nghi-thong-bao';
import { useToast } from './toast';

export type KhoTab = 'kho_ca_nhan' | 'kho_chung' | 'de_nghi';
export type DeNghiChuyenItem = DeNghiChuyen & Partial<DeNghiChuyenTuDuyet>;

type KhoViewProps = {
  currentUser: AuthUser;
};

export type NhanVeBuoiModalProps = {
  hoSo: KetQuaTimKiem;
  onClose: () => void;
  onSuccess: (buoiDichMa: string) => void;
};

export function NhanVeBuoiModal({ hoSo, onClose, onSuccess }: NhanVeBuoiModalProps) {
  const { showToast } = useToast();
  const [buoiList, setBuoiList] = useState<BuoiTomTat[]>([]);
  const [loadingBuoi, setLoadingBuoi] = useState(true);
  const [selectedBuoiDich, setSelectedBuoiDich] = useState('');
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
        (b) => b.co_quyen_sua && b.trang_thai !== 'da_xac_nhan',
      );
      setBuoiList(editable);
      if (editable.length > 0) {
        const preferred = editable.find(
          (b) => hoSo.don_vi_goi_y && b.don_vi === hoSo.don_vi_goi_y,
        );
        setSelectedBuoiDich((preferred ?? editable[0]).ma_buoi);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [hoSo.don_vi_goi_y]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');
    if (!selectedBuoiDich) {
      setError('Vui lòng chọn buổi khám nhận hồ sơ về.');
      return;
    }

    setSubmitting(true);
    const res = await apiRequest<{
      ho_so: KetQuaTimKiem;
      buoi_cu: BuoiTomTat | null;
      buoi_moi: BuoiTomTat | null;
    }>(`/api/ho-so/${hoSo.id}/nhan-ve`, {
      method: 'POST',
      body: JSON.stringify({
        version: hoSo.version,
        buoi: selectedBuoiDich,
      }),
    });
    setSubmitting(false);

    if (!res.ok) {
      setError(res.error);
      return;
    }

    notifyPoolChanged();
    showToast(
      `Đã nhận hồ sơ #${hoSo.id} (${hoSo.ho_ten}) về buổi ${formatMaViTri(selectedBuoiDich)}.`,
      'success',
    );
    onSuccess(selectedBuoiDich);
  }

  return (
    <div
      className="modal-backdrop"
      role="dialog"
      aria-modal="true"
      aria-labelledby="modal-nhanve-title"
    >
      <div className="modal-card">
        <div className="modal-header">
          <h2 id="modal-nhanve-title" className="modal-title">
            Nhận hồ sơ về buổi khám
          </h2>
        </div>
        <form onSubmit={handleSubmit}>
          <div className="modal-body">
            <p className="modal-desc">
              Hồ sơ: <strong>{hoSo.ho_ten}</strong> (ID #{hoSo.id} · Năm sinh{' '}
              {hoSo.nam_sinh || '—'})
            </p>
            <p className="modal-consequence">
              Hồ sơ sẽ được rút khỏi{' '}
              <strong>
                {hoSo.vi_tri === 'kho_ca_nhan'
                  ? 'Kho cá nhân'
                  : 'Kho chờ chung'}
              </strong>{' '}
              và đưa vào buổi khám bạn chọn dưới đây để tiếp tục rà soát.
            </p>

            {error && (
              <div className="alert-error mb-3" role="alert">
                {error}
              </div>
            )}

            {loadingBuoi ? (
              <p className="text-muted">Đang tải danh sách buổi khám…</p>
            ) : buoiList.length === 0 ? (
              <div className="alert-error" role="alert">
                Bạn hiện không có buổi khám nào đang mở để nhận hồ sơ về.
              </div>
            ) : (
              <div className="form-group mb-0">
                <label htmlFor="nhanve-buoi-select" className="form-label">
                  Chọn buổi khám nhận về (do bạn phụ trách){' '}
                  <span className="text-danger">*</span>
                </label>
                <select
                  id="nhanve-buoi-select"
                  className="form-select"
                  value={selectedBuoiDich}
                  onChange={(e) => setSelectedBuoiDich(e.target.value)}
                  disabled={submitting}
                  autoFocus
                >
                  {buoiList.map((b) => (
                    <option key={b.ma_buoi} value={b.ma_buoi}>
                      {b.ten_don_vi} · {formatDate(b.ngay_kham)} (
                      {b.diem_kham || '—'}) — hiện có {b.hien_co}/
                      {b.so_doan_tong}
                    </option>
                  ))}
                </select>
              </div>
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
              {submitting ? 'Đang nhận…' : 'Nhận về buổi khám'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export type DuaVaoKhoChungTuKhoModalProps = {
  hoSo: KetQuaTimKiem;
  onClose: () => void;
  onSuccess: () => void;
};

export function DuaVaoKhoChungTuKhoModal({
  hoSo,
  onClose,
  onSuccess,
}: DuaVaoKhoChungTuKhoModalProps) {
  const { showToast } = useToast();
  const [lyDo, setLyDo] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    const res = await apiRequest<{
      ho_so: KetQuaTimKiem;
      buoi_cu: BuoiTomTat | null;
      buoi_moi: BuoiTomTat | null;
    }>(`/api/ho-so/${hoSo.id}/chuyen`, {
      method: 'POST',
      body: JSON.stringify({
        version: hoSo.version,
        den: 'kho_chung',
        ly_do: lyDo.trim() || undefined,
      } satisfies ChuyenBody),
    });
    setSubmitting(false);

    if (!res.ok) {
      setError(res.error);
      return;
    }

    notifyPoolChanged();
    showToast(
      `Đã đưa hồ sơ #${hoSo.id} (${hoSo.ho_ten}) sang Kho chờ chung.`,
      'success',
    );
    onSuccess();
  }

  return (
    <div
      className="modal-backdrop"
      role="dialog"
      aria-modal="true"
      aria-labelledby="modal-kho-to-chung-title"
    >
      <div className="modal-card">
        <div className="modal-header">
          <h2 id="modal-kho-to-chung-title" className="modal-title">
            Đưa hồ sơ từ Kho của tôi sang Kho chờ chung
          </h2>
        </div>
        <form onSubmit={handleSubmit}>
          <div className="modal-body">
            <p className="modal-desc">
              Hồ sơ: <strong>{hoSo.ho_ten}</strong> (ID #{hoSo.id})
            </p>
            <p className="modal-consequence">
              Hồ sơ sẽ rời khỏi Kho của tôi và nằm trong Kho chờ chung để người
              phụ trách buổi phù hợp nhận về.
            </p>
            {error && (
              <div className="alert-error mb-3" role="alert">
                {error}
              </div>
            )}
            <div className="form-group mb-0">
              <label htmlFor="kho-to-chung-ly-do" className="form-label">
                Lý do chuyển (tùy chọn)
              </label>
              <input
                id="kho-to-chung-ly-do"
                type="text"
                className="form-input"
                placeholder="Ghi chú lý do đưa vào kho chung…"
                value={lyDo}
                onChange={(e) => setLyDo(e.target.value)}
                disabled={submitting}
                autoFocus
              />
            </div>
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
              disabled={submitting}
            >
              {submitting ? 'Đang chuyển…' : 'Đưa vào kho chờ chung'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

type XuLyDeNghiModalProps = {
  deNghi: DeNghiChuyenItem;
  dongY: boolean;
  onClose: () => void;
  onSuccess: () => void;
};

function XuLyDeNghiModal({
  deNghi,
  dongY,
  onClose,
  onSuccess,
}: XuLyDeNghiModalProps) {
  const { showToast } = useToast();
  const [ghiChu, setGhiChu] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');
    setSubmitting(true);

    const res = await apiRequest<{ de_nghi: DeNghiChuyenItem }>(
      `/api/de-nghi-chuyen/${deNghi.id}/xu-ly`,
      {
        method: 'POST',
        body: JSON.stringify({
          dong_y: dongY,
          ghi_chu: ghiChu.trim() || undefined,
        }),
      },
    );
    setSubmitting(false);

    if (!res.ok) {
      setError(res.error);
      return;
    }

    notifyPoolChanged();
    showToast(
      dongY
        ? `Đã đồng ý chuyển hồ sơ #${deNghi.ho_so.id} sang buổi ${formatMaViTri(deNghi.den_buoi.ma_buoi)}.`
        : `Đã từ chối đề nghị chuyển hồ sơ #${deNghi.ho_so.id}.`,
      'success',
    );
    onSuccess();
  }

  return (
    <div
      className="modal-backdrop"
      role="dialog"
      aria-modal="true"
      aria-labelledby="modal-xuly-denghi-title"
    >
      <div className="modal-card">
        <div className="modal-header">
          <h2 id="modal-xuly-denghi-title" className="modal-title">
            {dongY
              ? 'Đồng ý đề nghị chuyển hồ sơ'
              : 'Từ chối đề nghị chuyển hồ sơ'}
          </h2>
        </div>
        <form onSubmit={handleSubmit}>
          <div className="modal-body">
            <p className="modal-desc">
              <span
                className={`badge ${
                  layLoaiDeNghi(deNghi) === 'gui_di' ? 'badge-gui-di' : 'badge-xin-ve'
                }`}
              >
                {LOAI_DE_NGHI_NHAN[layLoaiDeNghi(deNghi)]}
              </span>{' '}
              Hồ sơ: <strong>{deNghi.ho_so.ho_ten}</strong> (ID #
              {deNghi.ho_so.id} · Năm sinh {deNghi.ho_so.nam_sinh})
            </p>
            <p className="modal-consequence">
              Người đề nghị: <strong>{deNghi.nguoi_de_nghi.ho_ten}</strong> ·
              Từ buổi:{' '}
              <strong>
                {deNghi.tu_buoi ? formatMaViTri(deNghi.tu_buoi.ma_buoi) : 'Kho chưa gán'}
              </strong>{' '}
              → Sang buổi:{' '}
              <strong>{formatMaViTri(deNghi.den_buoi.ma_buoi)}</strong>
              <br />
              Người duyệt: <strong>{tenNguoiDuyetDeNghi(deNghi)}</strong>
              <br />
              Lý do đề nghị: <em>{deNghi.ly_do}</em>
              <br />
              {dongY
                ? layLoaiDeNghi(deNghi) === 'gui_di'
                  ? 'Khi đồng ý, hồ sơ sẽ lập tức được nhận vào buổi khám đích.'
                  : 'Khi đồng ý, hồ sơ sẽ lập tức được chuyển sang buổi đích của người đề nghị.'
                : 'Khi từ chối, hồ sơ vẫn giữ nguyên ở buổi khám hiện tại.'}
            </p>

            {error && (
              <div className="alert-error mb-3" role="alert">
                {error}
              </div>
            )}

            <div className="form-group mb-0">
              <label htmlFor="xuly-denghi-ghichu" className="form-label">
                Ghi chú phản hồi (tùy chọn)
              </label>
              <input
                id="xuly-denghi-ghichu"
                type="text"
                className="form-input"
                placeholder={
                  dongY
                    ? 'Ghi chú thêm khi đồng ý (nếu có)…'
                    : 'Ghi rõ lý do từ chối…'
                }
                value={ghiChu}
                onChange={(e) => setGhiChu(e.target.value)}
                disabled={submitting}
                autoFocus
              />
            </div>
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
              className={`btn btn-sm ${dongY ? 'btn-primary' : 'btn-danger'}`}
              disabled={submitting}
            >
              {submitting
                ? 'Đang xử lý…'
                : dongY
                  ? 'Đồng ý chuyển hồ sơ'
                  : 'Từ chối đề nghị'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export type KhoTableProps = {
  items: KetQuaTimKiem[];
  showMoveToKhoChung: boolean;
  onSelectNhanVe: (h: KetQuaTimKiem) => void;
  onSelectMoveToKhoChung?: (h: KetQuaTimKiem) => void;
};

export function KhoTable({
  items,
  showMoveToKhoChung,
  onSelectNhanVe,
  onSelectMoveToKhoChung,
}: KhoTableProps) {
  return (
    <div className="table-wrap">
      <table className="data-table rasoat-table kho-table">
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
            <th className="col-dkhis">ĐK HIS</th>
            <th className="col-nguongoc">Nguồn gốc</th>
            <th className="col-thaotac">Thao tác</th>
          </tr>
        </thead>
        <tbody>
          {items.map((h, idx) => {
            const hisTimeShort = formatHisTimestamp(h.ngay_gio_dang_ky_his);
            const nguonGocText = formatNguonGocChuyen(h.chuyen, h.don_vi_goi_y);
            const canhBaoSo = layCanhBaoSo(h);
            const canhBaoTheoTruong = phanLoaiCanhBaoSoTheoTruong(canhBaoSo);
            const dongXemLaiSo = formatDongXemLaiSo(canhBaoSo);

            return (
              <tr key={h.id}>
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
                      {NHAN.TT_KSK}: {h.co_tt_ksk === 1 ? 'Có' : 'Không'}
                    </span>
                    {canhBaoSo.length > 0 && (
                      <span
                        className="chip chip-warning"
                        title={canhBaoSo.join(' · ')}
                      >
                        Xem lại số
                      </span>
                    )}
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
                  {dongXemLaiSo && (
                    <div className="ghichu-xem-lai-so" title={dongXemLaiSo}>
                      {dongXemLaiSo}
                    </div>
                  )}
                </td>
                <td className="col-gt">{h.gioi_tinh || 'Chưa rõ'}</td>
                <td className="num-col col-namsinh">{h.nam_sinh || '—'}</td>
                <td className="col-cccd num">
                  <span
                    className={
                      canhBaoTheoTruong.cccd.length > 0
                        ? 'so-canh-bao'
                        : undefined
                    }
                    title={
                      canhBaoTheoTruong.cccd.length > 0
                        ? canhBaoTheoTruong.cccd.join('; ')
                        : undefined
                    }
                  >
                    {h.cccd || '—'}
                  </span>
                </td>
                <td className="col-makcb num">
                  <span
                    className={
                      canhBaoTheoTruong.ma_kcb.length > 0
                        ? 'so-canh-bao'
                        : undefined
                    }
                    title={
                      canhBaoTheoTruong.ma_kcb.length > 0
                        ? canhBaoTheoTruong.ma_kcb.join('; ')
                        : undefined
                    }
                  >
                    {h.ma_kcb || '—'}
                  </span>
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

                <td className="col-dkhis num">{hisTimeShort || '—'}</td>
                <td className="col-nguongoc">
                  <div className="nguongoc-cell">{nguonGocText}</div>
                </td>
                <td className="col-thaotac">
                  <div className="kho-actions-cell">
                    <button
                      type="button"
                      className="btn btn-primary btn-xs"
                      onClick={() => onSelectNhanVe(h)}
                    >
                      Nhận về buổi…
                    </button>
                    {showMoveToKhoChung && onSelectMoveToKhoChung && (
                      <button
                        type="button"
                        className="btn btn-secondary btn-xs"
                        onClick={() => onSelectMoveToKhoChung(h)}
                      >
                        Đưa vào kho chung
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

const TRANG_THAI_DE_NGHI_NHAN: Record<DeNghiChuyen['trang_thai'], string> = {
  cho_xu_ly: 'Chờ xử lý',
  dong_y: 'Đã đồng ý',
  tu_choi: 'Đã từ chối',
};

function NhanTuDuyetDeNghi({
  d,
  nowMs,
}: {
  d: DeNghiChuyenItem;
  nowMs: number;
}) {
  if (d.trang_thai === 'cho_xu_ly') {
    if (d.tu_dong_loi && d.tu_dong_loi.trim()) {
      return (
        <div className="tu-duyet-loi-badge" role="status">
          Không tự duyệt được: {d.tu_dong_loi} — cần xử lý tay
        </div>
      );
    }
    const countdown = formatDemNguocTuDuyet(d.han_tu_duyet, nowMs);
    if (countdown) {
      return (
        <div className="tu-duyet-countdown-badge num" role="timer">
          {countdown}
        </div>
      );
    }
    return null;
  }

  if (d.tu_dong) {
    return (
      <span className="badge badge-primary ml-1" title="Được hệ thống tự động duyệt">
        Tự động
      </span>
    );
  }
  return null;
}

export function KhoView({ currentUser }: KhoViewProps) {
  const searchParams = useSearchParams();
  const isAdmin = currentUser.role === 'admin';

  const initialTab = useMemo<KhoTab>(() => {
    const t = searchParams.get('tab');
    if (t === 'kho_chung' || t === 'de_nghi') return t;
    return 'kho_ca_nhan';
  }, [searchParams]);

  const [activeTab, setActiveTab] = useState<KhoTab>(initialTab);

  // Admin: chọn xem kho của user nào
  const [adminUsers, setAdminUsers] = useState<UserQuanLy[]>([]);
  const [selectedKhoUserId, setSelectedKhoUserId] = useState<number>(
    currentUser.id,
  );

  // Kho của tôi
  const [khoCaNhanList, setKhoCaNhanList] = useState<KetQuaTimKiem[]>([]);
  const [loadingCaNhan, setLoadingCaNhan] = useState<boolean>(true);
  const [errorCaNhan, setErrorCaNhan] = useState<string>('');

  // Kho chờ chung
  const [donViGoiY, setDonViGoiY] = useState<string>('');
  const [searchChung, setSearchChung] = useState<string>('');
  const [khoChungList, setKhoChungList] = useState<KetQuaTimKiem[]>([]);
  const [khoChungTong, setKhoChungTong] = useState<number>(0);
  const [loadingChung, setLoadingChung] = useState<boolean>(true);
  const [errorChung, setErrorChung] = useState<string>('');

  // Đề nghị chuyển + cài đặt tự duyệt
  const [deNghiList, setDeNghiList] = useState<DeNghiChuyenItem[]>([]);
  const [loadingDeNghi, setLoadingDeNghi] = useState<boolean>(true);
  const [errorDeNghi, setErrorDeNghi] = useState<string>('');
  const [tuDuyet, setTuDuyet] = useState<CaiDatTuDuyet | null>(null);
  const [nowMs, setNowMs] = useState<number>(() => Date.now());
  const sweptIdsRef = useRef<Set<number>>(new Set());

  // Hộp thoại thao tác
  const [nhanVeTarget, setNhanVeTarget] = useState<KetQuaTimKiem | null>(null);
  const [moveToChungTarget, setMoveToChungTarget] =
    useState<KetQuaTimKiem | null>(null);
  const [xuLyTarget, setXuLyTarget] = useState<{
    deNghi: DeNghiChuyenItem;
    dongY: boolean;
  } | null>(null);

  useEffect(() => {
    if (!isAdmin) return;
    let cancelled = false;
    apiRequest<{ users: UserQuanLy[] }>('/api/users').then((res) => {
      if (cancelled || !res.ok) return;
      setAdminUsers(res.data.users ?? []);
    });
    return () => {
      cancelled = true;
    };
  }, [isAdmin]);

  const loadKhoCaNhan = useCallback(async () => {
    setLoadingCaNhan(true);
    setErrorCaNhan('');
    const url =
      isAdmin && selectedKhoUserId !== currentUser.id
        ? `/api/kho-ca-nhan?user=${selectedKhoUserId}`
        : '/api/kho-ca-nhan';
    const res = await apiRequest<{ ho_so: KetQuaTimKiem[] }>(url);
    setLoadingCaNhan(false);
    if (!res.ok) {
      setErrorCaNhan(res.error);
      return;
    }
    setKhoCaNhanList(res.data.ho_so ?? []);
  }, [currentUser.id, isAdmin, selectedKhoUserId]);

  const loadKhoChung = useCallback(async () => {
    setLoadingChung(true);
    setErrorChung('');
    const params = new URLSearchParams();
    if (donViGoiY) params.set('don_vi', donViGoiY);
    if (searchChung.trim()) params.set('q', searchChung.trim());
    const qs = params.toString();
    const res = await apiRequest<{ ho_so: KetQuaTimKiem[]; tong: number }>(
      `/api/kho-chung${qs ? `?${qs}` : ''}`,
    );
    setLoadingChung(false);
    if (!res.ok) {
      setErrorChung(res.error);
      return;
    }
    setKhoChungList(res.data.ho_so ?? []);
    setKhoChungTong(res.data.tong ?? 0);
  }, [donViGoiY, searchChung]);

  const loadTuDuyet = useCallback(async () => {
    const res = await apiRequest<{ tu_duyet: CaiDatTuDuyet }>(
      '/api/cai-dat/tu-duyet',
    );
    if (res.ok && res.data?.tu_duyet) {
      setTuDuyet(res.data.tu_duyet);
    }
  }, []);

  const loadDeNghi = useCallback(async () => {
    setLoadingDeNghi(true);
    setErrorDeNghi('');
    const [res] = await Promise.all([
      apiRequest<{ de_nghi: DeNghiChuyenItem[] }>('/api/de-nghi-chuyen'),
      loadTuDuyet(),
    ]);
    setLoadingDeNghi(false);
    if (!res.ok) {
      setErrorDeNghi(res.error);
      return;
    }
    setDeNghiList(res.data.de_nghi ?? []);
  }, [loadTuDuyet]);

  useEffect(() => {
    let cancelled = false;
    const url =
      isAdmin && selectedKhoUserId !== currentUser.id
        ? `/api/kho-ca-nhan?user=${selectedKhoUserId}`
        : '/api/kho-ca-nhan';
    apiRequest<{ ho_so: KetQuaTimKiem[] }>(url).then((res) => {
      if (cancelled) return;
      setLoadingCaNhan(false);
      if (!res.ok) {
        setErrorCaNhan(res.error);
        return;
      }
      setErrorCaNhan('');
      setKhoCaNhanList(res.data.ho_so ?? []);
    });
    return () => {
      cancelled = true;
    };
  }, [currentUser.id, isAdmin, selectedKhoUserId]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadKhoChung();
    }, 200);
    return () => window.clearTimeout(timer);
  }, [loadKhoChung]);

  useEffect(() => {
    let cancelled = false;
    apiRequest<{ tu_duyet: CaiDatTuDuyet }>('/api/cai-dat/tu-duyet').then(
      (res) => {
        if (!cancelled && res.ok && res.data?.tu_duyet) {
          setTuDuyet(res.data.tu_duyet);
        }
      },
    );
    apiRequest<{ de_nghi: DeNghiChuyenItem[] }>('/api/de-nghi-chuyen').then(
      (res) => {
        if (cancelled) return;
        setLoadingDeNghi(false);
        if (!res.ok) {
          setErrorDeNghi(res.error);
          return;
        }
        setErrorDeNghi('');
        setDeNghiList(res.data.de_nghi ?? []);
      },
    );
    return () => {
      cancelled = true;
    };
  }, []);

  // Đồng hồ đếm ngược mm:ss mỗi giây khi đang xem tab Đề nghị chuyển
  useEffect(() => {
    const hasPendingCountdown = deNghiList.some(
      (d) => d.trang_thai === 'cho_xu_ly' && d.han_tu_duyet && !d.tu_dong_loi,
    );
    if (!hasPendingCountdown) return;

    const timer = window.setInterval(() => {
      const current = Date.now();
      setNowMs(current);
      // Nếu có đề nghị vừa chạm 00:00, gọi loadDeNghi 1 lần để backend quét tự duyệt
      for (const d of deNghiList) {
        if (
          d.trang_thai === 'cho_xu_ly' &&
          d.han_tu_duyet &&
          !d.tu_dong_loi &&
          !sweptIdsRef.current.has(d.id)
        ) {
          const target = Date.parse(d.han_tu_duyet);
          if (Number.isFinite(target) && current >= target) {
            sweptIdsRef.current.add(d.id);
            void loadDeNghi();
            notifyPoolChanged();
            break;
          }
        }
      }
    }, 1000);

    return () => window.clearInterval(timer);
  }, [deNghiList, loadDeNghi]);

  const reloadAll = useCallback(() => {
    void loadKhoCaNhan();
    void loadKhoChung();
    void loadDeNghi();
  }, [loadDeNghi, loadKhoCaNhan, loadKhoChung]);

  // Phân nhóm đề nghị chuyển: Gửi đến tôi vs Tôi đã gửi
  const { deNghiDenToi, deNghiToiGui, soChoXuLy } = useMemo(() => {
    const denToiList: DeNghiChuyenItem[] = [];
    const toiGui: DeNghiChuyenItem[] = [];
    for (const d of deNghiList) {
      const isMineSent = d.nguoi_de_nghi.id === currentUser.id;
      const nguoiDuyet = layNguoiDuyetDeNghi(d);
      const isMineReceived =
        !isMineSent &&
        (denToi(d, currentUser.id, isAdmin) ||
          nguoiDuyet?.id === currentUser.id ||
          (layLoaiDeNghi(d) === 'gui_di'
            ? d.den_buoi?.phu_trach?.id === currentUser.id
            : d.tu_buoi?.phu_trach?.id === currentUser.id) ||
          d.xu_ly_by?.id === currentUser.id ||
          isAdmin);
      if (isMineReceived) {
        denToiList.push(d);
      }
      if (isMineSent) {
        toiGui.push(d);
      }
    }
    const pendingCount = deNghiList.filter((d) =>
      denToi(d, currentUser.id, isAdmin),
    ).length;
    return {
      deNghiDenToi: denToiList,
      deNghiToiGui: toiGui,
      soChoXuLy: pendingCount,
    };
  }, [currentUser, deNghiList, isAdmin]);

  return (
    <div className="page-container">
      <div className="page-header-row">
        <div>
          <h1 className="page-title">Kho chờ &amp; Đề nghị chuyển hồ sơ</h1>
          <p className="page-subtitle">
            Quản lý hồ sơ tạm cất trong kho cá nhân, kho chờ chung và xử lý đề
            nghị chuyển giữa các buổi khám
          </p>
        </div>
        <div className="state-actions mt-0">
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={reloadAll}
          >
            Tải lại
          </button>
          <Link href="/" className="btn btn-secondary btn-sm">
            ← Về Danh sách của tôi
          </Link>
        </div>
      </div>

      <div className="kho-tabs-bar" role="tablist" aria-label="Các mục Kho chờ">
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'kho_ca_nhan'}
          className={`kho-tab-btn ${activeTab === 'kho_ca_nhan' ? 'active' : ''}`}
          onClick={() => setActiveTab('kho_ca_nhan')}
        >
          Kho của tôi
          <span className="nav-badge num">{khoCaNhanList.length}</span>
        </button>

        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'kho_chung'}
          className={`kho-tab-btn ${activeTab === 'kho_chung' ? 'active' : ''}`}
          onClick={() => setActiveTab('kho_chung')}
        >
          Kho chờ chung
          <span className="nav-badge num">{khoChungTong}</span>
        </button>

        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'de_nghi'}
          className={`kho-tab-btn ${activeTab === 'de_nghi' ? 'active' : ''}`}
          onClick={() => setActiveTab('de_nghi')}
        >
          Đề nghị chuyển
          {soChoXuLy > 0 ? (
            <span className="nav-badge nav-badge-warn num">{soChoXuLy}</span>
          ) : (
            <span className="nav-badge num">{deNghiList.length}</span>
          )}
        </button>
      </div>

      {activeTab === 'kho_ca_nhan' && (
        <section aria-label="Kho của tôi">
          {isAdmin && (
            <div className="filter-bar mb-3">
              <div className="filter-group">
                <label
                  htmlFor="kho-admin-user-select"
                  className="filter-label"
                >
                  Xem kho cá nhân của:
                </label>
                <select
                  id="kho-admin-user-select"
                  className="form-select form-select-sm"
                  value={selectedKhoUserId}
                  onChange={(e) => setSelectedKhoUserId(Number(e.target.value))}
                >
                  <option value={currentUser.id}>
                    {currentUser.ho_ten} ({currentUser.username} — Kho của tôi)
                  </option>
                  {adminUsers
                    .filter((u) => u.id !== currentUser.id)
                    .map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.ho_ten} ({u.username})
                      </option>
                    ))}
                </select>
              </div>
              <div className="filter-summary">
                Đang có{' '}
                <strong className="num">
                  {formatNumber(khoCaNhanList.length)}
                </strong>{' '}
                hồ sơ trong kho cá nhân
              </div>
            </div>
          )}

          {loadingCaNhan ? (
            <div className="state-box" role="status">
              <p className="state-title">Đang tải hồ sơ trong Kho của tôi…</p>
            </div>
          ) : errorCaNhan ? (
            <div className="state-box state-error" role="alert">
              <p className="state-title">Không tải được Kho của tôi</p>
              <p className="state-desc">{errorCaNhan}</p>
              <div className="state-actions">
                <button
                  type="button"
                  className="btn btn-primary btn-sm"
                  onClick={() => void loadKhoCaNhan()}
                >
                  Thử lại
                </button>
              </div>
            </div>
          ) : khoCaNhanList.length === 0 ? (
            <div className="state-box" role="status">
              <p className="state-title">Kho cá nhân đang trống</p>
              <p className="state-desc">
                Khi rà soát danh sách buổi khám, bạn có thể nhấn phím{' '}
                <kbd>K</kbd> hoặc nút &quot;Đưa vào kho của tôi&quot; để tạm cất
                hồ sơ chưa xác định buổi về đây.
              </p>
            </div>
          ) : (
            <KhoTable
              items={khoCaNhanList}
              showMoveToKhoChung={true}
              onSelectNhanVe={(h) => setNhanVeTarget(h)}
              onSelectMoveToKhoChung={(h) => setMoveToChungTarget(h)}
            />
          )}
        </section>
      )}

      {activeTab === 'kho_chung' && (
        <section aria-label="Kho chờ chung">
          <div className="filter-bar mb-3">
            <div className="filter-group">
              <label htmlFor="kho-chung-donvi" className="filter-label">
                Đơn vị gợi ý:
              </label>
              <select
                id="kho-chung-donvi"
                className="form-select form-select-sm"
                value={donViGoiY}
                onChange={(e) => setDonViGoiY(e.target.value)}
              >
                <option value="">Tất cả đơn vị</option>
                {(['TN', 'LK', 'VK'] as const).map((dv) => (
                  <option key={dv} value={dv}>
                    {DON_VI[dv]} ({dv})
                  </option>
                ))}
              </select>
            </div>

            <div className="filter-group">
              <label htmlFor="kho-chung-q" className="filter-label">
                Tìm hồ sơ:
              </label>
              <input
                id="kho-chung-q"
                type="search"
                className="form-input form-select-sm"
                style={{ minWidth: '250px' }}
                placeholder="Họ tên, năm sinh, CCCD, mã KCB…"
                value={searchChung}
                onChange={(e) => setSearchChung(e.target.value)}
              />
            </div>

            {(donViGoiY !== '' || searchChung.trim() !== '') && (
              <button
                type="button"
                className="btn btn-secondary btn-xs"
                onClick={() => {
                  setDonViGoiY('');
                  setSearchChung('');
                }}
              >
                Xóa lọc
              </button>
            )}

            <div className="filter-summary">
              Hiển thị{' '}
              <strong className="num">
                {formatNumber(khoChungList.length)}
              </strong>{' '}
              / <strong className="num">{formatNumber(khoChungTong)}</strong> hồ
              sơ trong Kho chờ chung
            </div>
          </div>

          {loadingChung ? (
            <div className="state-box" role="status">
              <p className="state-title">Đang tải Kho chờ chung…</p>
            </div>
          ) : errorChung ? (
            <div className="state-box state-error" role="alert">
              <p className="state-title">Không tải được Kho chờ chung</p>
              <p className="state-desc">{errorChung}</p>
              <div className="state-actions">
                <button
                  type="button"
                  className="btn btn-primary btn-sm"
                  onClick={() => void loadKhoChung()}
                >
                  Thử lại
                </button>
              </div>
            </div>
          ) : khoChungList.length === 0 ? (
            <div className="state-box" role="status">
              <p className="state-title">
                Không có hồ sơ nào trong Kho chờ chung
              </p>
              <p className="state-desc">
                {donViGoiY || searchChung.trim()
                  ? 'Không có hồ sơ khớp điều kiện lọc hiện tại.'
                  : 'Hiện không có hồ sơ nào đang chờ trong kho chung.'}
              </p>
            </div>
          ) : (
            <KhoTable
              items={khoChungList}
              showMoveToKhoChung={false}
              onSelectNhanVe={(h) => setNhanVeTarget(h)}
            />
          )}
        </section>
      )}

      {activeTab === 'de_nghi' && (
        <section aria-label="Đề nghị chuyển hồ sơ">
          {/* Dòng thông tin trạng thái tự duyệt đề nghị chuyển */}
          <div className="tu-duyet-info-strip" role="status">
            <div className="tu-duyet-info-main">
              <span
                className={`badge ${
                  !tuDuyet || tuDuyet.che_do === 'tat' ? 'badge-chua' : 'badge-xong'
                }`}
              >
                {moTaCaiDatTuDuyet(tuDuyet)}
              </span>
              <span className="text-muted text-xs">
                Hồ sơ đã xác nhận hoặc buổi đã chốt sẽ không tự duyệt — vẫn chờ người xử lý.
              </span>
            </div>
            {isAdmin && (
              <Link href="/admin" className="btn btn-secondary btn-xs">
                Cài đặt tự duyệt →
              </Link>
            )}
          </div>

          {loadingDeNghi ? (
            <div className="state-box" role="status">
              <p className="state-title">
                Đang tải danh sách đề nghị chuyển hồ sơ…
              </p>
            </div>
          ) : errorDeNghi ? (
            <div className="state-box state-error" role="alert">
              <p className="state-title">
                Không tải được danh sách đề nghị chuyển
              </p>
              <p className="state-desc">{errorDeNghi}</p>
              <div className="state-actions">
                <button
                  type="button"
                  className="btn btn-primary btn-sm"
                  onClick={() => void loadDeNghi()}
                >
                  Thử lại
                </button>
              </div>
            </div>
          ) : (
            <div className="denghi-sections">
              <div className="denghi-section-card">
                <div className="denghi-section-header">
                  <h2 className="denghi-section-title">
                    Đề nghị gửi đến tôi ({formatNumber(deNghiDenToi.length)})
                  </h2>
                  <span className="text-muted">
                    Các đề nghị xin nhận hồ sơ từ buổi khám của bạn hoặc gửi hồ
                    sơ sang buổi của bạn
                  </span>
                </div>

                {deNghiDenToi.length === 0 ? (
                  <div className="state-box">
                    <p className="state-title">
                      Chưa có đề nghị chuyển nào gửi đến bạn
                    </p>
                  </div>
                ) : (
                  <>
                    {/* Thẻ đề nghị trên điện thoại */}
                    <div className="mobile-only-cards denghi-card-list">
                      {deNghiDenToi.map((d) => {
                        const loai = layLoaiDeNghi(d);
                        const coQuyenXuLy = denToi(d, currentUser.id, isAdmin);
                        return (
                          <div key={d.id} className="denghi-mobile-card">
                            <div className="denghi-mobile-card-head">
                              <div className="denghi-mobile-badges">
                                <span className="text-muted text-xs num">#{d.id}</span>
                                <span
                                  className={`badge ${
                                    loai === 'gui_di' ? 'badge-gui-di' : 'badge-xin-ve'
                                  }`}
                                >
                                  {LOAI_DE_NGHI_NHAN[loai]}
                                </span>
                              </div>
                              <div className="denghi-mobile-badges">
                                <span
                                  className={`badge ${
                                    d.trang_thai === 'dong_y'
                                      ? 'badge-success'
                                      : d.trang_thai === 'tu_choi'
                                        ? 'badge-danger'
                                        : 'badge-warning'
                                  }`}
                                >
                                  {TRANG_THAI_DE_NGHI_NHAN[d.trang_thai]}
                                </span>
                                {d.trang_thai !== 'cho_xu_ly' && d.tu_dong && (
                                  <span className="badge badge-primary">Tự động</span>
                                )}
                              </div>
                            </div>

                            <div className="denghi-mobile-hoso">
                              <div className="denghi-summary-line">
                                <MoTaDeNghiChuyen
                                  deNghi={d}
                                  userId={currentUser.id}
                                  isAdmin={isAdmin}
                                />
                              </div>
                              <div className="text-muted text-xs num">
                                ID #{d.ho_so.id} · CCCD: {d.ho_so.cccd || '—'} · Mã KCB:{' '}
                                {d.ho_so.ma_kcb || '—'}
                              </div>
                            </div>

                            <div className="denghi-mobile-route">
                              <span>
                                Từ:{' '}
                                <strong>
                                  {d.tu_buoi &&
                                  !(
                                    d.trang_thai === 'dong_y' &&
                                    d.tu_buoi.ma_buoi === d.den_buoi.ma_buoi
                                  )
                                    ? formatMaViTri(d.tu_buoi.ma_buoi)
                                    : 'Đã rời buổi gốc'}
                                </strong>
                              </span>
                              <span aria-hidden="true">→</span>
                              <span>
                                {loai === 'gui_di' ? 'Sang:' : 'Về:'}{' '}
                                <strong>{formatMaViTri(d.den_buoi.ma_buoi)}</strong>
                              </span>
                            </div>

                            <div className="denghi-mobile-approver">
                              Người duyệt: <strong>{tenNguoiDuyetDeNghi(d)}</strong>
                            </div>

                            <div className="denghi-mobile-reason">
                              <strong>Lý do:</strong> {d.ly_do}
                            </div>

                            <div className="denghi-mobile-meta num">
                              <span>Gửi lúc: {formatDateTime(d.created_at)}</span>
                            </div>

                            {d.trang_thai === 'cho_xu_ly' && (
                              <NhanTuDuyetDeNghi d={d} nowMs={nowMs} />
                            )}

                            {coQuyenXuLy ? (
                              <div className="denghi-mobile-actions">
                                <button
                                  type="button"
                                  className="btn btn-primary denghi-mobile-btn"
                                  onClick={() => setXuLyTarget({ deNghi: d, dongY: true })}
                                >
                                  Đồng ý
                                </button>
                                <button
                                  type="button"
                                  className="btn btn-danger denghi-mobile-btn"
                                  onClick={() => setXuLyTarget({ deNghi: d, dongY: false })}
                                >
                                  Từ chối
                                </button>
                              </div>
                            ) : d.trang_thai === 'cho_xu_ly' ? (
                              <div className="text-muted text-xs">
                                Đang chờ {tenNguoiDuyetDeNghi(d)} phản hồi
                              </div>
                            ) : (
                              <div className="text-muted text-xs">
                                Xử lý bởi{' '}
                                {d.xu_ly_by?.ho_ten ?? (d.tu_dong ? 'Hệ thống tự động' : '—')}{' '}
                                lúc {formatDateTime(d.xu_ly_at)}
                                {d.xu_ly_ghi_chu ? ` · Ghi chú: "${d.xu_ly_ghi_chu}"` : ''}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>

                    {/* Bảng đầy đủ trên máy tính */}
                    <div className="table-wrap desktop-only-table">
                      <table className="data-table">
                        <thead>
                          <tr>
                            <th className="num-col">Mã</th>
                            <th>Loại</th>
                            <th>Hồ sơ &amp; Nội dung</th>
                            <th>Từ buổi</th>
                            <th>Sang buổi đích</th>
                            <th>Người duyệt</th>
                            <th>Lý do</th>
                            <th>Thời gian gửi</th>
                            <th>Trạng thái</th>
                            <th>Thao tác / Phản hồi</th>
                          </tr>
                        </thead>
                        <tbody>
                          {deNghiDenToi.map((d) => {
                            const loai = layLoaiDeNghi(d);
                            const coQuyenXuLy = denToi(d, currentUser.id, isAdmin);
                            return (
                              <tr key={d.id}>
                                <td className="num-col">#{d.id}</td>
                                <td>
                                  <span
                                    className={`badge ${
                                      loai === 'gui_di' ? 'badge-gui-di' : 'badge-xin-ve'
                                    }`}
                                  >
                                    {LOAI_DE_NGHI_NHAN[loai]}
                                  </span>
                                </td>
                                <td>
                                  <div>
                                    <strong>{d.ho_so.ho_ten}</strong> (ID #
                                    {d.ho_so.id})
                                  </div>
                                  <div className="denghi-summary-line">
                                    <MoTaDeNghiChuyen
                                      deNghi={d}
                                      userId={currentUser.id}
                                      isAdmin={isAdmin}
                                    />
                                  </div>
                                  <div className="text-muted">
                                    Năm sinh: {d.ho_so.nam_sinh} · CCCD:{' '}
                                    {d.ho_so.cccd || '—'} · Mã KCB:{' '}
                                    {d.ho_so.ma_kcb || '—'}
                                  </div>
                                </td>
                                <td>
                                  {d.tu_buoi &&
                                  !(
                                    d.trang_thai === 'dong_y' &&
                                    d.tu_buoi.ma_buoi === d.den_buoi.ma_buoi
                                  ) ? (
                                    <>
                                      <div>
                                        <strong>
                                          {formatMaViTri(d.tu_buoi.ma_buoi)}
                                        </strong>
                                      </div>
                                      <div className="text-muted">
                                        PT:{' '}
                                        {d.tu_buoi.phu_trach?.ho_ten ??
                                          'Chưa phân công'}
                                      </div>
                                    </>
                                  ) : (
                                    <span className="text-muted">
                                      Đã rời buổi gốc
                                    </span>
                                  )}
                                </td>
                                <td>
                                  <div>
                                    <strong>
                                      {formatMaViTri(d.den_buoi.ma_buoi)}
                                    </strong>
                                  </div>
                                  <div className="text-muted">
                                    PT:{' '}
                                    {d.den_buoi.phu_trach?.ho_ten ??
                                      'Chưa phân công'}
                                  </div>
                                </td>
                                <td>
                                  <div>
                                    Người duyệt:{' '}
                                    <strong>{tenNguoiDuyetDeNghi(d)}</strong>
                                  </div>
                                  <div className="text-muted text-xs">
                                    Người gửi: {d.nguoi_de_nghi.ho_ten} (
                                    {d.nguoi_de_nghi.username})
                                  </div>
                                </td>
                                <td>{d.ly_do}</td>
                                <td className="num">
                                  {formatDateTime(d.created_at)}
                                </td>
                                <td>
                                  <div className="denghi-status-cell">
                                    <div>
                                      <span
                                        className={`badge ${
                                          d.trang_thai === 'dong_y'
                                            ? 'badge-success'
                                            : d.trang_thai === 'tu_choi'
                                              ? 'badge-danger'
                                              : 'badge-warning'
                                        }`}
                                      >
                                        {TRANG_THAI_DE_NGHI_NHAN[d.trang_thai]}
                                      </span>
                                      {d.trang_thai !== 'cho_xu_ly' && (
                                        <NhanTuDuyetDeNghi d={d} nowMs={nowMs} />
                                      )}
                                    </div>
                                    {d.trang_thai === 'cho_xu_ly' && (
                                      <NhanTuDuyetDeNghi d={d} nowMs={nowMs} />
                                    )}
                                  </div>
                                </td>
                                <td>
                                  {coQuyenXuLy ? (
                                    <div className="kho-actions-cell">
                                      <button
                                        type="button"
                                        className="btn btn-primary btn-xs"
                                        onClick={() =>
                                          setXuLyTarget({ deNghi: d, dongY: true })
                                        }
                                      >
                                        Đồng ý
                                      </button>
                                      <button
                                        type="button"
                                        className="btn btn-danger btn-xs"
                                        onClick={() =>
                                          setXuLyTarget({ deNghi: d, dongY: false })
                                        }
                                      >
                                        Từ chối
                                      </button>
                                    </div>
                                  ) : d.trang_thai === 'cho_xu_ly' ? (
                                    <span className="text-muted">
                                      Đang chờ {tenNguoiDuyetDeNghi(d)} phản hồi
                                    </span>
                                  ) : (
                                    <div className="text-muted">
                                      Xử lý bởi{' '}
                                      {d.xu_ly_by?.ho_ten ??
                                        (d.tu_dong ? 'Hệ thống tự động' : '—')}{' '}
                                      lúc {formatDateTime(d.xu_ly_at)}
                                      {d.xu_ly_ghi_chu
                                        ? ` · Ghi chú: "${d.xu_ly_ghi_chu}"`
                                        : ''}
                                    </div>
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
              </div>

              <div className="denghi-section-card">
                <div className="denghi-section-header">
                  <h2 className="denghi-section-title">
                    Đề nghị tôi đã gửi ({formatNumber(deNghiToiGui.length)})
                  </h2>
                  <span className="text-muted">
                    Các đề nghị bạn đã gửi để xin nhận hồ sơ về buổi của mình
                    hoặc gửi hồ sơ sang buổi của người khác
                  </span>
                </div>

                {deNghiToiGui.length === 0 ? (
                  <div className="state-box">
                    <p className="state-title">
                      Bạn chưa gửi đề nghị chuyển hồ sơ nào
                    </p>
                  </div>
                ) : (
                  <>
                    {/* Thẻ đề nghị tôi đã gửi trên điện thoại */}
                    <div className="mobile-only-cards denghi-card-list">
                      {deNghiToiGui.map((d) => {
                        const loai = layLoaiDeNghi(d);
                        return (
                          <div key={d.id} className="denghi-mobile-card">
                            <div className="denghi-mobile-card-head">
                              <div className="denghi-mobile-badges">
                                <span className="text-muted text-xs num">#{d.id}</span>
                                <span
                                  className={`badge ${
                                    loai === 'gui_di' ? 'badge-gui-di' : 'badge-xin-ve'
                                  }`}
                                >
                                  {LOAI_DE_NGHI_NHAN[loai]}
                                </span>
                                <strong>{d.ho_so.ho_ten}</strong> ({d.ho_so.nam_sinh})
                              </div>
                              <div className="denghi-mobile-badges">
                                <span
                                  className={`badge ${
                                    d.trang_thai === 'dong_y'
                                      ? 'badge-success'
                                      : d.trang_thai === 'tu_choi'
                                        ? 'badge-danger'
                                        : 'badge-warning'
                                  }`}
                                >
                                  {TRANG_THAI_DE_NGHI_NHAN[d.trang_thai]}
                                </span>
                                {d.trang_thai !== 'cho_xu_ly' && d.tu_dong && (
                                  <span className="badge badge-primary">Tự động</span>
                                )}
                              </div>
                            </div>

                            <div className="denghi-summary-line">
                              <MoTaDeNghiChuyen
                                deNghi={d}
                                userId={currentUser.id}
                                isAdmin={isAdmin}
                              />
                            </div>

                            <div className="denghi-mobile-route">
                              <span>
                                Từ:{' '}
                                <strong>
                                  {d.tu_buoi ? formatMaViTri(d.tu_buoi.ma_buoi) : '—'}
                                </strong>
                              </span>
                              <span aria-hidden="true">→</span>
                              <span>
                                {loai === 'gui_di' ? 'Sang:' : 'Về:'}{' '}
                                <strong>{formatMaViTri(d.den_buoi.ma_buoi)}</strong>
                              </span>
                            </div>

                            <div className="denghi-mobile-approver">
                              Người duyệt: <strong>{tenNguoiDuyetDeNghi(d)}</strong>
                            </div>

                            <div className="denghi-mobile-reason">
                              <strong>Lý do:</strong> {d.ly_do}
                            </div>

                            <div className="denghi-mobile-meta num">
                              <span>Gửi lúc: {formatDateTime(d.created_at)}</span>
                            </div>

                            {d.trang_thai === 'cho_xu_ly' ? (
                              <>
                                <NhanTuDuyetDeNghi d={d} nowMs={nowMs} />
                                <div className="text-muted text-xs">
                                  Đang chờ {tenNguoiDuyetDeNghi(d)} phản hồi
                                </div>
                              </>
                            ) : (
                              <div className="text-muted text-xs">
                                {d.xu_ly_by?.ho_ten ?? (d.tu_dong ? 'Hệ thống tự động' : '—')}{' '}
                                xử lý lúc {formatDateTime(d.xu_ly_at)}
                                {d.xu_ly_ghi_chu ? ` · Ghi chú: "${d.xu_ly_ghi_chu}"` : ''}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>

                    {/* Bảng đầy đủ trên máy tính */}
                    <div className="table-wrap desktop-only-table">
                      <table className="data-table">
                        <thead>
                          <tr>
                            <th className="num-col">Mã</th>
                            <th>Loại</th>
                            <th>Hồ sơ &amp; Nội dung</th>
                            <th>Từ buổi</th>
                            <th>Sang buổi đích</th>
                            <th>Người duyệt</th>
                            <th>Lý do gửi</th>
                            <th>Thời gian gửi</th>
                            <th>Trạng thái</th>
                            <th>Kết quả xử lý</th>
                          </tr>
                        </thead>
                        <tbody>
                          {deNghiToiGui.map((d) => {
                            const loai = layLoaiDeNghi(d);
                            return (
                              <tr key={d.id}>
                                <td className="num-col">#{d.id}</td>
                                <td>
                                  <span
                                    className={`badge ${
                                      loai === 'gui_di' ? 'badge-gui-di' : 'badge-xin-ve'
                                    }`}
                                  >
                                    {LOAI_DE_NGHI_NHAN[loai]}
                                  </span>
                                </td>
                                <td>
                                  <div>
                                    <strong>{d.ho_so.ho_ten}</strong> (ID #
                                    {d.ho_so.id})
                                  </div>
                                  <div className="denghi-summary-line">
                                    <MoTaDeNghiChuyen
                                      deNghi={d}
                                      userId={currentUser.id}
                                      isAdmin={isAdmin}
                                    />
                                  </div>
                                  <div className="text-muted">
                                    Năm sinh: {d.ho_so.nam_sinh} · CCCD:{' '}
                                    {d.ho_so.cccd || '—'} · Mã KCB:{' '}
                                    {d.ho_so.ma_kcb || '—'}
                                  </div>
                                </td>
                                <td>
                                  {d.tu_buoi ? (
                                    <>
                                      <div>
                                        <strong>
                                          {formatMaViTri(d.tu_buoi.ma_buoi)}
                                        </strong>
                                      </div>
                                      <div className="text-muted">
                                        PT:{' '}
                                        {d.tu_buoi.phu_trach?.ho_ten ??
                                          'Chưa phân công'}
                                      </div>
                                    </>
                                  ) : (
                                    <span className="text-muted">—</span>
                                  )}
                                </td>
                                <td>
                                  <div>
                                    <strong>
                                      {formatMaViTri(d.den_buoi.ma_buoi)}
                                    </strong>
                                  </div>
                                  <div className="text-muted">
                                    PT:{' '}
                                    {d.den_buoi.phu_trach?.ho_ten ??
                                      'Chưa phân công'}
                                  </div>
                                </td>
                                <td>
                                  Người duyệt:{' '}
                                  <strong>{tenNguoiDuyetDeNghi(d)}</strong>
                                </td>
                                <td>{d.ly_do}</td>
                                <td className="num">
                                  {formatDateTime(d.created_at)}
                                </td>
                                <td>
                                  <div className="denghi-status-cell">
                                    <div>
                                      <span
                                        className={`badge ${
                                          d.trang_thai === 'dong_y'
                                            ? 'badge-success'
                                            : d.trang_thai === 'tu_choi'
                                              ? 'badge-danger'
                                              : 'badge-warning'
                                        }`}
                                      >
                                        {TRANG_THAI_DE_NGHI_NHAN[d.trang_thai]}
                                      </span>
                                      {d.trang_thai !== 'cho_xu_ly' && (
                                        <NhanTuDuyetDeNghi d={d} nowMs={nowMs} />
                                      )}
                                    </div>
                                    {d.trang_thai === 'cho_xu_ly' && (
                                      <NhanTuDuyetDeNghi d={d} nowMs={nowMs} />
                                    )}
                                  </div>
                                </td>
                                <td>
                                  {d.trang_thai === 'cho_xu_ly' ? (
                                    <span className="text-muted">
                                      Đang chờ {tenNguoiDuyetDeNghi(d)} phản hồi
                                    </span>
                                  ) : (
                                    <div>
                                      <span>
                                        {d.xu_ly_by?.ho_ten ??
                                          (d.tu_dong ? 'Hệ thống tự động' : '—')}{' '}
                                        xử lý lúc {formatDateTime(d.xu_ly_at)}
                                      </span>
                                      {d.xu_ly_ghi_chu && (
                                        <div className="text-muted">
                                          Ghi chú: &quot;{d.xu_ly_ghi_chu}&quot;
                                        </div>
                                      )}
                                    </div>
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
              </div>
            </div>
          )}
        </section>
      )}

      {nhanVeTarget && (
        <NhanVeBuoiModal
          hoSo={nhanVeTarget}
          onClose={() => setNhanVeTarget(null)}
          onSuccess={() => {
            setNhanVeTarget(null);
            reloadAll();
          }}
        />
      )}

      {moveToChungTarget && (
        <DuaVaoKhoChungTuKhoModal
          hoSo={moveToChungTarget}
          onClose={() => setMoveToChungTarget(null)}
          onSuccess={() => {
            setMoveToChungTarget(null);
            reloadAll();
          }}
        />
      )}

      {xuLyTarget && (
        <XuLyDeNghiModal
          deNghi={xuLyTarget.deNghi}
          dongY={xuLyTarget.dongY}
          onClose={() => setXuLyTarget(null)}
          onSuccess={() => {
            setXuLyTarget(null);
            reloadAll();
          }}
        />
      )}
    </div>
  );
}
