import type { SnapshotRow } from "./snapshot-types";

/** A mission.bot_activity_items row as /activity selects it. */
export type ItemRow = {
  id: string;
  bot: string;
  kind: string;
  title: string;
  tag: string | null;
  project: string | null;
  started_at: string | null;
  ended_at: string | null;
  due_at: string | null;
  pr_url: string | null;
  occurred_at: string;
  source_key?: string;
};

const KINDS = new Set(["waiting", "in_progress", "finished", "event"]);
const TAGS = new Set(["due_today", "yes_no", "approve", "reply", "sign", "action"]);
const PR = /^https:\/\/github\.com\/[\w.-]+\/[\w.-]+\/pull\/\d+$/;

/**
 * Use the tables when the harvester has completed an ok run and left rows.
 * No ok run yet, or no rows at all: null, and the page falls back. "As of"
 * is when that run finished (or started, if it never recorded a finish).
 */
export function pickSource(
  lastOkRun: { finished_at: string | null; started_at: string } | null,
  rowCount: number,
): { asOf: string } | null {
  if (!lastOkRun || rowCount === 0) return null;
  return { asOf: lastOkRun.finished_at ?? lastOkRun.started_at };
}

/**
 * A table row in the page's shape. The database already constrains kind, tag
 * and pr_url; this re-checks, so a row that somehow slipped through is dropped
 * rather than rendered, and only a GitHub pull request is ever a link.
 */
export function toSnapshotRow(r: ItemRow): SnapshotRow | null {
  if (!KINDS.has(r.kind) || (r.tag !== null && !TAGS.has(r.tag))) return null;
  return {
    id: r.id,
    bot: r.bot,
    kind: r.kind as SnapshotRow["kind"],
    title: r.title,
    tag: r.tag as SnapshotRow["tag"],
    project: r.project,
    started_at: r.started_at,
    ended_at: r.ended_at,
    due_at: r.due_at,
    pr_url: r.pr_url && PR.test(r.pr_url) ? r.pr_url : null,
    occurred_at: r.occurred_at,
    key: r.source_key ?? r.id,
  };
}
