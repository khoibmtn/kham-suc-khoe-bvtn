import { Suspense } from 'react';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth/guard';
import type { BuoiTomTat } from '@/lib/api-types';
import { AppShell } from '@/components/app-shell';
import { HomeBuoiList } from '@/components/home-buoi-list';

async function fetchInitialBuoi(): Promise<BuoiTomTat[] | null> {
  try {
    const h = await headers();
    const host = h.get('host');
    if (!host) return null;
    const proto = h.get('x-forwarded-proto') ?? 'http';
    const cookie = h.get('cookie') ?? '';
    const res = await fetch(`${proto}://${host}/api/buoi`, {
      headers: { cookie },
      cache: 'no-store',
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { buoi?: BuoiTomTat[] };
    return Array.isArray(data.buoi) ? data.buoi : null;
  } catch {
    return null;
  }
}

async function HomeContent() {
  const user = await getCurrentUser();
  if (!user) {
    redirect('/dang-nhap');
  }

  const initialBuoi = await fetchInitialBuoi();

  return (
    <AppShell user={user}>
      <HomeBuoiList user={user} initialBuoi={initialBuoi} />
    </AppShell>
  );
}

export default function HomePage() {
  return (
    <Suspense
      fallback={
        <div className="page-container">
          <div className="state-box">
            <p className="state-title">Đang tải danh sách buổi khám…</p>
          </div>
        </div>
      }
    >
      <HomeContent />
    </Suspense>
  );
}
