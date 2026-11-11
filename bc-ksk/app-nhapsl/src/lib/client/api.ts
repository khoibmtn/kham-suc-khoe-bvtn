import type { HoSoDong, KetQuaTimKiem } from '@/lib/api-types';

export type ApiResult<T> =
  | {
      ok: true;
      status: number;
      data: T;
    }
  | {
      ok: false;
      status: number;
      error: string;
      isNetworkError: boolean;
      conflictHoSo?: HoSoDong;
      conflictTrung?: KetQuaTimKiem[];
    };

export async function apiRequest<T>(
  url: string,
  options?: RequestInit,
): Promise<ApiResult<T>> {
  try {
    const headers = new Headers(options?.headers);
    if (options?.body && !headers.has('Content-Type')) {
      headers.set('Content-Type', 'application/json');
    }

    const response = await fetch(url, {
      ...options,
      headers,
      cache: 'no-store',
    });

    if (response.status === 401 && typeof window !== 'undefined') {
      const currentPath = `${window.location.pathname}${window.location.search}`;
      window.location.replace(`/dang-nhap?next=${encodeURIComponent(currentPath)}`);
      return {
        ok: false,
        status: 401,
        error: 'Chưa đăng nhập hoặc phiên làm việc đã hết hạn',
        isNetworkError: false,
      };
    }

    const body = (await response.json().catch(() => ({}))) as Record<string, unknown>;

    if (!response.ok) {
      const errorMsg =
        typeof body.error === 'string' && body.error.trim()
          ? body.error
          : `Yêu cầu không thành công (mã lỗi ${response.status})`;

      const conflictHoSo =
        response.status === 409 && body.ho_so && typeof body.ho_so === 'object'
          ? (body.ho_so as HoSoDong)
          : undefined;

      const conflictTrung =
        response.status === 409 && Array.isArray(body.trung)
          ? (body.trung as KetQuaTimKiem[])
          : undefined;

      return {
        ok: false,
        status: response.status,
        error: errorMsg,
        isNetworkError: false,
        conflictHoSo,
        conflictTrung,
      };
    }

    return {
      ok: true,
      status: response.status,
      data: body as T,
    };
  } catch {
    return {
      ok: false,
      status: 0,
      error: 'Không lưu được, kiểm tra mạng',
      isNetworkError: true,
    };
  }
}
