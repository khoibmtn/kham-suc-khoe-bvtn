import { Suspense } from 'react';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth/guard';
import { AppShell } from '@/components/app-shell';
import { AdminNapDuLieuView } from '@/components/admin-nap-du-lieu-view';

async function AdminNapDuLieuContent() {
  const user = await getCurrentUser();
  if (!user) {
    redirect('/dang-nhap?next=%2Fadmin%2Fnap-du-lieu');
  }

  if (user.role !== 'admin') {
    return (
      <AppShell user={user}>
        <div className="page-container">
          <div className="state-box state-error" role="alert">
            <p className="state-title">Bạn không có quyền truy cập trang này</p>
            <p className="state-desc">
              Chức năng Nạp dữ liệu chỉ dành cho Quản trị viên (BS Khôi).
            </p>
            <Link href="/" className="btn btn-primary btn-sm">
              ← Quay về Danh sách của tôi
            </Link>
          </div>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell user={user}>
      <AdminNapDuLieuView />
    </AppShell>
  );
}

export default function AdminNapDuLieuPage() {
  return (
    <Suspense
      fallback={
        <div className="page-container">
          <div className="state-box">
            <p className="state-title">Đang tải trang Nạp dữ liệu…</p>
          </div>
        </div>
      }
    >
      <AdminNapDuLieuContent />
    </Suspense>
  );
}
