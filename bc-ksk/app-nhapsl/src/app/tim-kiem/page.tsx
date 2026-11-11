import { Suspense } from 'react';
import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth/guard';
import { AppShell } from '@/components/app-shell';
import { TimKiemView } from '@/components/tim-kiem-view';

async function TimKiemPageContent() {
  const user = await getCurrentUser();
  if (!user) {
    redirect('/dang-nhap?next=%2Ftim-kiem');
  }

  return (
    <AppShell user={user} fullWidth>
      <TimKiemView />
    </AppShell>
  );
}

export default function TimKiemPage() {
  return (
    <Suspense
      fallback={
        <div className="page-container">
          <div className="state-box">
            <p className="state-title">Đang tải trang tìm kiếm…</p>
          </div>
        </div>
      }
    >
      <TimKiemPageContent />
    </Suspense>
  );
}
