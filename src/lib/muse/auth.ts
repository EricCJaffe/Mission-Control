import { createHash, timingSafeEqual } from 'node:crypto';

/**
 * Bearer check for the Muse mailbox.
 *
 * Vercel holds only MUSE_MAILBOX_TOKEN_SHA256 (hex). The plaintext token lives
 * in Bitwarden and in Muse Code's environment on Eric's Mac, never here. We
 * hash what was presented and compare the digests in constant time, so the
 * deployment can check the token without being able to leak it.
 *
 *   unconfigured  -> the env is missing or not a sha256 hex: 503, fail closed
 *   unauthorized  -> no Bearer, or the wrong one: 401
 */
export type TokenCheck = 'ok' | 'unconfigured' | 'unauthorized';

const HEX64 = /^[0-9a-f]{64}$/;

export function sha256Hex(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

export function checkBearerSha256(authorization: string | null, expectedSha256: string | undefined): TokenCheck {
  const expected = (expectedSha256 ?? '').trim().toLowerCase();
  if (!HEX64.test(expected)) return 'unconfigured';
  const m = /^Bearer (.+)$/.exec(authorization ?? '');
  if (!m || !m[1]) return 'unauthorized';
  const got = Buffer.from(sha256Hex(m[1]), 'hex');
  return timingSafeEqual(got, Buffer.from(expected, 'hex')) ? 'ok' : 'unauthorized';
}

/**
 * Fixed-window rate limit, ~120 requests an hour per token.
 *
 * In memory, so it is per serverless instance: a guard against a runaway
 * loop in Muse, not an accounting system. A loop hits one warm instance and
 * gets 429s; the worst case across cold starts is a few multiples of the cap.
 */
export function createLimiter(limit = 120, windowMs = 3_600_000) {
  const windows = new Map<string, { start: number; count: number }>();
  return {
    hit(key: string, now = Date.now()): boolean {
      const w = windows.get(key);
      if (!w || now - w.start >= windowMs) {
        windows.set(key, { start: now, count: 1 });
        return true;
      }
      w.count += 1;
      return w.count <= limit;
    },
  };
}
