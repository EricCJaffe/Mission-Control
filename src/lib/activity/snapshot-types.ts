/** One row of the bot activity snapshot, as scripts/sync/activity-snapshot.ts writes it. */
export type SnapshotRow = {
  id: string;
  bot: string;
  kind: "waiting" | "in_progress" | "finished" | "event";
  title: string;
  tag: "due_today" | "yes_no" | "approve" | "reply" | "sign" | "action" | null;
  project: string | null;
  started_at: string | null;
  ended_at: string | null;
  due_at: string | null;
  pr_url: string | null;
  occurred_at: string;
};

export type ActivitySnapshot = {
  generated_at: string;
  /** True for the committed synthetic sample; the page shows a banner. */
  sample: boolean;
  items: SnapshotRow[];
};
