import type { SupabaseClient } from "@supabase/supabase-js";
import { loadActivitySnapshot } from "./snapshot";
import type { ActivitySnapshot, SnapshotRow } from "./snapshot-types";
import { pickSource, toSnapshotRow, type ItemRow } from "./tables";

/*
 * Where /activity gets its rows (v2).
 *
 * mission.bot_activity_items, filled every 5 minutes on ubuntu-dev by
 * scripts/sync/activity.ts, is the source. "As of" is the newest ok run in
 * mission.bot_activity_runs. The v1 snapshot file, and after it the committed
 * synthetic sample (with its banner), are only a fallback: before the
 * migration is applied, while the tables are still empty (no ok run, or an ok
 * run that left no rows), or if the read fails. A fleet this busy never has an
 * empty week, so empty means "not synced yet", not "nothing happened".
 *
 * Read with the signed-in client: the tables are select-only under RLS, so
 * this page can see the rows and cannot change them.
 */

// Enough for a week of a busy fleet without shipping every row to a phone.
// PostgREST caps a response at 1,000 rows, so each kind is its own query.
export const EVENT_LIMIT = 1000;
export const FINISHED_LIMIT = 150;
const OPEN_LIMIT = 1000;

const COLUMNS = "id,source_key,bot,kind,title,tag,project,started_at,ended_at,due_at,pr_url,occurred_at";

export type LoadedActivity = ActivitySnapshot & { finishedTotal: number; from: "tables" | "snapshot" | "sample" };

export async function loadActivity(supabase: Pick<SupabaseClient, "from">): Promise<LoadedActivity> {
  try {
    const run = await supabase
      .from("bot_activity_runs")
      .select("finished_at,started_at")
      .eq("status", "ok")
      .order("started_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (run.error) throw run.error;

    const [waiting, progress, finished, events] = await Promise.all([
      supabase.from("bot_activity_items").select(COLUMNS).eq("kind", "waiting").order("occurred_at", { ascending: true }).limit(OPEN_LIMIT),
      supabase.from("bot_activity_items").select(COLUMNS).eq("kind", "in_progress").order("occurred_at", { ascending: false }).limit(OPEN_LIMIT),
      supabase
        .from("bot_activity_items")
        .select(COLUMNS, { count: "exact" })
        .eq("kind", "finished")
        .order("occurred_at", { ascending: false })
        .limit(FINISHED_LIMIT),
      supabase.from("bot_activity_items").select(COLUMNS).eq("kind", "event").order("occurred_at", { ascending: false }).limit(EVENT_LIMIT),
    ]);
    for (const r of [waiting, progress, finished, events]) if (r.error) throw r.error;

    const rows = [waiting, progress, finished, events].flatMap((r) => (r.data ?? []) as ItemRow[]);
    const choice = pickSource(run.data as { finished_at: string | null; started_at: string } | null, rows.length);
    if (choice) {
      return {
        generated_at: choice.asOf,
        sample: false,
        from: "tables",
        items: rows.map(toSnapshotRow).filter((r): r is SnapshotRow => r !== null),
        finishedTotal: finished.count ?? (finished.data ?? []).length,
      };
    }
  } catch {
    // Not migrated yet, or the read failed: fall through to the snapshot.
  }
  const snap = await loadActivitySnapshot();
  return {
    ...snap,
    from: snap.sample ? "sample" : "snapshot",
    finishedTotal: snap.items.filter((i) => i.kind === "finished").length,
  };
}
