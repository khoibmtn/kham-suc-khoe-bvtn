'use client';

// Incoming transfer-request notifications (owner request 11/11/2026 + T20 12/11/2026):
//  - a banner right under the top bar while any request addressed to me is pending;
//  - a floating card for each NEW request, fading out after ~10 s;
//  - 2-note Web Audio chime when new request arrives (even in background tab) + 2-min repeat
//    while pending requests remain and user is not on the Đề nghị tab;
//  - listens to Service Worker postMessage({ type: 'de-nghi-moi' }) to reload immediately;
//  - shows "Tự duyệt sau N phút" in popup when auto-approve countdown applies.
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';
import type {
  CaiDatTuDuyet,
  DeNghiChuyen,
  DeNghiChuyenTuDuyet,
  LoaiDeNghi,
  UserNgan,
} from '@/lib/api-types';
import { formatPhutTuDuyetPopup, phatChuongThongBao } from '@/lib/client/am-bao';
import styles from './de-nghi-thong-bao.module.css';

const POLL_MS = 30_000;
const POPUP_MS = 10_000;
const REMIND_MS = 120_000; // 2 phút nhắc lại âm báo
const MAX_POPUPS = 3;

export type DeNghiChuyenCoTuDuyet = DeNghiChuyen & Partial<DeNghiChuyenTuDuyet>;

type Props = { userId: number; isAdmin: boolean };

export const LOAI_DE_NGHI_NHAN: Record<LoaiDeNghi, string> = {
  xin_ve: 'Xin nhận về',
  gui_di: 'Gửi sang',
};

export type DeNghiToiThieu = Pick<
  DeNghiChuyen,
  'trang_thai' | 'nguoi_de_nghi' | 'tu_buoi' | 'den_buoi'
> &
  Partial<Pick<DeNghiChuyen, 'loai' | 'nguoi_duyet'>>;

/** Trường `loai` thiếu trên dữ liệu cũ ⇒ mặc định coi là 'xin_ve'. */
export function layLoaiDeNghi(d: Partial<Pick<DeNghiChuyen, 'loai'>>): LoaiDeNghi {
  return d.loai === 'gui_di' ? 'gui_di' : 'xin_ve';
}

/** Trường `nguoi_duyet` thiếu trên dữ liệu cũ ⇒ dùng `tu_buoi.phu_trach` (hoặc `den_buoi.phu_trach` khi `gui_di`). */
export function layNguoiDuyetDeNghi(
  d: Pick<DeNghiChuyen, 'tu_buoi' | 'den_buoi'> & Partial<Pick<DeNghiChuyen, 'loai' | 'nguoi_duyet'>>,
): UserNgan | null {
  if (d.nguoi_duyet !== undefined) return d.nguoi_duyet;
  if (layLoaiDeNghi(d) === 'gui_di') {
    return d.den_buoi?.phu_trach ?? null;
  }
  return d.tu_buoi?.phu_trach ?? null;
}

export function tenNguoiDuyetDeNghi(
  d: Pick<DeNghiChuyen, 'tu_buoi' | 'den_buoi'> & Partial<Pick<DeNghiChuyen, 'loai' | 'nguoi_duyet'>>,
): string {
  return layNguoiDuyetDeNghi(d)?.ho_ten ?? 'Quản trị viên';
}

export function denToi(d: DeNghiToiThieu, userId: number, isAdmin: boolean): boolean {
  if (d.trang_thai !== 'cho_xu_ly' || d.nguoi_de_nghi.id === userId) return false;
  const nguoiDuyet = layNguoiDuyetDeNghi(d);
  return isAdmin || nguoiDuyet?.id === userId;
}

export function moTaDeNghiChuyenText(
  d: Pick<DeNghiChuyen, 'nguoi_de_nghi' | 'ho_so' | 'tu_buoi' | 'den_buoi'> &
    Partial<Pick<DeNghiChuyen, 'loai' | 'nguoi_duyet' | 'trang_thai'>>,
  userId: number,
  isAdmin: boolean,
): string {
  const loai = layLoaiDeNghi(d);
  const tenNguoiGui = d.nguoi_de_nghi.ho_ten;
  const tenHoSo = d.ho_so.ho_ten;
  const namSinh = d.ho_so.nam_sinh;
  const maDenBuoi = d.den_buoi.ma_buoi;
  const daChuyenDenBuoiDich =
    d.trang_thai === 'dong_y' && d.tu_buoi?.ma_buoi === maDenBuoi;
  const maTuBuoi = daChuyenDenBuoiDich
    ? 'buổi gốc'
    : (d.tu_buoi?.ma_buoi ?? 'Kho chưa gán');

  if (loai === 'gui_di') {
    const tenChuBuoiNguon = daChuyenDenBuoiDich
      ? tenNguoiGui
      : (d.tu_buoi?.phu_trach?.ho_ten ?? tenNguoiGui);
    const laBuoiCuaToi =
      !isAdmin &&
      (d.den_buoi.phu_trach?.id === userId || layNguoiDuyetDeNghi(d)?.id === userId);
    const tenChuBuoiDich =
      d.den_buoi.phu_trach?.ho_ten ?? layNguoiDuyetDeNghi(d)?.ho_ten ?? 'Quản trị viên';
    return `${tenNguoiGui} muốn gửi hồ sơ ${tenHoSo} (${namSinh}) từ ${daChuyenDenBuoiDich ? maTuBuoi : `buổi ${maTuBuoi}`} (của ${tenChuBuoiNguon}) sang buổi ${maDenBuoi} ${laBuoiCuaToi ? 'của bạn' : `của ${tenChuBuoiDich}`}`;
  }

  const tenChuBuoiDich = d.den_buoi.phu_trach?.ho_ten ?? tenNguoiGui;
  return `${tenNguoiGui} xin nhận hồ sơ ${tenHoSo} (${namSinh}) từ ${daChuyenDenBuoiDich ? maTuBuoi : `buổi ${maTuBuoi}`} về buổi ${maDenBuoi} (của ${tenChuBuoiDich})`;
}

export function MoTaDeNghiChuyen({
  deNghi: d,
  userId,
  isAdmin,
}: {
  deNghi: Pick<DeNghiChuyen, 'nguoi_de_nghi' | 'ho_so' | 'tu_buoi' | 'den_buoi'> &
    Partial<Pick<DeNghiChuyen, 'loai' | 'nguoi_duyet' | 'trang_thai'>>;
  userId: number;
  isAdmin: boolean;
}) {
  const loai = layLoaiDeNghi(d);
  const tenNguoiGui = d.nguoi_de_nghi.ho_ten;
  const tenHoSo = d.ho_so.ho_ten;
  const namSinh = d.ho_so.nam_sinh;
  const maDenBuoi = d.den_buoi.ma_buoi;
  const daChuyenDenBuoiDich =
    d.trang_thai === 'dong_y' && d.tu_buoi?.ma_buoi === maDenBuoi;
  const maTuBuoi = daChuyenDenBuoiDich
    ? 'buổi gốc'
    : (d.tu_buoi?.ma_buoi ?? 'Kho chưa gán');

  if (loai === 'gui_di') {
    const tenChuBuoiNguon = daChuyenDenBuoiDich
      ? tenNguoiGui
      : (d.tu_buoi?.phu_trach?.ho_ten ?? tenNguoiGui);
    const laBuoiCuaToi =
      !isAdmin &&
      (d.den_buoi.phu_trach?.id === userId || layNguoiDuyetDeNghi(d)?.id === userId);
    const tenChuBuoiDich =
      d.den_buoi.phu_trach?.ho_ten ?? layNguoiDuyetDeNghi(d)?.ho_ten ?? 'Quản trị viên';
    return (
      <>
        <strong>{tenNguoiGui}</strong> muốn gửi hồ sơ <strong>{tenHoSo}</strong> ({namSinh}) từ{' '}
        {daChuyenDenBuoiDich ? (
          <strong>{maTuBuoi}</strong>
        ) : (
          <>
            buổi <strong>{maTuBuoi}</strong>
          </>
        )}{' '}
        (của {tenChuBuoiNguon}) sang buổi <strong>{maDenBuoi}</strong>{' '}
        {laBuoiCuaToi ? <strong>của bạn</strong> : <>của {tenChuBuoiDich}</>}
      </>
    );
  }

  const tenChuBuoiDich = d.den_buoi.phu_trach?.ho_ten ?? tenNguoiGui;
  return (
    <>
      <strong>{tenNguoiGui}</strong> xin nhận hồ sơ <strong>{tenHoSo}</strong> ({namSinh}) từ{' '}
      {daChuyenDenBuoiDich ? (
        <strong>{maTuBuoi}</strong>
      ) : (
        <>
          buổi <strong>{maTuBuoi}</strong>
        </>
      )}{' '}
      về buổi <strong>{maDenBuoi}</strong> (của {tenChuBuoiDich})
    </>
  );
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

function dangOManDeNghi(): boolean {
  if (typeof window === 'undefined') return false;
  if (window.location.pathname !== '/kho') return false;
  const sp = new URLSearchParams(window.location.search);
  return sp.get('tab') === 'de_nghi';
}

export function DeNghiThongBao({ userId, isAdmin }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const [pending, setPending] = useState<DeNghiChuyenCoTuDuyet[]>([]);
  const [popups, setPopups] = useState<DeNghiChuyenCoTuDuyet[]>([]);
  const [tuDuyet, setTuDuyet] = useState<CaiDatTuDuyet | null>(null);
  const timers = useRef(new Map<number, ReturnType<typeof setTimeout>>());
  const pendingRef = useRef<DeNghiChuyenCoTuDuyet[]>([]);

  useEffect(() => {
    pendingRef.current = pending;
  }, [pending]);

  const dismiss = useCallback((id: number) => {
    setPopups((list) => list.filter((d) => d.id !== id));
    const t = timers.current.get(id);
    if (t) clearTimeout(t);
    timers.current.delete(id);
  }, []);

  const loadTuDuyet = useCallback(async () => {
    try {
      const res = await fetch('/api/cai-dat/tu-duyet', { cache: 'no-store' });
      if (!res.ok) return;
      const data = (await res.json()) as { tu_duyet?: CaiDatTuDuyet };
      if (data.tu_duyet) setTuDuyet(data.tu_duyet);
    } catch {
      // ignore if offline or route not available
    }
  }, []);

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/de-nghi-chuyen?trang_thai=cho_xu_ly', { cache: 'no-store' });
      if (!res.ok) return;
      const data = (await res.json()) as { de_nghi?: DeNghiChuyenCoTuDuyet[] };
      const mine = (data.de_nghi ?? []).filter((d) => denToi(d, userId, isAdmin));
      setPending(mine);

      const seen = readSeen(userId);
      const fresh = mine.filter((d) => !seen.has(d.id));
      if (fresh.length === 0) return;
      fresh.forEach((d) => seen.add(d.id));
      writeSeen(userId, seen);

      // Phát chuông âm báo ngay khi có đề nghị mới gửi đến mình (kể cả khi tab đang ẩn)
      phatChuongThongBao();

      setPopups((list) => [...fresh, ...list].slice(0, MAX_POPUPS));
      for (const d of fresh) {
        timers.current.set(d.id, setTimeout(() => dismiss(d.id), POPUP_MS));
      }
    } catch {
      // offline — try again on next poll
    }
  }, [userId, isAdmin, dismiss]);

  useEffect(() => {
    const first = setTimeout(() => {
      void load();
      void loadTuDuyet();
    }, 0);
    const timer = setInterval(load, POLL_MS);
    const onFocus = () => {
      void load();
      void loadTuDuyet();
    };
    window.addEventListener('focus', onFocus);
    window.addEventListener('nhapsl:pool-changed', onFocus);

    // Lắng nghe message từ Service Worker (push 'de-nghi-moi' hoặc click điều hướng)
    const onSwMessage = (event: MessageEvent) => {
      const msg = event.data as { type?: string; url?: string } | null;
      if (!msg || typeof msg !== 'object') return;
      if (msg.type === 'de-nghi-moi') {
        void load();
        window.dispatchEvent(new Event('nhapsl:pool-changed'));
      } else if (msg.type === 'dieu-huong' && typeof msg.url === 'string') {
        router.push(msg.url);
      }
    };
    if (typeof navigator !== 'undefined' && 'serviceWorker' in navigator) {
      navigator.serviceWorker.addEventListener('message', onSwMessage);
    }

    const activeTimers = timers.current;
    return () => {
      clearTimeout(first);
      clearInterval(timer);
      window.removeEventListener('focus', onFocus);
      window.removeEventListener('nhapsl:pool-changed', onFocus);
      if (typeof navigator !== 'undefined' && 'serviceWorker' in navigator) {
        navigator.serviceWorker.removeEventListener('message', onSwMessage);
      }
      activeTimers.forEach((t) => clearTimeout(t));
    };
  }, [load, loadTuDuyet, router]);

  // Nhắc lại âm báo mỗi 2 phút khi còn đề nghị chờ mình và chưa mở tab Đề nghị
  useEffect(() => {
    if (pending.length === 0) return;
    const remindTimer = setInterval(() => {
      if (pendingRef.current.length > 0 && !dangOManDeNghi()) {
        phatChuongThongBao();
      }
    }, REMIND_MS);
    return () => clearInterval(remindTimer);
  }, [pending.length, pathname]);

  return (
    <>
      {pending.length > 0 && (
        <div className={styles.banner} role="status" aria-live="polite">
          <span className={styles.bannerIcon} aria-hidden="true">!</span>
          <span className={styles.bannerText}>
            Bạn có <strong>{pending.length.toLocaleString('vi-VN')} đề nghị chuyển hồ sơ</strong> đang chờ
            xử lý
            {pending[0] && (
              <span className={styles.bannerDetail}>
                {' '}— mới nhất:{' '}
                <span
                  className={
                    layLoaiDeNghi(pending[0]) === 'gui_di'
                      ? styles.loaiBadgeGuiDi
                      : styles.loaiBadgeXinVe
                  }
                >
                  {LOAI_DE_NGHI_NHAN[layLoaiDeNghi(pending[0])]}
                </span>{' '}
                <MoTaDeNghiChuyen deNghi={pending[0]} userId={userId} isAdmin={isAdmin} /> (Người
                duyệt: {tenNguoiDuyetDeNghi(pending[0])})
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
          {popups.map((d) => {
            const dongTuDuyet =
              !d.tu_dong_loi
                ? formatPhutTuDuyetPopup(
                    d.han_tu_duyet,
                    tuDuyet?.che_do === 'sau_phut' ? tuDuyet.sau_phut : null,
                  )
                : null;
            return (
              <div key={d.id} className={styles.popup} role="alert">
                <div className={styles.popupHead}>
                  <div className={styles.popupHeadLeft}>
                    <strong>Đề nghị chuyển hồ sơ mới</strong>
                    <span
                      className={
                        layLoaiDeNghi(d) === 'gui_di'
                          ? styles.loaiBadgeGuiDi
                          : styles.loaiBadgeXinVe
                      }
                    >
                      {LOAI_DE_NGHI_NHAN[layLoaiDeNghi(d)]}
                    </span>
                  </div>
                  <button
                    type="button"
                    className={styles.close}
                    onClick={() => dismiss(d.id)}
                    aria-label="Đóng thông báo"
                  >
                    ×
                  </button>
                </div>
                <p className={styles.popupBody}>
                  <MoTaDeNghiChuyen deNghi={d} userId={userId} isAdmin={isAdmin} />.
                </p>
                <p className={styles.popupApprover}>
                  Người duyệt: <strong>{tenNguoiDuyetDeNghi(d)}</strong>
                </p>
                {d.ly_do && <p className={styles.popupReason}>Lý do: {d.ly_do}</p>}
                {dongTuDuyet && <p className={styles.popupAutoApprove}>{dongTuDuyet}</p>}
                <Link
                  href="/kho?tab=de_nghi"
                  className={styles.popupLink}
                  onClick={() => dismiss(d.id)}
                >
                  Xem và xử lý
                </Link>
              </div>
            );
          })}
        </div>
      )}
    </>
  );
}
