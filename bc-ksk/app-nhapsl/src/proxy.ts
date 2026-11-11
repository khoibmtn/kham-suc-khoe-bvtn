import { NextResponse, type NextRequest } from 'next/server';
import {
  SESSION_COOKIE_NAME,
  getSessionCookieOptions,
  signSessionToken,
  verifySessionToken,
} from '@/lib/auth/session';

const ROBOTS_HEADER_VALUE = 'noindex, nofollow';

const STATIC_FILE_RE = /\.(?:ico|png|jpg|jpeg|gif|svg|webp|woff2?|ttf|eot|css|js|map)$/i;

function withNoIndex(response: NextResponse): NextResponse {
  response.headers.set('X-Robots-Tag', ROBOTS_HEADER_VALUE);
  return response;
}

function isPublicPath(pathname: string): boolean {
  if (
    pathname === '/dang-nhap' ||
    pathname === '/api/auth/login' ||
    pathname === '/robots.txt' ||
    pathname === '/favicon.ico' ||
    pathname.startsWith('/_next/')
  ) {
    return true;
  }
  if (!pathname.startsWith('/api/') && STATIC_FILE_RE.test(pathname)) {
    return true;
  }
  return false;
}

export async function proxy(request: NextRequest): Promise<NextResponse> {
  const { pathname, search } = request.nextUrl;

  if (isPublicPath(pathname)) {
    return withNoIndex(NextResponse.next());
  }

  const token = request.cookies.get(SESSION_COOKIE_NAME)?.value;
  const session = await verifySessionToken(token);

  if (!session) {
    if (pathname === '/api' || pathname.startsWith('/api/')) {
      return withNoIndex(
        NextResponse.json(
          { error: 'Chưa đăng nhập hoặc phiên làm việc đã hết hạn' },
          { status: 401 },
        ),
      );
    }

    const loginUrl = new URL('/dang-nhap', request.url);
    loginUrl.searchParams.set('next', `${pathname}${search}`);
    return withNoIndex(NextResponse.redirect(loginUrl, 307));
  }

  const response = NextResponse.next();

  // Gia hạn trượt 12 giờ cho các request thông thường.
  // Bỏ qua trên logout / doi-mat-khau vì Route Handler tự xóa hoặc cấp lại cookie mới.
  if (pathname !== '/api/auth/logout' && pathname !== '/api/auth/doi-mat-khau') {
    const refreshedToken = await signSessionToken(session);
    response.cookies.set(SESSION_COOKIE_NAME, refreshedToken, getSessionCookieOptions());
  }

  return withNoIndex(response);
}

export const config = {
  matcher: ['/((?!_next/static|_next/image).*)'],
};
