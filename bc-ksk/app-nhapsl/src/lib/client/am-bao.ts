'use client';

export const AM_BAO_STORAGE_KEY = 'nhapsl:am-bao';
export const NHAC_THONG_BAO_STORAGE_KEY = 'nhapsl:da-dong-nhac-thong-bao';
const AM_BAO_CHANGE_EVENT = 'nhapsl:am-bao-changed';

let sharedAudioCtx: AudioContext | null = null;
let unlockBound = false;

export function parseAmBaoStorage(raw: string | null | undefined): boolean {
  if (raw == null || raw === '') return true;
  const trimmed = raw.trim().toLowerCase();
  if (trimmed === '0' || trimmed === 'false' || trimmed === 'tat' || trimmed === 'off') {
    return false;
  }
  return true;
}

export function docTuyChonAmBao(): boolean {
  if (typeof window === 'undefined') return true;
  try {
    return parseAmBaoStorage(window.localStorage.getItem(AM_BAO_STORAGE_KEY));
  } catch {
    return true;
  }
}

export function luuTuyChonAmBao(bat: boolean): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(AM_BAO_STORAGE_KEY, bat ? '1' : '0');
  } catch {
    // ignore storage quota errors
  }
  try {
    window.dispatchEvent(new CustomEvent(AM_BAO_CHANGE_EVENT, { detail: { bat } }));
  } catch {
    // ignore
  }
}

export function langNgheThayDoiAmBao(cb: (bat: boolean) => void): () => void {
  if (typeof window === 'undefined') return () => {};
  const onCustom = (e: Event) => {
    const detail = (e as CustomEvent<{ bat?: boolean }>).detail;
    cb(typeof detail?.bat === 'boolean' ? detail.bat : docTuyChonAmBao());
  };
  const onStorage = (e: StorageEvent) => {
    if (e.key === AM_BAO_STORAGE_KEY) {
      cb(parseAmBaoStorage(e.newValue));
    }
  };
  window.addEventListener(AM_BAO_CHANGE_EVENT, onCustom);
  window.addEventListener('storage', onStorage);
  return () => {
    window.removeEventListener(AM_BAO_CHANGE_EVENT, onCustom);
    window.removeEventListener('storage', onStorage);
  };
}

function getAudioContext(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  if (sharedAudioCtx && sharedAudioCtx.state !== 'closed') {
    return sharedAudioCtx;
  }
  const AudioCtxCtor =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AudioCtxCtor) return null;
  try {
    sharedAudioCtx = new AudioCtxCtor();
    return sharedAudioCtx;
  } catch {
    return null;
  }
}

/**
 * Tự mở khóa AudioContext ở lần pointerdown/keydown đầu tiên của người dùng
 * theo quy tắc autoplay của trình duyệt.
 */
export function khoiTaoMoKhoaAmBao(): () => void {
  if (typeof window === 'undefined' || unlockBound) return () => {};
  unlockBound = true;

  const unlock = () => {
    const ctx = getAudioContext();
    if (!ctx) return;
    if (ctx.state === 'suspended') {
      ctx.resume().catch(() => {});
    }
    try {
      // Phát 1 xung câm cực ngắn để iOS Safari/Chrome mở khóa hoàn toàn
      const buffer = ctx.createBuffer(1, 1, 22050);
      const source = ctx.createBufferSource();
      source.buffer = buffer;
      source.connect(ctx.destination);
      source.start(0);
    } catch {
      // ignore
    }
    window.removeEventListener('pointerdown', unlock, true);
    window.removeEventListener('keydown', unlock, true);
  };

  window.addEventListener('pointerdown', unlock, true);
  window.addEventListener('keydown', unlock, true);

  return () => {
    window.removeEventListener('pointerdown', unlock, true);
    window.removeEventListener('keydown', unlock, true);
    unlockBound = false;
  };
}

/**
 * Phát chuông 2 nốt (~0,6 giây, âm lượng vừa) bằng Web Audio + rung điện thoại nếu hỗ trợ.
 * @param boQuaKiemTraBat - truyền true khi bấm nút "Nghe thử"
 */
export function phatChuongThongBao(boQuaKiemTraBat = false): boolean {
  if (typeof window === 'undefined') return false;
  if (!boQuaKiemTraBat && !docTuyChonAmBao()) {
    return false;
  }

  // Rung thiết bị nếu hỗ trợ
  try {
    if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
      navigator.vibrate([200, 100, 200]);
    }
  } catch {
    // ignore
  }

  const ctx = getAudioContext();
  if (!ctx) return false;

  const playNotes = () => {
    try {
      const now = ctx.currentTime;
      // Nốt 1: E5 (~659.25 Hz) trong 0.24s, Nốt 2: A5 (~880 Hz) từ 0.24s đến 0.60s
      const notes: Array<{ freq: number; start: number; duration: number; peak: number }> = [
        { freq: 659.25, start: 0, duration: 0.24, peak: 0.22 },
        { freq: 880.0, start: 0.24, duration: 0.36, peak: 0.26 },
      ];

      for (const n of notes) {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(n.freq, now + n.start);

        gain.gain.setValueAtTime(0.0001, now + n.start);
        gain.gain.linearRampToValueAtTime(n.peak, now + n.start + 0.025);
        gain.gain.exponentialRampToValueAtTime(0.0008, now + n.start + n.duration);

        osc.connect(gain);
        gain.connect(ctx.destination);

        osc.start(now + n.start);
        osc.stop(now + n.start + n.duration + 0.02);
      }
    } catch {
      // ignore audio errors
    }
  };

  if (ctx.state === 'suspended') {
    ctx
      .resume()
      .then(() => playNotes())
      .catch(() => {});
  } else {
    playNotes();
  }

  return true;
}

/**
 * Chuyển VAPID public key (base64url) sang Uint8Array cho pushManager.subscribe.
 */
export function urlBase64ToUint8Array(base64String: string): Uint8Array<ArrayBuffer> {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = typeof window !== 'undefined' ? window.atob(base64) : Buffer.from(base64, 'base64').toString('binary');
  const buffer = new ArrayBuffer(rawData.length);
  const outputArray = new Uint8Array(buffer);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

/**
 * Định dạng chuỗi mô tả trạng thái tự duyệt đề nghị chuyển.
 */
export function moTaCaiDatTuDuyet(
  tuDuyet: { che_do: 'tat' | 'ngay' | 'sau_phut'; sau_phut: number } | null | undefined,
): string {
  if (!tuDuyet || tuDuyet.che_do === 'tat') {
    return 'Tự duyệt đang tắt';
  }
  if (tuDuyet.che_do === 'ngay') {
    return 'Đang bật tự duyệt ngay khi có đề nghị';
  }
  const phut = Number.isFinite(tuDuyet.sau_phut) && tuDuyet.sau_phut > 0 ? tuDuyet.sau_phut : 5;
  return `Đang bật tự duyệt sau ${phut} phút nếu người giữ chưa xử lý`;
}

/**
 * Định dạng đếm ngược "Tự duyệt sau mm:ss" từ han_tu_duyet ISO string.
 */
export function formatDemNguocTuDuyet(
  hanTuDuyetIso: string | null | undefined,
  nowMs: number = Date.now(),
): string | null {
  if (!hanTuDuyetIso) return null;
  const targetMs = Date.parse(hanTuDuyetIso);
  if (!Number.isFinite(targetMs)) return null;
  const diffSec = Math.max(0, Math.ceil((targetMs - nowMs) / 1000));
  const mm = String(Math.floor(diffSec / 60)).padStart(2, '0');
  const ss = String(diffSec % 60).padStart(2, '0');
  return `Tự duyệt sau ${mm}:${ss}`;
}

/**
 * Định dạng dòng "Tự duyệt sau N phút" cho popup đề nghị.
 */
export function formatPhutTuDuyetPopup(
  hanTuDuyetIso: string | null | undefined,
  fallbackPhut?: number | null,
  nowMs: number = Date.now(),
): string | null {
  if (hanTuDuyetIso) {
    const targetMs = Date.parse(hanTuDuyetIso);
    if (Number.isFinite(targetMs)) {
      const phut = Math.max(1, Math.ceil((targetMs - nowMs) / 60000));
      return `Tự duyệt sau ${phut} phút`;
    }
  }
  if (typeof fallbackPhut === 'number' && fallbackPhut > 0) {
    return `Tự duyệt sau ${fallbackPhut} phút`;
  }
  return null;
}
