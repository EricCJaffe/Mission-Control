import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';

const ALGORITHM = 'aes-256-gcm';

export type WithingsTokens = {
  access_token: string;
  refresh_token: string;
  expires_at: string;
  scope: string;
  userid: string;
};

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

export function encryptWithingsTokens(tokens: WithingsTokens): string {
  const key = getEncryptionKey();
  const iv = randomBytes(16);
  const cipher = createCipheriv(ALGORITHM, key, iv);

  let encrypted = cipher.update(JSON.stringify(tokens), 'utf8', 'hex');
  encrypted += cipher.final('hex');

  return `${iv.toString('hex')}:${cipher.getAuthTag().toString('hex')}:${encrypted}`;
}

export function decryptWithingsTokens(encrypted: string): WithingsTokens {
  const key = getEncryptionKey();
  const [ivHex, authTagHex, payload] = encrypted.split(':');

  if (!ivHex || !authTagHex || !payload) {
    throw new Error('Invalid encrypted token format');
  }

  const decipher = createDecipheriv(ALGORITHM, key, Buffer.from(ivHex, 'hex'));
  decipher.setAuthTag(Buffer.from(authTagHex, 'hex'));

  let decrypted = decipher.update(payload, 'hex', 'utf8');
  decrypted += decipher.final('utf8');

  return JSON.parse(decrypted) as WithingsTokens;
}

export function isWithingsTokenExpired(tokens: WithingsTokens): boolean {
  return new Date(tokens.expires_at) <= new Date(Date.now() + 5 * 60 * 1000);
}
