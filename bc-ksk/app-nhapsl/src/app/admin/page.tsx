import { Suspense } from 'react';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth/guard';
import { AppShell } from '@/components/app-shell';
import { AdminTongQuanView } from '@/components/admin-tong-quan-view';

async function AdminTongQuanContent() {
  const user = await getCurrentUser();
  if (!user) {
    redirect('/dang-nhap?next=%2Fadmin');
  }

  if (user.role !== 'admin') {
    return (
      <AppShell user={user}>
        <div className="page-container">
          <div className="state-box state-error" role="alert">
            <p className="state-title">Bạn không có quyền truy cập trang này</p>
            <p className="state-desc">
              Chức năng Tổng quan toàn hệ thống chỉ dành cho Quản trị viên (BS
              Khôi).
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
      <AdminTongQuanView />
    </AppShell>
  );
}

export default function AdminTongQuanPage() {
  return (
    <Suspense
      fallback={
        <div className="page-container">
          <div className="state-box">
            <p className="state-title">Đang tải trang Tổng quan…</p>
          </div>
        </div>
      }
    >
      <AdminTongQuanContent />
    </Suspense>
  );
}
