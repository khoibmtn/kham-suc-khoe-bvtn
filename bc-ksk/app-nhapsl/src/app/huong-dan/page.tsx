import { Suspense } from 'react';
import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth/guard';
import { AppShell } from '@/components/app-shell';
import { HuongDanView } from '@/components/huong-dan-view';
import './huong-dan.css';

async function HuongDanContent() {
  const user = await getCurrentUser();
  if (!user) {
    redirect('/dang-nhap?next=%2Fhuong-dan');
  }

  return (
    <AppShell user={user}>
      <HuongDanView />
    </AppShell>
  );
}

export const metadata = { title: 'Hướng dẫn sử dụng · Rà soát hồ sơ KSK 2026' };

export default function HuongDanPage() {
  return (
    <Suspense
      fallback={
        <div className="page-container">
          <div className="state-box">
            <p className="state-title">Đang tải hướng dẫn…</p>
          </div>
        </div>
      }
    >
      <HuongDanContent />
    </Suspense>
  );
}
