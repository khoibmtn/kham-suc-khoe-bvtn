'use client';

import { Suspense, useEffect, useState, type FormEvent } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { sanitizeNextPath } from '@/lib/auth/session';

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [dsTaiKhoan, setDsTaiKhoan] = useState<{ username: string; ho_ten: string }[] | null>(null);

  useEffect(() => {
    fetch('/api/auth/ds-dang-nhap')
      .then((r) => (r.ok ? r.json() : []))
      .then((ds: { username: string; ho_ten: string }[]) => setDsTaiKhoan(ds))
      .catch(() => setDsTaiKhoan([]));
  }, []);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    setSubmitting(true);

    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      });

      const data = (await response.json().catch(() => ({}))) as { error?: string };

      if (!response.ok) {
        setError(data.error ?? 'Đăng nhập không thành công');
        setSubmitting(false);
        return;
      }

      const nextUrl = sanitizeNextPath(searchParams.get('next'));
      router.replace(nextUrl);
      router.refresh();
    } catch {
      setError('Không thể kết nối máy chủ, vui lòng thử lại');
      setSubmitting(false);
    }
  }

  return (
    <div className="auth-card">
      <div className="auth-header">
        <h1 className="auth-title">Đăng nhập hệ thống</h1>
        <p className="auth-subtitle">Rà soát hồ sơ khám sức khỏe toàn dân 2026</p>
      </div>

      <form onSubmit={handleSubmit} className="form-stack">
        {error && (
          <div className="alert alert-error" role="alert">
            {error}
          </div>
        )}

        <div className="form-field">
          <label htmlFor="username" className="form-label">
            Tên đăng nhập
          </label>
          {dsTaiKhoan && dsTaiKhoan.length > 0 ? (
            <select
              id="username"
              name="username"
              className="form-input"
              autoFocus
              required
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              disabled={submitting}
            >
              <option value="">— Chọn tên của bạn —</option>
              {dsTaiKhoan.map((u) => (
                <option key={u.username} value={u.username}>
                  {u.ho_ten} ({u.username})
                </option>
              ))}
            </select>
          ) : (
            <input
              id="username"
              name="username"
              type="text"
              className="form-input"
              autoComplete="username"
              autoFocus
              required
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              disabled={submitting}
            />
          )}
        </div>

        <div className="form-field">
          <label htmlFor="password" className="form-label">
            Mật khẩu
          </label>
          <input
            id="password"
            name="password"
            type="password"
            className="form-input"
            autoComplete="current-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            disabled={submitting}
          />
        </div>

        <button type="submit" className="btn btn-primary btn-block" disabled={submitting}>
          {submitting ? 'Đang đăng nhập…' : 'Đăng nhập'}
        </button>
      </form>
    </div>
  );
}

export default function DangNhapPage() {
  return (
    <main className="auth-shell">
      <Suspense
        fallback={
          <div className="auth-card">
            <p className="auth-subtitle">Đang tải trang đăng nhập…</p>
          </div>
        }
      >
        <LoginForm />
      </Suspense>
    </main>
  );
}
