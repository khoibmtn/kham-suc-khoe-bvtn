'use client';

import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import type { UserQuanLy } from '@/lib/api-types';
import { khongDau } from '@/lib/text';
import { apiRequest } from '@/lib/client/api';
import { formatDateTime, formatNumber } from '@/lib/client/format';
import { ConfirmDialog } from './confirm-dialog';
import { useToast } from './toast';

type AdminNguoiDungViewProps = {
  currentUserId: number;
};

export function AdminNguoiDungView({ currentUserId }: AdminNguoiDungViewProps) {
  const { showToast } = useToast();

  const [users, setUsers] = useState<UserQuanLy[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Bộ lọc người dùng
  const [searchUser, setSearchUser] = useState('');
  const [roleFilter, setRoleFilter] = useState<'' | 'nhan_vien' | 'admin'>('');
  const [statusFilter, setStatusFilter] = useState<'' | 'active' | 'locked'>('');

  // Form Tạo người dùng mới
  const [newUsername, setNewUsername] = useState('');
  const [newHoTen, setNewHoTen] = useState('');
  const [newRole, setNewRole] = useState<'nhan_vien' | 'admin'>('nhan_vien');
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState('');
  const [createdBanner, setCreatedBanner] = useState('');

  // Sửa trên dòng
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editHoTen, setEditHoTen] = useState('');
  const [editRole, setEditRole] = useState<'nhan_vien' | 'admin'>('nhan_vien');
  const [savingId, setSavingId] = useState<number | null>(null);

  // Hộp xác nhận Khóa / Mở khóa
  const [lockTarget, setLockTarget] = useState<UserQuanLy | null>(null);
  const [locking, setLocking] = useState(false);

  // Hộp xác nhận Đặt lại mật khẩu
  const [resetTarget, setResetTarget] = useState<UserQuanLy | null>(null);
  const [resetting, setResetting] = useState(false);

  const reloadUsers = useCallback(async () => {
    setLoading(true);
    setError('');
    const res = await apiRequest<{ users: UserQuanLy[] }>('/api/users');
    if (!res.ok) {
      setError(res.error);
      setLoading(false);
      return;
    }
    setUsers(res.data.users ?? []);
    setLoading(false);
  }, []);

  useEffect(() => {
    let cancelled = false;
    apiRequest<{ users: UserQuanLy[] }>('/api/users').then((res) => {
      if (cancelled) return;
      if (!res.ok) {
        setError(res.error);
        setLoading(false);
        return;
      }
      setUsers(res.data.users ?? []);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  async function handleCreateUser(e: FormEvent) {
    e.preventDefault();
    setCreateError('');
    setCreatedBanner('');

    const usernameClean = newUsername.trim().toLowerCase();
    const hoTenClean = newHoTen.trim();

    if (!/^[a-z0-9_.-]{2,32}$/.test(usernameClean)) {
      setCreateError(
        'Tên đăng nhập chỉ gồm chữ thường không dấu (a–z), số, dấu gạch dưới hoặc chấm (2–32 ký tự).',
      );
      return;
    }

    if (!hoTenClean) {
      setCreateError('Họ và tên không được để trống.');
      return;
    }

    setCreating(true);
    const res = await apiRequest<{ user: UserQuanLy }>('/api/users', {
      method: 'POST',
      body: JSON.stringify({
        username: usernameClean,
        ho_ten: hoTenClean,
        role: newRole,
      }),
    });
    setCreating(false);

    if (!res.ok) {
      setCreateError(res.error);
      return;
    }

    const u = res.data.user;
    setUsers((prev) => [...prev, u]);
    setNewUsername('');
    setNewHoTen('');
    setNewRole('nhan_vien');
    const msg = `Đã tạo tài khoản ${u.ho_ten} (${u.username}). Mật khẩu mặc định: 123456`;
    setCreatedBanner(msg);
    showToast(msg, 'success');
  }

  function startEdit(u: UserQuanLy) {
    setEditingId(u.id);
    setEditHoTen(u.ho_ten);
    setEditRole(u.role);
  }

  async function handleSaveEdit(u: UserQuanLy) {
    const hoTenClean = editHoTen.trim();
    if (!hoTenClean) {
      showToast('Họ và tên không được để trống', 'error');
      return;
    }

    setSavingId(u.id);
    const res = await apiRequest<{ user: UserQuanLy }>(`/api/users/${u.id}`, {
      method: 'PATCH',
      body: JSON.stringify({
        ho_ten: hoTenClean,
        role: editRole,
      }),
    });
    setSavingId(null);

    if (!res.ok) {
      showToast(res.error, 'error');
      return;
    }

    setUsers((prev) =>
      prev.map((item) => (item.id === u.id ? res.data.user : item)),
    );
    setEditingId(null);
    showToast(`Đã cập nhật tài khoản ${res.data.user.ho_ten}`, 'success');
  }

  async function handleConfirmLockToggle() {
    if (!lockTarget) return;
    const nextActive = !lockTarget.active;

    setLocking(true);
    const res = await apiRequest<{ user: UserQuanLy }>(
      `/api/users/${lockTarget.id}`,
      {
        method: 'PATCH',
        body: JSON.stringify({ active: nextActive }),
      },
    );
    setLocking(false);

    if (!res.ok) {
      showToast(res.error, 'error');
      return;
    }

    setUsers((prev) =>
      prev.map((item) => (item.id === lockTarget.id ? res.data.user : item)),
    );
    showToast(
      nextActive
        ? `Đã mở khóa tài khoản ${lockTarget.ho_ten} (${lockTarget.username})`
        : `Đã khóa tài khoản ${lockTarget.ho_ten} (${lockTarget.username})`,
      'success',
    );
    setLockTarget(null);
  }

  async function handleConfirmResetPassword() {
    if (!resetTarget) return;

    setResetting(true);
    const res = await apiRequest<{ ok: boolean }>(
      `/api/users/${resetTarget.id}/dat-lai-mat-khau`,
      {
        method: 'POST',
      },
    );
    setResetting(false);

    if (!res.ok) {
      showToast(res.error, 'error');
      return;
    }

    const msg = `Đã đặt lại mật khẩu của ${resetTarget.ho_ten} (${resetTarget.username}) về 123456`;
    setCreatedBanner(msg);
    showToast(msg, 'success');
    setResetTarget(null);
  }

  const filteredUsers = useMemo(() => {
    const qRaw = searchUser.trim().toLowerCase();
    const qKd = khongDau(searchUser);
    return users.filter((u) => {
      if (roleFilter && u.role !== roleFilter) return false;
      if (statusFilter === 'active' && !u.active) return false;
      if (statusFilter === 'locked' && u.active) return false;
      if (qRaw) {
        const matchUser = u.username.toLowerCase().includes(qRaw);
        const matchTen = qKd.length > 0 && khongDau(u.ho_ten).includes(qKd);
        if (!matchUser && !matchTen) return false;
      }
      return true;
    });
  }, [users, searchUser, roleFilter, statusFilter]);

  const hasUserFilter = Boolean(searchUser.trim() || roleFilter || statusFilter);

  return (
    <div className="page-container">
      <div className="page-header-row">
        <div>
          <h1 className="page-title">Quản lý người dùng</h1>
          <p className="page-subtitle">
            Tạo tài khoản nhân viên rà soát, phân quyền, khóa/mở khóa hoặc đặt lại mật khẩu mặc định.
          </p>
        </div>
        <div className="page-header-actions">
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={() => void reloadUsers()}
            disabled={loading}
          >
            {loading ? 'Đang tải…' : 'Tải lại'}
          </button>
        </div>
      </div>

      <section className="panel-card" aria-label="Tạo tài khoản người dùng mới">
        <div className="panel-header-inline">
          <h2 className="panel-title">Tạo tài khoản mới</h2>
          <span className="badge badge-neutral">Mật khẩu mặc định: 123456</span>
        </div>

        {createError && (
          <div className="alert alert-error" role="alert">
            {createError}
          </div>
        )}

        {createdBanner && (
          <div className="alert alert-success" role="status">
            {createdBanner}
          </div>
        )}

        <form onSubmit={handleCreateUser} className="inline-grid-form">
          <div className="form-field">
            <label htmlFor="user-username" className="form-label">
              Tên đăng nhập (chữ thường không dấu) *
            </label>
            <input
              id="user-username"
              type="text"
              className="form-input form-input-sm"
              placeholder="Ví dụ: ngan, diep..."
              required
              value={newUsername}
              onChange={(e) => setNewUsername(e.target.value.toLowerCase())}
              disabled={creating}
            />
          </div>

          <div className="form-field">
            <label htmlFor="user-hoten" className="form-label">
              Họ và tên *
            </label>
            <input
              id="user-hoten"
              type="text"
              className="form-input form-input-sm"
              placeholder="Nhập họ tên nhân viên"
              required
              value={newHoTen}
              onChange={(e) => setNewHoTen(e.target.value)}
              disabled={creating}
            />
          </div>

          <div className="form-field">
            <label htmlFor="user-role" className="form-label">
              Vai trò *
            </label>
            <select
              id="user-role"
              className="form-input form-input-sm"
              value={newRole}
              onChange={(e) =>
                setNewRole(e.target.value as 'nhan_vien' | 'admin')
              }
              disabled={creating}
            >
              <option value="nhan_vien">Nhân viên</option>
              <option value="admin">Quản trị (Admin)</option>
            </select>
          </div>

          <div className="form-actions-inline">
            <button
              type="submit"
              className="btn btn-primary btn-sm"
              disabled={creating}
            >
              {creating ? 'Đang tạo…' : '+ Tạo tài khoản'}
            </button>
          </div>
        </form>
      </section>

      <div className="filter-bar">
        <div className="filter-group">
          <label htmlFor="filter-user-q" className="filter-label">
            Tìm người dùng:
          </label>
          <input
            id="filter-user-q"
            type="search"
            className="form-input form-input-sm input-quick-buoi"
            placeholder="Họ tên hoặc tên đăng nhập…"
            value={searchUser}
            onChange={(e) => setSearchUser(e.target.value)}
          />
        </div>

        <div className="filter-group">
          <label htmlFor="filter-user-role" className="filter-label">
            Vai trò:
          </label>
          <select
            id="filter-user-role"
            className="form-select"
            value={roleFilter}
            onChange={(e) =>
              setRoleFilter(e.target.value as '' | 'nhan_vien' | 'admin')
            }
          >
            <option value="">Tất cả vai trò</option>
            <option value="nhan_vien">Nhân viên</option>
            <option value="admin">Quản trị</option>
          </select>
        </div>

        <div className="filter-group">
          <label htmlFor="filter-user-status" className="filter-label">
            Trạng thái:
          </label>
          <select
            id="filter-user-status"
            className="form-select"
            value={statusFilter}
            onChange={(e) =>
              setStatusFilter(e.target.value as '' | 'active' | 'locked')
            }
          >
            <option value="">Tất cả trạng thái</option>
            <option value="active">Đang hoạt động</option>
            <option value="locked">Đã khóa</option>
          </select>
        </div>

        <span className="selected-counter">
          Hiển thị <strong className="num">{formatNumber(filteredUsers.length)}</strong> /{' '}
          <strong className="num">{formatNumber(users.length)}</strong> tài khoản
        </span>

        {hasUserFilter && (
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={() => {
              setSearchUser('');
              setRoleFilter('');
              setStatusFilter('');
            }}
          >
            Xóa lọc
          </button>
        )}
      </div>

      {error && (
        <div className="state-box state-error" role="alert">
          <p className="state-title">Không tải được danh sách người dùng: {error}</p>
          <button
            type="button"
            className="btn btn-primary btn-sm"
            onClick={() => void reloadUsers()}
          >
            Thử tải lại
          </button>
        </div>
      )}

      {!error && loading && (
        <div className="state-box" role="status">
          <p className="state-title">Đang tải danh sách người dùng…</p>
        </div>
      )}

      {!error && !loading && filteredUsers.length === 0 && (
        <div className="state-box" role="status">
          <p className="state-title">Không có người dùng nào khớp với bộ lọc</p>
          {hasUserFilter && (
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={() => {
                setSearchUser('');
                setRoleFilter('');
                setStatusFilter('');
              }}
            >
              Xóa lọc
            </button>
          )}
        </div>
      )}

      {!error && !loading && filteredUsers.length > 0 && (
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Họ tên</th>
                <th>Tên đăng nhập</th>
                <th>Vai trò</th>
                <th>Trạng thái</th>
                <th className="num-col">Số buổi phụ trách</th>
                <th>Lần hoạt động gần nhất</th>
                <th>Thao tác</th>
              </tr>
            </thead>
            <tbody>
              {filteredUsers.map((u) => {
                const isSelf = u.id === currentUserId;
                const isEditing = editingId === u.id;
                const isSaving = savingId === u.id;

                return (
                  <tr key={u.id} className={!u.active ? 'row-muted' : ''}>
                    <td>
                      {isEditing ? (
                        <input
                          type="text"
                          className="form-input form-input-xs"
                          value={editHoTen}
                          onChange={(e) => setEditHoTen(e.target.value)}
                          disabled={isSaving}
                          aria-label="Họ tên"
                        />
                      ) : (
                        <strong>
                          {u.ho_ten}{' '}
                          {isSelf && (
                            <span className="text-muted text-xs">(Bạn)</span>
                          )}
                        </strong>
                      )}
                    </td>
                    <td>
                      <code>{u.username}</code>
                    </td>
                    <td>
                      {isEditing ? (
                        <select
                          className="form-input form-input-xs"
                          value={editRole}
                          onChange={(e) =>
                            setEditRole(e.target.value as 'nhan_vien' | 'admin')
                          }
                          disabled={isSaving || isSelf}
                          aria-label="Vai trò"
                        >
                          <option value="nhan_vien">Nhân viên</option>
                          <option value="admin">Quản trị</option>
                        </select>
                      ) : u.role === 'admin' ? (
                        <span className="badge badge-primary">Quản trị</span>
                      ) : (
                        <span className="badge badge-neutral">Nhân viên</span>
                      )}
                    </td>
                    <td>
                      {u.active ? (
                        <span className="badge badge-success">
                          ✓ Đang hoạt động
                        </span>
                      ) : (
                        <span className="badge badge-danger">× Đã khóa</span>
                      )}
                    </td>
                    <td className="num-col">{formatNumber(u.so_buoi)}</td>
                    <td className="num">
                      {u.last_seen_at
                        ? formatDateTime(u.last_seen_at)
                        : 'Chưa hoạt động'}
                    </td>
                    <td className="nowrap">
                      <div className="inline-btn-group">
                        {isEditing ? (
                          <>
                            <button
                              type="button"
                              className="btn btn-primary btn-xs"
                              disabled={isSaving}
                              onClick={() => void handleSaveEdit(u)}
                            >
                              {isSaving ? 'Lưu…' : 'Lưu'}
                            </button>
                            <button
                              type="button"
                              className="btn btn-secondary btn-xs"
                              disabled={isSaving}
                              onClick={() => setEditingId(null)}
                            >
                              Hủy
                            </button>
                          </>
                        ) : (
                          <>
                            <button
                              type="button"
                              className="btn btn-secondary btn-xs"
                              onClick={() => startEdit(u)}
                            >
                              Sửa
                            </button>
                            <button
                              type="button"
                              className="btn btn-secondary btn-xs"
                              onClick={() => setResetTarget(u)}
                            >
                              Đặt lại mật khẩu về 123456
                            </button>
                            <button
                              type="button"
                              className={`btn btn-xs ${
                                u.active
                                  ? 'btn-danger-outline'
                                  : 'btn-secondary'
                              }`}
                              disabled={isSelf && u.active}
                              title={
                                isSelf
                                  ? 'Không thể tự khóa tài khoản đang đăng nhập'
                                  : undefined
                              }
                              onClick={() => setLockTarget(u)}
                            >
                              {u.active ? 'Khóa' : 'Mở khóa'}
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <ConfirmDialog
        open={lockTarget !== null}
        title={
          lockTarget?.active
            ? `Xác nhận khóa tài khoản: ${lockTarget.ho_ten}`
            : `Xác nhận mở khóa tài khoản: ${lockTarget?.ho_ten ?? ''}`
        }
        confirmLabel={
          lockTarget?.active ? 'Khóa tài khoản' : 'Mở khóa tài khoản'
        }
        cancelLabel="Hủy bỏ"
        danger={Boolean(lockTarget?.active)}
        loading={locking}
        onConfirm={() => void handleConfirmLockToggle()}
        onCancel={() => setLockTarget(null)}
      >
        {lockTarget && (
          <div className="modal-text">
            <p>
              Đối tượng: <strong>{lockTarget.ho_ten}</strong> (tên đăng nhập:{' '}
              <code>{lockTarget.username}</code>).
            </p>
            <p className="mt-2">
              {lockTarget.active
                ? 'Hệ quả: Người dùng này sẽ bị đăng xuất ngay lập tức và không thể đăng nhập hay chỉnh sửa hồ sơ cho đến khi được mở khóa lại.'
                : 'Hệ quả: Người dùng này sẽ được phép đăng nhập lại vào hệ thống và tiếp tục rà soát các buổi được phân công.'}
            </p>
          </div>
        )}
      </ConfirmDialog>

      <ConfirmDialog
        open={resetTarget !== null}
        title={`Xác nhận đặt lại mật khẩu: ${resetTarget?.ho_ten ?? ''}`}
        confirmLabel="Đặt lại mật khẩu về 123456"
        cancelLabel="Hủy bỏ"
        loading={resetting}
        onConfirm={() => void handleConfirmResetPassword()}
        onCancel={() => setResetTarget(null)}
      >
        {resetTarget && (
          <div className="modal-text">
            <p>
              Đối tượng: <strong>{resetTarget.ho_ten}</strong> (tên đăng nhập:{' '}
              <code>{resetTarget.username}</code>).
            </p>
            <p className="mt-2">
              Hành động &amp; hệ quả: Mật khẩu của tài khoản này sẽ được đặt lại về mặc định{' '}
              <strong>123456</strong>. Mọi phiên đăng nhập hiện tại của người dùng này sẽ hết hiệu lực và cần đăng nhập lại.
            </p>
          </div>
        )}
      </ConfirmDialog>
    </div>
  );
}
