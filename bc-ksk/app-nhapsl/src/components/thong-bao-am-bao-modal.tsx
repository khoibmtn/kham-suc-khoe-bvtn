'use client';

import React, { useCallback, useEffect, useState } from 'react';
import {
  docTuyChonAmBao,
  langNgheThayDoiAmBao,
  luuTuyChonAmBao,
  phatChuongThongBao,
  urlBase64ToUint8Array,
} from '@/lib/client/am-bao';
import { useToast } from './toast';

type TrangThaiPush =
  | 'dang_kiem_tra'
  | 'da_bat'
  | 'chua_bat'
  | 'bi_chan'
  | 'khong_ho_tro'
  | 'may_chu_chua_bat';

type Props = {
  open: boolean;
  onClose: () => void;
};

function phatHienIosChuaStandalone(): boolean {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent || '';
  const isIOS =
    /iPad|iPhone|iPod/.test(ua) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  if (!isIOS) return false;
  const isStandalone =
    window.matchMedia?.('(display-mode: standalone)').matches ||
    Boolean((navigator as unknown as { standalone?: boolean }).standalone);
  return !isStandalone;
}

function moTaThietBiNgan(): string {
  if (typeof navigator === 'undefined') return 'Trình duyệt';
  const ua = navigator.userAgent || '';
  if (/iPhone|iPad|iPod/i.test(ua)) return 'iPhone/iPad';
  if (/Android/i.test(ua)) return 'Điện thoại Android';
  if (/Macintosh/i.test(ua)) return 'Máy tính Mac';
  if (/Windows/i.test(ua)) return 'Máy tính Windows';
  return 'Trình duyệt web';
}

export function ThongBaoAmBaoModal({ open, onClose }: Props) {
  const { showToast } = useToast();
  const [amBaoBat, setAmBaoBat] = useState<boolean>(() => docTuyChonAmBao());
  const [pushState, setPushState] = useState<TrangThaiPush>('dang_kiem_tra');
  const [publicKey, setPublicKey] = useState<string | null>(null);
  const [busyAction, setBusyAction] = useState<'bat' | 'tat' | 'thu' | null>(null);
  const [errMsg, setErrMsg] = useState<string | null>(null);
  const [iosChuaCai, setIosChuaCai] = useState<boolean>(false);

  useEffect(() => {
    return langNgheThayDoiAmBao((bat) => setAmBaoBat(bat));
  }, []);

  const kiemTraTrangThaiPush = useCallback(async () => {
    if (typeof window === 'undefined') return;
    setErrMsg(null);
    setIosChuaCai(phatHienIosChuaStandalone());

    // 1. Kiểm tra máy chủ có bật VAPID public_key hay không
    let serverKey: string | null = null;
    try {
      const res = await fetch('/api/push/khoa', { cache: 'no-store' });
      if (res.ok) {
        const data = (await res.json()) as { public_key?: string | null };
        serverKey = data.public_key ?? null;
      }
    } catch {
      // Nếu lỗi mạng hoặc route chưa có, coi như máy chủ chưa bật
      serverKey = null;
    }
    setPublicKey(serverKey);

    if (!serverKey) {
      setPushState('may_chu_chua_bat');
      return;
    }

    // 2. Kiểm tra trình duyệt/thiết bị hỗ trợ Web Push
    const hoTro =
      'Notification' in window &&
      'serviceWorker' in navigator &&
      'PushManager' in window;
    if (!hoTro) {
      setPushState('khong_ho_tro');
      return;
    }

    if (Notification.permission === 'denied') {
      setPushState('bi_chan');
      return;
    }

    try {
      const reg = await navigator.serviceWorker.getRegistration('/sw.js') ||
        (await navigator.serviceWorker.ready);
      const sub = await reg.pushManager.getSubscription();
      if (sub && Notification.permission === 'granted') {
        setPushState('da_bat');
      } else {
        setPushState('chua_bat');
      }
    } catch {
      setPushState('chua_bat');
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    const t = window.setTimeout(() => {
      void kiemTraTrangThaiPush();
    }, 0);
    return () => window.clearTimeout(t);
  }, [open, kiemTraTrangThaiPush]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !busyAction) {
        onClose();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, busyAction, onClose]);

  if (!open) return null;

  const handleToggleAmBao = (next: boolean) => {
    setAmBaoBat(next);
    luuTuyChonAmBao(next);
    if (next) {
      phatChuongThongBao(true);
    }
    showToast(next ? 'Đã bật âm báo đề nghị chuyển' : 'Đã tắt âm báo đề nghị chuyển', 'info');
  };

  const handleNgheThu = () => {
    phatChuongThongBao(true);
  };

  const handleBatThongBao = async () => {
    setErrMsg(null);
    if (!('Notification' in window) || !('serviceWorker' in navigator) || !('PushManager' in window)) {
      setPushState('khong_ho_tro');
      return;
    }
    setBusyAction('bat');
    try {
      // Gọi requestPermission ngay trong cú bấm của người dùng
      const permission = await Notification.requestPermission();
      if (permission === 'denied') {
        setPushState('bi_chan');
        setErrMsg('Trình duyệt đang chặn thông báo. Vui lòng mở cài đặt quyền của trang để cho phép.');
        return;
      }
      if (permission !== 'granted') {
        setPushState('chua_bat');
        return;
      }

      // Lấy public_key mới nhất từ máy chủ
      const khoaRes = await fetch('/api/push/khoa', { cache: 'no-store' });
      const khoaData = (await khoaRes.json().catch(() => ({}))) as {
        public_key?: string | null;
        error?: string;
      };
      if (!khoaRes.ok || !khoaData.public_key) {
        setPublicKey(null);
        setPushState('may_chu_chua_bat');
        return;
      }
      const key = khoaData.public_key;
      setPublicKey(key);

      let reg = await navigator.serviceWorker.getRegistration('/sw.js');
      if (!reg) {
        reg = await navigator.serviceWorker.register('/sw.js');
      }
      await navigator.serviceWorker.ready;

      let sub = await reg.pushManager.getSubscription();
      if (!sub) {
        sub = await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(key),
        });
      }

      const subJson = sub.toJSON();
      const p256dh = subJson.keys?.p256dh || '';
      const auth = subJson.keys?.auth || '';
      if (!sub.endpoint || !p256dh || !auth) {
        throw new Error('Không lấy được khóa đăng ký từ trình duyệt.');
      }

      const dkRes = await fetch('/api/push/dang-ky', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          endpoint: sub.endpoint,
          keys: { p256dh, auth },
          thiet_bi: moTaThietBiNgan(),
        }),
      });
      const dkData = (await dkRes.json().catch(() => ({}))) as { error?: string };
      if (!dkRes.ok) {
        throw new Error(dkData.error || 'Không đăng ký được thông báo đẩy.');
      }

      setPushState('da_bat');
      showToast('Đã bật thông báo đẩy trên thiết bị này', 'success');
    } catch (e) {
      setErrMsg((e as Error).message || 'Không bật được thông báo đẩy.');
    } finally {
      setBusyAction(null);
    }
  };

  const handleTatThongBao = async () => {
    setErrMsg(null);
    setBusyAction('tat');
    try {
      const reg = await navigator.serviceWorker.getRegistration('/sw.js');
      const sub = await reg?.pushManager.getSubscription();
      if (sub) {
        const endpoint = sub.endpoint;
        await sub.unsubscribe().catch(() => {});
        await fetch('/api/push/huy', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ endpoint }),
        }).catch(() => {});
      }
      setPushState('chua_bat');
      showToast('Đã tắt thông báo đẩy trên thiết bị này', 'info');
    } catch (e) {
      setErrMsg((e as Error).message || 'Không tắt được thông báo đẩy.');
    } finally {
      setBusyAction(null);
    }
  };

  const handleGuiThu = async () => {
    setErrMsg(null);
    setBusyAction('thu');
    try {
      const res = await fetch('/api/push/thu', { method: 'POST' });
      const data = (await res.json().catch(() => ({}))) as { gui?: number; error?: string };
      if (!res.ok) {
        throw new Error(data.error || 'Không gửi thử được thông báo.');
      }
      const soThietBi = data.gui ?? 0;
      if (soThietBi > 0) {
        showToast(`Đã gửi thử thông báo tới ${soThietBi} thiết bị của bạn`, 'success');
      } else {
        showToast('Chưa có thiết bị nào nhận được thông báo thử', 'info');
      }
    } catch (e) {
      setErrMsg((e as Error).message || 'Lỗi khi gửi thử thông báo.');
    } finally {
      setBusyAction(null);
    }
  };

  const nhanTrangThaiPush: Record<TrangThaiPush, { text: string; badgeClass: string }> = {
    dang_kiem_tra: { text: 'Đang kiểm tra…', badgeClass: 'badge badge-chua' },
    da_bat: { text: 'Đã bật', badgeClass: 'badge badge-xong' },
    chua_bat: { text: 'Chưa bật', badgeClass: 'badge badge-chua' },
    bi_chan: { text: 'Bị trình duyệt chặn', badgeClass: 'badge badge-danger' },
    khong_ho_tro: { text: 'Thiết bị không hỗ trợ', badgeClass: 'badge badge-chua' },
    may_chu_chua_bat: { text: 'Máy chủ chưa bật thông báo đẩy', badgeClass: 'badge badge-chua' },
  };

  const statusInfo = nhanTrangThaiPush[pushState];

  return (
    <div
      className="modal-backdrop"
      role="dialog"
      aria-modal="true"
      aria-labelledby="tb-am-bao-title"
      onClick={(e) => {
        if (e.target === e.currentTarget && !busyAction) onClose();
      }}
    >
      <div className="modal-card thong-bao-modal">
        <div className="modal-header">
          <h3 id="tb-am-bao-title" className="modal-title">
            Thông báo &amp; âm báo
          </h3>
        </div>
        <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <p className="thong-bao-explain">
            Thông báo đẩy hiện cả khi khóa màn hình/đóng tab; âm báo chỉ phát khi app đang mở.
          </p>

          {/* Phần 1: Âm báo */}
          <div className="thong-bao-section">
            <div className="thong-bao-section-head">
              <div>
                <div className="thong-bao-section-title">Âm báo trong ứng dụng</div>
                <div className="thong-bao-section-sub">
                  Phát tiếng chuông 3 nốt kiểu tin nhắn iPhone và rung nhẹ khi có đề nghị chuyển hồ sơ gửi đến bạn (nhắc lại mỗi 2 phút nếu còn chờ).
                </div>
              </div>
              <span className={amBaoBat ? 'badge badge-xong' : 'badge badge-chua'}>
                {amBaoBat ? 'Đang bật' : 'Đang tắt'}
              </span>
            </div>
            <div className="thong-bao-actions">
              <button
                type="button"
                className={amBaoBat ? 'btn' : 'btn btn-primary'}
                onClick={() => handleToggleAmBao(!amBaoBat)}
              >
                {amBaoBat ? 'Tắt âm báo' : 'Bật âm báo'}
              </button>
              <button type="button" className="btn" onClick={handleNgheThu}>
                Nghe thử
              </button>
            </div>
          </div>

          {/* Hướng dẫn cho iPhone/iPad chưa cài ra màn hình chính */}
          {iosChuaCai && (
            <div className="thong-bao-ios-guide" role="note">
              <strong>Trên iPhone/iPad:</strong> Bấm nút <strong>Chia sẻ</strong> →{' '}
              <strong>Thêm vào MH chính</strong>, mở app từ biểu tượng rồi bật thông báo.
            </div>
          )}

          {/* Phần 2: Thông báo trên thiết bị này (Web Push) */}
          <div className="thong-bao-section">
            <div className="thong-bao-section-head">
              <div>
                <div className="thong-bao-section-title">Thông báo trên thiết bị này (Web Push)</div>
                <div className="thong-bao-section-sub">
                  Nhận thông báo ngay trên điện thoại hoặc máy tính kể cả khi đang khóa màn hình.
                </div>
              </div>
              <span className={statusInfo.badgeClass}>{statusInfo.text}</span>
            </div>

            {pushState === 'may_chu_chua_bat' || publicKey === null ? (
              <div className="thong-bao-server-off">Máy chủ chưa bật thông báo đẩy</div>
            ) : (
              <div className="thong-bao-actions">
                {pushState !== 'da_bat' && pushState !== 'khong_ho_tro' && (
                  <button
                    type="button"
                    className="btn btn-primary"
                    onClick={handleBatThongBao}
                    disabled={busyAction !== null || pushState === 'bi_chan'}
                  >
                    {busyAction === 'bat' ? 'Đang bật…' : 'Bật thông báo'}
                  </button>
                )}
                {pushState === 'da_bat' && (
                  <>
                    <button
                      type="button"
                      className="btn btn-primary"
                      onClick={handleGuiThu}
                      disabled={busyAction !== null}
                    >
                      {busyAction === 'thu' ? 'Đang gửi…' : 'Gửi thử'}
                    </button>
                    <button
                      type="button"
                      className="btn"
                      onClick={handleTatThongBao}
                      disabled={busyAction !== null}
                    >
                      {busyAction === 'tat' ? 'Đang tắt…' : 'Tắt trên thiết bị này'}
                    </button>
                  </>
                )}
              </div>
            )}

            {pushState === 'bi_chan' && (
              <div className="form-error">
                Trình duyệt đang chặn quyền thông báo. Hãy bấm biểu tượng ổ khóa trên thanh địa chỉ để cho phép Thông báo rồi thử lại.
              </div>
            )}
            {errMsg && (
              <div className="form-error" role="alert">
                {errMsg}
              </div>
            )}
          </div>
        </div>
        <div className="modal-footer">
          <button
            type="button"
            className="btn"
            onClick={onClose}
            disabled={busyAction !== null}
          >
            Đóng
          </button>
        </div>
      </div>
    </div>
  );
}
