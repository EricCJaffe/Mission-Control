import { test } from "node:test";
import assert from "node:assert/strict";
import { checkLinkUse, signLinkToken, verifyLinkToken } from "./link-token.ts";

const SECRET = "s".repeat(40);
const OTHER = "t".repeat(40);
const ID = "0f8e2c1a-7b3d-4e5f-9a6b-1c2d3e4f5a6b";
const NOW = new Date("2026-10-30T21:00:00Z");
const hours = (h: number) => new Date(NOW.getTime() + h * 3_600_000);
const ROW = { id: ID, status: "open", answered_at: null, options: [{ id: "o1" }, { id: "o2" }] };

test("signing: a fresh token verifies and carries its decision and option", () => {
  const t = signLinkToken(ID, "o2", SECRET, NOW);
  const v = verifyLinkToken(t, SECRET, NOW);
  assert.equal(v.ok, true);
  if (v.ok) assert.deepEqual(v.claims, { id: ID, answer: "o2", exp: NOW.getTime() / 1000 + 72 * 3600 });
});

test("signing: refuses without a real secret, a non-uuid id, or a free-text answer", () => {
  assert.throws(() => signLinkToken(ID, "o1", undefined, NOW));
  assert.throws(() => signLinkToken(ID, "o1", "short", NOW));
  assert.throws(() => signLinkToken("not-a-uuid", "o1", SECRET, NOW));
  assert.throws(() => signLinkToken(ID, "other", SECRET, NOW));
  assert.deepEqual(verifyLinkToken(signLinkToken(ID, "o1", SECRET, NOW), undefined, NOW), { ok: false, error: "unconfigured" });
});

test("expiry: good just before 72 hours, refused at and after", () => {
  const t = signLinkToken(ID, "o1", SECRET, NOW);
  assert.equal(verifyLinkToken(t, SECRET, hours(71.99)).ok, true);
  assert.deepEqual(verifyLinkToken(t, SECRET, hours(72)), { ok: false, error: "expired" });
  assert.deepEqual(verifyLinkToken(t, SECRET, hours(500)), { ok: false, error: "expired" });
});

test("tampering: changing the decision, option, expiry or signature breaks it", () => {
  const t = signLinkToken(ID, "o1", SECRET, NOW);
  const [v, id, ans, exp, sig] = t.split(".");
  const other = "1f8e2c1a-7b3d-4e5f-9a6b-1c2d3e4f5a6b";
  for (const forged of [
    [v, other, ans, exp, sig],
    [v, id, "o2", exp, sig],
    [v, id, ans, String(Number(exp) + 3600), sig],
    [v, id, ans, exp, sig.slice(0, -2) + (sig.endsWith("AA") ? "BB" : "AA")],
  ]) {
    assert.deepEqual(verifyLinkToken(forged.join("."), SECRET, NOW), { ok: false, error: "signature" });
  }
  assert.deepEqual(verifyLinkToken(t, OTHER, NOW), { ok: false, error: "signature" });
  // An expired token that has been tampered with reports the forgery, not the expiry.
  assert.deepEqual(verifyLinkToken([v, id, ans, exp, sig.slice(1) + "x"].join("."), SECRET, hours(100)), { ok: false, error: "signature" });
});

test("tampering: junk and wrong shapes are malformed, never a crash", () => {
  for (const junk of [undefined, null, 42, "", "v1", "v2." + signLinkToken(ID, "o1", SECRET, NOW).slice(3), `v1.${ID}.other.1700000000.x`, "a".repeat(500), `v1.${ID}.o1.17e8.x`]) {
    assert.deepEqual(verifyLinkToken(junk, SECRET, NOW), { ok: false, error: "malformed" });
  }
});

test("replay: a link answers only an unanswered open row, once", () => {
  const v = verifyLinkToken(signLinkToken(ID, "o2", SECRET, NOW), SECRET, NOW);
  assert.ok(v.ok);
  if (!v.ok) return;
  assert.deepEqual(checkLinkUse(v.claims, ROW), { ok: true });
  assert.deepEqual(checkLinkUse(v.claims, { ...ROW, status: "stale" }), { ok: true });
  // Second tap, from this link or any other for the same decision.
  assert.deepEqual(checkLinkUse(v.claims, { ...ROW, status: "answered", answered_at: NOW.toISOString() }), { ok: false, error: "answered" });
  assert.deepEqual(checkLinkUse(v.claims, { ...ROW, status: "withdrawn" }), { ok: false, error: "closed" });
  assert.deepEqual(checkLinkUse(v.claims, { ...ROW, options: [{ id: "o1" }] }), { ok: false, error: "option" });
  assert.deepEqual(checkLinkUse(v.claims, { ...ROW, id: "1f8e2c1a-7b3d-4e5f-9a6b-1c2d3e4f5a6b" }), { ok: false, error: "mismatch" });
});
