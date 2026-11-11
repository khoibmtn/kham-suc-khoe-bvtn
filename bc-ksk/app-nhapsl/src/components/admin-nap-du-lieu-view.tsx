'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import type { KeHoachNap, TongDonVi } from '@/lib/api-types';
import { NHAN, type DonVi } from '@/lib/cls';
import { apiRequest } from '@/lib/client/api';
import {
  formatChenhLech,
  formatDateTime,
  formatFileSizeKB,
  formatFileSizeMB,
  formatNumber,
  formatTomTatLichSuNap,
  formatXacNhanGhiGoi,
  getTenDonVi,
  getTruongNhan,
  GIOI_HAN_GOI_WEB_BYTES,
  isTuChoiDoPhienBanCu,
  TEN_FILE_GOI_NAP,
  type TenFileGoiNap,
} from '@/lib/client/format';
import { notifyPoolChanged } from './app-shell';
import { ConfirmDialog } from './confirm-dialog';
import { useToast } from './toast';

export type ImportApiPayload = {
  ok: boolean;
  errors: string[];
  warnings: string[];
  ke_hoach: KeHoachNap | null;
};

export type LanNapItem = {
  phien_ban: string;
  che_do: 'lan_dau' | 'nap_lai' | string;
  nap_boi: string | null;
  nap_luc: string | null;
  tom_tat: unknown;
};

type LichSuResponse = {
  lan_nap: LanNapItem[];
};

const FILE_MO_TA: Record<TenFileGoiNap, string> = {
  'manifest.json': 'Thông tin phiên bản gói, số dòng và mã kiểm toàn vẹn SHA-256',
  'buoi_kham.csv': `Danh sách các buổi khám và số liệu ${NHAN.SO_DOAN}`,
  'ho_so.csv': 'Danh sách hồ sơ người khám sức khỏe và 8 chỉ định CLS',
  'nguoi_dung.csv': 'Danh sách tài khoản người dùng gợi ý',
};

const DON_VI_ORDER: DonVi[] = ['TN', 'LK', 'VK'];
const MAX_VISIBLE_WARNINGS = 10;

function computeFilesSignature(
  filesMap: Partial<Record<TenFileGoiNap, File>>,
): string {
  return TEN_FILE_GOI_NAP.map((name) => {
    const f = filesMap[name];
    if (!f) return `${name}:missing`;
    return `${name}:${f.size}:${f.lastModified}`;
  }).join('|');
}

function sumTongDonVi(tong: TongDonVi): {
  so_buoi: number;
  so_doan: number;
  ho_so_trong_buoi: number;
} {
  let so_buoi = 0;
  let so_doan = 0;
  let ho_so_trong_buoi = 0;
  for (const dv of DON_VI_ORDER) {
    const row = tong[dv];
    if (row) {
      so_buoi += row.so_buoi ?? 0;
      so_doan += row.so_doan ?? 0;
      ho_so_trong_buoi += row.ho_so_trong_buoi ?? 0;
    }
  }
  return { so_buoi, so_doan, ho_so_trong_buoi };
}

export function AdminNapDuLieuView() {
  const { showToast } = useToast();
  const filesInputRef = useRef<HTMLInputElement | null>(null);
  const dirInputRef = useRef<HTMLInputElement | null>(null);

  // Bước 1: 4 file gói dữ liệu
  const [selectedFiles, setSelectedFiles] = useState<
    Partial<Record<TenFileGoiNap, File>>
  >({});
  const [hasInteractedWithFiles, setHasInteractedWithFiles] =
    useState<boolean>(false);
  const [ignoredFilesCount, setIgnoredFilesCount] = useState<number>(0);

  // Bước 2: Chạy thử
  const [loadingThu, setLoadingThu] = useState<boolean>(false);
  const [thuHttpError, setThuHttpError] = useState<string>('');
  const [ketQuaThu, setKetQuaThu] = useState<ImportApiPayload | null>(null);
  const [dryRunSignature, setDryRunSignature] = useState<string>('');
  const [dryRunUsedForce, setDryRunUsedForce] = useState<boolean>(false);
  const [forceChecked, setForceChecked] = useState<boolean>(false);
  const [expandWarnings, setExpandWarnings] = useState<boolean>(false);

  // Bước 3: Ghi dữ liệu
  const [confirmGhiOpen, setConfirmGhiOpen] = useState<boolean>(false);
  const [loadingGhi, setLoadingGhi] = useState<boolean>(false);
  const [ghiHttpError, setGhiHttpError] = useState<string>('');
  const [ketQuaGhi, setKetQuaGhi] = useState<ImportApiPayload | null>(null);

  // Lịch sử các lần nạp
  const [lichSu, setLichSu] = useState<LanNapItem[]>([]);
  const [loadingLichSu, setLoadingLichSu] = useState<boolean>(true);
  const [errorLichSu, setErrorLichSu] = useState<string>('');

  const loadLichSu = useCallback(async () => {
    setLoadingLichSu(true);
    setErrorLichSu('');
    const res = await apiRequest<LichSuResponse>('/api/import/lich-su');
    setLoadingLichSu(false);
    if (!res.ok) {
      setErrorLichSu(res.error);
      return;
    }
    setLichSu(Array.isArray(res.data.lan_nap) ? res.data.lan_nap : []);
  }, []);

  useEffect(() => {
    let cancelled = false;
    apiRequest<LichSuResponse>('/api/import/lich-su').then((res) => {
      if (cancelled) return;
      setLoadingLichSu(false);
      if (!res.ok) {
        setErrorLichSu(res.error);
        return;
      }
      setErrorLichSu('');
      setLichSu(Array.isArray(res.data.lan_nap) ? res.data.lan_nap : []);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const missingFiles = useMemo(
    () => TEN_FILE_GOI_NAP.filter((name) => !selectedFiles[name]),
    [selectedFiles],
  );

  const presentFilesCount = TEN_FILE_GOI_NAP.length - missingFiles.length;

  const totalBytes = useMemo(() => {
    let total = 0;
    for (const name of TEN_FILE_GOI_NAP) {
      const f = selectedFiles[name];
      if (f) total += f.size;
    }
    return total;
  }, [selectedFiles]);

  const isOverSizeLimit = totalBytes > GIOI_HAN_GOI_WEB_BYTES;

  const currentSignature = useMemo(
    () => computeFilesSignature(selectedFiles),
    [selectedFiles],
  );

  const filesUnchangedSinceDryRun =
    dryRunSignature !== '' && dryRunSignature === currentSignature;

  function handleFileListSelected(fileList: FileList | null) {
    if (!fileList || fileList.length === 0) return;

    const validSet = new Set<string>(TEN_FILE_GOI_NAP);
    const nextMap: Partial<Record<TenFileGoiNap, File>> = {};
    let ignored = 0;

    for (let i = 0; i < fileList.length; i++) {
      const file = fileList[i];
      if (!file) continue;
      const baseName = (file.name.split(/[\\/]/).pop() ?? file.name).trim();
      if (validSet.has(baseName)) {
        nextMap[baseName as TenFileGoiNap] = file;
      } else {
        ignored++;
      }
    }

    setHasInteractedWithFiles(true);
    setIgnoredFilesCount(ignored);
    setSelectedFiles(nextMap);

    // Mọi thay đổi tập file đều hủy kết quả chạy thử cũ để bắt buộc chạy thử lại trước khi ghi
    setThuHttpError('');
    setGhiHttpError('');
    setKetQuaThu(null);
    setKetQuaGhi(null);
    setDryRunSignature('');
    setDryRunUsedForce(false);
    setForceChecked(false);
    setExpandWarnings(false);
    setConfirmGhiOpen(false);
  }

  function handleClearFiles() {
    setSelectedFiles({});
    setHasInteractedWithFiles(false);
    setIgnoredFilesCount(0);
    setThuHttpError('');
    setGhiHttpError('');
    setKetQuaThu(null);
    setKetQuaGhi(null);
    setDryRunSignature('');
    setDryRunUsedForce(false);
    setForceChecked(false);
    setExpandWarnings(false);
    setConfirmGhiOpen(false);
    if (filesInputRef.current) filesInputRef.current.value = '';
    if (dirInputRef.current) dirInputRef.current.value = '';
  }

  function buildFormData(useForce: boolean): FormData | null {
    if (missingFiles.length > 0) return null;
    const fd = new FormData();
    for (const name of TEN_FILE_GOI_NAP) {
      const f = selectedFiles[name];
      if (!f) return null;
      fd.append(name, f, name);
    }
    if (useForce) {
      fd.append('force', '1');
    }
    return fd;
  }

  async function sendImportRequest(
    endpoint: '/api/import/thu' | '/api/import/ghi',
    useForce: boolean,
  ): Promise<
    | { ok: true; payload: ImportApiPayload }
    | { ok: false; errorMessage: string }
  > {
    const fd = buildFormData(useForce);
    if (!fd) {
      return {
        ok: false,
        errorMessage: `Thiếu file bắt buộc (${missingFiles.join(', ')}). Vui lòng chọn đủ 4 file của gói.`,
      };
    }

    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        body: fd,
        cache: 'no-store',
      });

      if (response.status === 401 && typeof window !== 'undefined') {
        const currentPath = `${window.location.pathname}${window.location.search}`;
        window.location.replace(
          `/dang-nhap?next=${encodeURIComponent(currentPath)}`,
        );
        return {
          ok: false,
          errorMessage: 'Chưa đăng nhập hoặc phiên làm việc đã hết hạn.',
        };
      }

      if (response.status === 413) {
        return {
          ok: false,
          errorMessage:
            'Gói quá lớn để tải qua web (lỗi 413 Payload Too Large), hãy nạp bằng lệnh npm run import trên máy admin.',
        };
      }

      const body = (await response.json().catch(() => null)) as Record<
        string,
        unknown
      > | null;

      if (
        body &&
        (Array.isArray(body.errors) ||
          Array.isArray(body.warnings) ||
          'ke_hoach' in body)
      ) {
        const payload: ImportApiPayload = {
          ok: Boolean(body.ok),
          errors: Array.isArray(body.errors)
            ? body.errors.map((e) => String(e))
            : [],
          warnings: Array.isArray(body.warnings)
            ? body.warnings.map((w) => String(w))
            : [],
          ke_hoach:
            body.ke_hoach && typeof body.ke_hoach === 'object'
              ? (body.ke_hoach as KeHoachNap)
              : null,
        };
        return { ok: true, payload };
      }

      const serverErr =
        body && typeof body.error === 'string' && body.error.trim()
          ? body.error.trim()
          : `Yêu cầu không thành công (mã HTTP ${response.status}).`;
      return { ok: false, errorMessage: serverErr };
    } catch {
      return {
        ok: false,
        errorMessage:
          'Không kết nối được tới máy chủ khi tải gói dữ liệu. Vui lòng kiểm tra mạng hoặc nạp bằng lệnh npm run import trên máy admin.',
      };
    }
  }

  async function handleChayThu(overrideForce?: boolean) {
    if (missingFiles.length > 0 || loadingThu || loadingGhi) return;
    const useForce = overrideForce !== undefined ? overrideForce : forceChecked;
    if (overrideForce !== undefined) {
      setForceChecked(overrideForce);
    }

    setLoadingThu(true);
    setThuHttpError('');
    setGhiHttpError('');
    setKetQuaGhi(null);
    setExpandWarnings(false);

    const sigAtStart = currentSignature;
    const result = await sendImportRequest('/api/import/thu', useForce);
    setLoadingThu(false);

    if (!result.ok) {
      setKetQuaThu(null);
      setDryRunSignature('');
      setThuHttpError(result.errorMessage);
      showToast(result.errorMessage, 'error');
      return;
    }

    setKetQuaThu(result.payload);
    setDryRunSignature(sigAtStart);
    setDryRunUsedForce(useForce);

    if (result.payload.errors.length > 0) {
      showToast(
        `Chạy thử phát hiện ${formatNumber(result.payload.errors.length)} lỗi trong gói dữ liệu`,
        'error',
      );
    } else if (result.payload.ke_hoach?.tu_choi) {
      showToast(
        `Từ chối nạp: ${result.payload.ke_hoach.tu_choi}`,
        'warning',
      );
    } else if (result.payload.ok && result.payload.ke_hoach) {
      showToast(
        `Chạy thử gói ${result.payload.ke_hoach.phien_ban} hợp lệ, sẵn sàng ghi dữ liệu`,
        'success',
      );
    }
  }

  async function handleConfirmGhi() {
    if (!canGhi || !ketQuaThu?.ke_hoach) return;

    setLoadingGhi(true);
    setGhiHttpError('');

    const result = await sendImportRequest(
      '/api/import/ghi',
      dryRunUsedForce,
    );
    setLoadingGhi(false);

    if (!result.ok) {
      setConfirmGhiOpen(false);
      setGhiHttpError(result.errorMessage);
      showToast(result.errorMessage, 'error');
      return;
    }

    const payload = result.payload;
    if (!payload.ok || payload.errors.length > 0 || payload.ke_hoach?.tu_choi) {
      setConfirmGhiOpen(false);
      setKetQuaThu(payload);
      const errMsg =
        payload.ke_hoach?.tu_choi ??
        payload.errors[0] ??
        'Không ghi được gói dữ liệu.';
      setGhiHttpError(errMsg);
      showToast(errMsg, 'error');
      return;
    }

    setConfirmGhiOpen(false);
    setKetQuaGhi(payload);
    // Sau khi đã ghi thành công, khóa nút Ghi dữ liệu cho đến khi chạy thử lại
    setDryRunSignature('');
    showToast(
      `Đã ghi thành công gói dữ liệu phiên bản ${payload.ke_hoach?.phien_ban ?? ketQuaThu.ke_hoach.phien_ban}`,
      'success',
    );
    notifyPoolChanged();
    void loadLichSu();
  }

  const keHoach = ketQuaThu?.ke_hoach ?? null;
  const tuChoi = keHoach?.tu_choi ?? null;
  const canShowForceOption =
    Boolean(tuChoi) &&
    (isTuChoiDoPhienBanCu(tuChoi) || keHoach?.che_do === 'nap_lai');

  const canGhi = Boolean(
    missingFiles.length === 0 &&
      !loadingThu &&
      !loadingGhi &&
      filesUnchangedSinceDryRun &&
      ketQuaThu &&
      ketQuaThu.ok &&
      ketQuaThu.errors.length === 0 &&
      keHoach &&
      keHoach.tu_choi === null,
  );

  const warningsList = ketQuaThu?.warnings ?? [];
  const visibleWarnings = expandWarnings
    ? warningsList
    : warningsList.slice(0, MAX_VISIBLE_WARNINGS);
  const hiddenWarningsCount = Math.max(
    0,
    warningsList.length - visibleWarnings.length,
  );

  const napLai = keHoach?.nap_lai ?? null;

  return (
    <div className="page-container">
      <div className="page-header-row">
        <div>
          <h1 className="page-title">Nạp gói dữ liệu Cowork</h1>
          <p className="page-subtitle">
            Kiểm tra hợp lệ, chạy thử để xem tóm tắt thay đổi và ghi gói dữ liệu
            theo đặc tả <code>nhapsl-import-1</code>.
          </p>
        </div>
        <div className="page-header-actions">
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={() => void loadLichSu()}
            disabled={loadingLichSu}
          >
            {loadingLichSu ? 'Đang tải…' : 'Tải lại lịch sử'}
          </button>
          <Link href="/admin" className="btn btn-secondary btn-sm">
            ← Về Tổng quan
          </Link>
        </div>
      </div>

      {/* BƯỚC 1: CHỌN GÓI DỮ LIỆU */}
      <section className="panel-card" aria-labelledby="step1-heading">
        <div className="panel-header-inline">
          <div>
            <h2 id="step1-heading" className="panel-title">
              Bước 1 — Chọn gói dữ liệu (4 file chuẩn)
            </h2>
            <p className="sub-text">
              Chọn lẻ 4 file (<code>manifest.json</code>,{' '}
              <code>buoi_kham.csv</code>, <code>ho_so.csv</code>,{' '}
              <code>nguoi_dung.csv</code>) hoặc chọn cả thư mục gói dữ liệu. Các
              file phụ như <code>.DS_Store</code> sẽ được tự động bỏ qua.
            </p>
          </div>
          {presentFilesCount > 0 && (
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={handleClearFiles}
              disabled={loadingThu || loadingGhi}
            >
              Xóa chọn lại
            </button>
          )}
        </div>

        <div className="import-picker-row">
          <div className="import-picker-box">
            <label htmlFor="import-files-input" className="form-label">
              Chọn 4 file lẻ (.csv, .json):
            </label>
            <input
              ref={filesInputRef}
              id="import-files-input"
              type="file"
              multiple
              accept=".csv,.json"
              className="import-file-input"
              disabled={loadingThu || loadingGhi}
              onChange={(e) => handleFileListSelected(e.target.files)}
            />
          </div>

          <div className="import-picker-box">
            <span className="form-label">Hoặc chọn nguyên thư mục gói:</span>
            <div className="import-dir-btn-row">
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                disabled={loadingThu || loadingGhi}
                onClick={() => dirInputRef.current?.click()}
              >
                Chọn cả thư mục gói
              </button>
              <input
                ref={dirInputRef}
                id="import-dir-input"
                type="file"
                multiple
                aria-label="Chọn cả thư mục gói"
                className="sr-only-input"
                disabled={loadingThu || loadingGhi}
                {...({
                  webkitdirectory: '',
                  directory: '',
                } as Record<string, string>)}
                onChange={(e) => handleFileListSelected(e.target.files)}
              />
              <span className="text-muted text-xs">
                (Ví dụ: <code>data/import/v1-20261111-1400</code>)
              </span>
            </div>
          </div>
        </div>

        {/* Bảng trạng thái 4 file */}
        <div className="table-wrap mt-2">
          <table
            className="data-table"
            aria-label="Danh sách 4 file trong gói dữ liệu"
          >
            <thead>
              <tr>
                <th>Tên file bắt buộc</th>
                <th>Nội dung</th>
                <th className="num-col">Dung lượng (KB)</th>
                <th>Trạng thái</th>
              </tr>
            </thead>
            <tbody>
              {TEN_FILE_GOI_NAP.map((fileName) => {
                const f = selectedFiles[fileName];
                return (
                  <tr key={fileName} className={f ? '' : 'row-muted'}>
                    <td className="font-semibold nowrap">
                      <code>{fileName}</code>
                    </td>
                    <td>{FILE_MO_TA[fileName]}</td>
                    <td className="num-col">
                      {f ? formatFileSizeKB(f.size) : '—'}
                    </td>
                    <td className="nowrap">
                      {f ? (
                        <span className="badge badge-success">✓ Đã có</span>
                      ) : (
                        <span className="badge badge-danger">Thiếu</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr className="row-total">
                <td colSpan={2}>
                  Tổng dung lượng 4 file đã chọn ({presentFilesCount}/4 file)
                  {ignoredFilesCount > 0 && (
                    <span className="text-muted font-normal ml-2">
                      (đã bỏ qua {formatNumber(ignoredFilesCount)} file khác
                      ngoài 4 file chuẩn)
                    </span>
                  )}
                </td>
                <td className="num-col">
                  {formatFileSizeKB(totalBytes)} ({formatFileSizeMB(totalBytes)})
                </td>
                <td className="nowrap">
                  {missingFiles.length === 0 ? (
                    <span className="badge badge-success">✓ Đủ 4/4 file</span>
                  ) : (
                    <span className="badge badge-warning">
                      Thiếu {missingFiles.length} file
                    </span>
                  )}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>

        {/* Báo thiếu file */}
        {missingFiles.length > 0 && (
          <div
            className={`import-notice-box ${hasInteractedWithFiles ? 'import-notice-error' : 'import-notice-warning'} mt-2`}
            role={hasInteractedWithFiles ? 'alert' : 'status'}
          >
            <strong>
              Thiếu {missingFiles.length}/4 file bắt buộc:{' '}
              {missingFiles.join(', ')}.
            </strong>{' '}
            Vui lòng chọn đủ 4 file chuẩn (<code>manifest.json</code>,{' '}
            <code>buoi_kham.csv</code>, <code>ho_so.csv</code>,{' '}
            <code>nguoi_dung.csv</code>) để mở khóa nút <strong>Chạy thử</strong>
            .
          </div>
        )}

        {/* Cảnh báo tổng dung lượng > 4,3 MB */}
        {isOverSizeLimit && (
          <div
            className="import-notice-box import-notice-warning mt-2"
            role="alert"
          >
            <strong>Cảnh báo dung lượng ({formatFileSizeMB(totalBytes)}):</strong>{' '}
            Gói quá lớn để tải qua web, hãy nạp bằng lệnh{' '}
            <code>npm run import</code> trên máy admin
          </div>
        )}
      </section>

      {/* BƯỚC 2: CHẠY THỬ & TÓM TẮT KẾ HOẠCH */}
      <section className="panel-card" aria-labelledby="step2-heading">
        <div className="panel-header-inline">
          <div>
            <h2 id="step2-heading" className="panel-title">
              Bước 2 — Chạy thử và kiểm tra tóm tắt
            </h2>
            <p className="sub-text">
              Chạy thử kiểm tra toàn vẹn SHA-256, cấu trúc cột và lập kế hoạch
              nạp (không ghi vào cơ sở dữ liệu).
            </p>
          </div>
          <div className="page-header-actions">
            <button
              type="button"
              className="btn btn-primary"
              disabled={missingFiles.length > 0 || loadingThu || loadingGhi}
              onClick={() => void handleChayThu()}
            >
              {loadingThu ? 'Đang chạy thử…' : 'Chạy thử'}
            </button>
          </div>
        </div>

        {thuHttpError && (
          <div
            className="import-notice-box import-notice-error mt-2"
            role="alert"
          >
            <p className="font-bold">Không thực hiện được chạy thử:</p>
            <p>{thuHttpError}</p>
          </div>
        )}

        {ketQuaThu && (
          <div className="import-results-stack mt-2">
            {/* 1. Danh sách lỗi (đỏ, có số lượng) */}
            {ketQuaThu.errors.length > 0 && (
              <div
                className="import-notice-box import-notice-error"
                role="alert"
              >
                <div className="import-box-header">
                  <strong>
                    Lỗi kiểm tra gói dữ liệu (
                    {formatNumber(ketQuaThu.errors.length)} lỗi) — Không thể ghi
                    dữ liệu
                  </strong>
                </div>
                <ul className="import-bullet-list">
                  {ketQuaThu.errors.map((err, idx) => (
                    <li key={idx}>{err}</li>
                  ))}
                </ul>
              </div>
            )}

            {/* 2. Danh sách cảnh báo (vàng, thu gọn nếu > 10) */}
            {warningsList.length > 0 && (
              <div
                className="import-notice-box import-notice-warning"
                role="status"
              >
                <div className="import-box-header">
                  <strong>
                    Cảnh báo khi kiểm tra gói ({formatNumber(warningsList.length)}{' '}
                    cảnh báo)
                  </strong>
                  {warningsList.length > MAX_VISIBLE_WARNINGS && (
                    <button
                      type="button"
                      className="btn btn-secondary btn-xs"
                      onClick={() => setExpandWarnings((prev) => !prev)}
                    >
                      {expandWarnings
                        ? `Thu gọn (chỉ hiện ${MAX_VISIBLE_WARNINGS} dòng đầu)`
                        : `Xem tất cả ${formatNumber(warningsList.length)} cảnh báo (+${formatNumber(hiddenWarningsCount)} mục)`}
                    </button>
                  )}
                </div>
                <ul className="import-bullet-list">
                  {visibleWarnings.map((w, idx) => (
                    <li key={idx}>{w}</li>
                  ))}
                </ul>
              </div>
            )}

            {/* 3. Khung từ chối (tu_choi !== null) */}
            {keHoach && tuChoi && (
              <div
                className="import-notice-box import-notice-error"
                role="alert"
              >
                <div className="import-box-header">
                  <strong>
                    Từ chối ghi dữ liệu gói phiên bản{' '}
                    <code>{keHoach.phien_ban}</code>:
                  </strong>
                </div>
                <p className="mt-2 font-semibold">{tuChoi}</p>

                {canShowForceOption && (
                  <div className="import-force-box mt-2">
                    <label className="checkbox-inline-label">
                      <input
                        type="checkbox"
                        checked={forceChecked}
                        disabled={loadingThu || loadingGhi}
                        onChange={(e) => setForceChecked(e.target.checked)}
                      />
                      <span>Bắt buộc nạp (force)</span>
                    </label>
                    <p className="sub-text mt-2">
                      <strong>Cảnh báo:</strong> Gói này có phiên bản cũ hơn
                      hoặc đã được nạp trước đó. Nếu bật{' '}
                      <strong>Bắt buộc nạp (force)</strong> và chạy thử lại với{' '}
                      <code>force=1</code>, hệ thống sẽ áp dụng quy tắc nạp lại
                      (vẫn bảo toàn mọi hồ sơ đã được nhân viên rà soát, chỉnh
                      sửa hoặc xác nhận).
                    </p>
                    <div className="mt-2">
                      <button
                        type="button"
                        className="btn btn-danger-outline btn-sm"
                        disabled={loadingThu || loadingGhi}
                        onClick={() => void handleChayThu(true)}
                      >
                        {loadingThu
                          ? 'Đang chạy thử…'
                          : 'Chạy thử lại với force=1'}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* 4. Tóm tắt kế hoạch nạp */}
            {keHoach && (
              <div className="import-plan-section">
                <div className="import-plan-banner">
                  <div className="import-plan-meta">
                    <span>
                      Phiên bản gói:{' '}
                      <strong className="font-bold">
                        {keHoach.phien_ban}
                      </strong>
                    </span>
                    <span
                      className={`badge ${keHoach.che_do === 'lan_dau' ? 'badge-primary' : 'badge-warning'}`}
                    >
                      {keHoach.che_do === 'lan_dau'
                        ? 'Chế độ: Nạp lần đầu'
                        : 'Chế độ: Nạp lại phiên bản mới'}
                    </span>
                    {dryRunUsedForce && (
                      <span className="badge badge-danger">
                        Đã bật force=1
                      </span>
                    )}
                    {!tuChoi && ketQuaThu.ok && ketQuaThu.errors.length === 0 ? (
                      <span className="badge badge-success">
                        ✓ Đủ điều kiện ghi dữ liệu
                      </span>
                    ) : (
                      <span className="badge badge-danger">
                        Đang khóa ghi dữ liệu
                      </span>
                    )}
                  </div>
                </div>

                {/* TRƯỜNG HỢP A: LẦN ĐẦU (hoặc khi nap_lai = null) */}
                {(keHoach.che_do === 'lan_dau' || !napLai) && (
                  <div className="mt-2">
                    <h3 className="import-sub-heading">
                      Tóm tắt nạp lần đầu (phiên bản {keHoach.phien_ban})
                    </h3>
                    <div className="summary-strip">
                      <div className="summary-card">
                        <span className="summary-label">Số buổi khám thêm</span>
                        <strong className="summary-value num">
                          {formatNumber(keHoach.buoi_them)}
                        </strong>
                        <span className="summary-sub">Buổi khám trong gói</span>
                      </div>

                      <div className="summary-card">
                        <span className="summary-label">Tổng hồ sơ thêm</span>
                        <strong className="summary-value num">
                          {formatNumber(keHoach.ho_so_them_tong)}
                        </strong>
                        <span className="summary-sub">
                          Trong buổi + kho chờ chung
                        </span>
                      </div>

                      <div className="summary-card">
                        <span className="summary-label">
                          Tài khoản (user) thêm mới
                        </span>
                        <strong className="summary-value num">
                          {formatNumber(keHoach.user_them.length)}
                        </strong>
                        <span className="summary-sub">
                          {keHoach.user_them.length > 0
                            ? keHoach.user_them.join(', ')
                            : 'Không có tài khoản mới'}
                        </span>
                      </div>
                    </div>

                    <h4 className="import-sub-heading">
                      Bảng tổng sau nạp theo đơn vị
                    </h4>
                    <div className="table-wrap">
                      <table
                        className="data-table"
                        aria-label="Bảng tổng sau nạp theo đơn vị"
                      >
                        <thead>
                          <tr>
                            <th>Đơn vị</th>
                            <th className="num-col">Số buổi</th>
                            <th className="num-col">{NHAN.SO_DOAN}</th>
                            <th className="num-col">Hồ sơ trong buổi</th>
                            <th className="num-col">
                              Chênh lệch so với {NHAN.SO_DOAN}
                            </th>
                          </tr>
                        </thead>
                        <tbody>
                          {DON_VI_ORDER.map((dv) => {
                            const row = keHoach.tong_sau_nap[dv] ?? {
                              so_buoi: 0,
                              so_doan: 0,
                              ho_so_trong_buoi: 0,
                            };
                            const diff = row.ho_so_trong_buoi - row.so_doan;
                            return (
                              <tr key={dv}>
                                <td className="font-semibold">
                                  {getTenDonVi(dv)} ({dv})
                                </td>
                                <td className="num-col">
                                  {formatNumber(row.so_buoi)}
                                </td>
                                <td className="num-col">
                                  {formatNumber(row.so_doan)}
                                </td>
                                <td className="num-col font-semibold">
                                  {formatNumber(row.ho_so_trong_buoi)}
                                </td>
                                <td className="num-col">
                                  {formatChenhLech(diff)}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                        <tfoot>
                          {(() => {
                            const sum = sumTongDonVi(keHoach.tong_sau_nap);
                            return (
                              <tr className="row-total">
                                <td>Cộng toàn đợt</td>
                                <td className="num-col">
                                  {formatNumber(sum.so_buoi)}
                                </td>
                                <td className="num-col">
                                  {formatNumber(sum.so_doan)}
                                </td>
                                <td className="num-col">
                                  {formatNumber(sum.ho_so_trong_buoi)}
                                </td>
                                <td className="num-col">
                                  {formatChenhLech(
                                    sum.ho_so_trong_buoi - sum.so_doan,
                                  )}
                                </td>
                              </tr>
                            );
                          })()}
                        </tfoot>
                      </table>
                    </div>
                  </div>
                )}

                {/* TRƯỜNG HỢP B: NẠP LẠI (có TomTatNapLai) */}
                {keHoach.che_do === 'nap_lai' && napLai && (
                  <div className="mt-2">
                    <h3 className="import-sub-heading">
                      Tóm tắt chi tiết nạp lại (phiên bản {keHoach.phien_ban})
                    </h3>

                    {/* Thẻ số liệu cho từng trường của TomTatNapLai */}
                    <div
                      className="summary-strip import-naplai-cards"
                      aria-label="Thẻ số liệu nạp lại"
                    >
                      <div className="summary-card">
                        <span className="summary-label">Hồ sơ mới</span>
                        <strong className="summary-value num text-success">
                          {formatNumber(napLai.ho_so_them_moi)}
                        </strong>
                        <span className="summary-sub">
                          Mã hồ sơ mới thêm vào
                        </span>
                      </div>

                      <div className="summary-card">
                        <span className="summary-label">
                          Cập nhật theo nguồn (chưa rà soát)
                        </span>
                        <strong className="summary-value num">
                          {formatNumber(napLai.ho_so_cap_nhat)}
                        </strong>
                        <span className="summary-sub">
                          Nhân thân / CLS / vị trí
                        </span>
                      </div>

                      <div className="summary-card">
                        <span className="summary-label">
                          Chỉ cập nhật thông tin tham chiếu
                        </span>
                        <strong className="summary-value num">
                          {formatNumber(napLai.ho_so_cap_nhat_tham_chieu)}
                        </strong>
                        <span className="summary-sub">
                          {NHAN.TT_KSK}, cảnh báo, ghi chú CLS…
                        </span>
                      </div>

                      <div className="summary-card">
                        <span className="summary-label">
                          Giữ giá trị người rà soát (nguồn đã đổi)
                        </span>
                        <strong className="summary-value num">
                          {formatNumber(napLai.ho_so_giu_do_da_cham)}
                        </strong>
                        <span className="summary-sub">
                          Bảo toàn kết quả đã sửa/xác nhận
                        </span>
                      </div>

                      <div className="summary-card">
                        <span className="summary-label">
                          Chuyển vị trí theo nguồn
                        </span>
                        <strong className="summary-value num">
                          {formatNumber(napLai.ho_so_chuyen_vi_tri)}
                        </strong>
                        <span className="summary-sub">
                          Hồ sơ chưa chạm đổi buổi/kho
                        </span>
                      </div>

                      <div className="summary-card">
                        <span className="summary-label">
                          Gỡ khỏi nguồn → ẩn
                        </span>
                        <strong className="summary-value num">
                          {formatNumber(napLai.ho_so_go_khoi_nguon_an)}
                        </strong>
                        <span className="summary-sub">
                          Chưa rà soát, không còn trong gói
                        </span>
                      </div>

                      <div className="summary-card">
                        <span className="summary-label">
                          Gỡ khỏi nguồn nhưng giữ (đã rà soát)
                        </span>
                        <strong className="summary-value num">
                          {formatNumber(napLai.ho_so_go_khoi_nguon_giu)}
                        </strong>
                        <span className="summary-sub">
                          Đã rà soát + gắn cờ DA_GO_KHOI_NGUON
                        </span>
                      </div>

                      <div className="summary-card">
                        <span className="summary-label">Không đổi</span>
                        <strong className="summary-value num">
                          {formatNumber(napLai.ho_so_khong_doi)}
                        </strong>
                        <span className="summary-sub">
                          Giữ nguyên hoàn toàn
                        </span>
                      </div>

                      <div className="summary-card">
                        <span className="summary-label">
                          Không vào được buổi đã khóa → kho chung
                        </span>
                        <strong className="summary-value num">
                          {formatNumber(napLai.khong_vao_buoi_khoa)}
                        </strong>
                        <span className="summary-sub">
                          Buổi đích đã khóa xác nhận
                        </span>
                      </div>
                    </div>

                    {/* Thông tin buổi khám & tài khoản khi nạp lại */}
                    <div className="import-sessions-diff-grid mb-3">
                      <div className="import-diff-box">
                        <div className="font-semibold">
                          Buổi khám mới thêm (
                          {formatNumber(napLai.buoi_them.length)}) · Buổi cập
                          nhật thông tin/{NHAN.SO_DOAN}:{' '}
                          <strong>{formatNumber(napLai.buoi_cap_nhat)}</strong>{' '}
                          · Tài khoản mới:{' '}
                          <strong>
                            {formatNumber(keHoach.user_them.length)}
                          </strong>
                        </div>
                        <p className="sub-text mt-2">
                          <strong>Danh sách buổi mới:</strong>{' '}
                          {napLai.buoi_them.length > 0
                            ? napLai.buoi_them.join(', ')
                            : 'Không có buổi khám mới'}
                        </p>
                      </div>

                      <div className="import-diff-box">
                        <div className="font-semibold">
                          Buổi không còn trong gói (
                          {formatNumber(napLai.buoi_khong_con_trong_goi.length)}{' '}
                          — giữ nguyên, chỉ cảnh báo)
                        </div>
                        <p className="sub-text mt-2">
                          {napLai.buoi_khong_con_trong_goi.length > 0
                            ? napLai.buoi_khong_con_trong_goi.join(', ')
                            : 'Không có buổi nào bị thiếu khỏi gói mới'}
                        </p>
                      </div>
                    </div>

                    {/* Bảng so sánh tong_truoc -> tong_sau theo đơn vị */}
                    <h4 className="import-sub-heading">
                      Bảng so sánh trước và sau nạp theo đơn vị
                    </h4>
                    <div className="table-wrap mb-3">
                      <table
                        className="data-table"
                        aria-label="Bảng so sánh tổng trước và sau nạp theo đơn vị"
                      >
                        <thead>
                          <tr>
                            <th>Đơn vị</th>
                            <th className="num-col">Số buổi (Trước → Sau)</th>
                            <th className="num-col">
                              {NHAN.SO_DOAN} (Trước → Sau)
                            </th>
                            <th className="num-col">
                              Hồ sơ trong buổi (Trước → Sau)
                            </th>
                            <th className="num-col">Chênh lệch hồ sơ</th>
                          </tr>
                        </thead>
                        <tbody>
                          {DON_VI_ORDER.map((dv) => {
                            const tr = napLai.tong_truoc[dv] ?? {
                              so_buoi: 0,
                              so_doan: 0,
                              ho_so_trong_buoi: 0,
                            };
                            const sau = napLai.tong_sau[dv] ?? {
                              so_buoi: 0,
                              so_doan: 0,
                              ho_so_trong_buoi: 0,
                            };
                            const diffBuoi = sau.so_buoi - tr.so_buoi;
                            const diffSoDoan = sau.so_doan - tr.so_doan;
                            const diffHoSo =
                              sau.ho_so_trong_buoi - tr.ho_so_trong_buoi;

                            return (
                              <tr key={dv}>
                                <td className="font-semibold">
                                  {getTenDonVi(dv)} ({dv})
                                </td>
                                <td className="num-col">
                                  {formatNumber(tr.so_buoi)} →{' '}
                                  <strong>{formatNumber(sau.so_buoi)}</strong>
                                  {diffBuoi !== 0 && (
                                    <span className="text-muted ml-1">
                                      ({formatChenhLech(diffBuoi)})
                                    </span>
                                  )}
                                </td>
                                <td className="num-col">
                                  {formatNumber(tr.so_doan)} →{' '}
                                  <strong>{formatNumber(sau.so_doan)}</strong>
                                  {diffSoDoan !== 0 && (
                                    <span className="text-muted ml-1">
                                      ({formatChenhLech(diffSoDoan)})
                                    </span>
                                  )}
                                </td>
                                <td className="num-col">
                                  {formatNumber(tr.ho_so_trong_buoi)} →{' '}
                                  <strong>
                                    {formatNumber(sau.ho_so_trong_buoi)}
                                  </strong>
                                </td>
                                <td className="num-col font-semibold">
                                  {formatChenhLech(diffHoSo)}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                        <tfoot>
                          {(() => {
                            const trSum = sumTongDonVi(napLai.tong_truoc);
                            const sauSum = sumTongDonVi(napLai.tong_sau);
                            const diffBuoi = sauSum.so_buoi - trSum.so_buoi;
                            const diffSoDoan = sauSum.so_doan - trSum.so_doan;
                            const diffHoSo =
                              sauSum.ho_so_trong_buoi - trSum.ho_so_trong_buoi;
                            return (
                              <tr className="row-total">
                                <td>Cộng toàn đợt</td>
                                <td className="num-col">
                                  {formatNumber(trSum.so_buoi)} →{' '}
                                  {formatNumber(sauSum.so_buoi)}
                                  {diffBuoi !== 0 && (
                                    <span className="ml-1">
                                      ({formatChenhLech(diffBuoi)})
                                    </span>
                                  )}
                                </td>
                                <td className="num-col">
                                  {formatNumber(trSum.so_doan)} →{' '}
                                  {formatNumber(sauSum.so_doan)}
                                  {diffSoDoan !== 0 && (
                                    <span className="ml-1">
                                      ({formatChenhLech(diffSoDoan)})
                                    </span>
                                  )}
                                </td>
                                <td className="num-col">
                                  {formatNumber(trSum.ho_so_trong_buoi)} →{' '}
                                  {formatNumber(sauSum.ho_so_trong_buoi)}
                                </td>
                                <td className="num-col">
                                  {formatChenhLech(diffHoSo)}
                                </td>
                              </tr>
                            );
                          })()}
                        </tfoot>
                      </table>
                    </div>

                    {/* Danh sách da_xac_nhan_nguon_doi */}
                    <div className="import-list-section mb-3">
                      <h4 className="import-sub-heading">
                        Danh sách hồ sơ đã xác nhận có dữ liệu nguồn thay đổi (
                        {formatNumber(napLai.da_xac_nhan_nguon_doi.length)})
                      </h4>
                      {napLai.da_xac_nhan_nguon_doi.length === 0 ? (
                        <p className="sub-text">
                          Không có hồ sơ đã xác nhận nào bị thay đổi dữ liệu
                          nguồn.
                        </p>
                      ) : (
                        <div className="table-wrap">
                          <table
                            className="data-table"
                            aria-label="Danh sách hồ sơ đã xác nhận có dữ liệu nguồn thay đổi"
                          >
                            <thead>
                              <tr>
                                <th>STT</th>
                                <th>Mã hồ sơ</th>
                                <th>Buổi khám</th>
                                <th>Các trường nguồn thay đổi</th>
                              </tr>
                            </thead>
                            <tbody>
                              {napLai.da_xac_nhan_nguon_doi.map((item, idx) => (
                                <tr key={`${item.id}-${item.ma_ho_so}-${idx}`}>
                                  <td className="num-col">{idx + 1}</td>
                                  <td className="font-semibold nowrap">
                                    <code>{item.ma_ho_so}</code>{' '}
                                    <span className="text-muted">
                                      (#{item.id})
                                    </span>
                                  </td>
                                  <td className="nowrap">
                                    {item.ma_buoi ? (
                                      <Link
                                        href={`/ra-soat/${encodeURIComponent(item.ma_buoi)}?chon=${encodeURIComponent(String(item.id))}`}
                                      >
                                        {item.ma_buoi}
                                      </Link>
                                    ) : (
                                      '—'
                                    )}
                                  </td>
                                  <td>
                                    {item.truong.length > 0
                                      ? item.truong
                                          .map((t) => getTruongNhan(t))
                                          .join(', ')
                                      : '—'}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>

                    {/* Danh sách them_tay_trung_goi */}
                    <div className="import-list-section">
                      <h4 className="import-sub-heading">
                        Danh sách hồ sơ thêm tay trùng với gói mới — cần admin
                        xử lý tay ({formatNumber(napLai.them_tay_trung_goi.length)}
                        )
                      </h4>
                      {napLai.them_tay_trung_goi.length === 0 ? (
                        <p className="sub-text">
                          Không có hồ sơ thêm tay nào trùng với hồ sơ mới trong
                          gói.
                        </p>
                      ) : (
                        <div className="table-wrap">
                          <table
                            className="data-table"
                            aria-label="Danh sách hồ sơ thêm tay trùng với gói mới"
                          >
                            <thead>
                              <tr>
                                <th>STT</th>
                                <th>Hồ sơ thêm tay</th>
                                <th>Mã hồ sơ trong gói</th>
                                <th>Tiêu chí trùng</th>
                                <th>Hướng xử lý</th>
                              </tr>
                            </thead>
                            <tbody>
                              {napLai.them_tay_trung_goi.map((item, idx) => (
                                <tr
                                  key={`${item.ho_so_id}-${item.ma_ho_so_goi}-${idx}`}
                                >
                                  <td className="num-col">{idx + 1}</td>
                                  <td className="font-semibold nowrap">
                                    Hồ sơ #{item.ho_so_id}
                                  </td>
                                  <td className="nowrap">
                                    <code>{item.ma_ho_so_goi}</code>
                                  </td>
                                  <td className="nowrap">
                                    <span className="badge badge-warning">
                                      {item.theo === 'cccd'
                                        ? 'Trùng CCCD'
                                        : 'Trùng Mã KCB'}
                                    </span>
                                  </td>
                                  <td>
                                    Cần admin kiểm tra và xử lý tay (giữ hồ sơ
                                    thêm tay, ẩn bản ghi trùng từ gói nếu cùng
                                    một người)
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </section>

      {/* BƯỚC 3: GHI DỮ LIỆU */}
      <section className="panel-card" aria-labelledby="step3-heading">
        <div className="panel-header-inline">
          <div>
            <h2 id="step3-heading" className="panel-title">
              Bước 3 — Ghi dữ liệu vào hệ thống
            </h2>
            <p className="sub-text">
              Chỉ mở khóa khi đã chạy thử thành công, không có lỗi, không bị từ
              chối và chưa thay đổi 4 file kể từ lần chạy thử.
            </p>
          </div>
          <div className="page-header-actions">
            <button
              type="button"
              className="btn btn-primary"
              disabled={!canGhi}
              onClick={() => setConfirmGhiOpen(true)}
            >
              {loadingGhi ? 'Đang ghi…' : 'Ghi dữ liệu'}
            </button>
          </div>
        </div>

        {ghiHttpError && (
          <div
            className="import-notice-box import-notice-error mt-2"
            role="alert"
          >
            <p className="font-bold">Lỗi khi ghi dữ liệu:</p>
            <p>{ghiHttpError}</p>
          </div>
        )}

        {ketQuaGhi && ketQuaGhi.ok && ketQuaGhi.ke_hoach && (
          <div
            className="import-notice-box import-notice-success mt-2"
            role="status"
          >
            <p className="font-bold">
              ✓ Đã ghi thành công gói dữ liệu phiên bản{' '}
              <code>{ketQuaGhi.ke_hoach.phien_ban}</code> (
              {ketQuaGhi.ke_hoach.che_do === 'lan_dau'
                ? 'nạp lần đầu'
                : 'nạp lại'}
              )!
            </p>
            <p className="mt-2">
              Dữ liệu đã được lưu an toàn trong một giao dịch (transaction) và
              cập nhật vào bảng lịch sử bên dưới.
            </p>
          </div>
        )}
      </section>

      {/* BẢNG LỊCH SỬ CÁC LẦN NẠP */}
      <section className="panel-card" aria-labelledby="history-heading">
        <div className="panel-header-inline">
          <div>
            <h2 id="history-heading" className="panel-title">
              Lịch sử các lần nạp dữ liệu ({formatNumber(lichSu.length)})
            </h2>
            <p className="sub-text">
              Danh sách các phiên bản gói dữ liệu Cowork đã được nạp vào hệ
              thống (mới nhất lên đầu).
            </p>
          </div>
        </div>

        {errorLichSu && (
          <div
            className="import-notice-box import-notice-error mb-2"
            role="alert"
          >
            <span>Không tải được lịch sử nạp dữ liệu: {errorLichSu}</span>
          </div>
        )}

        {loadingLichSu && lichSu.length === 0 ? (
          <div className="state-box" role="status">
            <p className="state-title">Đang tải lịch sử các lần nạp…</p>
          </div>
        ) : lichSu.length === 0 ? (
          <div className="state-box">
            <p className="state-title">Chưa có lần nạp dữ liệu nào</p>
            <p className="state-desc">
              Cơ sở dữ liệu hiện chưa ghi nhận lô nạp nào trong{' '}
              <code>import_batches</code>.
            </p>
          </div>
        ) : (
          <div className="table-wrap">
            <table
              className="data-table"
              aria-label="Bảng lịch sử các lần nạp dữ liệu"
            >
              <thead>
                <tr>
                  <th>Phiên bản</th>
                  <th>Chế độ</th>
                  <th>Người nạp</th>
                  <th>Thời điểm</th>
                  <th>Tóm tắt ngắn (hồ sơ thêm / cập nhật)</th>
                </tr>
              </thead>
              <tbody>
                {lichSu.map((row, idx) => (
                  <tr key={`${row.phien_ban}-${idx}`}>
                    <td className="font-semibold nowrap">
                      <code>{row.phien_ban}</code>
                    </td>
                    <td className="nowrap">
                      <span
                        className={`badge ${row.che_do === 'lan_dau' ? 'badge-primary' : 'badge-warning'}`}
                      >
                        {row.che_do === 'lan_dau' ? 'Lần đầu' : 'Nạp lại'}
                      </span>
                    </td>
                    <td className="nowrap">{row.nap_boi || '—'}</td>
                    <td className="nowrap num">
                      {formatDateTime(row.nap_luc)}
                    </td>
                    <td>{formatTomTatLichSuNap(row.che_do, row.tom_tat)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* HỘP THOẠI XÁC NHẬN GHI DỮ LIỆU */}
      {keHoach && (
        <ConfirmDialog
          open={confirmGhiOpen}
          title={`Xác nhận ghi dữ liệu phiên bản ${keHoach.phien_ban}`}
          confirmLabel={`Ghi phiên bản ${keHoach.phien_ban}`}
          loadingLabel="Đang ghi…"
          cancelLabel="Hủy bỏ"
          danger={keHoach.che_do === 'nap_lai' || dryRunUsedForce}
          loading={loadingGhi}
          onConfirm={() => void handleConfirmGhi()}
          onCancel={() => {
            if (!loadingGhi) setConfirmGhiOpen(false);
          }}
        >
          <p className="modal-desc font-semibold">
            {formatXacNhanGhiGoi(keHoach)}
          </p>
          <div className="modal-consequence mt-2">
            {keHoach.che_do === 'lan_dau' || !napLai ? (
              <ul className="import-bullet-list">
                <li>
                  Thêm mới <strong>{formatNumber(keHoach.buoi_them)}</strong>{' '}
                  buổi khám và{' '}
                  <strong>{formatNumber(keHoach.ho_so_them_tong)}</strong> hồ
                  sơ.
                </li>
                <li>
                  Tạo mới{' '}
                  <strong>{formatNumber(keHoach.user_them.length)}</strong> tài
                  khoản từ <code>nguoi_dung.csv</code>.
                </li>
                <li>Thao tác được thực hiện trong một giao dịch duy nhất.</li>
              </ul>
            ) : (
              <ul className="import-bullet-list">
                <li>
                  Hồ sơ mới:{' '}
                  <strong>{formatNumber(napLai.ho_so_them_moi)}</strong> · Cập
                  nhật theo nguồn (chưa rà soát):{' '}
                  <strong>{formatNumber(napLai.ho_so_cap_nhat)}</strong> · Chỉ
                  cập nhật tham chiếu:{' '}
                  <strong>
                    {formatNumber(napLai.ho_so_cap_nhat_tham_chieu)}
                  </strong>
                  .
                </li>
                <li>
                  Giữ giá trị người rà soát (nguồn đã đổi):{' '}
                  <strong>{formatNumber(napLai.ho_so_giu_do_da_cham)}</strong> ·
                  Chuyển vị trí theo nguồn:{' '}
                  <strong>{formatNumber(napLai.ho_so_chuyen_vi_tri)}</strong>.
                </li>
                <li>
                  Gỡ khỏi nguồn → ẩn:{' '}
                  <strong>{formatNumber(napLai.ho_so_go_khoi_nguon_an)}</strong>{' '}
                  · Gỡ khỏi nguồn nhưng giữ (đã rà soát):{' '}
                  <strong>
                    {formatNumber(napLai.ho_so_go_khoi_nguon_giu)}
                  </strong>
                  .
                </li>
              </ul>
            )}
          </div>
        </ConfirmDialog>
      )}
    </div>
  );
}
