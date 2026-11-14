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
import { useSearchParams } from 'next/navigation';
import {
  HANH_DONG_NHAN,
  type BuoiTomTat,
  type ChuyenBody,
  type DeNghiChuyen,
  type HoSoDong,
  type HoSoSuaBody,
  type KetQuaTimKiem,
  type LoaiDeNghi,
  type NhatKyDong,
  type VanDeSo,
} from '@/lib/api-types';
import {
  CANH_BAO_MO_TA,
  CANH_BAO_NHAN,
  CLS,
  NHAN,
  type ClsKey,
} from '@/lib/cls';
import {
  chiSo,
  coSdt,
  kiemTraSo,
  NHAN_TRUONG_SO,
  vanDeKhiSua,
} from '@/lib/kiem-so';
import { khopBoLoc, layCanhBaoSo, type BoLoc } from '@/lib/loc-ho-so';
import {
  coTheTim,
  khopHoSo,
  tachTuKhoa,
  type KetQuaKhop,
} from '@/lib/tim-mo';
import { apiRequest } from '@/lib/client/api';
import {
  formatDate,
  formatDateTime,
  formatDongXemLaiSo,
  formatHisTimestamp,
  formatNumber,
  formatPercent,
  getCanhBaoTooltip,
  getTruongNhan,
  laySoDtHoSo,
  phanLoaiCanhBaoSoTheoTruong,
  TRANG_THAI_BUOI_NHAN,
} from '@/lib/client/format';
import { notifyPoolChanged } from './app-shell';
import {
  cloneBoLocMacDinh,
  docBoLocSession,
  ghiBoLocSession,
  locHoSoKetHopCanhBao,
  RaSoatBoLoc,
} from './ra-soat-bo-loc';
import {
  ChuyenBuoiModal,
  KhoChungConfirmModal,
  MoKhoaBuoiModal,
  ThemHoSoModal,
  XacNhanBuoiModal,
} from './ra-soat-dialogs';
import { ToVang } from './to-vang';
import { useToast } from './toast';

export function timMoDanhSachHoSo(
  list: HoSoDong[],
  q: string,
): {
  idsKhop: Set<number> | null;
  danhDauMap: Map<number, KetQuaKhop['danhDau']>;
} {
  const danhDauMap = new Map<number, KetQuaKhop['danhDau']>();
  if (!coTheTim(q)) {
    return { idsKhop: null, danhDauMap };
  }
  const tokens = tachTuKhoa(q);
  const idsKhop = new Set<number>();
  for (const h of list) {
    const kq = khopHoSo(tokens, h);
    if (kq.khop) {
      idsKhop.add(h.id);
      danhDauMap.set(h.id, kq.danhDau);
    }
  }
  return { idsKhop, danhDauMap };
}

type RaSoatViewProps = {
  maBuoi: string;
  isAdmin?: boolean;
  currentUserId?: number;
};

type HoSoRowProps = {
  stt: number;
  hoSo: HoSoDong;
  danhDau?: KetQuaKhop['danhDau'];
  isSelected: boolean;
  canEdit: boolean;
  rowBusy: boolean;
  dangChoChuyen?: boolean;
  onSelectRow: (id: number) => void;
  onOpenDetail: (id: number) => void;
  onToggleCls: (hoSo: HoSoDong, key: ClsKey) => void;
  onToggleXacNhan: (hoSo: HoSoDong) => void;
};

const HoSoRow = memo(function HoSoRow({
  stt,
  hoSo,
  danhDau,
  isSelected,
  canEdit,
  rowBusy,
  dangChoChuyen,
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
  const canhBaoSo = layCanhBaoSo(hoSo);
  const canhBaoTheoTruong = phanLoaiCanhBaoSoTheoTruong(canhBaoSo);
  const dongXemLaiSo = formatDongXemLaiSo(canhBaoSo);

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
        <span
          className={`num ${canhBaoTheoTruong.ma_kcb.length > 0 ? 'so-canh-bao' : ''}`}
          title={
            canhBaoTheoTruong.ma_kcb.length > 0
              ? canhBaoTheoTruong.ma_kcb.join('; ')
              : undefined
          }
        >
          {hoSo.ma_kcb ? (
            <ToVang text={hoSo.ma_kcb} ranges={danhDau?.ma_kcb} />
          ) : (
            '—'
          )}
        </span>
        {hoSo.src && hoSo.src.ma_kcb !== hoSo.ma_kcb && (
          <span className="diff-dot" title={`Gốc: ${hoSo.src.ma_kcb || '(trống)'}`}>
            *
          </span>
        )}
      </td>
      <td className="col-hoten">
        <div className="hoten-main-line">
          <strong className="hoten-text">
            <ToVang text={hoSo.ho_ten} ranges={danhDau?.ho_ten} />
          </strong>
          {hoSo.sua_nhan_than && (
            <span className="chip chip-edited" title="Đã sửa thông tin nhân thân theo hồ sơ giấy">
              Đã sửa
            </span>
          )}
          {hoSo.nguon === 'them_tay' && (
            <span className="chip chip-manual">Thêm tay</span>
          )}
          {dangChoChuyen && (
            <span
              className="chip chip-pending-transfer"
              title="Đang có đề nghị chuyển chờ người phụ trách buổi khác xử lý"
            >
              Đang chờ chuyển
            </span>
          )}
        </div>
        <div className="hoten-sub-line">
          <span>
            ĐK HIS {hisTimeShort || '—'} · {NHAN.TT_KSK}:{' '}
            {hoSo.co_tt_ksk === 1 ? 'Có' : 'Không'}
          </span>
          {canhBaoSo.length > 0 && (
            <span
              className="chip chip-warning"
              title={canhBaoSo.join(' · ')}
            >
              Xem lại số
            </span>
          )}
          {hoSo.canh_bao &&
            hoSo.canh_bao.length > 0 &&
            hoSo.canh_bao.map((code) => (
              <span
                key={code}
                className="chip chip-warning"
                title={getCanhBaoTooltip(code, hoSo.cls_ghi_chu)}
              >
                {CANH_BAO_NHAN[code] ?? code}
              </span>
            ))}
        </div>
      </td>
      <td className="col-gt">{hoSo.gioi_tinh || 'Chưa rõ'}</td>
      <td className="num-col col-namsinh">
        {hoSo.nam_sinh ? (
          <ToVang text={String(hoSo.nam_sinh)} ranges={danhDau?.nam_sinh} />
        ) : (
          '—'
        )}
      </td>
      <td className="col-cccd num">
        <span
          className={canhBaoTheoTruong.cccd.length > 0 ? 'so-canh-bao' : undefined}
          title={
            canhBaoTheoTruong.cccd.length > 0
              ? canhBaoTheoTruong.cccd.join('; ')
              : undefined
          }
        >
          {hoSo.cccd ? (
            <ToVang text={hoSo.cccd} ranges={danhDau?.cccd} />
          ) : (
            '—'
          )}
        </span>
      </td>
      <td className="col-diachi">{hoSo.dia_chi_chi_tiet || '—'}</td>
      <td
        className="col-ghichu"
        title={
          [hoSo.ghi_chu, dongXemLaiSo].filter(Boolean).join('\n') || undefined
        }
      >
        {hoSo.ghi_chu ? (
          // Show the whole note while it contains a search match, so the highlight is never clipped.
          <div className={danhDau?.ghi_chu?.length ? undefined : 'ghichu-clamp'}>
            <ToVang text={hoSo.ghi_chu} ranges={danhDau?.ghi_chu} />
          </div>
        ) : !dongXemLaiSo ? (
          '—'
        ) : null}
        {dongXemLaiSo && (
          <div className="ghichu-xem-lai-so" title={dongXemLaiSo}>
            {dongXemLaiSo}
          </div>
        )}
      </td>

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
              onClick={() => onToggleCls(hoSo, c.key)}
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
            onChange={() => onToggleXacNhan(hoSo)}
          />
          <span className="confirm-status-text">
            {hoSo.da_xac_nhan ? '✓ Đã kiểm' : 'Chưa kiểm'}
          </span>
        </label>
      </td>
    </tr>
  );
});

const HoSoMobileCard = memo(function HoSoMobileCard({
  stt,
  hoSo,
  danhDau,
  isSelected,
  canEdit,
  rowBusy,
  dangChoChuyen,
  onOpenDetail,
  onToggleCls,
  onToggleXacNhan,
}: HoSoRowProps) {
  const cardClasses = [
    'mobile-data-card',
    'rasoat-mobile-card',
    hoSo.da_xac_nhan ? 'hoso-row-confirmed' : '',
    isSelected ? 'hoso-row-selected' : '',
  ]
    .filter(Boolean)
    .join(' ');

  const canhBaoSo = layCanhBaoSo(hoSo);
  const canhBaoTheoTruong = phanLoaiCanhBaoSoTheoTruong(canhBaoSo);
  const dongXemLaiSo = formatDongXemLaiSo(canhBaoSo);

  return (
    <div
      data-hoso-id={hoSo.id}
      className={cardClasses}
      onClick={() => onOpenDetail(hoSo.id)}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          onOpenDetail(hoSo.id);
        }
      }}
    >
      <div className="rasoat-mobile-card-head">
        <div className="rasoat-mobile-card-title">
          <span className="text-muted text-xs num">#{stt}</span>{' '}
          <strong className="hoten-text">
            <ToVang text={hoSo.ho_ten} ranges={danhDau?.ho_ten} />
          </strong>{' '}
          <span className="num">
            (
            {hoSo.nam_sinh ? (
              <ToVang text={String(hoSo.nam_sinh)} ranges={danhDau?.nam_sinh} />
            ) : (
              '—'
            )}
            )
          </span>
          {hoSo.sua_nhan_than && (
            <span className="chip chip-edited ml-1">Đã sửa</span>
          )}
          {hoSo.nguon === 'them_tay' && (
            <span className="chip chip-manual ml-1">Thêm tay</span>
          )}
          {canhBaoSo.length > 0 && (
            <span
              className="chip chip-warning ml-1"
              title={canhBaoSo.join(' · ')}
            >
              Xem lại số
            </span>
          )}
          {dangChoChuyen && (
            <span className="chip chip-pending-transfer ml-1">
              Đang chờ chuyển
            </span>
          )}
        </div>
        <button
          type="button"
          className={`rasoat-mobile-confirm-btn ${hoSo.da_xac_nhan ? 'confirmed' : ''}`}
          disabled={!canEdit || rowBusy}
          onClick={(e) => {
            e.stopPropagation();
            onToggleXacNhan(hoSo);
          }}
          aria-pressed={hoSo.da_xac_nhan}
        >
          {hoSo.da_xac_nhan ? '✓ Đã kiểm' : 'Chưa kiểm'}
        </button>
      </div>

      <div className="rasoat-mobile-card-sub num">
        <span>{hoSo.gioi_tinh || 'Chưa rõ'}</span>
        <span>
          CCCD:{' '}
          <span
            className={
              canhBaoTheoTruong.cccd.length > 0 ? 'so-canh-bao' : undefined
            }
            title={
              canhBaoTheoTruong.cccd.length > 0
                ? canhBaoTheoTruong.cccd.join('; ')
                : undefined
            }
          >
            {hoSo.cccd ? (
              <ToVang text={hoSo.cccd} ranges={danhDau?.cccd} />
            ) : (
              '—'
            )}
          </span>
        </span>
        {hoSo.ma_kcb && (
          <span>
            Mã KCB:{' '}
            <span
              className={
                canhBaoTheoTruong.ma_kcb.length > 0 ? 'so-canh-bao' : undefined
              }
              title={
                canhBaoTheoTruong.ma_kcb.length > 0
                  ? canhBaoTheoTruong.ma_kcb.join('; ')
                  : undefined
              }
            >
              <ToVang text={hoSo.ma_kcb} ranges={danhDau?.ma_kcb} />
            </span>
          </span>
        )}
      </div>

      {hoSo.ghi_chu && (
        <div className="rasoat-mobile-card-note">
          Ghi chú: <ToVang text={hoSo.ghi_chu} ranges={danhDau?.ghi_chu} />
        </div>
      )}
      {dongXemLaiSo && (
        <div className="ghichu-xem-lai-so">{dongXemLaiSo}</div>
      )}

      {hoSo.canh_bao && hoSo.canh_bao.length > 0 && (
        <div className="rasoat-mobile-card-warnings">
          {hoSo.canh_bao.map((code) => (
            <span
              key={code}
              className="chip chip-warning"
              title={getCanhBaoTooltip(code, hoSo.cls_ghi_chu)}
            >
              {CANH_BAO_NHAN[code] ?? code}
            </span>
          ))}
        </div>
      )}

      <div
        className="rasoat-mobile-cls-grid"
        onClick={(e) => e.stopPropagation()}
      >
        {CLS.map((c) => {
          const val = hoSo.cls[c.key] === 1 ? 1 : 0;
          const srcVal = hoSo.src ? hoSo.src.cls[c.key] : val;
          const isDiff = hoSo.src !== null && srcVal !== val;
          return (
            <button
              key={c.key}
              type="button"
              className={[
                'cls-btn',
                'rasoat-mobile-cls-chip',
                val === 1 ? 'cls-btn-on' : 'cls-btn-off',
                isDiff ? 'cls-btn-diff' : '',
              ]
                .filter(Boolean)
                .join(' ')}
              aria-pressed={val === 1}
              aria-label={`${c.ten}: ${val === 1 ? 'Có' : 'Không'}`}
              disabled={!canEdit || rowBusy}
              onClick={() => onToggleCls(hoSo, c.key)}
            >
              {c.ngan}
            </button>
          );
        })}
      </div>
    </div>
  );
});

type HoSoThongTinFormProps = {
  hoSo: HoSoDong;
  canEdit: boolean;
  movingHoSo: boolean;
  onMoveToKhoCaNhan: (hoSo: HoSoDong) => void;
  onOpenKhoChungModal: (hoSo: HoSoDong) => void;
  onOpenChuyenBuoiModal: (hoSo: HoSoDong) => void;
  onSuccess: (updated: HoSoDong) => void;
  onCloseDetail?: () => void;
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
  movingHoSo,
  onMoveToKhoCaNhan,
  onOpenKhoChungModal,
  onOpenChuyenBuoiModal,
  onSuccess,
  onCloseDetail,
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
  const [formSoDt, setFormSoDt] = useState(() => laySoDtHoSo(hoSo));
  const [formDiaChi, setFormDiaChi] = useState(hoSo.dia_chi_chi_tiet ?? '');
  const [formGhiChu, setFormGhiChu] = useState(hoSo.ghi_chu ?? '');
  const [formError, setFormError] = useState('');
  const [savingForm, setSavingForm] = useState(false);
  const [touchedSoFields, setTouchedSoFields] = useState<
    Set<'cccd' | 'ma_kcb' | 'so_dt' | 'nam_sinh' | 'gioi_tinh'>
  >(() => new Set());
  const [serverVanDeSo, setServerVanDeSo] = useState<VanDeSo[]>([]);
  const [canhBaoConfirm, setCanhBaoConfirm] = useState<VanDeSo[] | null>(null);

  function markTouchedField(
    field: 'cccd' | 'ma_kcb' | 'so_dt' | 'nam_sinh' | 'gioi_tinh',
  ) {
    setTouchedSoFields((prev) => {
      if (prev.has(field)) return prev;
      const next = new Set(prev);
      next.add(field);
      return next;
    });
    if (field === 'cccd' || field === 'ma_kcb' || field === 'so_dt') {
      setServerVanDeSo((prev) => prev.filter((v) => v.truong !== field));
    } else if (field === 'nam_sinh' || field === 'gioi_tinh') {
      setServerVanDeSo((prev) => prev.filter((v) => v.truong !== 'cccd'));
    }
  }

  const parsedNamSinhLive = useMemo(() => {
    const n = Number(formNamSinh);
    return formNamSinh.trim() !== '' && Number.isInteger(n) ? n : null;
  }, [formNamSinh]);

  const liveVanDeSo = useMemo(
    () =>
      kiemTraSo({
        cccd: formCccd,
        ma_kcb: formMaKcb,
        so_dt: formSoDt,
        nam_sinh: parsedNamSinhLive,
        gioi_tinh: formGioiTinh,
      }),
    [formCccd, formMaKcb, formSoDt, parsedNamSinhLive, formGioiTinh],
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

  const truongDangSua = useMemo(() => {
    const set = new Set<'cccd' | 'ma_kcb' | 'so_dt' | 'nam_sinh' | 'gioi_tinh'>(
      touchedSoFields,
    );
    if (chiSo(formMaKcb) !== chiSo(hoSo.ma_kcb)) set.add('ma_kcb');
    if (chiSo(formCccd) !== chiSo(hoSo.cccd)) set.add('cccd');
    const sdtMoi = coSdt(formSoDt) ? chiSo(formSoDt) : '';
    const sdtCu = laySoDtHoSo(hoSo);
    if (sdtMoi !== sdtCu || formSoDt.trim() !== sdtCu) set.add('so_dt');
    if (parsedNamSinhLive !== null && parsedNamSinhLive !== hoSo.nam_sinh) {
      set.add('nam_sinh');
    }
    if (formGioiTinh !== hoSo.gioi_tinh) set.add('gioi_tinh');
    return set;
  }, [
    touchedSoFields,
    formMaKcb,
    hoSo,
    formCccd,
    formSoDt,
    parsedNamSinhLive,
    formGioiTinh,
  ]);

  const vanDeCuaLanSua = useMemo(
    () =>
      vanDeKhiSua(
        {
          cccd: formCccd,
          ma_kcb: formMaKcb,
          so_dt: formSoDt,
          nam_sinh: parsedNamSinhLive,
          gioi_tinh: formGioiTinh,
        },
        truongDangSua,
      ),
    [
      formCccd,
      formMaKcb,
      formSoDt,
      parsedNamSinhLive,
      formGioiTinh,
      truongDangSua,
    ],
  );

  const loiKhiSua = useMemo(() => {
    const fromLive = vanDeCuaLanSua.filter((v) => v.muc === 'loi');
    const fromServer = serverVanDeSo.filter((v) => v.muc === 'loi');
    const map = new Map<string, VanDeSo>();
    for (const v of [...fromLive, ...fromServer]) {
      map.set(`${v.truong}:${v.ma}:${v.thong_diep}`, v);
    }
    return Array.from(map.values());
  }, [vanDeCuaLanSua, serverVanDeSo]);

  const lyDoKhoaLuu =
    loiKhiSua.length > 0
      ? `Không thể lưu: ${loiKhiSua.map((v) => v.thong_diep).join('; ')}`
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

  async function submitSaveNhanThan(boQuaCanhBaoSo: boolean) {
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

    if (loiKhiSua.length > 0) {
      setFormError(loiKhiSua[0].thong_diep);
      return;
    }

    const body: HoSoSuaBody = {
      version: hoSo.version,
      ma_kcb: formMaKcb.trim(),
      ho_ten: trimmedHoTen,
      gioi_tinh: formGioiTinh,
      nam_sinh: parsedNamSinh,
      cccd: formCccd.trim(),
      so_dt: formSoDt.trim(),
      dia_chi_chi_tiet: formDiaChi.trim(),
      ghi_chu: formGhiChu.trim(),
      ...(boQuaCanhBaoSo ? { bo_qua_canh_bao_so: true } : {}),
    };

    setSavingForm(true);
    const res = await apiRequest<{ ho_so: HoSoDong }>(`/api/ho-so/${hoSo.id}`, {
      method: 'PATCH',
      body: JSON.stringify(body),
    });
    setSavingForm(false);

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

    setCanhBaoConfirm(null);
    setServerVanDeSo([]);
    onSuccess(res.data.ho_so);
    showToast('Đã lưu thay đổi thông tin hồ sơ', 'success');
  }

  async function handleSaveNhanThan(e: FormEvent) {
    e.preventDefault();
    await submitSaveNhanThan(false);
  }

  function handleSuaLaiCanhBao() {
    const first = canhBaoConfirm?.[0];
    setCanhBaoConfirm(null);
    if (!first) return;
    const idMap: Record<VanDeSo['truong'], string> = {
      ma_kcb: 'detail-ma-kcb',
      cccd: 'detail-cccd',
      so_dt: 'detail-so-dt',
    };
    const el = document.getElementById(idMap[first.truong]);
    if (el instanceof HTMLElement) {
      el.focus();
    }
  }

  const disableMove = !canEdit || hoSo.da_xac_nhan || movingHoSo;

  return (
    <form onSubmit={handleSaveNhanThan} className="detail-form">
      {hoSo.canh_bao && hoSo.canh_bao.length > 0 && (
        <div
          className="detail-warnings-box"
          role="region"
          aria-label="Danh sách cảnh báo của hồ sơ"
        >
          <h3 className="ref-info-title">
            Cảnh báo đối chiếu ({hoSo.canh_bao.length})
          </h3>
          <ul className="detail-warnings-list">
            {hoSo.canh_bao.map((code) => (
              <li key={code} className="detail-warning-item">
                <div className="detail-warning-head">
                  <span
                    className="chip chip-warning"
                    title={getCanhBaoTooltip(code, hoSo.cls_ghi_chu)}
                  >
                    {CANH_BAO_NHAN[code] ?? code}
                  </span>
                </div>
                <p className="detail-warning-desc">
                  {CANH_BAO_MO_TA[code] ?? code}
                </p>
                {code === 'CLS_LECH_NGUON' && hoSo.cls_ghi_chu && (
                  <p className="detail-warning-cls-extra">
                    Chi tiết lệch CLS: <strong>{hoSo.cls_ghi_chu}</strong>
                  </p>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

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
          inputMode="numeric"
          className={`form-input form-input-sm num ${inputStatusClass(maKcbIssues)}`}
          aria-invalid={maKcbIssues.some((v) => v.muc === 'loi') || undefined}
          value={formMaKcb}
          onChange={(e) => {
            markTouchedField('ma_kcb');
            setFormMaKcb(e.target.value);
          }}
          disabled={!canEdit || savingForm}
        />
        {renderFieldMessages(maKcbIssues)}
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
            onChange={(e) => {
              markTouchedField('gioi_tinh');
              setFormGioiTinh(e.target.value as 'Nam' | 'Nữ' | '');
            }}
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
            onChange={(e) => {
              markTouchedField('nam_sinh');
              setFormNamSinh(e.target.value);
            }}
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
          className={`form-input form-input-sm num ${inputStatusClass(cccdIssues)}`}
          aria-invalid={cccdIssues.some((v) => v.muc === 'loi') || undefined}
          value={formCccd}
          onChange={(e) => {
            markTouchedField('cccd');
            setFormCccd(e.target.value);
          }}
          disabled={!canEdit || savingForm}
        />
        {renderFieldMessages(cccdIssues)}
        {hoSo.src && hoSo.src.cccd !== hoSo.cccd && (
          <span className="src-diff-note">
            Gốc: {hoSo.src.cccd || '(trống)'}
          </span>
        )}
      </div>

      <div className="form-field">
        <label htmlFor="detail-so-dt" className="form-label">
          Số điện thoại (SĐT)
        </label>
        <input
          id="detail-so-dt"
          type="text"
          inputMode="numeric"
          className={`form-input form-input-sm num ${inputStatusClass(soDtIssues)}`}
          aria-invalid={soDtIssues.some((v) => v.muc === 'loi') || undefined}
          placeholder="Nhập 10 chữ số bắt đầu bằng 0"
          value={formSoDt}
          onChange={(e) => {
            markTouchedField('so_dt');
            setFormSoDt(e.target.value);
          }}
          disabled={!canEdit || savingForm}
        />
        {renderFieldMessages(soDtIssues)}
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

      {lyDoKhoaLuu && (
        <div className="save-disabled-reason" role="status">
          {lyDoKhoaLuu}
        </div>
      )}

      <button
        type="submit"
        className="btn btn-primary btn-block desktop-only-save-btn"
        disabled={!canEdit || savingForm || loiKhiSua.length > 0}
        title={lyDoKhoaLuu || undefined}
      >
        {savingForm ? 'Đang lưu…' : 'Lưu thay đổi'}
      </button>

      <div className="detail-move-box" role="region" aria-label="Chuyển hồ sơ">
        <div className="detail-move-header">
          <h3 className="ref-info-title">Chuyển hồ sơ</h3>
          {hoSo.da_xac_nhan && (
            <span className="move-locked-hint">
              Bỏ xác nhận trước khi chuyển
            </span>
          )}
        </div>
        <div className="detail-move-actions">
          <button
            type="button"
            className="btn btn-secondary btn-xs"
            disabled={disableMove}
            title={
              hoSo.da_xac_nhan
                ? 'Bỏ xác nhận trước khi chuyển'
                : 'Đưa hồ sơ vào kho cá nhân của bạn (Phím tắt K)'
            }
            onClick={() => onMoveToKhoCaNhan(hoSo)}
          >
            Đưa vào kho của tôi (K)
          </button>
          <button
            type="button"
            className="btn btn-secondary btn-xs"
            disabled={disableMove}
            title={
              hoSo.da_xac_nhan
                ? 'Bỏ xác nhận trước khi chuyển'
                : 'Đưa hồ sơ vào kho chờ chung (Phím tắt C)'
            }
            onClick={() => onOpenKhoChungModal(hoSo)}
          >
            Đưa vào kho chờ chung (C)
          </button>
          <button
            type="button"
            className="btn btn-secondary btn-xs"
            disabled={disableMove}
            title={
              hoSo.da_xac_nhan
                ? 'Bỏ xác nhận trước khi chuyển'
                : 'Chuyển hồ sơ sang buổi khám khác'
            }
            onClick={() => onOpenChuyenBuoiModal(hoSo)}
          >
            Chuyển sang buổi khác…
          </button>
        </div>
      </div>

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
            <dt>Có trong {NHAN.TT_KSK}:</dt>
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

      {/* Thanh nút Đóng / Lưu dính đáy trên điện thoại */}
      <div className="detail-mobile-sticky-bar">
        {onCloseDetail && (
          <button
            type="button"
            className="btn btn-secondary detail-mobile-btn"
            onClick={onCloseDetail}
          >
            Đóng
          </button>
        )}
        <button
          type="submit"
          className="btn btn-primary detail-mobile-btn"
          disabled={!canEdit || savingForm || loiKhiSua.length > 0}
          title={lyDoKhoaLuu || undefined}
        >
          {savingForm ? 'Đang lưu…' : 'Lưu thay đổi'}
        </button>
      </div>

      {canhBaoConfirm && canhBaoConfirm.length > 0 && (
        <div
          className="modal-backdrop"
          role="alertdialog"
          aria-modal="true"
          aria-labelledby="modal-canh-bao-so-title"
        >
          <div className="modal-card">
            <div className="modal-header">
              <h2 id="modal-canh-bao-so-title" className="modal-title">
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
                disabled={savingForm}
              >
                Sửa lại
              </button>
              <button
                type="button"
                className="btn btn-primary btn-sm"
                onClick={() => void submitSaveNhanThan(true)}
                disabled={savingForm}
              >
                {savingForm ? 'Đang lưu…' : 'Vẫn lưu'}
              </button>
            </div>
          </div>
        </div>
      )}
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

export function RaSoatView({ maBuoi, isAdmin = false, currentUserId }: RaSoatViewProps) {
  const { showToast } = useToast();
  const searchParams = useSearchParams();
  const chonParam = searchParams.get('chon');

  const [buoi, setBuoi] = useState<BuoiTomTat | null>(null);
  const [hoSoList, setHoSoList] = useState<HoSoDong[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string>('');
  const [errorStatus, setErrorStatus] = useState<number>(0);

  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [drawerOpen, setDrawerOpen] = useState<boolean>(false);
  const [activeTab, setActiveTab] = useState<'thong_tin' | 'lich_su'>('thong_tin');

  const [boLoc, setBoLoc] = useState<BoLoc>(() => docBoLocSession(maBuoi).boLoc);
  const [searchQuery, setSearchQuery] = useState<string>(
    () => docBoLocSession(maBuoi).q,
  );
  const [debouncedQuery, setDebouncedQuery] = useState<string>(
    () => docBoLocSession(maBuoi).q,
  );
  const [chiCoCanhBao, setChiCoCanhBao] = useState<boolean>(
    () => docBoLocSession(maBuoi).chiCoCanhBao,
  );

  // Set id giữ tạm: khi sửa CLS/xác nhận/nhân thân mà dòng không còn khớp bộ lọc,
  // giữ dòng đó hiển thị tới khi đổi bộ lọc hoặc chọn dòng khác.
  const [giuTamIds, setGiuTamIds] = useState<Set<number>>(() => new Set());
  const [choChuyenIds, setChoChuyenIds] = useState<Set<number>>(() => new Set());

  const [busyRowIds, setBusyRowIds] = useState<Record<number, boolean>>({});
  const [movingHoSo, setMovingHoSo] = useState<boolean>(false);

  // Hộp thoại Phase 4
  const [khoChungTarget, setKhoChungTarget] = useState<HoSoDong | null>(null);
  const [chuyenBuoiTarget, setChuyenBuoiTarget] = useState<HoSoDong | null>(null);
  const [showThemHoSo, setShowThemHoSo] = useState<boolean>(false);
  const [showXacNhanBuoi, setShowXacNhanBuoi] = useState<boolean>(false);
  const [showMoKhoaBuoi, setShowMoKhoaBuoi] = useState<boolean>(false);

  const tableBodyRef = useRef<HTMLTableSectionElement | null>(null);
  const tableScrollRef = useRef<HTMLDivElement | null>(null);
  const searchInputRef = useRef<HTMLInputElement | null>(null);

  // Lưu bộ lọc + ô tìm vào sessionStorage theo khóa loc:<ma_buoi>
  useEffect(() => {
    ghiBoLocSession(maBuoi, boLoc, searchQuery, chiCoCanhBao);
  }, [maBuoi, boLoc, searchQuery, chiCoCanhBao]);

  // Tìm mờ tại chỗ (trễ ~120 ms, không cần mạng); xóa tìm kiếm áp dụng ngay qua effectiveQuery.
  useEffect(() => {
    const timer = window.setTimeout(
      () => {
        setDebouncedQuery(searchQuery);
      },
      coTheTim(searchQuery) ? 120 : 0,
    );
    return () => window.clearTimeout(timer);
  }, [searchQuery]);

  const effectiveQuery = coTheTim(searchQuery) ? debouncedQuery : '';
  const { idsKhop: activeIdsKhop, danhDauMap } = useMemo(
    () => timMoDanhSachHoSo(hoSoList, effectiveQuery),
    [hoSoList, effectiveQuery],
  );

  const loadChoChuyenIds = useCallback(async () => {
    const res = await apiRequest<{ de_nghi: DeNghiChuyen[] }>(
      '/api/de-nghi-chuyen?trang_thai=cho_xu_ly',
    );
    if (!res.ok) return;
    const ids = new Set<number>();
    for (const d of res.data.de_nghi ?? []) {
      if (d.trang_thai === 'cho_xu_ly') {
        ids.add(d.ho_so.id);
      }
    }
    setChoChuyenIds(ids);
  }, []);

  const reloadBuoiHoSo = useCallback(async () => {
    setLoading(true);
    setError('');
    setErrorStatus(0);

    const [res] = await Promise.all([
      apiRequest<{ buoi: BuoiTomTat; ho_so: HoSoDong[] }>(
        `/api/buoi/${encodeURIComponent(maBuoi)}/ho-so`,
      ),
      loadChoChuyenIds(),
    ]);

    if (!res.ok) {
      setError(res.error);
      setErrorStatus(res.status);
      setLoading(false);
      return;
    }

    setBuoi(res.data.buoi);
    setHoSoList(res.data.ho_so ?? []);
    setLoading(false);
  }, [loadChoChuyenIds, maBuoi]);

  useEffect(() => {
    let cancelled = false;
    apiRequest<{ de_nghi: DeNghiChuyen[] }>(
      '/api/de-nghi-chuyen?trang_thai=cho_xu_ly',
    ).then((res) => {
      if (cancelled || !res.ok) return;
      const ids = new Set<number>();
      for (const d of res.data.de_nghi ?? []) {
        if (d.trang_thai === 'cho_xu_ly') {
          ids.add(d.ho_so.id);
        }
      }
      setChoChuyenIds(ids);
    });
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
      const loadedHoSo = res.data.ho_so ?? [];
      setBuoi(res.data.buoi);
      setHoSoList(loadedHoSo);

      // Xử lý ?chon=<id> ngay khi dữ liệu tải xong
      const parsedChon = chonParam ? Number(chonParam) : NaN;
      if (Number.isInteger(parsedChon) && parsedChon > 0) {
        const target = loadedHoSo.find((h) => h.id === parsedChon);
        if (target) {
          const saved = docBoLocSession(maBuoi);
          if (
            !khopBoLoc(target, saved.boLoc) ||
            coTheTim(saved.q) ||
            (saved.chiCoCanhBao && target.canh_bao.length === 0)
          ) {
            setBoLoc(cloneBoLocMacDinh());
            setSearchQuery('');
            setDebouncedQuery('');
            setChiCoCanhBao(false);
            setGiuTamIds(new Set());
          }
          setSelectedId(parsedChon);
        }
      }

      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [maBuoi, chonParam]);

  // Cuộn tới dòng ?chon=<id> sau khi bảng hiển thị xong
  useEffect(() => {
    if (loading || !chonParam) return;
    const parsedChon = Number(chonParam);
    if (!Number.isInteger(parsedChon) || parsedChon <= 0) return;

    const timer = window.setTimeout(() => {
      const rowEl = tableBodyRef.current?.querySelector(
        `tr[data-hoso-id="${parsedChon}"]`,
      );
      rowEl?.scrollIntoView({ block: 'center' });
    }, 30);

    return () => window.clearTimeout(timer);
  }, [loading, chonParam]);

  // Bản đồ STT gốc (1-based) trên toàn danh sách buổi khám
  const sttGocMap = useMemo(() => {
    const map = new Map<number, number>();
    hoSoList.forEach((h, idx) => {
      map.set(h.id, idx + 1);
    });
    return map;
  }, [hoSoList]);

  // Danh sách khớp bộ lọc + tìm kiếm + lọc nhanh "Có cảnh báo", kết hợp các dòng đang giữ tạm
  const danhSachKhop = useMemo(
    () =>
      locHoSoKetHopCanhBao(hoSoList, boLoc, activeIdsKhop, chiCoCanhBao),
    [hoSoList, boLoc, activeIdsKhop, chiCoCanhBao],
  );

  const danhSachHienThi = useMemo(() => {
    if (giuTamIds.size === 0) return danhSachKhop;
    const khopIds = new Set(danhSachKhop.map((h) => h.id));
    return hoSoList.filter((h) => khopIds.has(h.id) || giuTamIds.has(h.id));
  }, [hoSoList, danhSachKhop, giuTamIds]);

  // Nếu dòng đang chọn bị lọc mất → tự chọn dòng đầu của kết quả
  const effectiveSelectedId = useMemo(() => {
    if (danhSachHienThi.length === 0) return null;
    if (
      selectedId !== null &&
      danhSachHienThi.some((h) => h.id === selectedId)
    ) {
      return selectedId;
    }
    return danhSachHienThi[0].id;
  }, [danhSachHienThi, selectedId]);

  const selectedHoSo = useMemo(() => {
    if (effectiveSelectedId === null) return null;
    return danhSachHienThi.find((h) => h.id === effectiveSelectedId) ?? null;
  }, [danhSachHienThi, effectiveSelectedId]);

  const handleChangeBoLoc = useCallback((next: BoLoc) => {
    setBoLoc(next);
    setGiuTamIds(new Set());
  }, []);

  const handleChangeChiCoCanhBao = useCallback((val: boolean) => {
    setChiCoCanhBao(val);
    setGiuTamIds(new Set());
  }, []);

  const handleChangeSearch = useCallback((val: string) => {
    setSearchQuery(val);
    setSelectedId(null);
    if (!coTheTim(val)) {
      setDebouncedQuery(val);
    }
    setGiuTamIds(new Set());
  }, []);

  const handleClearSearch = useCallback(() => {
    setSearchQuery('');
    setDebouncedQuery('');
    setSelectedId(null);
    setGiuTamIds(new Set());
  }, []);

  const handleResetAllFilters = useCallback(() => {
    setBoLoc(cloneBoLocMacDinh());
    setSearchQuery('');
    setDebouncedQuery('');
    setSelectedId(null);
    setChiCoCanhBao(false);
    setGiuTamIds(new Set());
  }, []);

  // Single click only selects (keeps CLS + confirm columns in view); double-click / Enter opens the detail pane.
  const handleSelectRow = useCallback(
    (id: number) => {
      if (effectiveSelectedId !== id) {
        setGiuTamIds(new Set());
      }
      setSelectedId(id);
    },
    [effectiveSelectedId],
  );

  const handleOpenDetail = useCallback(
    (id: number) => {
      if (effectiveSelectedId !== id) {
        setGiuTamIds(new Set());
      }
      setSelectedId(id);
      setDrawerOpen(true);
    },
    [effectiveSelectedId],
  );

  const selectAndHoldRow = useCallback(
    (id: number) => {
      setSelectedId(id);
      setGiuTamIds((prev) => {
        if (effectiveSelectedId !== id) {
          return new Set([id]);
        }
        if (prev.has(id)) return prev;
        const next = new Set(prev);
        next.add(id);
        return next;
      });
    },
    [effectiveSelectedId],
  );

  const replaceHoSoInList = useCallback((updated: HoSoDong) => {
    setHoSoList((prev) =>
      prev.map((item) => (item.id === updated.id ? updated : item)),
    );
  }, []);

  const handleFormSaveSuccess = useCallback(
    (updated: HoSoDong) => {
      selectAndHoldRow(updated.id);
      replaceHoSoInList(updated);
    },
    [replaceHoSoInList, selectAndHoldRow],
  );

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

      selectAndHoldRow(hoSo.id);
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
    [
      buoi?.co_quyen_sua,
      busyRowIds,
      handleWriteError,
      replaceHoSoInList,
      selectAndHoldRow,
    ],
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
      selectAndHoldRow(hoSo.id);
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
    [
      buoi?.co_quyen_sua,
      busyRowIds,
      handleWriteError,
      replaceHoSoInList,
      selectAndHoldRow,
    ],
  );

  // Hoàn tác chuyển hồ sơ (nhận về lại buổi này)
  const handleUndoMove = useCallback(
    async (hoSoId: number, movedVersion: number) => {
      const res = await apiRequest<{
        ho_so: KetQuaTimKiem;
        buoi_cu: BuoiTomTat | null;
        buoi_moi: BuoiTomTat | null;
      }>(`/api/ho-so/${hoSoId}/nhan-ve`, {
        method: 'POST',
        body: JSON.stringify({
          version: movedVersion,
          buoi: maBuoi,
        }),
      });

      if (!res.ok) {
        showToast(`Không hoàn tác được: ${res.error}`, 'error');
        return;
      }

      notifyPoolChanged();
      await reloadBuoiHoSo();
      setSelectedId(hoSoId);
      showToast('Đã hoàn tác, đưa hồ sơ về lại buổi khám.', 'success');
    },
    [maBuoi, reloadBuoiHoSo, showToast],
  );

  // Thực hiện chuyển hồ sơ (vào kho của tôi / kho chờ chung / buổi khác)
  const executeChuyenHoSo = useCallback(
    async (
      hoSo: HoSoDong,
      body: ChuyenBody,
      successMsg: string,
    ): Promise<boolean> => {
      if (!buoi?.co_quyen_sua) return false;
      if (hoSo.da_xac_nhan) {
        showToast('Bỏ xác nhận trước khi chuyển.', 'warning');
        return false;
      }

      setMovingHoSo(true);
      const res = await apiRequest<{
        ho_so: KetQuaTimKiem;
        buoi_cu: BuoiTomTat | null;
        buoi_moi: BuoiTomTat | null;
      }>(`/api/ho-so/${hoSo.id}/chuyen`, {
        method: 'POST',
        body: JSON.stringify(body),
      });
      setMovingHoSo(false);

      if (!res.ok) {
        handleWriteError(res, hoSo);
        return false;
      }

      // Xóa dòng khỏi bảng, cập nhật thanh chỉ số từ buoi_cu
      setHoSoList((prev) => prev.filter((item) => item.id !== hoSo.id));
      setGiuTamIds((prev) => {
        if (!prev.has(hoSo.id)) return prev;
        const next = new Set(prev);
        next.delete(hoSo.id);
        return next;
      });
      if (res.data.buoi_cu) {
        setBuoi(res.data.buoi_cu);
      }
      notifyPoolChanged();

      const movedHoSo = res.data.ho_so;
      const canUndo =
        movedHoSo.vi_tri === 'kho_ca_nhan' ||
        movedHoSo.vi_tri === 'kho_chung' ||
        Boolean(movedHoSo.co_quyen_sua);

      showToast(
        successMsg,
        'success',
        canUndo
          ? {
              label: 'Hoàn tác',
              onClick: () => {
                void handleUndoMove(movedHoSo.id, movedHoSo.version);
              },
            }
          : undefined,
      );
      return true;
    },
    [buoi?.co_quyen_sua, handleUndoMove, handleWriteError, showToast],
  );

  const handleMoveToKhoCaNhan = useCallback(
    async (hoSo: HoSoDong) => {
      await executeChuyenHoSo(
        hoSo,
        {
          version: hoSo.version,
          den: 'kho_ca_nhan',
        },
        `Đã đưa hồ sơ #${hoSo.id} vào Kho của tôi.`,
      );
    },
    [executeChuyenHoSo],
  );

  const handleConfirmKhoChung = useCallback(
    async (lyDo: string) => {
      if (!khoChungTarget) return;
      const ok = await executeChuyenHoSo(
        khoChungTarget,
        {
          version: khoChungTarget.version,
          den: 'kho_chung',
          ly_do: lyDo || undefined,
        },
        `Đã đưa hồ sơ #${khoChungTarget.id} vào Kho chờ chung.`,
      );
      if (ok) {
        setKhoChungTarget(null);
      }
    },
    [executeChuyenHoSo, khoChungTarget],
  );

  const handleConfirmChuyenBuoi = useCallback(
    async (buoiDich: string, lyDo: string, targetBuoi?: BuoiTomTat) => {
      if (!chuyenBuoiTarget) return;

      // Nhân viên chọn buổi của người khác (!co_quyen_sua) → gửi đề nghị chuyển 'gui_di'
      if (!isAdmin && targetBuoi && !targetBuoi.co_quyen_sua) {
        if (chuyenBuoiTarget.da_xac_nhan) {
          showToast('Bỏ xác nhận trước khi chuyển.', 'warning');
          return;
        }
        setMovingHoSo(true);
        const body: {
          ho_so_id: number;
          den_buoi: string;
          ly_do: string;
          loai: LoaiDeNghi;
        } = {
          ho_so_id: chuyenBuoiTarget.id,
          den_buoi: buoiDich,
          ly_do: lyDo,
          loai: 'gui_di',
        };
        const res = await apiRequest<{ de_nghi: DeNghiChuyen }>(
          '/api/de-nghi-chuyen',
          {
            method: 'POST',
            body: JSON.stringify(body),
          },
        );
        setMovingHoSo(false);

        if (!res.ok) {
          showToast(res.error, 'error');
          return;
        }

        const hoSoId = chuyenBuoiTarget.id;
        setChuyenBuoiTarget(null);
        notifyPoolChanged();

        if (res.data.de_nghi.trang_thai === 'dong_y') {
          setHoSoList((prev) => prev.filter((item) => item.id !== hoSoId));
          setGiuTamIds((prev) => {
            if (!prev.has(hoSoId)) return prev;
            const next = new Set(prev);
            next.delete(hoSoId);
            return next;
          });
          void reloadBuoiHoSo();
          showToast(
            `Đã chuyển hồ sơ #${hoSoId} sang buổi ${buoiDich}.`,
            'success',
          );
          return;
        }

        setChoChuyenIds((prev) => {
          const next = new Set(prev);
          next.add(hoSoId);
          return next;
        });
        const tenPhuTrach =
          targetBuoi.phu_trach?.ho_ten ??
          res.data.de_nghi.nguoi_duyet?.ho_ten ??
          'người phụ trách buổi đó';
        showToast(
          `Đã gửi đề nghị, chờ ${tenPhuTrach} chấp nhận`,
          'success',
        );
        return;
      }

      const ok = await executeChuyenHoSo(
        chuyenBuoiTarget,
        {
          version: chuyenBuoiTarget.version,
          den: 'buoi',
          buoi: buoiDich,
          ly_do: lyDo,
        },
        `Đã chuyển hồ sơ #${chuyenBuoiTarget.id} sang buổi khác.`,
      );
      if (ok) {
        setChuyenBuoiTarget(null);
      }
    },
    [chuyenBuoiTarget, executeChuyenHoSo, isAdmin, reloadBuoiHoSo, showToast],
  );

  const handleCreatedNewHoSo = useCallback(
    (newHoSo: HoSoDong, updatedBuoi: BuoiTomTat) => {
      setShowThemHoSo(false);
      setBuoi(updatedBuoi);
      setHoSoList((prev) => [...prev, newHoSo]);
      selectAndHoldRow(newHoSo.id);
      window.setTimeout(() => {
        const rowEl = tableBodyRef.current?.querySelector(
          `tr[data-hoso-id="${newHoSo.id}"]`,
        );
        rowEl?.scrollIntoView({ block: 'center' });
      }, 40);
    },
    [selectAndHoldRow],
  );

  const handlePulledFromPool = useCallback(
    (hoSoId: number, updatedBuoi: BuoiTomTat | null) => {
      setShowThemHoSo(false);
      if (updatedBuoi) {
        setBuoi(updatedBuoi);
      }
      notifyPoolChanged();
      void reloadBuoiHoSo().then(() => {
        setSelectedId(hoSoId);
      });
    },
    [reloadBuoiHoSo],
  );

  const handleConfirmBuoiAction = useCallback(
    async (giaiTrinh: string) => {
      setMovingHoSo(true);
      const res = await apiRequest<{ buoi: BuoiTomTat }>(
        `/api/buoi/${encodeURIComponent(maBuoi)}/xac-nhan`,
        {
          method: 'POST',
          body: JSON.stringify({
            giai_trinh: giaiTrinh || undefined,
          }),
        },
      );
      setMovingHoSo(false);

      if (!res.ok) {
        showToast(res.error, 'error');
        return;
      }

      setBuoi(res.data.buoi);
      setShowXacNhanBuoi(false);
      showToast('Đã xác nhận rà soát xong và khóa danh sách buổi khám.', 'success');
    },
    [maBuoi, showToast],
  );

  const handleMoKhoaBuoiAction = useCallback(
    async (lyDo: string) => {
      setMovingHoSo(true);
      const res = await apiRequest<{ buoi: BuoiTomTat }>(
        `/api/buoi/${encodeURIComponent(maBuoi)}/mo-khoa`,
        {
          method: 'POST',
          body: JSON.stringify({ ly_do: lyDo }),
        },
      );
      setMovingHoSo(false);

      if (!res.ok) {
        showToast(res.error, 'error');
        return;
      }

      setBuoi(res.data.buoi);
      setShowMoKhoaBuoi(false);
      showToast('Đã hủy xác nhận danh sách — có thể sửa lại hồ sơ.', 'success');
    },
    [maBuoi, showToast],
  );

  const anyModalOpen =
    Boolean(khoChungTarget) ||
    Boolean(chuyenBuoiTarget) ||
    showThemHoSo ||
    showXacNhanBuoi ||
    showMoKhoaBuoi;

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (anyModalOpen) return;
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

      if (e.key === '/') {
        e.preventDefault();
        searchInputRef.current?.focus();
        searchInputRef.current?.select();
        return;
      }

      if (danhSachHienThi.length === 0) return;

      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        const currentIndex =
          effectiveSelectedId !== null
            ? danhSachHienThi.findIndex((h) => h.id === effectiveSelectedId)
            : -1;

        let nextIndex = 0;
        if (currentIndex === -1) {
          nextIndex = 0;
        } else if (e.key === 'ArrowDown') {
          nextIndex = Math.min(danhSachHienThi.length - 1, currentIndex + 1);
        } else {
          nextIndex = Math.max(0, currentIndex - 1);
        }

        const nextHoSo = danhSachHienThi[nextIndex];
        if (nextHoSo) {
          handleSelectRow(nextHoSo.id);
          const rowEl = tableBodyRef.current?.querySelector(
            `tr[data-hoso-id="${nextHoSo.id}"]`,
          );
          rowEl?.scrollIntoView({ block: 'nearest' });
        }
        return;
      }

      if (e.key === 'Enter') {
        if (effectiveSelectedId !== null && selectedHoSo) {
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
        return;
      }

      if (e.key === 'k' || e.key === 'K') {
        if (!buoi?.co_quyen_sua) return;
        e.preventDefault();
        if (selectedHoSo.da_xac_nhan) {
          showToast('Bỏ xác nhận trước khi chuyển', 'warning');
          return;
        }
        void handleMoveToKhoCaNhan(selectedHoSo);
        return;
      }

      if (e.key === 'c' || e.key === 'C') {
        if (!buoi?.co_quyen_sua) return;
        e.preventDefault();
        if (selectedHoSo.da_xac_nhan) {
          showToast('Bỏ xác nhận trước khi chuyển', 'warning');
          return;
        }
        setKhoChungTarget(selectedHoSo);
      }
    }

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [
    anyModalOpen,
    buoi?.co_quyen_sua,
    danhSachHienThi,
    drawerOpen,
    effectiveSelectedId,
    handleMoveToKhoCaNhan,
    handleSelectRow,
    handleToggleCls,
    handleToggleXacNhan,
    selectedHoSo,
    showToast,
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
  const isLocked = buoi.trang_thai === 'da_xac_nhan';
  // Owner 14/11/2026: the assignee can cancel their own list confirmation to fix records (admin: any list).
  const coTheHuyXacNhan =
    isAdmin || (currentUserId !== undefined && buoi.phu_trach?.id === currentUserId);
  const readOnlyReason = isLocked
    ? 'Danh sách đã xác nhận (đã khóa)'
    : 'Không phải buổi khám của bạn phụ trách';

  const canConfirmBuoi =
    canEdit && !isLocked && buoi.hien_co > 0 && buoi.chua_xac_nhan === 0;

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
            <div className="rasoat-search-box">
              <label htmlFor="rasoat-search-input" className="sr-only">
                Tìm kiếm hồ sơ trong buổi khám
              </label>
              <input
                ref={searchInputRef}
                id="rasoat-search-input"
                type="search"
                className={`form-input form-input-xs rasoat-search-input${searchQuery.length > 0 ? ' has-text' : ''}`}
                placeholder="Tìm họ tên, ghi chú, năm sinh, CCCD, mã KCB…"
                value={searchQuery}
                onChange={(e) => handleChangeSearch(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Escape') {
                    e.preventDefault();
                    e.stopPropagation();
                    handleClearSearch();
                    searchInputRef.current?.blur();
                    tableScrollRef.current?.focus();
                    return;
                  }

                  if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
                    e.preventDefault();
                    e.stopPropagation();
                    if (debouncedQuery !== searchQuery) {
                      setDebouncedQuery(searchQuery);
                    }
                    searchInputRef.current?.blur();
                    tableScrollRef.current?.focus();

                    const dsTucThi =
                      debouncedQuery === searchQuery
                        ? danhSachHienThi
                        : locHoSoKetHopCanhBao(
                            hoSoList,
                            boLoc,
                            timMoDanhSachHoSo(hoSoList, searchQuery).idsKhop,
                            chiCoCanhBao,
                          );
                    if (dsTucThi.length === 0) return;

                    const currentIndex =
                      selectedId !== null
                        ? dsTucThi.findIndex((h) => h.id === selectedId)
                        : -1;

                    let nextIndex = 0;
                    if (currentIndex === -1) {
                      nextIndex =
                        e.key === 'ArrowDown' ? 0 : dsTucThi.length - 1;
                    } else if (e.key === 'ArrowDown') {
                      nextIndex = Math.min(
                        dsTucThi.length - 1,
                        currentIndex + 1,
                      );
                    } else {
                      nextIndex = Math.max(0, currentIndex - 1);
                    }

                    const nextHoSo = dsTucThi[nextIndex];
                    if (nextHoSo) {
                      handleSelectRow(nextHoSo.id);
                      window.setTimeout(() => {
                        const rowEl = tableBodyRef.current?.querySelector(
                          `tr[data-hoso-id="${nextHoSo.id}"]`,
                        );
                        rowEl?.scrollIntoView({ block: 'nearest' });
                      }, 0);
                    }
                    return;
                  }

                  if (e.key === 'Enter') {
                    e.preventDefault();
                    e.stopPropagation();
                    if (debouncedQuery !== searchQuery) {
                      setDebouncedQuery(searchQuery);
                    }
                    searchInputRef.current?.blur();
                    tableScrollRef.current?.focus();

                    const dsTucThi =
                      debouncedQuery === searchQuery
                        ? danhSachHienThi
                        : locHoSoKetHopCanhBao(
                            hoSoList,
                            boLoc,
                            timMoDanhSachHoSo(hoSoList, searchQuery).idsKhop,
                            chiCoCanhBao,
                          );
                    if (dsTucThi.length === 0) return;

                    const firstHoSo = dsTucThi[0];
                    if (firstHoSo) {
                      handleSelectRow(firstHoSo.id);
                      window.setTimeout(() => {
                        const rowEl = tableBodyRef.current?.querySelector(
                          `tr[data-hoso-id="${firstHoSo.id}"]`,
                        );
                        rowEl?.scrollIntoView({ block: 'nearest' });
                      }, 0);
                    }
                  }
                }}
              />
              {searchQuery && (
                <button
                  type="button"
                  className="rasoat-search-clear"
                  onClick={() => {
                    handleClearSearch();
                    searchInputRef.current?.focus();
                  }}
                  title="Xóa tìm kiếm (Esc)"
                  aria-label="Xóa nội dung tìm kiếm"
                >
                  ×
                </button>
              )}
            </div>

            <button
              type="button"
              className="btn btn-secondary btn-xs"
              disabled={!canEdit}
              title={
                !canEdit
                  ? readOnlyReason
                  : 'Thêm hồ sơ mới vào danh sách buổi khám'
              }
              onClick={() => setShowThemHoSo(true)}
            >
              + Thêm hồ sơ
            </button>

            {!isLocked && (
              <div className="toolbar-confirm-group">
                <button
                  type="button"
                  className="btn btn-primary btn-xs"
                  disabled={!canConfirmBuoi}
                  title={
                    !canEdit
                      ? readOnlyReason
                      : buoi.chua_xac_nhan > 0
                        ? `Còn ${buoi.chua_xac_nhan} hồ sơ chưa xác nhận`
                        : buoi.hien_co === 0
                          ? 'Danh sách chưa có hồ sơ'
                          : 'Xác nhận rà soát xong và khóa danh sách'
                  }
                  onClick={() => setShowXacNhanBuoi(true)}
                >
                  Xác nhận rà soát xong danh sách
                </button>
                {buoi.chua_xac_nhan > 0 && (
                  <span className="toolbar-confirm-hint">
                    Còn {formatNumber(buoi.chua_xac_nhan)} hồ sơ chưa xác nhận
                  </span>
                )}
              </div>
            )}

            {isLocked && coTheHuyXacNhan && (
              <button
                type="button"
                className="btn btn-secondary btn-xs"
                onClick={() => setShowMoKhoaBuoi(true)}
              >
                Hủy xác nhận danh sách
              </button>
            )}

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
            {NHAN.SO_DOAN}:{' '}
            <strong className="num">{formatNumber(buoi.so_doan_tong)}</strong>
          </span>
          <span className="metric-divider">|</span>
          <span className="metric-item">
            Trong danh sách:{' '}
            <strong className="num">{formatNumber(buoi.hien_co)}</strong>
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
            {buoi.thua > 0 && (
              <span className="metric-alert-tag"> (Lệch {NHAN.SO_DOAN})</span>
            )}
          </span>
          <span className="metric-divider">|</span>
          <span
            className={`metric-item ${buoi.thieu > 0 ? 'metric-alert' : ''}`}
          >
            Thiếu: <strong className="num">{formatNumber(buoi.thieu)}</strong>
            {buoi.thieu > 0 && (
              <span className="metric-alert-tag"> (Thiếu hồ sơ)</span>
            )}
          </span>
        </div>

        <RaSoatBoLoc
          hoSoList={hoSoList}
          soHienThi={danhSachHienThi.length}
          boLoc={boLoc}
          chiCoCanhBao={chiCoCanhBao}
          searchQuery={searchQuery}
          onChangeBoLoc={handleChangeBoLoc}
          onChangeChiCoCanhBao={handleChangeChiCoCanhBao}
          onResetAll={handleResetAllFilters}
        />

        {isLocked ? (
          <div className="rasoat-locked-banner" role="status">
            <div className="rasoat-locked-main">
              <strong>
                Đã xác nhận bởi {buoi.xac_nhan_by?.ho_ten ?? 'người phụ trách'} lúc{' '}
                {buoi.xac_nhan_at ? formatDateTime(buoi.xac_nhan_at) : '—'}
              </strong>
              {buoi.giai_trinh && (
                <span className="rasoat-locked-note">
                  · Giải trình chênh lệch: <em>{buoi.giai_trinh}</em>
                </span>
              )}
              <span className="text-muted">
                · Mọi ô chỉnh sửa nhân thân, CLS, chuyển và thêm hồ sơ đã khóa.
              </span>
            </div>
            {coTheHuyXacNhan && (
              <button
                type="button"
                className="btn btn-secondary btn-xs"
                onClick={() => setShowMoKhoaBuoi(true)}
              >
                Hủy xác nhận để sửa lại
              </button>
            )}
          </div>
        ) : (
          !canEdit && (
            <div className="rasoat-readonly-banner" role="status">
              <strong>Chỉ xem:</strong> {readOnlyReason}. Các nút chỉnh sửa cận lâm sàng, nhân thân và xác nhận đang khóa.
            </div>
          )
        )}
      </div>

      <div className={`rasoat-workspace${drawerOpen && selectedHoSo ? ' has-detail' : ''}`}>
        <div className="rasoat-table-pane">
          {hoSoList.length === 0 ? (
            <div className="state-box">
              <p className="state-title">
                Buổi khám này hiện chưa có hồ sơ nào trong danh sách.
              </p>
              <p className="state-desc">
                {NHAN.SO_DOAN} ghi nhận {formatNumber(buoi.so_doan_tong)} người.
              </p>
            </div>
          ) : danhSachHienThi.length === 0 ? (
            <div className="state-box" role="status">
              <p className="state-title">Không có hồ sơ khớp bộ lọc</p>
              <p className="state-desc">
                Đang hiển thị 0 / {formatNumber(hoSoList.length)} hồ sơ trong buổi khám. Hãy nới điều kiện lọc hoặc xóa bộ lọc.
              </p>
              <div className="state-actions">
                <button
                  type="button"
                  className="btn btn-primary btn-sm"
                  onClick={handleResetAllFilters}
                >
                  Xóa bộ lọc
                </button>
              </div>
            </div>
          ) : (
            <>
              {/* Danh sách thẻ rà soát trên điện thoại */}
              <div className="mobile-only-cards rasoat-card-list">
                {danhSachHienThi.map((h, index) => (
                  <HoSoMobileCard
                    key={h.id}
                    stt={sttGocMap.get(h.id) ?? index + 1}
                    hoSo={h}
                    danhDau={danhDauMap.get(h.id)}
                    isSelected={effectiveSelectedId === h.id}
                    canEdit={canEdit}
                    rowBusy={Boolean(busyRowIds[h.id])}
                    dangChoChuyen={choChuyenIds.has(h.id)}
                    onSelectRow={handleSelectRow}
                    onOpenDetail={handleOpenDetail}
                    onToggleCls={handleToggleCls}
                    onToggleXacNhan={handleToggleXacNhan}
                  />
                ))}
              </div>

              <div
                ref={tableScrollRef}
                tabIndex={-1}
                className="rasoat-table-scroll desktop-only-table"
              >
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
                      <th className="col-ghichu">Ghi chú</th>
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
                    {danhSachHienThi.map((h, index) => (
                      <HoSoRow
                        key={h.id}
                        stt={sttGocMap.get(h.id) ?? index + 1}
                        hoSo={h}
                        danhDau={danhDauMap.get(h.id)}
                        isSelected={effectiveSelectedId === h.id}
                        canEdit={canEdit}
                        rowBusy={Boolean(busyRowIds[h.id])}
                        dangChoChuyen={choChuyenIds.has(h.id)}
                        onSelectRow={handleSelectRow}
                        onOpenDetail={handleOpenDetail}
                        onToggleCls={handleToggleCls}
                        onToggleXacNhan={handleToggleXacNhan}
                      />
                    ))}
                  </tbody>
                </table>
              </div>
            </>
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
                  movingHoSo={movingHoSo}
                  onMoveToKhoCaNhan={handleMoveToKhoCaNhan}
                  onOpenKhoChungModal={(h) => setKhoChungTarget(h)}
                  onOpenChuyenBuoiModal={(h) => setChuyenBuoiTarget(h)}
                  onSuccess={handleFormSaveSuccess}
                  onCloseDetail={() => setDrawerOpen(false)}
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

      <footer className="rasoat-footer-bar" aria-label="Phím tắt và chú thích">
        <span className="rasoat-footer-shortcuts">
          <strong>Phím tắt:</strong> <kbd>/</kbd> tìm · <kbd>↓</kbd> hoặc{' '}
          <kbd>Enter</kbd>: từ ô tìm xuống danh sách · <kbd>↑</kbd>/<kbd>↓</kbd>{' '}
          chọn · <kbd>Space</kbd> xác nhận · <kbd>1</kbd>–<kbd>8</kbd> bật/tắt
          CLS · <kbd>K</kbd> kho cá nhân · <kbd>C</kbd> kho chung ·{' '}
          <kbd>Enter</kbd>/nhấp đúp: mở chi tiết
        </span>
        <span className="rasoat-footer-legend">
          <span>
            <span className="legend-box legend-diff" /> Viền cam: khác gốc
          </span>
          <span>
            <span className="legend-box legend-confirmed" /> Nền xanh: đã xác nhận
          </span>
          <span>· Rê chuột vào cảnh báo để xem mô tả</span>
        </span>
      </footer>

      {khoChungTarget && (
        <KhoChungConfirmModal
          key={khoChungTarget.id}
          open={true}
          hoSo={khoChungTarget}
          loading={movingHoSo}
          onCancel={() => setKhoChungTarget(null)}
          onConfirm={(lyDo) => void handleConfirmKhoChung(lyDo)}
        />
      )}

      {chuyenBuoiTarget && (
        <ChuyenBuoiModal
          key={chuyenBuoiTarget.id}
          open={true}
          hoSo={chuyenBuoiTarget}
          currentMaBuoi={maBuoi}
          isAdmin={isAdmin}
          loading={movingHoSo}
          onCancel={() => setChuyenBuoiTarget(null)}
          onConfirm={(buoiDich, lyDo, targetBuoi) =>
            void handleConfirmChuyenBuoi(buoiDich, lyDo, targetBuoi)
          }
        />
      )}

      {showThemHoSo && (
        <ThemHoSoModal
          open={true}
          maBuoi={maBuoi}
          tenBuoi={`${buoi.ten_don_vi} · ${formatDate(buoi.ngay_kham)}`}
          onClose={() => setShowThemHoSo(false)}
          onAdded={handleCreatedNewHoSo}
          onReceivedDuplicate={handlePulledFromPool}
          onSelectExistingInBuoi={(hoSoId) => {
            setShowThemHoSo(false);
            selectAndHoldRow(hoSoId);
            window.setTimeout(() => {
              const rowEl = tableBodyRef.current?.querySelector(
                `tr[data-hoso-id="${hoSoId}"]`,
              );
              rowEl?.scrollIntoView({ block: 'center' });
            }, 40);
          }}
        />
      )}

      {showXacNhanBuoi && (
        <XacNhanBuoiModal
          open={true}
          buoi={buoi}
          loading={movingHoSo}
          onCancel={() => setShowXacNhanBuoi(false)}
          onConfirm={(giaiTrinh) => void handleConfirmBuoiAction(giaiTrinh)}
        />
      )}

      {showMoKhoaBuoi && (
        <MoKhoaBuoiModal
          open={true}
          buoi={buoi}
          loading={movingHoSo}
          onCancel={() => setShowMoKhoaBuoi(false)}
          onConfirm={(lyDo) => void handleMoKhoaBuoiAction(lyDo)}
        />
      )}
    </div>
  );
}
