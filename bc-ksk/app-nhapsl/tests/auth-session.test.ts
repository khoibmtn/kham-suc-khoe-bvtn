import { describe, expect, it } from 'vitest';
import {
  PASSWORD_ALPHABET,
  generateReadablePassword,
  hashPassword,
  verifyPassword,
} from '../src/lib/auth/password';
import {
  SESSION_TTL_SECONDS,
  getSessionCookieOptions,
  sanitizeNextPath,
  signSessionToken,
  verifySessionToken,
} from '../src/lib/auth/session';

const TEST_SECRET = 'test-secret-key-at-least-32-characters-long-123456';

describe('auth/session — JWT sign & verify', () => {
  it('ký và giải mã đúng payload { uid, sv, role }', async () => {
    const token = await signSessionToken(
      { uid: 7, sv: 3, role: 'admin' },
      { secret: TEST_SECRET },
    );
    const verified = await verifySessionToken(token, { secret: TEST_SECRET });
    expect(verified).toEqual({ uid: 7, sv: 3, role: 'admin' });
  });

  it('từ chối token sai khóa bí mật hoặc bị sửa', async () => {
    const token = await signSessionToken(
      { uid: 2, sv: 1, role: 'nhan_vien' },
      { secret: TEST_SECRET },
    );
    const wrongSecret = await verifySessionToken(token, {
      secret: 'another-secret-key-at-least-32-characters-long-9999',
    });
    expect(wrongSecret).toBeNull();
    expect(await verifySessionToken(`${token}tampered`, { secret: TEST_SECRET })).toBeNull();
    expect(await verifySessionToken('', { secret: TEST_SECRET })).toBeNull();
    expect(await verifySessionToken(null, { secret: TEST_SECRET })).toBeNull();
  });

  it('từ chối token đã hết hạn', async () => {
    const expired = await signSessionToken(
      { uid: 1, sv: 1, role: 'admin' },
      { secret: TEST_SECRET, ttlSeconds: -10 },
    );
    expect(await verifySessionToken(expired, { secret: TEST_SECRET })).toBeNull();
  });

  it('tùy chọn cookie phiên đúng chuẩn 12 giờ httpOnly SameSite=Lax', () => {
    const opts = getSessionCookieOptions();
    expect(opts.httpOnly).toBe(true);
    expect(opts.sameSite).toBe('lax');
    expect(opts.path).toBe('/');
    expect(opts.maxAge).toBe(SESSION_TTL_SECONDS);
    expect(SESSION_TTL_SECONDS).toBe(12 * 60 * 60);
  });
});

describe('auth/session — sanitizeNextPath chống open-redirect', () => {
  it('cho phép đường dẫn nội bộ hợp lệ', () => {
    expect(sanitizeNextPath('/')).toBe('/');
    expect(sanitizeNextPath('/doi-mat-khau')).toBe('/doi-mat-khau');
    expect(sanitizeNextPath('/buoi/12?don_vi=TN#top')).toBe('/buoi/12?don_vi=TN#top');
  });

  it('chặn URL ngoài, protocol-relative, backslash và đường dẫn không hợp lệ', () => {
    expect(sanitizeNextPath(null)).toBe('/');
    expect(sanitizeNextPath(undefined)).toBe('/');
    expect(sanitizeNextPath('')).toBe('/');
    expect(sanitizeNextPath('https://evil.example.com')).toBe('/');
    expect(sanitizeNextPath('//evil.example.com/path')).toBe('/');
    expect(sanitizeNextPath('/\\evil.example.com')).toBe('/');
    expect(sanitizeNextPath('javascript:alert(1)')).toBe('/');
    expect(sanitizeNextPath('dang-nhap')).toBe('/');
    expect(sanitizeNextPath('/dang-nhap')).toBe('/');
  });
});

describe('auth/password — sinh mật khẩu và băm bcrypt', () => {
  it('sinh mật khẩu 10 ký tự không chứa 0/O/1/l/I', () => {
    for (let i = 0; i < 50; i += 1) {
      const pw = generateReadablePassword();
      expect(pw).toHaveLength(10);
      expect(pw).not.toMatch(/[0O1lI]/);
      for (const ch of pw) {
        expect(PASSWORD_ALPHABET.includes(ch)).toBe(true);
      }
    }
  });

  it('băm và kiểm tra mật khẩu bằng bcrypt cost 10', async () => {
    const plain = generateReadablePassword();
    const hashed = await hashPassword(plain);
    expect(hashed.startsWith('$2')).toBe(true);
    expect(await verifyPassword(plain, hashed)).toBe(true);
    expect(await verifyPassword(`${plain}x`, hashed)).toBe(false);
  });
});
