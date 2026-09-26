/**
 * Helper accounts: email + password logins for the people Eric shares jobs
 * with. Deliberately NOT Supabase Auth — see
 * docs/DECISIONS/0011-helper-accounts.md. A helper has no JWT, so no RLS
 * policy anywhere in the shared project can match them, and every existing
 * page in this app (which all require a Supabase session) is closed to them
 * by construction rather than by an audit.
 *
 * Passwords: scrypt with a per-password salt. Sessions: a random token in an
 * httpOnly cookie, stored only as its sha256.
 */

import { createHash, randomBytes, randomInt, scrypt as scryptCb, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';

const scrypt = promisify(scryptCb) as (pw: string, salt: Buffer, len: number) => Promise<Buffer>;

export const HELPER_COOKIE = 'mc_helper';
export const SESSION_DAYS = 30;
/* Five wrong passwords lock the account for fifteen minutes. */
export const MAX_FAILURES = 5;
export const LOCK_MINUTES = 15;
export const MIN_PASSWORD = 8;

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const key = await scrypt(password, salt, 64);
  return `scrypt$${salt.toString('base64')}$${key.toString('base64')}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [scheme, saltB64, keyB64] = stored.split('$');
  if (scheme !== 'scrypt' || !saltB64 || !keyB64) return false;
  const expected = Buffer.from(keyB64, 'base64');
  const actual = await scrypt(password, Buffer.from(saltB64, 'base64'), expected.length);
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

export function newSessionToken(): string {
  return randomBytes(32).toString('base64url');
}

export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

/* A readable temporary password Eric can text: three words would be nicer,
   but no word list ships with the app, so it is 12 unambiguous characters. */
export function temporaryPassword(): string {
  const alphabet = 'abcdefghjkmnpqrstuvwxyz23456789';
  return Array.from({ length: 12 }, () => alphabet[randomInt(alphabet.length)]).join('');
}

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}
