import { Suspense } from 'react';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth/guard';
import { LogoutButton } from './logout-button';

async function HomeUserCard() {
  const user = await getCurrentUser();
  if (!user) {
    redirect('/dang-nhap');
  }

  const vaiTroNhan = user.role === 'admin' ? 'Quản trị' : 'Nhân viên';

  return (
    <div className="auth-card">
      <div className="auth-header">
        <h1 className="auth-title">Xin chào, {user.ho_ten}</h1>
        <p className="auth-subtitle">Rà soát hồ sơ khám sức khỏe toàn dân 2026</p>
      </div>

      <p className="auth-meta">
        Tài khoản: <strong>{user.username}</strong> · Vai trò: <strong>{vaiTroNhan}</strong>
      </p>

      <div className="auth-actions-row">
        <Link href="/doi-mat-khau" className="btn btn-secondary">
          Đổi mật khẩu
        </Link>
        <LogoutButton />
      </div>
    </div>
  );
}

export default function HomePage() {
  return (
    <main className="auth-shell">
      <Suspense
        fallback={
          <div className="auth-card">
            <p className="auth-subtitle">Đang tải thông tin tài khoản…</p>
          </div>
        }
      >
        <HomeUserCard />
      </Suspense>
    </main>
  );
}
