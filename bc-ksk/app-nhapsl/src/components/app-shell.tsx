'use client';

import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { LogoutButton } from '@/app/logout-button';

export type ShellUser = {
  id: number;
  username: string;
  ho_ten: string;
  role: 'admin' | 'nhan_vien';
};

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

  const isLoginPage = pathname === '/dang-nhap' || pathname.startsWith('/dang-nhap/');
  const currentUser = propUser ?? fetchedUser;

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

  if (isLoginPage) {
    return <>{children}</>;
  }

  if (isInsideShell) {
    return <>{children}</>;
  }

  const isAdmin = currentUser?.role === 'admin';
  const vaiTroNhan = isAdmin ? 'Quản trị' : 'Nhân viên';

  const isHomeActive = pathname === '/';
  const isRaSoatActive = pathname === '/ra-soat' || pathname.startsWith('/ra-soat/');
  const isPhanCongActive = pathname.startsWith('/admin/phan-cong');
  const isNguoiDungActive = pathname.startsWith('/admin/nguoi-dung');
  const isDoiMatKhauActive = pathname.startsWith('/doi-mat-khau');

  return (
    <AppShellActiveContext.Provider value={true}>
      <div className="app-layout">
        <header className="app-topbar">
          <div className="app-topbar-inner">
            <div className="app-topbar-left">
              <Link href="/" className="app-brand">
                Rà soát hồ sơ KSK 2026
              </Link>
              <nav className="app-nav" aria-label="Điều hướng chính">
                <Link
                  href="/"
                  className={`app-nav-link ${isHomeActive ? 'active' : ''}`}
                  aria-current={isHomeActive ? 'page' : undefined}
                >
                  Danh sách của tôi
                </Link>
                <Link
                  href="/ra-soat"
                  className={`app-nav-link ${isRaSoatActive ? 'active' : ''}`}
                  aria-current={isRaSoatActive ? 'page' : undefined}
                >
                  Rà soát
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
                  </>
                )}
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

        <main className={fullWidth ? 'app-main app-main-full' : 'app-main'}>
          {children}
        </main>
      </div>
    </AppShellActiveContext.Provider>
  );
}
