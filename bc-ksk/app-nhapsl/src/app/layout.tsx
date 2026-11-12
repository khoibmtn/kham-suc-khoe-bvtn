import type { Metadata, Viewport } from 'next';
import { ToastProvider } from '@/components/toast';
import './globals.css';

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: '#0f6cbd',
};

export const metadata: Metadata = {
  title: 'Rà soát hồ sơ KSK 2026',
  description: 'Hệ thống nội bộ rà soát hồ sơ khám sức khỏe toàn dân 2026',
  appleWebApp: {
    capable: true,
    title: 'Rà soát KSK',
    statusBarStyle: 'default',
  },
  icons: {
    icon: [
      { url: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
      { url: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
    ],
    apple: [
      { url: '/icons/apple-touch-icon.png', sizes: '180x180', type: 'image/png' },
    ],
  },
  robots: {
    index: false,
    follow: false,
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="vi">
      <body>
        <ToastProvider>{children}</ToastProvider>
      </body>
    </html>
  );
}
