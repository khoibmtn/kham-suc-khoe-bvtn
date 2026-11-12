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
import type { DeNghiChuyen, KetQuaTimKiem } from '@/lib/api-types';
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

  const isLoginPage = pathname === '/dang-nhap' || pathname.startsWith('/dang-nhap/');
  const currentUser = propUser ?? fetchedUser;
  const currentUserRef = useRef<ShellUser | null>(null);
  useEffect(() => {
    currentUserRef.current = currentUser;
  }, [currentUser]);

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
          // Same rule as the banner: only requests addressed to me (not the ones I sent).
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

  return (
    <AppShellActiveContext.Provider value={true}>
      <div className="app-layout">
        <CapNhatPhienBan />
        <header className="app-topbar">
          <div className="app-topbar-inner">
            <div className="app-topbar-left">
              <Link href={isAdmin ? '/admin' : '/'} className="app-brand">
                Rà soát hồ sơ KSK 2026
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
              <Link
                href="/doi-mat-khau"
                className={`btn btn-sm btn-secondary ${isDoiMatKhauActive ? 'active-btn' : ''}`}
              >
                Đổi mật khẩu
              </Link>
              <LogoutButton />
            </div>
          </div>
        </header>

        {currentUser && <DeNghiThongBao userId={currentUser.id} isAdmin={isAdmin} />}

        <main className={fullWidth ? 'app-main app-main-full' : 'app-main'}>
          {children}
        </main>
      </div>
    </AppShellActiveContext.Provider>
  );
}
