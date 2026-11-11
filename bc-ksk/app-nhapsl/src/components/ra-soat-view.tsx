'use client';

import {
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
} from 'react';
import Link from 'next/link';
import {
  HANH_DONG_NHAN,
  type BuoiTomTat,
  type HoSoDong,
  type HoSoSuaBody,
  type NhatKyDong,
} from '@/lib/api-types';
import { CANH_BAO_NHAN, CLS, type ClsKey } from '@/lib/cls';
import { apiRequest } from '@/lib/client/api';
import {
  formatDate,
  formatDateTime,
  formatHisTimestamp,
  formatNumber,
  formatPercent,
  getTruongNhan,
  TRANG_THAI_BUOI_NHAN,
} from '@/lib/client/format';
import { useToast } from './toast';

type RaSoatViewProps = {
  maBuoi: string;
};

type HoSoRowProps = {
  stt: number;
  hoSo: HoSoDong;
  isSelected: boolean;
  canEdit: boolean;
  rowBusy: boolean;
  onSelectRow: (id: number) => void;
  onOpenDetail: (id: number) => void;
  onToggleCls: (hoSo: HoSoDong, key: ClsKey) => void;
  onToggleXacNhan: (hoSo: HoSoDong) => void;
};

const HoSoRow = memo(function HoSoRow({
  stt,
  hoSo,
  isSelected,
  canEdit,
  rowBusy,
  onSelectRow,
  onOpenDetail,
  onToggleCls,
  onToggleXacNhan,
}: HoSoRowProps) {
  const rowClassNames = [
    'hoso-row',
    hoSo.da_xac_nhan ? 'hoso-row-confirmed' : '',
    isSelected ? 'hoso-row-selected' : '',
  ]
    .filter(Boolean)
    .join(' ');

  const hisTimeShort = formatHisTimestamp(hoSo.ngay_gio_dang_ky_his);

  return (
    <tr
      data-hoso-id={hoSo.id}
      className={rowClassNames}
      onClick={() => onSelectRow(hoSo.id)}
      onDoubleClick={() => onOpenDetail(hoSo.id)}
      title="Nhấp đúp hoặc Enter để mở chi tiết"
    >
      <td className="num-col col-stt">{stt}</td>
      <td className="col-makcb">
        <span className="num">{hoSo.ma_kcb || '—'}</span>
        {hoSo.src && hoSo.src.ma_kcb !== hoSo.ma_kcb && (
          <span className="diff-dot" title={`Gốc: ${hoSo.src.ma_kcb || '(trống)'}`}>
            *
          </span>
        )}
      </td>
      <td className="col-hoten">
        <div className="hoten-main-line">
          <strong className="hoten-text">{hoSo.ho_ten}</strong>
          {hoSo.sua_nhan_than && (
            <span className="chip chip-edited" title="Đã sửa thông tin nhân thân theo hồ sơ giấy">
              Đã sửa
            </span>
          )}
          {hoSo.nguon === 'them_tay' && (
            <span className="chip chip-manual">Thêm tay</span>
          )}
        </div>
        <div className="hoten-sub-line">
          <span>
            ĐK HIS {hisTimeShort || '—'} · TT KSK: {hoSo.co_tt_ksk === 1 ? 'Có' : 'Không'}
          </span>
          {hoSo.canh_bao &&
            hoSo.canh_bao.length > 0 &&
            hoSo.canh_bao.map((code) => (
              <span key={code} className="chip chip-warning">
                {CANH_BAO_NHAN[code] ?? code}
              </span>
            ))}
        </div>
      </td>
      <td className="col-gt">{hoSo.gioi_tinh || 'Chưa rõ'}</td>
      <td className="num-col col-namsinh">{hoSo.nam_sinh || '—'}</td>
      <td className="col-cccd num">{hoSo.cccd || '—'}</td>
      <td className="col-diachi">{hoSo.dia_chi_chi_tiet || '—'}</td>

      {CLS.map((c, idx) => {
        const val = hoSo.cls[c.key] === 1 ? 1 : 0;
        const srcVal = hoSo.src ? hoSo.src.cls[c.key] : val;
        const isDiff = hoSo.src !== null && srcVal !== val;
        const tooltipParts = [
          `${idx + 1}. ${c.ten}: ${val === 1 ? 'Có làm (1)' : 'Không làm (0)'}`,
        ];
        if (isDiff) {
          tooltipParts.push(`Gốc: ${srcVal === 1 ? 'Có (1)' : 'Không (0)'}`);
        }
        if (hoSo.cls_ghi_chu) {
          tooltipParts.push(`Ghi chú CLS: ${hoSo.cls_ghi_chu}`);
        }

        return (
          <td
            key={c.key}
            className="col-cls"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              className={[
                'cls-btn',
                val === 1 ? 'cls-btn-on' : 'cls-btn-off',
                isDiff ? 'cls-btn-diff' : '',
              ]
                .filter(Boolean)
                .join(' ')}
              title={tooltipParts.join(' · ')}
              aria-pressed={val === 1}
              aria-label={`${c.ten}: ${val === 1 ? 'Có' : 'Không'}${isDiff ? ' (Đã sửa so với gốc)' : ''}`}
              disabled={!canEdit || rowBusy}
              onClick={() => {
                onSelectRow(hoSo.id);
                onToggleCls(hoSo, c.key);
              }}
            >
              {c.ngan}
            </button>
          </td>
        );
      })}

      <td
        className="col-confirm"
        onClick={(e) => e.stopPropagation()}
      >
        <label
          className={[
            'confirm-cell-label',
            hoSo.da_xac_nhan ? 'confirmed' : '',
            !canEdit ? 'disabled' : '',
          ]
            .filter(Boolean)
            .join(' ')}
          title={
            hoSo.da_xac_nhan
              ? 'Đã kiểm – có hồ sơ giấy (Bấm hoặc nhấn Space để bỏ xác nhận)'
              : 'Chưa xác nhận (Bấm hoặc nhấn Space để xác nhận có hồ sơ giấy)'
          }
        >
          <input
            type="checkbox"
            className="confirm-checkbox"
            checked={hoSo.da_xac_nhan}
            disabled={!canEdit || rowBusy}
            onChange={() => {
              onSelectRow(hoSo.id);
              onToggleXacNhan(hoSo);
            }}
          />
          <span className="confirm-status-text">
            {hoSo.da_xac_nhan ? '✓ Đã kiểm' : 'Chưa kiểm'}
          </span>
        </label>
      </td>
    </tr>
  );
});

type HoSoThongTinFormProps = {
  hoSo: HoSoDong;
  canEdit: boolean;
  onSuccess: (updated: HoSoDong) => void;
  onWriteError: (
    res: {
      status: number;
      error: string;
      isNetworkError: boolean;
      conflictHoSo?: HoSoDong;
    },
    fallbackHoSo: HoSoDong,
  ) => void;
};

function HoSoThongTinForm({
  hoSo,
  canEdit,
  onSuccess,
  onWriteError,
}: HoSoThongTinFormProps) {
  const { showToast } = useToast();
  const [formMaKcb, setFormMaKcb] = useState(hoSo.ma_kcb ?? '');
  const [formHoTen, setFormHoTen] = useState(hoSo.ho_ten ?? '');
  const [formGioiTinh, setFormGioiTinh] = useState<'Nam' | 'Nữ' | ''>(
    hoSo.gioi_tinh ?? '',
  );
  const [formNamSinh, setFormNamSinh] = useState(
    hoSo.nam_sinh ? String(hoSo.nam_sinh) : '',
  );
  const [formCccd, setFormCccd] = useState(hoSo.cccd ?? '');
  const [formDiaChi, setFormDiaChi] = useState(hoSo.dia_chi_chi_tiet ?? '');
  const [formGhiChu, setFormGhiChu] = useState(hoSo.ghi_chu ?? '');
  const [formError, setFormError] = useState('');
  const [savingForm, setSavingForm] = useState(false);

  async function handleSaveNhanThan(e: FormEvent) {
    e.preventDefault();
    if (!canEdit) return;
    setFormError('');

    const trimmedHoTen = formHoTen.trim();
    if (!trimmedHoTen) {
      setFormError('Họ tên không được để trống.');
      return;
    }

    if (formGioiTinh !== 'Nam' && formGioiTinh !== 'Nữ') {
      setFormError('Vui lòng chọn giới tính Nam hoặc Nữ.');
      return;
    }

    const parsedNamSinh = Number(formNamSinh);
    if (
      !Number.isInteger(parsedNamSinh) ||
      parsedNamSinh < 1900 ||
      parsedNamSinh > 2026
    ) {
      setFormError('Năm sinh phải là số nguyên từ 1900 đến 2026.');
      return;
    }

    const trimmedCccd = formCccd.trim();
    if (trimmedCccd !== '' && !/^(?:\d{9}|\d{12})$/.test(trimmedCccd)) {
      setFormError('CCCD/CMND phải để trống hoặc gồm đúng 9 hoặc 12 chữ số.');
      return;
    }

    const body: HoSoSuaBody = {
      version: hoSo.version,
      ma_kcb: formMaKcb.trim(),
      ho_ten: trimmedHoTen,
      gioi_tinh: formGioiTinh,
      nam_sinh: parsedNamSinh,
      cccd: trimmedCccd,
      dia_chi_chi_tiet: formDiaChi.trim(),
      ghi_chu: formGhiChu.trim(),
    };

    setSavingForm(true);
    const res = await apiRequest<{ ho_so: HoSoDong }>(`/api/ho-so/${hoSo.id}`, {
      method: 'PATCH',
      body: JSON.stringify(body),
    });
    setSavingForm(false);

    if (!res.ok) {
      if (
        res.status === 409 ||
        res.status === 423 ||
        res.status === 403 ||
        res.isNetworkError
      ) {
        onWriteError(res, hoSo);
      } else {
        setFormError(res.error);
      }
      return;
    }

    onSuccess(res.data.ho_so);
    showToast('Đã lưu thay đổi thông tin hồ sơ', 'success');
  }

  return (
    <form onSubmit={handleSaveNhanThan} className="detail-form">
      {formError && (
        <div className="alert alert-error" role="alert">
          {formError}
        </div>
      )}

      <div className="form-field">
        <label htmlFor="detail-ma-kcb" className="form-label">
          Mã KCB
        </label>
        <input
          id="detail-ma-kcb"
          type="text"
          className="form-input form-input-sm"
          value={formMaKcb}
          onChange={(e) => setFormMaKcb(e.target.value)}
          disabled={!canEdit || savingForm}
        />
        {hoSo.src && hoSo.src.ma_kcb !== hoSo.ma_kcb && (
          <span className="src-diff-note">
            Gốc: {hoSo.src.ma_kcb || '(trống)'}
          </span>
        )}
      </div>

      <div className="form-field">
        <label htmlFor="detail-ho-ten" className="form-label">
          Họ và tên *
        </label>
        <input
          id="detail-ho-ten"
          type="text"
          className="form-input form-input-sm"
          required
          value={formHoTen}
          onChange={(e) => setFormHoTen(e.target.value)}
          disabled={!canEdit || savingForm}
        />
        {hoSo.src && hoSo.src.ho_ten !== hoSo.ho_ten && (
          <span className="src-diff-note">
            Gốc: {hoSo.src.ho_ten || '(trống)'}
          </span>
        )}
      </div>

      <div className="detail-row-2col">
        <div className="form-field">
          <label htmlFor="detail-gioi-tinh" className="form-label">
            Giới tính *
          </label>
          <select
            id="detail-gioi-tinh"
            className="form-input form-input-sm"
            value={formGioiTinh}
            onChange={(e) =>
              setFormGioiTinh(e.target.value as 'Nam' | 'Nữ' | '')
            }
            disabled={!canEdit || savingForm}
          >
            <option value="" disabled>
              Chưa rõ
            </option>
            <option value="Nam">Nam</option>
            <option value="Nữ">Nữ</option>
          </select>
          {hoSo.src && hoSo.src.gioi_tinh !== hoSo.gioi_tinh && (
            <span className="src-diff-note">
              Gốc: {hoSo.src.gioi_tinh || 'Chưa rõ'}
            </span>
          )}
        </div>

        <div className="form-field">
          <label htmlFor="detail-nam-sinh" className="form-label">
            Năm sinh *
          </label>
          <input
            id="detail-nam-sinh"
            type="number"
            min={1900}
            max={2026}
            className="form-input form-input-sm num"
            required
            value={formNamSinh}
            onChange={(e) => setFormNamSinh(e.target.value)}
            disabled={!canEdit || savingForm}
          />
          {hoSo.src && hoSo.src.nam_sinh !== hoSo.nam_sinh && (
            <span className="src-diff-note">
              Gốc: {hoSo.src.nam_sinh || '(trống)'}
            </span>
          )}
        </div>
      </div>

      <div className="form-field">
        <label htmlFor="detail-cccd" className="form-label">
          Số CCCD / CMND (9 hoặc 12 số)
        </label>
        <input
          id="detail-cccd"
          type="text"
          inputMode="numeric"
          className="form-input form-input-sm num"
          value={formCccd}
          onChange={(e) => setFormCccd(e.target.value)}
          disabled={!canEdit || savingForm}
        />
        {hoSo.src && hoSo.src.cccd !== hoSo.cccd && (
          <span className="src-diff-note">
            Gốc: {hoSo.src.cccd || '(trống)'}
          </span>
        )}
      </div>

      <div className="form-field">
        <label htmlFor="detail-dia-chi" className="form-label">
          Địa chỉ chi tiết (tổ dân phố, thôn/xóm)
        </label>
        <input
          id="detail-dia-chi"
          type="text"
          className="form-input form-input-sm"
          value={formDiaChi}
          onChange={(e) => setFormDiaChi(e.target.value)}
          disabled={!canEdit || savingForm}
        />
        {hoSo.src && hoSo.src.dia_chi_chi_tiet !== hoSo.dia_chi_chi_tiet && (
          <span className="src-diff-note">
            Gốc: {hoSo.src.dia_chi_chi_tiet || '(trống)'}
          </span>
        )}
      </div>

      <div className="form-field">
        <label htmlFor="detail-ghi-chu" className="form-label">
          Ghi chú rà soát
        </label>
        <textarea
          id="detail-ghi-chu"
          rows={2}
          className="form-textarea"
          value={formGhiChu}
          onChange={(e) => setFormGhiChu(e.target.value)}
          disabled={!canEdit || savingForm}
        />
      </div>

      <button
        type="submit"
        className="btn btn-primary btn-block"
        disabled={!canEdit || savingForm}
      >
        {savingForm ? 'Đang lưu…' : 'Lưu thay đổi'}
      </button>

      <div className="ref-info-box">
        <h3 className="ref-info-title">Thông tin tham chiếu</h3>
        <dl className="ref-info-list">
          <div className="ref-info-row">
            <dt>Mã hồ sơ:</dt>
            <dd className="num">{hoSo.ma_ho_so || '(Thêm tay)'}</dd>
          </div>
          <div className="ref-info-row">
            <dt>Nguồn:</dt>
            <dd>
              {hoSo.nguon === 'them_tay' ? 'Thêm tay' : 'Gói dữ liệu Cowork'}
              {hoSo.nhan_tu_kho_chung ? ' (Nhận từ kho chung)' : ''}
            </dd>
          </div>
          <div className="ref-info-row">
            <dt>Địa chỉ thẻ:</dt>
            <dd>{hoSo.dia_chi_the || '—'}</dd>
          </div>
          <div className="ref-info-row">
            <dt>ĐK HIS:</dt>
            <dd>{hoSo.ngay_gio_dang_ky_his || '—'}</dd>
          </div>
          <div className="ref-info-row">
            <dt>Có trong TT KSK:</dt>
            <dd>{hoSo.co_tt_ksk === 1 ? 'Có' : 'Không'}</dd>
          </div>
          {hoSo.cls_ghi_chu && (
            <div className="ref-info-row">
              <dt>Ghi chú CLS:</dt>
              <dd>{hoSo.cls_ghi_chu}</dd>
            </div>
          )}
          {hoSo.ghi_chu_cowork && (
            <div className="ref-info-row">
              <dt>Ghi chú Cowork:</dt>
              <dd>{hoSo.ghi_chu_cowork}</dd>
            </div>
          )}
          <div className="ref-info-row">
            <dt>Xác nhận giấy:</dt>
            <dd>
              {hoSo.da_xac_nhan
                ? `Đã xác nhận${
                    hoSo.xac_nhan_by ? ` bởi ${hoSo.xac_nhan_by.ho_ten}` : ''
                  }${
                    hoSo.xac_nhan_at
                      ? ` (${formatDateTime(hoSo.xac_nhan_at)})`
                      : ''
                  }`
                : 'Chưa xác nhận'}
            </dd>
          </div>
        </dl>
      </div>
    </form>
  );
}

function HoSoLichSuPane({ hoSoId, version }: { hoSoId: number; version: number }) {
  const [lichSu, setLichSu] = useState<NhatKyDong[]>([]);
  const [loadingLichSu, setLoadingLichSu] = useState(true);
  const [errorLichSu, setErrorLichSu] = useState('');

  const reloadLichSu = useCallback(async () => {
    setLoadingLichSu(true);
    setErrorLichSu('');
    const res = await apiRequest<{ lich_su: NhatKyDong[] }>(
      `/api/ho-so/${hoSoId}/lich-su`,
    );
    if (!res.ok) {
      setErrorLichSu(res.error);
      setLoadingLichSu(false);
      return;
    }
    setLichSu(res.data.lich_su ?? []);
    setLoadingLichSu(false);
  }, [hoSoId]);

  useEffect(() => {
    let cancelled = false;
    apiRequest<{ lich_su: NhatKyDong[] }>(`/api/ho-so/${hoSoId}/lich-su`).then(
      (res) => {
        if (cancelled) return;
        if (!res.ok) {
          setErrorLichSu(res.error);
          setLoadingLichSu(false);
          return;
        }
        setErrorLichSu('');
        setLichSu(res.data.lich_su ?? []);
        setLoadingLichSu(false);
      },
    );
    return () => {
      cancelled = true;
    };
  }, [hoSoId, version]);

  return (
    <div className="history-pane">
      <div className="history-header-row">
        <span className="text-muted text-xs">
          Nhật ký thay đổi của hồ sơ #{hoSoId}
        </span>
        <button
          type="button"
          className="btn btn-secondary btn-xs"
          onClick={() => void reloadLichSu()}
          disabled={loadingLichSu}
        >
          {loadingLichSu ? 'Đang tải…' : 'Làm mới'}
        </button>
      </div>

      {errorLichSu && (
        <div className="alert alert-error" role="alert">
          {errorLichSu}
        </div>
      )}

      {loadingLichSu && lichSu.length === 0 && (
        <p className="text-muted">Đang tải lịch sử…</p>
      )}

      {!loadingLichSu && !errorLichSu && lichSu.length === 0 && (
        <p className="text-muted">
          Chưa có lịch sử chỉnh sửa nào cho hồ sơ này.
        </p>
      )}

      {lichSu.length > 0 && (
        <ul className="history-list">
          {lichSu.map((item, idx) => {
            const actionLabel =
              HANH_DONG_NHAN[item.hanh_dong] ?? item.hanh_dong;
            const fieldLabel = getTruongNhan(item.truong);
            const hasDiff =
              item.gia_tri_cu !== null || item.gia_tri_moi !== null;

            return (
              <li key={`${item.at}-${idx}`} className="history-item">
                <div className="history-item-top">
                  <strong className="history-action">{actionLabel}</strong>
                  <span className="history-time num">
                    {formatDateTime(item.at)}
                  </span>
                </div>
                <div className="history-user">
                  Người thực hiện:{' '}
                  <strong>{item.user ? item.user.ho_ten : 'Hệ thống'}</strong>
                </div>
                {fieldLabel && (
                  <div className="history-change">
                    <span className="history-field">{fieldLabel}:</span>{' '}
                    {hasDiff && (
                      <span className="history-values">
                        <span className="val-old">
                          {item.gia_tri_cu ?? '(trống)'}
                        </span>{' '}
                        →{' '}
                        <span className="val-new">
                          {item.gia_tri_moi ?? '(trống)'}
                        </span>
                      </span>
                    )}
                  </div>
                )}
                {!fieldLabel && hasDiff && (
                  <div className="history-change">
                    <span className="val-old">
                      {item.gia_tri_cu ?? '(trống)'}
                    </span>{' '}
                    →{' '}
                    <span className="val-new">
                      {item.gia_tri_moi ?? '(trống)'}
                    </span>
                  </div>
                )}
                {item.ghi_chu && (
                  <div className="history-note">Ghi chú: {item.ghi_chu}</div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

export function RaSoatView({ maBuoi }: RaSoatViewProps) {
  const { showToast } = useToast();

  const [buoi, setBuoi] = useState<BuoiTomTat | null>(null);
  const [hoSoList, setHoSoList] = useState<HoSoDong[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string>('');
  const [errorStatus, setErrorStatus] = useState<number>(0);

  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [drawerOpen, setDrawerOpen] = useState<boolean>(false);
  const [activeTab, setActiveTab] = useState<'thong_tin' | 'lich_su'>('thong_tin');

  const [busyRowIds, setBusyRowIds] = useState<Record<number, boolean>>({});
  const tableBodyRef = useRef<HTMLTableSectionElement | null>(null);

  const reloadBuoiHoSo = useCallback(async () => {
    setLoading(true);
    setError('');
    setErrorStatus(0);

    const res = await apiRequest<{ buoi: BuoiTomTat; ho_so: HoSoDong[] }>(
      `/api/buoi/${encodeURIComponent(maBuoi)}/ho-so`,
    );

    if (!res.ok) {
      setError(res.error);
      setErrorStatus(res.status);
      setLoading(false);
      return;
    }

    setBuoi(res.data.buoi);
    setHoSoList(res.data.ho_so ?? []);
    setLoading(false);
  }, [maBuoi]);

  useEffect(() => {
    let cancelled = false;
    apiRequest<{ buoi: BuoiTomTat; ho_so: HoSoDong[] }>(
      `/api/buoi/${encodeURIComponent(maBuoi)}/ho-so`,
    ).then((res) => {
      if (cancelled) return;
      if (!res.ok) {
        setError(res.error);
        setErrorStatus(res.status);
        setLoading(false);
        return;
      }
      setError('');
      setErrorStatus(0);
      setBuoi(res.data.buoi);
      setHoSoList(res.data.ho_so ?? []);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [maBuoi]);

  const selectedHoSo = useMemo(() => {
    if (selectedId === null) return null;
    return hoSoList.find((h) => h.id === selectedId) ?? null;
  }, [hoSoList, selectedId]);

  // Single click only selects (keeps CLS + confirm columns in view); double-click / Enter opens the detail pane.
  const handleSelectRow = useCallback((id: number) => {
    setSelectedId(id);
  }, []);
  const handleOpenDetail = useCallback((id: number) => {
    setSelectedId(id);
    setDrawerOpen(true);
  }, []);

  const replaceHoSoInList = useCallback((updated: HoSoDong) => {
    setHoSoList((prev) => prev.map((item) => (item.id === updated.id ? updated : item)));
  }, []);

  const handleWriteError = useCallback(
    (
      res: {
        status: number;
        error: string;
        isNetworkError: boolean;
        conflictHoSo?: HoSoDong;
      },
      fallbackHoSo: HoSoDong,
    ) => {
      if (res.isNetworkError) {
        replaceHoSoInList(fallbackHoSo);
        showToast('Không lưu được, kiểm tra mạng', 'error');
        return;
      }

      if (res.status === 409) {
        if (res.conflictHoSo) {
          replaceHoSoInList(res.conflictHoSo);
        } else {
          void reloadBuoiHoSo();
        }
        showToast(
          'Hồ sơ vừa được người khác sửa, đã tải lại bản mới nhất',
          'warning',
        );
        return;
      }

      replaceHoSoInList(fallbackHoSo);
      if (res.status === 423) {
        setBuoi((prev) =>
          prev
            ? { ...prev, trang_thai: 'da_xac_nhan', co_quyen_sua: false }
            : prev,
        );
        showToast(res.error, 'error');
        return;
      }

      if (res.status === 403) {
        setBuoi((prev) => (prev ? { ...prev, co_quyen_sua: false } : prev));
        showToast(res.error, 'error');
        return;
      }

      showToast(res.error, 'error');
    },
    [reloadBuoiHoSo, replaceHoSoInList, showToast],
  );

  const handleToggleCls = useCallback(
    async (hoSo: HoSoDong, key: ClsKey) => {
      if (!buoi?.co_quyen_sua) return;
      if (busyRowIds[hoSo.id]) return;

      const currentVal = hoSo.cls[key] === 1 ? 1 : 0;
      const nextVal: 0 | 1 = currentVal === 1 ? 0 : 1;

      const optimisticCls = { ...hoSo.cls, [key]: nextVal };
      const optimisticHoSo: HoSoDong = {
        ...hoSo,
        cls: optimisticCls,
        sua_cls: true,
      };

      replaceHoSoInList(optimisticHoSo);
      setBusyRowIds((prev) => ({ ...prev, [hoSo.id]: true }));

      const res = await apiRequest<{ ho_so: HoSoDong }>(`/api/ho-so/${hoSo.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          version: hoSo.version,
          cls: { [key]: nextVal },
        } satisfies HoSoSuaBody),
      });

      setBusyRowIds((prev) => {
        const next = { ...prev };
        delete next[hoSo.id];
        return next;
      });

      if (!res.ok) {
        handleWriteError(res, hoSo);
        return;
      }

      replaceHoSoInList(res.data.ho_so);
    },
    [buoi?.co_quyen_sua, busyRowIds, handleWriteError, replaceHoSoInList],
  );

  const handleToggleXacNhan = useCallback(
    async (hoSo: HoSoDong) => {
      if (!buoi?.co_quyen_sua) return;
      if (busyRowIds[hoSo.id]) return;

      const nextConfirmed = !hoSo.da_xac_nhan;
      const endpoint = nextConfirmed
        ? `/api/ho-so/${hoSo.id}/xac-nhan`
        : `/api/ho-so/${hoSo.id}/bo-xac-nhan`;

      const optimisticHoSo: HoSoDong = {
        ...hoSo,
        da_xac_nhan: nextConfirmed,
      };
      replaceHoSoInList(optimisticHoSo);
      setBusyRowIds((prev) => ({ ...prev, [hoSo.id]: true }));

      const res = await apiRequest<{ ho_so: HoSoDong; buoi: BuoiTomTat }>(
        endpoint,
        {
          method: 'POST',
          body: JSON.stringify({ version: hoSo.version }),
        },
      );

      setBusyRowIds((prev) => {
        const next = { ...prev };
        delete next[hoSo.id];
        return next;
      });

      if (!res.ok) {
        handleWriteError(res, hoSo);
        return;
      }

      replaceHoSoInList(res.data.ho_so);
      if (res.data.buoi) {
        setBuoi(res.data.buoi);
      }
    },
    [buoi?.co_quyen_sua, busyRowIds, handleWriteError, replaceHoSoInList],
  );

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.metaKey || e.ctrlKey || e.altKey) return;

      const target = e.target as HTMLElement | null;
      if (target) {
        const tag = target.tagName;
        if (
          tag === 'INPUT' ||
          tag === 'TEXTAREA' ||
          tag === 'SELECT' ||
          target.isContentEditable
        ) {
          const isRowCheckbox =
            tag === 'INPUT' &&
            (target as HTMLInputElement).type === 'checkbox' &&
            target.classList.contains('confirm-checkbox');
          if (!isRowCheckbox) {
            return;
          }
        }
      }

      if (hoSoList.length === 0) return;

      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        const currentIndex =
          selectedId !== null
            ? hoSoList.findIndex((h) => h.id === selectedId)
            : -1;

        let nextIndex = 0;
        if (currentIndex === -1) {
          nextIndex = 0;
        } else if (e.key === 'ArrowDown') {
          nextIndex = Math.min(hoSoList.length - 1, currentIndex + 1);
        } else {
          nextIndex = Math.max(0, currentIndex - 1);
        }

        const nextHoSo = hoSoList[nextIndex];
        if (nextHoSo) {
          setSelectedId(nextHoSo.id);
          const rowEl = tableBodyRef.current?.querySelector(
            `tr[data-hoso-id="${nextHoSo.id}"]`,
          );
          rowEl?.scrollIntoView({ block: 'nearest' });
        }
        return;
      }

      if (e.key === 'Enter') {
        if (selectedId !== null) {
          e.preventDefault();
          setDrawerOpen(true);
        }
        return;
      }

      if (e.key === 'Escape') {
        if (drawerOpen) {
          e.preventDefault();
          setDrawerOpen(false);
        }
        return;
      }

      if (!selectedHoSo) return;

      if (e.key === ' ' || e.code === 'Space') {
        e.preventDefault();
        void handleToggleXacNhan(selectedHoSo);
        return;
      }

      if (e.key >= '1' && e.key <= '8') {
        e.preventDefault();
        const clsIdx = Number(e.key) - 1;
        const clsItem = CLS[clsIdx];
        if (clsItem) {
          void handleToggleCls(selectedHoSo, clsItem.key);
        }
      }
    }

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [
    drawerOpen,
    handleToggleCls,
    handleToggleXacNhan,
    hoSoList,
    selectedHoSo,
    selectedId,
  ]);

  if (loading) {
    return (
      <div className="page-container">
        <div className="state-box" role="status">
          <p className="state-title">
            Đang tải danh sách hồ sơ buổi khám {maBuoi}…
          </p>
        </div>
      </div>
    );
  }

  if (error || !buoi) {
    return (
      <div className="page-container">
        <div className="state-box state-error" role="alert">
          <p className="state-title">
            {errorStatus === 403
              ? 'Không có quyền truy cập buổi khám này'
              : errorStatus === 404
                ? `Không tìm thấy buổi khám ${maBuoi}`
                : 'Không tải được dữ liệu buổi khám'}
          </p>
          <p className="state-desc">{error}</p>
          <div className="state-actions">
            {errorStatus !== 403 && errorStatus !== 404 && (
              <button
                type="button"
                className="btn btn-primary btn-sm"
                onClick={() => void reloadBuoiHoSo()}
              >
                Thử tải lại
              </button>
            )}
            <Link href="/ra-soat" className="btn btn-secondary btn-sm">
              Chọn buổi khám khác
            </Link>
            <Link href="/" className="btn btn-secondary btn-sm">
              ← Về Danh sách của tôi
            </Link>
          </div>
        </div>
      </div>
    );
  }

  const canEdit = buoi.co_quyen_sua;
  const readOnlyReason =
    buoi.trang_thai === 'da_xac_nhan'
      ? 'Danh sách đã xác nhận (đã khóa)'
      : 'Không phải buổi khám của bạn phụ trách';

  return (
    <div className="rasoat-page">
      <div className="rasoat-sticky-header">
        <div className="rasoat-session-bar">
          <div className="rasoat-session-meta">
            <Link href="/" className="btn btn-secondary btn-xs">
              ← Danh sách buổi
            </Link>
            <span className="rasoat-session-title">
              {buoi.ten_don_vi} · <strong>{formatDate(buoi.ngay_kham)}</strong>
            </span>
            <span className="rasoat-meta-sep">|</span>
            <span>
              Điểm khám: <strong>{buoi.diem_kham || '—'}</strong>
              {buoi.doan_kham ? ` (${buoi.doan_kham})` : ''}
            </span>
            <span className="rasoat-meta-sep">|</span>
            <span>
              Phụ trách:{' '}
              <strong>
                {buoi.phu_trach ? buoi.phu_trach.ho_ten : 'Chưa phân công'}
              </strong>
            </span>
            <span
              className={`badge ${
                buoi.trang_thai === 'da_xac_nhan'
                  ? 'badge-success'
                  : buoi.trang_thai === 'dang_ra_soat'
                    ? 'badge-warning'
                    : 'badge-neutral'
              }`}
            >
              {TRANG_THAI_BUOI_NHAN[buoi.trang_thai]}
            </span>
          </div>

          <div className="rasoat-toolbar-slot">
            <Link href="/ra-soat" className="btn btn-secondary btn-xs">
              Đổi buổi khám
            </Link>
            <button
              type="button"
              className="btn btn-secondary btn-xs"
              onClick={() => void reloadBuoiHoSo()}
            >
              Tải lại
            </button>
          </div>
        </div>

        <div className="rasoat-metrics-bar" aria-live="polite">
          <span className="metric-item">
            Sổ đoàn: <strong className="num">{formatNumber(buoi.so_doan_tong)}</strong>
          </span>
          <span className="metric-divider">|</span>
          <span className="metric-item">
            Trong danh sách: <strong className="num">{formatNumber(buoi.hien_co)}</strong>
          </span>
          <span className="metric-divider">|</span>
          <span className="metric-item">
            Đã xác nhận:{' '}
            <strong className="num text-success">
              {formatNumber(buoi.da_xac_nhan)}/{formatNumber(buoi.hien_co)}
            </strong>{' '}
            <span className="text-muted">({formatPercent(buoi.tien_do)})</span>
          </span>
          <span className="metric-divider">|</span>
          <span
            className={`metric-item ${buoi.thua > 0 ? 'metric-alert' : ''}`}
          >
            Thừa: <strong className="num">{formatNumber(buoi.thua)}</strong>
            {buoi.thua > 0 && <span className="metric-alert-tag"> (Lệch sổ đoàn)</span>}
          </span>
          <span className="metric-divider">|</span>
          <span
            className={`metric-item ${buoi.thieu > 0 ? 'metric-alert' : ''}`}
          >
            Thiếu: <strong className="num">{formatNumber(buoi.thieu)}</strong>
            {buoi.thieu > 0 && <span className="metric-alert-tag"> (Thiếu hồ sơ)</span>}
          </span>
        </div>

        {!canEdit && (
          <div className="rasoat-readonly-banner" role="status">
            <strong>Chỉ xem:</strong> {readOnlyReason}. Các nút chỉnh sửa cận lâm sàng, nhân thân và xác nhận đang khóa.
          </div>
        )}

        <div className="rasoat-shortcut-hint">
          <span>
            <strong>Phím tắt:</strong> <kbd>↑</kbd>/<kbd>↓</kbd> chọn dòng ·{' '}
            <kbd>Space</kbd> xác nhận/bỏ xác nhận · <kbd>1</kbd>–<kbd>8</kbd> bật/tắt CLS (1:CTM 2:GLU 3:URE 4:CRE 5:GOT 6:GPT 7:NT 8:SA) ·{' '}
            <kbd>Enter</kbd> / nhấp đúp: mở chi tiết
          </span>
          <span className="legend-group">
            <span className="legend-box legend-diff" /> Viền cam = Đã sửa khác dữ liệu gốc
            <span className="legend-box legend-confirmed ml-2" /> Nền xanh = Đã xác nhận có giấy
          </span>
        </div>
      </div>

      <div className={`rasoat-workspace${drawerOpen && selectedHoSo ? ' has-detail' : ''}`}>
        <div className="rasoat-table-pane">
          {hoSoList.length === 0 ? (
            <div className="state-box">
              <p className="state-title">
                Buổi khám này hiện chưa có hồ sơ nào trong danh sách.
              </p>
              <p className="state-desc">
                Sổ đoàn ghi nhận {formatNumber(buoi.so_doan_tong)} người.
              </p>
            </div>
          ) : (
            <div className="rasoat-table-scroll">
              <table className="data-table rasoat-table">
                <thead>
                  <tr>
                    <th className="num-col col-stt">STT</th>
                    <th className="col-makcb">Mã KCB</th>
                    <th className="col-hoten">Họ tên</th>
                    <th className="col-gt">GT</th>
                    <th className="num-col col-namsinh">Năm sinh</th>
                    <th className="col-cccd">CCCD</th>
                    <th className="col-diachi">Địa chỉ chi tiết</th>
                    {CLS.map((c, idx) => (
                      <th
                        key={c.key}
                        className="col-cls"
                        title={`${idx + 1}. ${c.ten} (Phím ${idx + 1})`}
                      >
                        <div className="cls-th-label">{c.ngan}</div>
                        <div className="cls-th-key">{idx + 1}</div>
                      </th>
                    ))}
                    <th className="col-confirm">Đã kiểm – có hồ sơ giấy</th>
                  </tr>
                </thead>
                <tbody ref={tableBodyRef}>
                  {hoSoList.map((h, index) => (
                    <HoSoRow
                      key={h.id}
                      stt={index + 1}
                      hoSo={h}
                      isSelected={selectedId === h.id}
                      canEdit={canEdit}
                      rowBusy={Boolean(busyRowIds[h.id])}
                      onSelectRow={handleSelectRow}
                      onOpenDetail={handleOpenDetail}
                      onToggleCls={handleToggleCls}
                      onToggleXacNhan={handleToggleXacNhan}
                    />
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {drawerOpen && selectedHoSo && (
          <aside className="rasoat-detail-pane" aria-label="Chi tiết hồ sơ">
            <div className="detail-header">
              <div className="detail-header-title">
                <h2 className="detail-title">{selectedHoSo.ho_ten}</h2>
                <span className="detail-sub">
                  ID #{selectedHoSo.id} · Phiên bản v{selectedHoSo.version}
                </span>
              </div>
              <button
                type="button"
                className="btn btn-secondary btn-xs"
                onClick={() => setDrawerOpen(false)}
                aria-label="Đóng khung chi tiết"
              >
                × Đóng
              </button>
            </div>

            <div className="detail-tabs" role="tablist">
              <button
                type="button"
                role="tab"
                aria-selected={activeTab === 'thong_tin'}
                className={`detail-tab ${activeTab === 'thong_tin' ? 'active' : ''}`}
                onClick={() => setActiveTab('thong_tin')}
              >
                Thông tin
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={activeTab === 'lich_su'}
                className={`detail-tab ${activeTab === 'lich_su' ? 'active' : ''}`}
                onClick={() => setActiveTab('lich_su')}
              >
                Lịch sử
              </button>
            </div>

            <div className="detail-body">
              {activeTab === 'thong_tin' ? (
                <HoSoThongTinForm
                  key={`${selectedHoSo.id}-${selectedHoSo.version}`}
                  hoSo={selectedHoSo}
                  canEdit={canEdit}
                  onSuccess={replaceHoSoInList}
                  onWriteError={handleWriteError}
                />
              ) : (
                <HoSoLichSuPane
                  key={selectedHoSo.id}
                  hoSoId={selectedHoSo.id}
                  version={selectedHoSo.version}
                />
              )}
            </div>
          </aside>
        )}
      </div>
    </div>
  );
}
