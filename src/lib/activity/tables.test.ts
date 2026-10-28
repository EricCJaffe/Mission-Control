import { test } from "node:test";
import assert from "node:assert/strict";
import { pickSource, toSnapshotRow, type ItemRow } from "./tables.ts";

const row: ItemRow = {
  id: "r1",
  bot: "Coding",
  kind: "finished",
  title: "Merged the thing",
  tag: null,
  project: "mission-control",
  started_at: "2026-10-27T20:00:00Z",
  ended_at: "2026-10-27T21:00:00Z",
  due_at: null,
  pr_url: "https://github.com/EricCJaffe/Mission-Control/pull/72",
  occurred_at: "2026-10-27T21:00:00Z",
};

test("the tables win once an ok run has left rows; otherwise fall back", () => {
  assert.deepEqual(pickSource({ finished_at: "2026-10-27T23:00:00Z", started_at: "2026-10-27T22:59:00Z" }, 5), {
    asOf: "2026-10-27T23:00:00Z",
  });
  assert.deepEqual(pickSource({ finished_at: null, started_at: "2026-10-27T22:59:00Z" }, 1), {
    asOf: "2026-10-27T22:59:00Z",
  });
  assert.equal(pickSource(null, 5), null); // never synced
  assert.equal(pickSource({ finished_at: "x", started_at: "x" }, 0), null); // synced, nothing there yet
});

test("a table row maps to the page shape unchanged", () => {
  assert.deepEqual(toSnapshotRow(row), { ...row, kind: "finished", tag: null, key: "r1" });
});

test("only a GitHub pull request survives as a link", () => {
  assert.equal(toSnapshotRow({ ...row, pr_url: "https://evil.example/pull/1" })?.pr_url, null);
  assert.equal(toSnapshotRow({ ...row, pr_url: "https://github.com/a/b/issues/1" })?.pr_url, null);
});

test("an unknown kind or tag is dropped, not rendered", () => {
  assert.equal(toSnapshotRow({ ...row, kind: "secret" }), null);
  assert.equal(toSnapshotRow({ ...row, kind: "waiting", tag: "urgent" }), null);
  assert.ok(toSnapshotRow({ ...row, kind: "waiting", tag: "reply" }));
});
