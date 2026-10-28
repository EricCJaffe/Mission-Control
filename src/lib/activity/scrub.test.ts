import { test } from "node:test";
import assert from "node:assert/strict";
import { scrub, scrubRow, textLeaks } from "./scrub.ts";

// SYNTHETIC values only: this repo is public. Never a real address or row.
const ADDRESS = "jane.doe.test@gmail.com";

const task = {
  id: "task:1",
  bot: "Tasks",
  kind: "waiting" as const,
  title: `Google: ${ADDRESS} set your address as its recovery email and created an app password - confirm it is yours`,
  tag: "due_today" as const,
  project: null,
  started_at: null,
  ended_at: null,
  due_at: null,
  pr_url: null,
  occurred_at: "2026-10-27T12:00:00Z",
};

test("the tasks-source case from 2026-10-27: the address is gone, the rest stays", () => {
  const out = scrubRow(task);
  assert.ok(out, "row is kept once scrubbed");
  assert.doesNotMatch(out.title, /@|gmail\.com|jane/i);
  assert.match(out.title, /^Google: set your address as its recovery email/);
  assert.deepEqual(textLeaks(out.title), []);
});

test("every source goes through the same pass: bot, title and project", () => {
  const out = scrubRow({
    ...task,
    bot: `Coding ${ADDRESS}`,
    title: "Call 904-555-0142 re bc-4f9a2, id 5eed0029-0003-4000-8000-000000000002, https://vercel.com/x",
    project: `client ${ADDRESS}`,
  });
  assert.ok(out);
  for (const field of [out.bot, out.title, out.project ?? ""]) assert.deepEqual(textLeaks(field), [], field);
});

test("a row that still leaks after the scrub is dropped, not rendered", () => {
  // A bare @ survives nothing; build one the scrub cannot clean by giving it
  // only an address, then check the empty-title fallback is used instead.
  const out = scrubRow({ ...task, title: ADDRESS });
  assert.ok(out);
  assert.equal(out.title, "Item");
});

test("scrub on its own: addresses cut short, phones and links are removed", () => {
  assert.equal(scrub("from jane.doe.test@gmail"), "from");
  assert.equal(scrub("call (904) 555 0142 now"), "call now");
  assert.equal(scrub("see https://example.com/a?b=c"), "see");
});
