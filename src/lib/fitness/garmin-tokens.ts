// ============================================================
// GARMIN TOKEN MANAGER — Secure token encryption and storage
// ============================================================

import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';

const ALGORITHM = 'aes-256-gcm';

/**
 * Garmin OAuth token structure (OAuth1 + OAuth2 hybrid)
 */
export type GarminTokens = {
  oauth1_token: string;
  oauth1_token_secret: string;
  oauth2_token: string | null;
  oauth2_refresh_token: string | null;
  oauth2_expires_at: string | null; // ISO datetime
  session_cookie: string | null;
};

/**
 * Get encryption key from environment variable.
 * Key must be 32 bytes (64 hex characters) for AES-256.
 */
function getEncryptionKey(): Buffer {
  const key = process.env.ENCRYPT_KEY;
  if (!key) {
    throw new Error('ENCRYPT_KEY environment variable not set');
  }
  if (key.length !== 64) {
    throw new Error('ENCRYPT_KEY must be 64 hex characters (32 bytes)');
  }
  return Buffer.from(key, 'hex');
}

/**
 * Encrypt Garmin tokens for secure database storage using AES-256-GCM.
 * Returns encrypted string in format: iv:authTag:encryptedData
 */
export function encryptTokens(tokens: GarminTokens): string {
  const key = getEncryptionKey();
  const iv = randomBytes(16);
  const cipher = createCipheriv(ALGORITHM, key, iv);

  let encrypted = cipher.update(JSON.stringify(tokens), 'utf8', 'hex');
  encrypted += cipher.final('hex');

  const authTag = cipher.getAuthTag();

  return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted}`;
}

/**
 * Decrypt Garmin tokens from database storage.
 * Expects string in format: iv:authTag:encryptedData
 */
export function decryptTokens(encrypted: string): GarminTokens {
  const key = getEncryptionKey();
  const [ivHex, authTagHex, data] = encrypted.split(':');

  if (!ivHex || !authTagHex || !data) {
    throw new Error('Invalid encrypted token format');
  }

  const iv = Buffer.from(ivHex, 'hex');
  const authTag = Buffer.from(authTagHex, 'hex');
  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);

  let decrypted = decipher.update(data, 'hex', 'utf8');
  decrypted += decipher.final('utf8');

  return JSON.parse(decrypted);
}

/**
 * Check if OAuth2 token is expired or will expire within the next 5 minutes.
 * Returns true if expired/expiring soon, false if still valid, null if no expiry set.
 */
export function isTokenExpired(tokens: GarminTokens): boolean | null {
  if (!tokens.oauth2_expires_at) return null;

  const expiresAt = new Date(tokens.oauth2_expires_at);
  const now = new Date();
  const fiveMinutesFromNow = new Date(now.getTime() + 5 * 60 * 1000);

  return expiresAt <= fiveMinutesFromNow;
}

/**
 * Create initial empty token structure (used before authentication).
 */
export function createEmptyTokens(): GarminTokens {
  return {
    oauth1_token: '',
    oauth1_token_secret: '',
    oauth2_token: null,
    oauth2_refresh_token: null,
    oauth2_expires_at: null,
    session_cookie: null,
  };
}
