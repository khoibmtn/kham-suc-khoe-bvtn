import { Suspense } from 'react';
import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth/guard';
import { AppShell } from '@/components/app-shell';
import { RaSoatChonBuoi } from '@/components/ra-soat-chon-buoi';

async function RaSoatPageContent() {
  const user = await getCurrentUser();
  if (!user) {
    redirect('/dang-nhap?next=%2Fra-soat');
  }

  return (
    <AppShell user={user}>
      <RaSoatChonBuoi />
    </AppShell>
  );
}

export default function RaSoatPage() {
  return (
    <Suspense
      fallback={
        <div className="page-container">
          <div className="state-box">
            <p className="state-title">Đang tải trang chọn buổi khám…</p>
          </div>
        </div>
      }
    >
      <RaSoatPageContent />
    </Suspense>
  );
}
