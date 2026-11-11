'use client';

import { useState, type FormEvent } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

export default function DoiMatKhauPage() {
  const router = useRouter();
  const [matKhauCu, setMatKhauCu] = useState('');
  const [matKhauMoi, setMatKhauMoi] = useState('');
  const [nhapLaiMatKhau, setNhapLaiMatKhau] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    setSuccess('');

    if (matKhauMoi.length < 8) {
      setError('Mật khẩu mới phải có ít nhất 8 ký tự');
      return;
    }

    if (matKhauMoi !== nhapLaiMatKhau) {
      setError('Mật khẩu mới nhập lại không khớp');
      return;
    }

    setSubmitting(true);
    try {
      const response = await fetch('/api/auth/doi-mat-khau', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mat_khau_cu: matKhauCu,
          mat_khau_moi: matKhauMoi,
        }),
      });

      if (response.status === 401) {
        router.replace('/dang-nhap?next=%2Fdoi-mat-khau');
        return;
      }

      const data = (await response.json().catch(() => ({}))) as { error?: string };

      if (!response.ok) {
        setError(data.error ?? 'Không thể đổi mật khẩu');
        return;
      }

      setMatKhauCu('');
      setMatKhauMoi('');
      setNhapLaiMatKhau('');
      setSuccess('Đổi mật khẩu thành công.');
    } catch {
      setError('Không thể kết nối máy chủ, vui lòng thử lại');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="auth-shell">
      <div className="auth-card">
        <div className="auth-header">
          <h1 className="auth-title">Đổi mật khẩu</h1>
          <p className="auth-subtitle">Mật khẩu mới cần ít nhất 8 ký tự</p>
        </div>

        <form onSubmit={handleSubmit} className="form-stack">
          {error && (
            <div className="alert alert-error" role="alert">
              {error}
            </div>
          )}

          {success && (
            <div className="alert alert-success" role="status">
              {success}
            </div>
          )}

          <div className="form-field">
            <label htmlFor="mat_khau_cu" className="form-label">
              Mật khẩu hiện tại
            </label>
            <input
              id="mat_khau_cu"
              name="mat_khau_cu"
              type="password"
              className="form-input"
              autoComplete="current-password"
              required
              value={matKhauCu}
              onChange={(e) => setMatKhauCu(e.target.value)}
              disabled={submitting}
            />
          </div>

          <div className="form-field">
            <label htmlFor="mat_khau_moi" className="form-label">
              Mật khẩu mới
            </label>
            <input
              id="mat_khau_moi"
              name="mat_khau_moi"
              type="password"
              className="form-input"
              autoComplete="new-password"
              minLength={8}
              required
              value={matKhauMoi}
              onChange={(e) => setMatKhauMoi(e.target.value)}
              disabled={submitting}
            />
          </div>

          <div className="form-field">
            <label htmlFor="nhap_lai_mat_khau" className="form-label">
              Nhập lại mật khẩu mới
            </label>
            <input
              id="nhap_lai_mat_khau"
              name="nhap_lai_mat_khau"
              type="password"
              className="form-input"
              autoComplete="new-password"
              minLength={8}
              required
              value={nhapLaiMatKhau}
              onChange={(e) => setNhapLaiMatKhau(e.target.value)}
              disabled={submitting}
            />
          </div>

          <button type="submit" className="btn btn-primary btn-block" disabled={submitting}>
            {submitting ? 'Đang cập nhật…' : 'Cập nhật mật khẩu'}
          </button>
        </form>

        <div className="auth-footer-link">
          <Link href="/">← Quay lại trang chủ</Link>
        </div>
      </div>
    </main>
  );
}
