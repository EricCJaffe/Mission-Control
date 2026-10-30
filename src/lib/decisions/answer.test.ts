import { test } from "node:test";
import assert from "node:assert/strict";
import { parseAnswer, sortOpen } from "./answer.ts";
import { textLeaks } from "../activity/scrub.ts";

const OPTS = [{ id: "o1", label: "Close" }, { id: "o2", label: "Keep" }];

test("an option id from the row is accepted, with optional text", () => {
  assert.deepEqual(parseAnswer({ answer: "o2" }, OPTS), { ok: true, value: { answer: "o2", answer_text: null } });
  assert.deepEqual(parseAnswer({ answer: "o1", text: " ship it " }, OPTS), { ok: true, value: { answer: "o1", answer_text: "ship it" } });
});

test("an id the row does not offer, or junk, is refused", () => {
  assert.equal(parseAnswer({ answer: "o3" }, OPTS).ok, false);
  assert.equal(parseAnswer({ answer: "o1'; drop table" }, OPTS).ok, false);
  assert.equal(parseAnswer(null, OPTS).ok, false);
  assert.equal(parseAnswer({ answer: "o1", text: "x".repeat(1001) }, OPTS).ok, false);
});

test("other needs words, and the words are scrubbed", () => {
  assert.equal(parseAnswer({ answer: "other" }, OPTS).ok, false);
  const r = parseAnswer({ answer: "other", text: "Call jane.doe.test@gmail.com at 904-555-0142" }, OPTS);
  assert.ok(r.ok);
  if (r.ok) assert.deepEqual(textLeaks(r.value.answer_text ?? ""), []);
});

test("red first, then nearest deadline, then oldest", () => {
  const rows = [
    { id: "a", urgency: "yellow" as const, deadline: null, created_at: "2026-10-01" },
    { id: "b", urgency: "red" as const, deadline: null, created_at: "2026-10-20" },
    { id: "c", urgency: "yellow" as const, deadline: "2026-10-31T12:00:00Z", created_at: "2026-10-25" },
    { id: "d", urgency: "green" as const, deadline: null, created_at: "2026-09-01" },
  ];
  assert.deepEqual(sortOpen(rows).map((r) => r.id), ["b", "c", "a", "d"]);
});
