import { test } from "node:test";
import assert from "node:assert/strict";
import { addDays, droppedKeys, latestByKey, parseDecision, waitingState, type Decision } from "./decisions.ts";
import { textLeaks } from "./scrub.ts";

const TODAY = "2026-10-27";
const base = { item_key: "channel:to:abc123:waiting", item_source: "channel", item_title: "Merge PR 12?", item_bot: "Coding" };

test("bot items take bot choices; tasks take task choices; anything else is refused", () => {
  assert.ok(parseDecision({ ...base, choice: "approve" }, TODAY).ok);
  assert.ok(parseDecision({ ...base, choice: "drop" }, TODAY).ok);
  assert.equal(parseDecision({ ...base, choice: "done" }, TODAY).ok, false);
  const task = { ...base, item_source: "task", item_key: "task:5eed0029-0003-4000-8000-000000000002" };
  assert.ok(parseDecision({ ...task, choice: "done" }, TODAY).ok);
  assert.equal(parseDecision({ ...task, choice: "approve" }, TODAY).ok, false);
  assert.equal(parseDecision({ ...task, item_key: "task:../../etc", choice: "done" }, TODAY).ok, false);
  assert.equal(parseDecision({ ...base, item_source: "tasks", choice: "approve" }, TODAY).ok, false);
  assert.equal(parseDecision({ ...base, item_key: "x y", choice: "approve" }, TODAY).ok, false);
});

test("not now and snooze default to +3 days and must be in the future", () => {
  const r = parseDecision({ ...base, choice: "not_now" }, TODAY);
  assert.ok(r.ok && r.value.until_date === addDays(TODAY, 3));
  assert.equal(parseDecision({ ...base, choice: "not_now", until_date: TODAY }, TODAY).ok, false);
  assert.equal(parseDecision({ ...base, choice: "not_now", until_date: "2027-12-31" }, TODAY).ok, false);
  const ok = parseDecision({ ...base, choice: "not_now", until_date: "2026-11-02" }, TODAY);
  assert.ok(ok.ok && ok.value.until_date === "2026-11-02");
  const approve = parseDecision({ ...base, choice: "approve", until_date: "2026-11-02" }, TODAY);
  assert.ok(approve.ok && approve.value.until_date === null);
});

test("a reply is required for reply, capped, and scrubbed before it is stored (synthetic values)", () => {
  assert.equal(parseDecision({ ...base, choice: "reply", reply: "  " }, TODAY).ok, false);
  const r = parseDecision(
    { ...base, choice: "reply", reply: "Yes, but ask jane.doe.test@gmail.com first, 904-555-0142, see https://example.com" },
    TODAY,
  );
  assert.ok(r.ok);
  assert.ok(r.ok && r.value.reply);
  assert.deepEqual(textLeaks(r.ok ? (r.value.reply ?? "") : ""), []);
  assert.match(r.ok ? (r.value.reply ?? "") : "", /^Yes, but ask first/);
  assert.equal(parseDecision({ ...base, choice: "reply", reply: "x".repeat(2001) }, TODAY).ok, false);
});

test("the stored title and bot are scrubbed too", () => {
  const r = parseDecision({ ...base, choice: "no", item_title: "Ping jane.doe.test@gmail.com", item_bot: "bc-1234 Coding" }, TODAY);
  assert.ok(r.ok);
  assert.deepEqual(textLeaks(r.ok ? `${r.value.item_title} ${r.value.item_bot}` : ""), []);
});

const d = (over: Partial<Decision>): Decision => ({
  id: "d",
  item_key: "k",
  item_source: "channel",
  item_title: "t",
  item_bot: "b",
  choice: "approve",
  reply: null,
  until_date: null,
  created_at: "2026-10-27T20:00:00Z",
  delivered_at: null,
  ...over,
});

test("what the latest decision does to a Waiting item", () => {
  assert.deepEqual(waitingState(undefined, TODAY), { hidden: false, answered: null });
  assert.equal(waitingState(d({ choice: "drop" }), TODAY).hidden, true);
  assert.equal(waitingState(d({ choice: "done", item_source: "task" }), TODAY).hidden, true);
  assert.equal(waitingState(d({ choice: "not_now", until_date: "2026-10-30" }), TODAY).hidden, true);
  // Back once the day comes, with no answered badge.
  assert.deepEqual(waitingState(d({ choice: "not_now", until_date: TODAY }), TODAY), { hidden: false, answered: null });
  const a = waitingState(d({ choice: "approve" }), TODAY);
  assert.equal(a.hidden, false);
  assert.equal(a.answered?.choice, "approve");
});

test("latest wins per item, and a drop is final whatever came after (R-163)", () => {
  const rows = [
    d({ id: "1", item_key: "a", choice: "not_now", until_date: "2026-10-28", created_at: "2026-10-27T10:00:00Z" }),
    d({ id: "2", item_key: "a", choice: "approve", created_at: "2026-10-27T11:00:00Z" }),
    d({ id: "3", item_key: "b", choice: "drop", created_at: "2026-10-27T09:00:00Z" }),
    d({ id: "4", item_key: "b", choice: "reply", reply: "x", created_at: "2026-10-27T12:00:00Z" }),
  ];
  assert.equal(latestByKey(rows).get("a")?.id, "2");
  assert.deepEqual([...droppedKeys(rows)], ["b"]);
});
