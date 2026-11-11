import { randomInt } from 'node:crypto';
import bcrypt from 'bcryptjs';

export const BCRYPT_COST = 10;
export const DEFAULT_PASSWORD_LENGTH = 10;

// Bỏ các ký tự dễ nhầm: 0, O, 1, l, I
export const PASSWORD_ALPHABET =
  'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';

export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, BCRYPT_COST);
}

export async function verifyPassword(plain: string, passwordHash: string): Promise<boolean> {
  return bcrypt.compare(plain, passwordHash);
}

export function generateReadablePassword(length: number = DEFAULT_PASSWORD_LENGTH): string {
  if (!Number.isInteger(length) || length < 1) {
    throw new Error('Độ dài mật khẩu không hợp lệ');
  }
  let result = '';
  for (let i = 0; i < length; i += 1) {
    result += PASSWORD_ALPHABET[randomInt(0, PASSWORD_ALPHABET.length)];
  }
  return result;
}
