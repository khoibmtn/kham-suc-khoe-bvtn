import { Suspense } from 'react';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth/guard';
import { AppShell } from '@/components/app-shell';
import { AdminNhatKyView } from '@/components/admin-nhat-ky-view';

async function AdminNhatKyContent() {
  const user = await getCurrentUser();
  if (!user) {
    redirect('/dang-nhap?next=%2Fadmin%2Fnhat-ky');
  }

  if (user.role !== 'admin') {
    return (
      <AppShell user={user}>
        <div className="page-container">
          <div className="state-box state-error" role="alert">
            <p className="state-title">Bạn không có quyền truy cập trang này</p>
            <p className="state-desc">
              Chức năng Nhật ký hoạt động chỉ dành cho Quản trị viên (BS Khôi).
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
      <AdminNhatKyView />
    </AppShell>
  );
}

export default function AdminNhatKyPage() {
  return (
    <Suspense
      fallback={
        <div className="page-container">
          <div className="state-box">
            <p className="state-title">Đang tải trang Nhật ký hoạt động…</p>
          </div>
        </div>
      }
    >
      <AdminNhatKyContent />
    </Suspense>
  );
}
