import { Suspense } from 'react';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth/guard';
import { AppShell } from '@/components/app-shell';
import {
  HomeBuoiList,
  type DashboardToiData,
} from '@/components/home-buoi-list';

async function fetchInitialDashboard(): Promise<DashboardToiData | null> {
  try {
    const h = await headers();
    const host = h.get('host');
    if (!host) return null;
    const proto = h.get('x-forwarded-proto') ?? 'http';
    const cookie = h.get('cookie') ?? '';
    const res = await fetch(`${proto}://${host}/api/dashboard/toi`, {
      headers: { cookie },
      cache: 'no-store',
    });
    if (!res.ok) return null;
    const data = (await res.json()) as Partial<DashboardToiData>;
    if (!data || !data.the || !Array.isArray(data.buoi)) return null;
    return {
      the: data.the,
      buoi: data.buoi,
      kho_ca_nhan: Array.isArray(data.kho_ca_nhan) ? data.kho_ca_nhan : [],
      de_nghi_cho_toi:
        typeof data.de_nghi_cho_toi === 'number' ? data.de_nghi_cho_toi : 0,
    };
  } catch {
    return null;
  }
}

async function HomeContent() {
  const user = await getCurrentUser();
  if (!user) {
    redirect('/dang-nhap');
  }

  const initialDashboard = await fetchInitialDashboard();

  return (
    <AppShell user={user}>
      <HomeBuoiList
        user={user}
        initialBuoi={initialDashboard?.buoi ?? null}
        initialDashboard={initialDashboard}
      />
    </AppShell>
  );
}

export default function HomePage() {
  return (
    <Suspense
      fallback={
        <div className="page-container">
          <div className="state-box">
            <p className="state-title">Đang tải bảng theo dõi tiến độ…</p>
          </div>
        </div>
      }
    >
      <HomeContent />
    </Suspense>
  );
}
