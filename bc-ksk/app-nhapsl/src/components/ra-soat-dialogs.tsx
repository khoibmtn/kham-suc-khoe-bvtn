'use client';

import { useEffect, useMemo, useState, type FormEvent } from 'react';
import type {
  BuoiTomTat,
  ClsMap,
  DeNghiChuyen,
  HoSoDong,
  KetQuaTimKiem,
  ThemHoSoBody,
  VanDeSo,
} from '@/lib/api-types';
import { CLS, CLS_KEYS, DON_VI, NHAN, type ClsKey } from '@/lib/cls';
import { kiemTraSo, NHAN_TRUONG_SO } from '@/lib/kiem-so';
import { apiRequest } from '@/lib/client/api';
import { formatDate, formatNumber } from '@/lib/client/format';
import { formatViTriKetQua } from './tim-kiem-view';
import { notifyPoolChanged } from './app-shell';
import { useToast } from './toast';

type KhoChungConfirmModalProps = {
  open: boolean;
  hoSo: HoSoDong | null;
  loading: boolean;
  onConfirm: (lyDo: string) => void;
  onCancel: () => void;
};

export function KhoChungConfirmModal({
  open,
  hoSo,
  loading,
  onConfirm,
  onCancel,
}: KhoChungConfirmModalProps) {
  const [lyDo, setLyDo] = useState('');

  useEffect(() => {
    if (!open) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape' && !loading) {
        e.preventDefault();
        onCancel();
      }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, loading, onCancel]);

  if (!open || !hoSo) return null;

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (loading) return;
    onConfirm(lyDo.trim());
  }

  return (
    <div
      className="modal-backdrop"
      role="dialog"
      aria-modal="true"
      aria-labelledby="modal-kho-chung-title"
      onClick={(e) => {
        if (e.target === e.currentTarget && !loading) onCancel();
      }}
    >
      <div className="modal-card">
        <div className="modal-header">
          <h2 id="modal-kho-chung-title" className="modal-title">
            Đưa hồ sơ vào kho chờ chung
          </h2>
        </div>
        <form onSubmit={handleSubmit}>
          <div className="modal-body">
            <p className="modal-text">
              Đối tượng: <strong>{hoSo.ho_ten}</strong> (Năm sinh:{' '}
              <strong className="num">{hoSo.nam_sinh || '—'}</strong> · Mã KCB:{' '}
              <span className="num">{hoSo.ma_kcb || '—'}</span>).
            </p>
            <p className="modal-text mt-2 text-muted">
              Hệ quả: Hồ sơ sẽ rời khỏi danh sách buổi hiện tại và chuyển sang Kho chờ chung để nhân viên phụ trách buổi khác tìm và nhận về. Nhấn Enter để đồng ý ngay.
            </p>
            <div className="form-field mt-2">
              <label htmlFor="kho-chung-ly-do" className="form-label">
                Lý do đưa vào kho chung (tùy chọn)
              </label>
              <input
                id="kho-chung-ly-do"
                type="text"
                autoFocus
                className="form-input form-input-sm"
                placeholder="Ví dụ: Không có hồ sơ giấy trong tập ngày này…"
                value={lyDo}
                onChange={(e) => setLyDo(e.target.value)}
                disabled={loading}
              />
            </div>
          </div>
          <div className="modal-footer">
            <button
              type="button"
              className="btn btn-secondary"
              onClick={onCancel}
              disabled={loading}
            >
              Hủy bỏ
            </button>
            <button type="submit" className="btn btn-primary" disabled={loading}>
              {loading ? 'Đang chuyển…' : 'Đưa vào kho chờ chung'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

type ChuyenBuoiModalProps = {
  open: boolean;
  hoSo: HoSoDong | null;
  currentMaBuoi: string;
  isAdmin?: boolean;
  loading: boolean;
  onConfirm: (targetMaBuoi: string, lyDo: string, targetBuoi: BuoiTomTat) => void;
  onCancel: () => void;
};

export function ChuyenBuoiModal({
  open,
  hoSo,
  currentMaBuoi,
  isAdmin = false,
  loading,
  onConfirm,
  onCancel,
}: ChuyenBuoiModalProps) {
  const [allBuoi, setAllBuoi] = useState<BuoiTomTat[]>([]);
  const [myUserId, setMyUserId] = useState<number | null>(null);
  const [loadingBuoi, setLoadingBuoi] = useState(true);
  const [buoiError, setBuoiError] = useState('');
  const [donVi, setDonVi] = useState<string>('');
  const [selectedMaBuoi, setSelectedMaBuoi] = useState<string>('');
  const [lyDo, setLyDo] = useState<string>('');
  const [formError, setFormError] = useState<string>('');

  useEffect(() => {
    if (!open) return;

    let cancelled = false;
    apiRequest<{ buoi: BuoiTomTat[] }>('/api/buoi?tat_ca=1').then((res) => {
      if (cancelled) return;
      setLoadingBuoi(false);
      if (!res.ok) {
        setBuoiError(res.error);
        return;
      }
      setBuoiError('');
      const raw = res.data.buoi ?? [];
      const currentBuoi = raw.find((b) => b.ma_buoi === currentMaBuoi);
      const list = raw.filter((b) => b.ma_buoi !== currentMaBuoi);
      const detectedMyId =
        currentBuoi?.phu_trach?.id ??
        list.find((b) => b.co_quyen_sua)?.phu_trach?.id ??
        null;
      setMyUserId(detectedMyId);
      setAllBuoi(list);
      setDonVi('');
      const unlocked = list.filter((b) => b.trang_thai !== 'da_xac_nhan');
      const firstOwnUnlocked = unlocked.find((b) => b.co_quyen_sua);
      const first = firstOwnUnlocked ?? unlocked[0] ?? list[0];
      if (first) {
        setSelectedMaBuoi(first.ma_buoi);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [open, currentMaBuoi]);

  const buoiTheoDonVi = useMemo(
    () => (donVi ? allBuoi.filter((b) => b.don_vi === donVi) : allBuoi),
    [allBuoi, donVi],
  );

  const { buoiCuaToi, buoiNguoiKhac } = useMemo(() => {
    const cuaToi: BuoiTomTat[] = [];
    const nguoiKhac: BuoiTomTat[] = [];
    for (const b of buoiTheoDonVi) {
      const laBuoiCuaToi =
        b.co_quyen_sua || (!isAdmin && myUserId !== null && b.phu_trach?.id === myUserId);
      if (laBuoiCuaToi) {
        cuaToi.push(b);
      } else {
        nguoiKhac.push(b);
      }
    }
    return { buoiCuaToi: cuaToi, buoiNguoiKhac: nguoiKhac };
  }, [buoiTheoDonVi, isAdmin, myUserId]);

  const activeTargetBuoi = useMemo(
    () =>
      buoiTheoDonVi.find((b) => b.ma_buoi === selectedMaBuoi) ??
      buoiTheoDonVi.find((b) => b.trang_thai !== 'da_xac_nhan') ??
      buoiTheoDonVi[0] ??
      null,
    [buoiTheoDonVi, selectedMaBuoi],
  );

  const laGuiDeNghi = Boolean(
    !isAdmin && activeTargetBuoi && !activeTargetBuoi.co_quyen_sua,
  );

  useEffect(() => {
    if (!open) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape' && !loading) {
        e.preventDefault();
        onCancel();
      }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, loading, onCancel]);

  if (!open || !hoSo) return null;

  function handleDonViChange(nextDonVi: string) {
    setDonVi(nextDonVi);
    const inUnit = nextDonVi
      ? allBuoi.filter((b) => b.don_vi === nextDonVi)
      : allBuoi;
    const firstUnlocked = inUnit.find((b) => b.trang_thai !== 'da_xac_nhan');
    setSelectedMaBuoi((firstUnlocked ?? inUnit[0])?.ma_buoi ?? '');
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setFormError('');
    if (!activeTargetBuoi) {
      setFormError('Vui lòng chọn buổi khám đích.');
      return;
    }
    if (activeTargetBuoi.trang_thai === 'da_xac_nhan') {
      setFormError('Buổi khám đích đã chốt, không thể chuyển hồ sơ vào.');
      return;
    }
    if (!lyDo.trim()) {
      setFormError('Vui lòng nhập lý do chuyển sang buổi khác (bắt buộc).');
      return;
    }
    onConfirm(activeTargetBuoi.ma_buoi, lyDo.trim(), activeTargetBuoi);
  }

  function renderOptionBuoi(b: BuoiTomTat) {
    const tenPhuTrach = b.phu_trach
      ? `PT: ${b.phu_trach.ho_ten}`
      : 'Chưa phân công';
    const daChot = b.trang_thai === 'da_xac_nhan';
    return (
      <option key={b.ma_buoi} value={b.ma_buoi} disabled={daChot}>
        {formatDate(b.ngay_kham)} · {b.diem_kham || b.ten_don_vi} ({b.ma_buoi}) —{' '}
        {tenPhuTrach}
        {daChot ? ' [Đã chốt]' : ''}
      </option>
    );
  }

  return (
    <div
      className="modal-backdrop"
      role="dialog"
      aria-modal="true"
      aria-labelledby="modal-chuyen-buoi-title"
      onClick={(e) => {
        if (e.target === e.currentTarget && !loading) onCancel();
      }}
    >
      <div className="modal-card">
        <div className="modal-header">
          <h2 id="modal-chuyen-buoi-title" className="modal-title">
            Chuyển hồ sơ sang buổi khám khác
          </h2>
        </div>
        <form onSubmit={handleSubmit}>
          <div className="modal-body">
            <p className="modal-text">
              Hồ sơ: <strong>{hoSo.ho_ten}</strong> (Năm sinh:{' '}
              <strong className="num">{hoSo.nam_sinh || '—'}</strong> · CCCD:{' '}
              <span className="num">{hoSo.cccd || '—'}</span>).
            </p>

            {(buoiError || formError) && (
              <div className="alert alert-error mt-2" role="alert">
                {buoiError || formError}
              </div>
            )}

            {loadingBuoi ? (
              <p className="text-muted mt-2">Đang tải danh sách buổi khám đích…</p>
            ) : (
              <div className="form-stack mt-2">
                <div className="form-field">
                  <label htmlFor="chuyen-don-vi" className="form-label">
                    1. Lọc theo đơn vị đích
                  </label>
                  <select
                    id="chuyen-don-vi"
                    className="form-input form-input-sm"
                    value={donVi}
                    onChange={(e) => handleDonViChange(e.target.value)}
                    disabled={loading}
                  >
                    <option value="">Tất cả đơn vị</option>
                    {(['TN', 'LK', 'VK'] as const).map((code) => (
                      <option key={code} value={code}>
                        {DON_VI[code]} ({code})
                      </option>
                    ))}
                  </select>
                </div>

                <div className="form-field">
                  <label htmlFor="chuyen-ngay-kham" className="form-label">
                    2. Chọn buổi khám đích *
                  </label>
                  <select
                    id="chuyen-ngay-kham"
                    className="form-input form-input-sm"
                    value={activeTargetBuoi?.ma_buoi ?? ''}
                    onChange={(e) => setSelectedMaBuoi(e.target.value)}
                    disabled={loading || buoiTheoDonVi.length === 0}
                  >
                    {buoiCuaToi.length > 0 && (
                      <optgroup label="Buổi của tôi — chuyển ngay">
                        {buoiCuaToi.map(renderOptionBuoi)}
                      </optgroup>
                    )}
                    {buoiNguoiKhac.length > 0 && (
                      <optgroup label="Buổi của người khác — gửi đề nghị, chờ người phụ trách buổi đó chấp nhận">
                        {buoiNguoiKhac.map(renderOptionBuoi)}
                      </optgroup>
                    )}
                  </select>
                </div>

                {activeTargetBuoi && (
                  <div className="target-buoi-info-box">
                    <div>
                      Buổi đích: <strong>{activeTargetBuoi.ten_don_vi}</strong> —{' '}
                      <strong>{formatDate(activeTargetBuoi.ngay_kham)}</strong> (
                      <code>{activeTargetBuoi.ma_buoi}</code>)
                    </div>
                    <div>
                      Người phụ trách buổi đích:{' '}
                      <strong>
                        {activeTargetBuoi.phu_trach
                          ? `${activeTargetBuoi.phu_trach.ho_ten} (${activeTargetBuoi.phu_trach.username})`
                          : 'Chưa phân công'}
                      </strong>
                    </div>
                    {laGuiDeNghi && (
                      <div className="text-muted text-xs mt-1">
                        Buổi này do{' '}
                        <strong>
                          {activeTargetBuoi.phu_trach?.ho_ten ?? 'người khác'}
                        </strong>{' '}
                        phụ trách — hệ thống sẽ gửi đề nghị chuyển và chờ người phụ
                        trách buổi đó chấp nhận.
                      </div>
                    )}
                  </div>
                )}

                <div className="form-field">
                  <label htmlFor="chuyen-ly-do" className="form-label">
                    3. Lý do chuyển sang buổi khác (bắt buộc) *
                  </label>
                  <input
                    id="chuyen-ly-do"
                    type="text"
                    required
                    className="form-input form-input-sm"
                    placeholder="Ví dụ: Hồ sơ giấy ghi ngày khám 14/09…"
                    value={lyDo}
                    onChange={(e) => setLyDo(e.target.value)}
                    disabled={loading}
                  />
                </div>
              </div>
            )}
          </div>
          <div className="modal-footer">
            <button
              type="button"
              className="btn btn-secondary"
              onClick={onCancel}
              disabled={loading}
            >
              Hủy bỏ
            </button>
            <button
              type="submit"
              className="btn btn-primary"
              disabled={
                loading ||
                loadingBuoi ||
                !activeTargetBuoi ||
                activeTargetBuoi.trang_thai === 'da_xac_nhan'
              }
            >
              {loading
                ? laGuiDeNghi
                  ? 'Đang gửi đề nghị…'
                  : 'Đang chuyển…'
                : laGuiDeNghi
                  ? 'Gửi đề nghị'
                  : 'Chuyển sang buổi đã chọn'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

type ThemHoSoModalProps = {
  open: boolean;
  maBuoi: string;
  tenBuoi: string;
  onClose: () => void;
  onAdded: (hoSo: HoSoDong, buoi: BuoiTomTat) => void;
  onReceivedDuplicate: (hoSoId: number, buoi: BuoiTomTat | null) => void;
  onSelectExistingInBuoi: (hoSoId: number) => void;
};

const MAC_DINH_CLS: ClsMap = Object.fromEntries(
  CLS_KEYS.map((k) => [k, 0]),
) as ClsMap;

export function ThemHoSoModal({
  open,
  maBuoi,
  tenBuoi,
  onClose,
  onAdded,
  onReceivedDuplicate,
  onSelectExistingInBuoi,
}: ThemHoSoModalProps) {
  const { showToast } = useToast();

  const [maKcb, setMaKcb] = useState('');
  const [hoTen, setHoTen] = useState('');
  const [gioiTinh, setGioiTinh] = useState<'Nam' | 'Nữ'>('Nam');
  const [namSinh, setNamSinh] = useState('');
  const [cccd, setCccd] = useState('');
  const [soDt, setSoDt] = useState('');
  const [diaChi, setDiaChi] = useState('');
  const [cls, setCls] = useState<ClsMap>({ ...MAC_DINH_CLS });
  const [ghiChu, setGhiChu] = useState('');

  const [trungList, setTrungList] = useState<KetQuaTimKiem[]>([]);
  const [checkingTrung, setCheckingTrung] = useState(false);
  const [vanTaoMoi, setVanTaoMoi] = useState(false);
  const [lyDoTaoMoi, setLyDoTaoMoi] = useState('');

  const [deNghiTargetId, setDeNghiTargetId] = useState<number | null>(null);
  const [deNghiLyDo, setDeNghiLyDo] = useState('');
  const [busyActionId, setBusyActionId] = useState<number | null>(null);

  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState('');
  const [serverVanDeSo, setServerVanDeSo] = useState<VanDeSo[]>([]);
  const [canhBaoConfirm, setCanhBaoConfirm] = useState<VanDeSo[] | null>(null);

  const parsedNamSinhLive = useMemo(() => {
    const n = Number(namSinh);
    return namSinh.trim() !== '' && Number.isInteger(n) ? n : null;
  }, [namSinh]);

  const liveVanDeSo = useMemo(
    () =>
      kiemTraSo({
        cccd,
        ma_kcb: maKcb,
        so_dt: soDt,
        nam_sinh: parsedNamSinhLive,
        gioi_tinh: gioiTinh,
      }),
    [cccd, maKcb, soDt, parsedNamSinhLive, gioiTinh],
  );

  const mergedVanDeSo = useMemo(() => {
    const map = new Map<string, VanDeSo>();
    for (const v of liveVanDeSo) {
      map.set(`${v.truong}:${v.ma}:${v.thong_diep}`, v);
    }
    for (const v of serverVanDeSo) {
      map.set(`${v.truong}:${v.ma}:${v.thong_diep}`, v);
    }
    return Array.from(map.values());
  }, [liveVanDeSo, serverVanDeSo]);

  const loiHienTai = useMemo(
    () => mergedVanDeSo.filter((v) => v.muc === 'loi'),
    [mergedVanDeSo],
  );

  const lyDoKhoaThem =
    loiHienTai.length > 0
      ? `Không thể thêm: ${loiHienTai.map((v) => v.thong_diep).join('; ')}`
      : '';

  const maKcbIssues = useMemo(
    () => mergedVanDeSo.filter((v) => v.truong === 'ma_kcb'),
    [mergedVanDeSo],
  );
  const cccdIssues = useMemo(
    () => mergedVanDeSo.filter((v) => v.truong === 'cccd'),
    [mergedVanDeSo],
  );
  const soDtIssues = useMemo(
    () => mergedVanDeSo.filter((v) => v.truong === 'so_dt'),
    [mergedVanDeSo],
  );

  function inputStatusClass(issues: VanDeSo[]): string {
    if (issues.some((v) => v.muc === 'loi')) return 'form-input-error';
    if (issues.some((v) => v.muc === 'canh_bao')) return 'form-input-warning';
    return '';
  }

  function renderFieldMessages(issues: VanDeSo[]) {
    if (issues.length === 0) return null;
    return (
      <div className="field-msg-list">
        {issues.map((v, idx) => (
          <div
            key={`${v.ma}-${idx}`}
            className={
              v.muc === 'loi'
                ? 'field-msg field-msg-error'
                : 'field-msg field-msg-warning'
            }
            role={v.muc === 'loi' ? 'alert' : 'status'}
          >
            <span aria-hidden="true">{v.muc === 'loi' ? '✕ ' : '⚠ '}</span>
            <span>{v.thong_diep}</span>
          </div>
        ))}
      </div>
    );
  }

  useEffect(() => {
    if (!open) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape' && !submitting && busyActionId === null) {
        e.preventDefault();
        onClose();
      }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, submitting, busyActionId, onClose]);

  if (!open) return null;

  async function runKiemTrung() {
    const cleanCccd = cccd.trim();
    const cleanMaKcb = maKcb.trim();
    const cleanHoTen = hoTen.trim();
    const parsedNamSinh = Number(namSinh);
    const validNamSinh =
      Number.isInteger(parsedNamSinh) &&
      parsedNamSinh >= 1900 &&
      parsedNamSinh <= 2026;

    if (!cleanCccd && !cleanMaKcb && !(cleanHoTen && validNamSinh)) {
      return;
    }

    const payload: {
      ma_kcb?: string;
      cccd?: string;
      ho_ten?: string;
      nam_sinh?: number;
    } = {};
    if (cleanMaKcb) payload.ma_kcb = cleanMaKcb;
    if (cleanCccd) payload.cccd = cleanCccd;
    if (cleanHoTen && validNamSinh) {
      payload.ho_ten = cleanHoTen;
      payload.nam_sinh = parsedNamSinh;
    }

    setCheckingTrung(true);
    const res = await apiRequest<{ trung: KetQuaTimKiem[] }>(
      '/api/ho-so/kiem-trung',
      {
        method: 'POST',
        body: JSON.stringify(payload),
      },
    );
    setCheckingTrung(false);

    if (res.ok) {
      const ds = res.data.trung ?? [];
      setTrungList(ds);
      if (ds.length === 0) {
        setVanTaoMoi(false);
        setLyDoTaoMoi('');
      }
    }
  }

  function toggleClsField(key: ClsKey) {
    setCls((prev) => ({
      ...prev,
      [key]: prev[key] === 1 ? 0 : 1,
    }));
  }

  async function handleNhanVeTuTrung(item: KetQuaTimKiem) {
    setBusyActionId(item.id);
    setFormError('');
    const res = await apiRequest<{
      ho_so: KetQuaTimKiem;
      buoi_cu: BuoiTomTat | null;
      buoi_moi: BuoiTomTat | null;
    }>(`/api/ho-so/${item.id}/nhan-ve`, {
      method: 'POST',
      body: JSON.stringify({
        version: item.version,
        buoi: maBuoi,
      }),
    });
    setBusyActionId(null);

    if (!res.ok) {
      setFormError(res.error);
      return;
    }

    notifyPoolChanged();
    showToast('Đã nhận hồ sơ trùng về buổi khám này', 'success');
    onReceivedDuplicate(item.id, res.data.buoi_moi);
  }

  async function handleGuiDeNghiTuTrung(item: KetQuaTimKiem) {
    const cleanLyDo = deNghiLyDo.trim();
    if (!cleanLyDo) {
      setFormError('Vui lòng nhập lý do đề nghị chuyển hồ sơ về buổi này.');
      return;
    }

    setBusyActionId(item.id);
    setFormError('');
    const res = await apiRequest<{ de_nghi: DeNghiChuyen }>(
      '/api/de-nghi-chuyen',
      {
        method: 'POST',
        body: JSON.stringify({
          ho_so_id: item.id,
          den_buoi: maBuoi,
          ly_do: cleanLyDo,
        }),
      },
    );
    setBusyActionId(null);

    if (!res.ok) {
      setFormError(res.error);
      return;
    }

    notifyPoolChanged();
    showToast(
      res.data.de_nghi.trang_thai === 'dong_y'
        ? 'Đã chuyển hồ sơ về buổi này'
        : 'Đã gửi đề nghị chuyển hồ sơ về buổi này',
      'success',
    );
    onClose();
  }

  async function submitThemHoSo(boQuaCanhBaoSo: boolean) {
    setFormError('');

    const cleanHoTen = hoTen.trim();
    if (!cleanHoTen) {
      setFormError('Họ và tên không được để trống.');
      return;
    }

    const parsedNamSinh = Number(namSinh);
    if (
      !Number.isInteger(parsedNamSinh) ||
      parsedNamSinh < 1900 ||
      parsedNamSinh > 2026
    ) {
      setFormError('Năm sinh phải là số nguyên từ 1900 đến 2026.');
      return;
    }

    if (loiHienTai.length > 0) {
      setFormError(loiHienTai[0].thong_diep);
      return;
    }

    if (trungList.length > 0) {
      if (!vanTaoMoi) {
        setFormError(
          'Phát hiện hồ sơ trùng trên hệ thống. Hãy nhận hồ sơ đó về buổi, hoặc tích "Vẫn tạo mới — người khác" kèm lý do.',
        );
        return;
      }
      if (!lyDoTaoMoi.trim()) {
        setFormError(
          'Bắt buộc nhập lý do tạo mới khi hệ thống cảnh báo có hồ sơ trùng.',
        );
        return;
      }
    }

    const body: ThemHoSoBody = {
      ma_kcb: maKcb.trim() || undefined,
      ho_ten: cleanHoTen,
      gioi_tinh: gioiTinh,
      nam_sinh: parsedNamSinh,
      cccd: cccd.trim() || undefined,
      so_dt: soDt.trim() || undefined,
      dia_chi_chi_tiet: diaChi.trim() || undefined,
      cls,
      ghi_chu: ghiChu.trim() || undefined,
      ly_do_tao_moi:
        trungList.length > 0 && vanTaoMoi ? lyDoTaoMoi.trim() : undefined,
      ...(boQuaCanhBaoSo ? { bo_qua_canh_bao_so: true } : {}),
    };

    setSubmitting(true);
    const res = await apiRequest<{ ho_so: HoSoDong; buoi: BuoiTomTat }>(
      `/api/buoi/${encodeURIComponent(maBuoi)}/ho-so`,
      {
        method: 'POST',
        body: JSON.stringify(body),
      },
    );
    setSubmitting(false);

    if (!res.ok) {
      if (res.status === 422 && res.vanDeSo && res.vanDeSo.length > 0) {
        setServerVanDeSo(res.vanDeSo);
        setCanhBaoConfirm(res.vanDeSo);
        return;
      }
      if (res.status === 400 && res.vanDeSo && res.vanDeSo.length > 0) {
        setServerVanDeSo(res.vanDeSo);
        setCanhBaoConfirm(null);
        return;
      }
      setCanhBaoConfirm(null);
      if (res.status === 409 && res.conflictTrung) {
        setTrungList(res.conflictTrung);
        setFormError(
          'Hệ thống phát hiện hồ sơ trùng. Vui lòng kiểm tra danh sách trùng bên dưới.',
        );
        return;
      }
      setFormError(res.error);
      return;
    }

    setCanhBaoConfirm(null);
    setServerVanDeSo([]);
    showToast('Đã thêm hồ sơ mới (tự động xác nhận có giấy)', 'success');
    onAdded(res.data.ho_so, res.data.buoi);
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    await submitThemHoSo(false);
  }

  function handleSuaLaiCanhBao() {
    const first = canhBaoConfirm?.[0];
    setCanhBaoConfirm(null);
    if (!first) return;
    const idMap: Record<VanDeSo['truong'], string> = {
      ma_kcb: 'them-ma-kcb',
      cccd: 'them-cccd',
      so_dt: 'them-so-dt',
    };
    const el = document.getElementById(idMap[first.truong]);
    if (el instanceof HTMLElement) {
      el.focus();
    }
  }

  return (
    <div
      className="modal-backdrop"
      role="dialog"
      aria-modal="true"
      aria-labelledby="modal-them-ho-so-title"
      onClick={(e) => {
        if (e.target === e.currentTarget && !submitting) onClose();
      }}
    >
      <div className="modal-card modal-card-lg">
        <div className="modal-header">
          <h2 id="modal-them-ho-so-title" className="modal-title">
            Thêm hồ sơ mới vào buổi khám ({tenBuoi})
          </h2>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="modal-body modal-body-scroll">
            {formError && (
              <div className="alert alert-error" role="alert">
                {formError}
              </div>
            )}

            <div className="detail-row-3col">
              <div className="form-field">
                <label htmlFor="them-ma-kcb" className="form-label">
                  Mã KCB (không bắt buộc)
                </label>
                <input
                  id="them-ma-kcb"
                  type="text"
                  inputMode="numeric"
                  className={`form-input form-input-sm num ${inputStatusClass(maKcbIssues)}`}
                  aria-invalid={maKcbIssues.some((v) => v.muc === 'loi') || undefined}
                  placeholder="Để trống nếu chưa có"
                  value={maKcb}
                  onChange={(e) => {
                    setServerVanDeSo((prev) => prev.filter((v) => v.truong !== 'ma_kcb'));
                    setMaKcb(e.target.value);
                  }}
                  onBlur={() => void runKiemTrung()}
                  disabled={submitting}
                />
                {renderFieldMessages(maKcbIssues)}
              </div>

              <div className="form-field">
                <label htmlFor="them-cccd" className="form-label">
                  Số CCCD / CMND (9 hoặc 12 số)
                </label>
                <input
                  id="them-cccd"
                  type="text"
                  inputMode="numeric"
                  className={`form-input form-input-sm num ${inputStatusClass(cccdIssues)}`}
                  aria-invalid={cccdIssues.some((v) => v.muc === 'loi') || undefined}
                  placeholder="Nhập 9 hoặc 12 chữ số"
                  value={cccd}
                  onChange={(e) => {
                    setServerVanDeSo((prev) => prev.filter((v) => v.truong !== 'cccd'));
                    setCccd(e.target.value);
                  }}
                  onBlur={() => void runKiemTrung()}
                  disabled={submitting}
                />
                {renderFieldMessages(cccdIssues)}
              </div>

              <div className="form-field">
                <label htmlFor="them-so-dt" className="form-label">
                  Số điện thoại (SĐT)
                </label>
                <input
                  id="them-so-dt"
                  type="text"
                  inputMode="numeric"
                  className={`form-input form-input-sm num ${inputStatusClass(soDtIssues)}`}
                  aria-invalid={soDtIssues.some((v) => v.muc === 'loi') || undefined}
                  placeholder="Nhập 10 chữ số bắt đầu bằng 0"
                  value={soDt}
                  onChange={(e) => {
                    setServerVanDeSo((prev) => prev.filter((v) => v.truong !== 'so_dt'));
                    setSoDt(e.target.value);
                  }}
                  disabled={submitting}
                />
                {renderFieldMessages(soDtIssues)}
              </div>
            </div>

            <div className="detail-row-3col mt-2">
              <div className="form-field">
                <label htmlFor="them-ho-ten" className="form-label">
                  Họ và tên *
                </label>
                <input
                  id="them-ho-ten"
                  type="text"
                  required
                  className="form-input form-input-sm"
                  placeholder="Nhập họ và tên trên phiếu giấy"
                  value={hoTen}
                  onChange={(e) => setHoTen(e.target.value)}
                  onBlur={() => void runKiemTrung()}
                  disabled={submitting}
                />
              </div>

              <div className="form-field">
                <label htmlFor="them-gioi-tinh" className="form-label">
                  Giới tính *
                </label>
                <select
                  id="them-gioi-tinh"
                  className="form-input form-input-sm"
                  value={gioiTinh}
                  onChange={(e) => setGioiTinh(e.target.value as 'Nam' | 'Nữ')}
                  disabled={submitting}
                >
                  <option value="Nam">Nam</option>
                  <option value="Nữ">Nữ</option>
                </select>
              </div>

              <div className="form-field">
                <label htmlFor="them-nam-sinh" className="form-label">
                  Năm sinh *
                </label>
                <input
                  id="them-nam-sinh"
                  type="number"
                  required
                  min={1900}
                  max={2026}
                  className="form-input form-input-sm num"
                  placeholder="1900–2026"
                  value={namSinh}
                  onChange={(e) => setNamSinh(e.target.value)}
                  onBlur={() => void runKiemTrung()}
                  disabled={submitting}
                />
              </div>
            </div>

            <div className="form-field mt-2">
              <label htmlFor="them-dia-chi" className="form-label">
                Địa chỉ chi tiết (tổ dân phố, thôn/xóm)
              </label>
              <input
                id="them-dia-chi"
                type="text"
                className="form-input form-input-sm"
                placeholder="Ví dụ: TDP 3…"
                value={diaChi}
                onChange={(e) => setDiaChi(e.target.value)}
                disabled={submitting}
              />
            </div>

            <div className="form-field mt-2">
              <span className="form-label">
                8 cận lâm sàng (bấm để chọn Có làm / Không làm theo hồ sơ giấy)
              </span>
              <div className="cls-add-grid">
                {CLS.map((c) => {
                  const active = cls[c.key] === 1;
                  return (
                    <button
                      key={c.key}
                      type="button"
                      className={`cls-toggle-card ${active ? 'active' : ''}`}
                      aria-pressed={active}
                      onClick={() => toggleClsField(c.key)}
                      disabled={submitting}
                    >
                      <strong>{c.nhan}</strong>
                      <span>{active ? '✓ Có làm' : 'Không'}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="form-field mt-2">
              <label htmlFor="them-ghi-chu" className="form-label">
                Ghi chú
              </label>
              <input
                id="them-ghi-chu"
                type="text"
                className="form-input form-input-sm"
                placeholder="Ghi chú bổ sung (nếu có)"
                value={ghiChu}
                onChange={(e) => setGhiChu(e.target.value)}
                disabled={submitting}
              />
            </div>

            {checkingTrung && (
              <p className="text-muted mt-2">Đang kiểm tra hồ sơ trùng trên toàn hệ thống…</p>
            )}

            {trungList.length > 0 && (
              <div className="dup-warning-box mt-2" role="region" aria-label="Cảnh báo hồ sơ trùng">
                <div className="dup-warning-title">
                  Phát hiện {formatNumber(trungList.length)} hồ sơ trùng trên hệ thống:
                </div>
                <ul className="dup-list">
                  {trungList.map((item) => {
                    const isPool =
                      item.vi_tri === 'kho_chung' ||
                      (item.vi_tri === 'kho_ca_nhan' && item.co_quyen_sua);
                    const isSameBuoi =
                      item.vi_tri === 'buoi' && item.buoi?.ma_buoi === maBuoi;
                    const isOtherBuoi =
                      item.vi_tri === 'buoi' && item.buoi?.ma_buoi !== maBuoi;

                    return (
                      <li key={item.id} className="dup-item">
                        <div className="dup-item-main">
                          <div>
                            <strong>{item.ho_ten}</strong> · {item.gioi_tinh || '—'} ·{' '}
                            <span className="num">{item.nam_sinh}</span> · CCCD:{' '}
                            <span className="num">{item.cccd || '—'}</span> · Mã KCB:{' '}
                            <span className="num">{item.ma_kcb || '—'}</span>
                          </div>
                          <div className="text-muted">
                            Vị trí hiện tại: <strong>{formatViTriKetQua(item)}</strong>
                          </div>
                        </div>

                        <div className="dup-item-actions">
                          {isPool && (
                            <button
                              type="button"
                              className="btn btn-primary btn-xs"
                              disabled={busyActionId === item.id}
                              onClick={() => void handleNhanVeTuTrung(item)}
                            >
                              {busyActionId === item.id
                                ? 'Đang nhận…'
                                : 'Nhận hồ sơ này về buổi'}
                            </button>
                          )}

                          {isSameBuoi && (
                            <button
                              type="button"
                              className="btn btn-secondary btn-xs"
                              onClick={() => {
                                onSelectExistingInBuoi(item.id);
                                onClose();
                              }}
                            >
                              Đang ở trong buổi này — Chọn dòng
                            </button>
                          )}

                          {isOtherBuoi && (
                            <button
                              type="button"
                              className="btn btn-secondary btn-xs"
                              onClick={() => {
                                setDeNghiTargetId((prev) =>
                                  prev === item.id ? null : item.id,
                                );
                                setDeNghiLyDo('');
                              }}
                            >
                              Đề nghị chuyển về buổi này
                            </button>
                          )}
                        </div>

                        {deNghiTargetId === item.id && (
                          <div className="dup-denghi-form">
                            <input
                              type="text"
                              className="form-input form-input-xs"
                              placeholder="Nhập lý do đề nghị chuyển về buổi này *"
                              value={deNghiLyDo}
                              onChange={(e) => setDeNghiLyDo(e.target.value)}
                            />
                            <button
                              type="button"
                              className="btn btn-primary btn-xs"
                              disabled={busyActionId === item.id}
                              onClick={() => void handleGuiDeNghiTuTrung(item)}
                            >
                              {busyActionId === item.id
                                ? 'Đang gửi…'
                                : 'Gửi đề nghị'}
                            </button>
                          </div>
                        )}
                      </li>
                    );
                  })}
                </ul>

                <div className="dup-override-box">
                  <label className="checkbox-inline-label">
                    <input
                      type="checkbox"
                      checked={vanTaoMoi}
                      onChange={(e) => setVanTaoMoi(e.target.checked)}
                    />
                    <span>Vẫn tạo mới — người khác (chắc chắn không phải hồ sơ trên)</span>
                  </label>

                  {vanTaoMoi && (
                    <div className="form-field mt-2">
                      <label htmlFor="them-ly-do-tao-moi" className="form-label">
                        Lý do vẫn tạo hồ sơ mới (bắt buộc) *
                      </label>
                      <input
                        id="them-ly-do-tao-moi"
                        type="text"
                        required
                        className="form-input form-input-sm"
                        placeholder="Giải thích vì sao đây là người khác…"
                        value={lyDoTaoMoi}
                        onChange={(e) => setLyDoTaoMoi(e.target.value)}
                      />
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

          {lyDoKhoaThem && (
            <div className="save-disabled-reason modal-save-disabled-reason" role="status">
              {lyDoKhoaThem}
            </div>
          )}

          <div className="modal-footer">
            <button
              type="button"
              className="btn btn-secondary"
              onClick={onClose}
              disabled={submitting}
            >
              Đóng
            </button>
            <button
              type="submit"
              className="btn btn-primary"
              disabled={
                submitting ||
                loiHienTai.length > 0 ||
                (trungList.length > 0 && (!vanTaoMoi || !lyDoTaoMoi.trim()))
              }
              title={lyDoKhoaThem || undefined}
            >
              {submitting ? 'Đang tạo…' : 'Thêm hồ sơ'}
            </button>
          </div>
        </form>
      </div>

      {canhBaoConfirm && canhBaoConfirm.length > 0 && (
        <div
          className="modal-backdrop"
          role="alertdialog"
          aria-modal="true"
          aria-labelledby="modal-them-canh-bao-so-title"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="modal-card">
            <div className="modal-header">
              <h2 id="modal-them-canh-bao-so-title" className="modal-title">
                Cảnh báo số có thể bị nhập nhầm
              </h2>
            </div>
            <div className="modal-body">
              <p className="modal-text">
                Hệ thống phát hiện một số điểm bất thường ở số vừa nhập:
              </p>
              <ul className="canh-bao-so-confirm-list">
                {canhBaoConfirm.map((v, idx) => (
                  <li key={`${v.ma}-${idx}`} className="canh-bao-so-confirm-item">
                    <strong>{NHAN_TRUONG_SO[v.truong]}:</strong> {v.thong_diep}
                  </li>
                ))}
              </ul>
              <p className="text-muted text-xs mt-2">
                Nếu trên hồ sơ giấy đúng là như vậy, bấm <strong>&quot;Vẫn lưu&quot;</strong> để lưu và ghi nhận vào nhật ký. Nếu gõ nhầm, bấm <strong>&quot;Sửa lại&quot;</strong>.
              </p>
            </div>
            <div className="modal-footer">
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={handleSuaLaiCanhBao}
                disabled={submitting}
              >
                Sửa lại
              </button>
              <button
                type="button"
                className="btn btn-primary btn-sm"
                onClick={() => void submitThemHoSo(true)}
                disabled={submitting}
              >
                {submitting ? 'Đang lưu…' : 'Vẫn lưu'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

type XacNhanBuoiModalProps = {
  open: boolean;
  buoi: BuoiTomTat;
  loading: boolean;
  onConfirm: (giaiTrinh: string) => void;
  onCancel: () => void;
};

export function XacNhanBuoiModal({
  open,
  buoi,
  loading,
  onConfirm,
  onCancel,
}: XacNhanBuoiModalProps) {
  const [giaiTrinh, setGiaiTrinh] = useState(buoi.giai_trinh ?? '');
  const [error, setError] = useState('');

  const lechSoDoan = buoi.hien_co !== buoi.so_doan_tong;

  useEffect(() => {
    if (!open) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape' && !loading) {
        e.preventDefault();
        onCancel();
      }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, loading, onCancel]);

  if (!open) return null;

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');
    if (lechSoDoan && !giaiTrinh.trim()) {
      setError(
        `Số hồ sơ trong danh sách (${formatNumber(buoi.hien_co)}) lệch so với ${NHAN.SO_DOAN} (${formatNumber(buoi.so_doan_tong)}). Vui lòng nhập giải trình trước khi khóa danh sách.`,
      );
      return;
    }
    onConfirm(giaiTrinh.trim());
  }

  return (
    <div
      className="modal-backdrop"
      role="dialog"
      aria-modal="true"
      aria-labelledby="modal-xac-nhan-buoi-title"
      onClick={(e) => {
        if (e.target === e.currentTarget && !loading) onCancel();
      }}
    >
      <div className="modal-card">
        <div className="modal-header">
          <h2 id="modal-xac-nhan-buoi-title" className="modal-title">
            Xác nhận rà soát xong danh sách buổi khám
          </h2>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="modal-body">
            <p className="modal-text">
              Buổi khám: <strong>{buoi.ten_don_vi}</strong> — Ngày{' '}
              <strong>{formatDate(buoi.ngay_kham)}</strong> (
              <code>{buoi.ma_buoi}</code>)
            </p>

            <div className="confirm-buoi-summary-grid mt-2">
              <div className="confirm-buoi-stat">
                <span>{NHAN.SO_DOAN}:</span>
                <strong className="num">{formatNumber(buoi.so_doan_tong)}</strong>
              </div>
              <div className="confirm-buoi-stat">
                <span>Trong danh sách:</span>
                <strong className="num">{formatNumber(buoi.hien_co)}</strong>
              </div>
              <div className="confirm-buoi-stat">
                <span>Đã xác nhận:</span>
                <strong className="num text-success">
                  {formatNumber(buoi.da_xac_nhan)}
                </strong>
              </div>
              <div className="confirm-buoi-stat">
                <span>Thừa:</span>
                <strong className="num">{formatNumber(buoi.thua)}</strong>
              </div>
              <div className="confirm-buoi-stat">
                <span>Thiếu:</span>
                <strong className="num">{formatNumber(buoi.thieu)}</strong>
              </div>
            </div>

            {lechSoDoan && (
              <div className="alert alert-warning mt-2" role="status">
                Số hồ sơ trong danh sách (<strong>{formatNumber(buoi.hien_co)}</strong>) đang lệch so với{' '}
                {NHAN.SO_DOAN} (<strong>{formatNumber(buoi.so_doan_tong)}</strong>): Thừa{' '}
                <strong>{formatNumber(buoi.thua)}</strong>, Thiếu{' '}
                <strong>{formatNumber(buoi.thieu)}</strong>. Bắt buộc ghi rõ giải trình bên dưới.
              </div>
            )}

            {error && (
              <div className="alert alert-error mt-2" role="alert">
                {error}
              </div>
            )}

            <div className="form-field mt-2">
              <label htmlFor="xac-nhan-giai-trinh" className="form-label">
                Giải trình {lechSoDoan ? '(bắt buộc) *' : '(tùy chọn)'}
              </label>
              <textarea
                id="xac-nhan-giai-trinh"
                rows={3}
                required={lechSoDoan}
                className="form-textarea"
                placeholder={
                  lechSoDoan
                    ? `Giải trình nguyên nhân chênh lệch với ${NHAN.SO_DOAN}…`
                    : 'Ghi chú thêm khi chốt danh sách (nếu có)…'
                }
                value={giaiTrinh}
                onChange={(e) => setGiaiTrinh(e.target.value)}
                disabled={loading}
              />
            </div>

            <p className="modal-text mt-2 text-muted">
              Hệ quả: Sau khi xác nhận, danh sách buổi khám sẽ bị khóa (không thể sửa thông tin, thêm mới hay chuyển hồ sơ vào/ra).
            </p>
          </div>

          <div className="modal-footer">
            <button
              type="button"
              className="btn btn-secondary"
              onClick={onCancel}
              disabled={loading}
            >
              Hủy bỏ
            </button>
            <button type="submit" className="btn btn-primary" disabled={loading}>
              {loading ? 'Đang khóa…' : 'Xác nhận và khóa danh sách'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

type MoKhoaBuoiModalProps = {
  open: boolean;
  buoi: BuoiTomTat;
  loading: boolean;
  onConfirm: (lyDo: string) => void;
  onCancel: () => void;
};

export function MoKhoaBuoiModal({
  open,
  buoi,
  loading,
  onConfirm,
  onCancel,
}: MoKhoaBuoiModalProps) {
  const [lyDo, setLyDo] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape' && !loading) {
        e.preventDefault();
        onCancel();
      }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, loading, onCancel]);

  if (!open) return null;

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');
    if (!lyDo.trim()) {
      setError('Vui lòng nhập lý do hủy xác nhận (bắt buộc).');
      return;
    }
    onConfirm(lyDo.trim());
  }

  return (
    <div
      className="modal-backdrop"
      role="dialog"
      aria-modal="true"
      aria-labelledby="modal-mo-khoa-buoi-title"
      onClick={(e) => {
        if (e.target === e.currentTarget && !loading) onCancel();
      }}
    >
      <div className="modal-card">
        <div className="modal-header">
          <h2 id="modal-mo-khoa-buoi-title" className="modal-title">
            Hủy xác nhận danh sách buổi khám ({buoi.ma_buoi})
          </h2>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="modal-body">
            <p className="modal-text">
              Đối tượng: Buổi khám <strong>{buoi.ten_don_vi}</strong> — Ngày{' '}
              <strong>{formatDate(buoi.ngay_kham)}</strong>.
            </p>
            <p className="modal-text mt-2 text-muted">
              Hệ quả: Danh sách trở lại trạng thái đang rà soát, sửa được hồ sơ như trước; giải trình chênh lệch (nếu có) bị xóa. Các hồ sơ đã xác nhận vẫn giữ dấu xác nhận. Sửa xong cần bấm lại &ldquo;Xác nhận rà soát xong danh sách&rdquo;. Thao tác được ghi vào nhật ký.
            </p>

            {error && (
              <div className="alert alert-error mt-2" role="alert">
                {error}
              </div>
            )}

            <div className="form-field mt-2">
              <label htmlFor="mo-khoa-ly-do" className="form-label">
                Lý do hủy xác nhận (bắt buộc) *
              </label>
              <input
                id="mo-khoa-ly-do"
                type="text"
                required
                autoFocus
                className="form-input form-input-sm"
                placeholder="Ví dụ: Bổ sung hồ sơ giấy mới tìm thấy…"
                value={lyDo}
                onChange={(e) => setLyDo(e.target.value)}
                disabled={loading}
              />
            </div>
          </div>

          <div className="modal-footer">
            <button
              type="button"
              className="btn btn-secondary"
              onClick={onCancel}
              disabled={loading}
            >
              Hủy bỏ
            </button>
            <button type="submit" className="btn btn-danger" disabled={loading}>
              {loading ? 'Đang hủy xác nhận…' : 'Hủy xác nhận danh sách'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
