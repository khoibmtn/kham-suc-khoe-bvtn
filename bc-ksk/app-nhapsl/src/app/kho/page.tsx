import { Suspense } from 'react';
import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth/guard';
import { AppShell } from '@/components/app-shell';
import { KhoView } from '@/components/kho-view';

async function KhoPageContent() {
  const user = await getCurrentUser();
  if (!user) {
    redirect('/dang-nhap?next=%2Fkho');
  }

  return (
    <AppShell user={user} fullWidth>
      <KhoView currentUser={user} />
    </AppShell>
  );
}

export default function KhoPage() {
  return (
    <Suspense
      fallback={
        <div className="page-container">
          <div className="state-box">
            <p className="state-title">Đang tải trang Kho chờ…</p>
          </div>
        </div>
      }
    >
      <KhoPageContent />
    </Suspense>
  );
}
