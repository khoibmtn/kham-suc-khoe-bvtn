'use client';

import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import type { BuoiTomTat, UserQuanLy } from '@/lib/api-types';
import { DON_VI, NHAN, type DonVi } from '@/lib/cls';
import { khongDau } from '@/lib/text';
import { apiRequest } from '@/lib/client/api';
import {
  formatDate,
  formatNumber,
  TRANG_THAI_BUOI_NHAN,
} from '@/lib/client/format';
import { ConfirmDialog } from './confirm-dialog';
import { locDanhSachBuoi } from './home-buoi-list';
import { useToast } from './toast';

export type CotSapXepBuoi = 'don_vi' | 'ngay_kham' | 'phu_trach';
export type ChieuSapXep = 'asc' | 'desc';

const THU_TU_DON_VI: Record<string, number> = { TN: 1, LK: 2, VK: 3 };

export function sapXepDanhSachBuoi(
  list: BuoiTomTat[],
  col: CotSapXepBuoi,
  dir: ChieuSapXep,
): BuoiTomTat[] {
  const factor = dir === 'asc' ? 1 : -1;
  return [...list].sort((a, b) => {
    if (col === 'ngay_kham') {
      const cmp = a.ngay_kham.localeCompare(b.ngay_kham);
      if (cmp !== 0) return cmp * factor;
      const dv = (THU_TU_DON_VI[a.don_vi] ?? 9) - (THU_TU_DON_VI[b.don_vi] ?? 9);
      if (dv !== 0) return dv;
      return a.id - b.id;
    }

    if (col === 'phu_trach') {
      const aEmpty = a.phu_trach === null;
      const bEmpty = b.phu_trach === null;
      if (aEmpty !== bEmpty) {
        return (aEmpty ? 1 : -1) * factor;
      }
      const aTen = a.phu_trach?.ho_ten ?? '';
      const bTen = b.phu_trach?.ho_ten ?? '';
      const cmp = aTen.localeCompare(bTen, 'vi');
      if (cmp !== 0) return cmp * factor;
      return a.ngay_kham.localeCompare(b.ngay_kham);
    }

    // Default: don_vi
    const dv = (THU_TU_DON_VI[a.don_vi] ?? 9) - (THU_TU_DON_VI[b.don_vi] ?? 9);
    if (dv !== 0) return dv * factor;
    const cmpNgay = a.ngay_kham.localeCompare(b.ngay_kham);
    if (cmpNgay !== 0) return cmpNgay * factor;
    return (a.id - b.id) * factor;
  });
}

export function AdminPhanCongView() {
  const { showToast } = useToast();
  const searchParams = useSearchParams();
  const phuTrachQuery = searchParams.get('phu_trach') ?? '';

  const [buoiList, setBuoiList] = useState<BuoiTomTat[]>([]);
  const [users, setUsers] = useState<UserQuanLy[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [donViFilter, setDonViFilter] = useState<string>('');
  const [phuTrachFilter, setPhuTrachFilter] = useState<string>(() => phuTrachQuery);
  const [trangThaiFilter, setTrangThaiFilter] = useState<string>('');
  const [tuNgayFilter, setTuNgayFilter] = useState<string>('');
  const [denNgayFilter, setDenNgayFilter] = useState<string>('');
  const [timNhanhFilter, setTimNhanhFilter] = useState<string>('');

  const [sortCol, setSortCol] = useState<CotSapXepBuoi>('don_vi');
  const [sortDir, setSortDir] = useState<ChieuSapXep>('asc');

  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [targetUserId, setTargetUserId] = useState<string>('');
  const [assigning, setAssigning] = useState(false);

  // Hộp xác nhận Phân công theo gợi ý (NHAN.SO_DOAN)
  const [openGoiYModal, setOpenGoiYModal] = useState(false);
  const [ghiDeGoiY, setGhiDeGoiY] = useState(false);
  const [runningGoiY, setRunningGoiY] = useState(false);
  const [ketQuaGoiY, setKetQuaGoiY] = useState<{
    da_gan: number;
    bo_qua: string[];
  } | null>(null);

  // Sửa nhanh dòng buổi khám
  const [editingBuoiId, setEditingBuoiId] = useState<number | null>(null);
  const [editDiemKham, setEditDiemKham] = useState('');
  const [editDoanKham, setEditDoanKham] = useState('');
  const [editSoDoan, setEditSoDoan] = useState('');
  const [savingBuoiId, setSavingBuoiId] = useState<number | null>(null);

  // Form Thêm buổi khám
  const [showAddForm, setShowAddForm] = useState(false);
  const [newDonVi, setNewDonVi] = useState<DonVi>('TN');
  const [newNgayKham, setNewNgayKham] = useState('');
  const [newDiemKham, setNewDiemKham] = useState('');
  const [newDoanKham, setNewDoanKham] = useState('');
  const [newSoDoan, setNewSoDoan] = useState('');
  const [addingBuoi, setAddingBuoi] = useState(false);
  const [addError, setAddError] = useState('');

  const reloadData = useCallback(async () => {
    setLoading(true);
    setError('');

    const [buoiRes, usersRes] = await Promise.all([
      apiRequest<{ buoi: BuoiTomTat[] }>('/api/buoi'),
      apiRequest<{ users: UserQuanLy[] }>('/api/users'),
    ]);

    if (!buoiRes.ok) {
      setError(buoiRes.error);
      setLoading(false);
      return;
    }

    setBuoiList(buoiRes.data.buoi ?? []);
    if (usersRes.ok && Array.isArray(usersRes.data.users)) {
      const listUsers = usersRes.data.users;
      setUsers(listUsers);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      apiRequest<{ buoi: BuoiTomTat[] }>('/api/buoi'),
      apiRequest<{ users: UserQuanLy[] }>('/api/users'),
    ]).then(([buoiRes, usersRes]) => {
      if (cancelled) return;
      if (!buoiRes.ok) {
        setError(buoiRes.error);
        setLoading(false);
        return;
      }

      setBuoiList(buoiRes.data.buoi ?? []);
      if (usersRes.ok && Array.isArray(usersRes.data.users)) {
        const listUsers = usersRes.data.users;
        setUsers(listUsers);
      }
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const filteredBuoi = useMemo(() => {
    const base = locDanhSachBuoi(buoiList, {
      donVi: donViFilter,
      trangThai: trangThaiFilter,
      phuTrach: phuTrachFilter,
      tuNgay: tuNgayFilter,
      denNgay: denNgayFilter,
      timNhanh: '',
    });

    const qRaw = timNhanhFilter.trim().toLowerCase();
    const qKd = khongDau(timNhanhFilter);
    const matched = !qRaw
      ? base
      : base.filter((b) => {
          const ngayStr = formatDate(b.ngay_kham).toLowerCase();
          const maStr = b.ma_buoi.toLowerCase();
          const diemKd = khongDau(b.diem_kham ?? '');
          const doanKd = khongDau(b.doan_kham ?? '');
          const goiYKd = khongDau(b.nv_goi_y ?? '');
          return (
            ngayStr.includes(qRaw) ||
            b.ngay_kham.includes(qRaw) ||
            maStr.includes(qRaw) ||
            (qKd.length > 0 &&
              (diemKd.includes(qKd) ||
                doanKd.includes(qKd) ||
                goiYKd.includes(qKd)))
          );
        });

    return sapXepDanhSachBuoi(matched, sortCol, sortDir);
  }, [
    buoiList,
    donViFilter,
    trangThaiFilter,
    phuTrachFilter,
    tuNgayFilter,
    denNgayFilter,
    timNhanhFilter,
    sortCol,
    sortDir,
  ]);

  const filteredIdSet = useMemo(
    () => new Set(filteredBuoi.map((b) => b.id)),
    [filteredBuoi],
  );

  const effectiveSelectedIds = useMemo(() => {
    const next = new Set<number>();
    for (const id of selectedIds) {
      if (filteredIdSet.has(id)) {
        next.add(id);
      }
    }
    return next;
  }, [selectedIds, filteredIdSet]);

  const activeUsers = useMemo(
    () => users.filter((u) => u.active),
    [users],
  );

  const allFilteredSelected = useMemo(() => {
    if (filteredBuoi.length === 0) return false;
    return filteredBuoi.every((b) => effectiveSelectedIds.has(b.id));
  }, [filteredBuoi, effectiveSelectedIds]);

  const hasActiveFilter = Boolean(
    donViFilter ||
      phuTrachFilter ||
      trangThaiFilter ||
      tuNgayFilter ||
      denNgayFilter ||
      timNhanhFilter.trim(),
  );

  function handleResetFilters() {
    setDonViFilter('');
    setPhuTrachFilter('');
    setTrangThaiFilter('');
    setTuNgayFilter('');
    setDenNgayFilter('');
    setTimNhanhFilter('');
  }

  function handleSort(col: CotSapXepBuoi) {
    if (sortCol === col) {
      setSortDir((prev) => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortCol(col);
      setSortDir('asc');
    }
  }

  function renderSortMark(col: CotSapXepBuoi): string {
    if (sortCol !== col) return '↕';
    return sortDir === 'asc' ? '↑' : '↓';
  }

  function toggleSelectRow(id: number) {
    setSelectedIds((prev) => {
      const next = new Set<number>();
      for (const item of prev) {
        if (filteredIdSet.has(item)) next.add(item);
      }
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }

  function handleSelectAllFiltered(checked: boolean) {
    if (checked) {
      setSelectedIds(new Set(filteredBuoi.map((b) => b.id)));
    } else {
      setSelectedIds(new Set());
    }
  }

  async function handleBulkAssign(userId: number | null) {
    const ids = Array.from(effectiveSelectedIds);
    if (ids.length === 0) {
      showToast('Vui lòng chọn ít nhất 1 buổi khám trong bảng', 'warning');
      return;
    }

    setAssigning(true);
    const res = await apiRequest<{ so_buoi: number }>('/api/phan-cong', {
      method: 'POST',
      body: JSON.stringify({
        buoi_ids: ids,
        user_id: userId,
      }),
    });
    setAssigning(false);

    if (!res.ok) {
      showToast(res.error, 'error');
      return;
    }

    showToast(
      userId === null
        ? `Đã bỏ phân công ${formatNumber(res.data.so_buoi)} buổi khám`
        : `Đã gán phân công ${formatNumber(res.data.so_buoi)} buổi khám`,
      'success',
    );
    setSelectedIds(new Set());
    await reloadData();
  }

  async function handleConfirmPhanCongGoiY() {
    setRunningGoiY(true);
    const res = await apiRequest<{ da_gan: number; bo_qua: string[] }>(
      '/api/phan-cong/theo-goi-y',
      {
        method: 'POST',
        body: JSON.stringify({ ghi_de: ghiDeGoiY }),
      },
    );
    setRunningGoiY(false);
    setOpenGoiYModal(false);

    if (!res.ok) {
      showToast(res.error, 'error');
      return;
    }

    setKetQuaGoiY(res.data);
    showToast(
      `Phân công theo ${NHAN.SO_DOAN}: Đã gán ${formatNumber(res.data.da_gan)} buổi`,
      'success',
    );
    await reloadData();
  }

  function startEditRow(b: BuoiTomTat) {
    setEditingBuoiId(b.id);
    setEditDiemKham(b.diem_kham ?? '');
    setEditDoanKham(b.doan_kham ?? '');
    setEditSoDoan(String(b.so_doan_tong ?? 0));
  }

  function cancelEditRow() {
    setEditingBuoiId(null);
  }

  async function handleSaveRow(b: BuoiTomTat) {
    const parsedSoDoan = Number(editSoDoan);
    if (!Number.isInteger(parsedSoDoan) || parsedSoDoan < 0) {
      showToast(`Số ${NHAN.SO_DOAN} phải là số nguyên không âm`, 'error');
      return;
    }

    setSavingBuoiId(b.id);
    const res = await apiRequest<{ buoi: BuoiTomTat }>(
      `/api/buoi/${encodeURIComponent(b.ma_buoi)}`,
      {
        method: 'PATCH',
        body: JSON.stringify({
          diem_kham: editDiemKham.trim(),
          doan_kham: editDoanKham.trim(),
          so_doan_tong: parsedSoDoan,
        }),
      },
    );
    setSavingBuoiId(null);

    if (!res.ok) {
      showToast(res.error, 'error');
      return;
    }

    setBuoiList((prev) =>
      prev.map((item) => (item.id === b.id ? res.data.buoi : item)),
    );
    setEditingBuoiId(null);
    showToast(`Đã cập nhật thông tin buổi khám ${b.ma_buoi}`, 'success');
  }

  async function handleAddBuoi(e: FormEvent) {
    e.preventDefault();
    setAddError('');

    if (!newNgayKham) {
      setAddError('Vui lòng chọn ngày khám.');
      return;
    }

    const parsedSoDoan = Number(newSoDoan);
    if (!Number.isInteger(parsedSoDoan) || parsedSoDoan < 0) {
      setAddError(`Số ${NHAN.SO_DOAN} phải là số nguyên không âm.`);
      return;
    }

    setAddingBuoi(true);
    const res = await apiRequest<{ buoi: BuoiTomTat }>('/api/buoi', {
      method: 'POST',
      body: JSON.stringify({
        don_vi: newDonVi,
        ngay_kham: newNgayKham,
        diem_kham: newDiemKham.trim(),
        doan_kham: newDoanKham.trim(),
        so_doan_tong: parsedSoDoan,
      }),
    });
    setAddingBuoi(false);

    if (!res.ok) {
      setAddError(res.error);
      return;
    }

    showToast(`Đã thêm buổi khám ${res.data.buoi.ma_buoi}`, 'success');
    setNewNgayKham('');
    setNewDiemKham('');
    setNewDoanKham('');
    setNewSoDoan('');
    setShowAddForm(false);
    await reloadData();
  }

  return (
    <div className="page-container">
      <div className="page-header-row">
        <div>
          <h1 className="page-title">Quản lý phân công &amp; buổi khám</h1>
          <p className="page-subtitle">
            Gán người phụ trách cho từng buổi khám, phân công tự động theo {NHAN.SO_DOAN}, hoặc sửa thông tin buổi khám.
          </p>
        </div>
        <div className="page-header-actions">
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={() => setShowAddForm((prev) => !prev)}
          >
            {showAddForm ? 'Đóng form thêm buổi' : '+ Thêm buổi khám'}
          </button>
          <button
            type="button"
            className="btn btn-primary btn-sm"
            onClick={() => {
              setGhiDeGoiY(false);
              setOpenGoiYModal(true);
            }}
          >
            Phân công theo {NHAN.SO_DOAN}
          </button>
        </div>
      </div>

      {ketQuaGoiY && (
        <div className="alert alert-success" role="status">
          <div className="flex-between">
            <div>
              <strong>Kết quả phân công theo {NHAN.SO_DOAN}:</strong> Đã gán{' '}
              <strong className="num">{formatNumber(ketQuaGoiY.da_gan)}</strong> buổi khám.
              {ketQuaGoiY.bo_qua && ketQuaGoiY.bo_qua.length > 0 && (
                <span>
                  {' '}
                  · Bỏ qua ({formatNumber(ketQuaGoiY.bo_qua.length)}):{' '}
                  <code>{ketQuaGoiY.bo_qua.join(', ')}</code>
                </span>
              )}
            </div>
            <button
              type="button"
              className="btn btn-secondary btn-xs"
              onClick={() => setKetQuaGoiY(null)}
            >
              Đóng
            </button>
          </div>
        </div>
      )}

      {showAddForm && (
        <section className="panel-card" aria-label="Thêm buổi khám mới">
          <h2 className="panel-title">Thêm buổi khám mới</h2>
          {addError && (
            <div className="alert alert-error" role="alert">
              {addError}
            </div>
          )}
          <form onSubmit={handleAddBuoi} className="inline-grid-form">
            <div className="form-field">
              <label htmlFor="new-don-vi" className="form-label">
                Đơn vị *
              </label>
              <select
                id="new-don-vi"
                className="form-input form-input-sm"
                value={newDonVi}
                onChange={(e) => setNewDonVi(e.target.value as DonVi)}
                disabled={addingBuoi}
              >
                {(Object.keys(DON_VI) as DonVi[]).map((code) => (
                  <option key={code} value={code}>
                    {DON_VI[code]} ({code})
                  </option>
                ))}
              </select>
            </div>

            <div className="form-field">
              <label htmlFor="new-ngay-kham" className="form-label">
                Ngày khám *
              </label>
              <input
                id="new-ngay-kham"
                type="date"
                className="form-input form-input-sm"
                required
                value={newNgayKham}
                onChange={(e) => setNewNgayKham(e.target.value)}
                disabled={addingBuoi}
              />
            </div>

            <div className="form-field">
              <label htmlFor="new-diem-kham" className="form-label">
                Điểm khám
              </label>
              <input
                id="new-diem-kham"
                type="text"
                className="form-input form-input-sm"
                placeholder="Ví dụ: Trạm Y tế..."
                value={newDiemKham}
                onChange={(e) => setNewDiemKham(e.target.value)}
                disabled={addingBuoi}
              />
            </div>

            <div className="form-field">
              <label htmlFor="new-doan-kham" className="form-label">
                Đoàn khám
              </label>
              <input
                id="new-doan-kham"
                type="text"
                className="form-input form-input-sm"
                placeholder="Ví dụ: Đoàn 1"
                value={newDoanKham}
                onChange={(e) => setNewDoanKham(e.target.value)}
                disabled={addingBuoi}
              />
            </div>

            <div className="form-field">
              <label htmlFor="new-so-doan" className="form-label">
                {NHAN.SO_DOAN} tổng *
              </label>
              <input
                id="new-so-doan"
                type="number"
                min={0}
                className="form-input form-input-sm num"
                required
                value={newSoDoan}
                onChange={(e) => setNewSoDoan(e.target.value)}
                disabled={addingBuoi}
              />
            </div>

            <div className="form-actions-inline">
              <button
                type="submit"
                className="btn btn-primary btn-sm"
                disabled={addingBuoi}
              >
                {addingBuoi ? 'Đang thêm…' : 'Thêm buổi khám'}
              </button>
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={() => setShowAddForm(false)}
                disabled={addingBuoi}
              >
                Hủy
              </button>
            </div>
          </form>
        </section>
      )}

      <div className="filter-bar">
        <div className="filter-group">
          <label htmlFor="pc-don-vi" className="filter-label">
            Đơn vị:
          </label>
          <select
            id="pc-don-vi"
            className="form-select"
            value={donViFilter}
            onChange={(e) => setDonViFilter(e.target.value)}
          >
            <option value="">Tất cả ({formatNumber(buoiList.length)} buổi)</option>
            {(Object.keys(DON_VI) as DonVi[]).map((code) => {
              const count = buoiList.filter((b) => b.don_vi === code).length;
              return (
                <option key={code} value={code}>
                  {DON_VI[code]} ({formatNumber(count)})
                </option>
              );
            })}
          </select>
        </div>

        <div className="filter-group">
          <label htmlFor="pc-phu-trach" className="filter-label">
            Người phụ trách:
          </label>
          <select
            id="pc-phu-trach"
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

        <div className="filter-group">
          <label htmlFor="pc-trang-thai" className="filter-label">
            Trạng thái:
          </label>
          <select
            id="pc-trang-thai"
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

        <div className="filter-group">
          <label htmlFor="pc-tu-ngay" className="filter-label">
            Từ ngày:
          </label>
          <input
            id="pc-tu-ngay"
            type="date"
            className="form-input form-input-sm input-date-compact"
            value={tuNgayFilter}
            onChange={(e) => setTuNgayFilter(e.target.value)}
          />
          <label htmlFor="pc-den-ngay" className="filter-label">
            Đến:
          </label>
          <input
            id="pc-den-ngay"
            type="date"
            className="form-input form-input-sm input-date-compact"
            value={denNgayFilter}
            onChange={(e) => setDenNgayFilter(e.target.value)}
          />
        </div>

        <div className="filter-group">
          <label htmlFor="pc-tim-nhanh" className="filter-label">
            Tìm điểm khám/đoàn:
          </label>
          <input
            id="pc-tim-nhanh"
            type="search"
            className="form-input form-input-sm input-quick-buoi"
            placeholder="Điểm khám, đoàn khám, ngày…"
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

      <div className="bulk-action-bar">
        <div className="bulk-left">
          <label className="checkbox-inline-label">
            <input
              type="checkbox"
              checked={allFilteredSelected}
              onChange={(e) => handleSelectAllFiltered(e.target.checked)}
              disabled={filteredBuoi.length === 0}
            />
            <span>Chọn tất cả đang lọc ({formatNumber(filteredBuoi.length)})</span>
          </label>

          <span className="selected-counter">
            Đang chọn: <strong className="num">{formatNumber(effectiveSelectedIds.size)}</strong> /{' '}
            <strong className="num">{formatNumber(filteredBuoi.length)}</strong> buổi đang hiển thị
          </span>
        </div>

        <div className="bulk-right">
          <label htmlFor="assign-user-select" className="filter-label">
            Gán cho:
          </label>
          <select
            id="assign-user-select"
            className="form-select"
            value={targetUserId}
            onChange={(e) => setTargetUserId(e.target.value)}
            disabled={assigning}
          >
            <option value="">— Chọn người phụ trách —</option>
            {activeUsers.map((u) => (
              <option key={u.id} value={String(u.id)}>
                {u.ho_ten} ({u.username})
              </option>
            ))}
          </select>

          <button
            type="button"
            className="btn btn-primary btn-sm"
            disabled={assigning || effectiveSelectedIds.size === 0 || !targetUserId}
            onClick={() => void handleBulkAssign(Number(targetUserId))}
          >
            {assigning ? 'Đang xử lý…' : 'Gán'}
          </button>

          <button
            type="button"
            className="btn btn-danger-outline btn-sm"
            disabled={assigning || effectiveSelectedIds.size === 0}
            onClick={() => void handleBulkAssign(null)}
          >
            Bỏ phân công
          </button>
        </div>
      </div>

      {error && (
        <div className="state-box state-error" role="alert">
          <p className="state-title">Không tải được danh sách phân công: {error}</p>
          <button
            type="button"
            className="btn btn-primary btn-sm"
            onClick={() => void reloadData()}
          >
            Thử tải lại
          </button>
        </div>
      )}

      {!error && loading && (
        <div className="state-box" role="status">
          <p className="state-title">Đang tải danh sách 60 buổi khám…</p>
        </div>
      )}

      {!error && !loading && filteredBuoi.length === 0 && (
        <div className="state-box" role="status">
          <p className="state-title">Không có buổi khám nào khớp với bộ lọc</p>
          <p className="state-desc">
            Đang hiển thị 0 / {formatNumber(buoiList.length)} buổi khám. Hãy nới điều kiện lọc hoặc bấm Xóa lọc.
          </p>
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
      )}

      {!error && !loading && filteredBuoi.length > 0 && (
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th className="col-check">
                  <input
                    type="checkbox"
                    aria-label="Chọn tất cả đang lọc"
                    checked={allFilteredSelected}
                    onChange={(e) => handleSelectAllFiltered(e.target.checked)}
                  />
                </th>
                <th>Mã buổi</th>
                <th
                  aria-sort={
                    sortCol === 'don_vi'
                      ? sortDir === 'asc'
                        ? 'ascending'
                        : 'descending'
                      : 'none'
                  }
                >
                  <button
                    type="button"
                    className="th-sort-btn"
                    onClick={() => handleSort('don_vi')}
                  >
                    <span>Đơn vị</span>
                    <span className="sort-mark">{renderSortMark('don_vi')}</span>
                  </button>
                </th>
                <th
                  aria-sort={
                    sortCol === 'ngay_kham'
                      ? sortDir === 'asc'
                        ? 'ascending'
                        : 'descending'
                      : 'none'
                  }
                >
                  <button
                    type="button"
                    className="th-sort-btn"
                    onClick={() => handleSort('ngay_kham')}
                  >
                    <span>Ngày</span>
                    <span className="sort-mark">{renderSortMark('ngay_kham')}</span>
                  </button>
                </th>
                <th>Điểm khám</th>
                <th>Đoàn khám</th>
                <th className="num-col">{NHAN.SO_DOAN}</th>
                <th className="num-col">Trong DS</th>
                <th className="num-col">Đã xác nhận</th>
                <th>Gợi ý {NHAN.SO_DOAN}</th>
                <th
                  aria-sort={
                    sortCol === 'phu_trach'
                      ? sortDir === 'asc'
                        ? 'ascending'
                        : 'descending'
                      : 'none'
                  }
                >
                  <button
                    type="button"
                    className="th-sort-btn"
                    onClick={() => handleSort('phu_trach')}
                  >
                    <span>Người phụ trách</span>
                    <span className="sort-mark">{renderSortMark('phu_trach')}</span>
                  </button>
                </th>
                <th>Trạng thái</th>
                <th>Thao tác</th>
              </tr>
            </thead>
            <tbody>
              {filteredBuoi.map((b) => {
                const isChecked = effectiveSelectedIds.has(b.id);
                const isEditing = editingBuoiId === b.id;
                const isSaving = savingBuoiId === b.id;

                return (
                  <tr
                    key={b.id}
                    className={isChecked ? 'row-checked' : ''}
                  >
                    <td className="col-check">
                      <input
                        type="checkbox"
                        aria-label={`Chọn buổi ${b.ma_buoi}`}
                        checked={isChecked}
                        onChange={() => toggleSelectRow(b.id)}
                      />
                    </td>
                    <td className="nowrap">
                      <Link
                        href={`/ra-soat/${b.ma_buoi}`}
                        className="font-semibold"
                      >
                        {b.ma_buoi}
                      </Link>
                    </td>
                    <td className="nowrap" title={b.ten_don_vi}>{b.don_vi}</td>
                    <td className="nowrap">{formatDate(b.ngay_kham)}</td>
                    <td>
                      {isEditing ? (
                        <input
                          type="text"
                          className="form-input form-input-xs"
                          value={editDiemKham}
                          onChange={(e) => setEditDiemKham(e.target.value)}
                          disabled={isSaving}
                          aria-label="Điểm khám"
                        />
                      ) : (
                        b.diem_kham || '—'
                      )}
                    </td>
                    <td>
                      {isEditing ? (
                        <input
                          type="text"
                          className="form-input form-input-xs"
                          value={editDoanKham}
                          onChange={(e) => setEditDoanKham(e.target.value)}
                          disabled={isSaving}
                          aria-label="Đoàn khám"
                        />
                      ) : (
                        b.doan_kham || '—'
                      )}
                    </td>
                    <td className="num-col">
                      {isEditing ? (
                        <input
                          type="number"
                          min={0}
                          className="form-input form-input-xs num input-w-80"
                          value={editSoDoan}
                          onChange={(e) => setEditSoDoan(e.target.value)}
                          disabled={isSaving}
                          aria-label={`${NHAN.SO_DOAN} tổng`}
                        />
                      ) : (
                        formatNumber(b.so_doan_tong)
                      )}
                    </td>
                    <td className="num-col">{formatNumber(b.hien_co)}</td>
                    <td className="num-col text-success font-semibold">
                      {formatNumber(b.da_xac_nhan)}
                    </td>
                    <td>
                      {b.nv_goi_y ? (
                        <span className="badge badge-neutral">{b.nv_goi_y}</span>
                      ) : (
                        <span className="text-muted">—</span>
                      )}
                    </td>
                    <td>
                      {b.phu_trach ? (
                        <strong>
                          {b.phu_trach.ho_ten} ({b.phu_trach.username})
                        </strong>
                      ) : (
                        <span className="badge badge-warning">Chưa phân công</span>
                      )}
                    </td>
                    <td className="nowrap">
                      <span
                        className={`badge ${
                          b.trang_thai === 'da_xac_nhan'
                            ? 'badge-success'
                            : b.trang_thai === 'dang_ra_soat'
                              ? 'badge-warning'
                              : 'badge-neutral'
                        }`}
                      >
                        {TRANG_THAI_BUOI_NHAN[b.trang_thai]}
                      </span>
                    </td>
                    <td className="nowrap">
                      {isEditing ? (
                        <div className="inline-btn-group">
                          <button
                            type="button"
                            className="btn btn-primary btn-xs"
                            disabled={isSaving}
                            onClick={() => void handleSaveRow(b)}
                          >
                            {isSaving ? 'Lưu…' : 'Lưu'}
                          </button>
                          <button
                            type="button"
                            className="btn btn-secondary btn-xs"
                            disabled={isSaving}
                            onClick={cancelEditRow}
                          >
                            Hủy
                          </button>
                        </div>
                      ) : (
                        <button
                          type="button"
                          className="btn btn-secondary btn-xs"
                          onClick={() => startEditRow(b)}
                        >
                          Sửa
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <ConfirmDialog
        open={openGoiYModal}
        title={`Xác nhận phân công tự động theo ${NHAN.SO_DOAN}`}
        confirmLabel={`Thực hiện phân công theo ${NHAN.SO_DOAN}`}
        cancelLabel="Hủy bỏ"
        loading={runningGoiY}
        onConfirm={() => void handleConfirmPhanCongGoiY()}
        onCancel={() => setOpenGoiYModal(false)}
      >
        <p className="modal-text">
          Hệ thống sẽ tự động gán người phụ trách cho các buổi khám dựa theo cột nhân viên gợi ý (<code>nv_goi_y</code>) trong dữ liệu {NHAN.SO_DOAN}. Các buổi không có tên gợi ý sẽ được giữ nguyên để phân công tay.
        </p>

        <div className="radio-group-box">
          <label className="radio-option">
            <input
              type="radio"
              name="che_do_goi_y"
              checked={!ghiDeGoiY}
              onChange={() => setGhiDeGoiY(false)}
            />
            <div>
              <strong>Chỉ gán buổi chưa có người phụ trách (Khuyên dùng)</strong>
              <div className="text-muted text-xs">
                Giữ nguyên các buổi khám đã được phân công trước đó.
              </div>
            </div>
          </label>

          <label className="radio-option">
            <input
              type="radio"
              name="che_do_goi_y"
              checked={ghiDeGoiY}
              onChange={() => setGhiDeGoiY(true)}
            />
            <div>
              <strong>Ghi đè toàn bộ theo {NHAN.SO_DOAN}</strong>
              <div className="text-muted text-xs">
                Thay thế cả người phụ trách hiện tại nếu buổi khám có gợi ý trong {NHAN.SO_DOAN}.
              </div>
            </div>
          </label>
        </div>
      </ConfirmDialog>
    </div>
  );
}
