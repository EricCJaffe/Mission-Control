"use client";

import { useState } from "react";
import { AlertTriangle, Clock, MessageSquare } from "lucide-react";
import type { DecisionCardRow, Urgency } from "@/lib/decisions/answer";

/*
 * Mobile first: one card per decision, the recommended option as the blue
 * primary button, every other option one tap beside it, and "In my own words"
 * for anything else. A tap posts at once; the card moves to "Answered" and
 * shows whether the bots have it yet (delivered by the box script within five
 * minutes).
 */

const EDGE: Record<Urgency, string> = {
  red: "border-l-red-500",
  yellow: "border-l-yellow-400",
  green: "border-l-green-500",
};
const DOT: Record<Urgency, string> = { red: "bg-red-500", yellow: "bg-yellow-400", green: "bg-green-500" };
const WORD: Record<Urgency, string> = { red: "Red", yellow: "Yellow", green: "Green" };

const fmt = (iso: string) =>
  new Date(iso).toLocaleString("en-US", { timeZone: "America/New_York", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });

function choiceLabel(r: DecisionCardRow): string {
  if (r.answer === "other") return "In his own words";
  return r.options.find((o) => o.id === r.answer)?.label ?? r.answer ?? "";
}

export default function DecisionsInbox({ open, answered }: { open: DecisionCardRow[]; answered: DecisionCardRow[] }) {
  const [rows, setRows] = useState(open);
  const [done, setDone] = useState(answered);

  const onAnswered = (r: DecisionCardRow) => {
    setRows((xs) => xs.filter((x) => x.id !== r.id));
    setDone((xs) => [r, ...xs]);
  };

  return (
    <div className="space-y-6">
      <section className="space-y-3" aria-label="Waiting on you">
        {rows.map((r) => (
          <DecisionCard key={r.id} row={r} onAnswered={onAnswered} />
        ))}
      </section>

      {done.length > 0 && (
        <section className="space-y-2" aria-label="Answered">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Answered</h2>
          <ul className="divide-y divide-slate-200 rounded-2xl border-2 border-slate-300 bg-white">
            {done.map((r) => (
              <li key={r.id} className="space-y-0.5 px-4 py-3 text-sm">
                <p className="font-medium text-slate-900">{r.title}</p>
                <p className="text-slate-600">
                  <span className="font-medium text-slate-800">{choiceLabel(r)}</span>
                  {r.answer_text ? ` · “${r.answer_text}”` : ""}
                </p>
                <p className="text-xs text-slate-500">
                  {r.answered_at ? fmt(r.answered_at) : ""} ·{" "}
                  {r.delivered_at
                    ? "the bots have it"
                    : r.delivery_error?.startsWith("held")
                      ? "held: the brain push needs a merge"
                      : r.delivery_error
                        ? "not delivered yet, retrying"
                        : "sending to Chief of Staff"}
                </p>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

function DecisionCard({ row, onAnswered }: { row: DecisionCardRow; onAnswered: (r: DecisionCardRow) => void }) {
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [writing, setWriting] = useState(false);
  const [text, setText] = useState("");

  const submit = async (answer: string) => {
    setBusy(answer);
    setError(null);
    try {
      const res = await fetch(`/api/decisions/${row.id}/answer`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ answer, text: answer === "other" || text.trim() ? text : undefined }),
      });
      const json = (await res.json().catch(() => ({}))) as { error?: string; answered_at?: string; answer_text?: string | null };
      if (!res.ok) throw new Error(json.error ?? "Could not send");
      onAnswered({
        ...row,
        status: "answered",
        answer,
        // What the server stored (scrubbed), not what was typed.
        answer_text: json.answer_text ?? null,
        answered_at: json.answered_at ?? new Date().toISOString(),
        delivered_at: null,
        delivery_error: null,
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not send");
      setBusy(null);
    }
  };

  const ordered = row.default_option
    ? [...row.options].sort((a, b) => (a.id === row.default_option ? -1 : b.id === row.default_option ? 1 : 0))
    : row.options;

  return (
    <article className={`space-y-3 rounded-2xl border-2 border-l-8 border-slate-300 bg-white p-4 shadow-sm ${EDGE[row.urgency]}`}>
      <div className="flex flex-wrap items-center gap-2 text-xs text-slate-600">
        <span className="inline-flex items-center gap-1 font-medium">
          <span className={`h-2.5 w-2.5 rounded-full ${DOT[row.urgency]}`} aria-hidden />
          {WORD[row.urgency]}
        </span>
        {row.kind === "stalled" && (
          <span className="inline-flex items-center gap-1">
            <AlertTriangle size={12} aria-hidden /> Stalled job
          </span>
        )}
        {row.for_agent && <span>· {row.for_agent}</span>}
        {row.deadline && (
          <span className="inline-flex items-center gap-1">
            <Clock size={12} aria-hidden /> by {fmt(row.deadline)}
          </span>
        )}
        {row.status === "stale" && <span>· waiting a while</span>}
      </div>

      <h2 className="text-base font-semibold leading-snug text-slate-900">{row.title}</h2>
      {row.context && <p className="text-sm text-slate-700">{row.context}</p>}

      <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
        {ordered.map((o) => {
          const primary = o.id === row.default_option;
          return (
            <button
              key={o.id}
              type="button"
              disabled={busy !== null}
              onClick={() => submit(o.id)}
              className={`min-h-11 rounded-xl px-4 py-2 text-left text-sm font-medium disabled:opacity-50 ${
                primary ? "bg-blue-600 text-white hover:bg-blue-700" : "border-2 border-slate-300 bg-white text-slate-800 hover:bg-slate-50"
              }`}
            >
              {busy === o.id ? "Sending…" : o.label}
              {primary && <span className="ml-1 text-xs font-normal opacity-80">(recommended)</span>}
              {o.detail && <span className={`block text-xs font-normal ${primary ? "text-blue-100" : "text-slate-500"}`}>{o.detail}</span>}
            </button>
          );
        })}
      </div>

      {writing ? (
        <div className="space-y-2">
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            maxLength={1000}
            rows={3}
            placeholder="Your answer, in your own words"
            className="w-full rounded-xl border-2 border-slate-300 p-3 text-sm"
          />
          <button
            type="button"
            disabled={busy !== null || !text.trim()}
            onClick={() => submit("other")}
            className="min-h-11 rounded-xl bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {busy === "other" ? "Sending…" : "Send"}
          </button>
          <p className="text-xs text-slate-500">Text typed here also rides along with any option you tap.</p>
        </div>
      ) : (
        <button type="button" onClick={() => setWriting(true)} className="inline-flex min-h-11 items-center gap-1 text-sm text-blue-700">
          <MessageSquare size={14} aria-hidden /> In my own words
        </button>
      )}

      {error && <p className="text-sm text-red-700">{error}</p>}
    </article>
  );
}
