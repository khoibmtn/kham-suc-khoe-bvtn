import { Suspense } from 'react';
import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth/guard';
import { AppShell } from '@/components/app-shell';
import { RaSoatView } from '@/components/ra-soat-view';

type RaSoatMaBuoiPageProps = {
  params: Promise<{ ma_buoi: string }>;
};

async function RaSoatMaBuoiContent({
  params,
}: {
  params: Promise<{ ma_buoi: string }>;
}) {
  const { ma_buoi } = await params;
  const user = await getCurrentUser();
  if (!user) {
    redirect(`/dang-nhap?next=${encodeURIComponent(`/ra-soat/${ma_buoi}`)}`);
  }

  return (
    <AppShell user={user} fullWidth>
      <RaSoatView
        key={ma_buoi}
        maBuoi={ma_buoi}
        isAdmin={user.role === 'admin'}
      />
    </AppShell>
  );
}

export default function RaSoatMaBuoiPage({ params }: RaSoatMaBuoiPageProps) {
  return (
    <Suspense
      fallback={
        <div className="page-container">
          <div className="state-box">
            <p className="state-title">Đang tải màn hình rà soát hồ sơ…</p>
          </div>
        </div>
      }
    >
      <RaSoatMaBuoiContent params={params} />
    </Suspense>
  );
}
