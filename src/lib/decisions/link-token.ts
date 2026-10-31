import { createHmac, timingSafeEqual } from "node:crypto";

/*
 * One-click answer links for the decisions email digest.
 *
 * A link carries one decision id and one option id, signed with HMAC-SHA256
 * under DECISIONS_LINK_SECRET and good for LINK_TTL_HOURS. The token is not
 * the authority to answer: the page it opens sits behind the middleware, so
 * only Eric's own session can submit, and RLS still allows one answer per row.
 * What the token adds is that a link answers only the question it was minted
 * for, with only the option it names, and only until it expires. That also
 * means a mail scanner opening the link gets the login page and answers
 * nothing.
 *
 * Single use comes from the row, not from a ledger of spent tokens: the
 * answer endpoint updates only an unanswered open/stale row, so a second tap
 * on any link for the same decision is "Already answered" (checkLinkUse
 * here, and the conditional update in the route).
 *
 *   v1.<decision uuid>.<option id>.<expiry, unix seconds>.<base64url hmac>
 */

export const LINK_TTL_HOURS = 72;
const VERSION = "v1";
const SECRET_MIN = 32;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const OPTION_ID = /^o[1-8]$/;
const EXP = /^[0-9]{10}$/;

export type LinkClaims = { id: string; answer: string; exp: number };
export type LinkError = "unconfigured" | "malformed" | "signature" | "expired";

function mac(secret: string, body: string): string {
  // Domain-separated, so the same secret can never sign anything else that verifies here.
  return createHmac("sha256", secret).update(`mission-control/decision-link\n${body}`).digest("base64url");
}

function usable(secret: string | undefined): secret is string {
  return typeof secret === "string" && secret.length >= SECRET_MIN;
}

/** A signed link token for one option of one decision. Throws without a usable secret. */
export function signLinkToken(id: string, answer: string, secret: string | undefined, now: Date = new Date(), ttlHours = LINK_TTL_HOURS): string {
  if (!usable(secret)) throw new Error(`DECISIONS_LINK_SECRET is not set (at least ${SECRET_MIN} characters)`);
  const lowerId = id.toLowerCase();
  if (!UUID.test(lowerId)) throw new Error("decision id must be a uuid");
  if (!OPTION_ID.test(answer)) throw new Error("a link can carry only an option id (o1-o8)");
  const exp = Math.floor(now.getTime() / 1000) + Math.round(ttlHours * 3600);
  const body = `${VERSION}.${lowerId}.${answer}.${exp}`;
  return `${body}.${mac(secret, body)}`;
}

/** The claims of a token that is well formed, correctly signed and unexpired. */
export function verifyLinkToken(token: unknown, secret: string | undefined, now: Date = new Date()): { ok: true; claims: LinkClaims } | { ok: false; error: LinkError } {
  if (!usable(secret)) return { ok: false, error: "unconfigured" };
  if (typeof token !== "string" || token.length > 200) return { ok: false, error: "malformed" };
  const parts = token.split(".");
  if (parts.length !== 5) return { ok: false, error: "malformed" };
  const [version, id, answer, expRaw, sig] = parts;
  if (version !== VERSION || !UUID.test(id) || !OPTION_ID.test(answer) || !EXP.test(expRaw)) return { ok: false, error: "malformed" };
  const want = Buffer.from(mac(secret, `${version}.${id}.${answer}.${expRaw}`));
  const got = Buffer.from(sig);
  // Signature before expiry: a forged token learns nothing from the error it gets.
  if (got.length !== want.length || !timingSafeEqual(got, want)) return { ok: false, error: "signature" };
  const exp = Number(expRaw);
  if (exp * 1000 <= now.getTime()) return { ok: false, error: "expired" };
  return { ok: true, claims: { id, answer, exp } };
}

/**
 * Whether a verified link may still answer this row: the row must be the one
 * it was minted for, still open or stale and unanswered, and still offer the
 * option. Anything else, including a second tap, is refused.
 */
export function checkLinkUse(
  claims: LinkClaims,
  row: { id: string; status: string; answered_at: string | null; options: { id: string }[] | null },
): { ok: true } | { ok: false; error: "mismatch" | "answered" | "closed" | "option" } {
  if (row.id.toLowerCase() !== claims.id) return { ok: false, error: "mismatch" };
  if (row.status === "answered" || row.answered_at) return { ok: false, error: "answered" };
  if (row.status !== "open" && row.status !== "stale") return { ok: false, error: "closed" };
  if (!(row.options ?? []).some((o) => o.id === claims.answer)) return { ok: false, error: "option" };
  return { ok: true };
}

/** What the page says for each refusal. */
export const LINK_ERROR_TEXT: Record<LinkError | "mismatch" | "answered" | "closed" | "option" | "missing", string> = {
  unconfigured: "Email links are not switched on yet. Answer on the Decisions page.",
  malformed: "This link is not a valid answer link.",
  signature: "This link is not a valid answer link.",
  expired: "This link has expired. Answer on the Decisions page.",
  mismatch: "This link is not a valid answer link.",
  answered: "Already answered.",
  closed: "This decision is no longer open.",
  option: "That option is no longer offered. Answer on the Decisions page.",
  missing: "Decision not found.",
};
