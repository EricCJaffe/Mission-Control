import Link from 'next/link';
import { Download, Gauge, Lightbulb } from 'lucide-react';
import { supabaseServer } from '@/lib/supabase/server';
import { addDays, today } from '@/lib/day';
import { isMonth, monthRange } from '@/lib/ai-usage/csv';
import { planLabel, planStatus, rowReading, type PlanStatus } from '@/lib/ai-usage/forecast';
import { loadUsage } from '@/lib/ai-usage/load';
import { inDays, projectShares, shareBy, type Share } from '@/lib/ai-usage/shares';
import { suggestions } from '@/lib/ai-usage/suggestions';
import { formatReset } from '@/lib/ai-usage/window';
import { StatusPill } from '@/components/ui/DataTable';
import HistoryChart, { type HistoryPoint } from '@/components/ai-usage/HistoryChart';
import { ProjectSharesTable, SessionTable, type ProjectShareRow, type SessionRow } from '@/components/ai-usage/BreakdownTables';
import ManualEntryForm from '@/components/ai-usage/ManualEntryForm';
import { RAG_BAR, RAG_CARD, RAG_LABEL, RAG_PILL, pct, tokens, when } from '@/components/ai-usage/format';

export const dynamic = 'force-dynamic';

/*
 * /ai-usage: is each AI plan going to last until it resets, and who is using it?
 *
 * Eric, 2026-10-18: used vs limit, burn rate, projected run-out vs the reset,
 * red/yellow/green; a per-project / per-client breakdown as PERCENT of each
 * plan (not dollars); a monthly CSV; suggestions that say what to pause or
 * move. Math lives in src/lib/ai-usage (tested); this file only arranges it.
 *
 * Breakdown window: each plan's current reset window by default, or a whole
 * month with ?month=YYYY-MM.
 */

const CARD = 'rounded-2xl border-2 border-slate-300 bg-white p-5 shadow-sm';
const HISTORY_DAYS = 30;

export default async function AiUsagePage({ searchParams }: { searchParams?: Promise<{ month?: string }> }) {
  const supabase = await supabaseServer();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) return null;

  const params = searchParams ? await searchParams : undefined;
  const month = isMonth(params?.month) ? params.month : null;
  const now = new Date();
  const todayEt = today(now);
  const historyFrom = addDays(todayEt, -(HISTORY_DAYS - 1));
  const range = month ? monthRange(month) : null;
  // Monthly windows reach back up to 31 days; 40 covers them and the 30-day chart.
  const fromDay = range && range.from < addDays(todayEt, -40) ? range.from : addDays(todayEt, -40);
  const toDay = range && range.to > todayEt ? range.to : todayEt;

  const load = await loadUsage(supabase, fromDay, toDay);
  const statuses = load.plans.map((p) => planStatus(p, load.rows, now));

  const windowShares: Record<string, Share[]> = {};
  const shownShares: Record<string, Share[]> = {};
  const sessionRows: SessionRow[] = [];
  const shareRows: ProjectShareRow[] = [];
  const histories: Record<string, HistoryPoint[]> = {};

  for (const [i, s] of statuses.entries()) {
    const cadence = load.plans[i].reset_cadence;
    const planRows = load.rows.filter((r) => r.plan_slug === s.slug);
    const windowRows = inDays(planRows, s.window.startDay, todayEt);
    windowShares[s.slug] = projectShares(windowRows);
    const shownRows = range ? inDays(planRows, range.from, range.to) : windowRows;
    shownShares[s.slug] = range ? projectShares(shownRows) : windowShares[s.slug];

    for (const share of shownShares[s.slug]) {
      shareRows.push({
        id: `${s.slug}:${share.key}`,
        plan: s.name,
        project: share.key,
        client: share.client ?? '',
        percent: share.percent,
        tokens: share.tokens,
        tokensLabel: tokens(share.tokens),
        sessions: share.sessions,
      });
    }

    // Per bot + host + session (+ project), as percent of the plan's shown total.
    const total = shownRows.reduce((sum, r) => sum + Number(r.tokens_total || 0), 0);
    const bySession = new Map<string, SessionRow>();
    for (const r of shownRows) {
      if (r.source === 'manual') continue;
      const id = `${s.slug}:${r.host}:${r.bot}:${r.session_id}:${r.project}`;
      let row = bySession.get(id);
      if (!row) {
        row = { id, plan: s.name, bot: r.bot, host: r.host, session: r.session_id, project: r.project, percent: 0, tokens: 0, tokensLabel: '', messages: 0, lastDay: r.day };
        bySession.set(id, row);
      }
      row.tokens += Number(r.tokens_total || 0);
      row.messages += Number(r.messages || 0);
      if (r.day > row.lastDay) row.lastDay = r.day;
    }
    for (const row of bySession.values()) {
      row.percent = total > 0 ? (row.tokens / total) * 100 : 0;
      row.tokensLabel = tokens(row.tokens);
      sessionRows.push(row);
    }

    const byDay = new Map<string, HistoryPoint>();
    for (let d = historyFrom; d <= todayEt; d = addDays(d, 1)) byDay.set(d, { day: d, tokens: 0, pct: null });
    for (const r of inDays(planRows, historyFrom, todayEt)) {
      const point = byDay.get(r.day);
      if (!point) continue;
      point.tokens += Number(r.tokens_total || 0);
      const reading = rowReading(r, cadence);
      if (reading && (point.pct === null || reading.pct > point.pct)) point.pct = reading.pct;
    }
    histories[s.slug] = [...byDay.values()];
  }

  sessionRows.sort((a, b) => a.plan.localeCompare(b.plan) || b.tokens - a.tokens);
  const advice = suggestions(statuses, windowShares, now);
  const bots = shareBy(
    load.rows.filter((r) => r.source !== 'manual' && r.day >= addDays(todayEt, -6)),
    'bot',
  );
  const exportMonth = month ?? todayEt.slice(0, 7);
  const empty = load.missing || load.rows.length === 0;

  return (
    <main className="pt-4 md:pt-8">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-3xl font-semibold">AI usage</h1>
          <p className="mt-1 text-sm text-slate-500">
            Each plan against its limit, whether it lasts until the reset, and who is using it.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <form method="get" className="flex items-center gap-2">
            <input
              type="month"
              name="month"
              defaultValue={month ?? ''}
              className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
              aria-label="Breakdown month"
            />
            <button type="submit" className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:border-slate-400">
              Show month
            </button>
            {month && (
              <Link href="/ai-usage" className="text-sm text-blue-700 hover:underline">This window</Link>
            )}
          </form>
          <a
            href={`/api/ai-usage/export?month=${exportMonth}`}
            className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-3 py-2 text-sm font-semibold text-white shadow-sm hover:bg-blue-700"
          >
            <Download size={16} /> CSV {exportMonth}
          </a>
        </div>
      </div>

      {load.error && (
        <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          Could not read usage: {load.error}
        </div>
      )}
      {load.truncated && (
        <div className="mb-4 rounded-xl border border-yellow-300 bg-yellow-50 px-4 py-3 text-sm text-yellow-800">
          More rows than the page reads at once; totals below are partial.
        </div>
      )}
      {empty && !load.error && (
        <div className={`${CARD} mb-6 text-sm text-slate-600`}>
          <div className="font-semibold text-slate-800">No usage data yet</div>
          <p className="mt-1">
            {load.missing
              ? 'The usage tables are not set up in this database yet.'
              : 'The collector has not posted any rows for this period.'}{' '}
            Plans below come from {load.plansFromConfig ? 'config/ai-usage-plans.json' : 'the database'}.
          </p>
        </div>
      )}

      <section className="grid gap-4 lg:grid-cols-3">
        {statuses.map((s) => (
          <PlanCard key={s.slug} s={s} now={now} points={histories[s.slug] ?? []} />
        ))}
      </section>

      <section className={`${CARD} mt-6`}>
        <h2 className="flex items-center gap-2 text-lg font-semibold">
          <Lightbulb size={18} className="text-yellow-500" /> Suggestions
        </h2>
        {advice.length === 0 ? (
          <p className="mt-2 text-sm text-slate-500">
            {empty ? 'Nothing to suggest until there is data.' : 'Every plan is on track to last until its reset.'}
          </p>
        ) : (
          <ul className="mt-3 grid gap-2">
            {advice.map((a, i) => (
              <li key={i} className="flex items-start gap-2 text-sm">
                <StatusPill tone={a.tone}>{a.tone === 'red' ? 'Red' : 'Yellow'}</StatusPill>
                <span>{a.text}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className={`${CARD} mt-6`}>
        <h2 className="text-lg font-semibold">By project and client</h2>
        <p className="mt-1 text-sm text-slate-500">
          Percent of each plan&apos;s tokens, {month ? `for ${month}` : 'in its current reset window'}.
          Unattributed is always its own row.
        </p>
        <div className="mt-4">
          <ProjectSharesTable rows={shareRows} />
        </div>
      </section>

      <section className={`${CARD} mt-6`}>
        <h2 className="text-lg font-semibold">By bot, host and session</h2>
        <p className="mt-1 text-sm text-slate-500">
          {bots.length
            ? `Last 7 days by bot: ${bots.map((b) => `${b.key} ${b.percent.toFixed(0)}%`).join(' · ')}.`
            : 'No log rows in the last 7 days.'}{' '}
          Percent below is of each plan&apos;s total for the same window.
        </p>
        <div className="mt-4">
          <SessionTable rows={sessionRows} />
        </div>
      </section>

      <section className={`${CARD} mt-6`}>
        <h2 className="text-lg font-semibold">Enter a reading</h2>
        <p className="mt-1 text-sm text-slate-500">
          A number off a plan&apos;s own usage page. One per plan per day; saving again replaces it.
        </p>
        <div className="mt-4">
          <ManualEntryForm plans={load.plans.map((p) => ({ slug: p.slug, name: planLabel(p.name) }))} today={todayEt} />
        </div>
      </section>
    </main>
  );
}

function PlanCard({ s, now, points }: { s: PlanStatus; now: Date; points: HistoryPoint[] }) {
  const width = s.usedPct === null ? 0 : Math.min(Math.max(s.usedPct, 0), 100);
  const resets = formatReset(s.window.resetAt, now);
  const runsOut =
    s.runOutAt === null
      ? 'Not on pace to run out'
      : s.runOutAt.getTime() < s.window.resetAt.getTime()
        ? `Runs out ${when(s.runOutAt)}, before the reset`
        : `Would run out ${when(s.runOutAt)}, after the reset`;
  return (
    <div className={`rounded-2xl border-2 ${RAG_CARD[s.rag]} bg-white p-5 shadow-sm`}>
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="flex items-center gap-2 text-base font-semibold">
            <Gauge size={18} className="text-slate-500" /> {s.name}
          </div>
          <div className="mt-0.5 text-xs text-slate-500">Resets {resets} ({s.window.source === 'vendor' ? 'vendor reported' : s.window.source})</div>
        </div>
        <StatusPill tone={RAG_PILL[s.rag]}>{RAG_LABEL[s.rag]}</StatusPill>
      </div>

      <div className="mt-4 flex items-baseline gap-2">
        <span className="text-3xl font-semibold tabular-nums">{pct(s.usedPct)}</span>
        <span className="text-sm text-slate-500">used</span>
        {s.isEstimate && <StatusPill tone="slate" title="Token budget is an estimate; the vendor does not publish one">estimate</StatusPill>}
      </div>
      <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-slate-100">
        <div className={`h-full ${RAG_BAR[s.rag]}`} style={{ width: `${width}%` }} />
      </div>

      <dl className="mt-4 grid grid-cols-2 gap-x-3 gap-y-1 text-sm">
        {s.basis === 'tokens' && (
          <>
            <dt className="text-slate-500">Tokens</dt>
            <dd className="text-right tabular-nums">
              {tokens(s.tokensInWindow)} / {s.limitTokens ? tokens(s.limitTokens) : '—'}
            </dd>
          </>
        )}
        <dt className="text-slate-500">Burn</dt>
        <dd className="text-right tabular-nums">
          {s.burnPctPerDay === null ? '—' : `${s.burnPctPerDay.toFixed(1)}% / day`}
        </dd>
        <dt className="text-slate-500">Tokens / day (7d)</dt>
        <dd className="text-right tabular-nums">{tokens(s.tokensPerDay7)}</dd>
        <dt className="text-slate-500">Last reading</dt>
        <dd className="text-right">{s.lastReadingAt ? when(s.lastReadingAt) : 'never'}</dd>
      </dl>
      <p className="mt-2 text-sm text-slate-600">
        {s.usedPct !== null ? runsOut : s.note === 'reset-since-reading' ? 'Reset since last reading' : s.note === 'no-cap-known' ? 'No cap known. Add a % reading from the plan’s usage page to forecast.' : 'No reading in this window'}
      </p>

      <div className="mt-4">
        <HistoryChart points={points} />
      </div>
    </div>
  );
}
