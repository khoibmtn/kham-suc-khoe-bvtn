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

export function parseContentDispositionFilename(
  header: string | null | undefined,
  fallback: string,
): string {
  if (!header) return fallback;
  const utf8Match = /filename\*=UTF-8''([^;\s]+)/i.exec(header);
  if (utf8Match && utf8Match[1]) {
    try {
      return decodeURIComponent(utf8Match[1].replace(/^["']|["']$/g, ''));
    } catch {
      return utf8Match[1];
    }
  }
  const quotedMatch = /filename="([^"]+)"/i.exec(header);
  if (quotedMatch && quotedMatch[1]?.trim()) {
    return quotedMatch[1].trim();
  }
  const plainMatch = /filename=([^;\s]+)/i.exec(header);
  if (plainMatch && plainMatch[1]?.trim()) {
    return plainMatch[1].trim().replace(/^["']|["']$/g, '');
  }
  return fallback;
}

export type DownloadFileResult =
  | { ok: true; filename: string }
  | { ok: false; status: number; error: string };

export async function downloadFile(
  url: string,
  fallbackFilename: string,
): Promise<DownloadFileResult> {
  try {
    const response = await fetch(url, {
      method: 'GET',
      cache: 'no-store',
    });

    if (response.status === 401 && typeof window !== 'undefined') {
      const currentPath = `${window.location.pathname}${window.location.search}`;
      window.location.replace(`/dang-nhap?next=${encodeURIComponent(currentPath)}`);
      return {
        ok: false,
        status: 401,
        error: 'Chưa đăng nhập hoặc phiên làm việc đã hết hạn',
      };
    }

    if (!response.ok) {
      const body = (await response.json().catch(() => ({}))) as Record<
        string,
        unknown
      >;
      const errorMsg =
        typeof body.error === 'string' && body.error.trim()
          ? body.error
          : `Không tạo được file (mã lỗi ${response.status})`;
      return {
        ok: false,
        status: response.status,
        error: errorMsg,
      };
    }

    const filename = parseContentDispositionFilename(
      response.headers.get('Content-Disposition'),
      fallbackFilename,
    );
    const blob = await response.blob();
    if (typeof window !== 'undefined') {
      const blobUrl = window.URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = blobUrl;
      anchor.download = filename;
      anchor.style.display = 'none';
      document.body.appendChild(anchor);
      anchor.click();
      document.body.removeChild(anchor);
      window.setTimeout(() => {
        window.URL.revokeObjectURL(blobUrl);
      }, 2000);
    }

    return { ok: true, filename };
  } catch {
    return {
      ok: false,
      status: 0,
      error: 'Không tải được file, vui lòng kiểm tra kết nối mạng',
    };
  }
}
