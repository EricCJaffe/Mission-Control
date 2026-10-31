import { test } from "node:test";
import assert from "node:assert/strict";
import { addedLabel, ageDays } from "./age.ts";

test("calendar days, not elapsed 24h blocks: the one-day-low glitch", () => {
  // Added 13:43Z two days ago; the page's clock is a minute earlier in the day.
  const now = Date.parse("2026-10-31T13:42:00Z");
  assert.equal(ageDays("2026-10-29T13:43:00Z", now), 2);
  assert.equal(addedLabel("2026-10-29T13:43:00Z", now), "Oct 29 · 2d");
});

test("same ET day is today; a later timestamp never goes negative", () => {
  const now = Date.parse("2026-10-31T14:00:00Z");
  assert.equal(addedLabel("2026-10-31T12:00:00Z", now), "Oct 31 · today");
  assert.equal(ageDays("2026-10-31T15:00:00Z", now), 0);
});

test("days turn over at ET midnight, not UTC", () => {
  // 11:30 PM ET Oct 30 is 03:30Z Oct 31; at 9 AM ET Oct 31 that is 1 day.
  assert.equal(ageDays("2026-10-31T03:30:00Z", Date.parse("2026-10-31T13:00:00Z")), 1);
  // Across the DST change (Nov 1): still whole days.
  assert.equal(ageDays("2026-10-31T16:00:00Z", Date.parse("2026-11-02T16:00:00Z")), 2);
});

test("bad dates read as today rather than NaN", () => {
  assert.equal(ageDays("not a date", Date.now()), 0);
});
