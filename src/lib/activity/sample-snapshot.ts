/*
 * SYNTHETIC sample data for /activity. Nothing here is real: invented asks,
 * invented PR numbers, no client names. The repo is public, so this is what a
 * git-built preview shows when data/activity-snapshot.json (the real, gitignored
 * snapshot) is absent, under a "Sample data" banner.
 *
 * Built relative to `now` so the page always looks like the last two days.
 */

import type { ActivitySnapshot, SnapshotRow } from "./snapshot-types";

export function sampleSnapshot(now: Date = new Date()): ActivitySnapshot {
  const at = (hoursAgo: number) => new Date(now.getTime() - hoursAgo * 3_600_000).toISOString();
  let n = 0;
  const row = (r: Omit<SnapshotRow, "id" | "project" | "started_at" | "ended_at" | "due_at" | "pr_url" | "tag"> & Partial<SnapshotRow>): SnapshotRow => ({
    id: `sample-${++n}`,
    project: null,
    started_at: null,
    ended_at: null,
    due_at: null,
    pr_url: null,
    tag: null,
    ...r,
  });

  const items: SnapshotRow[] = [
    row({ kind: "waiting", bot: "Chief of Staff", title: "Approve the sample release to production after CI is green", tag: "approve", occurred_at: at(5) }),
    row({ kind: "waiting", bot: "Coding", title: "Pick one: keep the weekly digest on Fridays, or move it to Monday mornings?", tag: "yes_no", occurred_at: at(20) }),
    row({ kind: "waiting", bot: "Inbox", title: "Example Client: reply to the scheduling question from last week", tag: "reply", occurred_at: at(30) }),
    row({ kind: "waiting", bot: "Service desk", title: "Sign the sample vendor agreement", tag: "sign", occurred_at: at(44) }),
    row({ kind: "waiting", bot: "Tasks", title: "Review the sample quarterly plan", tag: "due_today", occurred_at: at(50) }),
    row({ kind: "waiting", bot: "Honey Lake session", title: "Honey Lake: item waiting", tag: "action", occurred_at: at(60) }),

    row({ kind: "in_progress", bot: "Mission Control session", title: "Build the bot activity page (sample)", started_at: at(1), occurred_at: at(1) }),
    row({ kind: "in_progress", bot: "Chief of Staff", title: "Daily fleet wrap-up routine", started_at: at(23), occurred_at: at(23) }),
    row({ kind: "in_progress", bot: "Honey Lake session", title: "Honey Lake session: running", started_at: at(9), occurred_at: at(9) }),

    row({ kind: "finished", bot: "Sample App session", title: "Fix the sample settings page spacing", started_at: at(8), ended_at: at(6), pr_url: "https://github.com/example/sample-app/pull/12", occurred_at: at(6) }),
    row({ kind: "finished", bot: "Coding", title: "Add a test for the sample date parser", started_at: at(28), ended_at: at(26), occurred_at: at(26) }),
    row({ kind: "finished", bot: "Harness session", title: "Teach the sample job runner a new limit message", started_at: at(33), ended_at: at(31), pr_url: "https://github.com/example/harness/pull/7", occurred_at: at(31) }),

    row({ kind: "event", bot: "Chief of Staff", title: "Handed to Mission Control session: Build the bot activity page (sample)", occurred_at: at(1.2) }),
    row({ kind: "event", bot: "Dispatch", title: "Started Build the bot activity page (Mission Control session)", occurred_at: at(1) }),
    row({ kind: "event", bot: "Verify", title: "Ran 40 times", occurred_at: at(2) }),
    row({ kind: "event", bot: "Sample App session", title: "Reported done: Fix the sample settings page spacing", occurred_at: at(6) }),
    row({ kind: "event", bot: "Green keeper", title: "Ran 96 times, 1 failed", occurred_at: at(7) }),
    row({ kind: "event", bot: "Coding", title: "Asked Eric: keep the weekly digest on Fridays?", occurred_at: at(20) }),
    row({ kind: "event", bot: "Chief of Staff", title: "Closed a loop for Example Client: answered and filed", occurred_at: at(25) }),
    row({ kind: "event", bot: "Harness session", title: "Reported done: Teach the sample job runner a new limit message", occurred_at: at(31) }),
    row({ kind: "event", bot: "Service desk", title: "Ran 64 times", occurred_at: at(36) }),
  ];

  return { generated_at: now.toISOString(), sample: true, items };
}
