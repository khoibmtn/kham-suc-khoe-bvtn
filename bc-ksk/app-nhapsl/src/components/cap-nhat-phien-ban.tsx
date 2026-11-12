'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

export const POLL_VERSION_MS = 60_000;
export const DEM_NGUOC_CAP_NHAT_GIAY = 180;

export function coBanCapNhatMoi(
  clientVersion: string | undefined | null,
  serverVersion: string | undefined | null,
): boolean {
  const c = (clientVersion ?? '').trim();
  const s = (serverVersion ?? '').trim();
  if (!c || !s) return false;
  return c !== s;
}

export function formatDemNguocCapNhat(totalSeconds: number): string {
  const clamped = Math.max(0, Math.floor(totalSeconds));
  const mins = Math.floor(clamped / 60);
  const secs = clamped % 60;
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

export function CapNhatPhienBan() {
  const clientVersion = process.env.NEXT_PUBLIC_APP_VERSION ?? '';
  const [hasUpdate, setHasUpdate] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState(DEM_NGUOC_CAP_NHAT_GIAY);
  const detectedAtRef = useRef<number | null>(null);

  const checkVersion = useCallback(async () => {
    if (!clientVersion.trim()) return;
    try {
      const res = await fetch('/api/app-version', { cache: 'no-store' });
      if (!res.ok) return;
      const data = (await res.json()) as { version?: string };
      if (coBanCapNhatMoi(clientVersion, data?.version)) {
        if (detectedAtRef.current === null) {
          detectedAtRef.current = Date.now();
          setSecondsLeft(DEM_NGUOC_CAP_NHAT_GIAY);
          setHasUpdate(true);
        }
      }
    } catch {
      // Bỏ qua lỗi mạng khi kiểm tra phiên bản ngầm
    }
  }, [clientVersion]);

  useEffect(() => {
    const first = window.setTimeout(() => {
      void checkVersion();
    }, 0);
    const timer = window.setInterval(() => {
      void checkVersion();
    }, POLL_VERSION_MS);
    const onFocus = () => {
      void checkVersion();
    };
    window.addEventListener('focus', onFocus);
    return () => {
      window.clearTimeout(first);
      window.clearInterval(timer);
      window.removeEventListener('focus', onFocus);
    };
  }, [checkVersion]);

  useEffect(() => {
    if (!hasUpdate) return;
    const tick = () => {
      const started = detectedAtRef.current ?? Date.now();
      const elapsed = Math.floor((Date.now() - started) / 1000);
      const remaining = Math.max(0, DEM_NGUOC_CAP_NHAT_GIAY - elapsed);
      setSecondsLeft(remaining);
      if (remaining <= 0) {
        window.location.reload();
      }
    };
    const timer = window.setInterval(tick, 1000);
    return () => window.clearInterval(timer);
  }, [hasUpdate]);

  if (!hasUpdate) return null;

  return (
    <div className="app-update-banner" role="status" aria-live="polite">
      <div className="app-update-banner-inner">
        <div className="app-update-banner-text">
          <div className="app-update-main">
            Có bản cập nhật mới. Trang sẽ tự tải lại sau{' '}
            <strong className="num">{formatDemNguocCapNhat(secondsLeft)}</strong>
          </div>
          <div className="app-update-sub">
            Thao tác đã lưu không bị mất; nếu đang sửa trong khung chi tiết, bấm
            Lưu trước.
          </div>
        </div>
        <button
          type="button"
          className="btn btn-primary btn-xs app-update-btn"
          onClick={() => window.location.reload()}
        >
          Cập nhật ngay
        </button>
      </div>
    </div>
  );
}
