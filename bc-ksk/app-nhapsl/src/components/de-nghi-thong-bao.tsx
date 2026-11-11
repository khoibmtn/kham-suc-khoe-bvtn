'use client';

// Incoming transfer-request notifications (owner request 11/11/2026):
//  - a banner right under the top bar while any request addressed to me is pending;
//  - a floating card (top-right) for each NEW request, fading out after ~10 s.
// "Addressed to me" = pending requests about records in sessions I am in charge of
// (admin: every pending request), excluding the ones I created myself.
import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { DeNghiChuyen } from '@/lib/api-types';
import styles from './de-nghi-thong-bao.module.css';

const POLL_MS = 30_000;
const POPUP_MS = 10_000;
const MAX_POPUPS = 3;

type Props = { userId: number; isAdmin: boolean };

export function denToi(d: DeNghiChuyen, userId: number, isAdmin: boolean): boolean {
  if (d.trang_thai !== 'cho_xu_ly' || d.nguoi_de_nghi.id === userId) return false;
  return isAdmin || d.tu_buoi?.phu_trach?.id === userId;
}

const seenKey = (userId: number) => `nhapsl:de-nghi-da-bao:${userId}`;

function readSeen(userId: number): Set<number> {
  try {
    const raw = localStorage.getItem(seenKey(userId));
    return new Set(raw ? (JSON.parse(raw) as number[]) : []);
  } catch {
    return new Set();
  }
}

function writeSeen(userId: number, ids: Set<number>): void {
  try {
    localStorage.setItem(seenKey(userId), JSON.stringify([...ids].slice(-500)));
  } catch {
    // storage full / disabled — popups may repeat, harmless
  }
}

export function DeNghiThongBao({ userId, isAdmin }: Props) {
  const [pending, setPending] = useState<DeNghiChuyen[]>([]);
  const [popups, setPopups] = useState<DeNghiChuyen[]>([]);
  const timers = useRef(new Map<number, ReturnType<typeof setTimeout>>());

  const dismiss = useCallback((id: number) => {
    setPopups((list) => list.filter((d) => d.id !== id));
    const t = timers.current.get(id);
    if (t) clearTimeout(t);
    timers.current.delete(id);
  }, []);

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/de-nghi-chuyen?trang_thai=cho_xu_ly', { cache: 'no-store' });
      if (!res.ok) return;
      const data = (await res.json()) as { de_nghi?: DeNghiChuyen[] };
      const mine = (data.de_nghi ?? []).filter((d) => denToi(d, userId, isAdmin));
      setPending(mine);

      const seen = readSeen(userId);
      const fresh = mine.filter((d) => !seen.has(d.id));
      if (fresh.length === 0) return;
      fresh.forEach((d) => seen.add(d.id));
      writeSeen(userId, seen);
      setPopups((list) => [...fresh, ...list].slice(0, MAX_POPUPS));
      for (const d of fresh) {
        timers.current.set(d.id, setTimeout(() => dismiss(d.id), POPUP_MS));
      }
    } catch {
      // offline — try again on next poll
    }
  }, [userId, isAdmin, dismiss]);

  useEffect(() => {
    // Initial fetch is deferred one tick so state updates happen outside the effect body.
    const first = setTimeout(load, 0);
    const timer = setInterval(load, POLL_MS);
    const onFocus = () => void load();
    window.addEventListener('focus', onFocus);
    window.addEventListener('nhapsl:pool-changed', onFocus);
    const pending = timers.current;
    return () => {
      clearTimeout(first);
      clearInterval(timer);
      window.removeEventListener('focus', onFocus);
      window.removeEventListener('nhapsl:pool-changed', onFocus);
      pending.forEach((t) => clearTimeout(t));
    };
  }, [load]);

  return (
    <>
      {pending.length > 0 && (
        <div className={styles.banner} role="status" aria-live="polite">
          <span className={styles.bannerIcon} aria-hidden="true">!</span>
          <span>
            Bạn có <strong>{pending.length.toLocaleString('vi-VN')} đề nghị chuyển hồ sơ</strong> đang chờ
            xử lý
            {pending[0] && (
              <span className={styles.bannerDetail}>
                {' '}— mới nhất: {pending[0].nguoi_de_nghi.ho_ten} xin chuyển về buổi {pending[0].den_buoi.ma_buoi}
              </span>
            )}
          </span>
          <Link href="/kho?tab=de_nghi" className={styles.bannerLink}>
            Xem và xử lý →
          </Link>
        </div>
      )}

      {popups.length > 0 && (
        <div className={styles.popupStack} aria-live="assertive">
          {popups.map((d) => (
            <div key={d.id} className={styles.popup} role="alert">
              <div className={styles.popupHead}>
                <strong>Đề nghị chuyển hồ sơ mới</strong>
                <button type="button" className={styles.close} onClick={() => dismiss(d.id)} aria-label="Đóng thông báo">
                  ×
                </button>
              </div>
              <p className={styles.popupBody}>
                <strong>{d.nguoi_de_nghi.ho_ten}</strong> đề nghị chuyển hồ sơ <strong>{d.ho_so.ho_ten}</strong> (
                {d.ho_so.nam_sinh}) từ buổi {d.tu_buoi?.ma_buoi ?? '—'} về buổi <strong>{d.den_buoi.ma_buoi}</strong>.
              </p>
              {d.ly_do && <p className={styles.popupReason}>Lý do: {d.ly_do}</p>}
              <Link href="/kho?tab=de_nghi" className={styles.popupLink} onClick={() => dismiss(d.id)}>
                Xem và xử lý
              </Link>
            </div>
          ))}
        </div>
      )}
    </>
  );
}
