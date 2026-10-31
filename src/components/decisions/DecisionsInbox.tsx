"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, CheckCircle2, Clock, GitPullRequest, ListChecks, MessageSquare, MessageSquarePlus, User, Vote } from "lucide-react";
import type { DecisionCardRow, Urgency } from "@/lib/decisions/answer";

/*
 * Mobile first, and colorful on purpose (Eric's preference): a summary banner
 * with red / yellow / green counts, then Decisions, then Stalled jobs (owner
 * and next step on each), then what was answered in the last day. Each card:
 * the recommended option as the blue primary button, every other option one
 * tap beside it, "In my own words", and "Ask Chief of Staff" for a question
 * that should not close the item. Cards carry id="d-<id>" so an email can
 * deep-link to one; the linked card is ringed.
 */

const EDGE: Record<Urgency, string> = {
  red: "border-l-red-500",
  yellow: "border-l-yellow-400",
  green: "border-l-green-500",
};
const CHIP: Record<Urgency, string> = {
  red: "bg-red-100 text-red-800 ring-red-200",
  yellow: "bg-yellow-100 text-yellow-900 ring-yellow-200",
  green: "bg-green-100 text-green-800 ring-green-200",
};
const DOT: Record<Urgency, string> = { red: "bg-red-500", yellow: "bg-yellow-400", green: "bg-green-500" };
const WORD: Record<Urgency, string> = { red: "Red", yellow: "Yellow", green: "Green" };

const fmt = (iso: string) =>
  new Date(iso).toLocaleString("en-US", { timeZone: "America/New_York", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });

function choiceLabel(r: DecisionCardRow): string {
  if (r.answer === "other") return "In his own words";
  return r.options.find((o) => o.id === r.answer)?.label ?? r.answer ?? "";
}

const LOOP_GROUP_ORDER = ["Drafts to send", "Eden", "HL scope", "HL vendor/hardware", "Records", "Misc"];
const GROUP_CHIP: Record<string, string> = {
  "Drafts to send": "bg-blue-100 text-blue-900",
  Eden: "bg-emerald-100 text-emerald-900",
  "HL scope": "bg-teal-100 text-teal-900",
  "HL vendor/hardware": "bg-cyan-100 text-cyan-900",
  Records: "bg-fuchsia-100 text-fuchsia-900",
  Misc: "bg-slate-200 text-slate-800",
};

type Props = { open: DecisionCardRow[]; answered: DecisionCardRow[]; unavailable?: boolean };

export default function DecisionsInbox({ open, answered, unavailable = false }: Props) {
  const router = useRouter();
  const [rows, setRows] = useState(open);
  const [done, setDone] = useState(answered);

  const onAnswered = (r: DecisionCardRow) => {
    setRows((xs) => xs.filter((x) => x.id !== r.id));
    setDone((xs) => [r, ...xs]);
    router.refresh();
  };

  const decisions = rows.filter((r) => r.kind === "decision");
  const stalled = rows.filter((r) => r.kind === "stalled");
  const loops = rows.filter((r) => r.kind === "loop");
  const loopGroups = LOOP_GROUP_ORDER.map((g) => ({ g, items: loops.filter((r) => (r.group_name ?? "Misc") === g) })).filter((x) => x.items.length > 0);
  const count = (u: Urgency) => rows.filter((r) => r.urgency === u).length;

  return (
    <div className="space-y-6">
      <header className="rounded-3xl bg-gradient-to-br from-blue-600 via-indigo-600 to-violet-600 p-5 text-white shadow-md">
        <div className="flex items-center gap-2">
          <Vote className="h-6 w-6" aria-hidden />
          <h1 className="text-2xl font-bold">Decisions</h1>
        </div>
        <p className="mt-1 text-sm text-blue-100">
          {unavailable
            ? "The decisions list is not available yet."
            : rows.length === 0
              ? "Nothing is waiting on you."
              : `${rows.length} waiting on you. One tap answers; the bots have it within five minutes.`}
        </p>
        {rows.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-2 text-sm font-semibold">
            {(["red", "yellow", "green"] as Urgency[]).map((u) => (
              <span key={u} className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 ring-1 ${CHIP[u]}`}>
                <span className={`h-2.5 w-2.5 rounded-full ${DOT[u]}`} aria-hidden />
                {count(u)} {WORD[u]}
              </span>
            ))}
            {loops.length > 0 && (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-sky-100 px-3 py-1 text-sky-900 ring-1 ring-sky-200">
                <ListChecks className="h-3.5 w-3.5" aria-hidden /> {loops.length} loops
              </span>
            )}
            {stalled.length > 0 && (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-orange-100 px-3 py-1 text-orange-900 ring-1 ring-orange-200">
                <AlertTriangle className="h-3.5 w-3.5" aria-hidden /> {stalled.length} stalled
              </span>
            )}
          </div>
        )}
      </header>

      {decisions.length > 0 && (
        <section className="space-y-3" aria-label="Decisions">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-indigo-700">Decisions</h2>
          {decisions.map((r) => (
            <DecisionCard key={r.id} row={r} onAnswered={onAnswered} />
          ))}
        </section>
      )}

      {stalled.length > 0 && (
        <section className="space-y-3" aria-label="Stalled">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-orange-700">Stalled on you</h2>
          {stalled.map((r) => (
            <DecisionCard key={r.id} row={r} onAnswered={onAnswered} />
          ))}
        </section>
      )}

      {loopGroups.length > 0 && (
        <section className="space-y-4" aria-label="Open loops">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-sky-700">Open loops on you</h2>
          {loopGroups.map(({ g, items }) => (
            <div key={g} className="space-y-3">
              <h3 className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-bold ${GROUP_CHIP[g] ?? GROUP_CHIP.Misc}`}>
                {g} <span className="font-semibold opacity-75">{items.length}</span>
              </h3>
              {items.map((r) => (
                <DecisionCard key={r.id} row={r} onAnswered={onAnswered} />
              ))}
            </div>
          ))}
        </section>
      )}

      {done.length > 0 && (
        <section className="space-y-2" aria-label="Answered">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-green-700">Answered today</h2>
          <ul className="divide-y divide-green-100 rounded-2xl border-2 border-green-200 bg-green-50/60">
            {done.map((r) => (
              <li key={r.id} className="flex gap-3 px-4 py-3 text-sm">
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-green-600" aria-hidden />
                <div className="min-w-0 space-y-0.5">
                  <p className="font-medium text-slate-900">{r.title}</p>
                  <p className="text-slate-700">
                    <span className="font-medium text-slate-900">{choiceLabel(r)}</span>
                    {r.answer_text ? ` · “${r.answer_text}”` : ""}
                  </p>
                  <p className="text-xs text-slate-500">
                    {r.answered_at ? fmt(r.answered_at) : ""} ·{" "}
                    {r.delivered_at
                      ? "the bots have it"
                      : r.delivery_error?.startsWith("held")
                        ? r.delivery_error
                        : r.delivery_error
                          ? "not delivered yet, retrying"
                          : "sending to Chief of Staff"}
                  </p>
                </div>
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
  const [asking, setAsking] = useState(false);
  const [question, setQuestion] = useState("");
  const [asked, setAsked] = useState<string | null>(null);

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

  const ask = async () => {
    setBusy("ask");
    setError(null);
    try {
      const res = await fetch(`/api/decisions/${row.id}/question`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question }),
      });
      const json = (await res.json().catch(() => ({}))) as { error?: string; question?: string };
      if (!res.ok) throw new Error(json.error ?? "Could not send");
      setAsked(json.question ?? question.trim());
      setQuestion("");
      setAsking(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not send");
    } finally {
      setBusy(null);
    }
  };

  const ordered = row.default_option
    ? [...row.options].sort((a, b) => (a.id === row.default_option ? -1 : b.id === row.default_option ? 1 : 0))
    : row.options;
  const stalled = row.kind === "stalled";

  return (
    <article
      id={`d-${row.id}`}
      className={`scroll-mt-4 space-y-3 rounded-2xl border-2 border-l-8 bg-white p-4 shadow-sm target:ring-4 target:ring-blue-300 ${
        stalled ? "border-orange-200" : "border-indigo-100"
      } ${EDGE[row.urgency]}`}
    >
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-semibold ring-1 ${CHIP[row.urgency]}`}>
          <span className={`h-2 w-2 rounded-full ${DOT[row.urgency]}`} aria-hidden />
          {WORD[row.urgency]}
        </span>
        {stalled ? (
          <span className="inline-flex items-center gap-1 rounded-full bg-orange-100 px-2 py-0.5 font-medium text-orange-900">
            <AlertTriangle size={12} aria-hidden /> Stalled job
          </span>
        ) : row.kind === "loop" ? (
          <span className="rounded-full bg-sky-100 px-2 py-0.5 font-medium text-sky-800">Open loop</span>
        ) : (
          <span className="rounded-full bg-indigo-100 px-2 py-0.5 font-medium text-indigo-800">Decision</span>
        )}
        {row.pr_ref && (
          <a
            href={`https://github.com/${row.pr_ref.replace("#", "/pull/")}`}
            className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 font-medium text-slate-700 hover:bg-slate-200"
          >
            <GitPullRequest size={12} aria-hidden /> {row.pr_ref.split("/").pop()}
          </a>
        )}
        {row.deadline && (
          <span className="inline-flex items-center gap-1 text-slate-600">
            <Clock size={12} aria-hidden /> by {fmt(row.deadline)}
          </span>
        )}
        {row.status === "stale" && <span className="text-slate-500">· waiting a while</span>}
      </div>

      <h3 className="text-base font-semibold leading-snug text-slate-900">{row.title}</h3>
      {row.context && <p className="text-sm text-slate-700">{row.context}</p>}

      {(stalled || row.for_agent || row.next_step) && (
        <dl className="grid gap-1 rounded-xl bg-slate-50 p-3 text-sm sm:grid-cols-[auto_1fr] sm:gap-x-3">
          <dt className="inline-flex items-center gap-1 font-medium text-slate-600">
            <User size={14} aria-hidden /> Owner
          </dt>
          <dd className="text-slate-900">{row.for_agent ?? "unassigned"}</dd>
          {row.next_step && (
            <>
              <dt className="font-medium text-slate-600">Next step</dt>
              <dd className="text-slate-900">{row.next_step}</dd>
            </>
          )}
        </dl>
      )}

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
                primary
                  ? "bg-blue-600 text-white shadow-sm ring-2 ring-blue-300 hover:bg-blue-700"
                  : "border-2 border-slate-300 bg-white text-slate-800 hover:border-blue-300 hover:bg-blue-50"
              }`}
            >
              {busy === o.id ? "Sending…" : o.label}
              {primary && <span className="ml-1 text-xs font-normal opacity-90">(recommended)</span>}
              {o.detail && <span className={`block text-xs font-normal ${primary ? "text-blue-100" : "text-slate-500"}`}>{o.detail}</span>}
            </button>
          );
        })}
      </div>

      {writing && (
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
            {busy === "other" ? "Sending…" : "Send answer"}
          </button>
          <p className="text-xs text-slate-500">Text typed here also rides along with any option you tap.</p>
        </div>
      )}

      {asking && (
        <div className="space-y-2 rounded-xl border-2 border-violet-200 bg-violet-50 p-3">
          <textarea
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            maxLength={1000}
            rows={2}
            placeholder="A comment for Chief of Staff: context, a question, or how you want this handled from now on"
            className="w-full rounded-lg border-2 border-violet-200 bg-white p-2 text-sm"
          />
          <button
            type="button"
            disabled={busy !== null || !question.trim()}
            onClick={ask}
            className="min-h-11 rounded-xl bg-violet-600 px-4 py-2 text-sm font-medium text-white hover:bg-violet-700 disabled:opacity-50"
          >
            {busy === "ask" ? "Sending…" : "Send comment"}
          </button>
          <p className="text-xs text-slate-600">
            Goes to Chief of Staff and does not close the item. A preference or rule (&ldquo;always&hellip;&rdquo;, &ldquo;never&hellip;&rdquo;) is also saved for the bots to learn from.
          </p>
        </div>
      )}

      {asked && (
        <p className="rounded-lg bg-violet-50 px-3 py-2 text-sm text-violet-900">
          Sent to Chief of Staff: “{asked}”
        </p>
      )}

      <div className="flex flex-wrap gap-x-5 gap-y-1">
        {!writing && (
          <button type="button" onClick={() => setWriting(true)} className="inline-flex min-h-11 items-center gap-1 text-sm font-medium text-blue-700">
            <MessageSquare size={14} aria-hidden /> In my own words
          </button>
        )}
        {!asking && (
          <button type="button" onClick={() => setAsking(true)} className="inline-flex min-h-11 items-center gap-1 text-sm font-medium text-violet-700">
            <MessageSquarePlus size={14} aria-hidden /> Comment
          </button>
        )}
      </div>

      {error && <p className="text-sm text-red-700">{error}</p>}
    </article>
  );
}
