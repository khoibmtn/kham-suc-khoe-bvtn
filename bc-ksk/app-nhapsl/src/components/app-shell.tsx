'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { LogoutButton } from '@/app/logout-button';
import { CapNhatPhienBan } from '@/components/cap-nhat-phien-ban';
import { DeNghiThongBao, denToi } from '@/components/de-nghi-thong-bao';
import { ThongBaoAmBaoModal } from '@/components/thong-bao-am-bao-modal';
import type { DeNghiChuyen, KetQuaTimKiem } from '@/lib/api-types';
import { khoiTaoMoKhoaAmBao } from '@/lib/client/am-bao';
import { formatNumber } from '@/lib/client/format';

export type ShellUser = {
  id: number;
  username: string;
  ho_ten: string;
  role: 'admin' | 'nhan_vien';
};

export function notifyPoolChanged(): void {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('nhapsl:pool-changed'));
  }
}

export function openThongBaoAmBaoModal(): void {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('nhapsl:open-thong-bao-modal'));
  }
}

const AppShellActiveContext = createContext<boolean>(false);

type AppShellProps = {
  user?: ShellUser | null;
  children: ReactNode;
  fullWidth?: boolean;
};

export function AppShell({ user: propUser, children, fullWidth = false }: AppShellProps) {
  const pathname = usePathname();
  const isInsideShell = useContext(AppShellActiveContext);
  const [fetchedUser, setFetchedUser] = useState<ShellUser | null>(null);
  const [khoCaNhanCount, setKhoCaNhanCount] = useState<number>(0);
  const [deNghiChoCount, setDeNghiChoCount] = useState<number>(0);
  const [thongBaoModalOpen, setThongBaoModalOpen] = useState<boolean>(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState<boolean>(false);

  const isLoginPage = pathname === '/dang-nhap' || pathname.startsWith('/dang-nhap/');
  const currentUser = propUser ?? fetchedUser;
  const currentUserRef = useRef<ShellUser | null>(null);
  useEffect(() => {
    currentUserRef.current = currentUser;
  }, [currentUser]);

  // Mở khóa AudioContext ở thao tác đầu tiên + lắng nghe sự kiện mở modal Thông báo & âm báo
  useEffect(() => {
    if (isLoginPage || isInsideShell) return;
    const cleanupAudio = khoiTaoMoKhoaAmBao();
    const onOpenModal = () => setThongBaoModalOpen(true);
    window.addEventListener('nhapsl:open-thong-bao-modal', onOpenModal);
    return () => {
      cleanupAudio();
      window.removeEventListener('nhapsl:open-thong-bao-modal', onOpenModal);
    };
  }, [isLoginPage, isInsideShell]);

  // Đăng ký Service Worker khi đã đăng nhập
  useEffect(() => {
    if (isLoginPage || isInsideShell || !currentUser) return;
    if (typeof navigator !== 'undefined' && 'serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js').catch(() => {
        // Bỏ qua nếu trình duyệt không hỗ trợ hoặc từ chối SW
      });
    }
  }, [isLoginPage, isInsideShell, currentUser]);

  useEffect(() => {
    if (isLoginPage || propUser) return;

    let cancelled = false;
    fetch('/api/auth/me', { cache: 'no-store' })
      .then((res) => (res.ok ? res.json() : null))
      .then((data: ShellUser | null) => {
        if (!cancelled && data && typeof data.username === 'string') {
          setFetchedUser(data);
        }
      })
      .catch(() => {
        // Ignore network errors on passive shell fetch
      });

    return () => {
      cancelled = true;
    };
  }, [isLoginPage, propUser, pathname]);

  const loadNavCounts = useCallback(() => {
    if (isLoginPage || isInsideShell) return;

    fetch('/api/kho-ca-nhan', { cache: 'no-store' })
      .then((res) => (res.ok ? res.json() : null))
      .then((data: { ho_so?: KetQuaTimKiem[] } | null) => {
        if (data && Array.isArray(data.ho_so)) {
          setKhoCaNhanCount(data.ho_so.length);
        }
      })
      .catch(() => {});

    fetch('/api/de-nghi-chuyen?trang_thai=cho_xu_ly', { cache: 'no-store' })
      .then((res) => (res.ok ? res.json() : null))
      .then((data: { de_nghi?: DeNghiChuyen[] } | null) => {
        if (data && Array.isArray(data.de_nghi)) {
          const me = currentUserRef.current;
          setDeNghiChoCount(
            me ? data.de_nghi.filter((d) => denToi(d, me.id, me.role === 'admin')).length : 0,
          );
        }
      })
      .catch(() => {});
  }, [isInsideShell, isLoginPage]);

  useEffect(() => {
    if (isLoginPage || isInsideShell) return;
    loadNavCounts();

    const handlePoolChanged = () => {
      loadNavCounts();
    };
    window.addEventListener('nhapsl:pool-changed', handlePoolChanged);
    return () => {
      window.removeEventListener('nhapsl:pool-changed', handlePoolChanged);
    };
  }, [isInsideShell, isLoginPage, loadNavCounts, pathname, currentUser?.id]);

  if (isLoginPage) {
    return <>{children}</>;
  }

  if (isInsideShell) {
    return <>{children}</>;
  }

  const isAdmin = currentUser?.role === 'admin';
  const vaiTroNhan = isAdmin ? 'Quản trị' : 'Nhân viên';

  const isAdminOverviewActive = pathname === '/admin';
  const isHomeActive = pathname === '/';
  const isRaSoatActive = pathname === '/ra-soat' || pathname.startsWith('/ra-soat/');
  const isKhoActive = pathname === '/kho' || pathname.startsWith('/kho/');
  const isTimKiemActive = pathname === '/tim-kiem' || pathname.startsWith('/tim-kiem/');
  const isPhanCongActive = pathname.startsWith('/admin/phan-cong');
  const isNguoiDungActive = pathname.startsWith('/admin/nguoi-dung');
  const isNapDuLieuActive = pathname.startsWith('/admin/nap-du-lieu');
  const isNhatKyActive = pathname.startsWith('/admin/nhat-ky');
  const isHuongDanActive = pathname === '/huong-dan' || pathname.startsWith('/huong-dan/');
  const isDoiMatKhauActive = pathname.startsWith('/doi-mat-khau');
  const isMoreActive =
    isHuongDanActive ||
    isDoiMatKhauActive ||
    isAdminOverviewActive ||
    isPhanCongActive ||
    isNguoiDungActive ||
    isNapDuLieuActive ||
    isNhatKyActive;

  return (
    <AppShellActiveContext.Provider value={true}>
      <div className="app-layout">
        <CapNhatPhienBan />
        <header className="app-topbar">
          <div className="app-topbar-inner">
            <div className="app-topbar-left">
              <Link href={isAdmin ? '/admin' : '/'} className="app-brand">
                <span className="app-brand-full">Rà soát hồ sơ KSK 2026</span>
                <span className="app-brand-short">Rà soát KSK</span>
              </Link>
              <nav className="app-nav" aria-label="Điều hướng chính">
                {isAdmin && (
                  <Link
                    href="/admin"
                    className={`app-nav-link ${isAdminOverviewActive ? 'active' : ''}`}
                    aria-current={isAdminOverviewActive ? 'page' : undefined}
                  >
                    Tổng quan
                  </Link>
                )}
                <Link
                  href="/"
                  className={`app-nav-link ${isHomeActive ? 'active' : ''}`}
                  aria-current={isHomeActive ? 'page' : undefined}
                >
                  {isAdmin ? 'Danh sách' : 'Danh sách của tôi'}
                </Link>
                <Link
                  href="/ra-soat"
                  className={`app-nav-link ${isRaSoatActive ? 'active' : ''}`}
                  aria-current={isRaSoatActive ? 'page' : undefined}
                >
                  Rà soát
                </Link>
                <Link
                  href="/kho"
                  className={`app-nav-link ${isKhoActive ? 'active' : ''}`}
                  aria-current={isKhoActive ? 'page' : undefined}
                >
                  <span>Kho chờ</span>
                  <span
                    className={`nav-badge num ${khoCaNhanCount > 0 ? 'nav-badge-primary' : 'nav-badge-neutral'}`}
                    title={`Kho của tôi: ${formatNumber(khoCaNhanCount)} hồ sơ`}
                    aria-label={`Kho của tôi: ${formatNumber(khoCaNhanCount)} hồ sơ`}
                  >
                    {formatNumber(khoCaNhanCount)}
                  </span>
                  {deNghiChoCount > 0 && (
                    <span
                      className="nav-badge nav-badge-warning num"
                      title={`Đề nghị chuyển chờ xử lý: ${formatNumber(deNghiChoCount)}`}
                      aria-label={`Đề nghị chuyển chờ xử lý: ${formatNumber(deNghiChoCount)}`}
                    >
                      Đề nghị: {formatNumber(deNghiChoCount)}
                    </span>
                  )}
                </Link>
                <Link
                  href="/tim-kiem"
                  className={`app-nav-link ${isTimKiemActive ? 'active' : ''}`}
                  aria-current={isTimKiemActive ? 'page' : undefined}
                >
                  Tìm kiếm
                </Link>
                {isAdmin && (
                  <>
                    <Link
                      href="/admin/phan-cong"
                      className={`app-nav-link ${isPhanCongActive ? 'active' : ''}`}
                      aria-current={isPhanCongActive ? 'page' : undefined}
                    >
                      Phân công
                    </Link>
                    <Link
                      href="/admin/nguoi-dung"
                      className={`app-nav-link ${isNguoiDungActive ? 'active' : ''}`}
                      aria-current={isNguoiDungActive ? 'page' : undefined}
                    >
                      Người dùng
                    </Link>
                    <Link
                      href="/admin/nap-du-lieu"
                      className={`app-nav-link ${isNapDuLieuActive ? 'active' : ''}`}
                      aria-current={isNapDuLieuActive ? 'page' : undefined}
                    >
                      Nạp dữ liệu
                    </Link>
                    <Link
                      href="/admin/nhat-ky"
                      className={`app-nav-link ${isNhatKyActive ? 'active' : ''}`}
                      aria-current={isNhatKyActive ? 'page' : undefined}
                    >
                      Nhật ký
                    </Link>
                  </>
                )}
                <Link
                  href="/huong-dan"
                  className={`app-nav-link ${isHuongDanActive ? 'active' : ''}`}
                  aria-current={isHuongDanActive ? 'page' : undefined}
                >
                  Hướng dẫn
                </Link>
              </nav>
            </div>

            <div className="app-topbar-right">
              {currentUser && (
                <div className="app-user-info">
                  <span className="app-user-name">{currentUser.ho_ten}</span>
                  <span className={`badge ${isAdmin ? 'badge-primary' : 'badge-neutral'}`}>
                    {vaiTroNhan}
                  </span>
                </div>
              )}
              <button
                type="button"
                className={`btn btn-sm btn-secondary app-bell-btn${isAdmin ? ' app-bell-compact' : ''}`}
                onClick={() => setThongBaoModalOpen(true)}
                aria-label={
                  deNghiChoCount > 0
                    ? `Thông báo và âm báo (${formatNumber(deNghiChoCount)} đề nghị chờ)`
                    : 'Thông báo và âm báo'
                }
                title="Thông báo & âm báo"
              >
                <svg
                  width="17"
                  height="17"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
                  <path d="M13.73 21a2 2 0 0 1-3.46 0" />
                </svg>
                <span className="app-bell-label">Âm báo</span>
                {deNghiChoCount > 0 && (
                  <span className="app-bell-badge num">{formatNumber(deNghiChoCount)}</span>
                )}
              </button>
              <Link
                href="/doi-mat-khau"
                className={`btn btn-sm btn-secondary app-desktop-only-btn ${isDoiMatKhauActive ? 'active-btn' : ''}`}
              >
                Đổi mật khẩu
              </Link>
              <div className="app-desktop-only-btn">
                <LogoutButton />
              </div>
              <button
                type="button"
                className="btn btn-sm btn-secondary app-mobile-menu-btn"
                onClick={() => setMobileMenuOpen((v) => !v)}
                aria-label="Mở menu chức năng"
                aria-expanded={mobileMenuOpen}
              >
                <svg
                  width="18"
                  height="18"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <line x1="3" y1="6" x2="21" y2="6" />
                  <line x1="3" y1="12" x2="21" y2="12" />
                  <line x1="3" y1="18" x2="21" y2="18" />
                </svg>
              </button>
            </div>
          </div>
        </header>

        {currentUser && <DeNghiThongBao userId={currentUser.id} isAdmin={isAdmin} />}

        <main className={fullWidth ? 'app-main app-main-full' : 'app-main'}>
          {children}
        </main>

        {/* Thanh tab cố định dưới cùng cho điện thoại / máy tính bảng (< 1024px) */}
        <nav className="app-bottom-nav" aria-label="Điều hướng di động">
          <Link
            href="/"
            className={`app-bottom-tab ${isHomeActive ? 'active' : ''}`}
            aria-current={isHomeActive ? 'page' : undefined}
          >
            <svg
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M3 10.5L12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1v-9.5z" />
            </svg>
            <span>Trang chủ</span>
          </Link>
          <Link
            href="/ra-soat"
            className={`app-bottom-tab ${isRaSoatActive ? 'active' : ''}`}
            aria-current={isRaSoatActive ? 'page' : undefined}
          >
            <svg
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M9 11l3 3L22 4" />
              <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
            </svg>
            <span>Rà soát</span>
          </Link>
          <Link
            href="/kho"
            className={`app-bottom-tab ${isKhoActive ? 'active' : ''}`}
            aria-current={isKhoActive ? 'page' : undefined}
          >
            <span className="app-bottom-tab-icon-wrap">
              <svg
                width="20"
                height="20"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d="M21 8v13H3V8" />
                <path d="M1 3h22v5H1z" />
                <path d="M10 12h4" />
              </svg>
              {(deNghiChoCount > 0 || khoCaNhanCount > 0) && (
                <span
                  className={`app-bottom-badge num ${deNghiChoCount > 0 ? 'app-bottom-badge-warn' : ''}`}
                >
                  {formatNumber(deNghiChoCount > 0 ? deNghiChoCount : khoCaNhanCount)}
                </span>
              )}
            </span>
            <span>Kho &amp; đề nghị</span>
          </Link>
          <Link
            href="/tim-kiem"
            className={`app-bottom-tab ${isTimKiemActive ? 'active' : ''}`}
            aria-current={isTimKiemActive ? 'page' : undefined}
          >
            <svg
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <circle cx="11" cy="11" r="8" />
              <line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
            <span>Tìm kiếm</span>
          </Link>
          <button
            type="button"
            className={`app-bottom-tab ${mobileMenuOpen || isMoreActive ? 'active' : ''}`}
            onClick={() => setMobileMenuOpen((v) => !v)}
            aria-expanded={mobileMenuOpen}
          >
            <svg
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <circle cx="12" cy="12" r="1.5" />
              <circle cx="19" cy="12" r="1.5" />
              <circle cx="5" cy="12" r="1.5" />
            </svg>
            <span>Thêm</span>
          </button>
        </nav>

        {/* Tấm menu "Thêm" trên điện thoại */}
        {mobileMenuOpen && (
          <div
            className="mobile-sheet-backdrop"
            role="dialog"
            aria-modal="true"
            aria-label="Menu mở rộng"
            onClick={(e) => {
              if (e.target === e.currentTarget) setMobileMenuOpen(false);
            }}
          >
            <div className="mobile-sheet">
              <div className="mobile-sheet-header">
                <div>
                  <div className="mobile-sheet-title">
                    {currentUser ? currentUser.ho_ten : 'Tài khoản'}
                  </div>
                  {currentUser && (
                    <div className="mobile-sheet-sub">
                      {vaiTroNhan} ({currentUser.username})
                    </div>
                  )}
                </div>
                <button
                  type="button"
                  className="btn btn-sm"
                  onClick={() => setMobileMenuOpen(false)}
                >
                  Đóng
                </button>
              </div>
              <div className="mobile-sheet-list">
                {isAdmin && (
                  <>
                    <div className="mobile-sheet-group-label">Quản trị</div>
                    <Link
                      href="/admin"
                      className="mobile-sheet-item"
                      onClick={() => setMobileMenuOpen(false)}
                    >
                      Tổng quan &amp; Tự duyệt đề nghị
                    </Link>
                    <Link
                      href="/admin/phan-cong"
                      className="mobile-sheet-item"
                      onClick={() => setMobileMenuOpen(false)}
                    >
                      Phân công buổi khám
                    </Link>
                    <Link
                      href="/admin/nguoi-dung"
                      className="mobile-sheet-item"
                      onClick={() => setMobileMenuOpen(false)}
                    >
                      Quản lý người dùng
                    </Link>
                    <Link
                      href="/admin/nap-du-lieu"
                      className="mobile-sheet-item"
                      onClick={() => setMobileMenuOpen(false)}
                    >
                      Nạp &amp; xuất dữ liệu
                    </Link>
                    <Link
                      href="/admin/nhat-ky"
                      className="mobile-sheet-item"
                      onClick={() => setMobileMenuOpen(false)}
                    >
                      Nhật ký thay đổi
                    </Link>
                  </>
                )}
                <div className="mobile-sheet-group-label">Tiện ích &amp; Tài khoản</div>
                <button
                  type="button"
                  className="mobile-sheet-item"
                  onClick={() => {
                    setMobileMenuOpen(false);
                    setThongBaoModalOpen(true);
                  }}
                >
                  <span>Thông báo &amp; âm báo</span>
                  {deNghiChoCount > 0 && (
                    <span className="badge badge-danger num">
                      {formatNumber(deNghiChoCount)} chờ
                    </span>
                  )}
                </button>
                <Link
                  href="/huong-dan"
                  className="mobile-sheet-item"
                  onClick={() => setMobileMenuOpen(false)}
                >
                  Hướng dẫn sử dụng
                </Link>
                <Link
                  href="/doi-mat-khau"
                  className="mobile-sheet-item"
                  onClick={() => setMobileMenuOpen(false)}
                >
                  Đổi mật khẩu
                </Link>
                <div className="mobile-sheet-logout">
                  <LogoutButton />
                </div>
              </div>
            </div>
          </div>
        )}

        <ThongBaoAmBaoModal
          open={thongBaoModalOpen}
          onClose={() => setThongBaoModalOpen(false)}
        />
      </div>
    </AppShellActiveContext.Provider>
  );
}
