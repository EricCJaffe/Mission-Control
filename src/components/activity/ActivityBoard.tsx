"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ExternalLink } from "lucide-react";
import { ageLabel, botInitials, botTone, etDayOf, etTime, startLabel, TAGS } from "@/lib/activity/format";

export type { SnapshotRow as ActivityRow } from "@/lib/activity/snapshot-types";
import type { SnapshotRow as ActivityRow } from "@/lib/activity/snapshot-types";

type Props = {
  waiting: ActivityRow[];
  inProgress: ActivityRow[];
  finished: ActivityRow[];
  finishedTotal: number;
  events: ActivityRow[];
  today: string;
};

type Pane = "waiting" | "timeline" | "work";

const REFRESH_MS = 60_000;
const PAGE = 100;

/*
 * The three columns of /activity, and the phone layout of the same.
 *
 * Under md the columns stack into one, behind a sticky Waiting / Timeline /
 * Work switch (Waiting first: it is the only one that needs Eric). From md up
 * all three show side by side and the switch is hidden.
 *
 * Refreshes itself every minute while the tab is visible. The harvester runs
 * every five, so a minute is fresh enough and costs one server render.
 */
export default function ActivityBoard({ waiting, inProgress, finished, finishedTotal, events, today }: Props) {
  const router = useRouter();
  const [pane, setPane] = useState<Pane>("waiting");

  useEffect(() => {
    const tick = () => {
      if (document.visibilityState === "visible") router.refresh();
    };
    const id = window.setInterval(tick, REFRESH_MS);
    document.addEventListener("visibilitychange", tick);
    return () => {
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", tick);
    };
  }, [router]);

  const panes: Array<{ key: Pane; label: string; count: number }> = [
    { key: "waiting", label: "Waiting", count: waiting.length },
    { key: "timeline", label: "Timeline", count: events.length },
    { key: "work", label: "Work", count: inProgress.length },
  ];

  return (
    <>
      <nav
        aria-label="Sections"
        className="sticky top-[68px] z-20 -mx-4 mb-3 border-b border-slate-200 bg-white/95 px-4 py-2 backdrop-blur md:hidden"
      >
        <div className="grid grid-cols-3 gap-1 rounded-full bg-slate-100 p-1" role="tablist">
          {panes.map((p) => (
            <button
              key={p.key}
              type="button"
              role="tab"
              aria-selected={pane === p.key}
              onClick={() => setPane(p.key)}
              className={`min-h-[44px] rounded-full px-2 text-sm font-medium transition-colors ${
                pane === p.key ? "bg-white text-slate-900 shadow-sm" : "text-slate-600"
              }`}
            >
              {p.label}
              {p.key !== "timeline" && <span className="ml-1 tabular-nums text-slate-400">{p.count}</span>}
            </button>
          ))}
        </div>
      </nav>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        <section className={`${pane === "waiting" ? "block" : "hidden"} md:block`}>
          <WaitingColumn rows={waiting} />
        </section>
        <section className={`${pane === "timeline" ? "block" : "hidden"} md:block`}>
          <TimelineColumn rows={events} today={today} />
        </section>
        <section className={`${pane === "work" ? "block" : "hidden"} md:block md:col-span-2 xl:col-span-1`}>
          <WorkColumn inProgress={inProgress} finished={finished} finishedTotal={finishedTotal} />
        </section>
      </div>
    </>
  );
}

function Card({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`min-w-0 rounded-2xl border-2 border-slate-300 bg-white p-4 shadow-sm md:p-5 ${className}`}>
      {children}
    </div>
  );
}

function Avatar({ bot }: { bot: string }) {
  return (
    <span
      aria-hidden
      className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold text-white ${botTone(bot)}`}
    >
      {botInitials(bot)}
    </span>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <p className="py-6 text-center text-sm text-slate-500">{children}</p>;
}

function WaitingColumn({ rows }: { rows: ActivityRow[] }) {
  return (
    <Card>
      <h2 className="text-base font-semibold text-slate-800">
        Waiting on me <span className="font-normal text-slate-400">({rows.length})</span>
      </h2>
      {rows.length === 0 ? (
        <Empty>Nothing waits on you.</Empty>
      ) : (
        <ul className="mt-3 space-y-2">
          {rows.map((row) => {
            const tag = row.tag ? TAGS[row.tag] : null;
            return (
              <li key={row.id} className="rounded-xl border border-slate-200 bg-slate-50/60 p-3">
                <div className="flex items-start gap-3">
                  <Avatar bot={row.bot} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="truncate text-sm font-semibold text-slate-800">{row.bot}</span>
                      <span className="shrink-0 text-xs tabular-nums text-slate-500">{ageLabel(row.occurred_at)}</span>
                    </div>
                    <p className="mt-0.5 break-words text-sm text-slate-700">{row.title}</p>
                    {tag && (
                      <span className={`mt-2 inline-block rounded-full px-2 py-0.5 text-xs font-medium ${tag.className}`}>
                        {tag.label}
                      </span>
                    )}
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}

function TimelineColumn({ rows, today }: { rows: ActivityRow[]; today: string }) {
  const [range, setRange] = useState<"all" | "today" | "yesterday">("all");
  const [bot, setBot] = useState("");
  const [shown, setShown] = useState(PAGE);

  const yesterday = useMemo(() => {
    const d = new Date(`${today}T12:00:00Z`);
    d.setUTCDate(d.getUTCDate() - 1);
    return d.toISOString().slice(0, 10);
  }, [today]);

  const bots = useMemo(() => [...new Set(rows.map((r) => r.bot))].sort(), [rows]);

  const filtered = useMemo(
    () =>
      rows.filter((r) => {
        const day = etDayOf(r.occurred_at);
        if (range === "today" && day !== today) return false;
        if (range === "yesterday" && day !== yesterday) return false;
        return !bot || r.bot === bot;
      }),
    [rows, range, bot, today, yesterday],
  );

  const groups = useMemo(() => {
    const out: Array<{ day: string; rows: ActivityRow[] }> = [];
    for (const row of filtered.slice(0, shown)) {
      const day = etDayOf(row.occurred_at);
      const last = out[out.length - 1];
      if (last && last.day === day) last.rows.push(row);
      else out.push({ day, rows: [row] });
    }
    return out;
  }, [filtered, shown]);

  return (
    <Card>
      <h2 className="text-base font-semibold text-slate-800">Timeline</h2>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <div className="flex rounded-full bg-slate-100 p-1">
          {(["all", "today", "yesterday"] as const).map((r) => (
            <button
              key={r}
              type="button"
              aria-pressed={range === r}
              onClick={() => {
                setRange(r);
                setShown(PAGE);
              }}
              className={`min-h-[44px] rounded-full px-3 text-sm capitalize md:min-h-[36px] ${
                range === r ? "bg-white font-medium text-slate-900 shadow-sm" : "text-slate-600"
              }`}
            >
              {r}
            </button>
          ))}
        </div>
        <label className="sr-only" htmlFor="activity-bot">
          Bot
        </label>
        <select
          id="activity-bot"
          value={bot}
          onChange={(e) => {
            setBot(e.target.value);
            setShown(PAGE);
          }}
          className="min-h-[44px] max-w-full rounded-xl border-2 border-slate-300 bg-white px-3 text-sm text-slate-700 md:min-h-[36px]"
        >
          <option value="">All bots</option>
          {bots.map((b) => (
            <option key={b} value={b}>
              {b}
            </option>
          ))}
        </select>
      </div>

      {groups.length === 0 ? (
        <Empty>Nothing in this range.</Empty>
      ) : (
        <div className="mt-3 space-y-4">
          {groups.map((g) => (
            <div key={g.day}>
              <h3 className="mb-1 text-xs font-semibold uppercase tracking-wider text-slate-500">
                {new Date(`${g.day}T12:00:00Z`).toLocaleDateString("en-US", {
                  timeZone: "UTC",
                  weekday: "short",
                  day: "numeric",
                  month: "short",
                })}
              </h3>
              <ul className="divide-y divide-slate-100">
                {g.rows.map((row) => (
                  <li key={row.id} className="flex items-start gap-3 py-2">
                    <span className="w-11 shrink-0 pt-1.5 text-xs tabular-nums text-slate-500">{etTime(row.occurred_at)}</span>
                    <Avatar bot={row.bot} />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold text-slate-800">{row.bot}</p>
                      <p className="break-words text-sm text-slate-600">{row.title}</p>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          ))}
          {filtered.length > shown && (
            <button
              type="button"
              onClick={() => setShown((n) => n + PAGE)}
              className="min-h-[44px] w-full rounded-xl border-2 border-slate-300 bg-white text-sm font-medium text-blue-700 hover:bg-slate-50"
            >
              Show more ({filtered.length - shown} left)
            </button>
          )}
        </div>
      )}
    </Card>
  );
}

function WorkColumn({
  inProgress,
  finished,
  finishedTotal,
}: {
  inProgress: ActivityRow[];
  finished: ActivityRow[];
  finishedTotal: number;
}) {
  const [tab, setTab] = useState<"progress" | "finished">("progress");
  const rows = tab === "progress" ? inProgress : finished;

  return (
    <Card>
      <div className="flex gap-4 border-b border-slate-200" role="tablist">
        {[
          { key: "progress" as const, label: "In progress", count: inProgress.length },
          { key: "finished" as const, label: "Finished", count: finishedTotal },
        ].map((t) => (
          <button
            key={t.key}
            type="button"
            role="tab"
            aria-selected={tab === t.key}
            onClick={() => setTab(t.key)}
            className={`-mb-px min-h-[44px] border-b-2 px-1 text-sm font-medium ${
              tab === t.key ? "border-blue-600 text-slate-900" : "border-transparent text-slate-500"
            }`}
          >
            {t.label} <span className="tabular-nums text-slate-400">{t.count}</span>
          </button>
        ))}
      </div>

      {rows.length === 0 ? (
        <Empty>{tab === "progress" ? "Nothing is running." : "Nothing finished this week."}</Empty>
      ) : (
        <ul className="mt-3 space-y-2">
          {rows.map((row) => (
            <li key={row.id} className="rounded-xl border border-slate-200 bg-slate-50/60 p-3">
              <div className="flex items-start gap-3">
                <Avatar bot={row.bot} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="truncate text-sm font-semibold text-slate-800">{row.bot}</span>
                    <span className="shrink-0 text-xs tabular-nums text-slate-500">
                      {tab === "progress" ? startLabel(row.started_at ?? row.occurred_at) : etTime(row.ended_at ?? row.occurred_at, true)}
                    </span>
                  </div>
                  <p className="mt-0.5 break-words text-sm text-slate-700">{row.title}</p>
                  {tab === "finished" && (
                    <p className="mt-1 flex flex-wrap items-center gap-x-3 text-xs text-slate-500">
                      {row.started_at && <span>Started {startLabel(row.started_at)}</span>}
                      {row.pr_url && (
                        <a
                          href={row.pr_url}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex min-h-[44px] items-center gap-1 font-medium text-blue-700 hover:underline md:min-h-0"
                        >
                          PR #{row.pr_url.split("/").pop()}
                          <ExternalLink className="h-3 w-3" />
                        </a>
                      )}
                    </p>
                  )}
                </div>
              </div>
            </li>
          ))}
          {tab === "finished" && finishedTotal > finished.length && (
            <li className="pt-1 text-center text-xs text-slate-500">
              Newest {finished.length} of {finishedTotal}.
            </li>
          )}
        </ul>
      )}
    </Card>
  );
}
