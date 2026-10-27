import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { sampleSnapshot } from "./sample-snapshot";
import type { ActivitySnapshot, SnapshotRow } from "./snapshot-types";

/*
 * The bot activity snapshot, read server-side for the signed-in /activity page.
 *
 * data/activity-snapshot.json is REAL data written on ubuntu-dev by
 * scripts/sync/activity-snapshot.ts. It is gitignored (the repo is public) and
 * never under public/, so the only way to see it is through this auth'd page.
 * When it is absent, as in every git-built deployment, the committed synthetic
 * sample is shown instead, flagged `sample: true` for the banner.
 *
 * v2 replaces this with mission.bot_activity_* tables fed by a 5-minute timer.
 */
export async function loadActivitySnapshot(): Promise<ActivitySnapshot> {
  try {
    const raw = await readFile(join(process.cwd(), "data", "activity-snapshot.json"), "utf8");
    const parsed = JSON.parse(raw) as Partial<ActivitySnapshot>;
    if (!Array.isArray(parsed.items) || typeof parsed.generated_at !== "string") throw new Error("bad snapshot");
    return { generated_at: parsed.generated_at, sample: false, items: parsed.items.filter(isRow) };
  } catch {
    return sampleSnapshot();
  }
}

const KINDS = new Set(["waiting", "in_progress", "finished", "event"]);
const TAGS = new Set(["due_today", "yes_no", "approve", "reply", "sign", "action"]);

function isRow(r: unknown): r is SnapshotRow {
  const row = r as SnapshotRow;
  return (
    !!row &&
    typeof row.id === "string" &&
    typeof row.bot === "string" &&
    typeof row.title === "string" &&
    typeof row.occurred_at === "string" &&
    KINDS.has(row.kind) &&
    (row.tag == null || TAGS.has(row.tag)) &&
    // Belt and braces: only a GitHub pull request is ever rendered as a link.
    (row.pr_url === null || /^https:\/\/github\.com\/[\w.-]+\/[\w.-]+\/pull\/\d+$/.test(row.pr_url))
  );
}
