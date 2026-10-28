"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ageLabel, botInitials, botTone, splitByAge, TAGS, WAITING_RECENT_DAYS } from "@/lib/activity/format";
import { addDays, CHOICE_LABEL, NOT_NOW_DAYS, REPLY_MAX, type Choice } from "@/lib/activity/decisions";
import type { SnapshotRow as ActivityRow } from "@/lib/activity/snapshot-types";

export type Answered = Record<string, { choice: Choice; at: string; delivered: boolean }>;
export type AuditRow = {
  id: string;
  bot: string;
  title: string;
  choice: Choice;
  reply: string | null;
  until_date: string | null;
  created_at: string;
  delivered: boolean;
};

type Props = {
  botWaiting: ActivityRow[];
  todos: ActivityRow[];
  answered: Answered;
  audit: AuditRow[];
  interactive: boolean;
  today: string;
};

/*
 * Waiting on Eric, v3: two groups he can act on, then his audit log.
 *
 *   Bots waiting on you   Approve / No / Not now / Drop, or a short reply.
 *                         The primary button follows the item's tag: Yes for
 *                         a yes/no ask, Approve for a merge or go-live.
 *   Your to-dos           Mission Control tasks due: Done / Snooze / Drop.
 *
 * A tap posts to /api/activity/decide and refreshes. A bot answer then shows
 * "answered, waiting for bot" until the bot replies and the item moves on.
 * Buttons are 44px tall for a thumb, and nothing scrolls sideways at 375px.
 */
export default function WaitingPanel({ botWaiting, todos, answered, audit, interactive, today }: Props) {
  return (
    <div className="space-y-4">
      <Group
        title="Bots waiting on you"
        empty="No bot is waiting on you."
        rows={botWaiting}
        kind="bot"
        answered={answered}
        interactive={interactive}
        today={today}
      />
      <Group
        title="Your to-dos"
        empty="Nothing of yours is due."
        rows={todos}
        kind="task"
        answered={answered}
        interactive
        today={today}
      />
      <AuditLog rows={audit} />
    </div>
  );
}

function Card({ children }: { children: React.ReactNode }) {
  return <div className="min-w-0 rounded-2xl border-2 border-slate-300 bg-white p-4 shadow-sm md:p-5">{children}</div>;
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

function Group({
  title,
  empty,
  rows,
  kind,
  answered,
  interactive,
  today,
}: {
  title: string;
  empty: string;
  rows: ActivityRow[];
  kind: "bot" | "task";
  answered: Answered;
  interactive: boolean;
  today: string;
}) {
  const [showOlder, setShowOlder] = useState(false);
  const { recent, older } = useMemo(() => {
    const split = splitByAge(rows.filter((r) => r.tag !== "due_today"));
    return { recent: [...rows.filter((r) => r.tag === "due_today"), ...split.recent], older: split.older };
  }, [rows]);

  const item = (row: ActivityRow) => (
    <WaitingItem
      key={row.id}
      row={row}
      kind={kind}
      answered={answered[row.key ?? row.id]}
      interactive={interactive && actionable(row)}
      today={today}
    />
  );

  return (
    <Card>
      <h2 className="text-base font-semibold text-slate-800">
        {title} <span className="font-normal text-slate-400">({recent.length})</span>
      </h2>
      {recent.length === 0 && older.length === 0 ? (
        <p className="py-6 text-center text-sm text-slate-500">{empty}</p>
      ) : (
        <>
          {recent.length === 0 ? (
            <p className="py-6 text-center text-sm text-slate-500">Nothing new in the last {WAITING_RECENT_DAYS} days.</p>
          ) : (
            <ul className="mt-3 space-y-2">{recent.map(item)}</ul>
          )}
          {older.length > 0 && (
            <>
              <button
                type="button"
                aria-expanded={showOlder}
                onClick={() => setShowOlder((v) => !v)}
                className="mt-3 min-h-[44px] w-full rounded-xl border-2 border-slate-300 bg-white text-sm font-medium text-blue-700 hover:bg-slate-50"
              >
                {showOlder ? "Hide older" : `Show older (${older.length})`}
              </button>
              {showOlder && <ul className="mt-2 space-y-2">{older.map(item)}</ul>}
            </>
          )}
        </>
      )}
    </Card>
  );
}

/** Rows a tap can act on: harvested channel and loop items, and tasks. Not the collapsed Honey Lake line. */
function actionable(row: ActivityRow): boolean {
  const key = row.key ?? "";
  return key.startsWith("channel:") || key.startsWith("loops:") || key.startsWith("task:");
}

function sourceOf(key: string): "channel" | "loops" | "task" {
  return key.startsWith("task:") ? "task" : key.startsWith("loops:") ? "loops" : "channel";
}

function WaitingItem({
  row,
  kind,
  answered,
  interactive,
  today,
}: {
  row: ActivityRow;
  kind: "bot" | "task";
  answered?: Answered[string];
  interactive: boolean;
  today: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<Choice | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<"none" | "reply" | "date">("none");
  const [pending, setPending] = useState<Choice | null>(null);
  const [text, setText] = useState("");
  const [until, setUntil] = useState(addDays(today, NOT_NOW_DAYS));
  const tag = row.tag ? TAGS[row.tag] : null;

  async function send(choice: Choice, extra: { reply?: string; until_date?: string } = {}) {
    setBusy(choice);
    setError(null);
    try {
      const res = await fetch("/api/activity/decide", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          item_key: row.key ?? row.id,
          item_source: sourceOf(row.key ?? row.id),
          item_title: row.title,
          item_bot: row.bot,
          choice,
          ...extra,
        }),
      });
      if (!res.ok) {
        const j = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(j.error ?? "Could not save");
      }
      setMode("none");
      setText("");
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save");
    } finally {
      setBusy(null);
    }
  }

  const primary: Choice = "approve";
  const primaryLabel = row.tag === "yes_no" ? "Yes" : "Approve";
  const btn = "min-h-[44px] rounded-xl px-3 text-sm font-medium disabled:opacity-50";

  return (
    <li className="rounded-xl border border-slate-200 bg-slate-50/60 p-3">
      <div className="flex items-start gap-3">
        <Avatar bot={row.bot} />
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline justify-between gap-2">
            <span className="truncate text-sm font-semibold text-slate-800">{row.bot}</span>
            <span className="shrink-0 text-xs tabular-nums text-slate-500">{ageLabel(row.occurred_at)}</span>
          </div>
          <p className="mt-0.5 break-words text-sm text-slate-700">{row.title}</p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            {tag && <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${tag.className}`}>{tag.label}</span>}
            {answered && (
              <span className="inline-block rounded-full bg-sky-100 px-2 py-0.5 text-xs font-medium text-sky-800">
                {CHOICE_LABEL[answered.choice]}: answered, {answered.delivered ? "waiting for bot" : "sending to bot"}
              </span>
            )}
          </div>

          {interactive && !answered && (
            <>
              <div className="mt-3 grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
                {kind === "bot" ? (
                  <>
                    <button type="button" disabled={!!busy} onClick={() => send(primary)} className={`${btn} bg-blue-600 text-white hover:bg-blue-700`}>
                      {busy === primary ? "Saving…" : primaryLabel}
                    </button>
                    <button type="button" disabled={!!busy} onClick={() => send("no")} className={`${btn} border-2 border-slate-300 bg-white text-slate-800`}>
                      {busy === "no" ? "Saving…" : "No"}
                    </button>
                    <button type="button" disabled={!!busy} onClick={() => { setPending("not_now"); setMode(mode === "date" ? "none" : "date"); }} className={`${btn} border-2 border-slate-300 bg-white text-slate-800`}>
                      Not now
                    </button>
                    <button type="button" disabled={!!busy} onClick={() => setMode(mode === "reply" ? "none" : "reply")} className={`${btn} border-2 border-slate-300 bg-white text-slate-800`}>
                      Reply
                    </button>
                  </>
                ) : (
                  <>
                    <button type="button" disabled={!!busy} onClick={() => send("done")} className={`${btn} bg-blue-600 text-white hover:bg-blue-700`}>
                      {busy === "done" ? "Saving…" : "Done"}
                    </button>
                    <button type="button" disabled={!!busy} onClick={() => { setPending("snooze"); setMode(mode === "date" ? "none" : "date"); }} className={`${btn} border-2 border-slate-300 bg-white text-slate-800`}>
                      Snooze
                    </button>
                  </>
                )}
                <button type="button" disabled={!!busy} onClick={() => send("drop")} className={`${btn} border-2 border-red-200 bg-white text-red-700`}>
                  {busy === "drop" ? "Saving…" : "Drop"}
                </button>
              </div>

              {mode === "date" && pending && (
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <label className="text-sm text-slate-600" htmlFor={`until-${row.id}`}>
                    Until
                  </label>
                  <input
                    id={`until-${row.id}`}
                    type="date"
                    min={addDays(today, 1)}
                    value={until}
                    onChange={(e) => setUntil(e.target.value)}
                    className="min-h-[44px] rounded-xl border-2 border-slate-300 bg-white px-2 text-sm"
                  />
                  <button type="button" disabled={!!busy || !until} onClick={() => send(pending, { until_date: until })} className={`${btn} bg-blue-600 text-white`}>
                    {busy ? "Saving…" : CHOICE_LABEL[pending]}
                  </button>
                </div>
              )}

              {mode === "reply" && (
                <div className="mt-2 space-y-2">
                  <textarea
                    value={text}
                    maxLength={REPLY_MAX}
                    onChange={(e) => setText(e.target.value)}
                    rows={3}
                    placeholder="Your answer, in your words"
                    className="w-full rounded-xl border-2 border-slate-300 bg-white p-2 text-sm"
                  />
                  <button type="button" disabled={!!busy || !text.trim()} onClick={() => send("reply", { reply: text })} className={`${btn} w-full bg-blue-600 text-white sm:w-auto`}>
                    {busy === "reply" ? "Sending…" : "Send reply"}
                  </button>
                </div>
              )}
              {error && <p className="mt-2 text-sm text-red-700">{error}</p>}
            </>
          )}
        </div>
      </div>
    </li>
  );
}

function AuditLog({ rows }: { rows: AuditRow[] }) {
  const [shown, setShown] = useState(10);
  return (
    <Card>
      <h2 className="text-base font-semibold text-slate-800">
        Your decisions <span className="font-normal text-slate-400">({rows.length})</span>
      </h2>
      {rows.length === 0 ? (
        <p className="py-6 text-center text-sm text-slate-500">No decisions yet. Your taps above land here.</p>
      ) : (
        <>
          <ul className="mt-3 divide-y divide-slate-200">
            {rows.slice(0, shown).map((r) => (
              <li key={r.id} className="py-2">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="text-sm font-semibold text-slate-800">
                    {CHOICE_LABEL[r.choice]}
                    {r.until_date && <span className="font-normal text-slate-500"> until {r.until_date}</span>}
                  </span>
                  <span className="shrink-0 text-xs tabular-nums text-slate-500">{ageLabel(r.created_at)}</span>
                </div>
                <p className="break-words text-sm text-slate-600">
                  {r.bot}: {r.title}
                </p>
                {r.reply && <p className="mt-1 break-words border-l-2 border-slate-300 pl-2 text-sm italic text-slate-700">{r.reply}</p>}
                <p className="text-xs text-slate-500">{r.delivered ? "Delivered" : "Sending to bot (next 5-minute sync)"}</p>
              </li>
            ))}
          </ul>
          {rows.length > shown && (
            <button
              type="button"
              onClick={() => setShown((n) => n + 20)}
              className="mt-2 min-h-[44px] w-full rounded-xl border-2 border-slate-300 bg-white text-sm font-medium text-blue-700"
            >
              Show more ({rows.length - shown} left)
            </button>
          )}
        </>
      )}
    </Card>
  );
}
