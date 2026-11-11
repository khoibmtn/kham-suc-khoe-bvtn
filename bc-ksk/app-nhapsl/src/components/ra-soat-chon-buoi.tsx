'use client';

import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { BuoiTomTat } from '@/lib/api-types';
import { DON_VI, NHAN } from '@/lib/cls';
import { apiRequest } from '@/lib/client/api';
import {
  formatDate,
  formatNumber,
  formatPercent,
  TRANG_THAI_BUOI_NHAN,
} from '@/lib/client/format';

export function RaSoatChonBuoi() {
  const router = useRouter();
  const [buoiList, setBuoiList] = useState<BuoiTomTat[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [selectedDonVi, setSelectedDonVi] = useState<string>('');
  const [selectedMaBuoi, setSelectedMaBuoi] = useState<string>('');

  const reloadBuoi = useCallback(async () => {
    setLoading(true);
    setError('');
    const res = await apiRequest<{ buoi: BuoiTomTat[] }>('/api/buoi');
    if (!res.ok) {
      setError(res.error);
      setLoading(false);
      return;
    }

    const list = res.data.buoi ?? [];
    setBuoiList(list);

    if (list.length > 0) {
      const firstDonVi = list[0].don_vi;
      setSelectedDonVi(firstDonVi);
      setSelectedMaBuoi(list[0].ma_buoi);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    let cancelled = false;
    apiRequest<{ buoi: BuoiTomTat[] }>('/api/buoi').then((res) => {
      if (cancelled) return;
      if (!res.ok) {
        setError(res.error);
        setLoading(false);
        return;
      }

      const list = res.data.buoi ?? [];
      setBuoiList(list);
      if (list.length > 0) {
        setSelectedDonVi(list[0].don_vi);
        setSelectedMaBuoi(list[0].ma_buoi);
      }
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const donViOptions = useMemo(() => {
    const codes = new Set<string>();
    for (const b of buoiList) {
      codes.add(b.don_vi);
    }
    const ordered: Array<{ code: string; label: string; count: number }> = [];
    for (const code of ['TN', 'LK', 'VK'] as const) {
      if (codes.has(code)) {
        const count = buoiList.filter((b) => b.don_vi === code).length;
        ordered.push({ code, label: DON_VI[code], count });
      }
    }
    return ordered;
  }, [buoiList]);

  const buoiTheoDonVi = useMemo(() => {
    if (!selectedDonVi) return buoiList;
    return buoiList.filter((b) => b.don_vi === selectedDonVi);
  }, [buoiList, selectedDonVi]);

  const activeBuoi = useMemo(() => {
    return (
      buoiTheoDonVi.find((b) => b.ma_buoi === selectedMaBuoi) ??
      buoiTheoDonVi[0] ??
      null
    );
  }, [buoiTheoDonVi, selectedMaBuoi]);

  function handleDonViChange(newDonVi: string) {
    setSelectedDonVi(newDonVi);
    const firstInUnit = buoiList.find((b) => b.don_vi === newDonVi);
    setSelectedMaBuoi(firstInUnit ? firstInUnit.ma_buoi : '');
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const targetMaBuoi = activeBuoi?.ma_buoi || selectedMaBuoi;
    if (targetMaBuoi) {
      router.push(`/ra-soat/${targetMaBuoi}`);
    }
  }

  return (
    <div className="page-container">
      <div className="page-header-row">
        <div>
          <h1 className="page-title">Chọn buổi khám để rà soát</h1>
          <p className="page-subtitle">
            Chọn Đơn vị (địa phương) và Ngày khám để mở danh sách đối chiếu hồ sơ giấy.
          </p>
        </div>
        <div className="page-header-actions">
          <Link href="/" className="btn btn-secondary btn-sm">
            ← Về Danh sách của tôi
          </Link>
        </div>
      </div>

      {error && (
        <div className="state-box state-error" role="alert">
          <p className="state-title">Không tải được danh sách buổi khám: {error}</p>
          <p className="state-desc">
            Vui lòng kiểm tra kết nối mạng và thử tải lại.
          </p>
          <button
            type="button"
            className="btn btn-primary btn-sm"
            onClick={() => void reloadBuoi()}
          >
            Thử tải lại
          </button>
        </div>
      )}

      {!error && loading && (
        <div className="state-box" role="status">
          <p className="state-title">Đang tải danh sách buổi khám…</p>
        </div>
      )}

      {!error && !loading && buoiList.length === 0 && (
        <div className="state-box">
          <p className="state-title">
            Bạn chưa được phân công buổi nào. Liên hệ admin (BS Khôi).
          </p>
          <p className="state-desc">
            Khi được phân công, các buổi khám của bạn sẽ xuất hiện tại đây.
          </p>
          <Link href="/" className="btn btn-secondary btn-sm">
            Quay về trang chủ
          </Link>
        </div>
      )}

      {!error && !loading && buoiList.length > 0 && (
        <div className="selector-card">
          <form onSubmit={handleSubmit} className="selector-form">
            <div className="form-field">
              <label htmlFor="select-don-vi" className="form-label">
                1. Chọn đơn vị (địa phương)
              </label>
              <select
                id="select-don-vi"
                className="form-input"
                value={selectedDonVi}
                onChange={(e) => handleDonViChange(e.target.value)}
              >
                {donViOptions.map((item) => (
                  <option key={item.code} value={item.code}>
                    {item.label} ({item.code}) — {formatNumber(item.count)} buổi
                  </option>
                ))}
              </select>
            </div>

            <div className="form-field">
              <label htmlFor="select-ngay-kham" className="form-label">
                2. Chọn ngày khám
              </label>
              <select
                id="select-ngay-kham"
                className="form-input"
                value={activeBuoi?.ma_buoi ?? ''}
                onChange={(e) => setSelectedMaBuoi(e.target.value)}
              >
                {buoiTheoDonVi.map((b) => (
                  <option key={b.ma_buoi} value={b.ma_buoi}>
                    {formatDate(b.ngay_kham)} · {b.diem_kham || 'Chưa rõ điểm khám'} · {NHAN.SO_DOAN}: {formatNumber(b.so_doan_tong)}
                  </option>
                ))}
              </select>
            </div>

            <div className="selector-submit">
              <button
                type="submit"
                className="btn btn-primary"
                disabled={!activeBuoi}
              >
                Mở danh sách
              </button>
            </div>
          </form>

          {activeBuoi && (
            <div className="selector-preview">
              <div className="selector-preview-header">
                <strong>
                  {activeBuoi.ten_don_vi} — Ngày {formatDate(activeBuoi.ngay_kham)} ({activeBuoi.ma_buoi})
                </strong>
                <span className="badge badge-neutral">
                  {TRANG_THAI_BUOI_NHAN[activeBuoi.trang_thai]}
                </span>
              </div>
              <div className="selector-preview-metrics">
                <span>Điểm khám: <strong>{activeBuoi.diem_kham || '—'}</strong></span>
                <span>{NHAN.SO_DOAN}: <strong className="num">{formatNumber(activeBuoi.so_doan_tong)}</strong></span>
                <span>Trong danh sách: <strong className="num">{formatNumber(activeBuoi.hien_co)}</strong></span>
                <span>
                  Đã xác nhận:{' '}
                  <strong className="num text-success">
                    {formatNumber(activeBuoi.da_xac_nhan)}/{formatNumber(activeBuoi.hien_co)}
                  </strong>{' '}
                  ({formatPercent(activeBuoi.tien_do)})
                </span>
                <span>Thừa: <strong className="num">{formatNumber(activeBuoi.thua)}</strong></span>
                <span>Thiếu: <strong className="num">{formatNumber(activeBuoi.thieu)}</strong></span>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
