import { Suspense } from 'react';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth/guard';
import { AppShell } from '@/components/app-shell';
import { AdminPhanCongView } from '@/components/admin-phan-cong-view';

async function AdminPhanCongContent() {
  const user = await getCurrentUser();
  if (!user) {
    redirect('/dang-nhap?next=%2Fadmin%2Fphan-cong');
  }

  if (user.role !== 'admin') {
    return (
      <AppShell user={user}>
        <div className="page-container">
          <div className="state-box state-error" role="alert">
            <p className="state-title">Bạn không có quyền truy cập trang này</p>
            <p className="state-desc">
              Chức năng Quản lý phân công chỉ dành cho Quản trị viên (BS Khôi).
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
      <AdminPhanCongView />
    </AppShell>
  );
}

export default function AdminPhanCongPage() {
  return (
    <Suspense
      fallback={
        <div className="page-container">
          <div className="state-box">
            <p className="state-title">Đang tải trang phân công…</p>
          </div>
        </div>
      }
    >
      <AdminPhanCongContent />
    </Suspense>
  );
}
